-- UniItalia: Row Level Security.
-- Принципы:
--  * каталог читают все (включая гостей), но только опубликованные записи;
--    персонал (admin/editor) видит черновики и редактирует;
--  * удалять записи каталога и управлять ролями может только admin;
--  * личные данные студента доступны только владельцу;
--  * журнал изменений читает только admin, пишет только триггер.

alter table public.admin_users            enable row level security;
alter table public.student_profiles       enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.universities           enable row level security;
alter table public.university_images      enable row level security;
alter table public.faculties              enable row level security;
alter table public.degree_programs        enable row level security;
alter table public.program_editions       enable row level security;
alter table public.program_curricula      enable row level security;
alter table public.entrance_exams         enable row level security;
alter table public.admission_requirements enable row level security;
alter table public.scholarships           enable row level security;
alter table public.scholarship_eligibility enable row level security;
alter table public.university_scholarships enable row level security;
alter table public.admission_deadlines    enable row level security;
alter table public.verified_sources       enable row level security;
alter table public.saved_universities     enable row level security;
alter table public.saved_programs         enable row level security;
alter table public.university_comparisons enable row level security;
alter table public.student_applications   enable row level security;
alter table public.application_tasks      enable row level security;
alter table public.student_documents      enable row level security;
alter table public.notifications          enable row level security;
alter table public.consultation_requests  enable row level security;

-- Роли персонала -------------------------------------------------------------
create policy admin_users_select on public.admin_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy admin_users_insert on public.admin_users for insert to authenticated
  with check (public.is_admin());
create policy admin_users_update on public.admin_users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_users_delete on public.admin_users for delete to authenticated
  using (public.is_admin());

-- Журнал ---------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_admin());

-- Профиль --------------------------------------------------------------------
create policy profiles_select_own on public.student_profiles for select to authenticated
  using (user_id = auth.uid());
create policy profiles_insert_own on public.student_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy profiles_update_own on public.student_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete_own on public.student_profiles for delete to authenticated
  using (user_id = auth.uid());

-- Каталог (таблицы со status) ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'universities', 'faculties', 'degree_programs', 'program_editions', 'program_curricula', 'entrance_exams',
    'admission_requirements', 'scholarships', 'scholarship_eligibility', 'admission_deadlines'
  ] loop
    execute format($f$create policy %1$s_public_read on public.%1$I for select to anon, authenticated
      using (status = 'published' or public.is_staff())$f$, t);
    execute format($f$create policy %1$s_staff_insert on public.%1$I for insert to authenticated
      with check (public.is_staff())$f$, t);
    execute format($f$create policy %1$s_staff_update on public.%1$I for update to authenticated
      using (public.is_staff()) with check (public.is_staff())$f$, t);
    execute format($f$create policy %1$s_admin_delete on public.%1$I for delete to authenticated
      using (public.is_admin())$f$, t);
  end loop;
end $$;

-- Каталог (связующие таблицы без status) ---------------------------------------
create policy university_images_read on public.university_images for select to anon, authenticated using (true);
create policy university_images_write on public.university_images for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy university_scholarships_read on public.university_scholarships for select to anon, authenticated using (true);
create policy university_scholarships_write on public.university_scholarships for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy verified_sources_read on public.verified_sources for select to anon, authenticated using (true);
create policy verified_sources_write on public.verified_sources for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Личные таблицы: только владелец ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'saved_universities', 'saved_programs', 'university_comparisons', 'student_applications',
    'application_tasks', 'student_documents', 'notifications'
  ] loop
    execute format($f$create policy %1$s_owner on public.%1$I for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid())$f$, t);
  end loop;
end $$;

-- Задача может ссылаться только на собственное поступление.
create policy application_tasks_own_application on public.application_tasks as restrictive for all to authenticated
  using (exists (select 1 from public.student_applications a where a.id = application_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.student_applications a where a.id = application_id and a.user_id = auth.uid()));

-- Заявки на консультацию ---------------------------------------------------------
create policy consultation_insert on public.consultation_requests for insert to anon, authenticated
  with check (consent and status = 'new' and (user_id is null or user_id = auth.uid()));
create policy consultation_select on public.consultation_requests for select to authenticated
  using (public.is_staff() or user_id = auth.uid());
create policy consultation_update on public.consultation_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy consultation_delete on public.consultation_requests for delete to authenticated
  using (public.is_admin());

-- Права на объекты (в Supabase anon/authenticated уже имеют их по умолчанию;
-- явно отзываем всё лишнее для журнала и ролей).
revoke insert, update, delete on public.audit_logs from anon, authenticated;
revoke all on public.admin_users from anon;
