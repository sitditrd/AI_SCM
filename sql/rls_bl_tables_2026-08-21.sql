-- 화물 감시 테이블 익명 읽기 차단 (2026-08-21 운영 반영 완료)
--
-- [문제]
-- bl_watch / bl_snapshot / bl_change_log 의 SELECT 정책이 qual=true 로
-- anon·authenticated 에게 열려 있었다. 공개 publishable 키는 설계상 프론트 JS 에
-- 박혀 있으므로, 로그인 없이 REST 로 전 행을 읽을 수 있었다.
-- 실제 재현: bl_watch 12건 전량이 created_by(로그인 이메일)·notify_email 과 함께 반환됨.
--
-- 쓰기는 정책이 없어 42501 로 차단되고 있었으므로 '읽기 전용 노출'이었다.
--
-- [안전 근거 — 조치 전 확인]
--   · 프론트(js/cargo.js)는 이 세 테이블을 REST 로 직접 읽지 않는다.
--     bl-watch Edge Function 경유이며, 그 함수는 SUPABASE_SERVICE_ROLE_KEY 를 쓴다.
--     (js/cargo.js 가 REST 로 직접 읽는 것은 bs_vessel_calls 뿐)
--   · 수집기 scripts/collect_bl_watch.py 도 SUPABASE_SERVICE_KEY(서비스 롤) 사용.
--   · service_role 은 RLS 를 우회한다(relforcerowsecurity = false).
--   → 죽는 것은 익명 REST 읽기 경로뿐이고, 그것이 이 변경의 목적이다.
--
-- [결과 상태] RLS enabled + SELECT 정책 0개 = 비(非)service_role 은 0행.
--             app_users 가 이미 같은 형태로 안전하게 운영 중이라 선례가 있다.
--
-- [의도적 예외] bs_vessel_calls 의 'public read calls' 는 그대로 둔다.
--               터미널 선석 스케줄은 공개해도 되는 데이터이고, 프론트가 직접 읽는다.

drop policy if exists bl_watch_sel      on public.bl_watch;
drop policy if exists bl_snapshot_sel   on public.bl_snapshot;
drop policy if exists bl_change_log_sel on public.bl_change_log;

-- 검증 쿼리 — 조치 후 policy_count 가 0 이어야 한다
--   select tablename, count(*) from pg_policies
--    where schemaname='public' and tablename in ('bl_watch','bl_snapshot','bl_change_log')
--    group by tablename;
--
-- 익명 검증(공개 키로) — 셋 다 Content-Range 가 */0 이어야 한다
--   curl -H "apikey: <publishable>" -H "Range: 0-0" -H "Prefer: count=exact" \
--        "<url>/rest/v1/bl_watch?select=*"
