-- Recallo shared multi-tenant schema (spec §4, §5, §11).
-- Every client-data table carries client_id and has RLS enabled.
--   * n8n writes with the service_role key (bypasses RLS).
--   * Dashboard users (Supabase Auth) read through RLS, scoped by app.user_roles:
--       agency → all clients; owner/staff → their client only.
-- Forward-only: never edit this file after it has run anywhere; add a new migration.

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tenancy and roles
-- ---------------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  vertical      text not null,
  region        text not null check (region in ('au', 'eu', 'us')),
  timezone      text not null,
  status        text not null default 'staging'
                check (status in ('demo', 'staging', 'uat', 'live', 'paused', 'offboarded')),
  config        jsonb not null,             -- the validated client.json (credential refs only, no secrets)
  config_version integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table app.user_roles (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  client_id  uuid references public.clients (id) on delete cascade,  -- null only for role 'agency'
  role       text not null check (role in ('agency', 'owner', 'staff')),
  created_at timestamptz not null default now(),
  check ((role = 'agency') = (client_id is null))
);
-- client_id is NULL for agency rows, so uniqueness is enforced by two partial indexes.
create unique index user_roles_client_unique on app.user_roles (user_id, client_id, role) where client_id is not null;
create unique index user_roles_agency_unique on app.user_roles (user_id) where role = 'agency';

-- SECURITY DEFINER so policies can consult user_roles without recursive RLS.
create or replace function app.is_agency() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.user_roles where user_id = auth.uid() and role = 'agency');
$$;

