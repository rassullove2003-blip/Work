-- Этап «Документы и чаты»: личный чат студента с кураторами, проверка документов, уведомления в приложении.

-- ─── Уведомления ────────────────────────────────────────────────────────────────
alter table public.notifications alter column send_at set default now();
alter table public.notifications add column if not exists kind text not null default 'deadline'
  check (kind in ('deadline', 'chat', 'status', 'comment', 'document', 'task'));
alter table public.notifications add column if not exists link text check (char_length(link) <= 300);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Доступ к уведомлениям — политика notifications_owner (только свои строки). Чужим уведомления создают только триггеры сервера.

create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link, send_at)
  values (p_user, p_kind, left(p_title, 200), left(p_body, 500), p_link, now());
$$;
revoke execute on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.mark_notifications_read() returns void
language sql security invoker set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- ─── Push-токены устройств (заработают в установленной сборке приложения) ──────────
create table if not exists public.push_tokens (
  token      text primary key check (char_length(token) between 10 and 300),
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create policy push_tokens_owner on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Отправка push через сервис Expo (без ключей; при отсутствии pg_net — тихо пропускаем).
create or replace function public.send_push_for_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare msgs jsonb;
begin
  if to_regnamespace('net') is null then return new; end if;
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', new.title, 'body', coalesce(new.body, ''), 'sound', 'default',
                                      'data', jsonb_build_object('link', new.link)))
    into msgs from public.push_tokens t where t.user_id = new.user_id;
  if msgs is null then return new; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send', msgs, '{"Content-Type": "application/json"}'::jsonb;
  return new;
exception when others then
  return new; -- сбой push не должен мешать основной операции
end;
$$;
revoke execute on function public.send_push_for_notification() from public, anon, authenticated;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.send_push_for_notification();

-- ─── Чат студента с командой кураторов ─────────────────────────────────────────────
create table public.chat_threads (
  student_id           uuid primary key references auth.users (id) on delete cascade,
  last_message_at      timestamptz,
  last_message_preview text,
  last_from_staff      boolean,
  student_read_at      timestamptz,
  staff_read_at        timestamptz,
  created_at           timestamptz not null default now()
);
alter table public.chat_threads enable row level security;
create policy chat_threads_read on public.chat_threads for select to authenticated
  using (student_id = auth.uid() or public.is_staff());

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references auth.users (id) on delete cascade,
  sender_id       uuid references auth.users (id) on delete set null default auth.uid(),
  from_staff      boolean not null default false,
  body            text check (char_length(body) <= 4000),
  attachment_path text check (char_length(attachment_path) <= 400),
  attachment_name text check (char_length(attachment_name) <= 200),
  attachment_mime text check (char_length(attachment_mime) <= 100),
  attachment_size integer check (attachment_size between 1 and 10485760),
  created_at      timestamptz not null default now(),
  check (coalesce(char_length(trim(body)), 0) > 0 or attachment_path is not null),
  check (attachment_path is null or attachment_path like student_id::text || '/%')
);
create index chat_messages_thread_idx on public.chat_messages (student_id, created_at);
alter table public.chat_messages enable row level security;

create policy chat_messages_read on public.chat_messages for select to authenticated
  using (student_id = auth.uid() or public.is_staff());
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and (student_id = auth.uid() or public.is_staff()));

-- Перед вставкой: отправитель и признак «от сотрудника» проставляет сервер.
create or replace function public.prepare_chat_message() returns trigger
language plpgsql set search_path = public as $$
begin
  new.sender_id := auth.uid();
  new.from_staff := new.student_id is distinct from auth.uid() and public.is_staff();
  new.created_at := now();
  return new;
end;
$$;
create trigger chat_messages_prepare before insert on public.chat_messages
  for each row execute function public.prepare_chat_message();

-- После вставки: обновляем ветку и создаём уведомления.
create or replace function public.after_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare preview text := coalesce(nullif(left(trim(new.body), 140), ''), '📎 ' || coalesce(new.attachment_name, 'Файл'));
        staff record; sname text;
