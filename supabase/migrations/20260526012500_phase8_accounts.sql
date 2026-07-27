-- Phase 8 accounts, sync, and admin-role foundation.
-- Run in a Supabase project, then assign admin roles manually in user app_metadata
-- or through a secure server-side process. Never expose service-role keys in the app.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'player' check (role in ('player', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_history (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry jsonb not null,
  completed_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.progress_snapshots enable row level security;
alter table public.game_history enable row level security;
alter table public.settings enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = 'player');

create policy "Users can read own progress" on public.progress_snapshots for select using (auth.uid() = user_id);
create policy "Users can insert own progress" on public.progress_snapshots for insert with check (auth.uid() = user_id);
create policy "Users can update own progress" on public.progress_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can read own history" on public.game_history for select using (auth.uid() = user_id);
create policy "Users can insert own history" on public.game_history for insert with check (auth.uid() = user_id);
create policy "Users can update own history" on public.game_history for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can read own settings" on public.settings for select using (auth.uid() = user_id);
create policy "Users can insert own settings" on public.settings for insert with check (auth.uid() = user_id);
create policy "Users can update own settings" on public.settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admins can read profiles" on public.profiles for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
