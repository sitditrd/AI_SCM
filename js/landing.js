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

  /* ---------- 히어로 v3 — "부산 야간 관제 정지화면" (2026-08-19, 6각도 실측 리서치 기반) ----------
     설계 근거: Windward(런타임 애니메이션 0, 정적 합성) · 씨벤티지(단일 네이비 톤·1회 등장) ·
     Portcast(대형 아크 2개, 점선) · 토스/삼성SDS(타이포 절제·1회성 블러 등장) 실측.
     원칙: 지도는 완전 정지 비트맵. 항로는 로드 시 4개가 딱 한 번 그려진 뒤 rAF 를 영구 중단.
     스포크(한 점에서 3개 이상 방사) 금지 — 기점·종점 분산. 레이더·별·패럴랙스·트윙클 없음.
     상시 루프는 CSS 소나 핑 2개뿐(js 는 좌표만 계산). 모바일(≤768px)은 캔버스 자체를 안 만든다. */
  function initHeroCanvas() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    if (window.matchMedia('(max-width: 768px)').matches) { canvas.remove(); return; }

    var ctx = canvas.getContext('2d');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var col = { dot: '#ffffff', arc: '#5aa7f0' };

    function readTokens() {
      var cs = getComputedStyle(document.documentElement);
      var probe = document.createElement('canvas').getContext('2d');
      function ok(v) { if (!v) return null; try { probe.fillStyle = '#123456'; probe.fillStyle = v; return probe.fillStyle !== '#123456' || v.indexOf('#') === 0 ? probe.fillStyle : null; } catch (e) { return null; } }
      col.arc = ok(cs.getPropertyValue('--brand-accent-2').trim()) || col.arc;
    }
    readTokens();
    new MutationObserver(function () { readTokens(); rebuild(true); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    function rgba(c, a) {
      var m = /^#([0-9a-f]{6})/i.exec(c);
      if (m) { var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
      m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(c);
      if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')';
      return c;
    }

    /* 러프 대륙 폴리곤 [lat,lng,...] — ASCII 렌더로 실루엣 검증 완료 */
    var LAND = [
      [71,-160, 72,-140, 69,-122, 73,-95, 68,-82, 62,-64, 47,-53, 45,-65, 40,-74, 32,-80, 25,-80, 29,-90, 21,-97, 16,-95, 15,-92, 20,-105, 26,-112, 32,-117, 38,-123, 46,-124, 55,-131, 59,-140, 60,-150, 64,-166],
      [11,-72, 8,-60, 4,-51, -3,-40, -8,-35, -15,-39, -23,-41, -30,-50, -38,-58, -47,-66, -54,-69, -52,-74, -38,-73, -20,-70, -5,-81, 2,-80, 9,-77],
      [36,-9, 43,-9, 48,-5, 51,1, 57,7, 61,5, 64,11, 70,20, 71,30, 73,55, 76,80, 77,104, 73,113, 72,130, 69,160, 66,178, 62,164, 59,150, 54,137, 47,135, 43,132, 39,126, 35,120, 30,121, 27,118, 22,110, 16,108, 9,105, 2,104, 6,100, 12,100, 15,97, 20,93, 22,89, 17,83, 9,79, 7,77, 16,73, 21,69, 24,66, 25,60, 21,58, 13,43, 16,41, 21,37, 28,34, 31,33, 34,28, 36,23, 38,16, 37,11, 36,-3],
      [35,-7, 37,3, 33,11, 30,19, 31,32, 27,34, 15,40, 11,44, 3,46, -2,41, -11,40, -18,36, -26,33, -34,26, -35,19, -28,16, -17,11, -12,13, -6,12, 0,9, 5,8, 4,-2, 6,-8, 11,-16, 15,-17, 21,-17, 26,-15, 31,-10],
      [-11,131, -12,137, -11,143, -16,146, -21,149, -28,154, -33,152, -38,147, -39,140, -35,137, -32,133, -34,124, -33,118, -30,114, -25,113, -20,114, -17,122, -14,126],
      [82,-46, 81,-25, 76,-19, 70,-23, 65,-37, 60,-44, 65,-52, 71,-56, 77,-60, 80,-55],
      [45,141, 43,146, 41,142, 37,141, 34,137, 33,132, 31,130, 33,129, 36,133, 39,139, 42,140],
      [39,125, 40,127, 39,128.5, 37.5,129.3, 35.2,129.4, 34.5,127, 35,126.3, 37,126.5, 38.5,125],
      [2,109, 4,114, 6,117, 1,119, -2,116, -4,113, -3,110],
      [5,95, 3,99, -1,102, -5,105, -6,105, -3,100, 1,97],
      [-1,131, -2,137, -4,141, -7,146, -9,148, -10,143, -8,138, -5,134, -3,131],
      [58,-4, 55,-1, 52,1, 50,-4, 52,-5, 54,-4, 56,-6],
      [18,121, 16,122, 13,123, 8,126, 6,125, 9,122, 13,120, 16,120],
      [-13,49, -18,49, -24,47, -25,45, -20,44, -14,48]
    ];
    function pip(lat, lng, poly) {
      var inside = false;
      for (var i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
        var y1 = poly[i], x1 = poly[i + 1], y2 = poly[j], x2 = poly[j + 1];
        if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
      }
      return inside;
    }

    /* 항로 4개 — 기점·종점 분산(같은 기점 최대 2개). 좌표는 실제 항만. */
    var BUSAN = { lat: 35.08, lng: 129.05 };
    var ARCS_DEF = [
      { a: BUSAN, b: { lat: 33.73, lng: -118.26 }, lift: 0.10 },  /* 부산 → LA */
      { a: { lat: 31.23, lng: 121.49 }, b: { lat: 51.95, lng: 4.14 }, lift: 0.15 },  /* 상하이 → 로테르담 */
      { a: { lat: 1.26, lng: 103.84 }, b: { lat: 53.54, lng: 9.98 }, lift: 0.13 },   /* 싱가포르 → 함부르크 */
      { a: BUSAN, b: { lat: 35.62, lng: 139.78 }, lift: 0.07 }    /* 부산 → 도쿄 */
    ];

    /* 아시아 중심 투영(경도 +30° 회전, 이음새=대서양) — 지도 밴드 내부 좌표 */
    var W = 0, H = 0, mW = 0, mH = 0, offX = 0, offY = 0;
    function P(lat, lng) {
      var fx = ((((lng + 30) % 360) + 360) % 360) / 360;
      return { x: offX + fx * mW, y: offY + ((90 - lat) / 180) * mH * 1.42 - mH * 0.12 };
    }

    var staticLayer = null, arcs = [], t0 = null, done = false, rafId = null;

    function layout() {
      var r = canvas.parentElement.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return false;
      W = r.width; H = r.height;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* 지도는 우측으로 잠기게 — 좌측 30%부터 시작해 우측 뷰포트 밖까지 블리드 */
      mW = W * 0.88; offX = W * 0.30;
      mH = Math.min(H * 0.92, mW * 0.40); offY = H * 0.04;
      return true;
    }

    function buildStatic() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      staticLayer = document.createElement('canvas');
      staticLayer.width = W * dpr; staticLayer.height = H * dpr;
      var m = staticLayer.getContext('2d');
      m.setTransform(dpr, 0, 0, dpr, 0, 0);

      /* 점묘 세계지도 — 2.0° 그리드, 흰 도트, 좌측 텍스트 존은 알파 페이드로 보호 */
      var dotR = Math.max(1.0, mW / 1250);
      var fadeA = W * 0.30, fadeB = W * 0.42;        /* 이 구간에서 0→1 페이드 인 */
      var busan = P(BUSAN.lat, BUSAN.lng);
      for (var lat = 74; lat >= -56; lat -= 2.0) {
        for (var lng = -180; lng < 180; lng += 2.0) {
          var land = false;
          for (var p = 0; p < LAND.length && !land; p++) land = pip(lat, lng, LAND[p]);
          if (!land) continue;
          var pt = P(lat, lng);
          if (pt.x < fadeA - 6 || pt.x > W + 8 || pt.y < -6 || pt.y > H) continue;
          var edge = Math.max(0, Math.min(1, (pt.x - fadeA) / (fadeB - fadeA)));
          if (edge <= 0.02) continue;
          var dB = Math.sqrt((pt.x - busan.x) * (pt.x - busan.x) + (pt.y - busan.y) * (pt.y - busan.y));
          var a = (dB < 60 ? 0.38 : 0.20) * edge;
          m.beginPath();
          m.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
          m.fillStyle = col.dot;
          m.globalAlpha = a;
          m.fill();
        }
      }
      m.globalAlpha = 1;
    }

    function buildArcs() {
      arcs = ARCS_DEF.map(function (d, i) {
        var a = P(d.a.lat, d.a.lng), b = P(d.b.lat, d.b.lng);
        var span = Math.abs(a.x - b.x);
        var mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - span * d.lift - 18 };
        /* 대략적 길이(세그먼트 20개 합) — 드로우 진행 dash 계산용 */
        var len = 0, prev = a;
        for (var s = 1; s <= 20; s++) {
          var t = s / 20, mt = 1 - t;
          var q = { x: mt * mt * a.x + 2 * mt * t * mid.x + t * t * b.x,
                    y: mt * mt * a.y + 2 * mt * t * mid.y + t * t * b.y };
          len += Math.sqrt((q.x - prev.x) * (q.x - prev.x) + (q.y - prev.y) * (q.y - prev.y));
          prev = q;
        }
        return { a: a, b: b, mid: mid, len: len, delay: (i % 2) * 0.35 + Math.floor(i / 2) * 0.7 };
      });
    }

    function drawArc(r, prog) {
      var g = ctx.createLinearGradient(r.a.x, r.a.y, r.b.x, r.b.y);
      g.addColorStop(0, rgba(col.arc, 0));
      g.addColorStop(0.06, rgba(col.arc, 0.5));
      g.addColorStop(0.94, rgba(col.arc, 0.5));
      g.addColorStop(1, rgba(col.arc, 0));
      ctx.beginPath();
      ctx.moveTo(r.a.x, r.a.y);
      ctx.quadraticCurveTo(r.mid.x, r.mid.y, r.b.x, r.b.y);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([r.len * prog, 99999]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (prog >= 1) {          /* 종점 소형 도트 — 정적 마감 */
        ctx.beginPath(); ctx.arc(r.b.x, r.b.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col.arc, 0.55); ctx.fill();
      }
    }

    function ease(t) { return 1 - Math.pow(1 - t, 3); }

    function render(now) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(staticLayer, 0, 0, W, H);
      var all = true;
      for (var i = 0; i < arcs.length; i++) {
        var r = arcs[i];
        var p = done ? 1 : Math.max(0, Math.min(1, ((now - t0) / 1000 - r.delay) / 1.6));
        if (p < 1) all = false;
        if (p > 0) drawArc(r, done ? 1 : ease(p));
      }
      if (all) { done = true; return; }         /* 드로우 완료 → rAF 영구 중단(정지화면) */
      rafId = requestAnimationFrame(render);
    }

    /* 소나 핑 — CSS 애니메이션 스팬의 좌표만 계산해 배치(부산 + LA) */
    function placePings() {
      var box = document.getElementById('heroPings');
      if (!box) return;
      box.innerHTML = '';
      [BUSAN, { lat: 33.73, lng: -118.26 }].forEach(function (c, i) {
        var pt = P(c.lat, c.lng);
        if (pt.x < W * 0.34 || pt.x > W - 8) return;
        var s = document.createElement('span');
        s.style.left = pt.x + 'px';
        s.style.top = pt.y + 'px';
        if (i) s.style.animationDelay = '3.5s';
        box.appendChild(s);
      });
    }

    function rebuild(replayArcs) {
      if (!layout()) return;
      buildStatic();
      buildArcs();
      placePings();
      if (rafId) cancelAnimationFrame(rafId);
      if (reduced || (done && !replayArcs)) { done = true; render(0); return; }
      done = false; t0 = performance.now();
      render(t0);
    }

    /* KPI 스트립 비동기 로드로 히어로 높이가 변한다 — 비트맵 재구성(재드로우 애니메이션은 안 함) */
    var lastW = 0, lastH = 0, roT = null;
    function sizeChanged() {
      var r = canvas.parentElement.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 4 && Math.abs(r.height - lastH) < 4) return;
      var first = lastW === 0;
      lastW = r.width; lastH = r.height;
      clearTimeout(roT);
      roT = setTimeout(function () { rebuild(first); }, 120);
    }
    if (window.ResizeObserver) new ResizeObserver(sizeChanged).observe(canvas.parentElement);
    window.addEventListener('resize', function () { clearTimeout(roT); roT = setTimeout(function () { rebuild(false); }, 120); });
    sizeChanged();
  }

})();
