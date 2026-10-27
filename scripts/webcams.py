#!/usr/bin/env python3
"""Build data/webcams.json from the Windy Webcams API, for the globe's Webcams layer.

Windy's API doesn't accept requests straight from web pages, so a GitHub Action runs this weekly (and on
demand) with the key from the WINDY_WEBCAMS_KEY repository secret, and the page reads the saved list.
Live views use Windy's public embed player, so no expiring image links are stored.

  WINDY_WEBCAMS_KEY=... python scripts/webcams.py

Per country, the most popular cameras (up to PER_COUNTRY) are kept. Output rows: [id, title, lat, lon, place].
Only the standard library is used.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'webcams.json')
API = 'https://api.windy.com/webcams/api/v3'
PER_COUNTRY = 150
PAGE = 50


def get(path, **params):
    url = f'{API}/{path}?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'x-windy-api-key': KEY, 'User-Agent': 'working_hours_globe webcams layer'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit(f'Windy rejected the key ({e.code}). Check the WINDY_WEBCAMS_KEY secret.')
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            print('skip', url, e.code)
            return None
        except Exception as e:  # noqa: BLE001
            time.sleep(3 * (attempt + 1))
            last = e
    print('gave up on', url)
    return None


def rows(webcams):
    out = []
    for w in webcams or []:
        loc = w.get('location') or {}
        lat, lon = loc.get('latitude'), loc.get('longitude')
        if lat is None or lon is None or w.get('status', 'active') != 'active':
            continue
        place = ', '.join(x for x in (loc.get('city'), loc.get('country')) if x)
        out.append([int(w['webcamId']), (w.get('title') or 'Webcam')[:70], round(lat, 4), round(lon, 4), place[:60]])
    return out


def main():
    countries = get('countries', lang='en') or []
    if isinstance(countries, dict):
        countries = countries.get('countries') or countries.get('result') or []
    seen, data = set(), []
    # the world's most popular first, then each country's most popular
    jobs = [{}] + [{'countries': c.get('code')} for c in countries if c.get('code')]
    for job in jobs:
        for offset in range(0, PER_COUNTRY, PAGE):
            j = get('webcams', lang='en', limit=PAGE, offset=offset, sortKey='popularity', sortDirection='desc', include='location', **job)
            if not j:
                break
            got = rows(j.get('webcams'))
            for r in got:
                if r[0] not in seen:
                    seen.add(r[0])
                    data.append(r)
            if len(j.get('webcams') or []) < PAGE:
                break
            time.sleep(0.25)
    if len(data) < 100:
        sys.exit(f'Only {len(data)} webcams found; keeping the previous list.')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'webcams': data}, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(f'{len(data)} webcams from {len(countries)} countries written to data/webcams.json')


def coworking():
    """The weekly workflow also refreshes the coworking-spaces layer (scripts/coworking.py). Its files are
    staged here, because the workflow's own commit step only adds data/webcams.json."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import coworking as cw
        if cw.main():
            import subprocess
            subprocess.run(['git', 'add', '-A', 'data/coworking'], cwd=ROOT, check=False)
    except Exception as e:  # noqa: BLE001
        print('Coworking update skipped:', e)


if __name__ == '__main__':
    KEY = os.environ.get('WINDY_WEBCAMS_KEY', '').strip()
    if not KEY:
        sys.exit('Set WINDY_WEBCAMS_KEY')
    main()
    coworking()
