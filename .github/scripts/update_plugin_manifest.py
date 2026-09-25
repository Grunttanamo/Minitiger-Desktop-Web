#!/usr/bin/env python3
"""Insert or replace one Minitiger Virtual Sync version in a Jellyfin catalog manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

PLUGIN_GUID = "e4e52bec-56f8-4c38-88e4-4b862a3cb93b"
PLUGIN_NAME = "Minitiger Virtual Sync"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--target-abi", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--checksum", required=True)
    parser.add_argument("--timestamp", required=True)
    parser.add_argument("--changelog", required=True)
    return parser.parse_args()


def plugin_template() -> dict:
    return {
        "guid": PLUGIN_GUID,
        "name": PLUGIN_NAME,
        "description": (
            "Server-side companion for Minitiger Desktop. Provides Minitiger profile sync, "
            "virtual-library services, background helpers, image maintenance and local trailer support."
        ),
        "overview": "Server-side companion plugin for Minitiger Desktop.",
        "owner": "Grunttanamo",
        "category": "General",
        "versions": [],
    }


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest)

    if manifest_path.exists():
        catalog = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        catalog = []

    if not isinstance(catalog, list):
        raise SystemExit("Plugin manifest root must be a JSON array.")

    plugin = next((entry for entry in catalog if entry.get("guid") == PLUGIN_GUID), None)
    if plugin is None:
        plugin = plugin_template()
        catalog.append(plugin)

    versions = plugin.setdefault("versions", [])
    versions[:] = [entry for entry in versions if entry.get("version") != args.version]
    versions.insert(
        0,
        {
            "version": args.version,
            "changelog": args.changelog,
            "targetAbi": args.target_abi,
            "sourceUrl": args.source_url,
            "checksum": args.checksum.lower(),
            "timestamp": args.timestamp,
        },
    )

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
