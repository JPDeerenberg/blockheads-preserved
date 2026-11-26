# Reverse-engineering notes

Static analysis of `com.noodlecake.blockheads` **1.7.6** (versionCode 1564553369, armeabi-v7a, target SDK 27), performed
with REA: APK/ELF inventory, Objective-C metadata recovery, targeted ARM disassembly, and byte-verified patching. The
APK was never executed during analysis.

## 1. What the binary is

| Property | Value |
|---|---|
| Package | `com.noodlecake.blockheads` |
| Version | 1.7.6 (1564553369) |
| SDK | min 12, target 27 (`platformBuildVersionCode=27`) |
| ABI | `armeabi-v7a` only |
| Engine | **Apportable** (Objective-C compiled to Android/ARM), not Unity |
| Game logic | `lib/armeabi-v7a/libApplication.so`, 17,174,960 bytes, 50 sections |
| Java layer | Apportable/Verde bridge, NoodleKit, Play Billing v3 (`com.apportable.iap`), ads SDKs |

`readelf -S` shows the classic Apple/ObjC layout that survives the Apportable port: `__objc_classlist`,
`__objc_methname` (648 KB of selectors), `__objc_classname`, `__objc_methtype`, `__objc_const`, `__objc_ivar`, and
`__DATA,__cfstring`. Gameplay, UI and networking are all Objective-C objects, so method names and class names are
available even though the source is gone.

The manifest declares `apportable.iabv3=true`, an `ApportableIAP` lifecycle listener, `BillingService`/`BillingReceiver`
and `com.android.vending.BILLING`, i.e. StoreKit calls from the Objective-C code are shimmed onto Google Play Billing.

## 2. Recovering the class graph

A naive `__objc_classlist` walk fails: the file stores **unrelocated** pointers there (first entry reads `0xffffffff`)
because the dynamic linker applies `R_ARM_RELATIVE` relocations at load time. Two ways around it:

- apply the `.rel.dyn` relocations to a copy of the image, or
- start from the exported `OBJC_CLASS_$_<Name>` symbols in `.dynsym`, whose 20-byte class objects already point at
  `class_ro_t` in `__objc_const`.

The second route is simpler and was used by `work/objcdump.py` (pyelftools + direct struct reads). Result: **515
classes, 10,126 instance methods**, no execution required. The classes that matter:

| Class | Role |
|---|---|
| `CloudInterface` | 2022-era cloud service: auth, world create/search/connect/top-up |
| `BHServer` / `BHClient` / `BHNetNode` | in-process multiplayer host/client |
| `BHMatch` / `BHNetServerMatch` / `BHNetClientMatch` | ENET-style match/session layer, ports, passwords |
| `ServerClient` | per-connection state, block requests, heartbeats |
| `CrystalManager` | time-crystal balance (saved as `crystalCount`) |
| `World` | world state, double-time flag, store and credit entry points |
| `MainMenuUI`, `TCUI`, `AddCreditUI`, `CraftUI` | store / crystal / ad surfaces |
| `PortalChestManager`, `TradePortal*` | in-game trade and portal-chest sync |

## 3. Multiplayer: where it actually lives

Strings and methods show a hybrid design:

- **Cloud** (`cloud.theblockheads.net`, `portal.theblockheads.net`) only authenticated the player, listed worlds, and
  brokered a connection. `CloudInterface` builds a JSON POST (`application/json`, `Content-Length`) containing the
  iCloud/device identity, crystal amount and booleans, then talks to `…/api/challenge`.
- **The world itself runs on a device.** `BHNetServerMatch initWithPort:…worldName:credit:cloudSalt:ownerName:privacy:`
  starts a listener; `BHNetClientMatch initWithSearchDelegate:host:port:userName:…` connects to a host/port directly.
  The protocol is ENET over **UDP**, default port **15151**.
- The embedded server console (`/SET-PASSWORD`, `/SET-PRIVACY public|searchable|private`, `/BAN`, `/MOD`, `/ADMIN`,
  `/WHITELIST`, `/REPAIR`, `/PVP-ON`, …) is compiled into the client.

Therefore the shutdown of the cloud directory in 2022 did **not** remove the ability to host or join: it removed the
phone book. The client still has **Join World → Advanced… → Online IP/Port**. Pointing it at a self-hosted server is
enough, which is what `server/` packages.

