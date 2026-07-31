// TWL Control Tower — data.go.kr 공공 API 프록시 Edge Function
// 배포: Supabase Edge Function `datago` (verify_jwt=false — 정적 사이트에서 직접 호출)
// 시크릿: DATA_GO_KR_KEY (data.go.kr 활용신청 후 발급되는 일반 인증키; 미등록 시 needKey 안내 반환)
// 보안: 별칭(alias) 화이트리스트 방식 — 등록된 공공 API 경로만 프록시한다 (개방 프록시 방지)
// 근거: docs/01-overview/NLIC_벤치마킹_고도화로드맵.md §3 (해수부 1192000 계열 무료·자동승인)

const GUIDE =
  "data.go.kr 회원가입 → 대상 API 활용신청(자동승인) → 발급 키를 Supabase Edge Functions Secrets 의 DATA_GO_KR_KEY 로 등록. " +
  "대상 API ID: 15006353(선박운항/PORT-MIS 입출항), 15055851(선박제원), 15095068(인천공항 화물편) 등 — 로드맵 §6 A-1 참조";

// alias → data.go.kr 엔드포인트 (검증된 경로만 등록; 신규 추가 시 여기에만 추가)
const ALIASES: Record<string, { base: string; json: boolean }> = {
  // 해수부 PORT-MIS 선박 입출항 (15006353) — server.py /api/portmis 와 동일 엔드포인트
  portmis: { base: "http://apis.data.go.kr/1192000/VsslEtrynd5/Info5", json: true },
  // 인천공항 화물편 도착 현황 (15095068 계열) — server.py /api/aircargo 와 동일 엔드포인트
  aircargo: { base: "http://apis.data.go.kr/B551177/StatusOfCargoFlights/getCargoArrivals", json: true },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return j({ error: "method" }, 405);
  try {
    const u = new URL(req.url);
    const alias = u.searchParams.get("api") ?? "";
    const target = ALIASES[alias];
    if (!target) return j({ error: "unknown api alias", allowed: Object.keys(ALIASES) }, 400);

    const key = Deno.env.get("DATA_GO_KR_KEY") ?? "";
    if (!key) return j({ needKey: true, guide: GUIDE });

    const params = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (k !== "api" && v) params.set(k, v);
    }
    params.set("serviceKey", key);
    if (target.json && !params.has("type") && !params.has("_type")) params.set("type", "json");
    if (!params.has("numOfRows")) params.set("numOfRows", "30");
    if (!params.has("pageNo")) params.set("pageNo", "1");

    const r = await fetch(`${target.base}?${params}`, {
      headers: { "User-Agent": "TWL-Portal/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    const raw = await r.text();
    // data.go.kr은 오류를 XML로 줄 때가 있음 — JSON 파싱 실패 시 원문을 그대로 전달해 클라이언트가 표시
    try {
      return j({ needKey: false, api: alias, data: JSON.parse(raw) });
    } catch {
      return j({ needKey: false, api: alias, raw: raw.slice(0, 4000), error: r.ok ? null : `HTTP ${r.status}` });
    }
  } catch (e) {
    return j({ error: "조회 실패: " + String(e) }, 502);
  }
});
