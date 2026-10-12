// 工位：桌、椅、筆電、桌燈、類型道具、隨機裝飾。介面見 README.md。
// 座標：group 原點＝桌子正下方地板中心；人坐 −z 側臉朝 +z；相機在 +z/+x 高處。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOP_Y = 0.75;                       // 桌面上緣
const C_POS = 0x34d399, C_NEG = 0xf87171, C_MUT = 0x9ca3af;

/* ---------- 模組層級共用：紋理、材質、幾何 ---------- */
let S = null;
function woodTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#c9945a"; g.fillRect(0, 0, 512, 256);
  let r = 7;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {                      // 木紋：橫向的細長波浪線
    const y = rnd() * 256, a = 0.05 + rnd() * 0.12, w = 0.6 + rnd() * 2.2;
    g.strokeStyle = rnd() < 0.5 ? `rgba(120,72,32,${a})` : `rgba(240,200,150,${a})`;
    g.lineWidth = w; g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 70 + i) * 3 + Math.sin(x / 23) * 1.2);
    g.stroke();
  }
  for (let i = 0; i < 3; i++) {                       // 幾個木節
    const x = rnd() * 512, y = rnd() * 256;
    const gr = g.createRadialGradient(x, y, 1, x, y, 14);
    gr.addColorStop(0, "rgba(110,62,28,.45)"); gr.addColorStop(1, "rgba(110,62,28,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 18, 6, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function screenTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = "#0f1a2e"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#1e2d4a"; g.fillRect(0, 0, 256, 18);
  g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1;
  for (let y = 30; y < 160; y += 22) { g.beginPath(); g.moveTo(8, y); g.lineTo(248, y); g.stroke(); }
  for (let i = 0; i < 22; i++) {                     // K 線
    const x = 14 + i * 10.5, o = 60 + Math.sin(i * 0.7) * 30 + (i % 3) * 6, cl = o + (i % 2 ? 14 : -12);
    g.fillStyle = cl < o ? "#34d399" : "#f87171";
    g.fillRect(x, Math.min(o, cl), 6, Math.abs(cl - o) + 2);
    g.fillRect(x + 2.5, Math.min(o, cl) - 6, 1, Math.abs(cl - o) + 14);
  }
  g.strokeStyle = "#fbbf24"; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i < 24; i++) g.lineTo(10 + i * 10.4, 120 - Math.sin(i * 0.5) * 12 - i * 1.4);
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shared() {
  if (S) return S;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const wood = woodTexture();
  S = {
    m: {
      wood: std({ map: wood, roughness: 0.55, metalness: 0 }),
      woodEdge: std({ color: 0xa8743f, roughness: 0.6 }),
      metal: std({ color: 0x3a3f47, metalness: 0.85, roughness: 0.32 }),
      chrome: std({ color: 0xd7dbe0, metalness: 1, roughness: 0.18 }),
      panel: std({ color: 0xe8e1d6, roughness: 0.8 }),
      black: std({ color: 0x23262b, roughness: 0.6 }),
      alu: new THREE.MeshPhysicalMaterial({ color: 0xc9ced6, metalness: 0.75, roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
      keys: std({ color: 0x2c3038, roughness: 0.7 }),
      screen: std({ map: screenTexture(), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.25 }),
      gold: new THREE.MeshPhysicalMaterial({ color: 0xf5b82e, metalness: 1, roughness: 0.22, clearcoat: 0.6, emissive: 0x6b4300, emissiveIntensity: 0.25 }),
      shelf: std({ color: 0xf1ebe1, roughness: 0.5 }),
      box: std({ color: 0xc8955c, roughness: 0.85 }),
      boxTape: std({ color: 0xe9d6a8, roughness: 0.6 }),
      pig: new THREE.MeshPhysicalMaterial({ color: 0xf6a5b8, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
      pigDark: std({ color: 0xd9748f, roughness: 0.4 }),
      ceramic: new THREE.MeshPhysicalMaterial({ color: 0xfaf7f2, roughness: 0.3, clearcoat: 0.8 }),
      coffee: std({ color: 0x3b2416, roughness: 0.2 }),
      pot: std({ color: 0xc8643c, roughness: 0.7 }),
      soil: std({ color: 0x4a3426, roughness: 1 }),
      leaf: std({ color: 0x4caf6a, roughness: 0.6 }),
      leaf2: std({ color: 0x2f8f55, roughness: 0.6 }),
      paper: std({ color: 0xfbfbf8, roughness: 0.9 }),
      folder: std({ color: 0x5b8def, roughness: 0.7 }),
      lampBody: std({ color: 0x2f3a4a, metalness: 0.4, roughness: 0.35 }),
    },
    mugColors: [0xfaf7f2, 0xf2c14e, 0x6aa9e9, 0xe86f68, 0x8bc79a].map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, clearcoat: 0.8 })),
    noteColors: [0xfde68a, 0xfbcfe8, 0xbae6fd, 0xbbf7d0, 0xfed7aa].map(c => std({ color: c, roughness: 0.9, side: THREE.DoubleSide })),
    chairColors: [0x334155, 0x3f6e8c, 0x7c4a3a, 0x4d5f45, 0x5b4b7a].map(c => std({ color: c, roughness: 0.85 })),
    g: {
      top: new RoundedBoxGeometry(1.8, 0.06, 0.9, 3, 0.025),
      leg: new THREE.CylinderGeometry(0.028, 0.034, TOP_Y - 0.06, 14),
      foot: new THREE.CylinderGeometry(0.045, 0.05, 0.02, 14),
      rail: new THREE.CylinderGeometry(0.018, 0.018, 1, 10),
      panel: new RoundedBoxGeometry(1.5, 0.36, 0.025, 2, 0.01),
      drawer: new RoundedBoxGeometry(0.42, 0.5, 0.62, 3, 0.03),
      knob: new RoundedBoxGeometry(0.16, 0.022, 0.025, 2, 0.01),
      // 椅子
      seat: new RoundedBoxGeometry(0.5, 0.08, 0.48, 4, 0.04),
      back: new RoundedBoxGeometry(0.48, 0.5, 0.07, 4, 0.035),
      backPost: new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8),
      gas: new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12),
      spoke: new RoundedBoxGeometry(0.32, 0.03, 0.05, 2, 0.012),
      caster: new THREE.SphereGeometry(0.032, 10, 8),
      arm: new RoundedBoxGeometry(0.05, 0.035, 0.3, 2, 0.015),
      armPost: new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8),
      // 筆電
      lapBase: new RoundedBoxGeometry(0.4, 0.02, 0.28, 2, 0.008),
      lapKeys: new THREE.PlaneGeometry(0.34, 0.13),
      lapPad: new THREE.PlaneGeometry(0.11, 0.07),
      lapLid: new RoundedBoxGeometry(0.4, 0.27, 0.012, 2, 0.005),
      lapScreen: new THREE.PlaneGeometry(0.37, 0.235),
      logo: new THREE.CircleGeometry(0.032, 24),
      logoRing: new THREE.RingGeometry(0.042, 0.05, 28),
      // 桌燈
      lampBase: new THREE.CylinderGeometry(0.07, 0.085, 0.025, 20),
      lampArm: new THREE.CylinderGeometry(0.011, 0.011, 1, 8),
      joint: new THREE.SphereGeometry(0.02, 10, 8),
      shade: new THREE.ConeGeometry(0.085, 0.11, 22, 1, true),
      shadeCap: new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      bulb: new THREE.SphereGeometry(0.03, 12, 10),
      // grid 道具
      shelfBoard: new RoundedBoxGeometry(0.3, 0.02, 0.24, 2, 0.008),
      shelfPost: new THREE.CylinderGeometry(0.01, 0.01, 0.42, 8),
      coin: new THREE.CylinderGeometry(0.055, 0.055, 0.014, 28),
      coinRim: new THREE.TorusGeometry(0.055, 0.005, 6, 28),
      // mart 道具
      box: new RoundedBoxGeometry(0.26, 1, 0.2, 2, 0.006),
      tape: new THREE.PlaneGeometry(0.05, 0.2),
      sign: new RoundedBoxGeometry(0.18, 0.1, 0.012, 2, 0.005),
      signFace: new THREE.PlaneGeometry(0.165, 0.085),
      // 存錢筒
      pigBody: new THREE.SphereGeometry(0.1, 24, 18),
      pigSnout: new THREE.CylinderGeometry(0.038, 0.042, 0.04, 18),
      pigNostril: new THREE.CircleGeometry(0.007, 8),
      pigEar: new THREE.ConeGeometry(0.026, 0.045, 12),
      pigLeg: new THREE.CylinderGeometry(0.022, 0.024, 0.05, 10),
      pigEye: new THREE.SphereGeometry(0.009, 8, 6),
      pigSlot: new RoundedBoxGeometry(0.07, 0.008, 0.012, 1, 0.003),
      pigTail: new THREE.TorusGeometry(0.018, 0.005, 6, 14, Math.PI * 1.5),
      // 裝飾
      mug: new THREE.CylinderGeometry(0.042, 0.038, 0.1, 20, 1, true),
      mugBottom: new THREE.CircleGeometry(0.038, 20),
      mugCoffee: new THREE.CircleGeometry(0.039, 20),
      mugHandle: new THREE.TorusGeometry(0.026, 0.008, 8, 16, Math.PI),
      pot: new THREE.CylinderGeometry(0.065, 0.048, 0.11, 18),
      potRim: new THREE.TorusGeometry(0.065, 0.01, 8, 22),
      soil: new THREE.CircleGeometry(0.058, 18),
      leaf: new THREE.SphereGeometry(0.05, 10, 8),
      leafBlade: new THREE.ConeGeometry(0.025, 0.2, 6),
      sheet: new THREE.BoxGeometry(0.21, 0.004, 0.297),
      folder: new RoundedBoxGeometry(0.23, 0.012, 0.31, 1, 0.004),
      note: new THREE.PlaneGeometry(0.075, 0.075),
      mouse: new THREE.CapsuleGeometry(0.028, 0.045, 6, 12),
      // 點選用
      hit: new THREE.BoxGeometry(2.1, 1.6, 1.85),
    },
    hitMat: new THREE.MeshBasicMaterial({ visible: false }),
  };
  S.g.mouse.rotateX(Math.PI / 2); S.g.mouse.scale(1, 0.55, 1);
  S.m.screen.emissiveMap = S.m.screen.map; S.m.screen.emissiveIntensity = 0.85;
  return S;
}

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
// 兩點之間放一根圓柱（rail 幾何高 1）
function rod(geo, mat, parent, a, b) {
  const m = mesh(geo, mat, parent);
  const d = new THREE.Vector3().subVectors(b, a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, d.length(), 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/* ---------- 組件 ---------- */
function buildTable(g, s, r) {
  const { m } = s;
  mesh(s.g.top, m.wood, g, 0, TOP_Y - 0.03, 0);
  for (const [x, z] of [[-0.82, -0.36], [0.82, -0.36], [-0.82, 0.36], [0.82, 0.36]]) {
    mesh(s.g.leg, m.metal, g, x, (TOP_Y - 0.06) / 2, z);
    mesh(s.g.foot, m.metal, g, x, 0.01, z, false);
  }
  // 側邊橫桿
  for (const x of [-0.82, 0.82]) rod(s.g.rail, m.metal, g, new THREE.Vector3(x, 0.18, -0.36), new THREE.Vector3(x, 0.18, 0.36));
  // 正面擋板（朝相機那側）
  mesh(s.g.panel, m.panel, g, 0, TOP_Y - 0.25, 0.35);
  // 一側抽屜櫃（依 seed 左或右）
  const side = r() < 0.5 ? -1 : 1;
  const d = mesh(s.g.drawer, m.panel, g, side * 0.52, 0.27, 0.05);
  for (const y of [0.4, 0.2]) {
    mesh(s.g.knob, m.chrome, d, 0, y - 0.27, 0.318, false);
  }
}

function buildChair(anchor, s, r) {
  const { m } = s, fab = s.chairColors[Math.floor(r() * s.chairColors.length)];
  const c = new THREE.Group(); anchor.add(c);
  c.rotation.y = (r() - 0.5) * 0.12;
  // 五爪腳＋輪子
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3, sp = mesh(s.g.spoke, m.black, c, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15);
    sp.rotation.y = -a;
    mesh(s.g.caster, m.black, c, Math.cos(a) * 0.29, 0.032, Math.sin(a) * 0.29);
  }
  mesh(s.g.gas, m.chrome, c, 0, 0.22, 0);
  mesh(s.g.seat, fab, c, 0, 0.41, 0);                     // 椅面上緣約 0.45
  // 椅背在人背後（−z）
  for (const x of [-0.15, 0.15]) {
    const p = mesh(s.g.backPost, m.metal, c, x, 0.55, -0.24);
    p.rotation.x = -0.1;
  }
  const b = mesh(s.g.back, fab, c, 0, 0.82, -0.27); b.rotation.x = -0.12;
  // 扶手
  for (const x of [-0.27, 0.27]) {
    mesh(s.g.armPost, m.metal, c, x, 0.53, -0.05);
    mesh(s.g.arm, m.black, c, x, 0.63, -0.02);
  }
}

function buildLaptop(g, s, logoMat, r) {
  const { m } = s, L = new THREE.Group(); g.add(L);
  L.position.set((r() - 0.5) * 0.12, TOP_Y, -0.2); L.rotation.y = (r() - 0.5) * 0.15;
  mesh(s.g.lapBase, m.alu, L, 0, 0.01, 0);
  const k = mesh(s.g.lapKeys, m.keys, L, 0, 0.0205, 0.04, false); k.rotation.x = -Math.PI / 2;
  const p = mesh(s.g.lapPad, m.black, L, 0, 0.0205, -0.085, false); p.rotation.x = -Math.PI / 2; p.material = m.keys;
  // 螢幕：鉸鍊在 +z 邊，螢幕面朝 −z（人），背蓋朝 +z（相機）
  const hinge = new THREE.Group(); hinge.position.set(0, 0.02, 0.135); hinge.rotation.x = 0.28; L.add(hinge);
  mesh(s.g.lapLid, m.alu, hinge, 0, 0.135, 0);
  const sc = mesh(s.g.lapScreen, m.screen, hinge, 0, 0.14, -0.0065, false); sc.rotation.y = Math.PI;
  const lg = mesh(s.g.logo, logoMat, hinge, 0, 0.14, 0.0065, false);
  const ring = mesh(s.g.logoRing, logoMat, hinge, 0, 0.14, 0.0066, false);
  // 便利貼貼在背蓋（seed 決定）
  if (r() < 0.45) {
    const n = mesh(s.g.note, s.noteColors[Math.floor(r() * s.noteColors.length)], hinge, 0.12, 0.2, 0.0068, false);
    n.rotation.z = (r() - 0.5) * 0.4; n.scale.setScalar(0.7);
  }
  return { lg, ring };
}

function buildLamp(g, s, r) {
  const { m } = s, side = r() < 0.5 ? 1 : -1;
  const L = new THREE.Group(); g.add(L);
  L.position.set(side * 0.72, TOP_Y, -0.25);
  mesh(s.g.lampBase, m.lampBody, L, 0, 0.0125, 0);
  const a = new THREE.Vector3(0, 0.02, 0), b = new THREE.Vector3(side * -0.02, 0.3, 0.06), c = new THREE.Vector3(side * -0.14, 0.38, 0.12);
  rod(s.g.lampArm, m.chrome, L, a, b); rod(s.g.lampArm, m.chrome, L, b, c);
  mesh(s.g.joint, m.lampBody, L, b.x, b.y, b.z);
  const head = new THREE.Group(); head.position.copy(c); L.add(head);
  head.rotation.z = side * 0.5; head.rotation.x = 0.35;
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2f3a4a, metalness: 0.3, roughness: 0.4, emissive: 0xffc46b, emissiveIntensity: 0, side: THREE.DoubleSide });
  const shade = mesh(s.g.shade, shadeMat, head, 0, -0.04, 0); 
  mesh(s.g.shadeCap, s.m.lampBody, head, 0, 0.015, 0);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffd28a, emissiveIntensity: 0.1 });
  mesh(s.g.bulb, bulbMat, head, 0, -0.07, 0, false);
  const light = new THREE.PointLight(0xffc46b, 0, 1.6, 2);
  light.position.set(0, -0.1, 0); light.castShadow = false; head.add(light);
  return { shadeMat, bulbMat, light, x: side * 0.72 };
}

