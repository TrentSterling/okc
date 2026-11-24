"""Compile the checked-in OKC map snapshots into a compact local-meter scene.

Source snapshots preserve public geographic data; no runtime network service is
needed. Heights from OSM tags/CTBUH overrides are distinguished from estimates.
"""
from pathlib import Path
import gzip, json, math, re, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = [-97.51758985376695, 35.466887450817715]
MX = 111320 * math.cos(math.radians(ORIGIN[1]))
MZ = 111132
def local(c): return [round((c[0]-ORIGIN[0])*MX,2), round(-(c[1]-ORIGIN[1])*MZ,2)]
def area(p): return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))/2)
def centroid(p):
    q=p[:-1] if p[0]==p[-1] else p
    c=[a[0]*b[1]-b[0]*a[1] for a,b in zip(q,q[1:]+q[:1])]; s=sum(c)
    if abs(s)<.01:return [sum(a[k] for a in q)/len(q) for k in range(2)]
    return [sum((a[k]+b[k])*v for a,b,v in zip(q,q[1:]+q[:1],c))/(3*s) for k in range(2)]
def inside(pt,poly):
    x,y=pt; hit=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit
def number(s):
    try:return float(re.search(r'[\d.]+',str(s))[0])
    except:return 0
def in_scene(p):return -1600<p[0]<1350 and -1020<p[1]<900

doc=ET.fromstring(gzip.open(ROOT/'scripts/data/okc-map.osm.gz','rb').read())
nodes={n.get('id'):[float(n.get('lon')),float(n.get('lat'))] for n in doc.findall('node')}
ways=[]
for w in doc.findall('way'):
    tags={t.get('k'):t.get('v') for t in w.findall('tag')}
    pts=[local(nodes[n.get('ref')]) for n in w.findall('nd') if n.get('ref') in nodes]
    if len(pts)<2:continue
    ways.append({'id':int(w.get('id')),'tags':tags,'p':pts})

# Architectural heights for the principal skyline, meters. The projected plan
# geometry remains the mapped outline; crown shapes are visually modeled.
HEIGHTS={113737419:152.4,248156517:135,256921821:119.2,250012923:119.8,
         752099946:132,1427733209:125,1427733210:125,247978756:86.9,
         247978758:66.8,113737423:43,938769876:63}
NAMES={248156517:'First National Center',247978756:'Leadership Square North',
       247978758:'Leadership Square South',1427733209:'Oklahoma Tower',1427733210:'Oklahoma Tower crown'}
