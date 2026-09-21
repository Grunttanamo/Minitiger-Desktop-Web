<p align="center">
  <img src="https://raw.githubusercontent.com/Grunttanamo/Minitiger/minitiger-v12.1/docs/assets/minitiger-banner.gif" alt="Minitiger Web Banner" width="100%">
</p>

<h1 align="center">🐯 Minitiger Web</h1>

<p align="center">
  <strong>A cute custom Jellyfin 12.1 web experience — available as a safe Docker sidecar or a native Debian / Raspberry Pi frontend.</strong><br>
  Keep your existing Jellyfin server, database, users, libraries, watch state and settings untouched.
</p>

<p align="center">
  <img alt="Jellyfin 12.1" src="https://img.shields.io/badge/Jellyfin-12.1-00A4DC?logo=jellyfin&logoColor=white">
  <img alt="Docker GHCR" src="https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/Platforms-amd64%20%7C%20arm64-555555">
  <img alt="License" src="https://img.shields.io/badge/License-GPL--2.0--or--later-orange">
</p>

<p align="center">
  <a href="https://github.com/Grunttanamo/Minitiger/pkgs/container/minitiger-web"><strong>📦 Docker Package</strong></a>
  ·
  <a href="SIDECAR_SETUP.md"><strong>🧊 Docker / Sidecar</strong></a>
  ·
  <a href="DEBIAN_RASPBERRY_PI_SETUP.md"><strong>🍓 Debian / Raspberry Pi</strong></a>
  ·
  <a href="PLUGIN_SETUP.md"><strong>🔌 Companion Plugin</strong></a>
  ·
  <a href="VLC_EXPERIMENTAL_SETUP.md"><strong>🎬 VLC Experimental</strong></a>
  ·
  <a href="CHANGELOG_Minitiger_Web.txt"><strong>📝 Changelog</strong></a>
</p>

---

## ✨ What is Minitiger Web?

**Minitiger Web** is a heavily customized Jellyfin Web frontend targeting **Jellyfin 12.1**. It keeps the familiar Jellyfin backend while adding the Minitiger home, custom detail pages, virtual libraries, manga/comic improvements, trailer integrations, audio-language flags and a lot of UI polish.

There are currently two installation styles:

- **Docker / Sidecar (recommended for most users):** runs next to your existing Jellyfin installation on a separate port.
- **Debian / Raspberry Pi native:** serves Minitiger directly from your existing Jellyfin instance on the normal Jellyfin port.

The Docker sidecar is the most isolated option:

```text
Your normal Jellyfin                 Minitiger Web Sidecar
http://SERVER:8096                   http://SERVER:8098
        │                                     │
        ├── users                             ├── Minitiger frontend
        ├── database                          ├── Jellyfin API proxy
        ├── libraries                         └── no /config or media mounts
        ├── watch state
        ├── plugins
        └── settings
```

Deleting the Minitiger container does **not** delete or migrate your Jellyfin data.

The native Debian / Raspberry Pi setup keeps the same Jellyfin backend but points Jellyfin's web directory at a separately built Minitiger frontend. The packaged Jellyfin web files remain untouched for rollback.

## 🖥️ Minitiger Desktop bundled frontend

Minitiger Web is also the authoritative frontend source for the experimental **Minitiger Desktop** project. Desktop development builds can clone this `minitiger-v12.1` branch, create the normal production `dist/`, and embed that output directly into the Qt desktop executable.

In bundled desktop mode, the frontend is loaded locally from a `qrc://` resource while API/media requests continue to use the normal Jellyfin Server address supplied by the native shell. A separate Minitiger Web sidecar is therefore not required for that desktop mode.

The browser, Docker/sidecar and native Debian/Raspberry Pi deployment paths remain supported separately.

## 🚀 Docker quick start

```bash
docker run -d \
  --name minitiger-web \
  --restart unless-stopped \
  -p 8098:80 \
  -e JELLYFIN_URL="http://host.docker.internal:8096" \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/grunttanamo/minitiger-web:latest
```

### Jellyfin Desktop Client

```text
http://SERVER-IP:8098
```

### Browser

```text
http://SERVER-IP:8098/web/index.html
```

