// 3D 機器人辦公室：renderer／相機／資料／版面／標籤／點選／主迴圈。各模型由 room/character/desk/vault 模組提供（介面見 README.md）。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildRoom } from "./room.js";
import { createWorker, createCourier } from "./character.js";
import { createDesk } from "./desk.js";
import { createVault } from "./vault.js";

const $ = s => document.querySelector(s);
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KIND_NM = { grid: "合約網格", mart: "合約馬丁", other: "定投" };
const fmt = (v, d = 2) => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const cls = v => v > 0 ? "pos" : v < 0 ? "neg" : "mut";
const hash = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0; return Math.abs(x); };

/* ---------- 場景 ---------- */
const stage = $("#stage");
const hr = new Date().getHours(), night = hr < 6 || hr >= 18;
const renderer = new THREE.WebGLRenderer({ antialias: true });
// 手機：像素比最多 1.5、陰影貼圖減半，省 GPU；版面判斷用螢幕寬度
const MOBILE = matchMedia("(max-width: 640px)").matches || /Mobi|Android|iPhone/i.test(navigator.userAgent);
renderer.setPixelRatio(Math.min(MOBILE ? 1.5 : 2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = night ? 0.85 : 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
const labels = new CSS2DRenderer(); labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? 0x2a2a3a : 0xe9e1d6);
scene.fog = new THREE.Fog(scene.background, 30, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
// 預設視角依畫面比例：橫向用斜上方看整間；直向（手機）站得更高、更俯視，才放得下整間房間
const HOME_WIDE = { pos: new THREE.Vector3(6.6, 10.6, 14.6), target: new THREE.Vector3(1.6, 0.2, 0.9), fov: 32 };
// 直向：從房間右側（+x）斜看，讓房間的長邊往畫面深處延伸，直式畫面才放得滿
const HOME_TALL = { pos: new THREE.Vector3(10.5, 17.5, 3.4), target: new THREE.Vector3(0.4, 0, 0.7), fov: 50 };
let HOME = HOME_WIDE, userMoved = false;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 6; controls.maxDistance = 48; controls.maxPolarAngle = Math.PI * 0.46; controls.minPolarAngle = Math.PI * 0.05;
controls.addEventListener("start", () => { userMoved = true; });
function goHome() { camera.fov = HOME.fov; camera.updateProjectionMatrix(); camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update(); userMoved = false; }
goHome();
const WALLCAM = { pos: new THREE.Vector3(-1.6, 2.6, 1.6), target: new THREE.Vector3(-7.9, 1.9, 1.7) };
document.addEventListener("click", e => { if (e.target.id === "wallcam") { camera.position.copy(WALLCAM.pos); controls.target.copy(WALLCAM.target); controls.update(); userMoved = true; } });
$("#cam").addEventListener("click", goHome);

// 燈：天光＋主光（投影）＋補光
scene.add(new THREE.HemisphereLight(night ? 0x9fb0ff : 0xfff4e6, night ? 0x2a2018 : 0xb89a7a, night ? 0.45 : 0.9));
const sun = new THREE.DirectionalLight(night ? 0xbfc8ff : 0xffe2c0, night ? 0.6 : 2.2);
sun.position.set(6, 14, 9); sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 40 });
scene.add(sun);
const fill = new THREE.DirectionalLight(0xcfe0ff, night ? 0.25 : 0.5); fill.position.set(-8, 6, 10); scene.add(fill);

const ctx = { THREE, scene, renderer, night, reducedMotion: RM };
const room = buildRoom(ctx);

/* ---------- 80 年代懸疑主題（風格靈感；fx.js、stdecor.js 由另外兩個分支提供） ----------
   ?theme=st 或按「80 年代主題」開啟；選擇會記在瀏覽器。開啟後可再切「顛倒世界」。
   兩個模組都用動態載入：檔案不在（分支還沒合併）時按鈕會停用，頁面照常運作。 */
