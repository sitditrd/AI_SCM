/* =========================================================
   TWL SmartBPO — 랜딩 페이지 스크립트
   (실시간 KPI 스트립 + 히어로 항로 애니메이션 + 카운트업)
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    initLiveStrip();
    initFreightStrip();
    initHeroCanvas();
    initCounters();
  });

  /* ---------- 주간 해상운임지수 스트립 (freight_index 테이블) ---------- */
  function initFreightStrip() {
    var host = document.getElementById('freightStrip');
    if (!host || typeof fetch === 'undefined') return;
    var URL = 'https://kvmyiualdodcvreoqfin.supabase.co/rest/v1/freight_index' +
      '?select=index_code,route,value,pct_change,pub_date&order=pub_date.desc&limit=60';
    var KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv';
    fetch(URL, { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        if (!rows.length) return;
        var latest = rows[0].pub_date;
        rows = rows.filter(function (x) { return x.pub_date === latest; });
        function pick(code, route) {
          return rows.filter(function (x) { return x.index_code === code && x.route === route; })[0];
        }
        var items = [
          { label: 'SCFI 종합', d: pick('SCFI', 'COMPOSITE') },
          { label: 'CCFI 종합', d: pick('CCFI', 'COMPOSITE') },
          { label: 'CCFI 한국항로', d: pick('CCFI', 'KOREA') },
          { label: 'CCFI 유럽항로', d: pick('CCFI', 'EUROPE') }
        ].filter(function (i) { return i.d; });
        if (!items.length) return;
        host.innerHTML = items.map(function (i) {
          var up = i.d.pct_change > 0;
          var arrow = i.d.pct_change == null ? '' :
            ' <small style="color:' + (up ? 'var(--lv-congested)' : 'var(--lv-low)') + ';">' +
            (up ? '▲' : '▼') + Math.abs(i.d.pct_change).toFixed(2) + '%</small>';
          return '<div class="live-chip"><div class="k">' + i.label +
            '</div><div class="v">' + Number(i.d.value).toLocaleString('ko-KR') + arrow + '</div></div>';
        }).join('') +
        '<div class="live-chip"><div class="k">발표일</div><div class="v" style="font-size:14px;">' + latest + '<br><small style="color:#9db8dd;">주 1회 갱신</small></div></div>';
        host.style.display = '';
      })
      .catch(function () { /* 조회 실패 시 스트립 미표시 */ });
  }

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
    window.TWDATA.init().then(function () {
      /* 실데이터 연결 시에만 표시 — 오프라인 폴백 수치를 실시간처럼 보이지 않게 함 */
      if (window.TWDATA.getMode() !== 'supabase') {
        var strip = document.querySelector('.live-strip');
        if (strip) strip.style.display = 'none';
        return;
      }
      renderStrip(true);
      setInterval(function () {
        window.TWDATA.refreshLive().then(function () { renderStrip(false); }).catch(function () { });
      }, 45000);
    });
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
