// 公開示範版用的虛構資料（GitHub Pages 沒有本機服務）。資料結構同 server.py 的 /api/data?days=7。
// 每次呼叫浮動盈虧會小幅變動；大約每 3 次會多一筆新關單，讓送件員有東西可以送。
(function () {
  const H = 3600e3, D = 86400e3, now0 = Date.now();
  let calls = 0, extra = [];
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(20261012);
  const grids = [
    ["BTC", 12, 500, 300, 84000], ["ETH", 20, 300, 200, 2600], ["SOL", 20, 200, 200, 150], ["XRP", 25, 150, 200, 0.62],
    ["LINK", 20, 200, 150, 14.2], ["AVAX", 20, 150, 200, 27.5], ["DOGE", 25, 100, 150, 0.15],
  ];
  const marts = [["BTC", "long", 9, 21], ["BTC", "short", 3, 15], ["ETH", "short", 6, 21]];
  const base = grids.map(([c, lev, inv, ex, px], i) => ({ c, lev, inv, ex, px, p0: (rnd() - 0.45) * 40, liq: 6 + rnd() * 18, ph: rnd() * 6 }));
  const mbase = marts.map(([c, tr, ord, so], i) => ({ c, tr, ord, so, p0: (rnd() - 0.5) * 30, liq: 7 + rnd() * 10, ph: rnd() * 6 }));
  const closed = Array.from({ length: 18 }, (_, i) => ({
    grid: rnd() < 0.6, c: ["BTC", "ETH", "SOL", "LINK", "XRP", "AVAX"][Math.floor(rnd() * 6)],
    ago: (i + 0.5) * (7 * D / 18), p: Math.round((rnd() * 38 - 3) * 100) / 100, hold: (6 + rnd() * 60) * H,
  }));
  window.O3D_DEMO_DATA = function () {
    calls++; const now = Date.now(), t = (now - now0) / 60000;
    if (calls > 1 && calls % 3 === 0) extra.push({ grid: rnd() < 0.5, c: ["BTC", "ETH", "SOL"][calls % 3], ago: 0, at: now, p: Math.round((2 + rnd() * 20) * 100) / 100, hold: 20 * H });
    const bots = base.map((b, i) => {
      const profit = b.p0 + Math.sin(t / 3 + b.ph) * 4 + (rnd() - 0.5);
      return { id: "demo-g" + i, type: "futures_grid", pair: b.c + ".PERP/USDT", status: "open", created: now - (2 + i) * D, closed: null,
        invest: b.inv, extra_margin: b.ex, capital: b.inv + b.ex, leverage: b.lev, profit, realized: profit * 0.7, unrealized: profit * 0.3,
        fee: -(1 + i * 0.6), funding: -(0.3 + i * 0.1), price: b.px * (1 + Math.sin(t / 5 + b.ph) * 0.01), range_low: b.px * 0.9, range_high: b.px * 1.1,
        in_range: true, liq_gap: Math.max(3, b.liq + Math.sin(t / 4 + b.ph) * 3), known: true };
    });
    const doneG = closed.concat(extra).filter(e => e.grid).map((e, i) => {
      const cl = e.at || now - e.ago;
      return { id: "demo-gc" + i + "-" + (e.at || 0), type: "futures_grid", pair: e.c + ".PERP/USDT", status: "canceled", created: cl - e.hold, closed: cl,
        invest: 200, extra_margin: 200, capital: 400, leverage: 20, profit: e.p, fee: -1.5, funding: -0.2, known: true };
    });
    const mrows = closed.concat(extra).filter(e => !e.grid).map((e, i) => {
      const cl = e.at || now - e.ago;
      return { id: "demo-mc" + i + "-" + (e.at || 0), base: e.c, coin: "USDT", trend: i % 2 ? "short" : "long", leverage: 50, created: cl - e.hold, closed: cl,
        invest: 500, extra_margin: 500, profit: e.p, liquidated: false, reason: "手動關閉", close_price: null, fee: -2.1, funding: 0.1 };
    });
    const mart_open = mbase.map((m, i) => {
      const profit = m.p0 + Math.sin(t / 3 + m.ph) * 5;
      return { id: "demo-m" + i, base: m.c, coin: "USDT", trend: m.tr, lev: 50, created: now - (1 + i) * D, invest: 500, extra: 500, capital: 1000,
        profit, roi: profit / 5, liq_gap: Math.max(3, m.liq + Math.sin(t / 4 + m.ph) * 3), target_gap: 1.5 + i, orders: m.ord, so: m.so,
        avg: 84000, target: 86000, liq: 76000, mark: 84000 * (1 + Math.sin(t / 5) * 0.005), stale: null };
    });
    return { bots: bots.concat(doneG), mart: { rows: mrows }, mart_open, window: { days: 7 },
      fetched_at: new Date(now).toLocaleString("zh-TW", { hour12: false }).slice(0, 16) + "（示範資料）" };
  };
})();
