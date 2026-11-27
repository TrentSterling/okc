#!/usr/bin/env python3
"""Validate metro coordinates, graph identity and partitioned road surfaces.

This is a geographic/CPU contract check. It does not establish browser FPS or
that every facade matches a street-level photograph.
"""
from pathlib import Path
from collections import Counter, deque
import json, math, os
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.environ.get('OKC_BUILD_OUTPUT',ROOT/'dist'))/'geo/metro'
manifest=json.loads((DATA/'manifest.json').read_text())
network=json.loads((DATA/'network.json').read_text())
pois=json.loads((DATA/'pois.json').read_text())['pois']
b=manifest['bounds'];bounds=box(b['minX'],b['minZ'],b['maxX'],b['maxZ'])
core=box(-1600,-1140,1600,1120)
failures=[];stats=Counter();surface_overlap=0;core_overlap=0;max_tile_bytes=0

def check(condition,message):
    if not condition and len(failures)<50:failures.append(message)


def polygon(r):
    return Polygon(r['p'],r.get('holes',[]))


check(manifest['tileSize']==512,'tile size contract')
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
    path=DATA/meta['url'];check(path.is_file(),f'missing {meta["url"]}')
    if not path.is_file():continue
    tile=json.loads(path.read_text());check(path.stat().st_size==meta['bytes'],f'wrong byte count {meta["id"]}')
    max_tile_bytes=max(max_tile_bytes,path.stat().st_size)
    roads=[];walks=[]
    for k in ['buildings','roads','surfaces','details','meshes']:stats[k]+=len(tile.get(k,[]))
    for r in tile.get('buildings',[]):
        p=polygon(r)
        check(p.is_valid and p.area>0,f'invalid building {r["id"]}')
        check(2<=r['h']<=350,f'invalid height {r["id"]}')
        check(bool(r['heightSource']) and bool(r['footprintSource']),f'missing provenance {r["id"]}')
    for r in tile.get('meshes',[]):
        p=polygon(r);check(p.is_valid and p.area>0,f'invalid road polygon {meta["id"]}')
        if not p.is_valid:continue
        if r['kind']=='road' and r['y']<1:roads.append(p)
        if r['kind']=='sidewalk':walks.append(p)
        core_overlap+=p.intersection(core).area
    if roads and walks:
        overlap=unary_union(roads).intersection(unary_union(walks)).area
        surface_overlap+=overlap
        check(overlap<.05,f'road/sidewalk overlap {meta["id"]}: {overlap}')

check(core_overlap<.05,f'new road mesh overlaps original downtown {core_overlap}')
check(stats['buildings']==manifest['counts']['buildings'],'building manifest count mismatch')
check(len(pois)==manifest['counts']['pois'],'POI manifest count mismatch')
check(len(set(p['id'] for p in pois))==len(pois),'duplicate POI IDs')
for p in pois:
    if p.get('x') is None:continue
    check(all(math.isfinite(p[k]) for k in ['x','z','lat','lon']),f'nonfinite POI {p["id"]}')
    check(p.get('sourceUrl') or p.get('sourceUrls'),f'missing POI source {p["id"]}')

# Verify the selected cross-city anchors lie in one reachable directed graph.
anchors=[p for p in pois if p['id'] in ['cactus-jacks','windsor-lanes','brickopolis','yukon-christmas-lights','subway-8022-nw-39th-expressway'] and p.get('x') is not None]
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

report={'passed':not failures,'checks':['finite source geometry','tile inventory','source provenance','graph source identity',
  'one-way graph contracts','map boundary graph clipping','valid polygon footprints','road / sidewalk footprint partition',
  'original downtown geometry ownership','POI source and ID coverage','cross-city graph reachability'],
  'counts':dict(stats),'maxTileBytes':max_tile_bytes,'roadSidewalkOverlapSquareMeters':round(surface_overlap,4),
  'newRoadCoreOverlapSquareMeters':round(core_overlap,4),'routeChecks':route_checks,'failures':failures,
  'limits':['CPU / geographic contract check only. Browser screenshots and actual runtime behavior require separate verification.',
            'Source map accuracy, current business operation and facade resemblance are not established by this check.']}
(DATA/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
raise SystemExit(0 if not failures else 1)
