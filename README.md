# RUNE Asset Maturity Public

Public, blank-start RUNE asset maturity dashboard for THORChain addresses.

This repo was split from a private dashboard so the public app can have its own GitHub project, own Cloudflare project, and own Supabase database. It does **not** include private default THOR addresses.

## What it does

- Starts with no addresses for new visitors.
- Lets a visitor save one or more THORChain addresses in an anonymous browser workspace.
- Stores that workspace in a browser cookie named `rune_workspace_id`.
- Scopes saved addresses, lot-review decisions, and split-lot edits by `workspace_id` so visitors do not share one saved dataset.
- Fetches live wallet RUNE balances from Midgard.
- Fetches bonded RUNE by scanning THORNode `/thorchain/nodes` bond-provider positions.
- Reconstructs FIFO lots from THORChain action history where possible.
- Shows maturity charts, upcoming maturity dates, wallet/bond reconciliation, sale-planning, and lot-review tools.

## Anonymous workspace model

The first time a visitor saves an address, the server creates a random ID like:

```text
ws_8f3a9c...
```

That ID is saved in their browser cookie. Database rows are saved like:

```text
workspace_id + address
workspace_id + lot review
workspace_id + split lot
```

Simple explanation: the workspace ID is a private notebook number for that browser. It avoids requiring login, but it is not as durable or secure as a real user account.

## Important privacy caveat

This is a no-login public prototype model. If a visitor clears cookies or switches devices, they may lose access to their saved workspace. For serious tax records, add real user accounts later.

## Supabase setup

Create a **separate public Supabase project** and run:

```sql
-- contents of supabase/schema.sql
```

Then set Cloudflare/Next environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PUBLIC_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

Do not reuse the private dashboard database.

## Development

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
```

## Tax caveat

This app is for planning/analysis only and is not tax advice. On-chain data may show a CEX withdrawal date rather than the true purchase date, so users should review/override lots before relying on the output.
