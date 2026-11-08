/* Badri simulation engine: pure logic, no DOM. Time unit = simulated minutes. */
(function (root) {
  'use strict';

  // Healthy targets the body drifts back to once antibiotics and fluids are in.
  const NORMAL = { hr: 84, rr: 17, temp: 37.2, sbp: 120, dbp: 74, spo2: 97, gcs: 15, lac: 1.2 };
  const ACK_WINDOW = 5;        // minutes before Badri pages the next person
  const SECOND_WINDOW = 10;    // further minutes before responsible physician + ICU are paged
  const LAB_TURNAROUND = 40;   // minutes from lab order to results
  const ROUTINE_ROUNDS = 240;  // inpatient vitals every 4 hours (clinical advisor)
  const PATCH_SAMPLE = 15;     // default: the patch reads and Badri re-scores together, every 15 minutes (Rayan, 8 Nov)

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;

  function interp(keys, t, f) {
    if (t <= keys[0].t) return keys[0][f];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        const a = keys[i - 1], b = keys[i];
        return lerp(a[f], b[f], (t - a.t) / (b.t - a.t));
      }
    }
    return keys[keys.length - 1][f];
  }
  function wobble(t, seed, amp) {
    return amp * (0.6 * Math.sin(t * 0.41 + seed) + 0.4 * Math.sin(t * 1.7 + seed * 1.9));
  }
  const meanArterial = (sbp, dbp) => (sbp + 2 * dbp) / 3;

  // ---- Scores (Sepsis-3, Singer et al. JAMA 2016; SOFA bands as tabulated by MSD Manuals) ----
  function qsofa(v) {
    const rr = v.rr >= 22, sbp = v.sbp <= 100, ment = v.gcs <= 14;
    return { score: (rr ? 1 : 0) + (sbp ? 1 : 0) + (ment ? 1 : 0), rr, sbp, ment };
  }
  function sofa(v, labs, onVaso) {
    const pf = labs.pf;
    const resp = pf < 100 && labs.vent ? 4 : pf < 200 && labs.vent ? 3 : pf < 300 ? 2 : pf < 400 ? 1 : 0;
    const p = labs.plt;
    const coag = p < 20 ? 4 : p < 50 ? 3 : p < 100 ? 2 : p < 150 ? 1 : 0;
    const b = labs.bili;
    const liver = b >= 12 ? 4 : b >= 6 ? 3 : b >= 2 ? 2 : b >= 1.2 ? 1 : 0;
    const map = meanArterial(v.sbp, v.dbp);
    const cardio = onVaso ? 3 : map < 70 ? 1 : 0;
    const g = v.gcs;
    const cns = g < 6 ? 4 : g <= 9 ? 3 : g <= 12 ? 2 : g <= 14 ? 1 : 0;
    const c = labs.creat;
    const renal = c >= 5 ? 4 : c >= 3.5 ? 3 : c >= 2 ? 2 : c >= 1.2 ? 1 : 0;
    return { resp, coag, liver, cardio, cns, renal, total: resp + coag + liver + cardio + cns + renal, map };
  }
  // Triage: who gets a patch. Demo thresholds, to be set with clinicians.
  function triageRule(v, infection) {
    const q = qsofa(v);
    const why = qWhy(v, q);
    if (q.score >= 2) return { level: 'alert', q, why };
    const sirsLike = infection && (v.temp >= 38 || v.temp < 36 || v.hr >= 100);
    if (sirsLike) {
      if (v.temp >= 38) why.push(`Fever ${v.temp.toFixed(1)} °C`);
      if (v.hr >= 100) why.push(`Heart rate ${Math.round(v.hr)}/min`);
      why.push('Infection suspected');
    }
    if (q.score === 1 || sirsLike) return { level: 'watch', q, why };
    return { level: 'routine', q, why: ['No quick-score signs', 'No infection suspected'] };
  }
  function qWhy(v, q) {
    const why = [];
    if (q.rr) why.push(`Breathing ${Math.round(v.rr)}/min (22 or more)`);
    if (q.sbp) why.push(`Systolic BP ${Math.round(v.sbp)} (100 or lower)`);
    if (q.ment) why.push(`Confused, GCS ${v.gcs} (14 or lower)`);
    return why;
  }
  // While the patch is on: alert when the quick score reaches 2, or lactate is high.
  function monitorRule(v) {
    const q = qsofa(v);
    const why = qWhy(v, q);
    const lacHigh = v.lac != null && v.lac >= 2;
    if (lacHigh) why.push(`Lactate ${v.lac.toFixed(1)} mmol/L (2 or more)`);
    const alert = q.score >= 2 || (v.lac != null && v.lac >= 4) || (lacHigh && q.score >= 1);
    return { alert, q, why };
  }

  const ROLE_NAME = { nurse: 'Ward nurse', doctor: 'ER doctor', mrp: 'Responsible physician', icu: 'ICU team' };

  class Sim {
    constructor(def, opts) {
      this.def = def;
      this.interval = (opts && opts.interval) || 15;
      this.reset();
    }
    reset() {
      this.t = 0; this.queue = []; this.seq = 0;
      this.log = []; this.anim = [];
      this.status = { level: 'arriving', title: 'Arriving', text: 'Patient on the way in' };
      this.display = {}; this.samples = []; this.scores = [];
      this.patch = false; this.bedAt = null; this.triage = null; this.alert = null; this.response = null;
      this.esc = { nurse: { state: 'idle' }, doctor: { state: 'idle' }, mrp: { state: 'idle' }, icu: { state: 'idle' } };
      this.bundle = { lactate: null, cultures: null, access: null, abx: null, fluids: null, vaso: null };
      this.labs = null; this.sofa = null; this.labsOrderedAt = null;
      this.treatAt = null; this.fluidsAt = null; this.onVaso = false;
      this.summary = null; this.done = false; this.nextScoreAt = null;
      this.manual = this.def.mode === 'try' ? Object.assign({}, this.def.manualStart) : null;
      this.location = 'entrance';
      if (this.def.mode === 'try') this.setupTry(); else this.setupCase();
    }

    // ---- scheduler ----
    at(t, fn) { this.queue.push({ t, fn, s: this.seq++ }); this.queue.sort((a, b) => a.t - b.t || a.s - b.s); }
    after(dt, fn) { this.at(this.t + dt, fn); }
    step(dt) {
      const end = this.t + dt;
      while (this.queue.length && this.queue[0].t <= end) {
        const e = this.queue.shift();
        this.t = e.t;
        e.fn();
      }
      this.t = end;
    }
    nextEventTime() { return this.queue.length ? this.queue[0].t : null; }

    // ---- output helpers ----
    say(kind, who, text) { this.log.push({ t: this.t, kind, who, text }); }
    act(cmd) { cmd.t = this.t; this.anim.push(cmd); }
    setStatus(level, title, text) { this.status = { level, title, text }; this.act({ cmd: 'status', level }); }
    clock(t) {
      const m = Math.round(this.def.startClock + (t == null ? this.t : t));
      return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    // ---- physiology ----
    physio(t) {
      if (this.manual) return Object.assign({}, this.manual);
      const k = this.def.keys, s = this.def.seed || 1;
      const v = {
        hr: interp(k, t, 'hr') + wobble(t, s, 1.6),
        rr: interp(k, t, 'rr') + wobble(t, s + 2, 0.35),
        temp: interp(k, t, 'temp') + wobble(t, s + 4, 0.05),
        sbp: interp(k, t, 'sbp') + wobble(t, s + 6, 1.2),
        dbp: interp(k, t, 'dbp') + wobble(t, s + 8, 0.8),
        spo2: interp(k, t, 'spo2') + wobble(t, s + 9, 0.3),
        gcs: Math.round(interp(k, t, 'gcs')),
        lac: interp(k, t, 'lac') + wobble(t, s + 11, 0.03)
      };
      if (this.fluidsAt != null && t > this.fluidsAt) {
        const f = clamp((t - this.fluidsAt) / 30, 0, 1);
        v.sbp += 8 * f; v.dbp += 5 * f;
      }
      if (this.treatAt != null && t > this.treatAt) {
        const r = clamp((t - this.treatAt) / 200, 0, 0.85);
        for (const key of Object.keys(NORMAL)) v[key] = lerp(v[key], NORMAL[key], r);
        v.gcs = Math.round(v.gcs);
      }
      v.spo2 = Math.min(100, v.spo2);
      return v;
    }
    values() {
      const d = this.display, o = {};
      for (const key of Object.keys(d)) o[key] = d[key].v;
      return o;
    }
    setVital(key, v, src) { this.display[key] = { v, src, at: this.t }; }

    // ---- scripted cases ----
    setupCase() {
      const d = this.def;
      this.act({ cmd: 'reset', nurseBusy: !!d.nurseBusy });
      this.say('info', 'Patient', `${d.patient.name} arrives at the ${d.patient.settingShort}: "${d.lines.arrive}"`);
      this.act({ who: 'patient', cmd: 'walk', to: 'triageChair', dur: 3 });
      this.at(3, () => { this.location = 'triage'; this.setStatus('arriving', 'At triage', 'Nurse taking vitals'); this.act({ who: 'patient', cmd: 'say', text: d.lines.arrive }); });
      this.at(4, () => {
        this.act({ who: 'nurse1', cmd: 'say', text: 'Let me check your vitals.' });
        this.say('info', 'Triage nurse', 'Takes vitals: breathing, pulse, blood pressure, temperature, oxygen, alertness');
      });
      this.at(8, () => this.doTriage());
    }
    doTriage() {
      const d = this.def, v = this.physio(this.t);
      const src = 'Triage nurse';
      for (const key of ['hr', 'rr', 'temp', 'sbp', 'dbp', 'spo2', 'gcs']) this.setVital(key, v[key], src);
      const r = triageRule(this.values(), d.infection);
      this.triage = Object.assign({ t: this.t }, r);
      this.say('info', 'Badri', `Vitals in. Quick score (qSOFA) ${r.q.score} of 3.`);
      if (r.level === 'alert') {
        this.raiseAlert(r.why, true);
      } else if (r.level === 'watch') {
        this.setStatus('watch', 'Close to the line', r.why.join(' · '));
        this.say('warn', 'Badri', `Close to the sepsis line (${r.why.join('; ')}). Apply a Badri patch.`);
        this.act({ who: 'nurse1', cmd: 'say', text: 'I\'m putting a small patch on your arm.' });
        this.after(2, () => {
          this.patch = true;
          this.act({ cmd: 'patch', on: true });
          this.say('action', 'Triage nurse', 'Badri patch applied to the upper arm. Patient moved to a ward bed.');
          this.act({ who: 'patient', cmd: 'walk', to: 'bed', dur: 4, then: 'lie' });
          this.after(4, () => this.startMonitoring());
        });
      } else {
        this.setStatus('routine', 'Routine', 'No sepsis signs at triage');
        this.say('good', 'Badri', 'No sepsis signs. No patch needed. Routine care.');
        this.routineVisit();
      }
    }
    routineVisit() {
      const d = this.def;
      this.act({ who: 'patient', cmd: 'walk', to: 'clinicChair', dur: 3 });
      this.after(3, () => { this.location = 'clinic'; });
      this.after(5, () => {
        this.act({ who: 'doctor', cmd: 'say', text: d.lines.doctor });
        this.say('info', 'Doctor', `Check-up done: "${d.lines.doctor}"`);
      });
      this.after(10, () => {
        this.act({ who: 'patient', cmd: 'walk', to: 'exit', dur: 4, then: 'hide' });
        this.say('good', 'Patient', 'Goes home. No patch, no alarm.');
      });
      this.after(15, () => this.finish());
    }
    startMonitoring() {
      this.location = 'ward';
      this.bedAt = this.t;
      this.setStatus('watch', 'Watching', `Patch reads and Badri re-scores every ${this.interval} min`);
      this.say('info', 'Badri', `Patch online. Reading lactate, pulse, breathing and temperature and re-scoring every ${this.interval} min.`);
      this.sample();
      this.rescore(true);
    }
    sample() {
      if (this.done) return;
      const v = this.physio(this.t);
      const src = this.manual ? 'You (slider)' : 'Badri patch';
      this.setVital('hr', v.hr, src); this.setVital('rr', v.rr, src);
      this.setVital('temp', v.temp, src); this.setVital('lac', v.lac, src);
      this.setVital('spo2', v.spo2, this.manual ? src : 'Bedside clip');
      this.samples.push({ t: this.t, lac: v.lac, hr: v.hr, rr: v.rr });
      this.act({ cmd: 'sample' });
      this.after(this.interval, () => this.sample());   // each reading lands just before its re-score
    }
    rescore(baseline) {
      if (this.done) return;
      const v = this.physio(this.t);
      this.setVital('sbp', v.sbp, this.manual ? 'You (slider)' : 'Bedside cuff');
      this.setVital('dbp', v.dbp, this.manual ? 'You (slider)' : 'Bedside cuff');
      this.setVital('gcs', v.gcs, this.manual ? 'You (slider)' : 'Nurse check');
      if (this.manual) { for (const key of ['hr', 'rr', 'temp', 'lac', 'spo2']) this.setVital(key, v[key], 'You (slider)'); }
      const r = monitorRule(this.values());
      this.scores.push({ t: this.t, q: r.q.score, lac: this.values().lac, alert: r.alert });
      if (this.alert) return;
      if (r.alert) { this.raiseAlert(r.why, false); return; }
      this.say('tick', 'Badri', `${baseline ? 'Baseline' : 'Re-score'}: qSOFA ${r.q.score}, lactate ${this.values().lac.toFixed(1)} mmol/L. Keep watching.`);
      this.nextScoreAt = this.t + this.interval;
      const due = this.nextScoreAt;
      this.at(due, () => { if (this.nextScoreAt === due) this.rescore(false); });
    }
    rescoreNow() {
      if (this.done || this.alert || !this.patch) return;
      this.nextScoreAt = null;
      this.rescore(false);
    }
    raiseAlert(why, atTriage) {
      this.alert = { t: this.t, why, atTriage };
      this.nextScoreAt = null;
      this.setStatus('alert', 'Sepsis alert', why.join(' · '));
      this.say('alert', 'Badri', `SEPSIS ALERT: ${why.join('; ')}. Ward nurse notified.`);
      this.act({ cmd: 'alarm', on: true });
      this.esc.nurse = { state: 'notified', at: this.t };
      const d = this.def;
      if (d.nurseBusy) this.act({ who: 'nurse2', cmd: 'say', text: 'With another patient, can\'t look yet.' });
      this.after(ACK_WINDOW, () => {
        if (this.response) return;
        this.page('doctor', `No response in ${ACK_WINDOW} min. ER doctor paged.`);
        this.after(SECOND_WINDOW, () => {
          if (this.response) return;
          this.page('mrp', `Still no response. Responsible physician paged.`);
          this.page('icu', 'ICU team paged.');
        });
      });
      if (d.nurseAck != null) this.after(d.nurseAck, () => this.acknowledge('nurse'));
    }
    page(role, text) {
      if (this.esc[role].state !== 'idle') return;
      this.esc[role] = { state: 'notified', at: this.t };
      this.say('alert', 'Badri', text);
      this.act({ cmd: 'page', role });
      if (role === 'doctor' && this.def.doctorAck != null) this.after(this.def.doctorAck, () => this.acknowledge('doctor'));
    }
    acknowledge(role) {
      if (this.done || !this.alert) return;
      const e = this.esc[role];
      if (e.state === 'ack') return;
      this.esc[role] = { state: 'ack', at: e.at != null ? e.at : this.t, ackAt: this.t };
      this.say('good', ROLE_NAME[role], 'Acknowledged the alert. Heading to the bedside.');
      if (!this.response) this.respond(role);
    }
    respond(role) {
      const d = this.def, t0 = this.t;
      this.response = { t: t0, by: role };
      this.act({ cmd: 'alarm', on: false });
      this.setStatus('respond', 'First hour running', 'Hour-1 sepsis bundle in progress');
      const walker = role === 'nurse' ? 'nurse2' : role === 'doctor' ? 'doctor' : 'doctor';
      this.act({ who: walker, cmd: 'walk', to: walker === 'nurse2' ? 'bedNurse' : 'bedDoctor', dur: 2 });
      const lac = this.values().lac;
      this.bundle.lactate = { t: t0, text: `Lactate ${lac.toFixed(1)} mmol/L, already measured by the patch` };
      if (role === 'nurse') {
        this.after(2, () => this.act({ who: 'nurse2', cmd: 'say', text: d.lines.nurseAtBed || 'Badri flagged you. I\'m calling the doctor.' }));
        this.after(3, () => {
          if (this.esc.doctor.state === 'idle') { this.esc.doctor = { state: 'notified', at: this.t }; this.say('action', 'Ward nurse', 'Calls the ER doctor to the bedside.'); }
          this.after(1, () => {
            if (this.esc.doctor.state !== 'ack') { this.esc.doctor = Object.assign({}, this.esc.doctor, { state: 'ack', ackAt: this.t }); this.say('good', 'ER doctor', 'On the way.'); }
            this.act({ who: 'doctor', cmd: 'walk', to: 'bedDoctor', dur: 3 });
          });
        });
      } else {
        this.after(1, () => this.act({ who: 'nurse2', cmd: 'walk', to: 'bedNurse', dur: 2 }));
      }
      const base = role === 'nurse' ? 7 : 3;
      this.after(base, () => {
        this.labsOrderedAt = this.t;
        this.say('action', 'ER doctor', 'Orders blood tests for the full SOFA score: platelets, bilirubin, creatinine, blood gas.');
        this.act({ who: 'doctor', cmd: 'say', text: 'Start the hour-1 bundle.' });
        this.after(LAB_TURNAROUND, () => this.labsBack());
      });
      this.after(base + 2, () => { this.bundle.cultures = { t: this.t, text: 'Blood cultures taken' }; this.say('action', 'Ward nurse', 'Blood cultures taken.'); });
      let accessAt;
      if (d.ivFails >= 2) {
        this.after(base + 4, () => this.say('warn', 'Ward nurse', 'IV attempt 1 failed. Veins not found.'));
        this.after(base + 7, () => {
          this.say('alert', 'Badri', 'Second failed IV attempt logged. Anaesthesia paged for a central or bone line.');
          this.act({ who: 'anaes', cmd: 'appear', at: 'icuDoor' });
          this.act({ who: 'anaes', cmd: 'walk', to: 'bedAnaes', dur: 4 });
        });
        accessAt = base + 14;
        this.after(accessAt, () => { this.bundle.access = { t: this.t, text: 'Line placed by anaesthesia after 2 failed IVs' }; this.say('good', 'Anaesthetist', 'Line in.'); });
      } else {
        accessAt = base + 4;
        this.after(accessAt, () => { this.bundle.access = { t: this.t, text: 'IV line in, first attempt' }; this.say('action', 'Ward nurse', 'IV line in.'); });
      }
      this.after(accessAt + 2, () => {
        this.treatAt = this.t; this.fluidsAt = this.t;
        const minute = Math.round(this.t - this.alert.t);
        this.bundle.abx = { t: this.t, text: `Antibiotics given, minute ${minute} of the first hour` };
        this.bundle.fluids = { t: this.t, text: d.fluidText || 'IV fluids started' };
        this.say('good', 'ER doctor', `Antibiotics and IV fluids started, ${minute} min after the alert.`);
        this.act({ cmd: 'treat' });
        this.after(18, () => {
          const v = this.physio(this.t);
          const map = meanArterial(v.sbp, v.dbp);
          this.setVital('sbp', v.sbp, 'Bedside cuff'); this.setVital('dbp', v.dbp, 'Bedside cuff');
          if (map < 65) {
            this.onVaso = true;
            this.bundle.vaso = { t: this.t, text: `MAP ${Math.round(map)} after fluids: vasopressors started` };
            this.say('warn', 'ER doctor', `MAP still ${Math.round(map)} after fluids. Vasopressors started.`);
          } else {
            this.bundle.vaso = { t: this.t, text: `Not needed: MAP ${Math.round(map)} after fluids (target 65 or more)` };
            this.say('good', 'ER doctor', `MAP ${Math.round(map)} after fluids. No vasopressors needed.`);
          }
        });
      });
    }
    labsBack() {
      const v = Object.assign(this.physio(this.t), {});
      const vals = this.values();
      vals.sbp = v.sbp; vals.dbp = v.dbp; vals.gcs = vals.gcs != null ? vals.gcs : v.gcs;
      this.labs = Object.assign({ t: this.t }, this.def.labs);
      this.sofa = sofa(vals, this.def.labs, this.onVaso);
      const confirmed = this.sofa.total >= 2;
      this.say(confirmed ? 'alert' : 'info', 'Lab', `Results back. Full SOFA ${this.sofa.total}${confirmed ? ', a rise of 2 or more: sepsis confirmed (Sepsis-3).' : '.'}`);
      if (confirmed) this.setStatus('confirmed', 'Sepsis confirmed', `SOFA ${this.sofa.total} · treatment already running`);
      this.after(6, () => this.finish());
    }
    finish() {
      if (this.done) return;
      this.done = true;
      const d = this.def;
      const rows = [];
      if (this.alert) {
        const tri = this.triage ? this.triage.t : 0;
        const fromArrival = this.alert.t;
        rows.push({ label: 'Badri alert', value: this.clock(this.alert.t), note: `${fmtDur(fromArrival)} after ${d.mode === 'try' ? 'the start' : 'arrival'}` });
        if (this.bundle.abx) rows.push({ label: 'Antibiotics', value: `minute ${Math.round(this.bundle.abx.t - this.alert.t)}`, note: 'of the first hour' });
        if (d.withoutBadri) rows.push(d.withoutBadri);
        else {
          const rounds = tri + ROUTINE_ROUNDS;
          rows.push({ label: 'Next routine vitals without Badri', value: this.clock(rounds), note: `${fmtDur(rounds - this.alert.t)} after Badri's alert` });
        }
        if (this.sofa) rows.push({ label: 'Full SOFA when labs came back', value: String(this.sofa.total), note: this.sofa.total >= 2 ? 'sepsis confirmed' : 'below sepsis line' });
        this.summary = { title: d.summaryTitle, rows };
        this.setStatus(this.sofa && this.sofa.total >= 2 ? 'confirmed' : 'respond', this.sofa && this.sofa.total >= 2 ? 'Sepsis confirmed, treated early' : 'Treated', 'Simulation complete');
      } else {
        rows.push({ label: 'Patch', value: 'Not needed', note: 'no sepsis signs at triage' });
        rows.push({ label: 'Alarms', value: '0', note: 'Badri stays quiet when nothing is wrong' });
        this.summary = { title: d.summaryTitle, rows };
      }
      this.say('info', 'Simulation', 'Case complete.');
      this.act({ cmd: 'done' });
    }

    // ---- try-it mode ----
    setupTry() {
      this.act({ cmd: 'reset', inBed: true });
      this.patch = true;
      this.act({ cmd: 'patch', on: true });
      this.location = 'ward';
      this.say('info', 'You', 'Patient in bed with the Badri patch on. Move the sliders to change the vitals.');
      this.startMonitoring();
    }
    setManual(key, value) {
      if (!this.manual) return;
      this.manual[key] = value;
      if (this.patch && !this.done) this.setVital(key, value, 'You (slider)');
    }
  }

  function fmtDur(min) {
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60), r = m % 60;
    return h ? `${h} h ${String(r).padStart(2, '0')} min` : `${r} min`;
  }

  // ---- cases ----
  const CASES = [
    {
      id: 'er', tab: 'ER walk-in', mode: 'case', seed: 1.3, startClock: 9 * 60,
      title: 'Walk-in to the emergency room',
      blurb: 'Fever and chills. Looks "fine" at triage: the quick score alone says 0.',
      patient: { name: 'Omar K.', age: 41, sex: 'M', setting: 'Emergency department', settingShort: 'ER', complaint: 'Fever and chills for 2 days, burning when passing urine' },
      infection: true, nurseAck: null, doctorAck: 2, ivFails: 2, nurseBusy: true,
      fluidText: 'IV fluids, 30 mL/kg, started',
      lines: { arrive: 'I\'ve had fever and chills for two days.', nurseAtBed: 'Badri flagged you. I\'m calling the doctor.' },
      keys: [
        { t: 0, hr: 112, rr: 21, temp: 38.9, sbp: 114, dbp: 72, spo2: 97, gcs: 15, lac: 1.7 },
        { t: 30, hr: 114, rr: 21.5, temp: 39.0, sbp: 110, dbp: 70, spo2: 97, gcs: 15, lac: 1.8 },
        { t: 50, hr: 118, rr: 23, temp: 39.1, sbp: 106, dbp: 66, spo2: 96, gcs: 15, lac: 2.0 },
        { t: 70, hr: 124, rr: 25, temp: 39.2, sbp: 99, dbp: 60, spo2: 95, gcs: 15, lac: 2.5 },
        { t: 100, hr: 128, rr: 26, temp: 39.3, sbp: 92, dbp: 54, spo2: 95, gcs: 15, lac: 2.9 },
        { t: 200, hr: 134, rr: 28, temp: 39.3, sbp: 84, dbp: 48, spo2: 93, gcs: 13, lac: 3.8 }
      ],
      labs: { plt: 128, bili: 1.5, creat: 1.7, pf: 360, vent: false },
      summaryTitle: 'Caught before his blood pressure crashed'
    },
    {
      id: 'checkup', tab: 'Check-up: "sore throat"', mode: 'case', seed: 2.7, startClock: 9 * 60,
      title: 'Routine check-up, "just a sore throat"',
      blurb: 'A diabetes check-up. She mentions a sore throat. Her chest is infected.',
      patient: { name: 'Fatima A.', age: 78, sex: 'F', setting: 'Outpatient clinic', settingShort: 'clinic', complaint: 'Routine diabetes check-up; mentions a sore throat' },
      infection: true, nurseAck: 2, doctorAck: null, ivFails: 0,
      lines: { arrive: 'Just my check-up. I have a bit of a sore throat.', nurseAtBed: 'Your patch flagged a change. I\'m calling the doctor.' },
      keys: [
        { t: 0, hr: 98, rr: 22, temp: 37.8, sbp: 124, dbp: 74, spo2: 94, gcs: 15, lac: 1.7 },
        { t: 30, hr: 100, rr: 22.5, temp: 37.9, sbp: 120, dbp: 72, spo2: 93, gcs: 15, lac: 1.9 },
        { t: 50, hr: 104, rr: 23, temp: 38.1, sbp: 116, dbp: 70, spo2: 92, gcs: 14, lac: 2.2 },
        { t: 90, hr: 108, rr: 24, temp: 38.3, sbp: 110, dbp: 66, spo2: 91, gcs: 14, lac: 2.6 },
        { t: 200, hr: 112, rr: 26, temp: 38.4, sbp: 104, dbp: 62, spo2: 90, gcs: 13, lac: 3.1 }
      ],
      labs: { plt: 165, bili: 0.9, creat: 1.4, pf: 280, vent: false },
      withoutBadri: { label: 'Without Badri', value: 'Sent home', note: 'one borderline reading at a routine check-up' },
      summaryTitle: 'A "sore throat" that was sepsis, caught at a check-up'
    },
    {
      id: 'healthy', tab: 'Check-up: healthy', mode: 'case', seed: 4.1, startClock: 11 * 60,
      title: 'Routine check-up, healthy',
      blurb: 'Annual check-up. Normal vitals. Badri should stay quiet.',
      patient: { name: 'Sara M.', age: 29, sex: 'F', setting: 'Outpatient clinic', settingShort: 'clinic', complaint: 'Annual check-up' },
      infection: false, nurseAck: null, doctorAck: null, ivFails: 0,
      lines: { arrive: 'Just my yearly check-up.', doctor: 'Everything looks normal. See you next year.' },
      keys: [{ t: 0, hr: 74, rr: 14, temp: 36.8, sbp: 116, dbp: 74, spo2: 99, gcs: 15, lac: 1.0 }, { t: 60, hr: 72, rr: 14, temp: 36.8, sbp: 117, dbp: 75, spo2: 99, gcs: 15, lac: 1.0 }],
      labs: { plt: 240, bili: 0.6, creat: 0.8, pf: 450, vent: false },
      summaryTitle: 'No sepsis signs, no patch, no false alarm'
    },
    {
      id: 'try', tab: 'Try it yourself', mode: 'try', seed: 5, startClock: 14 * 60,
      title: 'Try it yourself',
      blurb: 'A patient in bed with the patch on. Move the vitals and watch Badri re-score.',
      patient: { name: 'Demo patient', age: 55, sex: '', setting: 'Ward', settingShort: 'ward', complaint: 'Admitted with a suspected infection' },
      infection: true, nurseAck: null, doctorAck: null, ivFails: 0,
      lines: { nurseAtBed: 'Badri flagged you. I\'m calling the doctor.' },
      manualStart: { hr: 96, rr: 20, temp: 38.2, sbp: 112, dbp: 70, spo2: 96, gcs: 15, lac: 1.6 },
      keys: [{ t: 0, hr: 96, rr: 20, temp: 38.2, sbp: 112, dbp: 70, spo2: 96, gcs: 15, lac: 1.6 }],
      labs: { plt: 140, bili: 1.3, creat: 1.5, pf: 330, vent: false },
      summaryTitle: 'Your scenario'
    }
  ];

  const api = { Sim, CASES, qsofa, sofa, triageRule, monitorRule, meanArterial, fmtDur, ROLE_NAME, constants: { ACK_WINDOW, SECOND_WINDOW, LAB_TURNAROUND, ROUTINE_ROUNDS, PATCH_SAMPLE } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BadriEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
