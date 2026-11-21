import { strFromU8, unzipSync } from 'fflate';

/** Таблица: имя листа → строки (массивы ячеек-строк). */
export type Workbook = Record<string, string[][]>;

/** CSV по RFC 4180: кавычки, переносы строк внутри кавычек, разделитель , или ; (определяется по первой строке). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Текст из <si>/<is>: склеивает все <t>, включая форматированные куски (<r><t>…). */
function richText(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1]);
  return out;
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Число-дата Excel → YYYY-MM-DD. */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Минимальное чтение .xlsx (Office Open XML) без сторонних парсеров:
 * общие строки, строки в ячейке, числа, логические значения; даты распознаются по формату ячейки.
 */
export function readXlsx(data: Uint8Array): Workbook {
  const files = unzipSync(data);
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : '');

  const shared: string[] = [];
  for (const m of text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(richText(m[1]));

  // Стили с форматом даты: встроенные 14–22, 45–47 и пользовательские с d/m/y.
  const dateFmtIds = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const stylesXml = text('xl/styles.xml');
  for (const m of stylesXml.matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)) {
    const code = decodeXml(m[2]).replace(/"[^"]*"|\[[^\]]*\]/g, '');
    if (/[dmy]/i.test(code) && !/[hs]/i.test(code.replace(/m+/gi, ''))) dateFmtIds.add(Number(m[1]));
  }
  const cellXfs = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const styleIsDate = [...cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)].map((m) => dateFmtIds.has(Number(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0)));

  const rels: Record<string, string> = {};
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = m[1].match(/Id="([^"]+)"/)?.[1];
    const target = m[1].match(/Target="([^"]+)"/)?.[1];
    if (id && target) rels[id] = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }

  const wb: Workbook = {};
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decodeXml(m[1].match(/name="([^"]+)"/)?.[1] ?? '');
    const rid = m[1].match(/r:id="([^"]+)"/)?.[1] ?? '';
    const xml = text(rels[rid] ?? '');
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNum = Number(r[1].match(/r="(\d+)"/)?.[1] ?? rows.length + 1);
      const cells: string[] = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? '';
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
        const idx = ref ? colIndex(ref) : cells.length;
        const t = attrs.match(/t="([^"]+)"/)?.[1];
        const s = Number(attrs.match(/s="(\d+)"/)?.[1] ?? -1);
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = '';
        if (t === 's' && v != null) value = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') value = richText(body);
        else if (t === 'str' || t === 'e') value = v != null ? decodeXml(v) : '';
        else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null) value = s >= 0 && styleIsDate[s] && !isNaN(Number(v)) ? excelSerialToIso(Number(v)) : v;
        cells[idx] = value;
      }
      rows[rowNum - 1] = Array.from(cells, (x) => x ?? '');
    }
    wb[name] = Array.from(rows, (x) => x ?? []);
  }
  return wb;
}

/** Адрес листа Google Таблицы в формате CSV (таблица должна быть открыта по ссылке). */
export function googleSheetCsvUrl(sheetId: string, sheetName: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheetName)}`;
}

/** ID таблицы из ссылки вида https://docs.google.com/spreadsheets/d/<ID>/edit… или из самого ID. */
export function extractSheetId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}
