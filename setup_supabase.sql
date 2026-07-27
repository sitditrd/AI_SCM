-- =====================================================
-- TWL Port Insight — Supabase 초기 설정 SQL
-- Supabase 대시보드 > SQL Editor 에 전체 붙여넣기 후 Run
-- 재실행해도 안전 (기존 테이블 삭제 후 재생성)
-- =====================================================

drop table if exists public.pi_ports;
drop table if exists public.pi_snapshot;

-- 1) Focus Port 테이블
create table public.pi_ports (
  id          bigint generated always as identity primary key,
  name_en     text not null,
  name_ko     text not null,
  country_cd  text not null,
  region_cd   text not null,  -- EA/SEA/SAME/EU/NA/LATAM/AF/OC
  lat         numeric(9,4) not null,
  lng         numeric(9,4) not null,
  tpfs        numeric(5,1) not null,   -- 0~100
  delay_h     numeric(6,1) not null,   -- 접안 지연(시간)
  waiting_cnt integer not null default 0,
  berthed_cnt integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- 2) 글로벌 스냅샷 (단일 행 id=1)
create table public.pi_snapshot (
  id             integer primary key,
  total_ports    integer not null,
  tpfs           numeric(5,1) not null,
  critical_ports integer not null,
  global_risk    text not null,  -- LOW/MEDIUM/HIGH
  avg_delay_h    numeric(6,1) not null,
  distribution   jsonb not null,
  period_start   date not null,
  period_end     date not null,
  updated_at     timestamptz not null default now()
);

-- 3) RLS: 익명(publishable key) 읽기만 허용, 쓰기는 대시보드/서버 전용
alter table public.pi_ports enable row level security;
alter table public.pi_snapshot enable row level security;
create policy "public read ports" on public.pi_ports for select using (true);
create policy "public read snapshot" on public.pi_snapshot for select using (true);

-- 4) 스냅샷 시드
insert into public.pi_snapshot (id, total_ports, tpfs, critical_ports, global_risk, avg_delay_h, distribution, period_start, period_end) values
  (1, 1253, 51.8, 127, 'HIGH', 17.1, '[{"level":"LOW","ratio":62.8,"count":787,"delta":9},{"level":"STABLE","ratio":16.2,"count":203,"delta":-23},{"level":"BUSY","ratio":10.9,"count":136,"delta":5},{"level":"CONGESTED","ratio":10.1,"count":127,"delta":9}]'::jsonb, '2026-06-29', '2026-07-12');

