/* ======================= SIMULATION + OVERLAY ======================= */
const K = E.constants;
let sim = null, caseDef = E.CASES[0], playing = true, userSpeed = 1, interval = 15;
let consumedAnim = 0, consumedLog = 0, stage = null, stageAt = 0, plan = null, lastUI = 0;
let pendingShot = null, pendingAt = 0;

// simulated minutes per real second, per stage (quiet waiting runs faster)
const PACE = { arrive: 1.8, triage: 1.6, patch: 1.6, watch: 7.5, alert: 1.6, escalate: 1.6, bundle: 2.2, treated: 7.0, confirmed: 1.8, routine: 2.2, try: 2.5 }; // 8 Nov: ~1.75x faster (Rayan)
const TAB = { er: 'ER walk-in', checkup: 'After childbirth', healthy: 'Healthy check-up', try: 'Try it' };
const LOC = { entrance: 'Arriving', triage: 'Triage', clinic: 'Clinic', ward: 'Ward · bed 2' };

function stageOf(s) {
  if (s.done) return 'end';
  if (s.response) return s.sofa ? 'confirmed' : s.bundle.abx ? 'treated' : 'bundle';
  if (s.alert) return s.esc.doctor.state === 'idle' ? 'alert' : 'escalate';
  if (s.def.mode === 'try') return 'try';
  if (s.patch && s.location === 'ward') return 'watch';
  if (s.triage) return s.triage.level === 'routine' ? 'routine' : 'patch';
  if (s.location === 'triage') return 'triage';
  return 'arrive';
}
function planFor(def) {
  const s = new E.Sim(def, { interval });
  const list = []; let last = null, guard = 0;
  while (!s.done && guard++ < 4000) { const k = stageOf(s); if (k !== last) { list.push({ key: k, t: s.t }); last = k; } s.step(0.25); }
  list.push({ key: 'end', t: s.t });
  return { list, end: s.t };
}

/* ---- case pills ---- */
const casesEl = $('cases');
for (const c of E.CASES) {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = TAB[c.id] || c.tab; b.dataset.id = c.id;
  b.addEventListener('click', () => loadCase(c.id));
  casesEl.appendChild(b);
}
/* ---- the patch tab: a 3D model of the patch itself ---- */
let patchOn = false;
const patchTab = document.createElement('button');
patchTab.type = 'button'; patchTab.setAttribute('role', 'tab'); patchTab.textContent = 'The patch'; patchTab.dataset.id = 'patch';
patchTab.addEventListener('click', () => showPatch());
casesEl.appendChild(patchTab);
function showPatch() {
  if (patchOn) return;
  patchOn = true; playing = false; setPlay(); toggleDrawer(false);
  for (const b of casesEl.children) b.setAttribute('aria-selected', String(b === patchTab));
  document.body.classList.add('patch');
  PatchView.show();
  try { if (location.hash !== '#patch') history.replaceState(null, '', '#patch'); } catch (e) {}
}
function hidePatch() {
  if (!patchOn) return;
  patchOn = false; document.body.classList.remove('patch'); PatchView.hide();
}

