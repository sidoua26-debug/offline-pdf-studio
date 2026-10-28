import { createError } from './errors.mjs';

function parseToken(token, maxPage) {
  const t = token.trim();
  if (!t) return [];
  if (t === '*') return Array.from({ length: maxPage }, (_, i) => i + 1);

  if (t.includes('-')) {
    const [startStr, endStr] = t.split('-').map((v) => v.trim());
    const start = startStr === '' ? 1 : Number.parseInt(startStr, 10);
    const end = endStr === '' ? maxPage : Number.parseInt(endStr, 10);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > maxPage || end > maxPage || start > end) {
      throw createError('INVALID_PAGE_RANGE', `Invalid page range token: ${t}`, { token: t, maxPage });
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  const page = Number.parseInt(t, 10);
  if (!Number.isInteger(page) || page < 1 || page > maxPage) {
    throw createError('INVALID_PAGE_RANGE', `Invalid page number token: ${t}`, { token: t, maxPage });
  }
  return [page];
}

export function parsePageRanges(input, maxPage) {
  if (!Number.isInteger(maxPage) || maxPage < 1) {
    throw createError('INVALID_MAX_PAGE', 'maxPage must be >= 1', { maxPage });
  }
  if (typeof input !== 'string' || !input.trim()) {
    throw createError('INVALID_PAGE_RANGE', 'Page range expression is required', { input });
  }

  const values = input
    .split(',')
    .flatMap((token) => parseToken(token, maxPage));

  return [...new Set(values)].sort((a, b) => a - b);
}

export function normalizePageSelection(selection, maxPage) {
  if (Array.isArray(selection)) {
    const normalized = [...new Set(selection.map((v) => Number.parseInt(v, 10)))].sort((a, b) => a - b);
    if (normalized.some((p) => !Number.isInteger(p) || p < 1 || p > maxPage)) {
      throw createError('INVALID_PAGE_SELECTION', 'Page selection contains invalid pages', { selection, maxPage });
    }
    return normalized;
  }
  return parsePageRanges(selection, maxPage);
}
