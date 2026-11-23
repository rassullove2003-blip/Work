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
let student, curator, appUrl;
async function step(name, fn) {
  if (stop) return results.push(['ПРОПУЩЕНО', name]);
  try { await fn(); results.push(['успешно', name]); }
  catch (e) { results.push(['ОШИБКА', `${name}: ${e.message.split('\n')[0]}`]); stop = true; for (const [n, p] of [['student', student], ['curator', curator]]) if (p && shots) await p.screenshot({ path: join(shots, `apps-FAIL-${n}.png`) }).catch(() => {}); }
}

await step('Студент добавляет программу в «Мои поступления»', async () => {
  student = await session(QA_STUDENT);
  await student.goto(`${base}/program/${PROGRAM}`);
  await id(student, 'add-application').click();
  await student.waitForURL(/\/application\/[0-9a-f-]{36}/);
  appUrl = student.url();
  await vis(student, 'Выбираю университет').waitFor();
  await vis(student, 'Срок: Предварительный отбор MoveIN').waitFor(); // дедлайн программы попал в чек-лист
  await vis(student, 'Пройти предзачисление на Universitaly').waitFor();
  if (shots) await student.screenshot({ path: join(shots, 'apps-01-new.png') });
});

await step('Студент меняет этап, добавляет и отмечает задачу, пишет заметку', async () => {
  await id(student, 'status-collecting_documents').click();
  await vis(student, 'Собираю документы').waitFor();
  await id(student, 'task-title').fill('QA Перевести аттестат');
  await id(student, 'task-date').fill('2027-01-15');
  await id(student, 'task-add').click();
  await vis(student, 'QA Перевести аттестат').waitFor();
  await vis(student, 'до 15.01.2027').waitFor();
  await id(student, 'notes-input').fill('QA моя заметка');
  await vis(student, 'Сохранить заметки').click();
  await student.waitForTimeout(1000);
  const before = await vis(student, 'Задачи (').textContent();
  await student.getByTestId(/^task-[0-9a-f-]{36}$/).locator('visible=true').first().click();
  await student.waitForFunction((b) => ![...document.querySelectorAll('*')].some((n) => n.textContent === b), before, { timeout: 15000 });
});

await step('Карточка во вкладке «Поступления»: этап и прогресс', async () => {
  await student.goto(`${base}/applications`);
  await vis(student, 'Мои заявки').waitFor();
  await vis(student, 'Собираю документы').waitFor();
  await vis(student, '10%').waitFor();
  if (shots) await student.screenshot({ path: join(shots, 'apps-02-tab.png') });
});

await step('Куратор видит заявку студента, меняет этап и пишет комментарий', async () => {
  curator = await session(QA_CURATOR);
  await curator.goto(`${base}/admin/applications`);
  await vis(curator, QA_STUDENT).waitFor();
  await vis(curator, QA_STUDENT).click();
  await vis(curator, 'Заявка студента').waitFor();
  await vis(curator, 'QA моя заметка').waitFor(); // заметки студента видны куратору (только чтение)
  await id(curator, 'curator-comment-input').fill('QA Добавьте перевод аттестата до января');
  await id(curator, 'curator-comment-save').click();
  await curator.waitForTimeout(1500);
  await id(curator, 'status-documents_ready').click();
  await curator.waitForTimeout(1500);
  if (shots) await curator.screenshot({ path: join(shots, 'apps-03-curator.png') });
});

await step('Студент видит комментарий куратора, новый этап и историю', async () => {
  await student.goto(appUrl);
  await id(student, 'curator-comment').waitFor();
  await vis(student, 'QA Добавьте перевод аттестата').waitFor();
  await vis(student, 'Документы готовы (куратор)').waitFor();
  if (await student.getByText('Программа недоступна').locator('visible=true').count()) throw new Error('название программы не загрузилось');
  if (shots) await student.screenshot({ path: join(shots, 'apps-04-student.png') });
});

await step('Студент удаляет поступление', async () => {
  await vis(student, 'Удалить поступление').click();
  await student.waitForURL((u) => !u.pathname.includes('/application/'), { timeout: 20000 }).catch(() => {});
  await student.goto(`${base}/applications`);
  await vis(student, 'Вы ещё не добавили ни одной программы').waitFor();
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === 'успешно' ? '✔' : s === 'ОШИБКА' ? '✘' : '–'} ${s}: ${n}`);
const failed = results.filter(([s]) => s !== 'успешно').length;
console.log(`\nИтого: ${results.length - failed}/${results.length} успешно`);
process.exit(failed ? 1 : 0);
