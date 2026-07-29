/* =========================================================
   TWL Control Tower — 인증 클라이언트 (커스텀 auth, Supabase RPC + Edge Function)
   - 비밀번호는 서버(Supabase)에서 bcrypt 해시로만 검증 (평문 저장/전송 없음, HTTPS)
   - 가입은 이메일 인증코드(OTP) 확인 후 pending → 관리자 승인 시 로그인 가능
   ========================================================= */
(function () {
  'use strict';
  var SB_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var SB_KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv'; /* publishable — RPC/Edge 호출용 */
  var LS = 'twl-auth';

  function rpc(fn, args) {
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    }).then(function (r) { return r.json(); }).catch(function () { return { error: '네트워크 오류' }; });
  }
  function edge(fn, body) {
    return fetch(SB_URL + '/functions/v1/' + fn, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); }).catch(function () { return { error: '네트워크 오류' }; });
  }

  function session() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function save(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) { /* */ } }
  function clear() { try { localStorage.removeItem(LS); } catch (e) { /* */ } }

  /* 비밀번호 강도 — 특수문자 등 5기준 */
  function pwStrength(pw) {
    pw = pw || '';
    var checks = {
      len: pw.length >= 8,
      lower: /[a-z]/.test(pw),
      upper: /[A-Z]/.test(pw),
      digit: /[0-9]/.test(pw),
      special: /[^A-Za-z0-9]/.test(pw),
    };
    var score = (checks.len ? 1 : 0) + (checks.lower ? 1 : 0) + (checks.upper ? 1 : 0) + (checks.digit ? 1 : 0) + (checks.special ? 1 : 0);
    var label = score <= 2 ? '약함' : score === 3 ? '보통' : score === 4 ? '강함' : '매우 강함';
    var color = score <= 2 ? 'var(--lv-congested)' : score === 3 ? 'var(--lv-stable)' : 'var(--lv-low)';
    // 최소 요건: 8자 이상 + 특수문자 포함
    var ok = checks.len && checks.special && score >= 3;
    return { score: score, label: label, color: color, checks: checks, ok: ok };
  }

  window.TWAUTH = {
    SB_URL: SB_URL, SB_KEY: SB_KEY,
    session: session, clear: clear, pwStrength: pwStrength,
    isAuthed: function () { var s = session(); return !!(s && s.token); },
    role: function () { var s = session(); return s ? s.role : null; },

    /* 서버 세션 유효성 확인(만료·삭제 시 로그아웃 처리) */
    validate: function () {
      var s = session(); if (!s || !s.token) return Promise.resolve(false);
      return rpc('app_me', { p_token: s.token }).then(function (r) {
        if (!r || !r.ok) { clear(); return false; }
        return true;
      });
    },

    login: function (login, pw) {
      return rpc('app_login', { p_login: login, p_password: pw }).then(function (r) {
        if (r && r.ok) save(r);
        return r;
      });
    },
    logout: function () {
      var s = session();
      var done = s && s.token ? rpc('app_logout', { p_token: s.token }) : Promise.resolve();
      return done.then(function () { clear(); });
    },

    /* 가입: 인증코드 발송 → 확인 후 가입신청 */
    signupSendCode: function (login) { return edge('send-code', { login: login, purpose: 'signup' }); },
    signup: function (login, pw, code, name) { return rpc('app_signup_verified', { p_login: login, p_password: pw, p_code: code, p_name: name }); },

    /* 비밀번호 찾기: 인증코드 발송 → 확인 후 재설정 */
    resetSendCode: function (login) { return edge('send-code', { login: login, purpose: 'reset' }); },
    reset: function (login, code, pw) { return rpc('app_reset_with_code', { p_login: login, p_code: code, p_new_password: pw }); },

    /* 관리자 */
    adminList: function () { var s = session(); return rpc('app_admin_list', { p_token: s ? s.token : null }); },
    adminSetStatus: function (id, status) { var s = session(); return rpc('app_admin_set_status', { p_token: s ? s.token : null, p_id: id, p_status: status }); },
    adminResetPw: function (id, pw) { var s = session(); return rpc('app_admin_reset_pw', { p_token: s ? s.token : null, p_id: id, p_new_password: pw }); },
  };
})();
