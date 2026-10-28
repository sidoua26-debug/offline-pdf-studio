import { PDFDocument } from 'pdf-lib';
import { createError } from './errors.mjs';

/** Loads a PDF with pdf-lib, mapping failures to stable error codes. */
export async function loadPdf(buffer, options = {}) {
  try {
    return await PDFDocument.load(buffer, options);
  } catch (error) {
    if (/encrypted/i.test(error?.message ?? '')) {
      throw createError('ENCRYPTED_PDF', 'Encrypted PDFs are not supported. Remove the password first.');
    }
    throw createError('INVALID_PDF', 'The file could not be read as a PDF', { cause: error?.message });
  }
}
