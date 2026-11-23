-- Напоминания о дедлайнах: студент подписывается на сроки (колокольчик), сервер раз в день
-- создаёт уведомления за N дней до срока (уведомление → в приложении и push в установленной сборке).

-- Подписки студента на сроки.
create table public.deadline_subscriptions (
  user_id     uuid not null references auth.users (id) on delete cascade,
  deadline_id uuid not null references public.admission_deadlines (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, deadline_id)
);
create index deadline_subscriptions_deadline_idx on public.deadline_subscriptions (deadline_id);
alter table public.deadline_subscriptions enable row level security;
create policy deadline_subscriptions_owner on public.deadline_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Настройки: включены ли напоминания и за сколько дней.
alter table public.student_profiles add column if not exists reminders_enabled boolean not null default true;
alter table public.student_profiles add column if not exists reminder_days integer[] not null default '{14,7,3,1,0}'
  check (cardinality(reminder_days) <= 8 and reminder_days <@ array[0,1,2,3,5,7,14,30,60]);

-- Ключ напоминания защищает от повторов (одно напоминание на срок и порог).
alter table public.notifications add column if not exists reminder_key text check (char_length(reminder_key) <= 200);
create unique index if not exists notifications_reminder_key_idx on public.notifications (user_id, reminder_key) where reminder_key is not null;

-- «1 день», «3 дня», «7 дней».
create or replace function public.ru_days(n integer) returns text language sql immutable as $$
  select n || ' ' || case
    when n % 100 between 11 and 14 then 'дней'
    when n % 10 = 1 then 'день'
    when n % 10 between 2 and 4 then 'дня'
    else 'дней' end;
$$;

create or replace function public.reminder_title(days_left integer, what text) returns text language sql immutable as $$
  select case
    when days_left = 0 then 'Сегодня последний день: ' || what
    when days_left = 1 then 'Завтра срок: ' || what
    else 'Через ' || public.ru_days(days_left) || ': ' || what end;
$$;

/*
  Создаёт напоминания на дату p_today (по Риму). Для каждого срока выбирается ближайший порог,
  который ещё не наступил (например, при порогах 7/3/1 и 5 оставшихся днях — порог 7).
  Если порог уже отправлен, повторно не шлём; пропущенный запуск догоняется на следующий день.
*/
create or replace function public.send_deadline_reminders(p_today date default null, p_user uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  today date := coalesce(p_today, (now() at time zone 'Europe/Rome')::date);
  inserted integer := 0;
  n integer;
begin
  -- 1. Подписки на опубликованные сроки.
  with due as (
    select s.user_id, d.id as deadline_id, d.title_ru,
           ((d.ends_at at time zone d.timezone)::date - today) as days_left,
           (d.ends_at at time zone d.timezone)::date as due_date,
           coalesce(p.reminder_days, '{14,7,3,1,0}') as offsets,
           coalesce(pr.title_original || ' · ' || coalesce(u.name_ru, u.official_name), sc.name_ru) as target,
           case when pr.slug is not null then '/program/' || pr.slug
                when sc.slug is not null then '/scholarship/' || sc.slug end as link
    from public.deadline_subscriptions s
    join public.admission_deadlines d on d.id = s.deadline_id and d.status = 'published'
    left join public.student_profiles p on p.user_id = s.user_id
    left join public.degree_programs pr on pr.id = d.program_id
    left join public.universities u on u.id = pr.university_id
    left join public.scholarships sc on sc.id = d.scholarship_id
    where coalesce(p.reminders_enabled, true) and (p_user is null or s.user_id = p_user)
  ), picked as (
    select due.*, (select min(o) from unnest(due.offsets) o where o >= due.days_left) as threshold
    from due where due.days_left >= 0
  )
  insert into public.notifications (user_id, deadline_id, kind, title, body, link, send_at, sent_at, reminder_key)
  select user_id, deadline_id, 'deadline', left(public.reminder_title(days_left, title_ru), 200),
         left(coalesce(target || ' — ', '') || 'до ' || to_char(due_date, 'DD.MM.YYYY'), 500), link, now(), now(),
         'd:' || deadline_id || ':' || threshold
  from picked where threshold is not null
  on conflict (user_id, reminder_key) where reminder_key is not null do nothing;
  get diagnostics n = row_count; inserted := inserted + n;

  -- 2. Невыполненные задачи с датой в «Моих поступлениях».
  --    Задачу-срок не дублируем, если студент уже подписан на такой же срок программы.
  with due as (
    select t.user_id, t.id as task_id, t.title, t.application_id, t.due_date,
           (t.due_date - today) as days_left,
           coalesce(p.reminder_days, '{14,7,3,1,0}') as offsets
    from public.application_tasks t
    join public.student_applications a on a.id = t.application_id
    left join public.student_profiles p on p.user_id = t.user_id
    where not t.done and t.due_date is not null and coalesce(p.reminders_enabled, true)
      and (p_user is null or t.user_id = p_user)
      and not exists (
        select 1 from public.deadline_subscriptions s
        join public.admission_deadlines d on d.id = s.deadline_id
        where s.user_id = t.user_id and d.program_id = a.program_id
          and (d.ends_at at time zone d.timezone)::date = t.due_date and t.title like 'Срок:%')
  ), picked as (
    select due.*, (select min(o) from unnest(due.offsets) o where o >= due.days_left) as threshold
    from due where due.days_left >= 0
  )
  insert into public.notifications (user_id, kind, title, body, link, send_at, sent_at, reminder_key)
  select user_id, 'task', left(public.reminder_title(days_left, regexp_replace(title, '^Срок:\s*', '')), 200),
         'Задача в «Моих поступлениях» — до ' || to_char(due_date, 'DD.MM.YYYY'),
         '/application/' || application_id, now(), now(),
         't:' || task_id || ':' || due_date || ':' || threshold
  from picked where threshold is not null
  on conflict (user_id, reminder_key) where reminder_key is not null do nothing;
  get diagnostics n = row_count; inserted := inserted + n;

  return inserted;
end;
$$;
revoke execute on function public.send_deadline_reminders(date, uuid) from public, anon, authenticated;

-- Студент сразу получает напоминание, если срок уже близко (не ждать утра).
create or replace function public.remind_me_now() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return public.send_deadline_reminders(null, auth.uid());
end;
$$;
revoke execute on function public.remind_me_now() from public, anon;
grant execute on function public.remind_me_now() to authenticated;

-- Ежедневный запуск в 06:05 UTC (09:05 Москва, 08:05 Рим). Только в Supabase (pg_cron).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('deadline-reminders', '5 6 * * *', 'select public.send_deadline_reminders()');
  end if;
end $$;
