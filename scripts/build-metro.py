#!/usr/bin/env python3
"""Bake a continuous OKC metro into 512m tiles from checked-in public inputs.

Geometry is geographically observed. Unknown heights, road widths and facade
style are explicit estimates. The original hand-refined downtown remains owned
by the original compiler; new road meshes subtract that rectangle.
"""
from pathlib import Path
from collections import Counter, defaultdict
import gzip, hashlib, json, math, os, re, time
from shapely import make_valid
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box, shape
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree
from metro_geometry import polygons, polygon_records, partition_street_surfaces
from metro_output import write_json

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('OKC_BUILD_OUTPUT', ROOT / 'dist')) / 'geo/metro'
CACHE = ROOT / 'scripts/data'
CONFIG = json.loads((ROOT / 'public/geo/metro-region.json').read_text())
ORIGIN = CONFIG['origin']
BBOX = CONFIG['bbox']
MX = 111320 * math.cos(math.radians(ORIGIN[1]))
MZ = 111132
TILE = CONFIG['tileSizeMeters']
CB = CONFIG['coreBoundsMeters']
CORE = box(CB['minX'], CB['minZ'], CB['maxX'], CB['maxZ'])
REGION = box((BBOX[0]-ORIGIN[0])*MX, -(BBOX[3]-ORIGIN[1])*MZ,
             (BBOX[2]-ORIGIN[0])*MX, -(BBOX[1]-ORIGIN[1])*MZ)
BOUNDS = dict(zip(('minX','minZ','maxX','maxZ'), [round(n,2) for n in REGION.bounds]))
DRIVEABLE = {'motorway','motorway_link','trunk','trunk_link','primary','primary_link',
             'secondary','secondary_link','tertiary','tertiary_link','unclassified',
             'residential','living_street','service','road'}
WALK = {'footway','path','pedestrian','cycleway','steps','track'}
CATEGORIES = [
 ('seasonal','Christmas & seasonal','#d9cf95'),('breakfast','Breakfast','#ebbd85'),
 ('garden','Gardens','#98c6a3'),('nature','Nature','#7bc9aa'),('scenic','Scenic places','#8fc6db'),
 ('subway','Subway','#f9d64a'),('mexican','Sit-down Mexican','#ff9778'),
 ('asian','Asian food','#ffb18e'),('buffet','Buffets','#eeb5d8'),
 ('arcade','Arcades','#c7a1ff'),('bowling','Bowling','#9fbbff'),('bar','Bars & pubs','#d8a9ff'),
 ('discount','Bargain stores','#a8de83'),('outlet','Outlets','#b7df90'),
 ('market','Markets','#ffe4a6'),('thrift','Thrift & vintage','#efb8ce'),('grocery','Groceries','#a9dcbb'),
 ('fast_food','Quick bites','#dfb096'),('restaurant','Restaurants','#ffc19c'),('cafe','Coffee & tea','#d9bba5'),('dessert','Desserts','#f3bdd7'),
 ('park','Parks & ducks','#83cda5'),('water','Lakes & waterways','#69b8e6'),
 ('aquarium','Aquariums','#77dcdd'),('museum','Museums','#bbd0e3'),
 ('entertainment','Things to do','#b9a1e6'),('landmark','Landmarks','#d8c397'),
 ('fuel','Fuel','#bebcc5'),('parking','Parking','#a2b4c8'),('hotel','Hotels','#9db7d9'),
 ('shopping','Shopping','#e1c19a'),('health','Health','#c5cecf'),('education','Education','#b7c1cd'),
 ('transit','Transit','#b1cace'),('services','Services','#bdc1c5'),('other','Other places','#bcbfc6'),
]
DISTRICTS = [
 ('Yukon',-97.7625,35.5067),('West Reno',-97.685,35.464),('Bethany',-97.632,35.518),
 ('Warr Acres',-97.618,35.540),('Lake Overholser',-97.663,35.498),('Windsor District',-97.604,35.494),
 ('Lake Hefner',-97.594,35.570),('Quail Springs',-97.563,35.610),('Asian District',-97.535,35.507),
 ('Plaza District',-97.551,35.486),('Midtown',-97.522,35.479),('Automobile Alley',-97.514,35.477),
 ('Film Row',-97.525,35.466),('Downtown',-97.515,35.467),('Bricktown',-97.506,35.464),
 ('Capitol Hill',-97.519,35.440),('Stockyards City',-97.557,35.453),('South OKC',-97.590,35.425),
]


def load(name):
    path = CACHE / name
    if not path.exists():
        raise RuntimeError(f'Missing geographic source {path.name}; run scripts/import-metro.py explicitly.')
    return json.load(gzip.open(path, 'rt'))


