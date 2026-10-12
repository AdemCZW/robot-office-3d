// 金庫、金幣堆、送達特效。介面見 README.md。
// group 在 (7.2, 0, 0)；正面（門）朝 +z。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const W = 2.0, H = 2.4, D = 1.4, PLINTH = 0.18;
const PER_COIN = 15, MAX_COINS = 120, P_MAX = 48;
const GRAV = 9.8;

function plaqueTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "#f8d77a"); gr.addColorStop(0.5, "#d9a531"); gr.addColorStop(1, "#a8761a");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "rgba(90,55,5,.6)"; g.lineWidth = 4; g.strokeRect(6, 6, 244, 52);
  g.fillStyle = "#5a3705"; g.font = "bold 34px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("V A U L T", 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dialTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  gr.addColorStop(0, "#f3f4f6"); gr.addColorStop(1, "#9ca3af");
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#1f2937"; g.fillStyle = "#1f2937"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 18px system-ui, sans-serif";
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, long = i % 5 === 0;
    g.lineWidth = long ? 3 : 1.5;
    g.beginPath(); g.moveTo(128 + Math.sin(a) * 120, 128 - Math.cos(a) * 120); g.lineTo(128 + Math.sin(a) * (long ? 100 : 110), 128 - Math.cos(a) * (long ? 100 : 110)); g.stroke();
    if (i % 10 === 0) g.fillText(String(i), 128 + Math.sin(a) * 84, 128 - Math.cos(a) * 84);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true;
  if (parent) parent.add(m); return m;
}

