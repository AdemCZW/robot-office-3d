// 80 年代小鎮懸疑風的原創卡通公仔（14 位）。臉一律用 character.js 那種統一卡通臉（圓臉、點點眼、簡單嘴），
// 不模仿任何真人或既有角色；辨識度只靠服裝、髮型輪廓、道具與招牌動作。
// 介面：
//   CAST：[{ id, label, sig }]
//   createCastMember({ THREE, id, seed }) -> { group, setPose, setMood, setAlert, play, update, carry }
//   group 原點＝腳底中心、臉朝 +z；坐姿時原點＝椅面中心的地板投影（同 character.js 的 worker）。
// 效能：geometry / material 模組層級共用、MeshStandardMaterial、只有大塊（身體、頭、頭髮大塊）投影、每人 mesh ≤ 45。
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const CAST = [
  { id: "psychic", label: "念力女孩", sig: "telekinesis" },
  { id: "dm", label: "地城主", sig: "dice" },
  { id: "capkid", label: "帽子男孩", sig: "radio" },
  { id: "scout", label: "偵察兵", sig: "slingshot" },
  { id: "artist", label: "畫畫男孩", sig: "draw" },
  { id: "skater", label: "滑板女孩", sig: "skate" },
  { id: "sailor", label: "冰店店員", sig: "bat" },
  { id: "sailor2", label: "冰店女店員", sig: "talk" },
  { id: "reporter", label: "記者女孩", sig: "notebook" },
  { id: "photographer", label: "攝影男孩", sig: "camera" },
  { id: "sheriff", label: "警長", sig: "coffee" },
  { id: "mom", label: "媽媽", sig: "lights" },
  { id: "metalhead", label: "重金屬學長", sig: "guitar" },
  { id: "sister", label: "小妹", sig: "icecream" },
];

/* ---------- 共用資源 ---------- */
let L = null;
function lib(THREE) {
  if (L) return L;
  const G = {}, M = {}, T = {};
  const geo = (k, f) => G[k] || (G[k] = f());
  const mat = (k, f) => M[k] || (M[k] = f());
  const std = (c, ro = 0.78, me = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: ro, metalness: me, ...o });
  const cloth = c => std(new THREE.Color(c).multiplyScalar(0.82));
  // 程式產生的布料花紋（CanvasTexture），沒有 document 時退回素色
  const tex = (k, w, h, draw, rx = 1, ry = 1) => {
    if (k in T) return T[k];
    if (typeof document === "undefined") return (T[k] = null);
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
    return (T[k] = t);
  };
  const PAT = {
    stripes: () => tex("stripes", 8, 64, (x, w, h) => {      // 地城主：橫條紋上衣
      const cols = ["#2c3e74", "#e8dcc0", "#c9772b", "#e8dcc0"];
      for (let i = 0; i < 8; i++) { x.fillStyle = cols[i % 4]; x.fillRect(0, i * 8, w, 8); }
    }, 1, 1.6),
    plaid: () => tex("plaid", 64, 64, (x, w, h) => {         // 畫畫男孩：格紋襯衫
      x.fillStyle = "#b5523a"; x.fillRect(0, 0, w, h);
      x.fillStyle = "rgba(60,30,25,0.55)"; x.fillRect(0, 20, w, 14); x.fillRect(20, 0, 14, h);
      x.fillStyle = "rgba(240,215,160,0.7)"; x.fillRect(0, 48, w, 3); x.fillRect(48, 0, 3, h);
    }, 4, 3),
    camo: () => tex("camo", 64, 64, (x, w, h) => {           // 偵察兵：迷彩頭巾
      x.fillStyle = "#6b7a3c"; x.fillRect(0, 0, w, h);
      const blobs = [["#3f4a24", 10, 12, 12, 8], ["#8a7a4a", 40, 20, 14, 9], ["#2b3019", 28, 44, 13, 7], ["#3f4a24", 54, 52, 10, 8], ["#8a7a4a", 8, 46, 9, 6], ["#2b3019", 50, 6, 9, 6]];
      blobs.forEach(([c, cx, cy, rx, ry]) => { x.fillStyle = c; x.beginPath(); x.ellipse(cx, cy, rx, ry, cx * 0.1, 0, Math.PI * 2); x.fill(); });
    }, 3, 1),
    knit: () => tex("knit", 32, 64, (x, w, h) => {           // 媽媽：針織毛衣（直紋＋一圈鋸齒花）
      x.fillStyle = "#b9876a"; x.fillRect(0, 0, w, h);
      x.fillStyle = "rgba(90,50,35,0.35)"; for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1, h);
      x.fillStyle = "#e9d8b8"; x.beginPath(); x.moveTo(0, 34);
      for (let i = 0; i <= w; i += 8) { x.lineTo(i + 4, 26); x.lineTo(i + 8, 34); }
      x.lineTo(w, 38); x.lineTo(0, 38); x.fill();
    }, 4, 1),
  };
  L = {
    geo, mat,
    g: {
      pelvis: () => geo("pelvis", () => new RoundedBoxGeometry(0.32, 0.16, 0.26, 1, 0.06)),
      torso: () => geo("torso", () => new THREE.CapsuleGeometry(0.17, 0.2, 4, 12)),
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
      cap: () => geo("cap", () => new THREE.SphereGeometry(0.218, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.47)),
      ball: () => geo("ball", () => new THREE.SphereGeometry(1, 10, 8)),
      curly: () => geo("curly", () => bumpy(new THREE.SphereGeometry(1, 16, 12), 0.12)),            // 捲髮：表面一顆顆凸起
      curlyCap: () => geo("curlyCap", () => bumpy(new THREE.SphereGeometry(0.218, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0.1)),
      vee: () => geo("vee", () => {          // 敞開外套裡露出的 V 形上衣
        const s = new THREE.Shape(); s.moveTo(-0.085, 0.13); s.lineTo(0.085, 0.13); s.quadraticCurveTo(0.02, -0.02, 0, -0.13); s.quadraticCurveTo(-0.02, -0.02, -0.085, 0.13);
        return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 });
      }),
      drop: () => geo("drop", () => {
        const p = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; p.push(new THREE.Vector2(Math.sin(a) * 0.022 * (i < 5 ? i / 5 : 1), -Math.cos(a) * 0.024 + (i < 5 ? (5 - i) / 5 * 0.02 : 0))); }
        return new THREE.LatheGeometry(p, 6);
      }),
      bag: () => geo("bag", () => new THREE.SphereGeometry(0.105, 10, 8)),
      bagTuft: () => geo("bagTuft", () => new THREE.ConeGeometry(0.05, 0.07, 8, 1, true).rotateX(Math.PI)),
      cup: () => geo("cup", () => new THREE.CylinderGeometry(0.04, 0.034, 0.09, 8)),
      phone: () => geo("phone", () => new THREE.BoxGeometry(0.05, 0.13, 0.016)),
      box: () => geo("box", () => new RoundedBoxGeometry(1, 1, 1, 1, 0.12)),
      cyl: () => geo("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 10)),
      panel: () => geo("panel", () => new RoundedBoxGeometry(0.15, 0.25, 0.04, 1, 0.015)),
      skirt: () => geo("skirt", () => new THREE.CylinderGeometry(0.175, 0.27, 0.22, 16, 1, true)),
      ring: () => geo("ring", () => new THREE.TorusGeometry(0.2, 0.03, 6, 20).rotateX(Math.PI / 2)),
      halfTorus: () => geo("halfTorus", () => new THREE.TorusGeometry(0.225, 0.016, 4, 16, Math.PI)),
      visor: () => geo("visor", () => new THREE.CylinderGeometry(0.13, 0.13, 0.016, 12, 1, false, -Math.PI / 2, Math.PI)),
      halfDisc: () => geo("halfDisc", () => new THREE.CircleGeometry(0.042, 10, Math.PI, Math.PI)),
      d20: () => geo("d20", () => new THREE.IcosahedronGeometry(0.05, 0)),
      fork: () => geo("fork", () => new THREE.TorusGeometry(0.04, 0.011, 4, 8, Math.PI).rotateZ(0)),
      bat: () => geo("bat", () => new THREE.CylinderGeometry(0.042, 0.022, 0.6, 8).translate(0, 0.27, 0)),
      nails: () => geo("nails", () => {
        const parts = [];
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 + (i % 2) * 0.4, y = 0.4 + (i % 3) * 0.06;
          parts.push(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 4).rotateZ(Math.PI / 2).rotateY(-a).translate(Math.cos(a) * 0.045, y, Math.sin(a) * 0.045));
        }
        return mergeGeometries(parts);
      }),
      cone: () => geo("cone", () => new THREE.ConeGeometry(0.042, 0.13, 8).rotateX(Math.PI)),
      star: () => geo("star", () => {
        const s = new THREE.Shape();
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.016 : 0.038; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        return new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false });
      }),
      gbody: () => geo("gbody", () => {     // 尖角造型的電吉他琴身（原創輪廓）
        const s = new THREE.Shape();
        s.moveTo(-0.045, 0.1); s.lineTo(0.05, 0.1); s.lineTo(0.15, -0.06); s.lineTo(0.1, -0.1); s.lineTo(0.02, -0.04);
        s.lineTo(-0.06, -0.19); s.lineTo(-0.13, -0.16); s.lineTo(-0.08, -0.02); s.lineTo(-0.045, 0.1);
        return new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 }).translate(0, 0, -0.017);
      }),
      lightsTube: () => geo("lightsTube", () => new THREE.TubeGeometry(lightsCurve(THREE), 16, 0.006, 4, false)),
    },
    m: {
      std: (k, c, ro, me, o) => mat("s" + k, () => std(c, ro, me, o)),
      skin: c => mat("skin" + c, () => std(c, 0.62)),
      hair: c => mat("hair" + c, () => std(c, 0.5)),
      cloth: c => mat("cloth" + c, () => cloth(c)),
      pat: k => mat("pat" + k, () => { const t = PAT[k](); return t ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.82 }) : std(0x888888); }),
      eye: () => mat("eye", () => std(0x1a1412, 0.2)),
      eyeWhite: () => mat("eyeWhite", () => std(0xf4f1ea, 0.3)),
      cheek: () => mat("cheek", () => std(0xff8a8a, 0.8, 0, { transparent: true, opacity: 0.55, depthWrite: false })),
      mouth: () => mat("mouth", () => std(0x6b2a25, 0.6)),
      brow: c => mat("brow" + c, () => std(new THREE.Color(c).multiplyScalar(0.8), 0.7)),
      sweat: () => mat("sweat", () => std(0x7cc4ff, 0.15, 0, { transparent: true, opacity: 0.85 })),
      white: () => mat("white", () => cloth(0xfafaf7)),
      gold: () => mat("gold", () => std(0xf2b632, 0.32, 0.75)),
      red: () => mat("red", () => std(0xd8342c, 0.55)),
      blood: () => mat("blood", () => std(0xb3121a, 0.4)),
      cord: () => mat("cord", () => std(0x6b4423, 0.8)),
      cupM: () => mat("cupM", () => std(0xfafafa, 0.4)),
      phoneM: () => mat("phoneM", () => std(0x1f2937, 0.3, 0.4)),
      metal: () => mat("metal", () => std(0x9aa0a8, 0.3, 0.8)),
      flash: () => mat("flash", () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })),
      bulbs: () => mat("bulbs", () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })),
    },
  };
  return L;
}
// 頂點沿法線方向加一點起伏，做出捲髮的凹凸
function bumpy(geo, amp) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, y, z) || 1;
    const k = 1 + amp * (Math.sin(x / r * 9.1 + 1) + Math.sin(y / r * 8.3) + Math.sin(z / r * 7.7 + 2)) / 3;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals(); return geo;
}
// 媽媽的燈串：兩手之間下垂的弧線（長 1、中心在原點，依手距縮放 x）
function lightsCurve(THREE) {
  const p = []; for (let i = 0; i <= 8; i++) { const x = i / 8 - 0.5; p.push(new THREE.Vector3(x, -0.22 * (1 - 4 * x * x), 0.02 * Math.sin(i * 1.7))); }
  return new THREE.CatmullRomCurve3(p);
}

