#!/usr/bin/env python3
"""Independent polygon and metric checks for the compiled facade/roof pass.

This reads the production output; it does not import the layout/compiler code.
The companion JS check measures actual baked triangles against this contract.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union


ROOT = Path(__file__).resolve().parents[1]


def geometry(polygons):
    return unary_union([Polygon(p['outer'], p.get('holes', [])) for p in polygons])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', help='Optional independent compiled payload fixture')
    args = parser.parse_args()
    if args.input:
        payload = json.loads(Path(args.input).read_text())
    else:
        uri = (ROOT/'dist/world-surfaces.js').as_uri()
        command = f'import {{WORLD_SURFACES}} from {json.dumps(uri)};process.stdout.write(JSON.stringify(WORLD_SURFACES));'
        payload = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', command], text=True))
    stats = {'buildings': 0, 'frontages': 0, 'physicalOpenings': 0, 'upperFloorOpenings': 0,
             'clerestories': 0, 'trimBands': 0, 'roofWells': 0, 'innerRoofRisers': 0,
             'roofPartitionErrorM2': 0., 'roofPartitionOverlapM2': 0., 'invalidPolygons': 0}
    for shell in payload['buildingShells']:
        stats['buildings'] += 1
        for wall in shell['walls']:
            size = math.dist(wall['a'], wall['b'])
            apertures = []
            for opening in wall['openings']:
                stats['physicalOpenings'] += 1
                if opening['kind'] == 'clerestory':
                    stats['clerestories'] += 1
                elif opening['bottom'] > 3:
                    stats['upperFloorOpenings'] += 1
                assert opening['end']-opening['start'] > .5
                assert opening['top']-opening['bottom'] > .55
                assert .19999 <= opening['depth'] <= .4
                assert opening['start'] >= .65 and opening['end'] <= size-.65
                assert opening['bottom'] >= wall['base'] and opening['top'] < wall['top']-.3
                aperture = box(opening['start'], opening['bottom'], opening['end'], opening['top'])
                assert all(aperture.intersection(other).area < .00001 for other in apertures), 'Overlapping openings'
                apertures.append(aperture)
            layout = wall.get('facadeLayout')
            if layout:
                stats['frontages'] += 1
                assert layout['bayCount'] > 0 and layout['corner'] >= .7998
                assert abs(layout['corner']*2+layout['bayPitch']*layout['bayCount']-size) < .006
                assert layout['floors'] in (1, 2, 3)
                for opening in wall['openings']:
                    at = (opening['start']+opening['end'])/2
                    slot = (at-layout['corner'])/layout['bayPitch']-.5
                    assert abs(slot-round(slot)) < .001, 'Aperture is not centered in a complete bay'
            bands = []
            for band in wall.get('detailBands', []):
                stats['trimBands'] += 1
                assert band['end']-band['start'] >= .15
                assert band['top'] > band['bottom'] >= wall['base']
                assert band['top'] < wall['top']
                assert .04 <= band['projection'] <= .85
                outline = box(band['start'], band['bottom'], band['end'], band['top'])
                assert all(outline.intersection(aperture).area < .00001 for aperture in apertures), 'Trim blocks a facade opening'
                assert all(outline.intersection(other).area < .00001 for other in bands), 'Trim front faces overlap'
                bands.append(outline)
        well = shell.get('roofAssembly')
        if not well:
            continue
        stats['roofWells'] += 1
        envelope, deck, coping = geometry(shell['roofs']), geometry(well['deck']), geometry(well['coping'])
        for candidate in (envelope, deck, coping):
            if not candidate.is_valid:
                stats['invalidPolygons'] += 1
        overlap = deck.intersection(coping).area
        difference = envelope.symmetric_difference(deck.union(coping)).area
        stats['roofPartitionOverlapM2'] += overlap
        stats['roofPartitionErrorM2'] += difference
        assert overlap < .001 and difference < .002, 'Roof deck and parapet do not partition the old roof'
        assert abs(shell['height']-well['deckY']-.42) < .00001
        assert well['deckY'] > 3
        total = 0.
        for wall in well['innerWalls']:
            stats['innerRoofRisers'] += 1
            a, b = wall['a'], wall['b']
            size = math.dist(a, b)
            assert size > .00001
            total += size
            assert wall['top'] == shell['height'] and wall['base'] == well['deckY']
            edge = LineString([a, b])
            # A separate library query checks the exported riser normal points
            # into the well; it is not allowed to face through the parapet.
            point = edge.interpolate(.5, normalized=True)
            nx, nz = (b[1]-a[1])/size, -(b[0]-a[0])/size
            assert deck.buffer(.001).covers(Point(point.x+nx*.002, point.y+nz*.002)), 'Roof riser faces away from its well'
            assert edge.distance(deck.boundary) < .0002
        assert abs(total-deck.length) < .01, 'Risers do not cover the complete roof well boundary'
        for unit in shell['rooftop']:
            assert unit['y'] == well['deckY'], 'Roof equipment floats at the old roof height'
            footprint = box(unit['x']-unit['w']/2, unit['z']-unit['d']/2,
                            unit['x']+unit['w']/2, unit['z']+unit['d']/2)
            assert deck.buffer(.001).covers(footprint), 'Roof equipment crosses a parapet'
    assert stats['roofWells'] > 500 and stats['frontages'] > 1500
    assert stats['upperFloorOpenings'] > 1000 and stats['clerestories'] > 500
    assert stats['invalidPolygons'] == 0
    print(json.dumps({**stats, 'scope': 'Independent Shapely check of compiled roof partitions, full bays, unblocked openings and nonoverlapping trim; actual triangle gate is check-building-shells.mjs.'}, indent=2))


if __name__ == '__main__':
    main()
