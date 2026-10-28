import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const filePatterns = ['src/**/*.mjs', 'pdf-tools/**/*.{html,css,mjs,js}', 'extensions/pdf-studio/**/*.{html,mjs,js,json}', 'scripts/**/*.mjs'];
const forbiddenPatterns = [
  /https?:\/\/(?:unpkg|cdnjs|jsdelivr)/i,
  /<script[^>]+src=['"]https?:\/\//i,
  /<link[^>]+href=['"]https?:\/\//i,
  /\b(fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon)\s*\(/,
  /wrangler\s+deploy/i,
  /\bgit\s+push\b/i
];

let failures = [];
for (const pattern of filePatterns) {
  for await (const file of glob(pattern)) {
    const content = await readFile(file, 'utf8');
    for (const rule of forbiddenPatterns) {
      if (rule.test(content)) {
        failures.push(`${file} matched ${rule}`);
      }
    }
  }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
  if (/wrangler\s+deploy|\bgit\s+push\b/i.test(script)) {
    failures.push(`package.json script '${name}' includes prohibited deployment command`);
  }
}

if (failures.length > 0) {
  console.error('Forbidden network/deployment scan failed:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('Forbidden network/deployment scan passed.');
