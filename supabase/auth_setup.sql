-- =========================================================
-- TWL Control Tower — 커스텀 인증 백엔드 (Supabase Postgres)
-- 이메일+비번(bcrypt) 로그인 · 이메일 인증코드(OTP) 가입 · 관리자 승인 · 세션 토큰
-- 민감 테이블은 RLS 잠금(anon 직접 접근 불가) → SECURITY DEFINER 함수로만 접근.
-- 발송은 Edge Function `send-code`(denomailer + 본인 SMTP)가 담당.
-- =========================================================
create extension if not exists pgcrypto;   -- crypt/gen_salt (extensions 스키마)

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  pass_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  role text not null default 'user' check (role in ('user','admin')),
  display_name text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create table if not exists public.app_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create table if not exists public.email_codes (
  id uuid primary key default gen_random_uuid(),
  login_id text not null,
  code text not null,
  purpose text not null default 'signup' check (purpose in ('signup','reset')),
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  consumed boolean not null default false
);
create index if not exists email_codes_lookup on public.email_codes(login_id, purpose, created_at desc);

alter table public.app_users   enable row level security;  -- 정책 없음 → anon 직접 접근 불가
alter table public.app_sessions enable row level security;
alter table public.email_codes  enable row level security;

-- 로그인: bcrypt 검증 → 승인 계정만 세션 토큰 발급
create or replace function public.app_login(p_login text, p_password text)
returns json language plpgsql security definer set search_path=public, extensions as $fn$
declare u public.app_users; v_token uuid;
begin
  select * into u from app_users where login_id = lower(trim(p_login));
  if u.id is null or u.pass_hash <> crypt(p_password, u.pass_hash) then
    return json_build_object('error','아이디 또는 비밀번호가 올바르지 않습니다'); end if;
  if u.status <> 'approved' then
    return json_build_object('status', u.status, 'error',
      case u.status when 'pending' then '승인 대기중입니다. 관리자 승인 후 이용 가능합니다.' else '승인되지 않았거나 거부된 계정입니다.' end); end if;
  insert into app_sessions(user_id) values (u.id) returning token into v_token;
  return json_build_object('ok',true,'token',v_token,'role',u.role,'login',u.login_id,'name',u.display_name);
end $fn$;

-- 세션 확인 / 로그아웃
create or replace function public.app_me(p_token uuid)
returns json language plpgsql security definer set search_path=public, extensions as $fn$
declare u public.app_users;
begin
  select au.* into u from app_sessions s join app_users au on au.id=s.user_id where s.token=p_token and s.expires_at>now();
  if u.id is null then return json_build_object('error','세션이 만료되었습니다'); end if;
  return json_build_object('ok',true,'role',u.role,'login',u.login_id,'name',u.display_name,'status',u.status);
end $fn$;
create or replace function public.app_logout(p_token uuid)
returns void language plpgsql security definer set search_path=public, extensions as $fn$
begin delete from app_sessions where token=p_token; end $fn$;

-- 가입(인증코드 확인 후 pending 생성) / 비밀번호 재설정(인증코드 확인 후)
create or replace function public.app_signup_verified(p_login text, p_password text, p_code text, p_name text default null)
returns json language plpgsql security definer set search_path=public, extensions as $fn$
declare v_id uuid; v_login text := lower(trim(p_login));
begin
  if v_login is null or length(v_login) < 4 then return json_build_object('error','아이디(이메일)를 확인하세요'); end if;
  if p_password is null or length(p_password) < 8 then return json_build_object('error','비밀번호는 8자 이상이어야 합니다'); end if;
  if not exists(select 1 from email_codes where login_id=v_login and code=p_code and purpose='signup' and not consumed and expires_at>now()) then
    return json_build_object('error','인증코드가 올바르지 않거나 만료되었습니다'); end if;
  if exists(select 1 from app_users where login_id=v_login) then
    return json_build_object('error','이미 가입 신청되었거나 사용 중인 아이디입니다'); end if;
  update email_codes set consumed=true where login_id=v_login and purpose='signup';
  insert into app_users(login_id, pass_hash, display_name) values (v_login, crypt(p_password, gen_salt('bf')), nullif(trim(p_name),'')) returning id into v_id;
  return json_build_object('ok', true, 'status', 'pending');
