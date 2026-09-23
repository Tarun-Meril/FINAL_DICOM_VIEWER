/** Produce a distributable source archive (no node_modules, no build output). */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const name = process.argv[2] ?? '/mnt/user-data/outputs/medview-vr-source.zip';
fs.mkdirSync(path.dirname(name), { recursive: true });
if (fs.existsSync(name)) fs.unlinkSync(name);

// validation-output is included: the validation report links to its screenshots.
const exclude = ['node_modules/*', 'dist/*', 'public/wasm/*', '.git/*', 'test-results/*', 'playwright-report/*'];
const args = exclude.map((e) => `-x '${e}'`).join(' ');
execSync(`cd ${root} && zip -qr ${name} . ${args}`, { stdio: 'inherit' });
console.log(`wrote ${name} (${(fs.statSync(name).size / 1024 / 1024).toFixed(1)} MB)`);
