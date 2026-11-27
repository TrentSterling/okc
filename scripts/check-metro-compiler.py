#!/usr/bin/env python3
"""Small geometric regressions for exported metro ownership and compression."""
import gzip
import json
import math
from pathlib import Path
import random
import tempfile
import unittest
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from metro_geometry import partition_street_surfaces
from metro_output import write_json


class MetroCompilerTests(unittest.TestCase):
    def assert_partition(self, roads, walks, core):
        meshes = partition_street_surfaces({0: roads, 5: [roads[0]]}, walks, core)
        ground = unary_union([Polygon(m['p'], m.get('holes', [])) for m in meshes
                              if m['kind'] == 'road' and m['y'] < 1])
        walking = unary_union([Polygon(m['p'], m.get('holes', [])) for m in meshes if m['kind'] == 'sidewalk'])
        self.assertGreater(ground.area, 0)
        self.assertGreater(walking.area, 0)
        self.assertLess(ground.intersection(walking).area, 1e-7)
        self.assertLess(ground.union(walking).intersection(core).area, 1e-7)
        self.assertTrue(any(m['y'] == 5.14 for m in meshes), 'bridge must retain its own elevation layer')

    def test_angled_junction_export_remains_disjoint(self):
        roads, walks = [], []
        for i in range(12):
            angle = i * .241 + .02
            line = LineString([(-180 * math.cos(angle) + .003, -180 * math.sin(angle) + .007),
                               (180 * math.cos(angle) + .003, 180 * math.sin(angle) + .007)])
            roads.append(line.buffer(3.73, cap_style=2, join_style=2))
            walks.append(line.buffer(5.43, cap_style=2, join_style=2))
        self.assert_partition(roads, walks, box(-28.72, -18.45, -1.04, 37.88))

    def test_irregular_junctions_do_not_reintroduce_rounding_slivers(self):
        rng = random.Random(0)
        roads, walks = [], []
        for _ in range(7):
            line = LineString([(rng.uniform(-200, 200), rng.uniform(-200, 200)) for _ in range(2)])
            width = rng.uniform(3, 8)
            roads.append(line.buffer(width, cap_style=2, join_style=2))
            walks.append(line.buffer(width + 1.7, cap_style=2, join_style=2))
        self.assert_partition(roads, walks, box(250, 250, 300, 300))

    def test_compressed_assets_have_path_independent_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / 'one' / 'tile.json'
            second = Path(directory) / 'two' / 'different-name.json'
            payload = {'id': '-1_2', 'name': 'Ollie’s', 'buildings': []}
            a = write_json(first, payload, compressed=True)
            b = write_json(second, payload, compressed=True)
            self.assertEqual(a, b)
            packed = first.with_name(first.name + '.gz').read_bytes()
            self.assertEqual(gzip.decompress(packed), first.read_bytes())
            self.assertEqual(json.loads(gzip.decompress(packed)), payload)


if __name__ == '__main__':
    unittest.main()
