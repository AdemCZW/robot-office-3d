// 人物模組：坐著打字的員工（createWorker）、提錢袋走路的送件員（createCourier）。介面見 README.md。
// 風格：大頭小身的卡通公仔。geometry / material 在模組層級共用。
// 2026-10-12 降低細緻度：分段數約減半、材質改 MeshStandard、只有大塊投影（效能優先）。
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const UNIFORM = { grid: 0x3b82f6, mart: 0xf97316, other: 0x94a3b8 };
const SKINS = [0xf8dcc8, 0xf0c39f, 0xdba47c, 0xb57a52, 0x845436, 0x5e3a26];
const HAIRS = [0x1f1a17, 0x4a2f22, 0x7a4a2a, 0xd9b25e, 0x9c4425, 0xbdb7b0];
const TIES = [0x1e293b, 0x7f1d1d, 0x14532d, 0x312e81];
const HAIR_STYLES = 5;   // 0 短髮 1 包頭 2 側分 3 捲髮 4 鮑伯

/* ---------- 共用資源 ---------- */
let L = null;
function lib(THREE) {
  if (L) return L;
  const G = {}, M = {};
  const geo = (k, f) => G[k] || (G[k] = f());
  const cloth = (c, k = 0.82) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(k), roughness: 0.78 });
  const mat = (k, f) => M[k] || (M[k] = f());
  // 水滴：Lathe 剖面
  const dropPts = [];
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; dropPts.push(new THREE.Vector2(Math.sin(a) * 0.022 * (i < 5 ? i / 5 : 1), -Math.cos(a) * 0.024 + (i < 5 ? (5 - i) / 5 * 0.02 : 0))); }
  L = {
    geo, mat,
    g: {
      pelvis: () => geo("pelvis", () => new RoundedBoxGeometry(0.32, 0.16, 0.26, 1, 0.06)),
      torso: () => geo("torso", () => new THREE.CapsuleGeometry(0.17, 0.2, 4, 12)),
      collar: () => geo("collar", () => new THREE.TorusGeometry(0.095, 0.035, 6, 14)),
      tie: () => geo("tie", () => new RoundedBoxGeometry(0.05, 0.16, 0.02, 1, 0.008)),
      badge: () => geo("badge", () => new THREE.BoxGeometry(0.06, 0.08, 0.012)),
      upperArm: () => geo("uarm", () => new THREE.CapsuleGeometry(0.056, 0.1, 3, 8).translate(0, -0.1, 0)),
      foreArm: () => geo("farm", () => new THREE.CapsuleGeometry(0.046, 0.12, 3, 8).translate(0, -0.1, 0)),
      hand: () => geo("hand", () => new THREE.SphereGeometry(0.052, 8, 6)),
      leg: (len, r) => geo("leg" + len + r, () => new THREE.CapsuleGeometry(r, len, 3, 8).translate(0, -(len / 2 + r * 0.6), 0)),
      shoe: () => geo("shoe", () => new RoundedBoxGeometry(0.12, 0.08, 0.2, 1, 0.03)),
      head: () => geo("head", () => new THREE.SphereGeometry(0.2, 18, 14)),
      ear: () => geo("ear", () => new THREE.SphereGeometry(0.042, 6, 5)),
      eye: () => geo("eye", () => new THREE.SphereGeometry(0.026, 8, 6)),
      cheek: () => geo("cheek", () => new THREE.SphereGeometry(0.032, 6, 4)),
      nose: () => geo("nose", () => new THREE.SphereGeometry(0.024, 6, 4)),
      arc: () => geo("arc", () => new THREE.TorusGeometry(0.04, 0.011, 4, 8, Math.PI)),
      flat: () => geo("flat", () => new THREE.CapsuleGeometry(0.01, 0.06, 2, 4).rotateZ(Math.PI / 2)),
      brow: () => geo("brow", () => new THREE.CapsuleGeometry(0.009, 0.042, 2, 4).rotateZ(Math.PI / 2)),
      lens: () => geo("lens", () => new THREE.TorusGeometry(0.042, 0.007, 4, 12)),
      bridge: () => geo("bridge", () => new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4).rotateZ(Math.PI / 2)),
      cap: () => geo("cap", () => new THREE.SphereGeometry(0.218, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.47)),
      ball: () => geo("ball", () => new THREE.SphereGeometry(1, 8, 6)),
      drop: () => geo("drop", () => new THREE.LatheGeometry(dropPts, 6)),
      bag: () => geo("bag", () => new THREE.SphereGeometry(0.105, 10, 8)),
      bagNeck: () => geo("bagNeck", () => new THREE.TorusGeometry(0.035, 0.012, 4, 8)),
      bagTuft: () => geo("bagTuft", () => new THREE.ConeGeometry(0.05, 0.07, 8, 1, true).rotateX(Math.PI)),
      dArc: () => geo("dArc", () => new THREE.TorusGeometry(0.022, 0.007, 4, 8, Math.PI * 1.2)),
      dBar: () => geo("dBar", () => new THREE.CylinderGeometry(0.005, 0.005, 0.1, 4)),
    },
    m: {
      skin: c => mat("skin" + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62 })),
      hair: c => mat("hair" + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
      cloth: c => mat("cloth" + c, () => cloth(c)),
      white: () => mat("white", () => cloth(0xfafaf7, 1)),
      pants: () => mat("pants", () => cloth(0x2e3442)),
      shoe: () => mat("shoe", () => new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.45 })),
      eye: () => mat("eye", () => new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.2 })),
      cheek: () => mat("cheek", () => new THREE.MeshStandardMaterial({ color: 0xff8a8a, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false })),
      mouth: () => mat("mouth", () => new THREE.MeshStandardMaterial({ color: 0x6b2a25, roughness: 0.6 })),
      brow: c => mat("brow" + c, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.8), roughness: 0.7 })),
      glasses: () => mat("glasses", () => new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.3, metalness: 0.6 })),
      sweat: () => mat("sweat", () => new THREE.MeshStandardMaterial({ color: 0x7cc4ff, roughness: 0.15, transparent: true, opacity: 0.85 })),
      gold: () => mat("gold", () => new THREE.MeshStandardMaterial({ color: 0xf2b632, roughness: 0.32, metalness: 0.75 })),
      goldDark: () => mat("goldDark", () => new THREE.MeshStandardMaterial({ color: 0xb07a12, roughness: 0.35, metalness: 0.8 })),
      red: () => mat("red", () => new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.55 })),
      redDark: () => mat("redDark", () => new THREE.MeshStandardMaterial({ color: 0x7f1612, roughness: 0.5 })),
      cord: () => mat("cord", () => new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 })),
    },
  };
  return L;
}

