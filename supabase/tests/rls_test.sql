-- Проверки RLS. Любая неудача прерывает выполнение (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on

-- Пользователи: студент A, студент B, редактор, админ.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', '{"full_name":"Студент А"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000ed', 'editor@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local', '{}');
insert into public.admin_users (user_id, role) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin'),
  ('00000000-0000-0000-0000-0000000000ed', 'curator');
insert into public.degree_programs (slug, university_id, title_original, level, language, status)
  select 'draft-program', id, 'Draft Program', 'bachelor', 'en', 'draft' from public.universities where slug = 'unibo';

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok  %', msg;
end $$;

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '', false);
    execute 'set role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
    execute 'set role authenticated';
  end if;
end $$;

create function pg_temp.expect_error(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok  %', msg; return; end;
  raise exception 'FAIL: %', msg;
end $$;

-- Триггер профиля
select pg_temp.check((select full_name from public.student_profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 'Студент А', 'профиль создаётся при регистрации');

-- Гость -----------------------------------------------------------------------
select pg_temp.as_user(null);
select pg_temp.check((select count(*) from public.universities) = 40, 'гость видит 40 опубликованных университетов');
select pg_temp.check((select count(*) from public.degree_programs where slug = 'draft-program') = 0, 'гость не видит черновики');
select pg_temp.check((select count(*) from public.program_catalog) = 25, 'гость видит 25 программ в program_catalog');
select pg_temp.check((select count(*) from public.scholarships) = 15, 'гость видит 15 стипендий');
do $$ begin
  begin
    update public.universities set official_name = 'hacked' where slug = 'unibo';
  exception when others then null; end;
end $$;
select pg_temp.check((select official_name from public.universities where slug = 'unibo') <> 'hacked', 'гость не может редактировать каталог');
insert into public.consultation_requests (name, contact, consent) values ('Гость', '+7 700 000 00 00', true);
select pg_temp.check(true, 'гость может оставить заявку на консультацию с согласием');
do $$ begin
  insert into public.consultation_requests (name, contact, consent) values ('Гость', 'x@y.z', false);
  raise exception 'FAIL: заявка без согласия принята';
exception when check_violation or insufficient_privilege then raise notice 'ok  заявка без согласия отклонена'; end $$;

-- Студент A -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.saved_universities (user_id, university_id) select auth.uid(), id from public.universities where slug = 'polimi';
insert into public.saved_programs (user_id, program_id) select auth.uid(), id from public.degree_programs where slug = 'polimi-cse';
select pg_temp.check((select count(*) from public.saved_universities) = 1, 'студент A сохраняет университет');
do $$ begin
  insert into public.saved_universities (user_id, university_id)
    select '00000000-0000-0000-0000-00000000000b', id from public.universities where slug = 'unibo';
  raise exception 'FAIL: A сохранил избранное за B';
exception when insufficient_privilege then raise notice 'ok  A не может писать в избранное B'; end $$;
do $$ begin
  insert into public.admin_users (user_id, role) values (auth.uid(), 'admin');
  raise exception 'FAIL: студент выдал себе роль admin';
exception when insufficient_privilege then raise notice 'ok  студент не может выдать себе роль'; end $$;
update public.student_profiles set country = 'Казахстан' where user_id = auth.uid();
select pg_temp.check((select country from public.student_profiles) = 'Казахстан', 'студент меняет свой профиль');
select pg_temp.check((select count(*) from public.consultation_requests) = 0, 'студент не видит чужие заявки');
select pg_temp.check((select count(*) from public.audit_logs) = 0, 'студент не видит журнал');
select pg_temp.check((select public.export_my_data() -> 'saved_programs' ->> 0) is not null, 'экспорт своих данных работает');

-- Студент B -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.saved_universities) = 0, 'B не видит избранное A');
select pg_temp.check((select count(*) from public.student_profiles) = 1, 'B видит только свой профиль');
update public.student_profiles set country = 'hack' where user_id = '00000000-0000-0000-0000-00000000000a';
delete from public.saved_programs;

-- Куратор --------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ed');
select pg_temp.check((select count(*) from public.degree_programs where slug = 'draft-program') = 1, 'куратор видит черновики');
update public.universities set description_ru = 'Обновлено куратором' where slug = 'unibo';
select pg_temp.check((select last_edited_by from public.universities where slug = 'unibo') = auth.uid(), 'last_edited_by проставляется автоматически');
do $$ begin
  update public.universities set verification_status = 'verified' where slug = 'unibo';
  raise exception 'FAIL: verified без даты проверки';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok  статус verified требует source_url и verified_at';
end $$;
delete from public.universities where slug = 'unibo';
select pg_temp.check((select count(*) from public.universities where slug = 'unibo') = 1, 'куратор не может удалять университеты');
select pg_temp.check((select count(*) from public.consultation_requests) = 1, 'куратор видит заявки на консультацию');

-- Админ -----------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select pg_temp.check((select count(*) from public.audit_logs where table_name = 'universities' and action = 'UPDATE') >= 1, 'изменения пишутся в журнал');
delete from public.degree_programs where slug = 'draft-program';
select pg_temp.check((select count(*) from public.degree_programs where slug = 'draft-program') = 0, 'админ может удалять');


-- Этап 1: фото каталога и список пользователей
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ed');
insert into storage.objects (bucket_id, name) values ('catalog-images', 'universities/unibo/photo.jpg');
select pg_temp.check(true, 'куратор загружает фото вуза');
do $$ begin
  perform public.admin_list_users(null);
  raise exception 'FAIL: куратор видит список пользователей';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok  куратор не видит список пользователей';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('catalog-images', 'universities/hack.jpg');
  raise exception 'FAIL: студент загрузил фото каталога';
exception when insufficient_privilege then raise notice 'ok  студент не может загружать фото каталога'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select pg_temp.check((select count(*) from public.admin_list_users(null)) >= 3, 'администратор видит список пользователей');
insert into public.admin_users (user_id, role) values ('00000000-0000-0000-0000-00000000000b', 'curator');
select pg_temp.check((select role from public.admin_users where user_id = '00000000-0000-0000-0000-00000000000b') = 'curator', 'администратор назначает куратора');
delete from public.admin_users where user_id = '00000000-0000-0000-0000-00000000000b';
reset role;

-- Итог: проверки от лица суперпользователя
reset role;
select pg_temp.check((select country from public.student_profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 'Казахстан', 'B не изменил профиль A');
select pg_temp.check((select count(*) from public.saved_programs) = 1, 'B не удалил избранное A');


-- Личный кабинет: заявки и задачи
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.student_applications (user_id, program_id, academic_year)
  select auth.uid(), id, '2027/2028' from public.degree_programs where slug = 'unibo-economics-finance';
insert into public.application_tasks (application_id, title) select id, 'Подготовить IELTS' from public.student_applications;
update public.student_applications set status = 'collecting_documents', notes = 'моя заметка', curator_comment = 'подделка';
select pg_temp.check((select curator_comment from public.student_applications) is null, 'студент не может писать комментарий куратора');
select pg_temp.check((select count(*) from public.application_events) = 2, 'история статусов ведётся');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.student_applications) = 0, 'другой студент не видит чужие заявки');
reset role;
insert into public.admin_users (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'curator');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.staff_applications(null)) = 1, 'куратор видит заявки студентов');
update public.student_applications set status = 'documents_ready', curator_comment = 'Добавьте перевод аттестата', notes = 'взлом';
insert into public.application_tasks (application_id, title) select id, 'Перевести аттестат' from public.student_applications;
reset role;
select pg_temp.check((select notes from public.student_applications) = 'моя заметка', 'куратор не меняет заметки студента');
select pg_temp.check((select curator_comment from public.student_applications) = 'Добавьте перевод аттестата', 'куратор пишет комментарий');
select pg_temp.check((select count(*) from public.application_tasks where user_id = '00000000-0000-0000-0000-00000000000b') = 2, 'задача куратора принадлежит студенту');
select pg_temp.check((select by_staff from public.application_events order by id desc limit 1), 'смена статуса куратором отмечена в истории');
select pg_temp.check((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b' and kind in ('status', 'comment')) = 2, 'студент получил уведомления об этапе и комментарии');

-- Чат и документы
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.chat_messages (student_id, body, from_staff) values (auth.uid(), 'Здравствуйте, вопрос по визе', true);
select pg_temp.check((select from_staff from public.chat_messages) = false, 'студент не может выдать себя за куратора');
select pg_temp.check((select last_message_preview from public.chat_threads) = 'Здравствуйте, вопрос по визе', 'ветка чата создаётся');
insert into public.student_documents (user_id, category, title, status, storage_path, file_name, mime_type, size_bytes)
  values (auth.uid(), 'passport', 'Паспорт', 'ready', auth.uid() || '/passport.pdf', 'passport.pdf', 'application/pdf', 1000);
select pg_temp.check((select status::text from public.student_documents) = 'uploaded', 'студент не может сам принять документ');
update public.student_documents set status = 'ready', staff_comment = 'подделка';
select pg_temp.check((select status::text from public.student_documents) = 'uploaded' and (select staff_comment from public.student_documents) is null, 'студент не меняет статус проверки');
reset role;
select pg_temp.check((select count(*) from public.notifications where kind = 'chat' and user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'куратор получил уведомление о сообщении');
delete from public.admin_users where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.chat_messages) = 0, 'чужой студент не видит чат');
select pg_temp.check((select count(*) from public.student_documents) = 0, 'чужой студент не видит документы');
select pg_temp.expect_error($$insert into public.chat_messages (student_id, body) values ('00000000-0000-0000-0000-00000000000b', 'спам')$$, 'чужой студент не пишет в чужой чат');
reset role;
insert into public.admin_users (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'curator');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.staff_chats()) = 1, 'куратор видит список чатов');
select pg_temp.check((select unread from public.staff_chats()), 'новое сообщение студента отмечено непрочитанным');
insert into public.chat_messages (student_id, body) values ('00000000-0000-0000-0000-00000000000b', 'Ответ куратора');
update public.student_documents set status = 'needs_changes', staff_comment = 'Нужен разворот с фото', file_name = 'взлом';
select pg_temp.check((select count(*) from public.staff_documents(null)) = 1, 'куратор видит документы студентов');
reset role;
select pg_temp.check((select from_staff from public.chat_messages where body = 'Ответ куратора'), 'ответ куратора помечен');
select pg_temp.check((select file_name from public.student_documents) = 'passport.pdf' and (select status::text from public.student_documents) = 'needs_changes', 'куратор меняет только статус документа');
select pg_temp.check((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b' and kind in ('chat', 'document')) = 2, 'студент получил уведомления о сообщении и проверке');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.mark_chat_read();
select public.mark_notifications_read();
select pg_temp.check((select count(*) from public.notifications where read_at is null) = 0, 'уведомления отмечаются прочитанными');
reset role;
delete from public.admin_users where user_id = '00000000-0000-0000-0000-00000000000a';

-- Удаление аккаунта каскадно удаляет личные данные
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.delete_my_account();
reset role;
select pg_temp.check((select count(*) from public.saved_universities) = 0 and (select count(*) from public.student_profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'удаление аккаунта удаляет личные данные');
\echo 'ВСЕ ПРОВЕРКИ RLS ПРОЙДЕНЫ'
