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
from metro_geometry import partition_street_surfaces, surface_core_bounds, add_surface_render_patches
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

    def test_downtown_apron_ownership_retains_raw_atlas_polygon(self):
        core_bounds={'minX':-10,'maxX':10,'minZ':-10,'maxZ':10}
        bounds=surface_core_bounds(core_bounds)
        self.assertEqual(bounds, {'minX':-60,'maxX':60,'minZ':-60,'maxZ':60})
        owner=box(bounds['minX'],bounds['minZ'],bounds['maxX'],bounds['maxZ'])
        original={'id':'mapped-park','kind':'park','p':[[-80,-80],[80,-80],[80,80],[-80,80]],
                  'holes':[[[-5,-5],[-5,5],[5,5],[5,-5]]]}
        patched=add_surface_render_patches(original,owner)
        self.assertEqual({k:patched[k] for k in original},original)
        rendered=unary_union([Polygon(p['p'],p.get('holes',[])) for p in patched['renderPatches']])
        self.assertLess(rendered.intersection(owner).area,1e-8)
        self.assertAlmostEqual(rendered.area,11200)
        self.assertEqual(add_surface_render_patches({'p':[[0,0],[5,0],[5,5],[0,5]]},owner)['renderPatches'],[])
        outside={'p':[[100,100],[105,100],[105,105],[100,105]]}
        self.assertIs(add_surface_render_patches(outside,owner),outside,'unaffected records carry no redundant patches')


if __name__ == '__main__':
    unittest.main()
