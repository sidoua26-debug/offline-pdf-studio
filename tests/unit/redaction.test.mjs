import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { PDFDocument } from 'pdf-lib';
import { redactByRasterizedRebuild } from '../../src/pdf-core/redaction.mjs';
import { extractPageText } from '../../src/pdf-core/verify.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);

function mockRenderer({ width, height }) {
  const png = new PNG({ width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  }
  return {
    pngBytes: PNG.sync.write(png),
    width: png.width,
    height: png.height
  };
}

test('rasterized redaction removes text from selected pages and preserves unredacted text', async () => {
  const sample = await readFile(samplePath);
  const out = await redactByRasterizedRebuild({
    pdfBuffer: sample,
    redactedPages: [2],
    renderPageToPng: mockRenderer
  });

  const pdf = await PDFDocument.load(out.bytes);
  assert.equal(pdf.getPageCount(), 3);

  const redactedPageText = await extractPageText(out.bytes, 2);
  const unredactedPageText = await extractPageText(out.bytes, 1);

  assert.equal(redactedPageText, '');
  assert.ok(unredactedPageText.includes('Fixture Page 1 Portrait'));
});
