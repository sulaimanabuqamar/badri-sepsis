/* ======================= REALISTIC PEOPLE =======================
   Rigged humans from the Microsoft Rocketbox Avatar Library (MIT licence, github.com/microsoft/Microsoft-Rocketbox):
   meshes converted from the original FBX to GLB (skeleton kept, textures loaded separately) + motion-captured clips (idle breathing, walking, sitting, talking). Textures were re-encoded to 1024 px WebP.
   The primitive mannequins stay as a fallback and are hidden once an avatar has loaded. */
const ASSET = 'assets/';
const AV_FILES = {
  nurse1: ['Medical_Female_01', 'f'], nurse2: ['Medical_Male_01', 'm'], doctor: ['Medical_Female_02', 'f'], anaes: ['Medical_Male_04', 'm'],
  er: ['Male_Adult_21', 'm'], checkup: ['Female_Adult_06', 'f'], healthy: ['Female_Adult_02', 'f'], try: ['Male_Adult_14', 'm'],
  by0: ['Male_Adult_03', 'm'], by1: ['Female_Adult_10', 'f']
};
const CLIP = { idle: 'idle_breathe_01', walk: 'walk_neutral_01', walkFast: 'walk_fast_01', sit: 'sit_chair_breathe_01', sitStaff: 'sit_chair_idle_neutral_01', talk: 'gestic_talk_neutral_01' };
const PING = new Set(['sit_chair_idle_neutral_01', 'gestic_talk_neutral_01']);   // trimmed clips loop back and forth
const STAFF = new Set(['nurse1', 'nurse2', 'doctor', 'anaes']);

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const texCache = {};
function avTex(name, srgb) {
  if (!texCache[name]) {
    const t = texLoader.load(ASSET + 'tex/' + name + '.webp');
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    texCache[name] = t;
  }
  return texCache[name];
}
function avatarMaterial(name) {
  const pre = name.split('_')[0], part = name.split('_')[1];
  // parts Rocketbox ships without a texture: give them plain materials instead of sampling the body texture
  if (part === 'keffiyeh') return new THREE.MeshPhysicalMaterial({ name, color: 0xf6f4f0, roughness: 0.88, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
  if (part === 'protection') return new THREE.MeshStandardMaterial({ name, color: 0xeef2f3, roughness: 0.92, side: THREE.DoubleSide });
  if (part === 'stetoskop') return new THREE.MeshStandardMaterial({ name, color: 0x2a2d31, roughness: 0.45, metalness: 0.25 });
  if (part === 'opacity') return new THREE.MeshStandardMaterial({ name, map: avTex(pre + '_opacity_color', true), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.62 });
  if (part === 'head') return new THREE.MeshPhysicalMaterial({ name, map: avTex(pre + '_head_color', true), normalMap: avTex(pre + '_head_normal', false), roughness: 0.48, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffd4c0) });
  return new THREE.MeshPhysicalMaterial({ name, map: avTex(pre + '_body_color', true), normalMap: avTex(pre + '_body_normal', false), roughness: 0.82, sheen: 0.45, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xf4efe8) });
}
const clipCache = {};
function loadClip(gender, name) {
  const key = gender + '_' + name;
  if (!clipCache[key]) clipCache[key] = fetch(ASSET + 'anim/' + key + '.json').then(r => { if (!r.ok) throw new Error(key); return r.json(); }).then(d => {
    const times = Float32Array.from({ length: d.n }, (_, i) => i / d.fps);
    const tracks = d.tracks.filter(t => t.b.startsWith('Bip01')).map(t => {
      const w = t.p === 'p' ? 3 : 4, tt = t.v.length === w ? new Float32Array([0]) : times;
      const v = Float32Array.from(t.v);
      if (t.p === 'p') { for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; } return new THREE.VectorKeyframeTrack(t.b + '.position', tt, v); }
      return new THREE.QuaternionKeyframeTrack(t.b + '.quaternion', tt, v);
    });
    return new THREE.AnimationClip(name, d.dur, tracks);
  });
  return clipCache[key];
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
// rotate a bone about a WORLD axis, keeping its parent where it is
function rotWorld(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_q1);
  _q2.setFromAxisAngle(axis, angle);
  _q3.copy(_q1).invert().multiply(_q2).multiply(_q1);
  bone.quaternion.premultiply(_q3);
  bone.updateWorldMatrix(false, true);
}
// move a bone along a WORLD direction (metres)
function moveWorld(bone, dir, dist) {
  if (!bone || !dist) return;
  bone.getWorldPosition(_v1).addScaledVector(dir, dist);
  bone.parent.worldToLocal(_v1);
  bone.position.copy(_v1);
  bone.updateWorldMatrix(false, true);
}
// turn a bone so the segment bone→child points along a world direction
function aimBone(bone, child, dir, w = 1) {
  if (!bone || !child) return;
  child.updateWorldMatrix(true, false);
  bone.getWorldPosition(_v1); child.getWorldPosition(_v2);
  _v2.sub(_v1).normalize();
  _q2.setFromUnitVectors(_v2, dir);
  if (w < 1) _q2.slerp(_q3.identity(), 1 - w);
  bone.parent.getWorldQuaternion(_q1);
  _q3.copy(_q1).invert().multiply(_q2).multiply(_q1);
  bone.quaternion.premultiply(_q3);
  bone.updateWorldMatrix(false, true);
}

