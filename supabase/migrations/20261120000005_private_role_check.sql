-- Проверка ролей переносится в схему private (не публикуется через Data API).
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.has_staff_role(roles public.staff_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.role = any (roles));
$$;
revoke all on function private.has_staff_role(public.staff_role[]) from public;
grant execute on function private.has_staff_role(public.staff_role[]) to anon, authenticated;

create or replace function public.is_staff() returns boolean
language sql stable set search_path = public
as $$ select private.has_staff_role(array['admin', 'editor']::public.staff_role[]); $$;

create or replace function public.is_admin() returns boolean
language sql stable set search_path = public
as $$ select private.has_staff_role(array['admin']::public.staff_role[]); $$;

revoke execute on function public.has_staff_role(public.staff_role[]) from public, anon, authenticated;
