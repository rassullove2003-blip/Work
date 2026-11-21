import type { StudyLevel, TeachingLanguage, PublicPrivate, VerificationStatus } from './types';

export interface CityInfo {
  id: string;
  ru: string;
  it: string;
  region: string;
}

/** Города каталога. id — латиница, ru — подпись в интерфейсе, it — официальное название. */
export const CITIES: CityInfo[] = [
  { id: 'milan', ru: 'Милан', it: 'Milano', region: 'lombardy' },
  { id: 'rome', ru: 'Рим', it: 'Roma', region: 'lazio' },
  { id: 'bologna', ru: 'Болонья', it: 'Bologna', region: 'emilia-romagna' },
  { id: 'turin', ru: 'Турин', it: 'Torino', region: 'piedmont' },
  { id: 'venice', ru: 'Венеция', it: 'Venezia', region: 'veneto' },
  { id: 'florence', ru: 'Флоренция', it: 'Firenze', region: 'tuscany' },
  { id: 'padua', ru: 'Падуя', it: 'Padova', region: 'veneto' },
  { id: 'pisa', ru: 'Пиза', it: 'Pisa', region: 'tuscany' },
  { id: 'pavia', ru: 'Павия', it: 'Pavia', region: 'lombardy' },
  { id: 'palermo', ru: 'Палермо', it: 'Palermo', region: 'sicily' },
  { id: 'naples', ru: 'Неаполь', it: 'Napoli', region: 'campania' },
  { id: 'siena', ru: 'Сиена', it: 'Siena', region: 'tuscany' },
  { id: 'trento', ru: 'Тренто', it: 'Trento', region: 'trentino-alto-adige' },
  { id: 'verona', ru: 'Верона', it: 'Verona', region: 'veneto' },
  { id: 'parma', ru: 'Парма', it: 'Parma', region: 'emilia-romagna' },
  { id: 'perugia', ru: 'Перуджа', it: 'Perugia', region: 'umbria' },
  { id: 'genoa', ru: 'Генуя', it: 'Genova', region: 'liguria' },
  { id: 'messina', ru: 'Мессина', it: 'Messina', region: 'sicily' },
  { id: 'salerno', ru: 'Салерно', it: 'Salerno', region: 'campania' },
  { id: 'cassino', ru: 'Кассино', it: 'Cassino', region: 'lazio' },
  { id: 'pieve-emanuele', ru: 'Пьеве-Эмануэле', it: 'Pieve Emanuele', region: 'lombardy' },
  { id: 'bari', ru: 'Бари', it: 'Bari', region: 'apulia' },
  { id: 'catania', ru: 'Катания', it: 'Catania', region: 'sicily' },
  { id: 'rende', ru: 'Ренде (Козенца)', it: 'Rende', region: 'calabria' },
  { id: 'bergamo', ru: 'Бергамо', it: 'Bergamo', region: 'lombardy' },
  { id: 'brescia', ru: 'Брешиа', it: 'Brescia', region: 'lombardy' },
  { id: 'modena', ru: 'Модена', it: 'Modena', region: 'emilia-romagna' },
  { id: 'ferrara', ru: 'Феррара', it: 'Ferrara', region: 'emilia-romagna' },
  { id: 'trieste', ru: 'Триест', it: 'Trieste', region: 'friuli-venezia-giulia' },
  { id: 'udine', ru: 'Удине', it: 'Udine', region: 'friuli-venezia-giulia' },
  { id: 'laquila', ru: "Л'Акуила", it: "L'Aquila", region: 'abruzzo' },
];

/** Города, которые показываются на главной в блоке «Университеты по городам». */
export const HOME_CITIES = [
  'milan', 'rome', 'bologna', 'turin', 'venice', 'florence', 'padua', 'pisa', 'pavia', 'palermo', 'naples',
];