create or replace function app.has_client_access(p_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_agency()
      or exists (select 1 from app.user_roles where user_id = auth.uid() and client_id = p_client_id);
$$;

create or replace function app.client_role(p_client_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when app.is_agency() then 'agency'
              else (select role from app.user_roles where user_id = auth.uid() and client_id = p_client_id
                    order by case role when 'owner' then 1 else 2 end limit 1)
         end;
$$;

grant execute on function app.is_agency(), app.has_client_access(uuid), app.client_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Contacts and conversations (§4.1, §4.2)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients (id) on delete cascade,
  name                  text,
  phone                 text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email                 text,
  language              text default 'en',
  crm_external_id       text,
  consent_marketing_at  timestamptz,       -- TCPA / Spam Act: required before nurture/marketing sends
  opted_out_at          timestamptz,       -- STOP received: no further sends of any marketing kind
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (client_id, phone),
  unique (client_id, email)
);

-- One contact can be reached on several channels; merge by phone/email (§4.1).
create table public.contact_channels (
  client_id    uuid not null references public.clients (id) on delete cascade,
  channel      text not null check (channel in ('whatsapp', 'sms', 'webchat', 'email', 'messenger', 'instagram', 'voice')),
  external_id  text not null,              -- wa_id, phone, webchat session, email address
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (client_id, channel, external_id)
);

create table public.threads (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  contact_id       uuid not null references public.contacts (id) on delete cascade,
  channel          text not null,
  status           text not null default 'ai' check (status in ('ai', 'human', 'closed')),
  ai_paused_until  timestamptz,            -- set to now() + 2h when staff take over (§4.9)
  summary          text,                   -- rolling summary for long conversations (§4.2)
  disclosed_at     timestamptz,            -- AI disclosure sent (first message)
  last_inbound_at  timestamptz,            -- WhatsApp 24-hour window is measured from here
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index threads_client_recent on public.threads (client_id, last_message_at desc);
create index threads_contact on public.threads (contact_id);

create table public.messages (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients (id) on delete cascade,
  thread_id            uuid not null references public.threads (id) on delete cascade,
  direction            text not null check (direction in ('inbound', 'outbound')),
  author               text not null check (author in ('customer', 'assistant', 'staff', 'system')),
  channel              text not null,
  provider_message_id  text,               -- dedupe key (§4.1)
  body                 text,
  attachments          jsonb not null default '[]',
  metadata             jsonb not null default '{}',   -- model, tokens, latency_ms, tool calls, guardrail verdict
  created_at           timestamptz not null default now(),
  unique (client_id, channel, provider_message_id)
);
create index messages_thread_time on public.messages (thread_id, created_at);
create index messages_client_time on public.messages (client_id, created_at desc);
-- Transcript search for the dashboard (§4.9: searchable for 12 months).
create index messages_body_fts on public.messages using gin (to_tsvector('english', coalesce(body, '')));

-- ---------------------------------------------------------------------------
-- Retrieval (§4.2): FAQ, prices, policies, staff bios — chunked + embedded
-- ---------------------------------------------------------------------------
create table public.faq_chunks (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  source      text not null,
  content     text not null,
  embedding   extensions.vector(1536) not null,     -- OpenAI text-embedding-3-small
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index faq_chunks_client on public.faq_chunks (client_id);
create index faq_chunks_embedding on public.faq_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Top-k chunks for one client. Called by n8n with the service role.
create or replace function public.match_faq_chunks(
  p_client_id uuid, p_query_embedding extensions.vector(1536), p_match_count integer default 5
) returns table (id uuid, source text, content text, similarity double precision)
language sql stable set search_path = '' as $$
  select c.id, c.source, c.content, 1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.faq_chunks c
  where c.client_id = p_client_id
  order by c.embedding operator(extensions.<=>) p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
$$;
revoke execute on function public.match_faq_chunks(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_faq_chunks(uuid, extensions.vector, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Bookings (§4.3) and leads (§4.4)
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients (id) on delete cascade,
  contact_id           uuid references public.contacts (id) on delete set null,
  thread_id            uuid references public.threads (id) on delete set null,
  adapter              text not null,
  external_booking_id  text not null,
  service_id           text,
  practitioner         text,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  status               text not null default 'booked'
                       check (status in ('booked', 'rescheduled', 'cancelled', 'attended', 'no_show')),
  reminders_sent       jsonb not null default '[]',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (client_id, adapter, external_booking_id)      -- idempotent writes
);
create index bookings_client_start on public.bookings (client_id, starts_at);

create table public.leads (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.clients (id) on delete cascade,
  contact_id              uuid references public.contacts (id) on delete set null,
  thread_id               uuid references public.threads (id) on delete set null,
  source                  text not null,
  answers                 jsonb not null default '{}',
  rule_score              numeric,
  llm_score               numeric,
  score                   numeric,
  grade                   text check (grade in ('hot', 'warm', 'cold')),
  status                  text not null default 'new'
                          check (status in ('new', 'qualifying', 'booked', 'nurturing', 'won', 'lost', 'archived')),
  received_at             timestamptz not null default now(),
  first_response_at       timestamptz,     -- speed-to-lead = first_response_at - received_at
  crm_external_id         text,
  nurture_step            integer not null default 0,
  nurture_stopped_at      timestamptz,
  created_at              timestamptz not null default now()
);
create index leads_client_time on public.leads (client_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Escalations (§4.9)
-- ---------------------------------------------------------------------------
create table public.escalations (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  thread_id    uuid not null references public.threads (id) on delete cascade,
  reason       text not null,              -- low_confidence | guardrail | customer_request | tool_failure | llm_outage
  summary      text not null,
  status       text not null default 'open' check (status in ('open', 'claimed', 'resolved', 'expired')),
  claimed_by   text,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  resolved_at  timestamptz
);
create index escalations_client_open on public.escalations (client_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Metrics (§4.8) and usage for pass-through billing + spend caps
-- ---------------------------------------------------------------------------
create table public.metrics_daily (
  client_id                 uuid not null references public.clients (id) on delete cascade,
  day                       date not null,                 -- in the client's timezone
  enquiries                 integer not null default 0,
  conversations             integer not null default 0,
  bookings                  integer not null default 0,
  cancellations             integer not null default 0,
  leads_hot                 integer not null default 0,
  leads_warm                integer not null default 0,
  leads_cold                integer not null default 0,
  escalations               integer not null default 0,
  missed_calls_texted       integer not null default 0,
  median_response_seconds   numeric,
  p95_response_seconds      numeric,
  speed_to_lead_seconds     numeric,
  revenue_influenced        numeric not null default 0,
  revenue_currency          text,
  llm_cost_usd              numeric not null default 0,
  messaging_cost_usd        numeric not null default 0,
  updated_at                timestamptz not null default now(),
  primary key (client_id, day)
);

create table public.usage_events (
  id           bigint generated always as identity primary key,
  client_id    uuid not null references public.clients (id) on delete cascade,
  provider     text not null,              -- anthropic | openai | twilio | whatsapp | resend | vapi
  kind         text not null,              -- tokens_in | tokens_out | sms | wa_conversation | voice_minute | email
  model        text,
  units        numeric not null,
  cost_usd     numeric not null,
  occurred_at  timestamptz not null default now()
);
create index usage_events_client_time on public.usage_events (client_id, occurred_at desc);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  client_id   uuid references public.clients (id) on delete cascade,
  actor       text not null,               -- 'n8n:<workflow>' | 'user:<uuid>' | 'system'
  action      text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_log_client_time on public.audit_log (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger clients_touch  before update on public.clients  for each row execute function app.touch_updated_at();
create trigger contacts_touch before update on public.contacts for each row execute function app.touch_updated_at();
create trigger bookings_touch before update on public.bookings for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- Dashboard users get READ access to their client's rows. All writes come from n8n
-- (service_role) for now; Phase 3 adds narrow write policies (e.g. approval queue).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['contacts', 'contact_channels', 'threads', 'messages', 'faq_chunks', 'bookings',
                           'leads', 'escalations', 'metrics_daily', 'usage_events', 'audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.has_client_access(client_id))',
                   t || '_read', t);
  end loop;
end $$;

alter table public.clients enable row level security;
create policy clients_read on public.clients for select to authenticated using (app.has_client_access(id));

alter table app.user_roles enable row level security;
create policy user_roles_read_own on app.user_roles for select to authenticated
  using (user_id = auth.uid() or app.is_agency());
grant select on app.user_roles to authenticated;

-- Cost and audit data is agency/owner-only; staff see conversations, not money.
drop policy usage_events_read on public.usage_events;
create policy usage_events_read on public.usage_events for select to authenticated
  using (app.client_role(client_id) in ('agency', 'owner'));
drop policy audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated
  using (app.is_agency());

-- Nobody but the service role touches anon.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Retention (§5 Security: purge transcripts after 12 months by default)
-- Uses each client's compliance.retention_months. Schedule daily, e.g. with pg_cron:
--   select cron.schedule('purge-transcripts', '15 3 * * *', 'select app.purge_expired_transcripts()');
-- ---------------------------------------------------------------------------
create or replace function app.purge_expired_transcripts() returns integer
language plpgsql security definer set search_path = '' as $$
declare deleted integer;
begin
  with expired as (
    delete from public.messages m
    using public.clients c
    where m.client_id = c.id
      and m.created_at < now() - make_interval(months => coalesce((c.config #>> '{compliance,retention_months}')::int, 12))
    returning m.id
  )
  select count(*) into deleted from expired;

  delete from public.threads t
  where not exists (select 1 from public.messages m where m.thread_id = t.id)
    and t.last_message_at < now() - interval '30 days';

  insert into public.audit_log (client_id, actor, action, detail)
  values (null, 'system', 'purge_expired_transcripts', jsonb_build_object('messages_deleted', deleted));
  return deleted;
end;
$$;
revoke execute on function app.purge_expired_transcripts() from public, anon, authenticated;
