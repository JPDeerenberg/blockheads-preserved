# Blockheads Preserved

**The Blockheads 1.7.6, still playable in 2026.** A patched client for modern Android with the store and ads gone, and a
self-hosted server so multiplayer keeps working after the official online service was shut down.

<p align="center">
  <a href="https://github.com/JPDeerenberg/blockheads-preserved/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/JPDeerenberg/blockheads-preserved/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="license" src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue">
  <img alt="android" src="https://img.shields.io/badge/Android-9–16%20(32--bit)-3ddc84">
</p>

> **Unofficial.** Not affiliated with Majic Jungle Software or Noodlecake. This repository contains **no game code and no
> APK**: you bring your own copy and patch it locally. "The Blockheads" is a trademark of its owner.

---

## What you get

| | Status |
|---|---|
| **Runs on newer Android** | Installs and launches on Android 9–16 on devices that still execute 32-bit apps. Target SDK raised 27 → 28, plus upstream fixes for the Android 10+ dialog deadlock, system-font crash, config-change crash and surface freezes. |
| **Store removed** | No store screen and no purchase flow is reachable. Time crystals always read **1,000,000**, double time is always unlocked. |
| **Ads removed** | The game never offers or requests a rewarded ad. |
| **Multiplayer back** | Join a self-hosted server over LAN or the internet with **Join World → Advanced… → Online IP/Port**. The server is included here as a Docker image. |
| **Official cloud / accounts** | Still dead. The `cloud.theblockheads.net` / `portal.theblockheads.net` services were switched off in 2022; this project does not pretend to resurrect them. Direct-IP multiplayer does not need them. |
| **64-bit-only phones** | Not supported, and cannot be without a source port: the game is Apportable-compiled Objective-C in a 17 MB **armeabi-v7a** binary. Pixel 7 and later, and some 2024+ flagships, refuse 32-bit code. |

## 1. Build the patched APK

You need **Node.js 22+**, Git and your own `com.noodlecake.blockheads` **1.7.6** APK (the armeabi-v7a build).

```bash
git clone --recursive https://github.com/JPDeerenberg/blockheads-preserved
cd blockheads-preserved
npm install
npm run build:pack
npm run patch -- /path/to/blockheads-1.7.6.apk -o blockheads-1.7.6-preserved.apk
adb install -r blockheads-1.7.6-preserved.apk
```

The first run creates a local signing key at `~/.config/blockheads-preserved/signing.json` (keep it — it is your update
key) and prints the APK's SHA-256. `npm run verify -- <apk>` lists which patches apply to an APK without changing it.

<details>
<summary>What exactly is patched?</summary>

Twelve behaviour-preserving fixes from
[Blockheads Patcher](https://github.com/Blockheads-Club/blockheads-patcher) (target SDK 28, cleartext traffic, welcome
dialog deadlock, font crash, config-change crash, WebView crash, surface/freeze fixes, audio-focus stall, keep data on
uninstall, join links) plus four changes from the bundled `Blockheads Preserved` pack:

| Patch | Native change |
|---|---|
| `unlimited-crystals` | `-[CrystalManager amount]` returns `1,000,000` |
| `double-time-unlocked` | `-[World doubleTimeUnlocked]` returns `YES` |
| `remove-ads` | `-[MainMenuUI canDisplayAd]` and `-[CloudInterface canDisplayAd]` return `NO` |
| `remove-store` | store entry points return immediately; `-[World purchaseDoubleTime]` is a no-op |

Every change is a byte-level ARM rewrite with an exact `expect` guard — the pack refuses to apply to a binary it does
not recognise. See [docs/REVERSE-ENGINEERING.md](docs/REVERSE-ENGINEERING.md) for addresses, bytes and method evidence.

</details>

## 2. Run your own world

```bash
cd server
docker compose up -d
docker compose logs -f
```

That creates a world called `PRESERVED` on **UDP 15151** and stores it in `server/data/`. On the phone:

1. **Join World → Advanced… → Online IP/Port**
2. Enter the machine's IP (or a DNS name) and `15151`
3. Enter the world password if you set one

See [docs/SERVER.md](docs/SERVER.md) for internet hosting, passwords, admins, backups, join links and the
`blockheads://join.php?...` link format.

## Repository layout

```
pack/                 .bhpack source: 4 native patches + expect/replace bytes
patcher/              CLI around @bh-patcher/core (apply pack, sign, verify)
server/               Dockerfile, compose file, entrypoint, join-link page
docs/                 reverse-engineering notes and server guide
scripts/              pack builder, join-link generator
.github/workflows/    CI: pack build+lint, APK patch smoke test, server build+probe
```

## Legal

- Patcher, its patch format and the server are **GPL-3.0-or-later** by the
  [Blockheads Club](https://github.com/Blockheads-Club); this repository is GPL-3.0-or-later too. See `LICENSE` and
  `NOTICE`.
- No APK, game assets, or signing keys are distributed. The patcher modifies a copy the user already owns.
- Removing store/ads from software you own for personal use is your call; distributing a patched APK likely violates
  the game's EULA, which is why this repo ships a patcher instead.

## Credits

- [Blockheads Patcher](https://github.com/Blockheads-Club/blockheads-patcher) — APK/AXML/ELF patching, signing, and most
  of the Android 10+ fixes.
- [Blockheads Server](https://github.com/Blockheads-Club/blockheads-server) — clean-room Rust implementation of the
  1.7.1 server protocol (ENET/UDP), packaged here.
- [blockheads-pc](https://github.com/Blockheads-Club/blockheads-pc) — the ARM JIT project that proved the client binary
  can run unmodified on other platforms.
- Majic Jungle Software — the game itself.
