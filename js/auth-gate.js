/* =========================================================
   TWL Control Tower — 미로그인 게이트 (lock-in 티저)
   처음엔 정상 노출 → 일정시간 뒤 주요기능 blur + "로그인 필요" 오버레이.
   로그인(승인 계정)하면 게이트 해제 · 전 화면 열람.
   ※ 정적 사이트 특성상 화면 게이트는 억제(UX) 수준이며 완벽 보안 아님.
   ========================================================= */
(function () {
  'use strict';
  var GATE_DELAY_MS = 18000; /* [조정] 처음 노출 시간(ms). 이후 게이트 */
  var gateApplied = false, gateTimer = null;

  function acctHost() { return document.querySelector('.site-header .header-inner'); }

  function injectAccount(authed, name) {
    var host = acctHost(); if (!host) return;
    var a = document.getElementById('acctBtn');
    if (!a) {
      a = document.createElement('a');
      a.id = 'acctBtn'; a.className = 'acct-btn';
      host.appendChild(a);
    }
    if (authed) {
      a.textContent = '로그아웃' + (name ? ' · ' + name : '');
      a.href = 'javascript:void(0)'; a.title = '로그아웃';
      a.onclick = function () { TWAUTH.logout().then(function () { location.reload(); }); };
    } else {
      a.textContent = '로그인'; a.href = 'login.html'; a.title = '로그인'; a.onclick = null;
    }
  }

  function applyGate() {
    if (gateApplied || TWAUTH.isAuthed()) return;
    gateApplied = true;
    document.body.classList.add('auth-gated');
    if (document.getElementById('authGate')) return;
    var ov = document.createElement('div');
    ov.id = 'authGate'; ov.className = 'auth-gate-ov';
    ov.innerHTML =
      '<div class="auth-gate-card">' +
        '<div class="agc-lock" aria-hidden="true">🔒</div>' +
        '<h2>로그인이 필요한 서비스입니다</h2>' +
        '<p>주요 기능은 로그인 후 이용하실 수 있습니다.<br>승인된 계정으로 로그인하거나 회원가입을 신청해 주세요.</p>' +
        '<div class="agc-cta">' +
          '<a class="btn btn-primary" href="login.html">로그인 / 회원가입</a>' +
          '<a class="btn btn-ghost" href="index.html">홈으로</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
  }

  function releaseGate() {
    gateApplied = false;
    if (gateTimer) { clearTimeout(gateTimer); gateTimer = null; }
    document.body.classList.remove('auth-gated');
    var ov = document.getElementById('authGate'); if (ov) ov.remove();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof TWAUTH === 'undefined') return;
    var s = TWAUTH.session();
    injectAccount(TWAUTH.isAuthed(), s && s.name);
    var hasContent = !!document.querySelector('.dash-section'); /* 대시보드 화면만 게이트(랜딩/홈 제외) */
    TWAUTH.validate().then(function (authed) {
      s = TWAUTH.session();
      injectAccount(authed, s && s.name);
      if (authed) { releaseGate(); }
      else if (hasContent) { gateTimer = setTimeout(applyGate, GATE_DELAY_MS); }
    });
  });
})();
