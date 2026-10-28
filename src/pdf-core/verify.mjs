import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { inspectMetadata } from './metadata.mjs';
import { createError } from './errors.mjs';
import { loadPdf } from './load.mjs';
import { PDFName, PDFArray } from 'pdf-lib';

const FORBIDDEN_CATALOG_KEYS = ['AcroForm', 'Metadata', 'Names', 'Outlines', 'OpenAction', 'AA', 'StructTreeRoot', 'Dests', 'Threads'];

const toUint8 = (data) => {
  if (data instanceof Uint8Array) {
    return Uint8Array.from(data);
  }
  return new Uint8Array(data.slice(0));
};

export async function extractPageText(pdfBytes, pageNumber) {
  const pages = await extractPagesText(pdfBytes, [pageNumber]);
  return pages[pageNumber] ?? '';
}

export async function extractPagesText(pdfBytes, pageNumbers) {
  const loadingTask = getDocument({ data: toUint8(pdfBytes), isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const out = {};
  for (const pageNumber of pageNumbers) {
    const page = await pdf.getPage(pageNumber);
    try {
      const text = await page.getTextContent();
      out[pageNumber] = text.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim();
    } finally {
      page.cleanup();
    }
  }
  await loadingTask.destroy();
  return out;
}

export async function verifyRedactionOutput({ pdfBytes, redactedPages, expectedSanitizedMetadata = true }) {
  const sortedPages = [...new Set(redactedPages)].sort((a, b) => a - b);
  const pageTexts = await extractPagesText(pdfBytes, sortedPages);
  for (const page of sortedPages) {
    const text = pageTexts[page] ?? '';
    if (text.length > 0) {
      throw createError('REDACTION_VERIFICATION_TEXT', 'Redacted page still has extractable text', { page, textSnippet: text.slice(0, 80) });
    }
  }

  const metadataInfo = await inspectMetadata(pdfBytes, { isOutput: true });
  if (expectedSanitizedMetadata) {
    const values = Object.entries(metadataInfo.metadata).filter(([key]) => key !== 'pageCount').map(([, v]) => v);
    const hasUnexpected = values.some((value) => value && value !== '1970-01-01T00:00:00.000Z');
    if (hasUnexpected) {
      throw createError('REDACTION_VERIFICATION_METADATA', 'Metadata was not fully sanitized', { metadata: metadataInfo.metadata });
    }
  }

  // Structural checks on the output object graph (not regex over bytes).
  const out = await loadPdf(toUint8(pdfBytes), { updateMetadata: false });
  const leaked = FORBIDDEN_CATALOG_KEYS.filter((key) => out.catalog.has(PDFName.of(key)));
  if (leaked.length > 0) {
    throw createError('REDACTION_VERIFICATION_OBJECTS', 'Output catalog contains data that could retain redacted content', { leaked });
  }
  for (const page of sortedPages) {
    const node = out.getPage(page - 1).node;
    const annots = node.lookup(PDFName.of('Annots'));
    const hasAnnots = annots instanceof PDFArray ? annots.size() > 0 : annots !== undefined;
    if (hasAnnots) {
      throw createError('REDACTION_VERIFICATION_OBJECTS', 'Redacted page still carries annotations', { page });
    }
  }

  // Heuristic only: unredacted pages may legitimately keep link annotations.
  const binaryCheck = new TextDecoder('latin1').decode(toUint8(pdfBytes));
  const heuristic = [];
  if (/\/AcroForm\b/.test(binaryCheck)) heuristic.push('AcroForm');

  return {
    verified: true,
    surfacesChecked: ['extractable-text', 'metadata', 'annotations', 'catalog'],
    heuristicChecks: ['raw-byte-search /AcroForm'],
    heuristicHits: heuristic
  };
}
