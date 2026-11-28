"""Cell-local constrained triangles for the surfaces that receive street paint.

Earcut can connect nearly collinear road-edge vertices across an entire city
chunk. The resulting needles are geometrically valid but produced unstable
logarithmic fragment depth in the saved production-shader regression. GEOS
constrained Delaunay changes only internal edges, retaining every footprint
boundary and hole. Clip first so later mesh-cell cuts cannot recreate needles.
"""
from collections import defaultdict
import math

from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

GROUND_MESH_CELL = 1024
PAINTED_KINDS = frozenset(('road', 'parking'))


def polygon_parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [part for child in getattr(geometry, 'geoms', []) for part in polygon_parts(child)]


def triangle_metrics(points):
    a, b, c = points
    twice_area = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    longest = max(math.dist(a, b), math.dist(b, c), math.dist(c, a))
    return longest, longest * longest / twice_area if twice_area else math.inf


def compile_ground_triangulation(layers, cell_size=GROUND_MESH_CELL):
    if not math.isfinite(cell_size) or cell_size <= 0:
        raise ValueError('Ground mesh cell size must be positive and finite')
    chunks = []
    stats = {'method': 'GEOS constrained Delaunay after mesh-cell clipping',
             'cellSize': cell_size, 'layers': {}, 'triangles': 0, 'chunks': 0,
             'footprintDifferenceM2': 0., 'duplicateTriangleAreaM2': 0.}
    for layer in layers:
        kind = layer['kind']
        if kind not in PAINTED_KINDS:
            continue
        cells = defaultdict(list)
        source_area = 0.
        for encoded in layer['polygons']:
            source = Polygon(encoded['outer'], encoded.get('holes', []))
            if not source.is_valid or source.is_empty or source.area <= 0:
                raise ValueError(f'Invalid {kind} source footprint')
            source_area += source.area
            min_x, min_z, max_x, max_z = source.bounds
            for ix in range(math.floor(min_x / cell_size), math.ceil(max_x / cell_size)):
                for iz in range(math.floor(min_z / cell_size), math.ceil(max_z / cell_size)):
                    clipped = source.intersection(box(ix * cell_size, iz * cell_size,
                                                      (ix + 1) * cell_size, (iz + 1) * cell_size))
                    cells[ix, iz].extend(polygon_parts(clipped))
        layer_stats = {'sourceAreaM2': source_area, 'triangles': 0, 'chunks': 0,
                       'maxEdgeM': 0., 'longNeedlesOver32mAspect256': 0}
        clipped_area = 0.
        for (ix, iz), pieces in sorted(cells.items()):
            owner = unary_union(pieces)
            if owner.is_empty:
                continue
            if not owner.is_valid:
                raise ValueError(f'Invalid clipped {kind} footprint at {ix},{iz}')
            faces = sorted(constrained_delaunay_triangles(owner).geoms,
                           key=lambda face: (*face.bounds, face.area))
            triangles = []
            for face in faces:
                points = list(face.exterior.coords)[:-1]
                if len(points) != 3 or face.area <= 0 or not all(math.isfinite(v) for p in points for v in p):
                    raise ValueError(f'Invalid constrained {kind} triangle at {ix},{iz}')
                # x/z clockwise gives an upward normal when y is constant.
                a, b, c = points
                if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0:
                    points = [a, c, b]
                longest, aspect = triangle_metrics(points)
                layer_stats['maxEdgeM'] = max(layer_stats['maxEdgeM'], longest)
                layer_stats['longNeedlesOver32mAspect256'] += longest > 32 and aspect > 256
                # Retain full double precision until the existing local-chunk
                # Float32 packer. No rounding, simplification or hole removal.
                triangles.append([v for point in points for v in point])
            covered = unary_union(faces)
            difference = owner.symmetric_difference(covered).area
            duplicate = max(0., sum(face.area for face in faces) - covered.area)
            tolerance = max(1e-7, owner.area * 1e-12)
            if difference > tolerance or duplicate > tolerance:
                raise ValueError(f'{kind} triangulation changes ownership at {ix},{iz}: '
                                 f'difference={difference}, duplicate={duplicate}')
            stats['footprintDifferenceM2'] += difference
            stats['duplicateTriangleAreaM2'] += duplicate
            clipped_area += owner.area
            layer_stats['triangles'] += len(triangles)
            layer_stats['chunks'] += 1
            chunks.append({'kind': kind, 'cell': [ix, iz], 'triangles': triangles})
        if abs(clipped_area - source_area) > max(1e-6, source_area * 1e-12):
            raise ValueError(f'Mesh-cell partition changes {kind} area')
        stats['layers'][kind] = layer_stats
        stats['triangles'] += layer_stats['triangles']
        stats['chunks'] += layer_stats['chunks']
    return {'version': 1, 'cellSize': cell_size, 'chunks': chunks}, stats
