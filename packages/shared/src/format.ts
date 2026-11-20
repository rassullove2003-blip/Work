import type { Program, VerificationMeta } from './types';

export const UNKNOWN = 'Информация уточняется';

export function formatFee(p: Pick<Program, 'tuition_fee_min_eur' | 'tuition_fee_max_eur'>): string {
  const { tuition_fee_min_eur: min, tuition_fee_max_eur: max } = p;
  const fmt = (n: number) => `${n.toLocaleString('ru-RU').replace(/,/g, ' ')} €`;
  if (min == null && max == null) return UNKNOWN;
  if (min != null && max != null && min !== max) return `${fmt(min)} – ${fmt(max)} в год`;
  return `${fmt((min ?? max) as number)} в год`;
}

export function formatDuration(p: Pick<Program, 'duration_years' | 'ects'>): string {
  const parts: string[] = [];
  if (p.duration_years != null) {
    const y = p.duration_years;
    const word = y % 10 === 1 && y % 100 !== 11 ? 'год' : [2, 3, 4].includes(y % 10) && ![12, 13, 14].includes(y % 100) ? 'года' : 'лет';
    parts.push(`${y} ${word}`);
  }
  if (p.ects != null) parts.push(`${p.ects} ECTS`);
  return parts.length ? parts.join(' · ') : UNKNOWN;
}

export function formatVerifiedAt(meta: VerificationMeta): string {
  if (!meta.verified_at) return 'Дата проверки: не проверялось';
  const d = new Date(meta.verified_at);
  return `Проверено: ${d.toLocaleDateString('ru-RU')}`;
}
