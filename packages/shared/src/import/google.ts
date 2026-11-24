import { googleSheetCsvUrl, parseCsv, type Workbook } from './readers';
import { IMPORT_SHEETS, matchSheet, type ExistingKeys, type ImportIssue } from './plan';
import type { DbClient } from './apply';

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

/**
 * Читает листы Google Таблицы как CSV. Таблица должна быть открыта по ссылке
 * («Все, у кого есть ссылка — читатель»). Ключи Google не нужны.
 * Используется и в приложении, и в серверной автосинхронизации.
 */
export async function readGoogleSheet(sheetId: string, fetchFn: FetchLike): Promise<{ wb: Workbook; issues: ImportIssue[] }> {
  const wb: Workbook = {};
  const issues: ImportIssue[] = [];
  for (const sh of IMPORT_SHEETS) {
    const res = await fetchFn(googleSheetCsvUrl(sheetId, sh.title));
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

/** Какие записи уже есть в базе (для «создано / обновлено» в отчёте). */
export async function fetchExistingKeys(supabase: DbClient): Promise<ExistingKeys> {
  const [u, p, s, d] = await Promise.all([
    supabase.from('universities').select('slug').limit(10000),
    supabase.from('degree_programs').select('slug').limit(10000),
    supabase.from('scholarships').select('slug').limit(10000),
    supabase.from('admission_deadlines').select('import_key').not('import_key', 'is', null).limit(10000),
  ]);
  const err = u.error ?? p.error ?? s.error ?? d.error;
  if (err) throw new Error(err.message);
  const col = (r: { data: Record<string, string>[] | null }, k: string) => new Set((r.data ?? []).map((x) => x[k]));
  return { universities: col(u, 'slug'), programs: col(p, 'slug'), scholarships: col(s, 'slug'), deadlines: col(d, 'import_key') };
}

/** Короткий отпечаток содержимого таблицы: если таблица не менялась, загрузку можно пропустить. */
export function workbookFingerprint(wb: Workbook): string {
  const text = JSON.stringify(Object.keys(wb).sort().map((k) => [k, wb[k]]));
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return `${text.length.toString(16)}-${h1.toString(16)}-${h2.toString(16)}`;
}
