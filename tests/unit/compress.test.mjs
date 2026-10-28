import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { compressPdfByRasterization } from '../../src/pdf-core/compress.mjs';
import { createNodeRenderer } from '../helpers/nodeRenderer.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);

test('compressPdfByRasterization re-encodes pages and produces valid PDF', async () => {
  const sample = await readFile(samplePath);
  const renderer = createNodeRenderer();
  
  const result = await compressPdfByRasterization({
    pdfBuffer: sample,
    renderPageToJpeg: renderer.renderPageToJpeg,
    quality: 0.6,
    scale: 1.0
  });
  await renderer.close();

  assert.ok(result.bytes instanceof Uint8Array);
  assert.equal(result.pageCount, 3);
  assert.equal(typeof result.ratio, 'number');
  assert.ok(result.compressedBytes > 0);

  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 3);
});

test('compressPdfByRasterization validates quality and scale parameters', async () => {
  const sample = await readFile(samplePath);
  const renderer = createNodeRenderer();

  await assert.rejects(
    compressPdfByRasterization({
      pdfBuffer: sample,
      renderPageToJpeg: renderer.renderPageToJpeg,
      quality: 0.05
    }),
    (e) => e.code === 'INVALID_COMPRESSION_QUALITY'
  );

  await assert.rejects(
    compressPdfByRasterization({
      pdfBuffer: sample,
      renderPageToJpeg: renderer.renderPageToJpeg,
      quality: 1.5
    }),
    (e) => e.code === 'INVALID_COMPRESSION_QUALITY'
  );

  await assert.rejects(
    compressPdfByRasterization({
      pdfBuffer: sample,
      renderPageToJpeg: renderer.renderPageToJpeg,
      scale: 0.1
    }),
    (e) => e.code === 'INVALID_COMPRESSION_SCALE'
  );

  await renderer.close();
});

test('compressPdfByRasterization requires renderPageToJpeg callback', async () => {
  const sample = await readFile(samplePath);
  await assert.rejects(
    compressPdfByRasterization({ pdfBuffer: sample }),
    (e) => e.code === 'MISSING_RENDERER'
  );
});

test('compressPdfByRasterization enforces input size limits', async () => {
  const big = { byteLength: 30 * 1024 * 1024 };
  await assert.rejects(
    compressPdfByRasterization({ pdfBuffer: big, renderPageToJpeg: () => {} }),
    (e) => e.code === 'LIMIT_INPUT_SIZE'
  );
});
