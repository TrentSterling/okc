#!/usr/bin/env python3
"""Package approved v0.2 canvas captures without modifying earlier captures.

Run only after downloading and reviewing the final hosted PNGs::

    python3 scripts/package-gallery-v02.py \
        --build <capture-source-commit> \
        --captured-at <actual-ISO-8601-capture-time>

Use --dry-run to validate the inputs without writing gallery assets.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GALLERY = ROOT / "dist" / "gallery"
MANIFEST_PATH = GALLERY / "shots.json"
PACK_NAME = "prairie-prism-v02-captures.zip"
EXPECTED_CURRENT = 10
EXPECTED_ARCHIVE = 19
MAX_STATIC_ASSET_BYTES = 25 * 1024 * 1024


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", required=True, help="Full source commit used for the hosted captures")
    parser.add_argument("--captured-at", required=True, help="Actual capture time, including UTC offset or Z")
    parser.add_argument("--dry-run", action="store_true", help="Validate inputs; do not write gallery files")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.build):
        parser.error("--build must be a full 40-character lowercase Git commit hash")
    try:
        captured = datetime.fromisoformat(args.captured_at.replace("Z", "+00:00"))
        if captured.utcoffset() is None:
            raise ValueError("the time must include an offset")
    except ValueError as error:
        parser.error(f"--captured-at must be a timezone-qualified ISO timestamp: {error}")
    args.capture_time = captured.astimezone(timezone.utc)
    args.captured_at = args.capture_time.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return args


def load_presets() -> list[dict]:
    module_url = (ROOT / "dist" / "capture-presets.js").as_uri()
    program = f"import {{ SHOT_PRESETS }} from {json.dumps(module_url)}; process.stdout.write(JSON.stringify(SHOT_PRESETS));"
    result = subprocess.run(
        ["node", "--input-type=module", "-e", program],
        cwd=ROOT, text=True, capture_output=True, check=True,
    )
    presets = json.loads(result.stdout)
    if not isinstance(presets, list) or len(presets) != EXPECTED_CURRENT:
        raise ValueError(f"Expected {EXPECTED_CURRENT} current presets")
    ids = [preset.get("id") for preset in presets]
    if len(set(ids)) != len(ids) or any(not isinstance(value, str) or not re.fullmatch(r"v02-[a-z0-9-]+", value) for value in ids):
        raise ValueError("Current capture IDs must be unique, safe v02-* names")
    return presets


def load_archive(manifest: dict) -> list[dict]:
    # On a second run the current v02 entries are replaced, not re-archived.
    archive = [deepcopy(shot) for shot in manifest["shots"] if not shot["id"].startswith("v02-")]
    if len(archive) != EXPECTED_ARCHIVE or len({shot["id"] for shot in archive}) != EXPECTED_ARCHIVE:
        raise ValueError(f"Expected all {EXPECTED_ARCHIVE} distinct earlier captures; refusing to discard or duplicate history")
    old_build = manifest.get("archiveManifestBuild", manifest.get("build"))
    old_capture_time = manifest.get("archiveCapturedAt", manifest.get("capturedAt"))
    for shot in archive:
        shot.setdefault("originalCategory", shot.get("category"))
        shot.setdefault("archiveManifestBuild", old_build)
        shot.setdefault("archiveCapturedAt", old_capture_time)
        if shot.get("category") != "Development history":
            shot.setdefault("build", old_build)
            shot.setdefault("capturedAt", old_capture_time)
            shot["category"] = "First prototype"
        # Earlier development images predate that batch; archiveManifestBuild
        # identifies their archive, without inventing their individual builds.
        shot["viewId"] = None
        for key in ("src", "thumb"):
            if shot.get(key) and not (GALLERY / shot[key]).is_file():
                raise FileNotFoundError(f"Earlier capture asset is missing: {shot[key]}")
    return archive


def encoded_json(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    args = arguments()
    old_manifest = json.loads(MANIFEST_PATH.read_text())
    archive = load_archive(old_manifest)
    presets = load_presets()
    current = []
    for preset in presets:
        shot = deepcopy(preset)
        png = GALLERY / "shots" / f"{shot['id']}.png"
        with Image.open(png) as image:
            if image.format != "PNG" or image.size != (1600, 900):
                raise ValueError(f"{png.name} must be an original 1600 × 900 PNG")
            image.verify()
        shot.update({
            "category": "Reconstruction pass",
            "src": f"shots/{shot['id']}.png",
            "thumb": f"thumbs/{shot['id']}.webp",
            "width": 1600,
            "height": 900,
            "viewId": shot["id"],
            "build": args.build,
            "capturedAt": args.captured_at,
        })
        current.append(shot)

    manifest = {
        "build": args.build,
        "capturedAt": args.captured_at,
        "archiveManifestBuild": old_manifest.get("archiveManifestBuild", old_manifest.get("build")),
        "archiveCapturedAt": old_manifest.get("archiveCapturedAt", old_manifest.get("capturedAt")),
        "shots": current + archive,
    }
    if args.dry_run:
        print(json.dumps({"dryRun": True, "current": len(current), "archived": len(archive), "total": len(manifest["shots"]), "build": args.build}))
        return

    # Build everything away from the live assets. Invalid inputs or an oversized
    # download pack leave the existing gallery untouched.
    with tempfile.TemporaryDirectory(prefix=".prism-gallery-v02-", dir=GALLERY) as directory:
        staging = Path(directory)
        for shot in current:
            with Image.open(GALLERY / shot["src"]) as image:
                thumbnail = image.convert("RGB")
                thumbnail.thumbnail((1024, 576), Image.Resampling.LANCZOS)
                thumbnail.save(staging / f"{shot['id']}.webp", format="WEBP", quality=86, method=6)

        # The download manifest uses paths available inside the ZIP. Thumbnail
        # paths belong to the website and are omitted from the portable pack.
        pack_manifest = {
            "build": args.build,
            "capturedAt": args.captured_at,
            "shots": [{key: value for key, value in shot.items() if key != "thumb"} for shot in current],
        }
        readme = (
            "PRAIRIE PRISM | RECONSTRUCTION PASS v0.2\n\n"
            f"Capture source build: {args.build}\n"
            f"Capture time (UTC): {args.captured_at}\n\n"
            "Ten original 1600 × 900 PNGs rendered by the actual hosted Three.js application. "
            "These are canvas captures, not AI-generated scene illustrations.\n\n"
            "shots.json preserves each view's complete camera and scene settings. "
            "The live scene can open a current view with ?view=<viewId>.\n\n"
            "This is a geographically grounded visual reconstruction. Street and building "
            "placement uses mapped data. Some building heights, facades, planting, crown "
            "details, and lighting remain authored approximations; terrain is flattened. "
            "It is not a surveyed digital twin. Crown display light is a separate switch "
            "from the reflected sunset.\n\n"
            "The gallery retains the first prototype and earlier development images in "
            "their original PNGs and a separate download pack.\n\n"
            "Map data © OpenStreetMap contributors, under ODbL: "
            "https://www.openstreetmap.org/copyright\n"
            "Additional building footprints: City of Oklahoma City open data via Esri "
            "Community Maps. Source details and approximation notes: "
            "https://tront.xyz/okc/geo/provenance.json\n\n"
            "Scene: https://tront.xyz/okc/\n"
            "Gallery: https://tront.xyz/okc/gallery/\n"
        )
        pack = staging / PACK_NAME
        with zipfile.ZipFile(pack, "w", compression=zipfile.ZIP_STORED) as output:
            output.writestr("README.txt", readme)
            output.writestr("shots.json", encoded_json(pack_manifest))
            for shot in current:
                output.write(GALLERY / shot["src"], shot["src"])
        pack_bytes = pack.stat().st_size
        if pack_bytes > MAX_STATIC_ASSET_BYTES:
            raise ValueError(f"Capture pack is {pack_bytes:,} bytes, above the 25 MiB static-asset limit")

        staged_manifest = staging / "shots.json"
        staged_manifest.write_text(encoded_json(manifest))
        (GALLERY / "thumbs").mkdir(exist_ok=True)
        for shot in current:
            (staging / f"{shot['id']}.webp").replace(GALLERY / shot["thumb"])
        pack.replace(GALLERY / PACK_NAME)
        staged_manifest.replace(MANIFEST_PATH)

    print(json.dumps({
        "current": len(current), "archived": len(archive), "total": len(manifest["shots"]),
        "build": args.build, "capturedAt": args.captured_at,
        "pack": str(GALLERY / PACK_NAME), "packBytes": pack_bytes,
    }))


if __name__ == "__main__":
    main()
