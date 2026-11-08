/* ======================= THE PATCH: 3D model of the Badri patch and reader ======================= */
// Built from the team's research (8 Nov 2026), plus CRP on the same patch (Rayan, 14:32): 11-needle lean or 16-needle robust array, 0.7 mm needles,
// shared reference/counter needles, TMUX1108 switch, potentiostat front end, XIAO nRF52840. Units: millimetres.
const PatchView = (() => {
  const view = $('patchView'), hostEl = $('patchScene');

  const KINDS = {
    lac: { short: 'Lactate', color: 0xC98A2E, we: true, sig: 'amp', how: 'Enzyme · steady current', h: 'Lactate needle',
      p: 'Lactate oxidase on the tip turns lactate in the skin fluid into pyruvate and hydrogen peroxide. The needle is held at +0.4 to +0.7 V against the reference and oxidises the peroxide, so more lactate means more current.' },
    pct: { short: 'PCT', color: 0x2A6F8A, we: true, sig: 'peak', how: 'Antibody sandwich · current peak', h: 'Procalcitonin (PCT) needle',
      p: 'Capture antibodies sit on a gold tip roughened with carbon nanotubes or gold nanoparticles for more surface. PCT is caught between them and a second antibody that carries a redox tag. A voltage sweep shows a current peak: the taller the peak, the more PCT.' },
    il6: { short: 'IL-6', color: 0xA8432F, we: true, sig: 'peak', how: 'Antibody sandwich · current peak', h: 'Interleukin-6 (IL-6) needle',
      p: 'The same sandwich idea, tuned to IL-6: a capture antibody on a nanostructured gold tip, a redox-tagged antibody on top, and a voltage sweep that reads the peak. IL-6 rises early, within about two hours, ahead of PCT.' },
    ps: { short: 'Presepsin', color: 0x4E8A62, we: true, sig: 'cap', how: 'Binding protein · capacitance change', h: 'Presepsin needle',
      p: 'Engineered affimers (small binding proteins) or antibody fragments sit on a carbon-ink tip. When presepsin binds, the surface capacitance changes, and a capacitance or impedance scan measures it.' },
    crp: { short: 'CRP', color: 0x6B5B95, we: true, sig: 'imp', how: 'Antibody or aptamer · impedance rise', h: 'C-reactive protein (CRP) needle',
      p: 'Anti-CRP antibodies or aptamers are fixed to a gold tip. When CRP binds, it blocks electron flow at the surface, so the resistance read by an impedance scan goes up. CRP rises slowly, over one to two days, so it is the marker that tracks recovery or relapse once the patient goes home wearing the same patch.' },
    re: { short: 'Reference', color: 0xCDD1D6, how: 'Silver / silver chloride', h: 'Reference needle · shared',
      p: 'Holds a steady voltage that every sensor needle is measured against. Two reference needles serve every marker on the patch.' },
    ce: { short: 'Counter', color: 0x3A3D41, how: 'Platinum or carbon', h: 'Counter needle · shared',
      p: 'Carries the current back so the circuit is closed. Two counter needles serve every marker on the patch.' },
    d: { short: 'Anchor', color: 0xD3E6EC, how: 'Plain polymer, no electrode', h: 'Anchor needle',
      p: 'Spreads the push evenly so every needle goes in to the same depth, and holds the patch steady.' }
  };
  const WE = ['lac', 'pct', 'il6', 'ps', 'crp'];
  const LEGEND = ['lac', 'pct', 'il6', 'ps', 'crp', 're', 'ce', 'd'];

  // rows run back (z-) to front (z+); the front row is the one the cut-away view shows
  const LAYOUT = {
    lean: { n: 11, we: 5, area: '≈ 0.6 cm²', pitch: 2.04, rows: [['d', null, null, null, 'd'], ['re', 'ce', null, 'ce', 're'], ['lac', 'pct', 'il6', 'ps', 'crp']] },
    robust: { n: 16, we: 10, area: '≈ 0.75 cm²', pitch: 2.04, rows: [['d', 'lac', 'pct', 'il6', 'ps', 'crp'], ['re', 'ce', null, null, 'ce', 're'], ['lac', 'pct', 'il6', 'ps', 'crp', 'd']] }
  };

  const PARTS = {
    array: { name: 'Needle array', h: 'Microneedle array · disposable',
      p: () => `${LAYOUT[design].n} needles, each 0.7 mm long (the research range is 0.5 to 0.9 mm), with tips under 10 to 20 µm across. Long enough to reach the fluid in the dermis, short of the deeper blood vessels. Single use and sterile-packed: the only part that breaks the skin, so it is never reused. This is where the per-patient cost sits; everything electronic stays in the reader.` },
    flex: { name: 'Flexible backing', h: 'Flexible backing · disposable', p: () => 'A thin flexible circuit with no chips on it, so the throw-away part stays cheap. Gold traces carry each needle’s signal to contact pads that touch the reader.' },
    adhesive: { name: 'Adhesive ring', h: 'Adhesive ring · disposable', p: () => 'Skin-safe medical adhesive that holds the patch on for its wear time; thrown away with the needles.' },
    base: { name: 'Reader base', h: 'Reader base · reusable', p: () => 'Spring pins line up with the patch’s contact pads when the reader clicks on. The reader never touches the needle site, so it is wiped with hospital disinfectant and reused for the next patient.' },
    analog: { name: 'Sensor board', h: 'Sensor board · reusable', p: () => 'Carries the switch and the potentiostat right above the spring pins, so the tiny currents travel a short way.' },
    mux: { name: 'Switch · TMUX1108', h: 'Switch · TI TMUX1108', p: () => (design === 'robust' ? 'Two 8-to-1 switches: ten sensor needles do not fit on one. ' : 'An 8-to-1 switch. ') + 'It connects one sensor needle at a time to the potentiostat, picked by address pins A0, A1 and A2. The enable pin must be held high: in TI’s datasheet, low turns every switch off' + (design === 'robust' ? ', which is how the firmware picks which of the two switches is live.' : '.') },
    afe: { name: 'Potentiostat', h: 'Potentiostat front end', p: () => 'Holds the selected needle at its working voltage against the reference needles and turns its nanoamp current into a voltage. It must also sweep voltages and measure impedance for PCT, IL-6, presepsin and CRP, so it is an AD5940 or ADuCM355-class chip; a fixed-voltage chip such as the LMP91000 only suits lactate.' },
    mcu: { name: 'Microcontroller + Bluetooth', h: 'Microcontroller + Bluetooth · Seeed XIAO nRF52840', p: () => 'Runs the read cycle: set the address pins, wait 30 ms for the switch to settle, then read. Each reading goes over Bluetooth Low Energy to the phone or ward dashboard, where Badri re-scores the patient.' },
    battery: { name: 'Battery', h: 'Battery · reusable reader', p: () => 'A small rechargeable cell. It stays in the reusable reader, so no battery is thrown away with each patch.' },
    top: { name: 'Reader cover', h: 'Reader cover · reusable', p: () => 'A sealed, splash-proof white shell seated in the red tray, so it survives disinfectant wipes between patients. Built to medical electrical safety rules (IEC 60601-1, including its home-use part, since it goes home with the patient).' }
  };
  const EXPLODE = { adhesive: 1.4, array: 3.6, flex: 6.2, base: 11, analog: 16, mcu: 21.5, battery: 27.5, top: 40 };
  const READER = ['base', 'analog', 'mcu', 'battery', 'top'];

  const VIEWS = {
    whole: { label: 'Whole', chip: 'Whole patch', h: 'One wearable, two parts.', p: 'A cheap, sterile, single-use needle patch, and a reusable reader that holds all the electronics. Drag to turn it; tap any part.' },
    exploded: { label: 'Exploded', chip: 'Exploded', h: 'What is inside.', p: 'From the skin up: adhesive, needle array and flexible backing (disposable), then the reader: base with spring pins, switch and potentiostat, microcontroller with Bluetooth, battery, cover.' },
    skin: { label: 'In the skin', chip: 'In the skin', h: 'The needles end in the skin’s fluid layer.', p: 'Each needle is 0.7 mm long. It passes the epidermis and stops in the dermis, where interstitial fluid (ISF) surrounds the cells. The larger blood vessels sit deeper than the tips.' }
  };

  const SIG = { // tiny sparkline per measuring method
    amp: 'M2,30 L34,30 C42,30 44,9 56,8 L118,7', peak: 'M2,30 L38,30 C52,30 52,5 60,5 C68,5 68,30 82,30 L118,30',
    cap: 'M2,7 C30,8 52,24 118,28', imp: 'M2,30 C40,29 60,12 118,8', base: 'M2,19 L118,19'
  };

  // guided tour of the whole device: each step sets a view, a highlighted part and a camera, with a short line of narration
  const TOUR = [
    { mode: 'whole', h: 'One wearable, two parts.', p: 'A sterile microneedle patch that is thrown away after use, and a reusable reader that clicks on top and holds every chip.' },
    { mode: 'whole', sel: 'top', focus: 'top', h: 'The reader cover', p: 'A sealed, splash-proof shell, wiped with hospital disinfectant between patients, so the reader is reused for the next patient.' },
    { mode: 'exploded', h: 'Open it up.', p: 'Thrown away: the adhesive, the needle array and its backing. Kept: the reader base, sensor board, microcontroller, battery and cover.' },
    { mode: 'exploded', sel: 'battery', focus: 'battery', h: 'Battery', p: 'A small rechargeable cell. It lives in the reader, so no battery is thrown away with each patch.' },
    { mode: 'exploded', sel: 'mcu', focus: 'mcu', h: 'Microcontroller + Bluetooth', p: 'A Seeed XIAO nRF52840 runs the read cycle every 15 minutes and sends each reading over Bluetooth Low Energy to the ward dashboard.' },
    { mode: 'exploded', sel: 'afe', focus: 'analog', h: 'Potentiostat', p: 'Holds each needle at its working voltage and turns its tiny current into a number. Sweeps and impedance for the protein markers need an AD5940-class chip.' },
    { mode: 'exploded', sel: 'mux', focus: 'analog', h: 'Switch', p: () => (design === 'robust' ? 'Two TI TMUX1108 switches connect' : 'A TI TMUX1108 switch connects') + ' one needle at a time to the potentiostat, picked by three address pins.' },
    { mode: 'exploded', sel: 'base', focus: 'base', h: 'Reader base', p: 'Spring pins meet the patch’s contact pads when the reader clicks on. The reader never touches the needle site.' },
    { mode: 'exploded', sel: 'flex', focus: 'flex', h: 'Flexible backing', p: 'A thin circuit with no chips on it, so the thrown-away part stays cheap. Gold traces carry each needle’s signal to the pads.' },
    { mode: 'exploded', sel: 'array', focus: 'array', h: 'Needle array', p: () => `${LAYOUT[design].n} needles, 0.7 mm long: ${design === 'robust' ? 'ten sensor needles in pairs' : 'five sensor needles'} for lactate, IL-6, presepsin, PCT and CRP, plus shared reference and counter needles and anchors. Sterile, single use.` },
    { mode: 'exploded', sel: 'adhesive', focus: 'adhesive', h: 'Adhesive', p: 'Skin-safe medical adhesive holds the patch on, and goes in the bin with the needles.' },
    { mode: 'skin', h: 'Into the skin', p: 'The tips stop in the dermis, in the fluid around the cells, above the larger blood vessels.' },
    { mode: 'skin', cycle: true, dur: 10.5, h: 'One reading', p: 'The switch steps through the sensor needles one by one, waits 30 ms on each, and the potentiostat reads them.' },
    { mode: 'whole', h: 'To the dashboard', p: 'Every 15 minutes the readings go over Bluetooth. Badri re-scores the patient and, if the score crosses the line, alerts the nurse, then the ER doctor, then the ICU, until someone acts.' },
    { mode: 'whole', h: 'And home', p: 'The same patch goes home with the patient. CRP rises slowly, so it shows whether they are recovering or relapsing.', last: true }
  ];
  const tour = { on: false, i: 0, t: 0, paused: false };
  const tourText = (st) => (typeof st.p === 'function' ? st.p() : st.p);
  // Rayan 8 Nov 22:22: the whole tour in about 15 s, played live before the Fatima case
  const TOUR_SECS = [1.2, 0.9, 1.2, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.0, 0.8, 1.2, 1.8, 1.2, 0.9];
  const tourDur = (st) => TOUR_SECS[TOUR.indexOf(st)] || 1;

  let R = null, on = false, design = 'lean', mode = 'whole', selected = null, last = performance.now();
  const cyc = { on: false, i: -1, at: 0, seq: [] };
  const anim = { k: 0, kTo: 0, clip: 60, clipTo: 60, cam: null, fov: 30 };

  /* ---------- helpers ---------- */
  function ctex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function std(color, o = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0 }, o)); }
  function mesh(geo, m, x = 0, y = 0, z = 0, parent) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (parent) parent.add(o); return o; }
  function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
  function label(text, cls, onClick, dot) {
    const el = document.createElement('div'); el.className = 'plabel ' + (cls || '');
    el.innerHTML = `<span>${dot ? `<i style="background:${dot}"></i>` : ''}${text}</span>`;
    if (onClick) el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onClick(); });
    const o = new CSS2DObject(el); o.userData.kind = cls; return o;
  }

  /* ---------- scene ---------- */
  function init() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    renderer.localClippingEnabled = true; renderer.setClearColor(0x000000, 0);
    hostEl.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer(); labels.domElement.className = 'labels'; hostEl.appendChild(labels.domElement);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 2000);
    const ctl = new OrbitControls(camera, renderer.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.minDistance = 3; ctl.maxDistance = 260; ctl.enablePan = true;
    ctl.addEventListener('start', () => { anim.cam = null; });
    scene.add(new THREE.HemisphereLight(0xfffaf2, 0xd9c9b8, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(30, 70, 45); scene.add(key);
    const rim = new THREE.DirectionalLight(0xe2f0ff, 0.55); rim.position.set(-50, 25, -40); scene.add(rim);
    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 60), clipBack = new THREE.Plane(new THREE.Vector3(0, 0, 1), 60);
    R = { renderer, labels, scene, camera, ctl, clip, clipBack, g: {}, pick: [], needles: [], chan: {}, nets: {}, partLabels: [], skinLabels: [], needleLabels: [], ray: new THREE.Raycaster(), ptr: new THREE.Vector2() };
    buildSkin(); buildReader(); buildDesign();
    new ResizeObserver(resize).observe(hostEl); resize();
    // click to select (ignore drags)
    let down = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      if (tour.on) tourPause(true);
      const r = renderer.domElement.getBoundingClientRect();
      R.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      R.ray.setFromCamera(R.ptr, camera);
      const hit = R.ray.intersectObjects(R.pick, false).find(h => shown(h.object) && !(h.object.userData.clipped && h.point.z > R.clip.constant));
      if (!hit) { select(null); return; }
      const u = hit.object.userData;
      select(u.kind ? { kind: u.kind, mesh: u.needle } : { part: u.part });
    });
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const r = renderer.domElement.getBoundingClientRect();
      R.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      R.ray.setFromCamera(R.ptr, camera);
      const hit = R.ray.intersectObjects(R.pick, false).find(h => shown(h.object) && !(h.object.userData.clipped && h.point.z > R.clip.constant));
      renderer.domElement.style.cursor = hit ? 'pointer' : '';
    });
  }
  function shown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
  function part(name) {
    const g = new THREE.Group(); g.userData.part = name; g.userData.y0 = 0; R.scene.add(g); R.g[name] = g;
    if (PARTS[name] && !['mux', 'afe'].includes(name)) {
      const l = label(PARTS[name].name, 'part', () => select({ part: name }), null);
      g.add(l); R.partLabels.push(l); g.userData.label = l;
    }
    return g;
  }
  function pickable(m, name, clipped) { m.userData.part = name; if (clipped) m.userData.clipped = true; R.pick.push(m); return m; }

  function buildSkin() {
    const g = new THREE.Group(); R.scene.add(g); R.g.skin = g;
    const cp = [R.clip, R.clipBack];
    const W = 64, D = 48;
    const layer = (y0, y1, color, opacity, ro) => {
      const m = std(color, { roughness: 0.9, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide, clippingPlanes: cp });
      const o = mesh(new THREE.BoxGeometry(W, y0 - y1, D), m, 0, (y0 + y1) / 2, 0, g); o.renderOrder = ro; return o;
    };
    // skin surface texture: soft mottling
    const skinTex = ctex(256, 256, (c, w, h) => { c.fillStyle = '#d9a68a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${150 + Math.random() * 60},${90 + Math.random() * 40},${70 + Math.random() * 30},0.07)`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 5, 0, 7); c.fill(); } });
    skinTex.wrapS = skinTex.wrapT = THREE.RepeatWrapping; skinTex.repeat.set(4, 3);
    const epi = layer(0, -0.1, 0xffffff, 0.8, 3); epi.material.map = skinTex;
    layer(-0.1, -2.0, 0xE7A497, 0.42, 2);
    layer(-2.0, -3.2, 0xEDD097, 1, 0);
    // larger blood vessels, deeper than the needle tips
    const vm = std(0xB0383A, { roughness: 0.45, clippingPlanes: cp });
    for (const [z, y, r] of [[1.25, -1.72, 0.1], [0.1, -1.58, 0.08], [-6, -1.7, 0.1], [-14, -1.75, 0.1]]) {
      const pts = []; for (let x = -W / 2; x <= W / 2; x += 4) pts.push(new THREE.Vector3(x, y + 0.07 * Math.sin(x * 0.7 + z), z + 0.5 * Math.sin(x * 0.23 + z)));
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, r, 10), vm, 0, 0, 0, g);
    }
    // interstitial fluid: drifting specks in the dermis
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 18; pos[i * 3 + 1] = -0.15 - Math.random() * 1.8; pos[i * 3 + 2] = 2.1 - Math.random() * 2.5; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = ctex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
    const isf = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x6FC0DA, size: 0.11, map: dot, transparent: true, depthWrite: false, opacity: 0.9, clippingPlanes: cp }));
    isf.renderOrder = 4; g.add(isf); R.isf = isf;
    // the cut face behind the needles, shown only in the cut-away view
    const wall = ctex(64, 1024, (c, w, h) => {
      const Y = (mm) => (-mm / 3.2) * h;
      const gd = c.createLinearGradient(0, Y(-0.1), 0, Y(-2.0)); gd.addColorStop(0, '#f0c0b2'); gd.addColorStop(1, '#e6a596');
      c.fillStyle = '#c98f74'; c.fillRect(0, 0, w, Y(-0.1));
      c.fillStyle = gd; c.fillRect(0, Y(-0.1), w, Y(-2.0) - Y(-0.1));
      c.fillStyle = '#f2d9a4'; c.fillRect(0, Y(-2.0), w, h - Y(-2.0));
    });
    R.wall = mesh(new THREE.PlaneGeometry(64, 3.2), new THREE.MeshBasicMaterial({ map: wall, toneMapped: false }), 0, -1.6, 0, g); R.wall.visible = false;
    // soft contact shadow under the reader
    const sh = ctex(128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(40,20,10,0.42)'); gr.addColorStop(1, 'rgba(40,20,10,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); });
    R.shadow = mesh(new THREE.PlaneGeometry(52, 52), new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false, clippingPlanes: cp }), 0, 0.02, 0, g);
    R.shadow.rotation.x = -Math.PI / 2; R.shadow.renderOrder = 5;
  }

  // the reader follows the team's design: a white rounded cover seated in a deep-red tray, the logo centred on top
  function rrShape(w, d, r) {
    const sh = new THREE.Shape(), x = -w / 2, y = -d / 2;
    sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + d - r); sh.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    sh.lineTo(x + r, y + d); sh.quadraticCurveTo(x, y + d, x, y + d - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y); return sh;
  }
  const BOARD_TOP = 1.7;
  function buildReader() {
    const MAROON = 0x5C1220, WHITE = 0xEDEBE8;
    // base: a deep-red tray with spring pins underneath
    const base = part('base'); base.userData.y0 = 0.45;
    const wall = rrShape(33, 33, 7.5); const inner = rrShape(30.4, 30.4, 6.2); wall.holes.push(inner);
    const wg = new THREE.ExtrudeGeometry(wall, { depth: 4.2, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 4, curveSegments: 48 }); wg.rotateX(-Math.PI / 2);
    const trayM = std(MAROON, { roughness: 0.4 });
    pickable(mesh(wg, trayM, 0, 0, 0, base), 'base');
    const floor = new THREE.ExtrudeGeometry(rrShape(31, 31, 6.6), { depth: 0.9, bevelEnabled: false, curveSegments: 48 }); floor.rotateX(-Math.PI / 2);
    pickable(mesh(floor, std(0x45101A, { roughness: 0.5 }), 0, 0, 0, base), 'base');
    R.pins = new THREE.Group(); base.add(R.pins);
    // sensor board: a dark circuit board with gold traces, carrying the switch(es) and the potentiostat
    const an = part('analog'); an.userData.y0 = 0.45;
    const pcb = ctex(512, 512, (c, w, h) => {
      c.fillStyle = '#1d2023'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(201,164,90,0.75)'; c.lineWidth = 2.2; c.lineCap = 'round';
      for (let i = 0; i < 70; i++) { let x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 3; k++) { if (Math.random() < 0.5) x += (Math.random() - 0.5) * 180; else y += (Math.random() - 0.5) * 180; c.lineTo(x, y); } c.stroke(); c.fillStyle = 'rgba(214,178,96,0.9)'; c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(214,178,96,0.85)'; for (let i = 0; i < 140; i++) c.fillRect(Math.random() * w, Math.random() * h, 5, 3);
    });
    pickable(mesh(new RoundedBoxGeometry(29, 0.8, 29, 2, 0.35), std(0xffffff, { map: pcb, roughness: 0.55 }), 0, BOARD_TOP - 0.4, 0, an), 'analog');
    const chipTex = (t) => ctex(256, 200, (c, w, h) => { c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, w, h); c.fillStyle = '#c9c9c9'; c.font = '600 40px Inter, sans-serif'; c.textAlign = 'center'; c.fillText(t, w / 2, h / 2 + 14); c.beginPath(); c.arc(26, 26, 9, 0, 7); c.fill(); });
    const chip = (w, h, d, x, z, text, name, parent) => {
      const g = new THREE.Group(); parent.add(g);
      const side = std(0x1b1c1e, { roughness: 0.6 }), top = std(0xffffff, { map: chipTex(text), roughness: 0.6 });
      const m = mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, side, side, side], x, BOARD_TOP + h / 2, z, g);
      m.userData.part = name; R.pick.push(m);
      const pinM = std(0xC9CCD1, { metalness: 0.8, roughness: 0.3 });
      for (let i = 0; i < 8; i++) for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.22, 0.12, 0.6), pinM, x - w / 2 + 0.5 + i * (w - 1) / 7, BOARD_TOP + 0.06, z + s * (d / 2 + 0.25), g);
      g.userData.chip = m; return g;
    };
    R.muxChip = chip(5.0, 1.0, 4.4, -4.6, 3.2, 'TMUX1108', 'mux', an).userData.chip;
    R.mux2 = chip(5.0, 1.0, 4.4, -4.6, -3.4, 'TMUX1108', 'mux', an); R.mux2.visible = false;
    R.afeChip = chip(4.0, 0.8, 4.0, 4.2, 3.2, 'AFE', 'afe', an).userData.chip;
    const goldC = std(0xD9B25A, { metalness: 0.85, roughness: 0.3 });
    for (const [x, z, c] of [[-0.6, -4, 0xB89A6A], [1.4, -5, 0x6b6b6b], [6.5, -2.4, 0x6b6b6b], [0.3, 7.5, 0xB89A6A], [-9.5, 8, 0x6b6b6b], [9.6, 8.6, 0xB89A6A], [9.4, -9, 0x6b6b6b], [-10.2, -9.5, 0xB89A6A], [11, 1.5, 0x6b6b6b]]) {
      mesh(new THREE.BoxGeometry(1.0, 0.5, 0.5), std(c), x, BOARD_TOP + 0.25, z, an);
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.22, 0.52, 0.52), goldC, x + s * 0.5, BOARD_TOP + 0.25, z, an);
    }
    const muxL = label('Switch · TMUX1108', 'part', () => select({ part: 'mux' })); muxL.position.set(-4.6, 4.0, 3.2); an.add(muxL); R.partLabels.push(muxL);
    const afeL = label('Potentiostat', 'part', () => select({ part: 'afe' })); afeL.position.set(4.2, 3.7, 3.2); an.add(afeL); R.partLabels.push(afeL);
    // microcontroller + Bluetooth module (XIAO-sized: 21 x 17.8 mm)
    const mcu = part('mcu'); mcu.userData.y0 = 0.45;
    pickable(mesh(new THREE.BoxGeometry(17.8, 1.0, 21), std(0x1F3A5F, { roughness: 0.5 }), 0, 3.4, 0, mcu), 'mcu');
    const can = std(0xD3D6DA, { metalness: 0.85, roughness: 0.28 });
    pickable(mesh(new THREE.BoxGeometry(10, 1.4, 10), can, 0, 4.6, -2.5, mcu), 'mcu');
    pickable(mesh(new RoundedBoxGeometry(9, 2.6, 7.4, 2, 0.6), can, 0, 5.2, 6.8, mcu), 'mcu');
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.9, 1.04, 1.4), goldC, s * 8.6, 3.4, -7.6 + i * 2.54, mcu);
    // battery: a small rechargeable cell with gold ends
    const bat = part('battery'); bat.userData.y0 = 0.45;
    pickable(mesh(new RoundedBoxGeometry(18, 3.0, 8, 3, 1.1), std(0xE9E8E4, { metalness: 0.35, roughness: 0.32 }), 0, 6.0, 0, bat), 'battery');
    for (const sx of [-1, 1]) pickable(mesh(new RoundedBoxGeometry(1.2, 3.1, 8.1, 2, 0.4), goldC, sx * 9.3, 6.0, 0, bat), 'battery');
    // cover: a soft white rounded square seated in the tray, with the logo
    const top = part('top'); top.userData.y0 = 0.45;
    const coverM = std(WHITE, { roughness: 0.42 });
    pickable(mesh(new RoundedBoxGeometry(31.6, 8.4, 31.6, 10, 3.9), coverM, 0, 8.0, 0, top), 'top');
    const lip = new THREE.ExtrudeGeometry(rrShape(30.2, 30.2, 6.1), { depth: 1.6, bevelEnabled: false, curveSegments: 48 }); lip.rotateX(-Math.PI / 2);
    pickable(mesh(lip, coverM, 0, 3.3, 0, top), 'top');
    const logo = new THREE.TextureLoader().load('assets/badri-mark.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; });
    const lm = mesh(new THREE.PlaneGeometry(8.4, 8.4), new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.45, depthWrite: false }), 0, 12.215, 0, top); lm.rotation.x = -Math.PI / 2;
    const ledG = new THREE.CapsuleGeometry(0.42, 2.3, 4, 14); ledG.rotateZ(Math.PI / 2);
    R.led = mesh(ledG, new THREE.MeshStandardMaterial({ color: 0xC0242C, emissive: 0xE0303A, emissiveIntensity: 0.3, roughness: 0.35 }), -3.4, 12.08, 6.4, top);
    R.led.scale.y = 0.55; R.led.visible = false;   // Rayan 16:42: no line on the cover
  }

  function clearGroup(g) { for (const c of [...g.children]) { if (c.isCSS2DObject) continue; g.remove(c); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }

  function buildDesign() {
    const L = LAYOUT[design], p = L.pitch, nr = L.rows.length, nc = L.rows[0].length, W = nc * p, Dp = nr * p;
    const cp = [R.clip, R.clipBack];
    R.pick = R.pick.filter(m => !m.userData.design);
    for (const l of [...R.skinLabels, ...R.needleLabels]) l.parent && l.parent.remove(l);
    R.skinLabels = []; R.needleLabels = []; R.needles = []; R.chan = {}; R.nets = {};
    for (const n of ['array', 'flex', 'adhesive']) { if (!R.g[n]) part(n); else clearGroup(R.g[n]); }
    const arr = R.g.array, flex = R.g.flex, adh = R.g.adhesive;
    const dz = (r) => (r - (nr - 1) / 2) * p, dx = (c) => (c - (nc - 1) / 2) * p;
    R.frontZ = dz(nr - 1); R.W = W;
    // base plate
    const plate = mesh(new RoundedBoxGeometry(W, 0.35, Dp, 2, 0.25), std(0xDCEBEF, { roughness: 0.25, transparent: true, opacity: 0.8 }), 0, 0.175, 0, arr);
    plate.userData.design = true; pickable(plate, 'array');
    // needles + channel map
    const cone = new THREE.ConeGeometry(0.15, 0.7, 24); cone.rotateX(Math.PI); cone.translate(0, -0.35, 0);
    const count = {};
    L.rows.forEach((row, r) => row.forEach((k, c) => {
      if (!k) return;
      const K = KINDS[k], x = dx(c), z = dz(r);
      const o = K.we ? { metalness: 0.35, roughness: 0.38 } : k === 're' ? { metalness: 0.9, roughness: 0.28 } : k === 'ce' ? { metalness: 0.5, roughness: 0.45 } : { roughness: 0.2, transparent: true, opacity: 0.75 };
      const m = mesh(cone, std(K.color, Object.assign({ emissive: K.color, emissiveIntensity: 0 }, o)), x, 0, z, arr);
      m.userData = { kind: k, needle: m, design: true }; R.pick.push(m); R.needles.push(m);
      if (K.we) {
        count[k] = (count[k] || 0) + 1;
        const set = design === 'robust' ? (r === nr - 1 ? 0 : 1) : 0;
        const ch = WE.indexOf(k) + set * 5;
        m.userData.ch = ch; R.chan[ch] = m;
        const net = 'we' + ch; (R.nets[net] = R.nets[net] || { pts: [], kind: k }).pts.push([x, z]);
      } else if (k === 're' || k === 'ce') (R.nets[k] = R.nets[k] || { pts: [], kind: k }).pts.push([x, z]);
      // glow for the read cycle
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.isf.material.map, color: K.color, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(1.0, 1.0, 1); glow.position.set(x, -0.35, z); glow.renderOrder = 9; arr.add(glow); m.userData.glow = glow;
      if (r === nr - 1) { const nl = label(K.short, 'needle', () => select({ kind: k, mesh: m }), hex(K.color)); nl.position.set(x, -1.0, z); arr.add(nl); R.needleLabels.push(nl); }
    }));
    // flexible backing with gold traces and contact pads
    const Df = Dp + 3.4, fz = -1.2;
    const fm = mesh(new RoundedBoxGeometry(W + 1.0, 0.1, Df, 2, 0.05), std(0xC48A35, { roughness: 0.5, transparent: true, opacity: 0.92 }), 0, 0.4, fz, flex);
    fm.userData.design = true; pickable(fm, 'flex');
    const order = ['re', ...Object.keys(R.nets).filter(n => n.startsWith('we')).sort((a, b) => +a.slice(2) - +b.slice(2)), 'ce'];
    const pz = -Dp / 2 - 1.55, sp = Math.min(1.25, (W - 0.6) / order.length);
    R.padPos = [];
    order.forEach((net, i) => {
      const px = (i - (order.length - 1) / 2) * sp; R.padPos.push([px, pz]);
      const nk = R.nets[net].kind;
      const tm = std(0xD9B25A, { metalness: 0.9, roughness: 0.3, emissive: KINDS[nk].color, emissiveIntensity: 0 });
      R.nets[net].mat = tm;
      mesh(new THREE.BoxGeometry(sp * 0.7, 0.03, 0.9), tm, px, 0.465, pz, flex);
      for (const [x, z] of R.nets[net].pts) {
        const a = new THREE.Vector2(x, z), b = new THREE.Vector2(px, pz), len = a.distanceTo(b);
        const t = mesh(new THREE.BoxGeometry(0.1, 0.02, len), tm, (x + px) / 2, 0.46, (z + pz) / 2, flex);
        t.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
        mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), std(KINDS[nk].color, { metalness: 0.5, roughness: 0.35 }), x, 0.47, z, flex);
      }
    });
    // adhesive ring with a window for the backing
    const ring = rrShape(46, 46, 11);
    const hw = (W + 1.6) / 2, hd = (Df + 0.6) / 2, cz = -fz;
    const hole = new THREE.Path(); hole.moveTo(-hw, cz - hd); hole.lineTo(hw, cz - hd); hole.lineTo(hw, cz + hd); hole.lineTo(-hw, cz + hd); hole.lineTo(-hw, cz - hd); ring.holes.push(hole);
    const ag = new THREE.ExtrudeGeometry(ring, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.5, bevelSegments: 3, curveSegments: 72 }); ag.rotateX(-Math.PI / 2);
    const fabric = ctex(256, 256, (c, w, h) => { c.fillStyle = '#E4D8C4'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(128,108,84,0.32)'; for (let y = 8; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) { c.beginPath(); c.arc(x, y, 2.1, 0, 7); c.fill(); } });
    fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping; fabric.repeat.set(0.1, 0.1);
    const am = mesh(ag, std(0xffffff, { map: fabric, roughness: 0.95, clippingPlanes: cp }), 0, 0, 0, adh);
    am.userData.design = true; pickable(am, 'adhesive', true);
    // spring pins under the reader base, lined up with the pads
    clearGroup(R.pins);
    for (const [x, z] of R.padPos) mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 12), std(0xD9B25A, { metalness: 0.9, roughness: 0.3 }), x, 0.1, z, R.pins);
    // labels sit to the right of each part
    const lp = { array: [W / 2 + 1.2, 0.2, 0], flex: [W / 2 + 1.2, 0.45, fz], adhesive: [23.5, 0.25, 0], base: [17.6, 2.1, 0], analog: [15.2, 1.3, 0], mcu: [9.5, 3.4, 0], battery: [10.4, 6.0, 0], top: [16.4, 8.0, 0] };
    for (const [n, v] of Object.entries(lp)) if (R.g[n].userData.label) R.g[n].userData.label.position.set(...v);
    // skin-view labels
    const z = R.frontZ + 0.2, rx = W / 2 + 0.75;
    const sl = (text, y, cls) => { const l = label(text, 'skin right ' + (cls || '')); l.position.set(rx, y, z); R.g.skin.add(l); R.skinLabels.push(l); };
    sl('Epidermis', -0.06); sl('Needle tips · 0.7 mm', -0.7, 'tip'); sl('Dermis · interstitial fluid', -1.2); sl('Larger blood vessels', -1.7); sl('Fat', -2.6);
    if (R.tipLine) R.tipLine.parent.remove(R.tipLine);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-W / 2 - 0.4, -0.7, z), new THREE.Vector3(W / 2 + 0.6, -0.7, z)]);
    R.tipLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0x1C5469, dashSize: 0.18, gapSize: 0.12, depthTest: false, transparent: true }));
    R.tipLine.computeLineDistances(); R.tipLine.renderOrder = 10; R.g.skin.add(R.tipLine);
    cyc.seq = design === 'lean' ? [0, 1, 2, 3, 4, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15];
    R.mux2.visible = design === 'robust';
    if (selected && selected.kind) selected = null;
    applyMode(true);
  }

  /* ---------- views, camera, selection ---------- */
  // each view: what must fit on screen (width x height in mm), where to look, and from which direction
  function fovFor(m) { const narrow = R.camera.aspect < 0.8; return m === 'skin' ? (narrow ? 18 : 12) : (narrow ? 42 : 30); }
  function presets() {
    const asp = R.camera.aspect, desk = R.hostW > 900, W = R.W;
    const fit = (w, h, fov) => { const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)); return Math.max(h / 2 / t, w / (2 * t * asp)); };
    const shot = (m, w, h, t, dir) => { const d = new THREE.Vector3(...dir).normalize().multiplyScalar(fit(w, h, fovFor(m))); return { t, p: [t[0] + d.x, t[1] + d.y, t[2] + d.z], fov: fovFor(m) }; };
    const phone = R.hostW < 560, lab = desk ? 7.0 : phone ? 0.6 : 5.6;   // room for the layer labels on the right (and the card on the left, on wide screens)
    return {
      whole: shot('whole', desk ? 92 : 56, 56, [0, 4, 0], [36, 31, 46]),
      exploded: shot('exploded', desk ? 66 : 46, 60, [0, 22, 0], [95, 30, 110]),
      skin: shot('skin', W + lab + (desk ? 3.2 : 0.6), 7.6, [phone ? 0 : 2.2, -1.3, R.frontZ], [0.1, 0, 1])
    };
  }
  function flyCam(instant) {
    const pr = presets()[mode], t = new THREE.Vector3(...pr.t), p = new THREE.Vector3(...pr.p);
    if (instant || reduceMotion) { R.ctl.target.copy(t); R.camera.position.copy(p); anim.fov = pr.fov; setFov(); anim.cam = null; R.ctl.update(); return; }
    anim.cam = { t0: R.ctl.target.clone(), p0: R.camera.position.clone(), f0: anim.fov, t, p, f: pr.fov, start: performance.now(), dur: tour.on ? 550 : 1100 };
  }
  // a closer shot of one part (tour), from the same side as the exploded view
  const PART_Y = { adhesive: 0.25, array: 0.1, flex: 0.4, base: 2.2, analog: 1.6, mcu: 4.0, battery: 6.0, top: 8.0 };
  function partShot(name) {
    const desk = R.hostW > 900, phone = R.hostW < 560, fov = fovFor(mode);
    const fit = (w, h) => { const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)); return Math.max(h / 2 / t, w / (2 * t * R.camera.aspect)); };
    if (name === 'top' && mode !== 'exploded') {
      const tg = [desk ? 2 : 0, 1, 0], d = new THREE.Vector3(30, 44, 40).normalize().multiplyScalar(fit(desk ? 100 : 60, 58));
      return { t: tg, p: [tg[0] + d.x, tg[1] + d.y, tg[2] + d.z], fov };
    }
    const off = EXPLODE[name] || 0, y = (R.g[name] ? R.g[name].userData.y0 : 0) + off + (PART_Y[name] || 0);
    const tg = [desk ? 3 : 0, y - (phone ? 3 : 6), 0], d = new THREE.Vector3(95, 34, 110).normalize().multiplyScalar(fit(desk ? 88 : phone ? 50 : 62, phone ? 46 : 40));
    return { t: tg, p: [tg[0] + d.x, tg[1] + d.y, tg[2] + d.z], fov };
  }
  function flyShot(pr) {
    if (reduceMotion) { R.ctl.target.set(...pr.t); R.camera.position.set(...pr.p); anim.fov = pr.fov; setFov(); anim.cam = null; R.ctl.update(); return; }
    anim.cam = { t0: R.ctl.target.clone(), p0: R.camera.position.clone(), f0: anim.fov, t: new THREE.Vector3(...pr.t), p: new THREE.Vector3(...pr.p), f: pr.fov, start: performance.now(), dur: tour.on ? 550 : 1100 };
  }
  function setFov() { if (Math.abs(R.camera.fov - anim.fov) > 1e-3) { R.camera.fov = anim.fov; R.camera.updateProjectionMatrix(); } }
  function applyMode(instant) {
    anim.kTo = mode === 'exploded' ? 1 : 0;
    anim.clipTo = mode === 'skin' ? R.frontZ + 0.3 : 60;
    R.clipBack.constant = mode === 'skin' ? -(R.frontZ - 2.6) : 60;
    R.wall.visible = mode === 'skin'; R.wall.position.z = R.frontZ - 2.55;
    for (const n of READER) R.g[n].visible = mode !== 'skin';
    R.shadow.visible = mode !== 'skin';
    for (const l of R.partLabels) l.visible = mode === 'exploded';
    for (const l of R.skinLabels) l.visible = mode === 'skin';
    for (const l of R.needleLabels) l.visible = mode === 'skin';
    R.tipLine.visible = mode === 'skin';
    if (instant || reduceMotion) { anim.k = anim.kTo; anim.clip = anim.clipTo; }
    flyCam(instant);
    for (const b of $('pView').children) b.setAttribute('aria-pressed', String(b.dataset.v === mode));
    for (const b of $('pDesign').children) b.setAttribute('aria-pressed', String(b.dataset.v === design));
    stats(); caption();
  }
  function setMode(m) { if (m === mode) return; mode = m; applyMode(false); }
  function setDesign(d) { if (d === design) return; design = d; stopCycle(); buildDesign(); }

  const hl = (m, on, color) => { const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mt of mats) { if (!mt.emissive) continue; if (on) { mt.emissive.setHex(color); mt.emissiveIntensity = 0.35; } else { mt.emissiveIntensity = 0; } } };
  function select(s) {
    // clear old highlight
    for (const m of R.needles) { if (!cyc.on) setGlow(m, 0); }
    for (const n of Object.keys(PARTS)) if (R.g[n]) R.g[n].traverse(o => { if (o.isMesh) hl(o, false); });
    for (const l of [...R.partLabels, ...R.needleLabels]) l.element.classList.remove('sel');
    selected = s;
    if (s) stopCycle();
    if (s && s.kind) {
      if (mode === 'whole') { mode = 'skin'; applyMode(false); }
      for (const m of R.needles) if (m.userData.kind === s.kind) setGlow(m, 0.8);
      for (const l of R.needleLabels) if (l.element.textContent === KINDS[s.kind].short) l.element.classList.add('sel');
    } else if (s && s.part) {
      if (mode === 'whole' && !['top', 'adhesive'].includes(s.part)) { mode = 'exploded'; applyMode(false); }
      const target = s.part === 'mux' ? [R.muxChip, R.mux2.userData.chip] : s.part === 'afe' ? [R.afeChip] : null;
      if (target) target.forEach(m => hl(m, true, 0x2A8FB0));
      else R.g[s.part].traverse(o => { if (o.isMesh) hl(o, true, 0x2A6F8A); });
      const l = R.g[s.part] && R.g[s.part].userData.label; if (l) l.element.classList.add('sel');
      for (const pl of R.partLabels) if ((s.part === 'mux' && pl.element.textContent.startsWith('Switch')) || (s.part === 'afe' && pl.element.textContent === 'Potentiostat')) pl.element.classList.add('sel');
    }
    for (const li of $('pLegend').children) li.setAttribute('aria-pressed', String(!!(s && s.kind === li.dataset.k)));
    caption();
  }
  function setGlow(m, v) { m.material.emissiveIntensity = v * 0.9; m.userData.glow.material.opacity = v; }

  /* ---------- read cycle (TMUX1108 address pins) ---------- */
  // channel ch: 0-7 on switch 1, 8-15 on switch 2 (robust design only)
  function bits(ch) { const c = ch % 8; return [(c >> 2) & 1, (c >> 1) & 1, c & 1]; }
  function chName(ch) { return (design === 'robust' ? `Switch ${ch < 8 ? 1 : 2} · ` : '') + 'S' + (ch % 8 + 1); }
  function chInfo(ch) {
    const m = R.chan[ch];
    if (!m) return { name: 'Baseline', sig: 'base', how: 'No needle on this channel', line: 'This channel has no needle on it. It reads the circuit’s own offset, so slow drift can be subtracted from the five markers.' };
    const K = KINDS[m.userData.kind], second = design === 'robust' && ch >= 5;
    const line = `${K.how}.${second ? ' Second needle for the same marker: the two must agree, which catches a failing sensor or drift.' : ''}${design === 'robust' && ch === 8 ? ' Ten sensor needles need a second 8-channel switch.' : ''}`;
    return { name: K.short + (design === 'robust' ? (second ? ' · needle 2' : ' · needle 1') : ''), sig: K.sig, how: K.how, line, color: K.color };
  }
  function startCycle() { select(null); cyc.on = true; cyc.i = -1; cyc.at = 0; $('pCycle').textContent = 'Stop the read cycle'; $('pCycle').setAttribute('aria-pressed', 'true'); $('pRead').hidden = false; if (mode === 'whole') setMode('skin'); }
  function stopCycle() { if (!R) return; cyc.on = false; $('pCycle').textContent = 'Run a read cycle'; $('pCycle').setAttribute('aria-pressed', 'false'); $('pRead').hidden = true; for (const m of R.needles) setGlow(m, 0); for (const n of Object.values(R.nets)) n.mat.emissiveIntensity = 0; hl(R.muxChip, false); hl(R.mux2.userData.chip, false); caption(); }
  function stepCycle() {
    cyc.i = (cyc.i + 1) % cyc.seq.length;
    const ch = cyc.seq[cyc.i], info = chInfo(ch), b = bits(ch);
    for (const m of R.needles) setGlow(m, 0);
    for (const n of Object.values(R.nets)) n.mat.emissiveIntensity = 0;
    if (R.chan[ch]) { setGlow(R.chan[ch], 1); R.nets['we' + ch].mat.emissiveIntensity = 0.9; }
    hl(R.muxChip, ch < 8, 0x2A8FB0); hl(R.mux2.userData.chip, ch >= 8, 0x2A8FB0);
    R.led.material.emissiveIntensity = 2.2;
    $('pCh').textContent = 'S' + (ch % 8 + 1); $('pCh').title = chName(ch);
    $('pChName').textContent = (design === 'robust' ? `Switch ${ch < 8 ? 1 : 2} · ` : '') + info.name;
    $('pBits').innerHTML = ['A2', 'A1', 'A0'].map((n, i) => `<span class="bit" data-on="${b[i]}"><small>${n}</small>${b[i]}</span>`).join('');
    $('pSig').innerHTML = `<path d="${SIG[info.sig]}" fill="none" stroke="${info.color ? hex(info.color) : 'currentColor'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (!tour.on) setCaption(`${chName(ch)} · A2 A1 A0 = ${b.join(' ')}`, `Reading ${info.name.replace(' · ', ', ')}`, `${info.line} The switch settles for 30 ms before each reading.`);
  }

  /* ---------- guided tour ---------- */
  function tourGo(i) {
    tour.i = Math.max(0, Math.min(TOUR.length - 1, i)); tour.t = 0;
    const st = TOUR[tour.i];
    stopCycle();
    if (st.mode !== mode) { mode = st.mode; applyMode(false); }
    select(st.sel ? { part: st.sel } : null);
    if (st.cycle) startCycle();
    if (st.focus) flyShot(partShot(st.focus)); else flyCam(false);
    tourUI(); caption();
  }
  function tourStart() { tour.on = true; tour.paused = false; $('pTour').hidden = false; view.classList.add('touring'); tourGo(0); }
  function tourEnd() { if (!tour.on) return; tour.on = false; $('pTour').hidden = true; view.classList.remove('touring'); $('pTourCta').hidden = true; stopCycle(); select(null); tourUI(); caption(); }
  function tourPause(v) { if (!tour.on) return; tour.paused = v === undefined ? !tour.paused : v; if (!tour.paused && TOUR[tour.i].last && tour.t >= tourDur(TOUR[tour.i])) tourGo(0); tourUI(); }
  function tourUI() {
    $('pTourBtn').textContent = tour.on ? 'End the tour' : 'Take the guided tour ▶';
    $('pTourBtn').setAttribute('aria-pressed', String(tour.on));
    if (!tour.on) return;
    const segs = $('pSeg');
    if (segs.children.length !== TOUR.length) segs.innerHTML = TOUR.map(() => '<i><b></b></i>').join('');
    [...segs.children].forEach((el, k) => { el.firstChild.style.width = k < tour.i ? '100%' : k > tour.i ? '0%' : `${Math.min(100, (tour.t / tourDur(TOUR[tour.i])) * 100)}%`; });
    const done = TOUR[tour.i].last && tour.t >= tourDur(TOUR[tour.i]);
    $('pPlay').textContent = done ? 'Replay' : tour.paused ? 'Play' : 'Pause';
    $('pPrev').disabled = tour.i === 0; $('pNext').disabled = tour.i === TOUR.length - 1;
    $('pTourCta').hidden = !TOUR[tour.i].last;
  }
  function tourTick(dt) {
    if (!tour.on || tour.paused) return;
    const st = TOUR[tour.i], d = tourDur(st);
    tour.t += dt;
    if (tour.t >= d) { if (st.last) { tour.t = d; tour.paused = true; } else { tourGo(tour.i + 1); return; } }
    const seg = $('pSeg').children[tour.i]; if (seg) seg.firstChild.style.width = `${Math.min(100, (tour.t / d) * 100)}%`;
    if (tour.paused) tourUI();
  }

  /* ---------- words ---------- */
  function setCaption(chip, h, p) { $('pChip').textContent = chip; $('pHead').textContent = h; $('pLine').textContent = p; }
  function caption() {
    if (tour.on) { const st = TOUR[tour.i]; setCaption(`Guided tour · ${tour.i + 1} of ${TOUR.length}`, st.h, tourText(st)); return; }
    if (cyc.on) return;
    if (selected && selected.kind) { const K = KINDS[selected.kind]; setCaption(K.we ? `${K.how}` : K.how, K.h, K.p + (K.we ? ` Read on ${chName(WE.indexOf(selected.kind))}${design === 'robust' ? ` and ${chName(WE.indexOf(selected.kind) + 5)}` : ''}.` : '')); return; }
    if (selected && selected.part) { const P = PARTS[selected.part]; setCaption(P.h.includes('disposable') ? 'Disposable' : 'Reusable reader', P.h, P.p()); return; }
    const V = VIEWS[mode]; setCaption(V.chip, V.h, V.p);
  }
  function stats() {
    const L = LAYOUT[design];
    $('pStats').innerHTML = [['Needles', L.n], ['Sensor needles', design === 'lean' ? '5' : '10 · in pairs'], ['Footprint', L.area], ['Needle length', '0.7 mm']]
      .map(([k, v]) => `<div><span class="k">${k}</span><b>${v}</b></div>`).join('');
  }

  /* ---------- per-frame ---------- */
  function resize() {
    if (!R) return;
    const r = hostEl.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    R.renderer.setSize(w, h); R.labels.setSize(w, h);
    R.camera.aspect = w / h; R.hostW = w;
    if (w > 900) R.camera.setViewOffset(w, h, -w * 0.12, 0, w, h); else R.camera.setViewOffset(w, h, 0, -h * (w < 560 ? 0.1 : 0.04), w, h);
    R.camera.updateProjectionMatrix();
    if (!anim.cam) flyCam(true);
  }
  function frame(now) {
    if (!on || !R) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // explode + clip easing
    const ease = reduceMotion ? 1 : 1 - Math.pow(0.0025, dt);
    anim.k += (anim.kTo - anim.k) * ease; anim.clip += (anim.clipTo - anim.clip) * ease;
    R.clip.constant = anim.clip;
    for (const [n, off] of Object.entries(EXPLODE)) if (R.g[n]) R.g[n].position.y = R.g[n].userData.y0 + off * anim.k;
    if (anim.cam) {
      const a = anim.cam, t = Math.min(1, (now - a.start) / a.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      R.ctl.target.lerpVectors(a.t0, a.t, e); R.camera.position.lerpVectors(a.p0, a.p, e); anim.fov = a.f0 + (a.f - a.f0) * e; setFov();
      if (t >= 1) anim.cam = null;
    }
    // interstitial fluid drift
    if (!reduceMotion) {
      const pa = R.isf.geometry.attributes.position, A = pa.array, tt = now * 0.0004;
      for (let i = 0; i < A.length; i += 3) { A[i] += Math.sin(tt + i) * 0.004; A[i + 1] += Math.cos(tt * 1.3 + i * 0.7) * 0.0015; if (A[i + 1] > -0.13) A[i + 1] = -1.9; if (A[i + 1] < -1.95) A[i + 1] = -0.14; }
      pa.needsUpdate = true;
    }
    tourTick(dt);
    // read cycle
    if (cyc.on) { cyc.at -= dt; if (cyc.at <= 0) { stepCycle(); cyc.at = tour.on ? 0.28 : 1.5; } }
    R.led.material.emissiveIntensity += ((cyc.on ? 0.6 : 0.3) - R.led.material.emissiveIntensity) * Math.min(1, dt * 4);
    R.ctl.update();
    R.renderer.render(R.scene, R.camera); R.labels.render(R.scene, R.camera);
  }

  /* ---------- panel ---------- */
  function opts(el, items, cur, onPick) {
    el.innerHTML = '';
    for (const [v, text] of items) { const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = text; b.setAttribute('aria-pressed', String(v === cur)); b.addEventListener('click', () => onPick(v)); el.appendChild(b); }
  }
  opts($('pDesign'), [['lean', 'Lean · 11 needles'], ['robust', 'Robust · 16']], design, (d) => { tourEnd(); setDesign(d); });
  opts($('pView'), Object.entries(VIEWS).map(([k, v]) => [k, v.label]), mode, (m) => { tourEnd(); select(null); setMode(m); });
  for (const k of LEGEND) {
    const K = KINDS[k], li = document.createElement('button'); li.type = 'button'; li.dataset.k = k; li.setAttribute('aria-pressed', 'false');
    li.innerHTML = `<i style="background:${hex(K.color)}"></i>${K.short}`;
    li.addEventListener('click', () => { tourEnd(); select(selected && selected.kind === k ? null : { kind: k }); });
    $('pLegend').appendChild(li);
  }
  $('pCycle').addEventListener('click', () => { if (!R) return; tourEnd(); cyc.on ? stopCycle() : startCycle(); });
  $('pTourBtn').addEventListener('click', () => { if (!R) return; tour.on ? tourEnd() : tourStart(); });
  $('pPrev').addEventListener('click', () => { tour.paused = false; tourGo(tour.i - 1); });
  $('pNext').addEventListener('click', () => { tour.paused = false; tourGo(tour.i + 1); });
  $('pPlay').addEventListener('click', () => tourPause());
  $('pClose').addEventListener('click', () => tourEnd());
  $('pTourCta').addEventListener('click', () => { tourEnd(); location.hash = '#checkup'; });

  return {
    show() { if (!R) init(); on = true; view.hidden = false; last = performance.now(); resize(); applyMode(true); },
    hide() { on = false; view.hidden = true; if (R) { tourEnd(); stopCycle(); } },
    frame,
    key(e) {
      if (tour.on) {
        if (e.key === ' ') { e.preventDefault(); tourPause(); }
        else if (e.key === 'ArrowRight') { tour.paused = false; tourGo(tour.i + 1); }
        else if (e.key === 'ArrowLeft') { tour.paused = false; tourGo(tour.i - 1); }
        else if (e.key === 'Escape') tourEnd();
        return;
      }
      if (e.key === 't' || e.key === 'T') { tourStart(); return; }
      if (e.key === ' ') { e.preventDefault(); cyc.on ? stopCycle() : startCycle(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const ks = Object.keys(VIEWS), i = ks.indexOf(mode); select(null); setMode(ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]); }
      else if (e.key === 'Escape') select(null);
    },
    get state() { return { design, mode, selected, cycling: cyc.on, tour: tour.on ? { step: tour.i, of: TOUR.length, paused: tour.paused } : null }; },
    setMode, setDesign, select, startCycle, stopCycle, tourStart, tourEnd, tourGo
  };
})();