def local(lon, lat):
    return [round((lon-ORIGIN[0])*MX,2), round(-(lat-ORIGIN[1])*MZ,2)]


def world_points(coords):
    return [local(p['lon'],p['lat']) if isinstance(p,dict) else local(p[0],p[1]) for p in coords if p and (not isinstance(p,dict) or 'lon' in p)]


def geometry_sequences(coords):
    sequences=[];current=[]
    for p in coords:
        if p and 'lon' in p:
            current.append(local(p['lon'],p['lat']))
        elif current:
            sequences.append(current);current=[]
    if current:sequences.append(current)
    return sequences


def number(value, default=0):
    match = re.search(r'[-+]?\d+(?:\.\d+)?',str(value or ''))
    return float(match[0]) if match else default


def element_polygons(e):
    if e['type']=='way':
        geom=e.get('geometry',[])
        if any(not v or 'lon' not in v for v in geom):return []
        p=world_points(geom)
        if len(p)<4 or p[0]!=p[-1]:return []
        return polygons(make_valid(Polygon(p)))
    if e['type']!='relation':return []
    outer=[];inner=[]
    for m in e.get('members',[]):
        for p in geometry_sequences(m.get('geometry',[])):
            if len(p)<2:continue
            (inner if m.get('role')=='inner' else outer).append(LineString(p))
    if not outer:return []
    shells=list(polygonize(unary_union(outer)))
    voids=list(polygonize(unary_union(inner))) if inner else []
    if voids:
        subtract=unary_union(voids)
        shells=[s.difference(subtract) for s in shells]
    return [p for s in shells for p in polygons(make_valid(s))]


def tile_key(x,z):return f'{math.floor(x/TILE)}_{math.floor(z/TILE)}'


def tile_keys(g):
    a,b,c,d=g.bounds
    return [(x,z) for x in range(math.floor(a/TILE),math.floor(c/TILE)+1)
                  for z in range(math.floor(b/TILE),math.floor(d/TILE)+1)]


def tile(x,z):
    key=f'{x}_{z}'
    if key not in TILES:TILES[key]={'id':key,'ix':x,'iz':z,'buildings':[],'roads':[],'surfaces':[],'details':[],'meshes':[]}
    return TILES[key]


def district(lon,lat):
    if lon < -97.705:return 'Yukon'
    if lon < -97.612 and lat>35.510 and lat<35.550:return 'Bethany'
    if lat>35.598:return 'North OKC'
    if lat>35.540 and lon>-97.625 and lon<-97.565:return 'Lake Hefner'
    if lat<35.452:return 'South OKC'
    if lon< -97.565:return 'West OKC'
    name,_,_=min(DISTRICTS,key=lambda d:((d[1]-lon)*MX)**2+((d[2]-lat)*MZ)**2)
    return name


def classify(t):
    name=(t.get('name','')+' '+t.get('brand','')).lower();amen=t.get('amenity','');shop=t.get('shop','');tour=t.get('tourism','');lei=t.get('leisure','');cuisine=t.get('cuisine','').lower()
    if t.get('brand:wikidata')=='Q244457' or re.search(r'\bsubway\b',name):return 'subway'
    if tour=='aquarium':return 'aquarium'
    if lei=='bowling_alley' or 'bowling' in name or t.get('sport')=='10pin':return 'bowling'
    if lei=='amusement_arcade' or amen=='amusement_arcade' or 'arcade' in name or 'retro' in name and amen in ['bar','pub']:return 'arcade'
    if amen in ['bar','pub','biergarten']:return 'bar'
    if amen=='restaurant' and ('mexican' in cuisine or 'tex-mex' in cuisine):return 'mexican'
    if amen in ['restaurant','fast_food'] and ('buffet' in name or t.get('self_service')=='buffet'):return 'buffet'
    if amen in ['restaurant','fast_food'] and any(k in cuisine for k in ['chinese','vietnamese','japanese','korean','thai','asian','sushi']):return 'asian'
    if shop=='second_hand' or any(s in name for s in ['goodwill','thrift','salvation army','vintage','antique']):return 'thrift'
    if t.get('outlet')=='yes' or 'outlet' in name:return 'outlet'
    if shop in ['variety_store','discount'] or any(s in name for s in ["ollie",'big lots','dollar general','dollar tree','bargain']):return 'discount'
    if amen=='marketplace' or shop=='farm':return 'market'
    if shop in ['supermarket','convenience','greengrocer','deli','butcher','seafood','food','spices']:return 'grocery'
    if shop in ['ice_cream','confectionery','bakery','pastry','chocolate'] or amen=='ice_cream':return 'dessert'
    if amen=='cafe':return 'cafe'
    if amen=='fast_food':return 'fast_food'
    if amen in ['restaurant','food_court']:return 'restaurant'
    if lei in ['park','garden','dog_park','nature_reserve'] or t.get('boundary')=='protected_area':return 'park'
    if t.get('natural')=='water' or t.get('water'):return 'water'
    if tour in ['museum','gallery'] or amen=='planetarium':return 'museum'
    if tour in ['theme_park','zoo','attraction'] or amen in ['cinema','theatre','nightclub','casino'] or lei in ['water_park','miniature_golf','escape_game','sports_centre','ice_rink']:return 'entertainment'
    if tour in ['artwork','viewpoint'] or t.get('historic'):return 'landmark'
    if amen=='fuel':return 'fuel'
    if amen=='parking':return 'parking'
    if tour in ['hotel','motel','hostel','guest_house','apartment']:return 'hotel'
    if amen in ['hospital','clinic','pharmacy','doctors','dentist']:return 'health'
    if amen in ['school','college','university','kindergarten','library']:return 'education'
    if t.get('public_transport') or t.get('railway')=='station':return 'transit'
    if shop:return 'shopping'
    if amen in ['bank','atm','post_office','police','fire_station'] or t.get('office'):return 'services'
    return 'other'


