"""Metric supporting-building facade layout, independent of the mesh baker.

These are architectural reconstructions on the mapped envelope, not surveyed
window locations. A frontage must face an unobstructed public street. Whole
bays and complete storeys survive GIS edge splits; narrow returns stay solid.
"""
import math

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, unary_union
from shapely.strtree import STRtree


def length(wall):
    return math.dist(wall['a'], wall['b'])


def joined_walls(walls):
    """Remove collinear GIS vertices without joining around an actual corner."""
    result = []

    def aligned(a, b):
        if math.dist(a['b'], b['a']) > .00025:
            return False
        if abs(a['base'] - b['base']) > .0001 or abs(a['top'] - b['top']) > .0001:
            return False
        al, bl = length(a), length(b)
        dot = sum((a['b'][k]-a['a'][k])*(b['b'][k]-b['a'][k]) for k in range(2))
        return al > .001 and bl > .001 and dot / (al*bl) > .99999999

    for wall in walls:
        if result and aligned(result[-1], wall):
            result[-1]['b'] = wall['b']
        else:
            result.append(dict(wall))
    if len(result) > 1 and aligned(result[-1], result[0]):
        last = result.pop()
        result[0] = {**last, 'b': result[0]['b']}
    return result


def facade_layout(width, height, retail=False):
    """Fit complete bays; never stretch a tiny remnant into a window."""
    pitch = 3.6 if retail else 3.8
    count = max(0, min(28, int((width-1.6) / pitch)))
    # A very long industrial wall uses larger structural bays, not hundreds
    # of tiny shops. Both the cap and complete-row rule bound geometry cost.
    if count:
        pitch = min(6., (width-1.6)/count) if count == 28 else pitch
    corner = (width-count*pitch)/2
    floors = 1 if height >= 3.25 else 0
    if height >= 6.9:
        floors += min(2, int((height-.65-3.1)/3.5))
    return {'width': round(width, 4), 'bayPitch': round(pitch, 4),
            'bayCount': count, 'corner': round(corner, 4), 'floors': floors}


def add_band(wall, kind, start, end, bottom, top, projection, material):
    """Trim owns only solid wall area. Never bridge an actual door/window."""
    if end-start < .15 or top-bottom < .025:
        return
    intervals = [(start, end)]
    for opening in wall['openings']:
        if opening['top'] <= bottom or opening['bottom'] >= top:
            continue
        remaining = []
        for a, b in intervals:
            if opening['end'] <= a or opening['start'] >= b:
                remaining.append((a, b))
            else:
                if opening['start'] > a:
                    remaining.append((a, opening['start']))
                if opening['end'] < b:
                    remaining.append((opening['end'], b))
        intervals = remaining
    for a, b in intervals:
        if b-a > .15:
            wall.setdefault('detailBands', []).append({
                'kind': kind, 'start': round(a, 4), 'end': round(b, 4),
                'bottom': round(bottom, 4), 'top': round(top, 4),
                'projection': projection, 'material': material,
            })


