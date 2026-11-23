// Загрузка файла импорта в базу тем же кодом, что и в приложении (проверка → загрузка → журнал).
// Запуск: IMPORT_EMAIL=… IMPORT_PASSWORD=… npx tsx scripts/import-file.ts <файл.xlsx>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { applyPlan, buildImportPlan, hasErrors, readXlsx } from '../packages/shared/src/index';
import project from '../supabase/project.json';

async function main() {
const file = process.argv[2];
const { IMPORT_EMAIL, IMPORT_PASSWORD } = process.env;
if (!file || !IMPORT_EMAIL || !IMPORT_PASSWORD) throw new Error('Нужны файл, IMPORT_EMAIL и IMPORT_PASSWORD');

const db = createClient(project.url, project.publishableKey, { auth: { persistSession: false } });
const { error: authErr } = await db.auth.signInWithPassword({ email: IMPORT_EMAIL, password: IMPORT_PASSWORD });
if (authErr) throw new Error(`Вход: ${authErr.message}`);

const slugs = async (table: string, col: string) => {
  const { data, error } = await db.from(table).select(col).not(col, 'is', null).limit(10000);
  if (error) throw new Error(error.message);
  return new Set((data as unknown as Record<string, string>[]).map((r) => r[col]));
};
const existing = {
  universities: await slugs('universities', 'slug'),
  programs: await slugs('degree_programs', 'slug'),
  scholarships: await slugs('scholarships', 'slug'),
  deadlines: await slugs('admission_deadlines', 'import_key'),
};
const result = buildImportPlan(readXlsx(new Uint8Array(readFileSync(file))), existing);
console.log('Сводка:', JSON.stringify(result.summary));
if (hasErrors(result)) {
  console.log('Ошибки:', result.issues.filter((i) => i.level === 'error').slice(0, 20));
  process.exit(1);
}
const t0 = Date.now();
await applyPlan(db, result.plan, (s) => console.log(`  ${s} (${((Date.now() - t0) / 1000).toFixed(0)} с)`));
await db.from('import_runs').insert({ source_kind: 'xlsx', file_name: basename(file), status: 'applied', summary: result.summary, errors: result.issues.slice(0, 200) });
console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
