// TWL Control Tower — 관세청 유니패스 화물통관진행정보 프록시 Edge Function
// 배포: Supabase Edge Function `track` (verify_jwt=false — 정적 사이트(GitHub Pages/Netlify)에서 직접 호출)
// 시크릿: UNIPASS_API_KEY (Supabase → Edge Functions → Secrets 등록; 미등록 시 발급 안내(needKey) 반환)
// 응답 형태는 로컬 백엔드 server.py /api/track 과 동일: {needKey|query|error|data}
import { parse } from "https://deno.land/x/xml@2.1.3/mod.ts";

const UNIPASS_URL = "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo";
const GUIDE = "유니패스(unipass.customs.go.kr) 로그인 → Open API 사용신청(화물통관진행정보) → 발급 키를 Supabase Edge Functions Secrets 의 UNIPASS_API_KEY 로 등록";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}

// XML 파서 출력에서 선언("?xml")·주석을 제거하고 루트 요소 내용만 반환 — server.py xml_to_obj 와 같은 모양
function unwrap(doc: unknown): unknown {
  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    const keys = Object.keys(doc as Record<string, unknown>).filter((k) => !k.startsWith("?") && !k.startsWith("#") && !k.startsWith("@"));
    if (keys.length === 1) return (doc as Record<string, unknown>)[keys[0]];
  }
  return doc;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return j({ error: "method" }, 405);
  try {
    const key = Deno.env.get("UNIPASS_API_KEY") ?? "";
    const u = new URL(req.url);
    const kind = (u.searchParams.get("type") ?? "mbl").toLowerCase();
    const no = (u.searchParams.get("no") ?? "").replace(/[^A-Za-z0-9]/g, "");
    const year = (u.searchParams.get("year") ?? "").replace(/[^0-9]/g, "").slice(0, 4) || String(new Date().getFullYear());
    if ((kind !== "mbl" && kind !== "hbl") || no.length < 6) return j({ error: "유효한 type(mbl|hbl)과 B/L 번호를 입력하십시오." });
    if (!key) return j({ needKey: true, guide: GUIDE });

    const params = new URLSearchParams({ crkyCn: key, blYy: year });
    params.set(kind === "mbl" ? "mblNo" : "hblNo", no);
    const r = await fetch(`${UNIPASS_URL}?${params}`, {
      headers: { "User-Agent": "TWL-Portal/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    const raw = await r.text();
    const data = unwrap(parse(raw));
    const rec = data as Record<string, unknown> | null;
    const err = rec?.["ntceInfo"] ?? rec?.["errMsgCn"];
    return j({ needKey: false, query: { type: kind, no, year }, error: typeof err === "string" && err ? err : null, data });
  } catch (e) {
    return j({ error: "조회 실패: " + String(e) }, 502);
  }
});
