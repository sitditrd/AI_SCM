-- =====================================================
-- 예측 분석용 이력 축적 테이블 (Phase 1, 2026-07-31)
-- 적용: Supabase 마이그레이션 create_history_tables 로 적용됨 (본 파일은 스키마 기록용)
-- =====================================================

-- Port Insight 일별 스냅샷 이력 — pi_ports는 매일 덮어쓰므로 08:44 갱신 직후 여기에 append
create table if not exists public.pi_history (
  id bigserial primary key,
  snap_date date not null,
  name_en text not null,
  tpfs numeric,            -- PCI 지수 (컬럼명은 pi_ports와 동일하게 유지)
  delay_h numeric,
  waiting_cnt numeric,
  berthed_cnt numeric,
  created_at timestamptz not null default now(),
  unique (snap_date, name_en)
);
alter table public.pi_history enable row level security;
create policy "pi_history_anon_select" on public.pi_history for select using (true);
create index if not exists idx_pi_history_port_date on public.pi_history (name_en, snap_date desc);

-- 항만 기상 이력 — collect_weather_history.py 가 6시간 주기로 append (부산신항·광양항·인천항)
create table if not exists public.weather_history (
  id bigserial primary key,
  obs_ts timestamptz not null default now(),
  port text not null,
  wave_height_m numeric,
  wave_period_s numeric,
  wind_speed_ms numeric,
  wind_gust_ms numeric
);
alter table public.weather_history enable row level security;
create policy "weather_history_anon_select" on public.weather_history for select using (true);
create index if not exists idx_weather_history_port_ts on public.weather_history (port, obs_ts desc);