/* ---------- 小工具 ---------- */
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function pulse(t, period, dur, ph = 0) { const p = ((t + ph) % period + period) % period; return p > dur ? 0 : smooth(0, dur * 0.25, p) * (1 - smooth(dur * 0.75, dur, p)); }
const damp = (cur, target, k, dt) => cur + (target - cur) * Math.min(1, k * dt);
const lerpA = (a, b, k) => a.map((v, i) => v + ((b[i] ?? 0) - v) * k);
function mk(THREE, geo, mat, parent, x = 0, y = 0, z = 0, shadow = false) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = false; parent.add(m); return m;
}

/* ---------- 通用小動作（同 character.js）：手臂 [肩 x, 肩 z(外展), 肘 x, 肘 z(往內彎)]、上身 [前傾, 轉身]、頭 [x, y, z] ---------- */
const ACTS = {
  stretch:   { dur: 2.6, L: [-2.85, 0.2, -0.25], R: [-2.85, 0.2, -0.25], ub: [-0.12, 0], head: [-0.25, 0, 0], eyes: 0.15 },
  sip:       { dur: 3.0, R: [-1.25, -0.42, -2.15], ub: [0.0, 0], head: [-0.12, 0.05, 0], prop: "cup" },
  phone:     { dur: 4.2, L: [-1.05, 0.5, -2.45], ub: [0.0, -0.25], head: [0.02, -0.35, -0.12], prop: "phone", talk: true },
  think:     { dur: 3.2, R: [-1.35, -0.48, -1.95], L: [-0.95, -0.15, -0.9], ub: [0.12, 0], head: [-0.05, 0.25, 0.1] },
  swivel:    { dur: 3.4, L: [-0.55, 0.1, -0.5], R: [-0.55, 0.1, -0.5], ub: [0.0, 0.55], head: [0, 0.35, 0], swivel: true },
  yawn:      { dur: 2.6, R: [-1.3, -0.42, -2.05], ub: [-0.1, 0], head: [-0.3, 0, 0.08], eyes: 0.1, yawn: true },
  celebrate: { dur: 2.4, L: [-2.75, 0.45, -0.35], R: [-2.75, 0.45, -0.35], ub: [-0.05, 0], head: [-0.15, 0, 0], wave: true, eyes: 0.35 },
  headdown:  { dur: 3.4, L: [-1.45, -0.3, -1.95], R: [-1.45, -0.3, -1.95], ub: [0.32, 0], head: [0.42, 0, 0], eyes: 0.2 },
  panic:     { dur: 2.0, L: [-2.55, -0.1, -1.6], R: [-2.55, -0.1, -1.6], ub: [0.05, 0], head: [0.1, 0, 0], shake: true },
};

/* ---------- 14 個造型 ----------
   每個：adult（大人比小孩高約 1.2 倍）、膚色、髮色、衣服、褲子／腿、鞋，build(b) 加髮型與服裝，sig 招牌動作。
   sig 的 L/R/head/ub 可以是函式 (c) => 陣列；fx(c) 每格呼叫（c.on＝正在做招牌動作），負責道具顯示與額外擺動。 */
const SK = { a: 0xf8dcc8, b: 0xf0c39f, c: 0xdba47c, d: 0xb57a52, e: 0x845436 };
const HAND_SIP = [-1.25, -0.42, -2.15, 0];

