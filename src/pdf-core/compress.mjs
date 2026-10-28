import { PDFDocument } from 'pdf-lib';
import { enforceLimits, OPERATIONAL_LIMITS } from './limits.mjs';
import { loadPdf } from './load.mjs';
import { createError } from './errors.mjs';

/**
 * Client-side rasterized compression for scanned/image-heavy PDFs.
 *
 * Each page is rendered at the chosen scale and re-encoded as a compressed JPEG
 * with the specified quality (0.1 to 1.0). The resulting pages are embedded into
 * a clean output PDF document.
 *
 * NOTE on pure client-side PDF compression:
 * Pure client-side JavaScript without large WASM binaries (e.g. Ghostscript, MuPDF, QPDF)
 * cannot safely re-compress arbitrary internal PDF stream objects or perform lossless font
 * subsetting. Rasterized JPEG re-encoding provides significant real size reduction (often 50-80%)
 * for scanned documents, photos, and high-DPI raster pages.
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

  const outputBytes = await target.save();
  enforceLimits({ outputBytes: outputBytes.byteLength });

  return {
    bytes: outputBytes,
    originalBytes: pdfBuffer.byteLength,
    compressedBytes: outputBytes.byteLength,
    ratio: Number((outputBytes.byteLength / pdfBuffer.byteLength).toFixed(3)),
    pageCount
  };
}
