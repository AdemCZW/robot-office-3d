// 80 年代懸疑主題：怪物與場景元素（傳送門、細長人形怪、四足小怪、窗外巨大蜘蛛黑影、天花板彩色燈串、
// 門口腳踏車、實驗室標示牌、兩塊霓虹招牌、社團小標牌）。全部程式產生（CanvasTexture／幾何體），不下載任何檔案。
// 介面：buildWorld({ THREE, scene, renderer, night, reducedMotion })
//   -> { group, update(t, dt), setMode("normal"|"upside"), attack(targetVec3), dispose() }
// - normal：只有小而暗的傳送門、燈串、招牌、腳踏車；upside：傳送門變大變亮＋紅色微粒、小怪亂跑、窗外黑影、燈串變紅亂熄、
//   人形怪每 20～40 秒從傳送門出來沿房間邊緣走一圈。attack(target)：人形怪立刻出動，走到 target 後方張開花瓣吼，再走回去。
// - 發光物：MeshBasicMaterial（toneMapped:false、HDR 顏色）＋ userData.bloom = true，fx.js 的選擇性 bloom 會抓到。
// - 唯一的燈：傳送門一盞紅色 PointLight（不投影；normal 時強度 0，不切 visible，避免 shader 重編譯）。
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// room.js 的尺寸（不 import room.js，避免耦合；改房間時這裡要跟著對）
const X0 = -8, X1 = 10, Z0 = -6, Z1 = 7, WALL_H = 3.2, WALL_T = 0.2;
const XF = X0 + WALL_T / 2;   // 左牆牆面 x = -7.9
const ZF = Z0 + WALL_T / 2;   // 後牆牆面 z = -5.9
const BOX_BACK = -7.3;        // 窗外景箱的天空板
const DOOR = { z0: 4.4, z1: 6.0, h: 2.25 };

// 傳送門：右後角空地（工位區 x ≤ 4.4、金庫 x 6…8.5 / z −1…1.5、盆栽 (9.35, −5.3) 之間），朝房間略轉
const GATE = { x: 9.2, z: -3.3, ry: -0.5, cy: 1.35, h: 2.5 };
const RED = 0xcb1d29, NEON_ON = 1.7;
const BULB_COLS = [0xcb1d29, 0xf5c518, 0x2fa84f, 0x2f6fde, 0xf27a1a];
const SKIN = 0x675a51, SKIN_D = 0x463a33, INNER = 0x8a1016, INNER_RIM = 0xc2464a, TOOTH = 0xe9e2cf, CLAW = 0x2e2520;

