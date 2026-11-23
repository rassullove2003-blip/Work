import type { ProgramWithUniversity, PublicPrivate, Scholarship, StudyLevel, TeachingLanguage, University } from './types';
import { CITIES, FIELD_LABELS, LEVELS, REGIONS } from './dictionaries';

/** Нормализация для поиска: регистр, ё/е, диакритика, апострофы. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`"«»]/g, '')
    .replace(/[-–—_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cityTokens(cityId: string): string[] {
  const c = CITIES.find((x) => x.id === cityId);
  return c ? [c.ru, c.it, c.id] : [cityId];
}

function regionTokens(regionId: string): string[] {
  const r = REGIONS[regionId];
  return r ? [r.ru, r.it] : [regionId];
}

export function universityHaystack(u: University): string {
  return normalize(
    [u.official_name, u.name_en ?? '', u.name_ru ?? '', u.slug, ...cityTokens(u.city), ...regionTokens(u.region)].join(' '),
  );
}

export function programHaystack(p: ProgramWithUniversity): string {
  return normalize(
    [
      p.title_original,
      p.title_ru ?? '',
      LEVELS[p.level]?.ru ?? '',
      ...p.fields.map((f) => FIELD_LABELS[f] ?? f),
      universityHaystack(p.university),
    ].join(' '),
  );
}

/** Все слова запроса должны встретиться (AND), порядок не важен. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  return words.every((w) => haystack.includes(w));
}

export type ProgramSort = 'relevance' | 'name' | 'duration_asc' | 'university';

export interface ProgramFilters {
  query: string;
  levels: StudyLevel[];
  fields: string[];
  languages: TeachingLanguage[];
  cities: string[];
  regions: string[];
  universityTypes: PublicPrivate[];
  universities: string[];
  /** Только программы с подтверждённой стоимостью не выше указанной. */
  maxFeeEur: number | null;
  sort: ProgramSort;
}

export const EMPTY_PROGRAM_FILTERS: ProgramFilters = {
  query: '',
  levels: [],
  fields: [],
  languages: [],
  cities: [],
  regions: [],
  universityTypes: [],
  universities: [],
  maxFeeEur: null,
  sort: 'relevance',
};

export function countActiveProgramFilters(f: ProgramFilters): number {
  return (
    f.levels.length +
    f.fields.length +
    f.languages.length +
    f.cities.length +
    f.regions.length +
    f.universityTypes.length +
    f.universities.length +
    (f.maxFeeEur != null ? 1 : 0)
  );
}

function inList<T>(list: T[], value: T): boolean {
  return list.length === 0 || list.includes(value);
}

export function filterPrograms(programs: ProgramWithUniversity[], f: ProgramFilters): ProgramWithUniversity[] {
  const scored = programs
    .filter((p) => inList(f.levels, p.level))
    .filter((p) => f.fields.length === 0 || p.fields.some((x) => f.fields.includes(x)))
    .filter((p) => f.languages.length === 0 || (p.language != null && f.languages.includes(p.language)) || (p.language === 'en_it' && f.languages.some((l) => l === 'en' || l === 'it')))
    .filter((p) => inList(f.cities, p.university.city))
    .filter((p) => inList(f.regions, p.university.region))
    .filter((p) => inList(f.universityTypes, p.university.public_private))
    .filter((p) => inList(f.universities, p.university.slug))
    // Неизвестная стоимость не считается «дешёвой»: такие программы исключаются.
    .filter((p) => f.maxFeeEur == null || (p.tuition_fee_min_eur != null && p.tuition_fee_min_eur <= f.maxFeeEur))
    .map((p) => {
      const hay = programHaystack(p);
      if (f.query && !matchesQuery(hay, f.query)) return null;
      const q = normalize(f.query);
      const title = normalize(`${p.title_original} ${p.title_ru ?? ''}`);
      const score = q ? (title.startsWith(q) ? 3 : title.includes(q) ? 2 : 1) : 0;
      return { p, score };
    })
    .filter((x): x is { p: ProgramWithUniversity; score: number } => x !== null);

  const byName = (a: ProgramWithUniversity, b: ProgramWithUniversity) => a.title_original.localeCompare(b.title_original);
  scored.sort((a, b) => {
    switch (f.sort) {
      case 'name':
        return byName(a.p, b.p);
      case 'duration_asc':
        return (a.p.duration_years ?? 99) - (b.p.duration_years ?? 99) || byName(a.p, b.p);
      case 'university':
        return a.p.university.official_name.localeCompare(b.p.university.official_name) || byName(a.p, b.p);
      default:
        return b.score - a.score || byName(a.p, b.p);
    }
  });
  return scored.map((x) => x.p);
}

export interface UniversityFilters {
  query: string;
  cities: string[];
  regions: string[];
  types: PublicPrivate[];
}

export const EMPTY_UNIVERSITY_FILTERS: UniversityFilters = { query: '', cities: [], regions: [], types: [] };

export function filterUniversities(list: University[], f: UniversityFilters): University[] {
  return list
    .filter((u) => inList(f.cities, u.city))
    .filter((u) => inList(f.regions, u.region))
    .filter((u) => inList(f.types, u.public_private))
    .filter((u) => !f.query || matchesQuery(universityHaystack(u), f.query))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.official_name.localeCompare(b.official_name));
}

export function filterScholarships(list: Scholarship[], query: string, region: string | null): Scholarship[] {
  return list
    .filter((s) => !region || s.region === region)
    .filter((s) => !query || matchesQuery(normalize(`${s.organization} ${s.name_ru} ${regionTokens(s.region).join(' ')}`), query))
    .sort((a, b) => a.name_ru.localeCompare(b.name_ru, 'ru'));
}

/** Подсказки для строки поиска на главной. */
export interface Suggestion {
  kind: 'university' | 'program' | 'city';
  id: string;
  title: string;
  subtitle: string;
}

export function buildSuggestions(
  query: string,
  universities: University[],
  programs: ProgramWithUniversity[],
  limit = 6,
): Suggestion[] {
  if (normalize(query).length < 2) return [];
  const out: Suggestion[] = [];
  for (const c of CITIES) {
    if (matchesQuery(normalize(`${c.ru} ${c.it}`), query) && universities.some((u) => u.city === c.id)) {
      out.push({ kind: 'city', id: c.id, title: c.ru, subtitle: 'Город' });
    }
  }
  for (const u of universities) {
    if (matchesQuery(universityHaystack(u), query)) {
      out.push({ kind: 'university', id: u.slug, title: u.name_ru ?? u.official_name, subtitle: u.official_name });
    }
  }
  for (const p of programs) {
    if (matchesQuery(programHaystack(p), query)) {
      out.push({ kind: 'program', id: p.slug, title: p.title_original, subtitle: p.university.name_ru ?? p.university.official_name });
    }
  }
  return out.slice(0, limit);
}
