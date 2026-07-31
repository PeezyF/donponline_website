# Motion Coins connection checklist

The member portal and secure backend source are ready. Do not publish live
account creation or payments until the following services are connected.

## 1. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/202607310001_motion_coins.sql`.
3. Copy the project URL and publishable key into
   `assets/js/supabase-config.js`.
4. Add `https://donponline.com/members.html` to the Auth redirect URLs.
5. Replace the placeholder project ref in `supabase/config.toml`.

The publishable key is intended for browser use. Never put the secret key,
service-role key, Stripe secret key, or webhook secret in browser files.

## 2. Stripe

1. Activate a Stripe account.
2. Set these Supabase Edge Function secrets:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `SITE_URL=https://donponline.com`
3. Deploy `create-checkout` and `stripe-webhook`.
4. Create a Stripe webhook endpoint for:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
5. Subscribe it to `checkout.session.completed`.

## 3. Verify before launch

1. Create one test member and confirm a single 100-coin welcome ledger entry.
2. Retry signup with the same email and confirm no second award occurs.
3. Complete each coin-pack purchase in Stripe test mode.
4. Replay a webhook and confirm the same Checkout Session is not credited twice.
5. Unlock a test catalog item and confirm its price is deducted once.
6. Confirm users cannot read or change another member's wallet or ledger.

## Adding game characters and access

Insert catalog entries with a stable lowercase key:

```sql
insert into public.catalog_items
  (item_key, title, description, item_type, price_coins, sort_order)
values
  ('character-example', 'Character Name', 'Unlock this character in the game.', 'character', 500, 10);
```

The game should check `member_unlocks` for the signed-in member before enabling
the matching character or content.
