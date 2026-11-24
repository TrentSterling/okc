"""Compile the visible height envelope of the mapped building prisms.

GIS footprints describe parent buildings and overlapping parts. They are not
independent drawable boxes. This offline pass assigns each exposed roof once,
clips every wall against all neighboring volumes, and makes actual facade
openings before the renderer sees a triangle.
"""
from collections import defaultdict
import json
import math

from shapely import make_valid, set_precision
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points, unary_union
from shapely.strtree import STRtree
from city_facades import articulate_facades
from city_roof_details import add_roof_wells

GRID = .0001
EPS = .00001


def parts(g, kind='Polygon'):
    if g.is_empty:
        return []
    if g.geom_type == kind:
        return [g]
    if hasattr(g, 'geoms'):
        return [p for c in g.geoms for p in parts(c, kind)]
    return []


def clean(g):
    ps = [p for p in parts(make_valid(g)) if p.area > .0001]
    return set_precision(unary_union(ps), GRID) if ps else GeometryCollection()


def union(gs):
    return clean(unary_union(gs)) if gs else GeometryCollection()


def encode(g):
    def ring(r):
        return [[round(float(x), 4), round(float(z), 4)] for x, z in r.coords]
    return [{'outer': ring(p.exterior), 'holes': [ring(h) for h in p.interiors]}
            for p in sorted(parts(g), key=lambda p: (*p.bounds[:2], -p.area))]


