-- UniItalia: приватное хранилище документов и удаление аккаунта.

-- Приватный bucket для документов студентов: 10 МБ, только PDF/JPEG/PNG/HEIC.
-- Выполняется только в Supabase (где есть схема storage).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('student-documents', 'student-documents', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'])
    on conflict (id) do nothing;

    -- Файл лежит по пути "<user_id>/<имя>"; доступ только владельцу.
    execute $p$create policy student_documents_owner_read on storage.objects for select to authenticated
      using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy student_documents_owner_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy student_documents_owner_update on storage.objects for update to authenticated
      using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy student_documents_owner_delete on storage.objects for delete to authenticated
      using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- Удаление собственного аккаунта (GDPR). Все личные таблицы ссылаются на
-- auth.users с ON DELETE CASCADE, поэтому удаляются вместе с пользователем.
-- Файлы в Storage удаляет клиент до вызова этой функции.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Экспорт собственных данных (GDPR): одним JSON.
create or replace function public.export_my_data()
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'profile',            (select to_jsonb(p) from public.student_profiles p where p.user_id = auth.uid()),
    'saved_universities', coalesce((select jsonb_agg(s) from public.saved_universities s where s.user_id = auth.uid()), '[]'),
    'saved_programs',     coalesce((select jsonb_agg(s) from public.saved_programs s where s.user_id = auth.uid()), '[]'),
    'applications',       coalesce((select jsonb_agg(a) from public.student_applications a where a.user_id = auth.uid()), '[]'),
    'documents',          coalesce((select jsonb_agg(d) from public.student_documents d where d.user_id = auth.uid()), '[]')
  );
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
