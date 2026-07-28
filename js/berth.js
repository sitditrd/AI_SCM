/* =========================================================
   TWL Berth Insight — 선석배정현황 렌더러
   (45초 자동 갱신 · 항만/터미널/상태 필터 · 검색 · 마감 임박 강조)
   ========================================================= */
(function () {
  'use strict';

  var UI = null, B = null;
  var lastUpdateTs = null;
  var CCT_SOON_MS = 12 * 3600 * 1000;   /* 반입마감 임박 기준 12시간 (PRD FR-07) */

  /* ---------- ETA 지연 리스크 모델 (몬테카를로) ----------
     실측 접안편차(실제 작업시작 - 접안예정, 시간)로 터미널별 로그정규 분포 적합.
     표본 3건 미만 터미널은 기본 분포(중앙값 2h) 사용 — 이력 축적 시 자동 보정. */
  var SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var SB_KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv';
  var delayModel = { def: { mu: Math.log(2), sigma: 0.9, n: 0 }, byTerm: {} };

  function randn() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function calibrateDelayModel() {
    return fetch(SUPABASE_URL + '/rest/v1/bs_vessel_calls?select=terminal_cd,eta,work_start' +
      '&work_start=not.is.null&eta=not.is.null&order=collected_date.desc&limit=800',
      { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var byTerm = {};
        rows.forEach(function (r) {
          var d = (new Date(r.work_start) - new Date(r.eta)) / 3600000;
          if (!isFinite(d)) return;
          d = Math.max(0.1, Math.min(72, d));            /* 조기접안은 0.1h로 절단 */
          (byTerm[r.terminal_cd] = byTerm[r.terminal_cd] || []).push(Math.log(d));
        });
        Object.keys(byTerm).forEach(function (t) {
          var a = byTerm[t];
          if (a.length < 3) return;
          var mu = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
          var va = a.reduce(function (x, y) { return x + (y - mu) * (y - mu); }, 0) / a.length;
          delayModel.byTerm[t] = { mu: mu, sigma: Math.max(0.35, Math.sqrt(va)), n: a.length };
        });
      }).catch(function () { /* 보정 실패 시 기본 분포 유지 */ });
  }
  function termRisk(t) {
    var m = delayModel.byTerm[t] || delayModel.def;
    var late = 0, sum = 0, N = 4000;
    for (var i = 0; i < N; i++) {
      var d = Math.exp(m.mu + m.sigma * randn());
      sum += d;
      if (d > 6) late++;
    }
    return { p6: Math.round(late / N * 100), meanH: sum / N, n: m.n };
  }

  var STATUS_ORDER = ['PLANNED', 'ARRIVED', 'WORKING', 'DEPARTED'];
  var STATUS_COLOR = { PLANNED: '#2a78d6', ARRIVED: '#fab219', WORKING: '#0ca30c', DEPARTED: '#8493ac' };

  var filter = {
    port: 'ALL',
    terminal: 'ALL',
    status: { PLANNED: true, ARRIVED: true, WORKING: true, DEPARTED: true },
    q: ''
  };

  /* ---------- 그리드 뷰 상태 (2026.6 UX 개편) ---------- */
  var view = { mode: 'page', layout: 'flat', page: 1, size: 25, shown: 25 };
  var colf = { term: 'ALL', berth: '', vessel: '', carrier: 'ALL', route: '', cct: 'ALL', status: 'ALL' };
  var treeOpen = {};          /* 터미널코드 → 펼침 여부 (기본 접힘) */
  var rowRef = [];            /* data-ri → 원본 레코드 (우클릭 퀵뷰용) */
  var lazyLoading = false;
  var PORT_KEY = { '부산신항': 'busan', '광양항': 'gwangyang', '인천항': 'incheon' };

  document.addEventListener('DOMContentLoaded', function () {
    UI = window.TWUI; B = window.TWBERTH;
    if (!B) return;

    B.init().then(function () {
      calibrateDelayModel().then(function () { renderTerminalSummary(); });
      renderAll(true);
      initPortChips();
      initStatusChips();
      initSearch();
      initGridToolbar();
      initColFilters();
      initCtxMenu();
      initStampTicker();
      updateSourceBadge();

      document.getElementById('refreshBtn').addEventListener('click', function () {
        var btn = this;
        btn.classList.add('spin');
        setTimeout(function () { btn.classList.remove('spin'); }, 600);
        poll();
      });
      setInterval(poll, 45000);

      /* 딥링크/앵커(#weather 등): 비동기 렌더로 페이지 높이가 커진 뒤 해당 섹션으로 이동·표시.
         (index.html '항만 기상' → berth.html#weather 가 상단에 머무르던 문제 수정) */
      var hashLastTop = null;
      function gotoHash(retries) {
        if (!location.hash || location.hash.length < 2) return;
        var target;
        try { target = document.querySelector(location.hash); } catch (e) { return; }
        if (!target) return;
        target.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('in'); });
        var absTop = Math.round(target.getBoundingClientRect().top + window.pageYOffset);
        target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
        /* 비동기 렌더로 문서 위치가 계속 바뀌는 동안만 보정, 안정되면 중단 */
        if (retries > 0 && absTop !== hashLastTop) {
          hashLastTop = absTop;
          setTimeout(function () { gotoHash(retries - 1); }, 500);
        }
      }
      setTimeout(function () { gotoHash(3); }, 160);
      window.addEventListener('hashchange', function () { hashLastTop = null; gotoHash(1); });
    });
  });

  function poll() {
    if (B.getMode() === 'supabase') {
      B.refreshLive().then(function () {
        renderAll(false);
        el('staleBanner').classList.remove('show');
      }).catch(function () {
        el('staleBanner').classList.add('show');
        updateStamp();
      });
    } else {
      /* 오프라인: 재연결 시도 — 성공 시에만 화면 갱신 */
      B.init().then(function (ok) {
        if (ok) {
          updateSourceBadge();
          renderAll(false);
          el('staleBanner').classList.remove('show');
        }
      });
    }
  }

  /* ================= 헬퍼 ================= */
  function el(id) { return document.getElementById(id); }
  function fmt(n) { return UI.fmt(n, 0); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function stBadge(st) {
    return '<span class="st-badge st-' + st.toLowerCase() + '"><i class="lv-dot"></i>' +
      st + ' · ' + (B.STATUS_KO[st] || st) + '</span>';
  }

  function updateSourceBadge() {
    var host = document.querySelector('.live-status');
    if (!host) return;
    var b = el('srcBadge');
    if (!b) {
      b = document.createElement('span');
      b.id = 'srcBadge';
      b.className = 'src-badge';
      host.insertBefore(b, host.firstChild);
    }
    if (B.getMode() === 'supabase') {
      b.textContent = 'Supabase 실데이터';
      b.classList.add('live');
      b.title = '데이터 소스: Supabase (bs_vessel_calls)';
    } else {
      b.textContent = '내장 샘플 데이터';
      b.classList.remove('live');
      var err = B.getLastError();
      b.title = '데이터 소스: 내장 샘플 데이터 (' + B.getCollectedDate() + ' 수집분)' + (err ? ' — ' + err.message : '');
    }
  }

  /* ================= 필터 UI ================= */
  function initPortChips() {
    var rows = B.getRows();
    var wrap = el('portChips');
    var items = ['ALL'].concat(B.PORTS);
    wrap.innerHTML = items.map(function (p) {
      var cnt = p === 'ALL' ? rows.length : rows.filter(function (r) { return r.port === p; }).length;
      return '<button class="f-chip' + (filter.port === p ? '' : ' off') + '" data-port="' + p + '">' +
        (p === 'ALL' ? '전체 항만' : p) + ' (' + cnt + ')</button>';
    }).join('');
    wrap.querySelectorAll('.f-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        filter.port = c.getAttribute('data-port');
        filter.terminal = 'ALL';
        initPortChips();
        renderTerminalTabs();
        resetAndRender();
      });
    });
    renderTerminalTabs();
  }

  function renderTerminalTabs() {
    var rows = B.getRows();
    var wrap = el('terminalTabs');
    var codes = Object.keys(B.TERMINALS).filter(function (c) {
      return filter.port === 'ALL' || B.TERMINALS[c].port === filter.port;
    }).sort(function (a, b) { return B.TERMINALS[a].ord - B.TERMINALS[b].ord; });
    var html = '<button class="tab-btn' + (filter.terminal === 'ALL' ? ' active' : '') + '" data-term="ALL">전체 터미널</button>';
    html += codes.map(function (c) {
      var cnt = rows.filter(function (r) { return r.t === c; }).length;
      return '<button class="tab-btn' + (filter.terminal === c ? ' active' : '') + '" data-term="' + c + '">' +
        c + ' (' + cnt + ')</button>';
    }).join('');
    wrap.innerHTML = html;
    wrap.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        filter.terminal = b.getAttribute('data-term');
        wrap.querySelectorAll('.tab-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        resetAndRender();
      });
    });
  }

  function initStatusChips() {
    var rows = B.getRows();
    var wrap = el('statusChips');
    wrap.innerHTML = STATUS_ORDER.map(function (st) {
      var on = filter.status[st];
      var cnt = rows.filter(function (r) { return r.status === st; }).length;
      return '<button class="f-chip' + (on ? '' : ' off') + '" data-st="' + st + '" aria-pressed="' + on + '">' +
        '<span class="sw" style="background:' + STATUS_COLOR[st] + ';"></span>' +
        B.STATUS_KO[st] + ' (' + cnt + ')' +
        '<span class="x">' + (on ? '×' : '+') + '</span></button>';
    }).join('');
    wrap.querySelectorAll('.f-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        var st = c.getAttribute('data-st');
        filter.status[st] = !filter.status[st];
        initStatusChips();
        resetAndRender();
      });
    });
  }

  function initSearch() {
    el('berthSearch').addEventListener('input', function () {
      filter.q = this.value.trim().toLowerCase();
      resetAndRender();
    });
  }

  /* ================= 렌더 ================= */
  function renderAll(first) {
    if (B.getMode() === 'supabase') lastUpdateTs = Date.now();
    renderMeta();
    if (!first) { initPortChips(); initStatusChips(); }
    renderKpis(first);
    renderTable();
    renderTerminalSummary();
    /* 대형 표는 등장 애니메이션 관찰 조건과 무관하게 즉시 표시 (진입 시 빈 화면 방지) */
    document.querySelectorAll('#list .reveal, #byterminal .reveal').forEach(function (n) { n.classList.add('in'); });
    updateStamp();
  }

  function renderMeta() {
    el('collectLabel').textContent = B.getCollectedDate();
    el('totalLabel').textContent = fmt(B.getRows().length);
  }

  function renderKpis(first) {
    var rows = B.getRows();
    var ref = B.getRefMs();
    var total = rows.length;
    var working = rows.filter(function (r) { return r.status === 'ARRIVED' || r.status === 'WORKING'; }).length;
    var cctSoon = rows.filter(function (r) {
      return r.status !== 'DEPARTED' && r.cct != null && r.cct >= ref && r.cct <= ref + CCT_SOON_MS;
    }).length;
    var dayEnd = ref + 18 * 3600 * 1000;  /* 06:00 + 18h = 수집일 자정 */
    var etdToday = rows.filter(function (r) {
      return r.status !== 'DEPARTED' && r.etd != null && r.etd >= ref && r.etd <= dayEnd;
    }).length;

    setKpi('kTotal', total, first);
    setKpi('kWorking', working, first);
    setKpi('kCct', cctSoon, first);
    setKpi('kEtd', etdToday, first);
    el('kTotalSub').textContent = '부산신항·광양항·인천항 9개 터미널';
  }
  function setKpi(id, v, first) {
    var e = el(id);
    if (first) UI.countUp(e, v, { dec: 0 });
    else e.textContent = fmt(v);
  }

  function pass(r) {
    if (filter.port !== 'ALL' && r.port !== filter.port) return false;
    if (filter.terminal !== 'ALL' && r.t !== filter.terminal) return false;
    if (filter.status[r.status] === false) return false;
    if (filter.q) {
      var hay = (r.vessel + ' ' + r.carrier + ' ' + r.route + ' ' + r.voy + ' ' + r.t + ' ' + (r.sub || '')).toLowerCase();
      if (hay.indexOf(filter.q) < 0) return false;
    }
    return true;
  }

  /* ================= 그리드 렌더 (페이지/연속 스크롤/트리 · 2026.6) ================= */
  var EMPTY_ROW = '<tr><td colspan="11" style="text-align:center; color:var(--muted); padding:26px;">조건에 맞는 선석배정이 없습니다.</td></tr>';

  function resetAndRender() {
    view.page = 1;
    view.shown = view.size;
    renderTable();
  }

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function colfPass(r) {
    if (colf.term !== 'ALL' && r.t !== colf.term) return false;
    if (colf.berth && String(r.berth).toLowerCase().indexOf(colf.berth) < 0) return false;
    if (colf.vessel && (r.vessel + ' ' + r.voy).toLowerCase().indexOf(colf.vessel) < 0) return false;
    if (colf.carrier !== 'ALL' && r.carrier !== colf.carrier) return false;
    if (colf.route && String(r.route).toLowerCase().indexOf(colf.route) < 0) return false;
    if (colf.status !== 'ALL' && r.status !== colf.status) return false;
    if (colf.cct !== 'ALL') {
      var ref = B.getRefMs();
      var soon = r.status !== 'DEPARTED' && r.cct != null && r.cct >= ref && r.cct <= ref + CCT_SOON_MS;
      if (colf.cct === 'SOON' && !soon) return false;
      if (colf.cct === 'PAST' && !(r.cct != null && r.cct < ref)) return false;
      if (colf.cct === 'UPCOMING' && !(r.cct != null && r.cct > ref + CCT_SOON_MS)) return false;
    }
    return true;
  }

  function filteredRows() {
    return B.getRows().filter(pass).filter(colfPass).sort(function (a, b) {
      return (a.eta == null ? Infinity : a.eta) - (b.eta == null ? Infinity : b.eta);
    });
  }

  function pushRef(r) { rowRef.push(r); return rowRef.length - 1; }

  function rowHtml(r, ri, ref, extraCls) {
    var soon = r.status !== 'DEPARTED' && r.cct != null && r.cct >= ref && r.cct <= ref + CCT_SOON_MS;
    var past = r.cct != null && r.cct < ref;
    var cctCell = r.cct == null ? '—'
      : '<span class="' + (soon ? 'cct-soon-txt' : (past ? 'cct-past' : '')) + '">' + B.fmtDT(r.cct) + (soon ? ' ⚠' : '') + '</span>';
    var termCell = '<div class="port-cell"><b>' + esc(r.t) + (r.sub ? ' · ' + esc(r.sub) : '') + '</b><small>' + esc(r.terminalName) + '</small></div>';
    var vesselCell = '<div class="port-cell"><b>' + esc(r.vessel) + '</b><small>' + esc(r.voy) + '</small></div>';
    return '<tr data-ri="' + ri + '" class="' + (soon ? 'row-cct-soon' : '') + (r.status === 'DEPARTED' ? ' row-departed' : '') + (extraCls || '') + '">' +
      '<td>' + termCell + '</td>' +
      '<td>' + esc(r.berth) + '</td>' +
      '<td>' + vesselCell + '</td>' +
      '<td>' + esc(r.carrier) + '</td>' +
      '<td>' + esc(r.route) + '</td>' +
      '<td>' + cctCell + '</td>' +
      '<td>' + B.fmtDT(r.eta) + '</td>' +
      '<td>' + B.fmtDT(r.etd) + '</td>' +
      '<td class="num">' + fmt(r.dis) + '</td>' +
      '<td class="num">' + fmt(r.lod) + '</td>' +
      '<td>' + stBadge(r.status) + '</td>' +
      '</tr>';
  }

  function renderTable() {
    var ref = B.getRefMs();
    var rows = filteredRows();
    rowRef = [];
    updateCfDot();
    closeCtx();

    if (view.layout === 'tree') {
      renderTreeBody(rows, ref);
      el('pagerBar').innerHTML = '';
      el('matchLabel').textContent = fmt(rows.length) + '건 · 터미널 그룹 보기';
      return;
    }
    if (view.mode === 'page') {
      var pages = Math.max(1, Math.ceil(rows.length / view.size));
      if (view.page > pages) view.page = pages;
      var s = (view.page - 1) * view.size;
      var slice = rows.slice(s, s + view.size);
      el('berthBody').innerHTML = slice.map(function (r) { return rowHtml(r, pushRef(r), ref); }).join('') || EMPTY_ROW;
      renderPager(rows.length, pages, s, slice.length);
      el('matchLabel').textContent = rows.length
        ? fmt(s + 1) + '–' + fmt(s + slice.length) + ' / ' + fmt(rows.length) + '건'
        : '0건';
    } else {
      view.shown = Math.min(Math.max(view.shown, view.size), Math.max(rows.length, view.size));
      var head = rows.slice(0, view.shown);
      el('berthBody').innerHTML = head.map(function (r) { return rowHtml(r, pushRef(r), ref); }).join('') || EMPTY_ROW;
      renderMoreBar(rows.length);
      el('matchLabel').textContent = fmt(head.length) + ' / ' + fmt(rows.length) + '건 표시';
    }
  }

  /* ---------- 페이지네이션 ---------- */
  function pageNums(pages, cur) {
    var out = [], last = 0;
    for (var p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - cur) <= 2) {
        if (last && p - last > 1) out.push('…');
        out.push(p);
        last = p;
      }
    }
    return out;
  }

  function renderPager(total, pages, start, count) {
    var pb = el('pagerBar');
    if (pages <= 1) {
      pb.innerHTML = total ? '<span class="pg-info">' + fmt(total) + '건 전체 표시</span>' : '';
      return;
    }
    function btn(p, label, cls, dis) {
      return '<button class="pg-btn' + (cls ? ' ' + cls : '') + '" data-pg="' + p + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
    }
    var h = btn(view.page - 1, '‹ 이전', '', view.page === 1);
    pageNums(pages, view.page).forEach(function (p) {
      h += (p === '…') ? '<span class="pg-ellip">…</span>' : btn(p, p, p === view.page ? 'cur' : '', false);
    });
    h += btn(view.page + 1, '다음 ›', '', view.page === pages);
    h += '<span class="pg-info">' + fmt(total) + '건 중 ' + fmt(start + 1) + '–' + fmt(start + count) + '</span>';
    pb.innerHTML = h;
  }

  /* ---------- 연속 스크롤 (lazy load + 팬텀 스켈레톤 행) ---------- */
  var sentinelIO = null;

  function renderMoreBar(total) {
    var pb = el('pagerBar');
    if (view.shown >= total) {
      pb.innerHTML = total ? '<span class="pg-info">' + fmt(total) + '건 모두 표시됨</span>' : '';
      return;
    }
    pb.innerHTML = '<button class="pg-btn more" id="loadMoreBtn">더 보기 (+' + view.size + ')</button>' +
      '<span class="pg-info">' + fmt(view.shown) + ' / ' + fmt(total) + '건</span>' +
      '<span class="scroll-sentinel" id="scrollSentinel" aria-hidden="true"></span>';
    initSentinel();
  }

  function initSentinel() {
    if (!('IntersectionObserver' in window)) return;
    var s = el('scrollSentinel');
    if (!s) return;
    if (sentinelIO) sentinelIO.disconnect();
    sentinelIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) loadMore(); });
    }, { rootMargin: '220px 0px' });
    sentinelIO.observe(s);
  }

  function loadMore() {
    if (lazyLoading || view.mode !== 'scroll' || view.layout !== 'flat') return;
    if (view.shown >= filteredRows().length) return;
    lazyLoading = true;
    var tb = el('berthBody');
    for (var i = 0; i < 3; i++) {
      tb.insertAdjacentHTML('beforeend',
        '<tr class="sk-row" aria-hidden="true"><td colspan="11"><span class="sk-bar"></span></td></tr>');
    }
    setTimeout(function () {
      lazyLoading = false;
      view.shown += view.size;
      renderTable();
    }, 260);
  }

  /* ---------- 트리 그리드 (터미널 그룹 접기/펼치기) ---------- */
  function renderTreeBody(rows, ref) {
    var codes = Object.keys(B.TERMINALS).sort(function (a, b) { return B.TERMINALS[a].ord - B.TERMINALS[b].ord; });
    var html = '';
    codes.forEach(function (c) {
      var list = rows.filter(function (r) { return r.t === c; });
      if (!list.length) return;
      var open = !!treeOpen[c];
      var work = list.filter(function (r) { return r.status === 'ARRIVED' || r.status === 'WORKING'; }).length;
      var soonC = list.filter(function (r) {
        return r.status !== 'DEPARTED' && r.cct != null && r.cct >= ref && r.cct <= ref + CCT_SOON_MS;
      }).length;
      html += '<tr class="tree-hd' + (open ? ' open' : '') + '" data-term="' + c + '" tabindex="0" role="button" aria-expanded="' + open + '">' +
        '<td colspan="11"><span class="tree-caret" aria-hidden="true">▸</span><b>' + c + '</b>' +
        '<small>' + esc(B.TERMINALS[c].name) + '</small>' +
        '<span class="tree-cnt">' + fmt(list.length) + '척</span>' +
        '<span class="tree-mini">작업중 ' + work + (soonC ? ' · <b class="cct-soon-txt">마감임박 ' + soonC + '</b>' : '') + '</span>' +
        '</td></tr>';
      if (open) {
        html += list.map(function (r) { return rowHtml(r, pushRef(r), ref, ' tree-child'); }).join('');
      }
    });
    el('berthBody').innerHTML = html || EMPTY_ROW;
  }

  function treeToggleFrom(e) {
    var hd = e.target.closest('tr.tree-hd');
    if (!hd) return false;
    var c = hd.getAttribute('data-term');
    treeOpen[c] = !treeOpen[c];
    renderTable();
    return true;
  }

  /* ---------- 그리드 툴바 ---------- */
  function initGridToolbar() {
    function seg(onBtn, offBtn) {
      onBtn.classList.add('active'); onBtn.setAttribute('aria-pressed', 'true');
      offBtn.classList.remove('active'); offBtn.setAttribute('aria-pressed', 'false');
    }
    el('modePage').addEventListener('click', function () {
      if (view.mode === 'page') return;
      view.mode = 'page'; seg(this, el('modeScroll')); resetAndRender();
    });
    el('modeScroll').addEventListener('click', function () {
      if (view.mode === 'scroll') return;
      view.mode = 'scroll'; seg(this, el('modePage')); resetAndRender();
    });
    el('layoutFlat').addEventListener('click', function () {
      if (view.layout === 'flat') return;
      view.layout = 'flat'; seg(this, el('layoutTree')); resetAndRender();
    });
    el('layoutTree').addEventListener('click', function () {
      if (view.layout === 'tree') return;
      view.layout = 'tree'; seg(this, el('layoutFlat')); resetAndRender();
    });
    el('pageSize').addEventListener('change', function () {
      view.size = parseInt(this.value, 10) || 25;
      resetAndRender();
    });
    el('pagerBar').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.id === 'loadMoreBtn') { loadMore(); return; }
      var pg = b.getAttribute('data-pg');
      if (pg == null) return;
      view.page = parseInt(pg, 10);
      renderTable();
      var card = document.querySelector('#list .tbl-card');
      if (card) card.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    });
    el('berthBody').addEventListener('click', treeToggleFrom);
    el('berthBody').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') treeToggleFrom(e);
    });
    el('colFilterBtn').addEventListener('click', function () {
      var row = el('colfRow');
      var show = row.hidden;
      row.hidden = !show;
      this.setAttribute('aria-pressed', String(show));
      this.classList.toggle('active', show);
      if (!show) {                    /* 숨길 때는 보이지 않는 필터가 남지 않게 초기화 */
        colf = { term: 'ALL', berth: '', vessel: '', carrier: 'ALL', route: '', cct: 'ALL', status: 'ALL' };
        ['cfBerth', 'cfVessel', 'cfRoute'].forEach(function (id) { el(id).value = ''; });
        ['cfTerm', 'cfCarrier', 'cfCct', 'cfStatus'].forEach(function (id) { el(id).value = 'ALL'; });
        resetAndRender();
      }
    });
  }

  /* ---------- 컬럼 필터 ---------- */
  function initColFilters() {
    var codes = Object.keys(B.TERMINALS).sort(function (a, b) { return B.TERMINALS[a].ord - B.TERMINALS[b].ord; });
    el('cfTerm').innerHTML = '<option value="ALL">터미널 전체</option>' +
      codes.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    el('cfStatus').innerHTML = '<option value="ALL">상태 전체</option>' +
      STATUS_ORDER.map(function (st) { return '<option value="' + st + '">' + st + ' · ' + (B.STATUS_KO[st] || st) + '</option>'; }).join('');
    refreshCarrierOptions();

    function bindText(id, key) {
      el(id).addEventListener('input', function () {
        colf[key] = this.value.trim().toLowerCase();
        resetAndRender();
      });
    }
    function bindSel(id, key) {
      el(id).addEventListener('change', function () {
        colf[key] = this.value;
        resetAndRender();
      });
    }
    bindText('cfBerth', 'berth'); bindText('cfVessel', 'vessel'); bindText('cfRoute', 'route');
    bindSel('cfTerm', 'term'); bindSel('cfCarrier', 'carrier'); bindSel('cfCct', 'cct'); bindSel('cfStatus', 'status');
  }

  function refreshCarrierOptions() {
    var s = el('cfCarrier');
    if (!s) return;
    var cur = colf.carrier, set = {};
    B.getRows().forEach(function (r) { if (r.carrier && r.carrier !== '—') set[r.carrier] = 1; });
    var list = Object.keys(set).sort();
    s.innerHTML = '<option value="ALL">선사 전체</option>' +
      list.map(function (c) { return '<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    if (cur !== 'ALL' && !set[cur]) colf.carrier = 'ALL';
  }

  function updateCfDot() {
    var active = colf.term !== 'ALL' || colf.berth || colf.vessel || colf.carrier !== 'ALL' ||
      colf.route || colf.cct !== 'ALL' || colf.status !== 'ALL';
    var d = document.querySelector('#colFilterBtn .cf-dot');
    if (d) d.hidden = !active;
  }

  /* ---------- 우클릭 퀵뷰 메뉴 ---------- */
  function initCtxMenu() {
    el('berthBody').addEventListener('contextmenu', function (e) {
      var tr = e.target.closest('tr[data-ri]');
      if (!tr) return;
      e.preventDefault();
      openCtx(rowRef[parseInt(tr.getAttribute('data-ri'), 10)], e.clientX, e.clientY);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#ctxMenu')) closeCtx();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCtx(); });
    window.addEventListener('scroll', closeCtx, true);
    window.addEventListener('resize', closeCtx);
  }

  function closeCtx() {
    var m = el('ctxMenu');
    if (m && m.classList.contains('show')) {
      m.classList.remove('show');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function openCtx(r, x, y) {
    if (!r) return;
    var m = el('ctxMenu');
    var pk = PORT_KEY[r.port] || 'busan';
    var vq = encodeURIComponent(r.vessel);
    m.innerHTML =
      '<div class="cm-head">' +
      '<b>' + esc(r.vessel) + '</b><small>' + esc(r.voy) + '</small>' +
      '<div class="cm-meta">' + esc(r.t) + ' · 선석 ' + esc(r.berth) + ' · ' + stBadge(r.status) + '</div>' +
      '<div class="cm-meta">CCT ' + B.fmtDT(r.cct) + ' · ETB ' + B.fmtDT(r.eta) + ' · ETD ' + B.fmtDT(r.etd) + '</div>' +
      '</div>' +
      '<a class="cm-item" role="menuitem" href="vessel.html?port=' + pk + '&q=' + vq + '#livemap">🗺 선박 위치 지도에서 보기</a>' +
      '<a class="cm-item" role="menuitem" target="_blank" rel="noopener" href="https://www.vesselfinder.com/vessels?name=' + vq + '">🔎 VesselFinder 실시간 조회</a>' +
      '<a class="cm-item" role="menuitem" href="route.html">🧭 경로 분석 열기</a>' +
      '<a class="cm-item" role="menuitem" href="cargo.html">📦 화물 추적 열기</a>' +
      '<button class="cm-item" role="menuitem" id="cmCopy" type="button">📋 선명·항차 복사</button>';
    m.classList.add('show');
    m.setAttribute('aria-hidden', 'false');
    m.style.left = '0px'; m.style.top = '0px';           /* 크기 측정용 리셋 */
    var nx = Math.max(8, Math.min(x, window.innerWidth - m.offsetWidth - 10));
    var ny = Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 10));
    m.style.left = nx + 'px';
    m.style.top = ny + 'px';
    el('cmCopy').addEventListener('click', function () {
      var btn = this;
      var txt = (r.vessel + ' ' + (r.voy === '—' ? '' : r.voy)).trim();
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
        .then(function () { btn.textContent = '✓ 복사됨'; setTimeout(closeCtx, 700); })
        .catch(function () { btn.textContent = '복사 실패 — 수동 복사: ' + txt; });
    });
  }

  function renderTerminalSummary() {
    var rows = B.getRows();
    var codes = Object.keys(B.TERMINALS).sort(function (a, b) { return B.TERMINALS[a].ord - B.TERMINALS[b].ord; });
    el('termBody').innerHTML = codes.map(function (c) {
      var list = rows.filter(function (r) { return r.t === c; });
      var work = list.filter(function (r) { return r.status === 'ARRIVED' || r.status === 'WORKING'; }).length;
      var dis = list.reduce(function (s, r) { return s + r.dis; }, 0);
      var lod = list.reduce(function (s, r) { return s + r.lod; }, 0);
      var sh = list.reduce(function (s, r) { return s + r.shift; }, 0);
      var rk = termRisk(c);
      var rkColor = rk.p6 >= 40 ? 'var(--lv-congested)' : (rk.p6 >= 20 ? 'var(--lv-busy)' : 'var(--lv-low)');
      var rkCell = rk.n >= 3
        ? '<span style="color:' + rkColor + '; font-weight:800;">' + rk.p6 + '%</span> <small style="color:var(--muted);">(표본 ' + rk.n + ')</small>'
        : '<span style="color:var(--muted);">' + rk.p6 + '%</span> <small style="color:var(--muted);">기본모델</small>';
      return '<tr>' +
        '<td><div class="port-cell"><b>' + c + '</b><small>' + esc(B.TERMINALS[c].name) + '</small></div></td>' +
        '<td>' + esc(B.TERMINALS[c].port) + '</td>' +
        '<td class="num">' + fmt(list.length) + '</td>' +
        '<td class="num">' + fmt(work) + '</td>' +
        '<td class="num">' + fmt(dis) + '</td>' +
        '<td class="num">' + fmt(lod) + '</td>' +
        '<td class="num">' + fmt(sh) + '</td>' +
        '<td class="num">' + rkCell + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ================= 스탬프 ================= */
  function updateStamp() {
    var e = el('lastUpdated');
    if (!e) return;
    if (B.getMode() !== 'supabase') {
      e.textContent = B.getCollectedDate() + ' 수집분 표시 중 (오프라인)';
      el('staleBanner').classList.add('show');
      return;
    }
    if (!lastUpdateTs) return;
    var sec = Math.max(0, Math.round((Date.now() - lastUpdateTs) / 1000));
    e.textContent = sec < 5 ? '방금 업데이트' : sec + '초 전 업데이트';
  }
  function initStampTicker() { setInterval(updateStamp, 5000); }
})();