def compile_buildings(data, custom_path):
    custom = json.loads(custom_path.read_text())['volumes'] if custom_path.exists() else []
    reserved = []
    for v in custom:
        p = clean(Polygon(v['polygon']['outer'], v['polygon'].get('holes', [])))
        reserved.append({'id': v['id'], 'name': v['name'], 'height': v['height'], 'bottom':v.get('bottom',0), 'p': p})
    for f in data['features']:
        if f['name'] in ['Paycom Center', 'Crystal Bridge Tropical Conservatory']:
            reserved.append({'id': f['name'], 'name': f['name'],
                             'height': 33 if f['name'] == 'Paycom Center' else 21.5,'bottom':0,
                             'p': clean(Polygon(f['p']))})
    reserved_union = union([v['p'] for v in reserved])
    volumes, originals, excluded, massing_excluded = [], [], [], []
    for index, b in enumerate(data['buildings']):
        original = clean(Polygon(b['p']))
        originals.append(original)
        if b['kind'] == 'carousel' or b['id'] == 257271:
            continue
        # Custom meshes own their entire building footprint. A guessed GIS
        # shell must never be drawn through the landmark it duplicates.
        p = clean(original.difference(reserved_union))
        removed = max(0., original.area - p.area)
        if removed > .001:
            excluded.append({'id': b['id'], 'removedArea': round(removed, 4)})
        if b.get('massingMasks'):
            mask = union([Polygon(q['outer'], q.get('holes', [])) for q in b['massingMasks']])
            masked = clean(p.difference(mask))
            removed = max(0., p.area-masked.area)
            if removed > .001:
                massing_excluded.append({'id': b['id'], 'removedArea': round(removed, 4)})
            p = masked
        if p.is_empty:
            continue
        height = 3.6 if b['id'] == 433827 else b['h']
        levels = [(p, height, 0)]
        if b['kind'] == 'deco' and height > 100:
            base = height - 21
            levels = [(p, base, 0)]
            c = original.centroid
            coords = list(original.exterior.coords) if original.geom_type == 'Polygon' else b['p']
            for stage, (scale, rise) in enumerate([(.91, 6), (.77, 5), (.62, 4), (.44, 3)], 1):
                base += rise
                stepped = clean(Polygon([(c.x + (x-c.x)*scale, c.y + (z-c.y)*scale) for x,z in coords]))
                levels.append((clean(stepped.intersection(p)), base, stage))
        for plan, h, stage in levels:
            if plan.is_empty:
                continue
            volumes.append({'id': b['id'], 'key': f"{b['id']}:{stage}", 'sourceIndex': index,
                            'kind': b['kind'], 'height': float(h), 'stage': stage,
                            'name': b['name'], 'heightSource': b['heightSource'], 'p': plan})

    source_tree = STRtree(originals)
    raw_overlaps = []
    for i, p in enumerate(originals):
        for j0 in source_tree.query(p):
            j = int(j0)
            if j <= i:
                continue
            area = p.intersection(originals[j]).area
            if area > .001:
                raw_overlaps.append({'a': data['buildings'][i]['id'], 'b': data['buildings'][j]['id'],
                                     'area': round(area, 4)})

    polys = [v['p'] for v in volumes]
    tree = STRtree(polys)
    reserved_tree = STRtree([v['p'] for v in reserved])
    raw_wall_area = exposed_wall_area = hidden_roof_area = 0.
    shells = []
    removed_sources = set()
    for i, v in enumerate(volumes):
        p, h = v['p'], v['height']
        neighbors = [int(j) for j in tree.query(p.buffer(.001)) if int(j) != i]
        # Equal-height priority is deterministic. Partial overlaps also get a
        # single roof owner; containment is not required.
        blockers = [polys[j] for j in neighbors if volumes[j]['height'] > h + EPS or
                    (abs(volumes[j]['height']-h) <= EPS and j < i)]
        roof_mask=union(blockers)
        if not roof_mask.is_empty:
            roof_mask=roof_mask.buffer(.001,join_style='mitre')
        roof = clean(p.difference(roof_mask).simplify(.0005, preserve_topology=True))
        hidden_roof_area += p.area - roof.area
        wall_neighbors = [(polys[j].buffer(.00025, join_style='mitre'), volumes[j]['height'])
                          for j in neighbors]
        wall_neighbors += [(reserved[int(j)]['p'].buffer(.00025, join_style='mitre'), reserved[int(j)]['height'])
                           for j in reserved_tree.query(p.buffer(.001))]
        walls = []
        for component in parts(p):
            component = orient(component, sign=1)
            for ring in [component.exterior, *component.interiors]:
                coords = list(ring.coords); distance = 0.
                for a, b in zip(coords, coords[1:]):
                    edge = LineString([a, b]); length = edge.length
                    if length < .002:
                        continue
                    raw_wall_area += length * h
                    intervals = []
                    for blocker, bh in wall_neighbors:
                        for segment in parts(edge.intersection(blocker), 'LineString'):
                            start, end = sorted(edge.project(Point(q))/length for q in [segment.coords[0], segment.coords[-1]])
                            if end - start > 1e-9:
                                intervals.append((start, end, min(h, bh)))
                    knots = sorted(set([0., 1.] + [x for s,e,_ in intervals for x in (s,e)]))
                    for start, end in zip(knots, knots[1:]):
                        span = (end-start)*length
                        if span < .002:
                            continue
                        mid = (start+end)/2
                        bottom = max([bh for s,e,bh in intervals if s-EPS <= mid <= e+EPS] or [0.])
                        if bottom >= h - .001:
                            continue
                        aa = [round(a[k]+(b[k]-a[k])*start, 4) for k in range(2)]
                        bb = [round(a[k]+(b[k]-a[k])*end, 4) for k in range(2)]
                        walls.append({'a': aa, 'b': bb, 'base': round(bottom, 4), 'top': round(h, 4),
                                      'u': round(distance+start*length, 4), 'openings': []})
                        exposed_wall_area += span * (h-bottom)
                    distance += length
        if roof.is_empty and not walls:
            removed_sources.add(v['id'])
        shells.append({k:value for k,value in v.items() if k != 'p'} |
                      {'footprint': encode(p), 'roofs': encode(roof), 'walls': walls, 'rooftop': []})

    # Resolve metric whole-bay street facades after clipping the mapped
    # height envelope. Recessed roof wells preserve its outer height/plan.
    facade_stats = articulate_facades(shells, data)
    roof_detail_stats = add_roof_wells(shells)
    opening_count = sum(len(w['openings']) for s in shells for w in s['walls'])
    entrance_count = sum(o['kind'] == 'door' for s in shells for w in s['walls'] for o in w['openings'])

    # Place plant only where the *exposed* roof can contain it. A parent podium
    # center can be inside its child tower and must not grow another roof box.
    for shell in shells:
        if shell['stage'] or shell['height']<4.5:
            continue
        assembly = shell.get('roofAssembly')
        roof=union([Polygon(p['outer'],p['holes']) for p in (assembly['deck'] if assembly else shell['roofs'])])
        if roof.area<120:
            continue
        safe=roof.buffer(-1.4,join_style='mitre')
        if safe.is_empty:
            continue
        c=safe.representative_point()
        width=3.4 if shell['height']<22 else 6.
        for _ in range(4):
            plan=box(c.x-width/2,c.y-width*.36,c.x+width/2,c.y+width*.36)
            if safe.covers(plan):
                shell['rooftop'].append({'x':round(c.x,4),'z':round(c.y,4),'y':assembly['deckY'] if assembly else shell['height'],
                                         'w':round(width,4),'d':round(width*.72,4),'h':1.1 if shell['height']<22 else 1.7})
                break
            width*=.7

    # Independent intersection checks on the exported ownership data, before
    # any triangulation or Float32 conversion occurs.
    roof_overlap_after=0.;hidden_roof_after=0.;hidden_wall_after=0.
    roof_geoms=[union([Polygon(p['outer'],p['holes']) for p in s['roofs']]) for s in shells]
    roof_tree=STRtree(roof_geoms)
    for i,(s,r) in enumerate(zip(shells,roof_geoms)):
        for j0 in roof_tree.query(r):
            j=int(j0)
            if j>i and abs(s['height']-shells[j]['height'])<EPS:
                roof_overlap_after+=r.intersection(roof_geoms[j]).area
        for j0 in tree.query(r):
            j=int(j0)
            if volumes[j]['height']>s['height']+EPS:
                hidden_roof_after+=r.intersection(polys[j]).area
        for wall in s['walls']:
            edge=LineString([wall['a'],wall['b']])
            for j0 in tree.query(edge):
                j=int(j0)
                if j==i or volumes[j]['height']<=wall['base']+EPS:
                    continue
                # A shared endpoint has zero length; a neighboring volume's
                # interior or coincident party wall has measurable coverage.
                shared=edge.intersection(polys[j]).length
                hidden_wall_after+=shared*max(0,min(wall['top'],volumes[j]['height'])-wall['base'])
    assert roof_overlap_after<.002, f'Duplicate exposed roofs: {roof_overlap_after}'
    assert hidden_roof_after<.002, f'Roofs inside taller neighbors: {hidden_roof_after}'
    assert hidden_wall_after<.02, f'Walls inside neighboring volumes: {hidden_wall_after}'

    # Elevated connectors leave clearance for vehicles underneath them.
    solids=union(polys+[v['p'] for v in reserved if v['bottom']<4])
    collision=[{'id':f'building-solid-{i}','kind':'building','polygon':p['outer'],'holes':p['holes']}
               for i,p in enumerate(encode(solids))]
    bounds=data.get('drivingBounds')
    if not bounds:
        coords=[p for r in data['roads'] for p in r['p']]+[p for b in data['buildings'] for p in b['p']]
        bounds={'minX':min(p[0] for p in coords)-15,'maxX':max(p[0] for p in coords)+15,
                'minZ':min(p[1] for p in coords)-15,'maxZ':max(p[1] for p in coords)+15}
    stats={'sourceOverlapPairs':raw_overlaps,'sourceOverlapAreaM2':round(sum(x['area']for x in raw_overlaps),4),
           'compiledVolumes':len(shells),'exposedRoofPolygons':sum(len(s['roofs'])for s in shells),
           'exposedWallSegments':sum(len(s['walls'])for s in shells),
           'hiddenRoofAreaRemovedM2':round(hidden_roof_area,4),
           'hiddenWallAreaRemovedM2':round(raw_wall_area-exposed_wall_area,4),
           'remainingEqualHeightRoofOverlapM2':round(roof_overlap_after,8),
           'remainingRoofsInsideHigherVolumesM2':round(hidden_roof_after,8),
           'remainingWallsInsideOtherVolumesM2':round(hidden_wall_after,8),
           'customLandmarkExclusions':excluded,'customLandmarkCount':len(reserved),
           'mappedMassingExclusions':massing_excluded,
           'actualFacadeOpenings':opening_count,'recessedEntrances':entrance_count,
           'facadeArticulation':facade_stats, 'roofArticulation':roof_detail_stats,
           'collisionPolygons':len(collision),'drivingBounds':bounds}
    return {'buildingShells':shells,'drivingSolids':collision,'drivingBounds':bounds,
            'customLandmarkFootprints':[{'id':v['id'],'name':v['name'],'height':v['height'],'bottom':v['bottom'],'polygons':encode(v['p'])}for v in reserved],
            'redundantBuildingIds':sorted(removed_sources)},stats
