"""Restore complete, explicitly selected building-part groups from saved OSM.

The generic importer formerly read only parts with ten or more floors. These
complete mapped groups provide actual setbacks and wings. Never spread one
part's height across a legacy GIS outline, or invent a height for a missing part.
"""
import json
import re

from shapely.geometry import Polygon
from shapely.ops import unary_union

# Curated parent outlines present in the unchanged geographic snapshot. These
# are bounded repairs, not a new heuristic applied to every unknown building.
PARENTS = {
    113737426: 'Corporate Tower',
    158962133: 'Hampton Inn & Suites',
    158962144: 'Power Alley Garage',
    159172858: 'Hilton Garden Inn Oklahoma City – Bricktown',
    248416129: 'Mapped building east of the arena',
    249481973: 'Mapped Reno Avenue commercial building',
    938769876: 'Omni Hotel',
    938771500: 'Oklahoma City Convention Center',
}


def numeric(value):
    match = re.search(r'-?[\d.]+', str(value or ''))
    return float(match[0]) if match else 0.


def metres(value):
    return numeric(value) * (.3048 if str(value).strip().endswith('ft') else 1.)


def apply_mapped_massing(buildings, ways, height_references, output):
    by_id = {w['id']: w for w in ways}
    plan = {w['id']: Polygon(w['p']) for w in ways
            if len(w['p']) >= 4 and w['p'][0] == w['p'][-1]}
    original_count = len(buildings)
    reports, added = [], []
    for parent_id, fallback_name in PARENTS.items():
        parent = by_id[parent_id]
        outline = plan[parent_id]
        assert outline.is_valid and outline.area > 25, 'Invalid mapped parent'
        name = parent['tags'].get('name') or fallback_name
        parts = []
        for way in ways:
            tags, geometry = way['tags'], plan.get(way['id'])
            if not tags.get('building:part') or geometry is None or geometry.area < 1:
                continue
            if not geometry.is_valid or outline.intersection(geometry).area / geometry.area < .995:
                continue
            assert tags.get('building:part') != 'roof' and tags.get('building') != 'roof', 'Roof-only group needs a dedicated model'
            assert metres(tags.get('min_height')) <= 0 and numeric(tags.get('building:min_level')) <= 0, 'Suspended parts need explicit bottom surfaces'
            assert not tags.get('fixme'), 'Unverified part must not silently become an accurate model'
            assert tags.get('roof:shape', 'flat') == 'flat' and not numeric(tags.get('roof:height')), 'Nonflat roof needs a dedicated model'
            explicit = metres(tags.get('height'))
            height = height_references.get(way['id'], explicit or numeric(tags.get('building:levels')) * 3.65)
            assert height > 0, 'Every part must have a saved height or floor count'
            parts.append((way, height, 'Skyline height reference' if way['id'] in height_references
                          else 'OSM height' if explicit else 'OSM floors × estimated floor pitch'))
        assert parts, f'No mapped parts for {parent_id}'
        cover = unary_union([plan[w['id']] for w, _, _ in parts])
        missing = outline.difference(cover).area
        excess = cover.difference(outline).area
        assert missing <= max(.1, outline.area * .0005), f'Incomplete massing for {parent_id}'
        assert excess <= max(.1, outline.area * .0005), f'Parts leave parent {parent_id}'
        part_ids = {w['id'] for w, _, _ in parts}
        masked = []
        # Retain the original record and its outside portion. Inside a complete
        # mapped complex only its parts own mass; the generic GIS prism cannot
        # fill its terraces or turn a podium into a full-height rectangular box.
        for building in buildings:
            if building['osm'] in part_ids and building['id'] in part_ids:
                continue
            geometry = Polygon(building['p'], building.get('holes', []))
            overlap = geometry.intersection(outline).area
            if overlap <= .01:
                continue
            building.setdefault('massingMasks', []).append({'outer': parent['p'], 'holes': []})
            building.setdefault('massingOwners', []).append(parent_id)
            masked.append({'id': building['id'], 'areaM2': round(overlap, 4)})
        part_report = []
        for way, height, provenance in sorted(parts, key=lambda item: item[0]['id']):
            tags = {**parent['tags'], **way['tags']}
            previous = next((b for b in buildings if b['id'] == way['id'] and b['osm'] == way['id']), None)
            if previous:
                # Existing tower entries retain their identity and material.
                assert abs(previous['h'] - height) < .001
                record = previous
            else:
                parking = tags.get('building') == 'parking' or tags.get('parking') == 'multi-storey'
                kind = 'parking' if parking else 'glass' if 'glass' in tags.get('building:material', '') else 'masonry'
                if kind == 'masonry' and height <= 8.2:
                    kind = 'retail' if tags.get('shop') or tags.get('amenity') in ['restaurant', 'cafe'] else 'lowrise'
                record = {'id': way['id'], 'osm': way['id'], 'name': way['tags'].get('name') or name,
                          'p': way['p'], 'h': round(height, 2), 'kind': kind, 'heightSource': provenance}
                buildings.append(record)
                added.append(way['id'])
            record['massingParent'] = parent_id
            record['footprintSource'] = 'OpenStreetMap building:part way ' + str(way['id'])
            part_report.append({'osmWay': way['id'], 'heightMeters': round(height, 2),
                                'heightSource': provenance, 'source': 'https://www.openstreetmap.org/way/' + str(way['id'])})
        reports.append({'osmParent': parent_id, 'name': name, 'outlineAreaM2': round(outline.area, 4),
                        'missingPartCoverageM2': round(missing, 6), 'excessPartCoverageM2': round(excess, 6),
                        'maskedLegacyRecords': masked, 'parts': part_report})
    report = {'version': 1, 'snapshot': 'scripts/data/okc-map.osm.gz',
              'schemaReference': 'https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings',
              'originalRecords': original_count, 'addedPartRecords': added, 'groups': reports,
              'limits': ['OSM tags are not a new survey.', 'Floor-count-only heights use the existing estimated3.65m floor pitch.',
                         'Only the eight explicitly listed complete complexes are repaired.',
                         'Unrelated unknown building heights remain unchanged. Original GIS records survive outside mapped masks.']}
    (output / 'geo/mapped-massing-sources.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report
