# Climate, sun and hazard screening — methods and limits

Dannemora remains a research candidate, not the selected site. This note covers how
`climate-data.js` (`SITE_CLIMATE`), `ops/climate-findings.md` and
`sources/dannemora/climate/` are produced. Findings (CF-001…) live in
`ops/climate-findings.json`. Cite those IDs in later decisions.

## Regenerate

```sh
# Offline rebuild from archived inputs (deterministic, ~4 s)
.venv/bin/python scripts/prepare-climate.py

# Re-fetch public hazard layers + the 100 m horizon DEM first (network; no accounts or keys)
.venv/bin/python scripts/prepare-climate.py --acquire

node --check climate-data.js
```

Runtime: the repo `.venv` (ladybug-core 0.44, ladybug-comfort 0.19, numpy, rasterio,
pyproj, shapely). Radiance is not installed and is not used. The EPW/DDY/STAT files are
extracted from the archived zips into a temporary directory at run time and never
committed. Do not hand-edit the outputs. Edit `ops/climate-findings.json` or the script
and rerun.

## Inputs

| Input | Use |
|---|---|
| `sources/dannemora/terrain/USA_NY_Saranac.Lake-…_TMYx.2011-2025.zip` | **Primary** weather (507 m, 48.7 km SW of site) |
| `sources/dannemora/terrain/USA_NY_Plattsburgh.Intl.AP…_TMYx.2011-2025.zip` | Comparison (71 m, 30 km ESE) |
| `sources/dannemora/permit-layout-provisional.geojson` (`house`) | Site point (centroid) and footprint orientation. Provisional fit: RMS 3.1 m, LOO max 11.6 m |
| `sources/dannemora/terrain/dannemora-dem-1m.tif` | Site elevation (481 m NAVD88), local slope, near-field horizon |
| `sources/dannemora/climate/horizon-dem-3dep-100m.tif` | Far-field horizon only (3DEP export, 60 × 60 km, EPSG:26918) |
| `sources/dannemora/climate/hazards-acquisition.json` | Wildfire/LANDFIRE samples, wildfirerisk.org, code-source probes |

Saranac Lake is primary because its elevation is within 26 m of the site and it sits in
Adirondack upland terrain. Plattsburgh is closer, but it is 410 m lower on the Champlain
valley floor and ~2.4 °C warmer. Wind is the exception: the two stations show different
regimes (upland SW versus valley-channelled N/SSE), so `SITE_CLIMATE` carries both and the
findings treat them as bounds.

## Methods

- **Monthly/annual statistics** come straight from EPW hourly fields. Daily max/min/mean
  use EPW day order. HDD/CDD are base 18 °C from daily means (18.3 °C and °F-day variants
  also given). Snow depth and precipitation are the EPW fields as delivered. The air
  freezing index is the max−min of cumulative daily-mean °C over a Jul–Jun sequence built
  from the TMY months, so it is a typical-year value, not the 100-year index.
  `longTermStat` repeats the .stat file's "standard" climatology for comparison.
- **Design conditions** are parsed from the EPW `DESIGN CONDITIONS` header (2025 ASHRAE
  Handbook fields: heating 99.6/99 %, coincident wind, cooling 0.4/1/2 %, extreme wind,
  n-year return-period dry bulb). They are cross-listed with the annual design days from
  the .ddy via ladybug `DDY`. The climate zone and Köppen class are regex-parsed from the
  .stat.
- **Wind roses** are computed directly with NumPy. 16 sectors centred on N (22.5° wide);
  calm means < 0.5 m/s. Bins are 0.5–2, 2–4, 4–6, 6–8 and > 8 m/s, as % of all hours in
  the period, with calm reported separately (each rose sums to 100 %). Periods are annual,
  DJF, MAM, JJA, SON and `coldBelowMinus10` (all hours < −10 °C). The annual prevailing
  direction is cross-checked against ladybug `WindRose` and both agree.
- **Sun**: ladybug `Sunpath(lat, lon, time_zone=−5)` with NOAA equations and refraction
  correction. Azimuth is clockwise from true north. **Times are local standard time
  (EST, UTC−5) with no DST**; add 1 h for EDT. ladybug uses the non-leap reference year
  2017. Sunrise and sunset use a 0.5334° depression. Outputs: the 21st of each month
  (rise/noon/set, day length, max altitude, 15-min path) and 15-min positions for
  20 Mar, 21 Jun, 22 Sep and 21 Dec (also in `sources/dannemora/climate/sun-reference.json`
  for validating the JS solar function).
