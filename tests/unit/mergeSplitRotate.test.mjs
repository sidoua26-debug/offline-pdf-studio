import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { mergePdfBuffers, rotatePdfPages, splitPdfBySelection } from '../../src/pdf-core/mergeSplitRotate.mjs';

const samplePath = new URL('../fixtures/sample.pdf', import.meta.url);

test('splitPdfBySelection returns selected pages', async () => {
  const sample = await readFile(samplePath);
  const out = await splitPdfBySelection(sample, '2-3');
  const pdf = await PDFDocument.load(out);
  assert.equal(pdf.getPageCount(), 2);
});

test('mergePdfBuffers merges page counts deterministically', async () => {
  const sample = await readFile(samplePath);
  const out = await mergePdfBuffers([sample, sample]);
  const pdf = await PDFDocument.load(out);
  assert.equal(pdf.getPageCount(), 6);
});

test('rotatePdfPages applies right-angle rotations', async () => {
  const sample = await readFile(samplePath);
  const out = await rotatePdfPages(sample, [{ pages: '1', degrees: 180 }]);
  const pdf = await PDFDocument.load(out);
  const angle = pdf.getPage(0).getRotation().angle;
  assert.equal(angle, 180);
});

test('relative rotation turns from the current angle; absolute still sets it', async () => {
  const sample = await readFile(samplePath);
  const once = await rotatePdfPages(sample, [{ pages: '2', degrees: 90, relative: true }]); // page 2 starts at 90
  assert.equal((await PDFDocument.load(once)).getPage(1).getRotation().angle, 180);
  const twice = await rotatePdfPages(once, [{ pages: '2', degrees: 270, relative: true }]);
  assert.equal((await PDFDocument.load(twice)).getPage(1).getRotation().angle, 90);
  const reset = await rotatePdfPages(twice, [{ pages: '2', degrees: 0 }]);
  assert.equal((await PDFDocument.load(reset)).getPage(1).getRotation().angle, 0);
});

test('merge rejects a combined input larger than the output limit', async () => {
  const big = { byteLength: 30 * 1024 * 1024 };
  await assert.rejects(mergePdfBuffers([big, big]), (e) => e.code === 'LIMIT_MERGE_TOTAL');
});
