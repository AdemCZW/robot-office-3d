// 80 年代小鎮場景站點：取代辦公桌的六種站點（地下室桌遊桌、街機、自製無線電台、冰淇淋櫃台、實驗室控制台、腳踏車維修台）。
// 介面與 desk.js 的 createDesk 相容（多一個 station 參數、回傳多 seat）。全部程式產生，不載入外部檔案。
// 座標：group 原點＝站點中心地板；人在 −z 側、臉朝 +z；相機在 +z/+x 高處。佔地約 2.2 × 1.6。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const STATIONS = ["dnd", "arcade", "radio", "scoops", "lab", "bikes"];
export const STATION_SEAT = { dnd: "sit", arcade: "stand", radio: "sit", scoops: "stand", lab: "sit", bikes: "stand" };

const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const C_POS = 0x34d399, C_NEG = 0xf87171, C_MUT = 0x9ca3af;

/* ---------- 小工具 ---------- */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function canvasTex(w, h, draw, { pixel = false, repeat = null } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; } else t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData.canvas = c;
  return t;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
// 單位方塊縮放成 w×h×d
function bx(p, mat, w, h, d, x, y, z, cast = true) { const m = mesh(S.g.box, mat, p, x, y, z, cast); m.scale.set(w, h, d); return m; }
function rbx(p, mat, w, h, d, x, y, z, cast = true) { const m = mesh(S.g.rbox, mat, p, x, y, z, cast); m.scale.set(w, h, d); return m; }
function cy(p, mat, r, h, x, y, z, cast = true) { const m = mesh(S.g.cyl, mat, p, x, y, z, cast); m.scale.set(r, h, r); return m; }
// 兩點之間放一根半徑 r 的圓柱
function rod(p, mat, r, a, b, cast = true) {
  const m = mesh(S.g.cyl, mat, p, 0, 0, 0, cast);
  const d = new THREE.Vector3().subVectors(b, a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(r, d.length(), r);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- 紋理 ---------- */
function woodDraw(base, dark, light) {
  return (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 80; i++) {
      const y = r() * h, a = 0.05 + r() * 0.14;
      g.strokeStyle = (r() < 0.55 ? dark : light).replace("A", a.toFixed(2)); g.lineWidth = 0.6 + r() * 2;
      g.beginPath(); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 60 + i) * 3); g.stroke();
    }
  };
}
const texMap = () => canvasTex(256, 192, (g, w, h) => {      // 桌遊地圖：羊皮紙＋方格＋地城
  g.fillStyle = "#dcc89a"; g.fillRect(0, 0, w, h);
  const r = rng(5);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,110,60,${0.04 + r() * 0.06})`; g.beginPath(); g.arc(r() * w, r() * h, 6 + r() * 26, 0, 7); g.fill(); }
  g.fillStyle = "#c4ad79";
  const rooms = [[18, 20, 64, 48], [110, 16, 52, 40], [190, 30, 50, 64], [30, 110, 72, 56], [130, 96, 44, 72], [196, 128, 44, 44]];
  rooms.forEach(([x, y, a, b]) => g.fillRect(x, y, a, b));
  g.fillRect(82, 36, 28, 10); g.fillRect(162, 40, 28, 10); g.fillRect(60, 68, 10, 42); g.fillRect(102, 130, 28, 10); g.fillRect(174, 146, 22, 10); g.fillRect(146, 56, 10, 40);
  g.strokeStyle = "rgba(70,50,25,.28)"; g.lineWidth = 1;
  for (let x = 0; x <= w; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = "#4a3418"; g.lineWidth = 3; rooms.forEach(([x, y, a, b]) => g.strokeRect(x, y, a, b));
  g.fillStyle = "#3d7bb5"; g.beginPath(); g.ellipse(64, 138, 20, 12, 0.3, 0, 7); g.fill();
  g.strokeStyle = "#b3261e"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(205, 140); g.lineTo(225, 160); g.moveTo(225, 140); g.lineTo(205, 160); g.stroke();
});
const texDM = () => canvasTex(256, 224, (g, w, h) => {      // 地城主屏風：暗紅底金框
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#8e1b16"); gr.addColorStop(1, "#4a0b0a");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#e3b04b"; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20); g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
  g.fillStyle = "#e3b04b"; g.textAlign = "center"; g.font = "bold italic 30px Georgia, serif";
  g.fillText("DUNGEON", w / 2, 62); g.fillText("MASTER", w / 2, 96);
  // 龍頭剪影（簡化）
  g.fillStyle = "#f2c66b"; g.beginPath();
  g.moveTo(70, 190); g.quadraticCurveTo(90, 120, 150, 118); g.lineTo(190, 104); g.lineTo(172, 128); g.lineTo(200, 134);
  g.lineTo(160, 146); g.quadraticCurveTo(120, 150, 112, 192); g.closePath(); g.fill();
  g.fillStyle = "#8e1b16"; g.beginPath(); g.arc(158, 128, 4, 0, 7); g.fill();
});
const texCarpet = () => canvasTex(256, 256, (g, w, h) => {  // 街機店地毯：深紫底螢光圖案
  g.fillStyle = "#170b2b"; g.fillRect(0, 0, w, h);
  const r = rng(9), cols = ["#ff3fa4", "#2fe6ff", "#ffe14a", "#7c5cff", "#3cff8f"];
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = g.fillStyle = cols[i % cols.length]; g.lineWidth = 3;
    const x = r() * w, y = r() * h, k = i % 4;
    g.save(); g.translate(x, y); g.rotate(r() * 6.28);
    if (k === 0) { g.beginPath(); g.moveTo(-12, 0); for (let j = 0; j < 4; j++) g.quadraticCurveTo(-9 + j * 7, j % 2 ? 8 : -8, -5 + j * 7, 0); g.stroke(); }
    else if (k === 1) { g.beginPath(); g.moveTo(0, -9); g.lineTo(9, 7); g.lineTo(-9, 7); g.closePath(); g.stroke(); }
    else if (k === 2) { g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); }
    else { g.fillRect(-8, -1.5, 16, 3); }
    g.restore();
  }
}, { repeat: [2, 1.5] });
function marqueeDraw(text, c1, c2, sub) {
  return (g, w, h) => {
    g.fillStyle = "#07040f"; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold italic 40px Impact, 'Arial Black', sans-serif";
    g.shadowColor = c1; g.shadowBlur = 12; g.fillStyle = gr; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.shadowBlur = 0; g.font = "bold 13px sans-serif"; g.fillStyle = "#ffffff"; g.fillText(sub, w / 2, h * 0.84); }
  };
}
const texScoopsFront = () => canvasTex(512, 256, (g, w, h) => {   // 冰淇淋櫃台正面：白底藍條紋
  g.fillStyle = "#f5f8fc"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#7fb2e5"; for (let x = 8; x < w; x += 36) g.fillRect(x, 70, 16, h - 96);
  g.fillStyle = "#1d3a72"; g.fillRect(0, 0, w, 64);
  g.fillStyle = "#d4343f"; g.fillRect(0, 60, w, 8); g.fillRect(0, h - 26, w, 26);
  g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold italic 40px 'Arial Black', Impact, sans-serif";
  g.fillText("SCOOP SHIP", w / 2, 33);
  g.strokeStyle = "#ffffff"; g.lineWidth = 3; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(0, h - 13); g.lineTo(w, h - 13); g.stroke();
});
const texScoopsSign = () => canvasTex(512, 112, (g, w, h) => {
  g.fillStyle = "#1d3a72"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#ffffff"; g.lineWidth = 5; g.setLineDash([12, 8]); g.strokeRect(8, 8, w - 16, h - 16); g.setLineDash([]);
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold italic 54px 'Arial Black', Impact, sans-serif";
  g.fillStyle = "#d4343f"; g.fillText("SCOOP SHIP", w / 2 + 3, h / 2 + 3); g.fillStyle = "#ffffff"; g.fillText("SCOOP SHIP", w / 2, h / 2);
});
const texCerebro = () => canvasTex(256, 72, (g, w, h) => {        // 紙箱板手寫字
  g.fillStyle = "#c79c69"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(90,60,30,.25)"; g.lineWidth = 2; for (let y = 6; y < h; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = "#151515"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold italic 46px 'Marker Felt', 'Comic Sans MS', cursive";
  g.fillText("BIG EARS", w / 2, h / 2 + 2);
});
const texLabPlate = () => canvasTex(512, 112, (g, w, h) => {
  g.fillStyle = "#dfe3d8"; g.fillRect(0, 0, w, h);
  for (let x = -40; x < w; x += 28) { g.fillStyle = "#f2c230"; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h - 18); g.lineTo(x + 28, h - 18); g.lineTo(x + 14, h); g.fill(); }
  g.fillStyle = "#151515"; g.fillRect(0, h - 18, w, 2);
  g.textAlign = "center"; g.font = "bold 34px 'Helvetica Neue', Arial, sans-serif"; g.fillText("MAPLEWOOD NATIONAL LAB", w / 2, 44);
  g.font = "bold 15px 'Helvetica Neue', Arial, sans-serif"; g.fillStyle = "#3a3a3a"; g.fillText("U.S. DEPARTMENT OF ENERGY  ·  AUTHORIZED PERSONNEL ONLY", w / 2, 72);
});
const texTerminal = () => canvasTex(128, 96, (g, w, h) => {
  g.fillStyle = "#04150a"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#3cff7a"; g.font = "9px monospace";
  ["> SUBJECT 011", "> EEG  ACTIVE", "> GATE  OPEN?", "> PWR 87.3 %", "> SIGNAL ███▒", "> MKULTRA..."].forEach((s, i) => g.fillText(s, 6, 14 + i * 13));
  g.fillStyle = "rgba(0,0,0,.25)"; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
});
const texReel = () => canvasTex(128, 128, (g, w, h) => {          // 磁帶盤
  g.fillStyle = "#7d8a7c"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#5a3a22"; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fill();
  g.fillStyle = "#d8dde2"; g.beginPath(); g.arc(64, 64, 30, 0, 7); g.fill();
  g.fillStyle = "#2a2f33"; for (let i = 0; i < 3; i++) { const a = i * 2.094; g.beginPath(); g.arc(64 + Math.cos(a) * 17, 64 + Math.sin(a) * 17, 8, 0, 7); g.fill(); }
  g.beginPath(); g.arc(64, 64, 5, 0, 7); g.fill();
});
const texLights = () => canvasTex(128, 96, (g, w, h) => {         // 一排排指示燈
  g.fillStyle = "#3a433a"; g.fillRect(0, 0, w, h);
  const r = rng(3), cols = ["#ff4a3a", "#ffc23a", "#3cff7a", "#e8f0ff", "#4a5a4a"];
  for (let y = 10; y < h; y += 16) for (let x = 10; x < w; x += 15) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
});
const texSpokes = () => canvasTex(128, 128, (g, w, h) => {        // 輪輻（透明底）
  g.clearRect(0, 0, w, h); g.strokeStyle = "#d9dde2"; g.lineWidth = 2;
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 6, 64 + Math.sin(a) * 6); g.lineTo(64 + Math.cos(a + 0.35) * 62, 64 + Math.sin(a + 0.35) * 62); g.stroke(); }
  g.fillStyle = "#b9bfc6"; g.beginPath(); g.arc(64, 64, 9, 0, 7); g.fill();
});
const texWaffle = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = "#d99a3c"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#b9762a"; for (let y = 2; y < h; y += 10) for (let x = 2; x < w; x += 10) g.fillRect(x, y, 6, 6);
});

// 街機畫面：64×52 的像素小遊戲，分格重畫（模組層級共用一張）
function drawGame(g, f) {
  const W = 64, H = 52;
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#2141ff";                                         // 迷宮牆
  [[0, 0, 64, 2], [0, 50, 64, 2], [0, 0, 2, 52], [62, 0, 2, 52], [8, 8, 18, 3], [38, 8, 18, 3], [8, 40, 18, 3], [38, 40, 18, 3],
   [30, 6, 4, 12], [30, 34, 4, 12], [8, 18, 3, 16], [53, 18, 3, 16], [18, 22, 10, 3], [36, 27, 10, 3]].forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
  const px = 4 + ((f * 2) % 64), py = 25;                         // 小黃人沿中線吃豆
  g.fillStyle = "#ffd6a0"; for (let x = 4; x < 62; x += 5) if (x > px + 2 || x < px - 60) g.fillRect(x, 26, 1, 1);
  g.fillStyle = "#ffe600"; g.beginPath();
  const open = f % 2 ? 0.7 : 0.15; g.moveTo(px, py + 1); g.arc(px, py + 1, 4, open, Math.PI * 2 - open); g.fill();
  const gx = px - 13;                                              // 追著的鬼
  [["#ff2a2a", gx], ["#ff9ad5", gx - 9]].forEach(([c, x]) => {
    g.fillStyle = c; g.fillRect(x - 3, py - 2, 7, 6); g.fillRect(x - 2, py - 3, 5, 1);
    g.fillStyle = "#fff"; g.fillRect(x - 2, py - 1, 2, 2); g.fillRect(x + 1, py - 1, 2, 2);
  });
  g.fillStyle = f % 4 < 2 ? "#ffffff" : "#ff4a4a"; g.fillRect(4, 4, 2, 2); g.fillRect(58, 46, 2, 2);   // 大力丸閃爍
  g.fillStyle = "#fff"; for (let i = 0; i < 5; i++) if ((f >> i) & 1) g.fillRect(40 + i * 4, 3, 2, 2);  // 分數位元
}

/* ---------- 模組層級共用：材質、幾何 ---------- */
let S = null;
function shared() {
  if (S) return S;
  const std = o => new THREE.MeshStandardMaterial(o);
  const em = (t, i = 1) => std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: i, roughness: 0.5 });
  const game = canvasTex(64, 52, (g) => drawGame(g, 0), { pixel: true });
  S = {
    game: { t: game, g: game.userData.canvas.getContext("2d"), f: 0, last: -1 },
    m: {
      wood: std({ map: canvasTex(256, 128, woodDraw("#7a4a2a", "rgba(50,25,10,A)", "rgba(200,150,100,A)")), roughness: 0.6 }),
      woodLight: std({ map: canvasTex(256, 128, woodDraw("#b98552", "rgba(110,65,30,A)", "rgba(240,200,150,A)")), roughness: 0.6 }),
      crate: std({ color: 0xa47a4a, roughness: 0.85 }),
      metal: std({ color: 0x3a3f47, metalness: 0.8, roughness: 0.35 }),
      chrome: std({ color: 0xd7dbe0, metalness: 1, roughness: 0.18 }),
      black: std({ color: 0x1d1f23, roughness: 0.55 }),
      white: std({ color: 0xf2f4f7, roughness: 0.5 }),
      navy: std({ color: 0x1d3a72, roughness: 0.5 }),
      red: std({ color: 0xc8242c, roughness: 0.4 }),
      bikeRed: new THREE.MeshPhysicalMaterial({ color: 0xc9252b, metalness: 0.3, roughness: 0.3, clearcoat: 0.8 }),
      yellow: std({ color: 0xf2c230, roughness: 0.4 }),
      blue: std({ color: 0x2b6fd6, roughness: 0.4 }),
      tire: std({ color: 0x18191b, roughness: 0.9 }),
      map: std({ map: texMap(), roughness: 0.85 }),
      dm: std({ map: texDM(), roughness: 0.6 }),
      parchment: std({ color: 0xe9d9b0, roughness: 0.9 }),
      carpet: std({ map: texCarpet(), roughness: 0.95 }),
      cabBlack: std({ color: 0x15151c, roughness: 0.45 }),
      cabBlue: std({ color: 0x1e3a8a, roughness: 0.45 }),
      sideRed: std({ color: 0xb3122a, roughness: 0.4 }),
      sideYellow: std({ color: 0xf2b705, roughness: 0.4 }),
      marquee1: em(canvasTex(256, 72, marqueeDraw("PALACE", "#ff3fa4", "#2fe6ff", "ARCADE")), 1.1),
      marquee2: em(canvasTex(256, 72, marqueeDraw("MOLE RUN", "#ffe14a", "#ff6a1a")), 1.1),
      screen: std({ map: game, emissive: 0xffffff, emissiveMap: game, emissiveIntensity: 1.25, roughness: 0.2 }),
      coinGlow: std({ color: 0x331a00, emissive: 0xff8a1a, emissiveIntensity: 1.6 }),
      radio: std({ color: 0x4d5247, metalness: 0.55, roughness: 0.45 }),
      radioFace: std({ color: 0x2a2c28, roughness: 0.5 }),
      meter: std({ color: 0x2a1a00, emissive: 0xffb340, emissiveIntensity: 1.2 }),
      speaker: std({ color: 0x5a3a22, roughness: 0.7 }),
      grille: std({ color: 0x2c2620, roughness: 1 }),
      cerebro: std({ map: texCerebro(), roughness: 0.9 }),
      scoopsFront: std({ map: texScoopsFront(), roughness: 0.55 }),
      scoopsSign: em(texScoopsSign(), 0.35),
      counterTop: std({ color: 0xe9eef5, roughness: 0.3 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }),
      cone: std({ color: 0xd9a35a, roughness: 0.8 }),
      labMetal: std({ color: 0x6d7b69, metalness: 0.5, roughness: 0.5 }),
      labDark: std({ color: 0x48543f, metalness: 0.4, roughness: 0.5 }),
      labLight: std({ color: 0x8d9a89, metalness: 0.45, roughness: 0.5 }),
      crt: std({ color: 0xcfc8b4, roughness: 0.6 }),
      terminal: em(texTerminal(), 1.0),
      reel: std({ map: texReel(), roughness: 0.5 }),
      lights: em(texLights(), 0.9),
      plate: std({ map: texLabPlate(), roughness: 0.5 }),
      btnRed: std({ color: 0xd41e1e, emissive: 0x5a0000, emissiveIntensity: 0.6, roughness: 0.3 }),
      spokes: std({ map: texSpokes(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.3 }),
      waffle: std({ map: texWaffle(), roughness: 0.8 }),
      gold: new THREE.MeshPhysicalMaterial({ color: 0xd9a52e, metalness: 1, roughness: 0.25, clearcoat: 0.5 }),
      pig: new THREE.MeshPhysicalMaterial({ color: 0xf6a5b8, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
      pigDark: std({ color: 0xd9748f, roughness: 0.4 }),
      beaconBase: std({ color: 0x2a2a2e, metalness: 0.6, roughness: 0.4 }),
      signBack: std({ color: 0x2f3a4a, roughness: 0.5 }),
    },
    // 顏色組（模型小零件）
    mini: [0xc9ced6, 0x3d6fd1, 0x3f8f4f, 0x8a2c22].map(c => std({ color: c, metalness: 0.4, roughness: 0.5 })),
    dice: [0x7b3fd1, 0xf1f1f1, 0xd1263f].map(c => std({ color: c, roughness: 0.3, flatShading: true })),
    btns: [0xe11d48, 0xfacc15, 0x2563eb].map(c => std({ color: c, roughness: 0.3, emissive: c, emissiveIntensity: 0.25 })),
    flavors: [0xf4a3b8, 0x6b3f2a, 0xf6edd0, 0xa8e6c8, 0xf7e27a, 0x9fb4ee].map(c => std({ color: c, roughness: 0.75 })),
    stackMats: {
      dnd: [0x8e1b16, 0x1f5c3a, 0x23407a, 0x6b4a1f].map(c => std({ color: c, roughness: 0.7 })),
      arcade: [0x1d1f23, 0x8a1c1c, 0x3a3a46].map(c => std({ color: c, roughness: 0.5 })),
      radio: [0x1d1f23, 0xe8e2d0, 0xb33a2a].map(c => std({ color: c, roughness: 0.4 })),
      scoops: [0xffffff, 0x8fb8ea, 0xf4a3b8].map(c => std({ color: c, roughness: 0.6 })),
      lab: [0xe2c98a, 0xd8bb72].map(c => std({ color: c, roughness: 0.85 })),
      bikes: [0xb98552, 0x3a6fb8].map(c => std({ color: c, roughness: 0.85 })),
    },
    g: {
      box: new THREE.BoxGeometry(1, 1, 1),
      rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
      cylLo: new THREE.CylinderGeometry(1, 1, 1, 10),
      cupGeo: new THREE.CylinderGeometry(0.065, 0.048, 1, 16),
      cone: new THREE.ConeGeometry(1, 1, 14),
      sphere: new THREE.SphereGeometry(1, 16, 12),
      dome: new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      d20: new THREE.IcosahedronGeometry(0.045, 0),
      plane: new THREE.PlaneGeometry(1, 1),
      circle: new THREE.CircleGeometry(1, 28),
      capsule: new THREE.CapsuleGeometry(0.024, 0.05, 4, 10),
      band: new THREE.TorusGeometry(0.075, 0.008, 6, 20, Math.PI),
      tire: new THREE.TorusGeometry(0.3, 0.026, 8, 36),
      rim: new THREE.TorusGeometry(0.272, 0.008, 6, 36),
      coin: new THREE.CylinderGeometry(0.04, 0.04, 0.008, 22),
      // 存錢筒
      pigBody: new THREE.SphereGeometry(0.1, 20, 14),
      pigSnout: new THREE.CylinderGeometry(0.038, 0.042, 0.04, 16),
      pigEar: new THREE.ConeGeometry(0.026, 0.045, 10),
      pigLeg: new THREE.CylinderGeometry(0.022, 0.024, 0.05, 10),
      pigEye: new THREE.SphereGeometry(0.009, 8, 6),
      pigSlot: new RoundedBoxGeometry(0.07, 0.008, 0.012, 1, 0.003),
      sign: new RoundedBoxGeometry(0.18, 0.1, 0.012, 2, 0.005),
      signFace: new THREE.PlaneGeometry(0.165, 0.085),
      hit: new THREE.BoxGeometry(2.2, 2.0, 1.8),
    },
    hitMat: new THREE.MeshBasicMaterial({ visible: false }),
  };
  // 無線電到天線的同軸線（形狀固定，共用一份）
  S.g.coax = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.3, 0.8, 0.12), V(-0.55, 0.78, 0.0), V(-0.72, 0.4, -0.3), V(-0.9, 0.06, -0.55), V(-0.93, 0.3, -0.62)]), 24, 0.008, 6, false);
  return S;
}

/* ---------- 共用零件 ---------- */
function buildChair(anchor, mat, legMat) {     // 木椅／鐵椅：椅面上緣約 0.45，椅背在人背後（−z）
  bx(anchor, mat, 0.44, 0.05, 0.42, 0, 0.425, 0);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) bx(anchor, legMat, 0.04, 0.4, 0.04, x, 0.2, z);
  for (const x of [-0.19, 0.19]) bx(anchor, legMat, 0.04, 0.48, 0.04, x, 0.69, -0.19);
  bx(anchor, mat, 0.42, 0.14, 0.03, 0, 0.86, -0.19);
}
function buildTable(g, mat, w, d, z = 0) {      // 桌面上緣 0.75
  bx(g, mat, w, 0.05, d, 0, 0.725, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, mat, 0.06, 0.7, 0.06, sx * (w / 2 - 0.08), 0.35, z + sz * (d / 2 - 0.08));
}
function buildCabinet(g, x, z, rotY, body, side, marquee, glowMat) {   // 直立街機（正面朝 local +z）
  const C = new THREE.Group(); C.position.set(x, 0, z); C.rotation.y = rotY; g.add(C);
  bx(C, body, 0.6, 0.9, 0.62, 0, 0.45, 0);
  for (const sx of [-1, 1]) bx(C, side, 0.025, 1.78, 0.68, sx * 0.3125, 0.89, -0.01);
  const P = new THREE.Group(); P.position.set(0, 0.95, 0.24); P.rotation.x = 0.25; C.add(P);   // 控制台
  bx(P, S.m.cabBlack, 0.6, 0.07, 0.3, 0, 0, 0);
  cy(P, S.m.black, 0.008, 0.07, -0.13, 0.07, 0.02);
  mesh(S.g.sphere, S.m.red, P, -0.13, 0.105, 0.02).scale.setScalar(0.022);
  S.btns.forEach((mt, i) => cy(P, mt, 0.018, 0.016, 0.0 + i * 0.065, 0.04, 0.03, false));
  bx(C, body, 0.6, 0.85, 0.42, 0, 1.35, -0.1);
  const sc = mesh(S.g.plane, S.m.screen, C, 0, 1.3, 0.112, false); sc.scale.set(0.5, 0.4, 1); sc.rotation.x = -0.15;
  bx(C, marquee, 0.6, 0.2, 0.24, 0, 1.68, 0.02);
  bx(C, glowMat, 0.62, 0.022, 0.26, 0, 1.791, 0.02, false);           // 頂邊燈條＝主要發光物（高處相機看得到）
  bx(C, S.m.metal, 0.2, 0.18, 0.012, 0, 0.5, 0.312);
  bx(C, S.m.coinGlow, 0.03, 0.05, 0.006, -0.04, 0.53, 0.32, false);
  return C;
}
function buildBeacon(parent, x, y, z) {         // 小警示燈＋不投影的點光源
  const B = new THREE.Group(); B.position.set(x, y, z); parent.add(B);
  cy(B, S.m.beaconBase, 0.035, 0.03, 0, 0.015, 0);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x8a3a28, emissive: 0xffc46b, emissiveIntensity: 0, roughness: 0.25, transparent: true, opacity: 0.92 });
  mesh(S.g.dome, domeMat, B, 0, 0.03, 0, false);
  const light = new THREE.PointLight(0xffc46b, 0, 2.2, 2); light.position.set(0, 0.12, 0); light.castShadow = false; light.visible = false; B.add(light);
  return { domeMat, light };
}
function buildPig(g, spot, r) {
  const P = new THREE.Group(); P.position.set(spot[0], spot[1], spot[2]); P.rotation.y = 0.5 + (r() - 0.5) * 0.6; P.scale.setScalar(0.9); g.add(P);
  const { m } = S;
  mesh(S.g.pigBody, m.pig, P, 0, 0.13, 0).scale.set(1.25, 1, 1.05);
  mesh(S.g.pigSnout, m.pig, P, 0, 0.125, 0.115).rotation.x = Math.PI / 2;
  for (const dx of [-0.05, 0.05]) {
    const e = mesh(S.g.pigEar, m.pig, P, dx, 0.225, 0.04); e.rotation.z = -dx * 6; e.rotation.x = 0.3;
    mesh(S.g.pigEye, m.black, P, dx * 0.85, 0.165, 0.093, false);
  }
  for (const [lx, lz] of [[-0.065, -0.05], [0.065, -0.05], [-0.065, 0.05], [0.065, 0.05]]) mesh(S.g.pigLeg, m.pig, P, lx, 0.025, lz);
  mesh(S.g.pigSlot, m.black, P, 0, 0.231, -0.01, false);
  const c = mesh(S.g.coin, m.gold, P, 0, 0.27, -0.01); c.rotation.x = Math.PI / 2;
}
// 跳動的東西（grid）：回傳一個 Group，update 只動它
function buildHopper(g, station, spot) {
  const H = new THREE.Group(); H.position.set(spot[0], spot[1], spot[2]); g.add(H);
  const { m } = S; let base = 0.05;
  if (station === "dnd") { mesh(S.g.d20, S.dice[2], H).scale.setScalar(1.15); base = 0.052; }
  else if (station === "arcade") { const c = mesh(S.g.coin, m.gold, H); c.rotation.x = Math.PI / 2; c.scale.set(1.3, 1.3, 1.3); base = 0.055; }
  else if (station === "radio") { rbx(H, m.black, 0.055, 0.12, 0.035, 0, 0, 0); cy(H, m.black, 0.005, 0.09, 0.018, 0.1, 0); base = 0.06; }
  else if (station === "scoops") { mesh(S.g.sphere, S.flavors[0], H).scale.setScalar(0.05); base = 0.05; }
  else if (station === "lab") { const w = cy(H, m.waffle, 0.055, 0.016, 0, 0, 0); w.rotation.x = 0.2; base = 0.03; }
  else { cy(H, m.red, 0.032, 0.11, 0, 0, 0); base = 0.055; }   // bikes：汽水罐
  return { obj: H, y0: spot[1], base };
}
// 疊高的東西（mart）
const STACK = {
  dnd: { w: 0.2, d: 0.26, nat: 0.06, geo: "box" },     // 規則書
  arcade: { w: 0.16, d: 0.11, nat: 0.05, geo: "box" },  // 遊戲卡匣
  radio: { w: 0.2, d: 0.13, nat: 0.04, geo: "box" },    // 錄音帶
  scoops: { w: 1, d: 1, nat: 0.09, geo: "cup" },        // 冰淇淋杯
  lab: { w: 0.22, d: 0.3, nat: 0.05, geo: "box" },      // 機密檔案夾
  bikes: { w: 0.24, d: 0.18, nat: 0.1, geo: "box" },    // 零件盒
};
const STACK_MAX = 16;
function buildStack(g, station, spot) {
  const P = new THREE.Group(); P.position.set(spot[0], spot[1], spot[2]); g.add(P);
  const cfg = STACK[station], mats = S.stackMats[station], items = [];
  for (let i = 0; i < STACK_MAX; i++) {
    const it = mesh(cfg.geo === "cup" ? S.g.cupGeo : S.g.box, mats[i % mats.length], P);
    it.visible = false; items.push(it);
  }
  const sign = new THREE.Group(); P.add(sign);
  mesh(S.g.sign, S.m.signBack, sign);
  const tex = canvasTex(128, 64, () => {});
  const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 });
  mesh(S.g.signFace, faceMat, sign, 0, 0, 0.0065, false);
  sign.rotation.x = -0.25;
  let last = -1;
  function setOrders(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n === last) return; last = n;
    const shown = Math.min(n, STACK_MAX), h = shown ? Math.min(cfg.nat, 0.8 / shown) : 0, r = rng(n * 977 + 13);
    items.forEach((it, i) => {
      it.visible = i < shown; if (!it.visible) return;
      it.scale.set(cfg.w, h * 0.92, cfg.d);
      it.position.set((r() - 0.5) * 0.025, h * i + h * 0.47, (r() - 0.5) * 0.025);
      it.rotation.y = (r() - 0.5) * 0.25;
    });
    sign.position.set(0, shown * h + 0.065, 0.02); sign.visible = n > 0;
    const c = tex.userData.canvas, x = c.getContext("2d");
    x.fillStyle = "#fff8ec"; x.fillRect(0, 0, 128, 64); x.fillStyle = "#f97316"; x.fillRect(0, 0, 128, 10);
    x.fillStyle = "#2a2420"; x.font = "bold 40px system-ui, -apple-system, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("×" + n, 64, 39); tex.needsUpdate = true;
  }
  return { setOrders };
}

/* ---------- 六種站點 ---------- */
// 每個 builder 回傳：{ anchor:[x,z], alert:{parent?,pos}, spot:[x,y,z], tick?(t) }
const BUILD = {
  dnd(g, A, glow, r) {                     // 地下室桌遊桌
    const { m } = S;
    buildTable(g, m.wood, 1.6, 0.95);
    const mp = bx(g, m.map, 0.86, 0.008, 0.56, 0.02, 0.754, 0.08, false); mp.rotation.y = 0.04;
    // 地城主屏風：三片折板立在人前面，圖面朝 +z
    const sy = 0.75 + 0.13;
    bx(g, m.dm, 0.3, 0.26, 0.012, 0, sy, -0.22);
    for (const s of [-1, 1]) { const p = bx(g, m.dm, 0.3, 0.26, 0.012, s * 0.282, sy, -0.148); p.rotation.y = -s * 0.5; }
    // 小模型
    [[-0.22, 0.02], [-0.08, 0.2], [0.16, -0.02], [0.3, 0.22]].forEach(([x, z], i) => {
      cy(g, m.black, 0.022, 0.008, x, 0.762, z, false);
      const big = i === 3 ? 1.5 : 1;
      const c = mesh(S.g.cone, S.mini[i], g, x, 0.766 + 0.035 * big, z); c.scale.set(0.018 * big, 0.07 * big, 0.018 * big);
    });
    // 散落的骰子
    mesh(S.g.d20, S.dice[0], g, -0.5, 0.79, 0.28).rotation.set(0.4, 0.8, 0.2);
    mesh(S.g.d20, S.dice[1], g, -0.38, 0.79, 0.36).rotation.set(1.1, 0.2, 0.5);
    // 角色卡兩張
    for (const [x, z, ry] of [[-0.45, -0.1, 0.2], [0.55, -0.15, -0.3]]) bx(g, m.parchment, 0.15, 0.004, 0.2, x, 0.754, z, false).rotation.y = ry;
    // 提燈＝主要發光物
    cy(g, m.metal, 0.05, 0.03, -0.62, 0.765, -0.12);
    cy(g, glow, 0.036, 0.1, -0.62, 0.83, -0.12, false);
    const cap = mesh(S.g.cone, m.metal, g, -0.62, 0.9, -0.12); cap.scale.set(0.05, 0.04, 0.05);
    // 汽水罐
    cy(g, m.red, 0.03, 0.1, 0.62, 0.8, -0.3); cy(g, m.red, 0.03, 0.1, -0.66, 0.8, 0.3);
    buildChair(A, m.woodLight, m.woodLight);
    return { anchor: [0, -0.75], alert: { pos: [0.7, 0.75, 0.08] }, spot: [0.5, 0.75, 0.32] };
  },
  arcade(g, A, glow) {                     // 街機店：一台在玩（斜對著人），一台朝相機
    const { m } = S;
    bx(g, m.carpet, 2.2, 0.006, 1.6, 0, 0.003, 0, false);
    buildCabinet(g, -0.5, -0.22, 1.22, m.cabBlack, m.sideRed, m.marquee1, glow);   // 正面朝 +x 偏 +z：人站在它右前方，相機看得到畫面
    const B = buildCabinet(g, 0.76, -0.02, 0.3, m.cabBlue, m.sideYellow, m.marquee2, glow);
    // 高腳小圓桌（放道具）
    cy(g, m.metal, 0.17, 0.03, 0.08, 0.015, 0.52);
    cy(g, m.chrome, 0.025, 0.78, 0.08, 0.41, 0.52);
    cy(g, m.cabBlack, 0.2, 0.03, 0.08, 0.815, 0.52);
    return { anchor: [0.1, -0.5], alert: { parent: B, pos: [0.2, 1.802, 0.02] }, spot: [0.08, 0.83, 0.52] };
  },
  radio(g, A, glow, r, st) {               // 自製無線電台
    const { m } = S;
    buildTable(g, m.woodLight, 1.5, 0.8);
    const sg = bx(g, m.cerebro, 0.5, 0.14, 0.01, 0.22, 0.62, 0.405, false); sg.rotation.z = 0.04;
    // 主收發機：正面朝人（−z）
    bx(g, m.radio, 0.56, 0.24, 0.34, -0.05, 0.87, 0.02);
    bx(g, m.radioFace, 0.52, 0.2, 0.01, -0.05, 0.87, -0.152);
    for (const x of [-0.22, 0.1]) cy(g, m.black, 0.04, 0.03, x, 0.85, -0.165).rotation.x = Math.PI / 2;
    bx(g, m.meter, 0.12, 0.06, 0.006, -0.06, 0.92, -0.16, false);
    // 頂上的真空管＝主要發光物
    for (let i = 0; i < 3; i++) mesh(S.g.capsule, glow, g, -0.22 + i * 0.11, 1.03, 0.1, false);
    // 喇叭箱：網罩朝相機
    bx(g, m.speaker, 0.22, 0.2, 0.2, 0.43, 0.85, 0.06);
    const gr = mesh(S.g.circle, m.grille, g, 0.43, 0.85, 0.161, false); gr.scale.setScalar(0.075);
    // 桌上麥克風
    cy(g, m.metal, 0.05, 0.02, -0.33, 0.76, -0.25);
    rod(g, m.chrome, 0.008, V(-0.33, 0.77, -0.25), V(-0.31, 0.93, -0.29));
    mesh(S.g.capsule, m.chrome, g, -0.31, 0.96, -0.29).scale.setScalar(1.2);
    // 耳機
    mesh(S.g.band, m.black, g, 0.25, 0.79, -0.24);
    for (const s of [-1, 1]) cy(g, m.black, 0.035, 0.03, 0.25 + s * 0.075, 0.79, -0.24).rotation.z = Math.PI / 2;
    // 牆角天線：細桿＋橫桿，頂端紅燈閃
    const ax = -0.93, az = -0.62;
    bx(g, m.metal, 0.2, 0.05, 0.2, ax, 0.025, az);
    cy(g, m.chrome, 0.016, 2.5, ax, 1.275, az);
    [[1.85, 0.7], [2.1, 0.55], [2.35, 0.4]].forEach(([y, L]) => rod(g, m.chrome, 0.009, V(ax - L / 2, y, az), V(ax + L / 2, y, az)));
    const blink = new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff2020, emissiveIntensity: 2.2 });
    mesh(S.g.sphere, blink, g, ax, 2.56, az, false).scale.setScalar(0.035);
    st.blink = blink;
    mesh(S.g.coax, m.black, g, 0, 0, 0, false);
    buildChair(A, m.wood, m.metal);
    return { anchor: [0, -0.75], alert: { pos: [0.62, 0.75, -0.28] }, spot: [0.56, 0.75, 0.27],
      tick: (t) => { blink.emissiveIntensity = Math.sin(t * 3.4) > 0.2 ? 2.6 : 0.15; } };
  },
  scoops(g, A, glow) {                     // 冰淇淋櫃台
    const { m } = S;
    bx(g, m.white, 1.98, 0.92, 0.55, 0, 0.46, 0.2);
    bx(g, m.scoopsFront, 2.0, 0.92, 0.02, 0, 0.46, 0.485);
    bx(g, m.counterTop, 2.06, 0.04, 0.64, 0, 0.94, 0.2);
    bx(g, glow, 2.0, 0.03, 0.02, 0, 0.9, 0.505, false);                  // 櫃台前緣燈條＝主要發光物
    // 玻璃冰櫃＋六桶冰淇淋
    S.flavors.forEach((mt, i) => cy(g, mt, 0.1, 0.1, -0.7 + (i % 3) * 0.24, 1.01, 0.08 + Math.floor(i / 3) * 0.24));
    bx(g, m.glass, 0.78, 0.32, 0.54, -0.46, 1.12, 0.2, false);
    bx(g, glow, 0.74, 0.02, 0.03, -0.46, 1.27, -0.04, false);
    // 甜筒架
    bx(g, m.woodLight, 0.24, 0.1, 0.1, 0.38, 1.01, 0.08);
    [0.3, 0.38, 0.46].forEach((x, i) => {
      const c = mesh(S.g.cone, m.cone, g, x, 1.1, 0.08); c.scale.set(0.032, 0.13, 0.032); c.rotation.x = Math.PI;
      if (i < 2) mesh(S.g.sphere, S.flavors[i === 0 ? 3 : 0], g, x, 1.19, 0.08).scale.setScalar(0.036);
    });
    // 店招：在人背後立起
    for (const s of [-1, 1]) bx(g, m.navy, 0.04, 2.0, 0.04, s * 0.72, 1.0, -0.86);
    bx(g, m.scoopsSign, 1.5, 0.32, 0.04, 0, 1.95, -0.86);
    return { anchor: [0, -0.5], alert: { pos: [0.62, 2.11, -0.86] }, spot: [0.8, 0.96, 0.33] };
  },
  lab(g, A, glow, r, st) {                 // 實驗室控制台＋磁帶電腦機櫃
    const { m } = S;
    bx(g, m.labMetal, 1.36, 0.7, 0.55, -0.2, 0.35, 0.1);
    const pl = mesh(S.g.plane, m.plate, g, -0.2, 0.42, 0.377, false); pl.scale.set(1.2, 0.26, 1);
    // 斜面操作板：前緣低、朝人
    const P = new THREE.Group(); P.position.set(-0.2, 0.74, -0.02); P.rotation.x = -0.35; g.add(P);
    bx(P, m.labDark, 1.36, 0.05, 0.36, 0, 0, 0);
    for (let i = 0; i < 6; i++) cy(P, S.btns[i % 3], 0.018, 0.02, -0.55 + i * 0.09, 0.03, 0.06, false);
    cy(P, m.yellow, 0.065, 0.02, 0.35, 0.03, 0.02);
    cy(P, m.btnRed, 0.045, 0.045, 0.35, 0.05, 0.02);
    // 後方高台＋兩台舊式螢幕（螢幕朝人）
    bx(g, m.labMetal, 1.36, 0.16, 0.22, -0.2, 0.78, 0.26);
    // 舊式螢幕放在人的左前方（不擋臉），斜對著人
    const crt = new THREE.Group(); crt.position.set(-0.4, 0.86, 0.22); crt.rotation.y = -0.35; g.add(crt);
    rbx(crt, m.crt, 0.4, 0.34, 0.38, 0, 0.17, 0);
    const sc = mesh(S.g.plane, m.terminal, crt, 0, 0.18, -0.192, false); sc.scale.set(0.32, 0.24, 1); sc.rotation.y = Math.PI;
    // 磁帶電腦機櫃：在人右後方、朝相機（不擋人）
    bx(g, m.labLight, 0.42, 1.75, 0.45, 0.86, 0.875, -0.42);
    const lp = mesh(S.g.plane, m.lights, g, 0.86, 0.8, -0.193, false); lp.scale.set(0.32, 0.24, 1);
    bx(g, glow, 0.32, 0.05, 0.012, 0.86, 1.13, -0.19, false);              // 機櫃燈條＝主要發光物
    const reels = [0.77, 0.95].map(x => { const c = mesh(S.g.circle, m.reel, g, x, 1.42, -0.192, false); c.scale.setScalar(0.078); return c; });
    buildChair(A, m.labDark, m.metal);
    return { anchor: [0.12, -0.75], alert: { pos: [0.86, 1.75, -0.42] }, spot: [-0.76, 0.86, 0.26],
      tick: (t) => { reels[0].rotation.z = t * 1.3; reels[1].rotation.z = -t * 0.9; } };
  },
  bikes(g, A, glow, r, st) {               // 腳踏車維修台
    const { m } = S;
    // 維修架：十字底座＋立柱＋夾臂
    bx(g, m.metal, 0.6, 0.03, 0.06, -0.11, 0.015, -0.15); bx(g, m.metal, 0.06, 0.03, 0.6, -0.11, 0.015, -0.15);
    cy(g, m.metal, 0.022, 0.7, -0.11, 0.35, -0.15);
    bx(g, m.metal, 0.04, 0.04, 0.3, -0.11, 0.68, 0.0);
    // 腳踏車（沿 x 軸，側面朝相機）
    const B = new THREE.Group(); B.position.set(0, 0, 0.15); g.add(B);
    const R = V(-0.48, 0.42, 0), F = V(0.48, 0.42, 0), BB = V(-0.05, 0.4, 0), ST = V(-0.17, 0.8, 0), HT = V(0.33, 0.84, 0), HB = V(0.37, 0.7, 0);
    let spin = null;
    for (const W of [R, F]) {
      mesh(S.g.tire, m.tire, B, W.x, W.y, 0);
      mesh(S.g.rim, m.chrome, B, W.x, W.y, 0, false);
      const sp = mesh(S.g.circle, m.spokes, B, W.x, W.y, 0, false); sp.scale.setScalar(0.27);
      if (W === R) spin = sp;
    }
    for (const [a, b] of [[BB, ST], [ST, HT], [BB, HB], [BB, R], [ST, R], [HB, F], [HB, HT]]) rod(B, m.bikeRed, 0.017, a, b);
    rod(B, m.chrome, 0.012, HT, V(0.3, 1.0, 0));
    rod(B, m.chrome, 0.012, V(0.3, 1.0, -0.24), V(0.3, 1.0, 0.24));
    rbx(B, m.black, 0.32, 0.05, 0.12, -0.27, 0.85, 0);                     // 長坐墊
    cy(B, m.chrome, 0.08, 0.012, BB.x, BB.y, 0.03).rotation.x = Math.PI / 2;
    // 工具箱
    const tb = bx(g, m.red, 0.4, 0.22, 0.22, 0.82, 0.11, 0.45); tb.rotation.y = 0.3;
    const hd = bx(g, m.black, 0.22, 0.03, 0.03, 0.82, 0.235, 0.45); hd.rotation.y = 0.3;
    // 木箱上的手電筒：鏡片＋光束＝主要發光物
    bx(g, m.crate, 0.4, 0.32, 0.36, -0.82, 0.16, 0.38);
    const fl = cy(g, m.black, 0.03, 0.2, -0.86, 0.355, 0.38); fl.rotation.z = Math.PI / 2;
    const lens = cy(g, glow, 0.036, 0.012, -0.755, 0.355, 0.38, false); lens.rotation.z = Math.PI / 2;
    const beamMat = new THREE.MeshBasicMaterial({ color: C_MUT, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = mesh(S.g.cone, beamMat, g, -0.43, 0.38, 0.32, false); beam.scale.set(0.16, 0.64, 0.16);
    beam.rotation.z = Math.PI / 2; beam.rotation.y = 0.15; beam.receiveShadow = false;
    st.beamMat = beamMat;
    bx(g, m.chrome, 0.2, 0.012, 0.035, 0.42, 0.006, 0.62).rotation.y = 0.5;   // 地上扳手
    return { anchor: [0.05, -0.55], alert: { pos: [-0.94, 0.32, 0.24] }, spot: [0.82, 0.22, 0.45],
      tick: (t) => { spin.rotation.z = -t * 2.2; } };
  },
};

/* ---------- 主函式 ---------- */
export function createStation({ kind = "other", seed = 1, orders = null, station } = {}) {
  shared();
  const name = STATIONS.includes(station) ? station : STATIONS[(seed >>> 0) % STATIONS.length];
  const seat = STATION_SEAT[name];
  const r = rng(seed * 2654435761);
  const group = new THREE.Group(); group.name = "station-" + name;

  const workerAnchor = new THREE.Object3D(); group.add(workerAnchor);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, emissive: C_MUT, emissiveIntensity: 1.3, roughness: 0.3 });
  const st = {};
  const info = BUILD[name](group, workerAnchor, glowMat, r, st);
  workerAnchor.position.set(info.anchor[0], 0, info.anchor[1]);

  const beacon = buildBeacon(info.alert.parent || group, ...info.alert.pos);
  let prop = {};
  if (kind === "grid") prop.hop = buildHopper(group, name, info.spot);
  else if (kind === "mart") prop = buildStack(group, name, info.spot);
  else buildPig(group, info.spot, r);

  const labelAnchor = new THREE.Object3D(); labelAnchor.position.set(0, 0.55, 0.6); group.add(labelAnchor);
  const hitbox = new THREE.Mesh(S.g.hit, S.hitMat); hitbox.position.set(0, 1.0, -0.05); group.add(hitbox);

  let alert = null;
  const profitColor = new THREE.Color(C_MUT);
  function setProfit(v) {
    profitColor.setHex(v == null || v === 0 || Number.isNaN(v) ? C_MUT : v > 0 ? C_POS : C_NEG);
    glowMat.emissive.copy(profitColor); glowMat.emissiveIntensity = 1.3;
    if (st.beamMat) st.beamMat.color.copy(profitColor);
  }
  function applyAlert(k) {        // k：閃爍係數 0..1
    const { domeMat, light } = beacon;
    if (alert === "red") { domeMat.emissive.setHex(0xff3b3b); domeMat.emissiveIntensity = 0.2 + 2.6 * k; light.color.setHex(0xff3030); light.intensity = 3.2 * k; }
    else if (alert === "yellow") { domeMat.emissive.setHex(0xffc46b); domeMat.emissiveIntensity = 2.2; light.color.setHex(0xffc46b); light.intensity = 1.8; }
    else { domeMat.emissiveIntensity = 0; light.intensity = 0; }
  }
  // 沒警示時關燈（visible=false 不計入場景光源數）
  function setAlert(a) { alert = a === "red" || a === "yellow" ? a : null; beacon.light.visible = !!alert; applyAlert(1); }
  function setOrders(n) { if (prop.setOrders) prop.setOrders(n); }

  setProfit(null); setAlert(null);
  if (kind === "mart") setOrders(orders ?? 1);

  const phase = r() * 10;
  function update(t) {
    if (name === "arcade") {                              // 街機畫面：每秒約 7 格（共用一張紋理，一格只重畫一次）
      const f = RM ? 0 : Math.floor(t * 7);
      if (f !== S.game.f || S.game.last < 0) { S.game.f = f; S.game.last = t; drawGame(S.game.g, f); S.game.t.needsUpdate = true; }
    }
    if (RM) return;
    const tt = t + phase;
    glowMat.emissiveIntensity = name === "dnd"
      ? 1.15 + 0.25 * Math.sin(tt * 9) * Math.sin(tt * 4.3)          // 提燈火光閃動
      : 1.0 + 0.4 * (0.5 + 0.5 * Math.sin(tt * 2.2));                // 呼吸
    if (st.beamMat) st.beamMat.opacity = 0.12 + 0.05 * (0.5 + 0.5 * Math.sin(tt * 2.2));
    if (alert === "red") applyAlert(Math.sin(tt * 14) > 0 ? 1 : 0.08);
    if (info.tick) info.tick(tt);
    if (prop.hop) {                                       // |sin| 落地感＋觸底壓扁
      const h = prop.hop, b = Math.abs(Math.sin(tt * 2.6)), o = h.obj;
      o.position.y = h.y0 + h.base + b * 0.22;
      o.rotation.y = tt * 3.2; if (name === "dnd") o.rotation.x = tt * 4.1;
      const sq = b < 0.08 ? 0.85 + b * 1.9 : 1;
      o.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    }
  }
  if (RM && prop.hop) prop.hop.obj.position.y = prop.hop.y0 + prop.hop.base;

  return { group, workerAnchor, labelAnchor, hitbox, seat, station: name, setProfit, setAlert, setOrders, update };
}
