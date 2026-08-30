-- Partner payout ledger. Apply after 20260830_partner_affiliates.sql.
create table if not exists public.partner_payout_settings (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null unique references public.partners(id) on delete cascade,
  wallet_number text not null, account_name text not null, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners(id), payout_setting_id uuid references public.partner_payout_settings(id),
  amount_usd numeric(14,2) not null check (amount_usd > 0), status text not null default 'processing' check (status in ('processing','paid','rejected')),
  kpay_withdrawal_id text unique, kpay_reference text, kpay_status text, payout_currency text, payout_amount numeric(14,2), exchange_rate numeric(18,8), payout_fee_amount numeric(14,2), provider_country text,
  requested_at timestamptz not null default now(), paid_at timestamptz, note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.partner_payout_commissions (
  payout_id uuid not null references public.partner_payouts(id) on delete cascade,
  commission_id uuid not null references public.partner_commissions(id), amount_usd numeric(14,2) not null check (amount_usd > 0), created_at timestamptz not null default now(),
  primary key (payout_id, commission_id)
);
alter table public.partner_payout_settings enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_payout_commissions enable row level security;
create index if not exists partner_payouts_partner_status_idx on public.partner_payouts(partner_id, status, created_at desc);
create index if not exists partner_payout_commissions_commission_idx on public.partner_payout_commissions(commission_id);
