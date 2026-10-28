import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// Store uploads need manifest.json at the top level of the zip, so zip from inside each folder.
const packages = [
  ['dist/extension', 'dist/offline-pdf-studio-chrome-edge.zip'],
  ['dist/firefox', 'dist/offline-pdf-studio-firefox.zip']
];

for (const [dir, zip] of packages) {
  await rm(zip, { force: true });
  try {
    execFileSync('zip', ['-qr', resolve(zip), '.', '-x', '*.DS_Store'], { cwd: dir });
  } catch (error) {
    console.error(`Could not run the "zip" command (${error.message}). Install zip, or archive ${dir} manually.`);
    process.exit(1);
  }
  console.log(`Wrote ${zip}`);
}