landmark_ids=set(HEIGHTS)
building_ways=[w for w in ways if w['tags'].get('building') not in [None,'no'] or w['tags'].get('building:part')]
for w in building_ways:w['c']=centroid(w['p']);w['a']=area(w['p'])
parts=[w for w in building_ways if w['tags'].get('building:part') and number(w['tags'].get('building:levels'))>=10 and 'Devon' not in w['tags'].get('name','')]
buildings=[]
source=json.loads(gzip.open(ROOT/'scripts/data/okc-buildings-source.geojson.gz','rb').read())
for f in source['features']:
    if f['properties']['OBJECTID']==155214:continue # Devon campus is authored separately.
    polys=f['geometry']['coordinates']
    if f['geometry']['type']=='Polygon':polys=[polys]
    for poly in polys:
        p=[local(c) for c in poly[0]];a=area(p)
        if a<25:continue
        c=centroid(p)
        if not in_scene(c):continue
        # Skip mapped parts handled below, the conservatory, and the arena.
        matches=[w for w in building_ways if abs(w['c'][0]-c[0])<90 and abs(w['c'][1]-c[1])<90 and (inside(c,w['p']) or inside(w['c'],p))]
        match=min(matches,key=lambda w:abs(w['a']-a),default=None)
        tags=match['tags'] if match else {};mid=match['id'] if match else 0
        name=tags.get('name','')
        if 'Devon' in name or 'Crystal Bridge' in name or 'Paycom Center' in name:continue
        height=number(tags.get('height'))
        if tags.get('height','').endswith('ft'):height*=.3048
        provenance='OSM height' if height else ''
        if mid in HEIGHTS:height=HEIGHTS[mid];provenance='Skyline height reference'
        if not height and number(tags.get('building:levels')):
            height=number(tags['building:levels'])*3.65;provenance='OSM floors × estimated floor pitch'
        if not height:
            # A broad plan is often a one-story warehouse/retail building, not
            # evidence of a tall office. Keep unmeasured western context low.
            bt=tags.get('building','')
            if bt in ['warehouse','industrial','retail','commercial'] or tags.get('shop') or tags.get('amenity') in ['restaurant','cafe','school']:
                height=6.0
            elif c[0]<-180 and c[1]>-100:height=5.8
            else:height=8.0
            provenance='Estimated low-rise context height (not inferred from area)'
        # Base buildings with separately mapped tall parts remain low podiums.
        if any(inside(w['c'],p) for w in parts):height=min(height,12)
        kind='masonry'
        if tags.get('building')=='parking' or tags.get('parking')=='multi-storey':kind='parking';height=max(height,14)
        if mid in [752099946] or 'glass' in tags.get('building:material',''):kind='glass'
        if 'City Place' in name:kind='deco'
        if height<=8.2 and kind=='masonry':kind='retail' if tags.get('shop') or tags.get('amenity') in ['restaurant','cafe'] else 'lowrise'
        if mid==767392293:
            height=3.6;provenance='Estimated single-story garden service structure height'
        if mid==159100324:
            height=5.0;kind='carousel';provenance='Estimated canopy height; OSM identifies an open-sided carousel'
        buildings.append({'id':f['properties']['OBJECTID'],'osm':mid,'name':name,'p':p,'h':round(height,2),'kind':kind,'heightSource':provenance})
for w in parts:
    c=w['c'];tags=w['tags']
    if not in_scene(c):continue
    h=HEIGHTS.get(w['id'],number(tags.get('height')) or number(tags.get('building:levels'))*3.65)
    name=NAMES.get(w['id'],tags.get('name',''))
    kind='deco' if w['id']==248156517 else 'banded' if w['id']==113737419 else 'glass'
    buildings.append({'id':w['id'],'osm':w['id'],'name':name,'p':w['p'],'h':h,'kind':kind,'heightSource':'Skyline height reference' if w['id'] in HEIGHTS else 'OSM floors × estimated floor pitch'})
for w in building_ways:
    if w['id'] in [142407294,273612773] and not any(b['osm']==w['id'] for b in buildings):
        buildings.append({'id':w['id'],'osm':w['id'],'name':w['tags'].get('name',''),'p':w['p'],'h':number(w['tags'].get('building:levels'))*3.65,'kind':'parking','heightSource':'OSM floors × estimated floor pitch'})

roads=[];surfaces=[];renosegments=[];paths=[]
for w in ways:
    t=w['tags'];p=w['p'];name=t.get('name','');hw=t.get('highway')
    if hw in ['footway','path','pedestrian'] and any(-200<q[0]<130 and 35<q[1]<300 for q in p):
        paths.append({'id':w['id'],'p':p,'width':max(1.5,min(5,number(t.get('width')) or 2.4))})
    if hw in ['primary','secondary','tertiary','unclassified','residential','living_street','service','primary_link','secondary_link']:
        if hw=='service' and t.get('service') in ['parking_aisle','driveway']:continue
        if not any(in_scene(q) for q in p):continue
        lanes=number(t.get('lanes')) or (1 if t.get('oneway')=='yes' else 2)
        width=max(5.5,min(24,lanes*3.5+1.2))
        roads.append({'id':w['id'],'name':name,'p':p,'w':round(width,1),'kind':hw,'lanes':lanes,'oneway':t.get('oneway')=='yes'})
        if name=='West Reno Avenue' or name=='East Reno Avenue':renosegments.extend(list(zip(p,p[1:])))
    if p[0]!=p[-1] or len(p)<4:continue
    c=centroid(p)
    if not in_scene(c):continue
    kind=None
    if t.get('natural')=='water' or t.get('water'):kind='water'
    elif t.get('leisure') in ['park','garden','dog_park'] or t.get('landuse') in ['grass','recreation_ground'] or t.get('natural') in ['wood','scrub']:kind='grass'
    elif t.get('amenity')=='parking' and not t.get('building'):kind='parking'
    elif t.get('area:highway') or hw=='pedestrian':kind='plaza'
    if kind and area(p)>25:surfaces.append({'id':w['id'],'name':name,'kind':kind,'p':p})
