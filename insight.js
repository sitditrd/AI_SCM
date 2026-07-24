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

    refresh(true);
    initTabs();
    initChips();
    initMap();
    renderMap();
    initFocusList();
    initScrollSpy();
    initStampTicker();

    document.getElementById('refreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('spin');
      setTimeout(function () { btn.classList.remove('spin'); }, 600);
      tick += 1; refresh(false);
    });
    /* 실시간 폴링 (데모: 45초) — [교체] 실서비스에서는 API 폴링/SSE */
    setInterval(function () { tick += 1; refresh(false); }, 45000);
  });

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
    renderDischarge();
    if (map) renderMap();
    if (!first) ['kpiTpfs', 'kpiCritical', 'kpiRisk', 'kpiDelay'].forEach(flash);
    updateStamp();
    UI.bindTooltips(document);
  }

  function initStampTicker() {
    setInterval(updateStamp, 5000);
  }
  function updateStamp() {
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
    el('vTpfsGrade').innerHTML = '현재 구간: ' + UI.levelBadge(s.tpfsGrade);
    el('periodLabel').textContent = s.periodStart + ' ~ ' + s.periodEnd;
    el('focusCountLabel').textContent = DATA.focusCount;
    drawGauge(s.tpfs);

    /* 분포 스택바 (2px 갭 + 라벨 병기) */
    var bar = el('distBar');
    bar.innerHTML = s.distribution.map(function (d) {
      return '<div class="dist-seg seg-' + d.level.toLowerCase() + '" style="flex:' + d.ratio + ' 1 0;" ' +
        'data-tip="<b>' + d.level + ' · ' + UI.LEVEL_KO[d.level] + '</b><br>' + d.count + '개 항만 (' + d.ratio + '%)<br>전기 대비 ' + (d.delta > 0 ? '▲' : '▼') + Math.abs(d.delta) + '">' +
        '<span>' + d.level + ' ' + d.ratio + '%</span></div>';
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
      var tr = r.trend === 'up' ? '<span class="trend-up" data-tip="전기 대비 악화">▲ 악화</span>'
        : r.trend === 'down' ? '<span class="trend-down" data-tip="전기 대비 개선">▼ 개선</span>'
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

    el('tbodyWorsening').innerHTML = state.worsening.map(function (m) {
      return '<tr><td class="rank">' + m.rank + '</td>' +
        '<td>' + portCell(m.ko, m.en, m.cc) + '</td>' +
        '<td class="num"><span class="chg-up">▲' + fmt(m.pciChange, 1) + '</span></td>' +
        '<td class="num chg-up">+' + fmt(m.delayIncH, 1) + 'h</td>' +
        '<td class="num">' + fmt(m.curDelayH, 1) + 'h</td></tr>';
    }).join('');

    el('tbodyImproving').innerHTML = state.improving.map(function (m) {
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
        '<div class="row"><span>TW-PFS</span><span>' + p.tpfs + '</span></div>' +
        '<div class="row"><span>접안 지연</span><span>' + p.delayH + 'h</span></div>' +
        '<div class="row"><span>대기/접안</span><span>' + p.waiting + ' / ' + p.berthed + '척</span></div></div>',
        { closeButton: false }
      );
      m.on('mouseover', function () { this.openPopup(); });
      m.on('mouseout', function () { this.closePopup(); });
      markerLayer.addLayer(m);
    });
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
