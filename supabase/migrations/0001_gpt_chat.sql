-- GPTBot.uz AI Chat — Supabase (Postgres) schema.
-- Run in Supabase SQL editor or via `supabase db push`.
-- Writes happen server-side from the Railway backend using the SECRET key
-- (bypasses RLS). RLS policies below protect any direct client access via the
-- publishable/anon key so authenticated users can read only their own rows.

create extension if not exists "pgcrypto";

-- ── profiles (1:1 with auth.users) ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  telegram text,
  plan text not null default 'free',
  locale text not null default 'ru',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── sessions ───────────────────────────────────────────────
create table if not exists public.gpt_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anon_token_hash text,
  hashed_ip text,
  locale text not null default 'ru',
  title text,
  summary text,
  source text not null default 'web',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── messages ───────────────────────────────────────────────
create table if not exists public.gpt_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.gpt_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  model_used text,
  token_in integer not null default 0,
  token_out integer not null default 0,
  cost_usd numeric not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ── usage (daily rollup) ───────────────────────────────────
create table if not exists public.gpt_usage_daily (
  id uuid primary key default gen_random_uuid(),
  date_utc date not null,
  user_id uuid references auth.users(id) on delete set null,
  hashed_ip text,
  session_id uuid,
  message_count integer not null default 0,
  token_in integer not null default 0,
  token_out integer not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ── leads ──────────────────────────────────────────────────
create table if not exists public.gpt_leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  name text, email text, phone text, telegram text,
  contact_type text, contact_value text,
  need_type text, detected_intent text,
  last_user_message text,
  locale text not null default 'ru',
  page_url text,
  utm_json jsonb not null default '{}',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

-- ── subscriptions ──────────────────────────────────────────
create table if not exists public.gpt_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  plan text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── payment attempts ───────────────────────────────────────
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text,
  provider_checkout_id text,
  amount numeric,
  currency text not null default 'USD',
  status text not null default 'created',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── events (analytics) ─────────────────────────────────────
create table if not exists public.gpt_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  payload_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ── provider errors ────────────────────────────────────────
create table if not exists public.provider_errors (
  id uuid primary key default gen_random_uuid(),
  provider text, model text,
  status_code integer, error_code text, error_message text, request_id text,
  session_id uuid,
  created_at timestamptz not null default now()
);

-- ── message feedback ───────────────────────────────────────
create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.gpt_messages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rating text not null check (rating in ('up','down')),
  comment text,
  created_at timestamptz not null default now()
);

-- ── indexes ────────────────────────────────────────────────
create index if not exists idx_sessions_user on public.gpt_sessions(user_id);
create index if not exists idx_sessions_anon on public.gpt_sessions(anon_token_hash);
create index if not exists idx_sessions_ip on public.gpt_sessions(hashed_ip);
create index if not exists idx_sessions_activity on public.gpt_sessions(last_activity_at);
create index if not exists idx_messages_session on public.gpt_messages(session_id, created_at);
create index if not exists idx_messages_user on public.gpt_messages(user_id, created_at);
create index if not exists idx_usage_date_user on public.gpt_usage_daily(date_utc, user_id);
create index if not exists idx_usage_date_ip on public.gpt_usage_daily(date_utc, hashed_ip);
create index if not exists idx_leads_created on public.gpt_leads(created_at);
create index if not exists idx_leads_status on public.gpt_leads(status);
create index if not exists idx_events_name_created on public.gpt_events(event_name, created_at);
create index if not exists idx_provider_errors_created on public.provider_errors(created_at);
create index if not exists idx_subs_user_status on public.gpt_subscriptions(user_id, status);

-- ── Row Level Security ─────────────────────────────────────
-- Server backend uses the SECRET key and bypasses RLS. These policies gate any
-- direct client access via the publishable/anon key. Default-deny: enabling RLS
-- with no policy blocks all anon access; we add narrow owner-read policies.

alter table public.profiles          enable row level security;
alter table public.gpt_sessions      enable row level security;
alter table public.gpt_messages      enable row level security;
alter table public.gpt_usage_daily   enable row level security;
alter table public.gpt_leads         enable row level security;
alter table public.gpt_subscriptions enable row level security;
alter table public.payment_attempts  enable row level security;
alter table public.gpt_events        enable row level security;
alter table public.provider_errors   enable row level security;
alter table public.message_feedback  enable row level security;

-- profiles: owner can read + update limited fields.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- sessions: owner read + update/delete own (soft delete via update).
drop policy if exists sessions_select_own on public.gpt_sessions;
create policy sessions_select_own on public.gpt_sessions
  for select using (auth.uid() = user_id);
drop policy if exists sessions_update_own on public.gpt_sessions;
create policy sessions_update_own on public.gpt_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages: owner read only (writes go through backend secret key).
drop policy if exists messages_select_own on public.gpt_messages;
create policy messages_select_own on public.gpt_messages
  for select using (auth.uid() = user_id);

-- subscriptions: owner read only.
drop policy if exists subs_select_own on public.gpt_subscriptions;
create policy subs_select_own on public.gpt_subscriptions
  for select using (auth.uid() = user_id);

-- message_feedback: owner may insert feedback for themselves.
drop policy if exists feedback_insert_own on public.message_feedback;
create policy feedback_insert_own on public.message_feedback
  for insert with check (auth.uid() = user_id);

-- NOTE: gpt_leads, gpt_usage_daily, payment_attempts, gpt_events,
-- provider_errors have RLS enabled with NO anon policy → no public/client
-- access at all. Only the backend (secret key) reads/writes them.