let fx = null, decor = null, themeOn = false, upside = false;
let ST = null, WORLD = null, INTRO = null, CASTM = null, world = null;   // 站點／怪物環境／片頭／角色模組（可能還沒合併）
const opt = path => import(path).catch(() => null);
const THEME_KEY = "o3d-theme";
async function setTheme(on, { intro = false } = {}) {
  if (on && (!fx || !decor)) {
    try {
      const [{ createFx }, { buildDecor }] = await Promise.all([import("./fx.js"), import("./stdecor.js")]);
      if (!decor) decor = buildDecor({ THREE, scene, renderer, night, reducedMotion: RM });
      if (!fx) { fx = createFx({ THREE, scene, camera, renderer, reducedMotion: RM }); resize(); }
    } catch (e) { $("#theme").disabled = true; $("#theme").title = "主題模組還沒合併進來"; console.warn(e); return; }
    [ST, WORLD, INTRO, CASTM] = await Promise.all([opt("./ststations.js"), opt("./stworld.js"), opt("./stintro.js"), opt("./stcast.js")]);
    if (WORLD && !world) world = WORLD.buildWorld({ THREE, scene, renderer, night, reducedMotion: RM });
  }
  if (on && intro && INTRO) await INTRO.playIntro($("#stage"), { reducedMotion: RM, title: (window.O3D_PUBLIC && window.O3D_PUBLIC.title) || ["NIGHT", "SHIFT"], subtitle: (window.O3D_PUBLIC && window.O3D_PUBLIC.subtitle) || "THE OFFICE" });
  themeOn = on; if (decor) decor.group.visible = on; if (world) world.group.visible = on;
  if (!on && upside) setUpside(false);
  if (INTRO) INTRO.applyHud(document.body, { on });
  $("#theme").textContent = on ? "✕ 關閉 80 年代主題" : "✦ 80 年代主題"; $("#upside").hidden = !on; $("#wallcam").hidden = !on;
  document.body.classList.toggle("st", on);
  try { localStorage.setItem(THEME_KEY, on ? "1" : "0"); } catch {}
  if (staff.length) { seats.forEach(st => { scene.remove(st.desk.group); st.tagObj.removeFromParent(); }); seats = []; syncSeats(staff); }   // 工位換成站點／辦公桌
}
function setUpside(on) {
  upside = on; const m = on ? "upside" : "normal"; fx && fx.setMode(m); decor && decor.setMode(m); world && world.setMode(m);
  $("#upside").textContent = on ? "↺ 回到正常世界" : "⇅ 顛倒世界"; document.body.classList.toggle("upside", on);
}
const vault = createVault(ctx);
const vtag = document.createElement("div"); vtag.className = "vtag"; vtag.innerHTML = "金庫・近 7 天入袋<b>—</b>";
vault.labelAnchor.add(new CSS2DObject(vtag));


/* ---------- 合併工位裡不會動的零件（減少 draw call） ----------
   一張桌子約 70 個 mesh，12 張就是 800 多次繪製（加上陰影再翻倍）。
   做法：先把桌子的各種狀態（動畫、警示、賺賠、加倉數）都試跑一遍，位置、材質、顯示狀態從頭到尾都沒變的 mesh
   就是靜態零件，依「材質＋是否投影」合併成一個 mesh。會動或會變的零件保留原樣，desk.js 的介面與行為不受影響。 */
