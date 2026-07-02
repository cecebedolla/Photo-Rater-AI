import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const file of ['src/app.js', 'src/aiScoring.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('index.html', 'dist/index.html');
cpSync('src', 'dist/src', { recursive: true });

console.log('Static application built into dist/.');
