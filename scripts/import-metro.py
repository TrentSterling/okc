#!/usr/bin/env python3
"""Refresh the checked-in metro snapshots from public geographic services.

This is an explicit maintainer action, never part of the site build/runtime.
Responses are cached losslessly in gzip with source metadata. Offline builds
must fail on missing inputs rather than invent roads or footprints.
"""
from pathlib import Path
import argparse, concurrent.futures, datetime, gzip, json, math, time
import urllib.parse, urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'scripts/data'
CONFIG = json.loads((ROOT / 'public/geo/metro-region.json').read_text())
BBOX = CONFIG['bbox']
OVERPASS = 'https://overpass-api.de/api/interpreter'
BUILDINGS = 'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/Oklahoma_City_OK_Buildings/FeatureServer/0'
AGENT = 'PrairiePrism/0.7 (open geographic importer; https://tront.xyz/okc/)'


def save(path, value):
    data = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()
    with gzip.GzipFile(filename=str(path), mode='wb', mtime=0) as f:
        f.write(data)


def request(url, form=None, timeout=120):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(form).encode() if form else None,
                                 headers={'User-Agent': AGENT, 'Accept': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                value = json.load(response)
            if value.get('error') or value.get('remark'):
                raise RuntimeError(value.get('error') or value.get('remark'))
            return value
        except Exception as exc:
            print(f'Request attempt {attempt+1} failed: {type(exc).__name__}: {exc}', flush=True)
            if attempt == 3:
                raise
            time.sleep(min(15, 3 * (attempt + 1)))


def osm(kind, query):
    path = CACHE / f'metro-osm-{kind}.json.gz'
    if path.exists() and not OPTIONS.refresh:
        print(f'Cached {path.name}', flush=True)
        return
    data = request(OVERPASS, {'data': query})
    data['snapshot'] = {'source': OVERPASS, 'query': query, 'bbox': BBOX,
                        'retrievedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(path, data)
    print(f'Fetched {kind}: {len(data.get("elements", []))} elements, {path.stat().st_size} gzip bytes', flush=True)


def building_page(item):
    index, ids = item
    path = CACHE / f'metro-footprints-{index:04d}.geojson.gz'
    if path.exists() and not OPTIONS.refresh:
        return len(ids)
    data = request(BUILDINGS + '/query', {'f': 'geojson', 'objectIds': ','.join(map(str, ids)),
                                        'outFields': '*', 'outSR': '4326', 'returnGeometry': 'true'}, timeout=90)
    if len(data.get('features', [])) != len(ids):
        raise RuntimeError(f'Incomplete building page {index}: {len(data.get("features", []))}/{len(ids)}')
    save(path, data)
    print(f'Footprints page {index}: {len(ids)} buildings', flush=True)
    return len(ids)


def footprints():
    meta_path = CACHE / 'metro-footprints-metadata.json.gz'
    if meta_path.exists() and not OPTIONS.refresh:
        meta = json.load(gzip.open(meta_path, 'rt'))
    else:
        meta = request(BUILDINGS + '?f=json')
        ids = request(BUILDINGS + '/query', {'f': 'json', 'where': '1=1',
            'geometry': ','.join(map(str, BBOX)), 'geometryType': 'esriGeometryEnvelope',
            'inSR': '4326', 'spatialRel': 'esriSpatialRelIntersects', 'returnIdsOnly': 'true'})
        meta['snapshot'] = {'url': BUILDINGS, 'bbox': BBOX, 'objectIds': sorted(ids['objectIds']),
            'retrievedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'pageSize': 2000}
        save(meta_path, meta)
    ids = meta['snapshot']['objectIds']
    print(f'Footprint inventory: {len(ids)} records', flush=True)
    batches = [(i // 2000, ids[i:i + 2000]) for i in range(0, len(ids), 2000)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        counts = list(pool.map(building_page, batches))
    print(f'Footprints complete: {sum(counts)}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Replace all saved responses')
    parser.add_argument('--only', choices=['osm', 'footprints', 'all'], default='all')
    OPTIONS = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    w, s, e, n = BBOX
    box = f'({s},{w},{n},{e})'
    pre = '[out:json][timeout:90][maxsize:268435456];'
    jobs = [
        ('roads', pre + f'way[highway]{box};out body geom;'),
        ('surfaces', pre + f'(nwr[natural~"^(water|wood|scrub|wetland)$"]{box};nwr[water]{box};nwr[waterway]{box};nwr[leisure~"^(park|garden|dog_park|nature_reserve|golf_course|pitch|playground)$"]{box};nwr[landuse~"^(grass|forest|recreation_ground)$"]{box};way[amenity=parking]{box};);out body geom{box};'),
        ('pois', pre + f'(nwr[amenity]{box};nwr[shop]{box};nwr[tourism]{box};nwr[leisure]{box};nwr[historic]{box};nwr[office]{box};nwr[railway=station]{box};nwr[public_transport=platform]{box};);out body center;'),
        ('buildings', pre + f'(way[building]{box};relation[building]{box};way["building:part"]{box};);out body geom;'),
        ('details', pre + f'(node[natural=tree]{box};node[highway~"^(traffic_signals|stop|crossing|street_lamp)$"]{box};node[entrance]{box};node[barrier]{box};);out body;'),
    ]
    if OPTIONS.only in ('all', 'osm'):
        # Two public Overpass queries at a time is deliberately bounded.
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            work = [pool.submit(osm, *job) for job in jobs]
            for future in work:
                future.result()
    if OPTIONS.only in ('all', 'footprints'):
        footprints()
