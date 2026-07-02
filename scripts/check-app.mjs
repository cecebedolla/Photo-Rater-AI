import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const file of ['src/app.js', 'src/aiScoring.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

const html = readFileSync('index.html', 'utf8');
for (const expected of ['photoInput', 'scoreButton', 'gallery', 'detailPanel', './src/app.js', './src/styles.css']) {
  if (!html.includes(expected)) throw new Error(`Missing required app shell reference: ${expected}`);
}

if (!existsSync('.github/workflows/pages.yml')) {
  throw new Error('Missing GitHub Pages deployment workflow.');
}

console.log('Static application sanity check passed.');