-- 5) Focus Port 93개 시드
insert into public.pi_ports (name_en, name_ko, country_cd, region_cd, lat, lng, tpfs, delay_h, waiting_cnt, berthed_cnt) values
  ('Shanghai', '상하이', 'CN', 'EA', 31.23, 121.49, 57.1, 20.3, 15, 67),
  ('Ningbo', '닝보', 'CN', 'EA', 29.87, 121.55, 54.5, 18, 12, 53),
  ('Shenzhen (Yantian)', '선전(옌톈)', 'CN', 'EA', 22.58, 114.27, 47.8, 14, 7, 44),
  ('Guangzhou (Nansha)', '광저우(난사)', 'CN', 'EA', 22.77, 113.6, 41.6, 11.5, 7, 37),
  ('Qingdao', '칭다오', 'CN', 'EA', 36.08, 120.32, 45.3, 13.3, 8, 40),
  ('Tianjin', '톈진', 'CN', 'EA', 38.98, 117.75, 39.5, 11.3, 5, 33),
  ('Xiamen', '샤먼', 'CN', 'EA', 24.47, 118.07, 33.1, 8, 5, 26),
  ('Dalian', '다롄', 'CN', 'EA', 38.93, 121.63, 20.3, 4, 4, 16),
  ('Hong Kong', '홍콩', 'HK', 'EA', 22.32, 114.13, 35.1, 9.7, 4, 31),
  ('Kaohsiung', '가오슝', 'TW', 'EA', 22.6, 120.28, 41.1, 13.2, 5, 29),
  ('Busan', '부산', 'KR', 'EA', 35.08, 129.04, 46, 14.5, 10, 48),
  ('Incheon', '인천', 'KR', 'EA', 37.45, 126.6, 28, 6.5, 3, 18),
  ('Gwangyang', '광양', 'KR', 'EA', 34.9, 127.7, 17.7, 3, 1, 13),
  ('Tokyo', '도쿄', 'JP', 'EA', 35.61, 139.79, 31.1, 7.3, 1, 20),
  ('Yokohama', '요코하마', 'JP', 'EA', 35.43, 139.68, 25.9, 5.8, 2, 17),
  ('Nagoya', '나고야', 'JP', 'EA', 35.03, 136.85, 21.6, 4.6, 2, 14),
  ('Kobe', '고베', 'JP', 'EA', 34.68, 135.2, 24.2, 4.9, 3, 15),
  ('Singapore', '싱가포르', 'SG', 'SEA', 1.26, 103.83, 57.7, 20, 19, 73),
  ('Tanjung Pelepas', '탄중펠레파스', 'MY', 'SEA', 1.36, 103.55, 42.7, 13.2, 7, 30),
  ('Port Klang', '포트클랑', 'MY', 'SEA', 3, 101.39, 59.1, 24.3, 15, 43),
  ('Penang', '페낭', 'MY', 'SEA', 5.41, 100.34, 34.6, 8.8, 4, 15),
  ('Kuching', '쿠칭', 'MY', 'SEA', 1.56, 110.34, 37.8, 10.7, 3, 12),
  ('Jakarta (Tg. Priok)', '자카르타(탄중프리옥)', 'ID', 'SEA', -6.1, 106.89, 63.5, 25.6, 16, 38),
  ('Surabaya', '수라바야', 'ID', 'SEA', -7.2, 112.73, 47.6, 15.1, 9, 23),
  ('Laem Chabang', '람차방', 'TH', 'SEA', 13.08, 100.89, 44.5, 14.4, 7, 32),
  ('Bangkok', '방콕', 'TH', 'SEA', 13.7, 100.57, 52.4, 18.3, 9, 23),
  ('Ho Chi Minh (Cat Lai)', '호치민(깟라이)', 'VN', 'SEA', 10.78, 106.79, 59, 23.5, 14, 34),
  ('Cai Mep', '까이멥', 'VN', 'SEA', 10.53, 107.02, 39.7, 11.1, 4, 20),
  ('Haiphong', '하이퐁', 'VN', 'SEA', 20.86, 106.73, 54.7, 19.8, 11, 27),
  ('Manila', '마닐라', 'PH', 'SEA', 14.6, 120.96, 77.4, 40.1, 23, 27),
  ('Yangon', '양곤', 'MM', 'SEA', 16.78, 96.16, 84.1, 49, 21, 13),
  ('Sihanoukville', '시아누크빌', 'KH', 'SEA', 10.63, 103.5, 51.6, 17.5, 8, 12),
  ('Colombo', '콜롬보', 'LK', 'SAME', 6.95, 79.85, 61.5, 26.1, 15, 37),
  ('Chattogram', '치타공', 'BD', 'SAME', 22.31, 91.8, 91.3, 70.1, 34, 21),
  ('Nhava Sheva (JNPT)', '나바셰바(JNPT)', 'IN', 'SAME', 18.95, 72.95, 53.4, 18.8, 9, 34),
  ('Mundra', '문드라', 'IN', 'SAME', 22.84, 69.71, 35.7, 10.2, 6, 28),
  ('Chennai', '첸나이', 'IN', 'SAME', 13.1, 80.3, 57.8, 20.8, 9, 24),
  ('Karachi', '카라치', 'PK', 'SAME', 24.8, 66.97, 84.1, 54.4, 25, 20),
  ('Jebel Ali', '제벨알리', 'AE', 'SAME', 25.01, 55.06, 35.5, 9.6, 4, 46),
  ('Khalifa (Abu Dhabi)', '칼리파(아부다비)', 'AE', 'SAME', 24.81, 54.64, 22.3, 5, 2, 18),
  ('Hamad', '하마드', 'QA', 'SAME', 25.01, 51.61, 19.2, 3.7, 0, 14),
  ('Dammam', '담맘', 'SA', 'SAME', 26.5, 50.2, 44.1, 12.9, 7, 20),
  ('Jeddah', '제다', 'SA', 'SAME', 21.48, 39.17, 48.3, 15, 10, 32),
  ('Salalah', '살랄라', 'OM', 'SAME', 16.95, 54, 27.9, 6, 3, 21),
  ('Bandar Abbas', '반다르아바스', 'IR', 'SAME', 27.14, 56.21, 78.8, 38.4, 16, 17),
  ('Rotterdam', '로테르담', 'NL', 'EU', 51.95, 4.14, 47.4, 16.2, 13, 58),
  ('Antwerp-Bruges', '안트베르펜', 'BE', 'EU', 51.3, 4.3, 51.4, 19.2, 13, 50),
  ('Hamburg', '함부르크', 'DE', 'EU', 53.55, 9.93, 46.4, 13.5, 9, 38),
  ('Bremerhaven', '브레머하펜', 'DE', 'EU', 53.55, 8.58, 32.8, 8.1, 3, 23),
  ('Le Havre', '르아브르', 'FR', 'EU', 49.48, 0.11, 50.6, 17, 10, 26),
  ('Fos-Marseille', '포스-마르세유', 'FR', 'EU', 43.42, 4.86, 39.1, 10.8, 4, 18),
  ('Valencia', '발렌시아', 'ES', 'EU', 39.45, -0.32, 45.8, 14, 8, 28),
  ('Algeciras', '알헤시라스', 'ES', 'EU', 36.13, -5.44, 35.3, 9.3, 6, 34),
  ('Barcelona', '바르셀로나', 'ES', 'EU', 41.35, 2.16, 28.1, 7.1, 1, 21),
  ('Genoa', '제노바', 'IT', 'EU', 44.4, 8.92, 53.1, 19.1, 8, 23),
  ('Gioia Tauro', '조이아타우로', 'IT', 'EU', 38.44, 15.9, 30.9, 8, 5, 22),
  ('Trieste', '트리에스테', 'IT', 'EU', 45.62, 13.77, 25.4, 5.7, 3, 13),
  ('Koper', '코페르', 'SI', 'EU', 45.55, 13.73, 42.7, 12.1, 4, 16),
  ('Piraeus', '피레우스', 'GR', 'EU', 37.94, 23.63, 58, 22, 13, 30),
  ('Ambarli (Istanbul)', '암바를르(이스탄불)', 'TR', 'EU', 40.97, 28.68, 59.6, 23.8, 10, 24),
  ('Mersin', '메르신', 'TR', 'EU', 36.78, 34.64, 51.3, 16.9, 7, 19),
  ('Gdansk', '그단스크', 'PL', 'EU', 54.4, 18.66, 24.1, 5.3, 4, 17),
  ('Felixstowe', '펠릭스토', 'GB', 'EU', 51.95, 1.35, 45.8, 13.3, 6, 25),
  ('London Gateway', '런던게이트웨이', 'GB', 'EU', 51.5, 0.49, 29.5, 6.9, 2, 16),
  ('Los Angeles', 'LA', 'US', 'NA', 33.73, -118.26, 65.5, 26.9, 20, 50),
  ('Long Beach', '롱비치', 'US', 'NA', 33.75, -118.2, 59.3, 24.6, 16, 47),
  ('Oakland', '오클랜드', 'US', 'NA', 37.8, -122.32, 37.1, 10.1, 4, 23),
  ('Seattle-Tacoma', '시애틀-타코마', 'US', 'NA', 47.58, -122.35, 27.9, 6.2, 3, 18),
  ('Vancouver', '밴쿠버', 'CA', 'NA', 49.29, -123.11, 54.5, 19.2, 10, 30),
  ('New York/New Jersey', '뉴욕/뉴저지', 'US', 'NA', 40.67, -74.05, 51, 15.9, 12, 43),
  ('Savannah', '서배너', 'US', 'NA', 32.08, -81.09, 67.3, 28.3, 16, 33),
  ('Charleston', '찰스턴', 'US', 'NA', 32.78, -79.92, 37.7, 9.7, 5, 22),
  ('Houston', '휴스턴', 'US', 'NA', 29.73, -95.01, 55.8, 20.2, 11, 29),
  ('Manzanillo (MX)', '만사니요(멕시코)', 'MX', 'NA', 19.05, -104.31, 63.1, 26.6, 15, 23),
  ('Lazaro Cardenas', '라사로카르데나스', 'MX', 'NA', 17.95, -102.18, 40, 12.2, 8, 18),
  ('Santos', '산투스', 'BR', 'LATAM', -23.95, -46.3, 74.6, 36.7, 23, 33),
  ('Callao', '카야오', 'PE', 'LATAM', -12.05, -77.15, 53.8, 19, 10, 20),
  ('Cartagena', '카르타헤나', 'CO', 'LATAM', 10.4, -75.53, 32.8, 8.2, 5, 23),
  ('Colon (Panama)', '콜론(파나마)', 'PA', 'LATAM', 9.36, -79.9, 48.1, 15, 9, 32),
  ('Buenos Aires', '부에노스아이레스', 'AR', 'LATAM', -34.6, -58.37, 72.5, 38.6, 17, 18),
  ('Guayaquil', '과야킬', 'EC', 'LATAM', -2.28, -79.91, 40.8, 11.7, 6, 14),
  ('Tanger Med', '탕헤르메드', 'MA', 'AF', 35.88, -5.5, 34.8, 8.6, 4, 28),
  ('Port Said', '포트사이드', 'EG', 'AF', 31.25, 32.3, 46.8, 14.5, 8, 26),
  ('Alexandria', '알렉산드리아', 'EG', 'AF', 31.2, 29.87, 79.1, 39.7, 17, 15),
  ('Durban', '더반', 'ZA', 'AF', -29.87, 31.03, 68.8, 31.7, 16, 20),
  ('Cape Town', '케이프타운', 'ZA', 'AF', -33.9, 18.43, 58.8, 22.2, 10, 13),
  ('Lagos (Apapa)', '라고스(아파파)', 'NG', 'AF', 6.44, 3.38, 85.1, 64, 30, 17),
  ('Mombasa', '몸바사', 'KE', 'AF', -4.07, 39.65, 78.4, 45.4, 19, 12),
  ('Dar es Salaam', '다르에스살람', 'TZ', 'AF', -6.82, 39.29, 87, 55.2, 23, 11),
  ('Sydney (Botany)', '시드니(보터니)', 'AU', 'OC', -33.97, 151.22, 44.3, 12.3, 7, 20),
  ('Melbourne', '멜버른', 'AU', 'OC', -37.83, 144.93, 37.7, 10.6, 4, 17),
  ('Brisbane', '브리즈번', 'AU', 'OC', -27.38, 153.17, 25.3, 5.1, 4, 12),
  ('Auckland', '오클랜드(NZ)', 'NZ', 'OC', -36.84, 174.77, 46.8, 14.6, 8, 13);

-- 완료 확인용: select count(*) from pi_ports;  → 93