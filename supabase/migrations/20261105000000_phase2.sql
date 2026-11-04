-- Phase 2: state and fields the nuvadesk-core service needs, plus Vault access for client secrets.
-- Forward-only; see 20261104000000_init.sql for the base schema.

-- ---------------------------------------------------------------------------
-- Conversation state (offered slots, lead-flow position, rate-limit notices)
-- ---------------------------------------------------------------------------
alter table public.threads add column state jsonb not null default '{}';

-- ---------------------------------------------------------------------------
-- Leads: nurture scheduling
-- ---------------------------------------------------------------------------
alter table public.leads add column next_nurture_at timestamptz;
create index leads_nurture_due on public.leads (client_id, next_nurture_at)
  where status = 'nurturing' and nurture_stopped_at is null;

-- ---------------------------------------------------------------------------
-- Escalations: claim codes (SMS "TAKE 1234"), claimer name, owner backup ping
-- ---------------------------------------------------------------------------
alter table public.escalations
  add column claim_code text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  add column claimed_by_name text,
  add column owner_notified_at timestamptz;
create index escalations_claim_code on public.escalations (client_id, claim_code) where status = 'open';
create index escalations_claimed_by on public.escalations (client_id, claimed_by) where status = 'claimed';

-- ---------------------------------------------------------------------------
-- Idempotency marks for scheduled work (weekly report sent, nurture step sent, ...)
-- ---------------------------------------------------------------------------
create table public.job_marks (
  client_id  uuid not null references public.clients (id) on delete cascade,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, key)
);
alter table public.job_marks enable row level security;   -- service role only; no policies

-- ---------------------------------------------------------------------------
-- Monthly spend per client (spend cap + pass-through billing)
-- ---------------------------------------------------------------------------
create view public.usage_monthly with (security_invoker = true) as
  select client_id, date_trunc('month', occurred_at) as month, provider, sum(cost_usd) as cost_usd, sum(units) as units
  from public.usage_events
  group by 1, 2, 3;

-- ---------------------------------------------------------------------------
-- Client secrets in Supabase Vault, named 'client:<client_id>/<name>'.
-- Callable by the service role only (core and scripts/new-client.ts). Never by dashboard users.
-- ---------------------------------------------------------------------------
create or replace function public.put_client_secret(p_ref text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text := 'client:' || p_ref; v_id uuid;
begin
  if p_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9_-]+$' then
    raise exception 'invalid credential ref: %', p_ref;
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_value, v_name, 'nuvadesk client credential');
  else
    perform vault.update_secret(v_id, p_value, v_name, 'nuvadesk client credential');
  end if;
end;
$$;

create or replace function public.get_client_secret(p_ref text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'client:' || p_ref;
$$;

create or replace function public.list_client_secret_refs(p_client_slug text) returns setof text
language sql stable security definer set search_path = '' as $$
  select substr(name, 8) from vault.secrets where name like 'client:' || p_client_slug || '/%' order by 1;
$$;

revoke execute on function public.put_client_secret(text, text) from public, anon, authenticated;
revoke execute on function public.get_client_secret(text) from public, anon, authenticated;
revoke execute on function public.list_client_secret_refs(text) from public, anon, authenticated;
grant execute on function public.put_client_secret(text, text) to service_role;
grant execute on function public.get_client_secret(text) to service_role;
grant execute on function public.list_client_secret_refs(text) to service_role;

-- Retention purge callable through the API by the nightly job (service role only).
create or replace function public.purge_expired_transcripts() returns integer
language sql security definer set search_path = '' as $$
  select app.purge_expired_transcripts();
$$;
revoke execute on function public.purge_expired_transcripts() from public, anon, authenticated;
grant execute on function public.purge_expired_transcripts() to service_role;
