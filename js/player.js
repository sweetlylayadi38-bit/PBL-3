(function () {
  var DUR = 160, SLIDE_LEN = 8, SLIDES = 20; // poster: 1 gambar per slide 8 detik
  // Tiga potongan hasil stream copy dari video asli (tanpa encode ulang, kualitas sama)
  var SEGS = [
    { src: "video/luts-bph-0.mp4", start: 0, dur: 50 },
    { src: "video/luts-bph-1.mp4", start: 50, dur: 58.333333 },
    { src: "video/luts-bph-2.mp4", start: 108.333333, dur: 51.666667 }
  ];
  var CHAPTERS = [
    { start: 0,   title: "Definisi LUTS", text: "Kumpulan gejala pengisian, pengosongan, dan pascamiksi, bukan diagnosis. Bebannya naik seiring populasi menua." },
    { start: 16,  title: "Kasus pemicu", text: "Laki-laki 71 tahun, IPSS 22, nokturia 3 sampai 4 kali per malam, volume prostat 72 mL, residu pascaberkemih 120 mL." },
    { start: 24,  title: "Klasifikasi dan derajat", text: "Gejala dibagi menurut fase berkemih. IPSS menilai derajat LUTS, dan nokturia punya empat mekanisme." },
    { start: 40,  title: "Epidemiologi", text: "Prevalensi LUTS dan BPH menurut usia, serta posisi Indonesia dibandingkan dunia." },
    { start: 80,  title: "Etiologi dan evaluasi", text: "LUTS pada laki-laki bersifat multifaktorial dan sering tidak berhubungan dengan prostat." },
    { start: 104, title: "Patogenesis BPH", text: "Jalur pembesaran prostat, komponen obstruksi statis dan dinamis, serta perubahan prostat seiring usia." },
    { start: 136, title: "Faktor risiko", text: "Faktor yang dapat dan tidak dapat dimodifikasi, lalu dipetakan pada pasien pemicu." }
  ];
  CHAPTERS.forEach(function (c, i) { c.end = i < CHAPTERS.length - 1 ? CHAPTERS[i + 1].start : DUR; });

  function fmt(t) { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
  function chapterAt(t) { for (var i = CHAPTERS.length - 1; i >= 0; i--) if (t >= CHAPTERS[i].start) return i; return 0; }

  // ---------- Bangun UI bab ----------
  var capsEl = document.getElementById("captions");
  var track = document.getElementById("railTrack");
  var labels = document.getElementById("railLabels");
  var caps = [], chaps = [], fills = [], labelEls = [];
  CHAPTERS.forEach(function (c, i) {
    var cap = document.createElement("article");
    cap.className = "cap";
    cap.innerHTML = "<h3></h3><p></p>";
    cap.querySelector("h3").textContent = c.title;
    cap.querySelector("p").textContent = c.text;
    if (i > 0) cap.setAttribute("aria-hidden", "true");
    capsEl.appendChild(cap); caps.push(cap);

    var b = document.createElement("button");
    b.type = "button"; b.className = "chap";
    b.style.setProperty("--w", c.end - c.start);
    b.setAttribute("aria-label", "Bab " + (i + 1) + ": " + c.title + ", mulai " + fmt(c.start));
    b.innerHTML = '<span class="fill"></span>';
    b.addEventListener("click", function () { jumpTo(c.start + 0.05); });
    track.appendChild(b); chaps.push(b); fills.push(b.querySelector(".fill"));

    var l = document.createElement("span");
    l.style.setProperty("--w", c.end - c.start);
    l.textContent = c.title;
    labels.appendChild(l); labelEls.push(l);
  });

  // ---------- Pemutar: video mengejar posisi gulir ----------
  // Video di-stream langsung (HTTP Range, moov di awal berkas): frame pertama muncul
  // setelah ~1 GOP terunduh, bukan setelah seluruh bagian. Selama belum ada data,
  // poster slide yang sesuai tampil di bawah video.
  var screen = document.getElementById("screen"), poster = document.getElementById("poster");
  var loadingEl = document.getElementById("loading"), loadText = document.getElementById("loadText");
  var vids = Array.prototype.slice.call(document.querySelectorAll(".screen video"));
  var live = vids.map(function () { return false; }), bad = vids.map(function () { return false; });
  var playhead = { t: 0 }; // diisi timeline GSAP; tick membacanya tiap frame
  var loadAt = Infinity; addEventListener("load", function () { loadAt = performance.now(); });
  var target = 0, active = -1, activeSince = 0, noPlay = false, seekSince = 0, bigSeek = false, shownSlide = 0, manual = false, snapUntil = 0;

  function segAt(t) { for (var i = SEGS.length - 1; i >= 0; i--) if (t >= SEGS[i].start - 1e-6) return i; return 0; }
  function localTime(i, t) { return Math.min(Math.max(t - SEGS[i].start, 0), SEGS[i].dur - 0.04); }

  vids.forEach(function (v, i) {
    v.addEventListener("loadeddata", function () { live[i] = true; });
    // ponytail: bagian lain diunduh penuh satu per satu setelah bagian aktif siap, tanpa antrean buatan sendiri
    v.addEventListener("canplaythrough", function () {
      var next = vids.filter(function (w) { return w.preload !== "auto"; })
        .sort(function (a, b) { return Math.abs(vids.indexOf(a) - active) - Math.abs(vids.indexOf(b) - active); })[0];
      if (next) { load(vids.indexOf(next)); next.preload = "auto"; } // bagian terdekat dengan yang ditonton lebih dulu
    });
    v.addEventListener("error", function () { bad[i] = true; });
  });

  // src baru dipasang saat bagian itu dibutuhkan, supaya bagian yang ditonton tidak berebut bandwidth
  // dengan bagian lain sejak awal
  function load(i) {
    if (vids[i].getAttribute("src")) return;
    vids[i].preload = "metadata";
    vids[i].src = SEGS[i].src;
  }

  // Gestur pengguna bisa membuka kembali izin play() setelah sempat diblokir
  ["pointerdown", "keydown"].forEach(function (ev) { addEventListener(ev, function () { noPlay = false; }, { passive: true }); });

  function activate(i, now) {
    if (active >= 0) { vids[active].pause(); vids[active].classList.remove("on"); }
    active = i; activeSince = now;
    vids[i].classList.add("on");
  }

  // Parkir tetangga langsung di tepi batas, supaya lintas batas langsung menampilkan frame yang benar.
  // Hanya dijalankan saat bagian aktif sudah tampil dan diam, agar tidak berebut bandwidth dengannya.
  function parkNeighbours(i) {
    [i - 1, i + 1].forEach(function (j) {
      var w = vids[j];
      if (!w || w.readyState < 1 || w.seeking) return;
      var edge = j < i ? SEGS[j].dur - 0.04 : 0;
      if (Math.abs(w.currentTime - edge) > 0.1) w.currentTime = edge;
    });
  }

  function play(v) {
    var p = v.play();
    // NotAllowedError = autoplay diblokir (Low Power Mode iOS, penghemat data): beralih ke seek saja.
    // AbortError karena pause() di tengah play() itu normal, abaikan.
    if (p && p.catch) p.catch(function (e) { if (e && e.name === "NotAllowedError") noPlay = true; });
  }

  function showSlide(s) {
    // Poster baru dipasang setelah selesai di-decode; kalau lebih dari 200 ms, poster lama disembunyikan
    // supaya tidak tampil slide yang salah terlalu lama.
    shownSlide = s;
    var url = "video/frames/s" + String(s).padStart(2, "0") + ".webp", img = new Image();
    var hide = setTimeout(function () { if (shownSlide === s) poster.hidden = true; }, 200);
    img.src = url;
    (img.decode ? img.decode() : Promise.resolve()).catch(function () {}).then(function () {
      clearTimeout(hide);
      if (shownSlide === s) { poster.src = url; poster.hidden = false; }
    });
  }

  function tick(now) {
    if (manual) return;
    // Detik-detik awal (mis. scroll dipulihkan saat reload) dan lompat lewat rel bab: selesaikan tween scrub seketika,
    // supaya playhead tidak menyapu dari 0 dan memicu seek/unduhan di bagian yang hanya dilewati.
    if (st && (now < 3000 || now < snapUntil)) { var tw = st.getTween(); if (tw && tw.isActive()) tw.progress(1); }
    // Baca langsung dari playhead: refresh ScrollTrigger bisa mengubah progres timeline tanpa memicu onUpdate
    target = playhead.t;
    paintUI(target);
    var i = segAt(target);
    if (i !== active) activate(i, now);
    // Mulai memuat video 300 ms setelah halaman selesai dimuat: scroll yang dipulihkan saat reload sudah
    // berlaku, jadi yang dimuat pertama benar-benar bagian yang ditonton (bukan bagian 1 di posisi awal)
    if (now > loadAt + 300) load(i);
    var v = vids[i], local = localTime(i, target), diff = local - v.currentTime;
    // Unduh penuh hanya bagian yang benar-benar ditonton (>600 ms, dihitung setelah halaman selesai dimuat
    // karena scroll reload baru dipulihkan sekitar saat itu), bukan yang sekadar dilewati saat gulir cepat
    if (v.preload !== "auto" && now - Math.max(activeSince, loadAt) > 600) v.preload = "auto";
    if (v.readyState >= 1) {
      if (live[i] && !noPlay && !v.seeking && diff > 0.035 && diff < 2.5) {
        // Maju sedikit: putar cepat sampai menyusul gulir, lebih halus daripada seek per frame
        var rate = Math.min(4, Math.max(0.5, diff * 3));
        if (Math.abs(v.playbackRate - rate) > 0.05) v.playbackRate = rate;
        if (v.paused) play(v);
      } else if (Math.abs(diff) <= 0.035) {
        if (!v.paused) v.pause();
        if (live[i]) parkNeighbours(i);
      } else {
        // Mundur, lompatan jauh, atau putar diblokir: seek satu per satu
        if (!v.paused) v.pause();
        if (!v.seeking) { bigSeek = Math.abs(diff) > 2.5; v.currentTime = local; }
      }
    }
    seekSince = v.seeking ? (seekSince || now) : 0;
    if (!v.seeking) bigSeek = false;
    // Poster tampil bila belum ada data, saat lompatan jauh (frame lama bisa dari bab lain), atau seek lambat
    var wait = !live[i] || (v.seeking && (bigSeek || now - seekSince > 250));
    if (wait) {
      var s = Math.min(SLIDES - 1, Math.floor(target / SLIDE_LEN));
      if (s !== shownSlide) showSlide(s);
    }
    screen.classList.toggle("wait", !!wait);
    loadingEl.classList.toggle("error", bad[i]);
    var msg = bad[i] ? "Bagian " + (i + 1) + " gagal dimuat. Muat ulang halaman." : "Memuat video";
    if (loadText.textContent !== msg) loadText.textContent = msg; // aria-live: jangan diulang tiap frame
    loadingEl.hidden = !bad[i]; // kotak hanya muncul bila gagal; saat memuat cukup poster slide
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- GSAP: satu timeline = 160 detik video ----------
  var lastChap = -1;
  function paintUI(t) {
    var c = chapterAt(t);
    if (c !== lastChap) {
      chaps.forEach(function (b, i) { b.classList.toggle("active", i === c); b.setAttribute("aria-current", i === c ? "step" : "false"); });
      labelEls.forEach(function (l, i) { l.classList.toggle("active", i === c); });
      caps.forEach(function (el, i) { if (i === c) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", "true"); });
      lastChap = c;
    }
  }

  var st = null;
  function jumpTo(t) {
    if (!st) return;
    var y = st.start + (t / DUR) * (st.end - st.start);
    snapUntil = performance.now() + 300;
    window.scrollTo({ top: Math.ceil(y), behavior: "auto" });
  }

  if (!window.gsap || !window.ScrollTrigger) {
    // Tanpa GSAP: satu video tampil dengan kontrol bawaan, lalu berlanjut ke bagian berikutnya
    manual = true;
    activate(0, 0);
    screen.classList.remove("wait"); loadingEl.hidden = true;
    vids.forEach(function (v, i) {
      v.controls = true; v.preload = "auto";
      v.addEventListener("ended", function () { if (vids[i + 1]) { activate(i + 1, 0); vids[i + 1].currentTime = 0; play(vids[i + 1]); } });
    });
    paintUI(0);
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      id: "film",
      trigger: "#film",
      start: "top top",
      end: function () { return "+=" + Math.round(window.innerHeight * 16); },
      pin: true,
      scrub: 0.5,
      invalidateOnRefresh: true
    }
  });

  // Playhead video: satu detik timeline = satu detik video
  tl.to(playhead, { t: DUR, duration: DUR }, 0);

  CHAPTERS.forEach(function (c, i) {
    tl.addLabel("bab" + (i + 1), c.start);
    // Isi rel per bab
    tl.fromTo(fills[i], { scaleX: 0 }, { scaleX: 1, duration: c.end - c.start }, "bab" + (i + 1));
    // Pergantian keterangan bab, sedikit sebelum slide berganti
    if (i > 0) {
      var y = reduce ? 0 : 14;
      tl.to(caps[i - 1], { autoAlpha: 0, y: -y, duration: 0.8, ease: "power2.in" }, "bab" + (i + 1) + "-=0.8");
      tl.fromTo(caps[i], { autoAlpha: 0, y: y }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power2.out" }, "bab" + (i + 1));
    }
  });

  st = tl.scrollTrigger;
  paintUI(0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