/* ---------- 小工具 ---------- */
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
// 週期性脈衝：每 period 秒出現一次、持續 dur 秒，進出平滑，回傳 0..1
function pulse(t, period, dur, ph = 0) { const p = ((t + ph) % period + period) % period; return p > dur ? 0 : smooth(0, dur * 0.25, p) * (1 - smooth(dur * 0.75, dur, p)); }
const damp = (cur, target, k, dt) => cur + (target - cur) * Math.min(1, k * dt);

// 只有大塊（身體、頭、骨盆、腿）投影；小零件不投影、不接收陰影，省掉陰影貼圖的繪製量
function mesh(THREE, geo, mat, parent, x = 0, y = 0, z = 0, shadow = false) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = false; parent.add(m); return m;
}

/* ---------- 共同的上半身（原點＝骨盆上緣、臀部轉軸） ---------- */
function buildUpper(THREE, kind, seed, { sleeves = true } = {}) {
  const { g, m } = lib(THREE), r = rng(seed * 7919 + 13);
  const look = {
    skin: SKINS[Math.floor(r() * SKINS.length)], hair: HAIRS[Math.floor(r() * HAIRS.length)],
    style: Math.floor(r() * HAIR_STYLES), glasses: r() < 0.35, tie: r() < 0.55, tieColor: TIES[Math.floor(r() * TIES.length)],
    badge: r() < 0.6, phase: r() * 20, blinkP: 3 + r() * 2.5, lookP: 8 + r() * 6, lookDir: r() < 0.5 ? -1 : 1,
  };
  const skin = m.skin(look.skin), hair = m.hair(look.hair), uni = m.cloth(UNIFORM[kind] ?? UNIFORM.other);
  const ub = new THREE.Group();

  // 身體
  const torso = mesh(THREE, g.torso(), uni, ub, 0, 0.25, 0, true); torso.scale.set(1, 1, 0.8);
  const collar = mesh(THREE, g.collar(), m.white(), ub, 0, 0.49, 0); collar.rotation.x = Math.PI / 2; collar.scale.set(1, 0.85, 1);
  if (look.tie) { const tie = mesh(THREE, g.tie(), m.cloth(look.tieColor), ub, 0, 0.36, 0.137); tie.rotation.x = -0.12; }
  if (look.badge) { const b = mesh(THREE, g.badge(), m.white(), ub, -0.085, 0.3, 0.135); b.rotation.set(-0.08, 0, 0.08); }

  // 手臂：shoulder → upper → elbow → fore + hand
  const arms = [-1, 1].map(side => {
    const sh = new THREE.Group(); sh.position.set(side * 0.205, 0.42, 0); ub.add(sh);
    mesh(THREE, g.upperArm(), sleeves ? uni : skin, sh);
    const el = new THREE.Group(); el.position.y = -0.2; sh.add(el);
    mesh(THREE, g.foreArm(), skin, el);
    const hand = mesh(THREE, g.hand(), skin, el, 0, -0.205, 0);
    return { sh, el, hand, side };
  });

  // 頭（轉軸在脖子）
  const head = new THREE.Group(); head.position.y = 0.48; ub.add(head);
  const skull = mesh(THREE, g.head(), skin, head, 0, 0.16, 0, true); skull.scale.set(1.05, 0.97, 1);
  [-1, 1].forEach(s => { const e = mesh(THREE, g.ear(), skin, head, s * 0.207, 0.15, -0.01); e.scale.set(0.55, 1, 0.8); });
  const eyes = [-1, 1].map(s => { const e = mesh(THREE, g.eye(), m.eye(), head, s * 0.072, 0.17, 0.178); e.scale.set(0.9, 1.25, 0.6); e.castShadow = false; return e; });
  [-1, 1].forEach(s => { const c = mesh(THREE, g.cheek(), m.cheek(), head, s * 0.115, 0.1, 0.162); c.scale.set(1, 0.6, 0.45); c.castShadow = false; });
  mesh(THREE, g.nose(), skin, head, 0, 0.125, 0.198).castShadow = false;
  const mouthY = 0.075, mouthZ = 0.188;
  const smile = mesh(THREE, g.arc(), m.mouth(), head, 0, mouthY + 0.02, mouthZ); smile.rotation.set(-0.25, 0, Math.PI);
  const frown = mesh(THREE, g.arc(), m.mouth(), head, 0, mouthY - 0.022, mouthZ - 0.004); frown.rotation.set(-0.25, 0, 0); frown.scale.set(0.8, 0.6, 1);
  const flat = mesh(THREE, g.flat(), m.mouth(), head, 0, mouthY, mouthZ + 0.002);
  [smile, frown, flat].forEach(x => { x.castShadow = false; });
  const brows = [-1, 1].map(s => { const b = mesh(THREE, g.brow(), m.brow(look.hair), head, s * 0.074, 0.232, 0.168); b.castShadow = false; b.rotation.x = -0.35; return b; });
  if (look.glasses) {
    [-1, 1].forEach(s => mesh(THREE, g.lens(), m.glasses(), head, s * 0.074, 0.168, 0.205).castShadow = false);
    mesh(THREE, g.bridge(), m.glasses(), head, 0, 0.172, 0.21).castShadow = false;
  }
  buildHair(THREE, head, hair, look.style, r);

  return { ub, head, arms, eyes, brows, mouths: { 1: smile, 0: flat, "-1": frown }, look };
}

