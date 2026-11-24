#!/usr/bin/env python3
"""Check restored massing against independently parsed saved geographic tags."""
import gzip
import json
import math
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union

root = Path(__file__).resolve().parents[1]
report = json.loads((root/'dist/geo/mapped-massing-sources.json').read_text())
data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    f'import {{CITY_DATA}} from {json.dumps((root/"dist/city-data.js").as_uri())};process.stdout.write(JSON.stringify(CITY_DATA));'], text=True))
xml = ET.fromstring(gzip.open(root/'scripts/data/okc-map.osm.gz', 'rb').read())
nodes = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in xml.findall('node')}
ways = {int(w.get('id')): w for w in xml.findall('way')}
origin = data['origin']
mx, mz = 111320*math.cos(math.radians(origin[1])), 111132


def points(way):
    return [[round((nodes[n.get('ref')][0]-origin[0])*mx, 2),
             round(-(nodes[n.get('ref')][1]-origin[1])*mz, 2)] for n in way.findall('nd')]


part_count = masked_count = 0
assert len(report['groups']) == 8
for group in report['groups']:
    parent = Polygon(points(ways[group['osmParent']]))
    parts = []
    for reference in group['parts']:
        way_id = reference['osmWay']
        records = [b for b in data['buildings'] if b['id'] == way_id and b['osm'] == way_id]
        assert len(records) == 1, 'One owner per mapped part'
        record = records[0]
        assert record['p'] == points(ways[way_id]), 'Saved footprint must not be stretched to the GIS parent'
        tags = {t.get('k'): t.get('v') for t in ways[way_id].findall('tag')}
        height = float(re.search(r'[\d.]+', tags.get('height', '0'))[0])
        if tags.get('height', '').endswith('ft'):
            height *= .3048
        if not height:
            height = float(tags['building:levels']) * 3.65
        assert abs(record['h']-height) < .001
        assert record['massingParent'] == group['osmParent']
        parts.append(Polygon(record['p']))
        part_count += 1
    cover = unary_union(parts)
    assert parent.symmetric_difference(cover).area < max(.1, parent.area*.0005)
    for reference in group['maskedLegacyRecords']:
        record = next(b for b in data['buildings'] if b['id'] == reference['id'])
        index = record['massingOwners'].index(group['osmParent'])
        mask = record['massingMasks'][index]
        assert Polygon(mask['outer'], mask['holes']).symmetric_difference(parent).area < .001
        masked_count += 1
assert all(any(b['id'] == identifier for b in data['buildings']) for identifier in report['addedPartRecords'])
print(json.dumps({'mappedComplexes': len(report['groups']), 'savedParts': part_count,
                  'newlyRestoredParts': len(report['addedPartRecords']), 'legacyMaskAssignments': masked_count,
                  'scope': 'Exact saved part outlines, explicit heights or declared floor-pitch estimates, complete parent coverage and retained source records.'}, indent=2))
