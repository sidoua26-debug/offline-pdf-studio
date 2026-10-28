import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from 'canvas';
import { compressPdfByRasterization } from '../../src/pdf-core/compress.mjs';
import { createNodeRenderer } from '../helpers/nodeRenderer.mjs';

test('compress integration: compresses an image-rich PDF and verifies output', async () => {
  // Create an image-heavy PDF (photo-like gradient)
  const c = createCanvas(400, 400);
  const ctx = c.getContext('2d');
  for (let y = 0; y < 400; y += 1) {
    for (let x = 0; x < 400; x += 1) {
      ctx.fillStyle = `rgb(${(x / 2) | 0}, ${(y / 2) | 0}, 128)`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const pngBytes = c.toBuffer('image/png');

  const doc = await PDFDocument.create();
  const img = await doc.embedPng(pngBytes);
  const page = doc.addPage([400, 400]);
  page.drawImage(img, { x: 0, y: 0, width: 400, height: 400 });
  const originalBytes = await doc.save();

  const renderer = createNodeRenderer();
  const result = await compressPdfByRasterization({
    pdfBuffer: originalBytes,
    renderPageToJpeg: renderer.renderPageToJpeg,
    quality: 0.5,
    scale: 1.0
  });
  await renderer.close();

  assert.equal(result.pageCount, 1);
  assert.ok(result.bytes.byteLength > 0);
  // Verify it's a valid readable PDF
  const outputDoc = await PDFDocument.load(result.bytes);
  assert.equal(outputDoc.getPageCount(), 1);
  assert.equal(outputDoc.getPage(0).getWidth(), 400);
  assert.equal(outputDoc.getPage(0).getHeight(), 400);
});
