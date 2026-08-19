/* =========================================================
   TWL Port Insight — 대시보드 렌더러
   (실시간 폴링 45초 · 지도 · 탭 · 필터 · 스크롤 스파이)
   ========================================================= */
(function () {
  'use strict';

  var UI = null, DATA = null;
  var tick = 1;
  var lastUpdateTs = null;
  var state = null;
  var map = null, markerLayer = null;
  var levelFilter = { LOW: true, STABLE: true, BUSY: true, CONGESTED: true };
  var LEVEL_COLOR = { LOW: '#0ca30c', STABLE: '#fab219', BUSY: '#ec835a', CONGESTED: '#d03b3b' };
  var LEVEL_ORDER = ['LOW', 'STABLE', 'BUSY', 'CONGESTED'];

  document.addEventListener('DOMContentLoaded', function () {
    UI = window.TWUI; DATA = window.TWDATA;
    if (!DATA) return;

    /* Supabase 연결 시도 → 실패 시 자동 시뮬레이션 폴백 */
    DATA.init().then(function () {
      refresh(true);
      initTabs();
      initChips();
      initMap();
      renderMap();
      initPortSearch();
      initFocusList();
      initTeuTrend();
      initPortStat();
      initScrollSpy();
      initStampTicker();
      updateSourceBadge();

      document.getElementById('refreshBtn').addEventListener('click', function () {
        var btn = this;
        btn.classList.add('spin');
        setTimeout(function () { btn.classList.remove('spin'); }, 600);
        poll();
      });
      /* 실시간 폴링 45초: supabase 모드는 재조회, sim 모드는 변동 시뮬레이션 */
      setInterval(poll, 45000);
    });
  });

  function poll() {
    if (DATA.getMode() === 'supabase') {
      DATA.refreshLive().then(function () {
        refresh(false);
        el('staleBanner').classList.remove('show');
      }).catch(function () {
        el('staleBanner').classList.add('show');
        updateStamp();
      });
    } else {
      tick += 1; refresh(false);
    }
  }

  function updateSourceBadge() {
    var host = document.querySelector('.live-status');
    if (!host) return;
    var b = document.getElementById('srcBadge');
    if (!b) {
      b = document.createElement('span');
      b.id = 'srcBadge';
      b.className = 'src-badge';
      host.insertBefore(b, host.firstChild);
    }
    if (DATA.getMode() === 'supabase') {
      b.style.display = 'none';   /* 라이브 모드에서는 소스 배지 비노출 (2026-07-31 운영 요청) */
      b.textContent = '';
    } else {
      b.style.display = '';
      b.textContent = '내장 시뮬레이션';
      b.classList.remove('live');
      var err = DATA.getLastError();
      b.title = '데이터 소스: 내장 샘플 데이터' + (err ? ' — ' + err.message : '');
    }
  }

  /* ================= 공통 헬퍼 ================= */
  function el(id) { return document.getElementById(id); }
  function fmt(n, d) { return UI.fmt(n, d); }
  function portCell(ko, en, cc) {
    return '<div class="port-cell"><b>' + ko + '</b><small>' + en + (cc ? ' · ' + cc : '') + '</small></div>';
  }
  function flash(id) {
    var k = el(id);
    if (!k) return;
    k.classList.remove('flash');
    void k.offsetWidth;
    k.classList.add('flash');
  }

  /* ================= 갱신 사이클 ================= */
  function refresh(first) {
    state = DATA.getState(tick);
    lastUpdateTs = Date.now();
    renderSnapshot(first);
    renderRegional();
    renderTables();
    renderWaiting();
    renderBottleneck();
    if (el('tbodyDischarge')) renderDischarge();
    if (map) renderMap();
    if (!first) ['kpiTpfs', 'kpiCritical', 'kpiRisk', 'kpiDelay'].forEach(flash);
    updateStamp();
    UI.bindTooltips(document);
  }

  function initStampTicker() {
    setInterval(updateStamp, 5000);
  }
  function updateStamp() {
    if (DATA && DATA.getMode() !== 'supabase') {
      el('lastUpdated').textContent = '오프라인 — 캐시 데이터 표시 중';
      el('staleBanner').classList.add('show');
      return;
    }
    if (!lastUpdateTs) return;
    var sec = Math.max(0, Math.round((Date.now() - lastUpdateTs) / 1000));
    var label = sec < 5 ? '방금 업데이트' : sec + '초 전 업데이트';
    if (sec >= 60) label = Math.floor(sec / 60) + '분 전 업데이트';
    el('lastUpdated').textContent = label;
    el('staleBanner').classList.toggle('show', sec > 120);
  }

  /* ================= Section 01 스냅샷 ================= */
  function renderSnapshot(first) {
    var s = state.snapshot;
    if (first) {
      UI.countUp(el('vTpfs'), s.tpfs, { dec: 1 });
      UI.countUp(el('vCritical'), s.criticalPorts, { dec: 0 });
      UI.countUp(el('vDelay'), s.avgDelayHours, { dec: 1 });
    } else {
      el('vTpfs').textContent = fmt(s.tpfs, 1);
      el('vCritical').textContent = fmt(s.criticalPorts, 0);
      el('vDelay').textContent = fmt(s.avgDelayHours, 1);
    }
    el('vRisk').textContent = s.globalRisk;
    el('vRisk').className = 'risk-badge risk-' + String(s.globalRisk || '').toLowerCase();
    el('vTpfsGrade').innerHTML = '현재 구간: ' + UI.levelBadge(s.tpfsGrade);
    el('periodLabel').textContent = s.periodStart + ' ~ ' + s.periodEnd;
    el('focusCountLabel').textContent = DATA.focusCount;
    drawGauge(s.tpfs);

    /* 분포 스택바 (2px 갭 + 라벨 병기) */
    var bar = el('distBar');
    bar.innerHTML = s.distribution.map(function (d) {
      return '<div class="dist-seg seg-' + d.level.toLowerCase() + '" style="flex:' + d.ratio + ' 1 0;" ' +
        'data-tip="<b>' + d.level + ' · ' + UI.LEVEL_KO[d.level] + '</b><br>' + d.count + '개 항만 (' + d.ratio + '%)<br>전주 대비 ' + (d.delta > 0 ? '▲' : '▼') + Math.abs(d.delta) + '">' +
        (d.ratio >= 9 ? '<span>' + d.level + ' ' + d.ratio + '%</span>' : '') + '</div>';
    }).join('');

    el('distLegend').innerHTML = s.distribution.map(function (d) {
      return '<span class="item"><span class="sw" style="background:' + LEVEL_COLOR[d.level] + ';"></span>' +
        d.level + ' · ' + UI.LEVEL_KO[d.level] + ' (' + d.count + ')</span>';
    }).join('');

    var tb = el('distTable').querySelector('tbody');
    tb.innerHTML = s.distribution.map(function (d) {
      var up = d.delta > 0;
      /* 레벨별 증감은 방향만 표시 (증가=악화가 아닐 수 있어 중립 색상) */
      return '<tr><td>' + UI.levelBadge(d.level) + '</td>' +
        '<td class="num">' + d.ratio + '%</td>' +
        '<td class="num">' + fmt(d.count, 0) + '</td>' +
        '<td class="num"><b style="color:var(--ink-2);">' + (up ? '▲' : '▼') + Math.abs(d.delta) + '</b></td></tr>';
    }).join('');
  }

  function drawGauge(v) {
    var svg = el('gaugeSvg');
    var cx = 75, cy = 84, r = 62;
    function arc(a0, a1, color, w) {
      var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      return '<path d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
        '" fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>';
    }
    var PI = Math.PI;
    function angle(pct) { return PI + (pct / 100) * PI; }
    /* 배경 밴드 (등급 구간 표시) + 진행 호 */
    var html = '';
    html += arc(angle(0), angle(25), 'rgba(12,163,12,0.28)', 9);
    html += arc(angle(25.5), angle(50), 'rgba(250,178,25,0.30)', 9);
    html += arc(angle(50.5), angle(75), 'rgba(236,131,90,0.32)', 9);
    html += arc(angle(75.5), angle(100), 'rgba(208,59,59,0.32)', 9);
    var lv = DATA.levelOf(v);
    html += arc(angle(0), angle(Math.max(2, v)), LEVEL_COLOR[lv], 9);
    /* 눈금 라벨 */
    html += '<text x="8" y="90" font-size="9" fill="currentColor" opacity="0.55">0</text>';
    html += '<text x="132" y="90" font-size="9" fill="currentColor" opacity="0.55">100</text>';
    svg.innerHTML = html;
    svg.style.color = 'inherit';
  }

  /* ================= Section 02 권역별 ================= */
  function renderRegional() {
    var max = Math.max.apply(null, state.regional.map(function (r) { return r.busyConRatio; })) || 1;
    el('rgList').innerHTML = state.regional.map(function (r) {
      var tr = r.trend === 'up' ? '<span class="trend-up" data-tip="전주 대비 악화">▲ 악화</span>'
        : r.trend === 'down' ? '<span class="trend-down" data-tip="전주 대비 개선">▼ 개선</span>'
        : '<span class="trend-flat">— 유지</span>';
      return '<div class="rg-item" data-tip="<b>' + r.ko + '</b><br>Focus Port ' + r.portCount + '개<br>BUSY+CON 비율 ' + r.busyConRatio + '%<br>평균 접안 지연 ' + r.avgDelayH + 'h">' +
        '<div class="rg-top"><b>' + r.ko + '</b><span class="cnt">' + r.portCount + '개항</span>' + tr +
        '<span class="val">' + r.busyConRatio + '%</span><span class="delay">지연 ' + r.avgDelayH + 'h</span></div>' +
        '<div class="rg-bar"><div class="rg-fill" style="width:' + (r.busyConRatio / max * 100) + '%;"></div></div>' +
        '</div>';
    }).join('');
  }

  /* ================= Section 03 주목 항만 ================= */
  function renderTables() {
    el('tbodyCongested').innerHTML = state.topCongested.map(function (p, i) {
      return '<tr><td class="rank">' + (i + 1) + '</td>' +
        '<td>' + portCell(p.ko, p.en, p.cc) + '</td>' +
        '<td>' + UI.levelBadgeShort(p.level) + '</td>' +
        '<td class="num"><b>' + fmt(p.delayH, 1) + 'h</b></td>' +
        '<td class="num">' + p.waiting + ' / ' + p.berthed + '척</td></tr>';
    }).join('');

    if (el('tbodyWorsening')) el('tbodyWorsening').innerHTML = state.worsening.map(function (m) {
      return '<tr><td class="rank">' + m.rank + '</td>' +
        '<td>' + portCell(m.ko, m.en, m.cc) + '</td>' +
        '<td class="num"><span class="chg-up">▲' + fmt(m.pciChange, 1) + '</span></td>' +
        '<td class="num chg-up">+' + fmt(m.delayIncH, 1) + 'h</td>' +
        '<td class="num">' + fmt(m.curDelayH, 1) + 'h</td></tr>';
    }).join('');

    if (el('tbodyImproving')) el('tbodyImproving').innerHTML = state.improving.map(function (m) {
      return '<tr><td class="rank">' + m.rank + '</td>' +
        '<td>' + portCell(m.ko, m.en, m.cc) + '</td>' +
        '<td class="num"><span class="chg-down">▼' + fmt(Math.abs(m.pciChange), 1) + '</span></td>' +
        '<td class="num chg-down">-' + fmt(m.delayDecH, 1) + 'h</td>' +
        '<td>' + UI.levelBadgeShort(m.level) + '</td></tr>';
    }).join('');
  }

  function initTabs() {
    var btns = document.querySelectorAll('.tab-btn');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
        b.classList.add('active'); b.setAttribute('aria-selected', 'true');
        document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
        el(b.getAttribute('data-tab')).classList.add('active');
      });
    });
  }

  /* ================= Section 04 지도 ================= */
  function initMap() {
    if (typeof L === 'undefined') {
      el('mapCard').classList.add('no-map');
      return;
    }
    map = L.map('map', {
      worldCopyJump: true, minZoom: 2, maxZoom: 10,
      scrollWheelZoom: false, attributionControl: true
    }).setView([22, 15], 2);
    setTiles();
    markerLayer = L.layerGroup().addTo(map);
    window.addEventListener('twl-theme', setTiles);
  }
  var tileLayer = null;
  function setTiles() {
    if (!map) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var url = dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(url, {
      attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 12
    }).addTo(map);
  }
  function renderMap() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    state.ports.forEach(function (p) {
      if (!levelFilter[p.level]) return;
      var radius = 4 + (p.tpfs / 100) * 12;
      var m = L.circleMarker([p.lat, p.lng], {
        radius: radius,
        color: LEVEL_COLOR[p.level],
        weight: 1.5,
        fillColor: LEVEL_COLOR[p.level],
        fillOpacity: 0.55
      });
      m.bindPopup(
        '<div class="map-pop"><b>' + p.ko + '</b> <small style="opacity:.65">' + p.en + '</small><br>' +
        '<div class="row"><span>레벨</span><span><b>' + p.level + ' · ' + UI.LEVEL_KO[p.level] + '</b></span></div>' +
        '<div class="row"><span>PCI</span><span>' + p.tpfs + '</span></div>' +
        '<div class="row"><span>접안 지연</span><span>' + p.delayH + 'h</span></div>' +
        '<div class="row"><span>대기/접안</span><span>' + p.waiting + ' / ' + p.berthed + '척</span></div></div>',
        { closeButton: false }
      );
      m.on('mouseover', function () { this.openPopup(); });
      m.on('mouseout', function () { this.closePopup(); });
      markerLayer.addLayer(m);
    });
  }
  /* ===================================================================
     FR-01 · 관심 포트 검색 (항구명/LOCODE 자동완성 → 지도 포커스 + 상세 패널)
     =================================================================== */
  // 주요 포트 LOCODE (UN/LOCODE). en(소문자) → LOCODE. 없는 포트는 이름 검색만.
  var LOCODE = {
    'shanghai': 'CNSHA', 'ningbo': 'CNNGB', 'shenzhen (yantian)': 'CNYTN', 'guangzhou (nansha)': 'CNGZG',
    'qingdao': 'CNTAO', 'tianjin': 'CNTXG', 'xiamen': 'CNXMN', 'dalian': 'CNDLC', 'hong kong': 'HKHKG',
    'kaohsiung': 'TWKHH', 'busan': 'KRPUS', 'incheon': 'KRINC', 'gwangyang': 'KRKAN',
    'tokyo': 'JPTYO', 'yokohama': 'JPYOK', 'nagoya': 'JPNGO', 'kobe': 'JPUKB', 'singapore': 'SGSIN',
    'tanjung pelepas': 'MYTPP', 'port klang': 'MYPKG', 'penang': 'MYPEN', 'kuching': 'MYKCH',
    'jakarta (tg. priok)': 'IDJKT', 'surabaya': 'IDSUB', 'laem chabang': 'THLCH', 'bangkok': 'THBKK',
    'ho chi minh (cat lai)': 'VNSGN', 'cai mep': 'VNCMT', 'haiphong': 'VNHPH', 'manila': 'PHMNL',
    'yangon': 'MMRGN', 'sihanoukville': 'KHKOS', 'colombo': 'LKCMB', 'chattogram': 'BDCGP',
    'nhava sheva (jnpt)': 'INNSA', 'mundra': 'INMUN', 'chennai': 'INMAA', 'karachi': 'PKKHI',
    'jebel ali': 'AEJEA', 'khalifa (abu dhabi)': 'AEKHL', 'hamad': 'QAHMD', 'dammam': 'SADMM',
    'jeddah': 'SAJED', 'salalah': 'OMSLL', 'bandar abbas': 'IRBND', 'rotterdam': 'NLRTM',
    'antwerp-bruges': 'BEANR', 'hamburg': 'DEHAM', 'bremerhaven': 'DEBRV', 'le havre': 'FRLEH',
    'fos-marseille': 'FRFOS', 'valencia': 'ESVLC', 'algeciras': 'ESALG', 'barcelona': 'ESBCN',
    'genoa': 'ITGOA', 'gioia tauro': 'ITGIT', 'trieste': 'ITTRS', 'koper': 'SIKOP', 'piraeus': 'GRPIR',
    'ambarli (istanbul)': 'TRAMB', 'mersin': 'TRMER', 'gdansk': 'PLGDN', 'felixstowe': 'GBFXT',
    'london gateway': 'GBLGP', 'los angeles': 'USLAX', 'long beach': 'USLGB', 'oakland': 'USOAK',
    'seattle-tacoma': 'USSEA', 'vancouver': 'CAVAN', 'new york/new jersey': 'USNYC', 'savannah': 'USSAV',
    'charleston': 'USCHS', 'houston': 'USHOU', 'manzanillo (mx)': 'MXZLO', 'lazaro cardenas': 'MXLZC',
    'santos': 'BRSSZ', 'callao': 'PECLL', 'cartagena': 'COCTG', 'colon (panama)': 'PACOL',
    'buenos aires': 'ARBUE', 'guayaquil': 'ECGYE', 'tanger med': 'MAPTM', 'port said': 'EGPSD',
    'alexandria': 'EGALY', 'durban': 'ZADUR', 'cape town': 'ZACPT', 'lagos (apapa)': 'NGLOS',
    'mombasa': 'KEMBA', 'dar es salaam': 'TZDAR', 'sydney (botany)': 'AUSYD', 'melbourne': 'AUMEL',
    'brisbane': 'AUBNE', 'auckland': 'NZAKL'
  };
  var CC_KO = { KR:'한국', CN:'중국', JP:'일본', HK:'홍콩', TW:'대만', SG:'싱가포르', MY:'말레이시아',
    ID:'인도네시아', TH:'태국', VN:'베트남', PH:'필리핀', MM:'미얀마', KH:'캄보디아', LK:'스리랑카',
    BD:'방글라데시', IN:'인도', PK:'파키스탄', AE:'UAE', QA:'카타르', SA:'사우디', OM:'오만', IR:'이란',
    NL:'네덜란드', BE:'벨기에', DE:'독일', FR:'프랑스', ES:'스페인', IT:'이탈리아', SI:'슬로베니아',
    GR:'그리스', TR:'튀르키예', PL:'폴란드', GB:'영국', US:'미국', CA:'캐나다', MX:'멕시코', BR:'브라질',
    PE:'페루', CO:'콜롬비아', PA:'파나마', AR:'아르헨티나', EC:'에콰도르', MA:'모로코', EG:'이집트',
    ZA:'남아공', NG:'나이지리아', KE:'케냐', TZ:'탄자니아', AU:'호주', NZ:'뉴질랜드' };

  var searchIdx = [];
  var acItems = [], acActive = -1, highlightMarker = null;

  function buildSearchIndex() {
    searchIdx = (state.ports || []).map(function (p) {
      var loc = LOCODE[String(p.en || '').toLowerCase()] || '';
      return { p: p, ko: p.ko || '', en: p.en || '', locode: loc,
        cc: loc ? loc.slice(0, 2) : '', hay: (p.ko + ' ' + p.en + ' ' + loc).toLowerCase() };
    });
  }

  function initPortSearch() {
    buildSearchIndex();
    var input = el('portSearch'), ac = el('portAC');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      if (q.length < 2) { closeAC(); return; }
      var hits = searchIdx.filter(function (x) { return x.hay.indexOf(q) >= 0; }).slice(0, 8);
      renderAC(hits, q);
    });
    input.addEventListener('keydown', function (e) {
      if (ac.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveAC(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveAC(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (acActive >= 0 && acItems[acActive]) selectPort(acItems[acActive]); }
      else if (e.key === 'Escape') closeAC();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.port-search')) closeAC();
    });
  }

  function renderAC(hits, q) {
    var ac = el('portAC'), input = el('portSearch');
    acItems = hits; acActive = -1;
    if (!hits.length) {
      ac.innerHTML = '<div class="port-ac-empty">검색 결과 없음</div>';
    } else {
      ac.innerHTML = hits.map(function (x, i) {
        return '<button class="port-ac-item" role="option" data-i="' + i + '">' +
          '<span class="pai-ko">' + esc(x.ko) + '</span>' +
          '<span class="pai-en">' + esc(x.en) + '</span>' +
          (x.locode ? '<span class="pai-loc">' + x.locode + '</span>' : '') +
          (x.cc ? '<span class="pai-cc">' + (CC_KO[x.cc] || x.cc) + '</span>' : '') +
          '</button>';
      }).join('');
      ac.querySelectorAll('.port-ac-item').forEach(function (b) {
        b.addEventListener('click', function () { selectPort(hits[parseInt(this.getAttribute('data-i'), 10)]); });
      });
    }
    ac.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function closeAC() {
    var ac = el('portAC'), input = el('portSearch');
    if (ac) { ac.hidden = true; acItems = []; acActive = -1; }
    if (input) input.setAttribute('aria-expanded', 'false');
  }
  function moveAC(dir) {
    var ac = el('portAC');
    var nodes = ac.querySelectorAll('.port-ac-item');
    if (!nodes.length) return;
    acActive = (acActive + dir + nodes.length) % nodes.length;
    nodes.forEach(function (n, i) { n.classList.toggle('active', i === acActive); });
  }

  function selectPort(x) {
    closeAC();
    el('portSearch').value = x.ko + (x.locode ? ' (' + x.locode + ')' : '');
    focusPort(x);
  }

  function focusPort(x) {
    var p = x.p;
    if (map) {
      map.setView([p.lat, p.lng], 6, { animate: true });
      if (highlightMarker) { markerLayer.removeLayer(highlightMarker); highlightMarker = null; }
      highlightMarker = L.circleMarker([p.lat, p.lng], {
        radius: 16, color: '#00b8a9', weight: 3, fill: false, className: 'port-focus-ring'
      }).addTo(markerLayer);
    }
    renderPortDetail(x);
  }

  function renderPortDetail(x) {
    var p = x.p, box = el('portDetail');
    if (!box) return;
    box.innerHTML =
      '<div class="pd-head"><b>' + esc(p.ko) + '</b> <small>' + esc(p.en) + '</small>' +
      (x.locode ? '<span class="pd-loc">' + x.locode + '</span>' : '') +
      '<button class="pd-x" id="pdClose" aria-label="닫기">×</button></div>' +
      '<div class="pd-grade"><span class="st-badge st-' + p.level.toLowerCase() + '"><i class="lv-dot"></i>' +
      p.level + ' · ' + UI.LEVEL_KO[p.level] + '</span></div>' +
      '<div class="pd-rows">' +
      '<div class="row"><span>PCI (혼잡도 지수)</span><b>' + p.tpfs + '</b></div>' +
      '<div class="row"><span>접안 지연</span><b>' + p.delayH + 'h</b></div>' +
      '<div class="row"><span>대기 / 접안</span><b>' + p.waiting + ' / ' + p.berthed + '척</b></div>' +
      (x.cc ? '<div class="row"><span>국가</span><b>' + (CC_KO[x.cc] || x.cc) + '</b></div>' : '') +
      '</div>';
    box.hidden = false;
    var xb = el('pdClose');
    if (xb) xb.addEventListener('click', function () {
      box.hidden = true;
      if (highlightMarker && markerLayer) { markerLayer.removeLayer(highlightMarker); highlightMarker = null; }
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function initChips() {
    var wrap = el('levelChips');
    function render() {
      wrap.innerHTML = LEVEL_ORDER.map(function (lv) {
        var on = levelFilter[lv];
        var cnt = state.ports.filter(function (p) { return p.level === lv; }).length;
        return '<button class="f-chip' + (on ? '' : ' off') + '" data-lv="' + lv + '" aria-pressed="' + on + '">' +
          '<span class="sw" style="background:' + LEVEL_COLOR[lv] + ';"></span>' +
          lv + ' · ' + UI.LEVEL_KO[lv] + ' (' + cnt + ')' +
          '<span class="x">' + (on ? '×' : '+') + '</span></button>';
      }).join('');
      wrap.querySelectorAll('.f-chip').forEach(function (c) {
        c.addEventListener('click', function () {
          var lv = c.getAttribute('data-lv');
          levelFilter[lv] = !levelFilter[lv];
          render(); renderMap();
        });
      });
    }
    render();
  }

  /* ================= Section 05 대기 최장 ================= */
  function renderWaiting() {
    el('tbodyWaiting').innerHTML = state.waitingTop.map(function (w) {
      return '<tr><td class="rank">' + w.rank + '</td>' +
        '<td>' + portCell(w.ko, w.en, w.cc) + '</td>' +
        '<td>' + UI.levelBadgeShort(w.level) + '</td>' +
        '<td class="num"><b>' + fmt(w.waitH, 1) + 'h</b></td>' +
        '<td class="num">' + w.waiting + ' / ' + w.berthed + '척</td>' +
        '<td class="num"><span class="strong-days">' + fmt(w.waitDays, 1) + '일</span></td></tr>';
    }).join('');
  }

  /* ================= Section 06 병목 ================= */
  function renderBottleneck() {
    var max = Math.max.apply(null, state.bottleneck.map(function (b) { return Math.max(b.waitH, b.serviceH); })) || 1;
    el('bnChart').innerHTML = state.bottleneck.map(function (b) {
      return '<div class="bn-row" data-tip="<b>' + b.ko + '</b><br>대기 Tw ' + b.waitH + 'h · 하역 Ts ' + b.serviceH + 'h<br>Tw/Ts = ' + b.twts + '배">' +
        '<div class="bn-name">' + b.ko + ' ' + UI.levelBadgeShort(b.level) + '<small>' + b.en + '</small></div>' +
        '<div class="bn-bars">' +
        '<div class="bn-bar bn-wait" style="width:' + (b.waitH / max * 100) + '%;"></div>' +
        '<div class="bn-bar bn-service" style="width:' + (b.serviceH / max * 100) + '%;"></div>' +
        '</div>' +
        '<div class="bn-ratio">' + fmt(b.twts, 2) + '×<small>Tw/Ts</small></div>' +
        '</div>';
    }).join('');
  }

  /* ================= Section 07 하역 지연 ================= */
  function spark(d3arr, m1arr) {
    var all = d3arr.concat(m1arr);
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    var range = (max - min) || 1;
    var W = 110, H = 26, PAD = 2;
    function pts(arr, x0, x1) {
      return arr.map(function (v, i) {
        var x = x0 + (i / (arr.length - 1 || 1)) * (x1 - x0);
        var y = H - PAD - ((v - min) / range) * (H - PAD * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
    }
    return '<svg class="spark" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 3일 대비 1개월 추세">' +
      '<polyline class="s2" points="' + pts(m1arr, 0, W * 0.62) + '"/>' +
      '<polyline class="s1" points="' + pts(d3arr, W * 0.68, W) + '"/>' +
      '</svg>';
  }
  function renderDischarge() {
    el('tbodyDischarge').innerHTML = state.discharge.map(function (d) {
      return '<tr><td class="rank">' + d.rank + '</td>' +
        '<td>' + portCell(d.ko, d.en, '') + '</td>' +
        '<td><span style="font-size:12.5px; font-weight:700;">' + d.levelChange + '</span></td>' +
        '<td data-tip="<b>' + d.ko + '</b><br>3일 평균 ' + d.trend3d.join(' → ') + 'h<br>1개월 평균 ' + fmt(d.trend1m.reduce(function (a, b) { return a + b; }, 0) / d.trend1m.length, 1) + 'h">' + spark(d.trend3d, d.trend1m) + '</td>' +
        '<td class="num chg-up">+' + fmt(d.incrH, 1) + 'h</td></tr>';
    }).join('');
  }

  /* ================= Focus Port List ================= */
  function initFocusList() {
    var grid = el('focusGrid');
    var input = el('focusSearch');
    var match = el('focusMatch');
    var list = state.focusPorts;
    function render(q) {
      q = (q || '').trim().toLowerCase();
      var shown = list.filter(function (p) {
        return !q || p.ko.toLowerCase().indexOf(q) >= 0 || p.en.toLowerCase().indexOf(q) >= 0;
      });
      grid.innerHTML = shown.map(function (p) {
        return '<span class="p-chip">' + p.ko + ' <small>' + p.en + '</small></span>';
      }).join('');
      match.textContent = q ? shown.length + '개 일치' : '총 ' + list.length + '개';
    }
    input.addEventListener('input', function () { render(input.value); });
    render('');
  }

  /* ================= 국내 컨테이너 물동량 추이 (해수부 15059131, 2026-08-03) =================
     Edge Function `datago?api=teuimpexp` 경유. 주의사항 2가지:
     ① 응답 필드 접두사가 직관과 반대 — e* = 수입, t* = 수출 (data.go.kr 출력결과 정의 기준)
     ② 이 API는 numOfRows 상한이 50이라 12개월×12지역(144행)을 한 번에 못 받는다 → 페이지 순회 */
  var DATAGO = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/datago';
  var TEU_MONTHS = 12;

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
  function ymNum(d) { return d.getFullYear() * 100 + (d.getMonth() + 1); }
  function ymShort(v) { var s = String(v); return s.slice(2, 4) + '.' + s.slice(4, 6); }
  function teuFmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

  /* 50건 상한 때문에 페이지를 순차 조회해 전부 모은다 (144행 → 3페이지) */
  function fetchTeuPages(sym, eym, page, acc, done) {
    var p = new URLSearchParams({ api: 'teuimpexp', numOfRows: '50', pageNo: String(page), sym: sym, eym: eym });
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) { done(null); return; }
        var rows = res.data ? dgItems(res.data, 0) : null;
        if (!rows || !rows.length) { done(acc); return; }
        acc = acc.concat(rows);
        if (rows.length < 50 || page >= 6) done(acc);
        else fetchTeuPages(sym, eym, page + 1, acc, done);
      })
      .catch(function () { done(acc.length ? acc : null); });
  }

  function initTeuTrend() {
    var box = el('teuTrend');
    if (!box || typeof fetch === 'undefined') return;
    var now = new Date();
    var from = new Date(now.getFullYear(), now.getMonth() - (TEU_MONTHS - 1), 1);
    fetchTeuPages(String(ymNum(from)), String(ymNum(now)), 1, [], function (rows) {
      if (!rows || !rows.length) {
        box.innerHTML = '<p class="sc-sub" style="color:var(--muted);">물동량 데이터를 불러오지 못했습니다. (해수부 원천은 약 2개월 지연 공표됩니다)</p>';
        return;
      }
      renderTeuTrend(box, rows);
    });
  }

  function renderTeuTrend(box, rows) {
    /* 월별 집계 */
    var byMonth = {};
    rows.forEach(function (r) {
      var m = Number(r.useYm);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { imp: 0, exp: 0 };
      byMonth[m].imp += Number(r.eContnTeuTotal) || 0;   /* e* = 수입 */
      byMonth[m].exp += Number(r.tContnTeuTotal) || 0;   /* t* = 수출 */
    });
    var months = Object.keys(byMonth).map(Number).sort(function (a, b) { return a - b; });
    if (!months.length) return;
    var latest = months[months.length - 1];
    var max = months.reduce(function (a, m) { return Math.max(a, byMonth[m].imp + byMonth[m].exp); }, 0) || 1;

    /* 월별 누적 막대 — 기존 bn-chart 톤에 맞춘 인라인 스타일 */
    var bars = months.map(function (m) {
      var d = byMonth[m], tot = d.imp + d.exp;
      var h = tot / max * 100;
      var tip = ymShort(m) + ' · 수입 ' + teuFmt(d.imp) + ' / 수출 ' + teuFmt(d.exp) + ' TEU';
      return '<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; min-width:0;" title="' + esc(tip) + '">' +
        '<div style="width:100%; height:150px; display:flex; flex-direction:column; justify-content:flex-end;">' +
          '<div style="height:' + (h * d.exp / (tot || 1)) + '%; background:var(--series-2); border-radius:3px 3px 0 0;"></div>' +
          '<div style="height:' + (h * d.imp / (tot || 1)) + '%; background:var(--series-1);"></div>' +
        '</div>' +
        '<small style="color:var(--muted); font-size:10.5px; white-space:nowrap;">' + ymShort(m) + '</small></div>';
    }).join('');

    /* 최신월 지역별 순위 */
    var areas = rows.filter(function (r) { return Number(r.useYm) === latest; })
      .map(function (r) {
        return {
          nm: r.areaNm || '—',
          imp: Number(r.eContnTeuTotal) || 0,
          exp: Number(r.tContnTeuTotal) || 0
        };
      })
      .sort(function (a, b) { return (b.imp + b.exp) - (a.imp + a.exp); });
    var aMax = areas.length ? (areas[0].imp + areas[0].exp) : 1;

    var lt = byMonth[latest];
    box.innerHTML =
      '<div style="display:flex; align-items:flex-end; gap:6px; padding:4px 0 2px;">' + bars + '</div>' +
      '<p class="sc-sub" style="color:var(--muted); font-size:12px; margin:12px 0 20px;">' +
        '최신 ' + ymShort(latest).replace('.', '년 ') + '월 · 수입 ' + teuFmt(lt.imp) + ' TEU · 수출 ' + teuFmt(lt.exp) +
        ' TEU · 합계 <b style="color:var(--fg);">' + teuFmt(lt.imp + lt.exp) + ' TEU</b>' +
      '</p>' +
      '<div class="bn-chart">' + areas.map(function (a) {
        var tot = a.imp + a.exp;
        return '<div class="bn-row" data-tip="<b>' + esc(a.nm) + '</b><br>수입 ' + teuFmt(a.imp) + ' TEU · 수출 ' + teuFmt(a.exp) + ' TEU">' +
          '<div class="bn-name">' + esc(a.nm) + '</div>' +
          '<div class="bn-bars">' +
            '<div class="bn-bar bn-wait" style="width:' + (a.imp / aMax * 100) + '%;"></div>' +
            '<div class="bn-bar bn-service" style="width:' + (a.exp / aMax * 100) + '%;"></div>' +
          '</div>' +
          '<div class="bn-ratio">' + teuFmt(tot) + '<small>TEU</small></div>' +
          '</div>';
      }).join('') + '</div>';
  }

  /* ================= 항만별 선박 입출항 실적 (해수부 15059059, 2026-08-03) =================
     Edge Function `datago?api=portstat` 경유. 주의사항 2가지:
     ① 해수부 통계는 약 2개월 지연 공표라 최신월을 고정 조회할 수 없다 → 실적이 있는 달을 역순 탐색
     ② XML→JSON 변환분이라 items.item / details.detail 이 1건일 때 배열이 아닌 객체로 온다 → 배열 정규화 필수 */
  var PS_TOP = 15;                                   /* 표에 노출할 상위 항만청 수 */
  var PS_KINDS = ['국적선', '외국선', '연안선'];      /* details.detail[].nm 구분 */
  var PS_COLOR = { '국적선': 'var(--series-1)', '외국선': 'var(--series-2)', '연안선': 'var(--muted)' };

  function psArr(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
  function psNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function psFmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function psPct(part, whole) { return whole > 0 ? Math.round(part / whole * 1000) / 10 : 0; }
  function psCard(html) { return '<div class="card reveal in">' + html + '</div>'; }

  /* pmFindItems 와 동일한 관대한 탐색: 정규 경로를 먼저 보고, 구조가 바뀌면 dgItems 로 폴백 */
  function psItems(data) {
    if (!data) return [];
    var body = data.response && data.response.body;
    var rows = psArr(body && body.items ? body.items.item : null);
    if (!rows.length) rows = psArr(dgItems(data, 0));
    return rows.filter(function (r) { return r && r.prtAgNm != null; });
  }

  function psYm(back) {
    var d = new Date();
    d = new Date(d.getFullYear(), d.getMonth() - back, 1);
    return String(d.getFullYear() * 100 + (d.getMonth() + 1));
  }

  function psFetch(ym) {
    var p = new URLSearchParams({ api: 'portstat', numOfRows: '50', sym: ym, eym: ym });
    return fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) return { needKey: true, guide: res.guide };
        return { rows: psItems(res.data) };
      })
      .catch(function () { return { rows: [] }; });
  }

  /* 실적이 존재하는 최신월 탐색 (1개월 전부터 역순, 최대 6개월) */
  function psFindLatest(back) {
    if (back > 6) return Promise.resolve(null);
    var ym = psYm(back);
    return psFetch(ym).then(function (res) {
      if (res.needKey) return res;
      if (res.rows.length) return { ym: ym, rows: res.rows };
      return psFindLatest(back + 1);
    });
  }

  function initPortStat() {
    var box = el('portStat');
    if (!box || typeof fetch === 'undefined') return;
    function fail() {
      box.innerHTML = psCard('<p class="sc-sub" style="color:var(--muted); margin:0;">입출항 실적 데이터를 불러오지 못했습니다. (해수부 원천은 약 2개월 지연 공표됩니다)</p>');
    }
    psFindLatest(1).then(function (r) {
      if (!r) { fail(); return; }
      if (r.needKey) {
        box.innerHTML = psCard('<h3 style="margin-top:0; font-size:15px;">data.go.kr 공공 API 키가 아직 등록되지 않았습니다</h3>' +
          '<p class="sc-sub">' + esc(r.guide) + '</p>' +
          '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://www.data.go.kr/data/15059059/openapi.do">data.go.kr 활용신청 페이지 ↗</a>');
        return;
      }
      renderPortStat(box, r.ym, r.rows);
    }).catch(fail);
  }

  function renderPortStat(box, ym, rows) {
    var tot = { etr: 0, sat: 0, grt: 0 };
    var kindAll = { '국적선': 0, '외국선': 0, '연안선': 0 };

    var ports = rows.map(function (r) {
      var o = { nm: r.prtAgNm || '—', etr: 0, sat: 0, grt: 0, kind: {} };
      psArr(r.details ? r.details.detail : null).forEach(function (d) {
        if (!d) return;
        var k = String(d.nm == null ? '' : d.nm);
        var e = psNum(d.etrVsslCo);
        o.etr += e;
        o.sat += psNum(d.satVsslCo);
        o.grt += psNum(d.etrGrtg);
        o.kind[k] = (o.kind[k] || 0) + e;
        if (kindAll[k] != null) kindAll[k] += e;
      });
      tot.etr += o.etr; tot.sat += o.sat; tot.grt += o.grt;
      return o;
    }).sort(function (a, b) { return b.etr - a.etr; });

    if (!ports.length) {
      box.innerHTML = psCard('<p class="sc-sub" style="color:var(--muted); margin:0;">입출항 실적 데이터를 불러오지 못했습니다. (해수부 원천은 약 2개월 지연 공표됩니다)</p>');
      return;
    }

    var ymLabel = String(ym).slice(0, 4) + '년 ' + Number(String(ym).slice(4, 6)) + '월';
    var oceanPct = psPct(kindAll['국적선'] + kindAll['외국선'], tot.etr);

    /* 국적선/외국선/연안선 구성 미니 스택바 (teuTrend 와 동일하게 인라인 스타일 사용) */
    function kindBar(kind, base) {
      var tip = PS_KINDS.map(function (k) { return k + ' ' + psPct(kind[k] || 0, base) + '%'; }).join(' · ');
      var segs = PS_KINDS.map(function (k) {
        return '<div style="width:' + psPct(kind[k] || 0, base) + '%; background:' + PS_COLOR[k] + ';"></div>';
      }).join('');
      return '<div title="' + esc(tip) + '" style="display:flex; height:8px; min-width:110px; border-radius:4px; overflow:hidden; background:var(--surface-2);">' + segs + '</div>';
    }

    var kpis =
      '<div class="grid-3" style="margin-bottom:14px;">' +
        '<div class="kpi reveal in"><div class="k">총 입항 척수</div>' +
          '<div class="v">' + psFmt(tot.etr) + '<small>척</small></div>' +
          '<div class="sub">' + ymLabel + ' 기준 · 전국 ' + ports.length + '개 항만청 합계</div></div>' +
        '<div class="kpi reveal in"><div class="k">입항 총톤수</div>' +
          '<div class="v">' + psFmt(tot.grt / 10000) + '<small>만 GT</small></div>' +
          '<div class="sub">총 출항 척수 ' + psFmt(tot.sat) + '척</div></div>' +
        '<div class="kpi reveal in"><div class="k">외항선 비중</div>' +
          '<div class="v">' + oceanPct + '<small>%</small></div>' +
          '<div class="sub">국적선 ' + psPct(kindAll['국적선'], tot.etr) + '% · 외국선 ' + psPct(kindAll['외국선'], tot.etr) +
            '% · 연안선 ' + psPct(kindAll['연안선'], tot.etr) + '% (입항 척수 기준)</div></div>' +
      '</div>';

    var body = ports.slice(0, PS_TOP).map(function (p, i) {
      return '<tr><td class="rank">' + (i + 1) + '</td>' +
        '<td><b>' + esc(p.nm) + '</b></td>' +
        '<td class="num"><b>' + psFmt(p.etr) + '</b></td>' +
        '<td class="num">' + psFmt(p.sat) + '</td>' +
        '<td class="num">' + psFmt(p.grt) + '</td>' +
        '<td>' + kindBar(p.kind, p.etr) + '</td></tr>';
    }).join('') +
      '<tr style="border-top:2px solid var(--border);"><td></td>' +
      '<td><b>전국 합계</b></td>' +
      '<td class="num"><b>' + psFmt(tot.etr) + '</b></td>' +
      '<td class="num"><b>' + psFmt(tot.sat) + '</b></td>' +
      '<td class="num"><b>' + psFmt(tot.grt) + '</b></td>' +
      '<td>' + kindBar(kindAll, tot.etr) + '</td></tr>';

    box.innerHTML = kpis +
      '<div class="tbl-card reveal in">' +
        '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          '<th>#</th><th>항만</th><th class="num">입항 척수</th><th class="num">출항 척수</th>' +
          '<th class="num">입항 총톤 (GT)</th><th>선적 구성</th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '</div>' +
      '<div class="legend-row" style="margin-top:14px;">' +
        PS_KINDS.map(function (k) {
          return '<span class="item"><span class="sw" style="background:' + PS_COLOR[k] + ';"></span>' + k + '</span>';
        }).join('') +
      '</div>' +
      '<p class="sc-sub" style="color:var(--muted); font-size:12px; margin:10px 0 0;">' +
        '입항 척수 상위 항만청만 표시하며, 합계 행은 전국 전체 항만청 기준입니다. 선적 구성은 입항 척수 기준입니다.</p>';
  }

  /* ================= 스크롤 스파이 ================= */
  function initScrollSpy() {
    var links = document.querySelectorAll('.anchor-tabs a');
    var ids = Array.prototype.map.call(links, function (a) { return a.getAttribute('href').slice(1); });
    var sections = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    window.addEventListener('scroll', function () {
      var pos = window.scrollY + 150;
      var current = ids[0];
      sections.forEach(function (s) { if (s.offsetTop <= pos) current = s.id; });
      links.forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + current);
      });
    }, { passive: true });
  }
})();
