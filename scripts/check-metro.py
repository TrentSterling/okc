#!/usr/bin/env python3
"""Validate metro coordinates, graph identity and partitioned road surfaces.

This is a geographic/CPU contract check. It does not establish browser FPS or
that every facade matches a street-level photograph.
"""
from pathlib import Path
from collections import Counter, deque
import gzip, hashlib, json, math, os
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from metro_geometry import surface_core_bounds

ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.environ.get('OKC_BUILD_OUTPUT',ROOT/'dist'))/'geo/metro'
manifest=json.loads((DATA/'manifest.json').read_text())
network=json.loads((DATA/'network.json').read_text())
pois=json.loads((DATA/'pois.json').read_text())['pois']
b=manifest['bounds'];bounds=box(b['minX'],b['minZ'],b['maxX'],b['maxZ'])
cb=manifest['coreBounds'];core=box(cb['minX'],cb['minZ'],cb['maxX'],cb['maxZ'])
surface_cb=manifest.get('coreSurfaceBounds',surface_core_bounds(cb))
surface_core=box(surface_cb['minX'],surface_cb['minZ'],surface_cb['maxX'],surface_cb['maxZ'])
failures=[];stats=Counter();surface_overlap=0;core_overlap=0;land_core_overlap=0;max_tile_bytes=0
building_ids=set()

def check(condition,message):
    if not condition and len(failures)<50:failures.append(message)


def polygon(r):
    return Polygon(r['p'],r.get('holes',[]))


def asset(meta, label):
    path=DATA/meta['url'];check(path.is_file(),f'missing {meta["url"]}')
    if not path.is_file():return None
    raw=path.read_bytes()
    check(len(raw)==meta['bytes'],f'wrong byte count {label}')
    check(hashlib.sha256(raw).hexdigest()==meta.get('sha256'),f'content hash mismatch {label}')
    packed_path=DATA/meta.get('gzipUrl','__missing_gzip__')
    check(packed_path.is_file(),f'missing compressed asset {label}')
    if packed_path.is_file():
        packed=packed_path.read_bytes()
        check(len(packed)==meta.get('gzipBytes'),f'wrong compressed byte count {label}')
        check(hashlib.sha256(packed).hexdigest()==meta.get('gzipSha256'),f'compressed hash mismatch {label}')
        try:
            check(gzip.decompress(packed)==raw,f'compressed payload differs from fallback {label}')
        except (OSError,EOFError) as error:
            check(False,f'invalid gzip {label}: {error}')
    return raw


check(manifest['tileSize']==512,'tile size contract')
check(manifest.get('coreSurfaceBounds')==surface_core_bounds(cb),'downtown surface ownership must include its 50 m apron')
base_surfaces_path=DATA.parent/'base-surfaces.json.gz'
check(base_surfaces_path.is_file(),'original downtown surface contract missing')
if base_surfaces_path.is_file():
    with gzip.open(base_surfaces_path,'rt') as source:base_surfaces=json.load(source)
    check(base_surfaces['drivingBounds']==cb,'metro core and original downtown driving bounds differ')
    for layer in base_surfaces['layers']:
        for p in layer['polygons']:
            check(all(surface_cb['minX']-.0001<=x<=surface_cb['maxX']+.0001 and
                      surface_cb['minZ']-.0001<=z<=surface_cb['maxZ']+.0001 for x,z in p['outer']),
                  f'original downtown {layer["kind"]} exceeds reserved surface ownership')
check(len(manifest['tiles'])==manifest['counts']['tiles'],'tile inventory count mismatch')
check(len({tile['id'] for tile in manifest['tiles']})==len(manifest['tiles']),'duplicate tile IDs')
for name,meta in manifest['assets'].items():asset(meta,name)
check(len(network['nodes'])==len(network['nodeIds']),'network IDs do not match coordinates')
check(len(network['nodeIds'])==len(set(network['nodeIds'])),'network source node identities are duplicated')
for i,p in enumerate(network['nodes']):
    check(len(p)==2 and all(math.isfinite(v) for v in p),f'nonfinite graph coordinate {i}')
    check(b['minX']-.01<=p[0]<=b['maxX']+.01 and b['minZ']-.01<=p[1]<=b['maxZ']+.01,f'graph node outside map {i}')

adj=[[] for _ in network['nodes']]
for road in network['roads']:
    n=road['n'];check(len(n)>=2,f'road has no segment {road["id"]}')
    check(isinstance(road['oneway'],bool),f'oneway is not boolean {road["id"]}')
    check(road['kind'] not in ['footway','cycleway','steps','path'],f'non-driving road in graph {road["id"]}')
    for a,c in zip(n,n[1:]):
        check(0<=a<len(adj) and 0<=c<len(adj),f'unknown graph node {road["id"]}')
        if 0<=a<len(adj) and 0<=c<len(adj):
            adj[a].append(c)
            if not road['oneway']:adj[c].append(a)
        stats['directedSegments']+=1 if road['oneway'] else 2