The external port `8098` is only an example. Pick any free port on your system.

## 🍓 Debian / Raspberry Pi native install

A native installation is available for users who want Minitiger directly on their normal Jellyfin address, for example:

```text
http://SERVER-IP:8096
```

The currently tested native environment is **Raspberry Pi 5 + Debian 13 (trixie) arm64 + Jellyfin 12.1**.

The native guide includes build requirements, cloning, Jellyfin web-directory configuration, production deployment, updates, companion-plugin setup, rollback to the previous Minitiger build and a full rollback to the stock Jellyfin frontend.

See **[DEBIAN_RASPBERRY_PI_SETUP.md](DEBIAN_RASPBERRY_PI_SETUP.md)**.

## 🔌 Optional companion plugin

For server-synced Minitiger features, install **Minitiger Virtual Sync** as a normal Jellyfin plugin.

Add this repository in **Jellyfin Dashboard → Plugins → Repositories**:

```text
https://raw.githubusercontent.com/Grunttanamo/Minitiger/minitiger-v12.1/plugin-repository/manifest.json
```

Then open the Plugin Catalog, install **Minitiger Virtual Sync**, and restart Jellyfin. See [PLUGIN_SETUP.md](PLUGIN_SETUP.md) for the full setup and release flow.

## 🎬 VLC Player · Experimentell (Windows)

Minitiger can optionally use an **external VLC Media Player on Windows** while keeping Jellyfin resume state, progress, watched/stopped state and episode auto-next synchronized.

This mode requires **Windows + Jellyfin Desktop + VLC Media Player + the Minitiger VLC Bridge + Minitiger Virtual Sync**. VLC opens in a separate window in the current external edition. The native Jellyfin player remains available and does not require the VLC-specific Windows setup.

See **[VLC_EXPERIMENTAL_SETUP.md](VLC_EXPERIMENTAL_SETUP.md)** for the complete Windows installation, update, uninstall and troubleshooting guide.

## 🟩 Unraid

Create an additional container and use:

```text
Repository:      ghcr.io/grunttanamo/minitiger-web:latest
Network Type:    Bridge
Host Port:       8098
Container Port:  80 / TCP
JELLYFIN_URL:    http://host.docker.internal:8096
Extra Params:    --add-host=host.docker.internal:host-gateway
```

Do **not** mount your Jellyfin `/config`, `/cache`, appdata or media folders into the Minitiger container.

## 🎨 Highlights

- Custom Minitiger home and detail-page design
- Virtual libraries and Minitiger-specific navigation
- Manga / comic improvements
- Trailer and playback integrations
- Experimental external VLC playback for Windows Jellyfin Desktop
- Audio-language flags and media information polish
- Docker sidecar installation
- Native Debian / Raspberry Pi installation
- Multi-architecture Docker image for **amd64** and **arm64**

## 🔖 Docker tags

| Tag | Meaning |
| --- | --- |
| `latest` | Current recommended Minitiger sidecar build |
| `12.1` | Current build targeting Jellyfin 12.1 |
| `sha-…` | Immutable image for a specific Git commit |

## ✅ Current compatibility

Current target: **Jellyfin Server / Web 12.1**.

Confirmed in the current test setup:

- Jellyfin 12.1 server connection
- Jellyfin Desktop Client via sidecar
- Native Jellyfin Desktop Client connection on Debian / Raspberry Pi
- Raspberry Pi 5 / Debian 13 (trixie) / arm64 native deployment
- Login
- Home
- Libraries
- Detail pages
- Playback
- Browser via `/web/index.html`

Non-standard Jellyfin base URLs and unusual reverse-proxy/authentication setups may require extra configuration.

## ❤️ Credits & license

Minitiger Web is a community customization based on **Jellyfin Web**. It is not an official Jellyfin project and is not affiliated with the Jellyfin team.

Jellyfin Web and this derivative remain licensed under **GPL-2.0-or-later**. See [`LICENSE`](LICENSE).

Upstream project: https://github.com/jellyfin/jellyfin-web

<sub>Banner artwork is used as Minitiger project artwork. A static PNG fallback is stored at <code>docs/assets/minitiger-banner.png</code>.</sub>