def articulate_facades(shells, data):
    road_records = [r for r in data['roads'] if len(r['p']) > 1 and r['kind'] != 'service']
    roads = [LineString(r['p']) for r in road_records]
    road_tree = STRtree(roads)
    source_polys = []
    for building in data['buildings']:
        plan = Polygon(building['p']).buffer(0)
        if building.get('massingMasks'):
            masks = unary_union([Polygon(p['outer'], p.get('holes', [])) for p in building['massingMasks']])
            plan = plan.difference(masks)
        source_polys.append(plan)
    source_tree = STRtree(source_polys)
    statistics = {'joinedCoplanarSegments': 0, 'detailedStreetFrontages': 0,
                  'wholeWindowBays': 0, 'upperFloorOpenings': 0,
                  'clerestoryOpenings': 0, 'facadeDetailBands': 0,
                  'entryCanopies': 0, 'layoutBuildings': 0}
    for shell in shells:
        if shell['stage'] or shell['kind'] not in ('lowrise', 'retail', 'masonry', 'parking'):
            continue
        before = len(shell['walls'])
        shell['walls'] = joined_walls(shell['walls'])
        statistics['joinedCoplanarSegments'] += before-len(shell['walls'])
        candidates = []
        for wall in shell['walls']:
            wall['openings'] = []
            size = length(wall)
            if size < 5.2 or wall['base'] > .001 or wall['top'] < 3.25:
                continue
            a, b = wall['a'], wall['b']
            nx, nz = (b[1]-a[1])/size, -(b[0]-a[0])/size
            mid = Point((a[0]+b[0])/2, (a[1]+b[1])/2)
            options = []
            for road_id in road_tree.query(mid.buffer(85)):
                road_id = int(road_id)
                target = nearest_points(mid, roads[road_id])[1]
                vx, vz = target.x-mid.x, target.y-mid.y
                distance = math.hypot(vx, vz)
                facing = (nx*vx+nz*vz)/max(.001, distance)
                if distance > 85 or facing < .48:
                    continue
                # Do not furnish a party wall merely because a road exists
                # on the far side of another building.
                ray = LineString([(mid.x+nx*.15, mid.y+nz*.15), (target.x, target.y)])
                blocked = any(int(j) != shell['sourceIndex'] and
                              ray.intersection(source_polys[int(j)]).length > .25
                              for j in source_tree.query(ray))
                if blocked:
                    continue
                clearance = distance-road_records[road_id]['w']/2
                options.append((distance/max(.48, facing), clearance))
            if not options:
                continue
            score, clearance = min(options)
            wall['streetFacing'] = True
            wall['streetClearance'] = round(clearance, 4)
            candidates.append((score, wall, size))
        if not candidates:
            continue
        candidates.sort(key=lambda item: item[0])
        primary = candidates[0][1]
        retail = shell['kind'] == 'retail'
        support = shell['kind'] in ('lowrise', 'retail')
        source_plan = source_polys[shell['sourceIndex']]
        center = source_plan.centroid
        if center.is_empty:
            continue
        # Actual metric windows all along close street elevations; distant
        # context retains one facade so the saved map does not become a draw
        # budget for thousands of unresolvable storefronts.
        close = math.hypot(center.x, center.y) < 1100
        frontages = candidates if support and close else candidates[:2 if retail else 1]
        statistics['layoutBuildings'] += 1
        for _, wall, size in frontages:
            plan = facade_layout(size, wall['top'], retail)
            if not plan['bayCount'] or not plan['floors']:
                continue
            wall['facadeLayout'] = plan
            statistics['detailedStreetFrontages'] += 1
            count, pitch, corner = plan['bayCount'], plan['bayPitch'], plan['corner']
            centers = [corner+(bay+.5)*pitch for bay in range(count)]
            entry_bay = min(range(count), key=lambda bay: abs(centers[bay]-size/2)) if wall is primary else -1
            plan['entryBay'] = entry_bay
            for row in range(plan['floors'] if support and close else 1):
                for bay, at in enumerate(centers):
                    if row == 0 and bay == entry_bay:
                        width = 1.4 if retail else 1.2
                        wall['openings'].append({'kind': 'door', 'start': round(at-width/2, 4),
                            'end': round(at+width/2, 4), 'bottom': .30, 'top': 2.65, 'depth': .32})
                        continue
                    if shell['kind'] == 'parking':
                        continue
                    width = min(pitch*.67, 2.45 if retail else 2.05)
                    floor = row*3.5
                    bottom = floor+(.55 if retail and row == 0 else 1.0)
                    top = floor+(2.85 if retail and row == 0 else 2.72)
                    if top > wall['top']-.6:
                        continue
                    wall['openings'].append({'kind': 'window', 'start': round(at-width/2, 4),
                        'end': round(at+width/2, 4), 'bottom': round(bottom, 4), 'top': round(top, 4),
                        'depth': .22 if row else .26, 'framing': 'simple' if row or not close else 'full'})
                    statistics['wholeWindowBays'] += 1
                    statistics['upperFloorOpenings'] += bool(row)
            # A tall, single-storey estimated commercial envelope receives a
            # modest clerestory instead of inventing a full second floor.
            if support and close and plan['floors'] == 1 and wall['top'] >= 5.25:
                for at in centers:
                    width = min(1.8, pitch*.56)
                    wall['openings'].append({'kind': 'clerestory', 'start': round(at-width/2, 4),
                        'end': round(at+width/2, 4), 'bottom': 3.7, 'top': min(4.65, wall['top']-.7),
                        'depth': .20, 'framing': 'simple'})
                    statistics['clerestoryOpenings'] += 1
            if support and close:
                add_band(wall, 'plinth', .08, size-.08, .30, .62, .055, 'detail.concrete')
                add_band(wall, 'fascia', .12, size-.12, 2.98, 3.19, .085, 'detail.concrete')
                if plan['floors'] > 1:
                    add_band(wall, 'belt', .12, size-.12, 3.42, 3.54, .075, 'detail.concrete')
                # Structural piers end below the continuous fascia, so no
                # same-depth box faces cross each other.
                for bay in range(1, count):
                    at = corner+bay*pitch
                    add_band(wall, 'pilaster', at-.085, at+.085, .65, 2.95, .055, 'detail.concrete')
                if wall is primary and entry_bay >= 0:
                    projection = min(.85, wall['streetClearance']-.4)
                    if projection >= .45:
                        at = centers[entry_bay]
                        add_band(wall, 'canopy', max(.25, at-1.45), min(size-.25, at+1.45),
                                 2.85, 2.95, round(projection, 4), 'detail.darkSteel')
                        statistics['entryCanopies'] += 1
            statistics['facadeDetailBands'] += len(wall.get('detailBands', []))
    return statistics
