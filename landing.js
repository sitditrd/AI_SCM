/* =========================================================
   TWL SmartBPO — 랜딩 페이지 스크립트
   (실시간 KPI 스트립 + 히어로 항로 애니메이션 + 카운트업)
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    initLiveStrip();
    initHeroCanvas();
    initCounters();
  });

  /* ---------- 실시간 KPI 스트립 ---------- */
  var tick = 1;
  function renderStrip(first) {
    var s = window.TWDATA.getState(tick).snapshot;
    var el;
    el = document.getElementById('lsTpfs');
    if (el) {
      if (first) window.TWUI.countUp(el, s.tpfs, { dec: 1 });
      else el.textContent = window.TWUI.fmt(s.tpfs, 1);
    }
    el = document.getElementById('lsCritical');
    if (el) {
      if (first) window.TWUI.countUp(el, s.criticalPorts, { suffix: '개' });
      else el.textContent = window.TWUI.fmt(s.criticalPorts, 0) + '개';
    }
    el = document.getElementById('lsRisk');
    if (el) el.textContent = s.globalRisk;
    el = document.getElementById('lsDelay');
    if (el) {
      if (first) window.TWUI.countUp(el, s.avgDelayHours, { dec: 1, suffix: 'h' });
      else el.textContent = window.TWUI.fmt(s.avgDelayHours, 1) + 'h';
    }
  }
  function initLiveStrip() {
    if (!window.TWDATA) return;
    renderStrip(true);
    setInterval(function () { tick += 1; renderStrip(false); }, 45000);
  }

  /* ---------- Why TWL 카운터 ---------- */
  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var el = en.target;
          window.TWUI.countUp(el, parseFloat(el.getAttribute('data-count')), {
            suffix: el.getAttribute('data-suffix') || ''
          });
          io.unobserve(el);
        }
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 히어로 항로 애니메이션 ---------- */
  function initHeroCanvas() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas || !window.TWDATA) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var ctx = canvas.getContext('2d');
    var routes = [];
    var ports = window.TWDATA.getState(0).ports;

    function project(lat, lng, w, h) {
      return { x: ((lng + 180) / 360) * w, y: ((90 - lat) / 180) * h * 1.35 - h * 0.1 };
    }
    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      canvas.width = r.width * (window.devicePixelRatio || 1);
      canvas.height = r.height * (window.devicePixelRatio || 1);
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      buildRoutes(r.width, r.height);
    }
    function buildRoutes(w, h) {
      routes = [];
      var majors = ports.filter(function (p) { return p.berthed > 25; });
      for (var i = 0; i < 14; i++) {
        var a = majors[(i * 3) % majors.length];
        var b = majors[(i * 7 + 5) % majors.length];
        if (a === b) continue;
        var pa = project(a.lat, a.lng, w, h);
        var pb = project(b.lat, b.lng, w, h);
        routes.push({
          a: pa, b: pb,
          mid: { x: (pa.x + pb.x) / 2, y: Math.min(pa.y, pb.y) - Math.abs(pa.x - pb.x) * 0.18 - 24 },
          t: (i * 0.13) % 1, speed: 0.0012 + (i % 5) * 0.0004
        });
      }
    }
    function bez(p0, p1, p2, t) {
      var mt = 1 - t;
      return {
        x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
      };
    }
    function draw() {
      var w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
      ctx.clearRect(0, 0, w, h);
      routes.forEach(function (r) {
        /* 경로 */
        ctx.beginPath();
        ctx.moveTo(r.a.x, r.a.y);
        ctx.quadraticCurveTo(r.mid.x, r.mid.y, r.b.x, r.b.y);
        ctx.strokeStyle = 'rgba(124, 181, 245, 0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
        /* 이동 점 */
        r.t += r.speed;
        if (r.t > 1) r.t = 0;
        var p = bez(r.a, r.mid, r.b, r.t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(158, 197, 244, 0.85)';
        ctx.fill();
        /* 항만 점 */
        [r.a, r.b].forEach(function (q) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(124, 181, 245, 0.5)';
          ctx.fill();
        });
      });
      requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(draw);
  }
})();
