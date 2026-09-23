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

## Public plugin repository

Existing public plugin releases are still referenced through the original Minitiger plugin repository:

```text
https://raw.githubusercontent.com/Grunttanamo/Minitiger/minitiger-v12.1/plugin-repository/manifest.json
```

Install it through **Jellyfin Dashboard → Plugins → Repositories**, then install **Minitiger Virtual Sync** from the catalog and restart Jellyfin.

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
- the generated WebP is validated before Jellyfin's image reference is updated;
- conversion can be cancelled from the Minitiger settings UI.
