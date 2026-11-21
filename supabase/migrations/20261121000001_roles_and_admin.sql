-- Этап 1: роли администратор / куратор / студент и админ-панель в приложении.

-- Роль "редактор" становится "куратором": редактирует каталог и (на следующих этапах)
-- ведёт чаты со студентами. Студент — любой пользователь без строки в admin_users.
alter type public.staff_role rename value 'editor' to 'curator';

-- Публичное хранилище фотографий и логотипов вузов: читают все, загружает персонал.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy catalog_images_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-images' and public.is_staff());
create policy catalog_images_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'catalog-images' and public.is_staff())
  with check (bucket_id = 'catalog-images' and public.is_staff());
create policy catalog_images_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-images' and public.is_staff());

-- Список пользователей для раздела «Сотрудники» (только администратор).
-- Роли меняются обычными запросами к admin_users — их защищают политики RLS.
create or replace function public.admin_list_users(search text default null)
returns table (user_id uuid, email text, full_name text, role public.staff_role, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select u.id, u.email::text, p.full_name, a.role, u.created_at
    from auth.users u
    left join public.student_profiles p on p.user_id = u.id
    left join public.admin_users a on a.user_id = u.id
    where search is null or search = ''
       or u.email ilike '%' || search || '%'
       or p.full_name ilike '%' || search || '%'
    order by (a.role is null), u.created_at desc
    limit 200;
end;
$$;
revoke all on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;

-- is_staff() ссылалась на старое имя роли — обновляем.
create or replace function public.is_staff() returns boolean
language sql stable set search_path = public
as $$ select private.has_staff_role(array['admin', 'curator']::public.staff_role[]); $$;