def write(path,value):
    return write_json(path,value,compressed=path.parent.name=='tiles' or path.name in ['manifest.json','overview.json','pois.json','network.json'])


def simplify_points(p,tol):
    if len(p)<3:return p
    return [[round(x,2),round(z,2)] for x,z in LineString(p).simplify(tol).coords]


started=time.monotonic()
OUTPUT.mkdir(parents=True,exist_ok=True)
TILES={};ROAD_MESH=defaultdict(lambda:defaultdict(list));WALK_MESH=defaultdict(list)
source_roads=load('metro-osm-roads.json.gz')
source_surfaces=load('metro-osm-surfaces.json.gz')
source_pois=load('metro-osm-pois.json.gz')
source_buildings=load('metro-osm-buildings.json.gz')
source_details=load('metro-osm-details.json.gz')
foot_meta=load('metro-footprints-metadata.json.gz')
for source in [source_roads,source_surfaces,source_pois,source_buildings,source_details,foot_meta]:
    if source['snapshot']['bbox']!=BBOX:
        raise RuntimeError('Region changed without matching saved map data; explicitly refresh geographic inputs first.')
curated_path=CACHE/'metro-curated-pois.json.gz'
curated_input=json.load(gzip.open(curated_path,'rt')) if curated_path.exists() else {}
tag_corrections={r['id']:r for r in curated_input.get('tagCorrections',[])} if isinstance(curated_input,dict) else {}
print('Metro: loaded all source snapshots',flush=True)

