-- ============================================================
-- TutorAI — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL editor (not from terminal)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- users (mirrors Supabase auth.users via trigger)
create table if not exists public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text unique not null,
  full_name        text,
  avatar_url       text,
  plan             text not null default 'free' check (plan in ('free', 'student', 'family', 'school')),
  plan_expires_at  timestamptz,
  stripe_customer_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- student_profiles
create table if not exists public.student_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  name            text not null,
  grade           int not null check (grade between 1 and 12),
  curriculum      text not null check (curriculum in ('SEE', 'NEB', 'CBSE', 'Cambridge', 'ICSE', 'Other')),
  language        text not null default 'English' check (language in ('English', 'Nepali', 'Hindi', 'Bengali')),
  subjects        text[] not null default '{}',
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now()
);

-- chat_sessions
create table if not exists public.chat_sessions (
  id                  uuid primary key default gen_random_uuid(),
  student_profile_id  uuid not null references public.student_profiles(id) on delete cascade,
  subject             text not null,
  title               text not null default 'New Chat',
  message_count       int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- messages
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  has_image   boolean not null default false,
  image_url   text,
  tokens_used int,
  created_at  timestamptz not null default now()
);

-- practice_questions
create table if not exists public.practice_questions (
  id                  uuid primary key default gen_random_uuid(),
  student_profile_id  uuid not null references public.student_profiles(id) on delete cascade,
  subject             text not null,
  topic               text not null,
  question_text       text not null,
  student_answer      text,
  ai_feedback         text,
  score               int check (score between 0 and 100),
  is_correct          boolean,
  difficulty          text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  created_at          timestamptz not null default now()
);

-- topic_performance
create table if not exists public.topic_performance (
  id                    uuid primary key default gen_random_uuid(),
  student_profile_id    uuid not null references public.student_profiles(id) on delete cascade,
  subject               text not null,
  topic                 text not null,
  questions_attempted   int not null default 0,
  questions_correct     int not null default 0,
  last_practiced_at     timestamptz,
  updated_at            timestamptz not null default now(),
  unique (student_profile_id, subject, topic)
);

-- daily_usage
create table if not exists public.daily_usage (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  usage_date                date not null default current_date,
  ai_messages_count         int not null default 0,
  practice_questions_count  int not null default 0,
  unique (user_id, usage_date)
);

