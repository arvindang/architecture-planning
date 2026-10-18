# Dannemora terrain acquisition

Status: first historical terrain study, 2026-10-18. No selected project site or manual feasibility check has been changed. Lot 1 is not georeferenced; the displayed boundary is the county parent tax parcel.

## Available now

- `sources/dannemora/terrain/dannemora-dem-1m.tif`: native 1 m bare-earth GeoTIFF, 1132 × 1572 cells; all cells finite. The 1.13 × 1.57 km rectangular context includes the parent tract, neighbouring land and lake. Water is hydroflattened, not lake-bottom terrain.
- Horizontal reference: NAD83 / UTM 18N, EPSG:26918, metres. Heights: NAVD88 metres, project metadata GEOID12A. No reprojection or vertical conversion was applied to the source clip. County WGS84 polygon is transformed for approximate display, with no survey-accuracy claim.
- Acquisition: project flight window 2014-11-02 through 2015-05-08; exact local flight day unknown. The 2024 DEM publication date is not a new flight.
- Precomputed elevation, slope and hillshade images, 2 m exploratory contour GeoJSON, 81 × 81 mesh and centreline profiles under `assets/sites/dannemora/terrain/`.
- Slope is percent rise/run from central differences on the native metre grid; 100% = 45 degrees. No smoothing is applied. Cell size, mesh spacing and contour interval do not establish absolute accuracy. Retain NoData; do not interpolate missing ground silently.
- Archived source report, metadata, queries, hashes and source-window description in `sources/dannemora/terrain/terrain-manifest.json`. Project-wide accuracy tests are not local parcel checkpoints.
- APA wetland polygons / land classification, USFWS NWI, USGS waterbody / flowlines, FEMA availability and partial zone attributes. Query footprints differ from DEM footprint; full intersecting features are archived, not automatically parcel-clipped. See `context-acquisition.json` and `context-sources.json`.
- Candidate EPW ZIPs: Plattsburgh airport (71 m station elevation) and Saranac Lake airport (507 m), TMYx 2011–2025. Neither selected or analyzed; compare distance, elevation and upland/lake climate before Ladybug use.

The browser renderer is a dependency-free local canvas mesh, not a streamed Cesium scene. It offers rotation, true scale / exaggerated vertical scale and keyboard controls. Plan-view maps use the full raster derivatives; the simplified display mesh does not preserve every ditch or bank. Downloads preserve measurement-ready data and source metadata.

## Point cloud

Exact tile **18TWQ592953** was verified using the NYS tile index and LAS header: 16,232,571 points, LAS 1.2, 0.01 m coordinate encoding. That encoding is not measurement accuracy. The tile contains the candidate and parent tract but not the entire buffered DEM context. Full ~70 MB compressed USGS LAZ download was slow and deferred; no complete local point cloud or class-count / ground-density audit exists yet.

Public access:

