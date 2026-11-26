# Server guide

The server is a clean-room implementation of the **Blockheads 1.7.1 dedicated server**: same wire protocol (ENET over
UDP), same save files, same console commands. Any 1.7.4–1.7.6 client can join it, patched or not — the client patches in
this repo are about Android compatibility and the store, not about the protocol.

## Quick start (Docker)

```bash
cd server
docker compose up -d
docker compose logs -f
```

Defaults:

| Setting | Default | Change with |
|---|---|---|
| World name | `PRESERVED` | `BH_WORLD=My World docker compose up -d` |
| UDP port | `15151` | `BH_PORT=16000` (also edit the port mapping) |
| Privacy | `public` | `BH_PRIVACY=private` or `searchable` |
| Max players | engine default | `BH_MAX_PLAYERS=16` |
| Owner name | unset | `BH_OWNER=Steve` |
| Data | `server/data/` | edit the volume in `compose.yaml` |

The entrypoint creates the world on first start and loads it afterwards (`-n` / `-o`). Because the server stores each
world in a directory named by its random id, the entrypoint resolves the display name with `--list` before loading. The
container stops cleanly on `docker compose down`; the world is written to `data/saves/<world-id>/`.

### Without Docker

Grab a release from [Blockheads Server](https://github.com/Blockheads-Club/blockheads-server/releases) and run:

```bash
BLOCKHEADS_DATA_DIR=$PWD/data ./blockheads_server --new "PRESERVED" --port 15151
# later: --load takes the world *id*, not the display name
BLOCKHEADS_DATA_DIR=$PWD/data ./blockheads_server --list
#   "PRESERVED" stored in directory named 4c725514a6320d8f54dd461dc1556f4b
BLOCKHEADS_DATA_DIR=$PWD/data ./blockheads_server --load 4c725514a6320d8f54dd461dc1556f4b --port 15151
```

`--help` lists the original options (`-m` max players, `-P` privacy, `-u` owner, `-s` save delay, `-w` world width,
`-e` expert mode, `-c` credit…). There is also a desktop/Android GUI app upstream if you prefer clicking.

## Connecting from the game

1. **Join World**
2. **Advanced…**
3. **Online IP/Port**
4. Address: LAN IP (`192.168.x.x`), a DNS name, or a public IP. Port: `15151`.

The world appears in the list once the handshake finishes. If it does not, check UDP (not TCP) reachability — a TCP
port check will always look closed.

> The official **cloud world list is gone** (servers switched off in 2022), so there is nothing to browse. Direct IP is
> the supported path, and it is what the game's own "Online IP/Port" dialog does.

## Hosting over the internet

1. Give the host a stable address (DNS name is nicer than a residential IP).
2. Forward **UDP 15151** to the host, or put it behind a UDP-capable load balancer.
3. Allow the port in the host firewall:
   ```bash
   sudo ufw allow 15151/udp
   ```
4. Test from outside with a phone on mobile data.

There is no HTTP component and no TLS: the protocol is a UDP game protocol. Do **not** expose the management/console
port of anything else; the server has no remote admin socket. Admin actions happen in-game or in the container console
(`docker attach blockheads`, detach with `Ctrl-P Ctrl-Q`).

## Passwords, privacy, admins

In-game chat commands (also usable in the container console):

```
/SET-PASSWORD secret        require a password to join
/REMOVE-PASSWORD
/SET-PRIVACY public|searchable|private
/ADMIN <player>             grant admin
/MOD <player>               grant mod
/BAN <player>               ban
/WHITELIST <player>         only listed players may join
/LIST-ADMINS  /LIST-MODS  /LIST-BLACKLIST  /LIST-WHITELIST
/PVP-ON  /PVP-OFF
/REPAIR
/HELP
```

`public`/`searchable` only affect the (dead) cloud directory; they do not expose your IP. `private` still allows direct
connections.

## Backups

Everything is under the data directory:

```
data/saves/<world-id>/worldv2        world state
data/saves/<world-id>/world_db/      block database (LMDB)
data/saves/<world-id>/server_db/     server-side state (LMDB)
data/saves/<world-id>/lightBlocks/   lighting cache (LMDB)
```

Stop the container (or use `-s` to force a save) and copy the world folder:

```bash
docker compose stop
tar czf backup-$(date +%F).tar.gz -C server/data saves
docker compose start
```

## Join links (experimental)

The client registers `blockheads://` and `http://theblockheads.net/join.php?...` (the latter after the
`fix-join-links` patch). The native parser expects the query used by the official share links:

```
blockheads://join.php?ip=192.168.1.20&port=15151&name=PRESERVED
http://theblockheads.net/join.php?ip=192.168.1.20&port=15151&name=PRESERVED
```

Generate one with:

```bash
node scripts/join-link.mjs 192.168.1.20 15151 PRESERVED
```

or open `server/join.html` in a browser. **Direct entry in Online IP/Port remains the reliable route**: intent
delivery has not been device-tested for every Android version.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Could not connect" on Android 9 | Usually the welcome-dialog deadlock; the default patch set includes `fix-welcome-popup-deadlock`. |
| Works on LAN, not over internet | UDP 15151 not forwarded, or CGNAT (ask your ISP for a public IP / use a VPS). |
| Server starts then exits | Another process owns UDP 15151, or `--load` was given a display name instead of the world id (`--list` shows it). Check `docker compose logs`. |
| World resets | The data volume is not persisted, or `BH_WORLD` changed (a new world is created under the new name). |
| Phone is 64-bit-only | The client is armeabi-v7a; it cannot run there. Use a 32-bit-capable device or an emulator with ARM translation. |

## Credit

Protocol work, save compatibility and the server implementation are by
[Blockheads Server](https://github.com/Blockheads-Club/blockheads-server) (GPL-3.0-or-later). This repository pins and
packages it; the Docker build fetches the tagged source at build time.
