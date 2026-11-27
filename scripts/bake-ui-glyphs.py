#!/usr/bin/env python3
"""Bake licensed SDF pixels and metrics; no font or encoded JS is distributed.

Adapted from Trent Sterling's Robot Life tools/bake-glyphs.py at
69b9c4ed0d65193205db8cb07d1fc217716dd783. See docs/GLYPH_LICENSE.txt.
Rebuilding requires Pillow, numpy, scipy, and an installed DejaVu Sans face.
The checked-in binary assets keep ordinary application builds independent of
these optional authoring dependencies.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt


def bake(font_path, output):
    size, pad, supersample, width, height, spread = 48, 10, 4, 1024, 512, 8
    chars = ''.join(sorted(set(''.join(chr(n) for n in range(32, 127))
                              + ''.join(chr(n) for n in range(161, 256))
                              + 'ŒœŠšŽžŸ–—‘’“”…←↑→↓↔↕✓✕•★☆⌖☰▶◀▾▴▦◒⦿✹◡◇♧▤◔♡✧≈◈▱−'), key=ord))
    font = ImageFont.truetype(str(font_path), size)
    large = ImageFont.truetype(str(font_path), size * supersample)
    placements, x, y, row = {}, 0, 0, 0
    for ch in chars:
        geometric = ch in '⦿⌖'
        left, top, right, bottom = (0, -40, 40, 0) if geometric else font.getbbox(ch, anchor='ls')
        w, h = right-left+pad*2, bottom-top+pad*2
        if x+w > width:
            x, y, row = 0, y+row, 0
        placements[ch] = {'x': x, 'y': y, 'w': w, 'h': h, 'left': left-pad,
                          'top': top-pad, 'advance': 44 if geometric else font.getlength(ch)}
        if geometric:
            placements[ch]['source'] = 'Prairie Prism original geometric symbol'
        x, row = x+w+2, max(row, h+2)
    while height < y+row:
        height *= 2
    atlas = np.zeros((height, width), np.uint8)
    for ch, glyph in placements.items():
        if ch == ' ':
            continue
        mask = Image.new('L', (glyph['w']*supersample, glyph['h']*supersample))
        draw = ImageDraw.Draw(mask)
        if ch in '⦿⌖':
            # These two Unicode symbols are absent from the installed DejaVu
            # cmap. Author their simple geometry instead of baking font tofu.
            def box(x0, y0, x1, y1):
                return tuple(round((v+pad)*supersample) for v in (x0, y0, x1, y1))
            if ch == '⦿':
                draw.ellipse(box(3, 3, 37, 37), outline=255, width=3*supersample)
                draw.ellipse(box(14, 14, 26, 26), fill=255)
            else:
                draw.ellipse(box(10, 10, 30, 30), outline=255, width=2*supersample)
                draw.line(box(2, 20, 38, 20), fill=255, width=2*supersample)
                draw.line(box(20, 2, 20, 38), fill=255, width=2*supersample)
        else:
            draw.text((-glyph['left']*supersample, -glyph['top']*supersample),
                      ch, font=large, fill=255, anchor='ls')
        binary = np.asarray(mask) > 127
        if not binary.any():
            continue
        distance = (distance_transform_edt(binary)-distance_transform_edt(~binary))/supersample
        field = np.clip(128+distance*(127/spread), 0, 255).astype(np.uint8)
        tile = np.asarray(Image.fromarray(field).resize((glyph['w'], glyph['h']), Image.Resampling.BOX))
        atlas[glyph['y']:glyph['y']+glyph['h'], glyph['x']:glyph['x']+glyph['w']] = tile
    raw = atlas.tobytes()
    ascent, descent = font.getmetrics()
    metadata = {'format': 'sdf-r8-v1', 'family': 'DejaVu Sans', 'size': size,
                'width': width, 'height': height, 'spread': spread,
                'ascent': ascent, 'descent': descent, 'glyphs': placements,
                'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                'sourceRevision': '69b9c4ed0d65193205db8cb07d1fc217716dd783',
                'license': 'GLYPH_LICENSE.txt'}
    output.mkdir(parents=True, exist_ok=True)
    (output/'glyphs.r8').write_bytes(raw)
    with (output/'glyphs.r8.gz').open('wb') as target:
        with gzip.GzipFile(filename='', mode='wb', fileobj=target, mtime=0, compresslevel=9) as packed:
            packed.write(raw)
    (output/'glyphs.json').write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    source_root = Path(__file__).resolve().parents[1]
    (output/'GLYPH_LICENSE.txt').write_bytes((source_root/'docs/GLYPH_LICENSE.txt').read_bytes())
    print(json.dumps({'atlas': [width, height], 'glyphs': len(chars), 'rawBytes': len(raw),
                      'gzipBytes': (output/'glyphs.r8.gz').stat().st_size, 'sha256': metadata['sha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', type=Path, default=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'public/ui')
    args = parser.parse_args()
    bake(args.font, args.output)
