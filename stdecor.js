// 80 年代佈景：聖誕燈字母牆、木紋牆板、映像管電視、對講機、卡帶、橘色格紋地毯、海報；upside 模式（變暗、藤蔓、紅燈）。
// 介面：buildDecor({ THREE, scene, renderer, night, reducedMotion })
//   -> { group, letterWall: { center, normal }, update(t, dt), spell(word), setMode("normal"|"upside"), dispose() }
// 全部程式產生（CanvasTexture），不加任何光源；燈泡用 MeshBasicMaterial + HDR instanceColor（toneMapped:false，bloom 抓得到）。
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// room.js 的尺寸（不 import room.js，避免耦合；改房間時這裡要跟著對）
const WALL_H = 3.2, X0 = -8, X1 = 10, Z0 = -6, Z1 = 7, WALL_T = 0.2;
const SILL = 0.9, HEAD = 2.7, WINDOWS = [-5.2, 0.2, 7.4], WIN_W = 2.6;
const DOOR = { z0: 4.4, z1: 6.0, h: 2.25 };
const XF = X0 + WALL_T / 2;   // 左牆牆面 x = -7.9
const ZF = Z0 + WALL_T / 2;   // 後牆牆面 z = -5.9

// 字母牆：左牆 z 0.32…3.08（白板與飲水機之間）、y 0.92…3.02，蓋過原本兩張證書
const LW = { w: 2.76, h: 2.1, cx: XF + 0.075, cy: 1.97, cz: 1.70, depth: 0.06 };
const ROWS = ["ABCDEFGH", "IJKLMNOPQ", "RSTUVWXYZ"];
const BULB_COLS = [0xcb1d29, 0xf5c518, 0x2fa84f, 0x2f6fde, 0xf27a1a];   // 紅、黃、綠、藍、橘
const UPSIDE_RED = 0xcb1d29, DARK_RED = 0x590505;

