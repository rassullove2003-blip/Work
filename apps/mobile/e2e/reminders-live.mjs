// E2E «Напоминания о дедлайнах»: колокольчик на сроке, настройки, напоминание о задаче с близкой датой.
// (основа — applications-live.mjs)
// E2E «Мои поступления» на НАСТОЯЩЕЙ базе: студент добавляет программу, ведёт этапы и задачи;
// куратор видит заявку, меняет этап и пишет комментарий; студент видит комментарий.
// Запуск: npm run export:web && QA_STUDENT=… QA_CURATOR=… QA_PASSWORD=… NODE_PATH=$(npm root -g) node e2e/applications-live.mjs [скриншоты]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const { QA_STUDENT, QA_CURATOR, QA_PASSWORD } = process.env;
const PROGRAM = process.env.QA_PROGRAM ?? 'sapienza-european-studies';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web-build');
const shots = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body, type = types[extname(path)] ?? 'application/octet-stream';
  try { body = await readFile(join(root, path)); } catch { body = await readFile(join(root, 'index.html')); type = 'text/html'; }
  res.writeHead(200, { 'content-type': type }).end(body);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

async function session(email) {
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', (d) => d.accept());
  await page.goto(`${base}/profile`);
  await page.getByTestId('profile-login').click();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(QA_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.getByText(email).first().waitFor();
  return page;
}
const vis = (page, s) => page.getByText(s, { exact: false }).locator('visible=true').first();
const id = (page, t) => page.getByTestId(t).locator('visible=true');

const results = [];
let stop = false;
let student;
async function step(name, fn) {
  if (stop) return results.push(['ПРОПУЩЕНО', name]);
  try { await fn(); results.push(['успешно', name]); }
  catch (e) { results.push(['ОШИБКА', `${name}: ${e.message.split('\n')[0]}`]); stop = true; if (student && shots) await student.screenshot({ path: join(shots, 'rem-FAIL.png') }).catch(() => {}); }
}
const BOCCONI = process.env.QA_REMIND_PROGRAM ?? 'bocconi-bai';

await step('Студент включает напоминание на странице программы', async () => {
  student = await session(QA_STUDENT);
  await student.goto(`${base}/program/${BOCCONI}`);
  const bell = student.locator('[data-testid^="remind-"]').locator('visible=true').first();
  await bell.waitFor();
  await bell.click();
  await vis(student, 'Напомню').waitFor();
});

await step('Срок появляется в «Напоминаниях о сроках», настройки сохраняются', async () => {
  await student.goto(`${base}/profile`);
  await id(student, 'open-reminders').click();
  await vis(student, 'Сроки с напоминанием (1)').waitFor();
  await vis(student, 'за 30 дней').click();
  await student.waitForTimeout(1500);
  await student.reload();
  await vis(student, 'Сроки с напоминанием (1)').waitFor();
  const selected = await student.getByText('за 30 дней', { exact: true }).locator('visible=true').first().evaluate((el) => {
    let n = el; for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') return bg; } return '';
  });
  if (!selected) throw new Error('выбор «за 30 дней» не сохранился');
  if (shots) await student.screenshot({ path: join(shots, 'rem-01-settings.png') });
});

await step('Задача с датой «завтра» сразу даёт напоминание', async () => {
  await student.goto(`${base}/program/${PROGRAM}`);
  await id(student, 'add-application').click();
  await student.waitForURL(/\/application\/[0-9a-f-]{36}/);
  const t = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  await id(student, 'task-title').fill('QA Записаться на тест');
  await id(student, 'task-date').fill(t);
  await id(student, 'task-add').click();
  await vis(student, 'QA Записаться на тест').waitFor();
  await student.goto(`${base}/notifications`);
  await vis(student, 'Завтра срок: QA Записаться на тест').waitFor({ timeout: 20000 });
  await student.goto(`${base}/reminders`);
  await vis(student, 'Сроки с напоминанием (3)').waitFor(); // + 2 срока программы подписались автоматически
  if (shots) await student.screenshot({ path: join(shots, 'rem-02-notification.png') });
});

await step('Выключение колокольчика убирает срок из списка', async () => {
  await vis(student, 'Напомню').click();
  await vis(student, 'Сроки с напоминанием (2)').waitFor();
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === 'успешно' ? '✔' : s === 'ОШИБКА' ? '✘' : '–'} ${s}: ${n}`);
const failed = results.filter(([s]) => s !== 'успешно').length;
console.log(`\nИтого: ${results.length - failed}/${results.length} успешно`);
process.exit(failed ? 1 : 0);
