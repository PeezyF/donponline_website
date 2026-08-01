import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "DONPONLINE <team@donponline.com>";
const OWNER_EMAIL = "donp@donponline.com";

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, {
  status,
  headers: corsHeaders
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Sign in required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const memberClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: userError } = await memberClient.auth.getUser();
    if (userError || !user) return json({ error: "Member session is not valid" }, 401);

    const { request_id: requestId } = await request.json();
    if (!requestId) return json({ error: "Request ID is required" }, 400);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: redemption, error } = await admin
      .from("redemption_requests")
      .select("id,user_id,item_key,member_name,member_email,status,details,notified_at,catalog_items(title,price_coins)")
      .eq("id", requestId)
      .eq("user_id", user.id)
      .single();
    if (error || !redemption) return json({ error: "Redemption request not found" }, 404);
    if (redemption.notified_at) return json({ ok: true, already_notified: true });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "Email service is not configured" }, 500);

    const item = Array.isArray(redemption.catalog_items)
      ? redemption.catalog_items[0]
      : redemption.catalog_items;
    const title = escapeHtml(String(item?.title || redemption.item_key));
    const coins = Number(item?.price_coins || 0).toLocaleString();
    const safeName = escapeHtml(redemption.member_name);
    const safeEmail = escapeHtml(redemption.member_email);
    const detailRows = Object.entries(redemption.details || {})
      .filter(([, value]) => String(value || "").trim())
      .map(([key, value]) => `<p><strong>${escapeHtml(key.replaceAll("_", " "))}:</strong> ${escapeHtml(String(value)).replaceAll("\n", "<br>")}</p>`)
      .join("");

    const messages = [
      {
        from: FROM,
        to: [redemption.member_email],
        subject: `Motion Coins request received — ${title}`,
        html: `<h1>Your request is in.</h1><p>Thanks, ${safeName}. You redeemed <strong>${coins} Motion Coins</strong> for <strong>${title}</strong>.</p><p>DONPONLINE will review your request and contact you with the next step.</p><p>— Don P / DONPONLINE</p>`
      },
      {
        from: FROM,
        to: [OWNER_EMAIL],
        reply_to: redemption.member_email,
        subject: `New Motion Coins redemption — ${title}`,
        html: `<h1>New redemption request</h1><p><strong>Reward:</strong> ${title}</p><p><strong>Coins:</strong> ${coins}</p><p><strong>Member:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p>${detailRows}<p><strong>Request ID:</strong> ${escapeHtml(redemption.id)}</p>`
      }
    ];

    const results = await Promise.all(messages.map((payload) => fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })));
    if (results.some((result) => !result.ok)) {
      console.error("Redemption email delivery failed", await Promise.all(results.map((result) => result.ok ? null : result.text())));
      return json({ error: "Redemption saved, but confirmation email could not be sent" }, 502);
    }

    await admin.from("redemption_requests").update({ notified_at: new Date().toISOString() }).eq("id", redemption.id);
    return json({ ok: true });
  } catch (error) {
    console.error("Redemption notification failed", error);
    return json({ error: "Redemption notification could not be sent" }, 500);
  }
});
