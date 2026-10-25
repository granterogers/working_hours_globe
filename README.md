# Working hours globe 🌍

An interactive 3D globe that shows what your UK working hours would be, in local time, anywhere in the world. Every country is coloured by how your shift would fall locally, and as you zoom in, each state, province and island group gets its own label.

Built for planning where to live and work as a remote worker on UK hours.

**Live site:** [granterogers.github.io/working_hours_globe](https://granterogers.github.io/working_hours_globe/)

## Features

- Spin, zoom and fly around a smooth, hand-rendered globe, with eased zoom towards the cursor and momentum when you flick it.
- Local working hours for about 240 countries and 4,600 states, provinces and regions, with labels that change as you zoom.
- Colours follow real time-zone boundaries, from "Early bird" through "Classic day" to "Overnight".
- Set any shift in UK time, and switch between winter (UK on GMT) and summer (UK on BST).
- Click any place for its hours in both seasons and its offset from the UK.
- Search for any country, state or island (press `/`).
- Add your own KML, KMZ or GeoJSON files as layers on top, then click any point, line or area to see its name, description, extended data and your working hours at that spot.
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
data/globe-data.json    Prebuilt map data (time zones, borders, labels)
data/LICENSE-DATA.md    Data sources and licence
scripts/build_data.py   Rebuilds globe-data.json from the source data
scripts/requirements.txt
```

## How it works

The globe is drawn on a canvas with a custom orthographic projection. Every vertex is stored as a precomputed 3D unit vector, so each frame is just a rotation and a quick visibility test, with no trigonometry. Shapes are split into tiles and checked against the visible part of the sphere so only what's on screen is drawn, and the level of detail goes up as you zoom in. [D3](https://d3js.org/) is used for small helpers such as the graticule and point-in-polygon lookups, and [JSZip](https://stuk.github.io/jszip/) reads KMZ files.

Hours are worked out per IANA time zone for two reference dates: 15 December 2026 for winter and 15 July 2027 for summer. Around the daylight-saving changeover weeks in March, October and November, when countries switch on different dates, real offsets can briefly differ by an hour.

## Limitations

- A few very large regions that cross a time-zone line, such as Nunavut and some Russian and Brazilian states, get one label based on the zone at their centre. The colours underneath still show the split, and clicking a spot gives that spot's hours.
- The borders are simplified to keep the data small, so coastlines are approximate when you zoom right in.
- There is no satellite imagery. The globe uses vector shapes only.

## Licence

The code is released under the [MIT License](LICENSE). The map data is released under the ODbL 1.0, with attribution required. See [data/LICENSE-DATA.md](data/LICENSE-DATA.md).
