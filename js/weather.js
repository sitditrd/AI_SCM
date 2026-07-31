/* =========================================================
   TWL 항만 기상 카드 — Open-Meteo (무료·API 키 불필요·CORS 허용)
   파고: marine-api.open-meteo.com · 바람: api.open-meteo.com
   ========================================================= */
(function () {
  'use strict';

  var PORTS = [
    { ko: '부산신항', lat: 35.05, lng: 128.79 },
    { ko: '광양항',   lat: 34.88, lng: 127.72 },
    { ko: '인천항',   lat: 37.42, lng: 126.60 }
  ];

  function j(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }

  function waveLevel(h) {
    if (h == null) return ['—', ''];
    if (h >= 2.5) return ['높음', 'var(--lv-congested)'];
    if (h >= 1.5) return ['주의', 'var(--lv-busy)'];
    return ['양호', 'var(--lv-low)'];
  }

  function load() {
    var grid = document.getElementById('wxGrid');
    if (!grid) return;
    grid.innerHTML = PORTS.map(function (p, i) {
      return '<div class="kpi" id="wx' + i + '"><div class="k">' + p.ko + '</div>' +
        '<div class="v" style="font-size:24px;">로딩…</div><div class="sub">—</div></div>';
    }).join('');

    PORTS.forEach(function (p, i) {
      var marine = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + p.lat + '&longitude=' + p.lng +
        '&current=wave_height,wave_period&timezone=Asia%2FSeoul';
      var wind = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lng +
        '&current=wind_speed_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul';
      Promise.all([j(marine).catch(function () { return null; }), j(wind).catch(function () { return null; })])
        .then(function (res) {
          var card = document.getElementById('wx' + i);
          if (!card) return;
          var mw = res[0] && res[0].current, wd = res[1] && res[1].current;
          var wave = mw ? mw.wave_height : null;
          var lv = waveLevel(wave);
          card.innerHTML = '<div class="k">' + p.ko +
            (lv[1] ? ' <span class="lv-badge" style="color:' + lv[1] + '; background: color-mix(in srgb, ' + lv[1] + ' 13%, transparent);"><i class="lv-dot"></i>' + lv[0] + '</span>' : '') + '</div>' +
            '<div class="v" style="font-size:24px;">' + (wave != null ? '파고 ' + wave.toFixed(1) + 'm' : '—') + '</div>' +
            '<div class="sub">' +
            (mw && mw.wave_period != null ? '파주기 ' + mw.wave_period.toFixed(1) + 's · ' : '') +
            (wd && wd.wind_speed_10m != null ? '풍속 ' + wd.wind_speed_10m.toFixed(1) + 'm/s' : '풍속 —') +
            (wd && wd.wind_gusts_10m != null ? ' (돌풍 ' + wd.wind_gusts_10m.toFixed(1) + ')' : '') +
            '</div>';
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    setInterval(load, 30 * 60 * 1000);   /* 30분마다 갱신 */
  });
})();