for meta in manifest['tiles']:
    raw=asset(meta,meta['id'])
    if raw is None:continue
    tile=json.loads(raw)
    check(tile['id']==meta['id'],f'tile identity mismatch {meta["id"]}')
    max_tile_bytes=max(max_tile_bytes,len(raw))
    stats['tileBytes']+=len(raw);stats['tileGzipBytes']+=meta.get('gzipBytes',0)
    roads=[];walks=[]
    for k in ['buildings','roads','surfaces','details','meshes']:stats[k]+=len(tile.get(k,[]))
    for k in ['buildings','roads','surfaces','details']:
        check(meta[k]==len(tile.get(k,[])),f'tile {k} count mismatch {meta["id"]}')
    for r in tile.get('buildings',[]):
        check(r['id'] not in building_ids,f'duplicate building identity {r["id"]}')
        building_ids.add(r['id'])
        p=polygon(r)
        check(p.is_valid and p.area>0,f'invalid building {r["id"]}')
        check(2<=r['h']<=350,f'invalid height {r["id"]}')
        check(bool(r['heightSource']) and bool(r['footprintSource']),f'missing provenance {r["id"]}')
    for r in tile.get('meshes',[]):
        p=polygon(r);check(p.is_valid and p.area>0,f'invalid road polygon {meta["id"]}')
        if not p.is_valid:continue
        if r['kind']=='road' and r['y']<1:roads.append(p)
        if r['kind']=='sidewalk':walks.append(p)
        core_overlap+=p.intersection(surface_core).area
    for r in tile.get('surfaces',[]):
        raw_polygon=polygon(r)
        for patch in r.get('renderPatches',[r]):
            p=polygon(patch)
            check(p.is_valid and p.area>0,f'invalid land render patch {meta["id"]}/{r["id"]}')
            if not p.is_valid:continue
            land_core_overlap+=p.intersection(surface_core).area
            if 'renderPatches' in r:
                check(p.difference(raw_polygon.buffer(.015)).area<.05,f'land render patch escaped source polygon {r["id"]}')
    if roads and walks:
        overlap=unary_union(roads).intersection(unary_union(walks)).area
        surface_overlap+=overlap
        check(overlap<.05,f'road/sidewalk overlap {meta["id"]}: {overlap}')

check(core_overlap<.05,f'new road mesh overlaps original downtown surface apron {core_overlap}')
check(land_core_overlap<.05,f'metro land patches overlap original downtown surface apron {land_core_overlap}')
check(stats['buildings']==manifest['counts']['buildings'],'building manifest count mismatch')
check(stats['tileBytes']==manifest['totalTileBytes'],'tile payload bytes mismatch')
check(stats['tileGzipBytes']==manifest.get('totalTileGzipBytes'),'compressed tile payload bytes mismatch')
check(len(pois)==manifest['counts']['pois'],'POI manifest count mismatch')
check(len(set(p['id'] for p in pois))==len(pois),'duplicate POI IDs')
for p in pois:
    if p.get('x') is None:continue
    check(all(math.isfinite(p[k]) for k in ['x','z','lat','lon']),f'nonfinite POI {p["id"]}')
    check(p.get('sourceUrl') or p.get('sourceUrls'),f'missing POI source {p["id"]}')
    check(not p.get('buildingId') or p['buildingId'] in building_ids,f'unknown POI building {p["id"]}')

# Verify the selected cross-city anchors lie in one reachable directed graph.
anchor_ids={'cactus-jacks','windsor-lanes','brickopolis','yukon-christmas-lights','subway-8022-nw-39th-expressway'}
anchors=[p for p in pois if p['id'] in anchor_ids and p.get('x') is not None]
check({p['id'] for p in anchors}==anchor_ids,'required cross-city destinations missing')
nearest=lambda p:min(range(len(network['nodes'])),key=lambda i:(network['nodes'][i][0]-p['x'])**2+(network['nodes'][i][1]-p['z'])**2)
route_checks=[]
if anchors:
    start=nearest(anchors[0]);seen={start};queue=deque([start])
    while queue:
        node=queue.popleft()
        for neighbor in adj[node]:
            if neighbor not in seen:seen.add(neighbor);queue.append(neighbor)
    for p in anchors[1:]:
        hit=nearest(p) in seen
        route_checks.append({'from':anchors[0]['name'],'to':p['name'],'reachable':hit})
        check(hit,f'cross-city anchor not reachable: {p["name"]}')
    stats['reachableFromFirstAnchor']=len(seen)

report={'passed':not failures,'checks':['finite source geometry','tile inventory','raw and compressed payload identity','source provenance','graph source identity',
  'one-way graph contracts','map boundary graph clipping','valid polygon footprints','road / sidewalk footprint partition',
  'original downtown and 50 m surface apron ownership','unique building identities','POI source and ID coverage','cross-city graph reachability'],
  'counts':dict(stats),'maxTileBytes':max_tile_bytes,'roadSidewalkOverlapSquareMeters':round(surface_overlap,4),
  'newRoadCoreOverlapSquareMeters':round(core_overlap,4),'newLandCoreOverlapSquareMeters':round(land_core_overlap,4),'coreSurfaceBounds':surface_cb,'routeChecks':route_checks,'failures':failures,
  'limits':['CPU / geographic contract check only. Browser screenshots and actual runtime behavior require separate verification.',
            'Source map accuracy, current business operation and facade resemblance are not established by this check.']}
(DATA/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
raise SystemExit(0 if not failures else 1)
