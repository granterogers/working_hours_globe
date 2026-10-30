"""
Build data/globe-data.json for the working hours globe.

Downloads the source data (cached in scripts/cache/), works out each time zone's
offset from the UK in winter and summer, simplifies and tiles the shapes, and
writes one compact JSON file the page loads.

Usage (from the repo root):
    pip install -r scripts/requirements.txt
    python scripts/build_data.py
"""
import os, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "data", "globe-data.json")
TZBB_RELEASE = "2026e"  # timezone-boundary-builder release; bump to pick up new zone changes
SOURCES = {
    "ne50.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
    "adm1.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
    "tz.zip": f"https://github.com/evansiroky/timezone-boundary-builder/releases/download/{TZBB_RELEASE}/timezones-now.geojson.zip",
    "airports.csv": "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv",
}

def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for name, url in SOURCES.items():
        path = os.path.join(CACHE, name)
        if not os.path.exists(path):
            print("Downloading", name, "...")
            urllib.request.urlretrieve(url, path)
    tzjson = os.path.join(CACHE, "combined-now.json")
    if not os.path.exists(tzjson):
        with zipfile.ZipFile(os.path.join(CACHE, "tz.zip")) as z:
            z.extractall(CACHE)

fetch()
os.chdir(CACHE)
import json
def open_utf8(p): return open(p,encoding='utf-8')
from datetime import datetime
from zoneinfo import ZoneInfo
from shapely.geometry import shape, mapping, Point
from shapely.strtree import STRtree
UK=ZoneInfo("Europe/London")
WIN=datetime(2026,12,15,12); SUM=datetime(2027,7,15,12)
def off(tz,w):
    u=w.replace(tzinfo=UK); return round((u.astimezone(ZoneInfo(tz)).utcoffset()-u.utcoffset()).total_seconds()/3600,2)
def rnd(g,p=2):
    def r(c):
        if isinstance(c[0],(int,float)): return [round(c[0],p),round(c[1],p)]
        return [r(x) for x in c]
    m=mapping(g); return {"type":m["type"],"coordinates":r(m["coordinates"])}
def clean(g,tol,minarea):
    g=g.simplify(tol,preserve_topology=True)
    if g.geom_type=='MultiPolygon':
        from shapely.geometry import MultiPolygon
        ps=[p for p in g.geoms if p.area>=minarea]
        if not ps: return None
        g=MultiPolygon(ps) if len(ps)>1 else ps[0]
    elif g.area<minarea: return None
    return g
from shapely.ops import unary_union
from shapely.prepared import prep
land=unary_union([shape(f['geometry']).buffer(0) for f in json.load(open_utf8('ne50.geojson'))['features']]).simplify(0.02)
pland=prep(land)
tzj=json.load(open_utf8('combined-now.json'))
tzs=[];feats=[];zoneinfo={}
for f in tzj['features']:
    t=f['properties']['tzid']; g=shape(f['geometry']); tzs.append((t,g))
    zoneinfo[t]=[off(t,WIN),off(t,SUM)]
    s=clean(g,0.01,0.0002)
    if s is not None and not pland.contains(s):
        s=s.buffer(0).intersection(land)
        s=clean(s,0.01,0.0004) if not s.is_empty and s.geom_type in ('Polygon','MultiPolygon') else (s if s.is_empty else None)
        if s is not None and (s.is_empty or s.geom_type not in ('Polygon','MultiPolygon')):
            from shapely.geometry import MultiPolygon
            ps=[q for q in getattr(s,'geoms',[]) if q.geom_type=='Polygon'] if not s.is_empty else []
            s=MultiPolygon(ps) if ps else None
    if s: feats.append({"type":"Feature","properties":{"z":t},"geometry":rnd(s)})
tree=STRtree([g for _,g in tzs])
def tz_at(x,y):
    p=Point(x,y)
    for i in tree.query(p):
        if tzs[i][1].contains(p): return tzs[i][0]
    return tzs[tree.nearest(p)][0]
countries=[];cfeat=[]
mainland={}
for f in json.load(open_utf8('ne50.geojson'))['features']:
    p=f['properties'];g=shape(f['geometry']);b=(max(g.geoms,key=lambda q:q.area) if g.geom_type=='MultiPolygon' else g).bounds
    mainland[p['ADM0_A3']]=prep(max(g.geoms,key=lambda q:q.area) if g.geom_type=='MultiPolygon' else g)
    countries.append([p.get('NAME_EN') or p['NAME'],round(p['LABEL_X'],2),round(p['LABEL_Y'],2),tz_at(p['LABEL_X'],p['LABEL_Y']),p['ADM0_A3'],[round(v,2) for v in b]])
    s=clean(g,0.03,0.0002)
    if s: cfeat.append({"type":"Feature","properties":{"z":tz_at(p['LABEL_X'],p['LABEL_Y'])},"geometry":rnd(s)})
prov=[];pfeat=[];ctz={}
for f in json.load(open_utf8('adm1.geojson'))['features']:
    p=f['properties'];g=f['geometry']
    if not g: continue
    sh=shape(g).buffer(0);x,y=p.get('longitude'),p.get('latitude')
    if x is None or not sh.contains(Point(x,y)):
        rp=sh.representative_point();x,y=rp.x,rp.y
    t=tz_at(x,y);b=sh.bounds
    prov.append([p.get('name_en') or p.get('name') or '?',round(x,2),round(y,2),t,p.get('adm0_a3'),round(max(b[2]-b[0],b[3]-b[1]),2),p.get('admin'),1 if p.get('adm0_a3') in mainland and mainland[p.get('adm0_a3')].contains(Point(x,y)) else 0])
    ctz.setdefault(p.get('adm0_a3'),set()).add(tuple(zoneinfo[t]))
    s=clean(sh,0.04,0.002)
    if s: pfeat.append({"type":"Feature","properties":{},"geometry":rnd(s)})
