# Dannemora canopy and local 3D terrain

Status: first canopy study, 2026-10-20. This is the "Trees" step of the site-climate study. No project site, manual check or feasibility outcome has changed. Lot 1 is still not georeferenced; its outline here is the provisional permit-to-aerial display fit.

## Outputs

- `site3d-data.js` (`const SITE_3D`, 1.3 MB) and `assets/sites/dannemora/site3d/site3d.json` (identical object). Generated; never hand-edit.
- `assets/sites/dannemora/site3d/canopy-height.png`: one pixel per 2 m cell, alpha where CHM >= 2 m; bounds in `SITE_3D.overlay`.
- `sources/dannemora/lidar/lidar-manifest.json`: EPT URL, AOI in EPSG:3857 and 26918, all 130 nodes with URL / bytes / sha256 / point count, class counts and audit, horizontal and vertical checks, retrieval time.
- `sources/dannemora/lidar/ept-hierarchy/*.json`, `ept.json`: hierarchy walked to select nodes (committed, 0.9 MB).
- `sources/dannemora/lidar/ept-data/*.laz`: 70.0 MB raw cache, **gitignored**. Re-download with the script; verify against manifest sha256.

## Regenerate

```sh
.venv/bin/python scripts/prepare-site-3d.py                  # fetch ept.json, download missing nodes, build
.venv/bin/python scripts/prepare-site-3d.py --skip-download  # cache only, no network
# optional: --debug-dir <dir> writes intermediate grids (CHM, smoothed CHM, structure mask, crown labels) as npz
```

Runs in about 30 s from cache. Paths resolve from the repo root.

## SITE_3D contract

```js
const SITE_3D = {
  crs: 'EPSG:26918', verticalDatum: 'NAVD88 m',
  origin: [592535, 4953901],   // centre of the NW cell, EPSG:26918 m
  spacing: 2, cols: 267, rows: 280,
  rowOrder: 'north-to-south, west-to-east',  // value[row*cols + col]; E = origin[0] + col*2, N = origin[1] - row*2
  bounds: [592534, 4953342, 593068, 4953902], // outer cell edges
  ground: [...74760],          // NAVD88 m, 2 decimals, null = NoData (none in this AOI)
  canopyHeight: [...74760],    // m above ground, 2 decimals, null = no LiDAR returns (13 water cells)
  crownId: [...74760],         // ADDITION: 0 = none, k = trees[k-1] watershed crown segment
  trees: [{x, y, h, r, z}],    // x east, y north (m, relative to origin; y <= 0), h top height, r crown radius, z ground at top
  lot1: [[x, y], ...], house: [[x, y], ...],  // provisional outlines, local m, closed rings
  overlay: {canopyPng, bounds}, conventions: {...}, stats: {...}, lidar: {...}, limitations: [...], generated: {...}
};
```

Deviations from the requested contract are additive only: `bounds`, `conventions`, `crownId`, `overlay`, `generated`. For shading use the `canopyHeight` raster; to simulate removing tree k set `canopyHeight` to 0 where `crownId == k` (and drop `trees[k-1]`).

## Method

1. **AOI and grid.** Provisional Lot 1 (WGS84) to EPSG:26918; bbox + 200 m, snapped outward to a 2 m lattice aligned with DEM pixel edges, clipped to the DEM. 267 x 280 cells (534 x 560 m).
2. **Ground.** Mean of the 2 x 2 native 1 m DEM pixels per cell (`sources/dannemora/terrain/dannemora-dem-1m.tif`); a block with any NoData would stay null. No interpolation. Equivalent to the bilinear value at the cell centre.
3. **Points.** USGS EPT `USGS_LPC_NY_Cl_Ess_LChamp_P2_2014_LAS_2016`, SRS EPSG:3857 (horizontal only). Hierarchy walked from `0-0-0-0`; every node at every depth (0–11) whose XY box meets the AOI was downloaded: 130 nodes, 9.40 M points, 70.0 MB. 5.63 M points fall in the AOI after reprojection to EPSG:26918 and cropping. Downloaded `ept.json` matches the archived `sources/dannemora/terrain/usgs-ept.json`.
4. **Horizontal check.** Reprojected X lands on the 0.01 m grid of the original NAD83 UTM tiles (median residual 0.0002 m vs ~0.0025 m for random), so the PROJ default 3857→26918 path exactly inverts the EPT build. WGS84/NAD83 are treated as coincident on both legs, as in the source build.
5. **Vertical check.** Class-2 returns minus bilinear DEM: median −0.001 m, MAD 0.017 m, RMSE 0.035 m, 99.8% within 15 cm (456,868 returns). Class 18: median +0.006 m, MAD 0.039 m. EPT Z is the source NAVD88 (Geoid12A) orthometric metres passed through; not ellipsoidal (that would be ~−32 m). **No correction applied.** The DEM was built from these same returns, so this checks datum consistency, not absolute accuracy.
6. **Class interpretation.** The delivery has no vegetation classes. Classes 17/18/25 behave as side-overlap copies of 1/2/9 (base + 16): class 17 heights above ground match class 1 (median 9.0 vs 9.4 m, ~6% single returns), class 18 matches ground within centimetres. The project report and FGDC metadata label 17 "bridge decks" and 18 "high noise", and say overlap classes were used to trip the withheld bit; the EPT has no withheld flag. The script asserts this behaviour and fails if it changes.
7. **CHM.** Per point: height above ground = Z − bilinear DEM. Per cell: max over all class 1 + 17 returns (all returns; the maximum is a first/only return in practice), clamped at 0. Returns > 45 m above ground would be outliers (none). Cells taller than all 8 neighbours by > 8 m are treated as spikes and replaced with the 3 x 3 median (2 cells). Cells with returns but no unclassified return = 0; cells with no returns at all = null.
8. **Structure screen.** Without a building class, cells with ≥ 4 returns above 2 m, ≥ 90% single-return pulses and ≤ 0.6 m height spread, in patches of ≥ 6 cells, are flagged as likely roofs (318 cells). Leaf-off trees produce mostly multi-return pulses, which makes this work reasonably on the houses north-east of Lot 1. Flagged cells keep their height in `canopyHeight` (they cast shadows) but are excluded from cover statistics and tree detection.
9. **Trees.** Gaussian smoothing (σ = 1.5 m) of the CHM; candidate local maxima ≥ 3 m; a candidate is a top if it is the maximum within a disk of radius CW/2, with crown width CW = 2.515 + 0.00901 h² (Popescu & Wynne 2004, mixed forest). `h` = raw CHM max within 1 cell of the top; `r` = equivalent radius of the watershed crown segment (mask CHM ≥ 2 m), clamped to [1 m, 0.75 CW]; `z` = grid ground at the top.

