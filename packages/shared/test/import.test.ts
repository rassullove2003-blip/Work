import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { buildImportPlan, extractSheetId, hasErrors, parseCsv, readXlsx, type ExistingKeys, type Workbook } from '../src/index';

const none: ExistingKeys = { universities: new Set(), programs: new Set(), scholarships: new Set(), deadlines: new Set() };

const UNI_H = ['Код вуза *', 'Официальное название *', 'Название на русском', 'Название на английском', 'Город (по-итальянски) *', 'Город (по-русски)', 'Регион *', 'Тип вуза *', 'Официальный сайт', 'Адрес', 'Описание на русском', 'Ссылка на логотип', 'Ссылка на фото', 'Популярный', 'Учебный год данных', 'Источник', 'Дата проверки', 'Статус проверки', 'Публикация'];
const PROG_H = ['Код программы *', 'Код вуза *', 'Название в оригинале *', 'Название на русском', 'Уровень *', 'Направления', 'Язык обучения *', 'Длительность, лет', 'ECTS', 'Страница программы', 'Учебный план', 'Описание на русском', 'Учебный год данных', 'Источник', 'Дата проверки', 'Статус проверки', 'Публикация'];
const REQ_H = ['Код программы *', 'Учебный год *', 'Тип требования *', 'Для всех: требование', 'Для всех: подробности', 'EU: требование', 'EU: подробности', 'Non-EU за рубежом: требование', 'Non-EU за рубежом: подробности', 'Non-EU в Италии: требование', 'Non-EU в Италии: подробности', 'Источник', 'Дата проверки', 'Статус проверки', 'Публикация'];
const DL_H = ['Код дедлайна *', 'Код программы', 'Код стипендии', 'Название срока *', 'Учебный год *', 'Для кого *', 'Дата начала', 'Крайний срок *', 'Источник', 'Дата проверки', 'Статус проверки', 'Публикация'];

function row(headers: string[], values: Record<string, string>): string[] {
  return headers.map((h) => values[h.replace(' *', '')] ?? '');
}

const goodWb = (): Workbook => ({
  Университеты: [
    UNI_H,
    row(UNI_H, { 'Код вуза': 'unimc', 'Официальное название': 'Università di Macerata', 'Город (по-итальянски)': 'Macerata', 'Город (по-русски)': 'Мачерата', Регион: 'Марке', 'Тип вуза': 'Государственный', Популярный: 'да', Публикация: 'Опубликовано' }),
    [],
  ],
  Программы: [
    PROG_H,
    row(PROG_H, { 'Код программы': 'unimc-econ', 'Код вуза': 'unimc', 'Название в оригинале': 'Economics', Уровень: 'Бакалавриат', Направления: 'Экономика, Финансы', 'Язык обучения': 'Английский', 'Длительность, лет': '3', ECTS: '180' }),
  ],
  Требования: [
    REQ_H,
    row(REQ_H, { 'Код программы': 'unimc-econ', 'Учебный год': '2026/2027', 'Тип требования': 'Языковые сертификаты', 'EU: требование': 'B2 English', 'Non-EU за рубежом: требование': 'IELTS 6.0', 'Non-EU за рубежом: подробности': 'или TOEFL 80' }),
  ],
  Дедлайны: [
    DL_H,
    row(DL_H, { 'Код дедлайна': 'unimc-econ-2026-noneu', 'Код программы': 'unimc-econ', 'Название срока': 'Pre-enrolment', 'Учебный год': '2026/2027', 'Для кого': 'Non-EU, проживающие за рубежом', 'Крайний срок': '31.03.2027', 'Статус проверки': 'Проверено', Источник: 'https://www.unimc.it', 'Дата проверки': '2026-11-21', Публикация: 'Опубликовано' }),
  ],
});

test('valid workbook produces a plan without errors', () => {
  const r = buildImportPlan(goodWb(), none);
  assert.equal(hasErrors(r), false, JSON.stringify(r.issues));
  assert.equal(r.plan.universities[0].city, 'macerata');
  assert.equal(r.plan.universities[0].city_ru, 'Мачерата');
  assert.equal(r.plan.universities[0].region, 'marche');
  assert.equal(r.plan.universities[0].featured, true);
  assert.equal(r.plan.universities[0].status, 'published');
  assert.deepEqual(r.plan.programs[0].fields, ['economics', 'finance']);
  assert.equal(r.plan.programs[0].level, 'bachelor');
  assert.equal(r.plan.programs[0].duration_years, 3);
  // EU и Non-EU — отдельные записи
  assert.deepEqual(r.plan.requirements.map((x) => [x.applicant_category, x.title_ru, x.details_ru]), [
    ['eu', 'B2 English', undefined],
    ['non_eu_abroad', 'IELTS 6.0', 'или TOEFL 80'],
  ]);
  assert.equal(r.plan.deadlines[0].ends_at, '2027-03-31T23:59:00Z');
  assert.equal(r.plan.deadlines[0].verification_status, 'verified');
  assert.deepEqual(r.summary.universities, { rows: 1, create: 1, update: 0 });
});

