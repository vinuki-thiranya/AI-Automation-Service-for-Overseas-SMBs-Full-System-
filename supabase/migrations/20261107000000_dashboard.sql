-- Phase 3: client dashboard (spec Prompt 4).
--   * Tables for the Package D approval queue, invoices and the client's help resources.
--   * Read RPCs the dashboard calls with the user's own JWT (anon key + session), so RLS still applies.
--   * One narrow write path for dashboard users: decide_reply_draft.
--   * Money (revenue, costs, invoices) is owner/agency-only; staff see conversations, not money.
-- Forward-only: never edit this file after it has run anywhere; add a new migration.

-- ---------------------------------------------------------------------------
-- Staff no longer read metrics_daily directly: it carries revenue and cost columns.
-- They get the same series through dashboard_metrics(), with money nulled.
-- ---------------------------------------------------------------------------
drop policy metrics_daily_read on public.metrics_daily;
create policy metrics_daily_read on public.metrics_daily for select to authenticated
  using (app.client_role(client_id) in ('agency', 'owner'));

-- ---------------------------------------------------------------------------
-- Package D approval queue (spec §4.9: "drafts with Approve / Edit / Reject")
-- Written by the help-desk integration (service role); decided in the dashboard.
-- ---------------------------------------------------------------------------
create table public.reply_drafts (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients (id) on delete cascade,
  helpdesk            text not null check (helpdesk in ('gorgias', 'zendesk', 'freshdesk', 'other')),
  external_ticket_id  text not null,
  customer_name       text,
  subject             text,
  customer_message    text not null,
  draft_body          text not null,
  final_body          text,                 -- what was approved (the draft, or the staff edit)
  confidence          numeric check (confidence between 0 and 1),
  status              text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'sent', 'failed')),
  decided_by          uuid references auth.users (id) on delete set null,
  decided_at          timestamptz,
  decision_note       text,
  created_at          timestamptz not null default now()
);
create index reply_drafts_client_status on public.reply_drafts (client_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Invoices (spec §6.7: deposit, go-live, care plan, usage pass-through, extra hours)
-- Issued in PayPal/Payoneer/Wise; this table lists them for the client with a link.
-- ---------------------------------------------------------------------------
create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  number        text not null,
  kind          text not null check (kind in ('deposit', 'go_live', 'care_plan', 'usage', 'extra_hours')),
  description   text,
  period_start  date,
  period_end    date,
  amount        numeric(12, 2) not null check (amount >= 0),
  currency      text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status        text not null default 'sent' check (status in ('draft', 'sent', 'paid', 'void')),
  issued_on     date not null,
  due_on        date,
  paid_on       date,
  provider      text check (provider in ('paypal', 'payoneer', 'wise', 'other')),
  url           text check (url ~ '^https://'),
  created_at    timestamptz not null default now(),
  unique (client_id, number)
);
create index invoices_client_issued on public.invoices (client_id, issued_on desc);