-- schools (B2B)
create table if not exists public.schools (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  country              text not null,
  admin_user_id        uuid not null references public.users(id) on delete restrict,
  plan                 text not null default 'school' check (plan in ('school')),
  student_count_limit  int not null default 100,
  created_at           timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_student_profiles_user_id
  on public.student_profiles(user_id);

create index if not exists idx_chat_sessions_student_profile_id
  on public.chat_sessions(student_profile_id);

create index if not exists idx_chat_sessions_updated_at
  on public.chat_sessions(updated_at desc);

create index if not exists idx_messages_session_id
  on public.messages(session_id);

create index if not exists idx_messages_created_at
  on public.messages(session_id, created_at asc);

create index if not exists idx_practice_questions_student_profile_id
  on public.practice_questions(student_profile_id);

create index if not exists idx_practice_questions_subject_topic
  on public.practice_questions(student_profile_id, subject, topic);

create index if not exists idx_topic_performance_student_profile_id
  on public.topic_performance(student_profile_id);

create index if not exists idx_daily_usage_user_date
  on public.daily_usage(user_id, usage_date);

create index if not exists idx_schools_admin_user_id
  on public.schools(admin_user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at on users
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create or replace trigger trg_chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

create or replace trigger trg_topic_performance_updated_at
  before update on public.topic_performance
  for each row execute function public.set_updated_at();

-- Sync new auth.users rows into public.users
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Increment chat_sessions.message_count when a message is inserted
create or replace function public.increment_message_count()
returns trigger language plpgsql as $$
begin
  update public.chat_sessions
  set message_count = message_count + 1,
      updated_at    = now()
  where id = new.session_id;
  return new;
end;
$$;

create or replace trigger trg_increment_message_count
  after insert on public.messages
  for each row execute function public.increment_message_count();

-- Upsert daily_usage.ai_messages_count when an assistant message is inserted
create or replace function public.track_daily_ai_usage()
returns trigger language plpgsql security definer as $$
declare
  v_user_id uuid;
begin
  -- resolve user_id: messages → chat_sessions → student_profiles → users
  select sp.user_id into v_user_id
  from public.chat_sessions cs
  join public.student_profiles sp on sp.id = cs.student_profile_id
  where cs.id = new.session_id;

  if new.role = 'assistant' and v_user_id is not null then
    insert into public.daily_usage (user_id, usage_date, ai_messages_count)
    values (v_user_id, current_date, 1)
    on conflict (user_id, usage_date)
    do update set ai_messages_count = public.daily_usage.ai_messages_count + 1;
  end if;

  return new;
end;
$$;

create or replace trigger trg_track_daily_ai_usage
  after insert on public.messages
  for each row execute function public.track_daily_ai_usage();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users             enable row level security;
alter table public.student_profiles  enable row level security;
alter table public.chat_sessions     enable row level security;
alter table public.messages          enable row level security;
alter table public.practice_questions enable row level security;
alter table public.topic_performance enable row level security;
alter table public.daily_usage       enable row level security;
alter table public.schools           enable row level security;

-- users: each user sees and edits only their own row
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- student_profiles: owner can CRUD their profiles
create policy "student_profiles_select_own" on public.student_profiles
  for select using (auth.uid() = user_id);

create policy "student_profiles_insert_own" on public.student_profiles
  for insert with check (auth.uid() = user_id);

create policy "student_profiles_update_own" on public.student_profiles
  for update using (auth.uid() = user_id);

create policy "student_profiles_delete_own" on public.student_profiles
  for delete using (auth.uid() = user_id);

-- chat_sessions: owner can CRUD sessions that belong to their profiles
create policy "chat_sessions_select_own" on public.chat_sessions
  for select using (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "chat_sessions_insert_own" on public.chat_sessions
  for insert with check (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "chat_sessions_update_own" on public.chat_sessions
  for update using (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "chat_sessions_delete_own" on public.chat_sessions
  for delete using (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

-- messages: accessible only through sessions owned by the user
create policy "messages_select_own" on public.messages
  for select using (
    exists (
      select 1 from public.chat_sessions cs
      join public.student_profiles sp on sp.id = cs.student_profile_id
      where cs.id = session_id and sp.user_id = auth.uid()
    )
  );

create policy "messages_insert_own" on public.messages
  for insert with check (
    exists (
      select 1 from public.chat_sessions cs
      join public.student_profiles sp on sp.id = cs.student_profile_id
      where cs.id = session_id and sp.user_id = auth.uid()
    )
  );

-- practice_questions: owner CRUD
create policy "practice_questions_select_own" on public.practice_questions
  for select using (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "practice_questions_insert_own" on public.practice_questions
  for insert with check (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "practice_questions_update_own" on public.practice_questions
  for update using (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

-- topic_performance: owner CRUD
create policy "topic_performance_select_own" on public.topic_performance
  for select using (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "topic_performance_insert_own" on public.topic_performance
  for insert with check (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "topic_performance_update_own" on public.topic_performance
  for update using (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );

-- daily_usage: users see only their own usage row
create policy "daily_usage_select_own" on public.daily_usage
  for select using (auth.uid() = user_id);

-- schools: school admin sees their own school
create policy "schools_select_own" on public.schools
  for select using (auth.uid() = admin_user_id);

create policy "schools_update_own" on public.schools
  for update using (auth.uid() = admin_user_id);

-- ============================================================
-- STORAGE BUCKETS (run separately if needed)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('question-images', 'question-images', false);
--
-- create policy "question_images_upload_own"
--   on storage.objects for insert
--   with check (bucket_id = 'question-images' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "question_images_select_own"
--   on storage.objects for select
--   using (bucket_id = 'question-images' and auth.uid()::text = (storage.foldername(name))[1]);
