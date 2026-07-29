/* =========================================================
   TWL Control Tower — 미로그인 게이트 (lock-in 티저)
   처음엔 정상 노출 → 알림(카운트다운) → 주요기능 blur + "로그인 필요" 오버레이.
   로그인(승인 계정)하면 게이트 해제 · 전 화면 열람.
   ※ 정적 사이트 특성상 화면 게이트는 억제(UX) 수준이며 완벽 보안 아님.
   ========================================================= */
(function () {
  'use strict';
  var GATE_DELAY_MS = 10000; /* [조정] 처음 노출 시간(ms) — 이후 게이트 */
  var WARN_BEFORE = 3000;    /* [조정] blur 몇 ms 전에 알림 카운트다운 */
  var ADMIN_ONLY = ['status.html']; /* [조정] 관리자 전용 화면 — 미관리자는 메뉴 숨김 + 접근 차단 */
  var gateApplied = false, timers = [];
  var lastAuthed = false, lastName = null;

  function ti(k, ko) { return (typeof TWI18N !== 'undefined' && TWI18N.t) ? TWI18N.t(k, ko) : ko; }
  function acctHost() { return document.querySelector('.site-header .header-inner'); }
  function pageName() { var p = (location.pathname.split('/').pop() || 'index.html'); return p || 'index.html'; }
  function isAdminOnlyPage() { return ADMIN_ONLY.indexOf(pageName()) !== -1; }

  /* 관리자 전용 화면으로의 네비/푸터 링크를 미관리자에게 숨김 */
  function applyAdminOnlyNav(isAdmin) {
    ADMIN_ONLY.forEach(function (p) {
      var sel = 'a[href="' + p + '"], a[href^="' + p + '?"], a[href^="' + p + '#"]';
      document.querySelectorAll(sel).forEach(function (a) { a.style.display = isAdmin ? '' : 'none'; });
    });
  }

  /* 관리자 전용 화면: 콘텐츠 숨김 + 안내 오버레이 */
  function adminOverlayHTML() {
    return '<div class="auth-gate-card">' +
        '<div class="agc-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6l7-3z"/><path d="M9.2 12.2l2 2 3.6-3.8"/></svg></div>' +
        '<h2>' + ti('admin.blockTitle', '관리자 전용 화면입니다') + '</h2>' +
        '<p>' + ti('admin.blockBody', '데이터 현황 보드는 관리자 계정만 열람할 수 있습니다.<br>관리자 계정으로 로그인해 주세요.') + '</p>' +
        '<div class="agc-cta">' +
          '<a class="btn btn-primary" href="login.html">' + ti('auth.login', '로그인') + '</a>' +
          '<a class="btn btn-ghost" href="index.html">' + ti('gate.home', '홈으로') + '</a>' +
        '</div>' +
      '</div>';
  }
  function blockAdminOnlyPage() {
    document.body.classList.add('admin-only-blocked');
    if (document.getElementById('adminOnlyGate')) return;
    var ov = document.createElement('div');
    ov.id = 'adminOnlyGate'; ov.className = 'auth-gate-ov admin-only-ov';
    ov.innerHTML = adminOverlayHTML();
    document.body.appendChild(ov);
  }
  function unblockAdminOnlyPage() {
    document.body.classList.remove('admin-only-blocked');
    var ov = document.getElementById('adminOnlyGate'); if (ov) ov.remove();
  }

  function injectAccount(authed, name) {
    lastAuthed = authed; lastName = name;
    var host = acctHost(); if (!host) return;
    var role = authed ? (TWAUTH.session() || {}).role : null;

    /* 로그인 / 로그아웃 버튼 */
    var a = document.getElementById('acctBtn');
    if (!a) { a = document.createElement('a'); a.id = 'acctBtn'; a.className = 'acct-btn'; host.appendChild(a); }
    if (authed) {
      a.textContent = ti('auth.logout', '로그아웃') + (name ? ' · ' + name : '');
      a.href = 'javascript:void(0)'; a.title = ti('auth.logout', '로그아웃');
      a.onclick = function () { TWAUTH.logout().then(function () { location.reload(); }); };
    } else {
      a.textContent = ti('auth.login', '로그인'); a.href = 'login.html'; a.title = ti('auth.login', '로그인'); a.onclick = null;
    }

    /* 관리자: '회원 승인' 링크 — 로그인 유지한 채 관리자 화면 이동 */
    var adm = document.getElementById('adminBtn');
    if (authed && role === 'admin') {
      if (!adm) { adm = document.createElement('a'); adm.id = 'adminBtn'; adm.className = 'acct-btn acct-btn-admin'; host.insertBefore(adm, a); }
      adm.textContent = ti('auth.admin', '회원 승인'); adm.href = 'admin.html'; adm.title = ti('auth.admin', '회원 승인');
    } else if (adm) { adm.remove(); }
  }

  /* blur 직전 알림 토스트 (카운트다운) */
  function showToast(secondsLeft) {
    var t = document.getElementById('gateToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gateToast'; t.className = 'gate-toast';
      document.body.appendChild(t);
    }
    t.innerHTML =
      '<span class="gt-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.6"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.4v2.4"/></svg></span>' +
      '<span class="gt-txt"><b>' + ti('gate.title', '로그인이 필요한 서비스입니다') + '</b>' +
      '<small>' + ti('gate.toastSub', '<b>%s초</b> 후 주요 기능이 가려집니다 · 로그인 시 계속 이용').replace('%s', secondsLeft) + '</small></span>' +
      '<a class="gt-btn" href="login.html">' + ti('auth.login', '로그인') + '</a>';
  }
  function removeToast() { var t = document.getElementById('gateToast'); if (t) t.remove(); }

  function gateOverlayHTML() {
    return '<div class="auth-gate-card">' +
        '<div class="agc-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.6"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.4v2.5"/></svg></div>' +
        '<h2>' + ti('gate.title', '로그인이 필요한 서비스입니다') + '</h2>' +
        '<p>' + ti('gate.body', '주요 기능은 로그인 후 이용하실 수 있습니다.<br>승인된 계정으로 로그인하거나 회원가입을 신청해 주세요.') + '</p>' +
        '<div class="agc-cta">' +
          '<a class="btn btn-primary" href="login.html">' + ti('gate.cta', '로그인 / 회원가입') + '</a>' +
          '<a class="btn btn-ghost" href="index.html">' + ti('gate.home', '홈으로') + '</a>' +
        '</div>' +
      '</div>';
  }
  function applyGate() {
    if (gateApplied || TWAUTH.isAuthed()) return;
    gateApplied = true;
    removeToast();
    document.body.classList.add('auth-gated');
    if (document.getElementById('authGate')) return;
    var ov = document.createElement('div');
    ov.id = 'authGate'; ov.className = 'auth-gate-ov';
    ov.innerHTML = gateOverlayHTML();
    document.body.appendChild(ov);
  }

  function clearTimers() { timers.forEach(function (id) { clearTimeout(id); clearInterval(id); }); timers = []; }
  function releaseGate() {
    gateApplied = false; clearTimers(); removeToast();
    document.body.classList.remove('auth-gated');
    var ov = document.getElementById('authGate'); if (ov) ov.remove();
  }

  /* 게이트 예약: (지연-알림) 시점에 카운트다운 알림 → 지연 시점에 blur */
  function scheduleGate() {
    var warnAt = Math.max(0, GATE_DELAY_MS - WARN_BEFORE);
    timers.push(setTimeout(function () {
      if (TWAUTH.isAuthed()) return;
      var n = Math.round(WARN_BEFORE / 1000);
      showToast(n);
      var cd = setInterval(function () { n--; if (n > 0) showToast(n); else clearInterval(cd); }, 1000);
      timers.push(cd);
    }, warnAt));
    timers.push(setTimeout(applyGate, GATE_DELAY_MS));
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof TWAUTH === 'undefined') return;
    var onAdminOnly = isAdminOnlyPage();
    var s = TWAUTH.session();
    var cachedAdmin = TWAUTH.isAuthed() && s && s.role === 'admin';

    injectAccount(TWAUTH.isAuthed(), s && s.name);
    applyAdminOnlyNav(cachedAdmin);
    /* 캐시상 관리자가 아니면 즉시 차단(데이터 깜빡임 방지) — 검증 후 확정 */
    if (onAdminOnly && !cachedAdmin) blockAdminOnlyPage();

    var hasContent = !!document.querySelector('.dash-section'); /* 대시보드 화면만 게이트(랜딩/홈 제외) */
    TWAUTH.validate().then(function (authed) {
      s = TWAUTH.session();
      var isAdmin = authed && s && s.role === 'admin';
      injectAccount(authed, s && s.name);
      applyAdminOnlyNav(isAdmin);

      if (onAdminOnly) {                 /* 관리자 전용 화면은 일반 게이트(10초 노출) 미적용 */
        if (isAdmin) { unblockAdminOnlyPage(); releaseGate(); }
        else { blockAdminOnlyPage(); }
        return;
      }
      if (authed) { releaseGate(); }
      else if (hasContent) { scheduleGate(); }
    });
  });

  /* 언어 전환 시 동적 주입 요소(계정 버튼·게이트/관리자 오버레이) 재번역 */
  window.addEventListener('twl:langchange', function () {
    injectAccount(lastAuthed, lastName);
    var g = document.getElementById('authGate'); if (g) g.innerHTML = gateOverlayHTML();
    var ao = document.getElementById('adminOnlyGate'); if (ao) ao.innerHTML = adminOverlayHTML();
  });
})();
