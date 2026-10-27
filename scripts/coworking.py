#!/usr/bin/env python3
"""Build the coworking-spaces layer for the globe: one file, data/coworking.json, loaded with the page like colivings.

Sources (both free and open, worldwide):
  * Overture Maps Places (CDLA Permissive 2.0): tens of millions of businesses conflated from Meta,
    Microsoft and others, read straight from Overture's public S3 bucket with DuckDB. Every place whose
    category is coworking and that is not marked closed is kept, with its address, website, phone, brand,
    category and Overture's confidence score.
  * OpenStreetMap (ODbL): amenity=coworking_space / office=coworking, via one worldwide Overpass query;
    adds opening hours and places Overture lacks. Near-duplicates (same name within 150 m) are merged.

  python scripts/coworking.py            # run by the weekly webcams workflow (see scripts/webcams.py)

Each row in "rows" follows "fields": name, lat, lon, street, city, country (ISO code), web, phone,
hours (OpenStreetMap opening_hours), src ('v' Overture, 'o' OSM, 'vo' both), conf (Overture confidence
0-100, or -1), brand, category (Overture category or OSM amenity/office).
"""
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'coworking.json')
FIELDS = ['name', 'lat', 'lon', 'street', 'city', 'country', 'web', 'phone', 'hours', 'src', 'conf', 'brand', 'category']
OSM_BUDGET = 900  # seconds for all Overpass attempts together; the weekly job is capped at 45 minutes
UA = {'User-Agent': 'working_hours_globe coworking layer (github.com/granterogers/working_hours_globe)'}


def http(url, data=None, timeout=300):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8')


def latest_release():
    xml = http('https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/', timeout=60)
    rel = sorted(re.findall(r'<Prefix>release/([0-9][^/<]*)/</Prefix>', xml))
    if not rel:
        raise RuntimeError('no Overture releases listed')
    return rel[-1]


def overture(source=None):
    try:
        import duckdb  # noqa: F401
    except ImportError:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'duckdb'])
    import duckdb
    con = duckdb.connect()
    if source is None:
        rel = latest_release()
        print('Overture release', rel)
        con.execute('INSTALL httpfs; LOAD httpfs;')
        con.execute("SET s3_region='us-west-2';")
        source = f"read_parquet('s3://overturemaps-us-west-2/release/{rel}/theme=places/type=place/*', hive_partitioning=1, union_by_name=1)"
    cols = {r[0] for r in con.execute(f'DESCRIBE SELECT * FROM {source}').fetchall()}
    # the schema has changed between releases: test whichever category fields this one has
    conds = []
    if 'categories' in cols:
        conds += ["categories.primary ILIKE '%cowork%'", "coalesce(array_to_string(categories.alternate, ','), '') ILIKE '%cowork%'"]
    if 'basic_category' in cols:
        conds.append("basic_category ILIKE '%cowork%'")
    if 'taxonomy' in cols:
        conds.append("CAST(taxonomy AS VARCHAR) ILIKE '%cowork%'")
    if not conds:
        raise RuntimeError('no category column in this Overture release')
    pick = lambda c, expr, alt='NULL': expr if c in cols else alt  # noqa: E731
    status = pick('operating_status', "coalesce(operating_status, 'open')", "'open'")
    q = f"""SELECT names.primary AS name, (bbox.ymin + bbox.ymax) / 2 AS lat, (bbox.xmin + bbox.xmax) / 2 AS lon,
        {pick('addresses', 'addresses[1].locality')} AS city, {pick('addresses', 'addresses[1].country')} AS country,
        {pick('addresses', 'addresses[1].freeform')} AS street,
        {pick('websites', 'websites[1]')} AS web, {pick('phones', 'phones[1]')} AS phone,
        {pick('confidence', 'confidence', '0.5')} AS conf, {pick('brand', 'brand.names.primary')} AS brand,
        {pick('basic_category', 'basic_category')} AS category
      FROM {source} WHERE ({' OR '.join(conds)}) AND names.primary IS NOT NULL AND {status} <> 'closed'"""
    rows = con.execute(q).fetchall()
    print(len(rows), 'coworking places from Overture')
    out = []
    for name, lat, lon, city, country, street, web, phone, conf, brand, category in rows:
        if lat is None or lon is None:
            continue
        out.append({'name': name[:80], 'lat': round(lat, 5), 'lon': round(lon, 5), 'street': (street or '')[:90],
                    'city': (city or '')[:60], 'country': iso2(country), 'web': (web or '')[:120],
                    'phone': (phone or '')[:30], 'hours': '', 'src': 'v', 'conf': int(round((conf or 0) * 100)),
                    'brand': (brand or '')[:40], 'category': (category or '')[:40]})
    return out


