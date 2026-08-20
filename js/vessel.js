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
  function t(k, ko) { return (window.TWI18N && window.TWI18N.t) ? window.TWI18N.t(k, ko) : ko; }
  function stKo(st) { return STATUS_KO[st] ? t('vessel.status.' + String(st).toLowerCase(), STATUS_KO[st]) : st; }

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
      '<span class="mfp-label"><b>' + esc(focusCd) + ' ' + t('vessel.lbl.terminal', '터미널') + '</b>' +
      (vsl ? '<span>' + esc(vsl) + (berth ? ' · ' + t('vessel.lbl.berth', '선석') + ' ' + esc(berth) : '') + '</span>' : '') +
      '<small>' + t('vessel.pin.hint', '지도 정중앙 = 터미널 위치 · 표시는 잠시 후 사라집니다') + '</small></span>';
    wrap.appendChild(pin);
    setTimeout(function () { pin.classList.add('hide'); }, 9000);
    setTimeout(function () { if (pin.parentNode) pin.parentNode.removeChild(pin); }, 10000);
  }

  function search(q) {
    var box = el('shipResults');
    if (!q || q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="src-card"><div class="sc-sub">' + t('vessel.msg.searching', '검색 중…') + '</div></div>';
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
          box.innerHTML = '<div class="src-card"><b>' + esc(q) + '</b><div class="sc-sub">' + t('vessel.find.none', '선석배정 DB에서 찾지 못했습니다. 철자를 확인하거나, 아래 버튼으로 외부 실시간 검색을 이용하십시오.') + '</div>' +
            '<div><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.vesselfinder.com/vessels?name=' + encodeURIComponent(q) + '">' + t('vessel.find.vf', 'VesselFinder에서 실시간 검색') + ' ↗</a></div></div>';
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
            '<span class="st-badge st-' + (STATUS_KO[r.status] ? String(r.status).toLowerCase() : 'planned') + '"><i class="lv-dot"></i>' + esc(stKo(r.status)) + '</span></div>' +
            '<div class="sc-sub">' + esc(r.terminal_cd) + ' · ' + t('vessel.lbl.berth', '선석') + ' ' + esc(r.berth || '—') + ' · ' + esc(r.carrier || '—') +
            (r.voyage ? ' · ' + esc(r.voyage) : '') + '</div>' +
            '<div class="sc-sub">' + t('vessel.lbl.eta', '접안') + ' ' + dt(r.eta) + ' → ' + t('vessel.lbl.etd', '출항') + ' ' + dt(r.etd) + ' <small>(' + esc(r.collected_date) + ' ' + t('vessel.lbl.collected', '수집') + ')</small></div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">' +
            '<a class="btn btn-primary" style="padding:7px 12px; font-size:12.5px;" href="vessel.html?port=' + tv.port + focus + '&q=' + encodeURIComponent(q) + '#livemap">' + t('vessel.act.zoom', '터미널 위치로 확대 이동') + '</a>' +
            '<a class="btn btn-ghost" style="padding:7px 12px; font-size:12.5px;" target="_blank" rel="noopener" href="' + vfUrl + '">' + t('vessel.act.live', '실시간 위치(VesselFinder)') + ' ↗</a>' +
            '</div></div>';
        }).join('');
        /* 검색 결과가 지도 위에 삽입되며 레이아웃이 밀리므로, 도착 직후 1회만 착지점 재보정 */
        if (focusFresh) { focusFresh = false; setTimeout(focusMap, 120); }
      })
      .catch(function () {
        box.innerHTML = '<div class="src-card"><div class="sc-sub">' + t('vessel.msg.searchfail', '검색 실패 — 네트워크 확인 후 다시 시도하십시오.') + '</div></div>';
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

  /* ================= 상류(data.go.kr) 결과코드 판독 (2026-08-20) =================
     왜 필요한가: datago Edge Function 은 XML 을 정상 파싱한 경로에서 error 필드를 만들지 않는다.
     그래서 상류가 "정상 XML" 본문 안에 resultCode 11(파라미터 오류)을 담아 보내면 res.error 는
     undefined 가 되고, 화면에는 원인이 통째로 지워진 '조회 결과가 없습니다'만 남는다.
     실제로 이 죽은 코드 때문에 PORT-MIS 실패 원인이 한 번도 사용자에게 도달한 적이 없다.
     Edge Function 은 이번 담당 범위가 아니므로, 프론트가 응답 본문의 헤더를 직접 읽어 원인을 복구한다. */

  /* 상류 메시지는 영문 상수라 그대로 보여주면 읽히지 않는다 → 한국어 원인 문장으로 옮긴다.
     코드 번호는 기관마다 매핑이 달라(해수부는 11 을 INVALID_REQUEST_PARAMETER 로 쓴다)
     번호가 아니라 메시지 문자열을 1차 판단 근거로 삼는다. */
  var DG_REASON = {
    NO_MANDATORY_REQUEST_PARAMETERS: '필수 조회 조건이 빠졌습니다',
    INVALID_REQUEST_PARAMETER: '조회 조건이 상류 규격에 맞지 않습니다',
    SERVICE_KEY_IS_NOT_REGISTERED: '공공데이터 인증키가 등록되지 않았습니다',
    DEADLINE_HAS_EXPIRED: '공공데이터 인증키 활용기간이 만료되었습니다',
    LIMITED_NUMBER_OF_SERVICE_REQUESTS: '일일 호출 한도를 초과했습니다',
    SERVICE_ACCESS_DENIED: '해당 서비스 접근 권한이 없습니다',
    UNREGISTERED_IP: '등록되지 않은 IP 에서의 호출입니다',
    NO_OPENAPI_SERVICE: '제공기관에 해당 서비스가 없습니다',
    SERVICE_TIMEOUT: '제공기관 응답이 지연되고 있습니다',
    APPLICATION_ERROR: '제공기관 시스템 오류입니다',
    HTTP_ERROR: '제공기관 통신 오류입니다'
  };

  /* 결과 헤더 위치가 두 갈래다: 정상 계열은 response.header,
     인증키 오류 계열은 OpenAPI_ServiceResponse.cmmMsgHeader → 둘 다 잡히게 관대하게 훑는다. */
  function dgHeader(o, depth) {
    if (o == null || typeof o !== 'object' || depth > 5) return null;
    if (o.resultMsg != null || o.resultCode != null || o.returnAuthMsg != null || o.errMsg != null) return o;
    for (var k in o) {
      var f = dgHeader(o[k], depth + 1);
      if (f) return f;
    }
    return null;
  }

  /* 조회가 비었을 때 화면에 덧붙일 원인 문장. 원인이 아니면 '' 를 돌려준다. */
  function dgWhy(res) {
    if (!res) return '';
    if (res.error) return String(res.error);   /* 기존 경로 유지 — raw/HTTP 실패는 그대로 살린다 */
    var h = res.data ? dgHeader(res.data, 0) : null;
    if (!h) return '';
    var msg = String(h.resultMsg != null ? h.resultMsg : (h.returnAuthMsg != null ? h.returnAuthMsg : (h.errMsg || ''))).trim();
    var code = String(h.resultCode != null ? h.resultCode : (h.returnReasonCode != null ? h.returnReasonCode : '')).trim();
    /* "NORMAL_SERVICE" / "NORMAL SERVICE." = 상류는 정상이고 진짜 0건 → 원인 아님 */
    if (/NORMAL/i.test(msg) && !/ERROR/i.test(msg)) return '';
    if (!msg && (code === '' || code === '0' || code === '00')) return '';
    var key = msg.toUpperCase().replace(/[\s.]+/g, '_');
    for (var k in DG_REASON) {
      if (key.indexOf(k) > -1) return DG_REASON[k] + ' [' + (code || '-') + ' ' + msg + ']';
    }
    return msg ? msg + (code ? ' [' + code + ']' : '') : '상류 오류 코드 ' + code;
  }

  /* 상류가 정상인데 0건이면 '조회는 됐고 자료가 없다'는 사실 자체가 정보다 → totalCount 를 같이 보여준다 */
  function dgTotal(res) {
    var b = res && res.data && res.data.response && res.data.response.body;
    var n = b ? b.totalCount : null;
    return (n == null || n === '') ? null : n;
  }

  /* 빈 결과 카드에 붙일 꼬리말 — 원인이 있으면 원인, 없으면 '상류 정상 · N건' */
  function dgNote(res) {
    var why = dgWhy(res);
    if (why) return ' — ' + esc(why);
    var tc = dgTotal(res);
    return tc == null ? '' : ' — ' + t('vessel.dg.ok0', '상류 정상 응답 · 총 ') + esc(tc) + t('vessel.unit.count', '건');
  }

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
    var p = new URLSearchParams({ api: 'portmis' });
    var clsgn = el('pmClsgn').value.trim(), port = el('pmPort').value.trim();
    var from = el('pmFrom').value.replace(/-/g, ''), to = el('pmTo').value.replace(/-/g, '');
    /* prtAgCd(항만청)는 상류 필수 파라미터다 — 예전처럼 조건부(if (port))로 붙이면 값이 없을 때
       상류가 resultCode 11(INVALID_REQUEST_PARAMETER)로 거부해 조회가 반드시 실패한다.
       실측(2026-08-20): prtAgCd 없이 호출 → 11 거부 / prtAgCd=020 → 부산 실적 정상 반환.
       화면은 <select> 라 기본값이 늘 차 있지만, 값이 비는 이례 상황을 침묵으로 넘기지 않는다. */
    if (!port) {
      out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.pm.needport', '항만청을 선택하십시오 — PORT-MIS 는 항만청이 필수 조회 조건입니다.') + '</div>');
      return;
    }
    out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.pm.loading', 'PORT-MIS 조회 중…') + '</div>');
    p.set('prtAgCd', port);
    /* PORT-MIS(15006353) 규격 파라미터: clsgn(호출부호, 선택)·prtAgCd(항만청, 필수)·sde/ede(조회 시작·종료일 YYYYMMDD) */
    if (clsgn) p.set('clsgn', clsgn);
    if (from) p.set('sde', from);
    if (to) p.set('ede', to);
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) {
          out.innerHTML = pmCard('<h3 style="margin-top:0; font-size:15px;">' + t('vessel.msg.needkey', 'data.go.kr 공공 API 키가 아직 등록되지 않았습니다') + '</h3>' +
            '<p class="sc-sub">' + esc(res.guide) + '</p>' +
            '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://www.data.go.kr/data/15006353/openapi.do">' + t('vessel.msg.needkey.link', 'data.go.kr 활용신청 페이지') + ' ↗</a>');
          return;
        }
        var items = res.data ? pmFindItems(res.data, 0) : null;
        if (!items || !items.length) {
          /* res.error 만 보던 자리 — 상류가 정상 XML 로 오류코드를 실어 보내면 그 값이 늘 undefined 라
             원인이 화면에 도달하지 못했다. dgNote 가 응답 헤더까지 읽어 원인을 되살린다. */
          out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.pm.none', '조회 결과가 없습니다. 조건(항만청·호출부호·기간)을 바꿔 시도하십시오.') + dgNote(res) + '</div>');
          return;
        }
        var keys = Object.keys(items[0]).slice(0, 8);
        out.innerHTML = pmCard(
          '<h3 style="margin-top:0; font-size:15px;">' + t('vessel.pm.res.h', '입출항 실적') + ' <small style="color:var(--muted);">' + items.length + t('vessel.unit.count', '건') + ' · PORT-MIS</small></h3>' +
          '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          keys.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          items.slice(0, 30).map(function (it) {
            return '<tr>' + keys.map(function (k) { return '<td>' + esc(it[k]) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
      })
      .catch(function () {
        out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.msg.retry', '조회 실패 — 잠시 후 다시 시도하십시오.') + '</div>');
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

  /* ================= VTS 관제 이벤트 (해수부 관제정보 15006354, 2026-08-03) ================= */

  /* 해수부 계열은 XML→JSON 변환분이라 items.item 이 1건일 때 배열이 아니라 객체로 온다.
     게다가 각 item 안에 details.detail[] 배열이 들어 있어 pmFindItems 로 관대하게 훑으면
     선박 목록 대신 상세 배열을 먼저 잡아버린다 → 표준 경로를 직접 짚고 배열로 정규화한다.
     (경로가 없을 때만 pmFindItems 로 후퇴) */
  function vtsItems(data) {
    var body = data && data.response && data.response.body;
    var it = (body && body.items) ? body.items.item : null;
    if (it == null) return pmFindItems(data, 0);
    return Array.isArray(it) ? it : [it];
  }

  /* aprtfEtryptDt 는 "2026-08-02T14:00:00+09:00" 형태 → "08-02 14:00" 으로 압축 */
  function vtsDt(v) {
    var s = String(v == null ? '' : v);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) return m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
    var d = s.replace(/[^0-9]/g, '');
    if (d.length >= 12) return d.slice(4, 6) + '-' + d.slice(6, 8) + ' ' + d.slice(8, 10) + ':' + d.slice(10, 12);
    return s || '—';
  }
  function vtsTon(v) {
    var n = Number(v);
    if (v == null || v === '' || !isFinite(n) || n === 0) return '—';
    return n.toLocaleString('ko-KR') + ' t';
  }
  /* toISOString 은 UTC 기준이라 KST 새벽에 하루 밀린다 — 로컬 날짜로 직접 조립 */
  function vtsYmd(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function vtsSearch() {
    var out = el('vtsOut');
    var sel = el('vtsPort');
    var from = el('vtsFrom').value.replace(/-/g, ''), to = el('vtsTo').value.replace(/-/g, '');
    if (!from || !to) {
      out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.vts.needdate', '조회 시작일과 종료일을 모두 지정하십시오.') + '</div>');
      return;
    }
    out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.vts.loading', 'VTS 관제 기록 조회 중…') + '</div>');
    var agNm = sel.options[sel.selectedIndex].text;
    /* 관제정보(15006354) 규격 파라미터: prtAgCd(항만청)·sde/ede(조회 시작·종료일 YYYYMMDD) */
    var p = new URLSearchParams({ api: 'vtscontrol', numOfRows: '30', prtAgCd: sel.value, sde: from, ede: to });
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) {
          out.innerHTML = pmCard('<h3 style="margin-top:0; font-size:15px;">' + t('vessel.msg.needkey', 'data.go.kr 공공 API 키가 아직 등록되지 않았습니다') + '</h3>' +
            '<p class="sc-sub">' + esc(res.guide) + '</p>' +
            '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://www.data.go.kr/data/15006354/openapi.do">' + t('vessel.msg.needkey.link', 'data.go.kr 활용신청 페이지') + ' ↗</a>');
          return;
        }
        var items = res.data ? vtsItems(res.data) : null;
        if (!items || !items.length) {
          /* PORT-MIS 와 같은 이유로 res.error 는 사실상 늘 비어 있다 → 응답 헤더에서 원인을 읽어 붙인다 */
          out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.vts.none', '관제 기록이 없습니다. 항만청 또는 조회 기간을 바꿔 다시 시도하십시오.') + dgNote(res) + '</div>');
          return;
        }
        items = items.slice(0, 30);
        out.innerHTML = pmCard(
          '<h3 style="margin-top:0; font-size:15px;">' + t('vessel.vts.res.h', 'VTS 관제 기록') + ' <small style="color:var(--muted);">' +
            items.length + t('vessel.unit.count', '건') + ' · ' + esc(items[0].prtAgNm || agNm) + ' ' + t('vessel.lbl.portauth', '항만청') + ' · ' + t('vessel.vts.src', '해양수산부 관제정보') + '</small></h3>' +
          '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          '<th>' + t('vessel.col.vsslnm', '선박명') + '</th><th>' + t('vessel.col.clsgn', '호출부호') + '</th><th>' + t('vessel.col.knd', '선종') + '</th><th class="num">' + t('vessel.col.grtg', '총톤수') + '</th><th>' + t('vessel.col.flag', '선적국') + '</th><th>' + t('vessel.col.arrdt', '입항일시') + '</th>' +
          '</tr></thead><tbody>' +
          items.map(function (it) {
            return '<tr>' +
              '<td>' + esc(it.vsslNm || '—') + '</td>' +
              '<td>' + esc(it.clsgn == null || it.clsgn === '' ? '—' : it.clsgn) + '</td>' +
              '<td>' + esc(it.vsslKndNm || '—') + '</td>' +
              '<td class="num">' + esc(vtsTon(it.vsslGrtg)) + '</td>' +
              '<td>' + esc(it.vsslNltyNm || '—') + '</td>' +
              '<td>' + esc(vtsDt(it.aprtfEtryptDt)) + '</td></tr>';
          }).join('') + '</tbody></table></div>');
      })
      .catch(function () {
        out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.msg.retry', '조회 실패 — 잠시 후 다시 시도하십시오.') + '</div>');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = el('vtsBtn');
    if (!btn) return;
    var now = new Date();
    el('vtsFrom').value = vtsYmd(new Date(now.getTime() - 3 * 86400000));
    el('vtsTo').value = vtsYmd(now);
    btn.addEventListener('click', vtsSearch);
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
      [t('vessel.ss.f.engnm', '영문 선박명'), it.vsslEngNm || '—'],
      [t('vessel.col.clsgn', '호출부호'), it.clsgn || '—'],
      [t('vessel.ss.f.imo', 'IMO 번호'), it.imoNo || '—'],
      [t('vessel.col.knd', '선종'), ssLabel(it.vsslKnd)],
      [t('vessel.col.nlty', '국적'), ssLabel(it.vsslNlty)],
      [t('vessel.ss.f.nvgshap', '항해 형태'), it.nvgShapNm || '—'],
      [t('vessel.ss.f.ibobprt', '외/내항'), ssLabel(it.ibobprt)],
      [t('vessel.ss.f.grtg', '총톤수(G/T)'), ssNum(it.grtg, ' t')],
      [t('vessel.ss.f.ntng', '순톤수(N/T)'), ssNum(it.ntng, ' t')],
      [t('vessel.ss.f.loa', '전장(LOA)'), ssNum(it.vsslTotLt, ' m')],
      [t('vessel.ss.f.lbp', '수선간장(LBP)'), ssNum(it.vsslLt, ' m')],
      [t('vessel.ss.f.beam', '폭(Beam)'), ssNum(it.shdth, ' m')],
      [t('vessel.ss.f.depth', '깊이(Depth)'), ssNum(it.vsslDp, ' m')],
      [t('vessel.ss.f.draft', '흘수(Draft)'), ssNum(it.vsslDrft, ' m')],
      [t('vessel.ss.f.built', '건조일'), it.vsslCnstrDt ? String(it.vsslCnstrDt).slice(0, 10) : '—']
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
      out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.ss.needinput', '선박명 또는 호출부호를 입력하십시오.') + '</div>');
      return;
    }
    out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.ss.loading', '선박 제원 조회 중…') + '</div>');
    var p = new URLSearchParams({ api: 'shipspec', numOfRows: '30' });
    if (nm) p.set('vsslNm', nm);
    if (cs) p.set('clsgn', cs);
    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) {
          out.innerHTML = pmCard('<h3 style="margin-top:0; font-size:15px;">' + t('vessel.msg.needkey', 'data.go.kr 공공 API 키가 아직 등록되지 않았습니다') + '</h3>' +
            '<p class="sc-sub">' + esc(res.guide) + '</p>');
          return;
        }
        var items = res.data ? pmFindItems(res.data, 0) : null;
        if (!items || !items.length) {
          /* 제원 조회는 원인 표시가 아예 없었다 — 같은 판독기를 붙여 실패와 0건을 구분해 준다 */
          out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.ss.none', '조회 결과가 없습니다. 선박명 일부(예: HANJIN) 또는 호출부호로 다시 시도하십시오.') + dgNote(res) + '</div>');
          return;
        }
        out.innerHTML = pmCard(
          '<h3 style="margin-top:0; font-size:15px;">' + t('vessel.ss.res.h', '선박 제원') + ' <small style="color:var(--muted);">' + items.length + t('vessel.unit.count', '건') + ' · ' + t('vessel.ss.src', '해양수산부 선박제원정보') + '</small></h3>' +
          '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          '<th>' + t('vessel.col.vsslnm', '선박명') + '</th><th>' + t('vessel.col.clsgn', '호출부호') + '</th><th>' + t('vessel.col.knd', '선종') + '</th><th>' + t('vessel.col.nlty', '국적') + '</th><th class="num">' + t('vessel.col.grtg', '총톤수') + '</th><th class="num">' + t('vessel.col.loa', '전장') + '</th><th></th>' +
          '</tr></thead><tbody>' +
          items.map(function (it, i) {
            return '<tr class="ss-row" data-i="' + i + '" style="cursor:pointer;">' +
              '<td>' + esc(it.vsslKorNm || it.vsslEngNm || '—') + '</td>' +
              '<td>' + esc(it.clsgn || '—') + '</td>' +
              '<td>' + esc(ssLabel(it.vsslKnd)) + '</td>' +
              '<td>' + esc(ssLabel(it.vsslNlty)) + '</td>' +
              '<td class="num">' + esc(ssNum(it.grtg)) + '</td>' +
              '<td class="num">' + esc(ssNum(it.vsslTotLt, ' m')) + '</td>' +
              '<td style="color:var(--muted); font-size:11px;">' + t('vessel.ss.more', '상세') + ' ▾</td></tr>' +
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
        out.innerHTML = pmCard('<div class="sc-sub">' + t('vessel.msg.retry', '조회 실패 — 잠시 후 다시 시도하십시오.') + '</div>');
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
      stat.textContent = t('vessel.ais.empty', '아직 수신 데이터가 없습니다 — AIS 수집 스케줄러 첫 실행 후 표시됩니다.');
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
    stat.textContent = t('vessel.ais.recv', '수신 선박') + ': ' + rows.length + ' · ' + t('vessel.ais.last', '최근 수신') + ': ' + String(latest).slice(5, 16).replace('T', ' ') + ' KST';
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
