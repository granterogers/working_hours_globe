# Working hours globe 🌍

An interactive 3D globe that shows what your UK working hours would be, in local time, anywhere in the world. Every country is coloured by how your shift would fall locally, and as you zoom in, each state, province and island group gets its own label.

Built for planning where to live and work as a remote worker on UK hours.

**Live site:** [granterogers.github.io/working_hours_globe](https://granterogers.github.io/working_hours_globe/)

## Features

- Spin, zoom and fly around a smooth, hand-rendered globe, with eased zoom towards the cursor and momentum when you flick it.
- Local working hours for every country, with smart labelling as you zoom: one label per country, plus extra labels only for regions on a different clock, separate islands, or to repeat a large country's hours once the previous label is far away. No clutter from dozens of identical labels.
- Colours follow real time-zone boundaries, from "Early bird" through "Classic day" to "Overnight".
- Set any shift in UK time, and switch between winter (UK on GMT) and summer (UK on BST).
- Click anywhere for the hours at that exact spot in both seasons and its offset from the UK. The card is named after the nearest village, town or feature to where you clicked (from OpenStreetMap's Nominatim, in English), in more detail the further you zoom in.
- Every location, coliving and favourite card has a **Weather** section (collapsed, with today's temperature and conditions on its header): conditions now, the latest measured temperature from the nearest airport weather station within 40 km (METAR, from [AviationWeather.gov](https://aviationweather.gov/data/api/), saved worldwide every three hours by `scripts/metar.py` into `data/metar.json`, because AviationWeather doesn't allow browsers to ask it directly), and a 7-day forecast by day. Forecast figures are the middle value of five weather models via [Open-Meteo](https://open-meteo.com/) (ECMWF, DWD ICON, NOAA GFS, Météo-France and Open-Meteo's best match). Weather, Photos and Flights open one at a time.
- Every location and coliving card shows **photos nearby** of the place itself, six thumbnails nearest first, from open sources: Wikimedia Commons, Wikidata, Panoramax, KartaView and OpenStreetMap (Mapillary too once a token is set; see below). Wildlife close-ups are left out, and runs of street-level frames are thinned to one per ~60 m. The search widens from 500 m to 2, 10 and 50 km until about ten photos turn up. The last thumbnail opens an overview of them all; any photo opens full size with arrow keys, on-screen arrows or a swipe, while the rest of the app is softly blurred. Each photo shows its distance, source, author, licence, date and a link to the original.
- Mapillary street-level photos: open the page once as `…/working_hours_globe/#mapillary=MLY|your-client-token`; the token is kept only in that browser and removed from the address bar.
- Clicking the map drops a blue pin on the spot you clicked.
- Search for any country, state or island (press `/`).
- Street-level detail when you zoom in towards a country: a street map in the standard OpenStreetMap style fades in and takes over from the time-zone colours and rough outlines, with names in English where available. Towns, villages, peaks, rivers and points of interest appear as you get closer, as on openstreetmap.org, and you can zoom right down to street level.
- **Layers panel** (bottom left, foldable): tick boxes for Working hours, Colivings (with its filter button and count), Place names and Weather now (current temperature and conditions for the towns and cities on the map, from Open-Meteo) and Webcams. **Base map** (layers button, top right): the English street map, Satellite (Esri World Imagery, with English names), Sentinel-2 cloudless (EOX), Topographic (OpenTopoMap), Ocean (Esri sea-floor relief) or Earth at night (NASA Black Marble). Every base map fades in as you zoom towards a country, taking over from the working-hours colours; the colour key fades with them.
- **Day and night** (Layers panel, on by default): the night side of the Earth is shaded, with soft twilight bands so the day/night line (the terminator) fades rather than cuts; it moves with the clock, on the 2D globe and in 3D.
- With **Working hours** switched off, the chosen base map shows in full at every zoom, from the whole globe down; with it on, the base map fades in as you zoom towards a country.
- **Coworking** (Layers panel): blue markers for coworking spaces from [Overture Maps](https://overturemaps.org/) Places (businesses conflated from Meta, Microsoft and others) merged with OpenStreetMap, rebuilt weekly by `scripts/coworking.py` (run from the webcams workflow) into one file, `data/coworking.json`, that loads with the page like the colivings, so nothing is downloaded as you pan. Closed places are left out. At globe scale, places that would overlap merge into one purple dot; press one to fly to it. Its filter button offers search, country, independent vs chains (Regus, WeWork…), has a website, opening hours listed, and well-established listings only.
- Switching a layer on or off fades it in or out.
- **Webcams** (Layers panel): the most popular webcams in every country from [Windy.com](https://www.windy.com/webcams), refreshed weekly by a GitHub Action (`scripts/webcams.py`, `.github/workflows/webcams.yml`, key in the `WINDY_WEBCAMS_KEY` repository secret), plus webcams listed in OpenStreetMap and Wikidata when zoomed in. Click a camera to play today's images in Windy's player, with the hours and weather there.
- **My location** button (above the zoom buttons): zooms to where you are, with a blue dot and a ring showing how precise the fix is; works in 3D too. The browser asks permission the first time.
- **3D view** (3D button): opens at exactly the spot and scale you were looking at, then tilt it into 3D with real terrain ([Mapterhorn](https://mapterhorn.com/)) in whichever base map is chosen. Left-drag moves, the wheel zooms, and holding the wheel button down while dragging turns and tilts. Working-hours colours and hours, colivings, favourites and your own layers all show, and clicking opens the same cards as on the globe. Back to globe returns to where you were looking. Uses [MapLibre GL JS](https://maplibre.org/).
- Flights from any place's details card: pick where you're flying from (your last six are kept as one-tap choices, alongside Europe's busiest airports), choose one of the nearest airports and a date, then open a one-way search on Google Flights or Skyscanner's cheapest-days month calendar with everything filled in.
- Favourites: press **Add a favourite**, click the map to drop a pin, and it's named after the nearest town or feature with its coordinates. Drag the pin to fine-tune it, add a note and save. A heart marks the spot, saved favourites can be dragged too, and they're kept in your browser between visits.
- Add your own KML, KMZ or GeoJSON files as layers on top (the view stays where you are, and layers are kept between visits), then click any point, line or area to see its name, description, extended data and your working hours at that spot.
- Rename any added layer (pencil button, or double-click its name) and switch layers on or off, including the built-in working-hours colours and times, for a plain globe with just your own layers.
- A built-in **Colivings** layer with every listing from [colivingDB](https://colivingdb.com): shown as green dots (the card says whether it's permanent, a pop-up or a festival). Click a dot for prices, rating, rooms, minimum stay, dates, links and your hours there. The filter button next to the layer opens search, type, price per month, rooms, minimum stay, rating, region, the month a pop-up runs, interests and vibe; your filters are remembered. Finished editions are hidden automatically.
- **Check for new colivings** (in the coliving filters) reports listings added since you last looked and lets you jump to each. A GitHub Action scans colivingDB every Monday, or whenever you run it from the Actions tab.
- A small version number sits at the bottom of the page (`v1.6` in `index.html`). Its minor number goes up with every change.
- Dark and light themes, full-screen mode, keyboard controls (arrow keys to spin, `+` and `-` to zoom), and a layout that works on mobile.

## Run it locally

The page loads its map data with `fetch`, so browsers won't run it when you double-click `index.html`. Serve the folder instead. On Windows, in PowerShell:

```powershell
cd path\to\working_hours_globe
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Publish with GitHub Pages

1. Push this folder to [granterogers/working_hours_globe](https://github.com/granterogers/working_hours_globe):
   ```powershell
   git init
   git add .
   git commit -m "Working hours globe"
   git branch -M main
   git remote add origin https://github.com/granterogers/working_hours_globe.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`, and save.
4. After a minute or so the site appears at [granterogers.github.io/working_hours_globe](https://granterogers.github.io/working_hours_globe/).

There is no build step for the site itself. The `.nojekyll` file tells GitHub Pages to serve the files as they are.

## Rebuild the map data

`data/globe-data.json` is already included, so you only need this to pick up time-zone changes or tweak the geometry.

```powershell
pip install -r scripts/requirements.txt
python scripts/build_data.py
```

The script downloads the source data into `scripts/cache/` (ignored by git), computes each zone's offset from the UK for a winter date and a summer date, simplifies and tiles the shapes at three levels of detail, and writes `data/globe-data.json`. To use a newer time-zone release, change `TZBB_RELEASE` at the top of the script.

## Project structure

```
index.html              Page markup
assets/style.css        Styles and themes
assets/app.js           Globe rendering, interaction, search and layers
data/coliving.json      Coliving listings from colivingDB (built by scripts/coliving.py)
data/coliving-updates.json  When colivingDB was last scanned and what changed
data/metar.json        Latest weather station reports, worldwide (built by scripts/metar.py)
data/coworking.json     Coworking spaces from Overture Maps and OpenStreetMap (built by scripts/coworking.py)
scripts/coliving.py     Import a colivingDB KML export, or scan colivingDB for changes
.github/workflows/coliving.yml  Weekly and on-demand colivingDB scan
data/globe-data.json    Prebuilt map data (time zones, country borders, label points)
data/airports.json      Airports with scheduled flights, for flight searches
data/LICENSE-DATA.md    Data sources and licence
scripts/build_data.py   Rebuilds globe-data.json from the source data
scripts/requirements.txt
tests/smoke.js         Browser smoke test (Playwright): coworking count, filter, 3D view
```

## How it works

The globe is drawn on a canvas with a custom orthographic projection. Every vertex is stored as a precomputed 3D unit vector, so each frame is just a rotation and a quick visibility test, with no trigonometry. Shapes are split into tiles and checked against the visible part of the sphere so only what's on screen is drawn, and the level of detail goes up as you zoom in. [D3](https://d3js.org/) is used for small helpers such as the graticule and point-in-polygon lookups, and [JSZip](https://stuk.github.io/jszip/) reads KMZ files.

Hours are worked out per IANA time zone for two reference dates: 15 December 2026 for winter and 15 July 2027 for summer. Around the daylight-saving changeover weeks in March, October and November, when countries switch on different dates, real offsets can briefly differ by an hour.

## Map tiles

Street maps are drawn from [OpenFreeMap](https://openfreemap.org/) vector tiles (the [OpenMapTiles](https://openmaptiles.org/) schema, built from [OpenStreetMap](https://www.openstreetmap.org/copyright) data) and load only once you zoom in. Each tile is painted in the browser in openstreetmap-carto's colours and wrapped onto the globe; names are drawn upright on top, using OpenStreetMap's English name (`name:en`) where one exists and the local name otherwise. Country and state names are left to the time-zone labels. OpenFreeMap is free with no key; the page reads the current tile address from its [TileJSON](https://tiles.openfreemap.org/planet), since it changes with each weekly build, and shows the attribution while the map is visible. Place names for clicked spots and new favourites come from OpenStreetMap's [Nominatim](https://nominatim.org/) service, one lookup per click or pin drop, which is free for light personal use; for a high-traffic deployment, follow its [usage policy](https://operations.osmfoundation.org/policies/nominatim/).

Flight searches open Google Flights or Skyscanner in a new tab. Neither offers a free public API for embedding live prices, so the page prefills their search pages instead.

## Limitations

- A few very large regions that cross a time-zone line, such as Nunavut and some Russian and Brazilian states, get one label based on the zone at their centre. The colours underneath still show the split, and clicking a spot gives that spot's hours.
- The borders are simplified to keep the data small, so coastlines are approximate when you zoom right in.
- There is no satellite imagery.
- Favourites and added layers are stored in your browser (local storage and IndexedDB), so they don't sync between devices, and clearing site data removes them.

## Licence

The code is released under the [MIT License](LICENSE). The map data is released under the ODbL 1.0, with attribution required. See [data/LICENSE-DATA.md](data/LICENSE-DATA.md).