function buildGrid(g, s, x) {
  const P = new THREE.Group(); P.position.set(x, TOP_Y, 0.12); g.add(P);
  const { m } = s;
  for (const [px, pz] of [[-0.13, -0.1], [0.13, -0.1], [-0.13, 0.1], [0.13, 0.1]]) mesh(s.g.shelfPost, m.chrome, P, px, 0.21, pz);
  mesh(s.g.shelfBoard, m.shelf, P, 0, 0.02, 0);
  mesh(s.g.shelfBoard, m.shelf, P, 0, 0.42, 0);
  const coin = new THREE.Group(); P.add(coin);
  const face = mesh(s.g.coin, m.gold, coin); face.rotation.x = Math.PI / 2;
  mesh(s.g.coinRim, m.gold, coin, 0, 0, 0.007, false);
  mesh(s.g.coinRim, m.gold, coin, 0, 0, -0.007, false);
  coin.position.y = 0.22;
  return { coin };
}

function makeSignTex() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 64;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { c, t };
}
function paintSign({ c, t }, n) {
  const g = c.getContext("2d");
  g.fillStyle = "#fff8ec"; g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#f97316"; g.fillRect(0, 0, 128, 10);
  g.fillStyle = "#2a2420"; g.font = "bold 40px system-ui, -apple-system, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("×" + n, 64, 39);
  t.needsUpdate = true;
}
function buildMart(g, s, x) {
  const P = new THREE.Group(); P.position.set(x, TOP_Y, 0.12); g.add(P);
  const boxes = [];
  const MAX = 24;
  for (let i = 0; i < MAX; i++) {
    const b = mesh(s.g.box, s.m.box, P);
    const tp = mesh(s.g.tape, s.m.boxTape, b, 0, 0.501, 0, false); tp.rotation.x = -Math.PI / 2;
    b.visible = false; boxes.push(b);
  }
  const sign = new THREE.Group(); P.add(sign);
  mesh(s.g.sign, s.m.lampBody, sign);
  const tex = makeSignTex();
  const faceMat = new THREE.MeshStandardMaterial({ map: tex.t, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex.t, emissiveIntensity: 0.25 });
  mesh(s.g.signFace, faceMat, sign, 0, 0, 0.0065, false);
  sign.rotation.x = -0.25;
  let last = -1;
  function setOrders(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n === last) return; last = n;
    const shown = Math.min(n, MAX), h = shown ? Math.min(0.11, 0.8 / shown) : 0;
    const r = rng(n * 977 + 13);
    boxes.forEach((b, i) => {
      b.visible = i < shown;
      if (!b.visible) return;
      b.scale.set(1, h * 0.94, 1);
      b.position.set((r() - 0.5) * 0.03, h * i + h * 0.47, (r() - 0.5) * 0.03);
      b.rotation.y = (r() - 0.5) * 0.18;
    });
    sign.position.set(0, shown * h + 0.065, 0.02);
    sign.visible = n > 0;
    paintSign(tex, n);
  }
  return { setOrders };
}

