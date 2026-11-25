// E2E на НАСТОЯЩЕЙ базе: сравнение двух вузов; гость отправляет заявку на консультацию;
// администратор видит её и берёт в работу.
// Запуск: npm run export:web && QA_ADMIN=… QA_PASSWORD=… NODE_PATH=$(npm root -g) node e2e/compare-help-live.mjs [скриншоты]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const { QA_ADMIN, QA_PASSWORD } = process.env;
const GUEST = `QA Гость ${Date.now()}`;
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
const newPage = async () => { const p = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(30000); p.on('dialog', (d) => d.accept()); return p; };
const vis = (page, s) => page.getByText(s, { exact: false }).locator('visible=true').first();
const id = (page, t) => page.getByTestId(t).locator('visible=true').first();

const results = [];
let stop = false;
let guest, admin;
async function step(name, fn) {
  if (stop) return results.push(['ПРОПУЩЕНО', name]);
  try { await fn(); results.push(['успешно', name]); }
  catch (e) { results.push(['ОШИБКА', `${name}: ${e.message.split('\n')[0]}`]); stop = true; for (const [n, p] of [['guest', guest], ['admin', admin]]) if (p && shots) await p.screenshot({ path: join(shots, `ch-FAIL-${n}.png`) }).catch(() => {}); }
}

await step('Сравнение: два вуза в таблице', async () => {
  guest = await newPage();
  for (const slug of ['bocconi', 'polimi']) {
    await guest.goto(`${base}/university/${slug}`);
    await id(guest, 'uni-compare-button').click();
    await vis(guest, 'В сравнении — открыть').waitFor();
  }
  await id(guest, 'uni-compare-button').click();
  await id(guest, 'compare-table').waitFor();
  await vis(guest, 'Вузов: 2 из 4').waitFor();
  await vis(guest, 'Ближайший срок').waitFor();
  if (shots) await guest.screenshot({ path: join(shots, 'ch-01-compare.png') });
  await guest.getByTestId('compare-remove').locator('visible=true').first().click();
  await vis(guest, 'Вузов: 1 из 4').waitFor();
});

await step('Гость отправляет заявку «Помощь с поступлением» со страницы программы', async () => {
  await guest.goto(`${base}/program/sapienza-european-studies`);
  await id(guest, 'program-help').click();
  await id(guest, 'help-name').fill(GUEST);
  await id(guest, 'help-submit').click();
  await vis(guest, 'Укажите телефон').waitFor(); // проверка формы
  await id(guest, 'help-contact').fill(`@qa_guest_${Date.now() % 100000}`);
  await vis(guest, 'Бакалавриат').click();
  await id(guest, 'help-comment').fill('QA Подойдёт ли мне программа?');
  await id(guest, 'help-consent').click();
  await id(guest, 'help-submit').click();
  await vis(guest, 'Заявка отправлена').waitFor();
});

await step('Администратор видит заявку и берёт её в работу', async () => {
  admin = await newPage();
  await admin.goto(`${base}/profile`);
  await admin.getByTestId('profile-login').click();
  await admin.getByTestId('auth-email').fill(QA_ADMIN);
  await admin.getByTestId('auth-password').fill(QA_PASSWORD);
  await admin.getByTestId('auth-submit').click();
  await admin.getByText(QA_ADMIN).first().waitFor();
  await admin.goto(`${base}/admin/consultations`);
  await vis(admin, GUEST).waitFor();
  await vis(admin, 'Программа: European Studies').waitFor();
  if (shots) await admin.screenshot({ path: join(shots, 'ch-02-admin.png') });
  const card = admin.getByTestId('consultation-card').filter({ hasText: GUEST });
  await card.getByText('В работе', { exact: true }).click();
  await admin.waitForTimeout(1500);
  await admin.getByText(/^В работе \(\d+\)$/).locator('visible=true').first().click();
  await vis(admin, GUEST).waitFor();
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === 'успешно' ? '✔' : s === 'ОШИБКА' ? '✘' : '–'} ${s}: ${n}`);
const failed = results.filter(([s]) => s !== 'успешно').length;
console.log(`\nИтого: ${results.length - failed}/${results.length} успешно`);
process.exit(failed ? 1 : 0);