export const REGIONS: Record<string, { ru: string; it: string }> = {
  lombardy: { ru: 'Ломбардия', it: 'Lombardia' },
  lazio: { ru: 'Лацио', it: 'Lazio' },
  'emilia-romagna': { ru: 'Эмилия-Романья', it: 'Emilia-Romagna' },
  piedmont: { ru: 'Пьемонт', it: 'Piemonte' },
  veneto: { ru: 'Венето', it: 'Veneto' },
  tuscany: { ru: 'Тоскана', it: 'Toscana' },
  sicily: { ru: 'Сицилия', it: 'Sicilia' },
  campania: { ru: 'Кампания', it: 'Campania' },
  'trentino-alto-adige': { ru: 'Трентино — Альто-Адидже', it: 'Trentino-Alto Adige' },
  umbria: { ru: 'Умбрия', it: 'Umbria' },
  liguria: { ru: 'Лигурия', it: 'Liguria' },
  apulia: { ru: 'Апулия', it: 'Puglia' },
  calabria: { ru: 'Калабрия', it: 'Calabria' },
  'friuli-venezia-giulia': { ru: 'Фриули — Венеция-Джулия', it: 'Friuli-Venezia Giulia' },
  abruzzo: { ru: 'Абруццо', it: 'Abruzzo' },
  marche: { ru: 'Марке', it: 'Marche' },
  molise: { ru: 'Молизе', it: 'Molise' },
  basilicata: { ru: 'Базиликата', it: 'Basilicata' },
  sardinia: { ru: 'Сардиния', it: 'Sardegna' },
  'aosta-valley': { ru: "Валле-д'Аоста", it: "Valle d'Aosta" },
};

export const LEVELS: Record<StudyLevel, { ru: string; it: string }> = {
  foundation: { ru: 'Foundation', it: 'Foundation year' },
  bachelor: { ru: 'Бакалавриат', it: 'Laurea triennale' },
  master: { ru: 'Магистратура', it: 'Laurea magistrale' },
  single_cycle: { ru: 'Одноцикловая программа', it: 'Laurea magistrale a ciclo unico' },
};

export const LANGUAGES: Record<TeachingLanguage, string> = {
  en: 'Английский',
  it: 'Итальянский',
  en_it: 'Английский и итальянский',
};

export const UNIVERSITY_TYPES: Record<PublicPrivate, string> = {
  public: 'Государственный',
  private: 'Частный',
};

/** Направления обучения из ТЗ (раздел 05). */
export const FIELDS: { id: string; ru: string }[] = [
  { id: 'economics', ru: 'Экономика' },
  { id: 'finance', ru: 'Финансы' },
  { id: 'business', ru: 'Бизнес' },
  { id: 'management', ru: 'Менеджмент' },
  { id: 'marketing', ru: 'Маркетинг' },
  { id: 'international_business', ru: 'Международный бизнес' },
  { id: 'computer_science', ru: 'Computer Science' },
  { id: 'ai', ru: 'Искусственный интеллект (AI)' },
  { id: 'data_science', ru: 'Data Science' },
  { id: 'engineering', ru: 'Инженерия' },
  { id: 'mechanical_engineering', ru: 'Mechanical Engineering' },
  { id: 'architecture', ru: 'Архитектура' },
  { id: 'medicine', ru: 'Медицина' },
  { id: 'dentistry', ru: 'Стоматология' },
  { id: 'chemistry', ru: 'Химия' },
  { id: 'psychology', ru: 'Психология' },
  { id: 'biology', ru: 'Биология' },
  { id: 'political_science', ru: 'Политология' },
  { id: 'international_relations', ru: 'Международные отношения' },
  { id: 'law', ru: 'Право' },
  { id: 'fashion', ru: 'Мода' },
  { id: 'design', ru: 'Дизайн' },
  { id: 'art', ru: 'Искусство' },
  { id: 'tourism', ru: 'Туризм' },
  { id: 'agriculture', ru: 'Сельское хозяйство' },
  { id: 'mathematics', ru: 'Математика' },
  { id: 'physics', ru: 'Физика' },
];

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.id, f.ru]));

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: 'Проверено',
  needs_review: 'Требует проверки',
  unverified: 'Не проверено',
  outdated: 'Устарело',
};

export function cityName(id: string, cityRu?: string | null): string {
  return cityRu || CITIES.find((c) => c.id === id)?.ru || id;
}

export function regionName(id: string): string {
  return REGIONS[id]?.ru ?? id;
}