# Actual OSM node identities preserve real junctions and grade separation.
network_nodes=[];network_ids=[];node_lookup={};network_roads=[];overview_roads=[];all_road_count=0
for e in source_roads['elements']:
    t=e.get('tags',{});kind=t.get('highway');geo=e.get('geometry',[]);osm_nodes=e.get('nodes',[])
    if kind not in DRIVEABLE|WALK or len(geo)<2:continue
    p=world_points(geo);line=LineString(p)
    if not line.intersects(REGION):continue
    oneway=t.get('oneway') in ['yes','1','true','-1'] or t.get('junction')=='roundabout'
    if t.get('oneway')=='-1':p.reverse();osm_nodes=list(reversed(osm_nodes))
    lanes=number(t.get('lanes'),1 if oneway else 2)
    lane_width=3.5 if kind in ['motorway','trunk','primary'] else 3.2
    width=number(t.get('width')) or (max(3,min(26,lanes*lane_width+.8)) if kind in DRIVEABLE else 2.2)
    if t.get('service') in ['driveway','parking_aisle']:width=min(width,4.2 if t.get('service')=='driveway' else 5.2)
    layer=int(number(t.get('layer')));bridge=t.get('bridge') not in [None,'no'];tunnel=t.get('tunnel') not in [None,'no']
    road={'id':f'osm:way/{e["id"]}','name':t.get('name',t.get('ref','')),'kind':kind,'p':p,'w':round(width,1),'lanes':lanes,'oneway':oneway,'layer':layer,'bridge':bridge,'tunnel':tunnel}
    if t.get('service'):road['service']=t['service']
    all_road_count+=1
    if kind in DRIVEABLE and t.get('access') not in ['no','private'] and t.get('motor_vehicle') not in ['no','private'] and t.get('motorcar') not in ['no','private']:
        runs=[];n=[]
        for nodeid,point in zip(osm_nodes,p):
            if not (BOUNDS['minX']<=point[0]<=BOUNDS['maxX'] and BOUNDS['minZ']<=point[1]<=BOUNDS['maxZ']):
                if len(n)>1:runs.append(n)
                n=[];continue
            if nodeid not in node_lookup:
                node_lookup[nodeid]=len(network_nodes);network_nodes.append(point);network_ids.append(nodeid)
            n.append(node_lookup[nodeid])
        if len(n)>1:runs.append(n)
        for n in runs:
            network_roads.append({k:v for k,v in road.items() if k!='p'}|{'n':n,'access':t.get('access','yes'),'maxspeed':t.get('maxspeed','')})
    # All source roads remain available in the tile; overview drops unnamed
    # individual driveways to keep the full-metro map light.
    if road['name'] or kind not in ['service','footway','path','steps']:
        overview_roads.append(road|{'p':simplify_points(p,1.2)})
    buffer=line.buffer(width/2,cap_style=2,join_style=2).intersection(REGION)
    if buffer.is_empty:continue
    y=round(max(layer*5.0,5.0 if bridge and not tunnel else 0),2)
    for ix,iz in tile_keys(buffer):
        rect=box(ix*TILE,iz*TILE,(ix+1)*TILE,(iz+1)*TILE)
        clipped=buffer.intersection(rect)
        if clipped.is_empty:continue
        dest=tile(ix,iz)
        # Centerline pieces are used for names/selection; exclude out-of-tile
        # geometry from payloads while preserving original source identity.
        cut=line.intersection(rect)
        lines=[cut] if cut.geom_type=='LineString' else list(cut.geoms) if cut.geom_type=='MultiLineString' else []
        for seg in lines:
            dest['roads'].append(road|{'p':[[round(x,2),round(z,2)] for x,z in seg.coords]})
        key=dest['id']
        if kind in DRIVEABLE:
            ROAD_MESH[key][y].append(clipped)
            if y==0 and kind not in ['motorway','motorway_link','trunk','trunk_link','service']:
                WALK_MESH[key].append(line.buffer(width/2+1.7,cap_style=2,join_style=2).intersection(rect))
        else:WALK_MESH[key].append(clipped)
print(f'Metro: {all_road_count} ways, {len(network_nodes)} graph nodes, {len(network_roads)} routable ways',flush=True)

# Polygon relations keep mapped lake and park holes, rather than replacing
# shorelines with ellipses. Skip member ways already owned by a relation.
owned=set()
for e in source_surfaces['elements']:
    if e['type']=='relation':
        owned.update(m['ref'] for m in e.get('members',[]) if m['type']=='way')
overview_surfaces=[];surface_count=0
for e in source_surfaces['elements']:
    t=e.get('tags',{})
    if e['type']=='way' and e['id'] in owned:continue
    ps=element_polygons(e)
    if t.get('natural')=='water' or t.get('water'):kind='water'
    elif t.get('waterway'):
        if not ps and e['type']=='way' and len(e.get('geometry',[]))>=2:
            # Widths of rivers without tags are visual estimates.
            ps=[LineString(p).buffer(number(t.get('width'),8)/2) for p in geometry_sequences(e['geometry']) if len(p)>1]
        elif not ps:continue
        kind='water'
    elif t.get('amenity')=='parking' and not t.get('building'):kind='parking'
    elif t.get('natural') in ['wood','scrub']:kind='wood'
    elif t.get('natural')=='wetland':kind='wetland'
    else:kind='park'
    for j,poly in enumerate(ps):
        poly=poly.intersection(REGION)
        if poly.is_empty or poly.area<5:continue
        surface_count+=1
        rec={'id':f'osm:{e["type"]}/{e["id"]}:{j}','name':t.get('name',''),'kind':kind}
        if kind!='parking':
            for pg in polygon_records(poly.simplify(2,preserve_topology=True)):
                overview_surfaces.append(rec|pg)
        for ix,iz in tile_keys(poly):
            clipped=poly.intersection(box(ix*TILE,iz*TILE,(ix+1)*TILE,(iz+1)*TILE))
            if clipped.is_empty:continue
            for pg in polygon_records(clipped):tile(ix,iz)['surfaces'].append(rec|pg)
print(f'Metro: {surface_count} mapped land/water polygons',flush=True)

# Match buildings by actual overlapping polygon coverage. OSM tags add metadata;
# the GIS footprint is never replaced by a guessed procedural rectangle.
osm_geoms=[];osm_meta=[];osm_identities=[]
for e in source_buildings['elements']:
    t=e.get('tags',{})
    if t.get('building')=='no' or not t.get('building') or t.get('building:part'):continue
    parts=element_polygons(e)
    for poly in parts:
        if poly.area<8 or not poly.intersects(REGION):continue
        identity=f'osm:{e["type"]}/{e["id"]}'
        if len(parts)>1:
            identity+=':part-'+hashlib.sha256(poly.normalize().wkb).hexdigest()[:12]
        osm_geoms.append(poly);osm_meta.append(e);osm_identities.append(identity)
