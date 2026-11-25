import type { Deadline, ProgramWithUniversity, Scholarship, University } from './types';
import { cityName, LANGUAGES, LEVELS, regionName, UNIVERSITY_TYPES } from './dictionaries';

export const MAX_COMPARE = 4;

export interface CompareColumn {
  university: University;
  cells: Record<CompareRowKey, string>;
}

export type CompareRowKey = 'city' | 'region' | 'type' | 'programs' | 'levels' | 'languages' | 'fees' | 'scholarships' | 'deadline';

export const COMPARE_ROWS: { key: CompareRowKey; label: string }[] = [
  { key: 'city', label: 'Город' },
  { key: 'region', label: 'Регион' },
  { key: 'type', label: 'Тип' },
  { key: 'programs', label: 'Программ в каталоге' },
  { key: 'levels', label: 'Уровни' },
  { key: 'languages', label: 'Языки обучения' },
  { key: 'fees', label: 'Стоимость (по программам)' },
  { key: 'scholarships', label: 'Стипендии' },
  { key: 'deadline', label: 'Ближайший срок' },
];

const NO_DATA = 'Нет данных';
const eur = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} €`;

/**
 * Таблица сравнения вузов по данным каталога. Ничего не додумывает:
 * если у программ нет стоимости или сроков — «Нет данных».
 */
export function buildComparison(
  universities: University[],
  programs: ProgramWithUniversity[],
  scholarships: Scholarship[],
  deadlines: Deadline[],
  today: Date = new Date(),
): CompareColumn[] {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return universities.map((u) => {
    const own = programs.filter((p) => p.university_id === u.id);
    const ownIds = new Set(own.map((p) => p.id));

    const levelCounts = new Map<string, number>();
    for (const p of own) levelCounts.set(p.level, (levelCounts.get(p.level) ?? 0) + 1);
    const levels = Object.keys(LEVELS)
      .filter((l) => levelCounts.has(l))
      .map((l) => `${LEVELS[l as keyof typeof LEVELS].ru}: ${levelCounts.get(l)}`)
      .join('\n');

    const langs = [...new Set(own.map((p) => p.language).filter(Boolean))] as (keyof typeof LANGUAGES)[];

    const feeValues = own.flatMap((p) => [p.tuition_fee_min_eur, p.tuition_fee_max_eur]).filter((n): n is number => typeof n === 'number');
    const fees = feeValues.length
      ? Math.min(...feeValues) === Math.max(...feeValues)
        ? `${eur(Math.min(...feeValues))} в год`
        : `от ${eur(Math.min(...feeValues))} до ${eur(Math.max(...feeValues))} в год`
      : NO_DATA;

    const sch = scholarships.filter((s) => s.university_ids.includes(u.id));

    const next = deadlines
      .filter((d) => d.program_id && ownIds.has(d.program_id) && new Date(d.ends_at) >= start)
      .sort((a, b) => a.ends_at.localeCompare(b.ends_at))[0];

    return {
      university: u,
      cells: {
        city: cityName(u.city, u.city_ru),
        region: regionName(u.region),
        type: UNIVERSITY_TYPES[u.public_private],
        programs: String(own.length),
        levels: levels || NO_DATA,
        languages: langs.length ? langs.map((l) => LANGUAGES[l]).join(', ') : NO_DATA,
        fees,
        scholarships: sch.length ? `${sch.length}: ${sch.map((s) => s.name_ru).slice(0, 3).join(', ')}${sch.length > 3 ? '…' : ''}` : NO_DATA,
        deadline: next ? `${new Date(next.ends_at).toLocaleDateString('ru-RU')} — ${next.title_ru}` : NO_DATA,
      },
    };
  });
}