export function buildDecor(ctx) {
  const { THREE, scene, renderer } = ctx;
  const night = !!ctx.night, RM = !!ctx.reducedMotion;
  const root = new THREE.Group(); root.name = "stdecor"; scene.add(root);
  const maxAniso = renderer && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
  const disposables = new Set();
  const keep = o => (disposables.add(o), o);

  /* ---------- 小工具 ---------- */
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
  const tex = (c, repeat = false) => {
    const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  let seed = 1984;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  const rbox = (w, h, d, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 0.001));

  // 靜態合併：同材質合成一個 mesh
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
  // 平面幾何，uv 依實際尺寸（每 tile 公尺）重複
  const planeUV = (w, h, tile) => {
    const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
    return g;
  };

  /* ---------- 材質 ---------- */
  const M = {
    plasticDark: std(0x24221f, 0.55),
    plasticGray: std(0x5b5953, 0.6),
    metal: std(0xc9c4ba, 0.3, 0.8),
    woodCap: std(0x4a2c18, 0.7),
    cartWood: std(0x6b4428, 0.75),
    tvWood: std(0x8a5a33, 0.6),
    wire: std(0x1d2a1c, 0.6),
    socket: std(0x2a3b26, 0.5),
    knob: std(0xb8b2a6, 0.35, 0.6),
    walkie: std(0x2e3130, 0.5),
    walkieYellow: std(0xe0a526, 0.5),
  };

  /* ---------- 木紋牆板（牆下半部，凸出原本護牆板） ---------- */
  const PANEL_H = 0.84, PANEL_OFF = 0.08;
  let panelMat, panelColor0;
  {
    const [c, g] = canvas(256, 256);
    const boards = 4, bw = 256 / boards;
    for (let b = 0; b < boards; b++) {
      const base = [ [107, 66, 38], [98, 60, 34], [116, 72, 42], [102, 63, 37] ][b];
      g.fillStyle = `rgb(${base})`; g.fillRect(b * bw, 0, bw, 256);
      for (let i = 0; i < 40; i++) {                 // 木紋
        const x = b * bw + rnd() * bw, a = 0.08 + rnd() * 0.18;
        g.strokeStyle = rnd() < 0.5 ? `rgba(60,34,18,${a})` : `rgba(160,110,70,${a * 0.7})`;
        g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= 256; y += 32) g.lineTo(x + Math.sin(y * 0.05 + i) * 1.5, y);
        g.stroke();
      }
      for (let k = 0; k < 2; k++) {                  // 木節
        const kx = b * bw + 10 + rnd() * (bw - 20), ky = rnd() * 256;
        g.fillStyle = "rgba(55,30,15,.45)"; g.beginPath(); g.ellipse(kx, ky, 3, 8, 0, 0, 7); g.fill();
      }
      g.fillStyle = "rgba(25,12,5,.85)"; g.fillRect(b * bw, 0, 3, 256);  // 板縫（溝）
      g.fillStyle = "rgba(170,120,80,.35)"; g.fillRect(b * bw + 3, 0, 1, 256);
    }
    const t = tex(c, true);
    panelColor0 = new THREE.Color(0xffffff);
    panelMat = std(0xffffff, 0.65, 0, { map: t });
    const TILE = 0.9;   // 每 0.9 m 一組 4 片板
    // 後牆（整條；會被矮櫃擋住的部分藏在櫃子裡）
    const backL = X1 - XF;
    put(planeUV(backL, PANEL_H, TILE), panelMat, (XF + X1) / 2, PANEL_H / 2, ZF + PANEL_OFF);
    put(rbox(backL, 0.045, 0.045, 0.012), M.woodCap, (XF + X1) / 2, PANEL_H + 0.02, ZF + PANEL_OFF + 0.01);
    put(rbox(0.03, PANEL_H + 0.04, PANEL_OFF + 0.02, 0.01), M.woodCap, X1 - 0.015, (PANEL_H + 0.04) / 2, ZF + PANEL_OFF / 2);   // 右端收邊
    // 左牆：避開書櫃（z −4.9…−3.3，開放式書櫃後面不能多一層板）與門
    for (const [a, b] of [[ZF, -4.9], [-3.3, DOOR.z0 - 0.12], [DOOR.z1 + 0.12, Z1]]) {
      const L = b - a, zc = (a + b) / 2;
      put(planeUV(L, PANEL_H, TILE), panelMat, XF + PANEL_OFF, PANEL_H / 2, zc, 0, Math.PI / 2, 0);
      put(rbox(0.045, 0.045, L, 0.012), M.woodCap, XF + PANEL_OFF + 0.01, PANEL_H + 0.02, zc);
      if (a > ZF) put(rbox(PANEL_OFF + 0.02, PANEL_H + 0.04, 0.03, 0.01), M.woodCap, XF + PANEL_OFF / 2, (PANEL_H + 0.04) / 2, a + 0.015);
      put(rbox(PANEL_OFF + 0.02, PANEL_H + 0.04, 0.03, 0.01), M.woodCap, XF + PANEL_OFF / 2, (PANEL_H + 0.04) / 2, b - 0.015);
    }
  }

  /* ---------- 字母牆 ---------- */
  const lwGroup = new THREE.Group();
  lwGroup.position.set(LW.cx, LW.cy, LW.cz); lwGroup.rotation.y = Math.PI / 2;   // 本地 +x = 世界 −z（面向 +x 看時的右邊）
  root.add(lwGroup);
  const bulbs = [];   // { row, letter, x, y, a, col: Color }
  {
    let ci = 0;
    ROWS.forEach((row, r) => {
      const n = row.length, span = LW.w - 0.42, yL = [0.5, -0.12, -0.72][r];
      for (let i = 0; i < n; i++) {
        const x = -LW.w / 2 + 0.21 + (i + 0.5) * span / n + (rnd() - 0.5) * 0.05 + (r === 0 ? 0.04 : 0);
        const y = yL + (rnd() - 0.5) * 0.06;
        bulbs.push({ row: r, letter: row[i], x, y, a: (rnd() - 0.5) * 0.9, col: new THREE.Color(BULB_COLS[ci++ % BULB_COLS.length]) });
      }
    });
  }
  let wallpaperMat;
  {
    const PX = 400, cw = Math.round(LW.w * PX), ch = Math.round(LW.h * PX);
    const [c, g] = canvas(cw, ch);
    // 褪色花卉壁紙
    g.fillStyle = "#cdb88c"; g.fillRect(0, 0, cw, ch);
    for (let x = 0; x < cw; x += 92) { g.fillStyle = "rgba(150,125,80,.28)"; g.fillRect(x, 0, 6, ch); g.fillRect(x + 12, 0, 2, ch); }
    for (let y = 30, k = 0; y < ch; y += 84, k++) for (let x = 46 + (k % 2) * 46; x < cw; x += 92) {
      g.save(); g.translate(x, y);
      g.fillStyle = "rgba(160,90,80,.35)";
      for (let p = 0; p < 4; p++) { g.rotate(Math.PI / 2); g.beginPath(); g.ellipse(0, -9, 5, 9, 0, 0, 7); g.fill(); }
      g.fillStyle = "rgba(95,115,70,.4)"; g.beginPath(); g.ellipse(14, 8, 8, 3, 0.6, 0, 7); g.fill(); g.beginPath(); g.ellipse(-14, 8, 8, 3, -0.6, 0, 7); g.fill();
      g.fillStyle = "rgba(200,170,90,.5)"; g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fill();
      g.restore();
    }
    // 污漬、邊緣變黃
    for (let i = 0; i < 18; i++) {
      const x = rnd() * cw, y = rnd() * ch, r = 30 + rnd() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(120,90,40,.16)"); gr.addColorStop(1, "rgba(120,90,40,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const vg = g.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, cw * 0.65);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(70,45,15,.35)"); g.fillStyle = vg; g.fillRect(0, 0, cw, ch);
    // 手寫油漆字母（含往下的滴痕）
    const toPx = (x, y) => [(x + LW.w / 2) * PX, (LW.h / 2 - y) * PX];
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const b of bulbs) {
      const [px, py] = toPx(b.x, b.y);
      g.save(); g.translate(px, py); g.rotate((rnd() - 0.5) * 0.22); g.scale(1 + (rnd() - 0.5) * 0.15, 1 + (rnd() - 0.5) * 0.12);
      g.font = "bold 132px 'Marker Felt', 'Chalkboard SE', 'Comic Sans MS', 'Bradley Hand', sans-serif";
      g.fillStyle = "rgba(20,14,10,.92)"; g.fillText(b.letter, 0, 0);
      g.lineWidth = 3; g.strokeStyle = "rgba(20,14,10,.5)"; g.strokeText(b.letter, 1.5, 1);
      const drips = 1 + Math.floor(rnd() * 2);
      for (let d = 0; d < drips; d++) {
        const dx = (rnd() - 0.5) * 50, len = 14 + rnd() * 40;
        g.fillStyle = "rgba(20,14,10,.85)"; g.fillRect(dx - 2, 40, 4, len); g.beginPath(); g.arc(dx, 40 + len, 3.5, 0, 7); g.fill();
      }
      g.restore();
    }
    wallpaperMat = std(0xffffff, 0.9, 0, { map: tex(c) });
    const wp = new THREE.Mesh(keep(new THREE.BoxGeometry(LW.w, LW.h, LW.depth)), wallpaperMat);
    wp.position.z = -LW.depth / 2 + 0.005; wp.receiveShadow = true; lwGroup.add(wp);
    // 上下細木條
    const lm = new THREE.Matrix4(); lwGroup.updateMatrix(); lm.copy(lwGroup.matrix);
    put(rbox(LW.w + 0.06, 0.04, 0.03, 0.01), M.woodCap, 0, LW.h / 2 + 0.02, -0.01, 0, 0, 0, true, lm);
    put(rbox(LW.w + 0.06, 0.04, 0.03, 0.01), M.woodCap, 0, -LW.h / 2 - 0.02, -0.01, 0, 0, 0, true, lm);
  }
  // 燈泡座標（插座在上、燈泡往下垂）
  const WIRE_Z = 0.035, BULB_Z = 0.045;
  for (const b of bulbs) {
    b.wy = b.y + 0.33;                                // 電線經過的高度
    b.bx = b.x + Math.sin(b.a) * 0.06; b.by = b.wy - 0.02 - Math.cos(b.a) * 0.06;
  }
  // 電線：一條蛇行（第 1 排左→右、第 2 排右→左、第 3 排左→右）
  {
    const pts = [];
    const V = (x, y, z = WIRE_Z) => new THREE.Vector3(x, y, z);
    pts.push(V(-LW.w / 2 + 0.03, LW.h / 2 - 0.05, 0.02));
    ROWS.forEach((row, r) => {
      let rb = bulbs.filter(b => b.row === r); if (r === 1) rb = rb.slice().reverse();
      rb.forEach((b, i) => {
        if (i > 0) { const p = rb[i - 1]; pts.push(V((p.x + b.x) / 2, (p.wy + b.wy) / 2 - 0.05 - rnd() * 0.04, WIRE_Z + 0.01)); }
        pts.push(V(b.x, b.wy + 0.02));
      });
      const last = rb[rb.length - 1];
      if (r < 2) { const side = r === 0 ? 1 : -1; pts.push(V(side * (LW.w / 2 - 0.06), last.wy - 0.28, 0.03)); }
      else pts.push(V(LW.w / 2 - 0.04, -LW.h / 2 + 0.06, 0.02));
    });
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const wire = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, pts.length * 10, 0.007, 5)), M.wire);
    lwGroup.add(wire);
  }
  // 插座、燈泡、光暈：各一個 InstancedMesh
  const N = bulbs.length;
  const sockGeo = keep(new THREE.CylinderGeometry(0.015, 0.017, 0.04, 8));
  const socks = new THREE.InstancedMesh(sockGeo, M.socket, N);
  const bulbGeo = keep(new THREE.SphereGeometry(1, 12, 10)); bulbGeo.scale(0.03, 0.05, 0.03);
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const bulbIM = new THREE.InstancedMesh(bulbGeo, bulbMat, N);
  let haloTex;
  {
    const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); haloTex = keep(new THREE.CanvasTexture(c));
  }
  const haloMat = keep(new THREE.MeshBasicMaterial({ map: haloTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const haloIM = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(0.34, 0.34)), haloMat, N);
  {
    const o = new THREE.Object3D();
    bulbs.forEach((b, i) => {
      o.rotation.set(0, 0, b.a);
      o.position.set(b.x + Math.sin(b.a) * 0.01, b.wy - 0.01, WIRE_Z + 0.005); o.updateMatrix(); socks.setMatrixAt(i, o.matrix);
      o.position.set(b.bx, b.by, BULB_Z); o.updateMatrix(); bulbIM.setMatrixAt(i, o.matrix);
      o.rotation.set(0, 0, 0); o.position.set(b.bx, b.by, 0.008); o.updateMatrix(); haloIM.setMatrixAt(i, o.matrix);
    });
    bulbIM.setColorAt(0, new THREE.Color()); haloIM.setColorAt(0, new THREE.Color());
  }
  socks.castShadow = false; bulbIM.castShadow = false; haloIM.renderOrder = 2;
  lwGroup.add(socks, bulbIM, haloIM);
  bulbs.forEach(b => { b.colN = b.col.clone(); b.colU = b.col.clone().lerp(new THREE.Color(UPSIDE_RED), 0.82); b.lvl = 0.5; b.sp = 0.35 + rnd() * 0.6; b.ph = rnd() * 6.28; });

  /* ---------- 映像管電視（後牆，矮櫃與右窗之間）＋推車 ---------- */
  const TV = { x: 5.5, z: ZF + 0.42 };
  let tvTex, tvCanvas, tvCtx, tvImg, tvScreenMat;
  {
    const cartH = 0.42;
    put(rbox(0.72, 0.04, 0.48, 0.012), M.cartWood, TV.x, cartH, TV.z);
    put(rbox(0.72, 0.03, 0.48, 0.012), M.cartWood, TV.x, 0.12, TV.z);
    for (const dx of [-0.34, 0.34]) for (const dz of [-0.21, 0.21]) {
      put(new THREE.CylinderGeometry(0.014, 0.014, cartH - 0.04, 8), M.metal, TV.x + dx, cartH / 2 + 0.02, TV.z + dz, 0, 0, 0, false);
      put(new THREE.SphereGeometry(0.025, 10, 8), M.plasticDark, TV.x + dx, 0.025, TV.z + dz);
    }
    // 下層：卡帶盒堆、VCR 般的黑盒
    put(rbox(0.5, 0.09, 0.34, 0.015), M.plasticDark, TV.x - 0.05, 0.18, TV.z);
    put(rbox(0.16, 0.012, 0.05, 0.004), M.plasticGray, TV.x - 0.12, 0.2, TV.z + 0.171);
    // 電視本體：木紋外殼＋前面板
    const ty = cartH + 0.02 + 0.26;
    put(rbox(0.64, 0.52, 0.46, 0.05), M.tvWood, TV.x, ty, TV.z);
    put(rbox(0.6, 0.48, 0.03, 0.03), M.plasticDark, TV.x, ty, TV.z + 0.225);
    put(rbox(0.13, 0.42, 0.012, 0.01), M.plasticGray, TV.x + 0.22, ty, TV.z + 0.243);
    for (const [dy, r] of [[0.11, 0.028], [0.0, 0.028], [-0.12, 0.02], [-0.17, 0.02]]) put(new THREE.CylinderGeometry(r, r, 0.03, 16), M.knob, TV.x + 0.22, ty + dy, TV.z + 0.255, Math.PI / 2, 0, 0);
    for (let i = 0; i < 5; i++) put(rbox(0.09, 0.008, 0.006, 0.003), M.plasticDark, TV.x + 0.22, ty - 0.06 + i * 0.012 - 0.03, TV.z + 0.25);
    // 兔耳天線
    put(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.plasticDark, TV.x - 0.05, ty + 0.26, TV.z - 0.05);
    put(new THREE.CylinderGeometry(0.005, 0.005, 0.55, 6), M.metal, TV.x - 0.05 - 0.13, ty + 0.26 + 0.24, TV.z - 0.08, 0.15, 0, 0.55, false);
    put(new THREE.CylinderGeometry(0.005, 0.005, 0.5, 6), M.metal, TV.x - 0.05 + 0.1, ty + 0.26 + 0.22, TV.z - 0.02, -0.2, 0, -0.45, false);
    // 螢幕（雜訊 CanvasTexture）
    [tvCanvas, tvCtx] = canvas(128, 96); tvImg = tvCtx.createImageData(128, 96);
    tvTex = tex(tvCanvas); tvTex.magFilter = THREE.NearestFilter;
    tvScreenMat = keep(new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false, color: 0xd8e0e4 }));
    const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.4, 0.31, 8, 6)), tvScreenMat);
    // 映像管凸面
    const pa = scr.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) / 0.2, y = pa.getY(i) / 0.155; pa.setZ(i, 0.018 * (1 - 0.5 * (x * x + y * y))); }
    scr.position.set(TV.x - 0.075, ty + 0.01, TV.z + 0.242); root.add(scr);
    // 對講機（電視頂上）
    put(rbox(0.07, 0.17, 0.04, 0.012), M.walkie, TV.x + 0.16, ty + 0.26 + 0.085, TV.z + 0.08, 0, -0.3, 0);
    put(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 6), M.plasticDark, TV.x + 0.18, ty + 0.26 + 0.24, TV.z + 0.07, 0, 0, -0.05, false);
    put(rbox(0.05, 0.05, 0.006, 0.003), M.plasticGray, TV.x + 0.162, ty + 0.26 + 0.1, TV.z + 0.1, 0, -0.3, 0);
    put(rbox(0.02, 0.015, 0.008, 0.003), M.walkieYellow, TV.x + 0.15, ty + 0.26 + 0.15, TV.z + 0.1, 0, -0.3, 0);
  }
  // 第二支對講機＋卡帶：矮櫃台面右端（x 4.5…5.0，原本空著）
  const cassetteLabelMat = (() => {
    const [c, g] = canvas(128, 80);
    g.fillStyle = "#2b2622"; g.fillRect(0, 0, 128, 80);
    g.fillStyle = "#efe6cf"; g.fillRect(8, 6, 112, 46);
    g.fillStyle = "#cb1d29"; g.fillRect(8, 6, 112, 8);
    g.fillStyle = "#f27a1a"; g.fillRect(8, 14, 112, 4);
    g.fillStyle = "#333"; g.font = "italic 13px 'Marker Felt', 'Comic Sans MS', sans-serif"; g.fillText("MIXTAPE '85", 16, 34);
    g.fillStyle = "#1a1714"; g.fillRect(30, 40, 68, 18); g.fillStyle = "#8a7f72";
    g.beginPath(); g.arc(44, 49, 7, 0, 7); g.arc(84, 49, 7, 0, 7); g.fill();
    g.fillStyle = "#1a1714"; g.beginPath(); g.arc(44, 49, 3, 0, 7); g.arc(84, 49, 3, 0, 7); g.fill();
    g.fillStyle = "#3c3732"; g.fillRect(36, 62, 56, 14);
    return std(0xffffff, 0.5, 0, { map: tex(c) });
  })();
  {
    const top = 0.77, cx = 4.75, cz = ZF + 0.25;
    put(rbox(0.07, 0.17, 0.04, 0.012), M.walkie, cx + 0.12, top + 0.085, cz + 0.02, 0, 0.25, 0);
    put(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 6), M.plasticDark, cx + 0.14, top + 0.24, cz + 0.02, 0, 0, 0.04, false);
    put(rbox(0.05, 0.05, 0.006, 0.003), M.plasticGray, cx + 0.125, top + 0.1, cz + 0.04, 0, 0.25, 0);
    put(rbox(0.02, 0.015, 0.008, 0.003), M.walkieYellow, cx + 0.11, top + 0.15, cz + 0.04, 0, 0.25, 0);
    [[-0.1, 0.06, 0.2], [-0.08, 0.08, -0.15], [-0.12, -0.08, 0.5]].forEach(([dx, dz, ry], i) => {
      const y = top + 0.007 + (i === 1 ? 0.014 : 0);
      put(rbox(0.11, 0.013, 0.07, 0.003), M.plasticDark, cx + dx, y, cz + dz, 0, ry, 0);
      put(new THREE.PlaneGeometry(0.104, 0.065), cassetteLabelMat, cx + dx, y + 0.0068, cz + dz, -Math.PI / 2, 0, ry, false);
    });
  }

  /* ---------- 橘色格紋地毯（門口附近：x −7.1…−4.7、z 2.8…4.3，不壓到工位區與走道） ---------- */
  {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#d9772b"; g.fillRect(0, 0, 256, 256);
    const band = (pos, w, col, vertical) => { g.fillStyle = col; vertical ? g.fillRect(pos, 0, w, 256) : g.fillRect(0, pos, 256, w); };
    for (const v of [false, true]) {
      band(20, 36, "rgba(120,52,20,.45)", v); band(70, 8, "rgba(245,214,150,.55)", v);
      band(130, 50, "rgba(150,62,22,.35)", v); band(196, 6, "rgba(60,30,15,.5)", v); band(214, 14, "rgba(240,170,70,.45)", v);
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "255,220,170" : "90,40,15"},.08)`; g.fillRect(rnd() * 256, rnd() * 256, 2, 1); }
    const t = tex(c, true);
    const L = 2.4, W = 1.5;
    const g2 = planeUV(L, W, 0.6);
    const rug = new THREE.Mesh(keep(g2), std(0xffffff, 0.95, 0, { map: t }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-5.9, 0.014, 3.55); rug.receiveShadow = true; root.add(rug);
    put(rbox(L + 0.06, 0.012, W + 0.06, 0.005), std(0x7a3a16, 1), -5.9, 0.006, 3.55, 0, 0, 0, false);
    // 流蘇（短邊）
    const fringeMat = std(0xf1dcb5, 1);
    for (const s of [-1, 1]) for (let k = 0; k < 24; k++) put(new THREE.BoxGeometry(0.06, 0.004, 0.012), fringeMat, -5.9 + s * (L / 2 + 0.03), 0.008, 3.55 - W / 2 + 0.03 + k * (W - 0.06) / 23, 0, 0, 0, false);
  }

  /* ---------- 海報（自己畫的幾何圖案＋假文字） ---------- */
  const poster = (w, h, draw, x, y, z, ry) => {
    const [c, g] = canvas(256, Math.round(256 * h / w)); draw(g, c.width, c.height);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
    put(rbox(w + 0.04, h + 0.04, 0.02, 0.008), M.plasticDark, 0, 0, 0.01, 0, 0, 0, true, m);
    const pm = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), std(0xffffff, 0.6, 0, { map: tex(c) }));
    pm.position.set(0, 0, 0.022).applyMatrix4(m); pm.rotation.y = ry; root.add(pm);
  };
  // 1. 後牆左角（窗戶左邊）：夕陽格線山脈
  poster(0.6, 0.84, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, "#1b0f3a"); sky.addColorStop(0.6, "#7a1f5c"); sky.addColorStop(1, "#f2843a");
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const sx = w / 2, sy = h * 0.5;
    const sun = g.createLinearGradient(0, sy - 70, 0, sy + 10); sun.addColorStop(0, "#ffe066"); sun.addColorStop(1, "#cb1d29");
    g.fillStyle = sun; g.beginPath(); g.arc(sx, sy, 70, Math.PI, 0); g.fill();
    g.fillStyle = "#7a1f5c"; for (let i = 0; i < 5; i++) g.fillRect(sx - 72, sy - 8 - i * 12, 144, 3 + i * 0.6);
    g.fillStyle = "#2a1450"; g.beginPath(); g.moveTo(0, sy + 4); g.lineTo(50, sy - 40); g.lineTo(95, sy + 4); g.lineTo(160, sy - 30); g.lineTo(210, sy + 4); g.lineTo(256, sy - 20); g.lineTo(256, sy + 6); g.lineTo(0, sy + 6); g.fill();
    g.fillStyle = "#120a24"; g.fillRect(0, sy + 4, w, h - sy);
    g.strokeStyle = "#e03fa0"; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { const y = sy + 6 + Math.pow(i / 8, 2) * (h * 0.32); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(sx + i * 6, sy + 6); g.lineTo(sx + i * 60, h * 0.84); g.stroke(); }
    g.fillStyle = "#ffe8b0"; g.font = "bold 24px 'Futura', 'Avenir Next Condensed', sans-serif"; g.textAlign = "center"; g.fillText("SATURN DRIVE", sx, h * 0.12);
    g.fillStyle = "#f2843a"; g.font = "12px 'Futura', sans-serif"; g.fillText("NIGHT RUN · 1985", sx, h * 0.16);
    g.fillStyle = "rgba(255,232,176,.7)"; for (let i = 0; i < 3; i++) g.fillRect(40, h * 0.88 + i * 8, w - 80, 2);
  }, -7.22, 2.35, ZF + 0.005, 0);
  // 2. 左牆（書櫃與白板之間）：幾何三角＋假樂團名
  poster(0.6, 0.86, (g, w, h) => {
    g.fillStyle = "#101820"; g.fillRect(0, 0, w, h);
    const cols = ["#f5c518", "#2fa84f", "#2f6fde", "#cb1d29", "#f27a1a"];
    for (let i = 0; i < 5; i++) { g.strokeStyle = cols[i]; g.lineWidth = 7; g.beginPath(); const s = 120 - i * 20; g.moveTo(w / 2, h * 0.2 + i * 8); g.lineTo(w / 2 + s, h * 0.2 + i * 8 + s * 1.6); g.lineTo(w / 2 - s, h * 0.2 + i * 8 + s * 1.6); g.closePath(); g.stroke(); }
    g.fillStyle = "#f5c518"; g.beginPath(); g.arc(w / 2, h * 0.47, 16, 0, 7); g.fill();
    for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(rnd() * w, rnd() * h * 0.6, 1.5, 1.5); }
    g.textAlign = "center"; g.fillStyle = "#f2efe6"; g.font = "bold 26px 'Avenir Next Condensed', 'Futura', sans-serif"; g.fillText("THE PRISMATICS", w / 2, h * 0.8);
    g.fillStyle = "#2f6fde"; g.font = "13px 'Futura', sans-serif"; g.fillText("LIVE AT THE ROLLER RINK", w / 2, h * 0.85);
    g.fillStyle = "#cb1d29"; g.font = "bold 13px 'Futura', sans-serif"; g.fillText("FRI · 8 PM · $3", w / 2, h * 0.9);
  }, XF + 0.005, 1.78, -2.78, Math.PI / 2);

  /* ---------- upside 用：牆面暗色層（窗戶處留空） ---------- */
  let grimeMat, grimeMesh;
  {
    const [c, g] = canvas(256, 256);
    g.fillStyle = "rgba(14,6,8,.58)"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 45;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(5,2,3,.5)"); gr.addColorStop(1, "rgba(5,2,3,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 30; i++) { const x = rnd() * 256, len = 20 + rnd() * 120; g.fillStyle = "rgba(30,6,8,.35)"; g.fillRect(x, rnd() * 100, 1.5 + rnd() * 2, len); }
    // 有機的暗紅血管：平滑曲線＋分岔
    const vein = (x, y, ang, len, w, depth) => {
      g.strokeStyle = `rgba(89,5,5,${0.22 + 0.1 * depth})`; g.lineWidth = w; g.lineCap = "round";
      let px = x, py = y;
      for (let k = 0; k < 6; k++) {
        ang += (rnd() - 0.5) * 0.7;
        const nx = px + Math.cos(ang) * len / 6, ny = py + Math.sin(ang) * len / 6;
        g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo((px + nx) / 2 + (rnd() - 0.5) * 6, (py + ny) / 2 + (rnd() - 0.5) * 6, nx, ny); g.stroke();
        if (depth > 0 && rnd() < 0.35) vein(nx, ny, ang + (rnd() < 0.5 ? 0.8 : -0.8), len * 0.45, w * 0.6, depth - 1);
        px = nx; py = ny;
      }
    };
    for (let i = 0; i < 5; i++) vein(rnd() * 256, rnd() * 40, Math.PI / 2 + (rnd() - 0.5) * 0.8, 160 + rnd() * 80, 2.2, 2);
    grimeMat = keep(new THREE.MeshBasicMaterial({ map: tex(c, true), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }));
    const geos = [];
    const add = (w, h, x, y, z, ry) => { const g2 = planeUV(w, h, 2.6); g2.rotateY(ry); g2.translate(x, y, z); geos.push(g2); };
    const zb = ZF + 0.006, y0 = PANEL_H + 0.05, yTop = WALL_H - 0.04;
    add(X1 - XF, SILL - y0, (XF + X1) / 2, (y0 + SILL) / 2, zb, 0);
    add(X1 - XF, yTop - HEAD - 0.08, (XF + X1) / 2, (HEAD + 0.08 + yTop) / 2, zb, 0);
    let prev = XF;
    for (const cx of WINDOWS.concat([null])) {
      const a = cx == null ? X1 : cx - WIN_W / 2 - 0.07;
      if (a > prev) add(a - prev, HEAD + 0.08 - SILL, (prev + a) / 2, (SILL + HEAD + 0.08) / 2, zb, 0);
      if (cx != null) prev = cx + WIN_W / 2 + 0.07;
    }
    const xb = XF + 0.006;
    for (const [a, b, ya, yb] of [[ZF, DOOR.z0 - 0.1, y0, yTop], [DOOR.z1 + 0.1, Z1, y0, yTop], [DOOR.z0 - 0.1, DOOR.z1 + 0.1, DOOR.h + 0.1, yTop]])
      add(b - a, yb - ya, xb, (ya + yb) / 2, (a + b) / 2, Math.PI / 2);
    grimeMesh = new THREE.Mesh(keep(mergeGeometries(geos, false)), grimeMat); geos.forEach(g2 => g2.dispose());
    grimeMesh.visible = false; grimeMesh.renderOrder = 1; root.add(grimeMesh);
  }

  /* ---------- upside 用：從牆頂垂下的藤蔓（彎曲 TubeGeometry，根部粗、尾端細） ---------- */
  const vines = [];
  const vineMat = std(0x2a1216, 0.55, 0.05, { emissive: DARK_RED, emissiveIntensity: 0.35 });
  {
    const spots = [
      { x: -6.9, z: ZF + 0.06, len: 1.6, n: [0, 0, 1] }, { x: -2.6, z: ZF + 0.06, len: 1.1, n: [0, 0, 1] },
      { x: 2.0, z: ZF + 0.06, len: 2.0, n: [0, 0, 1] }, { x: 5.6, z: ZF + 0.06, len: 1.3, n: [0, 0, 1] },
      { x: 9.3, z: ZF + 0.06, len: 1.8, n: [0, 0, 1] },
      { x: XF + 0.06, z: -5.2, len: 2.2, n: [1, 0, 0] }, { x: XF + 0.06, z: -1.3, len: 1.0, n: [1, 0, 0] },
      { x: XF + 0.06, z: 2.9, len: 0.9, n: [1, 0, 0] },
    ];
    for (const s of spots) {
      const [nx, , nz] = s.n, tx = nz, tz = -nx;   // 沿牆方向
      const pts = [], segs = 7;
      for (let i = 0; i <= segs; i++) {
        const f = i / segs, side = Math.sin(f * 5 + rnd() * 2) * 0.12 * f, out = 0.02 + Math.sin(f * 3.2) * 0.12 * f + rnd() * 0.03;
        pts.push(new THREE.Vector3(tx * side + nx * out, -f * s.len, tz * side + nz * out));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tub = 40, rad = 6, geo = new THREE.TubeGeometry(curve, tub, 0.05, rad);
      const pa = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
      for (let i = 0; i <= tub; i++) {
        curve.getPointAt(i / tub, c); const k = 1 - 0.75 * (i / tub);
        for (let j = 0; j <= rad; j++) { const idx = i * (rad + 1) + j; v.fromBufferAttribute(pa, idx).sub(c).multiplyScalar(k).add(c); pa.setXYZ(idx, v.x, v.y, v.z); }
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(keep(geo), vineMat);
      m.position.set(s.x, WALL_H - 0.02, s.z); m.visible = false; m.castShadow = false;
      root.add(m); vines.push({ m, ph: rnd() * 6.28, sp: 0.6 + rnd() * 0.5, ax: nz !== 0 ? "x" : "z", sgn: nz !== 0 ? 1 : -1 });
    }
  }

  flush();

  /* ---------- 狀態 ---------- */
  let mode = "normal", spellReq = null, spellState = null, rowFlash = null, nextFlash = 3, tvAcc = 0, tvTick = 0;
  const tmpC = new THREE.Color(), tmpH = new THREE.Color();
  const darkWall = new THREE.Color(0x5a4a48), darkPanel = new THREE.Color(0x4a3a36);
  const spellOn = 0.6, spellGap = 0.18, leadIn = 0.35;

  function drawStatic() {
    const d = tvImg.data, up = mode === "upside";
    const roll = (tvTick * 3) % 96;
    for (let y = 0; y < 96; y++) {
      const band = Math.abs(y - roll) < 6 ? 1.35 : 1;
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4; const v = Math.min(255, (Math.random() * 200 + 30) * band);
        d[i] = up ? Math.min(255, v * 1.1) : v; d[i + 1] = up ? v * 0.25 : v; d[i + 2] = up ? v * 0.22 : v * 1.02; d[i + 3] = 255;
      }
    }
    tvCtx.putImageData(tvImg, 0, 0);
    tvCtx.fillStyle = up ? "rgba(203,29,41,.9)" : "rgba(120,255,140,.9)"; tvCtx.font = "bold 12px monospace"; tvCtx.fillText("CH 3", 6, 14);
    tvTex.needsUpdate = true;
  }
  drawStatic();

  // 亮度乘上去時，主色通道照乘（>1 給 bloom 抓），次要通道最多到原比例，避免紅燈過曝變粉紅
  function hdr(base, f, out) {
    const m = Math.max(base.r, base.g, base.b, 1e-4);
    const ch = c => { const r = c / m, lin = f * c; return lin <= r ? lin : r + (lin - r) * r * r; };
    return out.setRGB(ch(base.r), ch(base.g), ch(base.b));
  }
  function applyBulbs() {
    for (let i = 0; i < N; i++) {
      const b = bulbs[i], base = mode === "upside" ? b.colU : b.colN, L = b.lvl;
      hdr(base, 0.25 + L * 2.2, tmpC); bulbIM.setColorAt(i, tmpC);
      tmpH.copy(base).multiplyScalar(Math.max(0, L - 0.05) * 0.9); haloIM.setColorAt(i, tmpH);
    }
    bulbIM.instanceColor.needsUpdate = true; haloIM.instanceColor.needsUpdate = true;
  }

  function idleLevel(b, t) {
    if (RM) return mode === "upside" ? 0.4 : 0.55;
    if (mode === "upside") {
      const n = 0.5 + 0.5 * Math.sin(t * b.sp * 3.1 + b.ph) * Math.sin(t * 1.7 + b.ph * 2);
      return (Math.random() < 0.03 ? 0.05 : 0.15 + 0.45 * n);
    }
    return 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * b.sp + b.ph)) + (Math.random() < 0.004 ? -0.3 : 0);
  }

  function update(t, dt) {
    dt = Math.min(dt || 0, 0.1);
    // 字母牆
    if (spellReq) { spellState = { seq: spellReq, t0: t }; spellReq = null; }
    let spellIdx = -2, env = 0;
    if (spellState) {
      const tau = t - spellState.t0 - leadIn, step = spellOn + spellGap;
      if (tau < 0) spellIdx = -1;
      else {
        const k = Math.floor(tau / step), s = tau - k * step;
        if (k >= spellState.seq.length) { spellState = null; spellIdx = -2; }
        else { spellIdx = k; env = s < spellOn ? Math.min(1, s / 0.06) * Math.min(1, (spellOn - s) / 0.1) : 0; }
      }
    }
    // upside：偶爾整排閃
    if (mode === "upside" && !RM && !spellState) {
      nextFlash -= dt;
      if (nextFlash <= 0) { rowFlash = { row: Math.floor(Math.random() * 3), t0: t }; nextFlash = 2.5 + Math.random() * 3.5; }
      if (rowFlash && t - rowFlash.t0 > 0.45) rowFlash = null;
    } else rowFlash = null;
    const letterTarget = spellIdx >= 0 ? spellState.seq[spellIdx] : null;
    for (const b of bulbs) {
      let target, rate;
      if (spellIdx >= -1) { target = b.letter === letterTarget ? 0.02 + env * 5.5 : 0.03; rate = 40; }
      else {
        target = idleLevel(b, t); rate = RM ? 50 : (mode === "upside" ? 12 : 3);
        if (rowFlash && b.row === rowFlash.row) { target = (Math.floor((t - rowFlash.t0) * 18) % 2 === 0) ? 3.2 : 0.05; rate = 60; }
      }
      b.lvl += (target - b.lvl) * Math.min(1, dt * rate || 1);
    }
    applyBulbs();
    if (RM) return;
    // 電視雜訊（約 20 fps）
    tvAcc += dt; if (tvAcc > 0.05) { tvAcc = 0; tvTick++; drawStatic(); }
    // 藤蔓擺動
    if (mode === "upside") for (const v of vines) {
      const a = Math.sin(t * v.sp + v.ph) * 0.05, b = Math.sin(t * v.sp * 0.7 + v.ph * 1.3) * 0.04;
      if (v.ax === "x") { v.m.rotation.x = a * 0.6 + 0.02; v.m.rotation.z = b; } else { v.m.rotation.z = -(a * 0.6 + 0.02); v.m.rotation.x = b; }
    }
  }

  function spell(word) {
    const seq = String(word || "").toUpperCase().split("").map(ch => (ch >= "A" && ch <= "Z") ? ch : null);
    if (!seq.length) return;
    spellReq = seq;   // 非字母（空白、數字）＝一格空檔
  }

  function setMode(m) {
    mode = m === "upside" ? "upside" : "normal";
    const up = mode === "upside";
    grimeMesh.visible = up;
    vines.forEach(v => { v.m.visible = up; v.m.rotation.set(0, 0, 0); });
    wallpaperMat.color.copy(up ? darkWall : panelColor0);
    panelMat.color.copy(up ? darkPanel : panelColor0);
    tvScreenMat.color.set(up ? 0xffd0d0 : 0xd8e0e4);
    nextFlash = 1.5;
    drawStatic(); applyBulbs();
  }

  function dispose() {
    scene.remove(root);
    root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    for (const d of disposables) d.dispose && d.dispose();
    disposables.clear();
  }

  applyBulbs();
  if (night) haloMat.opacity = 1;   // 夜晚同一套參數即可，光暈在暗場本來就明顯

  const center = new THREE.Vector3(LW.cx, LW.cy, LW.cz), normal = new THREE.Vector3(1, 0, 0);
  return { group: root, letterWall: { center, normal, width: LW.w, height: LW.h }, update, spell, setMode, dispose };
}
