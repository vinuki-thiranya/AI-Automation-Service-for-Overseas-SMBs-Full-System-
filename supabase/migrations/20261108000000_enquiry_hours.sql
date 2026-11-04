-- Dashboard heatmap: when enquiries arrive, by weekday and hour in the client's own timezone.
-- SECURITY INVOKER, so the messages_read policy applies (staff can see this; it carries no money).
-- Forward-only.
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

revoke execute on function public.enquiry_hours(uuid, date, date) from public, anon;
grant execute on function public.enquiry_hours(uuid, date, date) to authenticated;
