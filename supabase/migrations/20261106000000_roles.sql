-- Service-role RPCs for managing dashboard access. app.user_roles isn't exposed through the API
-- (only `public` is), so provisioning, the integration tests and the Phase 3 dashboard invite flow use these.

create or replace function public.assign_client_role(p_user_id uuid, p_client_slug text, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
begin
  if p_role not in ('owner', 'staff') then
    raise exception 'role must be owner or staff (agency is assigned with assign_agency_role)';
  end if;
  select id into v_client from public.clients where slug = p_client_slug;
  if v_client is null then
    raise exception 'unknown client %', p_client_slug;
  end if;
  insert into app.user_roles (user_id, client_id, role) values (p_user_id, v_client, p_role)
  on conflict do nothing;
end;
$$;

create or replace function public.assign_agency_role(p_user_id uuid)
returns void
language sql security definer set search_path = '' as $$
  insert into app.user_roles (user_id, client_id, role) values (p_user_id, null, 'agency') on conflict do nothing;
$$;

create or replace function public.revoke_client_roles(p_user_id uuid, p_client_slug text)
returns integer
language sql security definer set search_path = '' as $$
  with gone as (
    delete from app.user_roles r using public.clients c
    where r.user_id = p_user_id and r.client_id = c.id and c.slug = p_client_slug
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke execute on function public.assign_client_role(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.assign_agency_role(uuid) from public, anon, authenticated;
revoke execute on function public.revoke_client_roles(uuid, text) from public, anon, authenticated;
grant execute on function public.assign_client_role(uuid, text, text) to service_role;
grant execute on function public.assign_agency_role(uuid) to service_role;
grant execute on function public.revoke_client_roles(uuid, text) to service_role;
