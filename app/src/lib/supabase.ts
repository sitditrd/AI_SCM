/* Supabase REST (읽기 전용, publishable key) — SDK 없이 fetch로 경량 조회 */
const URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
const KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv';

export async function sbSelect<T = unknown>(path: string, signal?: AbortSignal): Promise<T[]> {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    signal,
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return res.json() as Promise<T[]>;
}

export const SUPABASE_READY = true;
