# Kopi & Space Hub POS

Brutalist-style web POS prototype built with Next.js, TypeScript, Tailwind CSS, Framer Motion, and Supabase.

## Local development

1. Install Node.js 20.9 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key.
4. Apply the Supabase migrations in order; see [Supabase setup](supabase/README.md).
5. Start the app with `npm run dev`.

Without Supabase environment values, the POS opens in clearly labeled demo mode. Demo mode does not save orders or accept payment.

## Incremental implementation

- Base interface and product/design brief: `e27bc41` (`feat: scaffold brutalist POS interface`)
- Supabase authentication and catalog: `8f400c2` (`feat: connect Supabase auth and catalog`)
- Persistent orders and server-side totals: next feature commit
- Table/space reservations and Midtrans payment: upcoming feature commits

The repository has no remote configured. Push only after adding the Git remote for your own repository.
