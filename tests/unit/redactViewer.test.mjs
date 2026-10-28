import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stand-ins: enough for RedactViewer's box bookkeeping (no rendering).
const el = () => ({ style: {}, dataset: {}, children: [], append(c) { this.children.push(c); }, remove() {}, classList: { toggle() {} } });
globalThis.document = { createElement: el };
const { RedactViewer } = await import('../../pdf-tools/redactViewer.mjs');

function makeViewer() {
  const overlay = { ...el(), addEventListener() {}, querySelectorAll: () => [] };
  return new RedactViewer({ stage: el(), canvas: el(), overlay, assetBase: 'x:/', onChange() {} });
}

test('undo reverses add and remove in order, and the stack empties', () => {
  const v = makeViewer();
  v.pdf = { numPages: 3 };
  v.pageNumber = 2;
  const a = { x: 1, y: 1, width: 10, height: 10 };
  const b = { x: 5, y: 5, width: 20, height: 20 };
  v.addBox(a);
  v.addBox(b);
  v.removeBox(2, 0); // removes a
  assert.deepEqual(v.boxesFor(2), [b]);

  assert.equal(v.undo(), true); // restores a at index 0
  assert.deepEqual(v.boxesFor(2), [a, b]);
  assert.equal(v.undo(), true); // un-adds b
  assert.deepEqual(v.boxesFor(2), [a]);
  assert.equal(v.undo(), true);
  assert.deepEqual(v.boxesFor(2), []);
  assert.equal(v.canUndo, false);
  assert.equal(v.undo(), false);
});

test('redactions() only reports pages that still have boxes', () => {
  const v = makeViewer();
  v.pdf = { numPages: 2 };
  v.pageNumber = 1;
  v.addBox({ x: 0, y: 0, width: 5, height: 5 });
  v.undo();
  assert.deepEqual(v.redactions(), []);
});
