#!/usr/bin/env python3
"""Check compiled sections using independent planar and solid geometry."""
import json
import math
import sys
from collections import Counter
from itertools import combinations
from shapely import make_valid, prepare
from shapely.affinity import rotate, translate
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

with open(sys.argv[1], encoding='utf-8') as handle:
    data = json.load(handle)
world, city = data['world'], data['city']
failures, failure_count = [], 0

def check(condition, label):
    global failure_count
    if not condition:
        failure_count += 1
        if len(failures) < 16:
            failures.append(label)


def poly(p): return Polygon(p['outer'], p.get('holes', []))

def rectangle(m):
    return translate(rotate(box(-m['length']/2, -m['width']/2, m['length']/2, m['width']/2),
                     -m['rotation'], origin=(0, 0), use_radians=True), m['x'], m['z'])

layers = {layer['kind']: unary_union([poly(p) for p in layer['polygons']]) for layer in world['layers']}
heights = {layer['kind']: layer['y'] for layer in world['layers']}
check(abs(heights['curb']-heights['road']-.15) < 1e-8, 'Curbs must rise150mm above road, not sink below it')
check(heights['sidewalk'] == heights['curb'], 'Walk must meet cap without a step')
check(layers['curb'].area > 1000 and layers['sidewalk'].area > 10000, 'Missing real curb/walk geometry')
for name, p in layers.items():
    check(p.is_valid and p.area > 0, f'Invalid or empty {name} surface')
for a, b in combinations(layers, 2):
    check(layers[a].intersection(layers[b]).area < .0001, f'Overlapping flat layers {a}/{b}')

# This independently reconstructs only the preexisting driveable ribbon union.
# Sidewalk reconstruction cannot fill or subtract a traffic lane to hide a seam.
roads = [LineString(r['p']).buffer(r['w']/2, cap_style=2, join_style=2, mitre_limit=2)
         for r in city['roads'] if 'Reno Avenue' not in r['name']]
roads.append(LineString(city['route']).buffer(10.5, cap_style=2, join_style=2, mitre_limit=2))
b = city['drivingBounds']
clip = box(b['minX']-50, b['minZ']-50, b['maxX']+50, b['maxZ']+50)
expected_road = unary_union(roads).intersection(clip)
road_error = layers['road'].symmetric_difference(expected_road).area
# Source precision and the original .5mm topology-preserving cleanup differ
# slightly from this independent exact-buffer oracle, within one mm per edge.
check(road_error < expected_road.length*.001, 'Street sections change the authored driveable road envelope')

ramps = world['streetRamps']
check(len(ramps) >= 8, 'Critical intersections require physical curb cuts')
ramp_polys = [poly(r['footprint']) for r in ramps]
ramp_union = unary_union(ramp_polys)
for kind, surface in layers.items():
    check(ramp_union.intersection(surface).area < .005, f'Ramps double-own {kind}')
for i, ramp in enumerate(ramps):
    p = ramp_polys[i]
    check(p.is_valid, f'Ramp {ramp["id"]} invalid')
    v = ramp['vertices']
    triangle_polys = [Polygon([(v[k][0], v[k][2]) for k in t]) for t in ramp['triangles']]
    check(abs(sum(p.area for p in triangle_polys)-p.area) < .002, f'Ramp {ramp["id"]} triangles double-cover or omit its footprint')
    check(unary_union(triangle_polys).symmetric_difference(p).area < .002, f'Ramp {ramp["id"]} triangles escape footprint')
    ys = [q[1] for q in v]
    check(abs(min(ys)-heights['road']-.002) < 1e-8 and max(ys) == heights['sidewalk'], f'Ramp {ramp["id"]} does not join road to walk')
    depth = math.hypot(v[5][0]-v[1][0], v[5][2]-v[1][2])
    check(0 < (v[5][1]-v[1][1])/depth < .084, f'Ramp {ramp["id"]} central slope too steep')
    for j in range(i):
        check(p.intersection(ramp_polys[j]).area < .0001, f'Ramp {ramp["id"]} overlaps another curb cut')

# A sidewalk/cap may never enter a ground-level building or the driving road.
solid_polys = [Polygon(s['polygon'], s.get('holes', [])) for s in world['drivingSolids']
               if s.get('bottom', 0) <= heights['sidewalk']]
solids = unary_union(solid_polys)
raised = unary_union([layers['curb'], layers['sidewalk'], ramp_union])
check(raised.intersection(solids).area < .01, 'Raised sidewalk enters a building/campus collision volume')
edge_count = Counter()
for i, e in enumerate(world['streetEdges']):
    line = LineString([e['a'], e['b']])
    check(line.length > .035, f'Collapsed curb edge {i}')
    check(e['top'] == heights['sidewalk'] and e['bottom'] < e['top'], f'Invalid curb height {i}')
    check(abs(math.hypot(*e['normal'])-1) < .0001, f'Nonunit curb normal {i}')
    check(line.distance(raised) < .003, f'Floating curb edge {i}')
    if e['kind'] == 'curb':
        check(e['bottom'] == heights['road'], f'Curb {i} does not meet asphalt')
    edge_count[e['kind']] += 1
check(edge_count['curb'] > 500, 'Missing road-facing curb risers')

marks = world['streetPaint'] + [dict(m, kind='road') for m in data['extraPaint']]
paint = [rectangle(m) for m in marks]
road = layers['road'].buffer(.00015); parking = layers['parking'].buffer(.00015)
prepare(road); prepare(parking)
for i, (m, p) in enumerate(zip(marks, paint)):
    check((road if m['kind'] == 'road' else parking).covers(p), f'Paint {i} escapes {m["kind"]}')
tree = STRtree(paint)
paint_overlap = 0.
for i, p in enumerate(paint):
    for j in tree.query(p):
        if int(j) <= i:
            continue
        overlap = p.intersection(paint[int(j)]).area
        if overlap > .0001:
            paint_overlap += overlap
            check(False, f'Coplanar paint rectangles {i}/{int(j)} overlap by {overlap:.6f}m2')
summary = {'engine': 'Independent Shapely/GEOS', 'layers': len(layers), 'roadEnvelopeDifferenceM2': road_error,
           'curbRevealMeters': heights['curb']-heights['road'], 'verticalEdges': dict(edge_count),
           'ramps': len(ramps), 'paintRectangles': len(marks), 'positivePaintOverlapM2': paint_overlap,
           'failures': failure_count, 'firstFailures': failures,
           'scope': 'Built polygon ownership, full paint rectangles, curb risers and ramp joins; no GPU/frame-rate claim.'}
print(json.dumps(summary, separators=(',', ':')))
sys.exit(1 if failure_count else 0)