export function createVault(ctx) {
  const { scene } = ctx, RM = !!ctx.reducedMotion;
  const group = new THREE.Group(); group.position.set(7.2, 0, 0); scene.add(group);

  const paint = new THREE.MeshPhysicalMaterial({ color: 0x2f4f6f, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const paintDoor = new THREE.MeshPhysicalMaterial({ color: 0x35597d, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2533, metalness: 0.6, roughness: 0.5 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xe0b04a, metalness: 1, roughness: 0.25, clearcoat: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.15 });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xf5b82e, metalness: 1, roughness: 0.22, clearcoat: 0.6, emissive: 0x6b4300, emissiveIntensity: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false });

  /* 本體 */
  mesh(new RoundedBoxGeometry(W + 0.2, PLINTH, D + 0.2, 3, 0.05), dark, group, 0, PLINTH / 2, 0);
  for (const [x, z] of [[-0.95, -0.65], [0.95, -0.65], [-0.95, 0.65], [0.95, 0.65]]) mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.06, 16), brass, group, x, 0.03, z);
  const bodyH = H - PLINTH;
  const body = mesh(new RoundedBoxGeometry(W, bodyH, D, 5, 0.12), paint, group, 0, PLINTH + bodyH / 2, 0);
  // 頂蓋飾條
  mesh(new RoundedBoxGeometry(W + 0.08, 0.08, D + 0.08, 3, 0.035), dark, group, 0, H - 0.02, 0);
  // 招牌
  const plaque = mesh(new RoundedBoxGeometry(0.9, 0.22, 0.03, 2, 0.01), brass, group, 0, H - 0.2, D / 2 + 0.01);
  const pf = mesh(new THREE.PlaneGeometry(0.84, 0.18), new THREE.MeshStandardMaterial({ map: plaqueTexture(), metalness: 0.6, roughness: 0.35 }), plaque, 0, 0, 0.016, false);

  /* 門框＋門（鉸鍊在左，微開一道縫透金光） */
  const DW = 1.5, DH = 1.62, DY = PLINTH + 0.12 + DH / 2, FZ = D / 2;
  const frame = new THREE.Group(); frame.position.set(0, DY, FZ); group.add(frame);
  const fr = new THREE.MeshPhysicalMaterial({ color: 0x23384f, metalness: 0.6, roughness: 0.3, clearcoat: 0.8 });
  mesh(new RoundedBoxGeometry(DW + 0.14, 0.07, 0.05, 2, 0.02), fr, frame, 0, DH / 2 + 0.035, 0.0);
  mesh(new RoundedBoxGeometry(DW + 0.14, 0.07, 0.05, 2, 0.02), fr, frame, 0, -DH / 2 - 0.035, 0.0);
  mesh(new RoundedBoxGeometry(0.07, DH + 0.14, 0.05, 2, 0.02), fr, frame, -DW / 2 - 0.035, 0, 0.0);
  mesh(new RoundedBoxGeometry(0.07, DH + 0.14, 0.05, 2, 0.02), fr, frame, DW / 2 + 0.035, 0, 0.0);
  // 門後的金光（縫隙處看得到）
  mesh(new THREE.PlaneGeometry(0.3, DH - 0.12), glow, frame, DW / 2 - 0.16, 0, 0.002, false);
  const gapLight = new THREE.PointLight(0xffc24d, 0.9, 2.2, 2); gapLight.position.set(DW / 2 + 0.1, 0, 0.3); frame.add(gapLight);

  const hinge = new THREE.Group(); hinge.position.set(-DW / 2, 0, 0.03); frame.add(hinge);
  const DOOR_OPEN = -0.075; hinge.rotation.y = DOOR_OPEN;
  const door = new THREE.Group(); door.position.set(DW / 2, 0, 0.06); hinge.add(door);
  mesh(new RoundedBoxGeometry(DW, DH, 0.12, 4, 0.05), paintDoor, door);
  // 內嵌面板
  mesh(new RoundedBoxGeometry(DW - 0.24, DH - 0.24, 0.02, 2, 0.04), paint, door, 0, 0, 0.065);
  // 鉸鍊
  for (const y of [DH / 2 - 0.25, -DH / 2 + 0.25]) mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 16), chrome, hinge, -0.02, y, 0.03);
  // 鉚釘（InstancedMesh）
  const rivPos = [];
  for (let i = 0; i < 8; i++) { const x = -DW / 2 + 0.07 + i * (DW - 0.14) / 7; rivPos.push([x, DH / 2 - 0.07], [x, -DH / 2 + 0.07]); }
  for (let i = 1; i < 9; i++) { const y = -DH / 2 + 0.07 + i * (DH - 0.14) / 9; rivPos.push([-DW / 2 + 0.07, y], [DW / 2 - 0.07, y]); }
  const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 10, 8), chrome, rivPos.length);
  const mtx = new THREE.Matrix4();
  rivPos.forEach(([x, y], i) => rivets.setMatrixAt(i, mtx.makeTranslation(x, y, 0.06)));
  rivets.castShadow = true; door.add(rivets);
  // 大轉盤
  const dial = new THREE.Group(); dial.position.set(0, 0.22, 0.08); door.add(dial);
  const dialRing = mesh(new THREE.TorusGeometry(0.3, 0.04, 14, 48), chrome, door, 0, 0.22, 0.09);
  const disc = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 48), new THREE.MeshStandardMaterial({ map: dialTexture(), metalness: 0.7, roughness: 0.3 }), dial, 0, 0, 0.02);
  disc.rotation.x = Math.PI / 2; disc.rotation.y = Math.PI / 2;
  const knob = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 24), dark, dial, 0, 0, 0.07); knob.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.035, 12, 10), brass, dial, 0, 0, 0.12);
  const marker = mesh(new THREE.ConeGeometry(0.025, 0.06, 3), brass, door, 0, 0.22 + 0.37, 0.09); marker.rotation.z = Math.PI;
  // 把手：三支輻條的舵輪
  const wheel = new THREE.Group(); wheel.position.set(0, -0.42, 0.09); door.add(wheel);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 18), chrome, wheel, 0, 0, 0.03).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2, arm = new THREE.Group(); arm.rotation.z = a; wheel.add(arm);
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 10), chrome, arm, 0, 0.13, 0.04);
    mesh(new THREE.SphereGeometry(0.038, 12, 10), brass, arm, 0, 0.26, 0.04);
  }
  // 側面散熱條紋（裝飾）
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++)
    mesh(new RoundedBoxGeometry(0.02, 0.05, 0.9, 1, 0.01), dark, group, sx * (W / 2 + 0.005), PLINTH + 0.5 + i * 0.12, 0, false);

  /* 金幣堆（金庫右前方地上，避開送件員落點） */
  const coinGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.022, 20);
  const pile = new THREE.InstancedMesh(coinGeo, gold, MAX_COINS);
  pile.castShadow = pile.receiveShadow = true; pile.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(pile);
  const PC = new THREE.Vector3(0.55, 0, 1.15);            // 堆的中心（local）
  const slots = [];
  {
    let rs = 12345; const r = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < MAX_COINS; i++) {
      // 依序由下往上：半徑隨高度收斂成小山
      const k = i / MAX_COINS, ang = i * 2.39996, rad = 0.42 * Math.sqrt(1 - k) * Math.sqrt((i % 13 + 1) / 13);
      const y = 0.011 + k * 0.5 * (1 - rad / 0.5) + r() * 0.012;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5));
      slots.push({ p: new THREE.Vector3(PC.x + Math.cos(ang) * rad * 1.15, y, PC.z + Math.sin(ang) * rad * 0.9), q });
    }
    slots.sort((a, b) => a.p.y - b.p.y);
  }
  let shownCoins = 0, targetCoins = 0;
  const tmpS = new THREE.Vector3(), tmpM = new THREE.Matrix4();
  function writePile() {
    const full = Math.floor(shownCoins), frac = shownCoins - full;
    for (let i = 0; i < MAX_COINS; i++) {
      const sc = i < full ? 1 : i === full ? frac : 0;
      tmpS.setScalar(Math.max(sc, 1e-4));
      pile.setMatrixAt(i, tmpM.compose(slots[i].p, slots[i].q, tmpS));
    }
    pile.count = Math.min(MAX_COINS, full + 1);
    pile.instanceMatrix.needsUpdate = true;
  }
  writePile();

  /* 噴出粒子池（金幣／紅色碎片各一組 InstancedMesh） */
  function pool(geo, mat) {
    const im = new THREE.InstancedMesh(geo, mat, P_MAX); im.castShadow = true; im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(im);
    const ps = Array.from({ length: P_MAX }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }));
    for (let i = 0; i < P_MAX; i++) im.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
    return { im, ps };
  }
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.2 });
  const P = { gold: pool(new THREE.CylinderGeometry(0.06, 0.06, 0.016, 16), gold), red: pool(new THREE.TetrahedronGeometry(0.06), shardMat) };
  function emit(positive) {
    const pl = positive ? P.gold : P.red; let n = 18;
    for (const q of pl.ps) {
      if (q.on || n <= 0) continue; n--;
      q.on = true; q.life = 0;
      q.p.set((Math.random() - 0.5) * 0.6, H + 0.05, (Math.random() - 0.3) * 0.4);
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 1.4;
      q.v.set(Math.cos(a) * sp * 0.8, 3.6 + Math.random() * 1.6, Math.abs(Math.sin(a)) * sp + 0.6);   // 偏向正面
      q.r.set(Math.random() * 6, Math.random() * 6, 0);
      q.w.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 16);
    }
  }
  const tq = new THREE.Quaternion(), tp = new THREE.Vector3();
  function stepParticles(dt) {
    for (const pl of [P.gold, P.red]) {
      let any = false;
      pl.ps.forEach((q, i) => {
        if (!q.on) return;
        any = true; q.life += dt;
        q.v.y -= GRAV * dt; q.p.addScaledVector(q.v, dt);
        const floorY = 0.012;
        if (q.p.y < floorY) {                                       // 落地彈一下再躺平
          q.p.y = floorY;
          if (Math.abs(q.v.y) > 0.8) { q.v.y *= -0.35; q.v.x *= 0.6; q.v.z *= 0.6; q.w.multiplyScalar(0.5); }
          else { q.v.set(0, 0, 0); q.w.set(0, 0, 0); q.r.x = q.r.z = 0; }
        }
        q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
        const fade = q.life > 1.6 ? Math.max(0, 1 - (q.life - 1.6) / 0.5) : 1;
        if (fade <= 0) { q.on = false; pl.im.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); return; }
        tp.setScalar(fade);
        pl.im.setMatrixAt(i, tmpM.compose(q.p, tq.setFromEuler(q.r), tp));
      });
      if (any) pl.im.instanceMatrix.needsUpdate = true;
    }
  }

  /* 動畫狀態 */
  let spin = 0, spinBoost = 0, shake = 0, glowPulse = 0;
  const labelAnchor = new THREE.Object3D(); labelAnchor.position.set(0, 2.9, 0); group.add(labelAnchor);
  const dropPoint = new THREE.Vector3(7.2, 0, 1.7);

  function setAmount(sum) {
    const v = Number(sum) || 0;
    targetCoins = Math.max(0, Math.min(MAX_COINS, v / PER_COIN));
    if (RM) { shownCoins = targetCoins; writePile(); }
  }
  function hit(positive) {
    if (RM) { dial.rotation.z -= Math.PI * 2 / 10; return; }
    spinBoost = Math.PI * 2; shake = 0.45; glowPulse = 1;
    emit(!!positive);
  }
  function update(t, dt) {
    if (RM) return;
    dt = Math.min(dt || 0.016, 0.05);
    // 轉盤：慢轉＋hit 時快轉一圈
    const fast = spinBoost > 0 ? Math.min(spinBoost, dt * Math.PI * 2 / 0.6) : 0;
    spinBoost -= fast; spin += dt * 0.25 + fast;
    dial.rotation.z = -spin;
    wheel.rotation.z = -spin * 0.15;
    // 門震
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      const k = shake / 0.45;
      hinge.rotation.y = DOOR_OPEN - Math.sin(t * 60) * 0.035 * k - 0.05 * k;
      group.position.x = 7.2 + Math.sin(t * 75) * 0.012 * k;
    } else { hinge.rotation.y = DOOR_OPEN; group.position.x = 7.2; }
    // 縫隙金光
    glowPulse = Math.max(0, glowPulse - dt * 1.2);
    gapLight.intensity = 0.8 + 0.25 * Math.sin(t * 1.8) + 2.2 * glowPulse;
    // 金幣堆平滑增減
    if (Math.abs(targetCoins - shownCoins) > 0.01) { shownCoins += (targetCoins - shownCoins) * Math.min(1, dt * 3); writePile(); }
    stepParticles(dt);
  }

  return { group, labelAnchor, dropPoint, setAmount, hit, update };
}
