-- Сборки Edge Functions (подключаются при развёртывании по адресу с отпечатком содержимого).
-- Чтение публичное (это код, не данные), запись — только администратору.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('edge-code', 'edge-code', true, 2097152, array['text/javascript', 'application/javascript'])
    on conflict (id) do nothing;
    execute $p$create policy edge_code_admin_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'edge-code' and public.is_admin())$p$;
  end if;
end $$;
