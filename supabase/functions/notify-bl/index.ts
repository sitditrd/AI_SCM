// TWL Control Tower — BL 스케줄 변경 알림 메일 Edge Function
// 배포: Supabase Edge Function `notify-bl` (verify_jwt=false — 수집 스크립트가 호출)
// 시크릿: SMTP_HOST, SMTP_PORT(465), SMTP_USER, SMTP_PASS, SMTP_FROM  (send-code 와 공유)
//
// 호출: POST { email, mbl_no, carrier?, vessel?, voyage?, por?, pod?, status?,
//              changes: [{ kind, field, old, new }] }
//
// ※ 제목/본문은 ASCII 로 유지한다 — denomailer 가 비Latin1(한글)을 btoa 로 인코딩하다
//   실패하는 이슈가 있다(send-code 에서 확인된 제약). 한국어 라벨은 영문으로 매핑해 보낸다.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/* 한국어 필드 라벨 → ASCII (메일 인코딩 제약) */
const LABEL: Record<string, string> = {
  "출항 예정일시": "ETD (departure)",
  "도착 예정일시": "ETA (arrival)",
  "본선": "Vessel",
  "항차": "Voyage",
  "진행 상태": "Status",
};
const STATUS_EN: Record<string, string> = {
  "공컨 반출": "Empty container released",
  "적컨 반입": "Gate-in at outbound terminal",
  "선적 완료": "Loaded on vessel",
  "운송 중": "Departed / in transit",
  "환적 중": "Transshipment",
  "입항": "Arrived at POD",
  "양하 완료": "Discharged",
  "반출 완료": "Gate-out for delivery",
  "반납 완료": "Empty returned",
  "조회됨": "Tracked",
};
/* 비ASCII 가 남으면 제거 — 어떤 값이 와도 메일 인코딩이 깨지지 않게 하는 최종 방어 */
function ascii(v: unknown): string {
  return String(v ?? "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
}
function esc(v: unknown): string {
  return ascii(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j({ error: "method" }, 405);
  try {
    const b = await req.json();
    const email = String(b?.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ error: "invalid email" }, 400);
    const mbl = ascii(b?.mbl_no);
    if (!mbl) return j({ error: "mbl_no required" }, 400);
    const changes: Array<Record<string, unknown>> = Array.isArray(b?.changes) ? b.changes : [];
    if (!changes.length) return j({ error: "no changes" }, 400);

    const host = Deno.env.get("SMTP_HOST");
    if (!host) return j({ error: "SMTP not configured" }, 503);

    const rows = changes.map((c) => {
      const f = LABEL[String(c.field)] ?? esc(c.field);
      const ov = STATUS_EN[String(c.old)] ?? esc(c.old);
      const nv = STATUS_EN[String(c.new)] ?? esc(c.new);
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e8f0;color:#46536a">${f}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e8f0;color:#98a2b3;text-decoration:line-through">${ov || "-"}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e8f0;color:#b42318;font-weight:700">${nv || "-"}</td>
      </tr>`;
    }).join("");

    /* 제목·안내문·식별자 라벨을 호출자가 덮어쓸 수 있다(2026-08-14).
       주간 카나리아 점검처럼 B/L 스케줄 변경이 아닌 알림도 같은 발송 경로를 쓰되,
       "Schedule change detected for the B/L you are tracking" 라는 고정 문구가
       오해를 부르지 않게 하기 위함이다. 미지정이면 기존 동작 그대로다. */
    const subject = ascii(b?.subject) || `Schedule Change - ${mbl}`;
    const intro = ascii(b?.intro) || "Schedule change detected for the B/L you are tracking.";
    const idLabel = ascii(b?.label) || "B/L No.";

    const route = [esc(b?.por), esc(b?.pod)].filter(Boolean).join(" &rarr; ");
    const vsl = [esc(b?.vessel), esc(b?.voyage)].filter(Boolean).join(" ");
    const status = STATUS_EN[String(b?.status)] ?? esc(b?.status);

    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(Deno.env.get("SMTP_PORT") ?? "465"),
        tls: true,
        auth: { username: Deno.env.get("SMTP_USER")!, password: Deno.env.get("SMTP_PASS")! },
      },
    });
    await client.send({
      from: Deno.env.get("SMTP_FROM") ?? Deno.env.get("SMTP_USER")!,
      to: email,
      subject: `[TWL Control Tower] ${subject}`,
      content: "text/html",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;padding:12px">
        <h2 style="color:#0b2d5b;margin:0 0 4px">TWL Control Tower</h2>
        <p style="color:#333;margin:0 0 16px">${esc(intro)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
          <tr><td style="padding:6px 10px;color:#71809b;width:110px">${esc(idLabel)}</td><td style="padding:6px 10px;font-weight:700">${esc(mbl)}</td></tr>
          ${b?.carrier ? `<tr><td style="padding:6px 10px;color:#71809b">Carrier</td><td style="padding:6px 10px">${esc(b.carrier)}</td></tr>` : ""}
          ${route ? `<tr><td style="padding:6px 10px;color:#71809b">Route</td><td style="padding:6px 10px">${route}</td></tr>` : ""}
          ${vsl ? `<tr><td style="padding:6px 10px;color:#71809b">Vessel</td><td style="padding:6px 10px">${vsl}</td></tr>` : ""}
          ${status ? `<tr><td style="padding:6px 10px;color:#71809b">Status</td><td style="padding:6px 10px">${status}</td></tr>` : ""}
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e8f0;border-radius:8px;overflow:hidden">
          <thead><tr style="background:#f0f3f8">
            <th style="padding:8px 10px;text-align:left;color:#46536a;font-size:12px">Field</th>
            <th style="padding:8px 10px;text-align:left;color:#46536a;font-size:12px">Before</th>
            <th style="padding:8px 10px;text-align:left;color:#46536a;font-size:12px">After</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:18px 0 0">
          <a href="https://sitditrd.github.io/AI_SCM/cargo.html" style="background:#1e6fe0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:13px">Open Cargo Tracking</a>
        </p>
        <p style="color:#999;font-size:11.5px;margin:16px 0 0;line-height:1.5">
          Times are port-local as published by the carrier. This notice is generated from carrier tracking data
          and may differ from the carrier's own notification.<br>TWL Control Tower - Taewoong Logistics
        </p>
      </div>`,
    });
    await client.close();
    return j({ ok: true, sent: changes.length });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