- **Terrain horizon**: from the house centroid at 1.6 m eye height, the max elevation angle
  per 2° azimuth. It combines the 1 m DEM (to ~0.9 km, the DEM's extent) with the 100 m
  3DEP export (to 30 km), corrected for earth curvature and refraction (k = 0.13).
  **Bare earth only. Trees and buildings are excluded.** `sun.terrainShading` reports the
  share of sun-up hours and of direct-beam energy (horizontal and south wall) blocked
  each month.
- **Surface irradiance**: ladybug `Wea.from_epw_file → directional_irradiance`, isotropic
  sky. Ground reflectance is 0.6 in hours with EPW snow depth > 0 and 0.2 otherwise; a
  constant-0.2 annual is kept for comparison. Surfaces are S/E/W/N walls, south roofs at
  30° and 45°, horizontal, and the two long walls of the provisional permit footprint
  (~126° and ~306°). No shading of any kind.
- **UTCI** (ladybug-comfort) runs on every hour in three scenarios:
  - shade (MRT = air temperature) with station 10 m wind;
  - shade with wind fixed at 0.5 m/s (sheltered bound);
  - full sun (ladybug-comfort `OutdoorSolarCal` MRT, body fully exposed, surroundings at
    air temperature) with 0.5 m/s wind.

  Outputs are monthly and annual % of hours per stress category (Bröde et al. 2012
  thresholds) and daytime (08–18 h) no-stress % by month.
- **Passive strategies**: ladybug `PsychrometricChart` at mean station pressure plus
  ladybug-comfort `PolygonPMV` with ladybug defaults (PPD ≤ 10 %, met 1.1, clo 0.7,
  0.1 m/s, MRT = air). Strategy parameters follow the LB PMV Polygon defaults:
  - internal heat, balance point 12.8 °C;
  - passive solar, 50 W/m²·K and 8 h time constant, driven by south-wall irradiance;
  - mass + night flush, 12/3 °C and 8 h;
  - fan, 1 m/s;
  - direct evaporative cooling.

  Results are % of all 8,760 hours; strategies overlap.
- **Hazards** (`--acquire`): ArcGIS `getSamples` at the house point and 8 points 200 m
  away (N…NW). Sources:
  - USFS WRC 2024 and WHP 2023 image services on imagery.geoplatform.gov (IIPP);
  - LANDFIRE LF2024 FBFM40, canopy cover and canopy height on lfps.usgs.gov;
  - wildfirerisk.org's public JSON API for Clinton County, Dannemora CDP and Lyon Mountain
    CDP;
  - the NYS DOS TB-1009 bulletin (archived PDF).

  Every request records its URL, UTC timestamp and HTTP status. Failures (ATC timeout,
  NOAA AFI 404/503, ASCE tool account wall) stay in the log as gaps.

## Data limits

- **TMYx is a typical year, not observations.** Each month is drawn from a different
  2011–2025 year (see `stations[].sourceMonths`). It under-represents extremes and
  sequences such as multi-day cold snaps. Use the ASHRAE design and return-period values
  for extremes.
- **Station ≠ site.** Both are open airfields. The site is a forest clearing at 481 m on a
  gentle NE-facing slope above Chazy Lake. Local wind is likely lower and terrain-steered,
  and calm nights may be colder (cold-air drainage) or milder (canopy) than the station.
  Lake effects, snow drifting and canopy microclimate are not modelled.
- **Precipitation magnitudes are uncertain.** TMYx totals (1,332 mm at Saranac Lake) are
  far above the .stat long-term average (927 mm).
- **Irradiance and comfort ignore all shading.** Terrain beam loss is reported separately.
  Tree shading is the dominant unknown for winter sun (see CF-005 and the canopy study).
- **Position is provisional.** The house point and its 36° long axis come from a
  county-GIS display fit of the permit drawing, not survey. Slope/aspect and horizon at
  that point inherit the error (±~10 m).
- **Wildfire layers are screening products** (30–270 m, LANDFIRE fuels circa 2020–2024)
  that predate any clearing. Image-service values for WRC layers are rescaled for display,
  so use them only relatively.
- **No code design value is established here.** Ground snow load, wind speed, frost depth,
  seismic category and ice barrier all come from the Town of Dannemora's Table R301.2(1),
  which has not been obtained (CF-012).

## Outputs (contract for UI agents)

`SITE_CLIMATE` top-level keys are `schemaVersion`, `generatedBy`, `libraries`, `site`,
`stations[]`, `surfaceIrradiance`, `sun`, `comfort`, `windRoseFormat`, `hazards` and
`findings`. Everything is in SI units. Angles are degrees from true north. Times are EST.
Provenance copies go to `sources/dannemora/climate/climate-reference.json` and
`sun-reference.json`.
