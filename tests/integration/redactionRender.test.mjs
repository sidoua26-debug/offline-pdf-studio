import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { redactByRasterizedRebuild } from '../../src/pdf-core/redaction.mjs';
import { extractPageText } from '../../src/pdf-core/verify.mjs';
import { createNodeRenderer } from '../helpers/nodeRenderer.mjs';

async function secretPdf() {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Top secret title');
  pdf.setAuthor('Jane Secret');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const p1 = pdf.addPage([400, 300]);
  p1.drawText('PUBLIC-ONE', { x: 40, y: 250, size: 20, font });
  p1.drawText('SSN 123-45-6789', { x: 40, y: 150, size: 20, font });
  const p2 = pdf.addPage([400, 300]);
  p2.drawText('PUBLIC-TWO', { x: 40, y: 250, size: 20, font });
  const p3 = pdf.addPage([400, 300]);
  p3.drawText('ROTATED-SECRET', { x: 40, y: 150, size: 20, font });
  p3.setRotation(degrees(90));
  return pdf.save();
}

test('real rendering: boxes are black, text is gone, other pages and regions survive', async () => {
  const bytes = await secretPdf();
  const renderer = createNodeRenderer();
  // Page 1: the SSN line sits ~y=150 (PDF coords) => ~y=130..155 from the top of a 300pt page.
  const ssnBox = { x: 30, y: 125, width: 220, height: 35 };
  const out = await redactByRasterizedRebuild({
    pdfBuffer: bytes,
    redactions: [{ page: 1, rects: [ssnBox] }],
    renderPageToPng: renderer.renderPageToPng,
    verifyRects: renderer.verifyBlackRects
  });
  await renderer.close();

  assert.equal(out.verification.verified, true);
  assert.ok(out.verification.surfacesChecked.includes('rendered-pixels'));
  assert.equal(await extractPageText(out.bytes, 1), '');
  assert.ok((await extractPageText(out.bytes, 2)).includes('PUBLIC-TWO'));

  const raw = Buffer.from(out.bytes).toString('latin1');
  assert.ok(!raw.includes('123-45-6789'));
  assert.ok(!raw.includes('Jane Secret'));
  assert.ok(!raw.includes('Top secret title'));

  // Independent pixel check: box region black, but "PUBLIC-ONE" area still visible (non-white pixels).
  const check = createNodeRenderer();
  await check.verifyBlackRects({ pdfBytes: out.bytes, pageNumber: 1, rects: [ssnBox] });
  const { PNG } = await import('pngjs');
  const png = await check.renderPageToPng({ pdfBuffer: out.bytes, pageNumber: 1, rects: [] });
  await check.close();
  const img = PNG.sync.read(Buffer.from(png.pngBytes));
  const scale = img.width / png.pageWidth;
  let inked = 0;
  for (let y = Math.floor(20 * scale); y < Math.floor(60 * scale); y += 1) {
    for (let x = Math.floor(30 * scale); x < Math.floor(200 * scale); x += 1) {
      const i = (y * img.width + x) * 4;
      if (img.data[i] < 128) inked += 1;
    }
  }
  assert.ok(inked > 50, 'unredacted content on the redacted page must remain visible');
});

test('rotated page: output page size follows the displayed orientation and box lands on the text', async () => {
  const bytes = await secretPdf();
  const renderer = createNodeRenderer();
  const probe = await renderer.renderPageToPng({ pdfBuffer: bytes, pageNumber: 3, rects: [] });
  assert.equal(probe.pageWidth, 300);
  assert.equal(probe.pageHeight, 400);
  const out = await redactByRasterizedRebuild({
    pdfBuffer: bytes,
    redactedPages: [3],
    redactions: [{ page: 3, rects: [{ x: 0, y: 0, width: 300, height: 400 }] }],
    renderPageToPng: renderer.renderPageToPng,
    verifyRects: renderer.verifyBlackRects
  });
  await renderer.close();
  const doc = await PDFDocument.load(out.bytes);
  const { width, height } = doc.getPage(2).getSize();
  assert.deepEqual([width, height], [300, 400]);
  assert.equal(await extractPageText(out.bytes, 3), '');
});

test('fail closed: a renderer that does not paint boxes is rejected by pixel verification', async () => {
  const bytes = await secretPdf();
  const renderer = createNodeRenderer();
  const lazy = async (args) => renderer.renderPageToPng({ ...args, rects: [] }); // ignores boxes
  lazy.release = renderer.renderPageToPng.release;
  await assert.rejects(
    redactByRasterizedRebuild({
      pdfBuffer: bytes,
      redactions: [{ page: 1, rects: [{ x: 30, y: 125, width: 220, height: 35 }] }],
      renderPageToPng: lazy,
      verifyRects: renderer.verifyBlackRects
    }),
    (error) => error.code === 'REDACTION_FAIL_CLOSED'
  );
  await renderer.close();
});

test('rejects nothing-to-redact, bad pages, bad rects, encrypted/garbage input', async () => {
  const bytes = await secretPdf();
  const renderer = createNodeRenderer();
  const base = { pdfBuffer: bytes, renderPageToPng: renderer.renderPageToPng };
  await assert.rejects(redactByRasterizedRebuild(base), (e) => e.code === 'NOTHING_TO_REDACT');
  await assert.rejects(redactByRasterizedRebuild({ ...base, redactedPages: [9] }), (e) => e.code === 'INVALID_PAGE_SELECTION');
  await assert.rejects(
    redactByRasterizedRebuild({ ...base, redactions: [{ page: 1, rects: [{ x: 0, y: 0, width: -5, height: 3 }] }] }),
    (e) => e.code === 'INVALID_REDACTION_RECT'
  );
  await assert.rejects(
    redactByRasterizedRebuild({ ...base, pdfBuffer: new Uint8Array([1, 2, 3]), redactedPages: [1] }),
    (e) => e.code === 'INVALID_PDF'
  );
  await renderer.close();
});

test('accepts Node Buffers (e.g. from readFile) as well as Uint8Array', async () => {
  const bytes = Buffer.from(await secretPdf());
  const renderer = createNodeRenderer();
  const out = await redactByRasterizedRebuild({
    pdfBuffer: bytes,
    redactions: [{ page: 2, rects: [{ x: 10, y: 10, width: 100, height: 40 }] }],
    renderPageToPng: renderer.renderPageToPng,
    verifyRects: renderer.verifyBlackRects
  });
  await renderer.close();
  assert.equal(out.verification.verified, true);
});