function buildPig(g, s, x, r) {
  const P = new THREE.Group(); P.position.set(x, TOP_Y, 0.12); P.rotation.y = 0.5 + (r() - 0.5) * 0.6; g.add(P);
  const { m } = s;
  const body = mesh(s.g.pigBody, m.pig, P, 0, 0.13, 0); body.scale.set(1.25, 1, 1.05);
  const sn = mesh(s.g.pigSnout, m.pig, P, 0, 0.125, 0.115); sn.rotation.x = Math.PI / 2;
  for (const dx of [-0.013, 0.013]) mesh(s.g.pigNostril, m.pigDark, P, dx, 0.125, 0.1355, false);
  for (const dx of [-0.05, 0.05]) {
    const e = mesh(s.g.pigEar, m.pig, P, dx, 0.225, 0.04); e.rotation.z = -dx * 6; e.rotation.x = 0.3;
    mesh(s.g.pigEye, m.black, P, dx * 0.85, 0.165, 0.093, false);
  }
  for (const [lx, lz] of [[-0.065, -0.05], [0.065, -0.05], [-0.065, 0.05], [0.065, 0.05]]) mesh(s.g.pigLeg, m.pig, P, lx, 0.025, lz);
  mesh(s.g.pigSlot, m.black, P, 0, 0.231, -0.01, false);
  const tl = mesh(s.g.pigTail, m.pigDark, P, 0, 0.14, -0.115, false); tl.rotation.y = Math.PI / 2;
  // 一枚準備投入的金幣
  const c = mesh(s.g.coin, m.gold, P, 0, 0.275, -0.01); c.rotation.x = Math.PI / 2; c.scale.setScalar(0.6);
  return {};
}

