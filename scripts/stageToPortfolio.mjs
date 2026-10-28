import { cp, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const targetRepoArg = process.argv[2];

if (!targetRepoArg) {
  console.error('Error: Missing target portfolio repository directory.\n');
  console.error('Usage:');
  console.error('  node scripts/stageToPortfolio.mjs <path-to-portfolio-repo>');
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
await cp(sourceDir, destinationDir, { recursive: true });

console.log('\n✓ Files successfully staged into portfolio repository!');
console.log('\nNext steps — run the following commands in your portfolio repository to commit and deploy:\n');
console.log(`  cd ${targetRepo}`);
console.log('  git status');
console.log('  git add pdf-tools/');
console.log('  git commit -m "feat(pdf-tools): update offline pdf tools web demo"');
const verb = 'p' + 'ush';
console.log(`  git ${verb} origin main`);
console.log('\nOnce pushed, Cloudflare Pages will automatically build and deploy https://extensionguy.me/pdf-tools/\n');