function buildHair(THREE, head, hair, style, r) {
  const { g } = lib(THREE);
  const cap = mesh(THREE, g.cap(), hair, head, 0, 0.165, -0.005, true); cap.rotation.x = -0.42; cap.scale.set(1.05, 1, 1.02);
  const ball = (x, y, z, sx, sy = sx, sz = sx) => { const b = mesh(THREE, g.ball(), hair, head, x, y, z); b.scale.set(sx, sy, sz); return b; };
  if (style === 0) {            // 短髮：頂上一撮翹毛
    const t = ball(0.03, 0.375, 0.08, 0.06, 0.035, 0.07); t.rotation.z = -0.4;
  } else if (style === 1) {     // 包頭
    ball(0, 0.39, -0.09, 0.085);
    ball(0, 0.335, -0.075, 0.06, 0.03, 0.06);
  } else if (style === 2) {     // 側分：一側瀏海往下梳
    const sw = ball(0.06, 0.315, 0.1, 0.13, 0.055, 0.1); sw.rotation.set(0.35, 0, -0.35);
    const sw2 = ball(-0.11, 0.3, 0.07, 0.07, 0.045, 0.08); sw2.rotation.z = 0.5;
  } else if (style === 3) {     // 捲髮：頭頂一圈小球
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + r() * 0.4;
      ball(Math.cos(a) * 0.13, 0.33 + r() * 0.03, Math.sin(a) * 0.12 - 0.02, 0.075 + r() * 0.015);
    }
  } else {                      // 鮑伯：後腦與兩側包到下巴
    const back = ball(0, 0.135, -0.045, 0.225, 0.2, 0.2);
    back.scale.set(0.235, 0.205, 0.195);
    const f = ball(0, 0.305, 0.12, 0.15, 0.05, 0.08); f.rotation.x = 0.4;
  }
}

