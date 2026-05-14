-- Supabase SQL for the public RUNE Asset Maturity Dashboard.
-- Run this once in the separate public Supabase project, not in the private dashboard database.
-- All saved rows are scoped by anonymous browser workspace_id.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.rune_workspaces (
  workspace_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rune_workspaces_id_format check (workspace_id ~ '^ws_[a-f0-9]{32}$')
);

drop trigger if exists set_rune_workspaces_updated_at on public.rune_workspaces;
create trigger set_rune_workspaces_updated_at
before update on public.rune_workspaces
for each row
execute function public.set_updated_at();

create table if not exists public.rune_tracked_addresses (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.rune_workspaces(workspace_id) on delete cascade,
  address text not null,
  label text,
  include_bond_rewards boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, address),
  constraint rune_tracked_addresses_address_format check (address ~ '^thor1[02-9ac-hj-np-z]{38}$')
);

create index if not exists rune_tracked_addresses_workspace_idx on public.rune_tracked_addresses (workspace_id, created_at);

drop trigger if exists set_rune_tracked_addresses_updated_at on public.rune_tracked_addresses;
create trigger set_rune_tracked_addresses_updated_at
before update on public.rune_tracked_addresses
for each row
execute function public.set_updated_at();

create table if not exists public.rune_lot_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.rune_workspaces(workspace_id) on delete cascade,
  lot_id text not null,
  source_tx_id text not null,
  source_wallet text not null,
  review_status text not null default 'reviewed' check (review_status in ('needs_review', 'reviewed')),
  original_acquired_at timestamptz not null,
  override_acquired_at timestamptz,
  amount_rune numeric not null check (amount_rune >= 0),
  source_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, lot_id)
);

create index if not exists rune_lot_overrides_workspace_source_tx_id_idx on public.rune_lot_overrides (workspace_id, source_tx_id);
create index if not exists rune_lot_overrides_workspace_source_wallet_idx on public.rune_lot_overrides (workspace_id, source_wallet);

drop trigger if exists set_rune_lot_overrides_updated_at on public.rune_lot_overrides;
create trigger set_rune_lot_overrides_updated_at
before update on public.rune_lot_overrides
for each row
execute function public.set_updated_at();

create table if not exists public.rune_lot_splits (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.rune_workspaces(workspace_id) on delete cascade,
  parent_lot_id text not null,
  source_tx_id text not null,
  source_wallet text not null,
  split_index integer not null check (split_index > 0),
  amount_rune numeric not null check (amount_rune > 0),
  acquired_at timestamptz not null,
  source_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, parent_lot_id, split_index)
);

create index if not exists rune_lot_splits_workspace_parent_lot_id_idx on public.rune_lot_splits (workspace_id, parent_lot_id);
create index if not exists rune_lot_splits_workspace_source_tx_id_idx on public.rune_lot_splits (workspace_id, source_tx_id);
create index if not exists rune_lot_splits_workspace_source_wallet_idx on public.rune_lot_splits (workspace_id, source_wallet);

drop trigger if exists set_rune_lot_splits_updated_at on public.rune_lot_splits;
create trigger set_rune_lot_splits_updated_at
before update on public.rune_lot_splits
for each row
execute function public.set_updated_at();

-- The app writes with SUPABASE_SERVICE_ROLE_KEY from server routes.
-- Keep RLS on and do not add public anon policies for tax/workspace data.
alter table public.rune_workspaces enable row level security;
alter table public.rune_tracked_addresses enable row level security;
alter table public.rune_lot_overrides enable row level security;
alter table public.rune_lot_splits enable row level security;

create or replace function public.replace_rune_lot_splits(
  p_workspace_id text,
  p_parent_lot_id text,
  p_source_tx_id text,
  p_source_wallet text,
  p_splits jsonb
)
returns table (
  parent_lot_id text,
  source_tx_id text,
  source_wallet text,
  split_index integer,
  amount_rune numeric,
  acquired_at timestamptz,
  source_label text,
  notes text
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_workspace_id is null or p_workspace_id !~ '^ws_[a-f0-9]{32}$' then
    raise exception 'Missing or invalid workspace id';
  end if;
  if p_parent_lot_id is null or p_parent_lot_id = '' then
    raise exception 'Missing parent lot id';
  end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) < 2 then
    raise exception 'At least two split lots are required';
  end if;

  insert into public.rune_workspaces (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do update set updated_at = now();

  delete from public.rune_lot_splits
  where rune_lot_splits.workspace_id = p_workspace_id
    and rune_lot_splits.parent_lot_id = p_parent_lot_id;

  insert into public.rune_lot_splits (
    workspace_id,
    parent_lot_id,
    source_tx_id,
    source_wallet,
    split_index,
    amount_rune,
    acquired_at,
    source_label,
    notes
  )
  select
    p_workspace_id,
    p_parent_lot_id,
    p_source_tx_id,
    p_source_wallet,
    item.ordinality::integer,
    (item.value ->> 'amount_rune')::numeric,
    (item.value ->> 'acquired_at')::timestamptz,
    nullif(item.value ->> 'source_label', ''),
    nullif(item.value ->> 'notes', '')
  from jsonb_array_elements(p_splits) with ordinality as item(value, ordinality);

  return query
  select
    rune_lot_splits.parent_lot_id,
    rune_lot_splits.source_tx_id,
    rune_lot_splits.source_wallet,
    rune_lot_splits.split_index,
    rune_lot_splits.amount_rune,
    rune_lot_splits.acquired_at,
    rune_lot_splits.source_label,
    rune_lot_splits.notes
  from public.rune_lot_splits
  where rune_lot_splits.workspace_id = p_workspace_id
    and rune_lot_splits.parent_lot_id = p_parent_lot_id
  order by rune_lot_splits.split_index;
end;
$$;

revoke execute on function public.replace_rune_lot_splits(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_rune_lot_splits(text, text, text, text, jsonb) to service_role;