/* ---- try-it sliders (only the four inputs Badri's alert rule uses) ---- */
const SLIDERS = [
  { k: 'rr', label: 'Breathing', unit: '/min', min: 8, max: 40, step: 1 },
  { k: 'sbp', label: 'Systolic BP', unit: 'mmHg', min: 60, max: 180, step: 1 },
  { k: 'gcs', label: 'Alertness (GCS)', unit: '/15', min: 3, max: 15, step: 1 },
  { k: 'lac', label: 'Lactate', unit: 'mmol/L', min: 0.5, max: 8, step: 0.1 }
];
const sliderEls = {};
for (const s of SLIDERS) {
  const w = document.createElement('div'); w.className = 'slider';
  w.innerHTML = `<label for="sl-${s.k}">${s.label}<span id="slv-${s.k}"></span></label><input type="range" id="sl-${s.k}" min="${s.min}" max="${s.max}" step="${s.step}">`;
  $('sliders').appendChild(w);
  const input = w.querySelector('input');
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    sim.setManual(s.k, v);
    if (s.k === 'sbp') sim.setManual('dbp', Math.round(v * 0.62));
    syncSliders(); updateUI(true);
  });
  sliderEls[s.k] = input;
}
function syncSliders() {
  if (!sim || !sim.manual) return;
  for (const s of SLIDERS) {
    const v = sim.manual[s.k]; sliderEls[s.k].value = v;
    $('slv-' + s.k).textContent = (s.step < 1 ? Number(v).toFixed(1) : Math.round(v)) + ' ' + s.unit;
  }
}
$('rescoreNow').addEventListener('click', () => { sim.rescoreNow(); consume(); updateUI(true); });
$('presetSick').addEventListener('click', () => {
  const sick = { rr: 26, sbp: 96, gcs: 14, lac: 3.1, hr: 122, temp: 39.0, spo2: 93 };
  for (const [k, v] of Object.entries(sick)) sim.setManual(k, v);
  sim.setManual('dbp', Math.round(96 * 0.62));
  syncSliders(); updateUI(true);
});

/* ---- drawer content ---- */
const VITALS = [
  { k: 'rr', label: 'Breathing', unit: '/min', fmt: v => Math.round(v), flag: v => v >= 22 ? 'hot' : null },
  { k: 'bp', label: 'Blood pressure', unit: 'mmHg' },
  { k: 'gcs', label: 'Alertness (GCS)', unit: '/15', fmt: v => Math.round(v), flag: v => v <= 14 ? 'hot' : null },
  { k: 'lac', label: 'Lactate (patch)', unit: 'mmol/L', fmt: v => v.toFixed(1), flag: v => v >= 2 ? 'hot' : null },
  { k: 'hr', label: 'Heart rate', unit: '/min', fmt: v => Math.round(v), flag: v => v >= 100 ? 'warm' : null },
  { k: 'temp', label: 'Temperature', unit: '°C', fmt: v => v.toFixed(1), flag: v => (v >= 38 || v < 36) ? 'warm' : null },
  { k: 'spo2', label: 'Oxygen', unit: '%', fmt: v => Math.round(v), flag: v => v < 92 ? 'warm' : null }
];
const vEls = {};
for (const d of VITALS) {
  const r = document.createElement('div'); r.className = 'vrow';
  r.innerHTML = `<span>${d.label}</span><span class="v">--</span><span class="s">not measured yet</span>`;
  $('vitals').appendChild(r); vEls[d.k] = r;
}
const Q_ROWS = [['rr', 'Breathing 22/min or more'], ['sbp', 'Systolic BP 100 or lower'], ['ment', 'Alertness down (GCS 14 or lower)']];
const qEls = {};
for (const [k, name] of Q_ROWS) {
  const r = document.createElement('div'); r.className = 'vrow';
  r.innerHTML = `<span>${name}</span><span class="v">–</span>`;
  $('qrows').appendChild(r); qEls[k] = r;
}
const SOFA_ROWS = [
  { k: 'resp', organ: 'Lungs', measure: 'PaO₂/FiO₂', val: s => s.labs ? String(s.def.labs.pf) : null },
  { k: 'coag', organ: 'Clotting', measure: 'Platelets', val: s => s.labs ? String(s.def.labs.plt) : null },
  { k: 'liver', organ: 'Liver', measure: 'Bilirubin', val: s => s.labs ? s.def.labs.bili.toFixed(1) : null },
  { k: 'cardio', organ: 'Circulation', measure: 'MAP', val: s => s.display.sbp ? String(Math.round(E.meanArterial(s.display.sbp.v, s.display.dbp.v))) : null },
  { k: 'cns', organ: 'Brain', measure: 'GCS', val: s => s.display.gcs ? String(Math.round(s.display.gcs.v)) : null },
  { k: 'renal', organ: 'Kidneys', measure: 'Creatinine', val: s => s.labs ? s.def.labs.creat.toFixed(1) : null }
];
const sofaEls = {};
for (const r of SOFA_ROWS) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${r.organ}</td><td>${r.measure}</td><td class="tab">--</td><td class="p">--</td>`;
  $('sofaBody').appendChild(tr); sofaEls[r.k] = tr;
}
const ESC = [['nurse', 'Ward nurse'], ['doctor', 'ER doctor'], ['mrp', 'Responsible physician'], ['icu', 'ICU team']];
const escEls = {};
for (const [k, name] of ESC) {
  const r = document.createElement('div'); r.className = 'esc-row'; r.dataset.state = 'idle';
  r.innerHTML = `<span class="dot"></span><div><div class="nm">${name}</div><div class="st">Not alerted</div></div><button class="btn" type="button" hidden>Acknowledge</button>`;
  r.querySelector('button').addEventListener('click', () => { sim.acknowledge(k); consume(); updateUI(true); });
  $('esc').appendChild(r); escEls[k] = r;
}
const BUNDLE = [['lactate', 'Measure lactate'], ['cultures', 'Blood cultures'], ['access', 'IV access'], ['abx', 'Antibiotics'], ['fluids', 'IV fluids'], ['vaso', 'Vasopressors if MAP stays under 65']];
const checkEls = {};
for (const [k, name] of BUNDLE) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="bx"></span><div><b>${name}</b> <span class="det"></span></div>`;
  $('check').appendChild(li); checkEls[k] = li;
}
function opts(el, items, current, onPick) {
  el.innerHTML = '';
  for (const [v, label] of items) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(v === current));
    b.addEventListener('click', () => { for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); onPick(v); });
    el.appendChild(b);
  }
}
opts($('optInterval'), [[5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '60 min']], interval, v => { interval = v; loadCase(caseDef.id); });
opts($('optSpeed'), [[0.5, 'Slow'], [1, 'Normal'], [2, 'Fast']], userSpeed, v => { userSpeed = v; });