function mergeStatic(desk) {
  const g = desk.group; g.updateMatrixWorld(true);
  const snap = new Map();
  g.traverse(o => { if (o.isMesh) snap.set(o, { m: o.matrixWorld.clone(), mat: o.material, vis: o.visible, ok: o.visible && o.material.visible !== false }); });
  const check = () => { g.updateMatrixWorld(true); g.traverse(o => { if (!o.isMesh) return; const r = snap.get(o);
    if (!r) return; if (!o.matrixWorld.equals(r.m) || o.material !== r.mat || o.visible !== r.vis) r.ok = false; }); };
  // 試跑：各種時間點與狀態
  [0.37, 1.13, 2.71, 4.93, 7.7].forEach(tt => { desk.update(tt, 0.016); check(); });
  desk.setAlert("red"); desk.update(0.5, 0.016); check(); desk.setAlert("yellow"); check(); desk.setAlert(null); check();
  desk.setProfit(5); check(); desk.setProfit(-5); check(); desk.setProfit(null); check();
  if (desk.setOrders) { desk.setOrders(3); check(); desk.setOrders(12); check(); }
  const groups = new Map();
  for (const [o, r] of snap) {
    if (!r.ok || !o.parent || o === desk.hitbox) continue;
    const key = o.material.uuid + (o.castShadow ? "s" : "") + (o.receiveShadow ? "r" : "");
    (groups.get(key) || groups.set(key, { mat: o.material, cs: o.castShadow, rs: o.receiveShadow, list: [] }).get(key)).list.push(o);
  }
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  for (const { mat, cs, rs, list } of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map(o => {
      let gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(gg.attributes)) if (!["position", "normal", "uv"].includes(k)) gg.deleteAttribute(k);
      if (!gg.attributes.normal) gg.computeVertexNormals();
      if (!gg.attributes.uv) gg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      gg.morphAttributes = {}; gg.clearGroups();
      return gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    });
    const merged = mergeGeometries(geos, false); geos.forEach(x => x.dispose());
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, mat); mm.castShadow = cs; mm.receiveShadow = rs; g.add(mm);
    list.forEach(o => o.removeFromParent());
  }
}

/* ---------- 版面 ---------- */
const COLS = 4, ROWS = 3, SX = 3.0, SZ = 2.8, X0 = -5.5, Z0 = -3.4, AISLE_Z = 5.2;
const slot = i => new THREE.Vector3(X0 + (i % COLS) * SX, 0, Z0 + Math.floor(i / COLS) * SZ);

