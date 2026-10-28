import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectMetadata, sanitizeMetadata } from '../../src/pdf-core/metadata.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);

test('inspectMetadata returns matrix and metadata', async () => {
  const sample = await readFile(samplePath);
  const info = await inspectMetadata(sample);
  assert.equal(info.metadata.title, 'Fixture PDF');
  assert.ok(info.featureMatrix.supported.length > 0);
  assert.ok(info.featureMatrix.unsupported.length > 0);
});

test('sanitizeMetadata clears known fields', async () => {
  const sample = await readFile(samplePath);
  const out = await sanitizeMetadata(sample);
  const info = await inspectMetadata(out);
  assert.equal(info.metadata.title, '');
  assert.equal(info.metadata.author, '');
});
