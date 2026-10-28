import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { compressPdfByRasterization } from '../../src/pdf-core/compress.mjs';
import { createNodeRenderer } from '../helpers/nodeRenderer.mjs';

import { inspectMetadata } from '../../src/pdf-core/metadata.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);
const scannedPath = new URL('../fixtures/scanned.pdf', import.meta.url);

test('compressPdfByRasterization compresses image-heavy PDF, shrinks size, and sanitizes metadata', async () => {
  const scanned = await readFile(scannedPath);
  const renderer = createNodeRenderer();
  
  const result = await compressPdfByRasterization({
    pdfBuffer: scanned,
    renderPageToJpeg: renderer.renderPageToJpeg,
    quality: 0.6,
    scale: 1.0
  });
  await renderer.close();

  assert.ok(result.bytes instanceof Uint8Array);
  assert.equal(result.pageCount, 1);
  assert.equal(typeof result.ratio, 'number');
  assert.ok(result.ratio < 1, 'ratio should be < 1');
  assert.ok(result.compressedBytes < result.originalBytes, 'compressed size should be smaller than original');
  assert.equal(result.originalBytes, scanned.byteLength);

  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 1);

  // Verify metadata is sanitized and doesn't leak default producer or current dates
  const { metadata } = await inspectMetadata(result.bytes);
  assert.equal(metadata.title, '');
  assert.equal(metadata.author, '');
  assert.equal(metadata.producer, '');
  assert.equal(metadata.creator, '');
  assert.equal(metadata.creationDate, '1970-01-01T00:00:00.000Z');
  assert.equal(metadata.modificationDate, '1970-01-01T00:00:00.000Z');
});

test('compressPdfByRasterization refuses text-only PDF with NOT_COMPRESSIBLE', async () => {
  const sample = await readFile(samplePath);
  const renderer = createNodeRenderer();

  await assert.rejects(
    compressPdfByRasterization({
      pdfBuffer: sample,
      renderPageToJpeg: renderer.renderPageToJpeg,
      quality: 0.6,
      scale: 1.0
    }),
    (e) => {
      assert.equal(e.code, 'NOT_COMPRESSIBLE');
      assert.equal(e.details.originalBytes, sample.byteLength);
      assert.ok(e.details.compressedBytes >= sample.byteLength);
      return true;
    }
  );

  await renderer.close();
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
