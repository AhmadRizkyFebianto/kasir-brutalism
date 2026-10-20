# Supabase and payment setup

1. Create a Supabase project and copy its Project URL and publishable key into `.env.local` using `.env.example` as a guide.
2. In the Supabase SQL Editor, run the migrations in order: `202610200001_catalog_foundation.sql`, `202610200002_orders.sql`, `202610200003_payments.sql`, `202610200004_reservations.sql`, `202610200005_shifts.sql`, then `202610210001_admin_pegawai_roles.sql`.
3. In **Authentication → Users**, create one Auth account for each person. Public sign-up is intentionally not part of the cashier terminal.
4. Copy each user's UUID and add one `store_members` row with role `admin` or `pegawai` and the employee's display name. Only admins may manage the catalog, rates, and reports; all members may operate POS shifts. Set `NEXT_PUBLIC_POS_STORE_ID` only if a user belongs to multiple stores (RLS still checks membership).
5. Restart the Next.js dev server after changing `.env`, then sign in with an assigned account.

The migration seeds a small starter catalog for the `kopi-space-hub` store. Replace prices, products, stock, images, and tags with the business's actual data before using it operationally. The browser uses only the Supabase publishable key; row-level security scopes catalog access by the signed-in user's store membership. Keep `SUPABASE_SECRET_KEY` server-only; never prefix it with `NEXT_PUBLIC_`.

The order RPC recalculates every line from current database prices, checks current stock, and snapshots the order before returning its total. Tax, service, and discount settings start at **0** until the business approves its rules. The current formula applies the percentage discount before tax and service, then rounds each fee to whole rupiah. Update rates only after agreement, for example:

```sql
update public.store_settings
set tax_rate_bps = 1000, service_rate_bps = 500, discount_rate_bps = 0
where store_id = (select id from public.stores where slug = 'kopi-space-hub');
```

Rates use basis points (`1000` = 10%). The interface can save, reopen, and cancel open bons for the signed-in cashier.

## Midtrans sandbox and production

Set `MIDTRANS_SERVER_KEY` on the server, leave `MIDTRANS_IS_PRODUCTION=false` for sandbox, and set `MIDTRANS_ENABLED_PAYMENTS=qris` (only channels enabled for the merchant account will be available). Set `NEXT_PUBLIC_APP_URL` to the deployed app's public URL so Snap can return the customer to `/payment/finish`. Configure `MIDTRANS_NOTIFICATION_URL` to the public HTTPS `/api/payments/notification` endpoint; the Snap request uses Midtrans' override-notification header. The app keeps the Midtrans server key and Supabase secret key on the server. Change production mode only after the merchant's production keys and notification endpoint are ready.

The online path reserves finite stock before creating the Snap session and releases it on failed, cancelled, or expired notification. Successful callbacks are signature-checked, amount-checked, and idempotent; the terminal can also query Midtrans status if its notification is delayed. A late/duplicate payment is recorded as `duplicate_payment` for manual refund review. A paid order with an unexpected stock shortfall is marked `paid_review` for admin follow-up.

The reservation migration seeds two bookable spaces and four table cards for the sample store. A space reservation holds the requested time range for 15 minutes until the cashier saves the matching bon. PostgreSQL excludes overlapping active space bookings; the booking function also checks capacity, duration, and store membership. Assign a table from the floor cards; it becomes available again when the order is paid or cancelled. Adjust the seeded spaces/tables for the real venue before operating.

The shift migration adds one active shift per cashier and store. Payments created by an authenticated cashier are linked to that cashier's active shift; payment creation is rejected until the cashier opens one. Closing the shift records counted cash, expected cash (opening float plus successful cash payments), non-cash sales, and the variance. Midtrans payments are included in non-cash totals after their verified success callback.

Admins can manage active retail products and store tax/service/discount rates in the terminal's settings panel. The daily report summarizes successful payments from the current local calendar day, by cash and non-cash channel. Space inventory remains managed through the Supabase tables so room capacity and reservation metadata stay consistent.

To add an admin after creating their Auth user:

```sql
insert into public.store_members (store_id, user_id, display_name, role)
select id, '<AUTH_USER_UUID>', 'Nama Admin', 'admin'
from public.stores
where slug = 'kopi-space-hub';
```

To add a pegawai, use the same statement with that person's Auth UUID, display name, and role `'pegawai'`. `store_members` keeps the store, Auth user ID, display name, and role together. Do not store login passwords in this table.
