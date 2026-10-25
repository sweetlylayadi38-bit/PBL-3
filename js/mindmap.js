(function () {
  // Garis mindmap: dari sisi simpul inti ke tepi atas tiap cabang, digambar ulang saat ukuran berubah
  var mind = document.getElementById("mind"), svg = document.getElementById("mindLines"), core = document.getElementById("mindCore");
  var branches = Array.prototype.slice.call(mind.querySelectorAll(".branch"));
  var NS = "http://www.w3.org/2000/svg";
  var paths = branches.map(function () { var p = document.createElementNS(NS, "path"); svg.appendChild(p); return p; });
  var drawn = 1;

  function layout() {
    if (getComputedStyle(svg).display === "none") return;
    var box = mind.getBoundingClientRect(), c = core.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
    var cy = c.top + c.height / 2 - box.top;
    branches.forEach(function (b, i) {
      var r = b.getBoundingClientRect();
      var left = r.left + r.width / 2 < c.left + c.width / 2;
      var x1 = (left ? c.left : c.right) - box.left;
      var x2 = (left ? r.right : r.left) - box.left;
      var y2 = r.top - box.top + 34;
      var mx = (x1 + x2) / 2;
      paths[i].setAttribute("d", "M" + x1 + " " + cy + " C" + mx + " " + cy + " " + mx + " " + y2 + " " + x2 + " " + y2);
      var len = paths[i].getTotalLength();
      paths[i].style.strokeDasharray = len;
      paths[i].style.strokeDashoffset = len * (1 - drawn);
    });
  }
  layout();
  if (window.ResizeObserver) new ResizeObserver(layout).observe(mind);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  if (!window.gsap || !window.ScrollTrigger || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Cabang "tumbuh" dari inti saat bagian mindmap masuk layar
  var prog = { v: 0 };
  drawn = 0; layout();
  gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: "#mind", start: "top 85%", end: "top 35%", scrub: 0.6 }
  }).to(prog, { v: 1, duration: 1, onUpdate: function () { drawn = prog.v; layout(); } }, 0);
})();
