// TWL Control Tower — data.go.kr 공공 API 프록시 Edge Function
// 배포: Supabase Edge Function `datago` (verify_jwt=false — 정적 사이트에서 직접 호출)
// 시크릿: DATA_GO_KR_KEY (data.go.kr 활용신청 후 발급되는 일반 인증키 **Decoding**; 미등록 시 needKey 안내 반환)
//        ※ URLSearchParams 가 값을 1회 인코딩하므로 Encoding 키를 넣으면 이중 인코딩되어 실패한다.
// 보안: 별칭(alias) 화이트리스트 방식 — 등록된 공공 API 경로만 프록시한다 (개방 프록시 방지)
// 근거: docs/01-overview/NLIC_벤치마킹_고도화로드맵.md §3 (해수부 1192000 계열 무료·자동승인)
// 2026-08-03: 활용신청 승인 12종에 맞춰 별칭 확장 + XML 응답 자동 JSON 변환(해수부·인천항만 계열은 XML 전용)
import { parse } from "https://deno.land/x/xml@2.1.3/mod.ts";

const GUIDE =
  "data.go.kr 회원가입 → 대상 API 활용신청(자동승인) → 발급 키(일반 인증키 Decoding)를 Supabase Edge Functions Secrets 의 DATA_GO_KR_KEY 로 등록. " +
  "대상 API ID: 15006353(선박운항/PORT-MIS 입출항), 15055851(선박제원), 15095068(인천공항 화물편) 등 — 로드맵 §6 A-1 참조";

// alias → data.go.kr 엔드포인트 (검증된 경로만 등록; 신규 추가 시 여기에만 추가)
// fmt: JSON 요청 파라미터명. 미지정이면 XML 전용 API(응답을 아래에서 JSON 으로 변환).
type Alias = { base: string; fmt?: "type" | "dataType"; note: string };
const ALIASES: Record<string, Alias> = {
  /* --- 해양수산부 1192000 (XML 전용) --- */
  // 선박운항정보 = PORT-MIS 입출항현황 (15006353) · 파라미터: prtAgCd·sde·ede·deGb·clsgn
  portmis: { base: "https://apis.data.go.kr/1192000/VsslEtrynd5/Info5", note: "PORT-MIS 선박 입출항" },
  // 선박제원정보 (15055851) · 파라미터: vsslNm·clsgn
  shipspec: { base: "https://apis.data.go.kr/1192000/SicsVsslManp3/Info3", note: "선박 제원" },
  // 관제정보 (15006354)
  vtscontrol: { base: "https://apis.data.go.kr/1192000/CntlVssl2/Info", note: "VTS 관제 정보" },
  // 항만별 선박입출항실적 통계 (15059059)
  portstat: { base: "https://apis.data.go.kr/1192000/SsopVsslEtryndHarbor2/YM", note: "항만별 입출항 실적 통계" },
  // 수출입컨테이너처리실적 통계 (15059131)
  teuimpexp: { base: "https://apis.data.go.kr/1192000/SsopCargContnImxprt2/Ym", note: "수출입 컨테이너 처리실적" },
  // 국가별컨테이너처리실적 통계 (15057250)
  teunation: { base: "https://apis.data.go.kr/1192000/SsopCargContnNat2/Ym", note: "국가별 컨테이너 처리실적" },

  /* --- 인천국제공항공사 B551177 (type=json 지원) --- */
  // 화물편 운항현황 다국어 (15095068)
  aircargo: { base: "https://apis.data.go.kr/B551177/StatusOfCargoFlights/getCargoArrivals", fmt: "type", note: "인천공항 화물편 도착" },
  // 화물기 운항현황 상세 (15113461)
  aircargoarr: { base: "https://apis.data.go.kr/B551177/StatusOfCargoFlightsDeOdp/getCargoArrivalsDeOdp", fmt: "type", note: "화물기 도착 상세" },
  aircargodep: { base: "https://apis.data.go.kr/B551177/StatusOfCargoFlightsDeOdp/getCargoDeparturesDeOdp", fmt: "type", note: "화물기 출발 상세" },
  // 화물기 정기운항편 상세 (15114086)
  airschedarr: { base: "https://apis.data.go.kr/B551177/StatusOfCgoFltSched/getCgoFltSchedArrivalsDeOdp", fmt: "type", note: "정기 화물편 도착 스케줄" },
  airscheddep: { base: "https://apis.data.go.kr/B551177/StatusOfCgoFltSched/getCgoFltSchedDeparturesDeOdp", fmt: "type", note: "정기 화물편 출발 스케줄" },

  /* --- 인천항만공사 B551504 (XML 전용) --- */
  // 인천항 선박 입출항 정보 (15157706) · 파라미터: arvlDtFrom·arvlDtTo·callLetter·ocCt
  incheonship: { base: "https://apis.data.go.kr/B551504/ipaShipEtryptTkoff/getShipEtryptTkoffSttemnt", note: "인천항 선박 입출항" },
  incheonctrl: { base: "https://apis.data.go.kr/B551504/ipaShipEtryptTkoff/getShipCntrl", note: "인천항 선박 관제" },

  /* --- 기상청 1360000 (dataType=JSON) --- */
  // 기상특보 조회 (15000415)
  wthrwarn: { base: "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList", fmt: "dataType", note: "기상특보 목록" },
  // 중기예보 (15059468)
  wthrmid: { base: "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidFcst", fmt: "dataType", note: "중기예보" },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}

function aliasList() {
  return Object.keys(ALIASES).map((k) => ({ api: k, note: ALIASES[k].note }));
}

// XML 파서 출력에서 선언("?xml")·주석을 제거하고 루트 요소 내용만 반환 (track/index.ts 와 동일 규약)
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
    const u = new URL(req.url);
    const alias = u.searchParams.get("api") ?? "";
    if (alias === "list") return j({ needKey: !Deno.env.get("DATA_GO_KR_KEY"), allowed: aliasList() });
    const target = ALIASES[alias];
    if (!target) return j({ error: "unknown api alias", allowed: aliasList() }, 400);

    const key = Deno.env.get("DATA_GO_KR_KEY") ?? "";
    if (!key) return j({ needKey: true, guide: GUIDE });

    const params = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (k !== "api" && v) params.set(k, v);
    }
    params.set("serviceKey", key);
    if (target.fmt && !params.has(target.fmt)) params.set(target.fmt, target.fmt === "dataType" ? "JSON" : "json");
    if (!params.has("numOfRows")) params.set("numOfRows", "30");
    if (!params.has("pageNo")) params.set("pageNo", "1");

    const r = await fetch(`${target.base}?${params}`, {
      headers: { "User-Agent": "TWL-Portal/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    const raw = await r.text();

    // JSON 우선 → 실패 시 XML 파싱 → 둘 다 실패하면 원문을 그대로 전달해 클라이언트가 표시
    try {
      return j({ needKey: false, api: alias, format: "json", data: JSON.parse(raw) });
    } catch { /* JSON 아님 — XML 로 재시도 */ }
    try {
      return j({ needKey: false, api: alias, format: "xml", data: unwrap(parse(raw)) });
    } catch {
      return j({ needKey: false, api: alias, format: "raw", raw: raw.slice(0, 4000), error: r.ok ? "응답을 해석하지 못했습니다." : `HTTP ${r.status}` });
    }
  } catch (e) {
    return j({ error: "조회 실패: " + String(e) }, 502);
  }
});