/* ---------- 腿（hip → thigh → knee → shin + shoe） ---------- */
function buildLeg(THREE, parent, side, thighLen, shinLen) {
  const { g, m } = lib(THREE);
  const hip = new THREE.Group(); hip.position.set(side * 0.09, 0, 0.0); parent.add(hip);
  mesh(THREE, g.leg(thighLen, 0.075), m.pants(), hip, 0, 0, 0, true);
  const knee = new THREE.Group(); knee.position.y = -(thighLen + 0.075 * 1.2); hip.add(knee);
  mesh(THREE, g.leg(shinLen, 0.066), m.pants(), knee);
  const foot = new THREE.Group(); foot.position.y = -(shinLen + 0.066 * 1.2); knee.add(foot);
  mesh(THREE, g.shoe(), m.shoe(), foot, 0, -0.01, 0.04);
  return { hip, knee, foot };
}

function buildSweat(THREE, head) {
  const { g, m } = lib(THREE);
  return [0, 1, 2].map(i => { const d = mesh(THREE, g.drop(), m.sweat(), head, 0, 0, 0); d.castShadow = false; d.visible = false; d.userData.side = i === 1 ? -1 : 1; return d; });
}

/* ---------- 員工的小動作 ----------
   平常打字；每隔 5～12 秒隨機做一個小動作，做完回到打字。權重依心情與警示調整：
   賺錢多慶祝、虧錢多抱頭、紅色警示幾乎只會抱頭或狂打字、晚上多打哈欠。
   每個動作＝左右手（肩 x/z、肘 x）、上身（前傾 x、轉椅 y）、頭（x/y/z）的目標姿勢，用 envelope 平滑進出。 */
