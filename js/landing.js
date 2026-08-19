/* =========================================================
   TWL SmartBPO — 랜딩 페이지 스크립트
   (실시간 KPI 스트립 + 히어로 항로 애니메이션 + 카운트업)
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    initLiveStrip();
    initFreightStrip();
    initTeuStrip();
    initWxAlert();
    initHeroCanvas();
    initCounters();
  });

  /* 언어 전환 시 JS 렌더 스트립 재번역 */
  window.addEventListener('twl:langchange', function () {
    renderFreight();
    renderTeu();
    renderWx();
    if (window.TWDATA && window.TWDATA.getMode && window.TWDATA.getMode() === 'supabase') renderStrip(false);
  });

  var DATAGO = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/datago';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* data.go.kr 응답(response.body.items.item[])에서 첫 객체 배열을 관대하게 탐색 */
  function dgItems(o, depth) {
    if (depth > 6 || o == null) return null;
    if (Array.isArray(o)) return (o.length && typeof o[0] === 'object') ? o : null;
    if (typeof o === 'object') {
      for (var k in o) {
        var f = dgItems(o[k], depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  function t(k, ko) { return (window.TWI18N && window.TWI18N.t) ? window.TWI18N.t(k, ko) : ko; }

  /* ---------- 주간 해상운임지수 스트립 (freight_index 테이블) ---------- */
  var fxItems = null, fxLatest = null;   /* 언어 전환 재렌더용 캐시 */

  function renderFreight() {
    var host = document.getElementById('freightStrip');
    if (!host || !fxItems || !fxItems.length) return;
    host.innerHTML = fxItems.map(function (i) {
      var up = i.d.pct_change > 0;
      var arrow = i.d.pct_change == null ? '' :
        ' <small style="color:' + (up ? 'var(--lv-congested)' : 'var(--lv-low)') + ';">' +
        (up ? '▲' : '▼') + Math.abs(i.d.pct_change).toFixed(2) + '%</small>';
      return '<div class="live-chip"><div class="k">' + t(i.key, i.ko) +
        '</div><div class="v">' + Number(i.d.value).toLocaleString('ko-KR') + arrow + '</div></div>';
    }).join('') +
    '<div class="live-chip"><div class="k">' + t('fx.pubdate', '발표일') + '</div><div class="v" style="font-size:14px;">' +
      fxLatest + '<br><small style="color:#9db8dd;">' + t('fx.weekly', '주 1회 갱신') + '</small></div></div>';
    host.style.display = '';
  }

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
        var defs = [
          { key: 'fx.scfi',   ko: 'SCFI 종합',     d: pick('SCFI', 'COMPOSITE') },
          { key: 'fx.ccfi',   ko: 'CCFI 종합',     d: pick('CCFI', 'COMPOSITE') },
          { key: 'fx.ccfiKr', ko: 'CCFI 한국항로', d: pick('CCFI', 'KOREA') },
          { key: 'fx.ccfiEu', ko: 'CCFI 유럽항로', d: pick('CCFI', 'EUROPE') }
        ].filter(function (i) { return i.d; });
        if (!defs.length) return;
        fxItems = defs; fxLatest = latest;
        renderFreight();
      })
      .catch(function () { /* 조회 실패 시 스트립 미표시 */ });
  }

  /* ---------- 월간 컨테이너 물동량 스트립 (해수부 15059131, Edge Function datago) ----------
     주의: 응답 필드 접두사가 직관과 반대다 — e* = 수입, t* = 수출 (data.go.kr 출력결과 정의 기준).
     원천이 월 단위 배치라 최신월이 비어 있을 수 있어 최근 6개월을 조회해 실적이 있는 최신월을 쓴다. */
  var teuData = null;

  function ym(d) { return d.getFullYear() * 100 + (d.getMonth() + 1); }
  function ymLabel(v) {
    var s = String(v);
    return s.slice(0, 4) + '-' + s.slice(4, 6);
  }

  function renderTeu() {
    var host = document.getElementById('teuStrip');
    if (!host || !teuData) return;
    var imp = teuData.imp, exp = teuData.exp, tot = imp + exp;
    function chip(k, ko, val, sub) {
      return '<div class="live-chip"><div class="k">' + t(k, ko) + '</div><div class="v">' +
        Math.round(val).toLocaleString('ko-KR') +
        ' <small style="color:#9db8dd;">TEU</small>' +
        (sub ? '<br><small style="color:#9db8dd;">' + sub + '</small>' : '') + '</div></div>';
    }
    host.innerHTML =
      chip('teu.total', '월간 컨테이너 물동량', tot, t('teu.basis', '수출입 합계')) +
      chip('teu.imp', '수입', imp, '') +
      chip('teu.exp', '수출', exp, '') +
      '<div class="live-chip"><div class="k">' + t('teu.month', '기준월') + '</div><div class="v" style="font-size:14px;">' +
        ymLabel(teuData.ym) + '<br><small style="color:#9db8dd;">' + t('teu.src', '해수부 · 월 1회 공표') + '</small></div></div>';
    host.style.display = '';
  }

  function initTeuStrip() {
    var host = document.getElementById('teuStrip');
    if (!host || typeof fetch === 'undefined') return;
    var now = new Date();
    var from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    var p = new URLSearchParams({ api: 'teuimpexp', numOfRows: '200', sym: String(ym(from)), eym: String(ym(now)) });
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) return;
        var items = res.data ? dgItems(res.data, 0) : null;
        if (!items || !items.length) return;
        /* 실적이 있는 가장 최근 월만 합산 (지역별 행이 여러 개) */
        var latest = items.reduce(function (a, x) { return Math.max(a, Number(x.useYm) || 0); }, 0);
        if (!latest) return;
        var rows = items.filter(function (x) { return Number(x.useYm) === latest; });
        var imp = 0, exp = 0;
        rows.forEach(function (x) {
          imp += Number(x.eContnTeuTotal) || 0;   /* e* = 수입 */
          exp += Number(x.tContnTeuTotal) || 0;   /* t* = 수출 */
        });
        if (!imp && !exp) return;
        teuData = { ym: latest, imp: imp, exp: exp };
        renderTeu();
      })
      .catch(function () { /* 조회 실패 시 스트립 미표시 */ });
  }

  /* ---------- 기상특보 티커 (기상청 15000415, Edge Function datago) ----------
     stnId=108(전국)로 최근 발표 특보를 받아 제목만 노출한다. 특보가 없으면 티커 자체를 숨긴다. */
  var wxItems = null;

  function renderWx() {
    var host = document.getElementById('wxAlert');
    if (!host || !wxItems || !wxItems.length) return;
    host.innerHTML =
      '<div class="live-chip" style="display:block; padding:10px 14px; border-left:3px solid var(--lv-congested);">' +
      '<div class="k" style="margin-bottom:4px;">⚠ ' + t('wx.alert', '기상특보') +
      ' <small style="color:#9db8dd;">' + t('wx.src', '기상청 · 전국') + '</small></div>' +
      wxItems.map(function (x) {
        return '<div class="v" style="font-size:13px; font-weight:500; line-height:1.5;">' + esc(x) + '</div>';
      }).join('') + '</div>';
    host.style.display = '';
  }

  function initWxAlert() {
    var host = document.getElementById('wxAlert');
    if (!host || typeof fetch === 'undefined') return;
    var p = new URLSearchParams({ api: 'wthrwarn', numOfRows: '3', stnId: '108' });
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) return;
        var items = res.data ? dgItems(res.data, 0) : null;
        if (!items) return;
        /* 제목에서 "[특보] 제08-5호 : " 머리말을 떼고 본문만 남긴다 */
        wxItems = items.slice(0, 2).map(function (x) {
          return String(x.title || '').replace(/^\[[^\]]*\]\s*[^:]*:\s*/, '').trim();
        }).filter(Boolean);
        if (!wxItems.length) { wxItems = null; return; }
        renderWx();
      })
      .catch(function () { /* 조회 실패 시 티커 미표시 */ });
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
      if (first) window.TWUI.countUp(el, s.criticalPorts, { suffix: t('unit.ports', '개') });
      else el.textContent = window.TWUI.fmt(s.criticalPorts, 0) + t('unit.ports', '개');
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

  /* ---------- 히어로 항로 애니메이션 — 부산 허브 관제 씬 (2026-08-19 전면 개편) ----------
     세계 항로가 부산에서 방사형으로 뻗는 구도(태웅 거점 서사).
     해상 루트: 그라데이션 궤적(꼬리 감쇠) + 진행방향 회전 선수 글리프 + 도착 펄스 링.
     항공 루트: 높은 아치·빠른 속도·점선으로 구분. 배경에 옅은 경위선(관제 그리드).
     색은 CSS 토큰을 읽어 테마 전환에 즉시 대응. reduced-motion 은 정적 1프레임만. */
  function initHeroCanvas() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas || !window.TWDATA) return;

    var ctx = canvas.getContext('2d');
    var routes = [];
    var ports = window.TWDATA.getState(0).ports;
    var HUB = { lat: 35.08, lng: 129.05 };            /* 부산 */
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var running = true;
    var col = { sea: '#5aa7f0', air: '#8ec5f4', ink: '#9fb4d8' };

    /* CSS 토큰 → 캔버스 색. color-mix 등 캔버스가 못 읽는 값이면 폴백 유지 */
    function readTokens() {
      var cs = getComputedStyle(document.documentElement);
      var probe = document.createElement('canvas').getContext('2d');
      function ok(v) { if (!v) return null; try { probe.fillStyle = '#000'; probe.fillStyle = v; return probe.fillStyle !== '#000000' || /^#0{3,8}$/.test(v.replace(/\s/g, '')) ? probe.fillStyle : null; } catch (e) { return null; } }
      col.sea = ok(cs.getPropertyValue('--brand-accent').trim()) || col.sea;
      col.air = ok(cs.getPropertyValue('--brand-accent-2').trim()) || col.air;
      col.ink = ok(cs.getPropertyValue('--muted').trim()) || col.ink;
    }
    new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    readTokens();

    function project(lat, lng, w, h) {
      /* 부산 중심 회전 투영 — 허브가 화면 62% 지점에 오도록 경도를 돌린다.
         유럽·중동은 왼쪽, 미주는 오른쪽으로 갈라져 방사형 구도가 화면을 고루 쓴다. */
      var fx = ((((lng - HUB.lng) / 360) + 0.62) % 1 + 1) % 1;
      return { x: fx * w, y: ((90 - lat) / 180) * h * 1.35 - h * 0.1 };
    }
    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      canvas.width = r.width * (window.devicePixelRatio || 1);
      canvas.height = r.height * (window.devicePixelRatio || 1);
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      buildRoutes(r.width, r.height);
      if (reduced) drawFrame(performance.now());   /* 정적 1프레임 */
    }
    function buildRoutes(w, h) {
      routes = [];
      var hub = project(HUB.lat, HUB.lng, w, h);
      /* 부산에서 먼 순으로 주요 항만을 뽑아 방사형 배치 — 화면을 고루 쓰게 한다 */
      var majors = ports.filter(function (p) { return p.berthed > 22 && Math.abs(p.lng - HUB.lng) > 6; })
        .sort(function (a, b) { return Math.abs(b.lng - HUB.lng) - Math.abs(a.lng - HUB.lng); });
      var seaN = Math.min(11, majors.length);
      for (var i = 0; i < seaN; i++) {
        var p = majors[(i * 5 + 2) % majors.length];
        var pb = project(p.lat, p.lng, w, h);
        var rise = Math.abs(hub.x - pb.x) * 0.16 + 26;
        routes.push({
          type: 'sea', a: hub, b: pb,
          mid: { x: (hub.x + pb.x) / 2, y: Math.min(hub.y, pb.y) - rise },
          t: (i * 0.17) % 1, speed: 0.0011 + (i % 5) * 0.00035, pulse: 0
        });
      }
      /* 항공 2편 — 가장 먼 두 곳으로, 높은 아치 */
      for (var k = 0; k < 2 && k < majors.length; k++) {
        var q = majors[k], qb = project(q.lat, q.lng, w, h);
        routes.push({
          type: 'air', a: hub, b: qb,
          mid: { x: (hub.x + qb.x) / 2, y: Math.min(hub.y, qb.y) - Math.abs(hub.x - qb.x) * 0.30 - 42 },
          t: 0.5 * k, speed: 0.0042, pulse: 0
        });
      }
      routes.hub = hub;
    }
    function bez(p0, p1, p2, t) {
      var mt = 1 - t;
      return { x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
               y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y };
    }

    function drawFrame(now) {
      var w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
      ctx.clearRect(0, 0, w, h);

      /* 옅은 경위선 — 관제 화면 질감 */
      ctx.strokeStyle = col.ink; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.05;
      [0.28, 0.55, 0.82].forEach(function (fy) {
        ctx.beginPath(); ctx.moveTo(0, h * fy); ctx.lineTo(w, h * fy); ctx.stroke();
      });
      [0.16, 0.38, 0.62, 0.84].forEach(function (fx) {
        ctx.beginPath(); ctx.moveTo(w * fx, 0); ctx.lineTo(w * fx, h); ctx.stroke();
      });

      routes.forEach(function (r) {
        /* 항로 베이스 */
        ctx.beginPath();
        ctx.moveTo(r.a.x, r.a.y);
        ctx.quadraticCurveTo(r.mid.x, r.mid.y, r.b.x, r.b.y);
        ctx.strokeStyle = r.type === 'air' ? col.air : col.sea;
        ctx.globalAlpha = r.type === 'air' ? 0.10 : 0.13;
        ctx.setLineDash(r.type === 'air' ? [3, 8] : []);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        if (!reduced) { r.t += r.speed; if (r.t > 1) { r.t = 0; r.pulse = 1; } }

        /* 궤적 꼬리 — 뒤로 갈수록 잦아드는 점열 */
        var TR = r.type === 'air' ? 8 : 14;
        for (var i = 1; i <= TR; i++) {
          var tt = r.t - i * (r.type === 'air' ? 0.011 : 0.0075);
          if (tt < 0) break;
          var tp = bez(r.a, r.mid, r.b, tt);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, Math.max(0.6, 2.1 - i * 0.11), 0, Math.PI * 2);
          ctx.fillStyle = r.type === 'air' ? col.air : col.sea;
          ctx.globalAlpha = 0.5 * (1 - i / TR);
          ctx.fill();
        }

        /* 선수/기수 글리프 — 진행 방향 회전 */
        var p = bez(r.a, r.mid, r.b, r.t);
        var p2 = bez(r.a, r.mid, r.b, Math.min(1, r.t + 0.012));
        var ang = Math.atan2(p2.y - p.y, p2.x - p.x);
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(ang);
        ctx.fillStyle = r.type === 'air' ? col.air : col.sea;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        if (r.type === 'air') { ctx.moveTo(5.5, 0); ctx.lineTo(-3.5, 3); ctx.lineTo(-1.5, 0); ctx.lineTo(-3.5, -3); }
        else { ctx.moveTo(5, 0); ctx.lineTo(-4, 2.8); ctx.lineTo(-4, -2.8); }
        ctx.closePath(); ctx.fill();
        ctx.restore();

        /* 도착 펄스 링 */
        if (r.pulse > 0.04) {
          if (!reduced) r.pulse *= 0.955;
          ctx.beginPath();
          ctx.arc(r.b.x, r.b.y, 3 + (1 - r.pulse) * 15, 0, Math.PI * 2);
          ctx.strokeStyle = r.type === 'air' ? col.air : col.sea;
          ctx.globalAlpha = r.pulse * 0.5;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        /* 목적항 노드 */
        ctx.beginPath();
        ctx.arc(r.b.x, r.b.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = col.sea;
        ctx.globalAlpha = 0.55;
        ctx.fill();
      });

      /* 부산 허브 — 이중 링 + 상시 맥동 + 라벨 */
      var hub = routes.hub;
      if (hub) {
        var beat = reduced ? 0.5 : (Math.sin(now / 650) + 1) / 2;
        ctx.beginPath(); ctx.arc(hub.x, hub.y, 6 + beat * 8, 0, Math.PI * 2);
        ctx.strokeStyle = col.air; ctx.globalAlpha = 0.28 * (1 - beat * 0.6); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.arc(hub.x, hub.y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = col.air; ctx.globalAlpha = 0.95; ctx.fill();
        ctx.font = '700 9px Pretendard Variable, sans-serif';
        ctx.fillStyle = col.ink; ctx.globalAlpha = 0.85;
        ctx.fillText('BUSAN', hub.x + 9, hub.y + 3);
      }
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      if (running) drawFrame(now);
      if (!reduced) requestAnimationFrame(loop);
    }
    /* 히어로가 화면 밖이면 그리지 않는다 — 스크롤 후 CPU 절약 */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) { running = ents[0].isIntersecting; }, { threshold: 0 })
        .observe(canvas.parentElement);
    }
    window.addEventListener('resize', resize);
    resize();
    if (!reduced) requestAnimationFrame(loop);
  }

})();
