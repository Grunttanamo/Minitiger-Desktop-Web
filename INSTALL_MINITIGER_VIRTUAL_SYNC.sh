#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$ROOT_DIR/tools/MinitigerVirtualSync/Jellyfin.Plugin.MinitigerVirtualSync.csproj"
BUILD_DIR="$ROOT_DIR/tools/MinitigerVirtualSync/out"
PLUGIN_DIR="/var/lib/jellyfin/plugins/Minitiger Virtual Sync"

if [[ ! -f "$PROJECT" ]]; then
  echo "[Minitiger Sync] Projekt nicht gefunden: $PROJECT" >&2
  exit 1
fi

DOTNET_BIN=""
if command -v dotnet >/dev/null 2>&1 && dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
  DOTNET_BIN="$(command -v dotnet)"
elif [[ -x "$HOME/.dotnet/dotnet" ]] && "$HOME/.dotnet/dotnet" --list-sdks 2>/dev/null | grep -q '^10\.'; then
  DOTNET_BIN="$HOME/.dotnet/dotnet"
else
  echo "[Minitiger Sync] .NET 10 SDK fehlt – installiere es nur für diesen Benutzer nach ~/.dotnet ..."
  if ! command -v curl >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y curl
  fi
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/minitiger-dotnet-install.sh
  bash /tmp/minitiger-dotnet-install.sh --channel 10.0 --quality GA --install-dir "$HOME/.dotnet"
  DOTNET_BIN="$HOME/.dotnet/dotnet"
fi

export DOTNET_ROOT="$(dirname "$DOTNET_BIN")"
export PATH="$DOTNET_ROOT:$PATH"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "[Minitiger Sync] yt-dlp fehlt – installiere optionale Trailer-Download-Abhängigkeit ..."
  ARCH="$(uname -m)"
  case "$ARCH" in
    aarch64|arm64)
      YTDLP_ASSET="yt-dlp_linux_aarch64"
      ;;
    x86_64|amd64)
      YTDLP_ASSET="yt-dlp_linux"
      ;;
    *)
      YTDLP_ASSET=""
      ;;
  esac

  if [[ -n "$YTDLP_ASSET" ]]; then
    sudo curl -fL \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP_ASSET" \
      -o /usr/local/bin/yt-dlp
    sudo chmod 755 /usr/local/bin/yt-dlp
  else
    echo "[Minitiger Sync] WARNUNG: Architektur $ARCH wird vom automatischen yt-dlp-Installer nicht erkannt."
    echo "[Minitiger Sync] Trailer-Download bleibt deaktiviert, bis yt-dlp manuell installiert wurde."
  fi
fi

if command -v yt-dlp >/dev/null 2>&1; then
  echo "[Minitiger Sync] yt-dlp: $(yt-dlp --version 2>/dev/null || echo installiert)"
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "[Minitiger Sync] Deno fehlt – installiere JavaScript-Runtime für aktuelle YouTube-Extraktion ..."
  ARCH="$(uname -m)"
  case "$ARCH" in
    aarch64|arm64)
      DENO_ASSET="deno-aarch64-unknown-linux-gnu.zip"
      ;;
    x86_64|amd64)
      DENO_ASSET="deno-x86_64-unknown-linux-gnu.zip"
      ;;
    *)
      DENO_ASSET=""
      ;;
  esac

  if [[ -n "$DENO_ASSET" ]]; then
    TMP_DENO_DIR="$(mktemp -d)"
    curl -fL       "https://github.com/denoland/deno/releases/latest/download/$DENO_ASSET"       -o "$TMP_DENO_DIR/deno.zip"

    python3 -m zipfile -e       "$TMP_DENO_DIR/deno.zip"       "$TMP_DENO_DIR"

    sudo install -m 755       "$TMP_DENO_DIR/deno"       /usr/local/bin/deno

    rm -rf "$TMP_DENO_DIR"
  else
    echo "[Minitiger Sync] WARNUNG: Architektur $ARCH wird vom automatischen Deno-Installer nicht erkannt."
    echo "[Minitiger Sync] YouTube-Trailer können dadurch eingeschränkt sein."
  fi
fi

if command -v deno >/dev/null 2>&1; then
  echo "[Minitiger Sync] Deno: $(deno --version 2>/dev/null | head -n 1 || echo installiert)"
fi

if [[ -x /usr/lib/jellyfin-ffmpeg/ffmpeg ]]; then
  echo "[Minitiger Sync] Jellyfin-ffmpeg für Trailer-Remux gefunden."
elif ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[Minitiger Sync] WARNUNG: ffmpeg wurde nicht gefunden. yt-dlp kann Trailer dann eventuell nicht als MP4 zusammenführen."
fi

echo "[Minitiger Sync] Verwende: $($DOTNET_BIN --version)"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

"$DOTNET_BIN" restore "$PROJECT"
"$DOTNET_BIN" publish "$PROJECT" -c Release -o "$BUILD_DIR" --no-self-contained

if [[ ! -f "$BUILD_DIR/Jellyfin.Plugin.MinitigerVirtualSync.dll" ]]; then
  echo "[Minitiger Sync] Build-DLL wurde nicht erzeugt." >&2
  exit 1
fi

echo "[Minitiger Sync] Installiere Jellyfin-Plugin ..."
sudo mkdir -p "$PLUGIN_DIR"
sudo cp -f "$BUILD_DIR/Jellyfin.Plugin.MinitigerVirtualSync.dll" "$PLUGIN_DIR/"
sudo chown -R jellyfin:jellyfin "$PLUGIN_DIR"
sudo chmod 755 "$PLUGIN_DIR"
sudo chmod 644 "$PLUGIN_DIR/Jellyfin.Plugin.MinitigerVirtualSync.dll"

sudo systemctl restart jellyfin
sleep 4
sudo systemctl --no-pager --full status jellyfin | head -25

echo
echo "[Minitiger Sync] Fertig. Endpoints: /Minitiger/VirtualLibraries/Status · /Minitiger/ImageFix/Status · /Minitiger/TrailerDownload/Status · /Minitiger/TrailerDetection/Detect · /Minitiger/DirectoryUpdate/Run"
echo "[Minitiger Sync] Beim ersten Admin-Aufruf überträgt Minitiger den bisherigen lokalen Stand automatisch, falls der Server noch leer ist."
