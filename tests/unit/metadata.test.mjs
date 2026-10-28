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

test('sanitizeMetadata and inspectMetadata support isOutput to allow buffers up to maxOutputBytes', async () => {
  // A 30 MB buffer exceeds maxInputBytes (25 MB) but is within maxOutputBytes (50 MB)
  const buf30MB = { byteLength: 30 * 1024 * 1024 };

  // By default (isOutput: false), input limit is enforced
  await assert.rejects(
    sanitizeMetadata(buf30MB),
    (e) => e.code === 'LIMIT_INPUT_SIZE'
  );
  await assert.rejects(
    inspectMetadata(buf30MB),
    (e) => e.code === 'LIMIT_INPUT_SIZE'
  );

  // When isOutput: true, buffers up to 50 MB do not reject with LIMIT_INPUT_SIZE
  // (they proceed to loadPdf, which rejects with INVALID_PDF for mock buffers)
  await assert.rejects(
    sanitizeMetadata(buf30MB, { isOutput: true }),
    (e) => e.code !== 'LIMIT_INPUT_SIZE' && e.code !== 'LIMIT_OUTPUT_SIZE'
  );
  await assert.rejects(
    inspectMetadata(buf30MB, { isOutput: true }),
    (e) => e.code !== 'LIMIT_INPUT_SIZE' && e.code !== 'LIMIT_OUTPUT_SIZE'
  );

  // Buffers exceeding maxOutputBytes (50 MB) reject with LIMIT_OUTPUT_SIZE when isOutput: true
  const buf55MB = { byteLength: 55 * 1024 * 1024 };
  await assert.rejects(
    sanitizeMetadata(buf55MB, { isOutput: true }),
    (e) => e.code === 'LIMIT_OUTPUT_SIZE'
  );
  await assert.rejects(
    inspectMetadata(buf55MB, { isOutput: true }),
    (e) => e.code === 'LIMIT_OUTPUT_SIZE'
  );
});
