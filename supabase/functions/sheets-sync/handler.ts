// Автосинхронизация каталога с Google Таблицей (Supabase Edge Function, Deno).
// Запускается расписанием (pg_cron → pg_net) раз в день с секретным заголовком x-sync-secret.
// Для каждой таблицы с включённой автосинхронизацией:
//   читает листы → проверяет тем же кодом, что приложение → при ошибках ничего не меняет и
//   уведомляет администраторов → иначе загружает изменения (пустые ячейки не стирают ручные правки).
// Сборка в один файл: bash scripts/build-edge.sh (createClient передаёт входной файл index.ts).
import { applyPlan } from '../../../packages/shared/src/import/apply';
import { fetchExistingKeys, readGoogleSheet, workbookFingerprint } from '../../../packages/shared/src/import/google';
import { buildImportPlan, hasErrors } from '../../../packages/shared/src/import/plan';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CreateClient = (url: string, key: string, opts?: unknown) => any;

export function start(createClient: CreateClient) {
Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // Секрет хранится в Vault базы; сверяем через функцию, доступную только серверу.
  const given = req.headers.get('x-sync-secret') ?? '';
  const { data: ok } = given ? await db.rpc('check_sync_secret', { p_secret: given }) : { data: false };
  if (!ok) return json({ error: 'forbidden' }, 403);

  // Пробный режим: проверить конкретную таблицу без записи в базу.
  const body = (await req.json().catch(() => ({}))) as { dry_run_sheet_id?: string };
  if (body.dry_run_sheet_id) {
    try {
      const { wb, issues } = await readGoogleSheet(body.dry_run_sheet_id, fetch);
      const result = buildImportPlan(wb, await fetchExistingKeys(db));
      result.issues.push(...issues);
      return json({ dry_run: true, sheets: Object.keys(wb), summary: result.summary, errors: result.issues.filter((i) => i.level === 'error').length, fingerprint: workbookFingerprint(wb) });
    } catch (e) {
      return json({ dry_run: true, error: (e as Error).message }, 400);
    }
  }
  const { data: sources, error } = await db.from('import_sources').select('id, name, google_sheet_id, last_auto_hash').eq('auto_sync', true);
  if (error) return json({ error: error.message }, 500);

  const report: unknown[] = [];
  for (const src of sources ?? []) {
    const finish = async (status: 'ok' | 'unchanged' | 'failed', message: string, extra: Record<string, unknown> = {}) => {
      await db
        .from('import_sources')
        .update({ last_auto_at: new Date().toISOString(), last_auto_status: status, last_auto_message: message.slice(0, 500), ...extra })
        .eq('id', src.id);
      report.push({ source: src.id, status, message });
    };
    try {
      const { wb, issues } = await readGoogleSheet(src.google_sheet_id, fetch);
      const hash = workbookFingerprint(wb);
      if (hash === src.last_auto_hash) {
        await finish('unchanged', 'Таблица не изменилась');
        continue;
      }
      const result = buildImportPlan(wb, await fetchExistingKeys(db));
      result.issues.push(...issues);
      if (hasErrors(result)) {
        const errors = result.issues.filter((i) => i.level === 'error');
        await db.from('import_runs').insert({
          source_id: src.id, source_kind: 'google_sheets', file_name: 'автосинхронизация', status: 'failed',
          summary: result.summary, errors: result.issues.slice(0, 200),
        });
        const { data: admins } = await db.from('admin_users').select('user_id').eq('role', 'admin');
        const first = errors[0];
        await db.from('notifications').insert(
          (admins ?? []).map((a) => ({
            user_id: a.user_id, kind: 'task', link: '/admin/import',
            title: 'Автосинхронизация: в таблице есть ошибки',
            body: `Ошибок: ${errors.length}. Например: «${first.sheet}», строка ${first.row}${first.column ? `, «${first.column}»` : ''} — ${first.message}. Данные не изменены.`.slice(0, 500),
          })),
        );
        await finish('failed', `Ошибок: ${errors.length}. Данные не изменены.`);
        continue;
      }
      await applyPlan(db, result.plan, () => {});
      await db.from('import_runs').insert({
        source_id: src.id, source_kind: 'google_sheets', file_name: 'автосинхронизация', status: 'applied',
        summary: result.summary, errors: result.issues.slice(0, 200),
      });
      await finish('ok', 'Изменения загружены', { last_auto_hash: hash, last_synced_at: new Date().toISOString() });
    } catch (e) {
      await finish('failed', (e as Error).message);
    }
  }
  return json({ synced: report });
});
}
