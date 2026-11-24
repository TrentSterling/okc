#!/usr/bin/env python3
"""Independent GEOS geometry checks for actual built JavaScript placements."""
import json
import math
import sys
from shapely import prepare
from shapely.geometry import Polygon, MultiPoint, Point, LineString, box
from shapely.ops import unary_union
from shapely.affinity import rotate, translate

with open(sys.argv[1], encoding='utf-8') as handle:
    data = json.load(handle)

failures = []
failure_count = 0
TOL = 1e-5


def check(condition, message):
    global failure_count
    if not condition:
        failure_count += 1
        if len(failures) < 12:
            failures.append(message)


def polygon(item):
    if isinstance(item, list):
        return Polygon(item)
    return Polygon(item.get('outer', item.get('polygon')), item.get('holes', []))


def rectangle(mark):
    result = box(-mark['length'] / 2, -mark['width'] / 2, mark['length'] / 2, mark['width'] / 2)
    # Three Y rotation sends local +X toward -Z. Here coordinates are X/Z.
    result = rotate(result, -mark['rotation'], origin=(0, 0), use_radians=True)
    return translate(result, mark['x'], mark['z'])


surfaces = {layer['kind']: [polygon(p) for p in layer['polygons']] for layer in data['layers']}
for kind, polygons in surfaces.items():
    check(all(p.is_valid and p.area > 0 for p in polygons), f'Invalid source {kind} polygon')
unions = {kind: unary_union(polygons) for kind, polygons in surfaces.items()}
buildings = unary_union([polygon(p) for p in data['solids']])
forbidden = unary_union([unions[kind] for kind in ['road', 'path', 'water']] + [buildings])
garden = polygon(data['garden'])
road_tolerance = unions['road'].buffer(TOL)
prepare(road_tolerance)
seed_summaries = []
for case in data['cases']:
    plan = case['plan']
    footprints = [(entry, polygon(entry['footprint'])) for entry in plan['placements']]
    solid_by_id = {solid['id']: solid for solid in plan['solids']}
    for index, (entry, footprint) in enumerate(footprints):
        label = f"Seed {case['seed']} {entry['id']}"
        check(footprint.is_valid and footprint.area > 0, label + ': invalid footprint')
        expected_kind = 'parking' if entry['kind'] == 'parked-car' else 'paving'
        check(entry['surfaceKind'] == expected_kind, label + ': wrong permitted surface')
        source_surface = surfaces[expected_kind][entry['surfaceIndex']]
        margin = {'parked-car': .20, 'bench': .40, 'bin': .30}[entry['kind']]
        check(source_surface.covers(footprint.buffer(margin - TOL)), label + ': crosses surface edge or hole')
        clearance = 1.05 if entry['kind'] == 'bench' else .50
        check(footprint.distance(forbidden) >= clearance - TOL, label + ': obstructs a road/path/water/building')
        check(all(footprint.distance(previous) >= .30 - TOL for _, previous in footprints[:index]), label + ': collides with another prop')
        check(all(footprint.distance(Point(p)) >= .90 - TOL for p in data['mappedTrees']), label + ': blocks a mapped trunk')
        solid = solid_by_id[entry['id']]
        solid_shape = polygon(solid)
        check(solid_shape.symmetric_difference(footprint).area < 1e-8, label + ': collision footprint differs from placement')
        check(all(math.isfinite(solid[k]) for k in ['bottom', 'height']) and solid['height'] > solid['bottom'], label + ': invalid collision height')
    assigned = {entry['id']: 0 for entry, _ in footprints}
    for index, part in enumerate(case['parts']):
        shape = MultiPoint(part['points']).convex_hull
        owners = [entry for entry, footprint in footprints if footprint.buffer(TOL).covers(shape)]
        check(len(owners) == 1, f"Seed {case['seed']} rendered part {index} escapes its placement footprint")
        if len(owners) == 1:
            owner = owners[0]
            assigned[owner['id']] += 1
            solid = solid_by_id[owner['id']]
            check(part['bottom'] >= solid['bottom'] - TOL and part['top'] <= solid['height'] + TOL,
                  f"Seed {case['seed']} {owner['id']}: mesh escapes collision height")
    check(all(count > 0 for count in assigned.values()), f"Seed {case['seed']}: a planned prop has no rendered geometry")
    for tree in case['treeBounds']:
        clearance = Point(tree['x'], tree['z']).distance(buildings)
        margin = .29 if tree['kind'] == 'crown' else .03
        check(clearance >= tree['radius'] + margin - TOL,
              f"Seed {case['seed']} tree {tree['kind']} at {tree['x']:.3f},{tree['z']:.3f} reaches a building")
    for tree, trunk in zip(case['gardenTrees'], case['gardenTrunks']):
        label = f"Seed {case['seed']} {tree['id']}"
        footprint = MultiPoint(trunk['foot']).convex_hull
        check(footprint.is_valid and footprint.area > 0, label + ': invalid trunk footprint')
        check(unions['grass'].covers(footprint.buffer(.3)), label + ': trunk leaves grass or enters a hole')
        check(garden.covers(footprint), label + ': trunk outside gardens')
        check(footprint.distance(forbidden) >= 1.0 - TOL, label + ': trunk obstructs an exclusion')
        check(all(Point(tree['x'], tree['z']).distance(Point(p)) >= 4.5 - TOL for p in data['mappedTrees']), label + ': too close to mapped tree')
        check(all(footprint.distance(prop) >= .3 - TOL for _, prop in footprints), label + ': trunk overlaps furniture')
    seed_summaries.append({'seed': case['seed'], 'props': len(footprints), 'renderedParts': len(case['parts']),
                          'mappedTrees': case['mappedTrees'], 'suppressedMappedTrees': case['suppressedMappedTrees'],
                          'gardenTrees': len(case['gardenTrees'])})

for index, mark in enumerate(data['marks']):
    check(road_tolerance.covers(rectangle(mark)), f"Street marking {index} on road {mark['roadId']} leaves the baked road union")

for fixture in data['fixtures']:
    surface = unary_union([LineString(road['p']).buffer(road['w'] / 2, cap_style=2) for road in fixture['roads']])
    for mark in fixture['marks']:
        shape = rectangle(mark)
        check(surface.buffer(TOL).covers(shape), fixture['name'] + ': marking leaves road')
        if fixture['name'] == 'crossing':
            check(shape.disjoint(box(-3.65, -3.65, 3.65, 3.65)), 'Crossing fixture paints the junction interior')

for fixture in data['placementFixtures']:
    container, footprint = polygon(fixture['container']), polygon(fixture['footprint'])
    expected_fit = container.covers(footprint.buffer(fixture['margin']))
    expected_overlap = container.distance(footprint) <= fixture['margin']
    check(fixture['fits'] == expected_fit, fixture['name'] + ': containment disagrees with GEOS')
    check(fixture['overlaps'] == expected_overlap, fixture['name'] + ': overlap disagrees with GEOS')

print(json.dumps({'independentEngine': 'Shapely/GEOS', 'seeds': seed_summaries, 'roadMarkings': len(data['marks']),
                  'failureCount': failure_count, 'firstFailures': failures}, separators=(',', ':')))
sys.exit(1 if failure_count else 0)
