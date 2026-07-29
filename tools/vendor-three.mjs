import { copyFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const vendor = resolve(root, 'vendor');
await mkdir(vendor, { recursive: true });
for (const file of ['three.module.min.js', 'three.core.min.js']) {
  const source = resolve(root, 'node_modules', 'three', 'build', file);
  const target = resolve(vendor, file);
  await copyFile(source, target);
  const info = await stat(target);
  console.log(`[OK] ${file} — ${Math.round(info.size / 1024)} Ko`);
}
