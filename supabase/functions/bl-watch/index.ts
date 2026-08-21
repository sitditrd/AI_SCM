// TWL Control Tower - BL watch register/remove/list/bulk/notify Edge Function
// verify_jwt=false (static site calls it directly)
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// 2026-08-12 v5: 저장소 사본이 v1 에 멈춰 있던 드리프트를 배포본(v4) 회수로 해소하고,
//   carriers 액션을 carrier-track ?api=list 프록시로 교체 — 선사 목록의 단일 원천화.
//   DCSA 3사(머스크·CMA·하파그) 키 등록으로 live 가 늘면 감시 그리드도 자동 반영된다.
//
// OWNERSHIP: every call carries the app session token, verified SERVER-SIDE via app_me,
// so a client cannot claim to be someone else.
//   - normal user : sees / edits ONLY rows where created_by = own login
//   - admin       : sees and edits every row
//   - no token    : list returns empty, writes rejected (401)
//
//   GET  ?action=list|detail|carriers (+token)
//   POST { action:'add'|'bulk'|'remove'|'notify', token, ... }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}
function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function whoami(token: unknown): Promise<{ login: string; role: string } | null> {
  const t = String(token ?? "").trim();
  if (!t) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_me`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: t }),
    });
    const d = await r.json();
    if (!d || d.error || !d.ok || !d.login) return null;
    return { login: String(d.login).toLowerCase(), role: String(d.role ?? "") };
  } catch { return null; }
}
const isAdmin = (me: { role: string } | null) => !!me && me.role === "admin";

const MBL_RE = /^[A-Z0-9]{8,20}$/;
/* ZIM 개통(2026-08-19) 반영 — 조회(carrier-track)만 열고 이 목록을 빠뜨리면
   등록이 "지원하지 않는 선사"로 거부된다(실사고). 선사 추가 시 여기도 반드시 갱신 */
/* 실조회 선사 — carrier-track 의 live 와 반드시 같이 간다.
   HLCU 는 2026-08-21 개통(구독 승인 후 실 B/L 5건 검증). */
const LIVE: Record<string, string> = { ONEY: "ONE", COSU: "COSCO", SMLM: "SM Line", EGLV: "Evergreen", SITC: "SITC", ZIMU: "ZIM", HLCU: "Hapag-Lloyd" };
const DEEPLINK: Record<string, string> = { MAEU: "Maersk", MSCU: "MSC", CMDU: "CMA CGM", OOLU: "OOCL", HDMU: "HMM", YMLU: "Yang Ming", WHLC: "Wan Hai", KMTC: "KMTC" };
function detect(no: string): string | null {
  const up = no.toUpperCase();
  if (up.startsWith("SIT")) return "SITC";
  const p4 = up.slice(0, 4);
  return LIVE[p4] ? p4 : (DEEPLINK[p4] ? p4 : null);
}
function months(v: unknown): number { return Number(v) === 6 ? 6 : 3; }
function expiresAt(m: number): string { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString(); }
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function addOne(no: string, owner: string, opts: Record<string, unknown>) {
  const m = months(opts.term_months);
  const email = String(opts.notify_email ?? "").trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { mbl_no: no, ok: false, error: "이메일 형식 오류" };
  const row = {
    mbl_no: no,
    carrier: opts.carrier ? String(opts.carrier).toUpperCase().slice(0, 8) : detect(no),
    notify_email: email || null,
    memo: opts.memo ? String(opts.memo).slice(0, 200) : null,
    created_by: owner,
    term_months: m,
    expires_at: expiresAt(m),
    active: true,
  };
  const r = await rest("bl_watch?on_conflict=mbl_no,created_by", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  if (!r.ok) return { mbl_no: no, ok: false, error: `HTTP ${r.status} ${(await r.text()).slice(0, 120)}` };
  const saved = await r.json();
  return { mbl_no: no, ok: true, item: Array.isArray(saved) ? saved[0] : saved };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const u = new URL(req.url);

    if (req.method === "GET") {
      const action = u.searchParams.get("action") ?? "list";

      if (action === "carriers") {
        /* 선사 목록의 단일 원천은 carrier-track 레지스트리다. 키 등록으로 live 가 늘면
           여기도 자동 반영된다(하드코딩 이중화 제거 — 2026-08-12). 실패 시에만 폴백. */
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/carrier-track?api=list`, { signal: AbortSignal.timeout(8000) });
          if (r.ok) return j(await r.json());
        } catch { /* 아래 폴백 */ }
        return j({
          live: Object.entries(LIVE).map(([scac, name]) => ({ scac, name })),
          deeplink: Object.entries(DEEPLINK).map(([scac, name]) => ({ scac, name })),
        });
      }

      const me = await whoami(u.searchParams.get("token"));
      const admin = isAdmin(me);
      if (!me) return j({ items: [], total: 0, me: null, admin: false, needLogin: true });

      if (action === "detail") {
        const no = (u.searchParams.get("no") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (!MBL_RE.test(no)) return j({ error: "invalid mbl_no" }, 400);
        const own = await rest(`bl_watch?mbl_no=eq.${no}&select=created_by`).then((r) => r.json());
        const owners = (Array.isArray(own) ? own : []).map((r) => String((r as Record<string, unknown>).created_by ?? "").toLowerCase());
        if (!admin && !owners.includes(me.login)) return j({ error: "권한이 없습니다." }, 403);
        const [ch, sn] = await Promise.all([
          rest(`bl_change_log?mbl_no=eq.${no}&select=*&order=changed_at.desc&limit=50`).then((r) => r.json()),
          rest(`bl_snapshot?mbl_no=eq.${no}&select=polled_at,status,etd,eta,vessel,voyage&order=polled_at.desc&limit=20`).then((r) => r.json()),
        ]);
        return j({ mbl_no: no, changes: ch, snapshots: sn });
      }

      const q = (u.searchParams.get("q") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const carrier = (u.searchParams.get("carrier") ?? "").toUpperCase();
      const activeF = u.searchParams.get("active") ?? "all";
      let path = "bl_watch?select=*&order=active.desc,created_at.desc&limit=2000";
      if (!admin) path += `&created_by=eq.${encodeURIComponent(me.login)}`;
      if (q) path += `&mbl_no=ilike.*${q}*`;
      if (carrier) path += `&carrier=eq.${carrier}`;
      if (activeF === "on") path += "&active=is.true";
      else if (activeF === "off") path += "&active=is.false";

      const rows = await rest(path).then((r) => r.json());
      if (!Array.isArray(rows) || !rows.length) return j({ items: [], total: 0, me: me.login, admin });
      const nos = rows.map((r: Record<string, unknown>) => r.mbl_no).join(",");
      const [snaps, changes] = await Promise.all([
        rest(`bl_snapshot?mbl_no=in.(${nos})&select=mbl_no,polled_at,status,etd,eta,vessel,voyage,por,pod&order=polled_at.desc`).then((r) => r.json()),
        rest(`bl_change_log?mbl_no=in.(${nos})&select=mbl_no,kind,field,old_value,new_value,changed_at&order=changed_at.desc&limit=500`).then((r) => r.json()),
      ]);
      const latest: Record<string, unknown> = {};
      for (const s of (Array.isArray(snaps) ? snaps : [])) { const k = String((s as Record<string, unknown>).mbl_no); if (!latest[k]) latest[k] = s; }
      const byMbl: Record<string, unknown[]> = {};
      for (const c of (Array.isArray(changes) ? changes : [])) { const k = String((c as Record<string, unknown>).mbl_no); (byMbl[k] ||= []).push(c); }
      return j({
        total: rows.length, me: me.login, admin,
        items: rows.map((r: Record<string, unknown>) => ({
          ...r,
          mine: String(r.created_by ?? "").toLowerCase() === me.login,
          snapshot: latest[String(r.mbl_no)] ?? null,
          changes: (byMbl[String(r.mbl_no)] ?? []).slice(0, 5),
        })),
      });
    }

    if (req.method === "POST") {
      const b = await req.json();
      const action = String(b?.action ?? "");
      const me = await whoami(b?.token);
      if (!me) return j({ error: "로그인이 필요합니다." }, 401);
      const admin = isAdmin(me);

      if (action === "bulk") {
        const raw: Array<Record<string, unknown>> = Array.isArray(b?.rows) ? b.rows : [];
        if (!raw.length) return j({ error: "rows required" }, 400);
        if (raw.length > 500) return j({ error: "한 번에 최대 500건까지 등록할 수 있습니다." }, 400);
        const seen = new Set<string>();
        const results = [];
        for (const r of raw) {
          const no = String(r.mbl_no ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
          if (!MBL_RE.test(no)) { results.push({ mbl_no: String(r.mbl_no ?? ""), ok: false, error: "번호 형식 오류" }); continue; }
          if (seen.has(no)) { results.push({ mbl_no: no, ok: false, error: "중복" }); continue; }
          seen.add(no);
          if (!detect(no)) { results.push({ mbl_no: no, ok: false, error: "지원하지 않는 선사" }); continue; }
          results.push(await addOne(no, me.login, {
            term_months: r.term_months ?? b.term_months,
            notify_email: r.notify_email ?? b.notify_email,
            memo: r.memo,
          }));
        }
        return j({ ok: true, added: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length, results });
      }

      const no = String(b?.mbl_no ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!MBL_RE.test(no)) return j({ error: "B/L 번호 형식이 아닙니다 (영숫자 8~20자)." }, 400);

      if (action === "remove") {
        let cond = `bl_watch?mbl_no=eq.${no}`;
        if (!admin) cond += `&created_by=eq.${encodeURIComponent(me.login)}`;
        const r = await rest(cond, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ active: false }) });
        if (!r.ok) return j({ error: `remove failed: HTTP ${r.status}` }, 500);
        const changed = await r.json();
        if (!Array.isArray(changed) || !changed.length) return j({ error: "내가 등록한 화물이 아니거나 이미 해제되었습니다." }, 403);
        return j({ ok: true, mbl_no: no, active: false });
      }

      // 알림 수신 이메일 변경/해제 — 목록에서 바로 수정하기 위함(BL 재조회 불필요)
      if (action === "notify") {
        const raw = String(b?.notify_email ?? "").trim().toLowerCase();
        if (raw && !EMAIL_RE.test(raw)) return j({ error: "이메일 형식이 올바르지 않습니다." }, 400);
        let cond = `bl_watch?mbl_no=eq.${no}`;
        if (!admin) cond += `&created_by=eq.${encodeURIComponent(me.login)}`;
        const r = await rest(cond, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ notify_email: raw || null }) });
        if (!r.ok) return j({ error: `notify update failed: HTTP ${r.status}` }, 500);
        const changed = await r.json();
        if (!Array.isArray(changed) || !changed.length) return j({ error: "내가 등록한 화물이 아닙니다." }, 403);
        return j({ ok: true, mbl_no: no, notify_email: raw || null });
      }

      if (action === "add") {
        if (!detect(no)) return j({ error: "지원하지 않는 선사입니다 — 번호에서 선사를 식별하지 못했습니다." }, 400);
        const res = await addOne(no, me.login, b);
        return res.ok ? j({ ok: true, item: res.item }) : j({ error: res.error }, 400);
      }

      return j({ error: "unknown action" }, 400);
    }

    return j({ error: "method" }, 405);
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