/* ---- case lifecycle ---- */
function consume() {
  while (consumedAnim < sim.anim.length) applyAnim(sim.anim[consumedAnim++], caseDef.id);
  patchJustOn = false;
  const log = $('log'); let added = false;
  while (consumedLog < sim.log.length) {
    const l = sim.log[consumedLog++];
    const li = document.createElement('li'); li.className = l.kind;
    li.innerHTML = '<span class="t"></span><span></span>';
    li.children[0].textContent = sim.clock(l.t); li.children[1].textContent = `${l.who}: ${l.text}`;
    log.appendChild(li); added = true;
  }
  if (added) log.scrollTop = log.scrollHeight;
}
function loadCase(id, o = {}) {
  hidePatch();
  caseDef = E.CASES.find(c => c.id === id) || E.CASES[0];
  for (const b of casesEl.children) b.setAttribute('aria-selected', String(b.dataset.id === caseDef.id));
  sim = new E.Sim(caseDef, { interval });
  startAvatars(caseDef.id);
  consumedAnim = 0; consumedLog = 0; $('log').innerHTML = '';
  plan = caseDef.mode === 'try' ? null : planFor(caseDef);
  $('end').hidden = true; document.body.classList.remove('ended');
  consume();
  if (o.seek) { while (sim.t < o.seek - 1e-6 && !sim.done) { sim.step(Math.min(0.5, o.seek - sim.t)); consume(); } }
  finishAllWalks();
  stage = null; userCam = false;
  playing = o.play !== false && !reduceMotion;
  setPlay();
  const p = caseDef.patient;
  $('pName').textContent = `${p.name}${p.age ? ', ' + p.age : ''}`;
  $('pComplaint').textContent = p.complaint;
  $('try').hidden = caseDef.mode !== 'try';
  syncSliders();
  try { if (location.hash !== '#' + caseDef.id) history.replaceState(null, '', '#' + caseDef.id); } catch (e) {}
  updateUI(true);
}
function nextStep() {
  if (sim.done) { nextCase(); return; }
  if (caseDef.mode === 'try' && !sim.alert) { sim.rescoreNow(); consume(); updateUI(true); return; }
  finishAllWalks();
  const k0 = stageOf(sim); let g = 0;
  while (!sim.done && stageOf(sim) === k0 && g++ < 3000) { sim.step(0.25); consume(); }
  finishAllWalks(); updateUI(true);
}
function prevStep() {
  if (!plan) { loadCase(caseDef.id); return; }
  const cur = stageOf(sim);
  let i = plan.list.findIndex(s => s.key === cur);
  if (i < 0) i = plan.list.length - 1;
  const fresh = performance.now() - stageAt < 2500;
  const target = (cur === 'end' || fresh) ? plan.list[Math.max(0, i - 1)].t : plan.list[i].t;
  loadCase(caseDef.id, { seek: target, play: playing });
}
function nextCase() { const i = E.CASES.indexOf(caseDef); loadCase(E.CASES[(i + 1) % E.CASES.length].id); }
function setPlay() {
  $('playText').textContent = playing ? 'Pause' : (sim && sim.done ? 'Replay' : 'Play');
  $('playIcon').innerHTML = playing ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.3-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>';
  $('play').setAttribute('aria-label', $('playText').textContent);
}
function togglePlay() { if (sim.done) { loadCase(caseDef.id); return; } playing = !playing; setPlay(); }
function toggleDrawer(force) {
  const d = $('drawer'), open = force != null ? force : d.dataset.open !== 'true';
  d.dataset.open = String(open); d.inert = !open; $('details').setAttribute('aria-expanded', String(open));
  if (open) updateUI(true);
}
function toggleFull() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}
$('play').addEventListener('click', togglePlay);
$('next').addEventListener('click', nextStep);
$('back').addEventListener('click', prevStep);
$('restart').addEventListener('click', () => loadCase(caseDef.id));
$('details').addEventListener('click', () => toggleDrawer());
$('closeDrawer').addEventListener('click', () => toggleDrawer(false));
$('fs').addEventListener('click', toggleFull);
$('replay').addEventListener('click', () => loadCase(caseDef.id));
$('nextCase').addEventListener('click', nextCase);
$('ack').addEventListener('click', () => { const r = $('ack').dataset.role; if (r) { sim.acknowledge(r); consume(); updateUI(true); } });
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input')) return;
  if (/^[1-4]$/.test(e.key)) { loadCase(E.CASES[+e.key - 1].id); return; }
  if (e.key === '5') { showPatch(); return; }
  if (patchOn) { if (e.key === 'f' || e.key === 'F') toggleFull(); else PatchView.key(e); return; }
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') nextStep();
  else if (e.key === 'ArrowLeft') prevStep();
  else if (e.key === 'r' || e.key === 'R') loadCase(caseDef.id);
  else if (e.key === 'd' || e.key === 'D') toggleDrawer();
  else if (e.key === 'f' || e.key === 'F') toggleFull();
  else if (e.key === 'c' || e.key === 'C') { userCam = false; currentShot = null; }
  else if (e.key === 'Escape') toggleDrawer(false);
});

