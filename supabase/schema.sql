-- Lotto Record MVP basic schema
-- Extend with Supabase Auth and RLS before production use.

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  round_date date not null,
  title text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  created_by uuid,
  customer_name text not null,
  number text not null,
  number_type text not null,
  amount numeric(12,2) not null,
  payout_rate numeric(12,2) not null,
  note text,
  is_win boolean default false,
  prize_amount numeric(12,2) default 0,
  net_amount numeric(12,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  result_2_digit text,
  result_3_digit text,
  result_6_digit text,
  calculated_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists share_logs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  shared_by uuid,
  share_type text not null,
  shared_to text,
  created_at timestamptz default now()
);
