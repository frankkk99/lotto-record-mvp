-- Quick Number Record MVP schema
-- ระบบนี้เป็นเครื่องมือบันทึกข้อมูลส่วนตัว ไม่มีระบบรับเงินออนไลน์ ฝากถอน หรือจ่ายเงินในระบบ
-- ก่อนใช้จริงให้เปิด Supabase Auth และ Row Level Security ทุกตาราง

create extension if not exists "pgcrypto";

create table if not exists draw_rounds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  draw_date date not null,
  title text,
  status text not null default 'open' check (status in ('open', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists number_entries (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid references draw_rounds(id) on delete cascade,
  created_by uuid,
  customer_name text not null,
  number text not null check (number ~ '^[0-9]{1,3}$'),
  kind text not null check (kind in ('two_top', 'two_bottom', 'three_direct', 'three_tod', 'run_top', 'run_bottom')),
  amount numeric(12,2) not null check (amount > 0),
  payment_status text not null default 'paid' check (payment_status in ('paid', 'unpaid')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists share_logs (
  id uuid primary key default gen_random_uuid(),
  draw_round_id uuid references draw_rounds(id) on delete cascade,
  shared_by uuid,
  share_type text not null,
  shared_to text,
  created_at timestamptz not null default now()
);

create index if not exists idx_draw_rounds_owner_date on draw_rounds(owner_id, draw_date desc);
create index if not exists idx_number_entries_round on number_entries(draw_round_id);
create index if not exists idx_number_entries_customer on number_entries(customer_name);
create index if not exists idx_number_entries_number on number_entries(number);
create index if not exists idx_number_entries_kind on number_entries(kind);
