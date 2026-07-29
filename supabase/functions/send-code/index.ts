// TWL Control Tower — 이메일 인증코드 발송 Edge Function (오픈소스 denomailer + 본인 SMTP)
// 배포: Supabase Edge Function `send-code` (verify_jwt=false, 자체 레이트리밋)
// 시크릿: SMTP_HOST, SMTP_PORT(465), SMTP_USER, SMTP_PASS, SMTP_FROM
// ※ 메일 제목/본문은 ASCII로 유지 — denomailer가 비Latin1(한글)을 btoa로 인코딩하다 실패하는 이슈 회피.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j({ error: "method" }, 405);
  try {
    const { login, purpose = "signup" } = await req.json();
    const email = String(login ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ error: "invalid email" }, 400);
    if (purpose !== "signup" && purpose !== "reset") return j({ error: "invalid purpose" }, 400);

    const since = new Date(Date.now() - 60000).toISOString();
    const rl = await fetch(`${SUPABASE_URL}/rest/v1/email_codes?login_id=eq.${encodeURIComponent(email)}&purpose=eq.${purpose}&created_at=gt.${since}&select=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const recent = await rl.json();
    if (Array.isArray(recent) && recent.length > 0) return j({ error: "Please wait a minute before requesting a new code." }, 429);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/email_codes`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ login_id: email, code, purpose }),
    });
    if (!ins.ok) return j({ error: "code save failed" }, 500);

    const host = Deno.env.get("SMTP_HOST");
    if (!host) return j({ error: "SMTP not configured" }, 503);
    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(Deno.env.get("SMTP_PORT") ?? "465"),
        tls: true,
        auth: { username: Deno.env.get("SMTP_USER")!, password: Deno.env.get("SMTP_PASS")! },
      },
    });
    const kind = purpose === "reset" ? "Password Reset" : "Sign-up";
    await client.send({
      from: Deno.env.get("SMTP_FROM") ?? Deno.env.get("SMTP_USER")!,
      to: email,
      subject: `[TWL Control Tower] ${kind} Verification Code: ${code}`,
      content: "text/html",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:auto;padding:10px">
        <h2 style="color:#0b2d5b;margin:0 0 6px">TWL Control Tower</h2>
        <p style="color:#333;margin:0 0 14px">Your ${kind} verification code is below.</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#1e6fe0;background:#f0f5ff;border-radius:12px;padding:18px;text-align:center">${code}</div>
        <p style="color:#999;font-size:12px;margin:16px 0 0">This code expires in 10 minutes. If you did not request it, please ignore this email.</p>
      </div>`,
    });
    await client.close();
    return j({ ok: true });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
