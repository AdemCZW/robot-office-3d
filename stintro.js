// 80 年代主題：片頭字卡動畫（playIntro）＋整頁介面樣式（applyHud）
// 全部 CSS／SVG／Canvas，不用圖片檔；字型只從 Google Fonts（OFL）動態載入，載不到退回 Georgia。
const RED = "#cb1d29", RED_DK = "#590505", BLACK = "#0a0a0f";
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Gloock&family=VT323&display=swap";
const TITLE_FONT = `"Gloock", "Songti TC", "Noto Serif TC", Georgia, "Times New Roman", serif`;
const MONO_FONT = `"VT323", ui-monospace, Menlo, monospace`;

function ensureFonts() {
  if (!document.getElementById("st-fonts")) {
    const pre = document.createElement("link");
    pre.rel = "preconnect"; pre.href = "https://fonts.gstatic.com"; pre.crossOrigin = "";
    const l = document.createElement("link");
    l.id = "st-fonts"; l.rel = "stylesheet"; l.href = FONT_HREF;
    document.head.append(pre, l);
  }
}
// 等字型最多 ms 毫秒；逾時就用退回字型照常播
function waitFonts(ms = 1500) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.race([
    Promise.all([document.fonts.load(`400 80px "Gloock"`), document.fonts.load(`400 20px "VT323"`)]).catch(() => {}),
    new Promise(r => setTimeout(r, ms)),
  ]);
}

const INTRO_CSS = `
.sti{position:absolute;inset:0;z-index:50;background:${BLACK};overflow:hidden;cursor:pointer;
  display:grid;place-items:center;font-family:${TITLE_FONT};user-select:none;-webkit-user-select:none}
.sti *{box-sizing:border-box}
.sti-vig{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse at 50% 50%,rgba(89,5,5,.35) 0%,rgba(10,10,15,0) 45%,rgba(0,0,0,.85) 100%)}
.sti-cam{position:relative;transform-origin:50% 46%;will-change:transform}
.sti-glow{filter:drop-shadow(0 0 1px ${RED}) drop-shadow(0 0 6px rgba(203,29,41,.85)) drop-shadow(0 0 18px ${RED_DK}) drop-shadow(0 0 40px rgba(89,5,5,.9))}
.sti-title{display:flex;flex-direction:column;align-items:center;line-height:.8;letter-spacing:.01em}
.sti-l{display:flex;align-items:flex-end;white-space:nowrap}
.sti-c{display:inline-block;color:transparent;-webkit-text-stroke:var(--sw) ${RED};will-change:transform}
.sti-c.big{font-size:1.32em;line-height:.8}
.sti-l2{position:relative;margin-top:.02em}
.sti-mid{position:relative;display:flex;align-items:flex-end;padding:.1em .06em .08em}
.sti-bar{position:absolute;left:0;right:0;height:var(--bw);background:${RED};transform-origin:50% 50%;transform:scaleX(0)}
.sti-bar.t{top:0} .sti-bar.b{bottom:0}
.sti-sub{text-align:center;margin-top:.55em;font:400 .2em/1 ${MONO_FONT};letter-spacing:.6em;padding-left:.6em;color:${RED};opacity:0;
  text-shadow:0 0 6px rgba(203,29,41,.9),0 0 16px ${RED_DK}}
.sti-grain{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.11;mix-blend-mode:screen}
.sti-skip{position:absolute;right:14px;bottom:10px;font:16px/1 ${MONO_FONT};color:rgba(203,29,41,.6);letter-spacing:.12em;pointer-events:none}
`;

function injectIntroCss() {
  if (document.getElementById("st-intro-css")) return;
  const s = document.createElement("style"); s.id = "st-intro-css"; s.textContent = INTRO_CSS;
  document.head.appendChild(s);
}

/**
 * 在 container 上蓋一層全黑字卡，播完（或被跳過）後移除並 resolve。
 * @param {HTMLElement} container
 * @param {{reducedMotion?:boolean,title?:string[],subtitle?:string}} opts
 */
