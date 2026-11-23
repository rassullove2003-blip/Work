import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentStatusInfo, formatBytes, safeFileName } from '../src/documents';

test('safeFileName: кириллица и пробелы не ломают путь', () => {
  assert.equal(safeFileName('Паспорт скан.PDF'), 'file.pdf');
  assert.equal(safeFileName('My passport (1).jpg'), 'My-passport-1.jpg');
  assert.equal(safeFileName('noext'), 'noext');
});

test('formatBytes', () => {
  assert.equal(formatBytes(500), '500 Б');
  assert.equal(formatBytes(2048), '2 КБ');
  assert.equal(formatBytes(3.5 * 1024 * 1024), '3,5 МБ');
});

test('documentStatusInfo', () => {
  assert.equal(documentStatusInfo('ready').ru, 'Принят');
  assert.equal(documentStatusInfo('needs_changes').tone, 'danger');
});
