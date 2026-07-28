/* 선석배정 데이터 레이어 — Supabase bs_vessel_calls + bs_terminals */
import { sbSelect } from './supabase';

export type BerthRow = {
  id: number;
  terminal_cd: string;
  terminalName: string;
  port: string;
  sub_terminal: string | null;
  berth: string;
  carrier: string;
  vessel_name: string;
  voyage: string;
  route: string;
  cct: number | null;
  eta: number | null;
  etd: number | null;
  discharge_qty: number;
  load_qty: number;
  shift_qty: number;
  status: string;
};

type RawCall = {
  id: number; collected_date: string; terminal_cd: string; sub_terminal: string | null;
  berth: string | null; carrier: string | null; vessel_name: string; voyage: string | null;
  route: string | null; cct: string | null; eta: string | null; etd: string | null;
  discharge_qty: number | null; load_qty: number | null; shift_qty: number | null; status: string | null;
};
type Terminal = { code: string; name_ko: string; port_ko: string; region_ord: number };

export const STATUS_KO: Record<string, string> = {
  PLANNED: '입항예정', ARRIVED: '접안', WORKING: '작업중', DEPARTED: '출항',
};
export const STATUS_ORDER = ['PLANNED', 'ARRIVED', 'WORKING', 'DEPARTED'];

function ms(v: string | null): number | null {
  if (!v) return null;
  const d = new Date(v).getTime();
  return isNaN(d) ? null : d;
}
function cleanRoute(rt: string | null): string {
  const s = (rt || '').trim();
  return !s || /^[+-]?\d+(\.\d+)?m$/.test(s) ? '—' : s;
}

export async function fetchBerth(signal?: AbortSignal): Promise<{ rows: BerthRow[]; collectedDate: string }> {
  const terms = await sbSelect<Terminal>('bs_terminals?select=code,name_ko,port_ko,region_ord', signal);
  const tmap = new Map(terms.map((t) => [t.code, t]));
  // 최신 수집일 1건
  const latest = await sbSelect<{ collected_date: string }>(
    'bs_vessel_calls?select=collected_date&order=collected_date.desc&limit=1', signal);
  const day = latest[0]?.collected_date;
  if (!day) return { rows: [], collectedDate: '—' };
  const raw = await sbSelect<RawCall>(
    `bs_vessel_calls?select=*&collected_date=eq.${day}&order=eta.asc`, signal);
  const rows = raw.map((r): BerthRow => {
    const t = tmap.get(r.terminal_cd);
    return {
      id: r.id,
      terminal_cd: r.terminal_cd,
      terminalName: t?.name_ko || r.terminal_cd,
      port: t?.port_ko || '—',
      sub_terminal: r.sub_terminal,
      berth: r.berth || '—',
      carrier: r.carrier || '—',
      vessel_name: r.vessel_name,
      voyage: (r.voyage || '').replace(/\s*\(null\/null\)/, '').trim() || '—',
      route: cleanRoute(r.route),
      cct: ms(r.cct), eta: ms(r.eta), etd: ms(r.etd),
      discharge_qty: r.discharge_qty || 0,
      load_qty: r.load_qty || 0,
      shift_qty: r.shift_qty || 0,
      status: r.status || 'PLANNED',
    };
  });
  return { rows, collectedDate: day };
}

export function fmtDT(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