for c in countries:
    c.append(1 if len(ctz.get(c[4],()))>1 else 0)
tzL=[];cbL=[]
for f in feats:
    g=shape(f['geometry']).simplify(0.18,preserve_topology=True)
    g=clean(g,0.18,0.02)
    if g: tzL.append({"type":"Feature","properties":f['properties'],"geometry":rnd(g,1)})
for f in cfeat:
    g=clean(shape(f['geometry']),0.15,0.01)
    if g: cbL.append({"type":"Feature","properties":f['properties'],"geometry":rnd(g,1)})
tzM=[];cbM=[];pbM=[];gaps=[]
for f in feats:
    g=clean(shape(f['geometry']),0.07,0.004)
    if g: tzM.append({"type":"Feature","properties":f['properties'],"geometry":rnd(g,2)})
for f in cfeat:
    g=clean(shape(f['geometry']),0.06,0.002)
    if g: cbM.append({"type":"Feature","properties":f['properties'],"geometry":rnd(g,2)})
for f in pfeat:
    g=clean(shape(f['geometry']),0.08,0.01)
    if g: pbM.append({"type":"Feature","properties":{},"geometry":rnd(g,2)})
# small islands the zone polygons miss: fill them with their country's main zone
tzu=prep(unary_union([shape(f['geometry']).buffer(0) for f in feats]))
for f in cfeat:
    g=shape(f['geometry']);parts=list(g.geoms) if g.geom_type=='MultiPolygon' else [g]
    miss=[q for q in parts if not tzu.contains(q.representative_point())]
    if miss:
        from shapely.geometry import MultiPolygon
        gaps.append({"type":"Feature","properties":f['properties'],"geometry":rnd(MultiPolygon(miss) if len(miss)>1 else miss[0])})
print("gap features",len(gaps))

import math
from shapely.geometry import box as _box
def tile(fc,cell):
    out=[]
    for f in fc:
        g=shape(f['geometry']);x0,y0,x1,y1=g.bounds
        if x1-x0<=cell and y1-y0<=cell: out.append(f);continue
        if not g.is_valid: g=g.buffer(0)
        for gx in range(int(math.floor(x0/cell)),int(math.ceil(x1/cell))):
            for gy in range(int(math.floor(y0/cell)),int(math.ceil(y1/cell))):
                c=g.intersection(_box(gx*cell,gy*cell,(gx+1)*cell,(gy+1)*cell))
                if c.is_empty: continue
                ps=[c] if c.geom_type=='Polygon' else [q for q in getattr(c,'geoms',[]) if q.geom_type=='Polygon']
                for q in ps:
                    if q.area>1e-6: out.append({"type":"Feature","properties":f['properties'],"geometry":rnd(q,3)})
    return out
def lines(fc,n=60,p=2):
    out=[]
    for f in fc:
        g=shape(f['geometry']);parts=list(g.geoms) if g.geom_type=='MultiPolygon' else [g]
        for q in parts:
            for r in [q.exterior]+list(q.interiors):
                c=[[round(x,p),round(y,p)] for x,y in r.coords]
                for i in range(0,len(c)-1,n):
                    out.append({"type":"Feature","properties":{},"geometry":{"type":"MultiLineString","coordinates":[c[i:i+n+1]]}})
    return out
feats=tile(feats,5);tzM=tile(tzM,10);tzL=tile(tzL,10);gaps=tile(gaps,10)
cfeat=lines(cfeat,60,3);cbM=lines(cbM,60);cbL=lines(cbL,200,1)
pfeat=lines(pfeat,80,2);pbM=lines(pbM,80)
print("tiles",len(feats),len(tzM),"lines",len(cfeat),len(pfeat))
data={"zones":zoneinfo,"tzM":{"type":"FeatureCollection","features":tzM},"cbM":{"type":"FeatureCollection","features":cbM},
      "gaps":{"type":"FeatureCollection","features":gaps},"tzL":{"type":"FeatureCollection","features":tzL},"cbL":{"type":"FeatureCollection","features":cbL},"tz":{"type":"FeatureCollection","features":feats},
      "countries":countries,"cb":{"type":"FeatureCollection","features":cfeat},
      "prov":prov}
s=json.dumps(data,separators=(',',':'),ensure_ascii=False)
open(OUT,'w',encoding='utf-8').write(s)
print('Wrote',os.path.normpath(OUT))
for k in data: print(k, len(json.dumps(data[k],separators=(',',':')))//1024,"KB")
print("total",len(s.encode())//1024,"KB")

# Airports with scheduled flights, for the flights search in the details card
import csv
aps=[]
for r in csv.DictReader(open_utf8('airports.csv')):
    if r['type'] in ('large_airport','medium_airport') and r['scheduled_service']=='yes' and len(r['iata_code'])==3:
        aps.append([r['iata_code'],r['name'],r['municipality'],r['iso_country'],round(float(r['latitude_deg']),3),round(float(r['longitude_deg']),3),1 if r['type']=='large_airport' else 0])
AP_OUT=os.path.join(HERE,"..","data","airports.json")
open(AP_OUT,'w',encoding='utf-8').write(json.dumps(aps,separators=(',',':'),ensure_ascii=False))
print('Wrote',os.path.normpath(AP_OUT),len(aps),'airports')
