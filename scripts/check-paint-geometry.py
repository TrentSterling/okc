#!/usr/bin/env python3
"""Inspect final paint/ground buffers independently using GEOS polygon operations.

Invoked by check-paint-geometry.mjs; intermediate geometry is temporary. The
1e-4 m² inter-paint threshold matches check-street-sections and tolerates tiny
Float32 endpoint contacts. It cannot establish visibility in a depth buffer.
"""
import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree


def main():
    base = Path(sys.argv[1])
    data = json.loads((base / 'input.json').read_text())
    marks = data['marks']
    polys = [Polygon([(v[0], v[2]) for v in mark['corners']]) for mark in marks]
    ys = [sum(v[1] for v in mark['corners']) / 4 for mark in marks]
    if not marks or any(not p.is_valid or p.area <= 0 for p in polys):
        raise ValueError('Missing, invalid or degenerate production paint geometry')
    tree, pairs, paint_overlap = STRtree(polys), [], 0.
    for i, p in enumerate(polys):
        for candidate in tree.query(p):
            j = int(candidate)
            if j <= i or abs(ys[j] - ys[i]) > 1e-6:
                continue
            area = p.intersection(polys[j]).area
            if area > 1e-10:
                paint_overlap += area
                pairs.append({'a': i, 'b': j, 'areaM2': area,
                              'colors': [marks[i]['color'], marks[j]['color']],
                              'sources': [marks[i]['source'], marks[j]['source']],
                              'center': [round(p.centroid.x, 4), round(p.centroid.y, 4)]})

    points = np.fromfile(base / 'ground.f64', dtype='<f8').reshape(-1, 3)
    if not np.isfinite(points).all():
        raise ValueError('Nonfinite packed ground vertices')
    ground, kinds, records, height_ranges = [], [], [], {}
    for draw in data['draws']:
        for t in points[draw['start']:draw['start'] + draw['vertices']].reshape(-1, 3, 3):
            p = Polygon(t[:, [0, 2]])
            if p.area < 1e-10:
                continue
            ground.append(p)
            kinds.append(draw['kind'])
            records.append(t)
            limits = height_ranges.setdefault(draw['kind'], [math.inf, -math.inf])
            limits[0] = min(limits[0], float(t[:, 1].min()))
            limits[1] = max(limits[1], float(t[:, 1].max()))
    gtree = STRtree(ground)
    coverage_errors, equal_plane, duplicates, other_owners = [], [], [], []
    min_gap, max_gap, tested = math.inf, -math.inf, 0
    for i, p in enumerate(polys):
        target, same, others = marks[i]['kind'], [], []
        for candidate in gtree.query(p):
            j = int(candidate)
            intersection = p.intersection(ground[j])
            if intersection.area < 1e-10:
                continue
            triangle = records[j]
            normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
            if abs(normal[1]) < 1e-12:
                continue
            parts = [intersection] if intersection.geom_type == 'Polygon' else [
                g for g in getattr(intersection, 'geoms', []) if g.geom_type == 'Polygon']
            # Evaluate every intersection vertex, so ramps cannot hide a sloped
            # intrusion behind a passing center-only height measurement.
            gaps = [ys[i] - float(triangle[0, 1] - (
                normal[0] * (x - triangle[0, 0]) + normal[2] * (z - triangle[0, 2])) / normal[1])
                for part in parts for x, z in part.exterior.coords]
            if not gaps:
                continue
            tested += 1
            if kinds[j] == target:
                same.append(intersection)
                min_gap, max_gap = min(min_gap, min(gaps)), max(max_gap, max(gaps))
                if min(abs(gap) for gap in gaps) < 1e-7:
                    equal_plane.append({'mark': i, 'ground': j, 'areaM2': intersection.area})
            elif intersection.area > 1e-7:
                others.append({'kind': kinds[j], 'areaM2': intersection.area, 'gap': [min(gaps), max(gaps)]})
        covered = unary_union(same)
        missing = p.difference(covered).area
        if missing > 1e-7:
            coverage_errors.append({'mark': i, 'kind': target, 'missingAreaM2': missing,
                                    'areaM2': p.area, 'center': [marks[i]['x'], marks[i]['z']]})
        extra = sum(q.area for q in same) - covered.area
        if extra > 1e-7:
            duplicates.append({'mark': i, 'duplicateRoadAreaM2': extra})
        if others:
            other_owners.append({'mark': i, 'surfaces': others})

    significant_pairs = sum(pair['areaM2'] > .0001 for pair in pairs)
    failures = []
    for bad, message in [
        (bool(equal_plane), 'Paint and its ground owner are coplanar'),
        (not (.005 <= min_gap <= max_gap <= .025), 'Paint must remain 5–25 mm above its complete owned footprint'),
        (bool(significant_pairs), 'Paint rectangles overlap above the 0.0001 m² area tolerance'),
        (bool(coverage_errors), 'Paint extends beyond its actual packed ground owner'),
        (bool(duplicates), 'Packed ground triangles have duplicate area under paint'),
        (bool(other_owners), 'Another ground surface intrudes beneath paint'),
    ]:
        if bad:
            failures.append(message)
    summary = {
        'scope': data['scope'], 'sourceHashes': data['sourceHashes'], 'checkHashes': data['checkHashes'],
        'paintRectangles': len(marks), 'paintBySource': dict(Counter(m['source'] for m in marks)),
        'paintByKind': dict(Counter(m['kind'] for m in marks)), 'groundTriangles': len(ground),
        'paintGroundIntersectionsMeasured': tested, 'groundHeightRangeM': dict(sorted(height_ranges.items())),
        'paintInstanceHeightsM': sorted(set(ys)), 'paintToOwnedSurfaceGapM': [min_gap, max_gap],
        'paintRoadCoplanarPairs': len(equal_plane),
        'paintPaintOverlap': {'positivePairs': len(pairs), 'totalAreaM2': paint_overlap,
                             'pairsOver0_0001M2': significant_pairs,
                             'maxPairAreaM2': max((p['areaM2'] for p in pairs), default=0),
                             'examples': sorted(pairs, key=lambda p: -p['areaM2'])[:6]},
        'paintOutsideActualSurface': {'count': len(coverage_errors),
                                     'totalAreaM2': sum(p['missingAreaM2'] for p in coverage_errors),
                                     'examples': sorted(coverage_errors, key=lambda p: -p['missingAreaM2'])[:6]},
        'duplicateGroundUnderPaint': {'count': len(duplicates),
                                     'totalAreaM2': sum(p['duplicateRoadAreaM2'] for p in duplicates),
                                     'examples': duplicates[:6]},
        'otherGroundUnderPaint': {'count': len(other_owners), 'examples': other_owners[:6]},
        'thresholds': {'paintPairAreaM2': .0001, 'coverageAreaM2': 1e-7, 'paintGapM': [.005, .025]},
        'failures': failures,
    }
    (base / 'report.json').write_text(json.dumps(summary, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'paintRectangles': len(marks), 'groundTriangles': len(ground), 'failures': failures}))
    return bool(failures)


if __name__ == '__main__':
    sys.exit(main())
