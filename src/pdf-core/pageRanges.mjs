import { createError } from './errors.mjs';

const STRICT_POSITIVE_INT_REGEX = /^[1-9]\d*$/;

function parseStrictNumber(str, maxPage) {
  if (!STRICT_POSITIVE_INT_REGEX.test(str)) {
    return null;
  }
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < 1 || num > maxPage) {
    return null;
  }
  return num;
}

function parseToken(token, maxPage) {
  const t = token.trim();
  if (!t) {
    throw createError('INVALID_PAGE_RANGE', 'Empty page token is not allowed', { token, maxPage });
  }

  if (t === '*') {
    return Array.from({ length: maxPage }, (_, i) => i + 1);
  }

  if (t.includes('-')) {
    const parts = t.split('-');
    if (parts.length !== 2) {
      throw createError('INVALID_PAGE_RANGE', `Invalid page range syntax: ${t}`, { token: t, maxPage });
    }
    const startStr = parts[0].trim();
    const endStr = parts[1].trim();

    if (!startStr && !endStr) {
      throw createError('INVALID_PAGE_RANGE', `Bare hyphen is not allowed: ${t}`, { token: t, maxPage });
    }

    if (!startStr) {
      const end = parseStrictNumber(endStr, maxPage);
      if (end === null) {
        throw createError('INVALID_PAGE_RANGE', `Invalid range endpoint: ${t}`, { token: t, maxPage });
      }
      return Array.from({ length: end }, (_, i) => i + 1);
    }

    if (!endStr) {
      const start = parseStrictNumber(startStr, maxPage);
      if (start === null) {
        throw createError('INVALID_PAGE_RANGE', `Invalid range startpoint: ${t}`, { token: t, maxPage });
      }
      return Array.from({ length: maxPage - start + 1 }, (_, i) => start + i);
    }

    const start = parseStrictNumber(startStr, maxPage);
    const end = parseStrictNumber(endStr, maxPage);
    if (start === null || end === null || start > end) {
      throw createError('INVALID_PAGE_RANGE', `Invalid page range token: ${t}`, { token: t, maxPage });
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  const page = parseStrictNumber(t, maxPage);
  if (page === null) {
    throw createError('INVALID_PAGE_RANGE', `Invalid page number token: ${t}`, { token: t, maxPage });
  }
  return [page];
}

export function parsePageRanges(input, maxPage) {
  if (!Number.isInteger(maxPage) || maxPage < 1) {
    throw createError('INVALID_MAX_PAGE', 'maxPage must be >= 1', { maxPage });
  }
  if (typeof input !== 'string') {
    throw createError('INVALID_PAGE_RANGE', 'Page range expression must be a string', { input });
  }

  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw createError('INVALID_PAGE_RANGE', 'Page range expression is required', { input });
  }

  const rawTokens = input.split(',');
  const values = [];

  for (const rawToken of rawTokens) {
    if (!rawToken.trim()) {
      throw createError('INVALID_PAGE_RANGE', 'Empty comma-separated tokens are not allowed', { input });
    }
    const tokenPages = parseToken(rawToken, maxPage);
    values.push(...tokenPages);
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

export function normalizePageSelection(selection, maxPage) {
  if (!Number.isInteger(maxPage) || maxPage < 1) {
    throw createError('INVALID_MAX_PAGE', 'maxPage must be >= 1', { maxPage });
  }

  if (Array.isArray(selection)) {
    if (selection.length === 0) {
      throw createError('INVALID_PAGE_SELECTION', 'Page selection array must not be empty', { selection });
    }
    const numbers = [];
    for (const item of selection) {
      let page;
      if (typeof item === 'number') {
        if (!Number.isInteger(item) || !Number.isSafeInteger(item)) {
          throw createError('INVALID_PAGE_SELECTION', `Invalid page number in array: ${item}`, { item, selection });
        }
        page = item;
      } else if (typeof item === 'string') {
        if (!STRICT_POSITIVE_INT_REGEX.test(item.trim())) {
          throw createError('INVALID_PAGE_SELECTION', `Invalid page string in array: ${item}`, { item, selection });
        }
        page = Number(item.trim());
        if (!Number.isSafeInteger(page)) {
          throw createError('INVALID_PAGE_SELECTION', `Unsafe integer page in array: ${item}`, { item, selection });
        }
      } else {
        throw createError('INVALID_PAGE_SELECTION', `Invalid element type in array: ${typeof item}`, { item, selection });
      }
      if (page < 1 || page > maxPage) {
        throw createError('INVALID_PAGE_SELECTION', `Page out of bounds in array: ${page} (max ${maxPage})`, { page, maxPage, selection });
      }
      numbers.push(page);
    }
    return [...new Set(numbers)].sort((a, b) => a - b);
  }

  return parsePageRanges(selection, maxPage);
}

export function validatePageSelection(input, maxPage) {
  try {
    const pages = normalizePageSelection(input, maxPage);
    return { valid: true, pages, pageSet: new Set(pages) };
  } catch (error) {
    return { valid: false, error: error.message, code: error.code };
  }
}