- [USGS project catalog](https://www.fisheries.noaa.gov/inport/item/70271)
- [EPT metadata / stream](https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_NY_Cl_Ess_LChamp_P2_2014_LAS_2016/ept.json)
- [TNM products API](https://tnmaccess.nationalmap.gov/api/v1/docs)

EPT horizontal coordinates are Web Mercator; reproject XY into a metric local CRS before calculating ground distances or slopes. Inspect EPT SRS and vertical metadata instead of assuming units or a vertical datum. Use classified ground returns for terrain; vegetation / buildings are separate context surfaces, with classification uncertainty retained. Ground density, nearest-ground distance, outliers and long TIN triangles need checks before deriving local pads or narrow drainage features.

## Reproduce derivatives

A working Python GIS runtime already exists in the adjacent mapping repo. It includes NumPy, Rasterio, PyProj, SciPy, scikit-image and Pillow. No environment was installed or changed for this work.

```sh
../mapping-race-courses/.venv/bin/python scripts/prepare-terrain.py \
  --dem sources/dannemora/terrain/dannemora-dem-1m.tif \
  --source 'USGS 3DEP: 2014 New York Clinton / Essex / Lake Champlain QL2 LiDAR, 1 m DEM' \
  --title 'Dannemora · historical bare-earth terrain' \
  --acquisition '2014-11-02 to 2015-05-08 (project-wide flight window)' \
  --vertical-datum 'NAVD88, metres (Geoid12A per project metadata)' \
  --source-resolution 1
```

The original public raster URL is in the manifest. The local crop was extracted using GDAL's source window `2162 5373 1132 1572` from that exact source raster, preserving native pixels; no source resampling was used. New parcel extents need a new query and source window rather than copying these coordinates.

## Reuse from mapping-race-courses

Read-only review found acquisition and quality patterns in `pipeline/lidar.py`: EPT hierarchy downloads, clipping/caching, class-2 ground TIN, bilinear profile sampling and local plane fits. Its Leaflet/profile viewer provides a useful future interaction pattern. The existing runtime was reused, while the derivative script here is independent.

Do not copy its hardcoded racing-site sources or closed-lap grade function. Its approximate NAD83-to-WGS84 CRS handling and pass-through EPT heights need explicit coordinate/datum handling for parcel work. Closed-lap wrapping is inappropriate for driveway / site profiles. Pavement-fit residuals and agreement with DEMs from the same flight are not independent survey accuracy checks. Asphalt-edge / banking detection is not parcel feasibility evidence.

## Access and APIs

No paid account or API key is needed for current data or the local viewer. Recommended default: public USGS / NYS elevation and ortho, county ArcGIS REST parcels, APA and federal screening layers; NRCS Soil Data Access next. QGIS is an optional free review tool.

CesiumJS can be useful for a future regional globe, large point clouds and streamed context. Cesium ion-hosted assets require an account/token and quotas. For globe alignment, convert NAVD88 orthometric heights to the required ellipsoidal reference; passing them through as WGS84 ellipsoid heights creates a datum mismatch. The current relative local model preserves and labels NAVD88.

Google Maps is optional visual orientation. Google Elevation needs API setup and billing and has storage/display restrictions; use primary downloadable public data for the reproducible archive. No key, account or billing was enabled.

## Remaining gates

1. Reconcile recorded Lot 1 boundary / parcel lineage and align survey with control points, reporting registration residuals. Do not transfer proposed well/septic from C1 onto the terrain until this is supported.
2. Obtain current photos, surveyed control and current/as-built records. Historical ground may predate grading and structures.
3. Acquire a classified point-cloud clip; audit coverage, class counts and ground gaps. Generate canopy-height context with explicit limitations.
4. Review APA delineation against coarse inventory; acquire soils/geology for screening. FEMA zone attributes returned X for the AOI, but polygon request failed HTTP500. Availability polygons are not flood zones and zone X does not establish no local drainage risk.
5. Extract parcel-specific slope statistics only after boundary registration, excluding water appropriately. Add user-defined non-wrapping sections and driveway corridors.
6. Compare tentative building pads and access. Cut/fill needs explicit pad level, grading extents, material assumptions and a supported surface. No rock depth, foundations, septic suitability or engineering design can be established from the DEM.
7. Choose the climate file, run Ladybug sun/climate summaries, and add terrain/seasonal canopy shadows. No climate or energy simulation has run yet.

## Permit layout views

Site feasibility now includes **Permitted layout**, with two focused SVG views generated by `python3 scripts/prepare-permitted-layout.py`: the Lot 1 survey boundary / house / clearing reference, and the C1 house / services plan. Original raster pixels are embedded unchanged, with separate illustrative emphasis layers in source-image coordinates. Purple means Lot 1 on these drawings; cyan on aerials still means the larger county parent. These traces are not georeferenced survey geometry and must not enter the terrain pipeline as measured boundaries. See `sources/dannemora/permitted-layout-register.json`.

Condition 9 authorizes the depicted house location and footprint, with prior written APA authorization required for changes. Condition 15 references clearing limits and condition 16 wetland activity. No full buildable envelope or net developable acreage has been calculated. Permit validity / recordation and other approvals remain unchecked.

## Provisional permit-to-aerial overlay

A reproducible display fit now overlays Lot 1 and the survey house footprint on all four aerial views. Run `python3 scripts/align-permit-aerial.py` (NumPy + GDAL Python/OSR), then `python3 scripts/prepare-site-evidence.py`. The fit is a 2D similarity from manually identified source-pixel corners to 11 county parent-boundary vertices in EPSG:26918. Diagnostics and every input are in `sources/dannemora/permit-aerial-registration.json`; derived geometry is `permit-layout-provisional.geojson`.

RMS fit residual is 3.1 m, maximum 7.6 m; leave-one-out RMS 4.4 m and maximum 11.6 m. All targets are the same approximate county tax GIS dataset. These are internal consistency diagnostics, **not absolute accuracy**, independent ground control, a recorded Lot 1 match or professional survey registration. An orange footprint shown in the woods is the later 2025 proposal, not a claim that a house existed in a 2014/2020/2024 photograph. Nearby roofs remain unconfirmed as the permit's accessory buildings.

Purple dashed outline = provisional Lot 1; orange dashed footprint = provisional house position; cyan = parent tax GIS. Well/septic, clearing and wetland geometry have not been transferred. The UI exposes the overlay toggle and uncertainty. Do not feed these provisional traces to setback, earthwork or construction calculations. Validate with recorded instruments and independent survey/aerial control next.

This supersedes earlier notes that no aerial registration exists: a provisional display fit exists, while verified registration remains outstanding. Terrain rendering still uses only the parent GIS reference.
