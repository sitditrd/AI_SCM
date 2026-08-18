// TWL Control Tower — 선사 직접 화물추적 프록시 Edge Function
// 배포: Supabase Edge Function `carrier-track` (verify_jwt=false — 정적 사이트에서 직접 호출)
// 시크릿: 기본 5사(ONE·COSCO·SM·EGLV·SITC)는 없음 — 선사 공개 백엔드 JSON 을 그대로 사용.
//   DCSA 3사는 Secrets 등록 시에만 활성: MAERSK_CONSUMER_KEY(+MAERSK_CLIENT_ID/MAERSK_CLIENT_SECRET),
//   HLAG_CLIENT_ID/HLAG_CLIENT_SECRET, HMM_API_KEY, ZIM_API_KEY — 미등록이면 딥링크 폴백(2026-08-14)
//
// 배경: 레거시(TWSC)는 KLNET PLISM 유료 API 로 MBL 추적 이벤트를 수집해 KlnetTrackList 화면에
//   표시했다. 이 함수는 그 대체 경로 — 사용자가 MBL 을 입력하면 선사 사이트에서 직접 조회한다.
//   설계 근거: docs/03-architecture/화물추적_선사직접조회_설계.md (2026-08-11 레거시 4계층 분석)
//
// 지원 정책(개방 프록시 방지 — datago 의 별칭 화이트리스트와 동일 사상):
//   · live 어댑터: CARRIERS 맵에 등록된 선사만 실조회 (2026-08-11 기준 ONEY 검증 완료·COSU 베스트에포트)
//   · 그 외 선사: supported:false + 딥링크 정보 반환 (화면이 기존 딥링크 폴백)
//   · 안티봇(TLS 지문 차단) 선사는 공개 페이지 스크래핑 어댑터를 만들지 않는다
//     (2026-08-11 실측: MSC·OOCL·YML·WHL 403, KMTC·HMM TLS 차단)
//   · 단 공식 API 를 제공하는 선사(머스크·CMA·하파그 — DCSA 표준)는 키 기반 어댑터로 지원한다.
//     이들의 "웹 스크래핑 불가"(Akamai) 판정은 유효하나 공식 API 게이트웨이는 키만 있으면 통과
//     (2026-08-12 실측: track-and-trace-private 401 ERR_GW_001 — 봇차단 아닌 키 검증 단계 도달)
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
  ZIMU: { name: "ZIM", url: "https://www.zim.com/tools/track-a-shipment" },
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
  // COSCO 는 bill 응답에 컨테이너 게이트 이벤트를 주지 않는다(2026-08-11 확인). 대신 컨테이너 단위
  // /containers/{no} 의 containerCircleStatus 로 "현재 상태·위치"를 준다 — 그거라도 붙여 표를 채운다.
  const rawList = (Array.isArray(list) ? list : []).slice(0, 8);
  const containers = await Promise.all(rawList.map(async (c: unknown) => {
    const cntrNo = String(pick(c, "cntrNum", "containerNumber", "cntrNo", "containerNo") ?? "").replace(/[^A-Za-z0-9]/g, "");
    const evsRaw = pick(c, "containerHistorys", "events");
    let own = (Array.isArray(evsRaw) ? evsRaw : []).map((e: unknown) => ({
      name: pick(e, "containerNumberStatus", "eventName", "status"),
      location: locName(pick(e, "location", "locationName")),
      timeLocal: pick(e, "timeOfIssue", "eventDate", "time"),
      actual: true,
    }));
    let latest: Record<string, unknown> | undefined;
    if (!own.length && cntrNo) {
      try {
        const cr = await fetch(`https://elines.coscoshipping.com/ebtracking/public/containers/${encodeURIComponent(cntrNo)}?timestamp=${Date.now()}`,
          { headers: { ...FETCH_OPTS.headers, "language": "en_US" }, signal: AbortSignal.timeout(10000) });
        const cd = await cr.json();
        const cc = ((cd?.data?.content?.containers ?? [])[0]?.containerCircleStatus ?? [])[0];
        if (cc) {
          latest = { name: pick(cc, "containerNumberStatus"), location: pick(cc, "location"), timeLocal: pick(cc, "timeOfIssue") };
          const hist = (cd?.data?.content?.containers ?? [])[0]?.containerHistorys;
          if (Array.isArray(hist) && hist.length) {
            own = hist.map((e: unknown) => ({
              name: pick(e, "containerNumberStatus", "eventName", "status"),
              location: locName(pick(e, "location", "locationName")),
              timeLocal: pick(e, "timeOfIssue", "eventDate", "time"),
              actual: true,
            }));
          }
        }
      } catch { /* 컨테이너 상세 실패는 치명 아님 — 본선 구간 합성으로 표시 */ }
    }
    return {
      cntrNo,
      szTp: pick(c, "containerType", "szTp"),
      events: own.length ? own : synth,
      eventsSynthesized: own.length ? undefined : true,
      latest,
    };
  }));

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

