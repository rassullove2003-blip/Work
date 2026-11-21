-- Массовый импорт из Google Sheets / Excel / CSV.
-- Каждая строка таблицы обновляет существующую запись по «естественному ключу», а не создаёт дубликат:
--   университет   → slug
--   программа     → slug
--   стоимость     → (программа, учебный год, категория абитуриента)
--   требование    → (программа, учебный год, тип требования, категория абитуриента)
--   стипендия     → slug
--   условия стип. → (стипендия, учебный год, категория абитуриента)
--   дедлайн       → import_key (уникальный код строки из таблицы)

-- Город может быть любым, не только из встроенного справочника: храним русское название рядом.
alter table public.universities add column if not exists city_ru text;

-- Ключи для обновления без дубликатов.
alter table public.admission_requirements
  add constraint admission_requirements_natural_key unique (program_id, academic_year, requirement_type, applicant_category);
alter table public.scholarship_eligibility
  add constraint scholarship_eligibility_natural_key unique (scholarship_id, academic_year, applicant_category);
alter table public.admission_deadlines add column if not exists import_key text;
alter table public.admission_deadlines
  add constraint admission_deadlines_import_key unique (import_key);

-- Источник импорта (подключённая Google Таблица) и журнал запусков.
create table public.import_sources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default 'Основная таблица',
  google_sheet_id text not null unique check (google_sheet_id ~ '^[A-Za-z0-9_-]{20,}$'),
  last_synced_at  timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.import_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid references public.import_sources (id) on delete set null,
  source_kind text not null check (source_kind in ('google_sheets', 'xlsx', 'csv')),
  file_name   text,
  status      text not null check (status in ('validated', 'applied', 'failed')),
  summary     jsonb not null default '{}',  -- сколько создано / обновлено по каждому листу
  errors      jsonb not null default '[]',  -- [{sheet, row, column, message}]
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index import_runs_created_idx on public.import_runs (created_at desc);

alter table public.import_sources enable row level security;
alter table public.import_runs enable row level security;

create policy import_sources_staff_read on public.import_sources for select to authenticated using (public.is_staff());
create policy import_sources_admin_write on public.import_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy import_runs_staff_read on public.import_runs for select to authenticated using (public.is_staff());
create policy import_runs_staff_insert on public.import_runs for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