/* ---- words on screen ---- */
const pron = (sex) => sex === 'F' ? ['she', 'her'] : sex === 'M' ? ['he', 'him'] : ['they', 'them'];
function lastEvent(s, since) {
  for (let i = s.log.length - 1; i >= 0; i--) { const l = s.log[i]; if (l.t < since) break; if (l.kind !== 'tick' && l.who !== 'Simulation') return l; }
  return null;
}
function captionFor(k, s) {
  const p = s.def.patient, [he, him] = pron(p.sex), first = p.name.split(' ')[0];
  const v = s.values(), lac = v.lac != null ? v.lac.toFixed(1) : '--';
  const q = v.rr != null ? E.qsofa(v).score : null;
  switch (k) {
    case 'arrive': return { chip: 'Arrival', h: `${first} walks into the ${p.settingShort}.`, p: `“${s.def.lines.arrive}”` };
    case 'triage': return { chip: 'Triage', h: 'The nurse takes the usual vitals.', p: 'Breathing, pulse, blood pressure, temperature, oxygen, alertness. Badri scores them the moment they are in.' };
    case 'patch': return { chip: 'Patch', h: `Close to the line, so ${he} gets a Badri patch.`, p: `${s.triage.why.join(' · ')}. Quick score ${s.triage.q.score} of 3: not an alarm yet, so the patch keeps watching.` };
    case 'watch': return { chip: 'Watching', h: `Every ${s.interval} minutes, Badri re-scores ${him}.`, p: `Each patch reading goes straight into the score. Lactate ${lac} mmol/L · quick score ${q ?? '–'} of 3${s.nextScoreAt != null ? ` · next re-score ${s.clock(s.nextScoreAt)}` : ''}.` };
    case 'alert': return { chip: 'Alert', h: 'Sepsis alert. The ward nurse is notified.', p: s.alert.why.join(' · ') + (s.def.nurseBusy ? '. The nurse is with another patient.' : '.') };
    case 'escalate': return s.esc.mrp.state !== 'idle'
      ? { chip: 'Escalation', h: 'Still no answer: the physician and ICU are paged.', p: `${Math.round(s.t - s.alert.t)} minutes since the alert.` }
      : { chip: 'Escalation', h: `No answer in ${K.ACK_WINDOW} minutes, so Badri pages the ER doctor.`, p: 'Badri does not wait. It moves to the next person on the list.' };
    case 'bundle': { const e = lastEvent(s, s.response.t); return { chip: 'First hour', h: 'The hour-1 bundle starts at the bedside.', p: e ? `${e.who}: ${e.text}` : `Lactate ${lac} mmol/L is already known from the patch.` }; }
    case 'treated': { const m = Math.round(s.bundle.abx.t - s.alert.t); return { chip: 'Treated', h: `Antibiotics in at minute ${m} of the first hour.`, p: (s.bundle.vaso ? s.bundle.vaso.text + '. ' : '') + `Blood tests for the full SOFA score take about ${K.LAB_TURNAROUND} minutes.` }; }
    case 'confirmed': return { chip: 'Confirmed', h: s.sofa.total >= 2 ? `Labs confirm sepsis: SOFA ${s.sofa.total}.` : `Full SOFA ${s.sofa.total}.`, p: 'Treatment was already running when the results came back.' };
    case 'routine': return { chip: 'All clear', h: 'No sepsis signs. No patch, no alarm.', p: s.location === 'clinic' ? 'The check-up carries on as normal.' : 'Badri stays quiet when nothing is wrong.' };
    case 'try': return { chip: 'Try it', h: 'Your patient. Push the vitals over the line.', p: `Badri re-scores every ${s.interval} minutes. Move the sliders, then wait or press Re-score now.` };
    case 'end': return { chip: 'Done', h: s.summary ? s.summary.title : 'Case complete', p: '' };
  }
  return { chip: '', h: '', p: '' };
}
function statusFor(s) {
  const lv = s.status.level;
  if (lv === 'alert') { const n = ESC.filter(([k]) => s.esc[k].state === 'notified').map(([, n]) => n.toLowerCase()); return `Sepsis alert · ${n.length ? n.join(', ') + ' paged' : 'sent'}`; }
  if (lv === 'watch') return !s.patch ? 'Near the line · patch next' : s.nextScoreAt != null ? `Patch on · next re-score ${s.clock(s.nextScoreAt)}` : 'Patch on';
  if (lv === 'respond') return 'First hour running';
  if (lv === 'confirmed') return s.done ? 'Sepsis confirmed · treated early' : 'Sepsis confirmed';
  if (lv === 'routine') return 'All clear · no patch needed';
  return s.status.title;
}

