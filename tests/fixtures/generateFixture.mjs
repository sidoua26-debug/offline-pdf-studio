import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

const outPath = resolve('tests/fixtures/sample.pdf');
await mkdir(dirname(outPath), { recursive: true });

const pdf = await PDFDocument.create();
pdf.setTitle('Fixture PDF');
pdf.setAuthor('Offline PDF Studio Tests');
pdf.setSubject('Deterministic fixture');
pdf.setKeywords(['fixture', 'pdf', 'offline']);
pdf.setCreator('fixture-generator');
pdf.setProducer('fixture-generator');
pdf.setCreationDate(new Date('2024-01-01T00:00:00.000Z'));
pdf.setModificationDate(new Date('2024-01-01T00:00:00.000Z'));

const font = await pdf.embedFont(StandardFonts.Helvetica);

const portrait = pdf.addPage([612, 792]);
portrait.drawText('Fixture Page 1 Portrait', { x: 72, y: 700, size: 18, font, color: rgb(0, 0, 0) });

const landscape = pdf.addPage([792, 612]);
landscape.drawText('Fixture Page 2 Landscape', { x: 72, y: 500, size: 18, font });
landscape.setRotation(degrees(90));

const nonLetter = pdf.addPage([500, 500]);
nonLetter.drawText('Fixture Page 3 Square', { x: 72, y: 420, size: 18, font });

const bytes = await pdf.save();
await writeFile(outPath, bytes);
console.log(`Generated fixture at ${outPath} (${bytes.byteLength} bytes)`);
