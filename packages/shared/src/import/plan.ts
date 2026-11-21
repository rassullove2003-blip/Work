import template from '../../data/import-template.json';
import { CITIES, FIELDS, REGIONS } from '../dictionaries';
import { normalize } from '../filters';
import type { ApplicantCategory, RequirementType, StudyLevel, TeachingLanguage, VerificationStatus } from '../types';
import { excelSerialToIso, type Workbook } from './readers';

/* ------------------------------------------------------------------ типы -- */

export type SheetKey = 'universities' | 'programs' | 'fees' | 'requirements' | 'scholarships' | 'deadlines';

export interface ImportIssue {
  sheet: string; // название листа
  row: number; // номер строки в таблице (как видит пользователь), 0 — весь лист
  column: string; // заголовок колонки или ''
  message: string;
  level: 'error' | 'warning';
}

type Meta = {
  source_url: string | null;
  verified_at: string | null;
  verification_status: VerificationStatus;
  status: 'draft' | 'published' | 'archived';
};

/** Значения, которые пишутся в базу. `undefined` — ячейка пустая, существующее значение не трогаем. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export interface UniversityRow extends Meta {
  slug: string;
  official_name: string;
  name_ru?: string;
  name_en?: string;
  city: string;
  city_ru?: string;
  region: string;
  public_private: 'public' | 'private';
  website?: string;
  address?: string;
  description_ru?: string;
  logo_url?: string;
  image_url?: string;
  featured?: boolean;
  academic_year?: string;
}

export interface ProgramRow extends Meta {
  slug: string;
  university_slug: string;
  title_original: string;
  title_ru?: string;
  level: StudyLevel;
  fields?: string[];
  language: TeachingLanguage;
  duration_years?: number;
  ects?: number;
  program_url?: string;
  curriculum_url?: string;
  description_ru?: string;
  academic_year?: string;
}

export interface FeeRow extends Meta {
  program_slug: string;
  academic_year: string;
  applicant_category: ApplicantCategory;
  tuition_fee_min_eur?: number;
  tuition_fee_max_eur?: number;
  fee_notes_ru?: string;
}

export interface RequirementRow extends Meta {
  program_slug: string;
  academic_year: string;
  requirement_type: RequirementType;
  applicant_category: ApplicantCategory;
  title_ru: string;
  details_ru?: string;
}

export interface ScholarshipRow extends Meta {
  slug: string;
  organization: string;
  name_ru: string;
  region: string;
  website?: string;
  description_ru?: string;
  university_slugs: string[];
  academic_year?: string;
}

export interface EligibilityRow extends Meta {
  scholarship_slug: string;
  academic_year: string;
  applicant_category: ApplicantCategory;
  criterion_ru: string;
}

export interface DeadlineRow extends Meta {
  import_key: string;
  program_slug?: string;
  scholarship_slug?: string;
  title_ru: string;
  academic_year: string;
  applicant_category: ApplicantCategory;
  starts_at?: string;
  ends_at: string;
}

export interface ImportPlan {
  universities: UniversityRow[];
  programs: ProgramRow[];
  fees: FeeRow[];
  requirements: RequirementRow[];
  scholarships: ScholarshipRow[];
  eligibility: EligibilityRow[];
  deadlines: DeadlineRow[];
}

/** Что уже есть в базе — для проверки ссылок и подсчёта «создать / обновить». */
export interface ExistingKeys {
  universities: Set<string>;
  programs: Set<string>;
  scholarships: Set<string>;
  deadlines: Set<string>;
}

export interface ImportResult {
  plan: ImportPlan;
  issues: ImportIssue[];
  /** Количество строк по листам и сколько из них новые. */
  summary: Record<SheetKey, { rows: number; create: number; update: number }>;
  /** Какие листы найдены в файле. */
  foundSheets: SheetKey[];
}

/* -------------------------------------------------------- справочники -- */

