#!/usr/bin/env python3
"""Coliving layer data for the globe, from colivingDB (https://colivingdb.com).

  python scripts/coliving.py import-kml colivingdb_colivings.kml
      Rebuild data/coliving.json from a colivingDB KML export (replaces the list).

  python scripts/coliving.py update
      Scan colivingDB for listings that aren't in data/coliving.json yet, add them, drop listings
      colivingDB no longer has, and record the result in data/coliving-updates.json. Run weekly
      and on demand by .github/workflows/coliving.yml.

Only the standard library is used.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'coliving.json')
UPDATES = os.path.join(ROOT, 'data', 'coliving-updates.json')
SITE = 'https://colivingdb.com'
UA = 'working_hours_globe coliving layer (https://github.com/granterogers/working_hours_globe)'
TYPES = {'permanent coliving': 'p', 'pop-up / dated edition': 'u', 'nomad festival': 'f'}
# /coliving/<slug>/ pages that are interest indexes rather than single listings
NOT_LISTINGS = {'beach', 'surf', 'island', 'mountain', 'community', 'coworking', 'wellness', 'city', 'rural', 'eco',
                'startup', 'ski', 'family', 'index', 'all', 'pop-ups', 'festivals'}
MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}


def today():
    return dt.date.today().isoformat()


def split_list(s):
    return [x.strip().lower() for x in (s or '').split(',') if x.strip()]


def num(s, cast=float):
    try:
        s = str(s).replace(',', '').strip()
        return cast(float(s)) if s else None
    except ValueError:
        return None


def parse_dates(text):
    """'Nov 29 - Dec 20, 2026' / 'Dec 27, 2026 - Ongoing' / 'Mar 25 - 29, 2027' / several joined by ' / '
    -> [[start, end], ...] as ISO dates; end '9999-12-31' for ongoing. Unparsable parts are skipped."""
    out = []
    for part in re.split(r'\s/\s|;', text or ''):
        part = re.sub(r'\(.*?\)', '', part).strip()
        m = re.match(r'([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\s*[-–]\s*(?:(Ongoing)|(?:([A-Za-z]{3})[a-z]*\.?\s+)?(\d{1,2})(?:,?\s*(\d{4}))?)', part, re.I)
        if not m:
            # month ranges without days: 'Apr-Jun 2026', 'October - December 2026', 'Dec 2026'
            mm = re.match(r'([A-Za-z]{3})[a-z]*\.?\s*(\d{4})?\s*(?:[-–]\s*([A-Za-z]{3})[a-z]*\.?\s*)?(\d{4})\b', part)
            if mm and MONTHS.get(mm.group(1).lower()) and (not mm.group(3) or MONTHS.get(mm.group(3).lower())):
                a, b = MONTHS[mm.group(1).lower()], MONTHS[(mm.group(3) or mm.group(1)).lower()]
                ye = int(mm.group(4)); ys = int(mm.group(2)) if mm.group(2) else (ye - 1 if a > b else ye)
                last = (dt.date(ye + (b == 12), b % 12 + 1, 1) - dt.timedelta(days=1)).day
                out.append([f'{ys:04d}-{a:02d}-01', f'{ye:04d}-{b:02d}-{last:02d}'])
            continue
        m1, d1, y1, ongoing, m2, d2, y2 = m.groups()
        mo1 = MONTHS.get(m1.lower()[:3])
        if not mo1:
            continue
        if ongoing:
            if not y1:
                continue
            out.append([f'{int(y1):04d}-{mo1:02d}-{int(d1):02d}', '9999-12-31'])
            continue
        mo2 = MONTHS.get((m2 or m1).lower()[:3])
        if not mo2 or not (y2 or y1):
            continue
        ye = int(y2 or y1)
        ys = int(y1) if y1 else (ye - 1 if mo1 > mo2 else ye)
        try:
            s, e = dt.date(ys, mo1, int(d1)), dt.date(ye, mo2, int(d2))
        except ValueError:
            continue
        out.append([s.isoformat(), e.isoformat()])
    return out


def slug_of(url):
    m = re.search(r'/coliving/([a-z0-9-]+)/?', url or '')
    return m.group(1) if m else None


def clean_price(desc):
    m = re.search(r'Price:\s*(.*?)(?:<br|$)', desc or '', re.I)
    if not m:
        return ''
    p = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip()
    return re.sub(r'^(Month|Week|Night):\s*', '', p)


# ---------- KML import ----------
def import_kml(path):
    ns = {'k': 'http://www.opengis.net/kml/2.2'}
    root = ET.parse(path).getroot()
    old = {x['id']: x for x in load(DATA, [])}
    items = []
    for pm in root.iter('{http://www.opengis.net/kml/2.2}Placemark'):
        d = {e.get('name'): (e.findtext('k:value', default='', namespaces=ns) or '').strip() for e in pm.iter('{http://www.opengis.net/kml/2.2}Data')}
        coords = (pm.findtext('.//k:coordinates', default='', namespaces=ns) or '').strip().split(',')
        sid = slug_of(d.get('colivingDB Page'))
        if not sid or len(coords) < 2:
            continue
        rooms = split_list(d.get('Room Types'))
        it = {
            'id': sid, 'n': (pm.findtext('k:name', default='', namespaces=ns) or '').strip(),
            't': TYPES.get(d.get('Type', '').lower(), 'p'), 'rg': d.get('Region', ''), 'c': d.get('Country', ''),
            'a': d.get('City / Area', ''), 'lon': round(float(coords[0]), 5), 'lat': round(float(coords[1]), 5),
            'eur': num(d.get('Approx EUR / Month'), int), 'pr': clean_price(pm.findtext('k:description', default='', namespaces=ns)),
            'rt': num(d.get('Rating')), 'rv': num(d.get('Reviews'), int), 'rm': rooms,
            'dorm': d.get('Dorm Beds', '').lower() == 'yes' or 'dorm' in rooms,
            'ms': num(d.get('Min Stay (nights)'), int), 'tg': split_list(d.get('Tags')),
            'vb': sorted(set('focused' if v == 'work-focused' else v for v in split_list(d.get('Vibe')))),
            'wf': num(d.get('WiFi (Mbps)'), int), 'dt': d.get('Dates', ''), 'dr': parse_dates(d.get('Dates')),
            'op': d.get('Opening', ''), 'w': d.get('Website', ''), 'db': d.get('colivingDB Page', ''),
            'sch': d.get('Schedule', ''), 'src': d.get('Price Source', ''),
            'add': old.get(sid, {}).get('add', ''),
        }
        items.append(it)
    save(DATA, items)
    print(f'{len(items)} listings written to {os.path.relpath(DATA, ROOT)}')


# ---------- colivingDB scan ----------
def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001
            if getattr(e, 'code', None) == 404 or i == tries - 1:
                return None
            time.sleep(2 * (i + 1))
    return None


def discover():
    """Every listing slug colivingDB publishes, from its sitemap(s) and its markdown listing index."""
    slugs, seen = set(), set()

    def walk(url, depth=0):
        if url in seen or depth > 2:
            return
        seen.add(url)
        xml = get(url)
        if not xml:
            return
        for loc in re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', xml):
            loc = html.unescape(loc)
            if loc.endswith('.xml'):
                walk(loc, depth + 1)
            else:
                s = slug_of(urllib.parse.urlparse(loc).path)
                if s and s not in NOT_LISTINGS:
                    slugs.add(s)

    walk(SITE + '/sitemap.xml')
    md = get(SITE + '/llms-colivings.md')
    if md:
        for s in re.findall(r'/coliving/([a-z0-9-]+)/', md):
            if s not in NOT_LISTINGS:
                slugs.add(s)
    return slugs


def jsonld(page):
    out = []
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', page or '', re.S | re.I):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        stack = [data]
        while stack:
            x = stack.pop()
            if isinstance(x, list):
                stack.extend(x)
            elif isinstance(x, dict):
                out.append(x)
                stack.extend(v for k, v in x.items() if k in ('@graph', 'mainEntity', 'itemListElement', 'item'))
    return out


def text_of(page):
    page = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', page or '', flags=re.S | re.I)
    page = re.sub(r'<br\s*/?>|</(p|li|div|h\d|tr|dd|dt)>', '\n', page, flags=re.I)
    return html.unescape(re.sub(r'<[^>]+>', ' ', page))


def field(text, label, pattern=r'([^\n]+)'):
    m = re.search(r'(?:^|\n)[ \t]*(?:[-*•|][ \t]*)*\**' + label + r'\**[ \t]*[:|][ \t]*\**' + pattern, text, re.I)
    v = m.group(1).strip(' *|') if m else ''
    return re.sub(r'^(Month|Week|Night):\s*', '', v) if label == 'Price' else v


def geocode(city, country):
    q = ', '.join(x for x in (city, country) if x)
    if not q:
        return None
    time.sleep(1.1)  # Nominatim usage policy: at most one request a second
    r = get('https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'json', 'limit': 1, 'accept-language': 'en'}))
    try:
        j = json.loads(r or '[]')
        return (float(j[0]['lat']), float(j[0]['lon'])) if j else None
    except (ValueError, KeyError, IndexError):
        return None


def fetch_listing(slug, regions):
    url = f'{SITE}/coliving/{slug}/'
    page = get(url)
    md = get(url + 'index.md') or ''
    if not page and not md:
        return None
    text = md + '\n' + text_of(page)
    it = {'id': slug, 'db': url, 'add': today()}
    lat = lon = None
    for x in jsonld(page):
        geo = x.get('geo') or {}
        if isinstance(geo, dict) and geo.get('latitude') is not None and lat is None:
            lat, lon = num(geo.get('latitude')), num(geo.get('longitude'))
        if x.get('name') and 'n' not in it and str(x.get('@type', '')).lower() not in ('website', 'organization', 'breadcrumblist', 'webpage'):
            it['n'] = html.unescape(str(x['name'])).strip()
        loc = x.get('location')
        addr = x.get('address') or (loc.get('address') if isinstance(loc, dict) else None)
        if isinstance(addr, dict):
            it.setdefault('a', addr.get('addressLocality') or '')
            c = addr.get('addressCountry')
            it.setdefault('c', (c.get('name') if isinstance(c, dict) else c) or '')
        ar = x.get('aggregateRating')
        if isinstance(ar, dict):
            it.setdefault('rt', num(ar.get('ratingValue')))
            it.setdefault('rv', num(ar.get('reviewCount') or ar.get('ratingCount'), int))
        if x.get('url') and not str(x['url']).startswith(SITE):
            it.setdefault('w', x['url'])
        if x.get('startDate'):
            it.setdefault('_dates', (x.get('startDate'), x.get('endDate') or x.get('startDate')))
        if 'festival' in str(x.get('@type', '')).lower() or 'festival' in str(x.get('name', '')).lower():
            it['t'] = 'f'
    if lat is None:
        m = re.search(r'"lat(?:itude)?"\s*:\s*"?(-?\d{1,2}\.\d+)"?\s*,\s*"(?:lng|lon|longitude)"\s*:\s*"?(-?\d{1,3}\.\d+)', page or '')
        m = m or re.search(r'data-lat="(-?\d{1,2}\.\d+)"[^>]*data-(?:lng|lon)="(-?\d{1,3}\.\d+)"', page or '')
        m = m or re.search(r'geo\.position"\s+content="(-?\d{1,2}\.\d+);\s*(-?\d{1,3}\.\d+)', page or '')
        if m:
            lat, lon = float(m.group(1)), float(m.group(2))
    if 'n' not in it:
        m = re.search(r'^#\s+(.+)$', md, re.M) or re.search(r'<h1[^>]*>(.*?)</h1>', page or '', re.S | re.I) or re.search(r'<title>(.*?)</title>', page or '', re.S | re.I)
        it['n'] = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).split(' — ')[0].split(' | ')[0].strip() if m else slug.replace('-', ' ').title()
    # type, place, price and the rest, from the page text (the same labels the KML export uses)
    low = text.lower()
    if 't' not in it:
        it['t'] = 'f' if 'nomad festival' in low[:3000] else 'u' if re.search(r'pop-?up|dated edition', low[:3000]) else 'p'
    if not it.get('a') or not it.get('c'):
        m = re.search(r'(?:Permanent coliving|Pop-up[^—\n*]*|Nomad festival)\**\s*[—-]\s*([^,\n]+),\s*([^\n<*]+)', text)
        if m:
            it['a'] = it.get('a') or m.group(1).strip()
            it['c'] = it.get('c') or m.group(2).strip()
    it.setdefault('a', ''); it.setdefault('c', '')
    it['rg'] = regions.get(it['c'], '')
    eur = re.search(r'≈\s*€\s*([\d,]+)\s*/\s*month', text)
    it['eur'] = num(eur.group(1), int) if eur else None
    it['pr'] = field(text, 'Price')[:120]
    if 'rt' not in it:
        m = re.search(r'(\d(?:\.\d)?)\s*★\s*\((\d+)\s*reviews?\)', text)
        it['rt'], it['rv'] = (num(m.group(1)), num(m.group(2), int)) if m else (None, None)
    rooms = split_list(re.sub(r'[^a-z, ]', '', field(text, 'Rooms?').lower()))
    it['rm'] = rooms
    it['dorm'] = 'dorm' in rooms
    ms = re.search(r'Min(?:imum)?\.?\s*stay\W+(\d+)\s*night', text, re.I)
    it['ms'] = int(ms.group(1)) if ms else None
    it['tg'] = split_list(field(text, 'Tags'))[:12]
    it['vb'] = sorted(set('focused' if v == 'work-focused' else v for v in split_list(field(text, 'Vibe'))))[:12]
    wf = re.search(r'Wi-?Fi\W+(\d+)\s*Mbps', text, re.I)
    it['wf'] = int(wf.group(1)) if wf else None
    it['dt'] = field(text, 'Dates')[:160]
    it['dr'] = parse_dates(it['dt'])
    if not it['dr'] and it.get('_dates'):
        s, e = it['_dates']
        it['dr'] = [[str(s)[:10], str(e)[:10]]]
    it.pop('_dates', None)
    it['op'] = field(text, 'Opening')[:60]
    if 'w' not in it:
        m = re.search(r'\[(?:Website|Official site|Visit[^\]]*)\]\((https?://[^)]+)\)', md, re.I) or re.search(r'<a[^>]+href="(https?://(?!colivingdb\.com)[^"]+)"[^>]*>\s*(?:Website|Official site|Visit)', page or '', re.I)
        it['w'] = m.group(1) if m else ''
    it.update({'sch': '', 'src': ''})
    if lat is None:
        g = geocode(it['a'], it['c'])
        if g:
            lat, lon = g
    if lat is None or lon is None:
        return {'_unplaced': True, **it}
    it['lat'], it['lon'] = round(lat, 5), round(lon, 5)
    return it


def update():
    items = load(DATA, [])
    known = {x['id']: x for x in items}
    regions = {x['c']: x['rg'] for x in items if x.get('c') and x.get('rg')}
    found = discover()
    log = load(UPDATES, {})
    run = {'checked': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'found': len(found), 'added': [], 'removed': [], 'unplaced': []}
    if len(found) < max(50, 0.5 * len(known)):
        run['error'] = f'colivingDB listing index could not be read (found {len(found)} listings); nothing changed'
        print(run['error'])
    else:
        for slug in sorted(found - set(known))[:80]:
            it = fetch_listing(slug, regions)
            if not it:
                continue
            if it.pop('_unplaced', False):
                run['unplaced'].append({'id': slug, 'n': it.get('n', slug), 'db': it['db']})
                continue
            items.append(it)
            run['added'].append({k: it.get(k) for k in ('id', 'n', 'a', 'c', 'eur', 't')})
            print('added', slug)
        # listings colivingDB has dropped (only trusted when the scan found most of what we hold)
        if len(found) >= 0.8 * len(known):
            gone = [x for x in items if x['id'] not in found]
            for x in gone:
                run['removed'].append({k: x.get(k) for k in ('id', 'n', 'a', 'c')})
                print('removed', x['id'])
            items = [x for x in items if x['id'] in found]
        save(DATA, items)
    run['total'] = len(items)
    hist = [h for h in log.get('history', []) if h.get('added') or h.get('removed')][:11]
    if run['added'] or run['removed']:
        hist.insert(0, {k: run[k] for k in ('checked', 'added', 'removed')})
    recent = [dict(a, date=today()) for a in run['added']] + log.get('recent', [])
    save(UPDATES, {**run, 'recent': recent[:60], 'history': hist[:12]})
    print(f"{len(run['added'])} added, {len(run['removed'])} removed, {run['total']} listings")


def load(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'import-kml':
        import_kml(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == 'update':
        update()
    else:
        print(__doc__)
        sys.exit(1)
