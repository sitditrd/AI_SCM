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

  /* 도착 소요일 분포 — SVG 히스토그램(신뢰구간 밴드·밀도곡선·P10/P50/P90 마커·그리드·호버) */
  function drawHisto(r) {
    var N = r.all.length;
    /* 극단 꼬리를 다듬어 분포 본체가 화면을 꽉 채우도록 범위 설정 */
    var lo = Math.max(r.min, r.p10 - 1.6 * (r.p50 - r.p10));
    var hi = Math.min(r.max, r.p90 + 1.6 * (r.p90 - r.p50));
    if (!(hi > lo)) { lo = r.min; hi = r.max; }
    var bins = 34, bw = (hi - lo) / bins, counts = new Array(bins).fill(0);
    r.all.forEach(function (d) {
      if (d < lo || d > hi) return;
      var b = Math.floor((d - lo) / bw); if (b === bins) b = bins - 1;
      if (b >= 0 && b < bins) counts[b]++;
    });
    var mx = Math.max.apply(null, counts) || 1;

    var W = 1000, H = 300, padL = 48, padR = 18, padT = 44, padB = 44;
    var x0 = padL, x1 = W - padR, pw = x1 - x0, y0 = padT, y1 = H - padB, ph = y1 - y0;
    var xOf = function (day) { return x0 + (day - lo) / (hi - lo) * pw; };
    var yOf = function (c) { return y1 - c / mx * ph; };
    var f1 = function (n) { return n.toFixed(1); };

    var s = '<svg class="histo-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="도착 소요일 분포 히스토그램">';
    s += '<defs><linearGradient id="histoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="hg0"/><stop offset="1" class="hg1"/></linearGradient></defs>';
    /* P10~P90 신뢰구간 밴드 */
    s += '<rect class="histo-band" x="' + f1(xOf(r.p10)) + '" y="' + y0 + '" width="' + f1(xOf(r.p90) - xOf(r.p10)) + '" height="' + ph + '" rx="4"/>';
    /* y 그리드 + 빈도(%) 라벨 */
    [0.25, 0.5, 0.75, 1].forEach(function (fr) {
      var yy = yOf(mx * fr);
      s += '<line class="histo-grid" x1="' + x0 + '" y1="' + f1(yy) + '" x2="' + x1 + '" y2="' + f1(yy) + '"/>';
      s += '<text class="histo-ylabel" x="' + (x0 - 7) + '" y="' + f1(yy + 3) + '" text-anchor="end">' + (mx * fr / N * 100).toFixed(1) + '%</text>';
    });
    s += '<line class="histo-baseline" x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '"/>';
    /* 막대 */
    for (var i = 0; i < bins; i++) {
      var c = counts[i]; if (!c) continue;
      var bx = xOf(lo + bw * i), bx2 = xOf(lo + bw * (i + 1)), center = lo + bw * (i + 0.5);
      var inP = center >= r.p10 && center <= r.p90, by = yOf(c);
      s += '<rect class="histo-bar' + (inP ? ' in' : '') + '" x="' + f1(bx + 0.9) + '" y="' + f1(by) + '" width="' + f1(Math.max(1, bx2 - bx - 1.8)) + '" height="' + f1(y1 - by) + '" rx="2"><title>' + center.toFixed(1) + '일 · ' + c + '회 (' + (c / N * 100).toFixed(1) + '%)</title></rect>';
    }
    /* 밀도 곡선(3점 평활) */
    var sm = counts.map(function (c, i) { return ((counts[i - 1] || 0) + 2 * c + (counts[i + 1] || 0)) / 4; });
    var pts = sm.map(function (c, i) { return [xOf(lo + bw * (i + 0.5)), yOf(c)]; });
    var path = 'M' + f1(pts[0][0]) + ' ' + f1(pts[0][1]);
    for (var k = 1; k < pts.length; k++) {
      var mxp = (pts[k - 1][0] + pts[k][0]) / 2, myp = (pts[k - 1][1] + pts[k][1]) / 2;
      path += ' Q' + f1(pts[k - 1][0]) + ' ' + f1(pts[k - 1][1]) + ' ' + f1(mxp) + ' ' + f1(myp);
    }
    path += ' L' + f1(pts[pts.length - 1][0]) + ' ' + f1(pts[pts.length - 1][1]);
    s += '<path class="histo-curve" d="' + path + '"/>';
    /* P10/P50/P90 세로 마커 + 라벨 */
    [['p10', r.p10, 'P10'], ['p50', r.p50, 'P50'], ['p90', r.p90, 'P90']].forEach(function (p) {
      var px = xOf(p[1]);
      s += '<line class="histo-pline ' + p[0] + '" x1="' + f1(px) + '" y1="' + (y0 - 4) + '" x2="' + f1(px) + '" y2="' + y1 + '"/>';
      s += '<text class="histo-plabel ' + p[0] + '" x="' + f1(px) + '" y="' + (y0 - 12) + '" text-anchor="middle">' + p[2] + ' ' + p[1].toFixed(1) + '일</text>';
    });
    /* x 눈금 */
    for (var t = 0; t <= 5; t++) {
      var day = lo + (hi - lo) * t / 5, tx = xOf(day);
      s += '<line class="histo-grid" x1="' + f1(tx) + '" y1="' + y1 + '" x2="' + f1(tx) + '" y2="' + (y1 + 5) + '"/>';
      s += '<text class="histo-tick" x="' + f1(tx) + '" y="' + (y1 + 21) + '" text-anchor="middle">' + day.toFixed(0) + '일</text>';
    }
    s += '</svg>';
    el('histo').innerHTML = s;
    el('histoAxis').innerHTML =
      '<span class="hl"><i class="hl-sw in"></i>P10~P90 (80% 구간)</span>' +
      '<span class="hl"><i class="hl-sw out"></i>그 외</span>' +
      '<span class="hl"><i class="hl-sw curve"></i>밀도 곡선</span>' +
      '<span class="hl hl-r">중앙값 P50 ' + r.p50.toFixed(1) + '일 · 표본 ' + N.toLocaleString('ko-KR') + '회</span>';
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