/** Термины DSU с объяснением простым языком (раздел 07 ТЗ). */
export const DSU_GLOSSARY: { term: string; ru: string }[] = [
  {
    term: 'DSU (Diritto allo Studio Universitario)',
    ru: 'Государственная система поддержки студентов в Италии. Управляется региональными агентствами (например, LazioDiSCo, ER.GO), а в некоторых регионах — самими университетами. Может включать денежную стипендию, место в общежитии и питание в столовой.',
  },
  {
    term: 'Bando',
    ru: 'Официальный конкурсный документ на конкретный учебный год. Только в нём указаны актуальные условия, пороги доходов, размер стипендии и сроки. Правила разных лет и регионов отличаются.',
  },
  {
    term: 'ISEE',
    ru: 'Индикатор экономического положения семьи в Италии. Рассчитывается по доходам и имуществу всех членов семьи.',
  },
  {
    term: 'ISEE Parificato',
    ru: 'Аналог ISEE для студентов, чья семья живёт и получает доходы за пределами Италии. Рассчитывается в аккредитованных центрах (CAF) на основе иностранных документов о доходах и имуществе.',
  },
  {
    term: 'ISEEU',
    ru: 'ISEE для получения услуг в сфере университетского образования (ISEE per il diritto allo studio universitario). Учитывает особые правила определения состава семьи студента.',
  },
  {
    term: 'In sede',
    ru: 'Студент, который живёт в том же городе, где учится. Обычно получает наименьший размер стипендии.',
  },
  {
    term: 'Pendolare',
    ru: 'Студент, который ежедневно ездит на учёбу из другого населённого пункта.',
  },
  {
    term: 'Fuori sede',
    ru: 'Иногородний студент, который снимает жильё в городе учёбы. Для этого статуса часто требуется договор аренды — проверьте условия в bando.',
  },
  {
    term: 'Idoneo',
    ru: 'Студент, который соответствует условиям стипендии, но пока не получил её, например из-за нехватки средств.',
  },
  {
    term: 'Vincitore',
    ru: 'Студент, которому стипендия назначена (победитель конкурса).',
  },
];

export const DSU_FAQ: { q: string; a: string }[] = [
  {
    q: 'Учитываются ли доходы и имущество семьи?',
    a: 'Да. Оценка строится на показателях ISEE или ISEE Parificato, в которые входят доходы и имущество семьи. Точные пороги указываются в bando на конкретный учебный год.',
  },
  {
    q: 'Какие документы нужны из моей страны?',
    a: 'Обычно требуются документы о составе семьи, доходах и имуществе, переведённые и легализованные по установленным правилам. Конкретный перечень и требования к переводу/легализации зависят от региона, вашей страны и года — смотрите bando и сайт организации.',
  },
  {
    q: 'Нужен ли договор аренды?',
    a: 'Для статуса fuori sede многие организации требуют зарегистрированный договор аренды. Условия и сроки различаются — проверьте актуальный bando.',
  },
  {
    q: 'Когда выплачивается стипендия?',
    a: 'Сроки и порядок выплат устанавливает каждая организация. Часто выплата делится на части и зависит от выполнения учебных требований. Даты указаны в bando.',
  },
  {
    q: 'Что в Ломбардии?',
    a: 'В Ломбардии стипендии DSU, как правило, выдают сами университеты. Ищите раздел «Diritto allo studio» на сайте вашего университета.',
  },
];

export const APPLICANT_CATEGORIES: Record<import('./types').ApplicantCategory, string> = {
  all: 'Все абитуриенты',
  eu: 'Граждане EU',
  non_eu_in_italy: 'Non-EU, проживающие в Италии',
  non_eu_abroad: 'Non-EU, проживающие за рубежом',
};

export const ROLE_LABELS: Record<'admin' | 'curator' | 'student', string> = {
  admin: 'Администратор',
  curator: 'Куратор',
  student: 'Студент',
};

/** Типы требований и их подписи — в порядке показа на странице программы. */
export const REQUIREMENT_TYPES: Record<import('./types').RequirementType, string> = {
  diploma: 'Образование (аттестат, диплом)',
  language: 'Языковые сертификаты',
  exam: 'Вступительные испытания',
  document: 'Документы',
  other: 'Другое',
};