/* ---- render the overlay ---- */
function updateUI(force) {
  const now = performance.now();
  if (!force && now - lastUI < 110) return;
  lastUI = now;
  const s = sim, d = s.display, v = s.values();
  $('clock').textContent = s.clock();
  $('pLoc').textContent = LOC[s.location] || s.location;
  const hasV = v.rr != null, q = hasV ? E.qsofa(v).score : null;
  $('qBig').innerHTML = q == null ? '–' : `${q}<small>/ 3</small>`;
  $('qBig').className = 'big' + (q >= 2 ? ' hot' : q === 1 ? ' warm' : '');
  $('lacBig').innerHTML = v.lac == null ? '–' : `${v.lac.toFixed(1)}<small>mmol/L</small>`;
  $('lacBig').className = 'big' + (v.lac >= 2 ? ' hot' : '');
  const st = $('status'); st.dataset.level = s.status.level; $('stText').textContent = statusFor(s);
  if (s.alert) {
    const el = Math.max(0, s.t - s.alert.t);
    $('hour').hidden = false; $('hourBar').style.width = Math.min(100, el / 60 * 100) + '%';
    $('hourText').textContent = s.bundle.abx ? `Antibiotics at minute ${Math.round(s.bundle.abx.t - s.alert.t)} of the first hour` : `First hour · minute ${Math.floor(el)}`;
  } else $('hour').hidden = true;
  const waiting = s.alert && !s.response && !s.done ? ESC.find(([k]) => s.esc[k].state === 'notified') : null;
  const ack = $('ack'); ack.hidden = !waiting;
  if (waiting) { ack.dataset.role = waiting[0]; ack.textContent = `Acknowledge as ${waiting[1].toLowerCase()}`; }

  const k = stage || stageOf(s), cap = captionFor(k, s);
  $('stageChip').textContent = cap.chip; $('stageChip').dataset.level = s.status.level;
  $('headline').textContent = cap.h; $('line').textContent = cap.p; $('line').hidden = !cap.p;
  if (plan) {
    const steps = plan.list.filter(x => x.key !== 'end');
    const i = steps.findIndex(x => x.key === k);
    $('stepChip').hidden = false; $('stepChip').textContent = k === 'end' ? `${steps.length} / ${steps.length}` : i >= 0 ? `${i + 1} / ${steps.length}` : '·';
    $('prog').style.width = Math.min(100, (s.t / plan.end) * 100) + '%';
  } else { $('stepChip').hidden = true; $('prog').style.width = '0%'; }

  if ($('drawer').dataset.open !== 'true') return;
  for (const vd of VITALS) {
    const r = vEls[vd.k]; let val = null, src = null, at = null, flag = null;
    if (vd.k === 'bp') { if (d.sbp) { val = `${Math.round(d.sbp.v)}/${Math.round(d.dbp.v)}`; src = d.sbp.src; at = d.sbp.at; flag = d.sbp.v <= 100 ? 'hot' : null; } }
    else if (d[vd.k]) { val = vd.fmt(d[vd.k].v); src = d[vd.k].src; at = d[vd.k].at; flag = vd.flag(d[vd.k].v); }
    r.className = 'vrow' + (flag ? ' ' + flag : '');
    r.querySelector('.v').textContent = val == null ? '--' : `${val} ${vd.unit}`;
    r.querySelector('.s').textContent = val == null ? (vd.k === 'lac' ? 'needs the patch or a blood test' : 'not measured yet') : `${src} · ${Math.max(0, Math.round(s.t - at))} min ago`;
  }
  const qq = hasV ? E.qsofa(v) : null;
  for (const [key] of Q_ROWS) { const r = qEls[key]; const on = qq && qq[key]; r.className = 'vrow' + (on ? ' hot' : ''); r.querySelector('.v').textContent = qq ? (on ? 'Yes' : 'No') : '–'; }
  for (const r of SOFA_ROWS) { const tr = sofaEls[r.k], val = r.val(s), pts = s.sofa ? s.sofa[r.k] : null; tr.children[2].textContent = val ?? '--'; tr.children[3].textContent = pts ?? '--'; tr.classList.toggle('hot', pts > 0); }
  $('sofaTotal').textContent = s.sofa ? `Full SOFA ${s.sofa.total}${s.sofa.total >= 2 ? ': 2 or more, sepsis (Sepsis-3)' : ''}` : s.labsOrderedAt != null ? 'Full SOFA: blood tests running' : 'Full SOFA needs blood tests; ordered after an alert.';
  for (const [key] of ESC) {
    const e = s.esc[key], r = escEls[key]; r.dataset.state = e.state;
    r.querySelector('.st').textContent = e.state === 'idle' ? (s.alert ? 'Standing by' : 'Not alerted') : e.state === 'notified' ? `Alerted ${s.clock(e.at)} · ${Math.round(s.t - e.at)} min, no answer` : `Answered ${s.clock(e.ackAt)}`;
    r.querySelector('button').hidden = !(e.state === 'notified' && !s.done);
  }
  for (const [key] of BUNDLE) { const b = s.bundle[key], li = checkEls[key]; li.classList.toggle('done', !!b); li.querySelector('.det').textContent = b ? `${s.clock(b.t)} · ${b.text}` : (s.alert ? 'pending' : ''); }
  drawTrend();
}
function drawTrend() {
  const s = sim, svg = $('trend'), W = 340, H = 110, L = 26, R = 40, T = 8, B = 18;
  const cs = getComputedStyle(document.documentElement);
  const muted = cs.getPropertyValue('--muted').trim(), line = cs.getPropertyValue('--line').trim(), alert = cs.getPropertyValue('--alert').trim(), head = cs.getPropertyValue('--head').trim(), warm = cs.getPropertyValue('--warm').trim();
  const pts = s.samples;
  if (!pts.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${muted}" font-size="12">No patch readings yet</text>`; $('trendNote').textContent = s.triage && s.triage.level === 'routine' ? 'Patch not needed for this patient.' : 'Starts when the patch goes on.'; return; }
  const t0 = pts[0].t, t1 = Math.max(t0 + 60, s.t);
  const maxL = Math.max(4, Math.ceil(Math.max(...pts.map(p => p.lac)) + 0.5));
  const X = t => L + (t - t0) / (t1 - t0) * (W - L - R), Y = v => T + (1 - v / maxL) * (H - T - B);
  let g = '';
  for (let y = 0; y <= maxL; y++) g += `<line x1="${L}" x2="${W - R}" y1="${Y(y)}" y2="${Y(y)}" stroke="${line}"/><text x="${L - 6}" y="${Y(y) + 4}" text-anchor="end" fill="${muted}" font-size="10">${y}</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(2)}" y2="${Y(2)}" stroke="${alert}" stroke-dasharray="4 3"/><text x="${W - R + 4}" y="${Y(2) + 4}" fill="${alert}" font-size="10">2.0</text>`;
  if (s.alert && s.alert.t >= t0) g += `<line x1="${X(s.alert.t)}" x2="${X(s.alert.t)}" y1="${T}" y2="${H - B}" stroke="${alert}"/>`;
  const dPath = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.lac).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  g += `<path d="${dPath} L${X(last.t).toFixed(1)},${Y(0)} L${X(t0).toFixed(1)},${Y(0)} Z" fill="${warm}" opacity="0.15"/><path d="${dPath}" fill="none" stroke="${warm}" stroke-width="2.2" stroke-linejoin="round"/>`;
  g += `<circle cx="${X(last.t)}" cy="${Y(last.lac)}" r="4" fill="${last.lac >= 2 ? alert : warm}"/><text x="${X(last.t) + 7}" y="${Y(last.lac) - 6}" fill="${head}" font-size="11" font-weight="600">${last.lac.toFixed(1)}</text>`;
  g += `<text x="${L}" y="${H - 3}" fill="${muted}" font-size="10">${s.clock(t0)}</text><text x="${W - R}" y="${H - 3}" fill="${muted}" font-size="10" text-anchor="end">${s.clock(t1)}</text>`;
  svg.innerHTML = g;
  $('trendNote').textContent = `A patch reading and a re-score every ${s.interval} min.`;
}
function showEnd() {
  const s = sim; if (!s.summary) return;
  $('endTitle').textContent = s.summary.title;
  const box = $('endStats'); box.innerHTML = '';
  for (const r of s.summary.rows) {
    const d = document.createElement('div'); d.className = 'stat' + (/without/i.test(r.label) ? ' hot' : '');
    d.innerHTML = '<span class="k"></span><span class="v"></span><span class="n"></span>';
    d.children[0].textContent = r.label; d.children[1].textContent = r.value; d.children[2].textContent = r.note;
    box.appendChild(d);
  }
  $('end').hidden = false; document.body.classList.add('ended');
  playing = false; setPlay();
}

