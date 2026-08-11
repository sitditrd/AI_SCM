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

/* ---------------- COSCO (COSU) — 2026-08-11 실 BL(태웅 ELVIS_TWSC) 로 검증 완료 ----------------
   GET https://elines.coscoshipping.com/ebtracking/public/bill/{COSU 뗀 번호}
   응답: data.content = { trackingPath(BL 요약), actualShipment[](구간별 항차), cargoTrackingContainer[](번호) } */
async function trackCOSCO(no: string) {
  const r = await fetch(
    // ONE 과 마찬가지로 SCAC 프리픽스를 뗀 번호로 조회해야 한다.
    // COSU 를 붙인 채 보내면 HTTP 200 + "No data" 로 조용히 빈 응답이 온다(2026-08-11 실 BL 로 확인).
    `https://elines.coscoshipping.com/ebtracking/public/bill/${encodeURIComponent(no.replace(/^COSU/i, ""))}?timestamp=${Date.now()}`,
    { headers: { ...FETCH_OPTS.headers, "language": "en_US" }, signal: AbortSignal.timeout(15000) },
  );
  const d = await r.json();
  const content = d?.data?.content;
  if (!content || d?.message === "No data" || content?.isbillOfLadingExist === false) {
    return { empty: true, upstream: d?.message || "No data" };
  }

  // trackingPath = BL 요약(FMS_API_MST 상당), actualShipment[] = 구간별 항차(FMS_API_TS 상당)
  const tp = pick(content, "trackingPath") as Record<string, unknown> | undefined;
  const legs = pick(content, "actualShipment");
  const voyages = (Array.isArray(legs) ? legs : [])
    .sort((a, b) => Number(pick(a, "sequenceNumber") ?? 0) - Number(pick(b, "sequenceNumber") ?? 0))
    .map((v: unknown) => {
      const polAct = pick(v, "actualDepartureDate");
      const podAct = pick(v, "actualArrivalDate");
      return {
        vessel: pick(v, "vesselName"),
        voyage: pick(v, "voyageNo"),
        pol: { name: pick(v, "portOfLoading"), date: polAct ?? pick(v, "expectedDateOfDeparture"), actual: !!polAct },
        pod: { name: pick(v, "portOfDischarge"), date: podAct ?? pick(v, "estimatedDateOfArrival"), actual: !!podAct },
      };
    });

  // 컨테이너: 공개 API 는 번호만 주고 게이트 이벤트는 비어 있는 경우가 많다.
  // 그럴 때는 구간 항차에서 선적/양하 이벤트를 합성해 타임라인이 비지 않게 한다.
  const list = pick(content, "cargoTrackingContainer", "containerList", "containers");
  const synth = voyages.flatMap((v) => {
    const out: unknown[] = [];
    if (v.pol?.date) out.push({ name: `Vessel Departure (${v.vessel ?? ""} ${v.voyage ?? ""})`.trim(), location: v.pol.name, timeLocal: v.pol.date, actual: v.pol.actual });
    if (v.pod?.date) out.push({ name: `Vessel Arrival (${v.vessel ?? ""} ${v.voyage ?? ""})`.trim(), location: v.pod.name, timeLocal: v.pod.date, actual: v.pod.actual });
    return out;
  });
  const containers = (Array.isArray(list) ? list : []).map((c: unknown) => {
    const evsRaw = pick(c, "containerHistorys", "events");
    const own = (Array.isArray(evsRaw) ? evsRaw : []).map((e: unknown) => ({
      name: pick(e, "containerNumberStatus", "eventName", "status"),
      location: locName(pick(e, "location", "locationName")),
      timeLocal: pick(e, "timeOfIssue", "eventDate", "time"),
      actual: true,
    }));
    return {
      cntrNo: String(pick(c, "cntrNum", "containerNumber", "cntrNo", "containerNo") ?? "").replace(/[^A-Za-z0-9]/g, ""),
      szTp: pick(c, "containerType", "szTp"),
      events: own.length ? own : synth,
      eventsSynthesized: own.length ? undefined : true,
    };
  });

  return {
    summary: {
      blNo: no,
      por: pick(tp, "fromCity") ?? locName(pick(content, "porName", "por")),
      pod: pick(tp, "toCity") ?? locName(pick(content, "podName", "pod")),
      place: pick(tp, "pol"),
      vessel: pick(tp, "vslNme"),
      voyage: pick(tp, "voyNumber"),
    },
    voyages,
    containers,
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
