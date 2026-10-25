// Feedback loop: berapa lama video "menyusul" posisi gulir setelah tiap lompatan.
// node scrub-check.js <dir> [kbps=6000] ; exit 1 bila ada lompatan > LIMIT ms (merah)
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const dir = path.resolve(process.argv[2]), kbps = +(process.argv[3] || 6000), LIMIT = 1100; // 600 ms tunggu scrub GSAP + <=500 ms decode software (2 vCPU, Chromium headless)
const STARTS = [0, 50, 108.333333]; // awal tiap bagian di versi lama; versi baru hanya punya 1 video

// Server statis dengan HTTP Range (seperti GitHub Pages)
const srv = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, type = { ".html": "text/html", ".mp4": "video/mp4", ".js": "text/javascript", ".webp": "image/webp" }[path.extname(f)] || "application/octet-stream";
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (!m) { res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" }); return fs.createReadStream(f).pipe(res); }
  const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1;
  res.writeHead(206, { "Content-Type": type, "Content-Length": b - a + 1, "Content-Range": `bytes ${a}-${b}/${size}`, "Accept-Ranges": "bytes" });
  fs.createReadStream(f, { start: a, end: b }).pipe(res);
}).listen(0);

(async () => {
  const port = srv.address().port, b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: kbps * 125, uploadThroughput: 1e6 });
  const t0 = Date.now();
  await p.goto(`http://localhost:${port}/`);
  await p.waitForFunction(() => window.ScrollTrigger && ScrollTrigger.getById("film"));
  const state = () => p.evaluate((STARTS) => {
    const vs = [...document.querySelectorAll(".screen video")], v = vs.find(x => x.classList.contains("on")) || vs[0];
    const st = ScrollTrigger.getById("film"), want = st.progress * 160;
    const have = (vs.length > 1 ? STARTS[vs.indexOf(v)] : 0) + v.currentTime;
    const wait = document.getElementById("screen").classList.contains("wait") || getComputedStyle(v).opacity === "0";
    return { want, have, ok: Math.abs(want - have) < 0.1 && !v.seeking && v.readyState >= 2 && !wait };
  }, STARTS);
  const settle = async (label) => {
    const s = Date.now();
    while (Date.now() - s < 20000) { const x = await state(); if (x.ok) return Date.now() - s; await p.waitForTimeout(16); }
    const x = await state(); console.log(`  ${label}: TIMEOUT want ${x.want.toFixed(2)} have ${x.have.toFixed(2)}`); return 20000;
  };
  const go = (t) => p.evaluate((t) => { const st = ScrollTrigger.getById("film"); scrollTo(0, Math.ceil(st.start + (t / 160) * (st.end - st.start))); }, t);

  await go(0.5);
  const first = await settle("first frame") + (Date.now() - t0) - 0;
  console.log(`first frame ready: ${first} ms after navigation (incl. download)`);
  // Beri waktu memuat penuh seperti penonton yang membaca hero dulu
  const jumps = [30, 22, 12, 120, 60, 155, 104.5, 104, 49.8, 50.2, 5];
  const run = async (tag) => {
    let worst = 0, back = 0;
    for (const t of jumps) { await go(t); await p.waitForTimeout(600); const ms = 600 + await settle("t=" + t); worst = Math.max(worst, ms); if (tag[0] === "a") console.log("  " + t + "s: " + ms + " ms"); }
    await go(100.4); await p.waitForTimeout(600); await settle("t=100.4");
    for (let t = 100; t > 96; t -= 0.4) { await go(t); await p.waitForTimeout(120); const x = await state(); back = Math.max(back, Math.abs(x.want - x.have)); }
    console.log(`[${tag}] worst jump ${worst} ms, backward scrub max lag ${back.toFixed(2)} s`);
    return { worst, back };
  };
  await run("during download");
  // Tunggu sampai salinan memori aktif (versi baru) atau 60 s (versi lama)
  const s0 = Date.now();
  await p.waitForFunction(() => [...document.querySelectorAll(".screen video")].some(v => v.classList.contains("on") && v.src.startsWith("blob:")), null, { timeout: 150000 }).catch(() => {});
  console.log(`full copy ready after +${Date.now() - s0} ms`);
  const { worst, back } = await run("after download");
  console.log(`worst jump ${worst} ms (limit ${LIMIT})`);
  await b.close(); srv.close();
  process.exit(worst > LIMIT || back > 0.6 ? 1 : 0);
})();
