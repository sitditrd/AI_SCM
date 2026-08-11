// TWL Control Tower — 선사 직접 화물추적 프록시 Edge Function
// 배포: Supabase Edge Function `carrier-track` (verify_jwt=false — 정적 사이트에서 직접 호출)
// 시크릿: 없음 — 선사 공개 트래킹 페이지의 백엔드 JSON API 를 그대로 사용한다 (키·인증 불요)
//
// 배경: 레거시(TWSC)는 KLNET PLISM 유료 API 로 MBL 추적 이벤트를 수집해 KlnetTrackList 화면에
//   표시했다. 이 함수는 그 대체 경로 — 사용자가 MBL 을 입력하면 선사 사이트에서 직접 조회한다.
//   설계 근거: docs/03-architecture/화물추적_선사직접조회_설계.md (2026-08-11 레거시 4계층 분석)
//
// 지원 정책(개방 프록시 방지 — datago 의 별칭 화이트리스트와 동일 사상):
//   · live 어댑터: CARRIERS 맵에 등록된 선사만 실조회 (2026-08-11 기준 ONEY 검증 완료·COSU 베스트에포트)
//   · 그 외 선사: supported:false + 딥링크 정보 반환 (화면이 기존 딥링크 폴백)
//   · 안티봇(TLS 지문 차단) 선사는 서버사이드 조회가 원천 불가라 어댑터를 만들지 않는다
//     (2026-08-11 실측: MSC·Maersk·HL·CMA·OOCL·YML·WHL 403, KMTC·HMM TLS 차단)
//
// 정규화 응답 계약 (레거시 FMS_API_* 3레벨 구조를 계승):
//   { carrier, carrierName, supported, query:{no},
//     summary:{blNo,por,pod,vessel,voyage},                    ← FMS_API_MST 상당
//     voyages:[{vessel,voyage,pol:{...},pod:{...}}],           ← FMS_API_TS 상당 (N구간 — 레거시의 2구간 절단 제약을 계승하지 않음)
//     containers:[{cntrNo,szTp,latest,events:[...]}],          ← FMS_API_CNTR 상당
//     fetchedAt, source }
//   이벤트 시각은 항만 현지시각(timeLocal)을 기본 표시로, UTC(timeUtc)를 보조로 담는다.
//   "0"/null 시각은 미발생으로 간주해 필드를 생략한다(레거시 규약).