osm_tree=STRtree(osm_geoms) if osm_geoms else None
matched_osm=set();building_geoms=[];building_ids=[];building_meta=[];height_counts=Counter();duplicate_keys=set();building_count=0


def add_building(poly,identity,tags,source):
    global building_count
    if poly.area<8 or not poly.intersects(REGION):return
    c=poly.representative_point();cx,cz=round(c.x,2),round(c.y,2)
    if not REGION.contains(c):return
    ring=list(poly.exterior.coords)
    fingerprint=tuple(sorted((round(x,1),round(z,1)) for x,z in ring[:-1]))
    if fingerprint in duplicate_keys:return
    duplicate_keys.add(fingerprint)
    kind=tags.get('building','yes');h=number(tags.get('height'))
    provenance='OSM height' if h else ''
    if h and re.search(r'\bft\b|feet|\x27',str(tags.get('height'))):h*=.3048
    if not h and number(tags.get('building:levels')):
        h=number(tags['building:levels'])*3.2;provenance='OSM levels × estimated 3.2 m floor pitch'
    if not h:
        if kind in ['house','detached','semidetached_house','bungalow','residential','garage','garages','shed'] or poly.area<250:
            h=4.8 if poly.area>=70 else 3.0;provenance='Estimated low-rise height'
        elif kind in ['warehouse','industrial','retail','commercial','supermarket']:h=6.5;provenance='Estimated commercial height'
        elif kind in ['apartments','hotel']:h=10;provenance='Estimated multi-storey height'
        else:h=6;provenance='Estimated context height'
    h=max(2,min(350,h));height_counts[provenance]+=1
    pg=polygon_records(poly)[0]
    rec={'id':identity,**pg,'h':round(h,2),'kind':kind,'name':tags.get('name',''),
         'heightSource':provenance,'footprintSource':source,'center':[cx,cz],
         'roof':tags.get('roof:shape','unknown'),'roofSource':'OSM tag' if tags.get('roof:shape') else 'unknown',
         'material':tags.get('building:material','unknown')}
    roof_height=number(tags.get('roof:height'))
    if roof_height>0:
        if re.search(r'\bft\b|feet|\x27',str(tags.get('roof:height'))):roof_height*=.3048
        rec['roofHeight']=round(roof_height,2);rec['roofHeightSource']='OSM roof:height'
    roof_direction=number(tags.get('roof:direction'),None)
    if roof_direction is not None:
        rec['roofDirection']=roof_direction%360;rec['roofDirectionSource']='OSM roof:direction'
    if tags.get('roof:orientation') in ['along','across']:
        rec['roofOrientation']=tags['roof:orientation']
    if tags.get('addr:street'):rec['address']=' '.join([tags.get('addr:housenumber',''),tags['addr:street']]).strip()
    tile(math.floor(cx/TILE),math.floor(cz/TILE))['buildings'].append(rec)
    building_geoms.append(poly);building_ids.append(identity);building_meta.append(rec);building_count+=1

page_count=math.ceil(len(foot_meta['snapshot']['objectIds'])/foot_meta['snapshot']['pageSize'])
for page in range(page_count):
    source=load(f'metro-footprints-{page:04d}.geojson.gz')
    page_size=foot_meta['snapshot']['pageSize']
    expected_ids=set(foot_meta['snapshot']['objectIds'][page*page_size:(page+1)*page_size])
    page_ids=[feature['properties']['OBJECTID'] for feature in source['features']]
    if len(page_ids)!=len(expected_ids) or set(page_ids)!=expected_ids:
        raise RuntimeError(f'Footprint page {page} does not match its source inventory; refresh inputs explicitly.')
    for feature in source['features']:
        geo=feature.get('geometry')
        if not geo:continue
        coords=geo['coordinates'] if geo['type']=='MultiPolygon' else [geo['coordinates']]
        for part,rings in enumerate(coords):
            try:poly=make_valid(Polygon(world_points(rings[0]),[world_points(r) for r in rings[1:]]))
            except (ValueError,KeyError):continue
            for sub,p in enumerate(polygons(poly)):
                if p.area<8 or not p.intersects(REGION):continue
                tags={};best=None;best_overlap=0
                if osm_tree is not None:
                    for index in osm_tree.query(p):
                        other=osm_geoms[index]
                        overlap=p.intersection(other).area/min(p.area,other.area)
                        if overlap>.55 and overlap>best_overlap:best=index;best_overlap=overlap
                if best is not None:tags=osm_meta[best].get('tags',{});matched_osm.add(int(best))
                identity=f'gis:okc/{feature["properties"]["OBJECTID"]}'
                if part or sub:identity+=f':{part}:{sub}'
                add_building(p,identity,tags,'City of Oklahoma City / Esri Community Maps')
    if page%25==0:print(f'Metro footprints {page+1}/{page_count}: {building_count}',flush=True)