/* ---------------- SM Line (SMLM) — 2026-08-11 실 BL(태웅 ELVIS_TWSC) 로 검증 완료 ----------------
   POST https://esvc.smlines.com/smline/CUP_HOM_3301GS.do  (f_cmd 으로 기능 분기, 스테이트리스)
   121=통합검색(컨테이너 그리드) · 124=항차 · 125=이벤트. 본문 Content-Type 은 text/html 이나 JSON.
   ※ SMLM 프리픽스를 뗀 번호로 조회한다(붙이면 count 0). */
async function smPost(fcmd: string, extra: Record<string, string>) {
  const body = new URLSearchParams({ f_cmd: fcmd, cust_cd: "", ...extra });
  const r = await fetch("https://esvc.smlines.com/smline/CUP_HOM_3301GS.do", {
    method: "POST",
    headers: { ...FETCH_OPTS.headers, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: body.toString(), signal: AbortSignal.timeout(12000),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return null; }
}
async function trackSM(no: string) {
  const bl = no.replace(/^SMLM/i, "");
  const sd = await smPost("121", { search_type: "B", search_name: bl });
  const rows: Record<string, unknown>[] = sd && Array.isArray(sd.list) ? sd.list : [];
  if (!rows.length) return { empty: true, upstream: sd ? "No data" : "parse fail" };
  const bkg = String(pick(rows[0], "bkgNo", "dspBkgNo") ?? "");

  let voyages: Array<Record<string, unknown>> = [];
  const vd = await smPost("124", { bkg_no: bkg });
  if (vd && Array.isArray(vd.list)) {
    voyages = vd.list.map((v: unknown) => ({
      vessel: pick(v, "vslEngNm"), voyage: pick(v, "skdVoyNo"),
      pol: { name: pick(v, "polNm"), date: pick(v, "etd"), actual: pick(v, "etdFlag") === "A" },
      pod: { name: pick(v, "podNm"), date: pick(v, "eta"), actual: pick(v, "etaFlag") === "A" },
    }));
  }
  const containers = await Promise.all(rows.slice(0, 6).map(async (row) => {
    const cop = String(pick(row, "copNo") ?? "");
    const ed = await smPost("125", { bkg_no: bkg, cop_no: cop, cntr_no: "" });
    const evs: Record<string, unknown>[] = ed && Array.isArray(ed.list) ? ed.list : [];
    return {
      cntrNo: String(pick(row, "cntrNo") ?? "").replace(/[^A-Za-z0-9]/g, ""),
      szTp: pick(row, "cntrTpszNm"),
      events: evs
        .sort((a, b) => Number(pick(a, "no") ?? 0) - Number(pick(b, "no") ?? 0))
        .map((e) => ({
          name: pick(e, "statusNm"), location: pick(e, "placeNm"), yard: pick(e, "yardNm"),
          timeLocal: pick(e, "eventDt"), actual: pick(e, "actTpCd") === "A",
        })),
    };
  }));
  return {
    summary: {
      blNo: no,
      por: voyages.length ? (voyages[0].pol as Record<string, unknown>).name : pick(rows[0], "polNm"),
      pod: voyages.length ? (voyages[voyages.length - 1].pod as Record<string, unknown>).name : undefined,
      vessel: voyages.length ? voyages[0].vessel : undefined,
      voyage: voyages.length ? voyages[0].voyage : undefined,
    },
    voyages, containers,
  };
}

/* ---------------- Evergreen (EGLV) — 2026-08-11 실 BL 로 검증 완료 (ShipmentLink) ----------------
   POST https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do  (TYPE 으로 분기, 응답은 HTML/JSP)
   TYPE=BL(기본정보+컨테이너 목록) · TYPE=CntrMove(컨테이너별 이벤트 타임라인).
   ※ EGLV 프리픽스를 뗀 숫자만 전송. 값은 HTML hex 엔티티라 디코드 필요. */
function heDecode(s: unknown): string {
  return String(s ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}
function monToIso(s: string): string {
  const m = /^([A-Za-z]{3})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return s;
  const mo: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
  const mm = mo[m[1].toUpperCase()];
  return mm ? `${m[3]}-${mm}-${m[2]}` : s;
}
async function egPost(data: string): Promise<string> {
  const r = await fetch("https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do", {
    method: "POST",
    headers: { ...FETCH_OPTS.headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: data, signal: AbortSignal.timeout(12000),
  });
  return await r.text();
}
function thTd(html: string, label: string): string | undefined {
  const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*<\\/th>\\s*<td[^>]*>([^<]+)<", "i");
  const m = re.exec(html);
  return m ? heDecode(m[1]) : undefined;
}
async function trackEvergreen(no: string) {
  const bl = no.replace(/^EGLV/i, "");
  const html = await egPost(`TYPE=BL&BL=${encodeURIComponent(bl)}`);
  if (/No information on B\/L No\.|is not valid|Illegal parameters/i.test(html) || !/EGLV\s*[0-9A-Z]/i.test(html)) {
    return { empty: true, upstream: "No data" };
  }
  const vessel = thTd(html, "Vessel Voyage on B/L");
  const summary = {
    blNo: no,
    por: thTd(html, "Port of Loading") ?? thTd(html, "Place of Receipt"),
    pod: thTd(html, "Port of Discharge") ?? thTd(html, "Place of Delivery"),
    vessel,
  };
  // 컨테이너 번호 추출
  const cset = new Set<string>();
  for (const m of html.matchAll(/frmCntrMoveDetail\('([A-Z]{4}\d{7})'\)/g)) cset.add(m[1]);
  const cntrList = [...cset].slice(0, 6);

  const containers = await Promise.all(cntrList.map(async (cntr) => {
    const mv = await egPost(`TYPE=CntrMove&bl_no=${encodeURIComponent(bl)}&cntr_no=${encodeURIComponent(cntr)}`);
    const events: unknown[] = [];
    // 이벤트 행: Date / Move / Location / Vessel 4개 td
    const rowRe = /<td[^>]*>\s*([A-Z]{3}-\d{2}-\d{4})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
    for (const m of mv.matchAll(rowRe)) {
      const name = heDecode(m[2]); if (!name) continue;
      events.push({ name, location: heDecode(m[3]) || undefined, timeLocal: monToIso(heDecode(m[1])), vesselVoyage: heDecode(m[4]) || undefined, actual: true });
    }
    return { cntrNo: cntr, events };
  }));
  return { summary, voyages: [], containers };
}

/* ---------------- SITC — 2026-08-11 실 BL 로 검증 완료 ----------------
   GET  /api/equery/cargoTrack/searchTrack?blNo=      (list1=기본·list2=항차·list3=컨테이너 최신상태)
   POST /api/equery/cargoTrack/movementDetail?blNo=&containerNo=  (컨테이너별 이벤트)
   ※ 레이트리밋: 연속 5회째 429(45초 후 복구). 이벤트 상세는 앞 3개 컨테이너만 호출. */
async function trackSITC(no: string) {
  const base = "https://ebusiness.sitcline.com/api/equery/cargoTrack";
  // SITC 는 연속 호출 시 429(레이트리밋)로 응답을 지연시킨다 — 타임아웃을 짧게 잡고
  // 예외는 여기서 흡수해 raw TimeoutError 가 사용자에게 노출되지 않게 한다(2026-08-11 실측).
  let sd: Record<string, unknown> | null = null;
  try {
    const sr = await fetch(`${base}/searchTrack?blNo=${encodeURIComponent(no)}`, { ...FETCH_OPTS, signal: AbortSignal.timeout(8000) });
    sd = await sr.json();
  } catch {
    return { empty: true, upstream: "선사 서버 응답 지연(호출 제한) — 잠시 후 다시 시도하십시오." };
  }
  const dt = (sd as Record<string, Record<string, unknown[]>>)?.data ?? {};
  const l1 = ((dt.list1 ?? []) as Record<string, unknown>[])[0];
  const l2 = (dt.list2 ?? []) as Record<string, unknown>[];
  const l3 = (dt.list3 ?? []) as Record<string, unknown>[];
  if (!l1 && !l2.length) {
    const code = (sd as Record<string, unknown>)?.code;
    return { empty: true, upstream: code === 429 ? "선사 서버 호출 제한(429) — 잠시 후 다시 시도하십시오." : "No data" };
  }

  const voyages = l2.map((v) => ({
    vessel: pick(v, "vesselName"),
    voyage: [pick(v, "voyageNo"), pick(v, "voyageLeg")].filter(Boolean).join(""),
    pol: { name: pick(v, "portFromName", "portFrom"), date: pick(v, "atd") ?? pick(v, "etd"), actual: !!pick(v, "atd") },
    pod: { name: pick(v, "portToName", "portTo"), date: pick(v, "ata") ?? pick(v, "eta"), actual: !!pick(v, "ata") },
  }));

  const detailFor = l3.slice(0, 3);
  const detailed = await Promise.all(detailFor.map(async (c) => {
    const cn = String(pick(c, "containerNo") ?? "");
    let events: unknown[] = [];
    try {
      const er = await fetch(`${base}/movementDetail?blNo=${encodeURIComponent(no)}&containerNo=${encodeURIComponent(cn)}`, { method: "POST", ...FETCH_OPTS, signal: AbortSignal.timeout(12000) });
      const ed = await er.json();
      const evs: Record<string, unknown>[] = ed?.data?.list ?? [];
      events = evs.map((e) => ({ name: pick(e, "movementNameEn", "movementName"), location: pick(e, "portName"), timeLocal: pick(e, "eventDate"), actual: true }));
    } catch { /* 상세 실패 시 최신상태로 폴백 */ }
    return {
      cntrNo: cn.replace(/[^A-Za-z0-9]/g, ""),
      szTp: pick(c, "containerType"),
      events: events.length ? events : [{ name: pick(c, "movementNameEn", "movementName"), location: pick(c, "currentPort"), actual: true }],
      eventsSynthesized: events.length ? undefined : true,
    };
  }));
  // 나머지 컨테이너는 레이트리밋 보호를 위해 최신상태만
  const rest = l3.slice(3).map((c) => ({
    cntrNo: String(pick(c, "containerNo") ?? "").replace(/[^A-Za-z0-9]/g, ""),
    szTp: pick(c, "containerType"),
    events: [{ name: pick(c, "movementNameEn", "movementName"), location: pick(c, "currentPort"), actual: true }],
    eventsSynthesized: true,
  }));

  return {
    summary: {
      blNo: no,
      por: pick(l1, "polEn", "pol"), pod: pick(l1, "delEn", "del"),
      vessel: voyages.length ? voyages[0].vessel : undefined,
      voyage: voyages.length ? voyages[0].voyage : undefined,
    },
    voyages, containers: [...detailed, ...rest],
  };
}

/* ---------------- DCSA Track & Trace 공용 코어 — 머스크·CMA CGM·하파그로이드 ----------------
   3사 모두 DCSA T&T v2.2 계열이라 이벤트 파싱을 공용화하고 인증 헤더만 분기한다.
   2026-08-12 실측: Maersk `track-and-trace-private/events` 401 ERR_GW_001(Consumer-Key 요구),
   CMA `apis.cma-cgm.net` 401(keyId 헤더), HLAG `api.hlag.com/hlag/v2/events` 401(X-IBM-Client-Id/Secret).
   키는 Supabase Edge Function Secrets 로만 주입한다(저장소 커밋 금지). 키 미등록이면 ready()=false
   → 목록·조회 모두 딥링크로 폴백하므로, 키 등록 즉시 코드 수정 없이 실조회로 전환된다.

   이벤트 명칭은 화면(cargo.js SLOTS)·수집기(collect_bl_watch.py STAGES)의 기존 정규식에
   부분일치하도록 고정 어휘로 발행한다 — 두 파일을 고치지 않고 9개 게이트 슬롯에 그대로 태운다. */

function dcsaName(code: string, empty: boolean, seq: { firstLoad: boolean; hasLaterLoad: boolean }): string | null {
  switch (code) {
    case "GTOT": return empty ? "Empty Container Release (Gate Out)" : "Gate Out from Inbound CY";
    case "GTIN": return empty ? "Empty Container Return (Gate In)" : "Gate In to Outbound CY";
    case "LOAD": return seq.firstLoad ? "Loaded on Vessel" : "Transshipment Load";
    case "DISC": return seq.hasLaterLoad ? "Transshipment Discharge" : "Unloaded from Vessel";
    case "PICK": return empty ? "Empty Container Pick-up" : "Pick-up by Merchant (Gate Out)";
    case "DROP": return empty ? "Empty Container Return (Drop-off)" : "Drop-off (Full)";
    case "STUF": return "Stuffing";
    case "STRP": return "Stripping";
    default: return null;
  }
}

function dcsaParse(no: string, raw: unknown): Record<string, unknown> {
  const list: Record<string, unknown>[] = Array.isArray(raw)
    ? raw as Record<string, unknown>[]
    : ((pick(raw, "events", "data") as Record<string, unknown>[] | undefined) ?? []);
  if (!list.length) return { empty: true, upstream: "No data" };

  const timeOf = (e: unknown) => String(pick(e, "eventDateTime", "eventCreatedDateTime") ?? "");
  const sorted = [...list].sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
  const callOf = (e: unknown) => pick(e, "transportCall") as Record<string, unknown> | undefined;
  const locOf = (e: unknown): string | undefined => {
    const el = pick(e, "eventLocation") as Record<string, unknown> | undefined;
    const tc = callOf(e);
    return (pick(el, "locationName", "UNLocationCode") ?? pick(pick(tc, "location"), "locationName", "UNLocationCode")
      ?? pick(tc, "UNLocationCode")) as string | undefined;
  };

  const transports = sorted.filter((e) => pick(e, "eventType") === "TRANSPORT");
  const equipments = sorted.filter((e) => pick(e, "eventType") === "EQUIPMENT");

  /* TRANSPORT — 첫 DEPA=출항, 이후에 또 DEPA 가 있으면 그 앞 ARRI/DEPA 는 환적항 기항.
     명칭은 SLOTS 오검을 피해 고른다(환적 이벤트에 departure/arrival 단어를 쓰지 않는다). */
  const depTimes = transports.filter((e) => pick(e, "transportEventTypeCode") === "DEPA").map(timeOf);
  const firstDep = depTimes[0];
  const tEvents = transports.map((e) => {
    const code = pick(e, "transportEventTypeCode");
    const act = pick(e, "eventClassifierCode") === "ACT";
    const t = timeOf(e);
    let name: string;
    if (code === "DEPA") name = t === firstDep ? "Vessel Departure" : "Transshipment — T/S Port Departed";
    else if (code === "ARRI") name = depTimes.some((d) => d > t) ? "Transshipment — T/S Port Arrived" : "Vessel Arrival";
    else return null;
    return { name, code: String(code), location: locOf(e), timeLocal: t, actual: act, _tc: callOf(e) };
  }).filter(Boolean) as Record<string, unknown>[];

  /* EQUIPMENT — 컨테이너별 그룹. LOAD 1회차=선적, 2회차부터 환적 적재. */
  const byCntr = new Map<string, Record<string, unknown>[]>();
  for (const e of equipments) {
    const ref = String(pick(e, "equipmentReference") ?? "").replace(/[^A-Za-z0-9]/g, "");
    if (!byCntr.has(ref)) byCntr.set(ref, []);
    byCntr.get(ref)!.push(e);
  }
  const containers = [...byCntr.entries()].map(([ref, evs]) => {
    const loads = evs.filter((e) => pick(e, "equipmentEventTypeCode") === "LOAD").map(timeOf);
    const mapped = evs.map((e) => {
      const code = String(pick(e, "equipmentEventTypeCode") ?? "");
      const empty = pick(e, "emptyIndicatorCode") === "EMPTY";
      const t = timeOf(e);
      const name = dcsaName(code, empty, { firstLoad: code === "LOAD" && t === loads[0], hasLaterLoad: loads.some((l) => l > t) });
      if (!name) return null;
      return { name, code: code + "/" + String(pick(e, "emptyIndicatorCode") ?? ""), location: locOf(e), timeLocal: t, actual: pick(e, "eventClassifierCode") === "ACT" };
    }).filter(Boolean) as Record<string, unknown>[];
    const all = [...mapped, ...tEvents.map((t) => ({ name: t.name, code: t.code, location: t.location, timeLocal: t.timeLocal, actual: t.actual }))]
      .sort((a, b) => String(a.timeLocal).localeCompare(String(b.timeLocal)));
    return { cntrNo: ref, szTp: pick(evs[0], "ISOEquipmentCode"), events: all };
  });
  /* 장비 이벤트가 아직 없으면(부킹 직후 등) 운송 이벤트만으로 한 줄을 만든다 */
  if (!containers.length && tEvents.length) {
    containers.push({ cntrNo: "(B/L)", szTp: undefined, events: tEvents.map((t) => ({ name: t.name, code: t.code, location: t.location, timeLocal: t.timeLocal, actual: t.actual })) });
  }
  if (!containers.length) return { empty: true, upstream: "No data" };

  const firstDepEv = tEvents.filter((t) => t.name === "Vessel Departure")[0];
  const lastArrEv = tEvents.filter((t) => t.name === "Vessel Arrival").slice(-1)[0];
  const tc = (firstDepEv?._tc ?? {}) as Record<string, unknown>;
  const vessel = pick(pick(tc, "vessel"), "vesselName") ?? pick(tc, "vesselName", "vesselIMONumber");
  const voyage = pick(tc, "exportVoyageNumber", "carrierVoyageNumber", "importVoyageNumber");
  const voyages = (firstDepEv || lastArrEv) ? [{
    vessel, voyage,
    pol: firstDepEv ? { name: firstDepEv.location, date: firstDepEv.timeLocal, actual: !!firstDepEv.actual } : {},
    pod: lastArrEv ? { name: lastArrEv.location, date: lastArrEv.timeLocal, actual: !!lastArrEv.actual } : {},
  }] : [];

  return {
    summary: { blNo: no, por: firstDepEv?.location, pod: lastArrEv?.location, vessel, voyage },
    voyages, containers,
  };
}

/* 공용 호출기 — 엔드포인트 후보 × 번호 후보를 순서대로 시도한다.

   엔드포인트가 복수인 이유: 머스크는 트래킹 상품이 둘이고 발급 결과에 따라 쓸 경로가 다르다.
     · Ocean Track & Trace (Public)  /track-and-trace/public-events  — Consumer-Key 단독
     · DCSA T&T (Private)            /track-and-trace-private/events — Consumer-Key + OAuth Bearer
   어느 쪽이 승인될지 신청 시점에 알 수 없으므로 둘 다 시도하고, 인증 실패(401/403)면 다음
   엔드포인트로 넘어간다. 전부 인증 실패일 때만 사용자에게 키 상태 확인을 안내한다.

   번호 후보가 복수인 이유: 선사별 B/L 표기 관행이 달라서다(머스크는 숫자 9자리, 하파그는 HLCU 포함). */
async function dcsaFetch(carrier: string, candidates: string[], urlOfs: Array<(bl: string) => string>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  let last: Record<string, unknown> = { empty: true, upstream: "No data" };
  let authFail = 0;
  for (const urlOf of urlOfs) {
    let denied = false;
    for (const bl of candidates) {
      const r = await fetch(urlOf(bl), { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15000) });
      if (r.status === 401 || r.status === 403) { denied = true; break; }   // 자격 불일치 — 다음 엔드포인트
      if (r.status === 429) return { empty: true, upstream: `${carrier} API 호출 제한(429) — 잠시 후 다시 시도하십시오.` };
      if (r.status === 404) { last = { empty: true, upstream: "No data (404)" }; continue; }
      const d = await r.json().catch(() => null);
      if (!d) continue;
      const parsed = dcsaParse(bl, d);
      if (!parsed.empty) return parsed;
      last = parsed;
    }
    if (denied) authFail++;
  }
  if (authFail && authFail === urlOfs.length) {
    return { empty: true, upstream: `조회 제한: ${carrier} API 인증 실패 — Supabase Secrets 의 키 상태와 구독 승인 여부를 확인하십시오.` };
  }
  return last;
}

/* Maersk — Consumer-Key 필수, OAuth(client_credentials)는 클라이언트 자격이 등록된 경우에만.
   토큰은 모듈 변수로 캐시(만료 5분 전 갱신). 고객코드 미매핑 계정은 404 가 온다(포털 명세). */
let maerskTok: { v: string; exp: number } | null = null;
async function maerskHeaders(): Promise<Record<string, string>> {
  const key = Deno.env.get("MAERSK_CONSUMER_KEY") ?? Deno.env.get("MAERSK_API_KEY") ?? "";
  const h: Record<string, string> = { "Consumer-Key": key };
  const cid = Deno.env.get("MAERSK_CLIENT_ID"), sec = Deno.env.get("MAERSK_CLIENT_SECRET");
  if (cid && sec) {
    if (!maerskTok || Date.now() > maerskTok.exp) {
      const r = await fetch("https://api.maersk.com/customer-identity/oauth/v2/access_token", {
        method: "POST",
        headers: { "Consumer-Key": key, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: cid, client_secret: sec }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json().catch(() => ({} as Record<string, unknown>));
      const tok = (d as Record<string, unknown>).access_token;
      if (typeof tok === "string") {
        maerskTok = { v: tok, exp: Date.now() + (Number((d as Record<string, unknown>).expires_in) || 600) * 1000 - 300000 };
      }
    }
    if (maerskTok) h.Authorization = "Bearer " + maerskTok.v;
  }
  return h;
}
/* 무료 경로만 사용한다(2026-08-14 요금 실사 · 사용자 지시 "무조건 무료만").

   머스크 트래킹 상품은 둘인데 과금 성격이 정반대다 — 포털 카탈로그 API 실조회로 확인:
     · Track and Trace Plus (DCSA T&T Private)  monetized:false · trialDuration:0 · 4,000콜/시간
       → 영구 무료. 단 OAuth 클라이언트에 등록된 Maersk Customer Code 가 그 선적의 당사자인
         건만 조회되고 아니면 404 (= 태웅이 머스크에 직접 부킹한 화물). 자사 물동량이 목적이니 충분.
     · Ocean Track & Trace Public Access        monetized:true · trialDuration:30 · Starter/Growth/Scale
       → 30일 체험 후 유료. 약관 4.2 조가 체험기간의 영리 목적 사용을 금지하고, 6.3 조는
         연간 최소 지출 약정(환불 불가)을 요구한다. **호출 자체를 하지 않는다.**

   따라서 기본 경로는 Private 단독이다. 유료 상품을 쓰려면 담당자가 계약을 맺은 뒤
   MAERSK_ALLOW_PAID=1 을 명시적으로 등록해야만 Public 이 폴백에 추가된다(사고 방지 장치). */
async function trackMaersk(no: string) {
  const digits = no.replace(/^MAEU/i, "");
  const q = (p: string) => (bl: string) =>
    `https://api.maersk.com/${p}?transportDocumentReference=${encodeURIComponent(bl)}&limit=200&sort=eventDateTime:ASC`;
  const paths = ["track-and-trace-private/events"];
  if (Deno.env.get("MAERSK_ALLOW_PAID") === "1") paths.push("track-and-trace/public-events");
  return dcsaFetch("Maersk", [digits, no], paths.map(q), await maerskHeaders());
}

/* CMA CGM — 2026-08-14 실사 결과 **영구 무료 티어가 없다**(30일 체험 후 비활성, 유료 구독은
   월정액 + 초과단가이며 400 응답까지 과금 대상). 무료 정책상 신청 대상에서 제외했으므로
   CMACGM_API_KEY 는 등록하지 않는 것이 원칙이다. 어댑터는 향후 정책이 바뀔 때를 위해 남겨두되,
   키가 없으면 ready()=false 라 호출되지 않는다. */
async function trackCMA(no: string) {
  return dcsaFetch("CMA CGM", [no, no.replace(/^CMDU/i, "")],
    [(bl) => `https://apis.cma-cgm.net/operation/trackandtrace/v1/events?transportDocumentReference=${encodeURIComponent(bl)}&limit=200`],
    { keyId: Deno.env.get("CMACGM_API_KEY") ?? "" });
}

async function trackHapag(no: string) {
  return dcsaFetch("Hapag-Lloyd", [no, no.replace(/^HLCU/i, "")],
    [(bl) => `https://api.hlag.com/hlag/v2/events?transportDocumentReference=${encodeURIComponent(bl)}`],
    { "X-IBM-Client-Id": Deno.env.get("HLAG_CLIENT_ID") ?? "", "X-IBM-Client-Secret": Deno.env.get("HLAG_CLIENT_SECRET") ?? "" });
}

/* HMM — 포털 공개 OpenAPI 스펙(dcsaCargoTracking v1)에서 확인(2026-08-14):
     GET https://apigw.hmm21.com/gateway/dcsaCargoTracking/v1/cargo-tracking-dcsa
     인증: 헤더 x-Gateway-APIKey · 파라미터: carrierBookingReference, equipmentReference(스펙상 둘 다 필수)
   응답은 DCSA 이벤트 계열로 추정되어 dcsaParse 를 그대로 태운다.
   ※ 키 발급 전이라 실호출 미검증 — equipmentReference 없이 B/L 만으로 조회되는지, 응답이
   표준 DCSA 형상인지는 첫 키 등록 후 실 BL 로 확인하고 필요 시 보정한다. 후보 순서:
   빈 equipmentReference 동반 → 미동반 → HDMU 프리픽스 유지형. */
async function trackHMM(no: string) {
  const digits = no.replace(/^HDMU/i, "");
  const base = "https://apigw.hmm21.com/gateway/dcsaCargoTracking/v1/cargo-tracking-dcsa";
  return dcsaFetch("HMM", [digits, no],
    [
      (bl) => `${base}?carrierBookingReference=${encodeURIComponent(bl)}&equipmentReference=`,
      (bl) => `${base}?carrierBookingReference=${encodeURIComponent(bl)}`,
    ],
    { "x-Gateway-APIKey": Deno.env.get("HMM_API_KEY") ?? "" });
}

/* ZIM — DCSA Track & Trace v2 (2026-08-18 포털 규격 전문 확보 후 확정)

     GET https://apigw.zim.com/trackAndTrace/v2/?transportDocumentReference={B/L}
     인증: 헤더 Ocp-Apim-Subscription-Key (Azure APIM 구독 키)
     제품: ZIM 포털 "Tracing" > "DCSA Track And Trace - v2" (DCSA.org V2.2 준거)

   응답은 **DCSA 이벤트의 평면 배열**이라 공용 dcsaParse 를 그대로 쓴다(Array 입력 지원).
   당초 ZIM 자체 규격(tracing/v1)을 추정으로 파싱했으나, 포털에서 DCSA 표준 API 를
   제공하는 것이 확인되어 표준 경로로 교체했다 — 머스크·하파그와 같은 검증된 파서를 공유한다.

   규격 특이점(포털 문서 실측):
     · carrierBookingReference / transportDocumentReference / equipmentReference 중 최소 1개 필수
     · limit·sort·eventType 등 나머지 필터는 "Not supported" 로 명시 → 붙이지 않는다
     · TRANSPORT 이벤트에 transportCall 이 없다(예제 확인) → 선명·항차는 비게 된다.
       화물 진행 단계(9슬롯) 판정에는 영향 없다. */
async function trackZIM(no: string) {
  const base = "https://apigw.zim.com/trackAndTrace/v2/";
  // B/L 로 먼저, 안 되면 부킹번호로 — ZIM 은 양쪽 다 ZIMU 프리픽스 형식이라 구분이 안 된다.
  const q = (k: string) => (bl: string) => `${base}?${k}=${encodeURIComponent(bl)}`;
  return dcsaFetch("ZIM", [no, no.replace(/^ZIMU/i, "")],
    [q("transportDocumentReference"), q("carrierBookingReference")],
    { "Ocp-Apim-Subscription-Key": Deno.env.get("ZIM_API_KEY") ?? "" });
}

type Adapter = { name: string; blPrefixes: string[]; source: string; run: (no: string) => Promise<Record<string, unknown>>; ready?: () => boolean };
const CARRIERS: Record<string, Adapter> = {
  ONEY: { name: "ONE (Ocean Network Express)", blPrefixes: ["ONEY"], source: "ecomm.one-line.com", run: trackONE },
  COSU: { name: "COSCO Shipping Lines", blPrefixes: ["COSU"], source: "elines.coscoshipping.com", run: trackCOSCO },
  SMLM: { name: "SM Line (SM상선)", blPrefixes: ["SMLM"], source: "esvc.smlines.com", run: trackSM },
  EGLV: { name: "Evergreen Line", blPrefixes: ["EGLV"], source: "ct.shipmentlink.com", run: trackEvergreen },
  SITC: { name: "SITC", blPrefixes: ["SIT"], source: "ebusiness.sitcline.com", run: trackSITC },
  /* DCSA 3사 — Secrets 에 키가 등록되어야 live 로 승격된다(미등록 시 딥링크 폴백 유지) */
  MAEU: { name: "Maersk", blPrefixes: ["MAEU"], source: "api.maersk.com (DCSA T&T)", run: trackMaersk,
    ready: () => !!(Deno.env.get("MAERSK_CONSUMER_KEY") ?? Deno.env.get("MAERSK_API_KEY")) },
  CMDU: { name: "CMA CGM", blPrefixes: ["CMDU"], source: "apis.cma-cgm.net (DCSA T&T)", run: trackCMA,
    ready: () => !!Deno.env.get("CMACGM_API_KEY") },
  HLCU: { name: "Hapag-Lloyd", blPrefixes: ["HLCU"], source: "api.hlag.com (DCSA T&T)", run: trackHapag,
    ready: () => !!(Deno.env.get("HLAG_CLIENT_ID") && Deno.env.get("HLAG_CLIENT_SECRET")) },
  HDMU: { name: "HMM", blPrefixes: ["HDMU"], source: "apigw.hmm21.com (DCSA)", run: trackHMM,
    ready: () => !!Deno.env.get("HMM_API_KEY") },
  ZIMU: { name: "ZIM", blPrefixes: ["ZIMU"], source: "apigw.zim.com (tracing)", run: trackZIM,
    ready: () => !!Deno.env.get("ZIM_API_KEY") },
};
function isActive(a: Adapter | undefined): a is Adapter { return !!a && (!a.ready || a.ready()); }

function detectCarrier(no: string): string | null {
  const up = no.toUpperCase();
  // 프리픽스 매칭 (긴 프리픽스 우선 — SIT 보다 구체적인 4자 SCAC 을 먼저)
  const entries = Object.entries(CARRIERS).sort((a, b) => (b[1].blPrefixes[0]?.length ?? 0) - (a[1].blPrefixes[0]?.length ?? 0));
  for (const [scac, a] of entries) if (a.blPrefixes.some((p) => up.startsWith(p))) return scac;
  const p4 = up.slice(0, 4);
  if (DEEPLINKS[p4]) return p4;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return j({ error: "method" }, 405);
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("api") === "list") {
      /* live 는 지금 실제로 조회 가능한 선사만 — 키 대기 중인 DCSA 선사는 pending 으로 알리고
         딥링크 목록에 남긴다(키 등록 즉시 다음 호출부터 live 로 승격, 화면 배포 불요). */
      const liveScacs = new Set(Object.entries(CARRIERS).filter(([, a]) => isActive(a)).map(([s]) => s));
      return j({
        live: Object.entries(CARRIERS).filter(([s]) => liveScacs.has(s)).map(([scac, a]) => ({ scac, name: a.name, source: a.source })),
        pending: Object.entries(CARRIERS).filter(([s]) => !liveScacs.has(s)).map(([scac, a]) => ({ scac, name: a.name, note: "API 키 등록 대기" })),
        deeplink: Object.entries(DEEPLINKS).filter(([s]) => !liveScacs.has(s)).map(([scac, d]) => ({ scac, name: d.name })),
      });
    }

    const no = (u.searchParams.get("no") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (no.length < 8 || no.length > 20) return j({ error: "B/L 번호 형식이 아닙니다 (영숫자 8~20자)." }, 400);
    const carrier = (u.searchParams.get("carrier") ?? detectCarrier(no) ?? "").toUpperCase();

    const adapter = isActive(CARRIERS[carrier]) ? CARRIERS[carrier] : undefined;
    if (!adapter) {
      // live 미지원 — 딥링크 정보로 폴백 (KLNET 도 6개 선사군은 자기식별이 안 됐다: 선사 선택 UI 폴백은 화면 소관)
      const dl = DEEPLINKS[carrier];
      return j({
        carrier: carrier || null, carrierName: dl?.name ?? null, supported: false, query: { no },
        deeplink: dl ? { name: dl.name, url: dl.url.indexOf("=") > 0 || /\/$/.test(dl.url) ? dl.url + encodeURIComponent(no) : dl.url } : null,
      });
    }

    // 어댑터가 업스트림 지연/오류로 던지면 raw 예외 문구 대신 사용자용 메시지로 바꾼다.
    let res: Record<string, unknown>;
    try {
      res = await adapter.run(no);
    } catch (err) {
      const timeout = String(err).indexOf("Timeout") >= 0 || String(err).indexOf("abort") >= 0;
      return j({
        carrier, carrierName: adapter.name, supported: true, query: { no },
        error: timeout
          ? "선사 서버 응답이 지연되고 있습니다 — 잠시 후 다시 시도하십시오."
          : "선사 서버 조회에 실패했습니다 — 잠시 후 다시 시도하십시오.",
      });
    }
    if (res.empty) {
      return j({
        carrier, carrierName: adapter.name, supported: true, query: { no },
        error: typeof res.upstream === "string" && /지연|제한/.test(res.upstream)
          ? res.upstream
          : "조회 결과가 없습니다 — 번호·선사를 확인하십시오.",
        upstream: res.upstream,
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
