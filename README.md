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
- Persistent orders and server-side totals: `5a95536` (`feat: persist POS orders with server totals`)
- Supabase-backed cash and Midtrans Snap payments: `1fa6749` (`feat: add Midtrans and cash payments`)
- Table assignment and space reservations: `9df504c` (`feat: add table assignment and space reservations`)
- Cashier shifts and cash reconciliation: `d23cde8` (`feat: add cashier shifts and cash reconciliation`)
- Admin catalog management, store rates, and daily payment report: `6675920` (`feat: add admin catalog tools and daily sales report`)
- Receipt preview and browser printing: `de9ea5a` (`feat: add printable payment receipts`)
- Payment history and receipt reprint: `e7cc9aa` (`feat: add payment history and receipt reprints`)
- SKU/space-code search and POS keyboard shortcuts: implemented in the latest feature commit

The repository has no remote configured. Push only after adding the Git remote for your own repository.