# Fill source coverage holes with OSM polygons, avoiding duplicate overlapping
# shells from adjacent/imported records, including city-boundary seams.
gis_tree=STRtree(building_geoms) if building_geoms else None
for index,(p,e) in enumerate(zip(osm_geoms,osm_meta)):
    if index in matched_osm:continue
    duplicate=False
    if gis_tree is not None:
        for j in gis_tree.query(p):
            if p.intersection(building_geoms[j]).area/min(p.area,building_geoms[j].area)>.45:
                duplicate=True;break
    if not duplicate:add_building(p,osm_identities[index],e.get('tags',{}),'OpenStreetMap contributors')
print(f'Metro: {building_count} unique mapped footprints',flush=True)

# Source-tagged points, kept separate from businesses and polygon ownership.
for e in source_details['elements']:
    if e['type']!='node' or 'lon' not in e:continue
    p=local(e['lon'],e['lat']);t=e.get('tags',{})
    if not REGION.contains(Point(p)):continue
    kind='tree' if t.get('natural')=='tree' else (t.get('highway') or ('entrance' if t.get('entrance') else 'barrier'))
    tile(math.floor(p[0]/TILE),math.floor(p[1]/TILE))['details'].append({'id':f'osm:node/{e["id"]}','p':p,'kind':kind,'tags':t})

# A spatial index ties businesses to actual containing buildings. Coordinates
# from OSM way centers are explicitly marked as centers rather than doors.
all_tree=STRtree(building_geoms) if building_geoms else None
building_id_set=set(building_ids)
pois=[];poi_ids=set();poi_counts=Counter()
for e in source_pois['elements']:
    correction=tag_corrections.get(f'osm:{e["type"]}/{e["id"]}',{})
    t={**e.get('tags',{}),**correction.get('tags',{})};name=t.get('name') or t.get('brand')
    # Unnamed parking and useful practical infrastructure remain searchable;
    # unnamed individual benches/bins/toilets do not inflate the POI catalog.
    category=correction.get('category') or classify(t)
    if not name and category not in ['parking','fuel','park','transit']:continue
    center=e if e['type']=='node' else e.get('center',{})
    if 'lon' not in center:continue
    lon,lat=center['lon'],center['lat'];x,z=local(lon,lat)
    if not REGION.contains(Point(x,z)):continue
    identity=f'osm:{e["type"]}/{e["id"]}'
    if identity in poi_ids:continue
    poi_ids.add(identity)
    address=t.get('addr:full') or ' '.join([t.get('addr:housenumber',''),t.get('addr:street','')]).strip()
    building_id=None
    if all_tree is not None:
        matches=all_tree.query(Point(x,z),predicate='within')
        if len(matches):building_id=building_ids[min(matches,key=lambda j:building_geoms[j].area)]
    relevant=[f'{k}:{v}' for k,v in t.items() if k in ['amenity','shop','cuisine','leisure','tourism','brand','sport','outlet','access','wheelchair','indoor','outdoor_seating']]
    rec={'id':identity,'name':name or ('Parking' if category=='parking' else category.title()),
         'category':category,'tags':relevant,'x':x,'z':z,'lat':lat,'lon':lon,'address':address,
         'district':district(lon,lat),'website':t.get('website',t.get('contact:website','')),
         'hours':t.get('opening_hours',''),'phone':t.get('phone',t.get('contact:phone','')),
         'source':'OpenStreetMap contributors','sourceUrl':f'https://www.openstreetmap.org/{e["type"]}/{e["id"]}',
         'verifiedAt':source_pois['snapshot']['retrievedUTC'][:10],'verification':'Imported map record; business details not individually verified',
         'coordinateSource':'OSM node' if e['type']=='node' else 'OSM bounding-box center',
         'buildingId':building_id,'brand':t.get('brand',''),'cuisine':t.get('cuisine',''),
         'indoor':category not in ['park','water','landmark','fuel','parking']}
    if correction:
        rec['metadataCorrections']=correction
    pois.append(rec);poi_counts[category]+=1