const ACTS = {
  stretch:   { dur: 2.6, L: [-2.85, 0.2, -0.25], R: [-2.85, 0.2, -0.25], ub: [-0.12, 0], head: [-0.25, 0, 0], eyes: 0.15 },
  sip:       { dur: 3.0, R: [-1.25, -0.42, -2.15], ub: [0.0, 0], head: [-0.12, 0.05, 0], prop: "cup" },
  phone:     { dur: 4.2, L: [-1.05, 0.5, -2.45], ub: [0.0, -0.25], head: [0.02, -0.35, -0.12], prop: "phone", talk: true },
  think:     { dur: 3.2, R: [-1.35, -0.48, -1.95], L: [-0.95, -0.15, -0.9], ub: [0.12, 0], head: [-0.05, 0.25, 0.1] },
  swivel:    { dur: 3.4, L: [-0.55, 0.1, -0.5], R: [-0.55, 0.1, -0.5], ub: [0.0, 0.55], head: [0, 0.35, 0], swivel: true },
  yawn:      { dur: 2.6, R: [-1.3, -0.42, -2.05], ub: [-0.1, 0], head: [-0.3, 0, 0.08], eyes: 0.1 },
  celebrate: { dur: 2.4, L: [-2.75, 0.45, -0.35], R: [-2.75, 0.45, -0.35], ub: [-0.05, 0], head: [-0.15, 0, 0], wave: true, eyes: 0.35 },
  headdown:  { dur: 3.4, L: [-1.45, -0.3, -1.95], R: [-1.45, -0.3, -1.95], ub: [0.32, 0], head: [0.42, 0, 0], eyes: 0.2 },
  panic:     { dur: 2.0, L: [-2.55, -0.1, -1.6], R: [-2.55, -0.1, -1.6], ub: [0.05, 0], head: [0.1, 0, 0], shake: true },
};
function pickAct(r, mood, alert, night) {
  const w = alert === "red" ? { panic: 3, headdown: 2, sip: 0.3 }
    : { stretch: 1, sip: 1.6, phone: 1, think: 1.3, swivel: 1.2, yawn: night ? 1.4 : 0.35,
        celebrate: mood > 0 ? 1.4 : 0, headdown: mood < 0 ? 1.3 : 0 };
  let sum = 0; for (const k in w) sum += w[k];
  let x = r() * sum; for (const k in w) { x -= w[k]; if (x <= 0) return k; }
  return "sip";
}

