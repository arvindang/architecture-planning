# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## What this is

A six-week residential architecture + software experiment. Two halves:

- **Groundwork** — a static, dependency-free project-management workspace (vanilla HTML/CSS/JS, no build, no backend, no external scripts).
- **Dannemora site research** — an archived, sourced evidence set (aerials, permit drawings, 1 m USGS DEM, screening layers) plus Python scripts that turn it into browser data files.

No parcel has been selected and no regulatory feasibility determination has been made. Dannemora is a research candidate, not the project site. Keep that distinction in UI copy and docs.

## Commands

There is no build, lint, or test suite.

```sh
# Serve the workspace (keep host+port stable — localStorage is per-origin; 127.0.0.1 ≠ localhost)
python3 -m http.server 4173 --bind 127.0.0.1

# Regenerate site findings (writes site-findings-data.js and ops/site-findings.md; asserts linked files exist)
python3 scripts/prepare-site-findings.py

# Provisional permit-to-aerial overlay, then rebuild the evidence gallery (order matters)
python3 scripts/align-permit-aerial.py      # NumPy + GDAL (osgeo); writes sources/dannemora/permit-*.json/geojson
python3 scripts/prepare-site-evidence.py    # writes site-evidence-data.js

# Permit layout SVGs (writes assets/sites/dannemora/*-permitted-layout.svg + register)
python3 scripts/prepare-permitted-layout.py
```

Terrain derivatives need the GIS runtime from the adjacent repo (rasterio, pyproj, scipy, scikit-image, shapely, Pillow); do not install a new environment. Full invocation with source/datum arguments is in `ops/terrain.md`:

```sh
../mapping-race-courses/.venv/bin/python scripts/prepare-terrain.py --dem sources/dannemora/terrain/dannemora-dem-1m.tif ...
```

## Architecture

**Generated data files — never hand-edit.** `site-findings-data.js`, `site-evidence-data.js`, `terrain-data.js`, `ops/site-findings.md`, and everything under `assets/sites/dannemora/terrain/` are script outputs. Edit the source (`ops/site-findings.json`, `sources/dannemora/*.json`, the DEM) and rerun the matching script. Each script resolves paths from the repo root, so run from anywhere.

**Browser runtime.** `index.html` loads plain `defer` scripts in order; they share globals rather than using modules:

- `*-data.js` define `SITE_EVIDENCE`, `SITE_TERRAIN`, `SITE_FINDINGS`.
- `site-terrain.js` (canvas 3D mesh, maps, profiles), `site-evidence.js` (`siteResearchView` and its tabs), `site-research.js` (`siteProgressView` overview card) define render functions and module-level view state (`let terrainYaw`, `let siteEvidenceTab`, …).
- `app.js` loads last: owns state, hash routing (`#overview`, `#site`, …), `render()`, the editor dialog, and import/export. It calls into the site modules (e.g. `siteResearchView` for the `site` stage, `initSiteTerrain` after render). Views are HTML template strings; escape interpolated text with `e()`.

**Workspace state.** Stored in localStorage under `fieldwork.workspace.v1` — keep that key (it predates the Groundwork rename and preserves saved projects/old exports). Exports carry `schemaVersion: 1`; `validateWorkspace` checks imports, which append copies under new IDs. Each project has an incrementing `revision`; recording a decision marks user-selected checks/deliverables stale until reviewed (manual dependency tracking, not model-change detection). A passing check or ready deliverable requires source, link, findings, and model/input revision. Shared Dannemora research must never alter a project's selected site or manual check states.

## Evidence and geometry rules

These constraints recur across `ops/` and must survive any change:

- Lot 1 is **not** georeferenced. The permit-to-aerial fit is a provisional display overlay (RMS 3.1 m against county tax GIS, not survey control). Never feed provisional traces into setback, earthwork, slope-statistics, or terrain calculations.
- Colour conventions: purple = Lot 1, orange = provisional/proposed house footprint, cyan = county parent parcel.
- DEM: EPSG:26918 metres, NAVD88 heights (Geoid12A), 2014–15 flight window. Preserve source CRS and datum; declare units at every boundary; keep NoData rather than interpolating. NAVD88 is not ellipsoidal height.
- Check outcomes are `pass`/`fail`/`unknown`/`not_applicable`; applicability needs a reason. Keep evidence confidence and professional review separate from software outcomes.
- An LLM may organize evidence or critique, but must not silently establish a regulatory rule or measurement.
- `sources/01-*.txt` and `02-*.txt` are verbatim planning conversations, not verified references.

## Project state (`ops/`)

Durable state lives in `ops/` — update `backlog.md` and `decisions.md` as work progresses. `site-findings.json` is the canonical candidate summary; cite its stable SF finding IDs in later design decisions. `terrain.md` has acquisition provenance and remaining gates; `architecture.md` has the proposed (not yet selected) analysis stack.
