/* =========================================================
   TWL 해외 스케줄 — 항공 화물편 스케줄 (인천국제공항공사 공공 API)
   Edge Function `datago` 경유 · 별칭 aircargoarr / aircargodep / airschedarr
   - 도착·출발 운항현황(15113461): 실시간 편별 현황 (예정/변경 시각, 게이트, 상태)
   - 정기 운항편(15114086): 시즌 단위 요일별 운항 계획
   ========================================================= */
(function () {
  'use strict';

  var DATAGO = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/datago';
  var mode = 'arr';   /* arr | dep | sched */

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function card(html) { return '<div class="card reveal in">' + html + '</div>'; }

  /* data.go.kr 응답(response.body.items[]) 변형에 대비해 첫 객체 배열을 관대하게 탐색 */
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

  /* 시각 표기가 API마다 다르다 — 운항현황(15113461)은 12자리 YYYYMMDDHHmm,
     정기운항편(15114086)의 st 는 4자리 HHmm. 둘 다 받아 "HH:mm" 으로 통일한다. */
  function hhmm(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    if (s.length >= 12) return s.slice(8, 10) + ':' + s.slice(10, 12);
    if (s.length >= 4) return s.slice(0, 2) + ':' + s.slice(2, 4);
    return s || '—';
  }
  function ymd(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return s.length >= 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : '—';
  }
  /* 12자리 타임스탬프에서 날짜(MM-DD)만 — 운항현황은 D-3~+6일 범위라 날짜 구분이 필요하다 */
  function mmdd(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return s.length >= 8 ? s.slice(4, 6) + '-' + s.slice(6, 8) : '—';
  }

  var DAYS = [
    ['monday', '월'], ['tuesday', '화'], ['wednesday', '수'], ['thursday', '목'],
    ['friday', '금'], ['saturday', '토'], ['sunday', '일']
  ];
  /* 정기 운항편의 요일 7개 Y/N 을 "월·수·금" 형태로 압축 */
  function dayChips(it) {
    var on = DAYS.filter(function (d) { return String(it[d[0]] || '').toUpperCase() === 'Y'; });
    if (!on.length) return '—';
    if (on.length === 7) return '매일';
    return on.map(function (d) { return d[1]; }).join('·');
  }

  var COLS = {
    arr: [
      { h: '일자', v: function (x) { return mmdd(x.scheduleDateTime || x.scheduleDatetime); } },
      { h: '편명', v: function (x) { return x.flightId || x.flightid || '—'; } },
      { h: '항공사', v: function (x) { return x.airline || '—'; } },
      { h: '출발지', v: function (x) { return (x.airport || '—') + (x.airportCode ? ' (' + x.airportCode + ')' : ''); } },
      { h: '예정', v: function (x) { return hhmm(x.scheduleDateTime || x.scheduleDatetime); } },
      { h: '변경', v: function (x) { return hhmm(x.estimatedDateTime || x.estimatedDatetime); } },
      { h: '터미널', v: function (x) { return x.terminalId || '—'; } },
      { h: '상태', v: function (x) { return x.remark || '—'; } }
    ],
    sched: [
      { h: '편명', v: function (x) { return x.flightid || x.flightId || '—'; } },
      { h: '항공사', v: function (x) { return x.airline || '—'; } },
      { h: '상대공항', v: function (x) { return (x.airport || '—') + (x.airportCode ? ' (' + x.airportCode + ')' : ''); } },
      { h: '운항 요일', v: function (x) { return dayChips(x); } },
      { h: '시각', v: function (x) { return hhmm(x.st); } },
      { h: '운항 기간', v: function (x) { return ymd(x.firstdate) + ' ~ ' + ymd(x.lastdate); } },
      { h: '시즌', v: function (x) { return x.season || '—'; } }
    ]
  };
  COLS.dep = COLS.arr.map(function (c) {
    return c.h === '출발지' ? { h: '목적지', v: c.v } : c;
  });

  var ALIAS = { arr: 'aircargoarr', dep: 'aircargodep', sched: 'airschedarr' };
  var TITLE = { arr: '화물편 도착 현황', dep: '화물편 출발 현황', sched: '정기 화물 운항편' };

  function search() {
    var out = el('airOut');
    if (!out) return;
    out.innerHTML = card('<div class="sc-sub">항공 화물편 조회 중…</div>');

    var p = new URLSearchParams({ api: ALIAS[mode], numOfRows: '50' });
    var f = el('airFlight').value.trim(), a = el('airPort').value.trim();
    /* 운항현황(15113461)과 정기운항편(15114086)은 검색 파라미터명이 다르다 */
    if (mode === 'sched') {
      if (a) p.set('airport', a);
    } else {
      if (f) p.set('flight_id', f);
      if (a) p.set('airport_code', a);
    }

    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) {
          out.innerHTML = card('<h3 style="margin-top:0; font-size:15px;">data.go.kr 공공 API 키가 아직 등록되지 않았습니다</h3>' +
            '<p class="sc-sub">' + esc(res.guide) + '</p>');
          return;
        }
        var items = res.data ? dgItems(res.data, 0) : null;
        /* 정기운항편 탭은 편명 조건을 API가 받지 않으므로 클라이언트에서 걸러준다 */
        if (items && mode === 'sched' && f) {
          var q = f.toUpperCase();
          items = items.filter(function (x) { return String(x.flightid || x.flightId || '').toUpperCase().indexOf(q) >= 0; });
        }
        if (!items || !items.length) {
          out.innerHTML = card('<div class="sc-sub">조회 결과가 없습니다. 조건(편명·공항코드)을 바꿔 다시 시도하십시오.</div>');
          return;
        }
        var cols = COLS[mode];
        out.innerHTML = card(
          '<h3 style="margin-top:0; font-size:15px;">' + TITLE[mode] +
            ' <small style="color:var(--muted);">' + items.length + '건 · 인천국제공항공사</small></h3>' +
          '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          cols.map(function (c) { return '<th>' + c.h + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          items.map(function (x) {
            return '<tr>' + cols.map(function (c) { return '<td>' + esc(c.v(x)) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
      })
      .catch(function () {
        out.innerHTML = card('<div class="sc-sub">조회 실패 — 잠시 후 다시 시도하십시오.</div>');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var sec = document.getElementById('aircargo');
    if (!sec) return;
    var tabs = sec.querySelectorAll('.view-tab[data-air]');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        mode = t.getAttribute('data-air');
        tabs.forEach(function (x) {
          var on = x === t;
          x.classList.toggle('active', on);
          x.setAttribute('aria-selected', on);
        });
        search();
      });
    });
    el('airBtn').addEventListener('click', search);
    ['airFlight', 'airPort'].forEach(function (id) {
      el(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
    });
    search();
  });
})();