/* ---------- 員工（坐姿打字） ---------- */
export function createWorker({ THREE, kind = "other", seed = 1 }) {
  const { m, g } = lib(THREE);
  const group = new THREE.Group();
  const HIP_Y = 0.5;
  const pelvis = mesh(THREE, g.pelvis(), m.pants(), group, 0, HIP_Y, 0.02, true);
  const legRoot = new THREE.Group(); legRoot.position.set(0, HIP_Y - 0.01, 0.03); group.add(legRoot);
  const legs = [-1, 1].map(s => buildLeg(THREE, legRoot, s, 0.26, 0.36));
  legs.forEach(l => { l.hip.rotation.x = -Math.PI / 2 + 0.05; l.knee.rotation.x = Math.PI / 2 - 0.05; });
  // 腳掌回到地面：大腿往 +z 平伸、小腿垂直
  const up = buildUpper(THREE, kind, seed);
  up.ub.position.set(0, HIP_Y + 0.02, 0); group.add(up.ub);
  const sweat = buildSweat(THREE, up.head);
  // 道具：咖啡杯（右手）、手機（左手），只在動作時出現
  const cup = new THREE.Group(); cup.visible = false; up.arms[1].hand.add(cup);
  mesh(THREE, lib(THREE).geo("cup", () => new THREE.CylinderGeometry(0.04, 0.034, 0.09, 8)), lib(THREE).mat("cup", () => new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.4 })), cup, 0.0, 0.0, 0.05);
  mesh(THREE, lib(THREE).geo("coffee", () => new THREE.CircleGeometry(0.035, 8).rotateX(-Math.PI / 2)), lib(THREE).mat("coffee", () => new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.3 })), cup, 0.0, 0.046, 0.05);
  const phone = new THREE.Group(); phone.visible = false; up.arms[0].hand.add(phone);
  mesh(THREE, lib(THREE).geo("phone", () => new THREE.BoxGeometry(0.05, 0.13, 0.016)), lib(THREE).mat("phone", () => new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3, metalness: 0.4 })), phone, 0.03, 0.04, 0.045);

  const r = rng(seed * 2654435761 + 7);
  const night = (() => { const h = new Date().getHours(); return h < 6 || h >= 18; })();
  const st = { mood: 0, alert: null, sway: 0, look: 0, act: null, actT0: 0, nextAt: 2 + r() * 8, cur: null };
  const ph = up.look.phase;
  setMood(0);

  function setMood(v) {
    st.mood = v > 0 ? 1 : v < 0 ? -1 : 0;
    for (const k in up.mouths) up.mouths[k].visible = String(st.mood) === k;
    up.brows.forEach((b, i) => { const s = i === 0 ? -1 : 1; b.rotation.z = st.mood < 0 ? s * -0.38 : st.mood > 0 ? s * 0.12 : 0; b.position.y = st.mood < 0 ? 0.226 : 0.234; });
  }
  function setAlert(a) { st.alert = a === "red" || a === "yellow" ? a : null; sweat.forEach(d => { d.visible = st.alert === "red"; }); if (st.alert === "red") place(0); }
  function place(t) {   // 汗珠從太陽穴往下滴、縮小淡出
    sweat.forEach((d, i) => {
      const p = ((t * 0.7 + i / 3) % 1 + 1) % 1, s = d.userData.side;
      d.position.set(s * (0.18 + 0.03 * i % 2), 0.3 - p * 0.24, 0.1 - i * 0.02);
      const k = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85 * 0.85; d.scale.setScalar(Math.max(0.05, k) * 1.5);
    });
  }
  // 現在的動作與它的進出權重（0..1）
  function activity(t) {
    if (!st.act && t >= st.nextAt) { st.act = pickAct(r, st.mood, st.alert, night); st.actT0 = t; }
    if (!st.act) return [null, 0];
    const A = ACTS[st.act], tt = t - st.actT0;
    if (tt > A.dur) { st.act = null; st.nextAt = t + (st.alert === "red" ? 2.5 : 5) + r() * 7; return [null, 0]; }
    return [A, smooth(0, 0.45, tt) * (1 - smooth(A.dur - 0.45, A.dur, tt))];
  }

  function pose(t, dt) {
    const red = st.alert === "red", yel = st.alert === "yellow";
    const speed = red ? 1.6 : 1;
    const [A, e] = activity(t);
    const mix = (a, b) => a + (b - a) * e;
    // 上半身：前傾、呼吸、紅色警報時左右晃；動作時前傾／轉椅
    st.sway = damp(st.sway, red ? 1 : 0, 3, dt);
    const swivelY = A && A.swivel ? Math.sin((t - st.actT0) * 1.9) * A.ub[1] : (A ? A.ub[1] : 0);
    up.ub.rotation.x = mix(0.1, A ? A.ub[0] + 0.1 : 0.1) + Math.sin(t * 1.4 + ph) * 0.012;
    up.ub.rotation.y = A ? swivelY * e : 0;
    up.ub.rotation.z = Math.sin(t * 4.2) * 0.07 * st.sway;
    up.ub.position.y = HIP_Y + 0.02 + Math.sin(t * 1.8 + ph) * 0.004;
    // 雙手：打字為底，動作時混到動作姿勢
    const watch = yel && !A ? pulse(t, 6.5, 2.2, ph) : 0;
    up.arms.forEach(({ sh, el, side }, i) => {
      const tap = Math.sin(t * 15 * speed + i * Math.PI + ph) * 0.07 + Math.sin(t * 23 * speed + i) * 0.03;
      let sx = -1.0 + tap * 0.3, ex = -0.72 + tap, sz = -side * 0.14, ey = 0;
      if (i === 0 && watch > 0) { sx = sx + (-0.25 - sx) * watch; ex = ex + (-1.75 - ex) * watch; sz = sz + (0.55 - sz) * watch; ey = 0.9 * watch; }
      const P = A && (i === 0 ? A.L : A.R);
      if (P) {
        let [px, pz, pe] = P;
        if (A.wave) { px += Math.sin(t * 9 + i * Math.PI) * 0.18; pz += Math.sin(t * 9 + i) * 0.12; }
        if (A.shake) { px += Math.sin(t * 13 + i) * 0.08; }
        if (A.talk && i === 0) pe += Math.sin(t * 2.3) * 0.05;
        sx = mix(sx, px); sz = mix(sz, side * pz); ex = mix(ex, pe);
      }
      sh.rotation.set(sx, 0, sz); el.rotation.set(ex, ey, 0);
    });
    cup.visible = !!(A && A.prop === "cup" && e > 0.3);
    phone.visible = !!(A && A.prop === "phone" && e > 0.3);
    // 頭：看螢幕＋點頭＋偶爾轉頭；動作時轉向動作的頭部姿勢
    const away = A ? 0 : pulse(t, up.look.lookP, 2.0, ph) * up.look.lookDir;
    const lookT = yel ? Math.max(Math.abs(away), pulse(t, 3.1, 1.0, ph * 0.5)) * (away < 0 ? -1 : 1) : away;
    st.look = damp(st.look, lookT * 0.55, 6, dt);
    const hx = 0.1 + Math.sin(t * 2.1 * speed + ph) * 0.035 + watch * 0.25, hy = st.look * (1 - watch) - watch * 0.5;
    const hz = Math.sin(t * 0.9 + ph) * 0.025 - (red ? Math.sin(t * 4.2) * 0.05 : 0);
    up.head.rotation.x = A ? mix(hx, A.head[0] + (A.talk ? Math.sin(t * 6) * 0.03 : 0)) : hx;
    up.head.rotation.y = A ? mix(hy, A.head[1] + (A.swivel ? -swivelY * 0.4 : 0)) : hy;
    up.head.rotation.z = A ? mix(hz, A.head[2]) : hz;
    // 眨眼；有些動作會瞇眼
    const bp = ((t + ph) % up.look.blinkP), blink = bp < 0.14 ? Math.sin(bp / 0.14 * Math.PI) : 0;
    const open = (red ? 1.45 : 1.25) * (A && A.eyes != null ? mix(1, A.eyes) : 1);
    up.eyes.forEach(e2 => { e2.scale.y = open * (1 - 0.9 * blink); });
    // 說話／打哈欠時嘴巴開合
    if (A && (A.talk || st.act === "yawn")) up.mouths["0"].scale.y = 1 + (st.act === "yawn" ? 5 * e : Math.abs(Math.sin(t * 9)) * 3 * e);
    else up.mouths["0"].scale.y = 1;
    if (red) place(t);
  }
  pose(0, 1);

  return {
    group, setMood, setAlert,
    // 預覽用：立刻做指定動作（不在 README 介面內）
    play(name, t = 0) { if (ACTS[name]) { st.act = name; st.actT0 = t; } },
    update(t, dt) { if (RM) return; pose(t, dt || 0.016); },
  };
}

