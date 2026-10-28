import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from 'canvas';

export async function generateOfficeScanPdf(outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  console.log('Generating 120-page office scan PDF (~35-50MB)...');
  const doc = await PDFDocument.create();

  // Create 10 distinct textures simulating scanned office documents with photo patches
  const textures = [];
  for (let t = 0; t < 10; t++) {
    const c = createCanvas(1400, 1900);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f3ef';
    ctx.fillRect(0, 0, 1400, 1900);
    // Simulated color photo patch (e.g. scanned badge / photo attachment)
    for (let y = 100; y < 800; y += 10) {
      for (let x = 100; x < 1300; x += 10) {
        ctx.fillStyle = `rgb(${(x * 3 + y * 7 + t * 25) % 256}, ${(x * 5 + y * 11 + t * 15) % 256}, ${(x ^ y ^ t) % 256})`;
        ctx.fillRect(x, y, 10, 10);
      }
    }
    // Simulated text lines
    ctx.fillStyle = '#222222';
    for (let y = 850; y < 1800; y += 28) {
      ctx.fillRect(100, y, 1200 * (0.6 + 0.4 * Math.sin(y + t)), 12);
    }
    textures.push(c.toBuffer('image/jpeg', { quality: 0.78 }));
  }

  // 120 pages, each embedding a distinct image stream
  for (let i = 0; i < 120; i++) {
    const baseBuf = textures[i % textures.length];
    const uniqueBuf = Buffer.concat([baseBuf, Buffer.from(`\n% Page ${i}\n`)]);
    const img = await doc.embedJpg(uniqueBuf);
    const p = doc.addPage([612, 792]);
    p.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  }

  const bytes = await doc.save();
  await writeFile(outputPath, bytes);
  console.log(`Saved office scan PDF: ${outputPath} (${bytes.byteLength} bytes, ${(bytes.byteLength / (1024 * 1024)).toFixed(2)} MB, 120 pages)`);
  return bytes;
}

export async function generateHiResPdf(outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  console.log('Generating 15MB PDF with 3 high-resolution embedded images (6000x4000)...');
  const doc = await PDFDocument.create();

  for (let i = 0; i < 3; i++) {
    const c = createCanvas(6000, 4000);
    const ctx = c.getContext('2d');
    for (let y = 0; y < 4000; y += 20) {
      for (let x = 0; x < 6000; x += 20) {
        ctx.fillStyle = `rgb(${(x * 7 + y * 13 + i * 50) % 256}, ${(x * 3 + y * 17 + i * 30) % 256}, ${(x * 11 + y * 5 + i * 70) % 256})`;
        ctx.fillRect(x, y, 20, 20);
      }
    }
    // High-frequency detail overlay
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 160px sans-serif';
    ctx.fillText(`High-Resolution Embedded Image ${i + 1} (6000x4000)`, 300, 500);

    const buf = c.toBuffer('image/jpeg', { quality: 0.93 });
    const img = await doc.embedJpg(buf);
    const p = doc.addPage([6000, 4000]);
    p.drawImage(img, { x: 0, y: 0, width: 6000, height: 4000 });
  }

  const bytes = await doc.save();
  await writeFile(outputPath, bytes);
  console.log(`Saved hi-res PDF: ${outputPath} (${bytes.byteLength} bytes, ${(bytes.byteLength / (1024 * 1024)).toFixed(2)} MB, 3 pages)`);
  return bytes;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const scanOut = resolve('tests/fixtures/stress-office-scan.pdf');
  const hiResOut = resolve('tests/fixtures/stress-hi-res.pdf');
  await generateOfficeScanPdf(scanOut);
  await generateHiResPdf(hiResOut);
}