/* ---------- 資料 ---------- */
let leaving = [];
let D = null, staff = [], seats = [], couriers = [], seen = null, queue = [], vaultSum = 0, vaultTarget = 0, sel = null;
function buildStaff() {
  const g = D.bots.filter(b => b.status === "open").map(b => ({ key: b.id, kind: b.type === "futures_grid" ? "grid" : "other",
    base: b.pair.replace(".PERP", "").split("/")[0], profit: b.profit, liq: b.liq_gap, cap: b.capital, lev: b.leverage,
    info: [["區間", b.range_low != null ? b.range_low + " – " + b.range_high : "—"], ["現價", b.price], ["在區間內", b.in_range ? "是" : "否"],
      ["已實現", fmt(b.realized)], ["未實現", fmt(b.unrealized)], ["手續費", fmt(b.fee)], ["資金費", fmt(b.funding)], ["開單", new Date(b.created).toLocaleString("zh-TW")]] }));
  const m = (D.mart_open || []).map(b => ({ key: b.id, kind: "mart", base: b.base, trend: b.trend, profit: b.profit, liq: b.liq_gap, cap: b.capital, lev: b.lev, orders: b.orders,
    info: [["方向", b.trend === "short" ? "做空" : "做多"], ["加倉", (b.orders ?? "—") + " / " + ((b.so ?? 0) + 1) + " 張"], ["均價", b.avg], ["出場價", b.target],
      ["離出場", b.target_gap != null ? b.target_gap.toFixed(1) + "%" : "—"], ["強平價", b.liq], ["現價", b.mark], ["開單", new Date(b.created).toLocaleString("zh-TW")]], stale: b.stale }));
  return g.concat(m).slice(0, COLS * ROWS).map(s => Object.assign(s, { seed: hash(s.key), alert: s.liq == null ? null : s.liq < 8 ? "red" : s.liq < 15 ? "yellow" : null }));
}
function doneEvents() {
  const g = D.bots.filter(b => b.status !== "open" && b.known && b.closed && /USDT$/.test(b.pair)).map(b => ({ key: b.id, kind: "grid", ts: b.closed, p: b.profit }));
  const m = ((D.mart && D.mart.rows) || []).filter(r => r.coin === "USDT").map(r => ({ key: r.id, kind: "mart", ts: r.closed, p: r.profit }));
  return g.concat(m).sort((a, b) => a.ts - b.ts);
}
const nameOf = s => (s.base.length > 9 ? s.base.slice(0, 8) + "…" : s.base) + (s.trend ? (s.trend === "short" ? " 空" : " 多") : "");
function tagHTML(s) {   // 精簡名牌：一行名稱＋浮動；離強平用左邊色條與小字
  return '<div class="r"><b>' + nameOf(s) + '</b><span class="p ' + cls(s.profit) + '">' + (s.profit == null ? KIND_NM[s.kind] : fmt(s.profit)) + '</span></div>' +
    (s.alert ? '<div class="w ' + (s.alert === "red" ? "red" : "") + '">離強平 ' + s.liq.toFixed(1) + '%</div>' : "");
}
// 工位：同一台機器人沿用同一組模型，只更新狀態；台數或順序變了才重建
// 員工：主題開啟且有角色模組時用 80 年代角色（依座位輪流），站著的站點用站姿；沒有角色模組時坐姿用原本的員工、站姿用送件員的站立人物
function makeActor(s, i, seat) {
  if (themeOn && CASTM) {
    const c = CASTM.CAST[i % CASTM.CAST.length], m = CASTM.createCastMember({ THREE, id: c.id, seed: s.seed });
    m.setPose(seat === "stand" ? "stand" : "sit"); return m;
  }
  if (seat === "stand") { const c = createCourier({ THREE, kind: s.kind, seed: s.seed, positive: true });
    return { group: c.group, setMood() {}, setAlert() {}, update: c.update, play() {} }; }
  return createWorker({ THREE, kind: s.kind, seed: s.seed });
}
function syncSeats(next) {
  const sameLayout = next.length === seats.length && next.every((s, i) => seats[i].key === s.key);
  if (!sameLayout) {
    seats.forEach(st => { scene.remove(st.desk.group); st.tagObj.removeFromParent(); });
    seats = next.map((s, i) => {
      const useST = themeOn && ST;
      const desk = useST ? ST.createStation({ THREE, kind: s.kind, seed: s.seed, orders: s.orders ?? null, station: ST.STATIONS[i % ST.STATIONS.length] })
                         : createDesk({ THREE, kind: s.kind, seed: s.seed, orders: s.orders ?? null });
      desk.group.position.copy(slot(i)); scene.add(desk.group);
      mergeStatic(desk);   // 先合併，再掛人物（人物會動，不能合併）
      const worker = makeActor(s, i, desk.seat || "sit");
      desk.workerAnchor.add(worker.group);
      desk.hitbox.userData.seat = i;
      const el = document.createElement("div"); el.className = "tag";
      const tagObj = new CSS2DObject(el); desk.labelAnchor.add(tagObj);
      return { key: s.key, desk, worker, el, tagObj };
    });
  }
  next.forEach((s, i) => {
    const st = seats[i], prev = st.s; st.s = s;
    if (prev && sameLayout && st.worker.play) {
      if (s.profit != null && prev.profit != null && s.profit - prev.profit >= 2) st.worker.play("celebrate", t);
      else if (s.alert === "red" && prev.alert !== "red") { st.worker.play("panic", t); if (themeOn) { fx && fx.flash(); decor && decor.spell("RUN"); world && world.attack(st.desk.group.position.clone()); } }
      else if (s.profit != null && prev.profit != null && s.profit - prev.profit <= -3) st.worker.play("headdown", t);
    }
    st.desk.setProfit(s.profit); st.desk.setAlert(s.alert); if (s.kind === "mart") st.desk.setOrders(s.orders ?? 1);
    st.worker.setMood(s.profit == null ? 0 : s.profit > 0.5 ? 1 : s.profit < -0.5 ? -1 : 0); st.worker.setAlert(s.alert);
    st.el.innerHTML = tagHTML(s); st.el.classList.toggle("on", sel === i);
  });
}
async function load() {
  // 公開示範版（GitHub Pages）沒有本機服務：用 demo-data.js 產生的虛構資料
  try { if (window.O3D_DEMO_DATA) D = window.O3D_DEMO_DATA(); else { const r = await fetch("/api/data?days=7", { cache: "no-store" }); D = await r.json(); }
    if (!Array.isArray(D.bots)) { $("#note").textContent = "伺服器還在讀資料，稍後自動重試。"; return; }
  } catch (e) { $("#note").textContent = "讀不到本機資料：" + e.message; return; }
  staff = buildStaff(); syncSeats(staff);
  const E = doneEvents(), total = E.reduce((a, e) => a + e.p, 0);
  if (seen === null) { seen = new Set(E.map(e => e.key)); vaultSum = vaultTarget = total; vault.setAmount(total); paintVault(); }
  else E.filter(e => !seen.has(e.key)).forEach(e => { seen.add(e.key); spawnCourier(e); });   // 新關單：自動派人送
  const btc = (D.mart_open || []).find(b => b.base === "BTC" && b.mark) || D.bots.find(b => /^BTC/.test(b.pair) && b.status === "open");
  if (btc) room.setBtcPrice(btc.mark || btc.price);
  const open = staff.reduce((a, s) => a + (s.profit || 0), 0);
  $("#note").innerHTML = staff.length + " 位員工在上班 · 浮動合計 <b class=\"" + cls(open) + "\">" + fmt(open) + "</b> · 近 7 天 " + E.length + " 筆入袋 · 資料 " + (D.fetched_at || "");
  drawRoster();
}
function paintVault() { const b = vtag.querySelector("b"); b.textContent = fmt(vaultSum) + " U"; b.className = vaultSum < 0 ? "neg" : ""; }

