// 房間環境：木地板、剖面牆（後牆 z=-6、左牆 x=-8）、窗景（白天／夜晚）、門、書櫃、飲水機、白板、
// 時鐘（實際時間）、BTC 看板、盆栽、吊燈。介面見 README.md：buildRoom(ctx) -> { update(t, dt), setBtcPrice(n) }
// 靜態物件依材質合併成少數幾個 mesh（控制 draw call）；會動的（雲、葉子、時鐘指針）分開。
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const WALL_H = 3.2, WALL_T = 0.2;
const X0 = -8, X1 = 10, Z0 = -6, Z1 = 7;             // 房間範圍
const SILL = 0.9, HEAD = 2.7;                          // 窗台／窗頂高度
const WINDOWS = [-5.2, 0.2, 7.4], WIN_W = 2.6;          // 後牆三扇窗（中心 x、寬）
const DOOR = { z0: 4.4, z1: 6.0, h: 2.25 };            // 左牆門洞（送件員從 x≈-9、z≈5.2 進場）
const BOX_BACK = -7.3, BOX_TOP = 2.78;                  // 窗外景箱：後牆背後的淺盒子，頂部藏在牆頂視線下

export function buildRoom(ctx) {
  const { THREE, scene, renderer } = ctx;
  const night = !!ctx.night, RM = !!ctx.reducedMotion;
  const root = new THREE.Group(); root.name = "room"; scene.add(root);
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;

  /* ---------- 小工具 ---------- */
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
  const tex = (c, rx = 1, ry = 1) => {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
    return t;
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const rbox = (w, h, d, r = 0.04, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 0.001));

  // 靜態合併：同材質（＋同陰影設定）的幾何體合成一個 mesh
  const buckets = new Map();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    const key = mat.uuid + (shadow ? "s" : "n");
    if (!buckets.has(key)) buckets.set(key, { mat, shadow, geos: [] });
    buckets.get(key).geos.push(g);
  }
  function flush() {
    for (const { mat, shadow, geos } of buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true; root.add(mesh);
      geos.forEach(g => g.dispose());
    }
    buckets.clear();
  }

  /* ---------- 材質 ---------- */
  const M = {
    wall: std(0xf2e3d0, 0.95),
    wainscot: std(0xaebf9f, 0.85),
    trim: std(0xfbf6ee, 0.6),
    wood: std(0xa8714a, 0.75),
    woodDark: std(0x7a4e33, 0.8),
    woodLight: std(0xd9b48a, 0.8),
    slab: std(0x8d6244, 0.85),
    metal: std(0xc3c8cf, 0.35, 0.75),
    darkMetal: std(0x3a3f47, 0.45, 0.6),
    board: std(0x23272f, 0.5, 0.1),
    white: std(0xfbfaf6, 0.5),
    terracotta: std(0xcf7b52, 0.85),
    potCream: std(0xefe2cd, 0.7),
    potTeal: std(0x5a9a92, 0.6),
    soil: std(0x5b4030, 1),
    stem: std(0x6d8a4a, 0.9),
    mustard: std(0xe2b04a, 0.55, 0.1),
    teal: std(0x3f8c85, 0.55, 0.1),
    coral: std(0xe2775f, 0.55, 0.1),
    hall: std(0xe8dccb, 0.95),
    exit: new THREE.MeshStandardMaterial({ color: 0x1f9d55, emissive: 0x2bd46e, emissiveIntensity: night ? 1.6 : 0.6, roughness: 0.4 }),
  };

  /* ---------- 地板：程式畫的木地板 ---------- */
  {
    const [c, g] = canvas(1024, 1024);
    const rows = 16, rh = 1024 / rows;
    const tones = [[196, 146, 98], [205, 156, 106], [186, 136, 90], [212, 165, 114], [192, 142, 96], [178, 128, 84]];
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 400;
      while (x < 1024) {
        const len = 260 + rnd() * 320, [R, G, B] = tones[Math.floor(rnd() * tones.length)];
        g.fillStyle = `rgb(${R},${G},${B})`; g.fillRect(x, r * rh, len, rh);
        // 木紋
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = `rgba(${R - 40},${G - 40},${B - 35},${0.12 + rnd() * 0.12})`; g.lineWidth = 1 + rnd() * 1.5;
          const yy = r * rh + 6 + rnd() * (rh - 12);
          g.beginPath(); g.moveTo(x, yy);
          for (let s = 0; s <= 8; s++) g.lineTo(x + (len * s) / 8, yy + Math.sin(s * 1.3 + k) * (1 + rnd() * 2));
          g.stroke();
        }
        g.fillStyle = "rgba(90,58,34,.55)"; g.fillRect(x, r * rh, 2, rh);       // 板與板接縫
        x += len;
      }
      g.fillStyle = "rgba(90,58,34,.5)"; g.fillRect(0, r * rh, 1024, 2);
      // 上緣一點高光，像斜角
      g.fillStyle = "rgba(255,240,215,.18)"; g.fillRect(0, r * rh + 2, 1024, 2);
    }
    const w = X1 - X0, d = Z1 - Z0;
    const floorTex = tex(c, w / 4, d / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(0xe9c9a4, 0.7, 0, { map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); floor.receiveShadow = true; root.add(floor);
    // 地板下的厚底座（立體模型感）
    put(rbox(w + 0.3, 0.45, d + 0.3, 0.08, 3), M.slab, (X0 + X1) / 2 - 0.15, -0.226, (Z0 + Z1) / 2 + 0.15, 0, 0, 0, false);
  }

  /* ---------- 後牆（z = -6）含三扇窗洞 ---------- */
  {
    const zc = Z0 - WALL_T / 2 + 0.0, zFace = Z0 + WALL_T / 2;
    const xs = [X0 - WALL_T, X1];
    // 下段（窗台以下）＋上段（窗頂以上）整條
    put(rbox(xs[1] - xs[0], SILL, WALL_T, 0.02), M.wall, (xs[0] + xs[1]) / 2, SILL / 2, zc);
    put(rbox(xs[1] - xs[0], WALL_H - HEAD, WALL_T, 0.02), M.wall, (xs[0] + xs[1]) / 2, (HEAD + WALL_H) / 2, zc);
    // 窗間牆柱
    let prev = xs[0];
    for (const cx of WINDOWS.concat([null])) {
      const a = cx == null ? xs[1] : cx - WIN_W / 2;
      if (a - prev > 0.01) put(rbox(a - prev, HEAD - SILL, WALL_T, 0.02), M.wall, (prev + a) / 2, (SILL + HEAD) / 2, zc);
      if (cx != null) prev = cx + WIN_W / 2;
    }
    // 腰板（護牆板）＋腰線＋踢腳板
    let p0 = X0 + WALL_T / 2;
    put(rbox(X1 - p0, 0.82, 0.04, 0.015), M.wainscot, (p0 + X1) / 2, 0.41, zFace + 0.02);
    put(rbox(X1 - p0, 0.06, 0.07, 0.02), M.trim, (p0 + X1) / 2, 0.85, zFace + 0.035);
    put(rbox(X1 - p0, 0.12, 0.06, 0.02), M.trim, (p0 + X1) / 2, 0.06, zFace + 0.03);
    // 護牆板直條紋
    for (let x = p0 + 0.45; x < X1 - 0.2; x += 0.6) put(rbox(0.04, 0.6, 0.03, 0.012), M.wainscot, x, 0.45, zFace + 0.05);
    // 牆頂收邊（木）＋頂部線板
    put(rbox(X1 - X0 + WALL_T + 0.06, 0.1, WALL_T + 0.1, 0.03), M.wood, (X0 - WALL_T + X1) / 2, WALL_H + 0.05, zc);
    put(rbox(X1 - p0, 0.08, 0.06, 0.02), M.trim, (p0 + X1) / 2, WALL_H - 0.08, zFace + 0.03);
    // 右端收邊
    put(rbox(0.08, WALL_H, WALL_T + 0.06, 0.02), M.wood, X1, WALL_H / 2, zc);

    // 窗框：外框＋十字窗格＋窗台
    for (const cx of WINDOWS) {
      const w = WIN_W, h = HEAD - SILL, cy = (SILL + HEAD) / 2, fz = zFace;
      put(rbox(w + 0.16, 0.1, 0.16, 0.03), M.trim, cx, HEAD + 0.03, fz);
      put(rbox(0.1, h, 0.14, 0.03), M.trim, cx - w / 2 - 0.02, cy, fz);
      put(rbox(0.1, h, 0.14, 0.03), M.trim, cx + w / 2 + 0.02, cy, fz);
      put(rbox(0.05, h, 0.06, 0.015), M.trim, cx, cy, Z0 - 0.02);
      put(rbox(w, 0.05, 0.06, 0.015), M.trim, cx, SILL + h * 0.62, Z0 - 0.02);
      put(rbox(w + 0.3, 0.07, 0.3, 0.03), M.trim, cx, SILL + 0.01, fz + 0.06);    // 窗台
      put(rbox(w - 0.1, 0.05, 0.08, 0.02), M.trim, cx, SILL + 0.04, Z0 - 0.08);   // 外側窗台
    }
    // 玻璃：淡淡反光
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: night ? 0.06 : 0.1, depthWrite: false });
    for (const cx of WINDOWS) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, HEAD - SILL), glass);
      m.position.set(cx, (SILL + HEAD) / 2, Z0 - 0.05); root.add(m);
    }
  }

  /* ---------- 窗外景箱：天空、城市、雲／月亮 ---------- */
  const clouds = [];
  {
    const bgCol = scene.background && scene.background.isColor ? scene.background : new THREE.Color(night ? 0x2a2a3a : 0xe9e1d6);
    // 景箱外殼用背景色（不受光、不霧化），從牆頂往後看也看不出來
    const hide = new THREE.MeshBasicMaterial({ color: bgCol, toneMapped: false, fog: false, side: THREE.DoubleSide });
    const bw = X1 - X0 + 0.2, bx = (X0 + X1) / 2, bd = Z0 - WALL_T - BOX_BACK;
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), hide); lid.rotation.x = -Math.PI / 2; lid.position.set(bx, BOX_TOP, (Z0 - WALL_T + BOX_BACK) / 2); root.add(lid);
    const endR = new THREE.Mesh(new THREE.PlaneGeometry(bd, BOX_TOP), hide); endR.rotation.y = Math.PI / 2; endR.position.set(X1 + 0.1, BOX_TOP / 2, (Z0 - WALL_T + BOX_BACK) / 2); root.add(endR);

    // 天空漸層
    const [c, g] = canvas(1024, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    if (night) { grd.addColorStop(0, "#0a1230"); grd.addColorStop(0.65, "#1d2b5c"); grd.addColorStop(1, "#3b3f78"); }
    else { grd.addColorStop(0, "#7db9ea"); grd.addColorStop(0.6, "#b7dcf3"); grd.addColorStop(1, "#fde9cc"); }
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 256);
    if (night) for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,240,${0.35 + rnd() * 0.6})`; const r = rnd() < 0.15 ? 1.6 : 0.9;
      g.beginPath(); g.arc(rnd() * 1024, rnd() * 170, r, 0, 7); g.fill();
    }
    const skyH = BOX_TOP - 0.15;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(bw, skyH), new THREE.MeshBasicMaterial({ map: tex(c), toneMapped: false, fog: false }));
    sky.position.set(bx, 0.15 + skyH / 2, BOX_BACK); root.add(sky);

    // 遠方城市：兩層方塊，窗戶貼圖（夜晚亮燈）；用 vertex color 合併成一個 mesh
    const [wc, wg] = canvas(128, 128);
    wg.fillStyle = "#ffffff"; wg.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const lit = night ? rnd() < 0.55 : false;
      wg.fillStyle = night ? (lit ? (rnd() < 0.3 ? "#ffe9a8" : "#ffd36e") : "#2a3256") : "rgba(140,170,200,.55)";
      wg.fillRect(x * 32 + 9, y * 32 + 8, 14, 16);
    }
    const winTex = tex(wc, 1, 1); winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    const cityMat = new THREE.MeshBasicMaterial({ map: winTex, vertexColors: true, toneMapped: false, fog: false });
    const geos = [];
    const dayCols = [0xd9cfc4, 0xc9d3dc, 0xe6d6c2, 0xbfcad6, 0xd8c7b6], nightCols = [0x6a6f9a, 0x5b6190, 0x7478a6, 0x50557f];
    const farDay = [0xc7d6e4, 0xd3dde8, 0xbccbdb], farNight = [0x343d6c, 0x2d3563, 0x3a4374];
    const layer = (z, depth, hMin, hMax, cols, far) => {
      let x = X0 - 1.5;
      while (x < X1 + 1.5) {
        const w = 0.25 + rnd() * 0.45, h = hMin + rnd() * (hMax - hMin), y0 = 0.15;
        const geo = new THREE.BoxGeometry(w, h, depth).toNonIndexed();
        const uv = geo.attributes.uv;           // 窗戶格子跟著大小重複
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 5, uv.getY(i) * h * 5);
        geo.translate(x + w / 2, y0 + h / 2, z);
        const col = new THREE.Color(cols[Math.floor(rnd() * cols.length)]);
        if (far) col.multiplyScalar(1);         // 遠層顏色已調淡
        const arr = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
        geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
        geos.push(geo);
        x += w + rnd() * 0.12;
      }
    };
    layer(BOX_BACK + 0.25, 0.12, 0.9, 1.55, night ? farNight : farDay, true);
    layer(BOX_BACK + 0.6, 0.18, 0.55, 1.15, night ? nightCols : dayCols, false);
    const city = new THREE.Mesh(mergeGeometries(geos, false), cityMat); root.add(city);
    geos.forEach(g => g.dispose());

    if (night) {
      // 月亮＋光暈
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3cf, toneMapped: false, fog: false }));
      moon.position.set(1.0, 2.2, BOX_BACK + 0.1); root.add(moon);
      const [hc, hg] = canvas(128, 128);
      const rg = hg.createRadialGradient(64, 64, 8, 64, 64, 64); rg.addColorStop(0, "rgba(255,240,200,.55)"); rg.addColorStop(1, "rgba(255,240,200,0)");
      hg.fillStyle = rg; hg.fillRect(0, 0, 128, 128);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: tex(hc), transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      halo.position.set(1.0, 2.2, BOX_BACK + 0.08); root.add(halo);
    }
    // 雲：幾團圓球，緩慢往右飄（夜晚改成暗藍色薄雲）
    const cloudMat = new THREE.MeshBasicMaterial({ color: night ? 0x56608f : 0xffffff, transparent: true, opacity: night ? 0.55 : 0.95, toneMapped: false, fog: false });
    const puff = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 7; i++) {
      const parts = [];
      const n = 3 + Math.floor(rnd() * 3), s = 0.09 + rnd() * 0.06;
      for (let k = 0; k < n; k++) {
        const gg = puff.clone(); const r = s * (0.7 + rnd() * 0.6);
        gg.scale(r * 1.3, r, r * 0.6); gg.translate((k - n / 2) * s * 1.1, (k % 2 ? 0.35 : 0) * s, 0); parts.push(gg);
      }
      const cm = new THREE.Mesh(mergeGeometries(parts, false), cloudMat);
      cm.position.set(X0 + (i / 7) * (X1 - X0) + rnd() * 1.5, 1.85 + rnd() * 0.65, BOX_BACK + 0.15);
      root.add(cm); clouds.push({ m: cm, v: 0.05 + rnd() * 0.06 });
    }
  }

  /* ---------- 地板上的窗光 ---------- */
  {
    const [c, g] = canvas(256, 256);
    const rg = g.createLinearGradient(0, 0, 0, 256); rg.addColorStop(0, "rgba(255,255,255,0.9)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(28, 0, 200, 256);
    g.globalCompositeOperation = "destination-in";
    const sg = g.createLinearGradient(0, 0, 256, 0); sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(0.2, "#000"); sg.addColorStop(0.8, "#000"); sg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sg; g.fillRect(0, 0, 256, 256);
    const m = new THREE.MeshBasicMaterial({ map: tex(c), color: night ? 0x8fa6ff : 0xfff1d0, transparent: true, opacity: night ? 0.1 : 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const cx of WINDOWS) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + 0.4, 2.0), m);
      p.rotation.x = -Math.PI / 2; p.position.set(cx + 0.25, 0.004, Z0 + WALL_T / 2 + 1.0); root.add(p);
    }
  }

  /* ---------- 左牆（x = -8）含門洞 ---------- */
  {
    const xc = X0 - WALL_T / 2 + 0.0, xFace = X0 + WALL_T / 2, zA = Z0 - WALL_T;
    const seg = (z0, z1, y0, y1, mat = M.wall) => put(rbox(WALL_T, y1 - y0, z1 - z0, 0.02), mat, xc, (y0 + y1) / 2, (z0 + z1) / 2);
    seg(zA, DOOR.z0, 0, WALL_H); seg(DOOR.z1, Z1, 0, WALL_H); seg(DOOR.z0, DOOR.z1, DOOR.h, WALL_H);
    // 腰板／腰線／踢腳／頂線（門洞處斷開）
    for (const [a, b] of [[Z0 + WALL_T / 2, DOOR.z0 - 0.08], [DOOR.z1 + 0.08, Z1]]) {
      const zc = (a + b) / 2, L = b - a;
      put(rbox(0.04, 0.82, L, 0.015), M.wainscot, xFace + 0.02, 0.41, zc);
      put(rbox(0.07, 0.06, L, 0.02), M.trim, xFace + 0.035, 0.85, zc);
      put(rbox(0.06, 0.12, L, 0.02), M.trim, xFace + 0.03, 0.06, zc);
      for (let z = a + 0.45; z < b - 0.2; z += 0.6) put(rbox(0.03, 0.6, 0.04, 0.012), M.wainscot, xFace + 0.05, 0.45, z);
    }
    put(rbox(0.06, 0.08, Z1 - Z0, 0.02), M.trim, xFace + 0.03, WALL_H - 0.08, (Z0 + Z1) / 2);
    put(rbox(WALL_T + 0.1, 0.1, Z1 - zA + 0.06, 0.03), M.wood, xc, WALL_H + 0.05, (zA + Z1) / 2);
    put(rbox(WALL_T + 0.06, WALL_H, 0.08, 0.02), M.wood, xc, WALL_H / 2, Z1);          // 前端收邊

    // 門框＋半開的門（往外開，不擋路）
    const dz = (DOOR.z0 + DOOR.z1) / 2, dw = DOOR.z1 - DOOR.z0;
    put(rbox(0.14, DOOR.h + 0.08, 0.1, 0.03), M.wood, xFace + 0.03, (DOOR.h + 0.08) / 2, DOOR.z0 - 0.04);
    put(rbox(0.14, DOOR.h + 0.08, 0.1, 0.03), M.wood, xFace + 0.03, (DOOR.h + 0.08) / 2, DOOR.z1 + 0.04);
    put(rbox(0.14, 0.1, dw + 0.18, 0.03), M.wood, xFace + 0.03, DOOR.h + 0.05, dz);
    const leaf = new THREE.Group(); leaf.position.set(X0 - WALL_T, 0, DOOR.z1); leaf.rotation.y = 1.25; root.add(leaf);
    const leafM = new THREE.Mesh(rbox(0.06, DOOR.h - 0.04, dw - 0.06, 0.025), M.woodLight); leafM.position.set(0, (DOOR.h - 0.04) / 2, -(dw - 0.06) / 2);
    leafM.castShadow = leafM.receiveShadow = true; leaf.add(leafM);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), M.metal); knob.position.set(0.06, 1.0, -(dw - 0.2)); leaf.add(knob);
    // 門外走廊（從門洞看得到一點）
    put(rbox(3.0, 0.1, dw + 0.6, 0.02), M.woodLight, X0 - WALL_T - 1.5, -0.05, dz, 0, 0, 0, false);
    put(rbox(0.15, WALL_H, dw + 0.6, 0.02), M.hall, X0 - WALL_T - 3.0, WALL_H / 2, dz);
    put(rbox(3.0, WALL_H, 0.15, 0.02), M.hall, X0 - WALL_T - 1.5, WALL_H / 2, DOOR.z0 - 0.3);
    put(rbox(3.0, WALL_H, 0.15, 0.02), M.hall, X0 - WALL_T - 1.5, WALL_H / 2, DOOR.z1 + 0.3);
    // 門上方的綠色出口燈
    put(rbox(0.06, 0.16, 0.42, 0.03), M.exit, xFace + 0.04, DOOR.h + 0.3, dz, 0, 0, 0, false);

    // 門口踏墊
    const mat = new THREE.Mesh(rbox(0.9, 0.02, 1.2, 0.01), std(0x6b7f6a, 1)); mat.position.set(X0 + 0.6, 0.01, dz); mat.receiveShadow = true; root.add(mat);
  }

  /* ---------- 走道地毯（z ≈ 5.2） ---------- */
  {
    const [c, g] = canvas(512, 96);
    g.fillStyle = "#c97b5a"; g.fillRect(0, 0, 512, 96);
    g.fillStyle = "#f0dcc0"; g.fillRect(0, 8, 512, 5); g.fillRect(0, 83, 512, 5);
    g.fillStyle = "#8f4f3a"; g.fillRect(0, 16, 512, 3); g.fillRect(0, 77, 512, 3);
    for (let x = 16; x < 512; x += 48) {
      g.fillStyle = "#e9b86c"; g.beginPath(); g.moveTo(x, 48); g.lineTo(x + 12, 36); g.lineTo(x + 24, 48); g.lineTo(x + 12, 60); g.closePath(); g.fill();
      g.fillStyle = "#f6e6cc"; g.beginPath(); g.arc(x + 36, 48, 3, 0, 7); g.fill();
    }
    const L = 15.6, W = 1.25;
    const t = tex(c, 2, 1); t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(L / (W * 512 / 96), 1);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(L, W), std(0xffffff, 0.95, 0, { map: t }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(X0 + 0.2 + L / 2 + 0.3, 0.018, 5.2); rug.receiveShadow = true; root.add(rug);
    put(rbox(L + 0.08, 0.016, W + 0.08, 0.008), std(0x8f4f3a, 1), X0 + 0.5 + L / 2, 0.008, 5.2, 0, 0, 0, false);
  }

  /* ---------- 牆上：時鐘 ---------- */
  const clock = {};
  {
    const cx = (WINDOWS[0] + WIN_W / 2 + WINDOWS[1] - WIN_W / 2) / 2, cy = 2.3, z = Z0 + WALL_T / 2;
    const [c, g] = canvas(256, 256);
    g.fillStyle = "#fffaf0"; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.fillStyle = "#3a302a";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, big = i % 5 === 0, r0 = big ? 100 : 108;
      g.save(); g.translate(128, 128); g.rotate(a); g.fillRect(-(big ? 3 : 1), -116, big ? 6 : 2, 116 - r0 + (big ? 4 : 0)); g.restore();
    }
    g.font = "bold 30px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    [["12", 0, -76], ["3", 78, 0], ["6", 0, 78], ["9", -78, 0]].forEach(([s, x, y]) => g.fillText(s, 128 + x, 128 + y));
    put(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 40), M.wood, cx, cy, z + 0.04, Math.PI / 2, 0, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.36, 40), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.6 }));
    face.position.set(cx, cy, z + 0.085); root.add(face);
    const hand = (len, w, color) => {
      const p = new THREE.Group(); p.position.set(cx, cy, z + 0.1);
      const m = new THREE.Mesh(rbox(w, len, 0.012, w / 2 - 0.002), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      m.position.y = len / 2 - 0.04; p.add(m); root.add(p); return p;
    };
    clock.h = hand(0.2, 0.035, 0x2f2723); clock.m = hand(0.29, 0.024, 0x2f2723);
    clock.s = hand(0.31, 0.01, 0xd94b3b); clock.s.position.z += 0.006;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 16), M.mustard); pin.rotation.x = Math.PI / 2; pin.position.set(cx, cy, z + 0.12); root.add(pin);
    if (RM) clock.s.visible = false;
    // 時鐘下方兩幅小掛畫（證書＋抽象畫）
    const art = (w, h, draw, x, y) => {
      const [ac, ag] = canvas(256, Math.round(256 * h / w)); draw(ag, ac.width, ac.height);
      put(rbox(w + 0.1, h + 0.1, 0.05, 0.02), M.woodDark, x, y, z + 0.025);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(ac), roughness: 0.7 }));
      pm.position.set(x, y, z + 0.053); root.add(pm);
    };
    art(0.55, 0.42, (g2, w, h) => {
      g2.fillStyle = "#f6edd8"; g2.fillRect(0, 0, w, h); g2.strokeStyle = "#c9a35a"; g2.lineWidth = 6; g2.strokeRect(10, 10, w - 20, h - 20);
      g2.fillStyle = "#5a4636"; g2.font = "bold 26px Georgia, serif"; g2.textAlign = "center"; g2.fillText("CERTIFICATE", w / 2, 62);
      g2.fillStyle = "#9b8a76"; for (let i = 0; i < 4; i++) g2.fillRect(50, 90 + i * 18, w - 100, 5);
      g2.fillStyle = "#d9533f"; g2.beginPath(); g2.arc(w - 52, h - 44, 18, 0, 7); g2.fill();
    }, cx - 0.42, 1.45);
    art(0.5, 0.42, (g2, w, h) => {
      g2.fillStyle = "#f3dcc0"; g2.fillRect(0, 0, w, h);
      g2.fillStyle = "#f2a65a"; g2.beginPath(); g2.arc(w * 0.68, h * 0.38, 34, 0, 7); g2.fill();
      g2.fillStyle = "#6f9a8d"; g2.beginPath(); g2.moveTo(0, h); g2.lineTo(w * 0.35, h * 0.42); g2.lineTo(w * 0.7, h); g2.fill();
      g2.fillStyle = "#3f6f6a"; g2.beginPath(); g2.moveTo(w * 0.35, h); g2.lineTo(w * 0.7, h * 0.55); g2.lineTo(w, h * 0.85); g2.lineTo(w, h); g2.fill();
    }, cx + 0.42, 1.45);
  }

  /* ---------- 牆上：BTC 現價看板 ---------- */
  let drawBtc;
  {
    const bx = (WINDOWS[1] + WIN_W / 2 + WINDOWS[2] - WIN_W / 2) / 2, by = 2.15, z = Z0 + WALL_T / 2, W = 2.5, H = 1.0;
    put(rbox(W + 0.14, H + 0.14, 0.08, 0.06), M.darkMetal, bx, by, z + 0.04);
    put(rbox(W, H, 0.05, 0.04), M.board, bx, by, z + 0.08);
    const [c, g] = canvas(1024, 410);
    const t = tex(c);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, H - 0.12), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    scr.position.set(bx, by, z + 0.107); root.add(scr);
    let last = null;
    drawBtc = (n) => {
      const bg = g.createLinearGradient(0, 0, 0, 410); bg.addColorStop(0, "#1c2230"); bg.addColorStop(1, "#11151d");
      g.fillStyle = bg; g.fillRect(0, 0, 1024, 410);
      g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 2;
      for (let x = 0; x < 1024; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 410); g.stroke(); }
      // 標頭：₿ 圓章＋BTC / USDT
      g.fillStyle = "#f7931a"; g.beginPath(); g.arc(78, 78, 38, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.font = "bold 50px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("₿", 78, 80);
      g.textAlign = "left"; g.fillStyle = "#f5c77e"; g.font = "600 44px system-ui, sans-serif"; g.fillText("BTC / USDT", 136, 80);
      g.fillStyle = "#34d399"; g.beginPath(); g.arc(912, 78, 10, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 30px system-ui, sans-serif"; g.fillText("LIVE", 932, 80);
      // 價格
      const up = last != null && n != null ? n >= last : null;
      const txt = n == null ? "—" : Math.round(n).toLocaleString("en-US");
      g.fillStyle = up == null ? "#ffffff" : up ? "#6ef0b4" : "#ff8a8a";
      g.font = "800 190px system-ui, -apple-system, sans-serif"; g.textAlign = "center"; g.fillText(txt, 512, 262, 960);
      if (up != null) { g.fillStyle = up ? "#34d399" : "#f87171"; g.font = "bold 40px system-ui"; g.fillText(up ? "▲" : "▼", 512, 372); }
      t.needsUpdate = true;
      if (n != null) last = n;
    };
    drawBtc(null);
    // 看板下方的矮櫃＋咖啡機＋馬克杯＋小多肉
    const cx = bx, cz = Z0 + WALL_T / 2 + 0.25;
    put(rbox(2.4, 0.72, 0.48, 0.05), M.wood, cx, 0.36, cz);
    put(rbox(2.44, 0.05, 0.52, 0.02), M.woodLight, cx, 0.745, cz);
    for (const dx of [-0.6, 0, 0.6]) {
      put(rbox(0.56, 0.56, 0.03, 0.02), M.woodLight, cx + dx * 1.0, 0.36, cz + 0.245);
      put(rbox(0.12, 0.025, 0.03, 0.01), M.metal, cx + dx, 0.56, cz + 0.27);
    }
    put(rbox(0.32, 0.42, 0.3, 0.05), M.coral, cx - 0.7, 0.98, cz - 0.02);
    put(rbox(0.26, 0.06, 0.06, 0.02), M.darkMetal, cx - 0.7, 1.08, cz + 0.13);
    put(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 16), M.white, cx - 0.7, 0.82, cz + 0.08);
    put(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 16), M.teal, cx - 0.2, 0.83, cz + 0.05);
    for (let i = 0; i < 4; i++) put(rbox(0.07, 0.3, 0.24, 0.015), [M.mustard, M.teal, M.coral, M.potCream][i], cx + 0.3 + i * 0.08, 0.92, cz);
  }

  /* ---------- 左牆：書櫃、白板、證書、飲水機 ---------- */
  {
    const xf = X0 + WALL_T / 2;
    // 書櫃
    const bz = -4.1, bw = 1.5, bh = 2.1, bd = 0.42, bxx = xf + bd / 2;
    put(rbox(bd, bh, 0.06, 0.02), M.wood, bxx, bh / 2, bz - bw / 2);
    put(rbox(bd, bh, 0.06, 0.02), M.wood, bxx, bh / 2, bz + bw / 2);
    put(rbox(bd + 0.04, 0.06, bw + 0.06, 0.02), M.wood, bxx, bh, bz);
    put(rbox(0.03, bh, bw, 0.01), M.woodDark, xf + 0.02, bh / 2, bz);
    const shelves = [0.08, 0.6, 1.12, 1.62];
    for (const y of shelves) put(rbox(bd, 0.04, bw - 0.04, 0.015), M.wood, bxx, y, bz);
    const bookCols = [0xd9533f, 0x3f8c85, 0xe2b04a, 0x5b6fa8, 0xefe2cd, 0x7a9a5a, 0xc76b8a, 0x40566e];
    const books = [];
    for (const y of shelves) {
      let z = bz - bw / 2 + 0.06;
      while (z < bz + bw / 2 - 0.12) {
        if (rnd() < 0.08) { z += 0.15; continue; }
        const th = 0.04 + rnd() * 0.04, h = 0.3 + rnd() * 0.14, d = 0.24 + rnd() * 0.08;
        const lean = rnd() < 0.1 ? 0.15 : 0;
        books.push({ x: xf + 0.05 + d / 2, y: y + 0.02 + h / 2, z: z + th / 2, h, th, d, lean, col: bookCols[Math.floor(rnd() * bookCols.length)] });
        z += th + 0.005 + (lean ? 0.04 : 0);
      }
    }
    const bk = new THREE.InstancedMesh(rbox(1, 1, 1, 0.08, 1), std(0xffffff, 0.75), books.length);
    const o = new THREE.Object3D();
    books.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z); o.rotation.set(b.lean, 0, 0); o.scale.set(b.d, b.h, b.th); o.updateMatrix();
      bk.setMatrixAt(i, o.matrix); bk.setColorAt(i, new THREE.Color(b.col));
    });
    bk.castShadow = bk.receiveShadow = true; root.add(bk);
    // 書櫃頂上的地球儀小擺設
    put(new THREE.SphereGeometry(0.13, 20, 14), M.teal, bxx, bh + 0.3, bz + 0.35);
    put(new THREE.CylinderGeometry(0.05, 0.08, 0.14, 16), M.woodDark, bxx, bh + 0.1, bz + 0.35);

    // 白板（上漲線）
    const wz = -1.0, ww = 2.4, wh = 1.25, wy = 1.75;
    put(rbox(0.05, wh + 0.1, ww + 0.1, 0.025), M.metal, xf + 0.025, wy, wz);
    put(rbox(0.05, 0.05, ww * 0.7, 0.02), M.metal, xf + 0.08, wy - wh / 2 - 0.05, wz);
    const [c, g] = canvas(768, 400);
    g.fillStyle = "#fbfcfd"; g.fillRect(0, 0, 768, 400);
    g.strokeStyle = "rgba(90,120,160,.12)"; g.lineWidth = 2;
    for (let x = 40; x < 768; x += 48) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x, 360); g.stroke(); }
    for (let y = 40; y < 380; y += 48) { g.beginPath(); g.moveTo(40, y); g.lineTo(740, y); g.stroke(); }
    g.strokeStyle = "#3b4252"; g.lineWidth = 5; g.beginPath(); g.moveTo(60, 40); g.lineTo(60, 350); g.lineTo(730, 350); g.stroke();
    const pts = [[70, 320], [140, 300], [200, 310], [270, 250], [330, 265], [400, 200], [460, 215], [530, 140], [590, 160], [660, 80]];
    g.strokeStyle = "#16a34a"; g.lineWidth = 9; g.lineJoin = g.lineCap = "round";
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.fillStyle = "#16a34a"; g.beginPath(); g.moveTo(700, 48); g.lineTo(646, 64); g.lineTo(684, 104); g.closePath(); g.fill();
    g.fillStyle = "#2563eb"; g.font = "bold 44px 'Comic Sans MS', 'Marker Felt', sans-serif"; g.fillText("PROFIT ↑", 110, 90);
    g.strokeStyle = "#dc2626"; g.lineWidth = 5; g.beginPath(); g.ellipse(660, 80, 40, 30, 0, 0, 7); g.stroke();
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.35 }));
    wb.rotation.y = Math.PI / 2; wb.position.set(xf + 0.055, wy, wz); wb.receiveShadow = true; root.add(wb);
    // 白板筆
    [M.coral, M.teal, M.darkMetal].forEach((m, i) => put(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 10), m, xf + 0.09, wy - wh / 2 - 0.01, wz - 0.3 + i * 0.12, Math.PI / 2, 0, 0));

    // 證書兩張
    for (const [z, y] of [[1.35, 1.95], [2.15, 1.75]]) {
      put(rbox(0.04, 0.5, 0.62, 0.02), M.woodDark, xf + 0.02, y, z);
      const [ac, ag] = canvas(256, 200);
      ag.fillStyle = "#f8f0dc"; ag.fillRect(0, 0, 256, 200); ag.strokeStyle = "#c9a35a"; ag.lineWidth = 6; ag.strokeRect(10, 10, 236, 180);
      ag.fillStyle = "#5a4636"; ag.font = "bold 22px Georgia, serif"; ag.textAlign = "center"; ag.fillText("TOP TRADER", 128, 56);
      ag.fillStyle = "#a89880"; for (let i = 0; i < 3; i++) ag.fillRect(50, 84 + i * 18, 156, 5);
      ag.fillStyle = "#e2b04a"; ag.beginPath(); ag.arc(196, 156, 16, 0, 7); ag.fill();
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.42), new THREE.MeshStandardMaterial({ map: tex(ac), roughness: 0.7 }));
      pm.rotation.y = Math.PI / 2; pm.position.set(xf + 0.043, y, z); root.add(pm);
    }

    // 飲水機
    const cz = 3.35, cxx = xf + 0.3;
    put(rbox(0.38, 0.95, 0.38, 0.06), M.white, cxx, 0.475, cz);
    put(rbox(0.04, 0.12, 0.2, 0.015), M.darkMetal, cxx + 0.19, 0.72, cz);
    put(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), M.coral, cxx + 0.2, 0.64, cz - 0.05, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), M.teal, cxx + 0.2, 0.64, cz + 0.05, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), M.metal, cxx, 0.97, cz);
    const bottle = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.26, 6, 20),
      new THREE.MeshPhysicalMaterial({ color: 0x8fd0f2, roughness: 0.1, transmission: 0, transparent: true, opacity: 0.75, clearcoat: 1 }));
    bottle.position.set(cxx, 1.27, cz); bottle.castShadow = true; root.add(bottle);
    // 紙杯架
    put(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12), M.metal, cxx, 1.4, cz + 0.33);
  }

  /* ---------- 盆栽（葉子用 InstancedMesh，update 時微微搖擺） ---------- */
  const plants = [];
  {
    const leafGeo = new THREE.SphereGeometry(1, 12, 8); leafGeo.scale(0.12, 0.02, 0.26); leafGeo.translate(0, 0, 0.24);
    const leafMat = std(0xffffff, 0.7);
    const greens = [0x5f9e5a, 0x4f8d4f, 0x76b366, 0x3f7a49, 0x8bc277];
    const mkPlant = (x, z, opt) => {
      const { potMat, potR, potH, n, hMin, hMax, scale } = opt;
      put(new THREE.CylinderGeometry(potR, potR * 0.78, potH, 28), potMat, x, potH / 2, z);
      put(new THREE.TorusGeometry(potR * 0.98, 0.03, 8, 28), potMat, x, potH, z, Math.PI / 2, 0, 0);
      put(new THREE.CylinderGeometry(potR * 0.9, potR * 0.9, 0.02, 24), M.soil, x, potH - 0.04, z, 0, 0, 0, false);
      const leaves = [];
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + rnd() * 0.3, f = i / n;
        const h = potH + hMin + (hMax - hMin) * Math.pow(f, 0.8) * (0.8 + rnd() * 0.3);
        const r = (0.02 + rnd() * 0.06) * scale;
        const pos = new THREE.Vector3(x + Math.sin(a) * r, h, z + Math.cos(a) * r);
        // 莖
        const sl = h - potH + 0.02;
        put(new THREE.CylinderGeometry(0.008, 0.012, sl, 6), M.stem, (x + pos.x) / 2, potH + sl / 2 - 0.02, (z + pos.z) / 2,
          Math.cos(a) * (r / sl), 0, -Math.sin(a) * (r / sl), false);
        leaves.push({ pos, yaw: a, pitch: -0.35 - rnd() * 0.5 + f * -0.25, s: scale * (0.75 + rnd() * 0.45), ph: rnd() * 6.28, col: greens[Math.floor(rnd() * greens.length)] });
      }
      const im = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
      leaves.forEach((l, i) => im.setColorAt(i, new THREE.Color(l.col)));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; root.add(im);
      const p = { im, leaves, sp: 0.8 + rnd() * 0.5 }; plants.push(p); posePlant(p, 0); return p;
    };
    mkPlant(-7.3, -5.35, { potMat: M.terracotta, potR: 0.28, potH: 0.5, n: 22, hMin: 0.25, hMax: 1.25, scale: 1.25 });
    mkPlant(9.35, -5.3, { potMat: M.potCream, potR: 0.26, potH: 0.55, n: 18, hMin: 0.3, hMax: 1.4, scale: 1.2 });
    mkPlant(-7.35, 6.55, { potMat: M.potTeal, potR: 0.22, potH: 0.42, n: 14, hMin: 0.12, hMax: 0.6, scale: 1.0 });
    // 窗台上的小多肉
    for (const [x, col] of [[WINDOWS[0] - 0.8, M.potCream], [WINDOWS[1] + 0.9, M.terracotta]]) {
      put(new THREE.CylinderGeometry(0.08, 0.065, 0.12, 16), col, x, SILL + 0.11, Z0 + 0.18);
      put(new THREE.SphereGeometry(0.085, 14, 10), std(0x7cb46b, 0.8), x, SILL + 0.2, Z0 + 0.18);
    }
  }
  function posePlant(p, t) {
    const o = posePlant.o || (posePlant.o = new THREE.Object3D());
    p.leaves.forEach((l, i) => {
      const sw = Math.sin(t * p.sp + l.ph);
      o.position.copy(l.pos); o.rotation.set(l.pitch + sw * 0.07, l.yaw + Math.sin(t * p.sp * 0.7 + l.ph) * 0.05, sw * 0.05, "YXZ");
      o.scale.setScalar(l.s); o.updateMatrix(); p.im.setMatrixAt(i, o.matrix);
    });
    p.im.instanceMatrix.needsUpdate = true;
  }

  /* ---------- 吊燈（靠後牆，從畫面上方垂下） ---------- */
  {
    const shadeMats = [M.mustard, M.teal, M.coral];
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd58a, emissiveIntensity: night ? 3.2 : 1.2, roughness: 0.3 });
    const innerMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffcf7a, emissiveIntensity: night ? 1.6 : 0.5, side: THREE.BackSide, roughness: 0.6 });
    const pts = [new THREE.Vector2(0.04, 0.32), new THREE.Vector2(0.07, 0.3), new THREE.Vector2(0.12, 0.2), new THREE.Vector2(0.26, 0.04), new THREE.Vector2(0.3, 0)];
    const shade = new THREE.LatheGeometry(pts, 28);
    [-3.6, 0.6, 4.6].forEach((x, i) => {
      const z = -4.7, y = 3.35;
      put(new THREE.CylinderGeometry(0.008, 0.008, 6, 6), M.darkMetal, x, y + 0.32 + 3, z, 0, 0, 0, false);
      put(shade, shadeMats[i], x, y, z);
      const inner = new THREE.Mesh(shade, innerMat); inner.position.set(x, y, z); inner.scale.setScalar(0.97); root.add(inner);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), bulbMat); bulb.position.set(x, y + 0.02, z); root.add(bulb);
    });
    if (night) { const pl = new THREE.PointLight(0xffc98a, 6, 9, 1.6); pl.position.set(0.6, 3.0, -4.6); root.add(pl); }
  }

  flush();

  /* ---------- 動畫 ---------- */
  let lastClockSec = -1;
  function setClock(force) {
    const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    if (!force && RM && Math.floor(m) === lastClockSec) return;
    lastClockSec = Math.floor(m);
    clock.h.rotation.z = -(h / 12) * Math.PI * 2;
    clock.m.rotation.z = -(m / 60) * Math.PI * 2;
    clock.s.rotation.z = -(Math.floor(s) / 60) * Math.PI * 2;
  }
  setClock(true);
  const span = X1 - X0 + 3;
  function update(t, dt) {
    setClock(false);                       // 時鐘顯示實際時間（reducedMotion 下只每分鐘更新、不顯示秒針）
    if (RM) return;
    for (const c of clouds) { c.m.position.x += c.v * dt; if (c.m.position.x > X1 + 1.5) c.m.position.x -= span; }
    for (const p of plants) posePlant(p, t);
  }
  function setBtcPrice(n) {
    const v = Number(n);
    if (n == null || !isFinite(v) || v <= 0) return;
    drawBtc(v);
  }
  return { update, setBtcPrice };
}