export async function playIntro(container, { reducedMotion = false, title = ["NIGHT", "SHIFT"], subtitle = "THE OFFICE" } = {}) {
  if (!container) return;
  ensureFonts(); injectIntroCss();
  if (getComputedStyle(container).position === "static") container.style.position = "relative";

  const root = document.createElement("div");
  root.className = "sti"; root.setAttribute("role", "img");
  root.setAttribute("aria-label", title.join(" ") + (subtitle ? " — " + subtitle : ""));
  const W = container.clientWidth || 800, H = container.clientHeight || 450;
  const fs = Math.min(W * 0.086, H * 0.2);       // 字級跟著舞台寬度
  root.style.fontSize = fs + "px";
  root.style.setProperty("--sw", Math.max(1.2, fs * 0.022) + "px");
  root.style.setProperty("--bw", Math.max(1.5, fs * 0.028) + "px");

  const cam = document.createElement("div"); cam.className = "sti-cam";
  const glow = document.createElement("div"); glow.className = "sti-glow";
  const tt = document.createElement("div"); tt.className = "sti-title";
  const letters = [];
  const mk = (ch, big) => { const s = document.createElement("span"); s.className = "sti-c" + (big ? " big" : ""); s.textContent = ch; letters.push(s); return s; };

  const [w1 = "", w2 = ""] = title;
  const l1 = document.createElement("div"); l1.className = "sti-l";
  [...w1].forEach((ch, i, a) => l1.appendChild(mk(ch, i === 0 || i === a.length - 1)));
  tt.appendChild(l1);
  const bars = [];
  if (w2) {
    const l2 = document.createElement("div"); l2.className = "sti-l sti-l2";
    const ch2 = [...w2];
    if (ch2.length > 2) {
      l2.appendChild(mk(ch2[0], true));
      const mid = document.createElement("div"); mid.className = "sti-mid";
      ch2.slice(1, -1).forEach(c => mid.appendChild(mk(c, false)));
      const bt = document.createElement("i"); bt.className = "sti-bar t";
      const bb = document.createElement("i"); bb.className = "sti-bar b";
      mid.append(bt, bb); bars.push(bt, bb);
      l2.appendChild(mid);
      l2.appendChild(mk(ch2[ch2.length - 1], true));
    } else ch2.forEach(c => l2.appendChild(mk(c, true)));
    tt.appendChild(l2);
  }
  glow.appendChild(tt);
  cam.appendChild(glow);
  const sub = document.createElement("div"); sub.className = "sti-sub"; sub.textContent = subtitle || "";
  if (subtitle) cam.appendChild(sub);

  const vig = document.createElement("div"); vig.className = "sti-vig";
  const grain = document.createElement("canvas"); grain.className = "sti-grain";
  const skip = document.createElement("div"); skip.className = "sti-skip"; skip.textContent = "CLICK / ANY KEY ▸ SKIP";
  root.append(vig, cam, grain, skip);
  container.appendChild(root);

  await waitFonts();

  // ---- 顆粒（小 canvas 放大，約 24fps 重畫）----
  const gctx = grain.getContext("2d");
  grain.width = 360; grain.height = Math.max(200, Math.round(360 * H / W));
  const img = gctx.createImageData(grain.width, grain.height);
  let raf = 0, lastG = 0;
  const drawGrain = t => {
    if (t - lastG > 42) {
      lastG = t; const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = v; d[i + 1] = v * .55 | 0; d[i + 2] = v * .5 | 0; d[i + 3] = 255; }
      gctx.putImageData(img, 0, 0);
      // 光暈抖動：亮度與光暈半徑隨機起伏
      const f = 0.82 + Math.random() * 0.18 + (Math.random() < 0.04 ? -0.25 : 0);
      glow.style.opacity = f.toFixed(3);
    }
    raf = requestAnimationFrame(drawGrain);
  };

  const anims = [];
  const A = (el, kf, o) => { const a = el.animate(kf, { fill: "both", ...o }); anims.push(a); return a; };
  let total;

  if (reducedMotion) {
    bars.forEach(b => (b.style.transform = "scaleX(1)"));
    sub.style.opacity = "1";
    grain.style.display = "none";
    total = 1500;
    A(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  } else {
    raf = requestAnimationFrame(drawGrain);
    total = 7600;
    // 1) 鏡頭：從極近（看到字母局部）慢慢拉遠
    A(cam, [
      { transform: "scale(7) translate(4%, 3%)", offset: 0 },
      { transform: "scale(3.2) translate(1%, 1%)", offset: 0.35 },
      { transform: "scale(1.35)", offset: 0.75 },
      { transform: "scale(1)", offset: 1 },
    ], { duration: 6400, easing: "cubic-bezier(.33,0,.25,1)" });
    // 2) 字母從四周滑進定位（各自錯開）
    const n = letters.length;
    letters.forEach((s, i) => {
      const side = i % 4, d = 2.2 + (i * 37 % 10) / 6;           // 決定從哪邊、多遠進來
      const ang = (i * 2.399) % (Math.PI * 2);
      const dx = (side === 0 ? -1 : side === 1 ? 1 : Math.cos(ang)) * d;
      const dy = (side === 2 ? -1 : side === 3 ? 1 : Math.sin(ang) * .6) * d * .7;
      A(s, [
        { transform: `translate(${dx}em, ${dy}em)`, opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: "translate(0,0)", opacity: 1 },
      ], { duration: 3600 + (i / n) * 1400, delay: 150 + ((i * 5) % n) * 90, easing: "cubic-bezier(.2,.6,.25,1)" });
    });
    // 3) 上下兩條細橫線往兩側長出
    bars.forEach((b, k) => A(b, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 1600, delay: 3900 + k * 150, easing: "cubic-bezier(.5,0,.2,1)" }));
    // 4) 副標
    if (subtitle) A(sub, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 5400 });
    // 淡入
    A(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 });
  }

  // ---- 跳過與結束 ----
  return new Promise(resolve => {
    let done = false, timer = 0;
    const finish = (fadeMs) => {
      if (done) return; done = true;
      clearTimeout(timer);
      root.removeEventListener("pointerdown", onSkip);
      window.removeEventListener("keydown", onSkip, true);
      const out = root.animate([{ opacity: getComputedStyle(root).opacity }, { opacity: 0 }], { duration: fadeMs, fill: "forwards", easing: "ease-in" });
      out.onfinish = () => {
        cancelAnimationFrame(raf); anims.forEach(a => a.cancel());
        root.remove(); resolve();
      };
    };
    const onSkip = e => { if (e.type === "keydown") e.preventDefault(); finish(350); };
    root.addEventListener("pointerdown", onSkip);
    window.addEventListener("keydown", onSkip, true);
    timer = setTimeout(() => finish(reducedMotion ? 400 : 900), total);
  });
}

