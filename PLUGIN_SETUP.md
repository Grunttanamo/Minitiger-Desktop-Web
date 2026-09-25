# Minitiger Virtual Sync

**Minitiger Virtual Sync** is the server-side companion plugin used by Minitiger features that need data or behavior beyond the normal Jellyfin Web frontend.

Current plugin responsibilities include Minitiger profile synchronization, virtual-library support, background translation services, admin messages, the season repair/removal helpers and the safe Image Fix scanner/conversion queue.

The plugin does **not** replace Jellyfin or its database.

## Native VLC note

The current Minitiger Desktop VLC backend is implemented directly in the native client with libVLC.

The old external Windows VLC bridge, `minitiger-vlc://` protocol handler and `Minitiger/Vlc` playback-job API have been removed from the Desktop-Web source. Native VLC playback therefore does not require those old bridge components.

## Source

Plugin source:

```text
tools/MinitigerVirtualSync/
```

Project:

```text
tools/MinitigerVirtualSync/Jellyfin.Plugin.MinitigerVirtualSync.csproj
```

Compatibility:

- Jellyfin Server: 12.x
- tested Minitiger target: Jellyfin 12.1
- .NET target: net10.0
- Jellyfin plugin ABI line: 12.0.0.0

## Desktop plugin repository

Minitiger Desktop uses its own companion-plugin release channel. It is independent from the older Minitiger Web / Sidecar plugin repository.

Add this repository in **Jellyfin Dashboard → Plugins → Repositories**:

```text
https://raw.githubusercontent.com/Grunttanamo/Minitiger-Desktop-Web/minitiger-desktop-v12.1/plugin-repository/manifest.json
```

Use the name **Minitiger Desktop**, save the repository, open **Plugins → Catalog**, install **Minitiger Virtual Sync**, and restart Jellyfin.

The plugin source stays in this repository under `tools/MinitigerVirtualSync/`. Published Desktop companion releases are built from this source and attached to GitHub Releases in **Grunttanamo/Minitiger-Desktop-Web**.

## Development build

From the repository root:

```bash
dotnet restore tools/MinitigerVirtualSync/Jellyfin.Plugin.MinitigerVirtualSync.csproj
dotnet build tools/MinitigerVirtualSync/Jellyfin.Plugin.MinitigerVirtualSync.csproj --configuration Release --no-restore
```

The Desktop client build itself does not compile this plugin; it is a separate Jellyfin server component.

## Image Fix

The admin-only `Minitiger/ImageFix` API can scan selected Jellyfin metadata image types and convert local JPG/JPEG/PNG files sequentially to WebP using Jellyfin's own active image encoder.

Safety rules in the first implementation:

- originals are kept;
- image resolution is not intentionally resized;
- conversion runs one image at a time;
- remote/missing/unsupported files are skipped;
- an existing same-name WebP target is never overwritten;
- a source image referenced by multiple Jellyfin image entries is protected from automatic deletion;
- the generated WebP is validated before Jellyfin's image reference is updated;
- conversion can be cancelled from the Minitiger settings UI.


## Image Fix 1.5

The Image Fix can now scan these image groups independently:

- posters;
- backdrops;
- season posters;
- landscape/thumb images;
- banners;
- cast/person primary images.

The optional **delete originals after successful conversion** mode removes the source JPG/PNG only after the WebP has been written, validated and persisted as the active Jellyfin image. A deletion failure does not invalidate an otherwise successful WebP conversion and is reported separately in the UI.


## Local trailer download

Minitiger Virtual Sync 1.6 adds an optional administrator-only local trailer download workflow for Jellyfin items that already expose a YouTube URL through `RemoteTrailers`.

When enabled in the Minitiger settings, the banner and large preview cards can show **Trailer speichern** for administrators. The plugin:

1. resolves the YouTube trailer from the selected Jellyfin item itself;
2. invokes `yt-dlp` on the Jellyfin server;
3. limits the preferred video to 1080p;
4. merges/remuxes the result to MP4;
5. writes the finished file atomically as `trailer.mp4` in the item's containing media folder;
6. queues a targeted Jellyfin item refresh so the local trailer becomes available without a global library scan.

The endpoint does not accept an arbitrary download URL from the browser. It only uses a YouTube URL already attached to that exact Jellyfin item.

The normal `INSTALL_MINITIGER_VIRTUAL_SYNC.sh` helper installs the standalone `yt-dlp` binary automatically on supported Linux x86_64 and aarch64 systems when it is missing. Jellyfin's packaged ffmpeg at `/usr/lib/jellyfin-ffmpeg/ffmpeg` is used for MP4 remuxing when available.

The Jellyfin service account must have write permission for the media folder. Existing `trailer.mp4` files are never overwritten automatically.
