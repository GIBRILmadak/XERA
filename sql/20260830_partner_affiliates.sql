-- XERA1 partnership and affiliate ledger. Apply in Supabase SQL editor before deploying.
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(), name text not null, status text not null default 'active' check (status in ('active','revoked','expired')),
  commission_rate numeric(5,4) not null default .05 check (commission_rate >= 0 and commission_rate <= 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_codes (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners(id), code text not null unique,
  status text not null default 'active' check (status in ('active','revoked','expired')), expires_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_discount_codes (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners(id), code text not null unique,
  discount_percent numeric(5,2) not null default 20 check (discount_percent >= 0 and discount_percent <= 100),
  status text not null default 'active' check (status in ('active','revoked','expired')), starts_at timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_page_memberships (
  id uuid primary key default gen_random_uuid(), professional_page_id uuid not null references public.professional_pages(id), partner_id uuid not null references public.partners(id), partner_code_id uuid not null references public.partner_codes(id),
  status text not null default 'active' check (status in ('active','expired','revoked')), activated_at timestamptz not null default now(), deactivated_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(professional_page_id)
);
create table if not exists public.partner_affiliations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id), partner_id uuid not null references public.partners(id), partner_discount_code_id uuid references public.partner_discount_codes(id), subscription_id bigint references public.subscriptions(id),
  status text not null default 'active' check (status in ('active','expired','revoked')), eligible_from timestamptz not null, eligible_until timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, subscription_id)
);
create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners(id), affiliation_id uuid not null references public.partner_affiliations(id), support_transaction_id uuid not null references public.transactions(id), beneficiary_user_id uuid not null references public.users(id), project_id uuid,
  amount_gross numeric(14,2) not null, commission_amount numeric(14,2) not null, beneficiary_net_amount numeric(14,2) not null,
  currency text not null default 'USD', status text not null default 'pending' check (status in ('pending','available','paid','cancelled','refunded')), available_at timestamptz, paid_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(support_transaction_id, partner_id)
);
create table if not exists public.partner_audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists partner_affiliations_user_window_idx on public.partner_affiliations(user_id, status, eligible_from, eligible_until);
create index if not exists partner_commissions_partner_idx on public.partner_commissions(partner_id, status, created_at desc);
alter table public.partners enable row level security;
alter table public.partner_codes enable row level security;
alter table public.partner_discount_codes enable row level security;
alter table public.partner_page_memberships enable row level security;
alter table public.partner_affiliations enable row level security;
alter table public.partner_commissions enable row level security;
alter table public.partner_audit_log enable row level security;
-- All mutations and financial reads are deliberately performed by authenticated API routes using the service role.