/* ---------------- 整頁 HUD 樣式 ---------------- */
// 小雜訊用內嵌 SVG（data URI，非圖片檔）
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .4 0 0 0 0 .4 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// :not(#_) 讓選擇器多一個 id 權重，蓋過 index.html 既有的 body.st #theme 等規則
const HUD_CSS = `
body.st{
  --bg:${BLACK}; --card:rgba(22,10,12,.88); --ink:#f1dcd2; --ink-2:rgba(241,220,210,.6); --sep:rgba(203,29,41,.32);
  --pos:#7dffa0; --neg:#ff5a5f; --tint:${RED};
  --font:"VT323",ui-monospace,Menlo,"PingFang TC",monospace;
  --num:"VT323",ui-monospace,Menlo,monospace;
  --st-title:${TITLE_FONT};
  background:radial-gradient(ellipse at 50% -10%,#2a0607 0%,#14060a 38%,${BLACK} 75%) fixed,${BLACK};
  color:var(--ink); font-size:18px;
}
body.st::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background-image:${NOISE};opacity:.07;mix-blend-mode:screen}
body.st main{position:relative;z-index:1}
body.st h1{font:700 30px/1.1 var(--st-title);letter-spacing:.04em;color:#ff4d57;
  text-shadow:0 0 2px ${RED},0 0 10px rgba(203,29,41,.8),0 0 24px ${RED_DK}}
body.st header .note{font-family:var(--num);font-size:19px;color:var(--ink-2);letter-spacing:.03em}
body.st header a{font-family:var(--num);font-size:19px;color:${RED};text-shadow:0 0 6px rgba(203,29,41,.6);text-decoration:none;border-bottom:1px dashed rgba(203,29,41,.5)}
body.st .ctl button:not(#_){
  font:400 19px/1 var(--num);letter-spacing:.08em;text-transform:uppercase;
  color:#ff6a6f;background:linear-gradient(#1a1214,#0d0a0c);border-radius:4px;padding:9px 16px 8px;
  border:1px solid #2a1c1e;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -2px 0 rgba(0,0,0,.6),0 0 0 1px ${RED},0 0 10px rgba(203,29,41,.45),0 3px 0 #050405;
  text-shadow:0 0 6px rgba(203,29,41,.8);transition:box-shadow .15s,color .15s,transform .05s}
body.st .ctl button:not(#_):hover{color:#ffb3b5;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 0 0 1px #ff3b45,0 0 16px rgba(203,29,41,.7),0 3px 0 #050405}
body.st .ctl button:not(#_):active{transform:translateY(2px);color:#fff;
  background:linear-gradient(#2a0a0d,#170507);
  box-shadow:inset 0 0 14px rgba(203,29,41,.7),0 0 0 1px #ff3b45,0 0 26px rgba(203,29,41,.95),0 1px 0 #050405;text-shadow:0 0 10px #ff3b45}
body.st .ctl button:not(#_):focus-visible{outline:1px dashed #ff6a6f;outline-offset:4px}
body.st .ctl button:not(#_):disabled{opacity:.4;box-shadow:0 0 0 1px ${RED_DK}}
body.st .ctl .hint{font-family:var(--num);font-size:18px;color:rgba(241,220,210,.5)}
body.st #stage{background:#120809;box-shadow:0 0 0 1px ${RED_DK},0 0 0 4px #0d0a0c,0 0 0 5px rgba(203,29,41,.5),0 0 40px rgba(89,5,5,.7),0 20px 60px rgba(0,0,0,.6)}
body.st #stage .msg{color:${RED};font:22px var(--num);letter-spacing:.1em;text-shadow:0 0 8px rgba(203,29,41,.7)}
/* 名牌 */
body.st .tag:not(#_){background:rgba(8,5,6,.92);color:#f1dcd2;border-radius:3px;padding:3px 8px 2px;
  font:400 15px/1.05 var(--num);letter-spacing:.04em;
  box-shadow:0 0 0 1px ${RED},0 0 10px rgba(203,29,41,.55),0 0 22px rgba(89,5,5,.7),inset 0 0 8px rgba(89,5,5,.6)}
body.st .tag:not(#_) b{font-size:15px;font-weight:400;color:#ff8a8e;text-shadow:0 0 5px rgba(203,29,41,.8)}
body.st .tag:not(#_) .p{font-size:17px;font-weight:400}
body.st .tag:not(#_) .p.pos{color:#7dffa0;text-shadow:0 0 6px rgba(125,255,160,.55)}
body.st .tag:not(#_) .p.neg{color:#ff5a5f;text-shadow:0 0 6px rgba(255,90,95,.7)}
body.st .tag:not(#_) .p.mut{color:#9a8a88}
body.st .tag:not(#_) .w{border-radius:2px;font-weight:400;font-size:14px;background:#3a2200;color:#ffc46b;box-shadow:0 0 0 1px #d97706}
body.st .tag:not(#_) .w.red{background:#3a0508;color:#ff8a8e;box-shadow:0 0 0 1px ${RED},0 0 8px rgba(203,29,41,.7)}
body.st .tag.on:not(#_){outline:1px solid #ff6a6f;outline-offset:2px}
/* 金庫 */
body.st .vtag:not(#_){background:rgba(6,4,5,.94);color:#c9a9a4;border-radius:4px;padding:6px 16px 8px;
  font:400 17px/1.1 var(--num);letter-spacing:.14em;text-transform:uppercase;
  box-shadow:0 0 0 1px ${RED},0 0 0 3px #0d0a0c,0 0 0 4px rgba(203,29,41,.45),0 0 26px rgba(203,29,41,.5),inset 0 0 18px rgba(89,5,5,.8)}
body.st .vtag:not(#_) b{font:400 34px/1 var(--num);letter-spacing:.06em;color:#7dffa0;text-shadow:0 0 8px rgba(125,255,160,.6)}
body.st .vtag:not(#_) b.neg{color:#ff5a5f;text-shadow:0 0 8px rgba(255,90,95,.75)}
body.st .pop{font:400 32px var(--num);text-shadow:0 0 8px currentColor,0 0 2px #000}
/* 資訊卡、表格、圖例 */
body.st .info,body.st details{background:var(--card);border-radius:4px;box-shadow:0 0 0 1px rgba(203,29,41,.45),0 0 18px rgba(89,5,5,.5)}
body.st .info h2,body.st summary{font:400 22px/1.2 var(--st-title);color:#ff6a6f;letter-spacing:.03em;text-shadow:0 0 8px rgba(203,29,41,.6)}
body.st .info dt{font-size:16px;text-transform:uppercase;letter-spacing:.06em}
body.st .info dd{font:400 24px var(--num)}
body.st table{font-size:18px} body.st th{color:#ff6a6f;font-weight:400;text-transform:uppercase;letter-spacing:.06em}
body.st .legend{font-size:17px}
body.st .legend i{border-radius:1px;box-shadow:0 0 6px currentColor}

/* 顛倒世界：冷藍灰、霓虹變暗紅、偶爾整頁閃紅 */
body.st.upside{
  --bg:#141c26; --card:rgba(28,42,58,.86); --ink:#c9d4e0; --ink-2:rgba(201,212,224,.55); --sep:rgba(59,80,104,.6); --tint:#8e1820;
  background:radial-gradient(ellipse at 50% 0%,#3b5068 0%,#1c2a3a 45%,#0c1219 100%) fixed,#141c26;
}
body.st.upside::before{opacity:.12;mix-blend-mode:overlay}
body.st.upside h1{color:#a3262e;text-shadow:0 0 6px rgba(142,24,32,.6),0 0 18px #3a0306}
body.st.upside .ctl button:not(#_){color:#b8434b;background:linear-gradient(#1f2b38,#121a23);border-color:#2e3e50;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 0 1px #6e1218,0 0 8px rgba(89,5,5,.6),0 3px 0 #0a0f15;text-shadow:0 0 5px rgba(142,24,32,.7)}
body.st.upside .ctl button:not(#_):active{background:linear-gradient(#2a1418,#1a0b0e);box-shadow:inset 0 0 12px rgba(142,24,32,.7),0 0 0 1px #8e1820,0 0 20px rgba(142,24,32,.8)}
body.st.upside #stage{box-shadow:0 0 0 1px #3b5068,0 0 0 4px #121a23,0 0 0 5px rgba(110,18,24,.6),0 0 40px rgba(28,42,58,.9),0 20px 60px rgba(0,0,0,.6)}
body.st.upside .tag:not(#_){background:rgba(18,26,36,.92);color:#c9d4e0;box-shadow:0 0 0 1px #6e1218,0 0 10px rgba(89,5,5,.6),inset 0 0 8px rgba(28,42,58,.8)}
body.st.upside .tag:not(#_) b{color:#c06a70}
body.st.upside .vtag:not(#_){background:rgba(14,20,28,.94);color:#8ea0b4;box-shadow:0 0 0 1px #6e1218,0 0 0 3px #121a23,0 0 0 4px rgba(59,80,104,.7),0 0 24px rgba(89,5,5,.6)}
body.st.upside .info h2,body.st.upside summary,body.st.upside th{color:#b8434b}
body.st.upside .info,body.st.upside details{box-shadow:0 0 0 1px rgba(110,18,24,.6),0 0 18px rgba(12,18,25,.8)}
body.st.upside::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:9998;background:rgba(203,29,41,.32);opacity:0;mix-blend-mode:screen;
  animation:st-hud-flash 11s steps(1,end) infinite}
@keyframes st-hud-flash{
  0%,61%{opacity:0} 61.4%{opacity:.9} 61.9%{opacity:0} 62.6%{opacity:.55} 63.2%{opacity:0}
  88%{opacity:0} 88.4%{opacity:.7} 89%{opacity:0} 100%{opacity:0}}
@media (prefers-reduced-motion:reduce){body.st.upside::after{animation:none;opacity:0}}
`;

/**
 * 注入（on:true）或移除（on:false）<style id="st-hud">。樣式只在 body.st（及 body.upside）時生效。
 * 注意：不會替 body 加減 class；主題開關仍由 setTheme／setUpside 負責。
 */
export function applyHud(body = document.body, { on = true } = {}) {
  const doc = (body && body.ownerDocument) || document;
  let s = doc.getElementById("st-hud");
  if (!on) { if (s) s.remove(); return; }
  ensureFonts();
  if (!s) { s = doc.createElement("style"); s.id = "st-hud"; }
  s.textContent = HUD_CSS;
  doc.head.appendChild(s);   // 每次都移到 head 最後，確保排在 index.html 內嵌樣式之後
}
