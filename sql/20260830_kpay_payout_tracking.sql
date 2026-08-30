-- KPay payout tracking: execute after the monetization schema.
alter table public.withdrawal_requests add column if not exists kpay_withdrawal_id text;
alter table public.withdrawal_requests add column if not exists kpay_reference text;
alter table public.withdrawal_requests add column if not exists kpay_status text;
alter table public.withdrawal_requests add column if not exists payout_currency text;
alter table public.withdrawal_requests add column if not exists payout_amount numeric(14,2);
alter table public.withdrawal_requests add column if not exists exchange_rate numeric(18,8);
alter table public.withdrawal_requests add column if not exists payout_fee_amount numeric(14,2);
alter table public.withdrawal_requests add column if not exists provider_country text;
create unique index if not exists withdrawal_requests_kpay_withdrawal_id_uidx on public.withdrawal_requests(kpay_withdrawal_id) where kpay_withdrawal_id is not null;
