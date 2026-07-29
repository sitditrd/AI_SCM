// TWL Control Tower — 이메일 인증코드 발송 Edge Function (오픈소스 denomailer + 본인 SMTP)
// 배포: Supabase Edge Function `send-code` (verify_jwt=false, 자체 레이트리밋으로 보호)
// 필요한 시크릿(대시보드 → Project Settings → Edge Functions → Secrets):
//   SMTP_HOST, SMTP_PORT(465), SMTP_USER, SMTP_PASS, SMTP_FROM
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ error: "이메일 형식이 올바르지 않습니다" }, 400);
    if (purpose !== "signup" && purpose !== "reset") return j({ error: "purpose" }, 400);

    // rate limit: 최근 60초 내 재발송 차단
    const since = new Date(Date.now() - 60000).toISOString();
    const rl = await fetch(`${SUPABASE_URL}/rest/v1/email_codes?login_id=eq.${encodeURIComponent(email)}&purpose=eq.${purpose}&created_at=gt.${since}&select=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const recent = await rl.json();
    if (Array.isArray(recent) && recent.length > 0) return j({ error: "잠시 후 다시 시도하세요 (1분 제한)" }, 429);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/email_codes`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ login_id: email, code, purpose }),
    });
    if (!ins.ok) return j({ error: "코드 저장 실패" }, 500);

    const host = Deno.env.get("SMTP_HOST");
    if (!host) return j({ error: "SMTP 미설정 (관리자가 시크릿 등록 필요)" }, 503);
    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(Deno.env.get("SMTP_PORT") ?? "465"),
        tls: true,
        auth: { username: Deno.env.get("SMTP_USER")!, password: Deno.env.get("SMTP_PASS")! },
      },
    });
    const title = purpose === "reset" ? "비밀번호 재설정 인증코드" : "회원가입 인증코드";
    await client.send({
      from: Deno.env.get("SMTP_FROM") ?? Deno.env.get("SMTP_USER")!,
      to: email,
      subject: `[TWL Control Tower] ${title}: ${code}`,
      content: "text/html",
      html: `<div style="font-family:sans-serif;max-width:440px"><h2 style="color:#0b2d5b">TWL Control Tower</h2><p>${title}</p><p style="font-size:30px;font-weight:800;letter-spacing:6px;color:#1e6fe0">${code}</p><p style="color:#888;font-size:13px">10분 이내에 입력해 주세요. 본인이 요청하지 않았다면 무시하세요.</p></div>`,
    });
    await client.close();
    return j({ ok: true });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