async function buildAvatar(key, P) {
  const [file, gender] = AV_FILES[key];
  const [grp, clips] = await Promise.all([
    fetch(ASSET + 'avatars/' + file + '.glb.json').then(r => { if (!r.ok) throw new Error(file); return r.json(); }).then(j => {
      const bin = atob(j.glb), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Promise((res, rej) => gltfLoader.parse(buf.buffer, '', (g) => res(g.scene), rej));
    }),
    Promise.all(Object.values(CLIP).map(c => loadClip(gender, c).catch(() => null)))
  ]);
  grp.animations = [];
  grp.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => avatarMaterial(m.name));
    o.material = mats.length === 1 ? mats[0] : mats;
  });
  const holder = new THREE.Group(), scaler = new THREE.Group();
  scaler.scale.setScalar(0.01);          // centimetres → metres
  scaler.add(grp); holder.add(scaler); P.g.add(holder);
  const bone = (n) => grp.getObjectByName(n);
  const B = {
    root: bone('Bip01'), pelvis: bone('Bip01_Pelvis'), spine1: bone('Bip01_Spine1'), spine2: bone('Bip01_Spine2'), neck: bone('Bip01_Neck'), head: bone('Bip01_Head'),
    lEye: bone('Bip01_LEye'), rEye: bone('Bip01_REye'), jaw: bone('Bip01_MJaw'),
    lidTL: bone('Bip01_LEyeBlinkTop'), lidTR: bone('Bip01_REyeBlinkTop'), lidBL: bone('Bip01_LEyeBlinkBottom'), lidBR: bone('Bip01_REyeBlinkBottom'),
    thighL: bone('Bip01_L_Thigh'), thighR: bone('Bip01_R_Thigh'), calfL: bone('Bip01_L_Calf'), calfR: bone('Bip01_R_Calf'), footL: bone('Bip01_L_Foot'), footR: bone('Bip01_R_Foot'),
    armR: bone('Bip01_R_UpperArm'), foreR: bone('Bip01_R_Forearm'), armL: bone('Bip01_L_UpperArm'), foreL: bone('Bip01_L_Forearm'), handL: bone('Bip01_L_Hand'), handR: bone('Bip01_R_Hand')
  };
  const mixer = new THREE.AnimationMixer(grp);
  const actions = {};
  Object.keys(CLIP).forEach((k, i) => {
    if (!clips[i]) return;
    const a = mixer.clipAction(clips[i]);
    if (PING.has(CLIP[k])) a.setLoop(THREE.LoopPingPong, Infinity);
    actions[k] = a;
  });
  const faceRest = [B.lEye, B.rEye, B.jaw, B.lidTL, B.lidTR, B.lidBL, B.lidBR].filter(Boolean).map(b => [b, b.quaternion.clone(), b.position.clone()]);
  // bones we bend after the mixer; their clean (animation-only) pose is restored before every mixer update,
  // because the mixer skips writing a value that has not changed since its last write
  const modBones = [B.spine1, B.spine2, B.neck, B.head, B.thighL, B.thighR, B.calfL, B.calfR, B.foreL, B.foreR].filter(Boolean);
  const av = { faceRest, modBones, clean: modBones.map(b => b.quaternion.clone()), key, gender, grp, holder, scaler, B, mixer, actions, cur: null, blinkT: 2 + Math.random() * 3, blink: 0, breath: Math.random() * 6, look: new THREE.Vector2(), jaw: 0, phase: Math.random() * 10 };
  // stand in the idle pose, then find which way the face points and how high the pelvis sits
  if (actions.idle) { actions.idle.play(); av.cur = 'idle'; }
  mixer.update(0);
  holder.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
  const eyeMid = B.lEye.getWorldPosition(new THREE.Vector3()).add(B.rEye.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5).applyMatrix4(inv);
  const headP = B.head.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  scaler.rotation.y = -Math.atan2(eyeMid.x - headP.x, eyeMid.z - headP.z);
  holder.updateWorldMatrix(true, true);
  av.pelvis0 = B.pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  av.eyeH = eyeMid.y;
  P.av = av;
  window.__avCount = (window.__avCount || 0) + 1;
  P.inner.visible = false;
  P.bubble.position.y = P.pose === 'sit' ? 1.55 : 2.02;
  // soft contact shadow under the feet
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), M.blob);
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.006; blob.renderOrder = 1; P.g.add(blob); av.blobMesh = blob;
  if (P === people.patient) attachPatch(P);
  applyPose(P, 0);
  return av;
}

