"""Shared precision and ownership rules for the offline metro compiler.

Roads and sidewalks are snapped before their difference is taken. Quantizing
two independently exported outlines afterward creates small overlapping wedges
at angled intersections even when their full-precision inputs were disjoint.
"""
from shapely import make_valid, set_precision
from shapely.geometry import Polygon
from shapely.ops import unary_union

GRID_METERS = .01
STREET_EDGE_GUARD_METERS = GRID_METERS * 2
DOWNTOWN_SURFACE_APRON = 50


def surface_core_bounds(core_bounds):
    """Match the preserved downtown compiler's 50 m camera apron."""
    return {key: value + (-DOWNTOWN_SURFACE_APRON if key.startswith('min') else DOWNTOWN_SURFACE_APRON)
            for key, value in core_bounds.items()}


def add_surface_render_patches(record, surface_core):
    """Retain the raw atlas polygon; bake only its exposed 3D pieces if needed."""
    polygon = Polygon(record['p'], record.get('holes', []))
    if polygon.intersection(surface_core).area <= 1e-8:
        return record
    return {**record, 'renderPatches': polygon_records(polygon.difference(surface_core))}


def polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    if hasattr(geometry, 'geoms'):
        return [polygon for part in geometry.geoms for polygon in polygons(part)]
    return []


def snapped(geometry):
    return set_precision(make_valid(geometry), GRID_METERS)


def polygon_records(geometry):
    records = []
    for polygon in polygons(snapped(geometry)):
        if polygon.area < .25:
            continue
        points = [[round(x, 2), round(z, 2)] for x, z in list(polygon.exterior.coords)[:-1]]
        holes = [[[round(x, 2), round(z, 2)] for x, z in list(ring.coords)[:-1]]
                 for ring in polygon.interiors]
        records.append({'p': points, **({'holes': holes} if holes else {})})
    return records


def partition_street_surfaces(road_layers, walkways, core):
    """Return deterministic, nonoverlapping road/walk records outside core."""
    meshes = []
    ground = None
    core = snapped(core)
    for height, items in road_layers.items():
        merged = snapped(unary_union(items))
        if height == 0:
            ground = merged
        for record in polygon_records(merged.difference(core)):
            meshes.append({'kind': 'road', 'y': round(height + .14, 2), **record})
    if walkways:
        walking = snapped(unary_union(walkways))
        if ground is not None:
            # New intersection vertices can move by one grid cell when the
            # overlay is snapped. A 2 cm curb seam keeps that rounding from
            # placing sidewalk triangles back inside the street owner.
            walking = walking.difference(ground.buffer(STREET_EDGE_GUARD_METERS, join_style=2))
        for record in polygon_records(walking.difference(core)):
            meshes.append({'kind': 'sidewalk', 'y': .15, **record})
    return meshes