type Deeplink = { name: string; url: string };
const DEEPLINKS: Record<string, Deeplink> = {
  MAEU: { name: "Maersk", url: "https://www.maersk.com/tracking/" },
  MSCU: { name: "MSC", url: "https://www.msc.com/en/track-a-shipment" },
  HLCU: { name: "Hapag-Lloyd", url: "https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=" },
  CMDU: { name: "CMA CGM", url: "https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=BL&Reference=" },
  EGLV: { name: "Evergreen", url: "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do" },
  OOLU: { name: "OOCL", url: "https://www.oocl.com/eng/ourservices/eservices/cargotracking/" },
  HDMU: { name: "HMM", url: "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do" },
  YMLU: { name: "Yang Ming", url: "https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx" },
  WHLC: { name: "Wan Hai", url: "https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml" },
  SMLM: { name: "SM상선", url: "https://esvc.smlines.com/smline/CUP_HOM_3301.do" },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TWL-Portal/1.0";
const FETCH_OPTS = { headers: { "User-Agent": UA, "Accept": "application/json" } };

function pick(o: unknown, ...keys: string[]): unknown {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function locName(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  return (pick(v, "locationName", "location", "name") as string | undefined);
}

/* ---------------- ONE (ONEY) — 2026-08-11 실호출 검증 완료 ----------------
   search  POST /api/v2/edh/containers/track-and-trace/search  {filters:{search_text,search_type:"ALL"}}
   events  GET  /api/v2/edh/containers/track-and-trace/cop-events?booking_no&container_no
   voyage  GET  /api/v2/edh/vessel/track-and-trace/voyage-list?booking_no
   ※ ONE 부킹번호 = MBL 에서 ONEY 프리픽스를 뗀 12자 (화면 안내문 실측) */
async function trackONE(no: string) {
  const booking = no.replace(/^ONEY/i, "");
  const base = "https://ecomm.one-line.com/api/v2/edh";
  const sr = await fetch(`${base}/containers/track-and-trace/search`, {
    method: "POST",
    headers: { ...FETCH_OPTS.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ page: 1, page_length: 30, filters: { search_text: booking, search_type: "ALL" }, timestamp: Date.now() }),
    signal: AbortSignal.timeout(12000),
  });
  const sd = await sr.json();
  const rows: Record<string, unknown>[] = Array.isArray(sd?.data) ? sd.data : [];
  if (!rows.length) return { empty: true, upstream: sd?.message ?? `HTTP ${sr.status}` };

  const first = rows[0];
  const summary = {
    blNo: no,
    bookingNo: pick(first, "bookingNo") as string,
    por: locName(pick(first, "por")),
    pod: locName(pick(first, "pod")),
    place: locName(pick(first, "place", "yardName")),
  };

  // 항차(N구간 — 레거시 화면의 2구간 절단 제약을 계승하지 않는다)
  let voyages: unknown[] = [];
  try {
    const vr = await fetch(`${base}/vessel/track-and-trace/voyage-list?booking_no=${encodeURIComponent(booking)}`, {
      ...FETCH_OPTS, signal: AbortSignal.timeout(12000),
    });
    const vd = await vr.json();
    voyages = (Array.isArray(vd?.data) ? vd.data : []).map((v: Record<string, unknown>) => ({
      vessel: pick(v, "vesselEngName", "vesselCode"),
      voyage: [pick(v, "scheduleVoyageNumber"), pick(v, "scheduleDirectionCode")].filter(Boolean).join(""),
      pol: { name: locName(pick(v, "pol")), date: pick(pick(v, "pol"), "date"), actual: pick(pick(v, "pol"), "isActual") === true },
      pod: { name: locName(pick(v, "pod")), date: pick(pick(v, "pod"), "arrivalDate", "date"), actual: pick(pick(v, "pod"), "isArrivalActual", "isActual") === true },
    }));
  } catch { /* 항차 실패는 치명 아님 — 컨테이너 이벤트만으로 표시 가능 */ }

  // 컨테이너별 이벤트 (호출량 보호를 위해 최대 8개 컨테이너)
  const containers = await Promise.all(rows.slice(0, 8).map(async (row) => {
    const cntrNo = String(pick(row, "containerNo") ?? "").replace(/[^A-Za-z0-9]/g, "");
    const cont: Record<string, unknown> = {
      cntrNo,
      szTp: pick(row, "containerTypeSize"),
      weight: pick(row, "weight"),
      latest: (() => {
        const le = pick(row, "latestEvent");
        return le ? { name: pick(le, "eventName"), location: locName(pick(le, "locationName", "location")), timeUtc: pick(le, "date") } : undefined;
      })(),
    };
    try {
      const er = await fetch(
        `${base}/containers/track-and-trace/cop-events?booking_no=${encodeURIComponent(String(pick(row, "bookingNo") ?? booking))}&container_no=${encodeURIComponent(cntrNo)}`,
        { ...FETCH_OPTS, signal: AbortSignal.timeout(12000) },
      );
      const ed = await er.json();
      const evs: Record<string, unknown>[] = Array.isArray(ed?.data) ? ed.data : [];
      cont.events = evs
        .filter((e) => pick(e, "cargoTrackingShow") !== false)
        .sort((a, b) => Number(pick(a, "copSequence") ?? 0) - Number(pick(b, "copSequence") ?? 0))
        .map((e) => ({
          name: pick(e, "eventName"),
          code: pick(e, "matrixId"),
          location: locName(pick(e, "location")),
          yard: pick(pick(e, "yard"), "yardName"),
          timeLocal: pick(e, "eventLocalPortDate"),   // 항만 현지시각 — 기본 표시값 (레거시 관례)
          timeUtc: pick(e, "eventDate"),
          actual: pick(e, "triggerType") === "ACTUAL",
        }));
    } catch { cont.events = []; cont.eventsError = true; }
    return cont;
  }));

  return { summary, voyages, containers };
}

/* ---------------- COSCO (COSU) — 공개 JSON 확인, 필드 매핑은 베스트에포트 ----------------
   GET https://elines.coscoshipping.com/ebtracking/public/bill/{no}
   실 BL 표본이 없어(2026-08-11) 알려진 구조로 관대 추출 + 원문 일부를 raw 로 동봉한다. */
async function trackCOSCO(no: string) {
  const r = await fetch(
    `https://elines.coscoshipping.com/ebtracking/public/bill/${encodeURIComponent(no)}?timestamp=${Date.now()}`,
    { headers: { ...FETCH_OPTS.headers, "language": "en_US" }, signal: AbortSignal.timeout(15000) },
  );
  const d = await r.json();
  const content = d?.data?.content;
  if (!content || d?.message === "No data") return { empty: true, upstream: d?.message ?? `HTTP ${r.status}` };

  const containers: unknown[] = [];
  const list = pick(content, "cargoTrackingContainer", "containerList", "containers");
  if (Array.isArray(list)) {
    for (const c of list) {
      const evsRaw = pick(c, "containerHistorys", "events", "trackingPath");
      containers.push({
        cntrNo: String(pick(c, "containerNumber", "cntrNo", "containerNo") ?? "").replace(/[^A-Za-z0-9]/g, ""),
        szTp: pick(c, "containerType", "szTp"),
        events: (Array.isArray(evsRaw) ? evsRaw : []).map((e: unknown) => ({
          name: pick(e, "containerNumberStatus", "eventName", "status"),
          location: locName(pick(e, "location", "locationName")),
          timeLocal: pick(e, "timeOfIssue", "eventDate", "time"),
          actual: true,
        })),
      });
    }
  }
  return {
    summary: { blNo: no, por: locName(pick(content, "porName", "por")), pod: locName(pick(content, "podName", "pod")) },
    voyages: [],
    containers,
    raw: containers.length ? undefined : JSON.stringify(content).slice(0, 3000),
  };
}

type Adapter = { name: string; blPrefixes: string[]; source: string; run: (no: string) => Promise<Record<string, unknown>> };
const CARRIERS: Record<string, Adapter> = {
  ONEY: { name: "ONE (Ocean Network Express)", blPrefixes: ["ONEY"], source: "ecomm.one-line.com", run: trackONE },
  COSU: { name: "COSCO Shipping Lines", blPrefixes: ["COSU"], source: "elines.coscoshipping.com", run: trackCOSCO },
};

function detectCarrier(no: string): string | null {
  const m = /^([A-Za-z]{4})/.exec(no);
  if (!m) return null;
  const p = m[1].toUpperCase();
  for (const [scac, a] of Object.entries(CARRIERS)) if (a.blPrefixes.includes(p)) return scac;
  if (DEEPLINKS[p]) return p;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return j({ error: "method" }, 405);
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("api") === "list") {
      return j({
        live: Object.entries(CARRIERS).map(([scac, a]) => ({ scac, name: a.name, source: a.source })),
        deeplink: Object.entries(DEEPLINKS).map(([scac, d]) => ({ scac, name: d.name })),
      });
    }

    const no = (u.searchParams.get("no") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (no.length < 8 || no.length > 20) return j({ error: "B/L 번호 형식이 아닙니다 (영숫자 8~20자)." }, 400);
    const carrier = (u.searchParams.get("carrier") ?? detectCarrier(no) ?? "").toUpperCase();

    const adapter = CARRIERS[carrier];
    if (!adapter) {
      // live 미지원 — 딥링크 정보로 폴백 (KLNET 도 6개 선사군은 자기식별이 안 됐다: 선사 선택 UI 폴백은 화면 소관)
      const dl = DEEPLINKS[carrier];
      return j({
        carrier: carrier || null, carrierName: dl?.name ?? null, supported: false, query: { no },
        deeplink: dl ? { name: dl.name, url: dl.url.indexOf("=") > 0 || /\/$/.test(dl.url) ? dl.url + encodeURIComponent(no) : dl.url } : null,
      });
    }

    const res = await adapter.run(no);
    if (res.empty) {
      return j({
        carrier, carrierName: adapter.name, supported: true, query: { no },
        error: "조회 결과가 없습니다 — 번호·선사를 확인하십시오.", upstream: res.upstream,
      });
    }
    return j({
      carrier, carrierName: adapter.name, supported: true, query: { no },
      ...res, fetchedAt: new Date().toISOString(), source: adapter.source,
    });
  } catch (e) {
    return j({ error: "조회 실패: " + String(e) }, 502);
  }
});
