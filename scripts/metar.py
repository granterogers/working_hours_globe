#!/usr/bin/env python3
"""Save the latest METAR weather reports worldwide to data/metar.json, for the globe's station temperature line.

The page can't ask AviationWeather.gov directly: its responses carry no CORS header, so browsers refuse them.
The API returns at most 400 reports per request, so the world is asked for in 20-degree squares, and the latest
report from each station is kept. The file keeps the fields the globe reads. Run every three hours by .github/workflows/metar.yml.

  python scripts/metar.py
"""
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'metar.json')
URL = 'https://aviationweather.gov/api/data/metar?bbox={},{},{},{}&format=json&hours=2'
TILE = 20
UA = {'User-Agent': 'working_hours_globe METAR layer (github.com/granterogers/working_hours_globe)'}


def squares():
    for lat in range(-90, 90, TILE):
        for lon in range(-180, 180, TILE):
            yield URL.format(lat, lon, lat + TILE, lon + TILE)


def main():
    latest = {}
    for url in squares():
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode('utf-8').strip()
        try:
            rows = json.loads(text) if text else []
        except ValueError:  # an empty or error reply for this square; the others still count
            print('skipped a square with no readable reply')
            rows = []
        for m in rows if isinstance(rows, list) else []:
            key = m.get('icaoId') or m.get('stationId')
            if key and (key not in latest or (m.get('obsTime') or 0) > (latest[key].get('obsTime') or 0)):
                latest[key] = m
        time.sleep(0.2)
    # only the fields the globe reads, so each saved version stays small
    keep = ('icaoId', 'name', 'lat', 'lon', 'temp', 'obsTime', 'reportTime')
    rows = [{k: m.get(k) for k in keep} for m in latest.values() if m.get('temp') is not None]
    if len(rows) < 100:
        print(f'Only {len(rows)} reports came back; keeping the previous file.')
        return False
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(rows, f, separators=(',', ':'))
    print(len(rows), 'METAR stations written to', os.path.relpath(OUT, ROOT))
    return True


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