/* ---------- 送件員 ---------- */
function spawnCourier(ev) {
  const k = seats.findIndex(st => st.key === ev.key);
  const start = k >= 0 ? slot(k).add(new THREE.Vector3(0, 0, 1.2)) : new THREE.Vector3(-9, 0, AISLE_Z);
  const drop = vault.dropPoint.clone();
  const path = [start, new THREE.Vector3(start.x, 0, AISLE_Z), new THREE.Vector3(drop.x, 0, AISLE_Z), drop];
  let c;
  if (themeOn && CASTM) {
    const pick = CASTM.CAST[hash(ev.key) % CASTM.CAST.length], m = CASTM.createCastMember({ THREE, id: pick.id, seed: hash(ev.key + "c") });
    m.setPose("walk"); m.carry && m.carry(ev.p >= 0);
    c = { group: m.group, update: m.update, setWalking(v) { m.setPose(v ? "walk" : "stand"); }, toss() { m.setPose("stand"); m.play && m.play("celebrate", t); } };
  } else c = createCourier({ THREE, kind: ev.kind, seed: hash(ev.key + "c"), positive: ev.p >= 0 });
  c.group.position.copy(start); scene.add(c.group); c.setWalking(true);
  couriers.push({ ev, c, path, seg: 0, done: false });
}
function stepCouriers(dt) {
  const speed = RM ? 1e9 : 3.2 * dt;
  for (const k of couriers) {
    let left = speed;
    while (left > 0 && k.seg < k.path.length - 1) {
      const b = k.path[k.seg + 1], d = k.c.group.position.distanceTo(b);
      const dir = b.clone().sub(k.c.group.position);
      if (dir.lengthSq() > 1e-6) k.c.group.rotation.y = Math.atan2(dir.x, dir.z);
      if (d <= left) { k.c.group.position.copy(b); k.seg++; left -= d; }
      else { k.c.group.position.addScaledVector(dir.normalize(), left); left = 0; }
    }
    if (k.seg >= k.path.length - 1 && !k.done) {
      k.done = true; if (k.c.toss) k.c.toss(); deliver(k.ev);
      const g = k.c.group, c = k.c; leaving.push({ c, until: t + 0.75 });
    }
  }
  couriers = couriers.filter(k => !k.done);
  // 拋完錢袋的送件員再留一下才消失
  leaving = leaving.filter(x => { if (t >= x.until) { scene.remove(x.c.group); return false; } x.c.update(t, dt); return true; });
}
function deliver(ev) {
  if (themeOn && decor && ev.p > 0 && Math.random() < 0.35) decor.spell("PROFIT");
  vaultTarget += ev.p; vault.hit(ev.p >= 0);
  // CSS2DRenderer 會改外層的 transform，動畫要放在內層，否則會蓋掉定位而跑到左上角
  const el = document.createElement("div"), inner = document.createElement("div");
  inner.className = "pop" + (ev.p < 0 ? " neg" : ""); inner.textContent = fmt(ev.p); el.appendChild(inner);
  const o = new CSS2DObject(el); o.position.set(0, 0.6, 0); vault.labelAnchor.add(o);
  setTimeout(() => o.removeFromParent(), 1700);
}
$("#replay").addEventListener("click", () => { if (!D) return; queue = doneEvents(); couriers.forEach(k => scene.remove(k.c.group)); couriers = []; vaultSum = vaultTarget = 0; vault.setAmount(0); paintVault();
  if (RM) { queue.forEach(deliver); queue = []; } });
