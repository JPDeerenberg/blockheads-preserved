#!/usr/bin/env node
// Prints join links for a Blockheads server.
//   node scripts/join-link.mjs <host> [port] [world]
import { argv } from 'node:process';

const [host, port = '15151', name = 'PRESERVED'] = argv.slice(2);
if (!host) {
  console.error('usage: node scripts/join-link.mjs <host> [port] [world]');
  process.exit(2);
}
const q = new URLSearchParams({ ip: host, port, name }).toString();
console.log(`blockheads://join.php?${q}`);
console.log(`http://theblockheads.net/join.php?${q}`);
