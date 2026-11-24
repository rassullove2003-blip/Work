-- Автосинхронизация с Google Таблицей: раз в день Edge Function sheets-sync читает таблицы
-- с включённой автосинхронизацией и загружает изменения (при ошибках — ничего не меняет).
alter table public.import_sources add column if not exists auto_sync boolean not null default false;
alter table public.import_sources add column if not exists last_auto_at timestamptz;
alter table public.import_sources add column if not exists last_auto_status text check (last_auto_status in ('ok', 'unchanged', 'failed'));
alter table public.import_sources add column if not exists last_auto_message text check (char_length(last_auto_message) <= 500);
alter table public.import_sources add column if not exists last_auto_hash text;

-- Сверка секрета для вызова функции (сам секрет — в Vault под именем sheets_sync_secret).
create or replace function public.check_sync_secret(p_secret text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('vault.decrypted_secrets') is null or coalesce(p_secret, '') = '' then return false; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'sheets_sync_secret' and decrypted_secret = p_secret);
end;
$$;
revoke execute on function public.check_sync_secret(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.check_sync_secret(text) to service_role;
  end if;
end $$;

-- Ежедневный запуск в 05:35 UTC — до утренних напоминаний (06:05), чтобы новые сроки сразу попадали в них.
-- Адрес проекта и секрет берутся из Vault (project_url, sheets_sync_secret) и не хранятся в репозитории.
create or replace function public.run_sheets_sync() returns bigint
language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'sheets_sync_secret';
  if url is null or secret is null or to_regnamespace('net') is null then return null; end if;
  if not exists (select 1 from public.import_sources where auto_sync) then return 0; end if;
  return net.http_post(
    url := url || '/functions/v1/sheets-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$$;
revoke execute on function public.run_sheets_sync() from public, anon, authenticated;

do $$ begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('sheets-sync', '35 5 * * *', 'select public.run_sheets_sync()');
  end if;
end $$;
