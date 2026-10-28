import { createError } from './errors.mjs';

export const OPERATIONAL_LIMITS = Object.freeze({
  maxInputBytes: 25 * 1024 * 1024,
  maxPageCount: 200,
  maxRenderedPixelArea: 40_000_000,
  maxOutputBytes: 50 * 1024 * 1024
});

export function enforceLimits({ inputBytes, pageCount, renderedPixelArea, outputBytes }) {
  if (typeof inputBytes === 'number' && inputBytes > OPERATIONAL_LIMITS.maxInputBytes) {
    throw createError('LIMIT_INPUT_SIZE', 'Input file exceeds max supported size', { inputBytes, max: OPERATIONAL_LIMITS.maxInputBytes });
  }
  if (typeof pageCount === 'number' && pageCount > OPERATIONAL_LIMITS.maxPageCount) {
    throw createError('LIMIT_PAGE_COUNT', 'PDF exceeds max supported page count', { pageCount, max: OPERATIONAL_LIMITS.maxPageCount });
  }
  if (typeof renderedPixelArea === 'number' && renderedPixelArea > OPERATIONAL_LIMITS.maxRenderedPixelArea) {
    throw createError('LIMIT_RENDER_AREA', 'Redaction render area exceeds limit', { renderedPixelArea, max: OPERATIONAL_LIMITS.maxRenderedPixelArea });
  }
  if (typeof outputBytes === 'number' && outputBytes > OPERATIONAL_LIMITS.maxOutputBytes) {
    throw createError('LIMIT_OUTPUT_SIZE', 'Output PDF exceeds max supported size', { outputBytes, max: OPERATIONAL_LIMITS.maxOutputBytes });
  }
}
