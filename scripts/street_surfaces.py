"""Metric street sections and crossings, compiled once from saved map geometry.

The map supplies centerlines and widths, not surveyed curb elevations. These
sections are an explicitly authored reconstruction: 150 mm curb reveal, 180 mm
cap, and 1.8–2.5 m walks. Service ways deliberately receive no sidewalk ribbon.
All surfaces have one owner. Ramps replace flat sidewalk, never cover it.
"""
from __future__ import annotations
from collections import Counter
import math

from shapely import make_valid, set_precision, prepare
from shapely.affinity import rotate, translate
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points, unary_union
from shapely.strtree import STRtree

GRID = .0001
ROAD_Y = .14
WALK_Y = .29
CAP_WIDTH = .18


def parts(g, kind='Polygon'):
    if g.is_empty:
        return []
    if g.geom_type == kind:
        return [g]
    if hasattr(g, 'geoms'):
        return [p for child in g.geoms for p in parts(child, kind)]
    return []


def clean(g):
    ps = [p for p in parts(make_valid(g)) if p.area > .00001]
    return set_precision(unary_union(ps), GRID) if ps else GeometryCollection()


def merge(gs):
    return clean(unary_union(gs)) if gs else GeometryCollection()


def encode(p):
    return {'outer': [[round(x, 4), round(z, 4)] for x, z in p.exterior.coords],
            'holes': [[[round(x, 4), round(z, 4)] for x, z in h.coords] for h in p.interiors]}


def sidewalk_width(road):
    kind = road.get('kind', '')
    if kind == 'service' or kind.endswith('_link'):
        return 0.
    return {'primary': 2.4, 'secondary': 2.2, 'tertiary': 2.,
            'residential': 1.8, 'unclassified': 1.8}.get(kind, 0.)


def unit_at(line, at):
    a, b = line.interpolate(max(0, at-.1)), line.interpolate(min(line.length, at+.1))
    dx, dz = b.x-a.x, b.y-a.y
    length = math.hypot(dx, dz)
    return (dx/length, dz/length) if length else (1., 0.)


def junctions(data):
    route = LineString(data['route'])
    candidates = []
    for r in data['roads']:
        if 'Reno' in r['name'] or not sidewalk_width(r) or len(r['p']) < 2:
            continue
        line = LineString(r['p'])
        # Saved street ways sometimes stop at the near lane of divided Reno.
        # An extension of one roadway half-width reaches its authored center.
        points = parts(line.intersection(route), 'Point')
        if not points and line.distance(route) < 12:
            for at in [0., line.length]:
                p = line.interpolate(at)
                q = nearest_points(p, route)[1]
                ux, uz = unit_at(line, at)
                tx, tz = unit_at(route, route.project(q))
                if p.distance(q) <= 12 and abs(ux*tx+uz*tz) < .45:
                    points.append(q)
        for p in points:
            at = route.project(p)
            if at < 25 or at > route.length-25:
                continue
            tx, tz = unit_at(route, at)
            ux, uz = unit_at(line, line.project(p))
            if abs(ux*tx+uz*tz) > .65:
                continue
            candidates.append({'id': str(r['id']), 'name': r['name'], 'at': at,
                               'center': [p.x, p.y], 'tangent': [tx, tz], 'width': float(r['w'])})
    selected = []
    for item in sorted(candidates, key=lambda q: (q['at'], -q['width'], q['id'])):
        same = next((j for j in selected if abs(j['at']-item['at']) < 24), None)
        if same:
            same['width'] = max(same['width'], item['width'])
        else:
            selected.append(item)
    for j in selected:
        j['at'] = round(j['at'], 4)
        j['center'] = [round(v, 4) for v in j['center']]
        j['tangent'] = [round(v, 8) for v in j['tangent']]
        j['crosswalks'] = []
        for side in [-1, 1]:
            at = j['at'] + side*(j['width']/2+3.3)
            p = route.interpolate(at)
            tx, tz = unit_at(route, at)
            j['crosswalks'].append({'side': side, 'at': round(at, 4),
                'center': [round(p.x, 4), round(p.y, 4)], 'tangent': [round(tx, 8), round(tz, 8)],
                'width': 2.8, 'span': 20.4})
    return selected


def road_boundary_segments(road):
    edges = []
    for p in parts(road):
        p = orient(p, sign=1)
        for ring in [p.exterior, *p.interiors]:
            for a, b in zip(ring.coords, list(ring.coords)[1:]):
                edge = LineString([a, b])
                if edge.length > .02:
                    edges.append(edge)
    return edges


