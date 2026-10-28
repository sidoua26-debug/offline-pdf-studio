import { PDFDocument } from 'pdf-lib';
import { enforceLimits, OPERATIONAL_LIMITS } from './limits.mjs';
import { loadPdf } from './load.mjs';
import { createError } from './errors.mjs';
import { sanitizeMetadata } from './metadata.mjs';

/**
 * Client-side rasterized compression for scanned/image-heavy PDFs.
 *
 * Each page is rendered at the chosen scale and re-encoded as a compressed JPEG
 * with the specified quality (0.1 to 1.0). The resulting pages are embedded into
 * a clean output PDF document and sanitized so default pdf-lib metadata is not leaked.
 *
 * If the output is not strictly smaller than the input (e.g. text-only or vector PDFs),
 * the operation rejects with NOT_COMPRESSIBLE so the UI can honestly report that the file
 * cannot be shrunk client-side without degrading quality for no gain.
 */
export async function compressPdfByRasterization({
  pdfBuffer,
  renderPageToJpeg,
  quality = 0.7,
  scale = 1.5,
  onProgress
}) {
  enforceLimits({ inputBytes: pdfBuffer.byteLength });

  if (typeof renderPageToJpeg !== 'function') {
    throw createError('MISSING_RENDERER', 'renderPageToJpeg callback is required for compression');
  }

  const numQuality = Number(quality);
  if (!Number.isFinite(numQuality) || numQuality < 0.1 || numQuality > 1.0) {
    throw createError('INVALID_COMPRESSION_QUALITY', 'Compression quality must be between 0.1 and 1.0', { quality });
  }

  const numScale = Number(scale);
  if (!Number.isFinite(numScale) || numScale < 0.5 || numScale > 3.0) {
    throw createError('INVALID_COMPRESSION_SCALE', 'Compression scale must be between 0.5 and 3.0', { scale });
  }

  const source = await loadPdf(pdfBuffer);
  const pageCount = source.getPageCount();
  enforceLimits({ pageCount });

  const target = await PDFDocument.create();

  try {
    for (let i = 0; i < pageCount; i += 1) {
      const pageNumber = i + 1;
      const size = source.getPage(i).getSize();

      const result = await renderPageToJpeg({
        pdfBuffer,
        pageNumber,
        quality: numQuality,
        scale: numScale,
        width: size.width,
        height: size.height
      });

      if (!result?.jpegBytes || !result.width || !result.height) {
        throw createError('RENDER_FAILURE', 'Renderer did not return a valid compressed page image', { pageNumber });
      }

      enforceLimits({ renderedPixelArea: result.width * result.height });

      const pageWidth = result.pageWidth ?? size.width;
      const pageHeight = result.pageHeight ?? size.height;
      const image = await target.embedJpg(result.jpegBytes);
      const page = target.addPage([pageWidth, pageHeight]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });

      onProgress?.({ stage: 'compress', pageNumber, totalPages: pageCount });
    }
  } finally {
    await renderPageToJpeg.release?.(pdfBuffer);
  }

  const rawBytes = await target.save();
  const sanitizedBytes = await sanitizeMetadata(rawBytes);
  enforceLimits({ outputBytes: sanitizedBytes.byteLength });

  if (sanitizedBytes.byteLength >= pdfBuffer.byteLength) {
    throw createError('NOT_COMPRESSIBLE', 'The compressed output is not smaller than the original PDF.', {
      originalBytes: pdfBuffer.byteLength,
      compressedBytes: sanitizedBytes.byteLength
    });
  }

  return {
    bytes: sanitizedBytes,
    originalBytes: pdfBuffer.byteLength,
    compressedBytes: sanitizedBytes.byteLength,
    ratio: Number((sanitizedBytes.byteLength / pdfBuffer.byteLength).toFixed(3)),
    pageCount
  };
}
