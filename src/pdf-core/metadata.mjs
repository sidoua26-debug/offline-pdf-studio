import { PDFDocument } from 'pdf-lib';
import { loadPdf } from './load.mjs';
import { enforceLimits } from './limits.mjs';

export const METADATA_FEATURE_MATRIX = Object.freeze({
  supported: [
    'Info dictionary fields: title, author, subject, keywords, creator, producer, creationDate, modificationDate',
    'Basic metadata inspection via pdf-lib getters',
    'Metadata sanitization by clearing known Info dictionary fields'
  ],
  unsupported: [
    'Complete object-graph scrubbing beyond Info dictionary entries',
    'Embedded files and custom XMP stream rewriting',
    'Incremental update chain forensic cleanup'
  ]
});

export async function inspectMetadata(pdfBuffer) {
  enforceLimits({ inputBytes: pdfBuffer.byteLength });
  const pdf = await loadPdf(pdfBuffer, { updateMetadata: false });
  const metadata = {
    title: pdf.getTitle() ?? null,
    author: pdf.getAuthor() ?? null,
    subject: pdf.getSubject() ?? null,
    keywords: pdf.getKeywords() ?? null,
    creator: pdf.getCreator() ?? null,
    producer: pdf.getProducer() ?? null,
    creationDate: pdf.getCreationDate()?.toISOString() ?? null,
    modificationDate: pdf.getModificationDate()?.toISOString() ?? null,
    pageCount: pdf.getPageCount()
  };

  return {
    metadata,
    featureMatrix: METADATA_FEATURE_MATRIX
  };
}

export async function sanitizeMetadata(pdfBuffer) {
  enforceLimits({ inputBytes: pdfBuffer.byteLength });
  const pdf = await loadPdf(pdfBuffer, { updateMetadata: false });

  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setCreator('');
  pdf.setProducer('');
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const bytes = await pdf.save({ updateFieldAppearances: false });
  enforceLimits({ outputBytes: bytes.byteLength });
  return bytes;
}