def compile_sidewalks(data, road, blocked, water, clip):
    ribbons = []
    for r in data['roads']:
        width = sidewalk_width(r)
        if not width or 'Reno Avenue' in r['name'] or len(r['p']) < 2:
            continue
        ribbons.append(LineString(r['p']).buffer(r['w']/2+width, cap_style='flat', join_style='mitre', mitre_limit=2))
    ribbons.append(LineString(data['route']).buffer(13., cap_style='flat', join_style='mitre', mitre_limit=2))
    reserved = merge([road.buffer(.001, join_style='mitre'), blocked.buffer(.02, join_style='mitre'), water])
    walk = clean(merge(ribbons).difference(reserved).intersection(clip).simplify(.0005, preserve_topology=True))
    crossings = junctions(data)
    boundary = road_boundary_segments(road)
    tree = STRtree(boundary)
    proposed = []
    for j in crossings:
        for crossing in j['crosswalks']:
            x, z = crossing['center']; tx, tz = crossing['tangent']
            for side in [-1, 1]:
                proposed.append((f"reno-{j['id']}-{crossing['side']}-{side}", 'Reno crosswalk',
                                 Point(x-tz*side*10.5, z+tx*side*10.5)))
    for path in sorted(data.get('paths', []), key=lambda p: str(p['id'])):
        line = LineString(path['p'])
        for i, p in enumerate(parts(line.intersection(road.boundary), 'Point')):
            proposed.append((f"path-{path['id']}-{i}", 'Mapped footway connection', p))
    ramps, faces, footprints = [], [], []
    for id_, source, desired in proposed:
        edge = boundary[int(tree.nearest(desired))]
        toe = nearest_points(edge, desired)[0]
        if toe.distance(desired) > .12:
            continue
        a, b = edge.coords[0], edge.coords[-1]
        tx, tz = (b[0]-a[0])/edge.length, (b[1]-a[1])/edge.length
        nx, nz = tz, -tx
        if road.covers(Point(toe.x+nx*.05, toe.y+nz*.05)):
            nx, nz = -nx, -nz
        # A 1.8m clear ramp with 1.5m flares. No stair-height discontinuity
        # remains at the toe; the 2mm clearance only avoids an edge coincidence.
        width, flare, depth = 1.8, 1.5, 1.8
        half = width/2+flare
        def xy(u, v): return [toe.x+tx*u+nx*(v+.003), toe.y+tz*u+nz*(v+.003)]
        footprint = Polygon([xy(-half, 0), xy(half, 0), xy(half, depth), xy(-half, depth)])
        if not walk.buffer(.0002).covers(footprint) or any(footprint.distance(p) < .08 for p in footprints):
            continue
        heights = [WALK_Y, ROAD_Y+.002, ROAD_Y+.002, WALK_Y, WALK_Y, WALK_Y, WALK_Y, WALK_Y]
        points = [xy(-half, 0), xy(-width/2, 0), xy(width/2, 0), xy(half, 0),
                  xy(-half, depth), xy(-width/2, depth), xy(width/2, depth), xy(half, depth)]
        vertices = [[round(x, 4), y, round(z, 4)] for (x, z), y in zip(points, heights)]
        # All triangles are oriented by the baker using their actual normals.
        triangles = [[0, 1, 4], [1, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6]]
        ramps.append({'id': id_, 'source': source, 'footprint': encode(footprint),
                      'vertices': vertices, 'triangles': triangles, 'material': 'ground.sidewalk', 'uvScale': 18})
        for ia, ib in [(0, 1), (2, 3)]:
            pa, pb = vertices[ia], vertices[ib]
            faces.append({'vertices': [pa, pb, [pb[0], ROAD_Y, pb[2]], [pa[0], ROAD_Y, pa[2]]],
                          'triangles': [[0, 1, 2], [0, 2, 3]], 'normal': [-nx, 0., -nz],
                          'material': 'ground.curb', 'uvScale': 4})
        footprints.append(footprint)
    ramp_union = merge(footprints)
    flat = clean(walk.difference(ramp_union.buffer(.001, join_style='mitre')))
    cap = clean(flat.intersection(road.buffer(CAP_WIDTH, join_style='mitre', mitre_limit=2)))
    sidewalk = clean(flat.difference(cap.buffer(.001, join_style='mitre')))
    return {'walk': walk, 'curb': cap, 'sidewalk': sidewalk, 'rampMask': ramp_union,
            'ramps': ramps, 'rampFaces': faces, 'crossings': crossings,
            'stats': {'curbRevealMeters': WALK_Y-ROAD_Y, 'curbCapWidthMeters': CAP_WIDTH,
                      'sidewalkWidthsMeters': {'primary': 2.4, 'secondary': 2.2, 'tertiary': 2., 'residential': 1.8, 'Reno': 2.5},
                      'serviceAndLinkSidewalks': 0, 'raisedWalkAreaM2': round(walk.area, 3),
                      'ramps': len(ramps), 'rampSources': dict(Counter(r['source'] for r in ramps)),
                      'rampAreaM2': round(ramp_union.area, 3), 'RenoJunctions': len(crossings)}}


