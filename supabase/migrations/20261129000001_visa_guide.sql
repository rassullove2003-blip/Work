-- Раздел «Виза и переезд». Источники (проверено 25.11.2026):
--   МИД Италии: https://vistoperitalia.esteri.it/ (анкета: гражданство = проживание, «oltre i 90 giorni», «STUDIO - IMMATRICOLAZIONE UNIVERSITA'»),
--               https://vistoperitalia.esteri.it/infovisto?code=17_0_D, список визовых центров https://vistoperitalia.esteri.it/files/public/moduli/it/fornitori_esterni_convenzionati_di_servizi_di_visto.pdf (от 03.04.2024);
--   MUR/Universitaly: https://www.universitaly.it/en/studenti-stranieri, циркуляр 2026/27–2027/28: https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf.
create table public.visa_sections (
  id                  uuid primary key default gen_random_uuid(),
  sort_order          integer not null default 100,
  key                 text unique check (key ~ '^[a-z0-9_]+$'),
  title_ru            text not null check (char_length(title_ru) between 2 and 160),
  body_ru             text not null check (char_length(body_ru) between 2 and 6000),
  academic_year       text check (academic_year is null or academic_year ~ '^\d{4}/\d{4}$'),
  source_url          text check (source_url ~ '^https?://'),
  verified_at         timestamptz,
  verification_status public.verification_status not null default 'unverified',
  status              public.publication_status not null default 'draft',
  last_edited_by      uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Куда подавать на визу: посольство/консульство Италии по стране проживания.
create table public.visa_missions (
  id                  uuid primary key default gen_random_uuid(),
  sort_order          integer not null default 100,
  country_code        text not null check (country_code ~ '^[A-Z]{3}$'),
  country_ru          text not null,
  mission_name        text not null,
  address             text,
  phone               text,
  email               text,
  website             text check (website ~ '^https?://'),
  jurisdiction_ru     text,
  visa_center_url     text check (visa_center_url ~ '^https?://'),
  academic_year       text check (academic_year is null or academic_year ~ '^\d{4}/\d{4}$'),
  source_url          text check (source_url ~ '^https?://'),
  verified_at         timestamptz,
  verification_status public.verification_status not null default 'unverified',
  status              public.publication_status not null default 'draft',
  last_edited_by      uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index visa_missions_country_idx on public.visa_missions (country_code, sort_order);

do $$
declare t text;
begin
  foreach t in array array['visa_sections', 'visa_missions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %1$s_public_read on public.%1$I for select to anon, authenticated using (status = 'published' or public.is_staff())$f$, t);
    execute format($f$create policy %1$s_staff_insert on public.%1$I for insert to authenticated with check (public.is_staff())$f$, t);
    execute format($f$create policy %1$s_staff_update on public.%1$I for update to authenticated using (public.is_staff()) with check (public.is_staff())$f$, t);
    execute format($f$create policy %1$s_admin_delete on public.%1$I for delete to authenticated using (public.is_admin())$f$, t);
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_editable_row()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t, t);
  end loop;
end $$;

insert into public.visa_sections (sort_order, key, title_ru, body_ru, source_url, academic_year, status, verification_status, verified_at)
select v.*, '2027/2028', 'published', 'verified', '2026-11-25T10:00:00Z'::timestamptz from (values
  (10, 'visa_type', 'Какая виза нужна', 'Для учёбы в итальянском вузе дольше 90 дней нужна национальная виза типа D с целью «Studio – Immatricolazione università» (учёба – зачисление в университет).
• Национальная виза D выдаётся на срок от 91 до 365 дней и даёт право находиться в Италии; по ней также можно ездить в другие страны Шенгена до 90 дней в течение 180 дней.
• Виза не гарантирует въезд: на границе могут снова попросить подтвердить условия, по которым она выдана.
• Решение о выдаче визы принимает только посольство или консульство Италии.', 'https://vistoperitalia.esteri.it/infovisto?code=17_0_D'),
  (20, 'preenrolment', 'Шаг 1. Предзачисление через Universitaly', 'Заявка на поступление для иностранцев, которым нужна виза, подаётся только через официальный бесплатный портал Universitaly (universitaly.it) — это «preiscrizione», предзачисление.
• На портале заполняется «domanda di preiscrizione» и выбирается курс. Сроки предзачисления устанавливает каждый вуз и публикует на своём сайте.
• Вуз проверяет документы и «валидирует» заявку на портале. Подать на визу можно только с валидированной заявкой.
• С 2026/27 вуз может валидировать не больше заявок, чем мест для иностранцев плюс 20%.
• Если вы ещё учитесь в выпускном классе, заявку могут принять «с оговоркой» (con riserva) до получения документа об образовании.
• После валидации на визу подают в посольство или консульство Италии в стране, где вы проживаете.', 'https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf'),
  (30, 'deadlines', 'Сроки подачи на визу', '• На 2027/28 учебный год: не позднее 31 октября 2027 года — для бакалавриата (Laurea), магистратуры (Laurea Magistrale), программ единого цикла и дипломов AFAM I и II уровня.
• На 2026/27 учебный год срок был не позднее 30 ноября 2026 года.
• Вуз может назначить для своих программ более раннюю дату — смотрите на сайте вуза.
• Для Master, PhD (dottorato), Foundation, отдельных курсов и Erasmus фиксированного срока нет, но подать нужно до начала занятий.', 'https://www.universitaly.it/en/studenti-stranieri'),
  (40, 'documents', 'Документы для визы (по данным МИД Италии)', 'Официальный список МИД Италии для визы «Studio – Immatricolazione università» (одинаков для граждан стран СНГ, проживающих в своей стране):
• анкета на национальную визу (Formulario visto nazionale);
• недавняя фотография паспортного формата;
• загранпаспорт, действующий не меньше чем на 3 месяца дольше запрашиваемой визы;
• подтверждение жилья в Италии;
• подтверждение средств к существованию (см. раздел «Деньги»);
• зачисление или предзачисление на курс (сводка заявки Universitaly, валидированная вузом).
Требования и порядок выдачи визы ежегодно уточняются отдельным документом Минобразования Италии (MUR) совместно с МИД и МВД.
• Консульский сбор за национальную визу — 50 €, обычно оплачивается в местной валюте.
• С 11 января 2025 года и для национальных виз обязательна сдача отпечатков пальцев.', 'https://vistoperitalia.esteri.it/'),
  (50, 'education_docs', 'Документы об образовании', 'Бакалавриат и программы единого цикла:
• оригинал документа о среднем образовании, полученного после не менее 12 лет обучения (если лет меньше — правила в Приложении 1 к циркуляру MUR);
• к нему — справки CIMEA о сопоставимости и подлинности или Dichiarazione di valore;
• если аттестата ещё нет — официальная временная справка от уполномоченного органа (не самостоятельно составленная);
• сертификат о вступительных испытаниях, если в вашей стране они нужны для поступления в вуз;
• переводы на итальянский — при необходимости;
• для программ не на итальянском: языковой сертификат не ниже B2 по всем четырём навыкам.
Магистратура и следующие уровни:
• официальный диплом (уровень EQF 6 или 7), дающий право продолжить обучение на следующем уровне в стране выдачи, и документы CIMEA или Dichiarazione di valore по требованию вуза.
Для стран — участниц Лиссабонской конвенции справку о сопоставимости можно скачать в системе CIMEA ARDI (ardi.cimea.it).', 'https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf'),
  (60, 'money', 'Деньги: сколько нужно и как подтвердить', '• Сумма по циркуляру MUR на 2026/27 и 2027/28: 10 179,85 € в год (ориентир — таблица Директивы МВД Италии от 01.03.2000).
• Деньги должны быть из законных и прослеживаемых источников — лучше личные или семьи (родственники до 4-й степени). Где возможно, предпочтительны счета на имя студента, в том числе с ограничением снятия.
• Посольство проверяет происхождение денег, движение по счёту и соответствие доходам семьи.
• Средства могут предоставить также итальянские организации, вузы, местные правительства или надёжные иностранные организации (стипендия, грант).
• Сама подача заявки на региональную стипендию (DSU) без официального подтверждения её назначения не засчитывается.
Важно: на сайте МИД Италии в списке документов пока указана сумма «не менее 460,28 € за каждый месяц учебного года». Точную сумму для вашего года уточните на сайте посольства.', 'https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf'),
  (70, 'housing', 'Жильё', '• Для визы нужно подтвердить подходящее жильё в Италии.
• Одна лишь заявка или право на место в студенческом общежитии жильём не считается.', 'https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf'),
  (80, 'insurance', 'Медицинская страховка', 'Страховку на лечение и госпитализацию нужно показать при подаче на permesso di soggiorno. Подходит один из вариантов:
• справка консульства о праве на медпомощь по соглашению между Италией и вашей страной;
• иностранный полис, действующий в Италии, без ограничений по тарифам экстренной госпитализации на всё время;
• полис итальянской страховой компании с заявлением страховщика об отсутствии таких ограничений.
По данным МИД Италии, студенты могут также добровольно зарегистрироваться в национальной системе здравоохранения (SSN); на членов семьи студента такая регистрация не распространяется.', 'https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf'),
  (90, 'decision', 'Как посольство принимает решение', '• Решение о визе принимает только посольство или консульство.
• Валидация заявки вузом не гарантирует ни запись в посольство, ни выдачу визы.
• Посольство оценивает «миграционный риск»: социально-экономическое положение студента и семьи, тип и качество прежнего образования, логичность выбранной программы.
• Порядок записи и возможное собеседование уточняйте на официальном сайте посольства вашей страны.', 'https://www.universitaly.it/en/studenti-stranieri'),
  (100, 'permesso', 'После приезда: permesso di soggiorno', '• В течение 8 рабочих дней после въезда по визе D нужно подать заявление на вид на жительство для учёбы (permesso di soggiorno per studio) в Квестуру города, где будете жить.
• Подача — через почтовые отделения Poste Italiane «Sportello Amico» с особым конвертом (kit) или через специальные окна в вузе, если они есть.
• На почте выдают квитанцию с логином и паролем для проверки статуса на Portale Immigrazione и сообщают дату визита в Квестуру — туда нужно прийти с фотографиями для сдачи отпечатков.
• Квитанция с почты подтверждает, что вы находитесь в Италии законно.
• Помочь с заполнением бесплатно могут патронаты и муниципалитеты (Comune). Справочная линия: 803160.', 'https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf'),
  (110, 'renewal', 'Продление permesso di soggiorno', '• Продлевать нужно в Квестуре не позже чем за 60 дней до окончания срока.
• Условие: на первом курсе сдать минимум один экзамен, на следующих — минимум два (по правилам вуза в кредитах).
• Продлевать можно не больше чем на 3 года сверх срока программы.
• Если отказаться от учёбы, право на пребывание по учебному permesso пропадает.', 'https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf'),
  (120, 'after_arrival', 'Регистрация и полезные номера', '• С действующим permesso di soggiorno нужно зарегистрироваться по месту жительства (iscrizione anagrafica) в муниципалитете (Comune).
• Экстренные номера в Италии: 112 — единый номер (Carabinieri), 113 — полиция, 118 — скорая помощь, 115 — пожарные. Звонки бесплатные.', 'https://vistoperitalia.esteri.it/infovisto?code=17_0_D')
) as v(sort_order, key, title_ru, body_ru, source_url);

insert into public.visa_missions (sort_order, country_code, country_ru, mission_name, address, phone, email, website, jurisdiction_ru, visa_center_url, source_url, academic_year, status, verification_status, verified_at)
select v.*, 'https://vistoperitalia.esteri.it/', '2027/2028', 'published', 'verified', '2026-11-25T10:00:00Z'::timestamptz from (values
  (10, 'KAZ', 'Казахстан', 'Ambasciata d''Italia in ASTANA', 'COSMONAVTOV Street, n.62 - Microrione CHUBARY- 010000 ASTANA', '+77172243390, +77172243868', 'astana.visti@esteri.it', 'https://ambastana.esteri.it', null, 'https://blsitalyvisa.com/kazakhstan/'),
  (20, 'UZB', 'Узбекистан', 'Ambasciata d''Italia in TASHKENT', 'Yusuf Xos Xodjib Str. nr. 40 - 100031 Tashkent', '+998712521119, +998712521120', 'visti.tashkent@esteri.it', 'https://ambtashkent.esteri.it', null, null),
  (30, 'KGZ', 'Кыргызстан', 'Ambasciata d''Italia in ASTANA', 'COSMONAVTOV Street, n.62 - Microrione CHUBARY- 010000 ASTANA', '+77172243390, +77172243868', 'astana.visti@esteri.it', 'https://ambastana.esteri.it', null, null),
  (40, 'TJK', 'Таджикистан', 'Ambasciata d''Italia in TASHKENT', 'Yusuf Xos Xodjib Str. nr. 40 - 100031 Tashkent', '+998712521119, +998712521120', 'visti.tashkent@esteri.it', 'https://ambtashkent.esteri.it', null, null),
  (50, 'TKM', 'Туркменистан', 'Ambasciata d''Italia in Ashgabat', 'Ul. Azady n. 139/A', '+99312970212, +99312970325', 'ashgabat.info@esteri.it', 'https://ambashgabat.esteri.it', null, null),
  (60, 'RUS', 'Россия', 'Consolato Generale d''Italia in MOSCA', 'Yakimanskaya Nabereznaya, 10 - 11', '+74957969692, +74959165451', 'visti.conmosca@esteri.it', 'https://consmosca.esteri.it', 'Вся территория России, кроме округа Генконсульства в Санкт-Петербурге, а также Туркменистан.', 'https://italy-vms.ru/it/'),
  (70, 'RUS', 'Россия', 'Consolato Generale d''Italia in SAN PIETROBURGO', 'Teatralnaya Ploshad, 10 190068', '+78123180791, +78123180792', 'visti.sanpietroburgo@esteri.it', 'https://conssanpietroburgo.esteri.it', 'Санкт-Петербург, Ленинградская, Новгородская, Вологодская, Архангельская, Псковская и Мурманская области, Республика Карелия.', 'https://italy-vms.ru/it/'),
  (80, 'BLR', 'Беларусь', 'Ambasciata d''Italia in MINSK', 'Ulitza Rakovskaya 16 b - 220004 Minsk', '+375172202969', 'minsk.ufficiovisti@esteri.it', 'https://ambminsk.esteri.it', 'Вся территория страны.', 'https://it.tlscontact.com/by/splash.php'),
  (90, 'AZE', 'Азербайджан', 'Ambasciata d''Italia in BAKU', 'Khagani Street 77a, Landmark I, AZ1010', '+994124975133, +994124975135', 'baku.visti@esteri.it', 'https://ambbaku.esteri.it', 'Территория Азербайджанской Республики.', 'https://visa.vfsglobal.com/aze/en/ita/login'),
  (100, 'ARM', 'Армения', 'Ambasciata d''Italia in JEREVAN', '5 Italia Street - 0010 Yerevan', '+37410542335, +37410542336', 'visti.jerevan@esteri.it', 'https://ambjerevan.esteri.it', null, 'https://it.tlscontact.com/am/evn/login.php'),
  (110, 'GEO', 'Грузия', 'Ambasciata d''Italia in TBILISI', 'CHITADZE 3a - 0108 - TBILISI', '+995322996418', 'visti.tbilisi@esteri.it', 'https://ambtbilisi.esteri.it', null, null),
  (120, 'MDA', 'Молдова', 'Ambasciata d''Italia in CHISINAU', '63, str. Vlaicu Parcalab, MD-2012, Chisinau, Republic of Moldova', '+37322266720', 'chisinau.visti@esteri.it', 'https://ambchisinau.esteri.it', null, null),
  (130, 'UKR', 'Украина', 'Ambasciata d''Italia in KIEV', 'Vulitsa Yaroslaviv Val, 32-B 01901 Kiev', '+380442303100, +380442303101', 'sezionevisti.kiev@esteri.it', 'https://ambkiev.esteri.it', 'Внимание: по данным МИД Италии, посольство Италии в Киеве сейчас не выдаёт визы. На время приостановки жители Украины могут подать заявление на визу (краткосрочную или долгосрочную) в посольствах и консульствах Италии в третьих странах, где они находятся законно (ст. 6.2 Регламента ЕС 810/2009).', null)
) as v(sort_order, country_code, country_ru, mission_name, address, phone, email, website, jurisdiction_ru, visa_center_url);

