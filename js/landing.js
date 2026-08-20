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
    initHeroTyping();
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
  /* ── 스캔 리빌 무장 (시안 16 방식 — 2026-08-19 사용자: 바가 우측으로 쓸고 가며 글씨가 드러나는 연출) ──
     h1 내용을 .srw 로 감싸고 광선 바(.srb)를 붙인 뒤 .sr-armed 로 점화.
     클립·바 애니는 전부 CSS 동기. reduced-motion·JS 미동작·언어 전환 = 정적 완성형 */
  function initHeroTyping() {
    var h1 = document.querySelector('.hero-ops .hud-brief h1');
    if (!h1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cancelled = false;
    window.addEventListener('twl:langchange', function () {
      cancelled = true;
      h1.classList.remove('sr-armed');   /* i18n 이 innerHTML 교체 → 정적 완성형 */
    });
    setTimeout(function () {             /* i18n 초기 치환 뒤에 무장 */
      if (cancelled || !h1.isConnected) return;
      h1.innerHTML = '<span class="srw">' + h1.innerHTML + '</span><span class="srb" aria-hidden="true"></span>';
      /* 악센트 '채움' 2박자용 — ::after 클론이 attr(data-text)로 같은 글자를 그린다 */
      var acc = h1.querySelector('.srw .accent');
      if (acc) acc.setAttribute('data-text', acc.textContent);
      h1.classList.add('sr-armed');
      /* 안전망: 애니가 어떤 이유로든 멈췄더라도 최종은 반드시 선명한 그라데이션 */
      setTimeout(function () { if (h1.isConnected) h1.classList.add('sr-done'); }, 3200);
    }, 160);
  }

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
      /* 한국 금융 관례: 상승=빨강, 하락=파랑 — 클래스로 지정(인라인 color는
         #stats의 muted !important에 죽으므로 금지, 2026-08-19 사용자 지적) */
      var arrow = i.d.pct_change == null ? '' :
        ' <small class="' + (up ? 'pc-up' : 'pc-dn') + '">' +
        (up ? '▲' : '▼') + Math.abs(i.d.pct_change).toFixed(2) + '%</small>';
      return '<div class="live-chip"><div class="k">' + t(i.key, i.ko) +
        '</div><div class="v">' + Number(i.d.value).toLocaleString('ko-KR') + arrow + '</div></div>';
    }).join('') +
    '<div class="live-chip"><div class="k">' + t('fx.pubdate', '발표일') + '</div><div class="v" style="font-size:14px;">' +
      fxLatest + '<br><small class="meta-live">' + t('fx.weekly', '주 1회 갱신') + '</small></div></div>';
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
    /* 혜성·흐름·반짝임은 살아있다 — 죽인 건 마우스 패럴랙스뿐
       ("효과를 멈추지 말고 커서따라 흔들리는 것만 제어" 2026-08-19 사용자 정정) */
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var running = true;
    var col = {};
    function setPalette() {
      /* 테마별 씨 팔레트 — 라이트는 밝은 지면 위 진청 카르토그래피
         ("index 만 새까맣다" 허접함 해결 — 2026-08-19 사용자 재지적) */
      var light = false;  /* 상단 히어로는 테마 무관 항상 다크 — dash 페이지와 동일 문법(2026-08-19 사용자 확정: #stats 부터만 테마 전환) */
      if (light) {
        col.ink = '#8ba0c0';
        col.dot = '#44608a'; col.dotHi = '#0b6bc8'; col.lane = '#1d6fe0'; col.laneAir = '#4a90e0';
        col.label = '#2c4468'; col.head = '#0b4fa8';
        col.ocean1 = 'rgba(120, 160, 220, 0.25)'; col.ocean2 = 'rgba(150, 180, 230, 0.12)';
        col.night = 'rgba(40, 60, 100, 0.09)'; col.term = 'rgba(20, 90, 190, 0.18)';
      } else {
        col.ink = '#9fb4d8';
        col.dot = '#dce6f5'; col.dotHi = '#7ee0ff'; col.lane = '#38c6ff'; col.laneAir = '#9be8ff';
        col.label = '#e6edf8'; col.head = '#eaf6ff';
        col.ocean1 = 'rgba(30, 70, 140, 0.22)'; col.ocean2 = 'rgba(18, 42, 88, 0.10)';
        col.night = 'rgba(3, 7, 20, 0.13)'; col.term = 'rgba(120, 200, 255, 0.10)';
      }
    }
    setPalette();
    new MutationObserver(function () { setPalette(); resize(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

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
      [51.95, 4.14, 'ROTTERDAM', 0, -8, 16],   /* 함부르크와 11px 간격 — 좌하로 밀어 충돌 회피 */
      [53.54, 9.98, 'HAMBURG', 0, 10, -4],
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

    /* 히어로 문구를 지도의 '지리 좌표'에 앵커링한다(2026-08-20 사용자 요청).
       CSS 만으로는 해상도가 바뀔 때 문구가 대륙 위로 올라타는데, 투영식을 그대로 써서
       남태평양(대륙이 없는 해역) 좌표에 붙이면 어떤 해상도에서도 같은 바다 위에 앉는다. */
    var HUD_ANCHOR = { lat: -8, lng: -158 };

    /* 살아있는 항만 등불 (2026-08-20) — 장식용 점이 아니라 데이터가 곧 조명이다.
       Port Insight 가 매일 산출하는 중점 항만 93곳의 실제 혼잡 등급으로 색을 정하고,
       혼잡할수록 빠르게 맥동한다. 지도를 보는 것만으로 '지금 어디가 막혔는지'가 읽힌다. */
    var LIGHT_COL = { LOW: '#3ad18a', STABLE: '#f2c14e', BUSY: '#ff9a5b', CONGESTED: '#ff6b6b' };

    /* 태웅 글로벌 네트워크 (2026-08-20) — 본사 + 해외법인 소재 도시.
       원천: '태웅로직스, 계열사 설립일_v2.xlsx' 해외법인 21건을 도시 단위로 합쳤다
       (중국 3거점·우즈베키스탄/카자흐스탄 각 2법인은 도시가 같아 1개 핀). */
    var TWL_SITES = [
      /* [위도, 경도, 본사여부, 도시, 국가, [[법인명, 설립연도], ...], 주요사업, 지도표기 약칭] */
      [37.50, 127.03, 1, '서울', '대한민국', [['㈜태웅로직스 본사 (서초)', 1996], ['역삼 지사', null]], '복합화물운송주선업', 'TWL SEOUL'],
      [35.08, 129.05, 1, '부산', '대한민국', [['㈜태웅로직스 (센텀)', 1996], ['㈜세중종합물류', 1997]], '운송주선업·화물운송업', 'TWL BUSAN'],
      [35.10, 128.68, 0, '창원 진해', '대한민국', [['㈜태웅물류센터', 2021], ['㈜티앤씨부산', 2025]], '물류관련서비스', 'TWL JINHAE'],
      [35.68, 139.77, 0, '도쿄', '일본', [['TGL JAPAN CO., LTD.', 2007]], '복합운송주선업', 'TGL JAPAN'],
      [31.23, 121.49, 0, '상하이', '중국', [['TGL Shanghai Co., Ltd.', 2009]], '운송주선업', 'TGL SHANGHAI'],
      [36.07, 120.38, 0, '칭다오', '중국', [['TGL Shanghai — Qingdao Branch', 2011]], '운송주선업', 'TGL QINGDAO'],
      [22.54, 114.06, 0, '선전', '중국', [['TGL Shanghai — Shenzhen Branch', 2011]], '운송주선업', 'TGL SHENZHEN'],
      [10.78, 106.70, 0, '호치민', '베트남', [['TAEWOONG GLOBAL LOGISTICS VIETNAM', 2022]], '운송주선업', 'TGL VIETNAM'],
      [1.49, 103.74, 0, '조호바루', '말레이시아', [['Taewoong Global Logistics Sdn. Bhd.', 2011]], '운송주선업', 'TGL MALAYSIA'],
      [-6.21, 106.85, 0, '자카르타', '인도네시아', [['PT. TGL INDONESIA LOGISTICS', 2021]], '운송주선업', 'TGL JAKARTA'],
      [41.31, 69.24, 0, '타슈켄트', '우즈베키스탄', [['FE Taewoong LLC', 2019], ['FE D2C INT TRADING LLC', 2015]], '운송주선업·창고임대업', 'TGL UZBEK'],
      [43.24, 76.89, 0, '알마티', '카자흐스탄', [['TGL KAZ LOGISTICS', 2020], ['TGL KAZ LOGISTICS CENTER', 2025]], '운송주선업·창고임대업', 'TGL KAZ'],
      [55.75, 37.62, 0, '모스크바', '러시아', [['TGL RUS LLC', 2015]], '운송주선업', 'TGL RUS'],
      [41.01, 28.98, 0, '이스탄불', '튀르키예', [['TGL TURKEY LOJISTIK VE TICARET', 2025]], '운송주선업', 'TGL TURKEY'],
      [47.50, 19.04, 0, '부다페스트', '헝가리', [['TGL HUNGARY KFT', 2018]], '운송주선업', 'TGL HUNGARY'],
      [45.81, 15.98, 0, '자그레브', '크로아티아', [['LA TRANS D.O.O.', 1993]], '운송주선업', 'LA TRANS'],
      [50.14, 8.57, 0, '프랑크푸르트', '독일', [['TAEWOONG LOGISTICS GERMANY GMBH', 2023]], '운송주선업', 'TGL GERMANY'],
      [41.35, 2.16, 0, '바르셀로나', '스페인', [['TGL S. Europe S.L.U', 2022]], '운송주선업', 'TGL SPAIN'],
      [34.03, -84.20, 0, '애틀랜타', '미국', [['TGL USA INC.', 2021]], '운송주선업', 'TGL USA'],
      [4.71, -74.07, 0, '보고타', '콜롬비아', [['TGL Colombia Ltda.', 2010]], '운송주선업', 'TGL COLOMBIA'],
      [-33.45, -70.67, 0, '산티아고', '칠레', [['TGL S. A.', 2011]], '운송주선업', 'TGL CHILE'],
      [-34.60, -58.38, 0, '부에노스아이레스', '아르헨티나', [['TGL ARGENTINA S.A.U.', 2024]], '운송주선업', 'TGL ARG']
    ];
    var siteHits = [];        /* 프레임마다 갱신되는 히트박스 — 호버 판정용 */
    var siteLabelBoxes = [];  /* 이번 프레임에 실제로 찍힌 라벨 사각형 — 충돌 회피·항만 라벨 금지구역 겸용 */
    var siteLogoBoxes = [];   /* 로고가 차지한 사각형 — 라벨이 남의 로고를 덮지 않게 */
    var pendLabels = [];      /* 라벨 후보 — 로고 배치가 끝난 뒤 한 번에 판정한다 */
    function boxHits(c, arr) {
      for (var q = 0; q < arr.length; q++) {
        var o = arr[q];
        if (c.l < o.r && c.r > o.l && c.t < o.b && c.b > o.t) return true;
      }
      return false;
    }
    var hoverSite = -1;

    /* 지도에 얹을 짧은 라벨 — 법인 정식명은 툴팁이 보여주고, 지도에는 알아볼 최소 단위만 */
    /* 지도 표기 약칭 — 정식 법인명은 툴팁이 보여준다. 길면 자른다(2026-08-20 사용자: "너무 라벨명이 길면 짤라"). */
    var TAG_MAX = 12;
    function siteTag(st0) {
      var tg = st0[7] || (st0[5] && st0[5][0] ? st0[5][0][0] : '');
      tg = String(tg).toUpperCase();
      return tg.length > TAG_MAX ? tg.slice(0, TAG_MAX - 1) + '…' : tg;
    }
    var lights = null, lightTry = 0, lightAt = 0;

    /* 거점 마커용 태웅 심볼 — 캔버스에 그대로 띄운다(2026-08-20 사용자 요청:
       '계열사·지사인지 알아볼 수 있게 로고를 띄워달라'). 로드 실패해도 아래 폴백 도형이 그린다. */
    var siteLogo = new Image(), siteLogoOk = false;
    siteLogo.onload = function () { siteLogoOk = true; };
    siteLogo.src = 'assets/twl_symbol.png';
    function ensureLights(now) {
      if (lights || lightTry > 14 || (now - lightAt) < 900) return;
      lightAt = now; lightTry++;
      try {
        var st = window.TWDATA && window.TWDATA.getState && window.TWDATA.getState(0);
        var ps = st && st.ports;
        if (ps && ps.length) {
          lights = ps.filter(function (p) { return isFinite(p.lat) && isFinite(p.lng); })
            .map(function (p, i) {
              return { lat: p.lat, lng: p.lng, lv: p.level || 'LOW', ph: (i * 2.3999) % 6.2832 };
            });
        }
      } catch (e) { /* 데이터 계층이 아직 준비 전 — 다음 프레임에 재시도 */ }
    }
    var briefBox = null;      /* 배치 결과 사각형 — 라벨 금지구역이 이걸 그대로 쓴다 */

    var mapLayer = null, stars = [], routes = [], hub = null;
    /* 타이핑 완료 신호 — 부산 허브에서 파문 1회(관제망 접속 연출) */
    var heroPing = 0;
    window.addEventListener('twl:herotyped', function () { if (!reduced) heroPing = 1; });
    var mouse = { tx: 0, ty: 0, x: 0, y: 0 };

    /* 문구 블록을 앵커 좌표에 놓되, 헤더·독·화면 밖으로는 절대 나가지 않게 가둔다.
       (좌표계는 캔버스와 동일 — 둘 다 .hero-ops 기준 절대배치) */
    function placeBrief() {
      var brief = document.querySelector('.hero-ops .hud-brief');
      if (!brief || W < 10 || H < 10) return;
      if (window.matchMedia('(max-width: 900px)').matches) {
        brief.style.left = ''; brief.style.top = '';   /* 모바일은 문서 흐름으로 되돌림 */
        briefBox = null;
        return;
      }
      var bw = brief.offsetWidth, bh = brief.offsetHeight;
      if (!bw || !bh) return;
      var p = HUD_ANCHOR_PT();
      /* 하단 여유는 독 실제 높이 + 여백만 남긴다 — 값이 크면 문구가 대륙 위로 밀려 올라간다
         (2026-08-20 사용자: '지도를 가리지 않을 만큼 내려라') */
      var dockEl = document.querySelector('.hero-ops .hud-dock');
      var dockH = dockEl ? dockEl.getBoundingClientRect().height : 150;
      var padX = 26, keepTop = 96, keepBottom = Math.max(120, dockH + 16);
      var x = Math.min(Math.max(p.x, padX + bw / 2), W - padX - bw / 2);
      var y = Math.min(Math.max(p.y, keepTop + bh / 2), H - keepBottom - bh / 2);
      brief.style.left = Math.round(x) + 'px';
      brief.style.top = Math.round(y) + 'px';
      briefBox = { l: x - bw / 2, r: x + bw / 2, t: y - bh / 2, b: y + bh / 2 };
    }
    function HUD_ANCHOR_PT() { return project(HUD_ANCHOR.lat, HUD_ANCHOR.lng); }

    /* 언어를 바꾸면 문장 길이가 달라져 블록 크기가 변한다 → 재배치 */
    window.addEventListener('twl:langchange', function () { setTimeout(placeBrief, 60); });

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mH = Math.max(360, Math.min((H * 0.92 - 92) / 1.03, W * 0.42));
      placeBrief();          /* 지도 재계산 직후 문구도 같은 좌표계로 다시 앉힌다 */
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

      /* 실측 해안선 점묘 — 텍스트 존은 감광.
         감광 존은 텍스트 블록 실제 위치 기준(뷰포트 %가 아님):
         ≥1980px 는 중앙 정렬 문구(css @media 와 동기), 미만은 좌측 칼럼 (W-1200)/2 */
      var dotR = Math.max(1.2, W / 1050);
      /* 글자 뒤 감광도 레이어로 인식되어 완전 제거(2026-08-19 최종) — 지도 원본 그대로, 가독은 섭도우 전담 */
      for (var i = 0; i < landCells.length; i++) {
        var pt = project(landCells[i][0], landCells[i][1]);
        if (pt.y < -6 || pt.y > H + 6) continue;
        var dB = Math.sqrt((pt.x - hub.x) * (pt.x - hub.x) + (pt.y - hub.y) * (pt.y - hub.y));
        var tz = 1;
        m.beginPath();
        m.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
        m.fillStyle = dB < 60 ? col.dotHi : col.dot;
        m.globalAlpha = (dB < 60 ? 0.95 : 0.68) * tz;
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
        t: type === 'air' ? (0.18 + 0.37 * idx) % 1 : (0.07 + idx * 0.13) % 1,
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
        ctx.globalAlpha = 0.09; ctx.lineWidth = 4.5; ctx.setLineDash([]); ctx.stroke(rt.path);
        ctx.globalAlpha = rt.type === 'air' ? 0.20 : 0.30;
        ctx.lineWidth = 1.3;
        ctx.setLineDash(rt.type === 'air' ? [3, 8] : []);
        ctx.stroke(rt.path);
        ctx.setLineDash([]);
        /* 흐름 대시 — 방향성 있는 상시 흐름 */
        if (rt.type === 'sea' && !reduced) {
          ctx.setLineDash([2.5, 10]);
          ctx.lineDashOffset = -(now / 42);
          ctx.globalAlpha = 0.44; ctx.lineWidth = 1.4;
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
          ctx.arc(tp.x, tp.y, Math.max(0.8, 2.8 - i * 0.13), 0, Math.PI * 2);
          ctx.fillStyle = laneCol;
          ctx.globalAlpha = 0.7 * (1 - i / TR);
          ctx.fill();
        }
        var hp = pointAt(rt, rt.t);
        ctx.save();
        ctx.shadowColor = rgba(laneCol, 0.95); ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, rt.type === 'air' ? 2.4 : 3.2, 0, Math.PI * 2);
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

      /* 항만 등불 — 혼잡 등급별 색·맥동. 문구 뒤에서는 눈에 거슬리지 않게 낮춘다 */
      ensureLights(now);
      if (lights) {
        for (var li = 0; li < lights.length; li++) {
          var lg = lights[li];
          var lp = project(lg.lat, lg.lng);
          var lx = lp.x + ox, ly = lp.y + oy;
          if (lx < -8 || lx > W + 8 || ly < -8 || ly > H + 8) continue;
          var hot = lg.lv === 'CONGESTED' || lg.lv === 'BUSY';
          var beat = reduced ? 0.72
            : 0.5 + 0.5 * (Math.sin(now / (hot ? 780 : 1600) + lg.ph) + 1) / 2;
          var quietL = (briefBox && lx > briefBox.l - 10 && lx < briefBox.r + 10 &&
                        ly > briefBox.t - 8 && ly < briefBox.b + 8) ? 0.22 : 1;
          var cc = LIGHT_COL[lg.lv] || LIGHT_COL.LOW;
          ctx.save();
          ctx.shadowColor = rgba(cc, 0.85); ctx.shadowBlur = (hot ? 9 : 6) * beat;
          ctx.beginPath();
          ctx.arc(lx, ly, (hot ? 1.9 : 1.5) + beat * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = cc;
          ctx.globalAlpha = (hot ? 0.85 : 0.6) * beat * quietL;
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      /* 태웅 거점 마커 — 앵커점에서 빔이 올라가고 그 위에 회사 로고 + 법인 약칭 라벨이 떠 있다.
         부양 높이에 따라 접지 그림자가 커졌다 작아져 입체로 읽힌다(3D 모델 없이 부양+그림자만).
         siteHits 에 좌표를 남겨 마우스 호버 툴팁이 같은 위치를 집는다. */
      siteHits.length = 0;
      siteLabelBoxes.length = 0;
      siteLogoBoxes.length = 0;
      ctx.font = '600 9.5px Pretendard Variable, sans-serif';
      try { ctx.letterSpacing = '0.4px'; } catch (e) { /* 미지원 */ }
      ctx.textAlign = 'center';
      for (var si = 0; si < TWL_SITES.length; si++) {
        var st0 = TWL_SITES[si], hq = st0[2] === 1;
        var sp = project(st0[0], st0[1]);
        var sx = sp.x + ox, sy = sp.y + oy;
        if (sx < -40 || sx > W + 40 || sy < -46 || sy > H + 30) continue;
        var qz = (briefBox && sx > briefBox.l - 12 && sx < briefBox.r + 12 &&
                  sy > briefBox.t - 10 && sy < briefBox.b + 10) ? 0.2 : 1;
        var hov = (hoverSite === si);
        var lift = hq ? 19 : 15;
        var bob = reduced ? lift : lift + Math.sin(now / 1500 + si * 0.85) * 2.2;
        if (hov) bob += 3;                                   /* 호버 시 살짝 더 떠오른다 */
        var lw = (hq ? 21 : 15) * (hov ? 1.18 : 1);
        var lh = lw * (siteLogo.height || 27) / (siteLogo.width || 28);
        var cy = sy - bob - lh / 2;

        ctx.save();
        ctx.globalAlpha = 0.34 * qz * (1 - (bob - lift + 2.2) / 14);
        ctx.fillStyle = '#01040c';
        ctx.beginPath(); ctx.ellipse(sx, sy + 1, lw * 0.34, lw * 0.13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = (hov ? 0.75 : 0.5) * qz;
        var beam = ctx.createLinearGradient(sx, sy, sx, cy);
        /* 지도의 항만 라벨은 흰색, 항로는 시안이다. 태웅 거점은 따뜻한 골드(본사는 브랜드 레드)로
           계열을 완전히 갈라 '우리 조직'임이 한눈에 구분되게 한다(2026-08-20 사용자 지적) */
        beam.addColorStop(0, rgba(hq ? '#ff6a5c' : '#ffb44f', 0.6));
        beam.addColorStop(1, rgba(hq ? '#ff6a5c' : '#ffb44f', 0));
        ctx.strokeStyle = beam; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, cy + lh * 0.35); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, hq ? 2.1 : 1.6, 0, Math.PI * 2);
        ctx.fillStyle = hq ? '#ff6a5c' : '#ffb44f'; ctx.globalAlpha = 0.9 * qz; ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = qz;
        var halo = ctx.createRadialGradient(sx, cy, 0, sx, cy, lw * (hov ? 1.15 : 0.95));
        halo.addColorStop(0, rgba(hq ? '#ff6a5c' : '#ffb44f', hov ? 0.45 : 0.32));
        halo.addColorStop(1, rgba(hq ? '#ff6a5c' : '#ffb44f', 0));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(sx, cy, lw * (hov ? 1.15 : 0.95), 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = (hq ? 1 : 0.95) * qz;
        if (siteLogoOk) {
          ctx.shadowColor = 'rgba(2,6,16,.85)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
          ctx.drawImage(siteLogo, sx - lw / 2, cy - lh / 2, lw, lh);
        } else {
          ctx.beginPath(); ctx.arc(sx, cy, lw * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = hq ? '#ff5a4d' : '#ffb44f'; ctx.fill();
        }
        ctx.restore();
        siteLogoBoxes.push({ l: sx - lw / 2 - 2, r: sx + lw / 2 + 2, t: cy - lh / 2 - 2, b: cy + lh / 2 + 2 });

        /* 라벨은 자기 로고 '바로 위'에만 놓는다. 예전엔 자리가 막히면 위아래로 비켜 세웠는데,
           서울·부산·진해처럼 붙어 있는 곳에서 라벨이 옆 마커 위로 올라가 어느 법인인지
           거꾸로 헷갈리게 만들었다(2026-08-20). 자리가 없으면 접고 호버 툴팁에 맡긴다. */
        var tag = siteTag(st0);
        var tw0 = ctx.measureText(tag).width;
        pendLabels.push({
          si: si, hq: hq, qz: qz, hov: hov, tag: tag, w: tw0,
          mx: sx, my: sy, cy: cy, lw: lw, lh: lh
        });
      }

      /* 라벨 판정 — 로고가 전부 자리를 잡은 뒤라야 '남의 로고를 덮는지'를 볼 수 있다.
         본사가 배열 앞이라 자연히 우선권을 갖는다. 호버 중인 곳은 무조건 보여준다. */
      for (var pl = 0; pl < pendLabels.length; pl++) {
        var L = pendLabels[pl];
        /* 후보는 셋 다 '자기 로고에 붙은' 자리다 — 위 → 오른쪽 → 왼쪽.
           위아래로 멀리 밀지 않으므로 옆 마커의 이름으로 오독될 여지가 없다. */
        var cands = [
          { x: L.mx, y: L.cy - L.lh / 2 - 5 },
          { x: L.mx + L.lw / 2 + 5 + L.w / 2, y: L.cy + 3 },
          { x: L.mx - L.lw / 2 - 5 - L.w / 2, y: L.cy + 3 }
        ];
        var put = null;
        for (var ci = 0; ci < cands.length; ci++) {
          var cx = Math.min(Math.max(cands[ci].x, 6 + L.w / 2), W - 6 - L.w / 2), cyy = cands[ci].y;
          var bx = { l: cx - L.w / 2 - 3, r: cx + L.w / 2 + 3, t: cyy - 9, b: cyy + 3 };
          if (!boxHits(bx, siteLabelBoxes) && !boxHits(bx, siteLogoBoxes)) { put = { x: cx, y: cyy, box: bx }; break; }
        }
        if (!put && L.hov) {
          var hx = Math.min(Math.max(L.mx, 6 + L.w / 2), W - 6 - L.w / 2);
          put = { x: hx, y: L.cy - L.lh / 2 - 5, box: { l: hx - L.w / 2 - 3, r: hx + L.w / 2 + 3, t: L.cy - L.lh / 2 - 14, b: L.cy - L.lh / 2 - 2 } };
        }
        if (!put) {
          siteHits.push({ i: L.si, x: L.mx, t: L.cy - L.lh, b: L.my + 6, w: Math.max(34, L.lw + 8) });
          continue;
        }
        ctx.save();
        ctx.globalAlpha = (L.hov ? 1 : 0.9) * L.qz;
        ctx.shadowColor = 'rgba(2,6,16,.95)'; ctx.shadowBlur = 5;
        ctx.fillStyle = L.hq ? '#ffc9bf' : '#ffd79a';   /* 항만 라벨(흰색)과 대비되는 웜 톤 */
        ctx.fillText(L.tag, put.x, put.y);
        ctx.restore();
        siteLabelBoxes.push(put.box);
        siteHits.push({
          i: L.si, x: (L.mx + put.x) / 2,
          t: Math.min(put.box.t, L.cy - L.lh) - 2, b: L.my + 6,
          w: Math.max(34, L.lw + 8, Math.abs(put.x - L.mx) * 2 + L.w + 8)
        });
      }
      pendLabels.length = 0;
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;

      /* 부산 파문 — 타이핑 완료 순간 1회 확산 */
      if (heroPing > 0.02 && hub) {
        var pgR = (1 - heroPing) * 130;
        ctx.save(); ctx.translate(ox, oy);
        ctx.beginPath(); ctx.arc(hub.x, hub.y, 6 + pgR, 0, Math.PI * 2);
        ctx.strokeStyle = col.dotHi; ctx.globalAlpha = heroPing * 0.55; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.beginPath(); ctx.arc(hub.x, hub.y, 6 + pgR * 0.55, 0, Math.PI * 2);
        ctx.globalAlpha = heroPing * 0.35; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
        heroPing *= 0.972;
      }

      /* 기항지 마커 + 라벨 — 텍스트·KPI 금지구역에서는 점만 */
      ctx.font = '600 9.5px Pretendard Variable, sans-serif';
      try { ctx.letterSpacing = '1.5px'; } catch (e) { /* 미지원 */ }
      for (var pi = 0; pi < PORTS.length; pi++) {
        var pd = PORTS[pi];
        var pp = project(pd[0], pd[1]);
        var px = pp.x + ox, py = pp.y + oy;
        if (px < -20 || px > W + 20) continue;
        var kR = Math.max(0, (W - 1200) / 2);
        /* 문구 실제 위치를 그대로 금지구역으로 쓴다(앵커 배치라 폭마다 위치가 달라진다) */
        var inText = briefBox
          ? (px > briefBox.l - 18 && px < briefBox.r + 18 && py > briefBox.t - 12 && py < briefBox.b + 12)
          : (px > W - kR - 790 && px < W - kR + 60 && py > H * 0.14 && py < H * 0.68);
        /* 좌상단 시계 HUD 구역 — 라벨(ROTTERDAM 등)과 겹침 방지 */
        inText = inText || (px > W - 250 && py < H * 0.34);
        /* 태웅 거점 라벨·로고와의 충돌 — 거점이 우선이므로 항만은 점만 찍는다(2026-08-20).
           라벨이 접힌 자리에도 로고는 남아 있으므로 로고 박스까지 함께 피한다(BUSAN 겹침 사고) */
        var pbox = { l: px - 4, r: px + 4 + pd[2].length * 7, t: py - 8, b: py + 8 };
        inText = inText || boxHits(pbox, siteLabelBoxes) || boxHits(pbox, siteLogoBoxes);
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
    /* 마우스 패럴랙스 제거 — 지도가 커서 따라 흔들려 어지럽다는 지적(2026-08-19).
       mouse 는 (0,0) 고정 — 혜성·흐름 등 자체 모션은 그대로 */
    /* 거점 호버 툴팁 (2026-08-20) — 지도 위 마커가 어느 법인인지 라벨만으로는 부족해
       설립연도·주요사업까지 보여준다. 지도는 움직이지 않는다(히트 판정만 한다). */
    (function () {
      var host = canvas.parentElement;
      var tip = document.createElement('div');
      tip.className = 'site-tip'; tip.setAttribute('aria-hidden', 'true');
      host.appendChild(tip);

      function hide() {
        if (hoverSite !== -1) { hoverSite = -1; host.style.cursor = ''; }
        tip.classList.remove('on');
      }
      host.addEventListener('mouseleave', hide);
      host.addEventListener('mousemove', function (e) {
        var r = host.getBoundingClientRect();
        var mx = e.clientX - r.left, my = e.clientY - r.top;
        var found = -1;
        for (var i = 0; i < siteHits.length; i++) {
          var h = siteHits[i];
          if (mx > h.x - h.w / 2 && mx < h.x + h.w / 2 && my > h.t && my < h.b) { found = h.i; break; }
        }
        if (found < 0) { hide(); return; }
        if (found !== hoverSite) {
          hoverSite = found;
          host.style.cursor = 'help';
          var st0 = TWL_SITES[found];
          var rows = st0[5].map(function (c) {
            return '<li>' + esc(c[0]) + (c[1] ? ' <b>' + c[1] + '</b>' : '') + '</li>';
          }).join('');
          tip.innerHTML =
            '<div class="st-h">' + esc(st0[3]) + ' <span>' + esc(st0[4]) + '</span>' +
            (st0[2] === 1 ? '<i class="st-hq">' + t('site.hq', '본사') + '</i>' : '') + '</div>' +
            '<ul class="st-l">' + rows + '</ul>' +
            '<div class="st-b">' + esc(st0[6]) + '</div>';
          tip.classList.add('on');
        }
        var tw = tip.offsetWidth || 200, th = tip.offsetHeight || 70;
        var tx = Math.min(Math.max(mx + 16, 8), (r.width - tw - 8));
        var ty = my - th - 14;
        if (ty < 8) ty = my + 20;
        tip.style.left = Math.round(tx) + 'px';
        tip.style.top = Math.round(ty) + 'px';
      });
    })();

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
