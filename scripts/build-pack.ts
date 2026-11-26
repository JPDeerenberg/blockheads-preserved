// Builds pack/dist/blockheads-preserved-<version>.bhpack and validates it with the Patcher core.
// Usage: npm run build:pack
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { buildPackArchive, loadPack } from '@bh-patcher/core';

const dir = new URL('../pack', import.meta.url).pathname;
const files: Record<string, Uint8Array> = {};
const walk = (d: string): void => {
  for (const name of readdirSync(d).sort()) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(dir, p).split(sep).join('/')] = new Uint8Array(readFileSync(p));
  }
};
walk(dir);

const bytes = buildPackArchive(files);
const r = loadPack(bytes);
if (!r.ok) {
  console.error('pack would be refused:');
  for (const e of r.errors) console.error(`  [${e.code}] ${e.message}`);
  process.exit(1);
}
const out = join(dir, 'dist', `${r.pack.id}-${r.pack.version}.bhpack`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`${out}: ${r.pack.patches.length} patch(es), ${bytes.length} bytes, sha256 ${r.pack.sha256}`);
for (const p of r.pack.patches) console.log(`  ${p.id}`);
