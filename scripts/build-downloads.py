#!/usr/bin/env python3
"""Build or verify both capture downloads using only the Python standard library.

The PNG bytes and their original capture metadata are preserved. No image
decoder, recompression, credentials, or network access is required.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path, PurePosixPath
import re
import struct
import tempfile
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
GALLERY = ROOT / "dist" / "gallery"
PUBLIC_URL = "https://tront.xyz/okc/"
PACKS = (
    ("prairie-prism-v02-captures.zip", "Reconstruction captures", True, 10),
    ("prairie-prism-captures.zip", "Earlier prototype and development captures", False, 19),
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def archive_path(value):
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or path.parts[:1] != ("shots",):
        raise ValueError("Unsafe capture path: " + value)
    if path.suffix.lower() != ".png":
        raise ValueError("Capture must be a PNG: " + value)
    return path.as_posix()


def load_manifest():
    manifest = json.loads((GALLERY / "shots.json").read_text(encoding="utf-8"))
    shots = manifest.get("shots")
    if not isinstance(shots, list) or len(shots) != 29:
        raise ValueError("Expected 29 captures in the gallery manifest")
    ids = [shot.get("id", "") for shot in shots]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r"[a-z0-9-]+", value) for value in ids):
        raise ValueError("Capture IDs must be unique, safe names")
    for shot in shots:
        filename = GALLERY / archive_path(shot["src"])
        with filename.open("rb") as stream:
            header = stream.read(24)
        if header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
            raise ValueError("Invalid PNG header: " + str(filename))
        dimensions = struct.unpack(">II", header[16:24])
        if dimensions != (shot["width"], shot["height"]):
            raise ValueError("PNG dimensions disagree with metadata: " + shot["id"])
        if shot["id"].startswith("v02-") and dimensions != (1600, 900):
            raise ValueError("Current captures must be 1600 by 900")
    return manifest


def zip_date(timestamp):
    # A fixed fallback keeps older images with no individual timestamp
    # reproducible without assigning them an invented capture date.
    if not timestamp:
        return (1980, 1, 1, 0, 0, 0)
    date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(timezone.utc)
    if not 1980 <= date.year <= 2107:
        raise ValueError("Capture timestamp is outside the ZIP date range")
    return (date.year, date.month, date.day, date.hour, date.minute, date.second)


def prepare_pack(manifest, title, current, count):
    selected = [deepcopy(s) for s in manifest["shots"] if s["id"].startswith("v02-") == current]
    if len(selected) != count:
        raise ValueError("Expected " + str(count) + " images for " + title)
    for shot in selected:
        # Thumbnails are website assets, not files in the portable download.
        shot.pop("thumb", None)
    metadata = {
        "title": title,
        "site": PUBLIC_URL,
        "gallery": PUBLIC_URL + "gallery/",
        "sourceManifest": {key: value for key, value in manifest.items() if key != "shots"},
        "shots": selected,
    }
    readme = (
        "PRAIRIE PRISM\n" + title + "\n\n"
        + str(count) + " original canvas PNGs from the Three.js application.\n"
        "PNG bytes are copied unchanged. These are rendered scene captures.\n\n"
        "shots.json preserves each image's camera, scene settings, dimensions,\n"
        "capture source revision, and capture date where originally recorded.\n"
        "Some development images have no individual source revision or date.\n"
        "The sourceManifest entry identifies the combined gallery manifest.\n"
        "Current live geometry can include fixes made after these photographs.\n\n"
        "A current image with a viewId can be opened with ?view=<viewId>.\n"
        "Earlier images retain their original pixels and have no exact live replay.\n\n"
        "This is a mapped visual reconstruction, with estimated heights and facade\n"
        "details, authored lighting, illustrative planting, and flat terrain.\n"
        "It is not a surveyed digital twin. The crown display is independent of\n"
        "the reflected sunset.\n\n"
        "Geographic attribution: see GEOGRAPHIC-NOTICE.txt. Source details:\n"
        + PUBLIC_URL + "geo/provenance.json\n\n"
        "Scene: " + PUBLIC_URL + "\n"
        "Gallery: " + PUBLIC_URL + "gallery/\n"
        "Repository: https://github.com/TrentSterling/okc\n"
    )
    notice = (ROOT / "dist" / "geo" / "NOTICE.txt").read_text(encoding="utf-8")
    entries = {
        "README.txt": readme.encode("utf-8"),
        "shots.json": json_text(metadata).encode("utf-8"),
        "GEOGRAPHIC-NOTICE.txt": notice.encode("utf-8"),
    }
    for value in entries.values():
        if b".chatgpt.site" in value:
            raise ValueError("A private Site URL remains in portable capture metadata")
    return selected, entries


def add_entry(archive, name, data, timestamp=None):
    info = zipfile.ZipInfo(name, date_time=zip_date(timestamp))
    info.compress_type = zipfile.ZIP_STORED
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data)


def verify_pack(filename, shots, entries):
    expected = set(entries) | {shot["src"] for shot in shots}
    with zipfile.ZipFile(filename) as archive:
        if set(archive.namelist()) != expected or len(archive.namelist()) != len(expected):
            raise ValueError("Capture archive has missing or unexpected files: " + filename.name)
        if archive.testzip() is not None:
            raise ValueError("Capture archive CRC failure: " + filename.name)
        for name, data in entries.items():
            if archive.read(name) != data:
                raise ValueError("Capture archive metadata is stale: " + filename.name)
        for shot in shots:
            source = (GALLERY / shot["src"]).read_bytes()
            info = archive.getinfo(shot["src"])
            if info.file_size != len(source) or info.CRC != zlib.crc32(source):
                raise ValueError("Original PNG differs from archive: " + shot["id"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify existing archives without writing")
    args = parser.parse_args()
    manifest = load_manifest()
    prepared = [(filename, *prepare_pack(manifest, title, current, count))
                for filename, title, current, count in PACKS]
    if args.check:
        for filename, shots, entries in prepared:
            verify_pack(GALLERY / filename, shots, entries)
    else:
        # Stage both packs before replacing either existing download.
        with tempfile.TemporaryDirectory(prefix=".capture-downloads-", dir=GALLERY) as directory:
            staging = Path(directory)
            for filename, shots, entries in prepared:
                with zipfile.ZipFile(staging / filename, "w") as archive:
                    for name, content in entries.items():
                        add_entry(archive, name, content)
                    for shot in shots:
                        add_entry(archive, shot["src"], (GALLERY / shot["src"]).read_bytes(),
                                  shot.get("capturedAt"))
                verify_pack(staging / filename, shots, entries)
            for filename, _, _ in prepared:
                (staging / filename).replace(GALLERY / filename)
    print(json.dumps({
        "mode": "verified" if args.check else "built",
        "packs": [{"file": filename, "captures": len(shots),
                   "bytes": (GALLERY / filename).stat().st_size}
                  for filename, shots, _ in prepared],
        "originalPngBytesPreserved": True,
    }))


if __name__ == "__main__":
    main()
