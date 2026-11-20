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
