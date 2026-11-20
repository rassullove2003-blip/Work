// Смоук-тест веб-сборки мобильного приложения (демо-режим без Supabase).
// Запуск: npm run export:web && node e2e/smoke.mjs [папка-для-скриншотов]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// require (а не import), чтобы работал NODE_PATH с глобально установленным Playwright
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web-build');
const shots = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(join(root, 'index.html'))); // SPA fallback
  }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['успешно', name]); }
  catch (e) { results.push(['ОШИБКА', `${name}: ${e.message.split('\n')[0]}`]); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (n) => shots && page.screenshot({ path: join(shots, `${n}.png`) });
const text = (s) => page.getByText(s, { exact: false }).locator('visible=true').first();

await step('Главная открывается на русском', async () => {
  await page.goto(base);
  await text('Твоё будущее начинается в Италии').waitFor({ timeout: 20000 });
  await text('Популярные университеты').waitFor();
  await text('Пока нет подтверждённых дедлайнов').waitFor();
  await shot('01-home');
});

await step('Подсказки поиска: «бол» → Болонья и университет', async () => {
  await page.getByTestId('home-search').fill('бол');
  await text('Болонский университет').waitFor();
  await shot('02-suggestions');
  await text('Болонский университет').click();
  await page.waitForURL(/university\/unibo/);
  await text('Alma Mater Studiorum').waitFor();
  await text('Специальности (3)').waitFor();
  await shot('03-university');
});

await step('Избранное университета (локально в демо-режиме)', async () => {
  await page.getByTestId('uni-fav-button').click();
  await text('В избранном').waitFor();
});

await step('Карточка программы из страницы университета', async () => {
  await page.getByTestId('program-card-unibo-economics-finance').click();
  await page.waitForURL(/program\/unibo-economics-finance/);
  await text('Economics and Finance').waitFor();
  await text('2 года · 120 ECTS').waitFor();
  await text('Информация уточняется').waitFor();
  await page.getByTestId('program-fav-button').click();
  await text('В избранном').waitFor();
  await shot('04-program');
});

await step('Поиск программ: текст «медицина рим» → 2 результата', async () => {
  await page.goto(`${base}/search`);
  await page.getByTestId('tab-programs').click();
  await page.getByTestId('search-input').fill('медицина рим');
  await page.getByTestId('results-count').filter({ hasText: 'Найдено: 2' }).waitFor();
  await shot('05-search-programs');
});

await step('Фильтры: магистратура + английский', async () => {
  await page.getByTestId('search-input').fill('');
  await page.getByTestId('open-filters').click();
  await page.getByTestId('f-level-master').click();
  await page.getByTestId('f-lang-en').click();
  await shot('06-filters');
  await page.getByTestId('apply-filters').click();
  await page.getByTestId('results-count').waitFor();
  const t = await page.getByTestId('results-count').textContent();
  if (!/Найдено: [1-9]/.test(t)) throw new Error(`ожидались результаты, получено «${t}»`);
  await text('Магистратура').waitFor();
  await shot('07-search-filtered');
});

await step('Фильтры сохраняются после перезагрузки', async () => {
  await page.reload();
  await page.getByTestId('open-filters').waitFor();
  const label = await page.getByTestId('open-filters').getAttribute('aria-label');
  if (!label?.includes('выбрано 2')) throw new Error(`aria-label: ${label}`);
});

await step('Университеты: частные в Милане → Боккони и Католический', async () => {
  await page.getByTestId('tab-universities').click();
  await page.getByTestId('open-filters').click();
  await page.getByTestId('f-city-milan').click();
  await page.getByTestId('f-type-private').click();
  await page.getByTestId('apply-filters').click();
  await page.getByTestId('results-count').filter({ hasText: 'Найдено: 2' }).waitFor();
  await page.getByTestId('uni-card-bocconi').waitFor();
  await shot('08-search-universities');
});

await step('Стипендии: поиск «тоскана» и словарь терминов', async () => {
  await page.goto(`${base}/scholarships`);
  await page.getByTestId('scholarship-search').fill('тоскана');
  await page.getByTestId('scholarship-card-dsu-toscana').waitFor();
  await text('ISEE Parificato').click();
  await text('за пределами Италии').waitFor();
  await shot('09-scholarships');
  await page.getByTestId('scholarship-card-dsu-toscana').click();
  await text('DSU Toscana').waitFor();
  await text('Пизанский университет').waitFor();
  await shot('10-scholarship');
});

await step('Мои поступления: избранное сохранено', async () => {
  await page.goto(`${base}/applications`);
  await text('Избранные университеты (1)').waitFor();
  await text('Избранные программы (1)').waitFor();
  await text('избранное хранится только на этом устройстве').waitFor();
  await shot('11-applications');
});

await step('Профиль без сервера честно сообщает о демо-режиме', async () => {
  await page.goto(`${base}/profile`);
  await text('Сервер не подключён').waitFor();
  await shot('12-profile');
});

await step('Глубокая ссылка на несуществующий вуз → «Страница не найдена»', async () => {
  await page.goto(`${base}/university/does-not-exist`);
  await text('Страница не найдена').waitFor();
});

await step('Нет горизонтальной прокрутки и ошибок JS', async () => {
  await page.goto(base);
  await text('Популярные университеты').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`горизонтальное переполнение ${overflow}px`);
  const real = errors.filter((e) => !/favicon|DevTools/.test(e));
  if (real.length) throw new Error(real.slice(0, 3).join(' | '));
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === 'успешно' ? '✔' : '✘'} ${s}: ${n}`);
const failed = results.filter(([s]) => s !== 'успешно').length;
console.log(`\nИтого: ${results.length - failed}/${results.length} успешно`);
process.exit(failed ? 1 : 0);
