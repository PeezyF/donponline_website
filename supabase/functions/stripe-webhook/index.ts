import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { coinPacks } from "../_shared/packs.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    return new Response(`Invalid webhook: ${error.message}`, { status: 400 });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return Response.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return Response.json({ received: true, credited: false });
  }

  const userId = session.metadata?.user_id ?? "";
  const packKey = session.metadata?.pack_key ?? "";
  const pack = coinPacks[packKey];
  if (
    !userId ||
    !pack ||
    session.amount_total !== pack.amountCents ||
    session.currency?.toLowerCase() !== "usd"
  ) {
    return new Response("Purchase metadata did not match a coin pack", { status: 400 });
  }

  const { data: credited, error } = await supabaseAdmin.rpc("credit_stripe_purchase", {
    p_user_id: userId,
    p_session_id: session.id,
    p_pack_key: packKey,
    p_coins: pack.coins,
    p_amount_cents: pack.amountCents,
    p_currency: "usd"
  });

  if (error) {
    console.error("Motion Coins credit failed", error);
    return new Response("Credit failed", { status: 500 });
  }

  return Response.json({ received: true, credited });
});
