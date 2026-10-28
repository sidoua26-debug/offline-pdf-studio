export class PdfCoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PdfCoreError';
    this.code = code;
    this.details = details;
  }
}

export const createError = (code, message, details) => new PdfCoreError(code, message, details);
