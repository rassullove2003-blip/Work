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

-- Удаление аккаунта каскадно удаляет личные данные
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.delete_my_account();
reset role;
select pg_temp.check((select count(*) from public.saved_universities) = 0 and (select count(*) from public.student_profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'удаление аккаунта удаляет личные данные');
\echo 'ВСЕ ПРОВЕРКИ RLS ПРОЙДЕНЫ'