const DEFS = {
  /* 1. 念力女孩：極短平頭、粉紅洋裝＋藍色短外套、白色高筒襪 */
  psychic: {
    skin: SK.a, hair: 0x5a3d2b, top: 0x4f7fd0, sleeve: 0x4f7fd0, pelvis: 0xec8fb0, thigh: "skin", shin: 0xf7f5ef, shoe: 0x2f3440,
    build(b) {
      const { g, m, head, ub, P } = b;
      const cap = b.hairCap(); cap.scale.set(0.985, 0.94, 0.975); cap.position.y = 0.158;      // 貼頭皮的平頭
      b.vee(m.cloth(0xec8fb0), 1.05, 1.05);            // 外套敞開，裡面粉紅洋裝
      P.skirt = b.mk(g.skirt(), b.m.std("dress", 0xd97e9e, 0.78, 0, { side: 2 }), b.body, 0, 0, 0, true);
      P.nose = b.mk(b.lib.geo("bleed", () => new b.THREE.CapsuleGeometry(0.0055, 0.032, 2, 4)), m.blood(), head, 0.013, 0.094, 0.196);
      P.nose.visible = false;
      // 會浮起來的小東西：積木、彈力球、鉛筆
      P.floats = [
        b.mk(g.box(), m.red(), b.group, 0, 0, 0), b.mk(g.ball(), b.m.std("toyball", 0x2f7fe0, 0.4), b.group, 0, 0, 0),
        b.mk(g.cyl(), b.m.std("pencil", 0xf2c12e, 0.6), b.group, 0, 0, 0),
      ];
      P.floats[0].scale.setScalar(0.07); P.floats[1].scale.setScalar(0.04); P.floats[2].scale.set(0.008, 0.13, 0.008);
      P.floats.forEach(f => { f.visible = false; });
    },
    onPose(b, pose) {      // 裙子：站著往下開、坐著往前蓋在大腿上
      const s = b.P.skirt;
      if (pose === "sit") { s.position.set(0, b.HIP + 0.01, 0.12); s.rotation.set(-1.45, 0, 0); s.scale.set(1, 1.05, 0.62); }
      else { s.position.set(0, b.HIP - 0.08, 0.01); s.rotation.set(0, 0, 0); s.scale.set(1, 1, 0.9); }
    },
    sig: {
      dur: 4.2, R: [-1.5, 0.12, -0.05], ub: [-0.05, 0], head: [-0.3, 0, 0.06], eyes: 1.25,
      fx(c) {
        const { P } = c, on = c.on || c.psyRed;
        P.nose.visible = on && c.e > 0.4;
        const base = c.sit ? 0.86 : 0.5, k = (c.psyRed ? 2.6 : 1) * (c.sit ? 1 : 1.5);
        P.floats.forEach((f, i) => {
          f.visible = on && c.e > 0.08;
          if (!f.visible) return;
          const lift = c.e * (0.1 + 0.035 * Math.sin(c.t * 2.2 + i * 2)) * k + (c.psyRed ? Math.sin(c.t * 31 + i) * 0.008 : 0);
          f.position.set(0.34 - i * 0.3, base + lift + i * 0.02, 0.5 + (i % 2) * 0.08);
          f.rotation.set(c.t * 0.7 + i, c.t * 0.9 * (i ? -1 : 1), 0.3 * i + (i === 2 ? Math.PI / 2 : 0));
        });
      },
    },
  },
  /* 2. 地城主：黑色中長髮、條紋上衣 */
  dm: {
    skin: SK.b, hair: 0x17130f, top: "stripes", sleeve: "stripes", pelvis: 0x3b4a6b, thigh: 0x3b4a6b, shin: 0x3b4a6b, shoe: 0xe6e2da,
    build(b) {
      const { g, P } = b;
      b.hairCap();
      b.ball(0, 0.135, -0.08, 0.225, 0.165, 0.18);           // 蓋到後頸的中長髮
      const bang = b.ball(0, 0.3, 0.13, 0.16, 0.055, 0.085); bang.rotation.x = 0.45;
      P.die = b.mk(g.d20(), b.m.std("d20", 0xc8322f, 0.35, 0.1), b.ub, 0, 0, 0);
      P.die.visible = false;
    },
    sig: {
      dur: 3.0,
      R: c => { const k = Math.max(smooth(0.12, 0.2, c.u) * (1 - smooth(0.2, 0.3, c.u)), smooth(0.68, 0.75, c.u) * (1 - smooth(0.75, 0.85, c.u))); return [-0.95 - 0.35 * k, 0.05, -1.25 + 0.25 * k]; },
      head: c => [-0.05 - 0.38 * Math.sin(Math.PI * smooth(0.2, 0.75, c.u)), 0, 0], ub: [-0.03, 0],
      fx(c) {
        const d = c.P.die; d.visible = c.on && c.e > 0.2;
        if (!d.visible) return;
        const h = c.hand(1), up = c.u > 0.2 && c.u < 0.75 ? Math.sin(Math.PI * (c.u - 0.2) / 0.55) * 0.5 : 0;
        d.position.set(h.x, h.y + 0.06 + up, h.z + 0.02);
        if (up > 0) d.rotation.set(c.t * 9, c.t * 7, 0);
      },
    },
  },
  /* 3. 帽子男孩：蓬鬆捲髮＋前面板棒球帽、笑起來門牙有缺口 */
  capkid: {
    skin: SK.b, hair: 0x6a4428, top: 0x3e8a5c, sleeve: 0xf0eadc, pelvis: 0x4a5878, thigh: 0x4a5878, shin: 0x4a5878, shoe: 0xf0f0f0,
    build(b) {
      const { g, m, head, P } = b;
      [-1, 1].forEach(s => b.curl(s * 0.19, 0.16, -0.05, 0.08, 0.1, 0.1));   // 帽子下面蓬出來的捲髮
      b.curl(0, 0.15, -0.15, 0.16, 0.12, 0.09);
      const crown = b.mk(g.cap(), b.m.std("capblue", 0x2a4f96, 0.7), head, 0, 0.18, -0.005, true); crown.rotation.x = -0.22; crown.scale.set(1.08, 0.95, 1.06);
      const front = b.mk(g.cap(), m.white(), head, 0, 0.181, 0.008); front.rotation.x = -0.22; front.scale.set(0.8, 0.94, 1.04);   // 白色前面板
      const visor = b.mk(g.visor(), b.m.std("capblue", 0x2a4f96, 0.7), head, 0, 0.29, 0.13); visor.rotation.x = 0.2; visor.scale.set(1.15, 1, 1.2);
      // 笑嘴：張開的半圓＋兩顆門牙中間有縫
      P.grin = new b.THREE.Group(); P.grin.position.set(0, 0.092, 0.192); head.add(P.grin); P.grin.rotation.x = -0.25;
      b.mk(g.halfDisc(), m.mouth(), P.grin, 0, 0, 0);
      [-1, 1].forEach(s => b.mk(b.lib.geo("tooth", () => new b.THREE.BoxGeometry(0.016, 0.018, 0.006)), m.white(), P.grin, s * 0.013, -0.009, 0.003));
      P.radio = new b.THREE.Group(); b.ub.add(P.radio); P.radio.visible = false;
      b.mk(b.lib.geo("radio", () => new RoundedBoxGeometry(0.075, 0.15, 0.045, 1, 0.012)), b.m.std("radioM", 0x2b2b2b, 0.5), P.radio, 0, 0, 0);
      b.mk(b.lib.geo("antenna", () => new b.THREE.CylinderGeometry(0.006, 0.006, 0.16, 4)), m.phoneM(), P.radio, 0.022, 0.15, 0);
    },
    sig: {
      dur: 4.2, L: [-1.1, 0.5, -2.35], ub: [0.0, -0.15], head: [0.0, -0.25, -0.08], talk: true,
      fx(c) {
        const r = c.P.radio; r.visible = c.on && c.e > 0.3;
        if (r.visible) { const h = c.hand(0); r.position.set(h.x + 0.01, h.y + 0.05, h.z + 0.03); r.rotation.set(0, -0.3, 0.15); }
      },
    },
    mouth(mood) { return mood > 0 ? "grin" : null; },
  },
  /* 4. 偵察兵：短髮、迷彩頭巾綁額頭 */
  scout: {
    skin: SK.d, hair: 0x1f1813, top: 0x6f7a46, sleeve: 0x6f7a46, pelvis: 0x5b5240, thigh: 0x5b5240, shin: 0x5b5240, shoe: 0x4a3626,
    build(b) {
      const { g, P } = b;
      b.hairCap();
      const t = b.ball(0.03, 0.372, 0.03, 0.08, 0.04, 0.09); t.rotation.z = -0.3;
      const band = b.mk(g.ring(), b.m.pat("camo"), b.head, 0, 0.255, 0.0); band.scale.set(1.1, 1.3, 1.04); band.rotation.x = -0.12;
      const knot = b.mk(b.lib.geo("knot", () => new RoundedBoxGeometry(0.05, 0.11, 0.025, 1, 0.01)), b.m.pat("camo"), b.head, 0.04, 0.2, -0.22); knot.rotation.set(0.3, 0, -0.5);
      P.sling = new b.THREE.Group(); b.ub.add(P.sling); P.sling.visible = false;
      const wood = b.m.std("wood", 0x8a5a32, 0.7);
      b.mk(b.lib.geo("handle", () => new b.THREE.CylinderGeometry(0.012, 0.014, 0.09, 6)), wood, P.sling, 0, -0.01, 0);
      const fk = b.mk(g.fork(), wood, P.sling, 0, 0.075, 0); fk.rotation.z = Math.PI;
      P.band = b.mk(b.lib.geo("bandG", () => new b.THREE.CylinderGeometry(0.005, 0.005, 1, 4).translate(0, 0.5, 0)), b.m.std("rubber", 0xc0392b, 0.6), b.ub, 0, 0, 0);
      P.band.visible = false;
    },
    sig: {
      dur: 3.6, L: [-1.45, 0.12, -0.05],
      R: c => c.u < 0.72 ? lerpA([-1.45, 0.0, -0.4], [-1.45, -0.6, -2.0], smooth(0.1, 0.45, c.u)) : [-1.5, 0.05, -0.15],
      head: [0.02, 0.06, 0.04], ub: [0.0, 0.15], eyes: 0.6,
      fx(c) {
        const { P } = c, vis = c.on && c.e > 0.3;
        P.sling.visible = P.band.visible = vis;
        if (!vis) return;
        const h = c.hand(0); P.sling.position.set(h.x, h.y + 0.06, h.z + 0.02); P.sling.rotation.set(0.2, 0, 0);
        const top = c.v3.set(h.x, h.y + 0.12, h.z + 0.04);
        const r = c.hand(1), to = c.u < 0.72 ? c.v4.copy(r) : c.v4.copy(top).add(c.v5.set(0, 0, -0.02));
        const d = c.v5.subVectors(to, top), len = Math.max(0.02, d.length());
        P.band.position.copy(top); P.band.scale.set(1, len, 1); P.band.quaternion.setFromUnitVectors(c.UP, d.divideScalar(len));
      },
    },
  },
  /* 5. 畫畫男孩：整齊碗公頭、格紋襯衫 */
  artist: {
    skin: SK.a, hair: 0x2a1d14, top: "plaid", sleeve: "plaid", pelvis: 0x6b5a45, thigh: 0x6b5a45, shin: 0x6b5a45, shoe: 0x3b2a20,
    build(b) {
      const { P } = b;
      const bowl = b.hairCap(); bowl.position.y = 0.225; bowl.rotation.x = -0.3; bowl.scale.set(1.1, 1.0, 1.08);   // 碗公頭：一整頂圓蓋
      const fringe = b.ball(0, 0.262, 0.15, 0.17, 0.03, 0.07); fringe.rotation.x = 0.2;  // 剪得平平的瀏海邊
      P.pad = b.mk(b.lib.geo("pad", () => new b.THREE.BoxGeometry(0.2, 0.006, 0.15)), b.m.std("paper", 0xf6f1e4, 0.9), b.ub, 0, 0, 0);
      P.pencil = b.mk(b.g.cyl(), b.m.std("pencil", 0xf2c12e, 0.6), b.ub, 0, 0, 0); P.pencil.scale.set(0.007, 0.12, 0.007);
      P.pad.visible = P.pencil.visible = false;
    },
    sig: {
      dur: 4.6, L: [-0.75, -0.3, -1.2], R: c => [-0.85 + Math.sin(c.t * 7) * 0.05, -0.18 + Math.sin(c.t * 5.3) * 0.06, -1.3], ub: [0.12, 0], head: [0.45, 0.05, 0.06], eyes: 0.7,
      fx(c) {
        const { P } = c, vis = c.on && c.e > 0.3; P.pad.visible = P.pencil.visible = vis;
        if (!vis) return;
        const a = c.hand(0), r = c.hand(1);
        P.pad.position.set((a.x + r.x) / 2, Math.min(a.y, r.y) + 0.02, (a.z + r.z) / 2 + 0.03); P.pad.rotation.set(0.35, 0, 0);
        P.pencil.position.set(r.x, r.y + 0.04, r.z + 0.01); P.pencil.rotation.set(0.6, 0, -0.4);
      },
    },
  },
  /* 6. 滑板女孩：紅色長髮、牛仔外套、大耳罩耳機 */
  skater: {
    skin: SK.a, hair: 0xb8401f, top: 0x5b7fb3, sleeve: 0x5b7fb3, pelvis: 0x2f3542, thigh: 0x2f3542, shin: 0x2f3542, shoe: 0xd9d4ca,
    build(b) {
      const { g, m, head, P } = b;
      b.hairCap();
      const back = b.ball(0, 0.02, -0.1, 0.21, 0.32, 0.12, true);           // 長髮披到背
      [-1, 1].forEach(s => { const sd = b.ball(s * 0.17, 0.02, 0.02, 0.06, 0.2, 0.08); sd.rotation.z = s * 0.1; });
      b.vee(m.white(), 0.95, 1);
      const hp = b.m.std("hpM", 0x262626, 0.4);
      const arch = b.mk(g.halfTorus(), hp, head, 0, 0.17, -0.01); arch.scale.set(1.04, 1.02, 1);
      [-1, 1].forEach(s => { const cup = b.mk(g.cyl(), b.m.std("hpCup", 0xd8452f, 0.5), head, s * 0.225, 0.155, -0.005); cup.scale.set(0.062, 0.05, 0.062); cup.rotation.z = Math.PI / 2; });
      P.board = new b.THREE.Group(); b.group.add(P.board); P.board.visible = false;
      b.mk(b.lib.geo("deck", () => new RoundedBoxGeometry(0.66, 0.025, 0.21, 1, 0.012)), b.m.std("deck", 0x2f9a8a, 0.6), P.board, 0, 0.055, 0);
      [-1, 1].forEach(s => { const w = b.mk(g.cyl(), b.m.std("wheel", 0xf2e8c9, 0.5), P.board, s * 0.21, 0.022, 0); w.scale.set(0.022, 0.2, 0.022); w.rotation.x = Math.PI / 2; });
    },
    sig: {
      dur: 4.6, L: [-0.3, 1.0, -0.35], R: [-0.3, 1.0, -0.35], ub: [0.0, 0.0], head: [-0.05, 0.2, 0],
      sit: { dur: 4.6, L: null, R: null, ub: [0.0, 0], head: [0.05, 0.0, 0.0], eyes: 0.2 },
      fx(c) {
        const { P } = c, vis = c.on && c.stand && !c.walk;
        P.board.visible = vis && c.e > 0.02;
        if (c.on && c.sit) { c.up.head.rotation.x += Math.sin(c.t * 7) * 0.12 * c.e; c.up.head.rotation.z += Math.sin(c.t * 3.5) * 0.06 * c.e; }
        if (!P.board.visible) return;
        P.board.position.y = -0.08 * (1 - smooth(0, 0.6, c.e));
        const sw = Math.sin(c.t * 2.4) * c.e;
        c.body.position.y += 0.067 * smooth(0.3, 0.8, c.e);
        c.body.position.x = sw * 0.06; P.board.position.x = sw * 0.06;
        c.body.rotation.z = sw * 0.1; P.board.rotation.z = sw * 0.1;
        c.up.ub.rotation.z += -sw * 0.08;
      },
    },
  },
  /* 7. 冰淇淋店員（男）：往上吹的蓬鬆大髮型、白底藍領水手制服＋小水手帽 */
  sailor: {
    adult: true, skin: SK.a, hair: 0x8a5a2b, top: 0xf6f4ee, sleeve: 0xf6f4ee, pelvis: 0x2b3a66, thigh: 0x2b3a66, shin: 0x2b3a66, shoe: 0x22252d,
    build(b) {
      const { g, P } = b;
      b.hairCap();
      const pomp = b.ball(0, 0.34, 0.05, 0.2, 0.11, 0.18, true); pomp.rotation.x = -0.3;   // 往上吹的大蓬頭
      const crest = b.ball(0, 0.4, 0.11, 0.13, 0.075, 0.1); crest.rotation.x = -0.55;
      b.sailorSuit(0x2b3f88);
      const hat = b.mk(b.lib.geo("sHat", () => new b.THREE.CylinderGeometry(0.1, 0.12, 0.07, 12)), b.m.white(), b.head, 0.07, 0.43, -0.08); hat.rotation.set(-0.35, 0, -0.35);
      const brim = b.mk(b.lib.geo("sBrim", () => new b.THREE.TorusGeometry(0.115, 0.022, 4, 14).rotateX(Math.PI / 2)), b.m.white(), b.head, 0.063, 0.405, -0.085); brim.rotation.set(-0.35, 0, -0.35);
      P.bat = new b.THREE.Group(); b.ub.add(P.bat); P.bat.visible = false;
      b.mk(g.bat(), b.m.std("wood", 0x8a5a32, 0.7), P.bat, 0, 0, 0);
      b.mk(g.nails(), b.m.metal(), P.bat, 0, 0, 0);
    },
    sig: {
      dur: 4.0, R: [-1.05, 0.3, -1.85], L: [-0.6, -0.2, -1.3], ub: [-0.06, 0.15], head: [-0.08, -0.15, -0.05],
      fx(c) {
        const B = c.P.bat; B.visible = c.on && c.e > 0.3;
        if (!B.visible) return;
        const h = c.hand(1), tap = Math.max(0, Math.sin(c.t * 4)) * 0.12;
        B.position.set(h.x, h.y - 0.02, h.z + 0.01); B.rotation.set(-0.85 - tap, 0, -0.45);
      },
    },
  },
  /* 8. 冰淇淋店員（女）：短髮、同款水手服 */
  sailor2: {
    adult: true, skin: SK.c, hair: 0x2b1d14, top: 0xf6f4ee, sleeve: 0xf6f4ee, pelvis: 0x2b3a66, thigh: 0x2b3a66, shin: 0x2b3a66, shoe: 0x22252d,
    build(b) {
      b.hairCap();
      b.ball(0, 0.15, -0.05, 0.225, 0.19, 0.2, true);      // 到耳下的短髮
      const f = b.ball(0.05, 0.3, 0.125, 0.15, 0.05, 0.08); f.rotation.set(0.4, 0, -0.25);
      b.sailorSuit(0x2b3f88);
      const hat = b.mk(b.lib.geo("sHat", () => new b.THREE.CylinderGeometry(0.1, 0.12, 0.07, 12)), b.m.white(), b.head, -0.07, 0.4, 0.02); hat.rotation.set(-0.15, 0, 0.3);
      const brim = b.mk(b.lib.geo("sBrim", () => new b.THREE.TorusGeometry(0.115, 0.022, 4, 14).rotateX(Math.PI / 2)), b.m.white(), b.head, -0.065, 0.375, 0.02); brim.rotation.set(-0.15, 0, 0.3);
    },
    sig: {
      dur: 4.2, talk: true,
      L: c => [-0.85 + Math.sin(c.t * 4.6) * 0.3, 0.3 + Math.sin(c.t * 3.1) * 0.2, -1.35 + Math.sin(c.t * 6.2) * 0.35],
      R: c => [-0.9 + Math.sin(c.t * 3.8 + 1) * 0.35, 0.35 + Math.sin(c.t * 2.7 + 2) * 0.25, -1.2 + Math.sin(c.t * 5.4 + 1) * 0.4],
      ub: [-0.02, 0], head: c => [Math.sin(c.t * 5) * 0.06, Math.sin(c.t * 1.3) * 0.25, Math.sin(c.t * 2.1) * 0.08],
      fx(c) { if (c.on) c.up.ub.rotation.y += Math.sin(c.t * 1.7) * 0.15 * c.e; },
    },
  },
  /* 9. 記者女孩：短捲髮、復古襯衫（大圓領） */
  reporter: {
    adult: true, skin: SK.a, hair: 0x9c5a2c, top: 0xe8d9a8, sleeve: 0xe8d9a8, pelvis: 0x6b4a3a, thigh: 0x6b4a3a, shin: 0x6b4a3a, shoe: 0x5a3324,
    build(b) {
      const { P } = b;
      const cc = b.mk(b.g.curlyCap(), b.m.hair(0x9c5a2c), b.head, 0, 0.17, -0.01, true); cc.rotation.x = -0.4; cc.scale.set(1.18, 1.12, 1.14);   // 短捲髮：蓬蓬一圈
      [-1, 1].forEach(s => b.curl(s * 0.19, 0.12, -0.03, 0.075, 0.09, 0.09));
      [-1, 1].forEach(s => { const fl = b.mk(b.lib.geo("collarFlap", () => new RoundedBoxGeometry(0.12, 0.07, 0.02, 1, 0.01)), b.m.white(), b.ub, s * 0.06, 0.465, 0.105); fl.rotation.set(-0.5, 0, s * 0.5); });
      P.note = b.mk(b.lib.geo("note", () => new b.THREE.BoxGeometry(0.1, 0.14, 0.014)), b.m.std("noteM", 0xa8321f, 0.7), b.ub, 0, 0, 0);
      P.pen = b.mk(b.g.cyl(), b.m.std("pen", 0x1d3d8f, 0.4), b.ub, 0, 0, 0); P.pen.scale.set(0.006, 0.11, 0.006);
      P.note.visible = P.pen.visible = false;
    },
    sig: {
      dur: 4.4, L: [-0.8, -0.35, -1.3], R: c => [-0.95 + Math.sin(c.t * 9) * 0.04, -0.1 + Math.sin(c.t * 13) * 0.05, -1.5], ub: [0.04, 0], head: [0.3, 0.06, 0.0], eyes: 0.8,
      fx(c) {
        const { P } = c, vis = c.on && c.e > 0.3; P.note.visible = P.pen.visible = vis;
        if (!vis) return;
        const a = c.hand(0), r = c.hand(1);
        P.note.position.set(a.x + 0.07, a.y + 0.04, a.z + 0.03); P.note.rotation.set(-0.7, 0.35, 0);
        P.pen.position.set(r.x - 0.01, r.y + 0.05, r.z + 0.02); P.pen.rotation.set(0.4, 0, 0.5);
      },
    },
  },
  /* 10. 攝影男孩：中長蓬髮、舊外套 */
  photographer: {
    adult: true, skin: SK.b, hair: 0x3a2618, top: 0x7a5a3a, sleeve: 0x7a5a3a, pelvis: 0x39404f, thigh: 0x39404f, shin: 0x39404f, shoe: 0x2a211a,
    build(b) {
      const { g, m, P } = b;
      b.hairCap();
      b.ball(0, 0.16, -0.08, 0.23, 0.22, 0.18, true);                          // 蓬蓬的後腦
      [-1, 1].forEach(s => b.ball(s * 0.18, 0.15, 0.0, 0.08, 0.14, 0.12));     // 兩側蓋過耳朵
      const top = b.ball(0.05, 0.3, 0.13, 0.15, 0.05, 0.08); top.rotation.set(0.45, 0, -0.25);
      b.vee(b.m.cloth(0x8c9aa0), 0.8, 1);
      P.cam = new b.THREE.Group(); b.head.add(P.cam); P.cam.position.set(0, 0.165, 0.265); P.cam.visible = false;
      b.mk(b.lib.geo("camBody", () => new RoundedBoxGeometry(0.2, 0.11, 0.07, 1, 0.015)), b.m.std("camM", 0x2a2a2c, 0.45, 0.3), P.cam, 0, 0, 0);
      const lens = b.mk(g.cyl(), m.metal(), P.cam, 0.04, -0.005, 0.05); lens.scale.set(0.035, 0.06, 0.035); lens.rotation.x = Math.PI / 2;
      P.flash = b.mk(g.ball(), m.flash(), P.cam, -0.06, 0.08, 0.03); P.flash.visible = false;
    },
    sig: {
      dur: 3.6, L: [-1.4, -0.45, -1.75], R: [-1.4, -0.45, -1.75], ub: [-0.04, 0], head: [-0.04, 0, 0], eyes: 0.5,
      fx(c) {
        const { P } = c; P.cam.visible = c.on && c.e > 0.4;
        const f = c.on ? Math.max(0, 1 - Math.abs(c.u - 0.55) / 0.04) : 0;
        P.flash.visible = P.cam.visible && f > 0;
        if (P.flash.visible) P.flash.scale.setScalar(0.03 + f * 0.12);
      },
    },
  },
  /* 11. 警長：寬肩、寬帽沿警長帽、小鬍子、卡其制服 */
  sheriff: {
    adult: true, wide: 1.2, skin: SK.c, hair: 0x5a4030, top: 0xc8b07a, sleeve: 0xc8b07a, pelvis: 0x6b5a3c, thigh: 0x6b5a3c, shin: 0x6b5a3c, shoe: 0x3b2a20,
    build(b) {
      const { g, m, head } = b;
      const cap = b.hairCap(); cap.scale.set(1.0, 0.85, 1.0);
      const hatM = b.m.std("hatM", 0x8a6a45, 0.7);
      const crown = b.mk(b.lib.geo("hCrown", () => new b.THREE.CylinderGeometry(0.15, 0.185, 0.15, 14)), hatM, head, 0, 0.36, -0.01, true); crown.rotation.x = -0.12;
      const brim = b.mk(b.lib.geo("hBrim", () => new b.THREE.CylinderGeometry(0.36, 0.36, 0.018, 20)), hatM, head, 0, 0.29, 0.0, true); brim.rotation.x = -0.12; brim.scale.set(1, 1, 0.92);
      const mus = b.mk(b.lib.geo("mustache", () => new b.THREE.CapsuleGeometry(0.019, 0.075, 3, 6).rotateZ(Math.PI / 2)), b.m.hair(0x4a3020), head, 0, 0.103, 0.193); mus.rotation.x = -0.3;
      const star = b.mk(g.star(), m.gold(), b.ub, -0.085, 0.32, 0.128); star.rotation.set(-0.12, 0, 0);
    },
    sig: {
      dur: 5.2,
      R: c => lerpA(HAND_SIP, [0.1, 0.62, -0.05, -1.3], smooth(0.45, 0.6, c.u)),
      L: c => lerpA([0.05, 0.1, -0.2, 0], [0.1, 0.62, -0.05, -1.3], smooth(0.45, 0.6, c.u)),
      ub: c => [-0.06 * smooth(0.45, 0.6, c.u), 0], head: c => [-0.2 + 0.12 * smooth(0.45, 0.6, c.u), 0, 0],
      fx(c) { if (c.on) c.cupOn = c.u < 0.48; },   // 前半大口喝咖啡，後半雙手扠腰挺胸
    },
  },
  /* 12. 媽媽：棕色中長髮、針織毛衣 */
  mom: {
    adult: true, skin: SK.a, hair: 0x6e4126, top: "knit", sleeve: "knit", pelvis: 0x4a4f63, thigh: 0x4a4f63, shin: 0x4a4f63, shoe: 0x6b4a3a,
    build(b) {
      const { P } = b;
      b.hairCap();
      b.ball(0, 0.1, -0.07, 0.235, 0.24, 0.19, true);                           // 蓬鬆中長髮
      [-1, 1].forEach(s => { const w = b.ball(s * 0.19, 0.06, 0.02, 0.075, 0.17, 0.12); w.rotation.z = -s * 0.15; });
      const f = b.ball(-0.05, 0.3, 0.13, 0.16, 0.05, 0.08); f.rotation.set(0.45, 0, 0.3);
      P.lights = new b.THREE.Group(); b.ub.add(P.lights); P.lights.visible = false;
      b.mk(b.g.lightsTube(), b.m.std("wire", 0x1e3b22, 0.6), P.lights, 0, 0, 0);
      const curve = lightsCurve(b.THREE), N = 7;
      const im = new b.THREE.InstancedMesh(b.lib.geo("bulb", () => new b.THREE.SphereGeometry(0.022, 6, 5).scale(1, 1.3, 1)), b.m.bulbs(), N);
      const o = new b.THREE.Object3D(), cols = [0xff3b30, 0xffd23f, 0x3ad66b, 0x3d7bff, 0xff8c1a, 0xff3b30, 0xffd23f];
      for (let i = 0; i < N; i++) { const p = curve.getPoint((i + 0.5) / N); o.position.set(p.x, p.y - 0.03, p.z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new b.THREE.Color(cols[i])); }
      im.castShadow = false; P.lights.add(im); P.bulbs = im; P.bulbCols = cols.map(c => new b.THREE.Color(c)); P.tmpC = new b.THREE.Color();
    },
    sig: {
      dur: 4.4, L: [-2.6, 0.5, -0.3], R: [-2.6, 0.5, -0.3], ub: [-0.06, 0], head: [-0.32, 0, 0], eyes: 1.3,
      fx(c) {
        const { P } = c; P.lights.visible = c.on && c.e > 0.3;
        if (!P.lights.visible) return;
        const a = c.hand(0), r = c.hand(1);
        P.lights.position.set((a.x + r.x) / 2, (a.y + r.y) / 2 + 0.02, (a.z + r.z) / 2);
        P.lights.scale.set(Math.max(0.2, Math.abs(r.x - a.x)), 1, 1);
        for (let i = 0; i < P.bulbCols.length; i++) {
          const k = 0.35 + 0.65 * (Math.sin(c.t * 6 + i * 1.9) > -0.2 ? 1 : 0);
          P.tmpC.copy(P.bulbCols[i]).multiplyScalar(k * 1.6); P.bulbs.setColorAt(i, P.tmpC);
        }
        P.bulbs.instanceColor.needsUpdate = true;
      },
    },
  },
  /* 13. 重金屬學長：黑色長捲髮、皮外套＋背心 */
  metalhead: {
    adult: true, skin: SK.a, hair: 0x141210, top: 0x1c1c1f, sleeve: 0x1c1c1f, pelvis: 0x3d4a66, thigh: 0x3d4a66, shin: 0x3d4a66, shoe: 0x111111, shiny: true,
    build(b) {
      const { g, P } = b;
      b.hairCap();
      b.curl(0, 0.02, -0.1, 0.25, 0.34, 0.14, true);                              // 長捲髮到背
      [-1, 1].forEach(s => { b.curl(s * 0.19, 0.06, 0.0, 0.085, 0.2, 0.11); b.curl(s * 0.18, -0.12, -0.02, 0.08, 0.08, 0.09); });   // 兩側捲捲往下
      b.vee(b.m.cloth(0x4a5a78), 1.1, 1.05);                // 皮外套裡的牛仔背心
      b.vee(b.m.cloth(0x2a2a2e), 0.5, 0.85, 0.012);         // 背心裡的黑 T
      P.guitar = new b.THREE.Group(); b.ub.add(P.guitar); P.guitar.visible = false;
      b.mk(g.gbody(), b.m.std("gRed", 0xc8202a, 0.3, 0.2), P.guitar, 0, 0, 0);
      const neck = b.mk(b.lib.geo("gNeck", () => new b.THREE.BoxGeometry(0.035, 0.42, 0.022).translate(0, 0.3, 0)), b.m.std("gNeckM", 0x5a3a20, 0.6), P.guitar, 0, 0, 0.005);
      b.mk(b.lib.geo("gHead", () => new RoundedBoxGeometry(0.06, 0.1, 0.022, 1, 0.008).translate(0, 0.55, 0)), b.m.std("gHeadM", 0x16161a, 0.4), P.guitar, 0, 0, 0.005);
    },
    sig: {
      dur: 4.6, L: [-1.0, 0.6, -1.15, -0.6], R: c => [-0.55, -0.35, -1.0 + Math.sin(c.t * 16) * 0.22], ub: [-0.06, 0.1], head: [0.12, 0.1, 0.05],
      fx(c) {
        const { P } = c; P.guitar.visible = c.on && c.e > 0.25;
        if (!P.guitar.visible) return;
        P.guitar.position.set(0.04, 0.13, 0.22); P.guitar.rotation.set(0.0, 0.0, 0.95);
        const big = c.stand ? 1 : 0.4;
        c.up.head.rotation.x += Math.sin(c.t * 8) * 0.28 * c.e * big;
        c.up.ub.rotation.x += (-0.12 + Math.sin(c.t * 8 + 1) * 0.05) * c.e * big;
        if (c.stand && !c.walk) c.body.rotation.z = Math.sin(c.t * 2) * 0.06 * c.e;
      },
    },
  },
  /* 14. 小妹：兩側髮髻、冰淇淋店帽子 */
  sister: {
    skin: SK.d, hair: 0x2a1b12, top: 0xf2b8c8, sleeve: 0xf2b8c8, pelvis: 0x5a7fc0, thigh: 0x5a7fc0, shin: "skin", shoe: 0xe8e4dc, small: 0.92,
    build(b) {
      const { g, P } = b;
      b.hairCap();
      [-1, 1].forEach(s => b.ball(s * 0.2, 0.31, -0.03, 0.08));                 // 兩側髮髻
      const hat = b.mk(b.lib.geo("paperHat", () => new RoundedBoxGeometry(0.3, 0.085, 0.13, 1, 0.03)), b.m.white(), b.head, 0, 0.36, 0.0, true); hat.rotation.x = -0.15;
      const stripe = b.mk(b.lib.geo("hatStripe", () => new b.THREE.BoxGeometry(0.305, 0.02, 0.135)), b.m.std("hatRed", 0xd8342c, 0.6), b.head, 0, 0.345, 0.0); stripe.rotation.x = -0.15;
      P.cone = new b.THREE.Group(); b.ub.add(P.cone); P.cone.visible = false;
      b.mk(g.cone(), b.m.std("coneM", 0xd9a35a, 0.8), P.cone, 0, 0, 0);
      const sc = b.mk(g.ball(), b.m.std("scoop", 0xf7a9c4, 0.6), P.cone, 0, 0.075, 0); sc.scale.setScalar(0.05);
    },
    sig: {
      dur: 3.8, R: [-1.3, -0.4, -2.1], ub: [-0.08, 0], head: [-0.34, 0.0, 0.12], roll: true,
      fx(c) {
        const C = c.P.cone; C.visible = c.on && c.e > 0.3;
        if (C.visible) { const h = c.hand(1); C.position.set(h.x - 0.01, h.y + 0.08, h.z + 0.03); C.rotation.set(0.2, 0, 0.1); }
      },
    },
  },
};

