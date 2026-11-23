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
  applyPlan as applySharedPlan,
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

/** Записывает план в базу (общий код с серверными скриптами). Права проверяет база (RLS). */
export function applyPlan(plan: ImportPlan, onStep: (text: string) => void): Promise<void> {
  if (!supabase) throw new Error('Сервер не подключён');
  return applySharedPlan(supabase, plan, onStep);
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