# Official venue research supersedes duplicate imported business records while
# retaining separate tenant/building identities. Source snapshots remain intact.
curated_path=CACHE/'metro-curated-pois.json.gz'
curated_count=0;curated_unlocated=0;curated_replaced=0
if curated_path.exists():
    researched=curated_input
    records=researched if isinstance(researched,list) else researched.get('places',researched.get('pois',[]))
    for raw in records:
        rec=dict(raw)
        rec['curated']=True;rec['priority']=True
        rec['source']='Verified venue / tourism source'
        rec['sourceUrl']=next(iter(rec.get('sourceUrls',[])),rec.get('website',''))
        rec['verification']='Venue details researched '+str(rec.get('verifiedAt',''))
        if rec.get('brand','').lower()=='subway' or rec.get('name','').lower().startswith('subway'):
            rec['category']='subway'
        lat,lon=rec.get('lat'),rec.get('lon')
        if isinstance(lat,(int,float)) and isinstance(lon,(int,float)):
            x,z=local(lon,lat);rec.update(x=x,z=z)
            if not REGION.contains(Point(x,z)):continue
            matches=all_tree.query(Point(x,z),predicate='within') if all_tree is not None else []
            supplied_id=rec.get('buildingId')
            uncertain_pin=any(token in rec.get('coordinateAccuracy','').lower() for token in ['street-range','campus center','shopping-center location'])
            if supplied_id in building_id_set:
                rec['buildingId']=supplied_id
                rec['buildingAssociation']='reference-inspected footprint association'
            elif uncertain_pin:
                rec['buildingCandidateId']=building_ids[min(matches,key=lambda j:building_geoms[j].area)] if len(matches) else None
                rec['buildingId']=None
                rec['buildingAssociation']='approximate location; storefront footprint requires inspection'
            else:
                rec['buildingId']=building_ids[min(matches,key=lambda j:building_geoms[j].area)] if len(matches) else None
                rec['buildingAssociation']='containing mapped footprint at source coordinate' if len(matches) else 'unmatched'
            if not rec['buildingId'] and not uncertain_pin and rec.get('entrance') and all_tree is not None:
                candidate=all_tree.nearest(Point(x,z))
                if candidate is not None and building_geoms[candidate].distance(Point(x,z))<18:
                    rec['buildingId']=building_ids[candidate]
                    rec['buildingAssociation']='nearest footprint within 18 m of official location; inspect entrance'
            # Exact source identity is the strongest dedupe signal. Otherwise
            # use the same normalized business name within a small radius.
            cited_ids=set(rec.get('sourceUrls',[])+[rec.get('coordinateSource','')])
            norm=lambda name: re.sub(r'[^a-z0-9]','',name.lower().replace('the ',''))
            candidates=[]
            for old in pois:
                if old.get('curated'):continue
                explicit_osm=str(rec.get('osmId',''))
                if explicit_osm and not explicit_osm.startswith('osm:'):explicit_osm='osm:'+explicit_osm
                same_source=old.get('sourceUrl') in cited_ids or old['id']==explicit_osm
                same_name=norm(old['name'])==norm(rec['name'])
                same_subway=old.get('category')=='subway' and rec['category']=='subway'
                near=(old['x']-x)**2+(old['z']-z)**2 < (150 if same_subway else 90)**2
                if same_source or (near and (same_name or same_subway)):
                    candidates.append(old['id'])
            if candidates:
                rec['alternateSourceIds']=candidates
                pois=[old for old in pois if old['id'] not in candidates]
                curated_replaced+=len(candidates)
            for key in ['entrance','vehicleAccess']:
                q=rec.get(key)
                if q and isinstance(q.get('lon'),(int,float)) and isinstance(q.get('lat'),(int,float)):
                    q=dict(q);q['x'],q['z']=local(q['lon'],q['lat']);rec[key]=q
        else:
            rec.update(x=None,z=None,buildingId=None,buildingAssociation='unlocated')
            curated_unlocated+=1
        rec.setdefault('district',district(lon,lat) if isinstance(lon,(int,float)) and isinstance(lat,(int,float)) else 'OKC metro')
        pois.append(rec);curated_count+=1
poi_counts=Counter(p['category'] for p in pois)
print(f'Metro: {len(pois)} POIs incl {curated_count} curated, {curated_replaced} source duplicates merged, {curated_unlocated} unlocated',flush=True)


# Union each elevation layer once; sidewalk meshes own only the difference.
# This prevents a pile of overlapping road ribbons at every intersection.
for i,(key,dest) in enumerate(sorted(TILES.items())):
    dest['meshes'].extend(partition_street_surfaces(ROAD_MESH.get(key,{}),WALK_MESH.get(key,[]),CORE))
    if i%400==0:print(f'Metro surfaces {i}/{len(TILES)} tiles',flush=True)

