-- Этап «Личный кабинет»: отслеживание заявок студентов, доступ кураторов, история статусов.

-- Комментарий куратора, видимый студенту (студент изменить не может).
alter table public.student_applications add column if not exists curator_comment text check (char_length(curator_comment) <= 4000);
alter table public.student_applications add column if not exists curator_comment_at timestamptz;

-- История изменений статуса.
create table public.application_events (
  id             bigint generated always as identity primary key,
  application_id uuid not null references public.student_applications (id) on delete cascade,
  status         public.application_status not null,
  changed_by     uuid references auth.users (id) on delete set null,
  by_staff       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index application_events_app_idx on public.application_events (application_id, created_at desc);
alter table public.application_events enable row level security;

create or replace function public.log_application_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.application_events (application_id, status, changed_by, by_staff)
    values (new.id, new.status, auth.uid(), public.is_staff());
  end if;
  return new;
end;
$$;
revoke execute on function public.log_application_status() from public, anon, authenticated;
create trigger student_applications_status_log after insert or update on public.student_applications
  for each row execute function public.log_application_status();

-- Студент не может менять комментарий куратора; сотрудник не может менять заметки студента и владельца.
create or replace function public.guard_application_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_staff() and new.user_id is distinct from auth.uid() then
    new.user_id := old.user_id;
    new.program_id := old.program_id;
    new.notes := old.notes;
    if new.curator_comment is distinct from old.curator_comment then new.curator_comment_at := now(); end if;
  else
    new.curator_comment := old.curator_comment;
    new.curator_comment_at := old.curator_comment_at;
  end if;
  return new;
end;
$$;
create trigger student_applications_guard before update on public.student_applications
  for each row execute function public.guard_application_fields();

-- Задача всегда принадлежит владельцу заявки (даже если её добавил куратор).
create or replace function public.set_task_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select a.user_id into new.user_id from public.student_applications a where a.id = new.application_id;
  if new.user_id is null then raise exception 'application not found'; end if;
  return new;
end;
$$;
revoke execute on function public.set_task_owner() from public, anon, authenticated;
create trigger application_tasks_owner before insert or update on public.application_tasks
  for each row execute function public.set_task_owner();

-- RLS: сотрудники видят и ведут все заявки; студенты — только свои.
create policy student_applications_staff_select on public.student_applications for select to authenticated using (public.is_staff());
create policy student_applications_staff_update on public.student_applications for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

alter policy application_tasks_own_application on public.application_tasks
  using (public.is_staff() or exists (select 1 from public.student_applications a where a.id = application_id and a.user_id = auth.uid()))
  with check (public.is_staff() or exists (select 1 from public.student_applications a where a.id = application_id and a.user_id = auth.uid()));
create policy application_tasks_staff on public.application_tasks for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy application_events_read on public.application_events for select to authenticated
  using (public.is_staff() or exists (select 1 from public.student_applications a where a.id = application_id and a.user_id = auth.uid()));

create policy student_profiles_staff_select on public.student_profiles for select to authenticated using (public.is_staff());

-- Список заявок для сотрудников: с именем и почтой студента.
create or replace function public.staff_applications(p_id uuid default null)
returns table (
  id uuid, user_id uuid, email text, full_name text, country text, citizenship text,
  program_slug text, program_title text, university_name text, academic_year text,
  status public.application_status, curator_comment text, updated_at timestamptz, open_tasks bigint
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden';
  end if;
  return query
    select a.id, a.user_id, u.email::text, p.full_name, p.country, p.citizenship,
           dp.slug, dp.title_original, coalesce(un.name_ru, un.official_name), a.academic_year,
           a.status, a.curator_comment, a.updated_at,
           (select count(*) from public.application_tasks t where t.application_id = a.id and not t.done)
    from public.student_applications a
    join auth.users u on u.id = a.user_id
    left join public.student_profiles p on p.user_id = a.user_id
    join public.degree_programs dp on dp.id = a.program_id
    join public.universities un on un.id = dp.university_id
    where p_id is null or a.id = p_id
    order by a.updated_at desc
    limit 500;
end;
$$;
revoke all on function public.staff_applications(uuid) from public, anon;
grant execute on function public.staff_applications(uuid) to authenticated;
