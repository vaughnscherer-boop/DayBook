-- Daybook sync: run this once in your Supabase project's SQL editor.
--
-- Every synced row from the app (events, tasks, calendars...) is stored here as JSON, so new columns
-- in the app sync without changing this table. Each user can only see and change their own rows.

create sequence if not exists public.records_rev;

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,               -- the app's table: 'events', 'tasks', ...
  id         text        not null,               -- the row's id in that table
  data       jsonb,                              -- the whole row; null once deleted
  deleted    boolean     not null default false,
  changed_at timestamptz not null,               -- when the device made the change
  rev        bigint      not null default nextval('public.records_rev'), -- goes up on every write
  synced_at  timestamptz not null default now(), -- server time of that write
  primary key (user_id, tbl, id)
);
create index if not exists records_user_rev on public.records (user_id, rev);

alter table public.records enable row level security;

drop policy if exists "Read own records" on public.records;
create policy "Read own records" on public.records
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Add own records" on public.records;
create policy "Add own records" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Change own records" on public.records;
create policy "Change own records" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Last change wins: a write older than what's stored is ignored. Every accepted write gets a new
-- rev, which is how devices ask for "everything since I last looked".
create or replace function public.records_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.changed_at < old.changed_at then
    return null;
  end if;
  new.rev := nextval('public.records_rev');
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write before insert or update on public.records
  for each row execute function public.records_before_write();

-- Ping open devices when something changes, so they pull right away.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;

-- Syllabus imports read by the import-schedule function, for its per-account daily limit and to
-- see what imports cost. Only the function (service role) reads or writes it: no policies.
create table if not exists public.import_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  file_name  text,
  cost_usd   numeric(8, 4),
  created_at timestamptz not null default now()
);
create index if not exists import_log_user_time on public.import_log (user_id, created_at);
alter table public.import_log enable row level security;