end $fn$;
create or replace function public.app_reset_with_code(p_login text, p_code text, p_new_password text)
returns json language plpgsql security definer set search_path=public, extensions as $fn$
declare v_login text := lower(trim(p_login));
begin
  if p_new_password is null or length(p_new_password) < 8 then return json_build_object('error','비밀번호는 8자 이상이어야 합니다'); end if;
  if not exists(select 1 from email_codes where login_id=v_login and code=p_code and purpose='reset' and not consumed and expires_at>now()) then
    return json_build_object('error','인증코드가 올바르지 않거나 만료되었습니다'); end if;
  if not exists(select 1 from app_users where login_id=v_login) then return json_build_object('error','가입되지 않은 아이디입니다'); end if;
  update email_codes set consumed=true where login_id=v_login and purpose='reset';
  update app_users set pass_hash=crypt(p_new_password, gen_salt('bf')) where login_id=v_login;
  return json_build_object('ok', true);
end $fn$;

-- 관리자: 목록 / 상태변경(승인·거부) / 비밀번호 재설정 (토큰의 role=admin 확인)
create or replace function public.app_admin_list(p_token uuid)
returns json language plpgsql security definer set search_path=public, extensions as $fn$
declare v_role text;
begin
  select au.role into v_role from app_sessions s join app_users au on au.id=s.user_id where s.token=p_token and s.expires_at>now();
  if v_role is distinct from 'admin' then return json_build_object('error','관리자 권한이 필요합니다'); end if;
  return coalesce((select json_agg(json_build_object('id',id,'login',login_id,'name',display_name,'status',status,'role',role,'created_at',created_at) order by created_at desc) from app_users), '[]'::json);
end $fn$;
create or replace function public.app_admin_set_status(p_token uuid, p_id uuid, p_status text)
returns json language plpgsql security definer set search_path=public, extensions as $fn$
declare v_role text;
begin
  select au.role into v_role from app_sessions s join app_users au on au.id=s.user_id where s.token=p_token and s.expires_at>now();
  if v_role is distinct from 'admin' then return json_build_object('error','관리자 권한이 필요합니다'); end if;
  if p_status not in ('approved','rejected','pending') then return json_build_object('error','잘못된 상태값'); end if;
  update app_users set status=p_status, approved_at=case when p_status='approved' then now() else approved_at end where id=p_id and role<>'admin';
  return json_build_object('ok',true);
end $fn$;
create or replace function public.app_admin_reset_pw(p_token uuid, p_id uuid, p_new_password text)
returns json language plpgsql security definer set search_path=public, extensions as $fn$
declare v_role text;
begin
  select au.role into v_role from app_sessions s join app_users au on au.id=s.user_id where s.token=p_token and s.expires_at>now();
  if v_role is distinct from 'admin' then return json_build_object('error','관리자 권한이 필요합니다'); end if;
  if p_new_password is null or length(p_new_password) < 6 then return json_build_object('error','비밀번호는 6자 이상이어야 합니다'); end if;
  update app_users set pass_hash = crypt(p_new_password, gen_salt('bf')) where id = p_id;
  return json_build_object('ok', true);
end $fn$;

-- anon(publishable 키) 실행 권한 부여
grant execute on function public.app_login(text,text), public.app_me(uuid), public.app_logout(uuid),
  public.app_signup_verified(text,text,text,text), public.app_reset_with_code(text,text,text),
  public.app_admin_list(uuid), public.app_admin_set_status(uuid,uuid,text), public.app_admin_reset_pw(uuid,uuid,text) to anon;

-- 관리자 계정 시드 (초기 비번은 반드시 변경 권장)
insert into public.app_users(login_id, pass_hash, status, role, display_name)
values ('sitditrd@naver.com', crypt('CHANGE_ME', gen_salt('bf')), 'approved', 'admin', '관리자')
on conflict (login_id) do nothing;

notify pgrst, 'reload schema';
