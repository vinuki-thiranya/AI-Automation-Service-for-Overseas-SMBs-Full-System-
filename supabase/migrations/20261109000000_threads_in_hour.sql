-- Dashboard: the conversations behind one heatmap cell (a weekday and hour) or one weekday, in the client's
-- own timezone. Uses the same rule as enquiry_hours, so a cell's count matches the threads listed: a thread
-- belongs to a cell when one of its inbound customer messages falls in that local weekday/hour.
-- SECURITY INVOKER, so threads_read and messages_read apply (staff of another client get nothing).
-- Forward-only.

create or replace function public.threads_in_hour(
  p_client uuid, p_from date, p_to date, p_dow integer, p_hour integer default null,
  p_limit integer default 40, p_before timestamptz default null
)
returns table (thread_id uuid, last_message_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.last_message_at
  from public.threads t
  where t.client_id = p_client
    and (p_before is null or t.last_message_at < p_before)
    and exists (
      select 1
      from public.messages m
      join public.clients c on c.id = m.client_id
      where m.thread_id = t.id and m.client_id = p_client
        and m.direction = 'inbound' and m.author = 'customer'
        and (m.created_at at time zone c.timezone)::date between p_from and p_to
        and extract(isodow from m.created_at at time zone c.timezone) = p_dow
        and (p_hour is null or extract(hour from m.created_at at time zone c.timezone) = p_hour)
    )
  order by t.last_message_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

revoke execute on function public.threads_in_hour(uuid, date, date, integer, integer, integer, timestamptz) from public, anon;
grant execute on function public.threads_in_hour(uuid, date, date, integer, integer, integer, timestamptz) to authenticated;
