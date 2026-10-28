import { createError } from './errors.mjs';

/**
 * Converts a UI rect in CSS pixels to PDF points for a page.
 * rectCss uses top-left origin in CSS pixels.
 */
export function cssRectToPdfRect({ rectCss, page, viewport }) {
  const { x, y, width, height } = rectCss;
  const { cssWidth, cssHeight, canvasWidth, canvasHeight, devicePixelRatio = 1, zoom = 1 } = viewport;

  if (![x, y, width, height, cssWidth, cssHeight, canvasWidth, canvasHeight, devicePixelRatio, zoom].every(Number.isFinite)) {
    throw createError('INVALID_COORDS', 'Coordinate conversion received non-finite values');
  }

  const pxToCanvasX = canvasWidth / cssWidth;
  const pxToCanvasY = canvasHeight / cssHeight;

  const xCanvas = x * pxToCanvasX;
  const yCanvas = y * pxToCanvasY;
  const wCanvas = width * pxToCanvasX;
  const hCanvas = height * pxToCanvasY;

  const pageWidth = page.cropBox?.width ?? page.mediaBox.width;
  const pageHeight = page.cropBox?.height ?? page.mediaBox.height;
  const originX = page.cropBox?.x ?? page.mediaBox.x ?? 0;
  const originY = page.cropBox?.y ?? page.mediaBox.y ?? 0;

  const scale = devicePixelRatio * zoom;
  const xPtBase = xCanvas / scale;
  const yPtBase = yCanvas / scale;
  const wPtBase = wCanvas / scale;
  const hPtBase = hCanvas / scale;

  const rotation = ((page.rotation ?? 0) % 360 + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) {
    throw createError('INVALID_ROTATION', 'Only 0/90/180/270 rotations are supported', { rotation });
  }

  let left;
  let bottom;
  let right;
  let top;

  if (rotation === 0) {
    left = xPtBase;
    right = xPtBase + wPtBase;
    top = pageHeight - yPtBase;
    bottom = top - hPtBase;
  } else if (rotation === 90) {
    left = yPtBase;
    right = yPtBase + hPtBase;
    top = xPtBase + wPtBase;
    bottom = xPtBase;
  } else if (rotation === 180) {
    right = pageWidth - xPtBase;
    left = right - wPtBase;
    bottom = yPtBase;
    top = yPtBase + hPtBase;
  } else {
    right = pageWidth - yPtBase;
    left = right - hPtBase;
    bottom = pageHeight - (xPtBase + wPtBase);
    top = pageHeight - xPtBase;
  }

  return {
    left: left + originX,
    bottom: bottom + originY,
    right: right + originX,
    top: top + originY
  };
}