## Audit results

| Measure | Value |
| --- | --- |
| Points in AOI | 5,625,406 (18.8 pts/m², all returns, including overlap) |
| Ground returns (2 + 18) | 1,559,072 (5.2 pts/m²); class 2 alone 1.5 pts/m² |
| Ground returns per 2 m cell | median 18, Lot 1 median 12 |
| Cells with no ground return | 4,239 (5.7%); 1,741 excluding water cells; largest land gap 36 cells (144 m²); 71 in Lot 1 |
| Cells with no return at all | 13 (lake) |
| Class counts | 1: 1,084,440 · 2: 456,868 · 7: 8 · 9: 20,155 · 10: 284 · 17: 2,960,651 · 18: 1,102,204 · 25: 796 |
| Noise / outliers | 8 low-noise points (class 7) excluded; 0 returns > 45 m; 66 unclassified returns > 0.5 m below DEM (clamped); 2 spike cells |
| Canopy cover ≥ 2 m | AOI 85.8%, Lot 1 96.8% |
| Canopy cover ≥ 5 m | AOI 83.9%, Lot 1 96.5% |
| Mean / max canopy height | AOI 13.2 / 26.2 m; Lot 1 15.2 / 24.5 m |
| Mean canopy over house footprint | 12.0 m |
| Detected trees | 1,659 in AOI; 70 in Lot 1; 29 within 30 m of the provisional house |
| Tree heights | median 19.5 m, P90 22.8 m, max 26.2 m |

Visual check against 2024 and 2014 NYS orthos (resampled to the grid): road corridors, the clearing east of Lot 1 and the houses to the north-east line up with CHM gaps and structure flags. The red-roofed outbuilding just east of Lot 1 is absent from the 2014 aerial and appears as canopy in the CHM, a direct example of post-flight change.

## Limitations

- **Leaf-off.** Flight window 2014-11-02 to 2015-05-08. Deciduous crowns return from bare branches, so crown extent, cover and summer shading are under-represented. Conifer crowns are better captured. Summer shade will be larger than this model.
- **Age.** 10+ years of growth (and any cutting, including later clearing and the 2025 proposal) since the flight. Treat as a 2014–15 baseline.
- **No vegetation classes.** Canopy = every unclassified return, so roofs, vehicles and wires can appear as canopy. The structure screen is a heuristic, not a classification.
- **Overlap classes** interpreted from behaviour, not documentation. Overlap classification was automated and never manually verified by the vendor.
- **Ground classification errors** propagate into both ground and canopy height. Cells without ground returns rely on USGS DEM interpolation.
- **Tree detection** finds dominant crowns only: clustered crowns merge, understory is missed, multi-stem crowns can split. ~55 trees/ha is well below the true stem density. Crown radius is a segmentation estimate capped by allometry, not a measured crown.
- **Lot 1 / house** outlines are the provisional display fit (RMS 3.1 m, leave-one-out max 11.6 m). Lot 1 statistics inherit that error and must not support setback or clearing-limit calculations.
- Ground is hydroflattened NAVD88 DEM; water is not lake bottom. For a globe viewer, NAVD88 must be converted to ellipsoidal heights.

## What this enables

- Terrain + canopy sun-shadow casting around the provisional house position (heights as obstacles per 2 m cell), for any date and time, once a sun model is attached.
- Tree-removal studies: remove individual crowns (`crownId`), clear a radius around the house, or simulate a clearing limit, then compare the change in shaded hours or solar access on the footprint and roof.
- Identify which trees (by height and position) dominate winter low-sun shading from the south, and which canopy acts as summer shade or wind shelter.
- Canopy cover and height summaries for screening and for briefing an arborist or surveyor; not a tree survey.

Before relying on results for design: verify Lot 1 / house position with survey control, check current canopy (photos or new LiDAR / photogrammetry), and treat deciduous crowns as larger in leaf-on season.
