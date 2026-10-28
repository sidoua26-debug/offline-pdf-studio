import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { OPERATIONAL_LIMITS } from './limits.mjs';
import { createError } from './errors.mjs';

// Always returns a plain Uint8Array copy (pdf.js rejects Node Buffers and detaches what it is given).
const copyBytes = (data) =>
  ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    : new Uint8Array(data.slice(0));

/**
 * Creates a pdf.js-backed page renderer. Environment specifics are injected so the same
 * code runs in browsers (DOM canvas) and Node tests (node-canvas).
 *
 * rects use the displayed page's top-left origin in PDF points (pdf.js viewport at scale 1,
 * i.e. rotation and crop box already applied).
 */
export function createPageRenderer({ createCanvas, canvasToPng, canvasToJpeg, targetScale = 2, documentOptions = {} }) {
  const cache = new Map();

  async function open(buffer) {
    let entry = cache.get(buffer);
    if (!entry) {
      const task = getDocument({ data: copyBytes(buffer), isEvalSupported: false, ...documentOptions });
      entry = { task, pdf: await task.promise };
      cache.set(buffer, entry);
    }
    return entry.pdf;
  }

  async function draw(page, scale) {
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return { canvas, ctx };
  }

  async function renderPageToPng({ pdfBuffer, pageNumber, rects = [] }) {
    const pdf = await open(pdfBuffer);
    const page = await pdf.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const areaCap = Math.sqrt(OPERATIONAL_LIMITS.maxRenderedPixelArea / (base.width * base.height)) * 0.98;
      const scale = Math.min(targetScale, areaCap);
      const { canvas, ctx } = await draw(page, scale);

      ctx.fillStyle = '#000000';
      for (const r of rects) {
        // Expand outward to whole pixels so anti-aliased edges never leave a sliver of content.
        const x0 = Math.max(0, Math.floor(r.x * scale) - 1);
        const y0 = Math.max(0, Math.floor(r.y * scale) - 1);
        const x1 = Math.min(canvas.width, Math.ceil((r.x + r.width) * scale) + 1);
        const y1 = Math.min(canvas.height, Math.ceil((r.y + r.height) * scale) + 1);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }

      const { width, height } = canvas; // read before the backing store is released below
      let pngBytes;
      try {
        pngBytes = await canvasToPng(canvas);
      } finally {
        canvas.width = 0; // release the bitmap backing store now rather than at GC
        canvas.height = 0;
      }
      return { pngBytes, width, height, pageWidth: base.width, pageHeight: base.height };
    } finally {
      page.cleanup();
    }
  }

  async function renderPageToJpeg({ pdfBuffer, pageNumber, quality = 0.7, scale: reqScale = 1.5 }) {
    if (typeof canvasToJpeg !== 'function') {
      throw createError('MISSING_RENDERER', 'canvasToJpeg callback is required for JPEG rendering');
    }
    const pdf = await open(pdfBuffer);
    const page = await pdf.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const areaCap = Math.sqrt(OPERATIONAL_LIMITS.maxRenderedPixelArea / (base.width * base.height)) * 0.98;
      const scale = Math.min(reqScale, areaCap);
      const { canvas } = await draw(page, scale);

      const { width, height } = canvas;
      let jpegBytes;
      try {
        jpegBytes = await canvasToJpeg(canvas, quality);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      return { jpegBytes, width, height, pageWidth: base.width, pageHeight: base.height };
    } finally {
      page.cleanup();
    }
  }

  /** Re-renders an output page and confirms every redaction rect is solid black. */
  async function verifyBlackRects({ pdfBytes, pageNumber, rects }) {
    const buffer = copyBytes(pdfBytes);
    const pdf = await open(buffer);
    try {
      const page = await pdf.getPage(pageNumber);
      const { canvas, ctx } = await draw(page, 1);
      try {
        for (const r of rects) {
          const x = Math.max(0, Math.ceil(r.x) + 1);
          const y = Math.max(0, Math.ceil(r.y) + 1);
          const w = Math.min(canvas.width - x, Math.floor(r.width) - 2);
          const h = Math.min(canvas.height - y, Math.floor(r.height) - 2);
          if (w < 1 || h < 1) continue; // too small to sample reliably at 1x
          const { data } = ctx.getImageData(x, y, w, h);
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 12) {
              throw createError('REDACTION_VERIFICATION_PIXELS', 'Redacted area is not solid black in the output', { pageNumber, rect: r });
            }
          }
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    } finally {
      await release(buffer);
    }
  }

  async function release(buffer) {
    const entry = cache.get(buffer);
    if (entry) {
      cache.delete(buffer);
      await entry.task.destroy();
    }
  }

  async function close() {
    await Promise.all([...cache.keys()].map(release));
  }

  renderPageToPng.release = release;
  renderPageToJpeg.release = release;
  return { renderPageToPng, renderPageToJpeg, verifyBlackRects, release, close };
}