$("#skip").addEventListener("click", () => { if (!D) return; queue = []; couriers.forEach(k => scene.remove(k.c.group)); couriers = [];
  vaultSum = vaultTarget = doneEvents().reduce((a, e) => a + e.p, 0); vault.setAmount(vaultSum); paintVault(); });

/* ---------- 點員工 ---------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;   // 拖曳旋轉不算點擊
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(seats.map(st => st.desk.hitbox), false)[0];
  if (hit) select(hit.object.userData.seat);
});
renderer.domElement.addEventListener("pointermove", e => {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, camera);
  renderer.domElement.style.cursor = ray.intersectObjects(seats.map(st => st.desk.hitbox), false).length ? "pointer" : "grab";
});
function select(i) {
  sel = i; seats.forEach((st, k) => st.el.classList.toggle("on", k === i));
  const s = staff[i]; if (!s) return;
  $("#info").innerHTML = '<h2>' + s.base + ' · ' + KIND_NM[s.kind] + (s.lev ? ' ' + s.lev + 'x' : '') + '</h2><dl>' +
    [["浮動", '<span class="' + cls(s.profit) + '">' + fmt(s.profit) + '</span>'], ["本金", (s.cap || 0).toLocaleString("en-US")], ["離強平", s.liq != null ? s.liq.toFixed(1) + "%" : "—"]]
      .concat(s.info).map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + (v ?? "—") + '</dd></div>').join("") + '</dl>' +
    (s.stale ? '<p class="neg" style="margin:8px 0 0">' + s.stale + '（網頁快照可能過期）</p>' : "");
}
function drawRoster() {
  $("#roster tbody").innerHTML = staff.map(s => '<tr><td>' + nameOf(s) + '</td><td>' + KIND_NM[s.kind] + '</td><td class="n ' + cls(s.profit) + '">' + fmt(s.profit) +
    '</td><td class="n">' + (s.liq != null ? s.liq.toFixed(1) + "%" : "—") + '</td><td class="n">' + (s.cap || 0).toLocaleString("en-US") + '</td></tr>').join("");
}

/* ---------- 尺寸與主迴圈 ---------- */
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h;
  const want = w / h < 1 ? HOME_TALL : HOME_WIDE;          // 轉向（直↔橫）時換預設視角；使用者自己轉過就不動
  if (want !== HOME) { HOME = want; if (!userMoved) goHome(); }
  camera.updateProjectionMatrix();
  if (fx) fx.resize(w, h);
}
new ResizeObserver(resize).observe(stage); resize();
const clock = new THREE.Clock(); let t = 0, nextSpawn = 0;

/* ---------- 效能：自動調畫質、陰影隔格更新、看不見就暫停 ----------
   每 2 秒量一次 fps：低於 48 先關主光陰影，還不夠再降解析度（每次 0.25，最低 1，再低會糊）；
   連續 3 次都在 58 以上再慢慢升回去（先升解析度、再開陰影）。陰影每兩格才重算一次（人物動作小，看不出差別）。
   分頁切走或舞台捲出畫面時整個停下來，不耗電。 */
