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
  function t(k, ko) { return (window.TWI18N && window.TWI18N.t) ? window.TWI18N.t(k, ko) : ko; }
  function stKo(st) { return t('br.status.' + String(st).toLowerCase(), (B && B.STATUS_KO && B.STATUS_KO[st]) || st); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function stBadge(st) {
    return '<span class="st-badge st-' + st.toLowerCase() + '"><i class="lv-dot"></i>' +
      st + ' · ' + stKo(st) + '</span>';
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
      b.style.display = 'none';   /* 라이브 모드에서는 소스 배지 비노출 (2026-07-31 운영 요청) */
      b.textContent = '';
    } else {
      b.style.display = '';
      b.textContent = t('br.src.sample', '내장 샘플 데이터');
      b.classList.remove('live');
      var err = B.getLastError();
      b.title = t('br.src.title.pre', '데이터 소스: 내장 샘플 데이터 (') + B.getCollectedDate() + t('br.src.title.post', ' 수집분)') + (err ? ' — ' + err.message : '');
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
        (p === 'ALL' ? t('br.port.all', '전체 항만') : p) + ' (' + cnt + ')</button>';
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
    var html = '<button class="tab-btn' + (filter.terminal === 'ALL' ? ' active' : '') + '" data-term="ALL">' + t('br.term.all', '전체 터미널') + '</button>';
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
        stKo(st) + ' (' + cnt + ')' +
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
    el('kTotalSub').textContent = t('br.kpi.total.sub', '부산신항·북항·광양·인천·평택당진·대산 16개 터미널');
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
  var EMPTY_ROW = '<tr><td colspan="11" style="text-align:center; color:var(--muted); padding:26px;">' + t('br.empty', '조건에 맞는 선석배정이 없습니다.') + '</td></tr>';

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
      el('matchLabel').textContent = fmt(rows.length) + t('br.match.tree', '건 · 터미널 그룹 보기');
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
        ? fmt(s + 1) + '–' + fmt(s + slice.length) + ' / ' + fmt(rows.length) + t('berth.meta.unit', '건')
        : t('br.match.zero', '0건');
    } else {
      view.shown = Math.min(Math.max(view.shown, view.size), Math.max(rows.length, view.size));
      var head = rows.slice(0, view.shown);
      el('berthBody').innerHTML = head.map(function (r) { return rowHtml(r, pushRef(r), ref); }).join('') || EMPTY_ROW;
      renderMoreBar(rows.length);
      el('matchLabel').textContent = fmt(head.length) + ' / ' + fmt(rows.length) + t('br.match.shown', '건 표시');
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
      pb.innerHTML = total ? '<span class="pg-info">' + fmt(total) + t('br.pg.allshown', '건 전체 표시') + '</span>' : '';
      return;
    }
    function btn(p, label, cls, dis) {
      return '<button class="pg-btn' + (cls ? ' ' + cls : '') + '" data-pg="' + p + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
    }
    var h = btn(view.page - 1, t('br.pg.prev', '‹ 이전'), '', view.page === 1);
    pageNums(pages, view.page).forEach(function (p) {
      h += (p === '…') ? '<span class="pg-ellip">…</span>' : btn(p, p, p === view.page ? 'cur' : '', false);
    });
    h += btn(view.page + 1, t('br.pg.next', '다음 ›'), '', view.page === pages);
    h += '<span class="pg-info">' + fmt(total) + t('br.pg.of', '건 중 ') + fmt(start + 1) + '–' + fmt(start + count) + '</span>';
    pb.innerHTML = h;
  }

  /* ---------- 연속 스크롤 (lazy load + 팬텀 스켈레톤 행) ---------- */
  var sentinelIO = null;

  function renderMoreBar(total) {
    var pb = el('pagerBar');
    if (view.shown >= total) {
      pb.innerHTML = total ? '<span class="pg-info">' + fmt(total) + t('br.pg.allloaded', '건 모두 표시됨') + '</span>' : '';
      return;
    }
    pb.innerHTML = '<button class="pg-btn more" id="loadMoreBtn">' + t('br.pg.more', '더 보기 (+') + view.size + ')</button>' +
      '<span class="pg-info">' + fmt(view.shown) + ' / ' + fmt(total) + t('berth.meta.unit', '건') + '</span>' +
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
        '<span class="tree-cnt">' + fmt(list.length) + t('berth.unit.ship', '척') + '</span>' +
        '<span class="tree-mini">' + t('br.tree.working', '작업중 ') + work + (soonC ? ' · <b class="cct-soon-txt">' + t('br.tree.cctsoon', '마감임박 ') + soonC + '</b>' : '') + '</span>' +
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
    el('cfTerm').innerHTML = '<option value="ALL">' + t('br.cf.term.all', '터미널 전체') + '</option>' +
      codes.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    el('cfStatus').innerHTML = '<option value="ALL">' + t('br.cf.status.all', '상태 전체') + '</option>' +
      STATUS_ORDER.map(function (st) { return '<option value="' + st + '">' + st + ' · ' + stKo(st) + '</option>'; }).join('');
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
    s.innerHTML = '<option value="ALL">' + t('br.cf.carrier.all', '선사 전체') + '</option>' +
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
      '<div class="cm-meta">' + esc(r.t) + t('br.ctx.berth', ' · 선석 ') + esc(r.berth) + ' · ' + stBadge(r.status) + '</div>' +
      '<div class="cm-meta">CCT ' + B.fmtDT(r.cct) + ' · ETB ' + B.fmtDT(r.eta) + ' · ETD ' + B.fmtDT(r.etd) + '</div>' +
      '</div>' +
      '<a class="cm-item" role="menuitem" href="vessel.html?port=' + pk + '&q=' + vq + '#livemap">' + t('br.ctx.map', '🗺 선박 위치 지도에서 보기') + '</a>' +
      '<a class="cm-item" role="menuitem" target="_blank" rel="noopener" href="https://www.vesselfinder.com/vessels?name=' + vq + '">' + t('br.ctx.vf', '🔎 VesselFinder 실시간 조회') + '</a>' +
      '<a class="cm-item" role="menuitem" href="route.html">' + t('br.ctx.route', '🧭 경로 분석 열기') + '</a>' +
      '<a class="cm-item" role="menuitem" href="cargo.html">' + t('br.ctx.cargo', '📦 화물 추적 열기') + '</a>' +
      '<button class="cm-item" role="menuitem" id="cmCopy" type="button">' + t('br.ctx.copy', '📋 선명·항차 복사') + '</button>' +
      '<div class="cm-sep" role="separator"></div>' +
      '<button class="cm-item cm-item-strong" role="menuitem" id="cmXls" type="button">' + t('br.ctx.xls', '📥 조회결과 Excel 다운로드 (') + fmt(filteredRows().length) + t('br.ctx.xls.suf', '건)') + '</button>';
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
        .then(function () { btn.textContent = t('br.copy.ok', '✓ 복사됨'); setTimeout(closeCtx, 700); })
        .catch(function () { btn.textContent = t('br.copy.fail', '복사 실패 — 수동 복사: ') + txt; });
    });
    el('cmXls').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true; btn.textContent = t('br.xls.working', '⏳ 내보내는 중…');
      exportCurrentQuery(function (ok, mode) {
        btn.textContent = ok ? (t('br.xls.done', '✓ 다운로드 완료 (') + mode + ')') : t('br.xls.nodata', '✗ 내보낼 데이터 없음');
        setTimeout(closeCtx, 900);
      });
    });
  }

  /* ---------- 조회결과 Excel 내보내기 (현재 필터/검색/컬럼필터 반영) ----------
     SheetJS(xlsx, MIT)를 클릭 시에만 지연 로드 → .xlsx 생성. CDN 실패 시 UTF-8 BOM CSV로 폴백. */
  function exportFileStamp() {   /* 내보낸 시각 HHMMSS — 수집일과 별도로 파일명 충돌 방지 */
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function buildExportAOA() {
    var rows = filteredRows();
    var head = [t('berth.th.terminal', '터미널'), t('br.xls.h.sub', '부터미널'), t('br.xls.h.termname', '터미널명'),
      t('berth.ts.th.port', '항만'), t('berth.th.berth', '선석'), t('br.xls.h.vessel', '모선명'), t('br.xls.h.voy', '항차'),
      t('berth.th.carrier', '선사'), t('berth.th.route', '항로'),
      t('br.xls.h.cct', '반입마감(CCT)'), t('br.xls.h.etb', 'ETB(접안예정)'), t('br.xls.h.etd', 'ETD(출항예정)'),
      t('br.xls.h.dis', '양하'), t('br.xls.h.lod', '적하'), t('berth.th.status', '상태'), t('br.xls.h.statusko', '상태(국문)')];
    var aoa = [head];
    var dash = function (v) { return (v == null || v === '—') ? '' : v; };
    rows.forEach(function (r) {
      aoa.push([
        r.t || '', r.sub || '', r.terminalName || '', r.port || '',
        r.berth || '', r.vessel || '', dash(r.voy), dash(r.carrier), dash(r.route),
        B.fmtDT(r.cct), B.fmtDT(r.eta), B.fmtDT(r.etd),
        (r.dis == null ? '' : r.dis), (r.lod == null ? '' : r.lod),
        r.status || '', (B.STATUS_KO[r.status] || r.status || '')
      ]);
    });
    return aoa;
  }
  function loadXLSX() {
    return new Promise(function (resolve, reject) {
      if (window.XLSX) return resolve(window.XLSX);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = function () { window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX 미로딩')); };
      s.onerror = function () { reject(new Error('CDN 로드 실패')); };
      document.head.appendChild(s);
    });
  }
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function csvFallback(aoa, base) {
    var csv = aoa.map(function (row) {
      return row.map(function (c) {
        c = String(c == null ? '' : c);
        return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\r\n');
    saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), base + '.csv');
  }
  function exportCurrentQuery(done) {
    var aoa = buildExportAOA();
    if (aoa.length <= 1) { done && done(false, ''); return; }
    var base = t('br.xls.name', '선석배정') + '_' + (B.getCollectedDate() || '').replace(/[^0-9]/g, '') + '_' + exportFileStamp();
    loadXLSX().then(function (XLSX) {
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [6, 7, 20, 10, 8, 22, 12, 10, 12, 15, 15, 15, 7, 7, 10, 12].map(function (w) { return { wch: w }; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('br.xls.name', '선석배정'));
      XLSX.writeFile(wb, base + '.xlsx');
      done && done(true, 'xlsx');
    }).catch(function () {
      csvFallback(aoa, base);   /* 오프라인/차단 환경: 엑셀 호환 CSV로 폴백 */
      done && done(true, 'csv');
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
        ? '<span style="color:' + rkColor + '; font-weight:800;">' + rk.p6 + '%</span> <small style="color:var(--muted);">' + t('br.risk.sample', '(표본 ') + rk.n + ')</small>'
        : '<span style="color:var(--muted);">' + rk.p6 + '%</span> <small style="color:var(--muted);">' + t('br.risk.default', '기본모델') + '</small>';
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
      e.textContent = B.getCollectedDate() + t('br.stamp.offline', ' 수집분 표시 중 (오프라인)');
      el('staleBanner').classList.add('show');
      return;
    }
    if (!lastUpdateTs) return;
    var sec = Math.max(0, Math.round((Date.now() - lastUpdateTs) / 1000));
    e.textContent = sec < 5 ? t('br.stamp.just', '방금 업데이트') : sec + t('br.stamp.ago', '초 전 업데이트');
  }
  function initStampTicker() { setInterval(updateStamp, 5000); }

  /* ================= 인천항 선박 입출항 (인천항만공사 15157706, 2026-08-03) =================
     선석배정 수집 대상은 컨테이너 터미널(E1CT·ICON)뿐이라 일반부두 입출항이 빠진다.
     본 섹션은 인천항 전체 부두의 입출항 실적으로 그 공백을 보완한다.
     주의: 이 계열은 조회일자를 YYYY-MM-DD 하이픈 형식으로 받는다(PORT-MIS 등의 YYYYMMDD와 다름).
           pageNo 는 받지 않으며 프록시가 skipRow/endRow 로 처리한다. */
  var DATAGO = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/datago';

  function icCard(html) { return '<div class="card reveal in">' + html + '</div>'; }

  /* ---------- 상류(data.go.kr) 결과코드 판독 (2026-08-20) ----------
     왜 필요한가: datago Edge Function 은 XML 을 정상 파싱한 경로에서 error 필드를 만들지 않는다.
     상류가 "정상 XML" 본문 안에 오류코드를 담아 보내면 res.error 는 undefined 가 되어,
     아래 빈 결과 분기의 원인 표시가 한 번도 켜진 적이 없는 죽은 코드였다.
     Edge Function 은 이번 담당 범위가 아니므로 프론트가 응답 헤더를 직접 읽어 원인을 복구한다.
     (js/vessel.js 에 같은 판독기가 있다 — 두 파일은 각자 IIFE 라 스코프를 공유할 수 없어 의도적으로 중복 유지) */
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

  /* 헤더 위치가 두 갈래다: 정상 계열은 response.header, 인증키 오류 계열은 cmmMsgHeader */
  function dgHeader(o, depth) {
    if (o == null || typeof o !== 'object' || depth > 5) return null;
    if (o.resultMsg != null || o.resultCode != null || o.returnAuthMsg != null || o.errMsg != null) return o;
    for (var k in o) {
      var f = dgHeader(o[k], depth + 1);
      if (f) return f;
    }
    return null;
  }

  function dgWhy(res) {
    if (!res) return '';
    if (res.error) return String(res.error);   /* 기존 경로 유지 — raw/HTTP 실패는 그대로 살린다 */
    var h = res.data ? dgHeader(res.data, 0) : null;
    if (!h) return '';
    var msg = String(h.resultMsg != null ? h.resultMsg : (h.returnAuthMsg != null ? h.returnAuthMsg : (h.errMsg || ''))).trim();
    var code = String(h.resultCode != null ? h.resultCode : (h.returnReasonCode != null ? h.returnReasonCode : '')).trim();
    /* 인천항만공사는 "NORMAL SERVICE." 를 쓴다 — 상류 정상이고 진짜 0건이라 원인이 아니다 */
    if (/NORMAL/i.test(msg) && !/ERROR/i.test(msg)) return '';
    if (!msg && (code === '' || code === '0' || code === '00')) return '';
    var key = msg.toUpperCase().replace(/[\s.]+/g, '_');
    for (var k in DG_REASON) {
      if (key.indexOf(k) > -1) return DG_REASON[k] + ' [' + (code || '-') + ' ' + msg + ']';
    }
    return msg ? msg + (code ? ' [' + code + ']' : '') : '상류 오류 코드 ' + code;
  }

  function dgTotal(res) {
    var b = res && res.data && res.data.response && res.data.response.body;
    var n = b ? b.totalCount : null;
    return (n == null || n === '') ? null : n;
  }

  /* 빈 결과 카드 꼬리말 — 원인이 있으면 원인, 없으면 '상류 정상 · N건'.
     '조회가 실패한 것'과 '그 기간에 실적이 없는 것'을 구분해 주는 게 핵심이다. */
  function dgNote(res) {
    var why = dgWhy(res);
    if (why) return ' — ' + esc(why);
    var tc = dgTotal(res);
    return tc == null ? '' : ' — ' + t('br.ic.ok0', '상류 정상 응답 · 총 ') + esc(tc) + t('br.ic.unit', '건');
  }

  function icItems(o, depth) {
    /* XML→JSON 변환분은 결과가 1건일 때 items.item 이 배열이 아니라 객체로 온다 → 배열 정규화 */
    if (depth > 6 || o == null) return null;
    if (Array.isArray(o)) return (o.length && typeof o[0] === 'object') ? o : null;
    if (typeof o === 'object') {
      if (o.item != null && typeof o.item === 'object') {
        return Array.isArray(o.item) ? o.item : [o.item];
      }
      for (var k in o) {
        var f = icItems(o[k], depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  /* "2026-08-04 03:25:00.000" → "08-04 03:25" */
  function icDt(v) {
    if (!v) return '—';
    var s = String(v).replace('T', ' ');
    return s.length >= 16 ? s.slice(5, 16) : s;
  }
  /* "03[적하]" 처럼 코드+설명으로 오는 값에서 설명만 뽑는다 */
  function icLabel(v) {
    if (v == null || v === '' || v === '-') return '—';
    var m = String(v).match(/\[([^\]]+)\]/);
    return m ? m[1] : String(v);
  }
  function icPort(nm, cd) {
    nm = nm == null ? '' : String(nm).trim();
    cd = cd == null ? '' : String(cd).trim();
    if (cd === '-') cd = '';
    if (!nm) return cd;
    return cd ? nm + ' (' + cd + ')' : nm;
  }
  /* 목적항(dstPrt)이 비어 있는 건이 많아 차항지(nxtPrt)로 대체 표기 */
  function icDest(it) {
    return icPort(it.dstPrtEnm, it.dstPrt_1) || icPort(it.nxtPrtEnm, it.nxtPrt_1) || '—';
  }

  function icSearch() {
    var out = el('icOut');
    if (!out) return;
    var from = el('icFrom').value.trim(), to = el('icTo').value.trim(), call = el('icCall').value.trim();
    if (!from || !to) {
      out.innerHTML = icCard('<div class="sc-sub">' + t('br.ic.needdates', '조회 시작일과 종료일을 모두 입력하십시오.') + '</div>');
      return;
    }
    out.innerHTML = icCard('<div class="sc-sub">' + t('br.ic.loading', '인천항 입출항 조회 중…') + '</div>');

    var p = new URLSearchParams({ api: 'incheonship', numOfRows: '30' });
    p.set('arvlDtFrom', from);
    p.set('arvlDtTo', to);
    if (call) p.set('callLetter', call);

    fetch(DATAGO + '?' + p)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.needKey) {
          out.innerHTML = icCard('<h3 style="margin-top:0; font-size:15px;">' + t('br.ic.needkey', 'data.go.kr 공공 API 키가 아직 등록되지 않았습니다') + '</h3>' +
            '<p class="sc-sub">' + esc(res.guide) + '</p>' +
            '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://www.data.go.kr/data/15157706/openapi.do">' + t('br.ic.applylink', 'data.go.kr 활용신청 페이지 ↗') + '</a>');
          return;
        }
        var items = res.data ? icItems(res.data, 0) : null;
        if (!items || !items.length) {
          /* res.error 만 보던 자리 — 상류가 정상 XML 로 오류를 실어 보내면 그 값이 늘 undefined 라
             사용자는 원인이 지워진 '결과 없음'만 봤다. dgNote 가 응답 헤더까지 읽어 원인을 되살린다. */
          out.innerHTML = icCard('<div class="sc-sub">' + t('br.ic.noresult', '조회 결과가 없습니다. 조건(기간·호출부호)을 바꿔 다시 시도하십시오.') + dgNote(res) + '</div>');
          return;
        }
        items = items.slice(0, 30).sort(function (a, b) {
          return String(a.arvlDt || '').localeCompare(String(b.arvlDt || ''));
        });
        out.innerHTML = icCard(
          '<h3 style="margin-top:0; font-size:15px;">' + t('br.ic.h', '인천항 입출항 ') +
            '<small style="color:var(--muted);">' + items.length + t('br.ic.src', '건 · 인천항만공사') + '</small></h3>' +
          '<div class="tbl-scroll"><table class="tw"><thead><tr>' +
          '<th>' + t('br.ic.th.vessel', '선박명') + '</th><th>' + t('br.ic.th.call', '호출부호') + '</th><th>' + t('br.ic.th.arr', '입항일시') + '</th><th>' + t('br.ic.th.dep', '출항일시') + '</th>' +
          '<th>' + t('br.ic.th.dest', '목적항 / 차항지') + '</th><th>' + t('br.ic.th.purpose', '입항목적') + '</th><th>' + t('br.ic.th.agent', '대리점') + '</th>' +
          '</tr></thead><tbody>' +
          items.map(function (it) {
            return '<tr>' +
              '<td>' + esc(it.vsslNm || '—') + '</td>' +
              '<td>' + esc(it.callLetter || '—') + '</td>' +
              '<td>' + esc(icDt(it.arvlDt)) + '</td>' +
              '<td>' + esc(icDt(it.depDt)) + '</td>' +
              '<td>' + esc(icDest(it)) + '</td>' +
              '<td>' + esc(icLabel(it.arvlObjCode)) + '</td>' +
              '<td>' + esc(it.agentNm || '—') + '</td>' +
              '</tr>';
          }).join('') + '</tbody></table></div>');
      })
      .catch(function () {
        out.innerHTML = icCard('<div class="sc-sub">' + t('br.ic.fail', '조회 실패 — 잠시 후 다시 시도하십시오.') + '</div>');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = el('icBtn');
    if (!btn) return;
    /* 기본 조회 구간: 오늘-3일 ~ 오늘 (KST 기준 로컬 날짜).
       왜 과거 쪽인가: 인천항만공사는 입출항을 '실적'으로 사후 공표한다 — 앞으로의 날짜에는 자료가 없다.
       실측(2026-08-20): 오늘~+3일 = 0건 / 어제~오늘 = 9건 / 3일전~오늘 = 25건.
       종전의 '오늘 ~ +3일' 기본값은 999행에서 즉시 조회를 걸기 때문에, 페이지를 열면
       패널이 항상 '조회 결과가 없습니다'로 시작해 기능이 죽은 것처럼 보였다.
       기간 입력칸은 그대로라 사용자가 미래 구간으로 바꿔 보는 것은 여전히 가능하다. */
    function ymd(d) {
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    var t = new Date();
    el('icFrom').value = ymd(new Date(t.getTime() - 3 * 86400000));
    el('icTo').value = ymd(t);
    btn.addEventListener('click', icSearch);
    ['icFrom', 'icTo', 'icCall'].forEach(function (id) {
      el(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') icSearch(); });
    });
    icSearch();
  });
})();
