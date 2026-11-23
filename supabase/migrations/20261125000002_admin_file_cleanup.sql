-- Администратор может удалять файлы студентов (очистка по запросу, удалённые аккаунты).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $p$create policy student_files_admin_delete on storage.objects for delete to authenticated
      using (bucket_id in ('student-documents', 'chat-attachments') and public.is_admin())$p$;
  end if;
end $$;
