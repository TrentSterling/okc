#!/usr/bin/env python3
"""Compile one-owner city surfaces; requires Shapely 2.1.2 for regeneration only.

The browser consumes generated dist/world-surfaces.js. No GIS library is loaded
at runtime. Run from any directory after editing/regenerating city-data.js.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import hashlib
import json
import os
from pathlib import Path
import subprocess

from shapely import make_valid, set_precision
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
from city_shells import compile_buildings
from street_surfaces import compile_sidewalks, compile_edges, compile_street_paint

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('OKC_BUILD_OUTPUT', ROOT / 'dist'))
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
    source = OUTPUT / 'city-data.js'
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
    raw['road'].append(ribbon(d['route'], 21))
    for path in d.get('paths', []):
        raw['path'].append(ribbon(path['p'], path['width']))

    # A planar area belongs to exactly one visible layer. Road junctions are a
    # single union at the same elevation as Reno, not competing ribbon quads.
    specs = [('road', .14, 4), ('curb', .29, 4), ('sidewalk', .29, 18),
             ('path', .105, 18), ('water', .075, 14), ('parking', .04, 4),
             ('paving', .04, 14), ('grass', .025, 24)]
    bounds=d.get('drivingBounds')
    # OSM returns complete ways even when they run well outside the requested
    # map. Keep a small camera apron around the mapped driving area instead of
    # baking isolated road strips several kilometers past its coverage.
    clip=box(bounds['minX']-50,bounds['minZ']-50,bounds['maxX']+50,bounds['maxZ']+50) if bounds else None
    if clip is None:
        clip = box(-8000, -8000, 8000, 8000)
    custom_path = OUTPUT / 'geo/custom-landmark-volumes.json'
    custom = json.loads(custom_path.read_text())['volumes'] if custom_path.exists() else []
    building_masks = [clean(Polygon(b['p'])) for b in d['buildings']]
    building_masks += [clean(Polygon(v['polygon']['outer'], v['polygon'].get('holes', [])))
                       for v in custom if v.get('bottom', 0) <= .29]
    building_masks += [clean(Polygon(f['p'])) for f in d['features']
                       if f['name'] in ['Paycom Center', 'Crystal Bridge Tropical Conservatory']]
    blocked = merge(building_masks)
    road_union = clean(merge(raw['road']).intersection(clip))
    street = compile_sidewalks(d, road_union, blocked, merge(raw['water']), clip)
    raw['curb'] = [street['curb']]
    raw['sidewalk'] = [street['sidewalk']]
    outside_map={}
    # Sloped curb cuts own their complete plan before any horizontal surface.
    # They touch the roadway boundary but cannot create a second road owner.
    occupied = street['rampMask']
    layers, geometries, overlaps = [], {}, {}
    for kind, y, uv in specs:
        union = merge(raw[kind])
        overlaps[kind] = round(max(0., sum(p.area for p in raw[kind]) - union.area), 4)
        if clip is not None:
            clipped=clean(union.intersection(clip))
            outside_map[kind]=round(union.area-clipped.area,4)
            union=clipped
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

    # Compile the outer shell of all intersecting height volumes. This also
    # owns true facade holes and the collision footprint consumed by driving.
    buildings = d['buildings']
    building_payload, building_stats = compile_buildings(d, custom_path)
    elevations = {kind: y for kind, y, _ in specs}
    street_edges = compile_edges(street, geometries, elevations, blocked)
    street_paint = compile_street_paint(d, street, geometries, blocked)

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

    stats = {
        'sourceBuildingEntries': len(buildings), 'sourceRoadSegments': len(d['roads']),
        'sourceFootways': len(d.get('paths', [])), 'groundLayers': len(layers),
        'compiledGroundPolygons': sum(len(l['polygons']) for l in layers),
        'compiledGroundHoles': sum(len(p['holes']) for l in layers for p in l['polygons']),
        'removedDuplicateCoverageM2': overlaps,
        'clippedBeyondMapApronM2': outside_map,
        'remainingGroundLayerOverlapM2': round(overlap_total, 9),
        'ownershipClearanceMeters': .001,
        'collinearityCleanupMeters': .0005,
        'streets': street['stats'] | {'verticalEdges': len(street_edges), 'paintRectangles': len(street_paint),
                                    'rampFaces': len(street['rampFaces'])},
        'buildings': building_stats,
        'redundantBuildingIds': building_payload['redundantBuildingIds'],
        'equalHeightRoofOverlapsAfter': building_stats['remainingEqualHeightRoofOverlapM2'],
        'removedInternalWallAreaM2': building_stats['hiddenWallAreaRemovedM2'],
        'elevationsMeters': elevations,
        'note': 'Geometric ownership audit, not a claim of surveyed surface elevations. Base terrain underlies these surfaces at a separate height.'
    }
    payload = {'version': 3, 'cityDataSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
               'customLandmarkSha256': hashlib.sha256((OUTPUT / 'geo/custom-landmark-volumes.json').read_bytes()).hexdigest(),
               'layers': layers, 'streetEdges': street_edges, 'streetRamps': street['ramps'],
               'streetRampFaces': street['rampFaces'], 'streetCrossings': street['crossings'],
               'streetPaint': street_paint, **building_payload}
    return payload, stats


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check geometry and compare generated data without writing it')
    args=parser.parse_args()
    data, stats=build()
    target=OUTPUT/'world-surfaces.js'
    text='// Generated by scripts/build-world-surfaces.py; edit city-data.js and regenerate.\n// Data: © OpenStreetMap contributors (ODbL); City of Oklahoma City / Esri.\n// Attribution and source details: geo/NOTICE.txt and geo/provenance.json.\nexport const WORLD_SURFACES='+json.dumps(data,separators=(',',':'))+';\n'
    audit=OUTPUT/'geo/surface-audit.json'
    if args.check:
        assert target.read_text()==text, 'world-surfaces.js is stale; regenerate it'
        assert json.loads(audit.read_text())==stats, 'surface-audit.json is stale'
    else:
        target.write_text(text, encoding='utf-8', newline='\n')
        audit.write_text(json.dumps(stats,indent=2)+'\n', encoding='utf-8', newline='\n')
    print(json.dumps(stats,indent=2))


if __name__=='__main__':main()
