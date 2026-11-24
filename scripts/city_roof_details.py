"""Recessed supporting-building roof decks within their existing envelopes."""
from shapely import make_valid, set_precision
from shapely.geometry import GeometryCollection, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union


def parts(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for c in getattr(g, 'geoms', []) for p in parts(c)]


def clean(g):
    ps = [p for p in parts(make_valid(g)) if p.area > .001]
    return set_precision(unary_union(ps), .0001) if ps else GeometryCollection()


def encode(g):
    def ring(r):
        return [[round(float(x), 4), round(float(z), 4)] for x, z in r.coords]
    return [{'outer': ring(p.exterior), 'holes': [ring(h) for h in p.interiors]}
            for p in sorted(parts(g), key=lambda p: (*p.bounds[:2], -p.area))]


def add_roof_wells(shells):
    stats = {'recessedRoofDecks': 0, 'roofDeckAreaM2': 0., 'parapetCopingAreaM2': 0.,
             'parapetInnerWallMeters': 0., 'roofEnvelopeCoverageErrorM2': 0.}
    for shell in shells:
        if shell['kind'] not in ('lowrise', 'retail') or shell['stage'] or shell['height'] < 3.6:
            continue
        roof = clean(unary_union([Polygon(p['outer'], p['holes']) for p in shell['roofs']]))
        if roof.area < 35:
            continue
        deck = clean(roof.buffer(-.28, join_style='mitre', mitre_limit=2))
        if deck.area < 20 or deck.area < roof.area*.65:
            continue
        coping = clean(roof.difference(deck))
        # This is a partition, not an overlapping roof plane plus an edging
        # decal. The outer wall height and mapped footprint stay unchanged.
        overlap = deck.intersection(coping).area
        error = roof.symmetric_difference(deck.union(coping)).area
        assert overlap < .001 and error < .002
        inner = []
        for component in parts(deck):
            component = orient(component, sign=1)
            for ring in [component.exterior, *component.interiors]:
                coords = list(ring.coords)
                for a, b in zip(coords, coords[1:]):
                    # Reverse a deck boundary: its normal points into the
                    # roof well, including wells with holes around neighbors.
                    inner.append({'a': [round(b[0], 4), round(b[1], 4)],
                                  'b': [round(a[0], 4), round(a[1], 4)],
                                  'base': round(shell['height']-.42, 4), 'top': shell['height']})
        shell['roofAssembly'] = {'deckY': round(shell['height']-.42, 4), 'deck': encode(deck),
                                 'coping': encode(coping), 'innerWalls': inner,
                                 'note': 'Reconstructed .42 m parapet well within mapped height envelope.'}
        stats['recessedRoofDecks'] += 1
        stats['roofDeckAreaM2'] += deck.area
        stats['parapetCopingAreaM2'] += coping.area
        stats['parapetInnerWallMeters'] += deck.length
        stats['roofEnvelopeCoverageErrorM2'] += error
    return {k: round(v, 6) if isinstance(v, float) else v for k, v in stats.items()}
