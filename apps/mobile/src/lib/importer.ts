import { strFromU8 } from 'fflate';
import {
  buildImportPlan,
  googleSheetCsvUrl,
  IMPORT_SHEETS,
  matchSheet,
  parseCsv,
  readXlsx,
  type ExistingKeys,
  type ImportIssue,
  type ImportPlan,
  type ImportResult,
  type Workbook,
} from '@uniitalia/shared';
import { supabase } from './supabase';

/* ---------------------------------------------------------- источники -- */

export async function fetchExisting(): Promise<ExistingKeys> {
  if (!supabase) throw new Error('Сервер не подключён');
  const [u, p, s, d] = await Promise.all([
    supabase.from('universities').select('slug').limit(10000),
    supabase.from('degree_programs').select('slug').limit(10000),
    supabase.from('scholarships').select('slug').limit(10000),
    supabase.from('admission_deadlines').select('import_key').not('import_key', 'is', null).limit(10000),
  ]);
  const err = u.error ?? p.error ?? s.error ?? d.error;
  if (err) throw new Error(err.message);
  return {
    universities: new Set((u.data ?? []).map((r) => r.slug as string)),
    programs: new Set((p.data ?? []).map((r) => r.slug as string)),
    scholarships: new Set((s.data ?? []).map((r) => r.slug as string)),
    deadlines: new Set((d.data ?? []).map((r) => r.import_key as string)),
  };
}

/** Читает выбранные файлы (.xlsx или несколько .csv) в одну «книгу». */
export async function readFiles(files: { uri: string; name: string }[]): Promise<Workbook> {
  const wb: Workbook = {};
  for (const f of files) {
    const buf = new Uint8Array(await (await fetch(f.uri)).arrayBuffer());
    if (/\.xlsx$/i.test(f.name)) {
      Object.assign(wb, readXlsx(buf));
    } else if (/\.csv$/i.test(f.name) || /\.txt$/i.test(f.name)) {
      wb[f.name.replace(/\.(csv|txt)$/i, '')] = parseCsv(strFromU8(buf));
    } else {
      throw new Error(`«${f.name}»: поддерживаются только файлы .xlsx и .csv`);
    }
  }
  return wb;
}

/**
 * Читает листы Google Таблицы как CSV. Таблица должна быть открыта по ссылке
 * («Все, у кого есть ссылка — читатель»). Ключи Google в приложении не нужны.
 */
export async function readGoogleSheet(sheetId: string): Promise<{ wb: Workbook; issues: ImportIssue[] }> {
  const wb: Workbook = {};
  const issues: ImportIssue[] = [];
  for (const sh of IMPORT_SHEETS) {
    const res = await fetch(googleSheetCsvUrl(sheetId, sh.title));
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('csv')) {
      throw new Error(
        res.status === 404
          ? 'Таблица не найдена. Проверьте ссылку.'
          : 'Нет доступа к таблице. В Google Таблице нажмите «Настройки доступа» → «Все, у кого есть ссылка» → «Читатель».',
      );
    }
    const rows = parseCsv(await res.text());
    // Если листа с таким названием нет, Google отдаёт первый лист — сверяем по заголовкам.
    const header = rows[0] ?? [];
    if (matchSheet('', header) !== sh.key) {
      if (header.some((h) => h.trim())) {
        issues.push({ sheet: sh.title, row: 0, column: '', message: 'Лист не найден в таблице, он будет пропущен', level: 'warning' });
      }
      continue;
    }
    wb[sh.title] = rows;
  }
  return { wb, issues };
}

export async function validateWorkbook(wb: Workbook, extraIssues: ImportIssue[] = []): Promise<ImportResult> {
  const existing = await fetchExisting();
  const result = buildImportPlan(wb, existing);
  result.issues.push(...extraIssues);
  return result;
}

/* ------------------------------------------------------------ загрузка -- */

/** Убирает пустые значения: пустая ячейка не стирает то, что введено в приложении. */
function compact<T extends object>(o: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/**
 * Upsert с группировкой по набору колонок: иначе PostgREST записал бы NULL
 * в колонки, которых нет в строке, и стёр бы данные, введённые вручную.
 */
async function upsertGrouped(table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (!supabase || rows.length === 0) return;
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

async function idMap(table: string, field: 'slug', values: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(values)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await supabase!.from(table).select(`id, ${field}`).in(field, uniq.slice(i, i + 300));
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of (data ?? []) as unknown as Record<string, string>[]) map.set(r[field], r.id);
  }
  return map;
}

/** Записывает план в базу по шагам. Права проверяет база (RLS): писать могут только сотрудники. */
export async function applyPlan(plan: ImportPlan, onStep: (text: string) => void): Promise<void> {
  if (!supabase) throw new Error('Сервер не подключён');

  onStep('Университеты…');
  await upsertGrouped('universities', plan.universities.map((u) => compact({ ...u, is_demo: false })), 'slug');

  onStep('Программы…');
  const uniIds = await idMap('universities', 'slug', [
    ...plan.programs.map((p) => p.university_slug),
    ...plan.scholarships.flatMap((s) => s.university_slugs),
  ]);
  await upsertGrouped(
    'degree_programs',
    plan.programs.map(({ university_slug, ...p }) => compact({ ...p, university_id: uniIds.get(university_slug), is_demo: false })),
    'slug',
  );

  onStep('Стипендии…');
  await upsertGrouped('scholarships', plan.scholarships.map(({ university_slugs: _, ...s }) => compact({ ...s, is_demo: false })), 'slug');
  const schIds = await idMap('scholarships', 'slug', [
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

  const progIds = await idMap('degree_programs', 'slug', [
    ...plan.fees.map((f) => f.program_slug),
    ...plan.requirements.map((r) => r.program_slug),
    ...plan.deadlines.map((d) => d.program_slug ?? ''),
  ]);

  onStep('Стоимость…');
  await upsertGrouped(
    'program_editions',
    plan.fees.map(({ program_slug, ...f }) => compact({ ...f, program_id: progIds.get(program_slug) })),
    'program_id,academic_year,applicant_category',
  );

  onStep('Требования…');
  await upsertGrouped(
    'admission_requirements',
    plan.requirements.map(({ program_slug, ...r }) => compact({ ...r, program_id: progIds.get(program_slug) })),
    'program_id,academic_year,requirement_type,applicant_category',
  );

  onStep('Условия стипендий…');
  await upsertGrouped(
    'scholarship_eligibility',
    plan.eligibility.map(({ scholarship_slug, ...e }) => compact({ ...e, scholarship_id: schIds.get(scholarship_slug) })),
    'scholarship_id,academic_year,applicant_category',
  );

  onStep('Дедлайны…');
  await upsertGrouped(
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

/** Запись в журнал импорта (видят сотрудники). Ошибки записи журнала не мешают импорту. */
export async function logRun(entry: {
  source_kind: 'google_sheets' | 'xlsx' | 'csv';
  file_name: string | null;
  source_id?: string | null;
  status: 'validated' | 'applied' | 'failed';
  summary: unknown;
  errors: ImportIssue[];
}) {
  if (!supabase) return;
  await supabase.from('import_runs').insert({ ...entry, errors: entry.errors.slice(0, 200) });
}
