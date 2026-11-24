#!/usr/bin/env python3
"""Compile one-owner city surfaces; requires Shapely 2.1.2 for regeneration only.

The browser consumes checked-in dist/world-surfaces.js. No GIS library is loaded
at runtime. Run from any directory after editing/regenerating city-data.js.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import subprocess

from shapely import make_valid, set_precision
from shapely.geometry import GeometryCollection, LineString, Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
GRID = .0001
EPS = .00001


def polygon_parts(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g] if g.area > EPS else []
    if hasattr(g, 'geoms'):
        return [p for child in g.geoms for p in polygon_parts(child)]
    return []


def clean(g):
    parts = polygon_parts(make_valid(g))
    return set_precision(unary_union(parts), GRID) if parts else GeometryCollection()


def merge(parts):
    return clean(unary_union(parts)) if parts else GeometryCollection()


def encoded_polygons(g):
    def ring(coords):
        return [[round(float(x), 4), round(float(z), 4)] for x, z in coords]
    polys = sorted(polygon_parts(g), key=lambda p: (round(p.bounds[0], 4), round(p.bounds[1], 4), -p.area))
    return [{'outer': ring(p.exterior.coords), 'holes': [ring(h.coords) for h in p.interiors]} for p in polys]


def ribbon(points, width):
    if len(points) < 2:
        return GeometryCollection()
    return clean(LineString(points).buffer(width / 2, cap_style='flat', join_style='mitre', mitre_limit=2))


def line_parts(g):
    if g.is_empty:
        return []
    if g.geom_type in ('LineString', 'LinearRing'):
        return [g] if g.length > .001 else []
    if hasattr(g, 'geoms'):
        return [line for child in g.geoms for line in line_parts(child)]
    return []


def effective_height(b):
    return b['h'] - 21 if b['kind'] == 'deco' and b['h'] > 100 else b['h']


def build():
    source = ROOT / 'dist/city-data.js'
    js = f"import {{ CITY_DATA }} from {json.dumps(source.as_uri())}; process.stdout.write(JSON.stringify(CITY_DATA));"
    d = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], text=True))
    raw = defaultdict(list)
    for surface in d['surfaces']:
        kind = surface['kind'] if surface['kind'] in ('grass', 'water', 'parking') else 'paving'
        raw[kind].append(clean(Polygon(surface['p'])))
    for road in d['roads']:
        if 'Reno Avenue' in road['name']:
            continue
        raw['road'].append(ribbon(road['p'], road['w']))
        raw['curb'].append(ribbon(road['p'], road['w'] + 4.4))
    raw['road'].append(ribbon(d['route'], 21))
    raw['curb'].append(ribbon(d['route'], 25))
    for path in d.get('paths', []):
        raw['path'].append(ribbon(path['p'], path['width']))

    # A planar area belongs to exactly one visible layer. Road junctions are a
    # single union at the same elevation as Reno, not competing ribbon quads.
    specs = [('road', .14, 16), ('path', .105, 18), ('water', .075, 14),
             ('curb', .06, 18), ('parking', .04, 14), ('paving', .04, 14), ('grass', .025, 24)]
    occupied = GeometryCollection()
    layers, geometries, overlaps = [], {}, {}
    for kind, y, uv in specs:
        union = merge(raw[kind])
        overlaps[kind] = round(max(0., sum(p.area for p in raw[kind]) - union.area), 4)
        # One millimeter of ownership clearance survives Float32 conversion
        # and avoids reintroducing slivers when GIS rings are rounded.
        mask = occupied.buffer(.001, join_style='mitre') if not occupied.is_empty else occupied
        # Earcut is sensitive to almost-collinear points in otherwise valid
        # hole rings. Half-millimeter cleanup is below the source map precision
        # and keeps the ring topology intact before Three triangulates it.
        exposed = clean(union.difference(mask).simplify(.0005, preserve_topology=True))
        geometries[kind] = exposed
        layers.append({'kind': kind, 'y': y, 'uvScale': uv, 'polygons': encoded_polygons(exposed)})
        occupied = merge([occupied, union])

    # Duplicate building parts with equal height must not contribute another
    # roof or an artificial roof parapet inside their parent volume.
    buildings = d['buildings']
    polys = [clean(Polygon(b['p'])) for b in buildings]
    tree = STRtree(polys)
    redundant = set()
    roof_overlap = []
    for i, (b, p) in enumerate(zip(buildings, polys)):
        for j0 in tree.query(p):
            j = int(j0)
            if j <= i or abs(b['h'] - buildings[j]['h']) > EPS:
                continue
            q = polys[j]
            area = p.intersection(q).area
            if area <= EPS:
                continue
            roof_overlap.append({'a': b['id'], 'b': buildings[j]['id'], 'area': round(area, 4)})
            if p.covers(q):
                redundant.add(buildings[j]['id'])
            elif q.covers(p):
                redundant.add(b['id'])

    # Remove both copies of internal party walls up to the smaller volume's
    # height. Taller exposed portions stay in their original world positions.
    cuts = defaultdict(list)
    shared = []
    for i, (b, p) in enumerate(zip(buildings, polys)):
        if b['id'] in redundant:
            continue
        for j0 in tree.query(p):
            j = int(j0)
            other = buildings[j]
            if j <= i or other['id'] in redundant:
                continue
            common = p.boundary.intersection(polys[j].boundary)
            parts = line_parts(common)
            if not parts:
                continue
            height = min(effective_height(b), effective_height(other))
            shared.append({'a': b['id'], 'b': other['id'], 'length': round(common.length, 4), 'height': height})
            for segment in parts:
                cuts[b['id']].append((segment, height))
                cuts[other['id']].append((segment, height))

    wall_overrides = {}
    removed_area = 0.
    for b in buildings:
        if b['id'] not in cuts:
            continue
        p = b['p'][:-1] if b['p'][0] == b['p'][-1] else b['p'][:]
        signed = sum(a[0]*p[(i+1)%len(p)][1] - p[(i+1)%len(p)][0]*a[1] for i, a in enumerate(p))
        if signed < 0:
            p.reverse()
        segments = []
        distance = 0.
        for i, a in enumerate(p):
            z = p[(i+1)%len(p)]
            edge = LineString([a, z]); length = edge.length
            if length < .02:
                continue
            intervals = []
            for cut, height in cuts[b['id']]:
                for line in line_parts(edge.intersection(cut)):
                    coords = list(line.coords)
                    start, end = sorted([edge.project(Point(coords[0])) / length,
                                         edge.project(Point(coords[-1])) / length])
                    intervals.append((start, end, height))
            knots = sorted(set([0., 1.] + [x for interval in intervals for x in interval[:2]]))
            for start, end in zip(knots, knots[1:]):
                if (end-start)*length < .001:
                    continue
                middle = (start+end)*.5
                base = max([height for lo, hi, height in intervals if lo-EPS <= middle <= hi+EPS] or [0.])
                aa = [a[k] + (z[k]-a[k])*start for k in range(2)]
                bb = [a[k] + (z[k]-a[k])*end for k in range(2)]
                segments.append({'a': [round(x, 4) for x in aa], 'b': [round(x, 4) for x in bb],
                                 'base': round(base, 4), 'u': round(distance+start*length, 4)})
                removed_area += base*(end-start)*length
            distance += length
        wall_overrides[str(b['id'])] = segments

    remaining = []
    overlap_total = 0.
    for i, (a, _, _) in enumerate(specs):
        for b, _, _ in specs[i+1:]:
            area = geometries[a].intersection(geometries[b]).area
            overlap_total += area
            if area > .001:
                remaining.append({'a': a, 'b': b, 'area': area})
    if remaining:
        raise ValueError(f'Overlapping compiled ground layers: {remaining}')
    if len(redundant) != len(roof_overlap):
        raise ValueError('New partially overlapping equal-height roofs need an explicit ownership rule')

    stats = {
        'sourceBuildingEntries': len(buildings), 'sourceRoadSegments': len(d['roads']),
        'sourceFootways': len(d.get('paths', [])), 'groundLayers': len(layers),
        'compiledGroundPolygons': sum(len(l['polygons']) for l in layers),
        'compiledGroundHoles': sum(len(p['holes']) for l in layers for p in l['polygons']),
        'removedDuplicateCoverageM2': overlaps,
        'remainingGroundLayerOverlapM2': round(overlap_total, 9),
        'ownershipClearanceMeters': .001,
        'collinearityCleanupMeters': .0005,
        'redundantBuildingIds': sorted(redundant),
        'equalHeightRoofOverlapsBefore': roof_overlap,
        'equalHeightRoofOverlapsAfter': 0,
        'sharedWallPairs': shared,
        'removedInternalWallAreaM2': round(removed_area, 4),
        'elevationsMeters': {kind: y for kind, y, _ in specs},
        'note': 'Geometric ownership audit, not a claim of surveyed surface elevations. Base terrain underlies these surfaces at a separate height.'
    }
    payload = {'version': 1, 'cityDataSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
               'layers': layers, 'redundantBuildingIds': sorted(redundant), 'wallOverrides': wall_overrides}
    return payload, stats


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check geometry and compare generated data without writing it')
    args=parser.parse_args()
    data, stats=build()
    target=ROOT/'dist/world-surfaces.js'
    text='// Generated by scripts/build-world-surfaces.py; edit city-data.js and regenerate.\n// Data: © OpenStreetMap contributors (ODbL); City of Oklahoma City / Esri.\n// Attribution and source details: geo/NOTICE.txt and geo/provenance.json.\nexport const WORLD_SURFACES='+json.dumps(data,separators=(',',':'))+';\n'
    audit=ROOT/'dist/geo/surface-audit.json'
    if args.check:
        assert target.read_text()==text, 'world-surfaces.js is stale; regenerate it'
        assert json.loads(audit.read_text())==stats, 'surface-audit.json is stale'
    else:
        target.write_text(text)
        audit.write_text(json.dumps(stats,indent=2)+'\n')
    print(json.dumps(stats,indent=2))


if __name__=='__main__':main()