const LISTS = template.lists as Record<string, string[]>;

const LEVEL_MAP: Record<string, StudyLevel> = {
  foundation: 'foundation',
  бакалавриат: 'bachelor',
  bachelor: 'bachelor',
  'laurea triennale': 'bachelor',
  магистратура: 'master',
  master: 'master',
  'laurea magistrale': 'master',
  'одноцикловая программа': 'single_cycle',
  'single cycle': 'single_cycle',
  'laurea magistrale a ciclo unico': 'single_cycle',
};
const LANGUAGE_MAP: Record<string, TeachingLanguage> = {
  английский: 'en',
  english: 'en',
  en: 'en',
  итальянский: 'it',
  italiano: 'it',
  it: 'it',
  'английский и итальянский': 'en_it',
};
const CATEGORY_MAP: Record<string, ApplicantCategory> = {
  'все абитуриенты': 'all',
  все: 'all',
  'граждане eu': 'eu',
  eu: 'eu',
  'non eu, проживающие в италии': 'non_eu_in_italy',
  'non eu в италии': 'non_eu_in_italy',
  'non eu, проживающие за рубежом': 'non_eu_abroad',
  'non eu за рубежом': 'non_eu_abroad',
  'non eu': 'non_eu_abroad',
};
const REQ_TYPE_MAP: Record<string, RequirementType> = {
  'образование (аттестат, диплом)': 'diploma',
  образование: 'diploma',
  'языковые сертификаты': 'language',
  'вступительные испытания': 'exam',
  документы: 'document',
  другое: 'other',
};
const VERIFICATION_MAP: Record<string, VerificationStatus> = {
  'не проверено': 'unverified',
  'требует проверки': 'needs_review',
  проверено: 'verified',
  устарело: 'outdated',
};
const STATUS_MAP: Record<string, Meta['status']> = {
  черновик: 'draft',
  опубликовано: 'published',
  'в архиве': 'archived',
};
const TYPE_MAP: Record<string, 'public' | 'private'> = {
  государственный: 'public',
  public: 'public',
  статале: 'public',
  частный: 'private',
  private: 'private',
};
const N = {
  LEVEL_MAP: normMap(LEVEL_MAP),
  LANGUAGE_MAP: normMap(LANGUAGE_MAP),
  CATEGORY_MAP: normMap(CATEGORY_MAP),
  REQ_TYPE_MAP: normMap(REQ_TYPE_MAP),
  VERIFICATION_MAP: normMap(VERIFICATION_MAP),
  STATUS_MAP: normMap(STATUS_MAP),
  TYPE_MAP: normMap(TYPE_MAP),
};
const YES = new Set(['да', 'yes', 'true', '1', 'si', 'sì'].map(normalize));
const NO = new Set(['нет', 'no', 'false', '0'].map(normalize));

function key(s: string): string {
  return normalize(s).replace(/\s*,\s*/g, ', ');
}

/** Ключи справочников приводим к тому же виду, что и значения из таблицы. */
function normMap<T>(m: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [key(k), v]));
}

function regionId(v: string): string | null {
  const n = normalize(v);
  for (const [id, r] of Object.entries(REGIONS)) {
    if (normalize(r.ru) === n || normalize(r.it) === n || normalize(id) === n) return id;
  }
  return null;
}

