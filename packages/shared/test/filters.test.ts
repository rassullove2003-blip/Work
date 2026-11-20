import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seedUniversities, seedPrograms, seedScholarships, filterPrograms, filterUniversities, filterScholarships,
  buildSuggestions, EMPTY_PROGRAM_FILTERS, EMPTY_UNIVERSITY_FILTERS, normalize, formatFee, formatDuration,
  CITIES, REGIONS, FIELD_LABELS,
} from '../src/index';
import type { ProgramWithUniversity } from '../src/index';

const bySlug = new Map(seedUniversities.map((u) => [u.slug, u]));
const programs: ProgramWithUniversity[] = seedPrograms.map((p) => ({ ...p, university: bySlug.get(p.university_id)! }));

test('seed integrity: 40 universities, unique slugs, known cities/regions', () => {
  assert.equal(seedUniversities.length, 40);
  assert.equal(new Set(seedUniversities.map((u) => u.slug)).size, 40);
  for (const u of seedUniversities) {
    assert.ok(CITIES.some((c) => c.id === u.city), `city ${u.city}`);
    assert.ok(REGIONS[u.region], `region ${u.region}`);
    assert.equal(CITIES.find((c) => c.id === u.city)!.region, u.region, `region mismatch for ${u.slug}`);
    assert.match(u.website!, /^https:\/\//);
    assert.equal(u.verification_status, 'unverified');
  }
});

test('seed integrity: programs reference existing universities and fields', () => {
  for (const p of seedPrograms) {
    assert.ok(bySlug.has(p.university_id), p.slug);
    for (const f of p.fields) assert.ok(FIELD_LABELS[f], `field ${f}`);
    assert.equal(p.tuition_fee_min_eur, null, 'fees must not be invented');
  }
  for (const s of seedScholarships) for (const u of s.university_ids) {
    assert.ok(bySlug.has(u), u);
    assert.equal(bySlug.get(u)!.region, s.region, `${s.slug} ↔ ${u}`);
  }
});

test('normalize handles case, ё, diacritics, apostrophes', () => {
  assert.equal(normalize("Università dell'Aquila"), 'universita dellaquila');
  assert.equal(normalize('Ёлка'), 'елка');
});

test('search by Russian city name finds Milan programs', () => {
  const r = filterPrograms(programs, { ...EMPTY_PROGRAM_FILTERS, query: 'милан' });
  assert.ok(r.length > 0);
  assert.ok(r.every((p) => p.university.city === 'milan' || p.university.city === 'pieve-emanuele' || normalize(p.title_ru ?? '').includes('милан')));
});

test('search by Russian field label and multi-word AND', () => {
  const r = filterPrograms(programs, { ...EMPTY_PROGRAM_FILTERS, query: 'медицина рим' });
  assert.deepEqual(r.map((p) => p.slug).sort(), ['sapienza-medicine', 'tor-vergata-medicine']);
});

test('level + language filters', () => {
  const r = filterPrograms(programs, { ...EMPTY_PROGRAM_FILTERS, levels: ['master'], languages: ['en'] });
  assert.ok(r.length > 0);
  assert.ok(r.every((p) => p.level === 'master' && p.language === 'en'));
});

test('fee filter excludes programs with unknown fee', () => {
  const r = filterPrograms(programs, { ...EMPTY_PROGRAM_FILTERS, maxFeeEur: 5000 });
  assert.equal(r.length, 0);
});

test('university filters: private in Milan', () => {
  const r = filterUniversities(seedUniversities, { ...EMPTY_UNIVERSITY_FILTERS, cities: ['milan'], types: ['private'] });
  assert.deepEqual(r.map((u) => u.slug).sort(), ['bocconi', 'unicatt']);
});

test('scholarship search by region name', () => {
  assert.deepEqual(filterScholarships(seedScholarships, 'тоскана', null).map((s) => s.slug), ['dsu-toscana']);
});

test('suggestions include city, university and program', () => {
  const s = buildSuggestions('бол', seedUniversities, programs);
  assert.ok(s.some((x) => x.kind === 'city' && x.id === 'bologna'));
  assert.ok(s.some((x) => x.kind === 'university' && x.id === 'unibo'));
});

test('formatting', () => {
  assert.equal(formatFee({ tuition_fee_min_eur: null, tuition_fee_max_eur: null }), 'Информация уточняется');
  assert.equal(formatDuration({ duration_years: 3, ects: 180 }), '3 года · 180 ECTS');
  assert.equal(formatDuration({ duration_years: 6, ects: 360 }), '6 лет · 360 ECTS');
});