def compile_edges(street, geometries, elevations, blocked):
    edges = []
    ramp_mask = street['rampMask'].buffer(.004, join_style='mitre')
    building_buffer = blocked.buffer(.025)
    prepare(building_buffer)
    for g in geometries.values():
        prepare(g)
    for component in parts(street['walk']):
        component = orient(component, sign=1)
        for ring in [component.exterior, *component.interiors]:
            coords = list(ring.coords)
            for a, b in zip(coords, coords[1:]):
                original = LineString([a, b]); length = original.length
                if length < .04:
                    continue
                nx, nz = (b[1]-a[1])/length, -(b[0]-a[0])/length
                for segment in parts(original.difference(ramp_mask), 'LineString'):
                    if segment.length < .04:
                        continue
                    aa, bb = segment.coords[0], segment.coords[-1]
                    mid = segment.interpolate(.5, normalized=True)
                    outside = Point(mid.x+nx*.025, mid.y+nz*.025)
                    if building_buffer.covers(outside):
                        continue
                    kind = next((k for k in ['road', 'path', 'parking', 'paving', 'grass', 'water'] if geometries[k].covers(outside)), 'terrain')
                    bottom = elevations.get(kind, -.055)
                    edges.append({'a': [round(v, 4) for v in aa], 'b': [round(v, 4) for v in bb],
                                  'bottom': bottom, 'top': WALK_Y,
                                  'normal': [round(nx, 8), 0., round(nz, 8)],
                                  'kind': 'curb' if kind == 'road' else 'walk-edge'})
    return edges


def paint_rectangle(x, z, length, width, rotation):
    return translate(rotate(box(-length/2, -width/2, length/2, width/2), -rotation,
                            origin=(0, 0), use_radians=True), x, z)


def compile_street_paint(data, street, geometries, blocked):
    road = geometries['road']; prepare(road)
    parking = geometries['parking']; prepare(parking)
    route = LineString(data['route'])
    marks, cells = [], {}
    def add(kind, color, x, z, length, width, rotation=0):
        record = {'kind': kind, 'color': color, 'x': round(x, 4), 'z': round(z, 4),
                  'length': round(length, 4), 'width': round(width, 4), 'rotation': round(rotation, 9)}
        footprint = paint_rectangle(record['x'], record['z'], length, width, record['rotation'])
        surface = road if kind == 'road' else parking
        if not surface.covers(footprint) or footprint.intersects(blocked):
            return
        x0, z0, x1, z1 = footprint.bounds
        keys = [(ix, iz) for ix in range(math.floor(x0/16), math.floor(x1/16)+1)
                for iz in range(math.floor(z0/16), math.floor(z1/16)+1)]
        previous = {id_: p for k in keys for id_, p in cells.get(k, [])}
        if any(footprint.intersection(p).area > .00001 for p in previous.values()):
            return
        id_ = len(marks); marks.append(record)
        for k in keys: cells.setdefault(k, []).append((id_, footprint))
    # Crossing bars and approach stop lines get priority over longitudinal paint.
    for junction in street['crossings']:
        for crossing in junction['crosswalks']:
            x, z = crossing['center']; tx, tz = crossing['tangent']
            angle = -math.atan2(tz, tx)
            for i in range(-8, 9):
                offset = i*1.2
                add('road', 'white', x-tz*offset, z+tx*offset, crossing['width'], .5, angle)
            side = crossing['side']
            stop = route.interpolate(crossing['at']+side*2.5)
            offset = -side*5.25
            add('road', 'white', stop.x-tz*offset, stop.y+tx*offset, .4, 8.6, angle)
    for at in range(3, int(route.length)-3, 4):
        if any(abs(at-j['at']) < j['width']/2+9 for j in street['crossings']):
            continue
        p = route.interpolate(at); tx, tz = unit_at(route, at); angle = -math.atan2(tz, tx)
        for offset in [-.18, .18]:
            add('road', 'yellow', p.x-tz*offset, p.y+tx*offset, 3.98, .10, angle)
        for offset in [-8.9, 8.9]:
            add('road', 'white', p.x-tz*offset, p.y+tx*offset, 3.98, .11, angle)
    for at in range(7, int(route.length)-5, 10):
        if any(abs(at-j['at']) < j['width']/2+9 for j in street['crossings']):
            continue
        p = route.interpolate(at); tx, tz = unit_at(route, at); angle = -math.atan2(tz, tx)
        for offset in [-5.25, 5.25]:
            add('road', 'white', p.x-tz*offset, p.y+tx*offset, 3.2, .13, angle)
    for lot in sorted(parts(parking), key=lambda p: (*p.bounds[:2], -p.area)):
        xmin, zmin, xmax, zmax = lot.bounds
        if xmax-xmin < 15 or zmax-zmin < 15:
            continue
        count = 0; x = xmin+4
        while x < xmax-3 and count < 80:
            z = zmin+4
            while z < zmax-8 and count < 80:
                before = len(marks)
                add('parking', 'white', x, z+2.5, .08, 5)
                count += len(marks)-before
                z += 16
            x += 2.8
    return marks