def osm():
    q = '[out:json][timeout:600];(nwr["amenity"="coworking_space"];nwr["office"="coworking"];);out center tags;'
    deadline = time.time() + OSM_BUDGET
    j = None
    for attempt in range(3):
        left = deadline - time.time()
        if left < 60:
            break
        try:
            j = json.loads(http('https://overpass-api.de/api/interpreter', data=('data=' + urllib.parse.quote(q)).encode(), timeout=left))
            break
        except Exception as e:  # noqa: BLE001
            print('Overpass attempt failed:', e)
            time.sleep(30)
    if j is None:
        print('Overpass gave no data within', OSM_BUDGET, 'seconds')
        return []
    out = []
    for e in j.get('elements', []):
        t = e.get('tags') or {}
        lat = e.get('lat', (e.get('center') or {}).get('lat'))
        lon = e.get('lon', (e.get('center') or {}).get('lon'))
        if lat is None:
            continue
        street = ' '.join(x for x in (t.get('addr:street'), t.get('addr:housenumber')) if x)
        out.append({'name': (t.get('name:en') or t.get('name') or 'Coworking space')[:80], 'lat': round(lat, 5), 'lon': round(lon, 5),
                    'street': street[:90], 'city': (t.get('addr:city') or t.get('addr:place') or '')[:60],
                    'country': iso2(t.get('addr:country')), 'web': (t.get('website') or t.get('contact:website') or '')[:120],
                    'phone': (t.get('phone') or t.get('contact:phone') or '')[:30], 'hours': (t.get('opening_hours') or '')[:80],
                    'src': 'o', 'conf': -1, 'brand': (t.get('brand') or '')[:40],
                    'category': (t.get('amenity') or t.get('office') or '')[:40]})
    print(len(out), 'coworking places from OpenStreetMap')
    return out


def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def iso2(code):
    """a two-letter country code, or '' when the source has something else"""
    code = (code or '').strip().upper()
    return code if re.fullmatch(r'[A-Z]{2}', code) else ''


def merge(a, b):
    """add OSM rows (b) to Overture rows (a), folding near-duplicates into one row"""
    grid = {}
    for i, r in enumerate(a):
        grid.setdefault((int(r['lat'] * 100), int(r['lon'] * 100)), []).append(i)
    out = list(a)
    for r in b:
        gx, gy = int(r['lat'] * 100), int(r['lon'] * 100)
        hit = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in grid.get((gx + dx, gy + dy), []):
                    o = out[i]
                    d = math.hypot((o['lat'] - r['lat']) * 111320, (o['lon'] - r['lon']) * 111320 * math.cos(math.radians(r['lat'])))
                    n1, n2 = norm(o['name']), norm(r['name'])
                    if d < 150 and n1 and n2 and (n1 in n2 or n2 in n1):
                        hit = i
        if hit is None:
            out.append(r)
        else:
            o = out[hit]
            for k in ('street', 'city', 'country', 'web', 'phone', 'brand', 'category'):
                o[k] = o[k] or r[k]
            o['hours'] = r['hours'] or o['hours']
            o['src'] = 'vo'
    return out


def write(rows):
    rows.sort(key=lambda r: (r['country'], r['city'], r['name']))
    data = {'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'fields': FIELDS,
            'rows': [[r[k] for k in FIELDS] for r in rows]}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(len(rows), 'coworking places written to', os.path.relpath(OUT, ROOT))


def main():
    try:
        a = overture()
    except Exception as e:  # noqa: BLE001
        print('Overture step failed:', e)
        a = []
    b = osm()
    rows = merge(a, b)
    if len(rows) < 500:
        print(f'Only {len(rows)} coworking places found; keeping the previous file.')
        return False
    write(rows)
    return True


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
