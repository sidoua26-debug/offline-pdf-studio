import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageSelection, parsePageRanges } from '../../src/pdf-core/pageRanges.mjs';

test('parsePageRanges supports singleton, ranges and wildcard', () => {
  assert.deepEqual(parsePageRanges('1, 3-4, *', 4), [1, 2, 3, 4]);
});

test('normalizePageSelection validates list entries', () => {
  assert.deepEqual(normalizePageSelection([3, 1, 3], 5), [1, 3]);
  assert.throws(() => normalizePageSelection([0], 5));
});
