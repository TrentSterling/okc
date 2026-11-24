#!/usr/bin/env python3
"""Audit actual submitted Float32 geometry for co-facing coplanar patches.

Reads prepare-city-diagnostics.mjs output. Unlike silhouette or source-polygon
checks, this includes baked detail instances after their real world transforms.
Opposite-facing contact surfaces are excluded. Same-material overlaps are
still checked for different texture coordinates, a frequent missed flicker.
Default scope is upward-facing surfaces in the Reno/Devon review district.
"""
import argparse
from collections import defaultdict
import json
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon
from shapely.strtree import STRtree

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--all-planes', action='store_true', help='Also inspect flat vertical/sloping faces.')
parser.add_argument('--max-conflict-area', type=float, default=None)
args = parser.parse_args()
manifest = json.loads((args.input / 'manifest.json').read_text())
vertices = np.fromfile(args.input / 'city.f32', dtype=np.float32).reshape(-1, manifest['stride'])
groups = defaultdict(list)
bounds = {'minX': -800, 'maxX': 400, 'minZ': -200, 'maxZ': 550}
tested = 0
for draw_id, draw in enumerate(manifest['draws']):
    material = manifest['materials'][draw['material']]
    if not material['depthWrite'] or draw['name'].startswith('Traffic '):
        continue
    triangles = vertices[draw['start']:draw['start'] + draw['count']].reshape(-1, 3, manifest['stride'])
    positions = triangles[:, :, :3].astype(np.float64)
    normals = triangles[:, :, 3:6].astype(np.float64)
    planar_normal = np.max(np.ptp(normals, axis=1), axis=1) < 1e-5
    selected = planar_normal
    if not args.all_planes:
        selected &= np.min(normals[:, :, 1], axis=1) > .99999
    selected &= (positions[:, :, 0].max(axis=1) >= bounds['minX']) & (positions[:, :, 0].min(axis=1) <= bounds['maxX'])
    selected &= (positions[:, :, 2].max(axis=1) >= bounds['minZ']) & (positions[:, :, 2].min(axis=1) <= bounds['maxZ'])
    for index in np.flatnonzero(selected):
        p = positions[index]; n = normals[index, 0]
        norm = np.linalg.norm(n)
        if norm < .999:
            continue
        n = n / norm
        geometric_normal = np.cross(p[1] - p[0], p[2] - p[0])
        if np.dot(n, geometric_normal) < 1e-8:
            continue
        distance = float(np.dot(n, p[0]))
        # Normals are the actual submitted flat normals, not unstable normals
        # re-derived from tiny Float32 triangles. Adjacent distance bins are
        # joined below, then all three vertices must satisfy a strict plane test.
        orientation = tuple(np.round(n, 4))
        group = (orientation, round(distance, 3))
        axis = int(np.argmax(np.abs(n))); axes = [i for i in range(3) if i != axis]
        projected = p[:, axes]
        polygon = Polygon(projected)
        if polygon.area <= 1e-6:
            continue
        groups[group].append({'p': p, 'n': n, 'd': distance, 'uv': triangles[index, :, 6:8].astype(np.float64),
                              'color': triangles[index, :, 8:11].astype(np.float64), 'projection': projected,
                              'polygon': polygon, 'material': draw['material'], 'draw': draw_id})
        tested += 1


def uv_at(item, point):
    matrix = np.column_stack([item['projection'], np.ones(3)])
    return np.asarray([*point, 1.]) @ np.linalg.solve(matrix, item['uv'])


def appearance_conflict(a, b, intersection):
    if a['material'] != b['material']:
        return 'material'
    if np.max(abs(a['color'].mean(axis=0) - b['color'].mean(axis=0))) > .001:
        return 'vertex-color'
    texture = manifest['materials'][a['material']]['map']
    if not texture:
        return None
    point = list(intersection.representative_point().coords)[0]
    try:
        delta = abs((uv_at(a, point) - uv_at(b, point)) * np.asarray(texture['repeat']))
    except np.linalg.LinAlgError:
        return 'unresolved-texture-parameterization'
    for axis, wrap in enumerate([texture['wrapS'], texture['wrapT']]):
        if wrap == 1000:
            delta[axis] = abs(delta[axis] - round(delta[axis]))
    return 'texture-coordinates' if delta.max() > .001 else None


summary = defaultdict(lambda: {'pairs': 0, 'areaM2': 0., 'appearanceConflictAreaM2': 0., 'examples': []})
total_pairs = 0; total_area = 0.; conflict_area = 0.
for key, own in groups.items():
    # A Float32 transform may move a truly coincident pair across a rounded
    # boundary. Each cross-bin pair is considered once, with plane distance
    # tolerance independent of the grouping resolution.
    orientation, distance = key
    following = groups.get((orientation, round(distance + .001, 3)), [])
    items = own + following
    if len(items) < 2:
        continue
    tree = STRtree([item['polygon'] for item in items])
    for i, a in enumerate(own):
        for j0 in tree.query(a['polygon'], predicate='intersects'):
            j = int(j0)
            if j <= i:
                continue
            b = items[j]
            if np.dot(a['n'], b['n']) < .999999:
                continue
            if max(abs(b['p'] @ a['n'] - a['d']).max(), abs(a['p'] @ b['n'] - b['d']).max()) > .00015:
                continue
            intersection = a['polygon'].intersection(b['polygon'])
            projected_area = intersection.area
            if projected_area <= .0001:
                continue
            area = projected_area / max(abs(a['n']))
            reason = appearance_conflict(a, b, intersection)
            total_pairs += 1; total_area += area
            if reason:
                conflict_area += area
            left, right = manifest['draws'][a['draw']], manifest['draws'][b['draw']]
            summary_key = (left['name'], manifest['materials'][a['material']]['name'],
                           right['name'], manifest['materials'][b['material']]['name'], reason or 'matching-appearance')
            item = summary[summary_key]; item['pairs'] += 1; item['areaM2'] += area
            if reason:
                item['appearanceConflictAreaM2'] += area
            if len(item['examples']) < 3:
                item['examples'].append({'centroid': a['p'].mean(axis=0).round(4).tolist(),
                                          'normal': a['n'].round(6).tolist(), 'plane': round(a['d'], 6), 'areaM2': area})

report = {'label': manifest['label'], 'geometrySha256': manifest['geometry']['sha256'], 'bounds': bounds,
          'scope': 'All flat co-facing surfaces' if args.all_planes else 'Upward-facing opaque flat surfaces',
          'method': __doc__, 'planeToleranceMeters': .00015, 'minimumPatchAreaM2': .0001,
          'testedTriangles': tested, 'coincidentPairs': total_pairs, 'coincidentAreaM2': total_area,
          'appearanceConflictAreaM2': conflict_area,
          'groups': [{'a': key[:2], 'b': key[2:4], 'conflict': key[4], **item} for key, item in
                     sorted(summary.items(), key=lambda entry: -entry[1]['appearanceConflictAreaM2'])]}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['label', 'scope', 'testedTriangles', 'coincidentPairs',
                                             'coincidentAreaM2', 'appearanceConflictAreaM2']}, indent=2))
if args.max_conflict_area is not None and conflict_area > args.max_conflict_area:
    raise SystemExit(f'Coplanar appearance-conflict area {conflict_area:.6f} m² exceeds {args.max_conflict_area:.6f} m².')
