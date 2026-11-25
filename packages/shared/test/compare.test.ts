import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison } from '../src/compare';
import type { Deadline, ProgramWithUniversity, University } from '../src/types';

const meta = { verification_status: 'verified' as const, verified_at: null, source_url: null, academic_year: '2027/2028' };
const u = { ...meta, id: 'u1', slug: 'x', official_name: 'Uni X', name_en: null, name_ru: 'Вуз X', city: 'milano', region: 'lombardia', public_private: 'public', website: null, address: null, description_ru: null, logo_url: null, image_url: null, featured: false, is_demo: false } as University;
const prog = (id: string, level: string, min: number | null, lang: string | null) =>
  ({ ...meta, id, slug: id, university_id: 'u1', title_original: id, title_ru: null, level, language: lang, tuition_fee_min_eur: min, tuition_fee_max_eur: min, university: u }) as unknown as ProgramWithUniversity;

test('сравнение: уровни, языки, стоимость, ближайший срок', () => {
  const programs = [prog('a', 'bachelor', 156, 'en'), prog('b', 'master', 3000, 'it'), prog('c', 'master', null, null)];
  const deadlines = [
    { id: 'd1', program_id: 'a', ends_at: '2027-03-01T00:00:00Z', title_ru: 'Раунд 2' },
    { id: 'd0', program_id: 'b', ends_at: '2027-01-10T00:00:00Z', title_ru: 'Раунд 1' },
    { id: 'old', program_id: 'b', ends_at: '2026-01-10T00:00:00Z', title_ru: 'Прошлый' },
  ] as Deadline[];
  const [col] = buildComparison([u], programs, [], deadlines, new Date('2026-11-25'));
  assert.equal(col.cells.programs, '3');
  assert.match(col.cells.levels, /Магистратура: 2/);
  assert.equal(col.cells.fees.replace(/\s/g, ' '), 'от 156 € до 3 000 € в год');
  assert.match(col.cells.deadline, /Раунд 1/);
  assert.equal(col.cells.scholarships, 'Нет данных');
});