begin
  insert into public.chat_threads as t (student_id, last_message_at, last_message_preview, last_from_staff, student_read_at, staff_read_at)
  values (new.student_id, new.created_at, preview, new.from_staff,
          case when new.from_staff then null else new.created_at end,
          case when new.from_staff then new.created_at else null end)
  on conflict (student_id) do update set
    last_message_at = excluded.last_message_at,
    last_message_preview = excluded.last_message_preview,
    last_from_staff = excluded.last_from_staff,
    student_read_at = case when new.from_staff then t.student_read_at else new.created_at end,
    staff_read_at = case when new.from_staff then new.created_at else t.staff_read_at end;

  if new.from_staff then
    perform public.notify_user(new.student_id, 'chat', 'Новое сообщение от куратора', preview, '/chat');
  else
    select coalesce(nullif(p.full_name, ''), u.email) into sname
      from auth.users u left join public.student_profiles p on p.user_id = u.id where u.id = new.student_id;
    for staff in select user_id from public.admin_users loop
      perform public.notify_user(staff.user_id, 'chat', 'Сообщение от студента: ' || coalesce(sname, ''), preview,
                                 '/admin/chat/' || new.student_id);
    end loop;
  end if;
  return new;
end;
$$;
revoke execute on function public.after_chat_message() from public, anon, authenticated;
create trigger chat_messages_after after insert on public.chat_messages
  for each row execute function public.after_chat_message();