/* ---- camera direction ---- */
function desiredShot() {
  if (stage === 'end') return 'overview';
  // Rayan 8 Nov 17:43: once the patched patient gets up, cut straight to her bed (no pan out, no pan back to triage)
  if (stage === 'patch' && ((people.patient.tween && !(people.patient.tween.delay > 0)) || people.patient.node !== 'triageChair')) return 'bay';
  if (stage !== 'arrive' && longWalk(['patient', 'doctor', 'nurse2', 'anaes'])) return 'overview';
  if (stage === 'alert') return caseDef.nurseBusy ? 'bayWide' : 'station';
  if (stage === 'escalate') return 'station';
  return { arrive: 'arrive', triage: 'triage', patch: 'patch', watch: 'bay', bundle: 'bundle', treated: 'treated', confirmed: 'confirmed', routine: 'clinic', try: 'bay' }[stage] || 'overview';
}
function autoCamera(now) {
  if (userCam) return;
  const want = desiredShot();
  if (want === currentShot) { pendingShot = null; return; }
  if (pendingShot !== want) { pendingShot = want; pendingAt = now; return; }
  if (now - pendingAt > 220 || currentShot == null) flyTo(want, currentShot == null);
}

/* ---- main loop ---- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (patchOn) { PatchView.frame(now); requestAnimationFrame(frame); return; }
  const k = stageOf(sim);
  if (k !== stage) { stage = k; stageAt = now; userCam = false; if (k === 'end') showEnd(); updateUI(true); }
  const walking = anyWalking(['patient', 'nurse1', 'nurse2', 'doctor', 'anaes']);
  if (playing && !sim.done && !walking) {
    let pace = PACE[stage] ?? 1.2;
    if (now - stageAt < 1400) pace = Math.min(pace, 1.2);
    sim.step(dt * pace * userSpeed);
    consume();
  }
  updateWorld(now, playing ? dt : 0, sim, (sim.alert ? 3.6 : 2.8) * userSpeed);
  autoCamera(now);
  render();
  updateUI(false);
  requestAnimationFrame(frame);
}
const startId = (location.hash || '').replace('#', '');
loadCase(E.CASES.some(c => c.id === startId) ? startId : 'er', startId === 'patch' ? { play: false } : {});
if (startId === 'patch') showPatch();
window.addEventListener('hashchange', () => { const id = location.hash.replace('#', ''); if (id === 'patch') showPatch(); else if (id && (id !== caseDef.id || patchOn) && E.CASES.some(c => c.id === id)) loadCase(id); });
requestAnimationFrame(frame);
window.__badri = { consumeOnly() { consume(); }, consumeAll() { consume(); finishAllWalks(); }, snap() { stage = stageOf(sim); flyTo(desiredShot(), true); }, get sim() { return sim; }, nextStep, loadCase, flyTo, people, THREE, camera, controls, get stage() { return stage; }, showPatch, PatchView };