const PR_MAX = Math.min(MOBILE ? 1.5 : 2, devicePixelRatio || 1), PR_MIN = Math.min(PR_MAX, 1);   // 不低於 1：再低在手機高解析螢幕上會糊
const perf = { pr: PR_MAX, t0: 0, n: 0, good: 0, shadows: true, frame: 0, fps: 60 };
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
function setPR(p) { perf.pr = p; renderer.setPixelRatio(p); resize(); }
function perfTick(now) {
  perf.n++; if (!perf.t0) { perf.t0 = now; return; }
  const el = now - perf.t0; if (el < 2000) return;
  const fps = perf.n * 1000 / el; perf.fps = fps; perf.t0 = now; perf.n = 0;
  if (fps < 48) { perf.good = 0;
    // 先關陰影（看不太出差別），還不夠才降解析度
    if (perf.shadows) { perf.shadows = false; sun.castShadow = false; renderer.shadowMap.needsUpdate = true; }
    else if (perf.pr > PR_MIN + 0.01) setPR(Math.max(PR_MIN, perf.pr - 0.25));
  } else if (fps > 58 && ++perf.good >= 3) { perf.good = 0;
    if (perf.pr < PR_MAX - 0.01) setPR(Math.min(PR_MAX, perf.pr + 0.25));
    else if (!perf.shadows) { perf.shadows = true; sun.castShadow = true; renderer.shadowMap.needsUpdate = true; }
  }
}
let running = true, onScreen = true;
function wake() { const want = onScreen && !document.hidden; if (want && !running) { running = true; clock.getDelta(); perf.t0 = 0; requestAnimationFrame(frame); } else if (!want) running = false; }
document.addEventListener("visibilitychange", wake);
new IntersectionObserver(es => { onScreen = es[0].isIntersecting; wake(); }).observe(stage);
const MAX_COURIERS = MOBILE ? 6 : 12;   // 同時在走的送件員上限（回放時排隊）
// ?stats=1：右上角顯示每秒幀數、draw call、三角形數
const stats = new URLSearchParams(location.search).has("stats") ? { n: 0, t0: 0, el: Object.assign(document.createElement("div"), { style: "position:absolute;right:10px;top:10px;background:rgba(0,0,0,.6);color:#fff;font:12px ui-monospace,monospace;padding:4px 8px;border-radius:6px;pointer-events:none" }) } : null;
if (stats) { stats.el.id = "stats"; stage.appendChild(stats.el); window.__o3d = { scene, renderer, seats: () => seats, world: () => world }; }
function frame(now = performance.now()) {
  if (!running) return;
  perfTick(now);
  if (perf.shadows && (perf.frame++ & 1) === 0) renderer.shadowMap.needsUpdate = true;
  if (stats) { renderer.info.autoReset = false; renderer.info.reset(); }   // 後製會分好幾次繪製，整格一起算
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  if (queue.length && t >= nextSpawn && couriers.length < MAX_COURIERS) { spawnCourier(queue.shift()); nextSpawn = t + 0.6; }
  stepCouriers(dt);
  if (Math.abs(vaultTarget - vaultSum) > 0.005) { vaultSum += (vaultTarget - vaultSum) * Math.min(1, dt * 5); paintVault(); vault.setAmount(vaultSum); }
  room.update(t, dt); vault.update(t, dt); if (themeOn && decor) decor.update(t, dt); if (themeOn && world) world.update(t, dt);
  for (const st of seats) { st.desk.update(t, dt); st.worker.update(t, dt); }
  for (const k of couriers) k.c.update(t, dt);
  controls.update();
  if (themeOn && fx) { fx.update(t, dt); fx.render(); } else renderer.render(scene, camera);
  labels.render(scene, camera);
  if (stats) { stats.n++; if (t - stats.t0 >= 1) { const i = renderer.info.render;
    stats.el.textContent = (stats.n / (t - stats.t0)).toFixed(0) + " fps · 解析度 " + perf.pr.toFixed(2) + (perf.shadows ? "" : " · 無陰影") + " · " + i.calls + " draw calls · " + (i.triangles / 1000).toFixed(0) + "k 三角形";
    stats.t0 = t; stats.n = 0; } }
  requestAnimationFrame(frame);
}
$("#msg").remove();
// ?replay=1：載入後自動回放（方便無畫面截圖驗證）
$("#theme").addEventListener("click", () => setTheme(!themeOn, { intro: !themeOn }));
$("#upside").addEventListener("click", () => setUpside(!upside));
{ const q = new URLSearchParams(location.search); let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch {}
  if (q.get("theme") === "st" || (q.get("theme") == null && saved === "1")) setTheme(true).then(() => { if (q.has("upside")) setUpside(true); }); }
load().then(() => { if (new URLSearchParams(location.search).has("replay")) $("#replay").click(); });
setInterval(load, 30000); requestAnimationFrame(frame);
