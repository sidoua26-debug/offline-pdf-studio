import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageSelection, parsePageRanges } from '../../src/pdf-core/pageRanges.mjs';

test('parsePageRanges supports singleton, ranges and wildcard', () => {
  assert.deepEqual(parsePageRanges('1, 3-4, *', 4), [1, 2, 3, 4]);
  assert.deepEqual(parsePageRanges('2', 3), [2]);
  assert.deepEqual(parsePageRanges('1,3', 3), [1, 3]);
  assert.deepEqual(parsePageRanges('1-3', 3), [1, 2, 3]);
  assert.deepEqual(parsePageRanges('2-', 3), [2, 3]);
  assert.deepEqual(parsePageRanges('-2', 3), [1, 2]);
  assert.deepEqual(parsePageRanges('*', 3), [1, 2, 3]);
  assert.deepEqual(parsePageRanges(' 1 - 2 , 3 ', 3), [1, 2, 3]);
  assert.deepEqual(parsePageRanges('3, 1, 2, 1-2', 3), [1, 2, 3]);
});

test('parsePageRanges strictly rejects invalid and malformed expressions', () => {
  const invalidCases = [
    '2abc',
    '1.5',
    '1e2',
    '0x2',
    '1-2-3',
    '3-1',
    '0',
    '0-2',
    '-0',
    '4',
    '1-4',
    '4-',
    '1,,3',
    '1,',
    ',1',
    ',',
    '1;3',
    '1 3',
    '-',
    '--',
    '1--',
    '--1',
    '',
    '   ',
    '9007199254740992'
  ];

  for (const tc of invalidCases) {
    assert.throws(
      () => parsePageRanges(tc, 3),
      { name: 'PdfCoreError', code: 'INVALID_PAGE_RANGE' },
      `Expected parsePageRanges to reject "${tc}" for maxPage=3`
    );
  }

  assert.throws(() => parsePageRanges(null, 3), { name: 'PdfCoreError', code: 'INVALID_PAGE_RANGE' });
  assert.throws(() => parsePageRanges(123, 3), { name: 'PdfCoreError', code: 'INVALID_PAGE_RANGE' });
  assert.throws(() => parsePageRanges('1', 0), { name: 'PdfCoreError', code: 'INVALID_MAX_PAGE' });
  assert.throws(() => parsePageRanges('1', -1), { name: 'PdfCoreError', code: 'INVALID_MAX_PAGE' });
  assert.throws(() => parsePageRanges('1', 1.5), { name: 'PdfCoreError', code: 'INVALID_MAX_PAGE' });
});

test('normalizePageSelection validates list entries strictly', () => {
  assert.deepEqual(normalizePageSelection([3, 1, 3], 5), [1, 3]);
  assert.deepEqual(normalizePageSelection(['1', '3'], 5), [1, 3]);
  assert.throws(() => normalizePageSelection([], 5));
  assert.throws(() => normalizePageSelection([0], 5));
  assert.throws(() => normalizePageSelection([6], 5));
  assert.throws(() => normalizePageSelection([1.5], 5));
  assert.throws(() => normalizePageSelection(['2abc'], 5));
  assert.throws(() => normalizePageSelection(['1.5'], 5));
  assert.throws(() => normalizePageSelection([{}], 5));
});