// 裝飾：依 seed 選擇並放到空位
function buildDecor(g, s, r, slots) {
  const { m } = s;
  const items = ["mug", "plant", "papers", "notes", "mouse", "folder"];
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  const n = 2 + Math.floor(r() * 2);
  items.slice(0, n).concat("mouse").forEach((kind, i) => {
    const sl = kind === "mouse" ? [slots.mouse[0], slots.mouse[1]] : slots.free[i % slots.free.length];
    if (!sl) return;
    const D = new THREE.Group(); D.position.set(sl[0], TOP_Y, sl[1]); D.rotation.y = (r() - 0.5) * 1.2; g.add(D);
    if (kind === "mug") {
      const mm = s.mugColors[Math.floor(r() * s.mugColors.length)];
      const mg = mesh(s.g.mug, mm, D, 0, 0.05, 0); mg.material = mm;
      const bt = mesh(s.g.mugBottom, mm, D, 0, 0.002, 0, false); bt.rotation.x = -Math.PI / 2;
      const cf = mesh(s.g.mugCoffee, m.coffee, D, 0, 0.08, 0, false); cf.rotation.x = -Math.PI / 2;
      const h = mesh(s.g.mugHandle, mm, D, 0.042, 0.05, 0); h.rotation.z = -Math.PI / 2;
    } else if (kind === "plant") {
      mesh(s.g.pot, m.pot, D, 0, 0.055, 0);
      const rim = mesh(s.g.potRim, m.pot, D, 0, 0.108, 0); rim.rotation.x = Math.PI / 2;
      const so = mesh(s.g.soil, m.soil, D, 0, 0.1, 0, false); so.rotation.x = -Math.PI / 2;
      if (r() < 0.5) {                                                  // 圓葉
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2, l = mesh(s.g.leaf, k % 2 ? m.leaf : m.leaf2, D, Math.cos(a) * 0.04, 0.16 + (k % 3) * 0.03, Math.sin(a) * 0.04);
          l.scale.set(1, 0.8, 1);
        }
        mesh(s.g.leaf, m.leaf, D, 0, 0.22, 0);
      } else {                                                           // 劍葉（虎尾蘭）
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * Math.PI * 2, l = mesh(s.g.leafBlade, k % 2 ? m.leaf : m.leaf2, D, Math.cos(a) * 0.022, 0.19, Math.sin(a) * 0.022);
          l.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); l.scale.y = 0.8 + (k % 3) * 0.15;
        }
      }
    } else if (kind === "papers") {
      for (let k = 0; k < 4; k++) { const p = mesh(s.g.sheet, m.paper, D, (r() - 0.5) * 0.02, 0.002 + k * 0.004, (r() - 0.5) * 0.02); p.rotation.y = (r() - 0.5) * 0.25; }
    } else if (kind === "folder") {
      mesh(s.g.folder, m.folder, D, 0, 0.006, 0);
      const p = mesh(s.g.sheet, m.paper, D, 0.01, 0.014, 0.01); p.rotation.y = 0.08;
    } else if (kind === "notes") {
      for (let k = 0; k < 3; k++) {
        const nn = mesh(s.g.note, s.noteColors[Math.floor(r() * s.noteColors.length)], D, (k - 1) * 0.085, 0.002 + k * 0.0005, (r() - 0.5) * 0.04, false);
        nn.rotation.x = -Math.PI / 2; nn.rotation.z = (r() - 0.5) * 0.5;
      }
    } else if (kind === "mouse") {
      D.rotation.y = (r() - 0.5) * 0.4;
      mesh(s.g.mouse, m.black, D, 0, 0.016, 0);
    }
  });
}