test('existing records are counted as updates', () => {
  const r = buildImportPlan(goodWb(), { ...none, universities: new Set(['unimc']) });
  assert.deepEqual(r.summary.universities, { rows: 1, create: 0, update: 1 });
});

test('errors are reported with sheet, row and column', () => {
  const wb = goodWb();
  wb['Программы'].push(row(PROG_H, { 'Код программы': 'Bad Code', 'Код вуза': 'nope', 'Название в оригинале': 'X', Уровень: 'Ординатура', 'Язык обучения': 'Английский' }));
  wb['Программы'].push(row(PROG_H, { 'Код программы': 'unimc-econ', 'Код вуза': 'unimc', 'Название в оригинале': 'Dup', Уровень: 'Магистратура', 'Язык обучения': 'Итальянский' }));
  wb['Дедлайны'].push(row(DL_H, { 'Код дедлайна': 'x-1', 'Название срока': 'X', 'Учебный год': '2026', 'Для кого': 'Все абитуриенты', 'Крайний срок': '2027-02-30', 'Статус проверки': 'Проверено' }));
  const r = buildImportPlan(wb, none);
  assert.ok(hasErrors(r));
  const msg = (sheet: string, rowN: number, col: string) => r.issues.find((i) => i.sheet === sheet && i.row === rowN && i.column === col)?.message ?? '';
  assert.match(msg('Программы', 3, 'Код программы'), /маленькие латинские/);
  assert.match(msg('Программы', 3, 'Код вуза'), /не найден/);
  assert.match(msg('Программы', 3, 'Уровень'), /недопустимое значение/);
  assert.match(msg('Программы', 4, 'Код программы'), /Повтор.*строке 2/);
  assert.match(msg('Дедлайны', 3, 'Код программы'), /программы или код стипендии/);
  assert.match(msg('Дедлайны', 3, 'Учебный год'), /2026\/2027/);
  assert.match(msg('Дедлайны', 3, 'Крайний срок'), /2027-03-31/);
  assert.match(msg('Дедлайны', 3, 'Статус проверки'), /Источник/);
});

test('missing required column and unknown sheet', () => {
  const r = buildImportPlan({ Университеты: [UNI_H.filter((h) => !h.startsWith('Регион'))], Прочее: [['a', 'b']] }, none);
  assert.ok(r.issues.some((i) => i.column === 'Регион' && /Нет обязательной колонки/.test(i.message)));
  const r2 = buildImportPlan({ Лист1: [['foo']] }, none);
  assert.match(r2.issues[0].message, /Не найдено ни одного листа/);
});

test('CSV sheet is recognised by headers; separators and quotes', () => {
  const csv = '﻿' + PROG_H.join(';') + '\r\n' + 'p-1;unibo;"Economics; ""Finance""";;Магистратура;;Английский' + '\r\n';
  const rows = parseCsv(csv);
  assert.equal(rows[1][2], 'Economics; "Finance"');
  const r = buildImportPlan({ 'programs.csv': rows }, { ...none, universities: new Set(['unibo']) });
  assert.equal(hasErrors(r), false, JSON.stringify(r.issues));
  assert.equal(r.plan.programs[0].title_original, 'Economics; "Finance"');
});

test('reads a real .xlsx: shared strings, inline strings, numbers and dates', () => {
  const xml = (s: string) => strToU8(s);
  const zip = zipSync({
    '[Content_Types].xml': xml('<Types/>'),
    'xl/workbook.xml': xml('<workbook xmlns:r="r"><sheets><sheet name="Дедлайны" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': xml('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': xml('<sst><si><t>Код дедлайна *</t></si><si><r><t>Крайний </t></r><r><t>срок *</t></r></si><si><t>a-1</t></si></sst>'),
    'xl/styles.xml': xml('<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': xml(
      '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>ECTS &amp; X</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>46477</v></c><c r="D2"><v>180</v></c></row>' +
        '</sheetData></worksheet>',
    ),
  });
  const wb = readXlsx(zip);
  assert.deepEqual(wb['Дедлайны'][0], ['Код дедлайна *', 'Крайний срок *', 'ECTS & X']);
  assert.deepEqual(wb['Дедлайны'][1], ['a-1', '2027-03-31', '', '180']);
});

test('google sheet id from link', () => {
  assert.equal(extractSheetId('https://docs.google.com/spreadsheets/d/1ItLZpkbeeSh3K-vd9mR6ddRxqXWuPCuVKVuXsUmIRgA/edit#gid=0'), '1ItLZpkbeeSh3K-vd9mR6ddRxqXWuPCuVKVuXsUmIRgA');
  assert.equal(extractSheetId('not a link'), null);
});
