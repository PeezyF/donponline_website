import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { corsHeaders } from "../_shared/cors.ts";
import { coinPacks } from "../_shared/packs.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabasePublishableKey =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const siteUrl = Deno.env.get("SITE_URL") ?? "https://donponline.com";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, {
      status: 405,
      headers: corsHeaders
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isFormPost = contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  let authorization = request.headers.get("Authorization");
  let packKey = "";

  if (isFormPost) {
    const form = await request.formData();
    const accessToken = form.get("access_token");
    if (typeof accessToken === "string" && accessToken) {
      authorization = `Bearer ${accessToken}`;
    }
    packKey = typeof form.get("packKey") === "string" ? String(form.get("packKey")) : "";
  }

  if (!authorization) {
    return Response.json({ error: "Sign in to buy Motion Coins" }, {
      status: 401,
      headers: corsHeaders
    });
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) {
    return Response.json({ error: "Your member session is not valid" }, {
      status: 401,
      headers: corsHeaders
    });
  }

  if (!isFormPost) {
    const body = await request.json().catch(() => ({}));
    packKey = typeof body.packKey === "string" ? body.packKey : "";
  }
  const pack = coinPacks[packKey];
  if (!pack) {
    return Response.json({ error: "Unknown Motion Coins pack" }, {
      status: 400,
      headers: corsHeaders
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: pack.amountCents,
        product_data: {
          name: pack.name,
          description: "Closed digital currency for eligible DONPONLINE items and access."
        }
      }
    }],
    metadata: {
      user_id: user.id,
      pack_key: packKey,
      coins: String(pack.coins)
    },
    success_url: `${siteUrl}/members.html?purchase=success`,
    cancel_url: `${siteUrl}/members.html?purchase=cancelled`
  });

  if (isFormPost && session.url) {
    return Response.redirect(session.url, 303);
  }

  return Response.json({ url: session.url }, { headers: corsHeaders });
});
