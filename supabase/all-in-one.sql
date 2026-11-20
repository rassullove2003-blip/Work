-- UniItalia: все миграции + демо-данные одним файлом. Вставьте целиком в Supabase → SQL Editor → Run.
-- Выполнять один раз на новом проекте.

-- ===== 20261120000001_core_schema.sql =====
-- UniItalia: основная схема данных (Этап 1 + заготовка таблиц Этапа 2).
-- Рассчитано на Supabase (PostgreSQL 15+): использует auth.users и auth.uid().

-- ---------------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------------
create type public.verification_status as enum ('verified', 'needs_review', 'unverified', 'outdated');
create type public.publication_status as enum ('draft', 'published', 'archived');
create type public.study_level as enum ('foundation', 'bachelor', 'master', 'single_cycle');
create type public.teaching_language as enum ('en', 'it', 'en_it');
create type public.staff_role as enum ('admin', 'editor');
create type public.applicant_category as enum ('all', 'eu', 'non_eu_in_italy', 'non_eu_abroad');
create type public.application_status as enum (
  'choosing', 'collecting_documents', 'documents_ready', 'exam_registered', 'exam_passed',
  'application_sent', 'awaiting_decision', 'admitted', 'visa_preparation', 'visa_received', 'completed'
);
create type public.document_status as enum ('not_uploaded', 'uploaded', 'needs_translation', 'check_apostille', 'ready');

-- ---------------------------------------------------------------------------
-- Роли персонала. Роль НЕ может быть получена через обычную регистрацию:
-- строки сюда добавляет только существующий администратор (или SQL владельца).
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.staff_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create or replace function public.has_staff_role(roles public.staff_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.role = any (roles));
$$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.has_staff_role(array['admin', 'editor']::public.staff_role[]); $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.has_staff_role(array['admin']::public.staff_role[]); $$;

-- ---------------------------------------------------------------------------
-- Профиль студента
-- ---------------------------------------------------------------------------
create table public.student_profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  full_name          text check (char_length(full_name) <= 120),
  country            text check (char_length(country) <= 80),
  citizenship        text check (char_length(citizenship) <= 80),
  education_level    text check (char_length(education_level) <= 80),
  interested_fields  text[] not null default '{}',
  preferred_language text not null default 'ru',
  budget_eur         integer check (budget_eur is null or budget_eur >= 0),
  target_academic_year text check (target_academic_year is null or target_academic_year ~ '^\d{4}/\d{4}$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.student_profiles (user_id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Служебные триггеры: updated_at, last_edited_by, журнал изменений
-- ---------------------------------------------------------------------------
create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := coalesce(new.created_at, now()); end if;
  return new;
end;
$$;

create or replace function public.touch_editable_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.last_edited_by := coalesce(auth.uid(), new.last_edited_by);
  -- Публиковать «проверенным» можно только с источником и датой проверки.
  if new.verification_status = 'verified' and (new.source_url is null or new.verified_at is null) then
    raise exception 'verification_status=verified требует source_url и verified_at';
  end if;
  return new;
end;
$$;

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  text,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor      uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);

