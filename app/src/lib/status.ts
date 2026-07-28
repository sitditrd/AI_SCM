/* 데이터 현황 — 파이프라인 운영 보드 데이터 (Supabase 읽기 전용) */
import { sbSelect } from './supabase';

export type CollectLog = {
  id: number; collected_date: string; file_name: string | null;
  total_rows: number; status: string; message: string | null; created_at: string;
};
type Snapshot = { period_end: string; updated_at: string; tpfs: number };
type Freight = { pub_date: string; value: number; index_code: string; route: string };

export type SourceState = 'ok' | 'warn' | 'late' | 'off';
export type StatusData = {
  logs: CollectLog[];
  berth: { date: string; count: number } | null;
  pi: Snapshot | null;
  fx: { date: string; scfi: number | null } | null;
};

export async function fetchStatus(signal?: AbortSignal): Promise<StatusData> {
  const [logs, piRows, fxRows] = await Promise.all([
    sbSelect<CollectLog>('bs_collect_log?select=*&order=created_at.desc&limit=14', signal),
    sbSelect<Snapshot>('pi_snapshot?select=period_end,updated_at,tpfs&id=eq.1', signal),
    sbSelect<Freight>('freight_index?select=pub_date,value,index_code,route&order=pub_date.desc&limit=20', signal),
  ]);
  const latestOk = logs.find((l) => l.status === 'SUCCESS');
  const berth = latestOk ? { date: latestOk.collected_date, count: latestOk.total_rows } : null;
  const scfi = fxRows.find((x) => x.index_code === 'SCFI' && x.route === 'COMPOSITE');
  const fx = fxRows.length ? { date: fxRows[0].pub_date, scfi: scfi ? scfi.value : null } : null;
  return { logs, berth, pi: piRows[0] || null, fx };
}

export const ST: Record<SourceState, { ko: string; varc: string }> = {
  ok: { ko: '정상', varc: 'var(--lv-low)' },
  warn: { ko: '주의', varc: 'var(--lv-stable)' },
  late: { ko: '지연', varc: 'var(--lv-congested)' },
  off: { ko: '확인불가', varc: 'var(--muted)' },
};

export function ageText(ms: number): string {
  const h = ms / 3600000;
  if (h < 1) return Math.round(h * 60) + '분 전';
  if (h < 48) return Math.round(h) + '시간 전';
  return Math.round(h / 24) + '일 전';
}
export function fmtTs(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function dstr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
