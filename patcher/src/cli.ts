// Headless driver for @bh-patcher/core: builds a preserved, re-signed Blockheads APK.
//
// Usage:
//   npm run build:pack
//   npm run patch -- /path/to/blockheads-1.7.6.apk -o blockheads-1.7.6-preserved.apk
//   npm run verify -- /path/to/blockheads-1.7.6.apk
//
// The APK is never redistributed by this repository: you supply your own copy.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  exportIdentityJson,
  generateIdentity,
  importIdentity,
  listPatches,
  loadApk,
  loadPack,
  patchApk,
  registryWithPacks,
  sha256HexSync,
  type Keystore,
  type Pack,
  type SigningIdentity,
} from '@bh-patcher/core';

const PACK_PATH = resolve(new URL('../../pack/dist/blockheads-preserved-1.0.0.bhpack', import.meta.url).pathname);
const DEFAULT_KEYSTORE = join(homedir(), '.config', 'blockheads-preserved', 'signing.json');

/** Safe, behaviour-preserving fixes from upstream. Our own changes come from the pack. */
const DEFAULT_UPSTREAM_PATCHES = [
  'fix-welcome-popup-deadlock',
  'fix-system-font-crash',
  'fix-config-change-crash',
  'fix-webview-crash',
  'fix-surface-destroy-freeze',
  'fix-surface-wait-deadlock',
  'fix-text-activity-freeze',
  'fix-background-wakeup',
  'fix-audio-focus-stall',
  'keep-data-on-uninstall',
  'fix-join-links',
  'raise-target-sdk',
];

class FileKeystore implements Keystore {
  constructor(private readonly path: string) {}
  async get(): Promise<SigningIdentity | null> {
    if (!existsSync(this.path)) return null;
    try {
      return await importIdentity(readFileSync(this.path, 'utf8'));
    } catch (e) {
      throw new Error(`cannot read signing key ${this.path}: ${(e as Error).message}`);
    }
  }
  async set(id: SigningIdentity): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, await exportIdentityJson(id), { mode: 0o600 });
  }
  async clear(): Promise<void> {
    rmSync(this.path, { force: true });
  }
}

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function loadOurPack(): Pack {
  if (!existsSync(PACK_PATH)) fail(`pack not built: ${PACK_PATH} is missing. Run: npm run build:pack`);
  const r = loadPack(new Uint8Array(readFileSync(PACK_PATH)));
  if (!r.ok) {
    for (const e of r.errors) console.error(`  [${e.code}] ${e.message}`);
    fail('the pack did not validate');
  }
  return r.pack;
}

interface Args {
  command: string;
  apk?: string;
  out?: string;
  keystore?: string;
  patches: string[];
  defaults: boolean;
  list: boolean;
  pack?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { command: argv[0] ?? 'help', patches: [], defaults: true, list: false };
  for (let i = 1; i < argv.length; i++) {
    const v = argv[i]!;
    if (v === '-o' || v === '--out') a.out = argv[++i];
    else if (v === '--keystore') a.keystore = argv[++i];
    else if (v === '--patch') a.patches.push(argv[++i]!);
    else if (v === '--no-defaults') a.defaults = false;
    else if (v === '--list') a.list = true;
    else if (v === '--pack') a.pack = argv[++i];
    else if (v === '-h' || v === '--help') a.command = 'help';
    else if (v.startsWith('-')) fail(`unknown option ${v}`);
    else if (!a.apk) a.apk = v;
    else fail(`unexpected argument ${v}`);
  }
  return a;
}

function registryFor(args: Args) {
  const pack = args.pack
    ? (() => {
        const r = loadPack(new Uint8Array(readFileSync(args.pack!)));
        if (!r.ok) for (const e of r.errors) console.error(`  [${e.code}] ${e.message}`);
        if (!r.ok) process.exit(1);
        return r.pack;
      })()
    : loadOurPack();
  const { registry, conflicts } = registryWithPacks([pack]);
  for (const c of conflicts) console.warn(`warning: ${c.a} and ${c.b} both write ${c.on}`);
  return { registry, pack };
}

function selectedIds(args: Args): string[] {
  const ids = args.defaults ? [...DEFAULT_UPSTREAM_PATCHES] : [];
  const pack = loadOurPack();
  if (args.defaults) for (const p of pack.patches) ids.push(p.id);
  ids.push(...args.patches);
  return [...new Set(ids)];
}

function printTable(rows: Awaited<ReturnType<typeof listPatches>>): void {
  const w = Math.max(...rows.map((r) => r.patch.id.length), 10);
  for (const r of rows) {
    const mark = r.status === 'applied' ? '✓' : r.status === 'notApplied' ? '·' : '!';
    console.log(`${mark} ${r.patch.id.padEnd(w)}  ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    console.log(`Blockheads Preserved — offline-friendly APK patcher

  patch <apk> [-o out.apk] [--keystore file] [--patch id]... [--no-defaults]
  verify <apk> [--list] [--pack file]
  build-pack

Patches applied by default: upstream Android compatibility fixes plus the
"Blockheads Preserved" pack (unlimited crystals, double time, no ads, no store).

You must own the APK. Nothing here downloads or ships the game.
`);
    return;
  }

  if (args.command === 'build-pack') {
    await import('../../scripts/build-pack.ts');
    return;
  }

  if (args.command !== 'patch' && args.command !== 'verify') fail(`unknown command ${args.command}`);
  if (!args.apk) fail('missing APK path');
  const apkPath = resolve(args.apk);
  if (!existsSync(apkPath)) fail(`no such file: ${apkPath}`);

  const { registry } = registryFor(args);
  const bytes = new Uint8Array(readFileSync(apkPath));
  const apk = await loadApk(bytes);

  if (args.command === 'verify') {
    const rows = listPatches(apk, registry);
    printTable(rows);
    const missing = args.patches.filter((id) => !rows.some((r) => r.patch.id === id));
    if (missing.length) fail(`unknown patch id(s): ${missing.join(', ')}`);
    return;
  }

  const ids = selectedIds(args);
  const known = new Set(registry.list().map((p) => p.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) fail(`unknown patch id(s): ${unknown.join(', ')}`);

  const keystorePath = args.keystore ?? process.env.BH_KEYSTORE ?? DEFAULT_KEYSTORE;
  const keystore = new FileKeystore(keystorePath);
  if (!(await keystore.get()) && !existsSync(keystorePath)) {
    console.log(`creating signing key: ${keystorePath}`);
    await keystore.set(await generateIdentity({ commonName: 'Blockheads Preserved' }));
  }

  const started = Date.now();
  const result = await patchApk(bytes, {
    patchIds: ids,
    registry,
    keystore,
    onProgress: (stage, f) => {
      if (process.stdout.isTTY) process.stdout.write(`\r${stage.padEnd(6)} ${Math.round(f * 100)}%   `);
    },
  });
  if (process.stdout.isTTY) process.stdout.write('\n');

  const out = resolve(args.out ?? result.suggestedFileName.replace('blockheads-', 'blockheads-1.7.6-preserved-'));
  writeFileSync(out, result.bytes);

  console.log(`applied ${result.applied.length} patch(es) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const id of result.applied) console.log(`  + ${id}`);
  for (const s of result.skipped) if (s.status !== 'applied') console.log(`  = ${s.id} (${s.status})`);
  console.log(`signer SHA-256: ${result.certSha256}`);
  console.log(`output: ${out}`);
  console.log(`sha256: ${sha256HexSync(result.bytes)}  (${result.bytes.length} bytes)`);
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