route=[]
for x in range(-1500,1051,15):
    z=[]
    for a,b in renosegments:
        if min(a[0],b[0])<=x<=max(a[0],b[0]) and abs(b[0]-a[0])>.01:
            z.append(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]))
    route.append([x,round(sum(z)/len(z),2) if z else (route[-1][1] if route else 292)])
trees=[]
for n in doc.findall('node'):
    t={a.get('k'):a.get('v') for a in n.findall('tag')}
    if t.get('natural')=='tree':
        p=local([float(n.get('lon')),float(n.get('lat'))])
        if in_scene(p):trees.append(p)
features=[]
for w in ways:
    if w['tags'].get('name') in ['Crystal Bridge Tropical Conservatory','Paycom Center','Myriad Botanical Gardens']:
        features.append({'name':w['tags']['name'],'p':w['p'],'center':centroid(w['p'])})

data={'origin':ORIGIN,'axis':'x east, z south; meters','route':route,'roads':roads,'buildings':buildings,'surfaces':surfaces,'paths':paths,'trees':trees,'features':features}
(ROOT/'dist/city-data.js').write_text('// Generated geographic snapshot; see geo/provenance.json.\nexport const CITY_DATA='+json.dumps(data,separators=(',',':'))+';\n')
provenance={
 'origin':ORIGIN,'originMethod':'Centroid of OpenStreetMap Devon Energy Tower building:part way156035399',
 'retrievedUTC':'2026-11-24','footprints':{'source':'City of Oklahoma City / Esri Community Maps contributors','url':'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/Oklahoma_City_OK_Buildings/FeatureServer/0','bbox':[-97.535,35.457,-97.500,35.477],'dataEditUTC':'2022-10-03','countRendered':len(buildings)},
 'streetsAndContext':{'source':'© OpenStreetMap contributors','license':'Open Database License (ODbL)','copyrightURL':'https://www.openstreetmap.org/copyright','queryURL':'https://api.openstreetmap.org/api/0.6/map?bbox=-97.535,35.459,-97.503,35.474','roads':len(roads),'trees':len(trees)},
 'heightReference':'https://www.skyscrapercenter.com/city/oklahoma-city',
 'nightLighting':'Eight non-shadowing point lights at modeled lamp locations illuminate the western approach. More distant lamps use soft ground-only light-pool overlays. Intensities are visual approximations, not a photometric survey.',
 'limits':['Geographic footprint/street placement is mapped; supporting heights without tags are estimates.','Road widths are reconstructed from OSM lane counts; turning pockets and traffic signal timing are simplified.','Ground elevation is flattened; this is not a surveyed terrain model.','Landmark crowns and facades are visual reconstructions, not original construction models.','Garden paths follow mapped ways; supplementary park planting is illustrative and not a surveyed tree inventory.'],
 'route':{'start':route[0],'end':route[-1],'lengthApproxMeters':2550,'laneBase':5.25,'laneSpacing':3.5,'laneLimit':1.75}}
(ROOT/'dist/geo/provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print(json.dumps({'buildings':len(buildings),'roads':len(roads),'surfaces':len(surfaces),'trees':len(trees),'routeStart':route[0],'routeEnd':route[-1],'bytes':(ROOT/'dist/city-data.js').stat().st_size}))
