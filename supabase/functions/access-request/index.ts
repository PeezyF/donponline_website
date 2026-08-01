import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "DONPONLINE <team@donponline.com>";
const OWNER_EMAIL = "donp@donponline.com";

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "Email service is not configured" }, 500);

    const body = await request.json();
    if (body.website) return json({ ok: true });

    const name = String(body.name || "").trim().slice(0, 100);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
    const phone = String(body.phone || "").trim().slice(0, 40);
    const interest = String(body.interest || "").trim().slice(0, 120);
    const message = String(body.message || "").trim().slice(0, 3000);
    const membershipInterest = Boolean(body.membership_interest);
    const membershipLevel = String(body.membership_level || "").trim().slice(0, 60);

    if (!name || !email || !interest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Please enter a valid name, email, and interest." }, 400);
    }

    const safe = {
      name: escapeHtml(name), email: escapeHtml(email), phone: escapeHtml(phone || "Not provided"),
      interest: escapeHtml(interest), message: escapeHtml(message || "No message"),
      membership: membershipInterest ? escapeHtml(membershipLevel || "Interested") : "No"
    };

    const messages = [
      {
        from: FROM,
        to: [email],
        subject: "We received your DONPONLINE access request",
        html: `<h1>You're tapped in.</h1><p>Thanks, ${safe.name}. We received your request about <strong>${safe.interest}</strong>.</p><p>We'll follow up from DONPONLINE with next steps.</p><p>— Don P / DONPONLINE</p>`
      },
      {
        from: FROM,
        to: [OWNER_EMAIL],
        reply_to: email,
        subject: `New DONPONLINE access request — ${safe.interest}`,
        html: `<h1>New access request</h1><p><strong>Name:</strong> ${safe.name}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Phone:</strong> ${safe.phone}</p><p><strong>Interest:</strong> ${safe.interest}</p><p><strong>Membership:</strong> ${safe.membership}</p><p><strong>Message:</strong><br>${safe.message.replaceAll("\n", "<br>")}</p>`
      }
    ];

    const results = await Promise.all(messages.map((payload) => fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })));

    if (results.some((result) => !result.ok)) {
      const errors = await Promise.all(results.map(async (result) => result.ok ? null : await result.text()));
      console.error("Resend delivery error", errors.filter(Boolean));
      return json({ error: "We could not send your request. Please try again." }, 502);
    }

    return json({ ok: true, message: "Request sent. Check your email for confirmation." });
  } catch (error) {
    console.error("Access request error", error);
    return json({ error: "We could not send your request. Please try again." }, 500);
  }
});
