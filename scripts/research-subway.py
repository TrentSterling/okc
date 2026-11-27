#!/usr/bin/env python3
"""Refresh Subway's public location directory for the explorer bounds.
Usage: python scripts/research-subway.py --output /tmp/subway.json
Coordinates and entrance/vehicle pins come from public chain JSON-LD/Yext data.
A source directory result is not a promise that every metro location is covered.
"""
import argparse,datetime
parser=argparse.ArgumentParser()
parser.add_argument('--output',default='subway-research.json')
parser.add_argument('--all',action='store_true',help='Keep locations outside explorer bounds')
args=parser.parse_args()
verified_at=datetime.date.today().isoformat()
import urllib.request,urllib.parse,re,json,time,concurrent.futures
from pathlib import Path
base='https://restaurants.subway.com'
places=['oklahoma-city','yukon','bethany','warr-acres']
links=set()
for city in places:
 u=base+'/united-states/ok/'+city
 s=urllib.request.urlopen(u,timeout=30).read().decode()
 for path in re.findall(r'href="([^"]+)"',s):
  if '/'+city+'/' in path:
   links.add(base+'/'+path[path.index('united-states/'):])
def item(u):
 try:
  s=urllib.request.urlopen(u,timeout=30).read().decode()
  ld=[json.loads(x) for x in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',s,re.S)]
  cores=[x['credentialSubject'] for x in ld if 'credentialSubject' in x]
  core=cores[0] if cores else next(y for x in ld for y in x.get('@graph',[]) if y.get('@type')=='FoodEstablishment')
  a=core['address']; geo=core.get('geo',{}); city=a.get('addressLocality','').split(',')[0]
  raw=urllib.parse.unquote(s)
  def coord(k):
   m=re.search(r'"'+k+r'":\{"latitude":(-?[\d.]+),"longitude":(-?[\d.]+)\}',raw)
   return {'lat':float(m[1]),'lon':float(m[2])} if m else None
  h=[]
  for x in core.get('openingHoursSpecification',[]):
   days=x.get('dayOfWeek',[]); days=[days] if isinstance(days,str) else days
   if x.get('opens'):
    h.append(', '.join(d.rsplit('/',1)[-1] for d in days)+': '+x['opens']+'–'+x['closes'])
  return {'id':'subway-'+u.rsplit('/',1)[-1],'name':'Subway — '+a['streetAddress'],'brand':'Subway','category':'fast_food','tags':['subway','sandwiches','chain','indoor','highlight'],'lat':geo.get('latitude'),'lon':geo.get('longitude'),'entrance':coord('yextWalkableCoordinate'),'vehicleAccess':coord('yextRoutableCoordinate'),'address':a['streetAddress']+', '+city+', OK '+a.get('postalCode',''),'district':city,'website':u,'sourceUrls':[u],'verifiedAt':verified_at,'description':'Subway sandwich shop. Official chain directory location.','price':{'kind':'unknown','currency':'USD','note':'Check the local menu; no price verified.'},'hours':'; '.join(h),'minimumAge':None,'coordinateAccuracy':'official-location','indoor':True}
 except Exception as e:
  return {'url':u,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
 rows=list(ex.map(item,sorted(links)))
if not args.all:
 rows=[x for x in rows if 'error' in x or (x.get('lon') is not None and x.get('lat') is not None and -97.80<=x['lon']<=-97.46 and 35.40<=x['lat']<=35.62)]
for row in rows:
 for key in ('name','address'):
  if key in row:row[key]=' '.join(row[key].split())
Path(args.output).write_text(json.dumps(rows,indent=2))
print(json.dumps({'count':len(rows),'with_coordinates':sum(bool(x.get('lat')) for x in rows),'errors':[x for x in rows if 'error' in x]}))
