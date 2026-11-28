#!/usr/bin/env python3
"""Focused ownership/quality regressions for build-only painted-ground meshes."""
import copy
import json
from pathlib import Path
import unittest

from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from ground_triangulation import compile_ground_triangulation, triangle_metrics

ROOT = Path(__file__).resolve().parents[1]


def triangle_polygons(compiled, kind):
    return [Polygon([(t[i], t[i + 1]) for i in (0, 2, 4)])
            for chunk in compiled['chunks'] if chunk['kind'] == kind for t in chunk['triangles']]


class GroundTriangulationChecks(unittest.TestCase):
    def test_saved_walker_road_avoids_original_long_needle(self):
        fixture = json.loads((ROOT / 'scripts/data/road-triangulation-regression.json').read_text())
        layer = fixture['layer']
        before = copy.deepcopy(layer)
        old_length, old_aspect = triangle_metrics(fixture['knownFailingTriangle'])
        self.assertGreater(old_length, 240)
        self.assertGreater(old_aspect, 7000)
        compiled, stats = compile_ground_triangulation([layer])
        self.assertEqual(layer, before, 'Triangulation must not rewrite the footprint contract')
        source = unary_union([Polygon(p['outer'], p['holes']) for p in layer['polygons']])
        triangles = triangle_polygons(compiled, 'road')
        covered = unary_union(triangles)
        self.assertLess(source.symmetric_difference(covered).area, 1e-7)
        self.assertLess(abs(sum(p.area for p in triangles) - covered.area), 1e-7)
        self.assertEqual(stats['layers']['road']['longNeedlesOver32mAspect256'], 0)
        self.assertEqual(compile_ground_triangulation([layer])[0], compiled, 'Output order must be deterministic')

    def test_parking_hole_and_chunk_seams_keep_single_ownership(self):
        outer = box(-12, -8, 1040, 1032)
        holes = [box(4, 6, 40, 50), box(1010, 1008, 1030, 1028)]
        source = outer.difference(unary_union(holes))
        layer = {'kind': 'parking', 'y': .04, 'uvScale': 4,
                 'polygons': [{'outer': list(source.exterior.coords),
                               'holes': [list(r.coords) for r in source.interiors]}]}
        compiled, stats = compile_ground_triangulation([layer])
        triangles = triangle_polygons(compiled, 'parking')
        covered = unary_union(triangles)
        self.assertEqual(len(compiled['chunks']), 9)
        self.assertLess(source.symmetric_difference(covered).area, 1e-7)
        self.assertLess(abs(sum(p.area for p in triangles) - covered.area), 1e-7)
        self.assertEqual(covered.intersection(unary_union(holes)).area, 0)
        for chunk in compiled['chunks']:
            x, z = chunk['cell']
            cell = box(x * 1024, z * 1024, (x + 1) * 1024, (z + 1) * 1024)
            for t in chunk['triangles']:
                points = [(t[i], t[i + 1]) for i in (0, 2, 4)]
                self.assertTrue(cell.covers(Polygon(points)))
                a, b, c = points
                self.assertLess((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]), 0,
                                'Baked x/y/z triangles must face upward')
        self.assertLess(stats['footprintDifferenceM2'], 1e-7)

    def test_other_ground_layers_are_untouched_and_invalid_owner_is_rejected(self):
        grass = {'kind': 'grass', 'polygons': [{'outer': [[0, 0], [4, 0], [4, 4], [0, 4]], 'holes': []}]}
        self.assertEqual(compile_ground_triangulation([grass])[0]['chunks'], [])
        invalid = {'kind': 'road', 'polygons': [{'outer': [[0, 0], [4, 4], [0, 4], [4, 0]], 'holes': []}]}
        with self.assertRaises(ValueError):
            compile_ground_triangulation([invalid])


if __name__ == '__main__':
    unittest.main()
