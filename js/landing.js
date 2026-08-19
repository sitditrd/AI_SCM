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

  /* ---------- 히어로 — 글로벌 관제 씬 v2 (2026-08-19 전면 재작성) ----------
     ① 도트 매트릭스 세계지도: 러프 대륙 폴리곤을 격자 레이캐스팅으로 점묘.
        아시아 중심 투영(경도 +30° 회전, 대서양이 이음새)이라 부산이 화면 중심부.
     ② 부산 허브: 레이더 스윕(createConicGradient) + 동심원 + 맥동 + BUSAN 라벨.
     ③ 항로: 해상 12·항공 2 — 글로우 혜성 궤적, 진행방향 회전 글리프, 도착 펄스.
     ④ 마우스 패럴랙스(지도 0.4×, 항로 1×)로 깊이감. 배경 성점(별) 트윙클.
     성능: 지도는 리사이즈 때 1회 오프스크린 렌더 → 매 프레임 drawImage 1회.
     reduced-motion: 정적 1프레임(스윕·트윙클·패럴랙스 없음). 화면 밖이면 rAF 정지. */
  function initHeroCanvas() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas || !window.TWDATA) return;

    var ctx = canvas.getContext('2d');
    var routes = [];
    var ports = window.TWDATA.getState(0).ports;
    var HUB = { lat: 35.08, lng: 129.05 };
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var running = true;
    var col = {};
    /* 테마별 씨 팔레트 — 다크: 지면 네이비 위 은백 육지 + 시안 레인 /
       라이트: 밝은 지면 위 진한 슬레이트 육지 + 딥블루 레인 (2026-08-19 light 검증) */
    function setPalette() {
      /* 관제 히어로는 테마와 무관하게 항상 다크 — 라이트 모드 반쪽 현상 해결(2026-08-19) */
      col.sea = '#5aa7f0'; col.air = '#8ec5f4'; col.ink = '#9fb4d8';
      col.dot = '#dce6f5'; col.dotHi = '#7ee0ff'; col.lane = '#38c6ff'; col.laneAir = '#9be8ff';
      col.label = '#e6edf8'; col.head = '#eaf6ff';
      col.ocean1 = 'rgba(30, 70, 140, 0.22)'; col.ocean2 = 'rgba(18, 42, 88, 0.10)';
      col.night = 'rgba(3, 7, 20, 0.34)'; col.term = 'rgba(120, 200, 255, 0.14)';
    }
    setPalette();
    /* 실시간 AIS — 우리가 수신 중인 진짜 선박을 지도에 점으로 준다(60s 갱신) */
    var aisPts = [];
    function fetchAis() {
      var KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv';
      fetch('https://kvmyiualdodcvreoqfin.supabase.co/rest/v1/vessel_positions' +
            '?select=mmsi,lat,lng,received_at&order=received_at.desc&limit=400',
        { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          if (!Array.isArray(rows)) return;
          var cut = Date.now() - 45 * 60000, seen = {}, out = [];
          rows.forEach(function (v) {
            if (seen[v.mmsi]) return;
            if (new Date(v.received_at).getTime() < cut) return;
            seen[v.mmsi] = 1;
            out.push([Number(v.lat), Number(v.lng)]);
          });
          aisPts = out;
          /* 신선한 수신이 없으면 칩 자체를 숨긴다 — "실시간"을 거짓말로 만들지 않는다.
             (AIS 수집기가 재가동되면 자동으로 다시 켜진다) */
          var el = document.getElementById('lsAis');
          if (el) {
            var chip = el.closest ? el.closest('.live-chip') : null;
            if (out.length) {
              el.textContent = out.length + '척';
              if (chip) chip.style.display = '';
            } else if (chip) chip.style.display = 'none';
          }
        }).catch(function () { /* 수신 실패 시 점 생략 */ });
    }
    fetchAis();
    setInterval(fetchAis, 60000);

    /* 낮·밤 터미네이터 — 태양 위치 실시간 계산(근사식).
       지금 이 순간 지구의 밤 영역이 지도 위에 실제로 드리운다 — 장식이 아니라 사실. */
    function sunState() {
      var d = new Date();
      var start = Date.UTC(d.getUTCFullYear(), 0, 0);
      var doy = (d.getTime() - start) / 86400000;
      var decl = -23.44 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180;
      var utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
      var subLng = (12 - utcH) * 15;                     /* 태양 직하 경도 */
      return { decl: decl, subLng: subLng };
    }
    var mapLayer = null, stars = [], hub = null;
    var mH = 0;   /* 지도 밴드 높이 — 히어로가 아무리 길어도 세계지도는 이 안에만 그린다 */
    var mouse = { tx: 0, ty: 0, x: 0, y: 0 };

    /* CSS 토큰 → 캔버스 색 (color-mix 등 못 읽는 값이면 폴백 유지) */
    function readTokens() {
      var cs = getComputedStyle(document.documentElement);
      var probe = document.createElement('canvas').getContext('2d');
      function ok(v) { if (!v) return null; try { probe.fillStyle = '#123456'; probe.fillStyle = v; return probe.fillStyle !== '#123456' || v.indexOf('#') === 0 ? probe.fillStyle : null; } catch (e) { return null; } }
      /* 씨 팔레트 고정 — 브랜드 토큰 덮어쓰기 안 함(항상 다크 관제 화면) */
    }
    new MutationObserver(function () { setPalette(); readTokens(); resize(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    readTokens();

    /* 색 문자열(hex/rgb) → rgba(...,a) — 글로우·그라데이션용 */
    function rgba(c, a) {
      var m = /^#([0-9a-f]{6})/i.exec(c);
      if (m) {
        var n = parseInt(m[1], 16);
        return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
      }
      m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(c);
      if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')';
      return c;
    }

    /* ── 러프 대륙 폴리곤 [lat,lng,...] — 도트 해상도(2.6°)에서 실루엣이 읽히는 수준 ── */
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

    /* 아시아 중심 투영 — 경도 +30° 회전(이음새=대서양), 부산이 화면 44% 지점 */
    function project(lat, lng, w) {
      var fx = ((((lng + 30) % 360) + 360) % 360) / 360;
      return { x: fx * w, y: 92 + ((90 - lat) / 180) * mH * 1.42 - mH * 0.12 };
    }

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* 세계지도는 상단 밴드에만 — 히어로가 KPI 스트립으로 길어져도 지도가 늘어나지 않는다 */
      mH = Math.max(360, Math.min((r.height * 0.92 - 92) / 1.03, r.width * 0.42));
      buildMap(r.width, r.height, dpr);
      buildRoutes(r.width);
      drawFrame(performance.now());
    }
    /* KPI/운임/물동량 스트립이 비동기 로드되며 히어로 높이가 변한다 —
       비트맵을 안 맞추면 CSS 가 세로로 잡아늘려 지도가 노이즈처럼 깨진다(실측 버그). */
    var lastW = 0, lastH = 0, roT = null;
    function sizeChanged() {
      var r = canvas.parentElement.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 4 && Math.abs(r.height - lastH) < 4) return;
      lastW = r.width; lastH = r.height;
      clearTimeout(roT); roT = setTimeout(resize, 120);
    }
    if (window.ResizeObserver) new ResizeObserver(sizeChanged).observe(canvas.parentElement);

    /* 지도 레이어 — 리사이즈 때 1회만 점묘 */
    function buildMap(w, h, dpr) {
      mapLayer = document.createElement('canvas');
      mapLayer.width = w * dpr; mapLayer.height = h * dpr;
      var m = mapLayer.getContext('2d');
      m.setTransform(dpr, 0, 0, dpr, 0, 0);
      hub = project(HUB.lat, HUB.lng, w);

      /* 경위선 — 관제 그리드 */
      m.strokeStyle = col.ink; m.lineWidth = 1; m.globalAlpha = 0.05;
      for (var gy = 1; gy <= 3; gy++) { m.beginPath(); m.moveTo(0, h * gy / 4); m.lineTo(w, h * gy / 4); m.stroke(); }
      for (var gx = 1; gx <= 5; gx++) { m.beginPath(); m.moveTo(w * gx / 6, 0); m.lineTo(w * gx / 6, h); m.stroke(); }

      var og = m.createRadialGradient(w * 0.62, 92 + mH * 0.5, mH * 0.1, w * 0.62, 92 + mH * 0.5, Math.max(w, mH) * 0.75);
      og.addColorStop(0, col.ocean1);
      og.addColorStop(0.55, col.ocean2);
      og.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = og; m.globalAlpha = 1; m.fillRect(0, 0, w, h);

      /* 대륙 도트 — 러프 폴리곤 레이캐스팅 */
      var dotR = Math.max(1.4, w / 950);
      for (var lat = 74; lat >= -56; lat -= 1.5) {
        for (var lng = -180; lng < 180; lng += 1.5) {
          var land = false;
          for (var p = 0; p < LAND.length && !land; p++) land = pip(lat, lng, LAND[p]);
          if (!land) continue;
          var pt = project(lat, lng, w);
          var dHub = Math.sqrt((pt.x - hub.x) * (pt.x - hub.x) + (pt.y - hub.y) * (pt.y - hub.y));
          m.beginPath();
          m.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
          m.fillStyle = dHub < 70 ? col.dotHi : col.dot;
          var tz = (pt.x < w * 0.47 && pt.y > h * 0.09 && pt.y < h * 0.62) ? 0.3 : 1;
          m.globalAlpha = (dHub < 70 ? 0.9 : 0.55) * tz;      /* 한반도 주변은 살짝 밝게 */
          m.fill();
        }
      }
      m.globalAlpha = 1;

      /* 배경 성점 — 얕은 깊이감 */
      stars = [];
      for (var s = 0; s < 70; s++) {
        stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.4, ph: Math.random() * 6.28 });
      }
    }

    /* 항로 — 전 세계 주요 무역 레인 쌍(기점·종점 분산, 같은 기점 최대 2개).
       "부산에서 방사형으로 퍼지는" 구도는 2026-08-19 사용자 반려 — 스포크 금지. */
    var LANES_SEA = [
      [35.08, 129.05, 33.73, -118.26],
      [35.08, 129.05, 35.62, 139.78],
      [31.23, 121.49, 51.95, 4.14],
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
    function buildRoutes(w) {
      routes = [];
      LANES_SEA.forEach(function (L, i) {
        var a = project(L[0], L[1], w), b = project(L[2], L[3], w);
        var rise = Math.abs(a.x - b.x) * 0.14 + 22;
        routes.push({
          type: 'sea', a: a, b: b,
          mid: { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - rise },
          t: (i * 0.13) % 1, speed: 0.0011 + (i % 5) * 0.00035, pulse: 0
        });
      });
      LANES_AIR.forEach(function (L, k) {
        var a = project(L[0], L[1], w), b = project(L[2], L[3], w);
        routes.push({
          type: 'air', a: a, b: b,
          mid: { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - Math.abs(a.x - b.x) * 0.30 - 42 },
          t: 0.5 * k, speed: 0.0042, pulse: 0
        });
      });
    }
    /* 기항지 라벨 — "BUSAN 만 표기" 반려(2026-08-19) → 레인 기항지 12곳 전부 표기 */
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
    function bez(p0, p1, p2, t) {
      var mt = 1 - t;
      return { x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
               y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y };
    }

    function drawFrame(now) {
      var w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
      ctx.clearRect(0, 0, w, h);
      if (!mapLayer || !hub) return;

      /* 패럴랙스 감쇠 추적 */
      if (!reduced) { mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06; }
      var ox = mouse.x, oy = mouse.y;

      /* 성점 트윙클 */
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        ctx.beginPath();
        ctx.arc(st.x + ox * 0.2, st.y + oy * 0.2, st.r, 0, Math.PI * 2);
        ctx.fillStyle = col.ink;
        ctx.globalAlpha = reduced ? 0.18 : 0.10 + 0.14 * (Math.sin(now / 900 + st.ph) + 1) / 2;
        ctx.fill();
      }

      /* 지도 레이어 (0.4× 패럴랙스) */
      ctx.globalAlpha = 1;
      ctx.drawImage(mapLayer, ox * 0.4, oy * 0.4, w, h);

      /* 밤 영역 — 화면 x 열마다 터미네이터 위도를 구해 어둠 쪽 극으로 닫는다 */
      var sun = sunState();
      var yOf = function (lat) { return 92 + ((90 - lat) / 180) * mH * 1.42 - mH * 0.12 + oy * 0.4; };
      ctx.beginPath();
      var darkPoleY = yOf(sun.decl > 0 ? -90 : 90);
      var firstY = null;
      for (var sx = 0; sx <= w; sx += 10) {
        var lngX = ((sx / w) * 360 - 30 + 540) % 360 - 180;
        var H = (lngX - sun.subLng) * Math.PI / 180;
        var phi = Math.atan(-Math.cos(H) / Math.tan(sun.decl));
        var ty = yOf(phi * 180 / Math.PI);
        if (firstY === null) { firstY = ty; ctx.moveTo(sx + ox * 0.4, ty); }
        else ctx.lineTo(sx + ox * 0.4, ty);
      }
      ctx.lineTo(w + ox * 0.4, darkPoleY);
      ctx.lineTo(ox * 0.4, darkPoleY);
      ctx.closePath();
      ctx.fillStyle = col.night; ctx.globalAlpha = 1; ctx.fill();
      ctx.strokeStyle = col.term; ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.stroke();

      /* 실시간 AIS 선박 점 — 진짜 배들 */
      for (var ai = 0; ai < aisPts.length; ai++) {
        var ap = project(aisPts[ai][0], aisPts[ai][1], w);
        var axp = ap.x + ox, ayp = ap.y + oy;
        if (axp < 0 || axp > w || ayp < 0 || ayp > h) continue;
        ctx.beginPath();
        ctx.arc(axp, ayp, 1.7, 0, Math.PI * 2);
        ctx.fillStyle = col.head;
        ctx.globalAlpha = 0.9;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      var hx = hub.x + ox, hy = hub.y + oy;
      routes.forEach(function (r) {
        var ax = r.a.x + ox, ay = r.a.y + oy, bx = r.b.x + ox, by = r.b.y + oy;
        var mx = r.mid.x + ox, my = r.mid.y + oy;
        /* 항로 베이스 */
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by);
        ctx.strokeStyle = r.type === 'air' ? col.laneAir : col.lane;
        ctx.globalAlpha = 0.06; ctx.lineWidth = 4; ctx.stroke();
        ctx.globalAlpha = r.type === 'air' ? 0.14 : 0.20;
        ctx.setLineDash(r.type === 'air' ? [3, 8] : []);
        ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
        if (r.type === 'sea' && !reduced) {
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by);
          ctx.setLineDash([2.5, 10]);
          ctx.lineDashOffset = -(now / 42);
          ctx.globalAlpha = 0.32; ctx.lineWidth = 1.3; ctx.stroke();
          ctx.setLineDash([]); ctx.lineDashOffset = 0;
        }

        if (!reduced) { r.t += r.speed; if (r.t > 1) { r.t = 0; r.pulse = 1; } }

        /* 혜성 궤적 */
        var A = { x: ax, y: ay }, M = { x: mx, y: my }, B = { x: bx, y: by };
        var TR = r.type === 'air' ? 10 : 18;
        for (var i = 1; i <= TR; i++) {
          var tt = r.t - i * (r.type === 'air' ? 0.011 : 0.0068);
          if (tt < 0) break;
          var tp = bez(A, M, B, tt);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, Math.max(0.7, 2.6 - i * 0.13), 0, Math.PI * 2);
          ctx.fillStyle = r.type === 'air' ? col.laneAir : col.lane;
          ctx.globalAlpha = 0.6 * (1 - i / TR);
          ctx.fill();
        }

        /* 혜성 머리 — 글로우 광점(화살표 금지: 2026-08-19 사용자 반려) */
        var hp = bez(A, M, B, r.t);
        ctx.save();
        ctx.shadowColor = rgba(r.type === 'air' ? col.laneAir : col.lane, 0.95);
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, r.type === 'air' ? 2.2 : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = col.head;
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.restore();

        /* 도착 펄스 링 */
        if (r.pulse > 0.04) {
          if (!reduced) r.pulse *= 0.955;
          ctx.beginPath();
          ctx.arc(bx, by, 3 + (1 - r.pulse) * 17, 0, Math.PI * 2);
          ctx.strokeStyle = r.type === 'air' ? col.laneAir : col.lane;
          ctx.globalAlpha = r.pulse * 0.55; ctx.lineWidth = 1.5; ctx.stroke();
        }
        /* 목적항 노드 */
        ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2);
        ctx.fillStyle = col.lane; ctx.globalAlpha = 0.7; ctx.fill();
      });

      /* 기항지 마커 + 라벨 12곳 — 관제 지도의 정체성. BUSAN 은 맥동·강조 */
      ctx.font = '600 9.5px Pretendard Variable, sans-serif';
      try { ctx.letterSpacing = '1.5px'; } catch (e) { /* 미지원 브라우저 */ }
      for (var pi = 0; pi < PORTS.length; pi++) {
        var pd = PORTS[pi];
        var pp = project(pd[0], pd[1], w);
        var px = pp.x + ox, py = pp.y + oy;
        if (px < -20 || px > w + 20) continue;
        /* 라벨 금지 구역 — 헤드라인·서브카피 블록과 KPI 스트립 위에는
           글자를 안 얕는다(2026-08-19 사용자 지적: 동아시아 라벨이 제목과 충돌).
           금지 구역 안에서는 점만 연하게 남는다. */
        var inText = px < w * 0.545 && py > h * 0.06 && py < h * 0.70;
        var inStrip = py > h * 0.585 && px > w * 0.18 && px < w * 0.82;
        var quiet = inText || inStrip;
        if (pd[3]) {                                   /* BUSAN */
          var beat = reduced ? 0.5 : (Math.sin(now / 650) + 1) / 2;
          var bA = quiet ? 0.35 : 1;
          ctx.beginPath(); ctx.arc(px, py, 7 + beat * 9, 0, Math.PI * 2);
          ctx.strokeStyle = col.dotHi; ctx.globalAlpha = 0.35 * (1 - beat * 0.6) * bA; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.save();
          if (!quiet) { ctx.shadowColor = rgba(col.dotHi, 0.9); ctx.shadowBlur = 12; }
          ctx.beginPath(); ctx.arc(px, py, quiet ? 2.8 : 3.8, 0, Math.PI * 2);
          ctx.fillStyle = col.dotHi; ctx.globalAlpha = quiet ? 0.55 : 1; ctx.fill();
          ctx.restore();
          if (!quiet) {
            ctx.fillStyle = col.dotHi; ctx.globalAlpha = 1;
            ctx.fillText(pd[2], px + 12, py + 4);
          }
        } else {
          ctx.beginPath(); ctx.arc(px, py, quiet ? 1.8 : 2.4, 0, Math.PI * 2);
          ctx.fillStyle = col.lane; ctx.globalAlpha = quiet ? 0.35 : 0.95; ctx.fill();
          if (!quiet) {
            ctx.fillStyle = col.label; ctx.globalAlpha = 0.95;
            var lx = px + (pd[4] != null ? pd[4] : 8);
            var ly = py + (pd[5] != null ? pd[5] : 4);
            if (lx + pd[2].length * 7 > w - 6) lx = px - 8 - pd[2].length * 7;
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
    window.addEventListener('resize', resize);
    resize();
    if (!reduced) requestAnimationFrame(loop);
  }

})();
