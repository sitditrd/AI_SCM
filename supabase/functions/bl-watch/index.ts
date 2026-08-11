// TWL Control Tower — BL 추적 등록/해제/목록 Edge Function
// 배포: Supabase Edge Function `bl-watch` (verify_jwt=false — 정적 사이트에서 직접 호출)
// 시크릿: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase 가 자동 주입)
//
// 화면(cargo.html)이 DB에 직접 쓸 수 없으므로(RLS: 익명은 select 만) 이 함수를 통한다.
//   GET  ?action=list                       → 등록 목록(+최신 스냅샷·최근 변경)
//   GET  ?action=detail&no=<MBL>            → 특정 BL 의 변경 이력
//   POST { action:'add', mbl_no, carrier?, notify_email?, memo?, created_by? }
//   POST { action:'remove', mbl_no }        → 추적 해제(active=false)
//
// 설계 근거: docs/03-architecture/화물추적_선사직접조회_설계.md
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
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });
}

const MBL_RE = /^[A-Z0-9]{8,20}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const u = new URL(req.url);

    if (req.method === "GET") {
      const action = u.searchParams.get("action") ?? "list";

      if (action === "detail") {
        const no = (u.searchParams.get("no") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (!MBL_RE.test(no)) return j({ error: "invalid mbl_no" }, 400);
        const [ch, sn] = await Promise.all([
          rest(`bl_change_log?mbl_no=eq.${no}&select=*&order=changed_at.desc&limit=50`).then((r) => r.json()),
          rest(`bl_snapshot?mbl_no=eq.${no}&select=polled_at,status,etd,eta,vessel,voyage&order=polled_at.desc&limit=20`).then((r) => r.json()),
        ]);
        return j({ mbl_no: no, changes: ch, snapshots: sn });
      }

      // 목록 — 등록건 + 각 건의 최신 스냅샷 + 미확인 변경 건수
      const rows = await rest("bl_watch?select=*&order=active.desc,created_at.desc&limit=200").then((r) => r.json());
      if (!Array.isArray(rows) || !rows.length) return j({ items: [] });
      const nos = rows.map((r: Record<string, unknown>) => r.mbl_no).join(",");
      const [snaps, changes] = await Promise.all([
        rest(`bl_snapshot?mbl_no=in.(${nos})&select=mbl_no,polled_at,status,etd,eta,vessel,voyage,por,pod&order=polled_at.desc`).then((r) => r.json()),
        rest(`bl_change_log?mbl_no=in.(${nos})&select=mbl_no,kind,field,old_value,new_value,changed_at&order=changed_at.desc&limit=200`).then((r) => r.json()),
      ]);
      const latest: Record<string, unknown> = {};
      for (const s of (Array.isArray(snaps) ? snaps : [])) {
        const k = String((s as Record<string, unknown>).mbl_no);
        if (!latest[k]) latest[k] = s;              // order 가 desc 라 첫 건이 최신
      }
      const byMbl: Record<string, unknown[]> = {};
      for (const c of (Array.isArray(changes) ? changes : [])) {
        const k = String((c as Record<string, unknown>).mbl_no);
        (byMbl[k] ||= []).push(c);
      }
      return j({
        items: rows.map((r: Record<string, unknown>) => ({
          ...r,
          snapshot: latest[String(r.mbl_no)] ?? null,
          changes: (byMbl[String(r.mbl_no)] ?? []).slice(0, 5),
        })),
      });
    }

    if (req.method === "POST") {
      const b = await req.json();
      const action = String(b?.action ?? "");
      const no = String(b?.mbl_no ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!MBL_RE.test(no)) return j({ error: "B/L 번호 형식이 아닙니다 (영숫자 8~20자)." }, 400);

      if (action === "remove") {
        const r = await rest(`bl_watch?mbl_no=eq.${no}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ active: false }),
        });
        if (!r.ok) return j({ error: `해제 실패: HTTP ${r.status}` }, 500);
        return j({ ok: true, mbl_no: no, active: false });
      }

      if (action === "add") {
        const email = String(b?.notify_email ?? "").trim().toLowerCase();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ error: "이메일 형식이 올바르지 않습니다." }, 400);
        const row = {
          mbl_no: no,
          carrier: b?.carrier ? String(b.carrier).toUpperCase().slice(0, 8) : null,
          notify_email: email || null,
          memo: b?.memo ? String(b.memo).slice(0, 200) : null,
          created_by: b?.created_by ? String(b.created_by).slice(0, 80) : null,
          active: true,
        };
        // 이미 있으면 되살린다(해제했다가 다시 등록하는 흐름) — mbl_no 는 unique
        const r = await rest("bl_watch?on_conflict=mbl_no", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(row),
        });
        if (!r.ok) return j({ error: `등록 실패: HTTP ${r.status} ${(await r.text()).slice(0, 160)}` }, 500);
        const saved = await r.json();
        return j({ ok: true, item: Array.isArray(saved) ? saved[0] : saved });
      }

      return j({ error: "unknown action" }, 400);
    }

    return j({ error: "method" }, 405);
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
