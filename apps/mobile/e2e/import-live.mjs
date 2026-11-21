// E2E импорта на НАСТОЯЩЕЙ базе: ошибочный файл не загружается, правильный загружается,
// повторная загрузка обновляет без дубликатов. Тестовые записи имеют коды qa-… и удаляются в конце.
// Запуск: python3 e2e/make-fixtures.py && npm run export:web && QA_EMAIL=… QA_PASSWORD=… NODE_PATH=$(npm root -g) node e2e/import-live.mjs [скриншоты]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const { QA_EMAIL, QA_PASSWORD } = process.env;
if (!QA_EMAIL || !QA_PASSWORD) throw new Error('Нужны QA_EMAIL и QA_PASSWORD');
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'web-build');
const shots = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body, type = types[extname(path)] ?? 'application/octet-stream';
  try { body = await readFile(join(root, path)); } catch { body = await readFile(join(root, 'index.html')); type = 'text/html'; }
  res.writeHead(200, { 'content-type': type }).end(body);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
let stop = false;
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
page.setDefaultTimeout(30000);
page.on('dialog', (d) => d.accept());
const shot = async (n) => shots && page.screenshot({ path: join(shots, `import-${n}.png`), fullPage: false });
const vis = (s) => page.getByText(s, { exact: false }).locator('visible=true').first();
const id = (t) => page.getByTestId(t).locator('visible=true');
async function step(name, fn) {
  if (stop) return results.push(['ПРОПУЩЕНО', name]);
  try { await fn(); results.push(['успешно', name]); }
  catch (e) { results.push(['ОШИБКА', `${name}: ${e.message.split('\n')[0]}`]); stop = true; await shot(`FAIL-${results.length}`); }
}
async function upload(file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), id('import-file').click()]);
  await chooser.setFiles(join(here, 'fixtures', file));
}

await step('Вход администратора и раздел «Импорт данных»', async () => {
  await page.goto(`${base}/profile`);
  await id('profile-login').click();
  await id('auth-email').fill(QA_EMAIL);
  await id('auth-password').fill(QA_PASSWORD);
  await id('auth-submit').click();
  await id('open-admin').click();
  await vis('Импорт данных').click();
  await id('import-file').waitFor();
  await shot('01-screen');
});

await step('Файл с ошибками: ошибки показаны, загрузка недоступна', async () => {
  await upload('qa-bad.xlsx');
  await id('import-errors').waitFor();
  await vis('Ошибок: 6').waitFor();
  await vis('Программы, строка 2, «Код вуза»').waitFor();
  await vis('Вуз «qa-missing» не найден').waitFor();
  if (await page.getByTestId('import-apply').count()) throw new Error('кнопка загрузки видна при ошибках');
  await shot('02-errors');
});

await step('Правильный файл: сводка и загрузка', async () => {
  await upload('qa-good.xlsx');
  await vis('Ошибок нет').waitFor();
  const t = await id('import-summary-requirements').textContent();
  if (!t.includes('строк 1 (2 записей)')) throw new Error(`требования: ${t}`);
  const u = await id('import-summary-universities').textContent();
  if (!u.includes('новых 1')) throw new Error(`вузы: ${u}`);
  await shot('03-summary');
  await id('import-apply').click();
  await id('import-done').waitFor({ timeout: 60000 });
  await shot('04-done');
});

await step('Студенты видят загруженное: вуз, программа, стоимость, требования EU/Non-EU, дедлайн', async () => {
  await page.goto(`${base}/university/qa-unimc`);
  await vis('Мачерата, Марке').waitFor();
  await vis('QA Economics and Law').waitFor();
  await vis('QA стипендия Марке').waitFor();
  await page.goto(`${base}/program/qa-unimc-econ`);
  await page.getByText(/1\s200 € в год/).locator('visible=true').first().waitFor();
  await vis('QA IELTS 6.0').waitFor();
  await vis('QA English B2').waitFor();
  await vis('QA Pre-enrolment').waitFor();
  await shot('05-program');
});

await step('Повторная загрузка того же файла обновляет, а не дублирует', async () => {
  await page.goto(`${base}/admin/import`);
  await upload('qa-good.xlsx');
  await vis('Ошибок нет').waitFor();
  const u = await id('import-summary-universities').textContent();
  if (!u.includes('новых 0, обновится 1')) throw new Error(`вузы: ${u}`);
  const d = await id('import-summary-deadlines').textContent();
  if (!d.includes('новых 0, обновится 1')) throw new Error(`дедлайны: ${d}`);
  await id('import-apply').click();
  await id('import-done').waitFor({ timeout: 60000 });
  await vis('Загружено').waitFor(); // история импорта
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === 'успешно' ? '✔' : s === 'ОШИБКА' ? '✘' : '–'} ${s}: ${n}`);
const failed = results.filter(([s]) => s !== 'успешно').length;
console.log(`\nИтого: ${results.length - failed}/${results.length} успешно`);
process.exit(failed ? 1 : 0);
