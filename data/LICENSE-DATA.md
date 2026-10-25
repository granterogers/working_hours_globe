# Data licence

`globe-data.json` is built by `scripts/build_data.py` from two sources:

- **Time zone boundaries** from [timezone-boundary-builder](https://github.com/evansiroky/timezone-boundary-builder) (release 2026e), which is derived from OpenStreetMap data. It is available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). © OpenStreetMap contributors.
- **Country and state/province borders** from [Natural Earth](https://www.naturalearthdata.com/), which is in the public domain.

Airports in `airports.json` come from [OurAirports](https://ourairports.com/data/), which is in the public domain.

Time zone offsets come from the [IANA time zone database](https://www.iana.org/time-zones).

Because it includes ODbL data, `globe-data.json` is itself made available under the ODbL 1.0. If you publish a modified version of this file, keep the attribution above and share it under the same licence. The MIT licence in the repository root covers the code only.
