import { PDFDocument } from 'pdf-lib';
import { enforceLimits } from './limits.mjs';
import { sanitizeMetadata } from './metadata.mjs';
import { verifyRedactionOutput } from './verify.mjs';
import { createError } from './errors.mjs';
import { loadPdf } from './load.mjs';

function validateRect(rect, page) {
  const { x, y, width, height } = rect ?? {};
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw createError('INVALID_REDACTION_RECT', 'Redaction rectangle must have finite, positive size', { page, rect });
  }
  return { x, y, width, height };
}

/**
 * Verified Destructive Redaction v1: selected pages are painted with black boxes, flattened to an
 * image and rebuilt, so original text/vector data on those pages no longer exists in the output.
 *
 * - redactions: [{ page, rects: [{x, y, width, height}] }] (points, top-left origin, as displayed)
 * - redactedPages: pages to flatten with no boxes (legacy / whole-page flatten)
 * - verifyRects: optional async ({ pdfBytes, pageNumber, rects }) that must throw if boxes aren't black
 */
export async function redactByRasterizedRebuild({
  pdfBuffer,
  redactedPages = [],
  redactions = [],
  renderPageToPng,
  verifyRects,
  onProgress
}) {
  enforceLimits({ inputBytes: pdfBuffer.byteLength });

  if (typeof renderPageToPng !== 'function') {
    throw createError('MISSING_RENDERER', 'renderPageToPng callback is required');
  }

  const source = await loadPdf(pdfBuffer);
  const pageCount = source.getPageCount();
  enforceLimits({ pageCount });

  const rectMap = new Map();
  for (const page of redactedPages) rectMap.set(Number(page), rectMap.get(Number(page)) ?? []);
  for (const entry of redactions) {
    const rects = (entry.rects ?? []).map((r) => validateRect(r, entry.page));
    rectMap.set(Number(entry.page), [...(rectMap.get(Number(entry.page)) ?? []), ...rects]);
  }

  const uniquePages = [...rectMap.keys()].sort((a, b) => a - b);
  if (uniquePages.length === 0) {
    throw createError('NOTHING_TO_REDACT', 'Select at least one page or region to redact');
  }
  if (uniquePages.some((p) => !Number.isInteger(p) || p < 1 || p > pageCount)) {
    throw createError('INVALID_PAGE_SELECTION', 'Redaction pages must be within the document', { pages: uniquePages, pageCount });
  }

  const target = await PDFDocument.create();
  try {
    for (let i = 0; i < pageCount; i += 1) {
      const pageNumber = i + 1;
      if (!rectMap.has(pageNumber)) {
        const [copied] = await target.copyPages(source, [i]);
        target.addPage(copied);
        onProgress?.({ type: 'progress', stage: 'copy', pageNumber, totalPages: pageCount });
        continue;
      }

      const rects = rectMap.get(pageNumber);
      const size = source.getPage(i).getSize();
      const result = await renderPageToPng({ pdfBuffer, pageNumber, rects, width: size.width, height: size.height });
      if (!result?.pngBytes || !result.width || !result.height) {
        throw createError('RENDER_FAILURE', 'Renderer did not return a valid flattened page image', { pageNumber });
      }

      enforceLimits({ renderedPixelArea: result.width * result.height });
      const pageWidth = result.pageWidth ?? size.width;
      const pageHeight = result.pageHeight ?? size.height;
      const image = await target.embedPng(result.pngBytes);
      const page = target.addPage([pageWidth, pageHeight]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      onProgress?.({ type: 'progress', stage: 'rasterize', pageNumber, totalPages: pageCount });
    }
  } finally {
    await renderPageToPng.release?.(pdfBuffer);
  }

  const rebuiltBytes = await target.save();
  const sanitized = await sanitizeMetadata(rebuiltBytes, { isOutput: true });

  let verification;
  try {
    verification = await verifyRedactionOutput({
      pdfBytes: sanitized,
      redactedPages: uniquePages,
      expectedSanitizedMetadata: true
    });
    if (typeof verifyRects === 'function') {
      for (const pageNumber of uniquePages) {
        const rects = rectMap.get(pageNumber);
        if (rects.length > 0) await verifyRects({ pdfBytes: sanitized, pageNumber, rects });
      }
      verification.surfacesChecked.push('rendered-pixels');
    }
  } catch (error) {
    throw createError('REDACTION_FAIL_CLOSED', 'Verification failed; refusing to return output', { cause: error.message, code: error.code });
  }

  enforceLimits({ outputBytes: sanitized.byteLength });
  return {
    bytes: sanitized,
    verification,
    redactedPages: uniquePages,
    mode: 'rasterized-rebuild-v1',
    terminology: 'Verified Destructive Redaction'
  };
}
