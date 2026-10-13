-- Daybook ↔ Google Calendar: run this once in your Supabase project's SQL editor (after schema.sql).
--
-- Only the google-calendar Edge Function (service role) reads or writes these tables, so they have
-- Row Level Security on and no policies: the app's own sign-in can't see them. That keeps the Google
-- refresh token on the server and off every device.

-- Who connected Google, with the long-lived token the function uses to reach their calendars.
create table if not exists public.google_accounts (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  google_email  text,
  refresh_token text        not null,
  time_zone     text        not null default 'UTC', -- Daybook stores local times; Google times are read in this zone
  connected_at  timestamptz not null default now(),
  syncing_until timestamptz                         -- one sync at a time, so two devices can't double-insert
);
alter table public.google_accounts enable row level security;

-- Which Google calendar each linked Daybook calendar mirrors.
create table if not exists public.google_calendar_links (
  user_id            uuid not null references auth.users (id) on delete cascade,
  calendar_id        text not null, -- Daybook calendar id (records.id where tbl = 'calendars')
  google_calendar_id text not null,
  primary key (user_id, calendar_id)
);
alter table public.google_calendar_links enable row level security;

-- One row per mirrored event: a Google occurrence, or a whole series for a repeating Daybook event.
create table if not exists public.google_event_links (
  user_id            uuid not null references auth.users (id) on delete cascade,
  event_id           text not null, -- Daybook event id
  google_event_id    text not null, -- for occurrences of a Google series: the series id
  occurrence         text not null, -- the occurrence's original start ('YYYY-MM-DDTHH:MM'); '' = whole series
  google_calendar_id text not null,
  fingerprint        text not null, -- both sides' content when they last agreed
  primary key (user_id, google_event_id, occurrence)
);
create index if not exists google_event_links_calendar on public.google_event_links (user_id, google_calendar_id);
alter table public.google_event_links enable row level security;
