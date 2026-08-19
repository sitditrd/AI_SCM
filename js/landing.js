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
    initClocks();
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

  /* ---------- 세계 시계 HUD — 관제탑의 심장박동(1초 갱신) ---------- */
  function initClocks() {
    var host = document.getElementById('hudClocks');
    if (!host) return;
    var ZONES = [
      ['BUSAN', 'Asia/Seoul'],
      ['SHANGHAI', 'Asia/Shanghai'],
      ['ROTTERDAM', 'Europe/Amsterdam'],
      ['NEW YORK', 'America/New_York'],
      ['LOS ANGELES', 'America/Los_Angeles']
    ];
    var fmts = ZONES.map(function (z) {
      return [z[0], new Intl.DateTimeFormat('en-GB', { timeZone: z[1], hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })];
    });
    function tick() {
      var d = new Date();
      host.innerHTML = fmts.map(function (f) {
        return '<span class="hc"><b>' + f[0] + '</b>' + f[1].format(d) + '</span>';
      }).join('');
    }
    tick();
    setInterval(tick, 1000);
  }

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

  /* ---------- 히어로 v4 — 실측 카르토그래피 관제 씬 (2026-08-19 "진짜 최선" 재작성) ----------
     ① 지도: Natural Earth 파생 실제 해안선 그리드(js/data_world.js, 1.1° 12,253셀) 점묘.
        수제 폴리곤은 데이터 미로드 시 폴백으로만 유지.
     ② 항로: 대권항로(great-circle) — 부산→LA 가 실제처럼 북태평양으로 휘어 오른다.
        투영 이음새(대서양) 교차 시 세그먼트 분할. 혜성 광점·흐름 대시는 폴리라인 위를 탄다.
     ③ 낮·밤: 태양고도 0°/-6°/-12°(시민·항해 박명) 3중 밴드 — 칼선이 아니라 새벽·황혼의 띠.
     유지: 마우스 패럴랙스·성점·기항지 라벨 금지구역·리사이즈 대응·reduced-motion·rAF 절전. */
  function initHeroCanvas() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var running = true;
    var col = {};
    function setPalette() {
      /* 관제 히어로는 테마와 무관하게 항상 다크 (2026-08-19 확정) */
      col.ink = '#9fb4d8';
      col.dot = '#dce6f5'; col.dotHi = '#7ee0ff'; col.lane = '#38c6ff'; col.laneAir = '#9be8ff';
      col.label = '#e6edf8'; col.head = '#eaf6ff';
      col.ocean1 = 'rgba(30, 70, 140, 0.22)'; col.ocean2 = 'rgba(18, 42, 88, 0.10)';
      col.night = 'rgba(3, 7, 20, 0.13)'; col.term = 'rgba(120, 200, 255, 0.10)';
    }
    setPalette();

    function rgba(c, a) {
      var m = /^#([0-9a-f]{6})/i.exec(c);
      if (m) { var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
      return c;
    }

    /* ── 실측 육지 그리드 디코드 (없으면 아무것도 안 그림 — 폴백은 구버전 커밋에 있음) ── */
    var WORLD = window.TWL_WORLD || null;
    var landCells = [];               /* [lat, lng] 목록 — 1회 디코드 */
    if (WORLD) {
      for (var r = 0; r < WORLD.rows; r++) {
        var bin = atob(WORLD.data[r]);
        var lat = WORLD.lat0 - (r + 0.5) * WORLD.step;
        for (var c = 0; c < WORLD.cols; c++) {
          if (bin.charCodeAt(c >> 3) & (128 >> (c & 7))) {
            landCells.push([lat, WORLD.lng0 + (c + 0.5) * WORLD.step]);
          }
        }
      }
    }

    /* ── 대권항로 레인 (기점·종점 분산 — 같은 기점 최대 2개, 스포크 금지) ── */
    var BUSAN = { lat: 35.08, lng: 129.05 };
    var LANES_SEA = [
      [35.08, 129.05, 33.73, -118.26],   /* 부산 → LA — 북태평양 대권 */
      [35.08, 129.05, 35.62, 139.78],
      [31.23, 121.49, 51.95, 4.14],      /* 상하이 → 로테르담 — 시베리아 상공 대권 */
      [1.26, 103.84, 53.54, 9.98],
      [22.31, 113.92, -33.85, 151.2],
      [40.67, -74.02, 49.49, 0.11],
      [-23.96, -46.31, 40.67, -74.02],
      [34.05, -118.2, 35.45, 139.66],
      [18.94, 72.84, 1.26, 103.84],
      [51.95, 4.14, 36.14, -5.44]
    ];
    var LANES_AIR = [
      [37.46, 126.44, 50.03, 8.56],
      [37.46, 126.44, 33.94, -118.4]
    ];
    var PORTS = [
      [35.08, 129.05, 'BUSAN', 1],
      [35.62, 139.78, 'TOKYO', 0, 10, 17],
      [31.23, 121.49, 'SHANGHAI', 0, -14, -11],
      [22.31, 113.92, 'HONG KONG', 0, 8, 14],
      [1.26, 103.84, 'SINGAPORE', 0],
      [18.94, 72.84, 'MUMBAI', 0],
      [-33.85, 151.2, 'SYDNEY', 0],
      [51.95, 4.14, 'ROTTERDAM', 0],
      [53.54, 9.98, 'HAMBURG', 0],
      [40.67, -74.02, 'NEW YORK', 0],
      [-23.96, -46.31, 'SANTOS', 0],
      [33.73, -118.26, 'LOS ANGELES', 0]
    ];

    /* 구면 보간(slerp) — 대권항로 위경도 샘플 */
    function gcPoints(aLat, aLng, bLat, bLng, n) {
      var d2r = Math.PI / 180;
      function vec(lat, lng) {
        var p = lat * d2r, l = lng * d2r;
        return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
      }
      var A = vec(aLat, aLng), B = vec(bLat, bLng);
      var dotAB = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
      var d = Math.acos(dotAB);
      var out = [];
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
        var x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
        out.push([Math.asin(z) / d2r, Math.atan2(y, x) / d2r]);
      }
      return out;
    }

    /* 아시아 중심 투영(+30° 회전, 이음새=대서양) — 지도 밴드 안 좌표 */
    var W = 0, H = 0, mH = 0;
    function project(lat, lng) {
      var fx = ((((lng + 30) % 360) + 360) % 360) / 360;
      return { x: fx * W, y: 92 + ((90 - lat) / 180) * mH * 1.42 - mH * 0.12 };
    }
    function yOfLat(lat) { return 92 + ((90 - lat) / 180) * mH * 1.42 - mH * 0.12; }

    var mapLayer = null, stars = [], routes = [], hub = null;
    var mouse = { tx: 0, ty: 0, x: 0, y: 0 };

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mH = Math.max(360, Math.min((H * 0.92 - 92) / 1.03, W * 0.42));
      buildMap(dpr);
      buildRoutes();
      drawFrame(performance.now());
    }

    function buildMap(dpr) {
      mapLayer = document.createElement('canvas');
      mapLayer.width = W * dpr; mapLayer.height = H * dpr;
      var m = mapLayer.getContext('2d');
      m.setTransform(dpr, 0, 0, dpr, 0, 0);
      hub = project(BUSAN.lat, BUSAN.lng);

      /* 심해 라디얼 — 깊이감 */
      var og = m.createRadialGradient(W * 0.62, 92 + mH * 0.5, mH * 0.1, W * 0.62, 92 + mH * 0.5, Math.max(W, mH) * 0.75);
      og.addColorStop(0, col.ocean1);
      og.addColorStop(0.55, col.ocean2);
      og.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = og; m.fillRect(0, 0, W, H);

      /* 경위선 */
      m.strokeStyle = col.ink; m.lineWidth = 1; m.globalAlpha = 0.05;
      for (var gy = 1; gy <= 3; gy++) { m.beginPath(); m.moveTo(0, H * gy / 4); m.lineTo(W, H * gy / 4); m.stroke(); }
      for (var gx = 1; gx <= 5; gx++) { m.beginPath(); m.moveTo(W * gx / 6, 0); m.lineTo(W * gx / 6, H); m.stroke(); }

      /* 실측 해안선 점묘 — 텍스트 존은 감광 */
      var dotR = Math.max(1.2, W / 1050);
      for (var i = 0; i < landCells.length; i++) {
        var pt = project(landCells[i][0], landCells[i][1]);
        if (pt.y < -6 || pt.y > H + 6) continue;
        var dB = Math.sqrt((pt.x - hub.x) * (pt.x - hub.x) + (pt.y - hub.y) * (pt.y - hub.y));
        var tz = (pt.x < W * 0.47 && pt.y > H * 0.09 && pt.y < H * 0.62) ? 0.3 : 1;
        m.beginPath();
        m.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
        m.fillStyle = dB < 60 ? col.dotHi : col.dot;
        m.globalAlpha = (dB < 60 ? 0.9 : 0.55) * tz;
        m.fill();
      }
      m.globalAlpha = 1;

      /* 성점 재생성 */
      stars = [];
      for (var s = 0; s < 70; s++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1 + 0.4, ph: Math.random() * 6.28 });
      }
    }

    /* 대권 폴리라인 → 화면 세그먼트(+이음새 분할) + 누적 길이 */
    function buildLane(def, type, idx) {
      var pts = gcPoints(def[0], def[1], def[2], def[3], 72);
      var segs = [], cur = [], total = 0, cums = [];
      var prev = null;
      for (var i = 0; i < pts.length; i++) {
        var p = project(pts[i][0], pts[i][1]);
        if (prev && Math.abs(p.x - prev.x) > W / 2) {     /* 이음새 교차 — 분할 */
          if (cur.length > 1) segs.push(cur);
          cur = [];
          prev = null;
        }
        if (prev) total += Math.sqrt((p.x - prev.x) * (p.x - prev.x) + (p.y - prev.y) * (p.y - prev.y));
        cums.push(total);
        cur.push(p);
        prev = p;
      }
      if (cur.length > 1) segs.push(cur);
      /* 평면 좌표·누적 목록 (혜성 위치 보간용 — 세그먼트 무관 전 구간) */
      var flat = [];
      prev = null;
      for (i = 0; i < pts.length; i++) flat.push(project(pts[i][0], pts[i][1]));
      var path = new Path2D();
      segs.forEach(function (sg) {
        path.moveTo(sg[0].x, sg[0].y);
        for (var k = 1; k < sg.length; k++) path.lineTo(sg[k].x, sg[k].y);
      });
      return {
        type: type, path: path, flat: flat, cums: cums, len: total,
        end: flat[flat.length - 1],
        t: type === 'air' ? 0.5 * idx : (idx * 0.13) % 1,
        speed: type === 'air' ? 0.0042 : 0.0011 + (idx % 5) * 0.00035,
        pulse: 0
      };
    }
    function buildRoutes() {
      routes = [];
      LANES_SEA.forEach(function (L, i) { routes.push(buildLane(L, 'sea', i)); });
      LANES_AIR.forEach(function (L, k) { routes.push(buildLane(L, 'air', k)); });
    }
    /* 진행률 f(0~1) → 폴리라인 위 좌표 (누적 길이 보간) */
    function pointAt(rt, f) {
      var target = rt.len * f;
      var c = rt.cums, lo = 0, hi = c.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (c[mid] < target) lo = mid + 1; else hi = mid; }
      var i1 = Math.max(1, lo), i0 = i1 - 1;
      var seg = c[i1] - c[i0] || 1;
      var u = (target - c[i0]) / seg;
      var A = rt.flat[i0], B = rt.flat[i1];
      if (Math.abs(B.x - A.x) > W / 2) return { x: B.x, y: B.y };   /* 이음새 순간이동 */
      return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u };
    }

    /* 태양 — 적위·직하경도 */
    function sunState() {
      var d = new Date();
      var doy = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
      var decl = -23.44 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180;
      var utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
      return { decl: decl, subLng: (12 - utcH) * 15 };
    }
    /* 태양고도 h(도)의 등고선 위도 — A sinφ + B cosφ = sin(h) 풀이 */
    function twilightLat(H, decl, hDeg) {
      var A = Math.sin(decl), B = Math.cos(decl) * Math.cos(H);
      var R = Math.sqrt(A * A + B * B) || 1e-9;
      var C = Math.sin(hDeg * Math.PI / 180) / R;
      if (C > 1) C = 1; if (C < -1) C = -1;
      return (Math.asin(C) - Math.atan2(B, A)) * 180 / Math.PI + 90;   /* 보정 후 위도 */
    }

    function drawFrame(now) {
      ctx.clearRect(0, 0, W, H);
      if (!mapLayer) return;
      if (!reduced) { mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06; }
      var ox = mouse.x, oy = mouse.y;

      /* 성점 */
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        ctx.beginPath();
        ctx.arc(st.x + ox * 0.2, st.y + oy * 0.2, st.r, 0, Math.PI * 2);
        ctx.fillStyle = col.ink;
        ctx.globalAlpha = reduced ? 0.18 : 0.10 + 0.14 * (Math.sin(now / 900 + st.ph) + 1) / 2;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(mapLayer, ox * 0.4, oy * 0.4, W, H);

      /* 낮·밤 — 박명 3중 밴드(0°/-6°/-12°): 칼선 대신 새벽·황혼의 부드러운 띠 */
      var sun = sunState();
      [0, -6, -12].forEach(function (alt, bi) {
        ctx.beginPath();
        var first = true;
        for (var sx = 0; sx <= W; sx += 10) {
          var lngX = ((sx / W) * 360 - 30 + 540) % 360 - 180;
          var Hh = (lngX - sun.subLng) * Math.PI / 180;
          var phi = twilightLat(Hh, sun.decl, alt) - 90;
          phi = Math.max(-89, Math.min(89, phi));
          var ty = yOfLat(phi) + oy * 0.4;
          if (first) { ctx.moveTo(sx + ox * 0.4, ty); first = false; }
          else ctx.lineTo(sx + ox * 0.4, ty);
        }
        var poleY = yOfLat(sun.decl > 0 ? -90 : 90) + oy * 0.4;
        ctx.lineTo(W + ox * 0.4, poleY);
        ctx.lineTo(ox * 0.4, poleY);
        ctx.closePath();
        ctx.fillStyle = col.night; ctx.globalAlpha = 1; ctx.fill();
        if (bi === 0) { ctx.strokeStyle = col.term; ctx.lineWidth = 1; ctx.stroke(); }
      });

      /* 대권 레인 */
      ctx.save();
      ctx.translate(ox, oy);
      routes.forEach(function (rt) {
        var laneCol = rt.type === 'air' ? col.laneAir : col.lane;
        /* 언더글로우 + 베이스 */
        ctx.strokeStyle = laneCol;
        ctx.globalAlpha = 0.06; ctx.lineWidth = 4; ctx.setLineDash([]); ctx.stroke(rt.path);
        ctx.globalAlpha = rt.type === 'air' ? 0.14 : 0.20;
        ctx.lineWidth = 1.3;
        ctx.setLineDash(rt.type === 'air' ? [3, 8] : []);
        ctx.stroke(rt.path);
        ctx.setLineDash([]);
        /* 흐름 대시 — 방향성 있는 상시 흐름 */
        if (rt.type === 'sea' && !reduced) {
          ctx.setLineDash([2.5, 10]);
          ctx.lineDashOffset = -(now / 42);
          ctx.globalAlpha = 0.32; ctx.lineWidth = 1.3;
          ctx.stroke(rt.path);
          ctx.setLineDash([]); ctx.lineDashOffset = 0;
        }

        if (!reduced) { rt.t += rt.speed; if (rt.t > 1) { rt.t = 0; rt.pulse = 1; } }

        /* 혜성 꼬리 + 광점 머리 (화살표 금지) */
        var TR = rt.type === 'air' ? 8 : 14;
        for (var i = 1; i <= TR; i++) {
          var tt = rt.t - i * (rt.type === 'air' ? 0.011 : 0.0068);
          if (tt < 0) break;
          var tp = pointAt(rt, tt);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, Math.max(0.7, 2.4 - i * 0.12), 0, Math.PI * 2);
          ctx.fillStyle = laneCol;
          ctx.globalAlpha = 0.55 * (1 - i / TR);
          ctx.fill();
        }
        var hp = pointAt(rt, rt.t);
        ctx.save();
        ctx.shadowColor = rgba(laneCol, 0.95); ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, rt.type === 'air' ? 2.2 : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = col.head; ctx.globalAlpha = 1; ctx.fill();
        ctx.restore();

        /* 도착 펄스 */
        if (rt.pulse > 0.04) {
          if (!reduced) rt.pulse *= 0.955;
          ctx.beginPath();
          ctx.arc(rt.end.x, rt.end.y, 3 + (1 - rt.pulse) * 17, 0, Math.PI * 2);
          ctx.strokeStyle = laneCol; ctx.globalAlpha = rt.pulse * 0.55; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(rt.end.x, rt.end.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = col.lane; ctx.globalAlpha = 0.7; ctx.fill();
      });
      ctx.restore();
      ctx.globalAlpha = 1;

      /* 기항지 마커 + 라벨 — 텍스트·KPI 금지구역에서는 점만 */
      ctx.font = '600 9.5px Pretendard Variable, sans-serif';
      try { ctx.letterSpacing = '1.5px'; } catch (e) { /* 미지원 */ }
      for (var pi = 0; pi < PORTS.length; pi++) {
        var pd = PORTS[pi];
        var pp = project(pd[0], pd[1]);
        var px = pp.x + ox, py = pp.y + oy;
        if (px < -20 || px > W + 20) continue;
        var inText = px < W * 0.545 && py > H * 0.06 && py < H * 0.70;
        var inStrip = py > H * 0.585 && px > W * 0.18 && px < W * 0.82;
        var quiet = inText || inStrip;
        if (pd[3]) {
          var beat = reduced ? 0.5 : (Math.sin(now / 650) + 1) / 2;
          var bA = quiet ? 0.35 : 1;
          ctx.beginPath(); ctx.arc(px, py, 7 + beat * 9, 0, Math.PI * 2);
          ctx.strokeStyle = col.dotHi; ctx.globalAlpha = 0.35 * (1 - beat * 0.6) * bA; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.save();
          if (!quiet) { ctx.shadowColor = rgba(col.dotHi, 0.9); ctx.shadowBlur = 12; }
          ctx.beginPath(); ctx.arc(px, py, quiet ? 2.8 : 3.8, 0, Math.PI * 2);
          ctx.fillStyle = col.dotHi; ctx.globalAlpha = quiet ? 0.55 : 1; ctx.fill();
          ctx.restore();
          if (!quiet) { ctx.fillStyle = col.dotHi; ctx.globalAlpha = 1; ctx.fillText(pd[2], px + 12, py + 4); }
        } else {
          ctx.beginPath(); ctx.arc(px, py, quiet ? 1.8 : 2.4, 0, Math.PI * 2);
          ctx.fillStyle = col.lane; ctx.globalAlpha = quiet ? 0.35 : 0.95; ctx.fill();
          if (!quiet) {
            ctx.fillStyle = col.label; ctx.globalAlpha = 0.95;
            var lx = px + (pd[4] != null ? pd[4] : 8);
            var ly = py + (pd[5] != null ? pd[5] : 4);
            if (lx + pd[2].length * 7 > W - 6) lx = px - 8 - pd[2].length * 7;
            ctx.fillText(pd[2], lx, ly);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      if (running) drawFrame(now);
      if (!reduced) requestAnimationFrame(loop);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) { running = ents[0].isIntersecting; }, { threshold: 0 })
        .observe(canvas.parentElement);
    }
    if (!reduced) {
      canvas.parentElement.addEventListener('mousemove', function (e) {
        var r = canvas.parentElement.getBoundingClientRect();
        mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 16;
        mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 10;
      });
      canvas.parentElement.addEventListener('mouseleave', function () { mouse.tx = 0; mouse.ty = 0; });
    }
    var lastW = 0, lastH = 0, roT = null;
    function sizeChanged() {
      var r = canvas.parentElement.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 4 && Math.abs(r.height - lastH) < 4) return;
      lastW = r.width; lastH = r.height;
      clearTimeout(roT); roT = setTimeout(resize, 120);
    }
    if (window.ResizeObserver) new ResizeObserver(sizeChanged).observe(canvas.parentElement);
    window.addEventListener('resize', function () { clearTimeout(roT); roT = setTimeout(resize, 120); });
    resize();
    if (!reduced) requestAnimationFrame(loop);
  }

})();
