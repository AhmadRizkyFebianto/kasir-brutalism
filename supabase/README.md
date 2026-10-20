# Supabase and payment setup

1. Create a Supabase project and copy its Project URL and publishable key into `.env.local` using `.env.example` as a guide.
2. In the Supabase SQL Editor, run the migrations in order: `202610200001_catalog_foundation.sql`, `202610200002_orders.sql`, then `202610200003_payments.sql`.
3. In **Authentication → Users**, create an owner account. Public sign-up is intentionally not part of the cashier terminal.
4. Copy that user's UUID, then run the membership statement at the end of the migration with the real UUID. Set the store ID in `NEXT_PUBLIC_POS_STORE_ID` only if the user belongs to multiple stores (RLS still checks membership).
5. Restart the Next.js dev server after changing `.env.local`, then sign in with the owner account.

The migration seeds a small starter catalog for the `kopi-space-hub` store. Replace prices, products, stock, images, and tags with the business's actual data before using it operationally. The browser uses only the Supabase publishable key; row-level security scopes catalog access by the signed-in user's store membership. Never put the service-role key in a `NEXT_PUBLIC_` variable.

The order RPC recalculates every line from current database prices, checks current stock, and snapshots the order before returning its total. Tax, service, and discount settings start at **0** until the business approves its rules. The current formula applies the percentage discount before tax and service, then rounds each fee to whole rupiah. Update rates only after agreement, for example:

```sql
update public.store_settings
set tax_rate_bps = 1000, service_rate_bps = 500, discount_rate_bps = 0
where store_id = (select id from public.stores where slug = 'kopi-space-hub');
```

Rates use basis points (`1000` = 10%). The interface can save, reopen, and cancel open bons for the signed-in cashier.

## Midtrans sandbox and production

Set `MIDTRANS_SERVER_KEY` on the server, leave `MIDTRANS_IS_PRODUCTION=false` for sandbox, and set `MIDTRANS_ENABLED_PAYMENTS=qris` (only channels enabled for the merchant account will be available). Set `NEXT_PUBLIC_APP_URL` to the deployed app's public URL so Snap can return the customer to `/payment/finish`. Configure `MIDTRANS_NOTIFICATION_URL` to the public HTTPS `/api/payments/notification` endpoint; the Snap request uses Midtrans' override-notification header. The app keeps the server key and Supabase service-role key on the server. Change production mode only after the merchant's production keys and notification endpoint are ready.

The online path reserves finite stock before creating the Snap session and releases it on failed, cancelled, or expired notification. Successful callbacks are signature-checked, amount-checked, and idempotent; the terminal can also query Midtrans status if its notification is delayed. A late/duplicate payment is recorded as `duplicate_payment` for manual refund review. A paid order with an unexpected stock shortfall is marked `paid_review` for admin follow-up.

To add a cashier after creating their Auth user:

```sql
insert into public.store_members (store_id, user_id, role)
select id, '<AUTH_USER_UUID>', 'cashier'
from public.stores
where slug = 'kopi-space-hub';
```

To grant owner access, replace `cashier` with `owner`. Catalog writes are currently limited to `owner` and `admin`; the admin catalog editor is a later feature slice.
