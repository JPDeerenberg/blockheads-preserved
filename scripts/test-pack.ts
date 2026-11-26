// Structural checks for the pack, without needing the 96 MB APK.
// Run with: npm run test:pack
import { readFileSync } from 'node:fs';
import { loadPack } from '@bh-patcher/core';

const raw = JSON.parse(readFileSync(new URL('../pack/pack.json', import.meta.url), 'utf8'));
const archive = new Uint8Array(readFileSync(new URL('../pack/dist/blockheads-preserved-1.0.0.bhpack', import.meta.url)));
const r = loadPack(archive);
if (!r.ok) {
  for (const e of r.errors) console.error(`[${e.code}] ${e.message}`);
  process.exit(1);
}

const errors: string[] = [];
const expect = (cond: unknown, msg: string) => { if (!cond) errors.push(msg); };
const LIB_SHA = '733d821027d69de329d0ba171df2e6013d612edf5a4d327badd001acc30b94c7';
const ids = raw.patches.map((p: any) => `pack:${raw.id}/${p.id}`);

expect(r.pack.patches.length === 4, `expected 4 patches, got ${r.pack.patches.length}`);
for (const id of ids) expect(r.pack.patches.some((p) => p.id === id), `archive is missing ${id}`);

for (const p of raw.patches) {
  expect(Array.isArray(p.ops) && p.ops.length > 0, `${p.id}: no ops`);
  for (const op of p.ops) {
    if (op.op !== 'native.patch') continue;
    expect(/^[0-9a-f]+$/.test(op.expect) && op.expect.length % 2 === 0, `${p.id}: expect must be lowercase even hex`);
    expect(op.expect.length === op.replace.length, `${p.id}: expect/replace length differ`);
    expect(op.expect !== op.replace, `${p.id}: expect equals replace`);
    expect(op.libSha256 === LIB_SHA, `${p.id}: unexpected libSha256`);
    expect(typeof op.locate?.objcMethod === 'string' && op.locate.objcMethod.startsWith('-['), `${p.id}: not an instance selector`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`fail: ${e}`);
  process.exit(1);
}
console.log(`pack ok: ${r.pack.patches.length} patches, sha256 ${r.pack.sha256}`);
