-- Уровень «Докторантура (PhD)», необязательный язык обучения, пояснения к стоимости в каталоге.
alter type public.study_level add value if not exists 'phd';

-- Язык известен не для всех программ: пусто = «Информация уточняется».
alter table public.degree_programs alter column language drop not null;

-- Каталог отдаёт и текстовое пояснение к стоимости последнего опубликованного года.
create or replace view public.program_catalog with (security_invoker = true) as
select
  p.*,
  e.academic_year       as fee_academic_year,
  e.tuition_fee_min_eur as fee_min_eur,
  e.tuition_fee_max_eur as fee_max_eur,
  e.verification_status as fee_verification_status,
  e.fee_notes_ru        as fee_notes_ru
from public.degree_programs p
left join lateral (
  select pe.*
  from public.program_editions pe
  where pe.program_id = p.id and pe.status = 'published' and pe.applicant_category in ('all', 'non_eu_abroad')
  order by pe.academic_year desc, (pe.applicant_category = 'non_eu_abroad') desc
  limit 1
) e on true;
