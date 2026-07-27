/* =========================================================
   TWL 경로 분석 — 사전계산 항로(정적 JSON) + 몬테카를로 소요일 시뮬레이터
   거리: routes/<origin>.json (searoute로 8,556개 구간 사전계산 — 배포판에서도 동작)
   ========================================================= */
(function () {
  'use strict';

  var map = null, routeLayer = null, ports = [];

  function el(id) { return document.getElementById(id); }
  function slugOf(en) { return en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ---------- 난수: 정규(Box-Muller)·로그정규 ---------- */
  function randn() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function simulate(nm, meanKn) {
    var N = 10000, days = new Array(N);
    for (var i = 0; i < N; i++) {
      var kn = Math.min(23, Math.max(11, meanKn + randn() * 1.5));   /* 속력: 정규, 11~23kn 절단 */
      var sail = nm / (kn * 24);
      var buffer = Math.min(8, Math.max(0.2, Math.exp(Math.log(1.2) + randn() * 0.5))); /* 항만 버퍼: 로그정규 */
      days[i] = sail + buffer;
    }
    days.sort(function (a, b) { return a - b; });
    return {
      p10: days[Math.floor(N * 0.10)], p50: days[Math.floor(N * 0.50)],
      p90: days[Math.floor(N * 0.90)], min: days[0], max: days[N - 1], all: days
    };
  }

  function kpi(name, big, sub) {
    return '<div class="src-card"><div class="sc-top"><b>' + name + '</b></div>' +
      '<div class="sc-big">' + big + '</div><div class="sc-sub">' + sub + '</div></div>';
  }

  function drawHisto(r) {
    var bins = 28, lo = r.min, hi = Math.min(r.max, r.p90 * 1.35);
    var w = (hi - lo) / bins, counts = new Array(bins).fill(0);
    r.all.forEach(function (d) {
      var b = Math.floor((d - lo) / w);
      if (b >= 0 && b < bins) counts[b]++;
    });
    var mx = Math.max.apply(null, counts);
    el('histo').innerHTML = counts.map(function (c, i) {
      var x = lo + w * (i + 0.5);
      var inP = x >= r.p10 && x <= r.p90;
      return '<div title="' + x.toFixed(1) + '일: ' + c + '회" style="flex:1; height:' + Math.max(2, c / mx * 100) + '%; border-radius:3px 3px 0 0; background:' +
        (inP ? 'var(--brand-accent-2)' : 'color-mix(in srgb, var(--muted) 35%, transparent)') + ';"></div>';
    }).join('');
    el('histoAxis').innerHTML = '<span>' + lo.toFixed(0) + '일</span><span>P50 ' + r.p50.toFixed(1) + '일</span><span>' + hi.toFixed(0) + '일+</span>';
  }

  function initMap() {
    if (typeof L === 'undefined') { el('mapCard').classList.add('no-map'); return; }
    map = L.map('map', { worldCopyJump: true, minZoom: 1, scrollWheelZoom: false }).setView([25, 60], 2);
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (dark ? 'dark_all' : 'light_all') + '/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd' }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }

  function run() {
    var o = ports[+el('fromPort').value], d = ports[+el('toPort').value];
    var kn = parseFloat(el('speedKn').value) || 16.5;
    if (!o || !d || o === d) return;
    el('simKpis').innerHTML = '<div class="src-card"><div class="sc-sub">항로 계산 중… (searoute)</div></div>';
    fetch('routes/' + slugOf(o.en) + '.json')
      .then(function (r) { if (!r.ok) throw new Error('항로 데이터를 찾을 수 없습니다 (HTTP ' + r.status + ')'); return r.json(); })
      .then(function (all) {
        var res = all[slugOf(d.en)];
        if (!res) throw new Error('해당 구간의 사전계산 항로가 없습니다');
        var r = simulate(res.nm, kn);
        el('simKpis').innerHTML =
          kpi('항로 거리', Number(res.nm).toLocaleString('ko-KR') + ' <small>해리(nm)</small>', o.ko + ' → ' + d.ko + ' · 항로망 최단경로') +
          kpi('예상 소요일 P50', r.p50.toFixed(1) + ' <small>일</small>', '중앙값 · 평균 속력 ' + kn + 'kn 기준') +
          kpi('신뢰 구간 P10~P90', r.p10.toFixed(1) + '~' + r.p90.toFixed(1) + ' <small>일</small>', '10회 중 8회는 이 구간 내 도착') +
          kpi('지연 리스크', ((r.p90 - r.p50)).toFixed(1) + ' <small>일</small>', 'P50 대비 P90 추가 소요 (버퍼 권장치)');
        drawHisto(r);
        if (map) {
          routeLayer.clearLayers();
          var latlngs = res.line;   /* 사전계산 시 [lat,lng]로 저장됨 */
          L.polyline(latlngs, { color: '#3987e5', weight: 3, opacity: 0.85 }).addTo(routeLayer);
          L.circleMarker([o.lat, o.lng], { radius: 6, color: '#00b8a9', fillOpacity: 0.9 }).bindPopup(o.ko).addTo(routeLayer);
          L.circleMarker([d.lat, d.lng], { radius: 6, color: '#d03b3b', fillOpacity: 0.9 }).bindPopup(d.ko).addTo(routeLayer);
          map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [30, 30] });
        }
      })
      .catch(function (e) {
        el('simKpis').innerHTML = '<div class="src-card"><b>계산 실패</b><div class="sc-sub">' + e.message + '</div></div>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ports = window.TWDATA.getState(1).ports.slice().sort(function (a, b) { return a.ko.localeCompare(b.ko, 'ko'); });
    var opts = ports.map(function (p, i) { return '<option value="' + i + '">' + p.ko + ' (' + p.en + ')</option>'; }).join('');
    el('fromPort').innerHTML = opts;
    el('toPort').innerHTML = opts;
    /* 기본: 부산 → 로테르담 */
    ports.forEach(function (p, i) {
      if (p.en === 'Busan') el('fromPort').value = i;
      if (p.en === 'Rotterdam') el('toPort').value = i;
    });
    initMap();
    el('simBtn').addEventListener('click', run);
    run();
  });
})();
