-- Общие правила поступления (лист «Общие правила» исследовательской таблицы 2027/28).
-- Ориентиры, а не замена call конкретного курса. Редактируются в «Управление» → «Общие правила».
create table public.admission_rules (
  id                  uuid primary key default gen_random_uuid(),
  sort_order          integer not null default 100,
  section             text not null check (char_length(section) between 2 and 120),
  body_ru             text not null check (char_length(body_ru) between 2 and 5000),
  academic_year       text check (academic_year is null or academic_year ~ '^\d{4}/\d{4}$'),
  source_url          text check (source_url ~ '^https?://'),
  extra_urls          text[] not null default '{}',
  verified_at         timestamptz,
  verification_status public.verification_status not null default 'unverified',
  status              public.publication_status not null default 'draft',
  last_edited_by      uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.admission_rules enable row level security;
create policy admission_rules_public_read on public.admission_rules for select to anon, authenticated
  using (status = 'published' or public.is_staff());
create policy admission_rules_staff_insert on public.admission_rules for insert to authenticated with check (public.is_staff());
create policy admission_rules_staff_update on public.admission_rules for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy admission_rules_admin_delete on public.admission_rules for delete to authenticated using (public.is_admin());
create trigger admission_rules_touch before insert or update on public.admission_rules
  for each row execute function public.touch_editable_row();
create trigger admission_rules_audit after insert or update or delete on public.admission_rules
  for each row execute function public.write_audit_log();

insert into public.admission_rules (sort_order, section, body_ru, source_url, extra_urls, academic_year, status, verification_status)
select v.*, '2027/2028', 'published', 'needs_review' from (values
  (10, 'Образование · бакалавриат', 'Для поступления нужен документ о полном среднем образовании, соответствующий минимуму 12 лет обучения. При 11-летней школе в Казахстане обычно закрывают разницу успешно завершённым 1-м курсом университета (академическая справка/транскрипт) либо признанным Foundation/preparatory year. Принимающий вуз подтверждает приемлемый вариант.', 'https://www.universitaly.it/en/studenti-stranieri', '{}'),
  (20, 'Образование · колледж', 'Вариант «9 лет школы + 3 года колледжа» не засчитывается автоматически по сумме лет: диплом колледжа должен давать право поступления в вуз в стране выдачи, а итальянский университет должен признать уровень и документы эквивалентными.', 'https://www.en.unito.it/studying-unito/international-degree-seeking-students/required-documents-international-students', '{}'),
  (30, 'Документы · бакалавриат', 'Аттестат и приложение с оценками; документ о недостающем году учёбы, если нужен; паспорт. CV приложить, если требует программа (в остальных случаях полезно, но не универсально обязательно). Перевод, легализация, CIMEA/DoV — по требованиям конкретного вуза.', 'https://www.universitaly.it/en/studenti-stranieri', '{}'),
  (40, 'Образование · магистратура', 'Типичный путь из Казахстана — 11 лет школы + 4-летний бакалавриат. Для MSc нужен признанный диплом первого цикла; вуз сверяет предметы, кредиты и соответствие профиля. Можно подать заявку в выпускной год, если программа допускает условное зачисление и диплом будет выдан к сроку регистрации. Подача на 3-м курсе — только если это прямо разрешено call.', 'https://www.unipd.it/en/ammissione-studenti-internazionali', '{}'),
  (50, 'Документы · магистратура', 'Диплом и транскрипт; CV; паспорт; при необходимости — описания пройденных курсов/силлабусы, аттестат для проверки всей цепочки образования, переводы и подтверждение квалификации (CIMEA/DoV). Обязательный набор указан в call программы.', 'https://www.universitaly.it/en/studenti-stranieri', '{}'),
  (60, 'Язык обучения', 'Плановый ориентир для англоязычных программ: английский B2; IELTS от 5.5 для бакалавриата и от 6.0 для магистратуры. Это не универсальный минимум: курс может требовать 6.5 или иной балл. TOEFL iBT порог всегда брать из конкретного call; допустимы ли исключения — уточнять у программы.', 'https://www.universitaly.it/en/studenti-stranieri', '{}'),
  (70, 'Тесты · бакалавриат', 'CEnT-S нужен только тем программам, где он указан в официальном call. В зависимости от вуза/курса также могут использоваться SAT, Luiss Test, Bocconi Online Test, ARCHED, TIL-A, TOLD или собственное испытание. Тест нельзя автоматически переносить на все программы университета.', 'https://www.cisiaonline.it/en/cent/all-about-CEnT/CEnT-rules', '{}'),
  (80, 'Важно · CEnT-S', 'В списке CISIA есть и Messina, и Cassino; сам статус участника не означает обязательность теста на всех программах. На странице каждого вуза CISIA перечисляет отдельные курсы: сверяйте точное название и набор 2027/28.', 'https://www.cisiaonline.it/en/cent/cent-s/universities-cent-s', array['https://cisiaonline.it/en/atenei/universita-degli-studi-di-messina?uni=Universit%C3%A0+TEST+ITA+L2','https://cisiaonline.it/en/atenei/universita-degli-studi-di-cassino-e-del-lazio-meridionale?uni=CEnT-S']::text[]),
  (90, 'Даты UniME · 2027/28', 'У Messina уже опубликованы отдельные раунды для визовых и безвизовых категорий, а также окна для Foundation Course и IMAT. Даты указаны на страницах соответствующих программ; проверяйте актуальность перед подачей.', 'https://www.unime.it/international/immatricolazione-con-titolo-estero', '{}'),
  (100, 'Магистратура · отбор', 'Для MSc возможны интервью и/или вступительное испытание. В IT, инженерии, медицине и естественных науках могут проверять профильные кредиты и знания, но единого экзамена для всех магистратур нет. Портфолио прикладывают к творческим курсам, когда этого требует call.', null, '{}'),
  (110, 'Творческие направления', 'Архитектура, дизайн и искусство могут требовать тест, портфолио или оба элемента. ARCHED, TIL-A и TOLD относятся к определённым маршрутам/вузам; это не общий перечень обязательных тестов для любого творческого курса.', 'https://www.polimi.it/en/prospective-students/how-to-apply/admission-to-laurea-programmes', '{}'),
  (120, 'Дедлайны 2027/28', 'Сохранены официально опубликованные раунды там, где они уже найдены. Для остальных программ стоят ориентиры по 2026/27; это не официальные даты набора 2027/28. Срок зависит от курса, уровня, статуса и необходимости визы; non-EU кандидатам обычно нужен ранний раунд.', null, '{}'),
  (130, 'Виза · общий срок', 'Для 2027/28 национальная предельная дата подачи на учебную визу для Laurea, Laurea Magistrale и одноцикловых программ — 31.10.2027; вуз вправе установить более ранний срок для конкретного курса. Для PhD и foundation нет такого же общего дедлайна, но виза должна быть запрошена до начала курса.', 'https://www.universitaly.it/en/studenti-stranieri', '{}'),
  (140, 'Стоимость · как читать', 'Сумма €156–€208 часто относится к обязательному первому платежу/налогу/гербовому сбору, а не к полной годовой tuition. Годовая стоимость государственного вуза зависит от курса, ISEE/дохода, страны проживания и правил вуза. В приложении на странице программы сумма и пояснение к ней указаны отдельно.', null, '{}'),
  (150, 'Примеры публичных сборов', 'Ориентиры 2026/27: Sapienza/Cassino/Tor Vergata — от €156; Pisa — от €156; Bologna — от €157.04; Padova — первый платёж €208. Это не полная цена всех курсов и тариф 2027/28 может измениться.', 'https://www.unipd.it/en/contribuzione-studentesca', '{}'),
  (160, 'Региональные сборы', 'Не считать €156 универсальной суммой для всей Италии: Lombardia применяет разные уровни регионального налога; Emilia-Romagna: минимальный обязательный платёж Bologna — €157.04; Toscana/Pisa — ориентир от €156; Umbria/Perugia публикует годовые суммы, зависящие от курса и категории (примерно €150–€2,200). Siena и другие вузы региона нужно проверять отдельно.', 'https://www.unipg.it/en/international-students/becoming-a-unipg-student/tuition-fees-and-scholarships', '{}'),
  (170, 'Стоимость · частные вузы', 'Luiss 2027/28: ориентир €15,000/год BA и €16,000/год MSc (отдельные MSc Finance/Management могут быть €18,000). Bocconi 2027/28: около €17,700 BA и €19,300 MSc; €2,000 — часть/авансовый платёж. Polimi: €880.04 — первый взнос в опубликованном тарифе, возможна дополнительная tuition. Точные категории — на странице курса.', 'https://www.luiss.it/en/faq/luiss-faq', '{}'),
  (180, 'Стипендия DSU', 'Региональная стипендия может дать освобождение/снижение tuition и дополнительные выплаты/услуги, но присуждается по отдельному конкурсу, доходным и академическим условиям. Сбор за региональный налог, гербовую марку, страховку или услуги может сохраниться. Возврат уже уплаченной суммы зависит от правил конкретного университета.', null, '{}')
) as v(sort_order, section, body_ru, source_url, extra_urls);