export function slugify(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cityFromItalian(v: string): { id: string; ru?: string } {
  const n = normalize(v);
  const known = CITIES.find((c) => normalize(c.it) === n || normalize(c.ru) === n || c.id === n);
  return known ? { id: known.id, ru: known.ru } : { id: slugify(v) };
}

const FIELD_BY_LABEL = new Map(FIELDS.flatMap((f) => [[normalize(f.ru), f.id], [normalize(f.id), f.id]] as [string, string][]));

/* ------------------------------------------------------- разбор листа -- */

const SHEETS: { key: SheetKey; title: string; headers: string[]; required: Set<string> }[] = template.sheets.map((sh) => {
  const cols = [
    ...sh.columns,
    ...template.verification.filter((c) => !('only' in c) || (c.only as string[]).includes(sh.key)),
  ] as { h: string; req?: boolean }[];
  return {
    key: sh.key as SheetKey,
    title: sh.title,
    headers: cols.map((c) => c.h),
    required: new Set(cols.filter((c) => c.req).map((c) => c.h)),
  };
});

export const IMPORT_SHEETS = SHEETS.map((s) => ({ key: s.key, title: s.title }));

const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const YEAR_RE = /^\d{4}\/\d{4}$/;
const URL_RE = /^https?:\/\/\S+$/i;

const cleanHeader = (h: string) => h.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/** Находит лист по названию или, для CSV без названия, по заголовкам. */
export function matchSheet(name: string, headerRow: string[]): SheetKey | null {
  const byName = SHEETS.find((s) => normalize(s.title) === normalize(name) || s.key === normalize(name));
  if (byName) return byName.key;
  const hs = new Set(headerRow.map((h) => normalize(cleanHeader(h))));
  let best: { key: SheetKey; score: number } | null = null;
  for (const s of SHEETS) {
    const score = s.headers.filter((h) => hs.has(normalize(h))).length / s.headers.length;
    if (score > 0.6 && (!best || score > best.score)) best = { key: s.key, score };
  }
  return best?.key ?? null;
}

class RowReader {
  constructor(
    private sheet: string,
    private rowNum: number,
    private cells: Record<string, string>,
    private issues: ImportIssue[],
  ) {}
  err(column: string, message: string) {
    this.issues.push({ sheet: this.sheet, row: this.rowNum, column, message, level: 'error' });
  }
  str(h: string, required = false): string | undefined {
    const v = (this.cells[h] ?? '').trim();
    if (!v) {
      if (required) this.err(h, 'Обязательное поле не заполнено');
      return undefined;
    }
    return v;
  }
  code(h: string, required = false): string | undefined {
    const v = this.str(h, required);
    if (v && !CODE_RE.test(v)) {
      this.err(h, `«${v}»: код должен содержать только маленькие латинские буквы, цифры и дефис`);
      return undefined;
    }
    return v;
  }
  year(h: string, required = false): string | undefined {
    const v = this.str(h, required);
    if (v && !YEAR_RE.test(v)) {
      this.err(h, `«${v}»: учебный год пишется так: 2026/2027`);
      return undefined;
    }
    return v;
  }
  url(h: string): string | undefined {
    const v = this.str(h);
    if (v && !URL_RE.test(v)) {
      this.err(h, `«${v}»: ссылка должна начинаться с https://`);
      return undefined;
    }
    return v;
  }
  num(h: string): number | undefined {
    const v = this.str(h);
    if (v == null) return undefined;
    const n = Number(v.replace(/[\s €]/g, '').replace(',', '.'));
    if (!isFinite(n) || n < 0) {
      this.err(h, `«${v}»: нужно неотрицательное число`);
      return undefined;
    }
    return n;
  }
  int(h: string, min: number, max: number): number | undefined {
    const n = this.num(h);
    if (n == null) return undefined;
    if (!Number.isInteger(n) || n < min || n > max) {
      this.err(h, `«${n}»: нужно целое число от ${min} до ${max}`);
      return undefined;
    }
    return n;
  }
  date(h: string, required = false): string | undefined {
    const v = this.str(h, required);
    if (!v) return undefined;
    let iso: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) iso = v.slice(0, 10);
    else if (/^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(v)) {
      const [d, m, y] = v.split(/[./]/);
      iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    } else if (/^\d{5}(\.\d+)?$/.test(v)) iso = excelSerialToIso(Number(v));
    if (!iso || isNaN(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) {
      this.err(h, `«${v}»: дата пишется так: 2027-03-31`);
      return undefined;
    }
    return iso;
  }
  pick<T>(h: string, map: Record<string, T>, required = false, listName?: string): T | undefined {
    const v = this.str(h, required);
    if (!v) return undefined;
    const r = map[key(v)];
    if (r === undefined) {
      const allowed = listName ? LISTS[listName]?.join(', ') : Object.keys(map).join(', ');
      this.err(h, `«${v}»: недопустимое значение. Возможные: ${allowed}`);
    }
    return r;
  }
  bool(h: string): boolean | undefined {
    const v = this.str(h);
    if (!v) return undefined;
    const n = normalize(v);
    if (YES.has(n)) return true;
    if (NO.has(n)) return false;
    this.err(h, `«${v}»: напишите «да» или «нет»`);
    return undefined;
  }
  region(h: string, required = false): string | undefined {
    const v = this.str(h, required);
    if (!v) return undefined;
    const id = regionId(v);
    if (!id) this.err(h, `«${v}»: регион не найден. Выберите из листа «Справочник»`);
    return id ?? undefined;
  }
  meta(): Meta {
    const source_url = this.url('Источник') ?? null;
    const verified_at = this.date('Дата проверки') ?? null;
    const verification_status = this.pick('Статус проверки', N.VERIFICATION_MAP, false, 'Статус проверки') ?? 'unverified';
    const status = this.pick('Публикация', N.STATUS_MAP, false, 'Публикация') ?? 'draft';
    if (verification_status === 'verified' && (!source_url || !verified_at)) {
      this.err('Статус проверки', '«Проверено» требует заполненных «Источник» и «Дата проверки»');
    }
    return { source_url, verified_at: verified_at ? `${verified_at}T12:00:00Z` : null, verification_status, status };
  }
}

/* ------------------------------------------------------------- главное -- */

const emptySummary = () => ({ rows: 0, create: 0, update: 0 });

/**
 * Проверяет таблицу и строит план загрузки. Если в результате есть ошибки (level = error),
 * загружать нельзя. Ничего не пишет в базу.
 */
export function buildImportPlan(wb: Workbook, existing: ExistingKeys): ImportResult {
  const issues: ImportIssue[] = [];
  const plan: ImportPlan = { universities: [], programs: [], fees: [], requirements: [], scholarships: [], eligibility: [], deadlines: [] };
  const summary = Object.fromEntries(SHEETS.map((s) => [s.key, emptySummary()])) as ImportResult['summary'];
  const foundSheets: SheetKey[] = [];

  // Сопоставляем листы файла с листами шаблона.
  const bySheet = new Map<SheetKey, { name: string; rows: string[][] }>();
  for (const [name, rows] of Object.entries(wb)) {
    const headerIdx = rows.findIndex((r) => r.some((c) => c && c.trim()));
    if (headerIdx < 0) continue;
    const k = matchSheet(name, rows[headerIdx]);
    if (!k) continue;
    if (bySheet.has(k)) {
      issues.push({ sheet: name, row: 0, column: '', message: `Лист «${SHEETS.find((s) => s.key === k)!.title}» встречается дважды`, level: 'error' });
      continue;
    }
    bySheet.set(k, { name, rows: rows.slice(headerIdx) });
    foundSheets.push(k);
  }
  if (bySheet.size === 0) {
    issues.push({ sheet: '', row: 0, column: '', message: 'Не найдено ни одного листа шаблона UniItalia. Проверьте названия листов и заголовки колонок.', level: 'error' });
  }

  /** Перебор строк листа: проверка заголовков, пропуск пустых строк. */
  function each(k: SheetKey, fn: (r: RowReader, rowNum: number) => void) {
    const sheetDef = SHEETS.find((s) => s.key === k)!;
    const found = bySheet.get(k);
    if (!found) return;
    const header = found.rows[0].map((h) => cleanHeader(h ?? ''));
    const index = new Map<string, number>();
    header.forEach((h, i) => {
      const def = sheetDef.headers.find((d) => normalize(d) === normalize(h));
      if (def) index.set(def, i);
      else if (h) issues.push({ sheet: found.name, row: 1, column: h, message: 'Неизвестная колонка, она будет пропущена', level: 'warning' });
    });
    for (const req of sheetDef.required) {
      if (!index.has(req)) issues.push({ sheet: found.name, row: 1, column: req, message: 'Нет обязательной колонки', level: 'error' });
    }
    found.rows.slice(1).forEach((cells, i) => {
      if (!cells || !cells.some((c) => c && String(c).trim())) return;
      const rowNum = i + 2;
      const named: Record<string, string> = {};
      for (const [h, idx] of index) named[h] = String(cells[idx] ?? '');
      summary[k].rows++;
      fn(new RowReader(found.name, rowNum, named, issues), rowNum);
    });
  }

  const dup = (k: SheetKey, seen: Map<string, number>, id: string, rowNum: number, column: string) => {
    const prev = seen.get(id);
    if (prev) {
      issues.push({ sheet: bySheet.get(k)!.name, row: rowNum, column, message: `Повтор: такая же строка уже есть в строке ${prev}`, level: 'error' });
      return true;
    }
    seen.set(id, rowNum);
    return false;
  };

  // --- Университеты
  const uniSeen = new Map<string, number>();
  each('universities', (r, n) => {
    const slug = r.code('Код вуза', true);
    const official_name = r.str('Официальное название', true);
    const cityIt = r.str('Город (по-итальянски)', true);
    const region = r.region('Регион', true);
    const public_private = r.pick('Тип вуза', N.TYPE_MAP, true, 'Тип вуза');
    const city = cityIt ? cityFromItalian(cityIt) : null;
    const row: UniversityRow = {
      slug: slug ?? '',
      official_name: official_name ?? '',
      name_ru: r.str('Название на русском'),
      name_en: r.str('Название на английском'),
      city: city?.id ?? '',
      city_ru: r.str('Город (по-русски)') ?? city?.ru,
      region: region ?? '',
      public_private: public_private ?? 'public',
      website: r.url('Официальный сайт'),
      address: r.str('Адрес'),
      description_ru: r.str('Описание на русском'),
      logo_url: r.url('Ссылка на логотип'),
      image_url: r.url('Ссылка на фото'),
      featured: r.bool('Популярный'),
      academic_year: r.year('Учебный год данных'),
      ...r.meta(),
    };
    if (!slug || dup('universities', uniSeen, slug, n, 'Код вуза')) return;
    plan.universities.push(row);
  });
  const uniKnown = (s: string) => uniSeen.has(s) || existing.universities.has(s);

  // --- Программы
  const progSeen = new Map<string, number>();
  each('programs', (r, n) => {
    const slug = r.code('Код программы', true);
    const uni = r.code('Код вуза', true);
    if (uni && !uniKnown(uni)) r.err('Код вуза', `Вуз «${uni}» не найден ни в листе «Университеты», ни в приложении`);
    const fieldsRaw = r.str('Направления');
    const fields: string[] = [];
    for (const f of (fieldsRaw ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
      const id = FIELD_BY_LABEL.get(normalize(f));
      if (id) fields.push(id);
      else r.err('Направления', `«${f}»: такого направления нет в листе «Справочник»`);
    }
    const row: ProgramRow = {
      slug: slug ?? '',
      university_slug: uni ?? '',
      title_original: r.str('Название в оригинале', true) ?? '',
      title_ru: r.str('Название на русском'),
      level: r.pick('Уровень', N.LEVEL_MAP, true, 'Уровень') ?? 'bachelor',
      fields: fieldsRaw ? fields : undefined,
      language: r.pick('Язык обучения', N.LANGUAGE_MAP, true, 'Язык обучения') ?? 'en',
      duration_years: r.int('Длительность, лет', 1, 7),
      ects: r.int('ECTS', 30, 420),
      program_url: r.url('Страница программы'),
      curriculum_url: r.url('Учебный план'),
      description_ru: r.str('Описание на русском'),
      academic_year: r.year('Учебный год данных'),
      ...r.meta(),
    };
    if (!slug || dup('programs', progSeen, slug, n, 'Код программы')) return;
    plan.programs.push(row);
  });
  const progKnown = (s: string) => progSeen.has(s) || existing.programs.has(s);

  // --- Стоимость
  const feeSeen = new Map<string, number>();
  each('fees', (r, n) => {
    const program_slug = r.code('Код программы', true);
    if (program_slug && !progKnown(program_slug)) r.err('Код программы', `Программа «${program_slug}» не найдена`);
    const academic_year = r.year('Учебный год', true);
    const applicant_category = r.pick('Для кого', N.CATEGORY_MAP, true, 'Для кого');
    const min = r.num('Стоимость от, € в год');
    const max = r.num('Стоимость до, € в год');
    if (min != null && max != null && max < min) r.err('Стоимость до, € в год', '«до» меньше, чем «от»');
    const row: FeeRow = {
      program_slug: program_slug ?? '',
      academic_year: academic_year ?? '',
      applicant_category: applicant_category ?? 'all',
      tuition_fee_min_eur: min,
      tuition_fee_max_eur: max,
      fee_notes_ru: r.str('Примечание'),
      ...r.meta(),
    };
    if (!program_slug || !academic_year || !applicant_category) return;
    if (dup('fees', feeSeen, `${program_slug}|${academic_year}|${applicant_category}`, n, 'Для кого')) return;
    plan.fees.push(row);
  });

  // --- Требования: одна строка таблицы → до 4 записей (для всех / EU / Non-EU за рубежом / Non-EU в Италии)
  const reqSeen = new Map<string, number>();
  const REQ_COLS: [ApplicantCategory, string][] = [
    ['all', 'Для всех'],
    ['eu', 'EU'],
    ['non_eu_abroad', 'Non-EU за рубежом'],
    ['non_eu_in_italy', 'Non-EU в Италии'],
  ];
  each('requirements', (r, n) => {
    const program_slug = r.code('Код программы', true);
    if (program_slug && !progKnown(program_slug)) r.err('Код программы', `Программа «${program_slug}» не найдена`);
    const academic_year = r.year('Учебный год', true);
    const requirement_type = r.pick('Тип требования', N.REQ_TYPE_MAP, true, 'Тип требования');
    const meta = r.meta();
    let any = false;
    for (const [cat, prefix] of REQ_COLS) {
      const title = r.str(`${prefix}: требование`);
      const details = r.str(`${prefix}: подробности`);
      if (!title && details) r.err(`${prefix}: требование`, 'Подробности заполнены, а само требование — нет');
      if (!title) continue;
      any = true;
      if (!program_slug || !academic_year || !requirement_type) continue;
      if (dup('requirements', reqSeen, `${program_slug}|${academic_year}|${requirement_type}|${cat}`, n, `${prefix}: требование`)) continue;
      plan.requirements.push({ program_slug, academic_year, requirement_type, applicant_category: cat, title_ru: title, details_ru: details, ...meta });
    }
    if (!any) r.err('Для всех: требование', 'Заполните хотя бы одно требование: для всех, EU или Non-EU');
  });

  // --- Стипендии
  const schSeen = new Map<string, number>();
  const eligSeen = new Map<string, number>();
  each('scholarships', (r, n) => {
    const slug = r.code('Код стипендии', true);
    const codes = (r.str('Коды вузов') ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    for (const c of codes) {
      if (!CODE_RE.test(c)) r.err('Коды вузов', `«${c}»: неверный код вуза`);
      else if (!uniKnown(c)) r.err('Коды вузов', `Вуз «${c}» не найден`);
    }
    const academic_year = r.year('Учебный год');
    const meta = r.meta();
    const row: ScholarshipRow = {
      slug: slug ?? '',
      organization: r.str('Организация', true) ?? '',
      name_ru: r.str('Название на русском', true) ?? '',
      region: r.region('Регион', true) ?? '',
      website: r.url('Официальный сайт'),
      description_ru: r.str('Описание'),
      university_slugs: codes,
      academic_year,
      ...meta,
    };
    const conds: [ApplicantCategory, string][] = [
      ['eu', 'Условия EU'],
      ['non_eu_abroad', 'Условия Non-EU за рубежом'],
      ['non_eu_in_italy', 'Условия Non-EU в Италии'],
    ];
    const elig = conds.map(([cat, h]) => [cat, r.str(h)] as const).filter(([, v]) => v);
    if (elig.length && !academic_year) r.err('Учебный год', 'Для условий стипендии укажите учебный год');
    if (!slug || dup('scholarships', schSeen, slug, n, 'Код стипендии')) return;
    plan.scholarships.push(row);
    if (academic_year) {
      for (const [cat, text] of elig) {
        if (dup('scholarships', eligSeen, `${slug}|${academic_year}|${cat}`, n, 'Условия')) continue;
        plan.eligibility.push({ scholarship_slug: slug, academic_year, applicant_category: cat, criterion_ru: text!, ...meta });
      }
    }
  });
  const schKnown = (s: string) => schSeen.has(s) || existing.scholarships.has(s);

  // --- Дедлайны
  const dlSeen = new Map<string, number>();
  each('deadlines', (r, n) => {
    const import_key = r.code('Код дедлайна', true);
    const program_slug = r.code('Код программы');
    const scholarship_slug = r.code('Код стипендии');
    if (!program_slug && !scholarship_slug) r.err('Код программы', 'Укажите код программы или код стипендии');
    if (program_slug && !progKnown(program_slug)) r.err('Код программы', `Программа «${program_slug}» не найдена`);
    if (scholarship_slug && !schKnown(scholarship_slug)) r.err('Код стипендии', `Стипендия «${scholarship_slug}» не найдена`);
    const starts = r.date('Дата начала');
    const ends = r.date('Крайний срок', true);
    if (starts && ends && starts > ends) r.err('Дата начала', 'Дата начала позже крайнего срока');
    const row: DeadlineRow = {
      import_key: import_key ?? '',
      program_slug,
      scholarship_slug,
      title_ru: r.str('Название срока', true) ?? '',
      academic_year: r.year('Учебный год', true) ?? '',
      applicant_category: r.pick('Для кого', N.CATEGORY_MAP, true, 'Для кого') ?? 'all',
      starts_at: starts ? `${starts}T00:00:00Z` : undefined,
      ends_at: ends ? `${ends}T23:59:00Z` : '',
      ...r.meta(),
    };
    if (!import_key || dup('deadlines', dlSeen, import_key, n, 'Код дедлайна')) return;
    plan.deadlines.push(row);
  });

  // Сводка «создать / обновить».
  const count = (k: SheetKey, keys: string[], have: Set<string> | null) => {
    summary[k].create = have ? keys.filter((x) => !have.has(x)).length : keys.length;
    summary[k].update = keys.length - summary[k].create;
  };
  count('universities', plan.universities.map((x) => x.slug), existing.universities);
  count('programs', plan.programs.map((x) => x.slug), existing.programs);
  count('scholarships', plan.scholarships.map((x) => x.slug), existing.scholarships);
  count('deadlines', plan.deadlines.map((x) => x.import_key), existing.deadlines);
  summary.fees = { rows: summary.fees.rows, create: plan.fees.length, update: 0 };
  summary.requirements = { rows: summary.requirements.rows, create: plan.requirements.length, update: 0 };

  issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return { plan, issues, summary, foundSheets };
}

export function hasErrors(result: ImportResult): boolean {
  return result.issues.some((i) => i.level === 'error');
}
