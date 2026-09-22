# Minitiger Virtual Sync

**Minitiger Virtual Sync** is the server-side companion plugin used by Minitiger features that need data or behavior beyond the normal Jellyfin Web frontend.

Current plugin responsibilities include Minitiger profile synchronization, virtual-library support, background translation services, admin messages and the existing season repair/removal helpers.

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