/* ---------- 造人 ---------- */
export function createCastMember({ THREE, id, seed = 1 }) {
  const D = DEFS[id] || DEFS.psychic;
  const lb = lib(THREE), { g, m } = lb;
  const adult = !!D.adult, K = adult ? 1.15 : (D.small || 1);
  const LEN = { sit: [adult ? 0.3 : 0.26, 0.36], stand: adult ? [0.24, 0.24] : [0.17, 0.17] };
  const SIT_HIP = 0.5, standHip = LEN.stand[0] + LEN.stand[1] + 0.219 + 0.01;
  const r = rng(seed * 2654435761 + id.length * 977 + 7);
  const ph = r() * 20, blinkP = 3 + r() * 2.5, lookP = 8 + r() * 6, lookDir = r() < 0.5 ? -1 : 1;

  const group = new THREE.Group(); group.name = "cast-" + id;
  const body = new THREE.Group(); group.add(body);
  const matOf = (v, fallback) => v === "skin" ? m.skin(D.skin) : typeof v === "string" ? m.pat(v) : m.cloth(v ?? fallback);
  const topM = D.shiny ? m.std("leather", 0x1c1c1f, 0.32, 0.15) : matOf(D.top), sleeveM = D.shiny ? topM : matOf(D.sleeve), skinM = m.skin(D.skin);
  const W = D.wide || 1;

  // 下半身
  const pelvis = mk(THREE, g.pelvis(), matOf(D.pelvis), body, 0, SIT_HIP, 0.02, true);
  pelvis.scale.set(adult ? 1.1 * W : 1, 1, adult ? 1.1 : 1);
  const legRoot = new THREE.Group(); body.add(legRoot);
  const legs = [-1, 1].map(side => {
    const hip = new THREE.Group(); hip.position.set(side * 0.09 * (adult ? 1.1 : 1), 0, 0); legRoot.add(hip);
    const thigh = mk(THREE, g.leg(0.2, 0.075), matOf(D.thigh), hip, 0, 0, 0, true);
    const knee = new THREE.Group(); hip.add(knee);
    const shin = mk(THREE, g.leg(0.2, 0.066), matOf(D.shin), knee);
    const foot = new THREE.Group(); knee.add(foot);
    mk(THREE, g.shoe(), m.std("shoe" + D.shoe, D.shoe, 0.45), foot, 0, -0.01, 0.04);
    return { hip, knee, foot, thigh, shin };
  });

  // 上半身（原點＝骨盆上緣）
  const ub = new THREE.Group(); ub.scale.setScalar(K); body.add(ub);
  const torso = mk(THREE, g.torso(), topM, ub, 0, 0.25, 0, true); torso.scale.set(W, 1, 0.8);
  const arms = [-1, 1].map(side => {
    const sh = new THREE.Group(); sh.position.set(side * 0.205 * W, 0.42, 0); ub.add(sh);
    mk(THREE, g.upperArm(), sleeveM, sh);
    const el = new THREE.Group(); el.position.y = -0.2; sh.add(el);
    mk(THREE, g.foreArm(), sleeveM, el);
    const hand = mk(THREE, g.hand(), skinM, el, 0, -0.205, 0);
    return { sh, el, hand, side };
  });
  const head = new THREE.Group(); head.position.y = 0.48; ub.add(head);
  const skull = mk(THREE, g.head(), skinM, head, 0, 0.16, 0, true); skull.scale.set(1.05, 0.97, 1);
  [-1, 1].forEach(s => { const e = mk(THREE, g.ear(), skinM, head, s * 0.207, 0.15, -0.01); e.scale.set(0.55, 1, 0.8); });
  const eyes = [-1, 1].map(s => { const e = mk(THREE, g.eye(), m.eye(), head, s * 0.072, 0.17, 0.178); e.scale.set(0.9, 1.25, 0.6); return e; });
  [-1, 1].forEach(s => { const c = mk(THREE, g.cheek(), m.cheek(), head, s * 0.115, 0.1, 0.162); c.scale.set(1, 0.6, 0.45); });
  mk(THREE, g.nose(), skinM, head, 0, 0.125, 0.198);
  const mouthY = 0.075, mouthZ = 0.188;
  const smile = mk(THREE, g.arc(), m.mouth(), head, 0, mouthY + 0.02, mouthZ); smile.rotation.set(-0.25, 0, Math.PI);
  const frown = mk(THREE, g.arc(), m.mouth(), head, 0, mouthY - 0.022, mouthZ - 0.004); frown.rotation.set(-0.25, 0, 0); frown.scale.set(0.8, 0.6, 1);
  const flat = mk(THREE, g.flat(), m.mouth(), head, 0, mouthY, mouthZ + 0.002);
  const mouths = { 1: smile, 0: flat, "-1": frown };
  const brows = [-1, 1].map(s => { const b = mk(THREE, g.brow(), m.brow(D.hair), head, s * 0.074, 0.232, 0.168); b.rotation.x = -0.35; return b; });
  const sweat = [0, 1].map(i => { const d = mk(THREE, g.drop(), m.sweat(), head); d.visible = false; d.userData.side = i ? -1 : 1; return d; });
  const up = { ub, head, arms, eyes, brows, mouths };

  // 共用道具：咖啡杯（右手）、手機（左手）、錢袋（右手，走路送件用）
  const cup = mk(THREE, g.cup(), m.cupM(), ub); cup.visible = false;
  const phone = mk(THREE, g.phone(), m.phoneM(), ub); phone.visible = false;
  const bag = new THREE.Group(); bag.position.set(0, -0.23, 0); arms[1].el.add(bag); bag.visible = false;
  const bagTuft = mk(THREE, g.bagTuft(), m.gold(), bag, 0, -0.03, 0);
  const sack = mk(THREE, g.bag(), m.gold(), bag, 0, -0.13, 0); sack.scale.set(1, 0.92, 0.9);

  // 造型
  const P = {};
  const hairM = m.hair(D.hair);
  const B = {
    THREE, lib: lb, g, m, group, body, ub, head, P, HIP: SIT_HIP,
    mk: (geo, mat, parent, x, y, z, sh) => mk(THREE, geo, mat, parent, x, y, z, sh),
    hairCap: () => { const c = mk(THREE, g.cap(), hairM, head, 0, 0.165, -0.005, true); c.rotation.x = -0.42; c.scale.set(1.05, 1, 1.02); return c; },
    ball: (x, y, z, sx, sy = sx, sz = sx, shadow = false) => { const b = mk(THREE, g.ball(), hairM, head, x, y, z, shadow); b.scale.set(sx, sy, sz); return b; },
    curl: (x, y, z, sx, sy = sx, sz = sx, shadow = false) => { const b = mk(THREE, g.curly(), hairM, head, x, y, z, shadow); b.scale.set(sx, sy, sz); return b; },
    vee: (mat, sx = 1, sy = 1, dz = 0) => { const v = mk(THREE, g.vee(), mat, ub, 0, 0.31, 0.112 + dz); v.rotation.x = -0.22; v.scale.set(sx * W, sy, 1); return v; },
    sailorSuit: navy => {     // 水手服：藍色大方領（背後一片＋前面 V 領）＋紅領巾
      const nv = m.cloth(navy);
      const back = mk(THREE, lb.geo("sBack", () => new RoundedBoxGeometry(0.3, 0.17, 0.02, 1, 0.008)), nv, ub, 0, 0.44, -0.12); back.rotation.x = 0.25;
      const ring = mk(THREE, lb.geo("sRing", () => new THREE.TorusGeometry(0.115, 0.04, 4, 14).rotateX(Math.PI / 2)), nv, ub, 0, 0.47, 0.0); ring.scale.set(1.15, 0.6, 1.15); ring.rotation.x = 0.35;
      const tie = mk(THREE, lb.geo("sTie", () => new THREE.ConeGeometry(0.035, 0.1, 4).rotateX(Math.PI)), m.red(), ub, 0, 0.37, 0.14); tie.rotation.x = -0.15;
    },
  };
  D.build(B);
  // 大塊頭髮投影已在 hairCap / ball(shadow) 設定；其餘關掉接收陰影
  group.traverse(o => { if (o.isMesh) o.receiveShadow = false; });

  // 招牌動作（坐姿可以有自己的版本）
  const SIG = Object.assign({ name: CAST.find(x => x.id === id)?.sig || "sig" }, D.sig);
  const sigFor = sit => (sit && D.sig.sit ? Object.assign({}, SIG, D.sig.sit) : SIG);

  const st = { pose: "sit", mood: 0, alert: null, act: null, actT0: 0, nextAt: 2 + r() * 8, sway: 0, look: 0, w: 0, wb: 0, carry: false, redE: 0, lastT: 0 };
  const v = { h0: new THREE.Vector3(), h1: new THREE.Vector3() };
  const C = {
    P, up, body, group, v3: new THREE.Vector3(), v4: new THREE.Vector3(), v5: new THREE.Vector3(), UP: new THREE.Vector3(0, 1, 0),
    hand(i) { const a = arms[i], o = i ? v.h1 : v.h0; return o.set(0, -0.205, 0).applyEuler(a.el.rotation).add(a.el.position).applyEuler(a.sh.rotation).add(a.sh.position); },
  };

  function setPose(p) {
    st.pose = p === "stand" || p === "walk" ? p : "sit";
    const sit = st.pose === "sit", [th, sh] = sit ? LEN.sit : LEN.stand;
    const hipY = sit ? SIT_HIP : standHip;
    legs.forEach(l => {
      l.thigh.geometry = g.leg(th, 0.075); l.shin.geometry = g.leg(sh, 0.066);
      l.knee.position.y = -(th + 0.075 * 1.2); l.foot.position.y = -(sh + 0.066 * 1.2);
    });
    B.HIP = hipY;
    pelvis.position.y = hipY; legRoot.position.set(0, hipY - 0.01, sit ? 0.03 : 0);
    if (D.onPose) D.onPose(B, st.pose);
    if (RM) pose(st.lastT, 1);
  }
  function setMood(vv) {
    st.mood = vv > 0 ? 1 : vv < 0 ? -1 : 0;
    const alt = D.mouth && D.mouth(st.mood);
    for (const k in mouths) mouths[k].visible = !alt && String(st.mood) === k;
    if (P.grin) P.grin.visible = alt === "grin";
    brows.forEach((b, i) => { const s = i === 0 ? -1 : 1; b.rotation.z = st.mood < 0 ? s * -0.38 : st.mood > 0 ? s * 0.12 : 0; b.position.y = st.mood < 0 ? 0.226 : 0.234; });
  }
  function setAlert(a) {
    st.alert = a === "red" || a === "yellow" ? a : null;
    sweat.forEach(d => { d.visible = st.alert === "red" && id !== "psychic"; });
    if (st.alert === "red" && id !== "psychic") { st.act = "panic"; st.actT0 = st.lastT; }
    if (RM) pose(st.lastT, 1);
  }
  function pick() {
    if (st.alert === "red") return r() < 0.6 ? "panic" : "headdown";
    const w = { stretch: 1, sip: 1.4, phone: 1, think: 1.2, swivel: st.pose === "sit" ? 1.1 : 0, yawn: 0.4, celebrate: st.mood > 0 ? 1.3 : 0, headdown: st.mood < 0 ? 1.2 : 0, [SIG.name]: 4.5 };
    let sum = 0; for (const k in w) sum += w[k];
    let x = r() * sum; for (const k in w) { x -= w[k]; if (x <= 0) return k; }
    return SIG.name;
  }
  const actDef = name => name === SIG.name ? sigFor(st.pose === "sit") : ACTS[name];
  function activity(t) {
    if (!st.act && t >= st.nextAt && st.pose !== "walk") { st.act = pick(); st.actT0 = t; }
    if (!st.act) return [null, 0, 0];
    const A = actDef(st.act), tt = t - st.actT0;
    if (!A || tt > A.dur) { st.act = null; st.nextAt = t + (st.alert === "red" ? 2.5 : 5) + r() * 7; return [null, 0, 0]; }
    return [A, smooth(0, 0.45, tt) * (1 - smooth(A.dur - 0.45, A.dur, tt)), tt];
  }
  const val = (x, c) => typeof x === "function" ? x(c) : x;

  function placeSweat(t) {
    sweat.forEach((d, i) => {
      const p = ((t * 0.7 + i / 2) % 1 + 1) % 1, s = d.userData.side;
      d.position.set(s * 0.18, 0.3 - p * 0.24, 0.1 - i * 0.02);
      const k = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85 * 0.85; d.scale.setScalar(Math.max(0.05, k) * 1.5);
    });
  }

  function pose(t, dt) {
    st.lastT = t;
    const red = st.alert === "red", yel = st.alert === "yellow";
    const sit = st.pose === "sit", walk = st.pose === "walk", stand = !sit;
    const psyRed = red && id === "psychic";
    // 腿
    st.wb = damp(st.wb, walk ? 1 : 0, 6, dt); if (walk) st.w += dt * 8.5;
    const s = Math.sin(st.w), c = Math.cos(st.w), wb = sit ? 0 : st.wb;
    legs.forEach((l, i) => {
      const sg = i === 0 ? 1 : -1;
      if (sit) { l.hip.rotation.x = -Math.PI / 2 + 0.05; l.knee.rotation.x = Math.PI / 2 - 0.05; }
      else { l.hip.rotation.x = -s * sg * 0.55 * wb; l.knee.rotation.x = Math.max(0, sg * c) * 0.8 * wb; }
      l.foot.rotation.x = -l.hip.rotation.x - l.knee.rotation.x;
    });
    const bob = Math.abs(s) * 0.035 * wb;
    body.position.set(0, bob, 0); body.rotation.set(0, 0, 0);
    // 動作
    let [A, e, tt] = activity(t);
    let name = st.act;
    if (psyRed) { st.redE = damp(st.redE, 1, 4, dt); A = SIG; e = st.redE; tt = t % SIG.dur; name = SIG.name; }
    else st.redE = 0;
    const isSig = !!A && name === SIG.name;
    const cc = Object.assign(C, { t, tt, u: A ? tt / A.dur : 0, e, on: isSig && !psyRed, psyRed, sit, stand, walk, red, cupOn: false });
    const mix = (a, b) => a + (b - a) * e;

    const speed = red ? 1.6 : 1;
    st.sway = damp(st.sway, red && !psyRed ? 1 : 0, 3, dt);
    const ubA = A ? val(A.ub, cc) || [0, 0] : null;
    const swivelY = A && A.swivel ? Math.sin(tt * 1.9) * ubA[1] : (ubA ? ubA[1] : 0);
    const baseLean = sit ? 0.1 : walk ? 0.06 * wb : 0;
    const breathe = Math.sin(t * 1.8 + ph) * 0.004;
    ub.rotation.x = mix(baseLean, ubA ? ubA[0] + baseLean : baseLean) + Math.sin(t * 1.4 + ph) * 0.012;
    ub.rotation.y = (A ? swivelY * e : 0) + s * 0.08 * wb;
    ub.rotation.z = Math.sin(t * 4.2) * 0.07 * st.sway + (stand && !walk ? Math.sin(t * 0.7 + ph) * 0.015 : 0);
    ub.position.y = B.HIP + 0.02 + breathe + bob;

    // 手臂
    const watch = yel && !A && sit ? pulse(t, 6.5, 2.2, ph) : 0;
    let Lp = A ? val(A.L, cc) : null, Rp = A ? val(A.R, cc) : null;
    if (psyRed) Lp = Rp = null, Lp = [-1.4, 0.35, -0.15], Rp = [-1.5, 0.12, -0.05];
    arms.forEach(({ sh, el, side }, i) => {
      let sx, sz, ex, ez = 0, ey = 0;
      if (sit) {
        const tap = Math.sin(t * 15 * speed + i * Math.PI + ph) * 0.07 + Math.sin(t * 23 * speed + i) * 0.03;
        sx = -1.0 + tap * 0.3; ex = -0.72 + tap; sz = -side * 0.14;
        if (i === 0 && watch > 0) { sx += (-0.25 - sx) * watch; ex += (-1.75 - ex) * watch; sz += (0.55 - sz) * watch; ey = 0.9 * watch; }
      } else {
        const sg = i === 0 ? 1 : -1, carry = st.carry && i === 1 && walk;
        sx = 0.04 + Math.sin(t * 1.3 + ph + i) * 0.025;
        sx = sx * (1 - wb) + (s * sg * (carry ? 0.18 : 0.6) + (carry ? -0.12 : 0)) * wb;
        sz = side * (carry ? 0.18 : 0.1);
        ex = -0.18 * (1 - wb) + (carry ? -0.35 : -0.25 - Math.max(0, -s * sg) * 0.4) * wb;
      }
      const Pp = i === 0 ? Lp : Rp;
      if (Pp) {
        let [px, pz, pe, pez = 0] = Pp;
        if (A.wave) { px += Math.sin(t * 9 + i * Math.PI) * 0.18; pz += Math.sin(t * 9 + i) * 0.12; }
        if (A.shake) { px += Math.sin(t * 13 + i) * 0.08; }
        if (A.talk && i === 0) pe += Math.sin(t * 2.3) * 0.05;
        if (psyRed) { px += Math.sin(t * 27 + i) * 0.03; }
        sx = mix(sx, px); sz = mix(sz, side * pz); ex = mix(ex, pe); ez = mix(0, side * pez);
      }
      sh.rotation.set(sx, 0, sz); el.rotation.set(ex, ey, ez);
    });

    // 頭
    const away = A ? 0 : pulse(t, lookP, 2.0, ph) * lookDir;
    const lookT = yel ? Math.max(Math.abs(away), pulse(t, 3.1, 1.0, ph * 0.5)) * (away < 0 ? -1 : 1) : away;
    st.look = damp(st.look, lookT * 0.55, 6, dt);
    const nod = sit ? 0.1 + Math.sin(t * 2.1 * speed + ph) * 0.035 : -0.03 + Math.sin(t * 1.2 + ph) * 0.02;
    const hx = nod + watch * 0.25 + (walk ? Math.sin(st.w * 2) * 0.02 * wb : 0), hy = st.look * (1 - watch) - watch * 0.5 - (walk ? ub.rotation.y : 0);
    const hz = Math.sin(t * 0.9 + ph) * 0.025 - (red && !psyRed ? Math.sin(t * 4.2) * 0.05 : 0);
    const hA = A ? val(A.head, cc) : null;
    head.rotation.x = hA ? mix(hx, hA[0] + (A.talk ? Math.sin(t * 6) * 0.03 : 0)) : hx;
    head.rotation.y = hA ? mix(hy, hA[1] + (A.swivel ? -swivelY * 0.4 : 0)) : hy;
    head.rotation.z = hA ? mix(hz, hA[2]) : hz;

    // 眼睛：眨眼、瞇眼、翻白眼
    const bp = (t + ph) % blinkP, blink = bp < 0.14 ? Math.sin(bp / 0.14 * Math.PI) : 0;
    const roll = A && A.roll && e > 0.5;
    const open = (red ? 1.45 : 1.25) * (A && A.eyes != null ? mix(1, A.eyes) : 1);
    eyes.forEach(e2 => {
      e2.material = roll ? m.eyeWhite() : m.eye();
      e2.position.y = roll ? 0.182 : 0.17;
      e2.scale.y = roll ? 0.85 : open * (1 - 0.9 * blink);
    });
    // 嘴
    const talking = A && (A.talk || A.yawn);
    if (talking) mouths["0"].scale.y = 1 + (A.yawn ? 5 * e : Math.abs(Math.sin(t * 9)) * 3 * e);
    else mouths["0"].scale.y = 1;
    if (talking && !mouths["0"].visible) { for (const k in mouths) mouths[k].visible = k === "0"; if (P.grin) P.grin.visible = false; st.mouthTalk = true; }
    else if (!talking && st.mouthTalk) { st.mouthTalk = false; setMood(st.mood); }

    // 招牌動作的道具與額外擺動
    if (SIG.fx) SIG.fx(cc);
    cup.visible = !!(A && (A.prop === "cup" || cc.cupOn) && e > 0.3);
    if (cup.visible) { const h = C.hand(1); cup.position.set(h.x - 0.02, h.y + 0.05, h.z + 0.04); }
    phone.visible = !!(A && A.prop === "phone" && e > 0.3);
    if (phone.visible) { const h = C.hand(0); phone.position.set(h.x + 0.02, h.y + 0.05, h.z + 0.03); phone.rotation.set(0, -0.4, 0.15); }
    // 錢袋（只在走路時）：保持下垂
    bag.visible = st.carry && walk;
    if (bag.visible) {
      const ra = arms[1];
      bag.rotation.x = -(ra.sh.rotation.x + ra.el.rotation.x) - ub.rotation.x + Math.sin(st.w - 0.8) * 0.15 * wb;
      bag.rotation.z = -ra.sh.rotation.z;
    }
    if (red && !psyRed) placeSweat(t);
  }

  setPose("sit"); setMood(0); pose(0, 1);

  return {
    group,
    setPose(p) { setPose(p); },
    setMood(vv) { setMood(vv); if (RM) pose(st.lastT, 1); },
    setAlert,
    play(name, t = st.lastT) { if (ACTS[name] || name === SIG.name) { st.act = name; st.actT0 = t; } },
    update(t, dt) { if (RM) return; pose(t, dt || 0.016); },
    carry(positive = true) {
      st.carry = true;
      const mb = positive ? m.gold() : m.red(); sack.material = mb; bagTuft.material = mb;
      if (RM) pose(st.lastT, 1);
    },
    get act() { return st.act; },
  };
}
