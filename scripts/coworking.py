#!/usr/bin/env python3
"""Build the coworking-spaces layer for the globe: data/coworking/index.json plus one file per 10°×10° square.

Sources (both free and open, worldwide):
  * Overture Maps Places (CDLA Permissive 2.0): tens of millions of businesses conflated from Meta,
    Microsoft and others, read straight from Overture's public S3 bucket with DuckDB. Every place whose
    category is coworking is kept, with its website, phone, address, brand and Overture's confidence score.
  * OpenStreetMap (ODbL): amenity=coworking_space / office=coworking, via one worldwide Overpass query;
    adds opening hours and places Overture lacks. Near-duplicates (same name within 150 m) are merged.

  python scripts/coworking.py            # run by the weekly webcams workflow (see scripts/webcams.py)

Rows: [name, lat, lon, place, website, phone, opening_hours, source ('v' Overture, 'o' OSM, 'vo' both),
       confidence 0-100 (Overture) or -1, brand]
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
OUT = os.path.join(ROOT, 'data', 'coworking')
CELL = 10
OSM_BUDGET = 900  # seconds for all Overpass attempts together; the weekly job is capped at 45 minutes
UA ={'User-Agent': 'working_hours_globe coworking layer (github.com/granterogers/working_hours_globe)'}


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
    q = f"""SELECT names.primary AS name, (bbox.ymin + bbox.ymax) / 2 AS lat, (bbox.xmin + bbox.xmax) / 2 AS lon,
        {pick('addresses', 'addresses[1].locality')} AS city, {pick('addresses', 'addresses[1].country')} AS country,
        {pick('addresses', 'addresses[1].freeform')} AS street,
        {pick('websites', 'websites[1]')} AS web, {pick('phones', 'phones[1]')} AS phone,
        {pick('confidence', 'confidence', '0.5')} AS conf, {pick('brand', 'brand.names.primary')} AS brand
      FROM {source} WHERE ({' OR '.join(conds)}) AND names.primary IS NOT NULL"""
    rows = con.execute(q).fetchall()
    print(len(rows), 'coworking places from Overture')
    out = []
    for name, lat, lon, city, country, street, web, phone, conf, brand in rows:
        if lat is None or lon is None:
            continue
        place = ', '.join(x for x in (street, city, country) if x)
        out.append([name[:80], round(lat, 5), round(lon, 5), place[:90], (web or '')[:120], (phone or '')[:30], '', 'v',
                    int(round((conf or 0) * 100)), (brand or '')[:40]])
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
        place = ', '.join(x for x in (street, t.get('addr:city') or t.get('addr:place'), t.get('addr:country')) if x)
        out.append([(t.get('name:en') or t.get('name') or 'Coworking space')[:80], round(lat, 5), round(lon, 5), place[:90],
                    (t.get('website') or t.get('contact:website') or '')[:120], (t.get('phone') or t.get('contact:phone') or '')[:30],
                    (t.get('opening_hours') or '')[:80], 'o', -1, (t.get('brand') or '')[:40]])
    print(len(out), 'coworking places from OpenStreetMap')
    return out


def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def merge(a, b):
    """add OSM rows (b) to Overture rows (a), folding near-duplicates into one row"""
    grid = {}
    for i, r in enumerate(a):
        grid.setdefault((int(r[1] * 100), int(r[2] * 100)), []).append(i)
    out = list(a)
    for r in b:
        gx, gy = int(r[1] * 100), int(r[2] * 100)
        hit = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in grid.get((gx + dx, gy + dy), []):
                    o = out[i]
                    d = math.hypot((o[1] - r[1]) * 111320, (o[2] - r[2]) * 111320 * math.cos(math.radians(r[1])))
                    n1, n2 = norm(o[0]), norm(r[0])
                    if d < 150 and n1 and n2 and (n1 in n2 or n2 in n1):
                        hit = i
        if hit is None:
            out.append(r)
        else:
            o = out[hit]
            o[4] = o[4] or r[4]; o[5] = o[5] or r[5]; o[6] = r[6] or o[6]; o[3] = o[3] or r[3]; o[7] = 'vo'
    return out


def write(rows):
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json'):
            os.remove(os.path.join(OUT, f))
    cells = {}
    for r in rows:
        la, lo = math.floor(r[1] / CELL) * CELL, math.floor(r[2] / CELL) * CELL
        cells.setdefault(f'{la}_{lo}', []).append(r)
    for key, rs in cells.items():
        with open(os.path.join(OUT, key + '.json'), 'w', encoding='utf-8') as f:
            json.dump(rs, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'cell': CELL, 'total': len(rows),
                   'cells': {k: len(v) for k, v in cells.items()}}, f, separators=(',', ':'))
    print(len(rows), 'coworking places in', len(cells), 'squares written to data/coworking/')


def main():
    try:
        a = overture()
    except Exception as e:  # noqa: BLE001
        print('Overture step failed:', e)
        a = []
    b = osm()
    rows = merge(a, b)
    if len(rows) < 500:
        print(f'Only {len(rows)} coworking places found; keeping the previous files.')
        return False
    write(rows)
    return True


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
