import test from 'node:test';
import assert from 'node:assert/strict';
import { cssRectToPdfRect } from '../../src/pdf-core/coordinates.mjs';

const viewport = {
  cssWidth: 612,
  cssHeight: 792,
  canvasWidth: 1224,
  canvasHeight: 1584,
  devicePixelRatio: 2,
  zoom: 1
};

test('converts portrait page rect', () => {
  const rect = cssRectToPdfRect({
    rectCss: { x: 61.2, y: 79.2, width: 122.4, height: 79.2 },
    page: { rotation: 0, mediaBox: { x: 0, y: 0, width: 612, height: 792 } },
    viewport
  });
  assert.equal(Math.round(rect.left), 61);
  assert.equal(Math.round(rect.top), 713);
});

test('converts landscape rotated page rect (90°)', () => {
  const rect = cssRectToPdfRect({
    rectCss: { x: 50, y: 30, width: 100, height: 40 },
    page: { rotation: 90, mediaBox: { x: 0, y: 0, width: 792, height: 612 } },
    viewport: { ...viewport, cssWidth: 792, cssHeight: 612, canvasWidth: 1584, canvasHeight: 1224 }
  });
  assert.ok(rect.left < rect.right);
  assert.ok(rect.bottom < rect.top);
});

test('converts 180° and non-letter cropbox offset pages', () => {
  const rect = cssRectToPdfRect({
    rectCss: { x: 20, y: 20, width: 80, height: 80 },
    page: {
      rotation: 180,
      mediaBox: { x: 0, y: 0, width: 500, height: 500 },
      cropBox: { x: 10, y: 20, width: 480, height: 460 }
    },
    viewport: { ...viewport, cssWidth: 500, cssHeight: 500, canvasWidth: 1000, canvasHeight: 1000 }
  });
  assert.ok(rect.left >= 10);
  assert.ok(rect.bottom >= 20);
});

test('converts 270° with zoom and dpr adjustments', () => {
  const rect = cssRectToPdfRect({
    rectCss: { x: 25, y: 40, width: 120, height: 50 },
    page: { rotation: 270, mediaBox: { x: 0, y: 0, width: 612, height: 792 } },
    viewport: { ...viewport, zoom: 1.25, devicePixelRatio: 1.5, canvasWidth: 918, canvasHeight: 1188 }
  });
  assert.ok(rect.left < rect.right);
  assert.ok(rect.bottom < rect.top);
});
