// E2E «Документы, чат, уведомления» на НАСТОЯЩЕЙ базе.
// Студент загружает документ и пишет куратору с файлом; куратор отвечает и проверяет документ;
// студент получает уведомления, видит ответ (мгновенно) и результат проверки.
// Запуск: npm run export:web && QA_STUDENT=… QA_CURATOR=… QA_PASSWORD=… QA_PDF=путь NODE_PATH=$(npm root -g) node e2e/cabinet-live.mjs [скриншоты]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const { QA_STUDENT, QA_CURATOR, QA_PASSWORD, QA_PDF } = process.env;
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
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
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
const id = (page, t) => page.getByTestId(t).locator('visible=true').first();
async function upload(page, trigger) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger()]);
  await chooser.setFiles(QA_PDF);
}

const results = [];
let stop = false;
let student, curator;
async function step(name, fn) {
  if (stop) return results.push(['ПРОПУЩЕНО', name]);
  try { await fn(); results.push(['успешно', name]); }
  catch (e) { results.push(['ОШИБКА', `${name}: ${e.message.split('\n')[0]}`]); stop = true; for (const [n, p] of [['student', student], ['curator', curator]]) if (p && shots) await p.screenshot({ path: join(shots, `cab-FAIL-${n}.png`) }).catch(() => {}); }
}

await step('Студент видит «Мой кабинет» и загружает документ (PDF)', async () => {
  student = await session(QA_STUDENT);
  await id(student, 'open-documents').click();
  await vis(student, 'Загрузить документ').waitFor();
  await vis(student, 'Паспорт').click();
  await id(student, 'document-title').fill('QA Паспорт');
  await upload(student, () => id(student, 'document-upload-file').click());
  await vis(student, 'Загружено: 1').waitFor();
  await vis(student, 'На проверке').waitFor();
  if (shots) await student.screenshot({ path: join(shots, 'cab-01-documents.png') });
});

await step('Студент пишет куратору и прикрепляет файл', async () => {
  await student.goto(`${base}/chat`);
  await vis(student, 'Напишите куратору').waitFor();
  await id(student, 'chat-input').fill('QA Здравствуйте! Подойдёт ли такой скан паспорта?');
  await id(student, 'chat-attach').click();
  await upload(student, () => id(student, 'attach-file').click());
  await vis(student, 'qa-scan.pdf').waitFor();
  await id(student, 'chat-send').click();
  await vis(student, 'QA Здравствуйте!').waitFor();
  await id(student, 'chat-attachment').waitFor();
});

await step('Куратор видит непрочитанный чат и отвечает', async () => {
  curator = await session(QA_CURATOR);
  await curator.goto(`${base}/admin/chats`);
  await vis(curator, QA_STUDENT).waitFor();
  await vis(curator, 'Без ответа (1)').waitFor();
  if (shots) await curator.screenshot({ path: join(shots, 'cab-02-staff-chats.png') });
  await id(curator, 'staff-chat-row').click();
  await vis(curator, 'QA Здравствуйте!').waitFor();
  await id(curator, 'chat-attachment').waitFor();
  await id(curator, 'chat-input').fill('QA Да, подходит. Загрузите также аттестат.');
  await id(curator, 'chat-send').click();
  await vis(curator, 'QA Да, подходит').waitFor();
});

await step('Студент получает ответ сразу (без обновления страницы)', async () => {
  await vis(student, 'QA Да, подходит').waitFor({ timeout: 20000 });
  if (shots) await student.screenshot({ path: join(shots, 'cab-03-student-chat.png') });
});

await step('Куратор проверяет документ: «Нужно исправить» с комментарием', async () => {
  await id(curator, 'staff-chat-documents').click();
  await vis(curator, 'Документы студента').waitFor();
  await vis(curator, 'QA Паспорт').waitFor();
  await id(curator, 'review-needs_changes').click();
  await id(curator, 'review-comment').fill('QA Нужен разворот с фото');
  await id(curator, 'review-save').click();
  await curator.waitForTimeout(1500);
  if (shots) await curator.screenshot({ path: join(shots, 'cab-04-review.png') });
  await curator.goto(`${base}/admin/documents`);
  await vis(curator, 'Документы студентов').waitFor();
  await vis(curator, 'Нужно исправить').click();
  await vis(curator, 'QA Паспорт').waitFor();
});

await step('Студент видит уведомления, статус и комментарий к документу', async () => {
  await student.goto(`${base}/profile`);
  await student.locator('[aria-label^="Уведомления, непрочитанных: "]').locator('visible=true').first().waitFor({ timeout: 20000 });
  if (shots) await student.screenshot({ path: join(shots, 'cab-05a-badge.png') });
  await id(student, 'open-notifications').click();
  await vis(student, 'Документ проверен: нужно исправить').waitFor();
  await vis(student, 'Новое сообщение от куратора').waitFor();
  if (shots) await student.screenshot({ path: join(shots, 'cab-05-notifications.png') });
  await vis(student, 'Документ проверен: нужно исправить').click();
  await vis(student, 'Нужно исправить').waitFor();
  await vis(student, 'QA Нужен разворот с фото').waitFor();
});

await step('Студент заменяет файл — документ снова на проверке, затем удаляет', async () => {
  await upload(student, () => vis(student, 'Заменить файл').click());
  await vis(student, 'На проверке').waitFor();
  await student.getByText('Удалить', { exact: true }).locator('visible=true').first().click();
  await vis(student, 'Вы ещё не загрузили ни одного документа').waitFor();
});

await step('Студент удаляет аккаунт — вместе с файлами', async () => {
  await student.goto(`${base}/profile`);
  await vis(student, 'Удалить аккаунт').click();
  await id(student, 'profile-login').waitFor({ timeout: 30000 });
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === 'успешно' ? '✔' : s === 'ОШИБКА' ? '✘' : '–'} ${s}: ${n}`);
const failed = results.filter(([s]) => s !== 'успешно').length;
console.log(`\nИтого: ${results.length - failed}/${results.length} успешно`);
process.exit(failed ? 1 : 0);
