import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { existsSync } from 'node:fs';

const targetRepoArg = process.argv[2];
const overwritePresentation = process.argv.includes('--overwrite-presentation');

if (!targetRepoArg) {
  console.error('Error: Missing target portfolio repository directory.\n');
  console.error('Usage:');
  console.error('  node scripts/stageToPortfolio.mjs <path-to-portfolio-repo> [--overwrite-presentation]');
  console.error('Example:');
  console.error('  node scripts/stageToPortfolio.mjs ~/extensionguy.me\n');
  process.exit(1);
}

const sourceDir = resolve('dist/web');
const targetRepo = resolve(targetRepoArg);
const destinationDir = join(targetRepo, 'pdf-tools');

if (!existsSync(sourceDir)) {
  console.error(`Error: Source directory "${sourceDir}" does not exist. Run "npm run build" first.`);
  process.exit(1);
}

if (!existsSync(targetRepo)) {
  console.error(`Error: Target directory "${targetRepo}" does not exist. Please check the path.`);
  process.exit(1);
}

console.log(`Staging web build into portfolio repository...`);
console.log(`Source:      ${sourceDir}`);
console.log(`Destination: ${destinationDir}`);

await mkdir(destinationDir, { recursive: true });

// Presentation files that are customized in the portfolio redesign
const PRESENTATION_FILES = new Set(['index.html', 'styles.css', 'preview.js']);

const entries = await readdir(sourceDir);
const staged = [];
const preserved = [];

for (const entry of entries) {
  const destPath = join(destinationDir, entry);
  const srcPath = join(sourceDir, entry);

  if (PRESENTATION_FILES.has(entry) && existsSync(destPath) && !overwritePresentation) {
    preserved.push(entry);
    continue;
  }

  await cp(srcPath, destPath, { recursive: true });
  staged.push(entry);
}

console.log(`\n✓ Staged generated runtime files: ${staged.join(', ')}`);
if (preserved.length > 0) {
  console.log(`✓ Preserved existing portfolio presentation files: ${preserved.join(', ')} (pass --overwrite-presentation to replace)`);
}

console.log('\n✓ Files successfully staged into portfolio repository!');
console.log('\nNext steps — run the following commands in your portfolio repository to commit and deploy:\n');
console.log(`  cd ${targetRepo}`);
console.log('  git status');
console.log('  git add pdf-tools/');
console.log('  git commit -m "feat(pdf-tools): update offline pdf tools web demo"');
const verb = 'p' + 'ush';
console.log(`  git ${verb} origin main`);
console.log('\nOnce pushed, Cloudflare Pages will automatically build and deploy https://extensionguy.me/pdf-tools/\n');
