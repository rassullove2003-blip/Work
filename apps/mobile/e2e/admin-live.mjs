// E2E админки на НАСТОЯЩЕЙ базе Supabase (создаёт и удаляет тестовые записи с префиксом QA).
// Запуск: npm run export:web && QA_EMAIL=... QA_PASSWORD=... NODE_PATH=$(npm root -g) node e2e/admin-live.mjs [папка-скриншотов]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const { QA_EMAIL, QA_PASSWORD } = process.env;
if (!QA_EMAIL || !QA_PASSWORD) throw new Error('Нужны QA_EMAIL и QA_PASSWORD');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web-build');
const shots = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body, type = types[extname(path)] ?? 'application/octet-stream';
  try { body = await readFile(join(root, path)); }
  catch { body = await readFile(join(root, 'index.html')); type = 'text/html'; }
  res.writeHead(200, { 'content-type': type }).end(body);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
let stop = false;
async function step(name, fn) {
  if (stop) return results.push(['ПРОПУЩЕНО', name]);
  try { await fn(); results.push(['успешно', name]); }
  catch (e) {
    results.push(['ОШИБКА', `${name}: ${e.message.split('\n')[0]} (url: ${page.url()})`]);
    stop = true;
    if (shots) await page.screenshot({ path: join(shots, `admin-FAIL-${results.length}.png`) }).catch(() => {});
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const shot = async (n) => shots && page.screenshot({ path: join(shots, `admin-${n}.png`) });
const vis = (s) => page.getByText(s, { exact: false }).locator('visible=true').first();
const id = (t) => page.getByTestId(t).locator('visible=true');
let uniUrl = null;

await step('Вход администратора', async () => {
  await page.goto(`${base}/profile`);
  await id('profile-login').click();
  await id('auth-email').fill(QA_EMAIL);
  await id('auth-password').fill(QA_PASSWORD);
  await id('auth-submit').click();
  await vis('Администратор').waitFor();
  await id('open-admin').waitFor();
  await shot('01-profile');
});

await step('Раздел «Управление» и список вузов из базы', async () => {
  await id('open-admin').click();
  await vis('Сотрудники').waitFor();
  await shot('02-admin-home');
  await vis('Университеты').click();
  await vis('Добавить университет').waitFor();
  await vis('Болонский университет').waitFor();
  await shot('03-admin-universities');
});

await step('Создание вуза с фото и публикация', async () => {
  await id('admin-new').click();
  await id('input-official_name').fill('QA Тестовый университет');
  await id('input-slug').fill('qa-test-university');
  await id('search-city').fill('Пиза');
  await id('opt-city-pisa').click();
  await id('search-region').fill('Тоскана');
  await id('opt-region-tuscany').click();
  // загрузка фото через выбор файла (в браузере image picker = <input type=file>)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), vis('Выбрать из галереи').click()]);
  await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await vis('Заменить').waitFor({ timeout: 30000 });
  await id('opt-status-published').click();
  await shot('04-uni-form');
  await id('admin-save').click();
  await page.waitForURL(/\/admin\/university\/[0-9a-f-]{36}/);
  uniUrl = page.url();
  await id('input-official_name').waitFor();
  const v = await id('input-official_name').inputValue();
  if (v !== 'QA Тестовый университет') throw new Error(`после сохранения: ${v}`);
});

await step('Создание программы и стоимости по году', async () => {
  await page.goto(`${base}/admin/program/new`);
  await id('input-title_original').fill('QA Test Program');
  await id('input-slug').fill('qa-test-program');
  await id('search-university_id').fill('QA Тестовый');
  await page.getByText('QA Тестовый университет').locator('visible=true').first().click();
  await id('opt-status-published').first().click();
  await id('admin-save').click();
  await page.waitForURL(/\/admin\/program\/[0-9a-f-]{36}/);
  await id('edition-add').waitFor();
  await id('input-academic_year').last().fill('2026/2027');
  await id('input-tuition_fee_min_eur').fill('1000');
  await id('opt-status-published').last().click();
  await id('edition-add').click();
  await vis('2026/2027 · Все абитуриенты').waitFor();
  await shot('05-program-fees');
});

await step('Создание проверенного дедлайна', async () => {
  await page.goto(`${base}/admin/deadline/new`);
  await id('input-title_ru').fill('QA срок подачи');
  await id('search-program_id').fill('QA Test');
  await page.getByText('QA Test Program').locator('visible=true').first().click();
  await id('input-academic_year').fill('2026/2027');
  await id('input-ends_at').fill('2027-03-31');
  await id('opt-status-published').click();
  await id('opt-verification_status-verified').click();
  await id('input-source_url').fill('https://example.org/qa');
  await id('input-verified_at').fill('2026-11-21');
  await id('admin-save').click();
  await page.waitForURL(/\/admin\/deadline\/[0-9a-f-]{36}/);
});

await step('Студенческая часть видит изменения: главная, вуз, программа', async () => {
  await page.goto(base);
  await vis('QA срок подачи').waitFor();
  await shot('06-home-deadline');
  await page.goto(`${base}/university/qa-test-university`);
  await vis('QA Test Program').waitFor();
  const logos = await page.locator('img[src*="catalog-images"]').count();
  if (!logos) throw new Error('загруженный логотип не показан');
  await page.goto(`${base}/program/qa-test-program`);
  await page.getByText(/1\s000 € в год/).locator('visible=true').first().waitFor();
  await vis('QA срок подачи').waitFor();
  await shot('07-program-public');
});

await step('Раздел «Сотрудники» показывает пользователей', async () => {
  await page.goto(`${base}/admin/staff`);
  await vis('mdtbkal@gmail.com').waitFor();
  await shot('08-staff');
});

stop = false;
await step('Удаление тестового вуза (каскадом программа, стоимость, дедлайн)', async () => {
  if (!uniUrl) throw new Error('вуз не был создан');
  await page.goto(uniUrl);
  await id('input-official_name').waitFor();
  await page.getByText('Удалить', { exact: true }).locator('visible=true').first().click();
  // после удаления экран закрывается
  await id('input-official_name').waitFor({ state: 'detached', timeout: 20000 });
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === 'успешно' ? '✔' : s === 'ОШИБКА' ? '✘' : '–'} ${s}: ${n}`);
if (errors.length) console.log('Ошибки JS:', errors.slice(0, 3).join(' | '));
const failed = results.filter(([s]) => s !== 'успешно').length;
console.log(`\nИтого: ${results.length - failed}/${results.length} успешно`);
process.exit(failed ? 1 : 0);
