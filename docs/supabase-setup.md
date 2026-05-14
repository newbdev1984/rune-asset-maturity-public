# Supabase setup

The public dashboard stores anonymous-browser workspace data in Supabase. Use a **separate public Supabase project**; do not point this app at the private dashboard database.

## Required environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PUBLIC_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is required for live saves. It is **not** the database password and should never be exposed in browser/client code. Add it as a server-only Cloudflare/hosting secret.

## Create the tables

Open Supabase SQL Editor and run:

```sql
-- contents of supabase/schema.sql
```

The main tables are:

- `public.rune_workspaces`
- `public.rune_tracked_addresses`
- `public.rune_lot_overrides`
- `public.rune_lot_splits`

## Security model

- Browser calls local Next.js API routes.
- Server routes use `SUPABASE_SERVICE_ROLE_KEY` to read/write workspace-scoped rows.
- Row-level security remains enabled with no public anon policies.
- Every saved row has a `workspace_id` so one visitor's rows do not load for another visitor.
- Raw THORChain data is not overwritten; user decisions are layered on top at render time.
