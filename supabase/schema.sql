-- Lotto Record MVP schema
-- ระบบนี้ออกแบบสำหรับบันทึกและตรวจคำนวณข้อมูลสลากส่วนตัวเท่านั้น
-- ก่อนใช้จริงให้เปิด Supabase Auth และ Row Level Security ทุกตาราง

create extension if not exists "pgcrypto";

create table if not exists draws (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  draw_date date not null,
  title text,
  status text not null default 'open' check (status in ('open', 'calculated', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references draws(id) on delete cascade,
  created_by uuid,
  holder_name text not null,
  lottery_number text not null check (lottery_number ~ '^[0-9]{6}$'),
  quantity integer not null default 1 check (quantity > 0),
  price_per_ticket numeric(12,2) not null default 80 check (price_per_ticket > 0),
  note text,
  matched_prizes jsonb not null default '[]'::jsonb,
  reward_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists draw_results (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references draws(id) on delete cascade,
  first_prize text check (first_prize is null or first_prize ~ '^[0-9]{6}$'),
  front3 text,
  back3 text,
  bottom2 text check (bottom2 is null or bottom2 ~ '^[0-9]{2}$'),
  source_url text,
  calculated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists share_logs (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references draws(id) on delete cascade,
  shared_by uuid,
  share_type text not null,
  shared_to text,
  created_at timestamptz not null default now()
);

create index if not exists idx_draws_owner_date on draws(owner_id, draw_date desc);
create index if not exists idx_ticket_entries_draw on ticket_entries(draw_id);
create index if not exists idx_ticket_entries_holder on ticket_entries(holder_name);
create index if not exists idx_ticket_entries_number on ticket_entries(lottery_number);
