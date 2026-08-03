/* =========================================================
   TWL 선박 위치 — 항만 전환 칩 + 선명/항차 검색(선석배정 DB 연계)
   검색 결과에서: 해당 항만 지도 전환 · VesselFinder 실시간 위치 링크
   ========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv'; /* 읽기 전용(RLS) */
  /* 터미널별 확대 뷰 (부산신항 북컨/남컨/서컨 클러스터 기준) */
  var TERMINAL_VIEW = {
    PNIT: { port: 'busan', lat: 35.083, lng: 128.826, zoom: 15 },
    PNC:  { port: 'busan', lat: 35.079, lng: 128.821, zoom: 15 },
    HJNC: { port: 'busan', lat: 35.064, lng: 128.815, zoom: 15 },
    HPNT: { port: 'busan', lat: 35.058, lng: 128.807, zoom: 15 },
    BNCT: { port: 'busan', lat: 35.054, lng: 128.798, zoom: 15 },
    DGT:  { port: 'busan', lat: 35.075, lng: 128.775, zoom: 15 },
    GWCT: { port: 'gwangyang', lat: 34.887, lng: 127.700, zoom: 15 },
    E1CT: { port: 'incheon', lat: 37.443, lng: 126.607, zoom: 14 },
    ICON: { port: 'incheon', lat: 37.420, lng: 126.615, zoom: 13 }
  };
  var STATUS_KO = { PLANNED: '예정', ARRIVED: '접안', WORKING: '작업중', DEPARTED: '출항' };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function dt(v) { return v ? String(v).slice(5, 16).replace('T', ' ') : '—'; }

  /* ---------- 확대 이동 도착 처리: 지도 스크롤 + 터미널 위치 마커 ----------
     지도는 VesselFinder iframe이라 내부에 마커를 못 찍는다.
     대신 지도 중심 = 터미널 좌표이므로, 지도 위 정중앙에 오버레이 핀을 띄운다. */
  var FQ = new URLSearchParams(location.search);
  var focusCd = FQ.get('focus');
  var hasFocus = !!(focusCd && FQ.get('lat'));
  var wantsMapScroll = hasFocus || location.hash === '#livemap';
  var focusFresh = wantsMapScroll; /* 도착 직후 렌더 보정 1회용 — 이후 수동 검색 시 지도로 끌려가지 않게 */
  var pinDone = false;

  function focusMap() {
    if (!wantsMapScroll) return;
    var sec = el('livemap');
    if (sec) {
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
    if (!hasFocus || pinDone) return;
    pinDone = true;
    var wrap = el('vfWrap');
    if (!wrap) return;
    var vsl = FQ.get('vsl'), berth = FQ.get('berth');
    var pin = document.createElement('div');
    pin.className = 'map-focus-pin';
    pin.setAttribute('aria-hidden', 'true');
    pin.innerHTML =
      '<span class="mfp-dot"><i class="mfp-ring"></i></span>' +
      '<span class="mfp-label"><b>' + esc(focusCd) + ' 터미널</b>' +
      (vsl ? '<span>' + esc(vsl) + (berth ? ' · 선석 ' + esc(berth) : '') + '</span>' : '') +
      '<small>지도 정중앙 = 터미널 위치 · 표시는 잠시 후 사라집니다</small></span>';
    wrap.appendChild(pin);
    setTimeout(function () { pin.classList.add('hide'); }, 9000);
    setTimeout(function () { if (pin.parentNode) pin.parentNode.removeChild(pin); }, 10000);
  }

  function search(q) {
    var box = el('shipResults');
    if (!q || q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="src-card"><div class="sc-sub">검색 중…</div></div>';
    /* 쉼표·괄호·따옴표는 PostgREST or=() 필터 문법을 깨뜨리므로 제거 (예: "HMM (DIAMOND)" 검색 시 400 방지) */
    var enc = encodeURIComponent('*' + q.replace(/[,()"'\\]/g, ' ').trim() + '*');
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
          var tv = TERMINAL_VIEW[r.terminal_cd] || { port: 'busan' };
          var focus = tv.lat
            ? '&lat=' + tv.lat + '&lng=' + tv.lng + '&zoom=' + tv.zoom +
              '&focus=' + encodeURIComponent(r.terminal_cd) +
              '&vsl=' + encodeURIComponent(r.vessel_name) +
              (r.berth ? '&berth=' + encodeURIComponent(r.berth) : '')
            : '';
          var vfUrl = 'https://www.vesselfinder.com/vessels?name=' + encodeURIComponent(r.vessel_name);
          return '<div class="src-card">' +
            '<div class="sc-top"><b>' + esc(r.vessel_name) + '</b>' +
            '<span class="st-badge st-' + (STATUS_KO[r.status] ? String(r.status).toLowerCase() : 'planned') + '"><i class="lv-dot"></i>' + esc(STATUS_KO[r.status] || r.status) + '</span></div>' +
            '<div class="sc-sub">' + esc(r.terminal_cd) + ' · 선석 ' + esc(r.berth || '—') + ' · ' + esc(r.carrier || '—') +
            (r.voyage ? ' · ' + esc(r.voyage) : '') + '</div>' +
            '<div class="sc-sub">접안 ' + dt(r.eta) + ' → 출항 ' + dt(r.etd) + ' <small>(' + esc(r.collected_date) + ' 수집)</small></div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">' +
            '<a class="btn btn-primary" style="padding:7px 12px; font-size:12.5px;" href="vessel.html?port=' + tv.port + focus + '&q=' + encodeURIComponent(q) + '#livemap">터미널 위치로 확대 이동</a>' +
            '<a class="btn btn-ghost" style="padding:7px 12px; font-size:12.5px;" target="_blank" rel="noopener" href="' + vfUrl + '">실시간 위치(VesselFinder) ↗</a>' +
            '</div></div>';
        }).join('');
        /* 검색 결과가 지도 위에 삽입되며 레이아웃이 밀리므로, 도착 직후 1회만 착지점 재보정 */
        if (focusFresh) { focusFresh = false; setTimeout(focusMap, 120); }
      })
      .catch(function () {
        box.innerHTML = '<div class="src-card"><div class="sc-sub">검색 실패 — 네트워크 확인 후 다시 시도하십시오.</div></div>';
        if (focusFresh) { focusFresh = false; setTimeout(focusMap, 120); }
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
    if (wantsMapScroll) setTimeout(focusMap, 300);
  });

  /* ================= 입출항 실적 조회 (PORT-MIS · data.go.kr 프록시, 2026-07-31) ================= */
  var DATAGO = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/datago';

  function pmCard(html) { return '<div class="card reveal in">' + html + '</div>'; }

  function pmFindItems(o, depth) {
    /* data.go.kr 표준 응답(response.body.items.item[]) 변형에 대비해 첫 객체 배열을 관대하게 탐색 */
    if (depth > 6 || o == null) return null;
    if (Array.isArray(o)) return (o.length && typeof o[0] === 'object') ? o : null;
    if (typeof o === 'object') {
      for (var k in o) {
        var f = pmFindItems(o[k], depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  function pmSearch() {
    var out = el('pmOut');
    out.innerHTML = pmCard('<div class="sc-sub">PORT-MIS 조회 중…</div>');
    var p = new URLSearchParams({ api: 'portmis' });
    var clsgn = el('pmClsgn').value.trim(), port = el('pmPort').value.trim();
    var from = el('pmFrom').value.replace(/-/g, ''), to = el('pmTo').value.replace(/-/g, '');
    /* PORT-MIS(15006353) 규격 파라미터: clsgn(호출부호)·prtAgCd(항만청)·sde/ede(조회 시작·종료일 YYYYMMDD) */
    if (clsgn) p.set('clsgn', clsgn);
    if (port) p.set('prtAgCd', port);
    if (from) p.set('sde', from);
    if (to) p.set('ede', to);
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) {
          out.innerHTML = pmCard('<h3 style="margin-top:0; font-size:15px;">data.go.kr 공공 API 키가 아직 등록되지 않았습니다</h3>' +
            '<p class="sc-sub">' + esc(res.guide) + '</p>' +
            '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://www.data.go.kr/data/15006353/openapi.do">data.go.kr 활용신청 페이지 ↗</a>');
          return;
        }
        var items = res.data ? pmFindItems(res.data, 0) : null;
        if (!items || !items.length) {
          var extra = res.error ? ' (' + esc(res.error) + ')' : '';
          out.innerHTML = pmCard('<div class="sc-sub">조회 결과가 없습니다. 조건(호출부호·기간)을 바꿔 시도하십시오.' + extra + '</div>');
          return;
        }
        var keys = Object.keys(items[0]).slice(0, 8);
        out.innerHTML = pmCard(
          '<h3 style="margin-top:0; font-size:15px;">입출항 실적 <small style="color:var(--muted);">' + items.length + '건 · PORT-MIS</small></h3>' +
          '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          keys.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          items.slice(0, 30).map(function (it) {
            return '<tr>' + keys.map(function (k) { return '<td>' + esc(it[k]) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
      })
      .catch(function () {
        out.innerHTML = pmCard('<div class="sc-sub">조회 실패 — 잠시 후 다시 시도하십시오.</div>');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = el('pmBtn');
    if (!btn) return;
    var t = new Date(), u = new Date(t.getTime() + 2 * 86400000);
    function d(x) { return x.toISOString().slice(0, 10); }
    el('pmFrom').value = d(t);
    el('pmTo').value = d(u);
    btn.addEventListener('click', pmSearch);
  });

  /* ================= 선박 제원 조회 (선박제원정보 15055851, 2026-08-03) ================= */

  /* 값이 "41[풀컨테이너선]" 처럼 코드+설명으로 오는 필드에서 설명만 뽑는다 */
  function ssLabel(v) {
    if (v == null || v === '') return '—';
    var m = String(v).match(/\[([^\]]+)\]/);
    return m ? m[1] : String(v);
  }
  function ssNum(v, unit) {
    if (v == null || v === '' || Number(v) === 0) return '—';
    return Number(v).toLocaleString('ko-KR') + (unit || '');
  }

  /* 상세 패널에 펼칠 항목 — [라벨, 값] */
  function ssDetail(it) {
    var rows = [
      ['영문 선박명', it.vsslEngNm || '—'],
      ['호출부호', it.clsgn || '—'],
      ['IMO 번호', it.imoNo || '—'],
      ['선종', ssLabel(it.vsslKnd)],
      ['국적', ssLabel(it.vsslNlty)],
      ['항해 형태', it.nvgShapNm || '—'],
      ['외/내항', ssLabel(it.ibobprt)],
      ['총톤수(G/T)', ssNum(it.grtg, ' t')],
      ['순톤수(N/T)', ssNum(it.ntng, ' t')],
      ['전장(LOA)', ssNum(it.vsslTotLt, ' m')],
      ['수선간장(LBP)', ssNum(it.vsslLt, ' m')],
      ['폭(Beam)', ssNum(it.shdth, ' m')],
      ['깊이(Depth)', ssNum(it.vsslDp, ' m')],
      ['흘수(Draft)', ssNum(it.vsslDrft, ' m')],
      ['건조일', it.vsslCnstrDt ? String(it.vsslCnstrDt).slice(0, 10) : '—']
    ];
    return '<div class="ss-detail" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:8px 18px; padding:12px 4px 4px;">' +
      rows.map(function (r) {
        return '<div><small style="color:var(--muted); display:block; font-size:11px;">' + esc(r[0]) + '</small>' +
          '<b style="font-size:13px;">' + esc(r[1]) + '</b></div>';
      }).join('') + '</div>';
  }

  function ssSearch() {
    var out = el('ssOut');
    var nm = el('ssName').value.trim(), cs = el('ssClsgn').value.trim();
    if (!nm && !cs) {
      out.innerHTML = pmCard('<div class="sc-sub">선박명 또는 호출부호를 입력하십시오.</div>');
      return;
    }
    out.innerHTML = pmCard('<div class="sc-sub">선박 제원 조회 중…</div>');
    var p = new URLSearchParams({ api: 'shipspec', numOfRows: '30' });
    if (nm) p.set('vsslNm', nm);
    if (cs) p.set('clsgn', cs);
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) {
          out.innerHTML = pmCard('<h3 style="margin-top:0; font-size:15px;">data.go.kr 공공 API 키가 아직 등록되지 않았습니다</h3>' +
            '<p class="sc-sub">' + esc(res.guide) + '</p>');
          return;
        }
        var items = res.data ? pmFindItems(res.data, 0) : null;
        if (!items || !items.length) {
          out.innerHTML = pmCard('<div class="sc-sub">조회 결과가 없습니다. 선박명 일부(예: HANJIN) 또는 호출부호로 다시 시도하십시오.</div>');
          return;
        }
        out.innerHTML = pmCard(
          '<h3 style="margin-top:0; font-size:15px;">선박 제원 <small style="color:var(--muted);">' + items.length + '건 · 해양수산부 선박제원정보</small></h3>' +
          '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          '<th>선박명</th><th>호출부호</th><th>선종</th><th>국적</th><th class="num">총톤수</th><th class="num">전장</th><th></th>' +
          '</tr></thead><tbody>' +
          items.map(function (it, i) {
            return '<tr class="ss-row" data-i="' + i + '" style="cursor:pointer;">' +
              '<td>' + esc(it.vsslKorNm || it.vsslEngNm || '—') + '</td>' +
              '<td>' + esc(it.clsgn || '—') + '</td>' +
              '<td>' + esc(ssLabel(it.vsslKnd)) + '</td>' +
              '<td>' + esc(ssLabel(it.vsslNlty)) + '</td>' +
              '<td class="num">' + esc(ssNum(it.grtg)) + '</td>' +
              '<td class="num">' + esc(ssNum(it.vsslTotLt, ' m')) + '</td>' +
              '<td style="color:var(--muted); font-size:11px;">상세 ▾</td></tr>' +
              '<tr class="ss-panel" data-p="' + i + '" hidden><td colspan="7" style="background:color-mix(in srgb, var(--muted) 7%, transparent);">' +
              ssDetail(it) + '</td></tr>';
          }).join('') + '</tbody></table></div>');

        /* 행 클릭 → 해당 상세 패널 토글 */
        out.querySelectorAll('.ss-row').forEach(function (tr) {
          tr.addEventListener('click', function () {
            var panel = out.querySelector('.ss-panel[data-p="' + tr.getAttribute('data-i') + '"]');
            if (panel) panel.hidden = !panel.hidden;
          });
        });
      })
      .catch(function () {
        out.innerHTML = pmCard('<div class="sc-sub">조회 실패 — 잠시 후 다시 시도하십시오.</div>');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var b = el('ssBtn');
    if (!b) return;
    b.addEventListener('click', ssSearch);
    ['ssName', 'ssClsgn'].forEach(function (id) {
      el(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') ssSearch(); });
    });
  });

  /* ================= 자체 AIS 수신 지도 (AISStream PoC, 2026-07-31) ================= */
  var aisMap = null, aisLayer = null;

  function aisRender(rows) {
    var stat = el('aisStat');
    if (!rows.length) {
      stat.textContent = '아직 수신 데이터가 없습니다 — AIS 수집 스케줄러 첫 실행 후 표시됩니다.';
      return;
    }
    if (aisLayer) aisLayer.clearLayers();
    var latest = null;
    rows.forEach(function (r) {
      var moving = r.sog != null && r.sog > 0.5;
      var mk = L.circleMarker([r.lat, r.lng], {
        radius: moving ? 5 : 3.5,
        color: moving ? '#1e6fe0' : '#8493ac',
        fillColor: moving ? '#1e6fe0' : '#8493ac',
        fillOpacity: 0.75, weight: 1
      });
      mk.bindPopup('<b>' + esc(r.ship_name || 'MMSI ' + r.mmsi) + '</b><br>MMSI ' + esc(r.mmsi) +
        (r.sog != null ? ' · ' + r.sog + ' kn' : '') +
        (r.cog != null ? ' · ' + Math.round(r.cog) + '°' : '') +
        '<br>' + esc(String(r.received_at).slice(5, 16).replace('T', ' ')));
      aisLayer.addLayer(mk);
      if (!latest || r.received_at > latest) latest = r.received_at;
    });
    stat.textContent = '수신 선박: ' + rows.length + ' · 최근 수신: ' + String(latest).slice(5, 16).replace('T', ' ') + ' KST';
  }

  function aisFetch() {
    var since = new Date(Date.now() - 2 * 3600000).toISOString();
    fetch(SUPABASE_URL + '/rest/v1/vessel_positions?select=mmsi,ship_name,lat,lng,sog,cog,received_at' +
      '&received_at=gt.' + encodeURIComponent(since) + '&order=received_at.desc&limit=900',
      { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        var seen = {}, uniq = [];
        rows.forEach(function (r) { if (!seen[r.mmsi]) { seen[r.mmsi] = 1; uniq.push(r); } });
        aisRender(uniq);
      })
      .catch(function () { /* 오프라인 등 — 기존 표시 유지 */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var host = el('aisMap');
    if (!host || !window.L) return;
    aisMap = L.map('aisMap', { scrollWheelZoom: false }).setView([35.6, 128.3], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 18
    }).addTo(aisMap);
    aisLayer = L.layerGroup().addTo(aisMap);
    aisFetch();
    setInterval(aisFetch, 5 * 60000);   /* 5분마다 재조회 */
  });
})();