## 4. Store, crystals, double time, ads

All commerce is in the native binary and funnels through a handful of tiny methods, which makes them safe to rewrite
(the ABI is AAPCS: `int`/`BOOL` return in `r0`).

| Selector | vaddr | Original (hex) | Patched (hex) | Effect |
|---|---|---|---|---|
| `-[CrystalManager amount]` | `0x9f452c` | `08d04de22c209fe502208fe0` | `40020fe300004fe31eff2fe1` | `mov r0,#0xF4240; mvn r0,#0; bx lr` → 1,000,000 |
| `-[World doubleTimeUnlocked]` | `0x5d9e8c` | `08d04de22c209fe502208fe0` | `0100a0e31eff2fe10000a0e1` | `mov r0,#1; bx lr; nop` |
| `-[MainMenuUI canDisplayAd]` | `0xa0fc64` | `00482de910d04de2f0209fe5` | `0000a0e31eff2fe10000a0e1` | return `NO` |
| `-[CloudInterface canDisplayAd]` | `0x87d42c` | `00482de910d04de2bc209fe5` | `0000a0e31eff2fe10000a0e1` | return `NO` |
| `-[MainMenuUI timeCrystalButton:]` | `0xa0e080` | `104c2de908b08de210d04de2` | `1eff2fe10000a0e10000a0e1` | return |
| `-[MainMenuUI showTimeCrystalPurcahseUI:]` | `0xa0e2c4` | `704c2de910b08de238d04de2` | `1eff2fe10000a0e10000a0e1` | return |
| `-[World timeCrystalButtonTapped]` | `0x5b5b54` | `f04d2de918b08de211de4de2` | `1eff2fe10000a0e10000a0e1` | return |
| `-[TCUI buyButton:]` | `0xb60380` | `f04d2de918b08de2f6df4de2` | `1eff2fe10000a0e10000a0e1` | return |
| `-[World purchaseDoubleTime]` | `0x5c4228` | `f04d2de918b08de278d04de2` | `1eff2fe10000a0e10000a0e1` | return |

Notes:

- File offset equals vaddr for `.text` in this binary, so the pack's `objcMethod` locator resolves the symbol table entry
  and writes at the method address.
- `amount` is the getter used by the HUD and by purchase checks; the ivar and `modify:` are untouched, so spending still
  works and saves stay consistent.
- `doubleTimeUnlocked` is only a flag read; returning `YES` avoids the purchase path entirely.
- The store patches remove the UI entry points rather than deleting billing code, because the Java billing service is
  started by an Apportable lifecycle listener. Removing code would risk a startup crash; making every entry a no-op
  cannot.
- Ads: the SDKs remain (removing them would change JNI surface), but both gates that decide whether an ad may be offered
  return `NO`, so no ad is requested.

## 5. Patching mechanics and verification

The `pack/` directory is a declarative `.bhpack`: each `native.patch` op carries `libSha256`, an `objcMethod` locator, a
12-byte `expect`, and a 12-byte `replace`. `@bh-patcher/core` (GPL-3.0) applies them and re-signs the APK (v1+v2).

Verified on the real APK:

- all 16 patches applied; every `expect` matched (a mismatch aborts the whole patch);
- `uses-sdk` re-parsed from the patched AXML: `minSdkVersion=12 targetSdkVersion=28`, `usesCleartextTraffic=true`;
- the patched APK passes `apksigner`-equivalent verification (uber-apk-signer: v1 + v2 OK, zipalign OK);
- each rewritten method was read back at its address and matched the intended instruction sequence.

Caveat: `apktool d` **omits** `<uses-sdk>` when decoding this manifest; do not use its XML output to check target SDK.
Parse the AXML with the patcher core (or androguard) instead.

## 6. Limits

- **No arm64 port.** The game is a 32-bit Apportable binary; there is no source, and translating 17 MB of ObjC/ARM to
  AArch64 would be a rewrite. 64-bit-only Android devices cannot run it at all.
- **No cloud revival.** `cloud.theblockheads.net` required server-side secrets and a live service. This project restores
  the part that is peer-hosted, not the part that was centralised.
- **No APK distribution.** Users patch their own copy; this is both a legal and a practical choice.