create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (table_name, record_id, action, actor, old_data, new_data)
  values (
    tg_table_name,
    (select coalesce(r ->> 'id', r ->> 'user_id')
       from (select case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end as r) x),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Каталог: университеты, факультеты, программы
-- Каждая редактируемая таблица фактов содержит:
--   academic_year, source_url, verified_at, verification_status, last_edited_by, status
-- ---------------------------------------------------------------------------
create table public.universities (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  official_name  text not null check (char_length(official_name) between 2 and 200),
  name_en        text,
  name_ru        text,
  city           text not null,
  region         text not null,
  public_private text not null check (public_private in ('public', 'private')),
  website        text check (website ~ '^https?://'),
  address        text,
  description_ru text,
  logo_url       text,
  image_url      text,
  featured       boolean not null default false,
  is_demo        boolean not null default false,
  status         public.publication_status not null default 'draft',
  academic_year  text check (academic_year ~ '^\d{4}/\d{4}$'),
  source_url     text check (source_url ~ '^https?://'),
  verified_at    timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index universities_city_idx on public.universities (city);
create index universities_region_idx on public.universities (region);
create index universities_status_idx on public.universities (status);

create table public.university_images (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  url           text not null check (url ~ '^https?://'),
  alt_ru        text,
  license       text not null,           -- лицензия обязательна: только легально используемые изображения
  attribution   text,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);
create index university_images_univ_idx on public.university_images (university_id, sort_order);

create table public.faculties (
  id             uuid primary key default gen_random_uuid(),
  university_id  uuid not null references public.universities (id) on delete cascade,
  name_original  text not null,
  name_ru        text,
  website        text check (website ~ '^https?://'),
  status         public.publication_status not null default 'draft',
  academic_year  text check (academic_year ~ '^\d{4}/\d{4}$'),
  source_url     text check (source_url ~ '^https?://'),
  verified_at    timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (university_id, name_original)
);

create table public.degree_programs (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  university_id  uuid not null references public.universities (id) on delete cascade,
  faculty_id     uuid references public.faculties (id) on delete set null,
  title_original text not null check (char_length(title_original) between 2 and 250),
  title_ru       text,
  level          public.study_level not null,
  fields         text[] not null default '{}',
  language       public.teaching_language not null,
  duration_years smallint check (duration_years between 1 and 7),
  ects           smallint check (ects between 30 and 420),
  curriculum_url text check (curriculum_url ~ '^https?://'),
  program_url    text check (program_url ~ '^https?://'),
  description_ru text,
  is_demo        boolean not null default false,
  status         public.publication_status not null default 'draft',
  academic_year  text check (academic_year ~ '^\d{4}/\d{4}$'),
  source_url     text check (source_url ~ '^https?://'),
  verified_at    timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index degree_programs_univ_idx on public.degree_programs (university_id);
create index degree_programs_level_idx on public.degree_programs (level);
create index degree_programs_fields_idx on public.degree_programs using gin (fields);
create index degree_programs_status_idx on public.degree_programs (status);

-- Временные версии данных программы: стоимость и прочие параметры по учебным годам.
create table public.program_editions (
  id                  uuid primary key default gen_random_uuid(),
  program_id          uuid not null references public.degree_programs (id) on delete cascade,
  academic_year       text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  applicant_category  public.applicant_category not null default 'all',
  tuition_fee_min_eur numeric(10, 2) check (tuition_fee_min_eur >= 0),
  tuition_fee_max_eur numeric(10, 2) check (tuition_fee_max_eur >= 0),
  fee_notes_ru        text,
  seats               integer check (seats >= 0),
  status              public.publication_status not null default 'draft',
  source_url          text check (source_url ~ '^https?://'),
  verified_at         timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by      uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (program_id, academic_year, applicant_category),
  check (tuition_fee_max_eur is null or tuition_fee_min_eur is null or tuition_fee_max_eur >= tuition_fee_min_eur)
);

create table public.program_curricula (
  id             uuid primary key default gen_random_uuid(),
  program_id     uuid not null references public.degree_programs (id) on delete cascade,
  academic_year  text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  url            text check (url ~ '^https?://'),
  notes_ru       text,
  status         public.publication_status not null default 'draft',
  source_url     text check (source_url ~ '^https?://'),
  verified_at    timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (program_id, academic_year)
);

create table public.entrance_exams (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_original  text not null,
  name_ru        text,
  website        text check (website ~ '^https?://'),
  description_ru text,
  status         public.publication_status not null default 'draft',
  academic_year  text check (academic_year ~ '^\d{4}/\d{4}$'),
  source_url     text check (source_url ~ '^https?://'),
  verified_at    timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.admission_requirements (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.degree_programs (id) on delete cascade,
  academic_year      text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  applicant_category public.applicant_category not null default 'all',
  requirement_type   text not null check (requirement_type in ('language', 'diploma', 'exam', 'document', 'other')),
  entrance_exam_id   uuid references public.entrance_exams (id) on delete set null,
  title_ru           text not null,
  details_ru         text,
  status             public.publication_status not null default 'draft',
  source_url         text check (source_url ~ '^https?://'),
  verified_at        timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by     uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index admission_requirements_program_idx on public.admission_requirements (program_id, academic_year);

-- ---------------------------------------------------------------------------
-- Стипендии и DSU
-- ---------------------------------------------------------------------------
create table public.scholarships (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  organization   text not null,
  name_ru        text not null,
  region         text not null,
  website        text check (website ~ '^https?://'),
  description_ru text,
  support_types  text[] not null default '{}',
  is_demo        boolean not null default false,
  status         public.publication_status not null default 'draft',
  academic_year  text check (academic_year ~ '^\d{4}/\d{4}$'),
  source_url     text check (source_url ~ '^https?://'),
  verified_at    timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index scholarships_region_idx on public.scholarships (region);

create table public.scholarship_eligibility (
  id                 uuid primary key default gen_random_uuid(),
  scholarship_id     uuid not null references public.scholarships (id) on delete cascade,
  academic_year      text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  applicant_category public.applicant_category not null default 'all',
  criterion_ru       text not null,
  details_ru         text,
  status             public.publication_status not null default 'draft',
  source_url         text check (source_url ~ '^https?://'),
  verified_at        timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by     uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.university_scholarships (
  university_id  uuid not null references public.universities (id) on delete cascade,
  scholarship_id uuid not null references public.scholarships (id) on delete cascade,
  primary key (university_id, scholarship_id)
);
create index university_scholarships_sch_idx on public.university_scholarships (scholarship_id);

-- Дедлайны программ и стипендий (Этап 2: календарь). Дата хранится с часовым поясом.
create table public.admission_deadlines (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid references public.degree_programs (id) on delete cascade,
  scholarship_id     uuid references public.scholarships (id) on delete cascade,
  academic_year      text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  applicant_category public.applicant_category not null default 'all',
  title_ru           text not null,
  starts_at          timestamptz,
  ends_at            timestamptz not null,
  timezone           text not null default 'Europe/Rome',
  status             public.publication_status not null default 'draft',
  source_url         text check (source_url ~ '^https?://'),
  verified_at        timestamptz,
  verification_status public.verification_status not null default 'unverified',
  last_edited_by     uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (program_id is not null or scholarship_id is not null),
  check (starts_at is null or starts_at <= ends_at)
);
create index admission_deadlines_ends_idx on public.admission_deadlines (ends_at);

-- Реестр источников: какие официальные страницы подтверждают какую запись.
create table public.verified_sources (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('university', 'program', 'program_edition', 'requirement', 'deadline', 'scholarship', 'eligibility', 'exam')),
  entity_id   uuid not null,
  url         text not null check (url ~ '^https?://'),
  title       text,
  checked_at  timestamptz not null default now(),
  checked_by  uuid references auth.users (id) on delete set null,
  notes       text
);
create index verified_sources_entity_idx on public.verified_sources (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Личные данные студента
-- ---------------------------------------------------------------------------
create table public.saved_universities (
  user_id       uuid not null references auth.users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, university_id)
);

create table public.saved_programs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.degree_programs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

create table public.university_comparisons (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  title          text,
  university_ids uuid[] not null default '{}' check (cardinality(university_ids) <= 4),
  program_ids    uuid[] not null default '{}' check (cardinality(program_ids) <= 4),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.student_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  program_id    uuid not null references public.degree_programs (id) on delete cascade,
  academic_year text check (academic_year ~ '^\d{4}/\d{4}$'),
  status        public.application_status not null default 'choosing',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, program_id, academic_year)
);

create table public.application_tasks (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.student_applications (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  title          text not null,
  due_date       date,
  done           boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.student_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  category     text not null check (category in (
    'passport', 'school_certificate', 'diploma', 'transcript', 'ielts', 'italian_certificate', 'motivation_letter',
    'recommendation', 'cv', 'portfolio', 'cimea', 'declaration_of_value', 'universitaly', 'financial', 'scholarship', 'visa', 'other')),
  status       public.document_status not null default 'uploaded',
  storage_path text,
  file_name    text,
  mime_type    text check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
  size_bytes   integer check (size_bytes between 1 and 10485760),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- путь в хранилище обязан начинаться с id владельца
  check (storage_path is null or storage_path like user_id::text || '/%')
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  deadline_id uuid references public.admission_deadlines (id) on delete cascade,
  title       text not null,
  body        text,
  send_at     timestamptz not null,
  sent_at     timestamptz,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.consultation_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  name            text not null check (char_length(name) between 1 and 120),
  country         text check (char_length(country) <= 80),
  contact         text not null check (char_length(contact) between 3 and 200),
  education_level text,
  field           text,
  comment         text check (char_length(comment) <= 2000),
  consent         boolean not null check (consent),
  status          text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Представление для мобильного каталога: программа + стоимость последнего
-- опубликованного учебного года. security_invoker => действуют RLS таблиц.
-- ---------------------------------------------------------------------------
create view public.program_catalog with (security_invoker = true) as
select
  p.*,
  e.academic_year       as fee_academic_year,
  e.tuition_fee_min_eur as fee_min_eur,
  e.tuition_fee_max_eur as fee_max_eur,
  e.verification_status as fee_verification_status
from public.degree_programs p
left join lateral (
  select pe.*
  from public.program_editions pe
  where pe.program_id = p.id and pe.status = 'published' and pe.applicant_category in ('all', 'non_eu_abroad')
  order by pe.academic_year desc, (pe.applicant_category = 'non_eu_abroad') desc
  limit 1
) e on true;

-- ---------------------------------------------------------------------------
-- Триггеры
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'universities', 'faculties', 'degree_programs', 'program_editions', 'program_curricula', 'entrance_exams',
    'admission_requirements', 'scholarships', 'scholarship_eligibility', 'admission_deadlines'
  ] loop
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_editable_row()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t, t);
  end loop;
  foreach t in array array['student_profiles', 'university_comparisons', 'student_applications', 'application_tasks', 'student_documents'] loop
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_row()', t, t);
  end loop;
end $$;

create trigger admin_users_audit after insert or update or delete on public.admin_users
  for each row execute function public.write_audit_log();

-- ===== 20261120000002_rls.sql =====
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

-- ===== 20261120000003_storage_and_account.sql =====
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

-- ===== seed.sql =====
-- СГЕНЕРИРОВАНО scripts/generate-seed-sql.ts — не редактировать вручную (npm run seed:sql).
-- ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ: is_demo = true, verification_status = unverified.
-- Стоимость, требования и дедлайны не заполняются, пока не сверены с официальными источниками.
begin;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('sapienza', 'Sapienza Università di Roma', 'Sapienza University of Rome', 'Римский университет Сапиенца', 'rome', 'lazio', 'public', 'https://www.uniroma1.it', 'Государственный университет, город Рим (Лацио). Подробная информация для иностранных студентов уточняется.', true, true, 'published', 'https://www.uniroma1.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('tor-vergata', 'Università degli Studi di Roma "Tor Vergata"', 'University of Rome Tor Vergata', 'Римский университет Тор Вергата', 'rome', 'lazio', 'public', 'https://web.uniroma2.it', 'Государственный университет, город Рим (Лацио). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://web.uniroma2.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('roma-tre', 'Università degli Studi Roma Tre', 'Roma Tre University', 'Университет Рома Тре', 'rome', 'lazio', 'public', 'https://www.uniroma3.it', 'Государственный университет, город Рим (Лацио). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.uniroma3.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unimi', 'Università degli Studi di Milano', 'University of Milan', 'Миланский университет', 'milan', 'lombardy', 'public', 'https://www.unimi.it', 'Государственный университет, город Милан (Ломбардия). Подробная информация для иностранных студентов уточняется.', true, true, 'published', 'https://www.unimi.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('milano-bicocca', 'Università degli Studi di Milano-Bicocca', 'University of Milan-Bicocca', 'Миланский университет Бикокка', 'milan', 'lombardy', 'public', 'https://www.unimib.it', 'Государственный университет, город Милан (Ломбардия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unimib.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('polimi', 'Politecnico di Milano', 'Politecnico di Milano', 'Миланский политехнический университет', 'milan', 'lombardy', 'public', 'https://www.polimi.it', 'Государственный университет, город Милан (Ломбардия). Подробная информация для иностранных студентов уточняется.', true, true, 'published', 'https://www.polimi.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('bocconi', 'Università Commerciale Luigi Bocconi', 'Bocconi University', 'Университет Боккони', 'milan', 'lombardy', 'private', 'https://www.unibocconi.it', 'Частный университет, город Милан (Ломбардия). Подробная информация для иностранных студентов уточняется.', true, true, 'published', 'https://www.unibocconi.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unibo', 'Alma Mater Studiorum – Università di Bologna', 'University of Bologna', 'Болонский университет', 'bologna', 'emilia-romagna', 'public', 'https://www.unibo.it', 'Государственный университет, город Болонья (Эмилия-Романья). Подробная информация для иностранных студентов уточняется.', true, true, 'published', 'https://www.unibo.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unipd', 'Università degli Studi di Padova', 'University of Padua', 'Падуанский университет', 'padua', 'veneto', 'public', 'https://www.unipd.it', 'Государственный университет, город Падуя (Венето). Подробная информация для иностранных студентов уточняется.', true, true, 'published', 'https://www.unipd.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unito', 'Università degli Studi di Torino', 'University of Turin', 'Туринский университет', 'turin', 'piedmont', 'public', 'https://www.unito.it', 'Государственный университет, город Турин (Пьемонт). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unito.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('polito', 'Politecnico di Torino', 'Politecnico di Torino', 'Туринский политехнический университет', 'turin', 'piedmont', 'public', 'https://www.polito.it', 'Государственный университет, город Турин (Пьемонт). Подробная информация для иностранных студентов уточняется.', true, true, 'published', 'https://www.polito.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unipv', 'Università degli Studi di Pavia', 'University of Pavia', 'Университет Павии', 'pavia', 'lombardy', 'public', 'https://www.unipv.it', 'Государственный университет, город Павия (Ломбардия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unipv.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unipi', 'Università di Pisa', 'University of Pisa', 'Пизанский университет', 'pisa', 'tuscany', 'public', 'https://www.unipi.it', 'Государственный университет, город Пиза (Тоскана). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unipi.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unifi', 'Università degli Studi di Firenze', 'University of Florence', 'Флорентийский университет', 'florence', 'tuscany', 'public', 'https://www.unifi.it', 'Государственный университет, город Флоренция (Тоскана). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unifi.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unisi', 'Università degli Studi di Siena', 'University of Siena', 'Сиенский университет', 'siena', 'tuscany', 'public', 'https://www.unisi.it', 'Государственный университет, город Сиена (Тоскана). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unisi.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unitn', 'Università degli Studi di Trento', 'University of Trento', 'Университет Тренто', 'trento', 'trentino-alto-adige', 'public', 'https://www.unitn.it', 'Государственный университет, город Тренто (Трентино — Альто-Адидже). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unitn.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('univr', 'Università degli Studi di Verona', 'University of Verona', 'Веронский университет', 'verona', 'veneto', 'public', 'https://www.univr.it', 'Государственный университет, город Верона (Венето). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.univr.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unipr', 'Università degli Studi di Parma', 'University of Parma', 'Пармский университет', 'parma', 'emilia-romagna', 'public', 'https://www.unipr.it', 'Государственный университет, город Парма (Эмилия-Романья). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unipr.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unipg', 'Università degli Studi di Perugia', 'University of Perugia', 'Университет Перуджи', 'perugia', 'umbria', 'public', 'https://www.unipg.it', 'Государственный университет, город Перуджа (Умбрия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unipg.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unige', 'Università degli Studi di Genova', 'University of Genoa', 'Генуэзский университет', 'genoa', 'liguria', 'public', 'https://unige.it', 'Государственный университет, город Генуя (Лигурия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://unige.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unina', 'Università degli Studi di Napoli Federico II', 'University of Naples Federico II', 'Неаполитанский университет имени Фридриха II', 'naples', 'campania', 'public', 'https://www.unina.it', 'Государственный университет, город Неаполь (Кампания). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unina.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unipa', 'Università degli Studi di Palermo', 'University of Palermo', 'Университет Палермо', 'palermo', 'sicily', 'public', 'https://www.unipa.it', 'Государственный университет, город Палермо (Сицилия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unipa.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unime', 'Università degli Studi di Messina', 'University of Messina', 'Университет Мессины', 'messina', 'sicily', 'public', 'https://www.unime.it', 'Государственный университет, город Мессина (Сицилия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unime.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unisa', 'Università degli Studi di Salerno', 'University of Salerno', 'Университет Салерно', 'salerno', 'campania', 'public', 'https://www.unisa.it', 'Государственный университет, город Салерно (Кампания). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unisa.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unicas', 'Università degli Studi di Cassino e del Lazio Meridionale', 'University of Cassino and Southern Lazio', 'Университет Кассино и Южного Лацио', 'cassino', 'lazio', 'public', 'https://www.unicas.it', 'Государственный университет, город Кассино (Лацио). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unicas.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unive', 'Università Ca'' Foscari Venezia', 'Ca'' Foscari University of Venice', 'Венецианский университет Ка-Фоскари', 'venice', 'veneto', 'public', 'https://www.unive.it', 'Государственный университет, город Венеция (Венето). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unive.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('iuav', 'Università Iuav di Venezia', 'IUAV University of Venice', 'Венецианский университет IUAV', 'venice', 'veneto', 'public', 'https://www.iuav.it', 'Государственный университет, город Венеция (Венето). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.iuav.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('luiss', 'LUISS Guido Carli', 'LUISS University', 'Университет LUISS', 'rome', 'lazio', 'private', 'https://www.luiss.it', 'Частный университет, город Рим (Лацио). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.luiss.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unicatt', 'Università Cattolica del Sacro Cuore', 'Università Cattolica del Sacro Cuore', 'Католический университет Святого Сердца', 'milan', 'lombardy', 'private', 'https://www.unicatt.it', 'Частный университет, город Милан (Ломбардия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unicatt.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('humanitas', 'Humanitas University', 'Humanitas University', 'Университет Humanitas', 'pieve-emanuele', 'lombardy', 'private', 'https://www.hunimed.eu', 'Частный университет, город Пьеве-Эмануэле (Ломбардия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.hunimed.eu', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('uniba', 'Università degli Studi di Bari Aldo Moro', 'University of Bari Aldo Moro', 'Университет Бари имени Альдо Моро', 'bari', 'apulia', 'public', 'https://www.uniba.it', 'Государственный университет, город Бари (Апулия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.uniba.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unict', 'Università degli Studi di Catania', 'University of Catania', 'Университет Катании', 'catania', 'sicily', 'public', 'https://www.unict.it', 'Государственный университет, город Катания (Сицилия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unict.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unical', 'Università della Calabria', 'University of Calabria', 'Университет Калабрии', 'rende', 'calabria', 'public', 'https://www.unical.it', 'Государственный университет, город Ренде (Козенца) (Калабрия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unical.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unibg', 'Università degli Studi di Bergamo', 'University of Bergamo', 'Университет Бергамо', 'bergamo', 'lombardy', 'public', 'https://www.unibg.it', 'Государственный университет, город Бергамо (Ломбардия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unibg.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unibs', 'Università degli Studi di Brescia', 'University of Brescia', 'Университет Брешии', 'brescia', 'lombardy', 'public', 'https://www.unibs.it', 'Государственный университет, город Брешиа (Ломбардия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unibs.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unimore', 'Università degli Studi di Modena e Reggio Emilia', 'University of Modena and Reggio Emilia', 'Университет Модены и Реджо-Эмилии', 'modena', 'emilia-romagna', 'public', 'https://www.unimore.it', 'Государственный университет, город Модена (Эмилия-Романья). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unimore.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('unife', 'Università degli Studi di Ferrara', 'University of Ferrara', 'Университет Феррары', 'ferrara', 'emilia-romagna', 'public', 'https://www.unife.it', 'Государственный университет, город Феррара (Эмилия-Романья). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.unife.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('units', 'Università degli Studi di Trieste', 'University of Trieste', 'Университет Триеста', 'trieste', 'friuli-venezia-giulia', 'public', 'https://www.units.it', 'Государственный университет, город Триест (Фриули — Венеция-Джулия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.units.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('uniud', 'Università degli Studi di Udine', 'University of Udine', 'Университет Удине', 'udine', 'friuli-venezia-giulia', 'public', 'https://www.uniud.it', 'Государственный университет, город Удине (Фриули — Венеция-Джулия). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.uniud.it', 'unverified') on conflict (slug) do nothing;
insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values ('univaq', 'Università degli Studi dell''Aquila', 'University of L''Aquila', 'Университет Л''Акуилы', 'laquila', 'abruzzo', 'public', 'https://www.univaq.it', 'Государственный университет, город Л''Акуила (Абруццо). Подробная информация для иностранных студентов уточняется.', false, true, 'published', 'https://www.univaq.it', 'unverified') on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'bocconi-biem', u.id, 'International Economics and Management', 'Международная экономика и менеджмент', 'bachelor'::public.study_level, array['economics', 'management', 'international_business']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'bocconi' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'bocconi-bai', u.id, 'Mathematical and Computing Sciences for Artificial Intelligence', 'Математика и вычислительные науки для искусственного интеллекта', 'bachelor'::public.study_level, array['ai', 'mathematics', 'computer_science']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'bocconi' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'polimi-cse', u.id, 'Computer Science and Engineering', 'Компьютерные науки и инженерия', 'master'::public.study_level, array['computer_science', 'engineering']::text[], 'en'::public.teaching_language, 2, 120, true, 'published', 'unverified' from public.universities u where u.slug = 'polimi' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'polimi-ing-informatica', u.id, 'Ingegneria Informatica', 'Информационная инженерия (компьютерная инженерия)', 'bachelor'::public.study_level, array['computer_science', 'engineering']::text[], 'it'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'polimi' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unibo-economics-finance', u.id, 'Economics and Finance', 'Экономика и финансы', 'master'::public.study_level, array['economics', 'finance']::text[], 'en'::public.teaching_language, 2, 120, true, 'published', 'unverified' from public.universities u where u.slug = 'unibo' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unibo-medicine', u.id, 'Medicine and Surgery', 'Медицина и хирургия (лечебное дело)', 'single_cycle'::public.study_level, array['medicine']::text[], 'en'::public.teaching_language, 6, 360, true, 'published', 'unverified' from public.universities u where u.slug = 'unibo' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unibo-giurisprudenza', u.id, 'Giurisprudenza', 'Юриспруденция', 'single_cycle'::public.study_level, array['law']::text[], 'it'::public.teaching_language, 5, 300, true, 'published', 'unverified' from public.universities u where u.slug = 'unibo' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'sapienza-medicine', u.id, 'Medicine and Surgery', 'Медицина и хирургия (лечебное дело)', 'single_cycle'::public.study_level, array['medicine']::text[], 'en'::public.teaching_language, 6, 360, true, 'published', 'unverified' from public.universities u where u.slug = 'sapienza' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unipd-economics-management', u.id, 'Economics and Management', 'Экономика и менеджмент', 'bachelor'::public.study_level, array['economics', 'management']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'unipd' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unipd-computer-engineering', u.id, 'Computer Engineering', 'Компьютерная инженерия', 'master'::public.study_level, array['computer_science', 'engineering']::text[], 'en'::public.teaching_language, 2, 120, true, 'published', 'unverified' from public.universities u where u.slug = 'unipd' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unimi-iple', u.id, 'International Politics, Law and Economics', 'Международная политика, право и экономика', 'bachelor'::public.study_level, array['political_science', 'international_relations', 'law', 'economics']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'unimi' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unimi-dse', u.id, 'Data Science and Economics', 'Наука о данных и экономика', 'master'::public.study_level, array['data_science', 'economics']::text[], 'en'::public.teaching_language, 2, 120, true, 'published', 'unverified' from public.universities u where u.slug = 'unimi' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'polito-computer-engineering', u.id, 'Computer Engineering', 'Компьютерная инженерия', 'bachelor'::public.study_level, array['computer_science', 'engineering']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'polito' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'polito-architecture-sustainability', u.id, 'Architecture for Sustainability', 'Архитектура для устойчивого развития', 'master'::public.study_level, array['architecture']::text[], 'en'::public.teaching_language, 2, 120, true, 'published', 'unverified' from public.universities u where u.slug = 'polito' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unito-business-management', u.id, 'Business & Management', 'Бизнес и менеджмент', 'bachelor'::public.study_level, array['business', 'management']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'unito' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unito-giurisprudenza', u.id, 'Giurisprudenza', 'Юриспруденция', 'single_cycle'::public.study_level, array['law']::text[], 'it'::public.teaching_language, 5, 300, true, 'published', 'unverified' from public.universities u where u.slug = 'unito' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unipi-aide', u.id, 'Artificial Intelligence and Data Engineering', 'Искусственный интеллект и инженерия данных', 'master'::public.study_level, array['ai', 'data_science', 'engineering']::text[], 'en'::public.teaching_language, 2, 120, true, 'published', 'unverified' from public.universities u where u.slug = 'unipi' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unitn-data-science', u.id, 'Data Science', 'Наука о данных', 'master'::public.study_level, array['data_science', 'computer_science']::text[], 'en'::public.teaching_language, 2, 120, true, 'published', 'unverified' from public.universities u where u.slug = 'unitn' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'tor-vergata-global-governance', u.id, 'Global Governance', 'Глобальное управление', 'bachelor'::public.study_level, array['political_science', 'international_relations']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'tor-vergata' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'tor-vergata-medicine', u.id, 'Medicine and Surgery', 'Медицина и хирургия (лечебное дело)', 'single_cycle'::public.study_level, array['medicine']::text[], 'en'::public.teaching_language, 6, 360, true, 'published', 'unverified' from public.universities u where u.slug = 'tor-vergata' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'luiss-economics-business', u.id, 'Economics and Business', 'Экономика и бизнес', 'bachelor'::public.study_level, array['economics', 'business']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'luiss' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'luiss-ppe', u.id, 'Politics, Philosophy and Economics', 'Политика, философия и экономика', 'bachelor'::public.study_level, array['political_science', 'economics']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'luiss' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'humanitas-medicine', u.id, 'Medicine and Surgery', 'Медицина и хирургия (лечебное дело)', 'single_cycle'::public.study_level, array['medicine']::text[], 'en'::public.teaching_language, 6, 360, true, 'published', 'unverified' from public.universities u where u.slug = 'humanitas' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unipv-medicine', u.id, 'Medicine and Surgery', 'Медицина и хирургия (лечебное дело)', 'single_cycle'::public.study_level, array['medicine']::text[], 'en'::public.teaching_language, 6, 360, true, 'published', 'unverified' from public.universities u where u.slug = 'unipv' on conflict (slug) do nothing;
insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select 'unive-economics-management', u.id, 'Economics and Management', 'Экономика и менеджмент', 'bachelor'::public.study_level, array['economics', 'management']::text[], 'en'::public.teaching_language, 3, 180, true, 'published', 'unverified' from public.universities u where u.slug = 'unive' on conflict (slug) do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('laziodisco', 'DiSCo Lazio (LazioDiSCo)', 'Региональная стипендия DSU — Лацио', 'lazio', 'https://www.laziodisco.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.laziodisco.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'sapienza' and s.slug = 'laziodisco' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'tor-vergata' and s.slug = 'laziodisco' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'roma-tre' and s.slug = 'laziodisco' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unicas' and s.slug = 'laziodisco' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('edisu-piemonte', 'EDISU Piemonte', 'Региональная стипендия DSU — Пьемонт', 'piedmont', 'https://www.edisu.piemonte.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.edisu.piemonte.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unito' and s.slug = 'edisu-piemonte' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'polito' and s.slug = 'edisu-piemonte' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('dsu-toscana', 'DSU Toscana', 'Региональная стипендия DSU — Тоскана', 'tuscany', 'https://www.dsu.toscana.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.dsu.toscana.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unipi' and s.slug = 'dsu-toscana' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unifi' and s.slug = 'dsu-toscana' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unisi' and s.slug = 'dsu-toscana' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('ergo', 'ER.GO — Azienda Regionale per il Diritto agli Studi Superiori', 'Региональная стипендия DSU — Эмилия-Романья', 'emilia-romagna', 'https://www.er-go.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.er-go.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unibo' and s.slug = 'ergo' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unipr' and s.slug = 'ergo' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unimore' and s.slug = 'ergo' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unife' and s.slug = 'ergo' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('esu-padova', 'ESU Padova', 'Стипендия DSU — Падуя (Венето)', 'veneto', 'https://www.esupd.gov.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.esupd.gov.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unipd' and s.slug = 'esu-padova' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('esu-venezia', 'ESU Venezia', 'Стипендия DSU — Венеция (Венето)', 'veneto', 'https://www.esuvenezia.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.esuvenezia.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unive' and s.slug = 'esu-venezia' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'iuav' and s.slug = 'esu-venezia' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('esu-verona', 'ESU Verona', 'Стипендия DSU — Верона (Венето)', 'veneto', 'https://www.esu.vr.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.esu.vr.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'univr' and s.slug = 'esu-verona' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('ersu-palermo', 'ERSU Palermo', 'Стипендия DSU — Палермо (Сицилия)', 'sicily', 'https://www.ersupalermo.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.ersupalermo.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unipa' and s.slug = 'ersu-palermo' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('ersu-messina', 'ERSU Messina', 'Стипендия DSU — Мессина (Сицилия)', 'sicily', 'https://www.ersumessina.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.ersumessina.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unime' and s.slug = 'ersu-messina' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('ersu-catania', 'ERSU Catania', 'Стипендия DSU — Катания (Сицилия)', 'sicily', 'https://www.ersucatania.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.ersucatania.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unict' and s.slug = 'ersu-catania' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('adisu-puglia', 'ADISU Puglia', 'Региональная стипендия DSU — Апулия', 'apulia', 'https://www.adisupuglia.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.adisupuglia.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'uniba' and s.slug = 'adisu-puglia' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('adisurc', 'ADISURC — Diritto allo Studio Universitario Regione Campania', 'Региональная стипендия DSU — Кампания', 'campania', 'https://www.adisurcampania.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.adisurcampania.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unina' and s.slug = 'adisurc' on conflict do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unisa' and s.slug = 'adisurc' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('opera-trento', 'Opera Universitaria di Trento', 'Стипендия DSU — Тренто', 'trentino-alto-adige', 'https://www.operauni.tn.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.operauni.tn.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unitn' and s.slug = 'opera-trento' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('aliseo', 'ALiSEO — Agenzia Ligure per gli Studenti e l''Orientamento', 'Региональная стипендия DSU — Лигурия', 'liguria', 'https://www.aliseo.liguria.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.aliseo.liguria.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unige' and s.slug = 'aliseo' on conflict do nothing;
insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values ('adisu-umbria', 'ADiSU Umbria', 'Региональная стипендия DSU — Умбрия', 'umbria', 'https://www.adisu.umbria.it', 'Региональная программа поддержки студентов (DSU). Обычно может включать денежную стипендию, место в общежитии и питание — точные виды поддержки, размеры, экономические критерии и сроки публикуются в bando на конкретный учебный год.', true, 'published', 'https://www.adisu.umbria.it', 'unverified') on conflict (slug) do nothing;
insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = 'unipg' and s.slug = 'adisu-umbria' on conflict do nothing;
commit;
