// Входной файл Edge Function sheets-sync. Логика — в handler.ts, сборка — scripts/build-edge.sh.
// Платформа не подключает код по ссылке при развёртывании, поэтому сборка лежит в хранилище
// (bucket edge-code) и перед выполнением сверяется по SHA-256: подменённый файл не запустится.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUNDLE = 'sheets-sync-9117c2d57daf.js';
const SHA256 = '9117c2d57daf2a8d68dfd6804b9b9ed3865ea42218bbae47d921bd283f89e027';

declare const Deno: { env: { get(name: string): string | undefined } };

const url = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/edge-code/${BUNDLE}`;
const code = await (await fetch(url)).text();
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
if (hex !== SHA256) throw new Error('sheets-sync: сборка не прошла проверку целостности');
const mod = new Function(`${code}\nreturn SheetsSync;`)() as { start: (c: typeof createClient) => void };
mod.start(createClient);
