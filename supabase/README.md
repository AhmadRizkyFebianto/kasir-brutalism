# Supabase setup — feature 01

1. Create a Supabase project and copy its Project URL and publishable key into `.env.local` using `.env.example` as a guide.
2. In the Supabase SQL Editor, run `migrations/202610200001_catalog_foundation.sql`.
3. In **Authentication → Users**, create an owner account. Public sign-up is intentionally not part of the cashier terminal.
4. Copy that user's UUID, then run the membership statement at the end of the migration with the real UUID. Set the store ID in `NEXT_PUBLIC_POS_STORE_ID` only if the user belongs to multiple stores (RLS still checks membership).
5. Restart the Next.js dev server after changing `.env.local`, then sign in with the owner account.

The migration seeds a small starter catalog for the `kopi-space-hub` store. Replace prices, products, stock, images, and tags with the business's actual data before using it operationally. The browser uses only the Supabase publishable key; row-level security scopes catalog access by the signed-in user's store membership. Never put the service-role key in a `NEXT_PUBLIC_` variable.

To add a cashier after creating their Auth user:

```sql
insert into public.store_members (store_id, user_id, role)
select id, '<AUTH_USER_UUID>', 'cashier'
from public.stores
where slug = 'kopi-space-hub';
```

To grant owner access, replace `cashier` with `owner`. Catalog writes are currently limited to `owner` and `admin`; the admin catalog editor is a later feature slice.