function setClip(av, k, fade = 0.35) {
  if (av.cur === k || !av.actions[k]) return;
  const next = av.actions[k], prev = av.cur && av.actions[av.cur];
  next.reset().play();
  if (prev && fade > 0) next.crossFadeFrom(prev, fade, false); else if (prev) prev.stop();
  av.cur = k;
}

// called from applyPose() for people who have a loaded avatar
function avatarPose(P, dt) {
  const av = P.av, B = av.B, now = performance.now() / 1000;
  const talking = P.bubbleUntil && performance.now() < P.bubbleUntil;
  // choose the clip
  if (P.tween && !(P.tween.delay > 0)) {
    const sp = P.walkSpeed || 1.4;
    setClip(av, sp > 2.1 && av.actions.walkFast ? 'walkFast' : 'walk', 0.25);
    av.actions[av.cur].timeScale = sp / (av.cur === 'walkFast' ? 1.9 : 1.3);
  } else if (P.pose === 'sit') setClip(av, STAFF.has(av.key) ? 'sitStaff' : 'sit', dt ? 0.4 : 0);
  else if (P.pose === 'recline') setClip(av, 'idle', dt ? 0.4 : 0);
  else setClip(av, talking && av.actions.talk ? 'talk' : 'idle', dt ? 0.45 : 0);
  if (av.actions[av.cur] && !(P.tween && !(P.tween.delay > 0))) av.actions[av.cur].timeScale = 1;
  av.modBones.forEach((b, i) => b.quaternion.copy(av.clean[i]));
  av.mixer.update(dt);
  av.modBones.forEach((b, i) => av.clean[i].copy(b.quaternion));
  for (const [b, q, p] of av.faceRest) { b.quaternion.copy(q); b.position.copy(p); }

  // whole-body placement
  const h = av.holder;
  if (P.pose === 'recline') {
    const rx = -(Math.PI / 2 - P.recline);
    h.rotation.set(rx, 0, 0);
    _v1.copy(av.pelvis0).applyEuler(tmpE.set(rx, 0, 0));
    h.position.set(-_v1.x, -_v1.y, -_v1.z);
    av.blobMesh.visible = false;
  } else {
    h.rotation.set(0, 0, 0);
    h.position.set(0, P.pose === 'sit' ? AV_SIT_DY : 0, 0);
    av.blobMesh.visible = P.g.visible && !P.hidden;
  }
  h.updateWorldMatrix(true, true);

  // character axes in world space
  av.scaler.getWorldQuaternion(_q1);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(_q1);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q1);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q1);

  if (P.pose === 'recline') {
    // legs straight out along the mattress, towards the foot of the bed
    const legDir = new THREE.Vector3(0, 0, 1).applyQuaternion(P.g.getWorldQuaternion(new THREE.Quaternion())).add(new THREE.Vector3(0, -0.04, 0)).normalize();
    aimBone(B.thighL, B.calfL, legDir); aimBone(B.thighR, B.calfR, legDir);
    const shin = legDir.clone().add(new THREE.Vector3(0, 0.05, 0)).normalize();
    aimBone(B.calfL, B.footL, shin); aimBone(B.calfR, B.footR, shin);
    // forearms resting on the blanket
    const armDir = legDir.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    aimBone(B.foreL, B.handL, armDir, 0.6); aimBone(B.foreR, B.handR, armDir, 0.6);
  }
  // breathing: faster when the patient's breathing rate is high
  const rr = (P === people.patient && sim && sim.display.rr) ? sim.display.rr.v : 15;
  av.breath += dt * Math.PI * 2 * rr / 60;
  const br = Math.sin(av.breath);
  rotWorld(B.spine2, right, -0.018 * br * (P.pose === 'recline' ? 1.3 : 1));
  rotWorld(B.spine1, right, -0.008 * br);

  // head and eyes turn towards whoever is near, or the camera when it is close
  const target = lookTargetFor(P);
  if (target && B.head) {
    B.head.getWorldPosition(_v1);
    _v2.copy(target).sub(_v1).normalize();
    const yaw = Math.atan2(_v2.dot(right), _v2.dot(fwd)) * -1;
    const pitch = Math.asin(THREE.MathUtils.clamp(_v2.dot(up), -1, 1));
    const lim = P.pose === 'recline' ? 0.5 : 0.75;
    av.look.x += (THREE.MathUtils.clamp(-yaw, -lim, lim) - av.look.x) * Math.min(1, dt * 2.5);
    av.look.y += (THREE.MathUtils.clamp(pitch, -0.35, 0.35) - av.look.y) * Math.min(1, dt * 2.5);
  } else { av.look.x *= Math.max(0, 1 - dt * 2); av.look.y *= Math.max(0, 1 - dt * 2); }
  const sway = 0.04 * Math.sin(now * 0.37 + av.phase) + 0.025 * Math.sin(now * 0.83 + av.phase * 2);
  rotWorld(B.neck, up, (av.look.x + sway) * 0.4);
  rotWorld(B.head, up, (av.look.x + sway) * 0.6);
  rotWorld(B.head, right, -av.look.y * 0.6 - 0.02 * Math.sin(now * 0.29 + av.phase));
  const saccade = 0.05 * Math.sin(Math.floor(now * 0.9 + av.phase) * 12.9898);
  for (const e of [B.lEye, B.rEye]) { rotWorld(e, up, av.look.x * 0.35 + saccade); rotWorld(e, right, -av.look.y * 0.3); }

  // blinking
  av.blinkT -= dt;
  if (av.blinkT <= 0) { av.blink = 1; av.blinkT = 2.2 + Math.random() * 3.8; }
  const close = window.__lid != null ? window.__lid : av.blink > 0 ? Math.sin(Math.min(1, av.blink) * Math.PI) : 0;
  if (av.blink > 0) av.blink = Math.max(0, av.blink - dt / 0.18);
  const LID = window.__lidAmt != null ? window.__lidAmt : AV_LID;
  if (close > 0) { const down = up.clone().negate(); moveWorld(B.lidTL, down, LID * close); moveWorld(B.lidTR, down, LID * close); moveWorld(B.lidBL, up, LID * 0.3 * close); moveWorld(B.lidBR, up, LID * 0.3 * close); }

  // jaw moves while speaking
  const jawTarget = talking ? 0.07 + 0.07 * Math.abs(Math.sin(now * 11 + av.phase) * Math.sin(now * 4.3)) : 0;
  av.jaw += (jawTarget - av.jaw) * Math.min(1, dt * 18);
  if (av.jaw > 0.002) rotWorld(B.jaw, right, av.jaw);
}
const AV_SIT_DY = -0.04;   // tuned so hips rest on our 0.44 m seats
const AV_LID = 0.0105;
function lookTargetFor(P) {
  P.g.getWorldPosition(_v1);
  let best = null, bd = 2.6;
  for (const Q of Object.values(people)) {
    if (Q === P || !Q.g.visible || Q.hidden) continue;
    const d = Q.g.position.distanceTo(P.g.position);
    if (d < bd) { bd = d; best = Q; }
  }
  if (best) {
    const t = new THREE.Vector3();
    if (best.av && best.av.B.head) best.av.B.head.getWorldPosition(t); else t.copy(best.g.position).setY(best.pose === 'sit' ? 1.2 : 1.6);
    return t;
  }
  if (camera.position.distanceTo(P.g.position) < 4.5 && camera.position.y < 2.6) return camera.position.clone();
  return null;
}
function placePatchOnAvatar(P) {
  const av = P.av, B = av.B;
  scene.attach(patch);
  av.holder.updateWorldMatrix(true, true);
  const s = B.armR.getWorldPosition(new THREE.Vector3()), e = B.foreR.getWorldPosition(new THREE.Vector3());
  const d = e.clone().sub(s), len = d.length(); d.normalize();
  const point = s.clone().addScaledVector(d, len * 0.56);
  const c = B.spine2.getWorldPosition(new THREE.Vector3());
  const n = point.clone().sub(c); n.addScaledVector(d, -n.dot(d)); n.normalize();
  patch.position.copy(point).addScaledVector(n, 0.048);
  patch.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), n);
  patch.scale.setScalar(1);
  B.armR.attach(patch);
}

let avatarsStarted = false;
function startAvatars(caseId) {
  const order = ['nurse1', caseId, 'nurse2', 'doctor', 'anaes', 'by0', 'by1', ...['er', 'checkup', 'healthy', 'try'].filter(k => k !== caseId)];
  if (avatarsStarted) return; avatarsStarted = true;
  const target = (k) => STAFF.has(k) ? people[k] : k === 'by0' ? bystanders[0] : k === 'by1' ? bystanders[1] : patients[k];
  (async () => {
    for (const k of order) {
      const P = target(k);
      try { await buildAvatar(k, P); } catch (e) { window.__avFail = (window.__avFail || 0) + 1; console.warn('Avatar not loaded, keeping the simple figure:', k, e && e.message); }
    }
  })();
}
