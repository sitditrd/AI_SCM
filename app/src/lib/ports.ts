/* Port Insight / 경로 분석 공통 — Supabase pi_ports·pi_snapshot */
import { sbSelect } from './supabase';

export type Level = 'LOW' | 'STABLE' | 'BUSY' | 'CONGESTED';
export type Port = {
  en: string; ko: string; cc: string; lat: number; lng: number;
  tpfs: number; delay: number; waiting: number; berthed: number; level: Level;
};
export type Snapshot = {
  total_ports: number; tpfs: number; critical_ports: number; global_risk: string;
  avg_delay_h: number; distribution: { level: Level; ratio: number; count: number }[];
  period_start: string; period_end: string;
};

type RawPort = {
  name_en: string; name_ko: string; country_cd: string; region_cd: string;
  lat: number; lng: number; tpfs: number; delay_h: number; waiting_cnt: number; berthed_cnt: number;
};

export function levelOf(t: number): Level {
  if (t >= 75) return 'CONGESTED';
  if (t >= 50) return 'BUSY';
  if (t >= 25) return 'STABLE';
  return 'LOW';
}
export const LEVEL_KO: Record<Level, string> = { LOW: '원활', STABLE: '안정', BUSY: '주의', CONGESTED: '혼잡' };
export const LEVEL_COLOR: Record<Level, string> = { LOW: '#0ca30c', STABLE: '#fab219', BUSY: '#ec835a', CONGESTED: '#d03b3b' };
export const LEVEL_ORDER: Level[] = ['LOW', 'STABLE', 'BUSY', 'CONGESTED'];

export async function fetchPorts(signal?: AbortSignal): Promise<Port[]> {
  const rows = await sbSelect<RawPort>('pi_ports?select=name_en,name_ko,country_cd,lat,lng,tpfs,delay_h,waiting_cnt,berthed_cnt', signal);
  return rows.map((r) => ({
    en: r.name_en, ko: r.name_ko, cc: r.country_cd,
    lat: Number(r.lat), lng: Number(r.lng), tpfs: Number(r.tpfs), delay: Number(r.delay_h),
    waiting: r.waiting_cnt, berthed: r.berthed_cnt, level: levelOf(Number(r.tpfs)),
  }));
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<Snapshot | null> {
  const rows = await sbSelect<Snapshot>('pi_snapshot?select=*&id=eq.1', signal);
  return rows[0] || null;
}

export function slugOf(en: string): string {
  return en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
