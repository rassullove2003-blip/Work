import type { ImportPlan } from './plan';

/** Минимальный интерфейс клиента Supabase, который нужен для загрузки (supabase-js). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = { from: (table: string) => any };

/* ------------------------------------------------------------ загрузка -- */

/** Убирает пустые значения: пустая ячейка не стирает то, что введено в приложении. */
function compact<T extends object>(o: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/**
 * Upsert с группировкой по набору колонок: иначе PostgREST записал бы NULL
 * в колонки, которых нет в строке, и стёр бы данные, введённые вручную.
 */
async function upsertGrouped(supabase: DbClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (rows.length === 0) return;
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const k = Object.keys(r).sort().join(',');
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 200) {
      const { error } = await supabase.from(table).upsert(group.slice(i, i + 200), { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
}

async function idMap(supabase: DbClient, table: string, field: 'slug', values: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(values)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await supabase.from(table).select(`id, ${field}`).in(field, uniq.slice(i, i + 300));
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of (data ?? []) as unknown as Record<string, string>[]) map.set(r[field], r.id);
  }
  return map;
}

/** Записывает план в базу по шагам. Права проверяет база (RLS): писать могут только сотрудники. */
export async function applyPlan(supabase: DbClient, plan: ImportPlan, onStep: (text: string) => void): Promise<void> {

  onStep('Университеты…');
  await upsertGrouped(supabase, 'universities', plan.universities.map((u) => compact({ ...u, is_demo: false })), 'slug');

  onStep('Программы…');
  const uniIds = await idMap(supabase, 'universities', 'slug', [
    ...plan.programs.map((p) => p.university_slug),
    ...plan.scholarships.flatMap((s) => s.university_slugs),
  ]);
  await upsertGrouped(
    supabase,
    'degree_programs',
    plan.programs.map(({ university_slug, ...p }) => compact({ ...p, university_id: uniIds.get(university_slug), is_demo: false })),
    'slug',
  );

  onStep('Стипендии…');
  await upsertGrouped(supabase, 'scholarships', plan.scholarships.map(({ university_slugs: _, ...s }) => compact({ ...s, is_demo: false })), 'slug');
  const schIds = await idMap(supabase, 'scholarships', 'slug', [
    ...plan.scholarships.map((s) => s.slug),
    ...plan.eligibility.map((e) => e.scholarship_slug),
    ...plan.deadlines.map((d) => d.scholarship_slug ?? ''),
  ]);
  const links = plan.scholarships.flatMap((s) =>
    s.university_slugs.map((u) => ({ university_id: uniIds.get(u), scholarship_id: schIds.get(s.slug) })),
  );
  if (links.length) {
    const { error } = await supabase.from('university_scholarships').upsert(links, { onConflict: 'university_id,scholarship_id', ignoreDuplicates: true });
    if (error) throw new Error(`university_scholarships: ${error.message}`);
  }

  const progIds = await idMap(supabase, 'degree_programs', 'slug', [
    ...plan.fees.map((f) => f.program_slug),
    ...plan.requirements.map((r) => r.program_slug),
    ...plan.deadlines.map((d) => d.program_slug ?? ''),
  ]);

  onStep('Стоимость…');
  await upsertGrouped(
    supabase,
    'program_editions',
    plan.fees.map(({ program_slug, ...f }) => compact({ ...f, program_id: progIds.get(program_slug) })),
    'program_id,academic_year,applicant_category',
  );

  onStep('Требования…');
  await upsertGrouped(
    supabase,
    'admission_requirements',
    plan.requirements.map(({ program_slug, ...r }) => compact({ ...r, program_id: progIds.get(program_slug) })),
    'program_id,academic_year,requirement_type,applicant_category',
  );

  onStep('Условия стипендий…');
  await upsertGrouped(
    supabase,
    'scholarship_eligibility',
    plan.eligibility.map(({ scholarship_slug, ...e }) => compact({ ...e, scholarship_id: schIds.get(scholarship_slug) })),
    'scholarship_id,academic_year,applicant_category',
  );

  onStep('Дедлайны…');
  await upsertGrouped(
    supabase,
    'admission_deadlines',
    plan.deadlines.map(({ program_slug, scholarship_slug, ...d }) =>
      compact({
        ...d,
        program_id: program_slug ? progIds.get(program_slug) : null,
        scholarship_id: scholarship_slug ? schIds.get(scholarship_slug) : null,
      }),
    ),
    'import_key',
  );
}