-- ---------------------------------------------------------------------------
-- Help resources per client (§6.4 client portal: walkthrough video, quick guide, support contact)
-- ---------------------------------------------------------------------------
create table public.client_resources (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  kind        text not null check (kind in ('walkthrough_video', 'quick_guide', 'support', 'other')),
  title       text not null,
  url         text check (url ~ '^(https://|mailto:|tel:)'),
  note        text,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index client_resources_client on public.client_resources (client_id, sort);

alter table public.reply_drafts enable row level security;
alter table public.invoices enable row level security;
alter table public.client_resources enable row level security;

create policy reply_drafts_read on public.reply_drafts for select to authenticated
  using (app.has_client_access(client_id));
-- Owners don't see invoices the agency is still drafting.
create policy invoices_read on public.invoices for select to authenticated
  using (app.is_agency() or (app.client_role(client_id) = 'owner' and status <> 'draft'));
create policy client_resources_read on public.client_resources for select to authenticated
  using (app.has_client_access(client_id));

revoke all on public.reply_drafts, public.invoices, public.client_resources from anon;

-- ---------------------------------------------------------------------------
-- Dashboard RPCs
-- ---------------------------------------------------------------------------

-- The clients the signed-in user can open, with their role in each (agency → every client).
create or replace function public.my_memberships()
returns table (client_id uuid, slug text, name text, role text, status text, timezone text, packages jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, app.client_role(c.id), c.status, c.timezone, coalesce(c.config -> 'packages', '[]'::jsonb)
  from public.clients c
  where app.has_client_access(c.id)
  order by c.name;
$$;

create or replace function public.is_agency_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_agency();
$$;

-- Daily metrics for one client. Staff get the operational columns; money columns come back null.
create or replace function public.dashboard_metrics(p_client uuid, p_from date, p_to date)
returns table (
  day date, enquiries integer, conversations integer, bookings integer, cancellations integer,
  leads_hot integer, leads_warm integer, leads_cold integer, escalations integer, missed_calls_texted integer,
  median_response_seconds numeric, p95_response_seconds numeric, speed_to_lead_seconds numeric,
  revenue_influenced numeric, revenue_currency text, llm_cost_usd numeric, messaging_cost_usd numeric
)
language sql stable security definer set search_path = '' as $$
  select m.day, m.enquiries, m.conversations, m.bookings, m.cancellations,
         m.leads_hot, m.leads_warm, m.leads_cold, m.escalations, m.missed_calls_texted,
         m.median_response_seconds, m.p95_response_seconds, m.speed_to_lead_seconds,
         case when r.money then m.revenue_influenced end,
         case when r.money then m.revenue_currency end,
         case when r.money then m.llm_cost_usd end,
         case when r.money then m.messaging_cost_usd end
  from public.metrics_daily m
  cross join (select app.client_role(p_client) in ('agency', 'owner') as money) r
  where m.client_id = p_client
    and app.has_client_access(p_client)
    and m.day between p_from and p_to
  order by m.day;
$$;

-- Transcript search (§4.9). SECURITY INVOKER, so the messages_read policy applies. Matches on the
-- exact expression of the messages_body_fts index. Highlights are wrapped in U+0002 … U+0003 (not
-- HTML) so the dashboard can render them without injecting customer text as markup.
create or replace function public.search_messages(p_client uuid, p_query text, p_limit integer default 50, p_before timestamptz default null)
returns table (message_id uuid, thread_id uuid, created_at timestamptz, author text, channel text, contact_name text, snippet text)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.thread_id, m.created_at, m.author, m.channel, c.name,
         ts_headline('english', coalesce(m.body, ''), q,
                     format('StartSel=%s, StopSel=%s, MaxWords=30, MinWords=12, MaxFragments=2', chr(2), chr(3)))
  from public.messages m
  join public.threads t on t.id = m.thread_id
  left join public.contacts c on c.id = t.contact_id
  cross join websearch_to_tsquery('english', p_query) q
  where m.client_id = p_client
    and to_tsvector('english', coalesce(m.body, '')) @@ q
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Approve (optionally with an edited reply) or reject a pending draft. The only dashboard write.
create or replace function public.decide_reply_draft(p_id uuid, p_action text, p_body text default null, p_note text default null)
returns public.reply_drafts
language plpgsql security definer set search_path = '' as $$
declare d public.reply_drafts;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'action must be approve or reject' using errcode = '22023';
  end if;
  select * into d from public.reply_drafts where id = p_id for update;
  if not found or not app.has_client_access(d.client_id) then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if d.status <> 'pending' then
    raise exception 'draft already decided' using errcode = '55000';
  end if;
  if p_action = 'approve' and coalesce(nullif(btrim(p_body), ''), d.draft_body) = '' then
    raise exception 'reply is empty' using errcode = '22023';
  end if;

  update public.reply_drafts
     set status        = case p_action when 'approve' then 'approved' else 'rejected' end,
         final_body    = case p_action when 'approve' then coalesce(nullif(btrim(p_body), ''), d.draft_body) end,
         decided_by    = auth.uid(),
         decided_at    = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_id
  returning * into d;

  insert into public.audit_log (client_id, actor, action, detail)
  values (d.client_id, 'user:' || auth.uid(), 'reply_draft_' || d.status,
          jsonb_build_object('draft_id', d.id, 'edited', d.final_body is distinct from d.draft_body and d.status = 'approved'));
  return d;
end;
$$;

-- Agency health across clients (spec §4.8 internal dashboard: errors, API spend, message volume).
-- "issues" counts the failure events core writes to audit_log plus tool/LLM-outage escalations.
create or replace function public.agency_health(p_since timestamptz default now() - interval '30 days')
returns table (client_id uuid, slug text, name text, status text, messages bigint, inbound bigint,
               spend_usd numeric, open_escalations bigint, issues bigint, last_message_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.status,
         (select count(*) from public.messages m where m.client_id = c.id and m.created_at >= p_since),
         (select count(*) from public.messages m where m.client_id = c.id and m.created_at >= p_since and m.direction = 'inbound'),
         (select coalesce(sum(u.cost_usd), 0) from public.usage_events u where u.client_id = c.id and u.occurred_at >= p_since),
         (select count(*) from public.escalations e where e.client_id = c.id and e.status in ('open', 'claimed')),
         (select count(*) from public.audit_log a
           where a.client_id = c.id and a.created_at >= p_since
             and a.action in ('prompt_injection_blocked', 'unknown_price_blocked', 'text_back_failed',
                              'llm_judgement_failed', 'delivery_failed'))
         + (select count(*) from public.escalations e
             where e.client_id = c.id and e.created_at >= p_since and e.reason in ('tool_failure', 'llm_outage')),
         (select max(m.created_at) from public.messages m where m.client_id = c.id)
  from public.clients c
  where app.is_agency()
  order by c.name;
$$;

revoke execute on function public.my_memberships(), public.is_agency_user(),
  public.dashboard_metrics(uuid, date, date), public.search_messages(uuid, text, integer, timestamptz),
  public.decide_reply_draft(uuid, text, text, text), public.agency_health(timestamptz)
  from public, anon;
grant execute on function public.my_memberships(), public.is_agency_user(),
  public.dashboard_metrics(uuid, date, date), public.search_messages(uuid, text, integer, timestamptz),
  public.decide_reply_draft(uuid, text, text, text), public.agency_health(timestamptz)
  to authenticated;
