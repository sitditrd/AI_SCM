/* =========================================================
   TWL 선박 위치 — 항만 전환 칩 + 선명/항차 검색(선석배정 DB 연계)
   검색 결과에서: 해당 항만 지도 전환 · VesselFinder 실시간 위치 링크
   ========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv'; /* 읽기 전용(RLS) */
  var PORT_OF_TERMINAL = {
    PNIT: 'busan', PNC: 'busan', HJNC: 'busan', HPNT: 'busan', BNCT: 'busan', DGT: 'busan',
    GWCT: 'gwangyang', E1CT: 'incheon', ICON: 'incheon'
  };
  var STATUS_KO = { PLANNED: '예정', ARRIVED: '접안', WORKING: '작업중', DEPARTED: '출항' };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function dt(v) { return v ? String(v).slice(5, 16).replace('T', ' ') : '—'; }

  function search(q) {
    var box = el('shipResults');
    if (!q || q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="src-card"><div class="sc-sub">검색 중…</div></div>';
    var enc = encodeURIComponent('*' + q + '*');
    var url = SUPABASE_URL + '/rest/v1/bs_vessel_calls' +
      '?select=collected_date,terminal_cd,berth,vessel_name,voyage,carrier,eta,etd,status' +
      '&or=(vessel_name.ilike.' + enc + ',voyage.ilike.' + enc + ')' +
      '&order=collected_date.desc,eta.asc&limit=12';
    fetch(url, { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        /* 최신 수집일 우선, 동일 선박·항차 중복 제거 */
        var seen = {}, list = [];
        rows.forEach(function (r) {
          var k = r.vessel_name + '|' + (r.voyage || '');
          if (!seen[k]) { seen[k] = 1; list.push(r); }
        });
        list = list.slice(0, 6);
        if (!list.length) {
          box.innerHTML = '<div class="src-card"><b>' + esc(q) + '</b><div class="sc-sub">선석배정 DB에서 찾지 못했습니다. 철자를 확인하거나, 아래 버튼으로 외부 실시간 검색을 이용하십시오.</div>' +
            '<div><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.vesselfinder.com/vessels?name=' + encodeURIComponent(q) + '">VesselFinder에서 실시간 검색 ↗</a></div></div>';
          return;
        }
        box.innerHTML = list.map(function (r) {
          var portKey = PORT_OF_TERMINAL[r.terminal_cd] || 'busan';
          var vfUrl = 'https://www.vesselfinder.com/vessels?name=' + encodeURIComponent(r.vessel_name);
          return '<div class="src-card">' +
            '<div class="sc-top"><b>' + esc(r.vessel_name) + '</b>' +
            '<span class="st-badge st-' + String(r.status || 'PLANNED').toLowerCase() + '"><i class="lv-dot"></i>' + (STATUS_KO[r.status] || r.status) + '</span></div>' +
            '<div class="sc-sub">' + esc(r.terminal_cd) + ' · 선석 ' + esc(r.berth || '—') + ' · ' + esc(r.carrier || '—') +
            (r.voyage ? ' · ' + esc(r.voyage) : '') + '</div>' +
            '<div class="sc-sub">접안 ' + dt(r.eta) + ' → 출항 ' + dt(r.etd) + ' <small>(' + esc(r.collected_date) + ' 수집)</small></div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">' +
            '<a class="btn btn-primary" style="padding:7px 12px; font-size:12.5px;" href="vessel.html?port=' + portKey + '&q=' + encodeURIComponent(q) + '">해당 항만 지도로 이동</a>' +
            '<a class="btn btn-ghost" style="padding:7px 12px; font-size:12.5px;" target="_blank" rel="noopener" href="' + vfUrl + '">실시간 위치(VesselFinder) ↗</a>' +
            '</div></div>';
        }).join('');
      })
      .catch(function () {
        box.innerHTML = '<div class="src-card"><div class="sc-sub">검색 실패 — 네트워크 확인 후 다시 시도하십시오.</div></div>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* 항만 선택 칩 (q 유지한 채 재로드) */
    var P = window.__VF_PORTS, cur = window.__VF_KEY;
    var q0 = new URLSearchParams(location.search).get('q') || '';
    el('portSel').innerHTML = Object.keys(P).map(function (k) {
      var href = 'vessel.html?port=' + k + (q0 ? '&q=' + encodeURIComponent(q0) : '');
      return '<a class="f-chip' + (k === cur ? '' : ' off') + '" href="' + href + '">' + P[k].ko + '</a>';
    }).join('');

    var input = el('shipSearch');
    el('shipSearchBtn').addEventListener('click', function () { search(input.value.trim()); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(input.value.trim()); });
    if (q0) { input.value = q0; search(q0); }
  });
})();
