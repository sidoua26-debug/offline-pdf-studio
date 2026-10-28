import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createPageRenderer } from '../../src/pdf-core/render.mjs';

const require = createRequire(import.meta.url);
const { createCanvas } = require('canvas');
const fontDir = fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url));

export function createNodeRenderer(options = {}) {
  return createPageRenderer({
    createCanvas: (w, h) => createCanvas(w, h),
    canvasToPng: async (canvas) => new Uint8Array(canvas.toBuffer('image/png')),
    canvasToJpeg: async (canvas, quality) => new Uint8Array(canvas.toBuffer('image/jpeg', { quality })),
    documentOptions: { standardFontDataUrl: fontDir },
    ...options
  });
}