export function buildWorld(ctx) {
  const { THREE, scene, renderer } = ctx;
  const night = !!ctx.night, RM = !!ctx.reducedMotion;
  const root = new THREE.Group(); root.name = "stworld"; scene.add(root);
  const maxAniso = renderer && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
  const disposables = new Set();
  const keep = o => (disposables.add(o), o);

  /* ---------- 小工具 ---------- */
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
  const tex = c => { const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso); return t; };
  let seed = 1983;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  const rbox = (w, h, d, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 0.001));
  const glowMat = (map, extra = {}) => { const m = keep(new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthWrite: false, ...extra })); m.userData.bloom = true; return m; };
  const Y = new THREE.Vector3(0, 1, 0);
  const V2 = (x, z) => new THREE.Vector2(x, z);

  // 靜態合併：同材質合成一個 mesh（同 stdecor.js 的作法）
  const buckets = new Map();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  function put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true, parentMatrix = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    if (parentMatrix) _m.premultiply(parentMatrix);
    g.applyMatrix4(_m);
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = mat.uuid + (shadow ? "s" : "n");
    if (!buckets.has(key)) buckets.set(key, { mat, shadow, geos: [] });
    buckets.get(key).geos.push(g);
  }
  function flush(parent = root) {
    for (const { mat, shadow, geos } of buckets.values()) {
      const mesh = new THREE.Mesh(keep(mergeGeometries(geos, false)), mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh);
      geos.forEach(g => g.dispose());
    }
    buckets.clear();
  }
  // 兩點之間的圓柱（a → b），r0 在 a 端
  function rod(a, b, r0, r1 = r0, seg = 8) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g;
  }
  // 粗細漸變的管子（根部 r0 → 尾端 r1）
  function taperTube(curve, r0, r1, tub = 24, rad = 6) {
    const geo = new THREE.TubeGeometry(curve, tub, 1, rad);
    const pa = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= tub; i++) {
      curve.getPointAt(i / tub, c); const r = r0 + (r1 - r0) * (i / tub);
      for (let j = 0; j <= rad; j++) { const idx = i * (rad + 1) + j; v.fromBufferAttribute(pa, idx).sub(c).multiplyScalar(r).add(c); pa.setXYZ(idx, v.x, v.y, v.z); }
    }
    geo.computeVertexNormals();
    return geo;
  }
  const softDot = (() => {
    const [c, g] = canvas(64, 64);
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.35, "rgba(255,255,255,.6)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return tex(c);
  })();

  // 亮度乘上去時主色通道照乘（>1 給 bloom 抓），次要通道壓住，避免紅燈過曝變粉紅（同 stdecor.js）
  function hdr(base, f, out) {
    const m = Math.max(base.r, base.g, base.b, 1e-4);
    const ch = c => { const r = c / m, lin = f * c; return lin <= r ? lin : r + (lin - r) * r * r; };
    return out.setRGB(ch(base.r), ch(base.g), ch(base.b));
  }

  /* ============================================================
     1. 天花板彩色燈串：四條從左牆頂斜拉到後牆頂，每 ~3.5 m 一個掛勾（自然下垂）
     ============================================================ */
  const HOOK_Y = 3.14;
  const STRANDS = [
    [V2(XF + 0.03, -2.4), V2(-2.2, ZF + 0.03)],
    [V2(XF + 0.03, 0.6), V2(2.2, ZF + 0.03)],
    [V2(XF + 0.03, 3.8), V2(6.0, ZF + 0.03)],
    [V2(XF + 0.03, 6.8), V2(9.8, ZF + 0.03)],
  ];
  const wireMat = std(0x1d2a1c, 0.6);
  const bulbs = [];
  {
    const sock = new THREE.CylinderGeometry(0.012, 0.014, 0.035, 6);
    for (const [a, b] of STRANDS) {
      const L = a.distanceTo(b), n = Math.max(2, Math.round(L / 3.5));
      for (let j = 0; j < n; j++) {
        const pa = a.clone().lerp(b, j / n), pb = a.clone().lerp(b, (j + 1) / n), span = pa.distanceTo(pb);
        const sag = 0.16 + span * 0.035 + rnd() * 0.05;
        const at = f => new THREE.Vector3(pa.x + (pb.x - pa.x) * f, HOOK_Y - 4 * sag * f * (1 - f), pa.y + (pb.y - pa.y) * f);
        const pts = []; for (let k = 0; k <= 12; k++) pts.push(at(k / 12));
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.007, 4);
        put(tube, wireMat, 0, 0, 0, 0, 0, 0, false);
        const cnt = Math.max(3, Math.floor(span / 0.3));
        for (let i = 0; i < cnt; i++) {
          const p = at((i + 0.5) / cnt);
          put(sock.clone(), wireMat, p.x, p.y - 0.022, p.z, 0, 0, 0, false);
          const col = new THREE.Color(BULB_COLS[bulbs.length % BULB_COLS.length]);
          bulbs.push({ pos: new THREE.Vector3(p.x, p.y - 0.068, p.z), colN: col, colU: col.clone().lerp(new THREE.Color(RED), 0.85),
            ph: rnd() * 6.28, sp: 0.8 + rnd() * 1.6, lvl: 0.6, dead: 0, deadSeed: rnd() });
        }
      }
    }
    sock.dispose();
  }
  const bulbGeo = keep(new THREE.SphereGeometry(1, 10, 8)); bulbGeo.scale(0.028, 0.045, 0.028);
  { const pa = bulbGeo.attributes.position; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y < 0) { const k = 1 + y * 6; pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); } } bulbGeo.computeVertexNormals(); }   // 下端收尖（C7 燈泡）
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); bulbMat.userData.bloom = true;
  const bulbIM = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
  bulbIM.name = "stringLights";
  {
    const o = new THREE.Object3D();
    bulbs.forEach((b, i) => { o.position.copy(b.pos); o.updateMatrix(); bulbIM.setMatrixAt(i, o.matrix); bulbIM.setColorAt(i, b.colN); });
    bulbIM.instanceMatrix.needsUpdate = true;
  }
  root.add(bulbIM);

  /* ============================================================
     2. 門口腳踏車（3 台，停在走道前方 z ≈ 6.45、x −6.7…−1.1；一台紅色）
     ============================================================ */
  {
    const tire = std(0x1c1b1a, 0.9), chrome = std(0xd8d8d8, 0.25, 0.9), seatBlack = std(0x1a1716, 0.5), seatWhite = std(0xece6da, 0.5), grip = std(0x2a2a2a, 0.8);
    const frames = [std(0xc41e24, 0.35, 0.3), std(0x2f6fde, 0.35, 0.3), std(0x2b5d3a, 0.4, 0.3)];
    const bikes = [{ x: -5.85, lean: 0.13, ry: 0.06, f: 0, seat: seatWhite }, { x: -3.95, lean: -0.12, ry: -0.05, f: 1, seat: seatBlack }, { x: -2.05, lean: 0.11, ry: 0.04, f: 2, seat: seatBlack }];
    const R = 0.31, WB = 1.04;   // 輪半徑、軸距
    for (const bk of bikes) {
      const M4 = new THREE.Matrix4().compose(new THREE.Vector3(bk.x, 0, 6.45), new THREE.Quaternion().setFromEuler(new THREE.Euler(bk.lean, bk.ry, 0, "YXZ")), new THREE.Vector3(1, 1, 1));
      const F = frames[bk.f];
      const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
      const rearHub = v(-WB / 2, R), frontHub = v(WB / 2, R);
      for (const h of [rearHub, frontHub]) {
        put(new THREE.TorusGeometry(R - 0.022, 0.024, 8, 28), tire, h.x, h.y, 0, 0, 0, 0, true, M4);
        put(new THREE.TorusGeometry(R - 0.05, 0.008, 4, 28), chrome, h.x, h.y, 0, 0, 0, 0, false, M4);
        for (let s = 0; s < 8; s++) { const a = s / 8 * Math.PI; put(new THREE.CylinderGeometry(0.003, 0.003, (R - 0.05) * 2, 3), chrome, h.x, h.y, 0, 0, 0, a, false, M4); }
        put(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 10), chrome, h.x, h.y, 0, Math.PI / 2, 0, 0, false, M4);
      }
      const bb = v(-0.04, 0.3), seatTop = v(-0.2, 0.74), headTop = v(0.38, 0.8);
      const tubes = [[rearHub, bb, 0.016], [bb, seatTop, 0.02], [rearHub, v(-0.2, 0.7), 0.013], [bb, v(0.36, 0.7), 0.024], [v(-0.19, 0.69), v(0.37, 0.74), 0.02], [v(0.37, 0.66), headTop, 0.026], [headTop, frontHub, 0.014]];
      for (const [a, b, r] of tubes) {
        put(rod(a, b, r), F, 0, 0, 0, 0, 0, 0, true, M4);
        if (a === rearHub || a === headTop) { put(rod(v(a.x, a.y, 0.045), v(b.x, b.y, 0.045), r * 0.8), F, 0, 0, 0, 0, 0, 0, false, M4); put(rod(v(a.x, a.y, -0.045), v(b.x, b.y, -0.045), r * 0.8), F, 0, 0, 0, 0, 0, 0, false, M4); }
      }
      // 高把手（ape hanger）
      const hb = [v(0.38, 0.8, 0), v(0.36, 0.86, 0), v(0.3, 1.02, 0.2), v(0.26, 1.04, 0.24)];
      for (const s of [1, -1]) {
        const pts = hb.map(p => v(p.x, p.y, p.z * s));
        for (let i = 0; i < pts.length - 1; i++) put(rod(pts[i], pts[i + 1], 0.011), chrome, 0, 0, 0, 0, 0, 0, false, M4);
        put(rod(v(0.27, 1.035, 0.22 * s), v(0.16, 1.03, 0.25 * s), 0.018), grip, 0, 0, 0, 0, 0, 0, false, M4);
      }
      put(rod(v(0.36, 0.86, 0), v(0.35, 0.86, 0.001), 0.01), chrome, 0, 0, 0, 0, 0, 0, false, M4);
      // 香蕉座椅＋椅背桿
      const seat = new THREE.CapsuleGeometry(0.055, 0.42, 4, 10); seat.rotateZ(Math.PI / 2); seat.scale(1, 0.55, 0.85);
      put(seat, bk.seat, -0.3, 0.79, 0, 0, 0, 0.12, true, M4);
      put(rod(v(-0.5, 0.78), v(-0.58, 1.0), 0.008), chrome, 0, 0, 0, 0, 0, 0, false, M4);
      put(rod(v(-0.2, 0.74), v(-0.2, 0.79), 0.014), chrome, 0, 0, 0, 0, 0, 0, false, M4);
      // 曲柄、齒盤、踏板、腳架、擋泥板
      put(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 18), chrome, bb.x, bb.y, 0.05, Math.PI / 2, 0, 0, false, M4);
      put(rod(v(bb.x, bb.y, 0.07), v(bb.x + 0.1, bb.y - 0.12, 0.07), 0.008), chrome, 0, 0, 0, 0, 0, 0, false, M4);
      put(rbox(0.09, 0.02, 0.05, 0.006), grip, bb.x + 0.1, bb.y - 0.13, 0.1, 0, 0, 0, false, M4);
      put(rod(v(-0.08, 0.3, -0.03), v(-0.12, 0.0, -0.2), 0.008), chrome, 0, 0, 0, 0, 0, 0, false, M4);
      const fender = new THREE.TorusGeometry(R + 0.03, 0.012, 4, 16, Math.PI * 0.55);
      put(fender, chrome, rearHub.x, rearHub.y, 0, 0, 0, Math.PI * 0.35, false, M4);
      put(fender.clone(), chrome, frontHub.x, frontHub.y, 0, 0, 0, Math.PI * 0.12, false, M4);
      fender.dispose();
    }
  }

  /* ============================================================
     3. 標示牌與霓虹招牌
     ============================================================ */
  const signBack = std(0x1b1d26, 0.6), signMetal = std(0x8d9196, 0.4, 0.6), plaqueWood = std(0x5a3620, 0.6);
  const neon = [];   // { mat, base, kind }
  // (a) 實驗室標示牌：後牆右窗右側（x 8.77…9.93、y 2.13…2.71），在傳送門正後方
  {
    const W = 1.16, H = 0.58, cx = 9.35, cy = 2.42, z = ZF + 0.03;
    const [c, g] = canvas(640, 320);
    g.fillStyle = "#f1eee6"; g.fillRect(0, 0, 640, 320);
    g.fillStyle = "#1f3a68"; g.fillRect(0, 0, 640, 58);
    g.fillStyle = "#f1eee6"; g.font = "bold 26px 'Helvetica Neue', Arial, sans-serif"; g.textAlign = "center"; g.fillText("U.S. DEPARTMENT OF ENERGY", 320, 39);
    g.fillStyle = "#1a2a4a"; g.font = "bold 66px 'Helvetica Neue', Arial, sans-serif"; g.fillText("MAPLEWOOD", 320, 128);
    g.font = "bold 40px 'Helvetica Neue', Arial, sans-serif"; g.fillText("NATIONAL LABORATORY", 320, 178);
    g.fillStyle = "#cb1d29"; g.fillRect(40, 204, 560, 4);
    g.font = "bold 26px 'Helvetica Neue', Arial, sans-serif"; g.fillText("RESTRICTED AREA", 320, 246);
    g.fillStyle = "#333"; g.font = "20px 'Helvetica Neue', Arial, sans-serif"; g.fillText("AUTHORIZED PERSONNEL ONLY", 320, 280);
    g.strokeStyle = "#1f3a68"; g.lineWidth = 6; g.strokeRect(3, 3, 634, 314);
    for (const [bx, by] of [[18, 76], [622, 76], [18, 302], [622, 302]]) { g.fillStyle = "#9aa0a6"; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); }
    put(rbox(W + 0.05, H + 0.05, 0.03, 0.01), signMetal, cx, cy, z + 0.015);
    const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), std(0xffffff, 0.55, 0, { map: tex(c) }));
    face.position.set(cx, cy, z + 0.032); face.receiveShadow = true; root.add(face);
  }
  // 霓虹字板：深色底板（不發光）＋發光字面（透明 canvas）
  function neonSign(w, h, cw, ch, draw, pos, ry, kind) {
    const [c, g] = canvas(cw, ch); draw(g, cw, ch);
    const m4 = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
    put(rbox(w + 0.06, h + 0.06, 0.04, 0.012), signBack, 0, 0, 0.02, 0, 0, 0, true, m4);
    const mat = glowMat(tex(c)); mat.color.setScalar(NEON_ON);
    const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), mat);
    face.position.set(0, 0, 0.045).applyMatrix4(m4); face.rotation.y = ry; root.add(face);
    neon.push({ mat, kind, ph: rnd() * 10 });
  }
  const glowText = (g, txt, x, y, col, blur, lw) => {
    g.save(); g.shadowColor = col; g.shadowBlur = blur; g.lineJoin = "round";
    g.strokeStyle = col; g.lineWidth = lw; g.strokeText(txt, x, y); g.strokeText(txt, x, y);
    g.shadowBlur = blur * 0.4; g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = lw * 0.32; g.strokeText(txt, x, y); g.restore();
  };
  // (b) 遊樂場霓虹：左牆門右邊那段牆（z 6.04…6.96、y 2.2…2.82；門上方有 room.js 的 EXIT 燈，不壓它）
  neonSign(0.92, 0.62, 600, 404, (g, w, h) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "italic 900 112px 'Futura', 'Avenir Next Condensed', 'Arial Black', sans-serif"; glowText(g, "PALACE", w / 2, 130, "#ff2e63", 8, 8);
    g.font = "bold 74px 'Futura', 'Avenir Next', sans-serif"; glowText(g, "ARCADE", w / 2, 270, "#1fb8ff", 6, 6);
    g.fillStyle = "#ffd23f"; g.shadowColor = "#ffd23f"; g.shadowBlur = 4;
    for (let i = 0; i < 22; i++) { const x = 30 + i * (w - 60) / 21; g.beginPath(); g.arc(x, 22, 5, 0, 7); g.fill(); g.beginPath(); g.arc(x, h - 22, 5, 0, 7); g.fill(); }
    g.beginPath(); g.moveTo(60, 345); g.lineTo(100, 330); g.lineTo(100, 360); g.fill();
  }, new THREE.Vector3(XF + 0.005, 2.51, 6.5), Math.PI / 2, "palace");
  // (c) 商場霓虹：後牆左窗正上方（x −6.35…−4.05、y 2.75…3.17）
  neonSign(2.3, 0.42, 1024, 188, (g, w, h) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "italic bold 132px 'Snell Roundhand', 'Brush Script MT', 'Apple Chancery', cursive"; glowText(g, "Moonlight", w / 2 + 30, h / 2 + 8, "#ff4fd8", 8, 7);
    const sx = 150, sy = 70, star = (r1, r2) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } g.closePath(); };
    g.save(); g.shadowColor = "#4fc3ff"; g.shadowBlur = 6; g.strokeStyle = "#4fc3ff"; g.lineWidth = 7; star(54, 22); g.stroke(); g.strokeStyle = "#fff"; g.lineWidth = 2.5; star(54, 22); g.stroke(); g.restore();
  }, new THREE.Vector3(-5.2, 2.96, ZF + 0.005), 0, "starcourt");
  // (d) 社團小標牌：左牆門與牆端之間（z 6.25…6.75、y 1.38…1.72）
  {
    const [c, g] = canvas(320, 220);
    const wg = g.createLinearGradient(0, 0, 320, 220); wg.addColorStop(0, "#6b4026"); wg.addColorStop(1, "#4a2a16");
    g.fillStyle = wg; g.fillRect(0, 0, 320, 220);
    g.strokeStyle = "#d9b45a"; g.lineWidth = 5; g.strokeRect(10, 10, 300, 200);
    g.fillStyle = "#e8c66a"; g.textAlign = "center";
    g.font = "bold 18px 'Georgia', serif"; g.fillText("MAPLEWOOD MIDDLE SCHOOL", 160, 50);
    g.font = "bold 58px 'Georgia', serif"; g.fillText("A.V. CLUB", 160, 118);
    g.font = "italic 20px 'Georgia', serif"; g.fillText("Members Only · Est. 1983", 160, 158);
    g.fillStyle = "#cb1d29"; g.beginPath(); g.arc(160, 186, 7, 0, 7); g.fill();
    const W = 0.5, H = 0.34, cz = 6.5, cy = 1.55;
    put(rbox(0.03, H + 0.04, W + 0.04, 0.01), plaqueWood, XF + 0.015, cy, cz);
    const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), std(0xffffff, 0.5, 0.1, { map: tex(c) }));
    face.position.set(XF + 0.032, cy, cz); face.rotation.y = Math.PI / 2; face.receiveShadow = true; root.add(face);
  }

  flush();

  /* ============================================================
     4. 傳送門：發光直向裂縫＋肉質觸鬚＋外暈＋紅色微粒＋地面黏液＋一盞不投影紅燈
     ============================================================ */
  const gate = new THREE.Group(); gate.name = "gate";
  gate.position.set(GATE.x, 0, GATE.z); gate.rotation.y = GATE.ry; root.add(gate);
  const gateInner = new THREE.Group(); gateInner.position.y = GATE.cy; gate.add(gateInner);
  const gateFwd = new THREE.Vector3(Math.sin(GATE.ry), 0, Math.cos(GATE.ry));
  const GATE_C = V2(GATE.x, GATE.z), GATE_E = V2(GATE.x + gateFwd.x * 0.75, GATE.z + gateFwd.z * 0.75);   // 門中心、出口
  let coreMat, haloMat, decalMat;
  {
    // 裂縫本體：鋸齒狀直向透鏡形（外紅 → 橘 → 黃白核心）
    const [c, g] = canvas(160, 512);
    const prof = []; for (let i = 0; i <= 32; i++) { const f = i / 32; prof.push({ f, w: Math.pow(Math.sin(Math.PI * f), 0.85) * (0.75 + 0.5 * rnd()), x: 80 + Math.sin(f * 11) * 7 + (rnd() - 0.5) * 7 }); }
    const shape = (k, jag) => { g.beginPath(); prof.forEach((p, i) => { const y = 10 + p.f * 492; g[i ? "lineTo" : "moveTo"](p.x - p.w * k - (i % 2 ? jag : 0), y); }); for (let i = prof.length - 1; i >= 0; i--) { const p = prof[i], y = 10 + p.f * 492; g.lineTo(p.x + p.w * k + (i % 2 ? 0 : jag), y); } g.closePath(); };
    g.save(); g.shadowColor = "rgba(255,40,20,1)"; g.shadowBlur = 34; g.fillStyle = "rgba(170,10,12,.85)"; shape(44, 5); g.fill(); g.restore();
    g.save(); g.shadowColor = "rgba(255,120,30,1)"; g.shadowBlur = 16; g.fillStyle = "#ff4a1c"; shape(26, 3); g.fill(); g.restore();
    g.fillStyle = "#ff7a2a"; shape(12, 2); g.fill();
    g.fillStyle = "#ffc27a"; shape(4, 1); g.fill();
    coreMat = glowMat(tex(c), { side: THREE.DoubleSide });
    const core = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.62, GATE.h)), coreMat); core.renderOrder = 2; gateInner.add(core);
    // 外暈（不標 bloom：bloom pass 直接略過，免得整片糊掉）
    const [hc, hg] = canvas(128, 256);
    hg.save(); hg.scale(1, 2); const rg = hg.createRadialGradient(64, 64, 4, 64, 64, 64); rg.addColorStop(0, "rgba(255,70,30,.75)"); rg.addColorStop(0.5, "rgba(200,20,20,.25)"); rg.addColorStop(1, "rgba(120,0,0,0)"); hg.fillStyle = rg; hg.fillRect(0, 0, 128, 128); hg.restore();
    haloMat = keep(new THREE.MeshBasicMaterial({ map: tex(hc), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const halo = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, GATE.h * 1.5)), haloMat); halo.position.z = -0.02; halo.renderOrder = 1; gateInner.add(halo);
    // 觸鬚：沿裂縫兩側往外捲的肉質管子（合併成一個 mesh）
    const tents = [];
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, f = 0.08 + (i / 13) * 0.84, y = (f - 0.5) * GATE.h * 0.92;
      const w0 = Math.pow(Math.sin(Math.PI * f), 0.85) * 0.12;
      const len = 0.25 + rnd() * 0.45, curl = (rnd() - 0.5) * 0.5, out = side;
      const pts = [];
      for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push(new THREE.Vector3(out * (w0 + u * len), y + Math.sin(u * 2.6) * curl * len + (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.12 * u + Math.sin(u * 3) * 0.06)); }
      tents.push(taperTube(new THREE.CatmullRomCurve3(pts), 0.06 + rnd() * 0.035, 0.008, 18, 7));
    }
    // 邊緣一圈肉質唇
    const lip = []; for (let i = 0; i <= 24; i++) { const f = i / 24; lip.push(new THREE.Vector3(Math.pow(Math.sin(Math.PI * f), 0.85) * 0.14 + 0.01, (f - 0.5) * GATE.h * 0.98, 0)); }
    for (const s of [1, -1]) tents.push(taperTube(new THREE.CatmullRomCurve3(lip.map(p => new THREE.Vector3(p.x * s, p.y, p.z))), 0.035, 0.03, 40, 6));
    const tentMat = std(0x5c1a1d, 0.45, 0.05, { emissive: 0x3a0406, emissiveIntensity: 0.6 });
    const tm = new THREE.Mesh(keep(mergeGeometries(tents, false)), tentMat); tm.castShadow = false; gateInner.add(tm);
    tents.forEach(t => t.dispose());
    // 地面黏液（upside 才顯示）
    const [dc, dg] = canvas(256, 256);
    for (let i = 0; i < 70; i++) { const r = 10 + rnd() * 40, x = 128 + (rnd() - 0.5) * 150, y = 128 + (rnd() - 0.5) * 150; const gr = dg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${60 + rnd() * 40 | 0},8,12,.55)`); gr.addColorStop(1, "rgba(40,5,8,0)"); dg.fillStyle = gr; dg.fillRect(0, 0, 256, 256); }
    decalMat = keep(new THREE.MeshBasicMaterial({ map: tex(dc), transparent: true, depthWrite: false, opacity: 0 }));
    const decal = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 2.6)), decalMat); decal.rotation.x = -Math.PI / 2; decal.position.set(0, 0.012, 0.3); gate.add(decal);
  }
  const gateLight = new THREE.PointLight(0xff3018, 0, 8, 1.6); gateLight.castShadow = false; gateLight.position.set(0, GATE.cy, 0.6); gate.add(gateLight);
  // 紅色微粒（CPU 更新；顏色＝亮度，加法混色）
  const NP = 160;
  const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pts = [];
  for (let i = 0; i < NP; i++) pts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: -1 - rnd() * 3 });
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const pMat = keep(new THREE.PointsMaterial({ size: 0.07, map: softDot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const particles = new THREE.Points(pGeo, pMat); particles.frustumCulled = false; particles.visible = false; gate.add(particles);

  /* ============================================================
     5. 窗外巨大蜘蛛黑影（景箱裡：天空板 z −7.3 與遠層城市 z −7.11 之間）
     ============================================================ */
  const MF_Z = -7.21;
  const mf = new THREE.Group(); mf.name = "shadowSpider"; mf.position.set(0.3, 0, MF_Z); mf.visible = false; root.add(mf);
  const mfMat = keep(new THREE.MeshBasicMaterial({ color: 0x060309, transparent: true, opacity: 0, fog: false, toneMapped: false }));
  let mfGlowMat, mfSmokeMat;
  const mfLegs = [];
  {
    // 背後紅光（閃電時變亮）
    const [gc, gg] = canvas(256, 128);
    gg.save(); gg.scale(2, 1); const rg = gg.createRadialGradient(64, 70, 4, 64, 70, 64); rg.addColorStop(0, "rgba(255,60,40,1)"); rg.addColorStop(0.45, "rgba(200,20,30,.55)"); rg.addColorStop(1, "rgba(80,0,10,0)"); gg.fillStyle = rg; gg.fillRect(0, 0, 128, 128); gg.restore();
    mfGlowMat = keep(new THREE.MeshBasicMaterial({ map: tex(gc), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
    const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(13, 3.2)), mfGlowMat); glow.position.set(0, 1.8, -0.07); mf.add(glow);
    // 煙霧狀身體外圍
    const [sc, sg] = canvas(512, 192);
    for (let i = 0; i < 90; i++) { const x = 256 + (rnd() - 0.5) * 330 * (0.4 + rnd()), y = 70 + (rnd() - 0.5) * 80, r = 18 + rnd() * 46; const gr = sg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(8,4,10,.55)"); gr.addColorStop(1, "rgba(8,4,10,0)"); sg.fillStyle = gr; sg.fillRect(0, 0, 512, 192); }
    mfSmokeMat = keep(new THREE.MeshBasicMaterial({ map: tex(sc), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
    const smoke = new THREE.Mesh(keep(new THREE.PlaneGeometry(6.5, 2.4)), mfSmokeMat); smoke.position.set(0, 2.2, -0.04); mf.add(smoke);
    // 身體：幾團扁球
    const bodyG = [];
    for (const [x, y, sx, sy] of [[0, 2.42, 0.75, 0.33], [-0.4, 2.52, 0.42, 0.22], [0.45, 2.5, 0.44, 0.24], [0, 2.12, 0.34, 0.22], [0.05, 2.6, 0.3, 0.12]]) {
      const g = new THREE.SphereGeometry(1, 16, 10); g.scale(sx, sy, 0.05); g.translate(x, y, 0); bodyG.push(g);
    }
    mf.add(new THREE.Mesh(keep(mergeGeometries(bodyG, false)), mfMat)); bodyG.forEach(g => g.dispose());
    // 八條腿：上段（身體 → 膝，往上拱）＋下段（膝 → 地平線，細長觸手狀）
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1, j = i % 4;
      const hip = new THREE.Vector3(s * (0.22 + j * 0.07), 2.42 - j * 0.04, 0);
      const knee = new THREE.Vector3(s * (0.9 + j * 0.75), 2.64 - j * 0.03, 0);
      const foot = new THREE.Vector3(s * (1.5 + j * 1.25 + rnd() * 0.3), 0.15 + rnd() * 0.2, 0);
      const up = new THREE.Group(); up.position.copy(hip); mf.add(up);
      const kneeL = knee.clone().sub(hip);
      const c1 = new THREE.CatmullRomCurve3([new THREE.Vector3(), kneeL.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.08, 0)), kneeL]);
      const g1 = taperTube(c1, 0.13, 0.06, 16, 5); g1.scale(1, 1, 0.3);
      up.add(new THREE.Mesh(keep(g1), mfMat));
      const lo = new THREE.Group(); lo.position.copy(kneeL); up.add(lo);
      const fL = foot.clone().sub(knee), wav = [];
      for (let k = 0; k <= 6; k++) { const u = k / 6; wav.push(new THREE.Vector3(fL.x * u + Math.sin(u * 7 + i) * 0.08 * u + s * Math.sin(u * Math.PI) * 0.25, fL.y * u + Math.sin(u * Math.PI) * 0.12, 0)); }
      const g2 = taperTube(new THREE.CatmullRomCurve3(wav), 0.065, 0.012, 24, 5); g2.scale(1, 1, 0.3);
      lo.add(new THREE.Mesh(keep(g2), mfMat));
      mfLegs.push({ up, lo, ph: rnd() * 6.28, sp: 0.18 + rnd() * 0.15, s });
    }
  }

  /* ============================================================
     6. 怪物共用：頂點色材質（皮膚／紅色內裡／牙齒同一個材質）、花苞頭
     ============================================================ */
  const vcMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }));
  function vc(geo, hex, jitter = 0.3) {
    const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3), pa = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {   // 斑駁：依位置的低頻雜訊微調亮度（同一點的頂點同色，接縫看不出來）
      const n = jitter ? 1 + jitter * (Math.sin(pa[i] * 37.1 + pa[i + 1] * 21.7) * Math.sin(pa[i + 2] * 29.3 - pa[i + 1] * 13.9)) : 1;
      a[i] = c.r * n; a[i + 1] = c.g * n; a[i + 2] = c.b * n;
    }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  }
  function flipped(g) {   // 反轉繞序＋法線（給「從內側看」的殼）
    for (const k of ["position", "normal", "color"]) {
      const at = g.attributes[k], n = at.itemSize;
      for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const a = at.array[(i + 1) * n + c]; at.array[(i + 1) * n + c] = at.array[(i + 2) * n + c]; at.array[(i + 2) * n + c] = a; }
    }
    const nm = g.attributes.normal.array; for (let i = 0; i < nm.length; i++) nm[i] = -nm[i];
    return g;
  }
  const limb = (a, b, r0, r1, hex, seg = 8) => {
    const geos = [vc(rod(a, b, r0, r1, seg), hex)];
    const s = new THREE.SphereGeometry(r0, seg, 6); s.translate(a.x, a.y, a.z); geos.push(vc(s, hex));
    if (r0 >= 0.03) {   // 筋：沿肢體的兩條細肉條，讓表面不像人偶那麼光滑
      const d = new THREE.Vector3().subVectors(b, a), side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 * d.length() ? new THREE.Vector3(1, 0, 0) : Y).normalize();
      const fwd = new THREE.Vector3().crossVectors(side, d).normalize();
      for (const [u, w] of [[0.8, 0.5], [-0.7, -0.6]]) {
        const off = side.clone().multiplyScalar(u * r0).addScaledVector(fwd, w * r0);
        const off2 = side.clone().multiplyScalar(u * r1).addScaledVector(fwd, w * r1);
        geos.push(vc(rod(a.clone().add(off.multiplyScalar(0.75)), b.clone().add(off2.multiplyScalar(0.75)), r0 * 0.38, r1 * 0.3, 5), SKIN_D));
      }
    }
    return geos;
  };
  const cone = (pos, dir, r, h, hex) => {
    const g = new THREE.ConeGeometry(r, h, 5); g.translate(0, h / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize())); g.translate(pos.x, pos.y, pos.z);
    return vc(g, hex);
  };
  const vmesh = (geos, shadow = true) => { const m = new THREE.Mesh(keep(mergeGeometries(geos, false)), vcMat); geos.forEach(g => g.dispose()); m.castShadow = shadow; m.receiveShadow = false; return m; };
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // 花苞頭：5 片花瓣（橢球切片），基部在 group 原點、+y 是花苞軸。setOpen(0..1) 花瓣繞基部外翻，露出紅色內裡與牙齒。
  const budCache = new Map();
  function budGeos(R, E, nT) {
    const key = R + "|" + E + "|" + nT;
    if (budCache.has(key)) return budCache.get(key);
    const thB = 0.6 * Math.PI, yB = R * E * Math.cos(thB);   // 基部那圈的 y（負）
    const petals = [];
    for (let i = 0; i < 5; i++) {
      const phS = i * 2 * Math.PI / 5 + 0.035, phL = 2 * Math.PI / 5 - 0.07, phM = phS + phL / 2;
      const skin = new THREE.SphereGeometry(R, 8, 10, phS, phL, 0, thB); skin.scale(1, E, 1);
      const inner = flipped(vc(skin.clone().scale(0.93, 0.95, 0.93), INNER, 0.35));
      const rim = new THREE.SphereGeometry(R * 0.995, 8, 2, phS, phL, thB - 0.12, 0.12); rim.scale(1, E, 1);
      const parts = [vc(skin, SKIN_D), inner, flipped(vc(rim, INNER_RIM, 0))];
      for (let k = 0; k < nT; k++) {
        const th = (0.16 + 0.4 * (k / Math.max(1, nT - 1))) * Math.PI, ph = phM + ((k % 3) - 1) * 0.28 * phL;
        const p = v3(-Math.cos(ph) * Math.sin(th) * R * 0.92, Math.cos(th) * R * E * 0.94, Math.sin(ph) * Math.sin(th) * R * 0.92);
        const n = v3(p.x, p.y / (E * E), p.z).normalize().negate();
        parts.push(cone(p, n.clone().add(v3(0, -0.35, 0)), R * 0.055, R * 0.24, TOOTH));
      }
      const g = mergeGeometries(parts, false); parts.forEach(x => x.dispose());
      const P = v3(-Math.cos(phM) * Math.sin(thB) * R, 0, Math.sin(phM) * Math.sin(thB) * R);
      g.translate(-P.x, -yB - P.y, -P.z);
      const d = v3(-Math.cos(phM), 0, Math.sin(phM)).normalize();
      petals.push({ geo: keep(g), P, axis: v3(d.z, 0, -d.x).normalize() });
    }
    // 喉嚨：紅色圓盤＋一圈牙
    const rB = R * Math.sin(thB);
    const parts = [];
    const disc = new THREE.CircleGeometry(rB * 0.96, 14); disc.rotateX(-Math.PI / 2); disc.translate(0, 0.004, 0); parts.push(vc(disc, INNER));
    const cup = new THREE.SphereGeometry(rB * 0.98, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); parts.push(vc(cup, SKIN_D));
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, p = v3(Math.cos(a) * rB * 0.8, 0.005, Math.sin(a) * rB * 0.8); parts.push(cone(p, v3(-Math.cos(a) * 0.6, 1, -Math.sin(a) * 0.6), R * 0.07, R * 0.3, TOOTH)); }
    const throat = keep(mergeGeometries(parts, false)); parts.forEach(x => x.dispose());
    const out = { petals, throat };
    budCache.set(key, out);
    return out;
  }
  function makeBud(R, E, nT, maxOpen = 1.8) {
    const { petals, throat } = budGeos(R, E, nT);
    const group = new THREE.Group();
    const t = new THREE.Mesh(throat, vcMat); t.castShadow = true; group.add(t);
    const piv = petals.map(p => { const o = new THREE.Group(); o.position.copy(p.P); const m = new THREE.Mesh(p.geo, vcMat); m.castShadow = true; o.add(m); group.add(o); return { o, axis: p.axis }; });
    return { group, setOpen(v) { for (const p of piv) p.o.quaternion.setFromAxisAngle(p.axis, 0.04 + v * maxOpen); } };
  }

  /* ---------- 細長人形怪（約 2.25 m，彎腰；group 原點＝腳下地板，臉朝 +z） ---------- */
  function makeDemogorgon() {
    const R = {}, root = new THREE.Group(); root.name = "demogorgon"; root.visible = false;
    const hips = new THREE.Group(); hips.position.y = 1.06; root.add(hips); R.hips = hips;
    const pel = new THREE.SphereGeometry(0.11, 10, 8); pel.scale(1.4, 0.8, 0.9);
    hips.add(vmesh([vc(pel, SKIN_D)]));
    R.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(s * 0.11, 0, 0); hips.add(thigh);
      thigh.add(vmesh(limb(v3(0, 0, 0), v3(0, -0.5, 0.07), 0.08, 0.045, SKIN)));
      const knee = new THREE.Group(); knee.position.set(0, -0.5, 0.07); thigh.add(knee);
      const sh = limb(v3(0, 0, 0), v3(0, -0.46, -0.13), 0.046, 0.03, SKIN).concat(limb(v3(0, -0.46, -0.13), v3(0, -0.53, 0.05), 0.032, 0.022, SKIN_D));
      for (const dx of [-0.035, 0, 0.035]) sh.push(...limb(v3(dx * 0.6, -0.53, 0.05), v3(dx, -0.545, 0.17), 0.014, 0.006, CLAW, 5));
      knee.add(vmesh(sh));
      R.legs.push({ thigh, knee, s });
    }
    const spine = new THREE.Group(); spine.position.y = 0.04; hips.add(spine); R.spine = spine;
    const tor = limb(v3(0, 0, 0), v3(0, 0.4, 0.02), 0.075, 0.1, SKIN);
    const chest = new THREE.SphereGeometry(0.12, 12, 10); chest.scale(1.15, 1.45, 0.72); chest.translate(0, 0.6, -0.01); tor.push(vc(chest, SKIN));
    for (const s of [-1, 1]) { const sb = new THREE.SphereGeometry(0.07, 8, 6); sb.scale(1, 1.4, 0.5); sb.translate(s * 0.09, 0.66, -0.1); tor.push(vc(sb, SKIN_D)); }   // 肩胛
    for (let i = 0; i < 6; i++) { const b = new THREE.SphereGeometry(0.03, 6, 5); b.translate(0, 0.12 + i * 0.12, -0.095 - (i > 2 ? 0.02 : 0)); tor.push(vc(b, SKIN_D)); }   // 脊椎突起
    for (let i = 0; i < 5; i++) { const rib = new THREE.TorusGeometry(0.13 - i * 0.008, 0.011, 4, 14, Math.PI); rib.rotateX(Math.PI / 2); rib.scale(1.27, 1, 0.84); rib.rotateY(Math.PI); rib.translate(0, 0.44 + i * 0.065, -0.005); tor.push(vc(rib, SKIN_D)); }
    spine.add(vmesh(tor));
    R.arms = [];
    for (const s of [-1, 1]) {
      const up = new THREE.Group(); up.position.set(s * 0.24, 0.8, 0); spine.add(up);
      up.add(vmesh(limb(v3(0, 0, 0), v3(s * 0.03, -0.58, 0), 0.05, 0.034, SKIN)));
      const el = new THREE.Group(); el.position.set(s * 0.03, -0.58, 0); up.add(el);
      const fa = limb(v3(0, 0, 0), v3(0, -0.56, 0), 0.034, 0.024, SKIN);
      const palm = new THREE.SphereGeometry(0.04, 8, 6); palm.scale(1, 1.3, 0.6); palm.translate(0, -0.6, 0); fa.push(vc(palm, SKIN_D));
      for (const [dx, dz] of [[-0.03, 0.02], [-0.01, 0.025], [0.012, 0.025], [0.032, 0.015], [s * 0.04, -0.03]]) fa.push(...limb(v3(dx * 0.6, -0.62, dz * 0.5), v3(dx * 1.6, -0.84, dz * 1.6 + 0.03), 0.011, 0.004, CLAW, 5));
      el.add(vmesh(fa));
      R.arms.push({ up, el, s });
    }
    const neck = new THREE.Group(); neck.position.set(0, 0.84, 0.03); spine.add(neck); R.neck = neck;
    neck.add(vmesh(limb(v3(0, 0, 0), v3(0, 0.2, 0.05), 0.052, 0.046, SKIN)));
    const head = new THREE.Group(); head.position.set(0, 0.21, 0.055); neck.add(head); R.head = head;
    const bud = makeBud(0.17, 1.5, 9, 1.55); head.add(bud.group); R.bud = bud;
    bud.setOpen(0);
    R.root = root;
    return R;
  }

  /* ---------- 四足小怪（肩高約 0.45 m） ---------- */
  function makeDog() {
    const R = {}, root = new THREE.Group(); root.name = "demodog"; root.visible = false;
    const body = new THREE.Group(); body.position.y = 0.44; root.add(body); R.body = body;
    const bg = limb(v3(0, 0, -0.28), v3(0, 0.04, 0.2), 0.1, 0.13, SKIN);
    bg.push(...limb(v3(0, 0.02, -0.3), v3(0, -0.06, -0.62), 0.04, 0.008, SKIN_D, 6));   // 尾
    bg.push(...limb(v3(0, 0.05, 0.22), v3(0, 0.12, 0.4), 0.075, 0.06, SKIN));           // 頸
    for (let i = 0; i < 6; i++) { const b = new THREE.SphereGeometry(0.025, 6, 5); b.translate(0, 0.1 + i * 0.012, -0.24 + i * 0.09); bg.push(vc(b, SKIN_D)); }
    body.add(vmesh(bg));
    const head = new THREE.Group(); head.position.set(0, 0.12, 0.41); head.rotation.x = 1.42; body.add(head); R.head = head;
    const bud = makeBud(0.095, 1.35, 4, 1.5); head.add(bud.group); R.bud = bud; bud.setOpen(0);
    R.legs = [];
    for (const [x, z, front] of [[-0.09, 0.18, true], [0.09, 0.18, true], [-0.08, -0.24, false], [0.08, -0.24, false]]) {
      const up = new THREE.Group(); up.position.set(x, -0.02, z); body.add(up);
      const k = front ? 0.04 : -0.07;
      up.add(vmesh(limb(v3(0, 0, 0), v3(0, -0.22, k), 0.045, 0.028, SKIN)));
      const lo = new THREE.Group(); lo.position.set(0, -0.22, k); up.add(lo);
      lo.add(vmesh(limb(v3(0, 0, 0), v3(0, -0.2, -k * 0.8), 0.026, 0.012, SKIN_D, 6)));
      R.legs.push({ up, lo, front, off: (x < 0) === front ? 0 : Math.PI });
    }
    R.root = root;
    return R;
  }

  /* ---------- 路徑 ---------- */
  function walker(pts) {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, cum, L: cum[cum.length - 1] };
  }
  function sample(w, s, out) {   // 回傳該段方向角（yaw）
    s = Math.max(0, Math.min(w.L, s));
    let i = 0; while (i < w.cum.length - 2 && w.cum[i + 1] < s) i++;
    const a = w.pts[i], b = w.pts[i + 1], seg = Math.max(1e-6, w.cum[i + 1] - w.cum[i]), f = (s - w.cum[i]) / seg;
    out.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    return Math.atan2(b.x - a.x, b.y - a.y);
  }
  const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 巡邏：沿右側邊緣往前、再沿最前緣往左（避開工位區、金庫、腳踏車），到頭看一下再原路回去
  const PATROL = [GATE_E.clone(), V2(9.55, -0.4), V2(9.55, 3.7), V2(7.2, 6.3), V2(0.3, 6.3)];
  // 攻擊：從出口 → 工位區與金庫之間的通道 x=5.2 → 目標那排的後方（桌子後面再退 1.35 m）
  function attackRoute(tx, tz) {
    const ax = clamp(tx, X0 + 0.8, X1 - 0.6), az = clamp(tz - 1.35, Z0 + 1.0, Z1 - 0.5);
    const p = [GATE_E.clone()];
    if (ax < 5.6) { p.push(V2(5.2, -2.3)); if (Math.abs(az + 2.3) > 0.05) p.push(V2(5.2, az)); }
    p.push(V2(ax, az));
    return p;
  }

  /* ---------- 人形怪狀態機 ---------- */
  const demo = makeDemogorgon(); root.add(demo.root);
  const D = { state: "hidden", kind: null, t0: 0, path: null, s: 0, speed: 1.4, yaw: 0, faceYaw: 0, phase: 0, open: 0, roarDur: 1.6,
    pending: null, nextPatrol: Infinity, flare: 0, gateHold: 0, pos: V2(GATE_C.x, GATE_C.y), stillUntil: 0 };
  const DEMO_SCALE = 1.0;
  function demoStart(kind, pts, faceYaw, t) {
    D.kind = kind; D.path = walker(pts); D.s = 0; D.faceYaw = faceYaw; D.state = "emerge"; D.t0 = t; D.flare = 1;
    D.speed = kind === "attack" ? Math.max(2.6, D.path.L / 2.6) : 1.45; D.roarDur = kind === "attack" ? 1.7 : 1.3;
    D.yaw = GATE.ry; demo.root.visible = true;
  }
  function demoHide() { D.state = "hidden"; D.kind = null; demo.root.visible = false; D.open = 0; demo.bud.setOpen(0); }

  /* ---------- 四足小怪：各自在牆邊／走道來回跑 ---------- */
  const DOG_PATHS = [
    [V2(-6.6, 5.75), V2(8.8, 5.75)],                                           // 走道前緣（地毯與腳踏車之間）
    [V2(-7.15, 3.9), V2(-7.15, -2.9), V2(-6.6, -4.95), V2(2.6, -4.95)],       // 左牆 → 後牆（最後一排工位後面）
    [V2(9.6, -1.7), V2(9.6, 4.35), V2(4.7, 4.35)],                            // 右緣 → 工位區前方
  ];
  const dogs = DOG_PATHS.map((p, i) => {
    const R = makeDog(); root.add(R.root);
    const w = walker(p);
    return { R, w, s: w.L * (0.15 + 0.3 * i), dir: i % 2 ? -1 : 1, speed: 2.3 + i * 0.25, yaw: 0, phase: i * 1.3, pause: 0, nextPause: 2 + i * 1.7, open: 0, pos: V2() };
  });

  /* ============================================================
     狀態與更新
     ============================================================ */
  let mode = "normal", k = 0, time = 0, bulbAcc = 0;
  let redLight = null, relist = 0;
  const tmpC = new THREE.Color(), tmpV = V2(), redCol = new THREE.Color(RED);

  function poseDemo(t, dt, moving, speed) {
    const run = clamp((speed - 1.4) / 2.5, 0, 1);
    if (moving) D.phase += dt * speed / (1.15 + run * 0.6) * Math.PI * 2;
    const ph = D.phase, amp = moving ? 0.42 + run * 0.25 : 0;
    const o = D.open;
    demo.hips.position.y = 1.06 + (moving ? Math.abs(Math.cos(ph)) * 0.05 - 0.03 : Math.sin(t * 1.3) * 0.01);
    demo.hips.rotation.y = moving ? Math.sin(ph) * 0.12 : 0;
    demo.spine.rotation.x = 0.42 + run * 0.2 - o * 0.32 + (moving ? 0 : Math.sin(t * 0.9) * 0.03);
    demo.spine.rotation.y = moving ? -Math.sin(ph) * 0.1 : 0;
    for (const L of demo.legs) {
      const p = ph + (L.s < 0 ? 0 : Math.PI);
      L.thigh.rotation.x = -Math.sin(p) * amp - (moving ? 0.08 : 0);
      L.knee.rotation.x = moving ? Math.max(0, Math.sin(p + 1.2)) * (0.6 + run * 0.4) : 0.05;
    }
    for (const A of demo.arms) {
      const p = ph + (A.s < 0 ? Math.PI : 0);
      A.up.rotation.x = -0.32 - (moving ? Math.sin(p) * amp * 0.8 : Math.sin(t * 1.1 + A.s) * 0.04) - o * 0.95;
      A.up.rotation.z = A.s * (0.12 + o * 0.85);
      A.el.rotation.x = -0.45 - run * 0.3 - o * 0.4;
    }
    demo.neck.rotation.x = 0.38 - o * 0.25;
    demo.head.rotation.x = 0.9 + o * 0.28;
    demo.head.rotation.y = o > 0.5 ? Math.sin(t * 34) * 0.07 * o : Math.sin(t * 0.7) * 0.15;
    demo.bud.setOpen(o);
  }

  function updateDemo(t, dt) {
    // 待處理的攻擊
    if (D.pending) {
      const tg = D.pending;
      if (RM) {
        D.pending = null; D.kind = "attack"; D.state = "still"; D.stillUntil = t + 7; D.flare = 1;
        demo.root.visible = true; const sx = GATE_E.x + gateFwd.x * 0.7, sz = GATE_E.y + gateFwd.z * 0.7; demo.root.position.set(sx, 0, sz); demo.root.rotation.y = Math.atan2(1 - sx, 1.5 - sz);
        D.open = 0.85; demo.root.scale.setScalar(DEMO_SCALE); poseDemo(t, 0, false, 0);
      } else if (D.state === "hidden") { D.pending = null; demoStart("attack", attackRoute(tg.x, tg.z), Math.atan2(0, 1), t); D.target = tg; }
      else if (D.kind === "patrol" && (D.state === "walk" || D.state === "roar" || D.state === "back")) {
        // 巡邏中被叫去攻擊：沿巡邏路線退回出口，再接攻擊路線
        D.pending = null;
        const back = [D.pos.clone()];
        if (D.state === "back") { let i = 0; const s = D.path.L - D.s; while (i < D.path.cum.length - 1 && D.path.cum[i + 1] < s) i++; for (let j = i + 1; j < D.path.pts.length; j++) back.push(D.path.pts[j].clone()); }
        else { let i = 0; while (i < D.path.cum.length - 1 && D.path.cum[i + 1] < D.s) i++; for (let j = i; j >= 0; j--) back.push(D.path.pts[j].clone()); }
        const route = back.concat(attackRoute(tg.x, tg.z).slice(1));
        D.kind = "attack"; D.path = walker(route); D.s = 0; D.state = "walk"; D.speed = Math.max(2.6, D.path.L / 2.8); D.roarDur = 1.7;
      }
      // emerge／submerge 中：等狀態切換後再處理（pending 保留）
    }
    if (D.state === "hidden") {
      if (mode === "upside" && !RM && t >= D.nextPatrol) {
        demoStart("patrol", PATROL.map(p => p.clone()), Math.atan2(-1, -0.3), t);
        D.nextPatrol = Infinity;
      }
      return;
    }
    if (D.state === "still") {
      if (t >= D.stillUntil) { demoHide(); D.kind = null; }
      return;
    }
    const r = demo.root;
    if (D.state === "emerge") {
      const u = clamp((t - D.t0) / 0.7, 0, 1);
      D.pos.set(GATE_C.x + (GATE_E.x - GATE_C.x) * u, GATE_C.y + (GATE_E.y - GATE_C.y) * u);
      r.scale.set(DEMO_SCALE * (0.55 + 0.45 * u), DEMO_SCALE * (0.75 + 0.25 * u), DEMO_SCALE * (0.55 + 0.45 * u));
      D.yaw = GATE.ry; D.flare = 1;
      poseDemo(t, dt, true, 1.2);
      if (u >= 1) {
        if (D.pending && D.kind === "patrol") { const tg = D.pending; D.pending = null; D.kind = "attack"; D.path = walker(attackRoute(tg.x, tg.z)); D.speed = Math.max(2.6, D.path.L / 2.6); D.roarDur = 1.7; }
        D.state = "walk"; D.s = 0;
      }
    } else if (D.state === "walk" || D.state === "back") {
      D.s += D.speed * dt;
      const s = D.state === "walk" ? D.s : D.path.L - D.s;
      let yaw = sample(D.path, s, D.pos); if (D.state === "back") yaw += Math.PI;
      D.yaw = angLerp(D.yaw, yaw, Math.min(1, dt * 7));
      D.open += (0 - D.open) * Math.min(1, dt * 8);
      poseDemo(t, dt, true, D.speed);
      if (D.s >= D.path.L) {
        if (D.state === "walk") {
          D.state = "roar"; D.t0 = t;
          if (D.kind === "attack" && D.target) D.faceYaw = Math.atan2(D.target.x - D.pos.x, D.target.z - D.pos.y);
          else D.faceYaw = Math.atan2(-0.3, -1);
        } else { D.state = "submerge"; D.t0 = t; }
      }
    } else if (D.state === "roar") {
      const u = t - D.t0;
      D.yaw = angLerp(D.yaw, D.faceYaw, Math.min(1, dt * 8));
      const tgtOpen = u > 0.25 && u < D.roarDur - 0.3 ? 1 : 0;
      D.open += (tgtOpen - D.open) * Math.min(1, dt * (tgtOpen ? 10 : 7));
      poseDemo(t, dt, false, 0);
      if (u >= D.roarDur) { D.state = "back"; D.s = 0; }
    } else if (D.state === "submerge") {
      const u = clamp((t - D.t0) / 0.7, 0, 1);
      D.pos.set(GATE_E.x + (GATE_C.x - GATE_E.x) * u, GATE_E.y + (GATE_C.y - GATE_E.y) * u);
      D.yaw = angLerp(D.yaw, GATE.ry + Math.PI, Math.min(1, dt * 8));
      r.scale.set(DEMO_SCALE * (1 - 0.45 * u), DEMO_SCALE * (1 - 0.25 * u), DEMO_SCALE * (1 - 0.45 * u));
      D.flare = 1; poseDemo(t, dt, true, 1.2);
      if (u >= 1) {
        demoHide();
        if (mode === "upside") D.nextPatrol = t + 20 + Math.random() * 20;
      }
    }
    r.position.set(D.pos.x, 0, D.pos.y); r.rotation.y = D.yaw;
    if (D.state === "walk" || D.state === "back" || D.state === "roar") r.scale.setScalar(DEMO_SCALE);
  }

  function updateDogs(t, dt) {
    const show = mode === "upside" && k > 0.5;
    for (const d of dogs) {
      d.R.root.visible = show;
      if (!show) continue;
      let moving = false;
      if (RM) { d.dir = 1; }
      else if (d.pause > 0) { d.pause -= dt; d.open += (1 - d.open) * Math.min(1, dt * 9); }
      else {
        moving = true; d.open += (0 - d.open) * Math.min(1, dt * 9);
        d.s += d.dir * d.speed * dt;
        if (d.s >= d.w.L) { d.s = d.w.L; d.dir = -1; d.pause = 0.25 + Math.random() * 0.4; }
        else if (d.s <= 0) { d.s = 0; d.dir = 1; d.pause = 0.25 + Math.random() * 0.4; }
        d.nextPause -= dt;
        if (d.nextPause <= 0) { d.pause = 0.8 + Math.random() * 1.0; d.nextPause = 3.5 + Math.random() * 5; }
      }
      let yaw = sample(d.w, d.s, d.pos); if (d.dir < 0) yaw += Math.PI;
      d.yaw = RM ? yaw : angLerp(d.yaw, yaw, Math.min(1, dt * 9));
      const R = d.R;
      R.root.position.set(d.pos.x, 0, d.pos.y); R.root.rotation.y = d.yaw;
      if (moving) d.phase += dt * d.speed / 0.75 * Math.PI * 2;
      const ph = d.phase;
      R.body.position.y = 0.44 + (moving ? Math.abs(Math.sin(ph)) * 0.035 : 0);
      R.body.rotation.x = moving ? Math.sin(ph * 2) * 0.04 : -0.06 * d.open;
      for (const L of R.legs) {
        const p = ph + L.off;
        L.up.rotation.x = moving ? -Math.sin(p) * 0.6 : 0;
        L.lo.rotation.x = moving ? (L.front ? -1 : 1) * Math.max(0, Math.sin(p + 0.6)) * 0.8 : 0;
      }
      R.head.rotation.x = 1.42 - d.open * 0.35;
      R.head.rotation.z = d.open > 0.5 && !RM ? Math.sin(t * 30) * 0.08 : 0;
      R.bud.setOpen(RM ? 0.35 : d.open * 0.9 + (moving ? 0.12 + 0.08 * Math.sin(t * 6 + ph) : 0));
    }
  }

  function updateGate(t, dt) {
    const attackOpen = D.kind === "attack" && D.state !== "hidden";
    const target = Math.max(k, attackOpen ? 1 : 0);
    if (RM) gate.userData.g = target;
    else gate.userData.g = (gate.userData.g ?? 0) + (target - (gate.userData.g ?? 0)) * Math.min(1, dt * 1.6);
    const g = gate.userData.g;
    D.flare = Math.max(0, D.flare - dt * 1.5);
    const pulse = RM ? 0 : 0.5 + 0.5 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1);
    const sc = 0.3 + 0.7 * g;
    gateInner.scale.set(sc * (1 + (RM ? 0 : 0.06 * Math.sin(t * 2.3))), sc, sc);
    gateInner.position.y = GATE.cy * (0.55 + 0.45 * g) + (1 - g) * 0.35;
    const cf = (0.55 + 1.5 * g) * (0.85 + 0.3 * pulse) + D.flare * 1.2; coreMat.color.setRGB(cf * 1.3, cf * 0.3, cf * 0.18);
    haloMat.opacity = 0.18 + 0.6 * g + D.flare * 0.3;
    decalMat.opacity = 0.9 * g;
    gateLight.intensity = g * (3.2 + 1.8 * pulse) + D.flare * 3;
    gateInner.children[2].rotation.z = RM ? 0 : Math.sin(t * 0.8) * 0.015;
    // 微粒
    const show = g > 0.08 && !RM;
    particles.visible = show;
    if (!show) return;
    const rate = 60 * g;
    for (let i = 0; i < NP; i++) {
      const p = pts[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (Math.random() < rate * dt / NP * 3) {
          const f = Math.random();
          p.x = (Math.random() - 0.5) * 0.15 * sc; p.y = gateInner.position.y + (f - 0.5) * GATE.h * 0.9 * sc; p.z = (Math.random() - 0.5) * 0.1;
          const out = Math.random() < 0.8 ? 1 : -1;
          p.vx = (Math.random() - 0.5) * 0.5; p.vy = 0.08 + Math.random() * 0.25; p.vz = out * (0.15 + Math.random() * 0.45);
          p.age = 0; p.life = 1.8 + Math.random() * 2.4;
        } else { p.life = -1; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx += Math.sin(t * 2 + i) * 0.1 * dt;
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      const u = p.age / p.life, a = Math.min(1, u * 6) * (1 - u) * (0.6 + 0.6 * g);
      pCol[i * 3] = 1.0 * a; pCol[i * 3 + 1] = 0.16 * a; pCol[i * 3 + 2] = 0.08 * a;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  function updateBulbs(t, dt) {
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      let L;
      if (mode === "upside" && k > 0.5) {
        if (RM) L = b.deadSeed < 0.3 ? 0.02 : 0.55;
        else {
          if (b.dead > 0) b.dead -= dt;
          else if (Math.random() < dt * 0.25) b.dead = 0.15 + Math.random() * (Math.random() < 0.3 ? 4 : 0.8);
          const n = 0.5 + 0.5 * Math.sin(t * b.sp * 2.7 + b.ph) * Math.sin(t * 1.9 + b.ph * 2);
          L = b.dead > 0 || b.deadSeed < 0.12 ? 0.02 : 0.2 + 0.6 * n;
        }
        hdr(b.colU, 0.15 + L * 2.6, tmpC);
      } else {
        L = RM ? 0.7 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * b.sp + b.ph)) - (Math.random() < 0.003 ? 0.4 : 0);
        hdr(b.colN, 0.3 + L * 2.4, tmpC);
      }
      bulbIM.setColorAt(i, tmpC);
    }
    bulbIM.instanceColor.needsUpdate = true;
  }

  function updateNeon(t) {
    for (const n of neon) {
      let f = NEON_ON;
      if (mode === "upside" && k > 0.5) {
        if (RM) f = 0.5;
        else { const s = Math.sin(t * 13 + n.ph) * Math.sin(t * 3.1 + n.ph * 2); f = s > 0.55 ? 0.12 : (n.kind === "starcourt" ? 0.9 : 0.6) + 0.25 * Math.sin(t * 40); }
        n.mat.color.setRGB(f * 1.25, f * 0.55, f * 0.55);
      } else {
        if (!RM && Math.sin(t * 0.37 + n.ph) > 0.995) f = 0.5;   // 偶爾跳一下
        n.mat.color.setScalar(f);
      }
    }
  }

  function updateFlayer(t, dt) {
    // 找 fx.js 的紅色閃電燈（DirectionalLight #cb1d29），用它的強度判斷閃電
    if (t >= relist) {
      relist = t + 2; redLight = null;
      scene.traverse(o => { if (!redLight && o.isDirectionalLight && o.color.getHex() === RED) redLight = o; });
    }
    const flash = redLight ? clamp(redLight.intensity / 5.5, 0, 1) : 0;
    const vis = k;
    mf.visible = vis > 0.02;
    if (!mf.visible) return;
    mfMat.opacity = 0.95 * vis;
    mfSmokeMat.opacity = 0.9 * vis;
    mfGlowMat.opacity = Math.min(1, vis * (0.45 + 0.15 * (RM ? 0 : 0.5 + 0.5 * Math.sin(t * 0.5)) + flash * 0.6));
    mfGlowMat.color.setScalar(0.8 + flash * 1.4);
    if (RM) return;
    for (const L of mfLegs) {
      L.up.rotation.z = Math.sin(t * L.sp + L.ph) * 0.05 * L.s;
      L.lo.rotation.z = Math.sin(t * L.sp * 1.3 + L.ph * 1.7) * 0.08 * L.s + flash * 0.05 * L.s;
    }
    mf.position.x = 0.3 + Math.sin(t * 0.05) * 0.6;
  }

  function update(t, dt) {
    dt = Math.min(dt || 0, 0.1); time = t;
    const target = mode === "upside" ? 1 : 0;
    if (RM) k = target; else k += Math.sign(target - k) * Math.min(Math.abs(target - k), dt / 1.4);
    updateDemo(t, dt);
    updateDogs(t, dt);
    updateGate(t, dt);
    updateFlayer(t, dt);
    updateNeon(t);
    if (RM) { if (bulbAcc !== mode) { bulbAcc = mode; updateBulbs(t, dt); } }
    else updateBulbs(t, dt);
  }

  function setMode(m) {
    const prev = mode;
    mode = m === "upside" ? "upside" : "normal";
    if (mode === "upside" && prev !== "upside") D.nextPatrol = time + 8 + Math.random() * 6;   // 第一趟早一點出來，之後每 20～40 秒
    if (mode === "normal") {
      D.nextPatrol = Infinity;
      if (D.kind === "patrol") demoHide();
      for (const b of bulbs) b.dead = 0;
    }
    if (RM) { k = mode === "upside" ? 1 : 0; bulbAcc = null; }
  }

  function attack(target) {
    if (!target) return;
    if (D.kind === "attack" && D.state !== "hidden") return;   // 已經在攻擊中
    D.pending = { x: target.x, z: target.z };
    D.target = D.pending;
  }

  function dispose() {
    scene.remove(root);
    root.traverse(o => { if ((o.isMesh || o.isPoints) && o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    gateLight.dispose && gateLight.dispose();
    for (const d of disposables) d.dispose && d.dispose();
    disposables.clear();
  }

  updateBulbs(0, 0);
  // 開發用（預覽頁截圖）：把人形怪定格在某處張開花瓣
  const _dev = {
    pose(x, z, yaw, open = 1) { D.state = "still"; D.kind = "dev"; D.stillUntil = Infinity; demo.root.visible = true; demo.root.scale.setScalar(DEMO_SCALE); demo.root.position.set(x, 0, z); demo.root.rotation.y = yaw; D.open = open; poseDemo(time, 0, false, 0); },
    get state() { return D.state + (D.kind ? ":" + D.kind : ""); },
  };
  return { group: root, update, setMode, attack, dispose, _dev };
}