-- Отметить чат прочитанным (студент — свой; сотрудник — чат студента).
create or replace function public.mark_chat_read(p_student uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := coalesce(p_student, auth.uid());
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if sid = auth.uid() then
    update public.chat_threads set student_read_at = now() where student_id = sid;
    update public.notifications set read_at = now() where user_id = auth.uid() and kind = 'chat' and read_at is null;
  elsif public.is_staff() then
    update public.chat_threads set staff_read_at = now() where student_id = sid;
    update public.notifications set read_at = now()
      where user_id = auth.uid() and kind = 'chat' and link = '/admin/chat/' || sid and read_at is null;
  else
    raise exception 'permission denied';
  end if;
end;
$$;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- Список чатов для сотрудников.
create or replace function public.staff_chats()
returns table (student_id uuid, email text, full_name text, last_message_at timestamptz, last_message_preview text,
               last_from_staff boolean, unread boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_staff() then raise exception 'permission denied'; end if;
  return query
    select t.student_id, u.email::text, p.full_name, t.last_message_at, t.last_message_preview, t.last_from_staff,
           (not t.last_from_staff and (t.staff_read_at is null or t.staff_read_at < t.last_message_at))
    from public.chat_threads t
    join auth.users u on u.id = t.student_id
    left join public.student_profiles p on p.user_id = t.student_id
    order by t.last_message_at desc nulls last;
end;
$$;
revoke execute on function public.staff_chats() from public, anon;
grant execute on function public.staff_chats() to authenticated;

-- ─── Документы студента: проверка куратором ─────────────────────────────────────
alter type public.document_status add value if not exists 'needs_changes';
alter table public.student_documents add column if not exists title text check (char_length(title) <= 200);
alter table public.student_documents add column if not exists application_id uuid references public.student_applications (id) on delete set null;
alter table public.student_documents add column if not exists staff_comment text check (char_length(staff_comment) <= 2000);
alter table public.student_documents add column if not exists reviewed_at timestamptz;
alter table public.student_documents add column if not exists reviewed_by uuid references auth.users (id) on delete set null;
create index if not exists student_documents_user_idx on public.student_documents (user_id, created_at desc);

create policy student_documents_staff_select on public.student_documents for select to authenticated using (public.is_staff());
create policy student_documents_staff_update on public.student_documents for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Студент не может сам поставить «принят»; сотрудник меняет только статус и комментарий.
create or replace function public.guard_document_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and public.is_staff() and old.user_id is distinct from auth.uid() then
    new.user_id := old.user_id; new.category := old.category; new.title := old.title;
    new.storage_path := old.storage_path; new.file_name := old.file_name; new.mime_type := old.mime_type;
    new.size_bytes := old.size_bytes; new.application_id := old.application_id;
    if new.status is distinct from old.status or new.staff_comment is distinct from old.staff_comment then
      new.reviewed_at := now(); new.reviewed_by := auth.uid();
    end if;
  elsif tg_op = 'INSERT' then
    new.status := 'uploaded'; new.staff_comment := null; new.reviewed_at := null; new.reviewed_by := null;
  else
    new.staff_comment := old.staff_comment; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
    -- новый файл → снова на проверку; иначе статус меняет только куратор
    new.status := case when new.storage_path is distinct from old.storage_path then 'uploaded' else old.status end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger student_documents_guard before insert or update on public.student_documents
  for each row execute function public.guard_document_fields();

create or replace function public.notify_document_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare label text;
begin
  if new.reviewed_at is distinct from old.reviewed_at and new.reviewed_by is not null and new.reviewed_by <> new.user_id then
    label := case new.status::text
      when 'ready' then 'принят' when 'needs_changes' then 'нужно исправить'
      when 'needs_translation' then 'нужен перевод' when 'check_apostille' then 'проверьте апостиль'
      else 'на проверке' end;
    perform public.notify_user(new.user_id, 'document', 'Документ проверен: ' || label,
                               coalesce(new.title, new.file_name, 'Документ') || coalesce(' — ' || new.staff_comment, ''), '/documents');
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_document_review() from public, anon, authenticated;
create trigger student_documents_notify after update on public.student_documents
  for each row execute function public.notify_document_review();

-- Список документов «на проверке» для сотрудников.
create or replace function public.staff_documents(p_student uuid default null)
returns table (id uuid, user_id uuid, email text, full_name text, category text, title text, status text, file_name text,
               mime_type text, size_bytes integer, storage_path text, staff_comment text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_staff() then raise exception 'permission denied'; end if;
  return query
    select d.id, d.user_id, u.email::text, p.full_name, d.category, d.title, d.status::text, d.file_name, d.mime_type,
           d.size_bytes, d.storage_path, d.staff_comment, d.created_at, d.updated_at
    from public.student_documents d
    join auth.users u on u.id = d.user_id
    left join public.student_profiles p on p.user_id = d.user_id
    where p_student is null or d.user_id = p_student
    order by d.updated_at desc;
end;
$$;
revoke execute on function public.staff_documents(uuid) from public, anon;
grant execute on function public.staff_documents(uuid) to authenticated;

-- ─── Уведомления о действиях куратора в заявке ──────────────────────────────────
create or replace function public.notify_application_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() = new.user_id then return new; end if;
  if new.status is distinct from old.status then
    perform public.notify_user(new.user_id, 'status', 'Куратор обновил этап поступления', null, '/application/' || new.id);
  end if;
  if new.curator_comment is distinct from old.curator_comment and coalesce(new.curator_comment, '') <> '' then
    perform public.notify_user(new.user_id, 'comment', 'Новый комментарий куратора', left(new.curator_comment, 300), '/application/' || new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_application_change() from public, anon, authenticated;
create trigger student_applications_notify after update on public.student_applications
  for each row execute function public.notify_application_change();

-- ─── Экспорт данных: + чат ─────────────────────────────────────────────────────────
create or replace function public.export_my_data()
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'profile',            (select to_jsonb(p) from public.student_profiles p where p.user_id = auth.uid()),
    'saved_universities', coalesce((select jsonb_agg(s) from public.saved_universities s where s.user_id = auth.uid()), '[]'),
    'saved_programs',     coalesce((select jsonb_agg(s) from public.saved_programs s where s.user_id = auth.uid()), '[]'),
    'applications',       coalesce((select jsonb_agg(a) from public.student_applications a where a.user_id = auth.uid()), '[]'),
    'documents',          coalesce((select jsonb_agg(d) from public.student_documents d where d.user_id = auth.uid()), '[]'),
    'chat_messages',      coalesce((select jsonb_agg(m order by m.created_at) from public.chat_messages m where m.student_id = auth.uid()), '[]'),
    'notifications',      coalesce((select jsonb_agg(n) from public.notifications n where n.user_id = auth.uid()), '[]')
  );
$$;

-- ─── Хранилище: вложения чата и доступ кураторов к документам ────────────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat-attachments', 'chat-attachments', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp',
                  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    on conflict (id) do nothing;

    execute $p$create policy chat_attachments_read on storage.objects for select to authenticated
      using (bucket_id = 'chat-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()))$p$;
    execute $p$create policy chat_attachments_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'chat-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()))$p$;
    execute $p$create policy chat_attachments_owner_delete on storage.objects for delete to authenticated
      using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy student_documents_staff_read on storage.objects for select to authenticated
      using (bucket_id = 'student-documents' and public.is_staff())$p$;
  end if;
end $$;

-- ─── Realtime: новые сообщения и уведомления приходят мгновенно ────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages, public.notifications, public.chat_threads;
  end if;
end $$;

-- Расширение для отправки push (есть в Supabase; локально может отсутствовать).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net schema extensions;
  end if;
end $$;
