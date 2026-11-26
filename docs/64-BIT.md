# Can The Blockheads 1.7.6 be ported to 64-bit?

**No — not from the APK in this repository.** A 64-bit-only Android phone cannot execute this build, and no manifest
flag, SDK bump or native patch changes the CPU instruction set. Making the game run there requires either the original
source or a 64-bit app that *emulates* the 32-bit game. This document records the evidence and the only realistic route.

## What the artifact contains

| Fact | Value |
|---|---|
| Native libraries | 25 shared objects, **all** under `lib/armeabi-v7a/` |
| `arm64-v8a` libraries | **0** |
| `libApplication.so` | ELF **CLASS32**, machine **EM_ARM**, `e_flags=0x5000000` (softfp), 17,174,960 bytes |
| Engine | Apportable cross-compiled Objective-C/C++ (custom runtime, no Unity) |
| Manifest | `minSdkVersion=12`, `targetSdkVersion=28` after patching (27 originally) |
| Last release | 1.7.6 (2019); removed from Play in 2021 for lacking 64-bit support |

`targetSdkVersion` describes which Android APIs the app expects. It says nothing about the CPU architecture. An ARM32
`.so` cannot be loaded into a 64-bit-only process, and an APK with only `armeabi-v7a` libraries cannot be installed on a
device whose kernel/CPU lacks AArch32 EL0.

Modern high-end cores have dropped AArch32 entirely (Cortex-A715 and later, Apple's cores, Qualcomm Oryon). The
[blockheads-pc feasibility plan](https://github.com/Blockheads-Club/blockheads-pc/blob/dev/docs/feasibility/PLAN.md)
states this directly, and its execution-strategy document notes that only older Cortex-A53/A72/A76-class SoCs with
`CONFIG_COMPAT=y` can still run ARM32 natively. The Play Store 64-bit rule was a symptom of this hardware change, not
the cause.

## Why "just add arm64 libraries" is not possible

* **No arm64 build exists.** 1.7.6 is the final Android release; the game was pulled because it never shipped 64-bit.
  There is no arm64 APK split, no x86_64 build, and no newer version.
* **ABIs cannot be mixed.** A 64-bit app cannot load a 32-bit `.so`; the Java bridge, Apportable runtime and all 25
  libraries would have to be rebuilt for arm64 together.
* **No source or toolchain.** The engine is proprietary Apportable output (the company is defunct). Decompiling 17 MB of
  stripped Objective-C/C++, exceptions and NEON into a buildable arm64 project is not a mechanical transformation.
* **Static rewriting is research-level.** Translating ARM32 to ARM64 while preserving ObjC metadata, C++ unwinding,
  softfp calls and hand-written assembly is not a patch; no production tool does it for a binary this size.

## The only technical route: a 64-bit app that emulates the 32-bit game

[Blockheads PC](https://github.com/Blockheads-Club/blockheads-pc) (GPL-3.0-or-later, Rust) already proves the
architecture: it loads the 25 ARM32 libraries from the user's own APK, runs them in **dynarmic** (ARM JIT), and replaces
Android with high-level emulation of bionic, a fake JVM/JNI, GLES-to-host-GL, audio and input. It is 84,593 lines of Rust
and its own plan estimates **about 31 dev-weeks** for the desktop version. It targets Windows, macOS and Linux — not
Android.

A 64-bit Android port of that runtime would be a new, sizeable project:

* cross-compile the Rust workspace and dynarmic's **arm64 backend** with the Android NDK;
* add an Android activity/SDL2 (or NativeActivity) surface with a GLES2 context, touch-to-UIKit mapping and audio;
* import the user's 1.7.6 APK through the Storage Access Framework and extract it into app-private storage;
* handle Android JIT W^X rules (dual-mapped executable memory), thermals and performance;
* package and test an arm64 APK — on real hardware, because an ARM32 guest inside an ARM64 app is exactly the case
  emulators are worst at validating in CI.

This workspace cannot build or test that: it has no Android SDK/NDK, no KVM, no device, and only a few GB of free disk.
Shipping an untested emulator APK would be worse than shipping nothing.

## Practical options today

1. **Use a 32-bit-capable device.** Run `getprop ro.product.cpu.abilist`; if it contains `armeabi-v7a`, the patched APK
   installs. Many mid-range phones and tablets still do, even with a 64-bit CPU.
2. **Remote play.** Run Blockheads PC on a Windows/macOS/Linux machine and stream it to the phone (Sunshine + Moonlight,
   or Steam Link). The game and multiplayer work; the phone is only a 64-bit client. This is not a port, but it is usable
   immediately and keeps worlds and servers intact.
3. **Wait for the successor.** The original author has announced *Blockheads 2*, a from-scratch Rust rewrite with
   self-hosted multiplayer, which will be native 64-bit. The original game is not expected to receive an arm64 build.
4. **Fund/commission the emulator port.** Port Blockheads PC's runtime to Android arm64. It is GPL-3.0, so the work can
   be published; it needs roughly the same order of effort as the desktop port, plus device testing.

## What would change this answer

* Public source code, or an official arm64 build of 1.7.6 — neither exists.
* A general, open-source ARM32-on-ARM64 Android runtime with GLES and JNI passthrough — none exists for this app.

Anything else is a 32-bit build with a 64-bit label, and that helps nobody.
