import { strFromU8 } from 'fflate';
import {
  buildImportPlan,
  fetchExistingKeys,
  parseCsv,
  readGoogleSheet as readSharedGoogleSheet,
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
  return fetchExistingKeys(supabase);
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

/** Читает листы Google Таблицы как CSV (общий код с серверной автосинхронизацией). */
export function readGoogleSheet(sheetId: string): Promise<{ wb: Workbook; issues: ImportIssue[] }> {
  return readSharedGoogleSheet(sheetId, fetch);
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