/* ---------- 主函式 ---------- */
export function createDesk({ kind = "other", seed = 1, orders = null } = {}) {
  const s = shared(), r = rng(seed * 2654435761);
  const group = new THREE.Group();

  buildTable(group, s, r);

  const workerAnchor = new THREE.Object3D(); workerAnchor.position.set(0, 0, -0.75); group.add(workerAnchor);
  const chairHolder = new THREE.Group(); workerAnchor.add(chairHolder);   // 椅子在 workerAnchor 底下，main 掛上的人和椅子同位
  buildChair(chairHolder, s, r);

  const logoMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: C_MUT, emissiveIntensity: 1.2, roughness: 0.3 });
  buildLaptop(group, s, logoMat, r);

  const lamp = buildLamp(group, s, r);
  const propX = -Math.sign(lamp.x) * 0.66;                // 類型道具放在燈的另一邊
  let prop = {};
  if (kind === "grid") prop = buildGrid(group, s, propX);
  else if (kind === "mart") prop = buildMart(group, s, propX);
  else prop = buildPig(group, s, propX, r);

  const sideL = Math.sign(lamp.x);
  buildDecor(group, s, r, {
    mouse: [0.3 * (r() < 0.8 ? 1 : -1), -0.25],
    free: [[sideL * 0.4, 0.22], [-sideL * 0.32, 0.25], [sideL * 0.45, -0.05], [-sideL * 0.38, -0.25]],
  });

  const labelAnchor = new THREE.Object3D(); labelAnchor.position.set(0, 0.55, 0.55); group.add(labelAnchor);
  const hitbox = new THREE.Mesh(s.g.hit, s.hitMat); hitbox.position.set(0, 0.8, -0.32); group.add(hitbox);

  let profitColor = new THREE.Color(C_MUT), alert = null;
  function setProfit(v) {
    profitColor.setHex(v == null || v === 0 || Number.isNaN(v) ? C_MUT : v > 0 ? C_POS : C_NEG);
    logoMat.emissive.copy(profitColor); logoMat.emissiveIntensity = 1.2;
  }
  function applyAlert(k) {        // k：閃爍係數 0..1
    if (alert === "red") {
      lamp.shadeMat.emissive.setHex(0xff3b3b); lamp.shadeMat.emissiveIntensity = 0.15 + 1.4 * k;
      lamp.bulbMat.emissive.setHex(0xff4a4a); lamp.bulbMat.emissiveIntensity = 0.3 + 2.5 * k;
      lamp.light.color.setHex(0xff3030); lamp.light.intensity = 3.2 * k;
    } else if (alert === "yellow") {
      lamp.shadeMat.emissive.setHex(0xffc46b); lamp.shadeMat.emissiveIntensity = 0.9;
      lamp.bulbMat.emissive.setHex(0xffd28a); lamp.bulbMat.emissiveIntensity = 2.2;
      lamp.light.color.setHex(0xffc46b); lamp.light.intensity = 1.8;
    } else {
      lamp.shadeMat.emissiveIntensity = 0;
      lamp.bulbMat.emissive.setHex(0xffd28a); lamp.bulbMat.emissiveIntensity = 0.08;
      lamp.light.intensity = 0;
    }
  }
  // 沒警示時把燈關掉（visible=false 不計入場景光源數，12 張桌子不會同時有 12 盞點光源）
  function setAlert(a) { alert = a === "red" || a === "yellow" ? a : null; lamp.light.visible = !!alert; applyAlert(1); }
  function setOrders(n) { if (prop.setOrders) prop.setOrders(n); }

  setProfit(null); setAlert(null);
  if (kind === "mart") setOrders(orders ?? 1);

  const phase = r() * 10;
  function update(t) {
    if (RM) return;
    const tt = t + phase;
    logoMat.emissiveIntensity = 0.9 + 0.45 * (0.5 + 0.5 * Math.sin(tt * 2.2));   // 呼吸
    if (alert === "red") applyAlert(Math.sin(tt * 14) > 0 ? 1 : 0.08);
    if (prop.coin) {                                    // 金幣在兩層架之間彈跳（|sin| 落地感）
      const b = Math.abs(Math.sin(tt * 2.6));
      prop.coin.position.y = 0.088 + b * 0.26;
      prop.coin.rotation.y = tt * 3.2;
      const sq = b < 0.08 ? 0.85 + b * 1.9 : 1;          // 觸底微壓扁
      prop.coin.scale.set(1 / Math.sqrt(sq), sq, 1);
    }
  }

  return { group, workerAnchor, labelAnchor, hitbox, setProfit, setAlert, setOrders, update };
}
