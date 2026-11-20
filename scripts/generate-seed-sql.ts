// Генерирует supabase/seed.sql из общего пакета @uniitalia/shared (единый источник данных).
// Все записи помечаются как демонстрационные и непроверенные.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedUniversities, seedPrograms, seedScholarships } from '../packages/shared/src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = (v: unknown) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a: string[]) => `array[${a.map(q).join(', ')}]::text[]`;

const out: string[] = [
  '-- СГЕНЕРИРОВАНО scripts/generate-seed-sql.ts — не редактировать вручную (npm run seed:sql).',
  '-- ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ: is_demo = true, verification_status = unverified.',
  '-- Стоимость, требования и дедлайны не заполняются, пока не сверены с официальными источниками.',
  'begin;',
];

for (const u of seedUniversities) {
  out.push(
    `insert into public.universities (slug, official_name, name_en, name_ru, city, region, public_private, website, description_ru, featured, is_demo, status, source_url, verification_status) values (` +
      [q(u.slug), q(u.official_name), q(u.name_en), q(u.name_ru), q(u.city), q(u.region), q(u.public_private), q(u.website), q(u.description_ru), u.featured, 'true', "'published'", q(u.source_url), "'unverified'"].join(', ') +
      `) on conflict (slug) do nothing;`,
  );
}
for (const p of seedPrograms) {
  out.push(
    `insert into public.degree_programs (slug, university_id, title_original, title_ru, level, fields, language, duration_years, ects, is_demo, status, verification_status) select ` +
      [q(p.slug), 'u.id', q(p.title_original), q(p.title_ru), `${q(p.level)}::public.study_level`, arr(p.fields), `${q(p.language)}::public.teaching_language`, p.duration_years, p.ects, 'true', "'published'", "'unverified'"].join(', ') +
      ` from public.universities u where u.slug = ${q(p.university_id)} on conflict (slug) do nothing;`,
  );
}
for (const s of seedScholarships) {
  out.push(
    `insert into public.scholarships (slug, organization, name_ru, region, website, description_ru, is_demo, status, source_url, verification_status) values (` +
      [q(s.slug), q(s.organization), q(s.name_ru), q(s.region), q(s.website), q(s.description_ru), 'true', "'published'", q(s.source_url), "'unverified'"].join(', ') +
      `) on conflict (slug) do nothing;`,
  );
  for (const uslug of s.university_ids) {
    out.push(
      `insert into public.university_scholarships (university_id, scholarship_id) select u.id, s.id from public.universities u, public.scholarships s where u.slug = ${q(uslug)} and s.slug = ${q(s.slug)} on conflict do nothing;`,
    );
  }
}
out.push('commit;');
writeFileSync(join(root, 'supabase/seed.sql'), out.join('\n') + '\n');
console.log(`seed.sql: ${seedUniversities.length} университетов, ${seedPrograms.length} программ, ${seedScholarships.length} стипендий`);
