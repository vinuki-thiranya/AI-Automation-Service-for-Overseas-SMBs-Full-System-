-- Dashboard: when enquiries arrive, in the client's own timezone and against its opening hours.
-- Both functions are SECURITY INVOKER, so the messages_read policy applies (staff may see them; no money).
-- An enquiry is a thread with an inbound customer message; it's "after hours" when its first customer
-- message that day falls outside business.hours, or on one of business.holidays.
-- Forward-only.

-- Heatmap: distinct enquiring threads by ISO weekday (1 = Mon) and local hour. At most 168 rows.
create or replace function public.enquiry_hours(p_client uuid, p_from date, p_to date)
returns table (weekday integer, hour integer, enquiries bigint)
language sql stable security invoker set search_path = '' as $$
  select extract(isodow from l.local_at)::integer, extract(hour from l.local_at)::integer, count(distinct l.thread_id)
  from (
    select m.thread_id, m.created_at at time zone c.timezone as local_at
    from public.messages m
    join public.clients c on c.id = m.client_id
    where m.client_id = p_client and m.direction = 'inbound' and m.author = 'customer'
  ) l
  where l.local_at::date between p_from and p_to
  group by 1, 2
  order by 1, 2;
$$;

-- Daily split: enquiries per local day, and how many of them started after hours. At most one row per day.
create or replace function public.enquiries_by_day(p_client uuid, p_from date, p_to date)
returns table (day date, enquiries bigint, after_hours bigint)
language sql stable security invoker set search_path = '' as $$
  with first_contact as (
    select m.thread_id, (min(m.created_at) at time zone c.timezone) as local_at,
           c.config -> 'business' -> 'hours' as hours,
           c.config -> 'business' -> 'holidays' as holidays
    from public.messages m
    join public.clients c on c.id = m.client_id
    where m.client_id = p_client and m.direction = 'inbound' and m.author = 'customer'
      and (m.created_at at time zone c.timezone)::date between p_from and p_to
    group by m.thread_id, (m.created_at at time zone c.timezone)::date, c.timezone, c.config
  )
  select f.local_at::date,
         count(*),
         count(*) filter (where
           exists (select 1 from jsonb_array_elements(coalesce(f.holidays, '[]'::jsonb)) h
                   where (h ->> 'date')::date = f.local_at::date)
           or not exists (select 1 from jsonb_array_elements(coalesce(f.hours -> to_char(f.local_at, 'dy'), '[]'::jsonb)) p
                          where f.local_at::time >= (p ->> 'open')::time and f.local_at::time < (p ->> 'close')::time))
  from first_contact f
  group by 1
  order by 1;
$$;

revoke execute on function public.enquiry_hours(uuid, date, date), public.enquiries_by_day(uuid, date, date) from public, anon;
grant execute on function public.enquiry_hours(uuid, date, date), public.enquiries_by_day(uuid, date, date) to authenticated;