/* ---------- 送件員（站姿走路、提錢袋） ---------- */
export function createCourier({ THREE, kind = "other", seed = 1, positive = true }) {
  const { m, g } = lib(THREE);
  const group = new THREE.Group();
  const body = new THREE.Group(); body.scale.setScalar(0.85); group.add(body);
  const HIP_Y = 0.48;
  const pelvis = mesh(THREE, g.pelvis(), m.pants(), body, 0, HIP_Y, 0, true);
  const legRoot = new THREE.Group(); legRoot.position.set(0, HIP_Y - 0.02, 0); body.add(legRoot);
  const legs = [-1, 1].map(s => buildLeg(THREE, legRoot, s, 0.12, 0.12));
  const up = buildUpper(THREE, kind, seed);
  up.ub.position.set(0, HIP_Y + 0.02, 0); body.add(up.ub);
  for (const k in up.mouths) up.mouths[k].visible = k === "1";

  // 錢袋掛在右手
  const right = up.arms[1];
  const bag = new THREE.Group(); bag.position.set(0, -0.23, 0.0); right.el.add(bag);
  const mb = positive ? m.gold() : m.red(), md = positive ? m.goldDark() : m.redDark();
  mesh(THREE, g.bagNeck(), m.cord(), bag, 0, -0.035, 0).rotation.x = Math.PI / 2;
  mesh(THREE, g.bagTuft(), mb, bag, 0, -0.03, 0);
  const sack = mesh(THREE, g.bag(), mb, bag, 0, -0.13, 0); sack.scale.set(1, 0.92, 0.9);
  // $ 浮雕（朝 +x 外側與 +z 前方都看得到：放在袋子正面）
  const dollar = new THREE.Group(); dollar.position.set(0, -0.13, 0.093); bag.add(dollar);
  const a1 = mesh(THREE, g.dArc(), md, dollar, 0, 0.018, 0); a1.rotation.z = Math.PI * 0.05;
  const a2 = mesh(THREE, g.dArc(), md, dollar, 0, -0.018, 0); a2.rotation.z = Math.PI * 1.05;
  mesh(THREE, g.dBar(), md, dollar);
  [a1, a2].forEach(x => { x.castShadow = false; });

  let walking = false, w = 0, blend = 0, tossT = -1, lastT = 0;
  const ph = up.look.phase;
  function pose(t, dt) {
    lastT = t;
    blend = damp(blend, walking ? 1 : 0, 6, dt);
    if (walking) w += dt * 8.5;
    const s = Math.sin(w), c = Math.cos(w);
    legs.forEach((l, i) => {
      const sg = i === 0 ? 1 : -1;
      l.hip.rotation.x = -s * sg * 0.55 * blend;
      l.knee.rotation.x = Math.max(0, sg * c) * 0.8 * blend;   // 抬腳時彎膝
      l.foot.rotation.x = -l.hip.rotation.x - l.knee.rotation.x + 0.1 * blend * Math.max(0, -sg * s);
    });
    const breathe = Math.sin(t * 2 + ph) * 0.008 * (1 - blend);
    up.ub.position.y = HIP_Y + 0.02 + Math.abs(s) * 0.035 * blend + breathe;
    pelvis.position.y = HIP_Y + Math.abs(s) * 0.035 * blend;
    legRoot.position.y = HIP_Y - 0.02 + Math.abs(s) * 0.035 * blend;
    up.ub.rotation.x = 0.06 * blend;
    up.ub.rotation.y = s * 0.08 * blend;
    up.ub.scale.y = 1 + breathe * 1.5;
    // 走路途中偶爾揮左手跟同事打招呼；到金庫時右手把錢袋往上拋（toss）並小跳一下
    const wave = walking ? pulse(t, 4.6, 1.3, ph) : 0;
    const tk = tossT < 0 ? -1 : (t - tossT) / 0.6, toss = tk < 0 || tk > 1 ? 0 : Math.sin(Math.min(1, tk) * Math.PI);
    up.arms.forEach(({ sh, el, side }, i) => {
      const sg = i === 0 ? 1 : -1, carry = i === 1;
      let sx = s * sg * (carry ? 0.18 : 0.6) * blend + (carry ? -0.12 : 0), sz = side * (carry ? 0.18 : 0.1);
      let ex = carry ? -0.35 : -0.25 - Math.max(0, -s * sg) * 0.4 * blend;
      if (!carry && wave > 0) { sx += (-2.7 - sx) * wave; sz += (side * 0.45 - sz) * wave; ex = ex + (-0.4 + Math.sin(t * 12) * 0.35 - ex) * wave; }
      if (carry && toss > 0) { sx += (-2.5 - sx) * toss; ex += (-0.2 - ex) * toss; }
      sh.rotation.set(sx, 0, sz); el.rotation.set(ex, 0, 0);
    });
    if (tk >= 0.45) bag.visible = false;                       // 拋出去了
    body.position.y = toss * 0.08;
    // 袋子保持下垂、有點慣性晃動
    bag.rotation.x = -(right.sh.rotation.x + right.el.rotation.x) - up.ub.rotation.x + Math.sin(w - 0.8) * 0.15 * blend;
    bag.rotation.z = -right.sh.rotation.z;
    up.head.rotation.x = -0.04 + Math.sin(w * 2) * 0.02 * blend;
    up.head.rotation.y = -up.ub.rotation.y + (1 - blend) * pulse(t, 5, 1.6, ph) * 0.5 * up.look.lookDir;
    const bp = ((t + ph) % up.look.blinkP), blink = bp < 0.14 ? Math.sin(bp / 0.14 * Math.PI) : 0;
    up.eyes.forEach(e => { e.scale.y = 1.25 * (1 - 0.9 * blink); });
  }
  pose(0, 1);

  return {
    group,
    setWalking(v) { walking = !!v; if (RM) { blend = 0; pose(0, 1); } },
    // 到金庫：停下、把錢袋往上拋（約 0.6 秒）；main.js 在這之後移除送件員
    toss() { walking = false; tossT = lastT; if (RM) bag.visible = false; },
    update(t, dt) { if (RM) return; pose(t, dt || 0.016); },
  };
}
