<p align="center">
  <img src="https://raw.githubusercontent.com/Grunttanamo/Minitiger/minitiger-v12.1/docs/assets/minitiger-banner.gif" alt="Minitiger Web Banner" width="100%">
</p>

<h1 align="center">🐯 Minitiger Desktop Web</h1>

This repository is the dedicated **Jellyfin Web 12.1 frontend for Minitiger Desktop**.

It is intentionally separated from the native client repository so the web UI can be developed, cleaned up and tested without mixing Qt/C++ client code with the Jellyfin Web source.

## Active desktop branch

```text
minitiger-desktop-v12.1
```

Native client repository:

```text
https://github.com/Grunttanamo/Minitiger-Desktop
```

Native client branch:

```text
minitiger-native-vlc-phase1
```

## How Minitiger Desktop uses this repository

The Windows build scripts in `Minitiger-Desktop` clone this repository, check out `minitiger-desktop-v12.1`, run the normal production web build and bundle the resulting `dist/` into the native desktop client.

The old Docker sidecar deployment and the old external VLC bridge are **not part of this Desktop-Web branch anymore**. Video playback for the desktop client is handled by the native client itself; the current VLC implementation uses libVLC directly inside Minitiger Desktop.

## Local web build

Requirements:

- Node.js 24 or newer
- npm

Then run:

```bash
npm ci
npm run build:production
```

The production frontend is written to:

```text
dist/
```

## Minitiger Virtual Sync

Some Minitiger features still use the server-side **Minitiger Virtual Sync** companion plugin, including profile synchronization, virtual-library data and other server-backed Minitiger features.

Plugin source is kept in:

```text
tools/MinitigerVirtualSync/
```

See [PLUGIN_SETUP.md](PLUGIN_SETUP.md) for details.

The native VLC video backend does **not** depend on the removed external VLC bridge API.

## Cleanup rule

This repository is the Desktop-focused frontend source. Legacy Sidecar deployment files, obsolete patch helpers and the superseded external VLC bridge should not be reintroduced unless they become an intentional supported feature again.

## Credits & license

Minitiger Desktop Web is based on **Jellyfin Web** and remains licensed under **GPL-2.0-or-later**.

Upstream project: https://github.com/jellyfin/jellyfin-web
