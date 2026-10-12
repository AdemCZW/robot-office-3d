// 氛圍特效（80 年代底片感 ↔ 顛倒世界）。後製：Render → 加上選擇性 Bloom（半解析度，只有自發光物）→ Output（色調映射＋sRGB）→ Retro（調色／顆粒／掃描線／暗角／色差／紅閃）。
// 介面：createFx({ THREE, scene, camera, renderer, reducedMotion })
//   -> { update(t, dt), render(), resize(w, h), setMode("normal"|"upside"), flash(), dispose(), mode }
// render() 取代 renderer.render(scene, camera)；CSS2D 標籤照舊由 main.js 另外 render（不會吃到顆粒與調色）。
// 燈光閃爍只在 render() 期間暫時乘上倍率、畫完立刻還原，不會改到其他模組設定的 intensity。
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const ROOM = { x0: -8, x1: 10, y0: 0, y1: 4, z0: -6, z1: 7 };
const UPSIDE = { fog: 0x2e3a4c, near: 7, far: 34 };     // 顛倒世界的霧（藍灰）
const SPORES = 1100;

const RetroShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: null },
    uTime: { value: 0 },
    uUpside: { value: 0 },     // 0 = 80 年代暖色、1 = 顛倒世界
    uFlash: { value: 0 },      // 紅色閃電 0..1
    uGrain: { value: 0.045 },
    uScan: { value: 0.035 },
    uVig: { value: 0.32 },
    uChroma: { value: 0.0016 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uUpside, uFlash, uGrain, uScan, uVig, uChroma;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      // 色差：越靠邊越明顯
      vec2 off = d * uChroma * (1.0 + 6.0 * r2) * (1.0 + uFlash * 2.0);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // 80 年代底片：偏暖、微褪色（黑位抬起帶暖、輕微降飽和、壓高光）
      vec3 warm = mix(vec3(l), c, 0.86) * vec3(1.06, 1.0, 0.88);
      warm = warm * 0.9 + vec3(0.055, 0.035, 0.02);
      warm = mix(warm, warm * warm * (3.0 - 2.0 * warm), 0.25);   // 一點 S 曲線
      // 顛倒世界：大幅降飽和、冷藍灰、壓暗、對比低
      vec3 cold = mix(vec3(l), c, 0.32) * vec3(0.78, 0.9, 1.08);
      cold = cold * 0.7 + vec3(0.025, 0.04, 0.065);
      c = mix(warm, cold, uUpside);
      // 紅色閃電：整個畫面瞬間偏紅
      c = mix(c, vec3(0.796, 0.114, 0.161) * (l * 1.4 + 0.25) + vec3(0.349, 0.02, 0.02) * 0.3, uFlash * 0.75);   // #cb1d29 霓虹紅、#590505 暗紅
      // 掃描線＋暗角＋顆粒
      c *= 1.0 - uScan * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159));
      c *= 1.0 - (uVig + uUpside * 0.18) * smoothstep(0.08, 0.5, r2);
      float n = hash(floor(gl_FragCoord.xy) + fract(uTime * 7.31) * 913.7) - 0.5;
      c += n * (uGrain + uUpside * 0.02) * (1.0 - 0.5 * l);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createFx({ THREE, scene, camera, renderer, reducedMotion = false }) {
  const RM = !!reducedMotion;
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();

  /* ---------- 後製管線 ----------
     選擇性 bloom：另用半解析度畫一張「只有自發光」的圖（非發光物換成黑色遮擋、透明物與粒子先藏起來），
     模糊後加回主畫面。白天受光的牆面在 HDR 下比燈泡還亮，用亮度門檻分不開，所以改用材質判斷。 */
  const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), { type: THREE.HalfFloatType, samples: 4 });
  const bloomRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const bloomComposer = new EffectComposer(renderer, bloomRT);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.9, 0.55, 0);
  bloomComposer.addPass(bloom);

  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const mix = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, tBloom: { value: bloomComposer.renderTarget2.texture }, uAmt: { value: 1 } },
    vertexShader: RetroShader.vertexShader,
    fragmentShader: "uniform sampler2D tDiffuse, tBloom; uniform float uAmt; varying vec2 vUv;\n" +
      "void main() { gl_FragColor = texture2D(tDiffuse, vUv) + uAmt * vec4(texture2D(tBloom, vUv).rgb, 0.0); }",
  }), "tDiffuse");
  composer.addPass(mix);
  composer.addPass(new OutputPass());
  const retro = new ShaderPass(RetroShader);
  retro.uniforms.uRes.value = new THREE.Vector2(size.x * pr, size.y * pr);
  composer.addPass(retro);

  // 發光判斷：MeshStandard/Physical 的 emissive×強度夠亮；或 userData.bloom = true（佈景模組可自行標記）；
  // MeshBasicMaterial 只有標記了才算（窗景遮罩、天空也是 Basic，不能亮）。其餘不透明物 → 黑色遮擋；透明物 → 不畫。
  const BLACK = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  const glowMats = new Map();   // 原材質 -> 發光替身
  const GLOW_MIN = 0.5;
  function glowOf(m, o) {
    if (!m || m.visible === false) return m;
    const tagged = (o.userData && o.userData.bloom) || (m.userData && m.userData.bloom);
    let col = null, map = null;
    if (m.emissive) {
      const e = m.emissive, k = m.emissiveIntensity ?? 1, mx = Math.max(e.r, e.g, e.b) * k;
      if (mx >= GLOW_MIN || (tagged && mx > 0)) { col = e; map = m.emissiveMap; }
    } else if (m.isMeshBasicMaterial && tagged) { col = m.color; map = m.map; }
    if (!col) return (m.transparent || m.opacity < 1) ? null : BLACK;
    let g = glowMats.get(m);
    if (!g) { g = new THREE.MeshBasicMaterial({ fog: false }); glowMats.set(m, g); }
    g.color.copy(col).multiplyScalar(m.emissive ? (m.emissiveIntensity ?? 1) : 1);
    if (g.map !== (map || null)) { g.map = map || null; g.needsUpdate = true; }
    g.side = m.side; g.transparent = !!m.transparent; g.opacity = m.opacity;
    return g;
  }
  const swapped = [], hidden = [];
  function renderBloom() {
    scene.traverseVisible(o => {
      if (o === spores || o.isPoints || o.isSprite || o.isLine) { hidden.push(o); return; }
      if (!o.isMesh) return;
      const m = o.material;
      const r = Array.isArray(m) ? m.map(x => glowOf(x, o) || BLACK) : glowOf(m, o);
      if (r === null) { hidden.push(o); return; }
      swapped.push(o, m); o.material = r;
    });
    hidden.forEach(o => { o.visible = false; });
    const bg = scene.background, fog = scene.fog, au = renderer.shadowMap.autoUpdate;
    scene.background = null; scene.fog = null; renderer.shadowMap.autoUpdate = false;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    bloomComposer.render();
    renderer.setClearColor(cc, ca);
    scene.background = bg; scene.fog = fog; renderer.shadowMap.autoUpdate = au;
    for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
    hidden.forEach(o => { o.visible = true; });
    swapped.length = 0; hidden.length = 0;
  }
  function setSizes(w, h, p) {
    composer.setPixelRatio(p); composer.setSize(w, h);
    bloomComposer.setPixelRatio(p); bloomComposer.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));   // bloom 半解析度
    mix.uniforms.tBloom.value = bloomComposer.renderTarget2.texture;
    retro.uniforms.uRes.value.set(w * p, h * p);
    sporeMat.uniforms.uScale.value = h * p * 0.5;
  }

  /* ---------- 紅色閃電燈（常駐、平時 0；不切 visible，避免燈數改變觸發 shader 重編譯） ---------- */
  const redLight = new THREE.DirectionalLight(0xcb1d29, 0);
  redLight.position.set(-4, 12, 6); redLight.target.position.set(1, 0, 0);
  scene.add(redLight, redLight.target);

  /* ---------- 孢子粒子：一個 Points＋ShaderMaterial，漂浮在 GPU 算（CPU 每格只改 uTime） ---------- */
  const W = ROOM.x1 - ROOM.x0, H = ROOM.y1 - ROOM.y0, D = ROOM.z1 - ROOM.z0;
  const base = new Float32Array(SPORES * 3), ph = new Float32Array(SPORES * 4);
  for (let i = 0; i < SPORES; i++) {
    base[i * 3] = ROOM.x0 + Math.random() * W; base[i * 3 + 1] = ROOM.y0 + Math.random() * H; base[i * 3 + 2] = ROOM.z0 + Math.random() * D;
    // 相位、晃動速度、上飄速度、大小
    ph[i * 4] = Math.random() * 6.283; ph[i * 4 + 1] = 0.15 + Math.random() * 0.35; ph[i * 4 + 2] = 0.04 + Math.random() * 0.1; ph[i * 4 + 3] = 0.5 + Math.random();
  }
  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute("position", new THREE.BufferAttribute(base, 3));
  sporeGeo.setAttribute("aPh", new THREE.BufferAttribute(ph, 4));
  const sporeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uScale: { value: 450 }, uSize: { value: 0.11 },
      uColor: { value: new THREE.Color(0xc8d0d8) }, uY0: { value: ROOM.y0 }, uH: { value: H } },
    vertexShader: /* glsl */`
      attribute vec4 aPh; uniform float uTime, uScale, uSize, uY0, uH; varying float vA;
      void main() {
        vec3 p = position; float t = uTime;
        p.x += sin(t * aPh.y + aPh.x) * 0.35 + sin(t * 0.07 + aPh.x * 1.7) * 0.6;
        p.y = uY0 + mod(p.y - uY0 + t * aPh.z + sin(t * aPh.y * 1.3 + aPh.x) * 0.12, uH);   // 慢慢往上飄，到頂從地板回來
        p.z += cos(t * aPh.y * 0.8 + aPh.x) * 0.35;
        float yy = (p.y - uY0) / uH;
        vA = smoothstep(0.0, 0.08, yy) * (1.0 - smoothstep(0.9, 1.0, yy)) * (0.55 + 0.45 * sin(t * 0.9 + aPh.x * 3.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * aPh.w * uScale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.15, 1.0, r)) * vA * uAlpha;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const spores = new THREE.Points(sporeGeo, sporeMat);
  spores.frustumCulled = false; spores.visible = false; spores.renderOrder = 10;
  scene.add(spores);
  setSizes(size.x, size.y, pr);

  /* ---------- 霧／背景：保留原值，切回 normal 完全還原 ---------- */
  const orig = { fog: scene.fog, background: scene.background };
  const origFogColor = orig.fog && orig.fog.color ? orig.fog.color.clone() : (orig.background && orig.background.isColor ? orig.background.clone() : new THREE.Color(0xe9e1d6));
  let origNear = orig.fog && orig.fog.isFog ? orig.fog.near : 30, origFar = orig.fog && orig.fog.isFog ? orig.fog.far : 60;
  const myFog = new THREE.Fog(origFogColor.clone(), origNear, origFar);
  const myBg = new THREE.Color();
  const upFog = new THREE.Color(UPSIDE.fog);
  let fogOwned = false;
  function applyAtmos(k) {   // k: 0 normal → 1 upside
    if (k <= 0.0001) {
      if (fogOwned) { scene.fog = orig.fog; scene.background = orig.background; fogOwned = false; }
      return;
    }
    if (!fogOwned) {   // 進入前再記一次（main.js 可能在建立後才改 fog／background）
      orig.fog = scene.fog; orig.background = scene.background;
      if (orig.fog && orig.fog.color) origFogColor.copy(orig.fog.color);
      else if (orig.background && orig.background.isColor) origFogColor.copy(orig.background);
      if (orig.fog && orig.fog.isFog) { origNear = orig.fog.near; origFar = orig.fog.far; }
      fogOwned = true;
    }
    myFog.color.copy(origFogColor).lerp(upFog, k);
    myFog.near = origNear + (UPSIDE.near - origNear) * k; myFog.far = origFar + (UPSIDE.far - origFar) * k;
    scene.fog = myFog;
    if (!orig.background || orig.background.isColor) { myBg.copy(orig.background && orig.background.isColor ? orig.background : origFogColor).lerp(upFog, k); scene.background = myBg; }
  }

  /* ---------- 燈光閃爍（倍率） ---------- */
  const flick = new Map();   // light -> { until, next, seed }
  let groupFlick = { start: -1, dur: 0, next: 3 };
  function lightsOf() { const out = []; scene.traverse(o => { if (o.isLight && o !== redLight && !o.isAmbientLight) out.push(o); }); return out; }
  let lights = [], relist = 0;
  const noise = (t, s) => 0.5 + 0.5 * Math.sin(t * 61.3 + s) * Math.sin(t * 23.7 + s * 2.1);

  /* ---------- 狀態 ---------- */
  let mode = "normal", target = 0, k = 0;        // k: 目前的顛倒程度（0..1，平滑過渡）
  let time = 0, flashStart = -99, nextBolt = 6 + Math.random() * 9;
  const flashEnv = tt => {   // 兩下閃：0–0.12 s 一下、0.2–0.5 s 第二下（較長）
    if (tt < 0 || tt > 0.75) return 0;
    const a = Math.exp(-((tt - 0.06) ** 2) / 0.003);
    const b = tt > 0.2 ? Math.exp(-(tt - 0.24) * 7) * (0.8 + 0.2 * Math.sin(tt * 90)) : 0;
    return Math.min(1, a + b);
  };

  function setMode(m) {
    mode = m === "upside" ? "upside" : "normal"; target = mode === "upside" ? 1 : 0;
    if (RM) { k = target; applyAtmos(k); }
    if (mode === "upside") nextBolt = time + 4 + Math.random() * 6;
  }
  function flash() { if (!RM) flashStart = time; }

  let lastMult = new Map();
  function update(t, dt) {
    time = t;
    if (!RM) {
      const step = Math.min(1, (dt || 0.016) / 1.4);
      k += Math.sign(target - k) * Math.min(Math.abs(target - k), step);
      retro.uniforms.uTime.value = t;
    }
    applyAtmos(k);
    retro.uniforms.uUpside.value = k;

    // 孢子
    spores.visible = k > 0.01;
    sporeMat.uniforms.uAlpha.value = 0.9 * k;
    if (!RM) sporeMat.uniforms.uTime.value = t;

    // 閃電（顛倒世界自動；normal 只在 flash() 時）
    if (!RM && mode === "upside" && k > 0.6 && t >= nextBolt) { flashStart = t; nextBolt = t + 6 + Math.random() * 9; }
    const f = RM ? 0 : flashEnv(t - flashStart);
    retro.uniforms.uFlash.value = f;
    redLight.intensity = f * 5.5;
    mix.uniforms.uAmt.value = 1 + f * 0.8;

    // 燈光倍率：顛倒世界整體壓暗＋不定時閃爍
    lastMult.clear();
    if (k <= 0.001) return;
    if (t >= relist) { lights = lightsOf(); relist = t + 1; }
    const dim = 1 - 0.45 * k;
    let gm = 1;
    if (!RM) {
      if (t >= groupFlick.next && groupFlick.start < 0 && mode === "upside") { groupFlick = { start: t, dur: 0.35 + Math.random() * 0.6, next: 0 }; }
      if (groupFlick.start >= 0) {
        const u = t - groupFlick.start;
        if (u > groupFlick.dur) groupFlick = { start: -1, dur: 0, next: t + 2.5 + Math.random() * 6 };
        else gm = 0.25 + 0.75 * (noise(t, 1.7) > 0.45 ? 1 : 0.2);
      }
    }
    for (const L of lights) {
      let m = dim * gm;
      if (!RM && (L.isPointLight || L.isSpotLight)) {   // 小燈各自偶爾抽動
        let s = flick.get(L); if (!s) flick.set(L, s = { until: 0, next: t + Math.random() * 5, seed: Math.random() * 100 });
        if (t >= s.next && mode === "upside") { s.until = t + 0.2 + Math.random() * 0.5; s.next = t + 1.5 + Math.random() * 5; }
        if (t < s.until) m *= noise(t, s.seed) > 0.5 ? 1 : 0.08;
      }
      lastMult.set(L, m);
    }
  }

  function render() {
    // 暫時套倍率 → 畫 → 還原原值（其他模組設的 intensity 不受影響）
    const saved = [];
    for (const [L, m] of lastMult) { if (m !== 1 && L.parent) { saved.push(L, L.intensity); L.intensity *= m; } }
    renderBloom();
    composer.render();
    for (let i = 0; i < saved.length; i += 2) saved[i].intensity = saved[i + 1];
  }

  function resize(w, h) {
    setSizes(w, h, renderer.getPixelRatio());
  }

  function dispose() {
    scene.fog = fogOwned ? orig.fog : scene.fog; scene.background = fogOwned ? orig.background : scene.background; fogOwned = false;
    scene.remove(spores, redLight, redLight.target);
    sporeGeo.dispose(); sporeMat.dispose();
    composer.passes.concat(bloomComposer.passes).forEach(p => p.dispose && p.dispose());
    composer.dispose(); bloomComposer.dispose();
    glowMats.forEach(g => g.dispose()); BLACK.dispose();
  }

  return { update, render, resize, setMode, flash, dispose, get mode() { return mode; } };
}