manifest_tiles=[]
for key,dest in sorted(TILES.items()):
    if not any(dest[k] for k in ['buildings','roads','surfaces','details','meshes']):continue
    path=OUTPUT/f'tiles/{key}.json';asset=write(path,dest)
    manifest_tiles.append({'id':key,'ix':dest['ix'],'iz':dest['iz'],'url':f'tiles/{key}.json',
        'gzipUrl':f'tiles/{key}.json.gz',
        'buildings':len(dest['buildings']),'roads':len(dest['roads']),'surfaces':len(dest['surfaces']),
        'details':len(dest['details']),**asset})
assets={}
assets['network']=write(OUTPUT/'network.json',{'version':1,'origin':ORIGIN,'bounds':BOUNDS,'nodes':network_nodes,'nodeIds':network_ids,'roads':network_roads})
assets['overview']=write(OUTPUT/'overview.json',{'version':1,'origin':ORIGIN,'bounds':BOUNDS,'roads':overview_roads,'surfaces':overview_surfaces,
    'districts':[{'name':name,'x':local(lon,lat)[0],'z':local(lon,lat)[1]} for name,lon,lat in DISTRICTS]})
assets['pois']=write(OUTPUT/'pois.json',{'version':1,'bounds':BOUNDS,'pois':pois,'categories':[dict(zip(('id','label','color'),c)) for c in CATEGORIES]})
limits=[
 'Footprints and street centerlines are mapped public data; source completeness varies by neighborhood.',
 'Building facades, untagged heights, lane widths and bridge elevation offsets are visual estimates, not surveyed replicas.',
 'Ground uses the existing flat local datum. OSM bridge/layer separation is approximate visual elevation.',
 'Routing uses source node connectivity and one-way tags. Turn-restriction relations and live closures are not yet included.',
 'POI hours and business status may be incomplete or stale; imported records are distinct from manually verified venue research.',
 'OSM polygon centers are not verified entrances. Entrances remain separately source-tagged where available.',
 'Source records were not all manually inspected against street-level photography.',
 'District labels use approximate reference centers, not legal neighborhood boundaries.',
]
counts={'buildings':building_count,'roads':all_road_count,'routableRoads':len(network_roads),'networkNodes':len(network_nodes),
        'surfaces':surface_count,'pois':len(pois),'curatedPois':curated_count,'unlocatedCuratedPois':curated_unlocated,'mergedPoiDuplicates':curated_replaced,'tiles':len(manifest_tiles),'heights':dict(height_counts),'poiCategories':dict(poi_counts)}
manifest={'version':1,'name':'OKC Metro / West to Downtown','origin':ORIGIN,'bbox':BBOX,'bounds':BOUNDS,
    'tileSize':TILE,'axis':'x east, z south; meters','coreBounds':CB,
    'widthMiles':round((BOUNDS['maxX']-BOUNDS['minX'])/1609.344,2),'depthMiles':round((BOUNDS['maxZ']-BOUNDS['minZ'])/1609.344,2),
    'poiDetailRadiusMeters':CONFIG['poiDetailRadiusMeters'],'counts':counts,'tiles':manifest_tiles,
    'assets':{name:{'url':name+'.json','gzipUrl':name+'.json.gz',**assets[name]} for name in ['overview','pois','network']},
    'totalTileBytes':sum(t['bytes'] for t in manifest_tiles),
    'totalTileGzipBytes':sum(t['gzipBytes'] for t in manifest_tiles),
    'sources':[{'name':'OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright','license':'ODbL 1.0',
                'retrievedAt':source_roads['snapshot']['retrievedUTC'],'osmTimestamp':source_roads.get('osm3s',{}).get('timestamp_osm_base')},
               {'name':'City of Oklahoma City / Esri Community Maps Contributors','url':foot_meta['snapshot']['url'],
                'license':'Shared by Oklahoma City as open data through Esri Community Maps data sharing',
                'retrievedAt':foot_meta['snapshot']['retrievedUTC']}], 'limits':limits}
write(OUTPUT/'manifest.json',manifest)
write(OUTPUT/'coverage-report.json',{'counts':counts,'bounds':BOUNDS,'bbox':BBOX,'limits':limits,
      'sourceFootprintRecords':len(foot_meta['snapshot']['objectIds']),'matchedOSMBuildings':len(matched_osm),
      'totalTileBytes':sum(t['bytes'] for t in manifest_tiles),
      'totalTileGzipBytes':sum(t['gzipBytes'] for t in manifest_tiles),
      'runtimeAssets':manifest['assets'],'unlocatedCuratedIds':[p['id'] for p in pois if p.get('curated') and p.get('x') is None]})
print(json.dumps({'metro':counts,'seconds':round(time.monotonic()-started,2),'output':str(OUTPUT)}),flush=True)
