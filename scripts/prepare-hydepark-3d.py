#!/usr/bin/env python3
"""Build the Hydepark Home 3D sun & shade dataset (SITE_HYDEPARK_3D) around Lot 25.

Shared frame: EPSG:26916 (NAD83 / UTM 16N, metres), heights NAVD88 metres, local origin
[450532, 4627452]; local x = E - 450532 (east), y = N - 4627452 (north).

Inputs (raw downloads cached under sources/hydepark/cache/, gitignored):
  - USGS 3DEP 1 m DEM tile x45y463 (IL 4 County QL1 2016 B16 project), clipped over HTTP with GDAL
  - USGS 3DEP point cloud, Cook County 2017 Entwine Point Tile (public AWS bucket)
  - City of Chicago Building Footprints (Socrata syp8-uezg; dataset last updated 2015)
  - City of Chicago building permits (Socrata ydr8-5enu): new construction / wrecking since 2015
  - Cook County GIS parcels already archived in sources/hydepark/county-parcels.geojson

Outputs: hydepark-3d-data.js, sources/hydepark/buildings.geojson, sources/hydepark/terrain/acquisition.json,
assets/sites/hydepark/site3d/{ground-hillshade,canopy-height}.png.

Run from anywhere with the repo venv:
  .venv/bin/python scripts/prepare-hydepark-3d.py                  # download missing inputs, build
  .venv/bin/python scripts/prepare-hydepark-3d.py --skip-download  # cache only, no network
"""
import argparse
import hashlib
import json
import subprocess
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import laspy
import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from scipy import ndimage
from shapely import contains_xy
from shapely.geometry import Polygon, mapping, shape
from shapely.ops import unary_union
from skimage.segmentation import watershed

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'sources/hydepark/cache'
PARCELS = ROOT / 'sources/hydepark/county-parcels.geojson'
BUILDINGS_OUT = ROOT / 'sources/hydepark/buildings.geojson'
ACQ_OUT = ROOT / 'sources/hydepark/terrain/acquisition.json'
PNG_DIR = ROOT / 'assets/sites/hydepark/site3d'
JS_OUT = ROOT / 'hydepark-3d-data.js'
MD_OUT = ROOT / 'ops/hydepark-3d.md'
LAT = 41.7974            # Lot 25, for the indicative noon sun angles in the md
# Clear distances read off the plats (ops/hydepark-site.json) for the neighbours they show
PLAT_CLEAR = {'chi-471747': '0.35 ft (2018 plat)', 'chi-471786': '0.30–0.35 ft (2018 plat)', 'chi-470885': '20.37 ft (2014 plat)'}
NEIGHBOUR_MAX_M = 10.0

ORIGIN = (450532.0, 4627452.0)
HALF = 80.0            # extent = origin +/- 80 m -> 160 x 160 cells at 1 m
SPACING = 1.0
FETCH_BUFFER = 30.0    # extra LiDAR beyond the extent so edge buildings get full roofs
PX_PER_CELL = 4

EPT_URL = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_IL_4County_Cook_2017_LAS_2019'
EPT_RESOURCES = 'https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson'
DEM_URL = ('https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/IL_4_County_QL1_LiDAR_2016_B16/'
           'TIFF/USGS_1M_16_x45y463_IL_4_County_QL1_LiDAR_2016_B16.tif')
TNM_API = 'https://tnmaccess.nationalmap.gov/api/v1/products'
FOOTPRINTS_ID = 'syp8-uezg'
PERMITS_ID = 'ydr8-5enu'
SOCRATA = 'https://data.cityofchicago.org/resource'

LOT_PINS = ('20114200250000', '20114200260000')
DEMOLISHED = {'5418': 'Wrecking permit B100966644, June 7, 2022 (ops/hydepark-site.json HP-004)',
              '5420': 'Wrecking permit B100967275, June 7, 2022 (ops/hydepark-site.json HP-004)'}
ROW = dict(kimbark=66 * 0.3048, rearAlley=24 * 0.3048, northAlley=20 * 0.3048)

NOISE = (7, 18)          # low noise, high noise (ASPRS LAS 1.4)
GROUND = (2,)
VEG = (3, 4, 5)          # low / medium / high vegetation
BUILDING = (6,)
MIN_TREE_H = 3.0
MAX_PLAUSIBLE_HAG = 60.0
SPIKE_M = 8.0
ROOF_ERODE_M = 0.75
MIN_ROOF_PTS = 20
M_PER_STORY = 3.3        # fallback only, when LiDAR is missing
# 2017 tree tops on Lot 25 west of this local x (the rear half, away from the demolished houses) are kept: the 2025
# leaf-on Cook County ortho (assets/sites/hydepark/aerial-2025.jpg) still shows that canopy over the rear of the lot.
LOT_TREE_KEEP_WEST_OF_X = -5.0
UA = {'User-Agent': 'groundwork-site-research/1.0 (public USGS / City of Chicago open data)'}

to_utm = Transformer.from_crs(4326, 26916, always_xy=True)
to_wgs = Transformer.from_crs(26916, 4326, always_xy=True)
merc_to_utm = Transformer.from_crs(3857, 26916, always_xy=True)
utm_to_merc = Transformer.from_crs(26916, 3857, always_xy=True)


def log(*a):
    print(*a, flush=True)


def get(url):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                return r.read()
        except OSError as err:
            if attempt == 4:
                raise
            log(f'  retry {url}: {err}')
            time.sleep(2 * (attempt + 1))


def cached(path, url, skip):
    path = Path(path)
    if not path.exists():
        if skip:
            raise FileNotFoundError(f'{rel(path)} missing; rerun without --skip-download')
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + '.part')
        tmp.write_bytes(get(url))
        tmp.rename(path)
    return path


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def rel(p):
    return str(Path(p).resolve().relative_to(ROOT))


def r2(v):
    return None if v is None or not np.isfinite(v) else round(float(v), 2)


def loc(x, y):
    return [round(float(x) - ORIGIN[0], 2), round(float(y) - ORIGIN[1], 2)]


def ring_local(poly):
    return [loc(x, y) for x, y in poly.exterior.coords]


def wgs_poly(coords):
    x, y = to_utm.transform(*zip(*coords))
    return Polygon(list(zip(x, y))).buffer(0)


# --------------------------------------------------------------------------- grid
def grid():
    x0, y0 = ORIGIN[0] - HALF, ORIGIN[1] - HALF
    x1, y1 = ORIGIN[0] + HALF, ORIGIN[1] + HALF
    n = int(round(2 * HALF / SPACING))
    cx = x0 + SPACING / 2 + np.arange(n) * SPACING
    cy = y1 - SPACING / 2 - np.arange(n) * SPACING
    return dict(x0=x0, y0=y0, x1=x1, y1=y1, cols=n, rows=n, cx=cx, cy=cy)


def cell_index(x, y, g):
    c = np.floor((x - g['x0']) / SPACING).astype(int)
    r = np.floor((g['y1'] - y) / SPACING).astype(int)
    ok = (c >= 0) & (c < g['cols']) & (r >= 0) & (r < g['rows'])
    return r * g['cols'] + c, ok


# --------------------------------------------------------------------------- DEM
def fetch_dem(skip):
    clip = CACHE / 'dem/usgs-1m-x45y463-clip.tif'
    b = HALF + 60
    if not clip.exists():
        if skip:
            raise FileNotFoundError(f'{rel(clip)} missing; rerun without --skip-download')
        clip.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['gdal_translate', '-q', '-projwin', str(ORIGIN[0] - b), str(ORIGIN[1] + b), str(ORIGIN[0] + b),
                        str(ORIGIN[1] - b), '-co', 'COMPRESS=DEFLATE', f'/vsicurl/{DEM_URL}', str(clip)], check=True)
    return clip


def read_dem(clip, g):
    with rasterio.open(clip) as ds:
        if ds.crs.to_epsg() != 26916:
            raise ValueError(f'DEM CRS {ds.crs} is not EPSG:26916')
        t = ds.transform
        if abs(t.a - 1) > 1e-6 or abs(t.e + 1) > 1e-6:
            raise ValueError('Expected a 1 m north-up DEM')
        dem = ds.read(1, masked=True).astype(float).filled(np.nan)
        left, top = t.c, t.f
    c0, r0 = (g['x0'] - left), (top - g['y1'])
    if abs(c0 - round(c0)) > 0.01 or abs(r0 - round(r0)) > 0.01:
        raise ValueError(f'Grid not aligned to DEM pixel edges ({c0}, {r0})')
    c0, r0 = int(round(c0)), int(round(r0))
    ground = dem[r0:r0 + g['rows'], c0:c0 + g['cols']]
    if ground.shape != (g['rows'], g['cols']):
        raise ValueError('Extent falls outside the DEM clip')

    def sample(x, y):
        return ndimage.map_coordinates(dem, [(top - y) - 0.5, (x - left) - 0.5], order=1, mode='constant', cval=np.nan)
    return ground.copy(), sample


# --------------------------------------------------------------------------- EPT
def walk_hierarchy(meta, q, skip):
    b = np.array(meta['bounds'], float)
    hdir = CACHE / 'ept/ept-hierarchy'

    def hit(key):
        d, x, y, _ = map(int, key.split('-'))
        w = (b[3:] - b[:3]) / 2 ** d
        lo = b[:3] + w * np.array([x, y, 0])
        return lo[0] < q[2] and lo[0] + w[0] > q[0] and lo[1] < q[3] and lo[1] + w[1] > q[1]

    todo, nodes, files = ['0-0-0-0'], {}, []
    while todo:
        key = todo.pop()
        files.append(key)
        h = json.loads(cached(hdir / f'{key}.json', f'{EPT_URL}/ept-hierarchy/{key}.json', skip).read_text())
        for k, n in h.items():
            if not hit(k):
                continue
            if n == -1:
                todo.append(k)
            elif n > 0:
                nodes[k] = n
    return nodes, sorted(files)


def fetch_nodes(nodes, skip):
    ddir = CACHE / 'ept/ept-data'

    def dl(k):
        return k, cached(ddir / f'{k}.laz', f'{EPT_URL}/ept-data/{k}.laz', skip)
    with ThreadPoolExecutor(8) as ex:
        return list(ex.map(dl, sorted(nodes, key=lambda k: tuple(map(int, k.split('-'))))))


def load_points(paths, box):
    parts, raw = [], 0
    for _, p in paths:
        las = laspy.read(p)
        raw += len(las.points)
        mx, my = np.asarray(las.x), np.asarray(las.y)
        x, y = merc_to_utm.transform(mx, my)
        m = (x >= box[0]) & (x < box[2]) & (y >= box[1]) & (y < box[3])
        if not m.any():
            continue
        parts.append(dict(x=x[m], y=y[m], z=np.asarray(las.z)[m],
                          cls=np.asarray(las.classification)[m].astype(np.uint8),
                          ret=np.asarray(las.return_number)[m].astype(np.uint8),
                          nret=np.asarray(las.number_of_returns)[m].astype(np.uint8),
                          gps=np.asarray(las.gps_time)[m]))
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}, raw


def gps_date(t):
    # Adjusted standard GPS time (LAS 1.4 global encoding): seconds since GPS epoch minus 1e9; leap seconds ignored
    return (datetime(1980, 1, 6, tzinfo=timezone.utc) + timedelta(seconds=float(t) + 1e9)).date().isoformat()


# --------------------------------------------------------------------------- open data
def socrata(dataset, params, path, skip):
    url = f'{SOCRATA}/{dataset}.geojson?' + urllib.parse.urlencode(params) if path.suffix == '.geojson' else \
        f'{SOCRATA}/{dataset}.json?' + urllib.parse.urlencode(params)
    return json.loads(cached(path, url, skip).read_text()), url


def wgs_box(buffer):
    lo = to_wgs.transform(ORIGIN[0] - HALF - buffer, ORIGIN[1] - HALF - buffer)
    hi = to_wgs.transform(ORIGIN[0] + HALF + buffer, ORIGIN[1] + HALF + buffer)
    return lo, hi


def address(p):
    a, b = p.get('f_add1') or '0', p.get('t_add1') or '0'
    if a in ('', '0'):
        return None
    num = a if a == b or b in ('', '0') else f'{a}–{b}'
    st = ' '.join(s.capitalize() for s in (p.get('st_name1') or '').split())
    typ = {'AVE': 'Ave', 'ST': 'St'}.get((p.get('st_type1') or '').upper(), (p.get('st_type1') or '').title())
    return f"{num} {p.get('pre_dir1') or ''} {st} {typ}".replace('  ', ' ').strip()


def as_int(v):
    try:
        v = int(float(v))
    except (TypeError, ValueError):
        return None
    return v or None


# --------------------------------------------------------------------------- canopy
def crown_width(h):
    """Popescu & Wynne (2004) mixed-forest allometry; a rough cap for urban crowns."""
    return 2.51503 + 0.00901 * h ** 2


def detect_trees(chm, valid, g):
    rows, cols = chm.shape
    base = np.where(valid, chm, 0.0)
    sm = ndimage.gaussian_filter(base, sigma=1.0)
    cand = (sm == ndimage.maximum_filter(sm, size=3)) & (sm >= MIN_TREE_H) & valid
    rr, cc = np.nonzero(cand)
    order = np.argsort(-sm[rr, cc])
    tops = []
    for r, c in zip(rr[order], cc[order]):
        h = sm[r, c]
        rad = max(1, int(np.round(0.5 * crown_width(h) / SPACING)))
        r0, r1, c0, c1 = max(0, r - rad), min(rows, r + rad + 1), max(0, c - rad), min(cols, c + rad + 1)
        yy, xx = np.mgrid[r0:r1, c0:c1]
        disk = (yy - r) ** 2 + (xx - c) ** 2 <= rad ** 2
        if sm[r0:r1, c0:c1][disk].max() > h + 1e-9:
            continue
        tops.append((r, c))
    markers = np.zeros(chm.shape, int)
    for i, (r, c) in enumerate(tops, 1):
        markers[r, c] = i
    labels = watershed(-sm, markers, mask=(sm >= 2.0) & valid)
    areas = np.bincount(labels.ravel(), minlength=len(tops) + 1) * SPACING ** 2
    out = []
    for i, (r, c) in enumerate(tops, 1):
        win = (slice(max(0, r - 1), r + 2), slice(max(0, c - 1), c + 2))
        h = float(chm[win][valid[win]].max())
        rad = float(np.clip(np.sqrt(areas[i] / np.pi) if areas[i] else 0.5, 1.0, 0.75 * crown_width(h)))
        out.append(dict(r=r, c=c, h=h, rad=rad))
    return out, labels


# --------------------------------------------------------------------------- rendering
def ramp(v, stops, colors):
    return np.stack([np.interp(v, stops, np.array(colors, float)[:, i]) for i in range(3)], -1)


def hillshade(z, az=315, alt=45):
    gy, gx = np.gradient(z, SPACING)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    a, l = np.radians(az), np.radians(alt)
    return np.clip(np.sin(l) * np.cos(slope) + np.cos(l) * np.sin(slope) * np.cos(a - aspect), 0, 1)


def ground_png(ground, path):
    z = np.where(np.isfinite(ground), ground, np.nanmean(ground))
    big = np.asarray(Image.fromarray(z.astype(np.float32), 'F').resize(
        (z.shape[1] * PX_PER_CELL, z.shape[0] * PX_PER_CELL), Image.BILINEAR))
    lo, hi = np.nanpercentile(ground, 1), np.nanpercentile(ground, 99)
    rgb = ramp((big - lo) / max(hi - lo, 0.1), [0, 0.25, 0.5, 0.75, 1],
               [[38, 84, 124], [86, 160, 160], [196, 214, 160], [222, 178, 110], [170, 104, 70]])
    hs = 0.55 + 0.45 * hillshade(big * 3.0 * PX_PER_CELL)  # 3x vertical exaggeration on a near-flat block
    Image.fromarray((rgb * hs[..., None]).clip(0, 255).astype(np.uint8), 'RGB').save(path, optimize=True)
    return dict(lowM=r2(lo), highM=r2(hi))


def canopy_png(chm, labels, path):
    h = np.where(labels > 0, chm, 0)
    rgba = np.zeros((*h.shape, 4), np.uint8)
    rgba[..., :3] = ramp(h, [0, 3, 6, 10, 15, 20, 25], [[0, 0, 0], [205, 228, 170], [160, 205, 125], [110, 175, 90],
                                                         [60, 140, 70], [30, 105, 58], [12, 72, 44]]).astype(np.uint8)
    rgba[..., 3] = np.where(h >= 2.0, 220, 0).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').resize((h.shape[1] * PX_PER_CELL, h.shape[0] * PX_PER_CELL), Image.NEAREST).save(path, optimize=True)


# --------------------------------------------------------------------------- ops md
def ft(m):
    return f'{m / 0.3048:.1f}'


def write_md(data, buildings, demolished, lot_trees, trees, terrain, lidar, horiz, permits, fp_updated, lot_u, lot_v):
    near = sorted([b for b in buildings if b['distanceToLotM'] <= NEIGHBOUR_MAX_M], key=lambda b: (b['side'], b['distanceToLotM']))
    rows = []
    for b in near:
        h = b['heightM']
        eave = b['eaveZ'] - b['groundZ'] if b['eaveZ'] is not None else None
        rows.append(f"| {b['address']} (`{b['id']}`) | {b['side']} | {h:.1f} m / {ft(h)} ft | {eave:.1f} m | {b['stories'] or '–'} | "
                    f"{b['yearBuilt'] or '–'} | {b['widthM']:.1f} m / {ft(b['widthM'])} ft | {b['depthM']:.1f} m / {ft(b['depthM'])} ft | "
                    f"{b['distanceToLotM']:.1f} m / {ft(b['distanceToLotM'])} ft | {PLAT_CLEAR.get(b['id'], '–')} |")
    lx = [q[0] for q in data['lot']]
    ly = [q[1] for q in data['lot']]
    east_trees = [t for t in trees if max(lx) < t['x'] < max(lx) + 35 and min(ly) - 15 < t['y'] < max(ly) + 15]
    noon = {k: 90 - LAT + d for k, d in (('December solstice', -23.44), ('equinox', 0.0), ('June solstice', 23.44))}
    b5422 = next((b for b in buildings if b['id'] == 'chi-471747'), None)
    sun = []
    if b5422:
        for k, alt in noon.items():
            t = np.tan(np.radians(alt))
            reach = ', '.join(f'{z:.0f} m → {max(b5422["heightM"] - z, 0) / t:.1f} m' for z in (0, 1, 4, 7))
            sun.append(f'| {k} | {alt:.1f}° | {reach} |')
    lot_w = lot_v[1] - lot_v[0]
    kept = [t for t in lot_trees if t['kept']]
    vac = [p for p in permits if p.get('permit_type') == 'PERMIT - NEW CONSTRUCTION']
    md = f'''# Hydepark 3D site model — terrain, neighbours, trees

Generated by `scripts/prepare-hydepark-3d.py` (`--skip-download` rebuilds from the gitignored `sources/hydepark/cache/`).
Do not edit; change the script and rerun. Outputs: `hydepark-3d-data.js` (`SITE_HYDEPARK_3D`),
`sources/hydepark/buildings.geojson` (EPSG:26916), `sources/hydepark/terrain/acquisition.json` (URLs, sha256),
`assets/sites/hydepark/site3d/ground-hillshade.png` and `canopy-height.png` ({PX_PER_CELL} px per 1 m cell, extent below).

## Frame

EPSG:26916 (NAD83 / UTM 16N) metres, heights NAVD88 metres. Local origin [450532, 4627452]; x = E − 450532 (east),
y = N − 4627452 (north). Grid {data['cols']} × {data['rows']} cells at {SPACING:g} m, extent {data['extent']} local m, row 0 = north edge.
The street grid runs {data['conventions']['streetAxisDeg']:+.2f}° from UTM grid east. Lot 25 (county GIS union of PINs 20-11-420-025
and -026) spans local x {min(lx):.1f} to {max(lx):.1f}, y {min(ly):.1f} to {max(ly):.1f} and is {lot_u[1] - lot_u[0]:.1f} × {lot_w:.1f} m in GIS ({ft(lot_u[1] - lot_u[0])} × {ft(lot_w)} ft;
record 175 × 40 ft — see `ops/hydepark-imagery.md` for the ±0.5–1 m GIS error budget).

## Sources

- **LiDAR**: {lidar['project']}. Flown {lidar['collected']}; {lidar['quality']}; {lidar['pointDensity']['allReturnsPerM2']} returns/m²
  in the extent ({lidar['pointDensity']['groundPerM2']} ground/m²). Classes present: {', '.join(f"{k} {lidar['classes']['names'].get(k, '?')}" for k in lidar['classes']['counts'])}.
  The EPT stores every point as return 1 of 1 and quantises GPS time, so first/last-return filtering is impossible; class
  codes do the separation. No newer public point cloud covers the lot: the usgs-lidar-public resource list and the USGS TNM
  API both return only this 2017 Cook County flight (checked 2026-10-22).
- **Ground**: USGS 3DEP 1 m DEM tile x45y463 from the same project, clipped over HTTP; DEM pixels coincide with grid cells.
  Class-2 returns sit {lidar['vertical']['medianOffsetM']:+.3f} m from the DEM (MAD {lidar['vertical']['madM']:.3f} m), so EPT Z is NAVD88 metres
  unchanged (this checks consistency, not absolute accuracy — the DEM is built from these returns).
- **Horizontal**: EPT Web Mercator → EPSG:26916 with PROJ, WGS84 ≡ NAD83. Class-6 returns best overlap the city footprints after
  a shift of {horiz['footprintCheck']['bestShiftM'][0]:+.2f} m E, {horiz['footprintCheck']['bestShiftM'][1]:+.2f} m N (IoU {horiz['footprintCheck']['iouUnshifted']:.3f} → {horiz['footprintCheck']['iouAtBest']:.3f}); that is inside the
  footprints' own ~1 m accuracy, so nothing is corrected.
- **Footprints**: City of Chicago Building Footprints (`syp8-uezg`, last updated {fp_updated}) for outlines, stories, year built
  and units. Outlines are digitised roof edges (~1 m), not walls.
- **Permits**: City of Chicago building permits since 2015 in the extent (new construction / wrecking), to flag change since
  the flight. {len(vac)} new-construction record(s); only one erects a building (5446 S Kimbark, 2023).

## Method

- `ground`: DEM value per cell (bare earth; interpolated under buildings).
- `surface`: maximum non-noise return per cell (classes other than 7/18), never below ground; cells with no returns inside a
  standing footprint take the nearest roof value, elsewhere ground. **Lot 25 is masked to ground** (parcel plus the old house
  footprints + 0.5 m, minus standing footprints) because the 2017 flight predates the June 2022 wrecking of both houses —
  except the {len(kept)} rear-yard tree crown(s) that the 2025 leaf-on county ortho still shows.
- `buildings`: every city footprint touching the extent. `roofZ` / `eaveZ` = 95th / 25th percentile of class-6 returns inside
  the footprint eroded {ROOF_ERODE_M} m; `groundZ` = median DEM in a 0.5–2.5 m ring outside the footprint (other footprints
  removed); `heightM` = roofZ − groundZ. `widthM` is measured along the street the building fronts (Kimbark/Woodlawn: N–S;
  E 54th St: E–W; unaddressed garages: N–S), `depthM` across it. `side` comes from the largest clear gap to the lot rectangle
  (west → across-alley; east beyond half the Kimbark ROW → across-street). `distanceToLotM` = shortest distance from the
  footprint to the GIS lot outline.
- `demolished`: the 5418/5420 houses (still in the 2017 data) and one footprint with no 2017 roof returns.
- `trees`: local maxima ≥ {MIN_TREE_H:g} m on a 1 m canopy height model from vegetation returns (3/4/5), tops outside standing
  footprints; crown radius = watershed area, capped by a height allometry.

## Neighbour table (buildings within {NEIGHBOUR_MAX_M:g} m of Lot 25)

Heights are above the building's own surrounding grade. "Clear" = GIS distance from the Lot 25 outline to the footprint (the
building wall/eave line); a 0.0 means the outlines touch within their ~0.5–1 m error, so use the plat value where one exists.

| Building | Side | Height | Lower roof (eave) | Stories | Built | Frontage width | Depth | Clear (GIS) | Clear (plat) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
{chr(10).join(rows)}

**Across Kimbark (east)** there are no buildings: the east side of the 5400 block is Nichols Park. The nearest built frontage
east is beyond the extent. {len(east_trees)} parkway/park tree tops stand within 35 m east of the front line and 15 m of the lot's side lines
({', '.join(f"{t['h']:.0f}" for t in sorted(east_trees, key=lambda t: -t['h']))} m tall); they shade the front in the morning when in leaf.

**Side-yard space**: on the south, 5422 and its garage stand 0.30–0.35 ft off the line (plat), so there is no walking space on
the neighbour's side; any south side yard has to come out of Lot 25. On the north the 20 ft public alley is open, and 5412 stands
another ~0.4 ft beyond it (20.37 ft from the line). The rear faces the 24 ft alley and the 3-story Woodlawn courtyard building.

Height cross-check against stories: the 2-story Kimbark and E 54th St buildings come out at 8.4–9.0 m (≈ 4.2–4.5 m per story
including a raised basement and parapet); the 3-story Woodlawn and 5428 Kimbark buildings at 11.6–12.6 m (≈ 3.9–4.1 m per
story). Both are consistent with masonry flats with raised basements. 5422 reads as a flat roof: eave (p25) and top (p95) differ
by only {b5422['roofZ'] - b5422['eaveZ']:.1f} m. The 2018 plat calls it 2½-story; the city record says 2.

## Indicative noon shade from 5422 (flat roof, {b5422['heightM']:.1f} m)

Shadow reach north of 5422's wall at solar noon, for a point at the given height above grade, on a flat site (sun due south;
street axis is within 1° of east). Lot 25 is {lot_w:.1f} m wide in GIS; 5422 runs along roughly the front {b5422['depthM']:.0f} m of the
south line (x {min(q[0] for q in b5422['ring']):.0f} to {max(q[0] for q in b5422['ring']):.0f} local m). For anything off-noon use the 3D viewer.

| Date | Noon altitude | Shadow reach for a point at height 0 / 1 / 4 / 7 m |
| --- | --- | --- |
{chr(10).join(sun)}

## Terrain (2017 bare earth)

Lot 25 ground {terrain['lotMinZ']:.2f}–{terrain['lotMaxZ']:.2f} m NAVD88 (mean {terrain['lotMeanZ']:.2f}). Best-fit plane falls
{terrain['fallM']:.2f} m toward {terrain['fallDirection']} (bearing {terrain['fallBearingDeg']:.0f}°, {terrain['planeSlopePct']:.1f}%). Front (Kimbark) strip
{terrain['frontZ']:.2f} m, rear (alley) strip {terrain['rearZ']:.2f} m; Kimbark centreline {terrain['streetZ']:.2f} m, rear alley centreline
{terrain['alleyZ']:.2f} m, north alley centreline {terrain['northAlleyZ']:.2f} m. The low point is a shallow hollow on the front half
between and under the two 2017 houses (DEM interpolated there); the 2022 demolition and backfill will have changed it.
The block varies by only ~1.5 m over 160 m.

## Limits

- The LiDAR is from {lidar['collected'].split(' (')[0]}, leaf-off. Buildings are a 2017 snapshot, trees have had 9 more seasons of
  growth, and summer crowns are larger than this surface shows.
- City footprints were last updated {fp_updated}. Changes after that are known only from permits: the Lot 25 houses (wrecked 2022)
  and 5446 S Kimbark (2-story frame wrecked 2023, 3-story 3-unit building permitted 2023 — modelled as an estimate on the old
  outline). Garages and porches changed without permits will be missed.
- Roof percentiles approximate a ridge/parapet and a lower roof plane; they are not a roof model. Chimneys, rooftop units and
  thin parapets are under-represented at p95.
- Every outline (county parcels, city footprints) is ±0.5–1 m. Use the plats for near-line distances and the new combined
  survey for anything that sets a setback.
- Trees are detected tops, not an inventory: clustered crowns merge and small trees are missed. Species and health unknown.
- Heights are software measurements from public data, not a survey. An LLM organised this evidence; nothing here sets a
  regulatory rule.
'''
    MD_OUT.write_text(md)


# --------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--skip-download', action='store_true', help='use only sources/hydepark/cache; no network access')
    ap.add_argument('--debug-dir', help='also write intermediate grids (npz) here')
    a = ap.parse_args()
    skip = a.skip_download
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    ACQ_OUT.parent.mkdir(parents=True, exist_ok=True)
    g = grid()
    rows, cols, n = g['rows'], g['cols'], g['rows'] * g['cols']
    CX, CY = np.meshgrid(g['cx'], g['cy'])

    # ---------------------------------------------------------------- lot
    parcels = json.loads(PARCELS.read_text())
    lot_parts = [wgs_poly(f['geometry']['coordinates'][0]) for f in parcels['features'] if f['properties']['PIN14'] in LOT_PINS]
    if len(lot_parts) != 2:
        raise ValueError('Expected both Lot 25 PINs in county-parcels.geojson')
    lot = unary_union(lot_parts).buffer(0.05).buffer(-0.05).simplify(0.02)
    lot_min_rect = lot.minimum_rotated_rectangle
    # street-grid axis: direction of the lot's long side (east-west); u = along it (east +), v = across (north +)
    rc = np.array(lot_min_rect.exterior.coords)[:4]
    edges = [rc[(i + 1) % 4] - rc[i] for i in range(4)]
    long_edge = max(edges, key=np.linalg.norm)
    if long_edge[0] < 0:
        long_edge = -long_edge
    ue = long_edge / np.linalg.norm(long_edge)
    ve = np.array([-ue[1], ue[0]])
    axis_deg = float(np.degrees(np.arctan2(ue[1], ue[0])))
    lc = np.array(lot.centroid.coords[0])

    def uv(x, y):
        d = np.stack([np.asarray(x) - lc[0], np.asarray(y) - lc[1]], -1)
        return d @ ue, d @ ve
    lu, lv = uv(*np.array(lot.exterior.coords).T)
    lot_u, lot_v = (lu.min(), lu.max()), (lv.min(), lv.max())
    log(f'Lot 25: {lot.area:.1f} m2 ({lot.area / 0.09290304:.0f} sq ft GIS), axis {axis_deg:+.2f} deg from UTM east, '
        f'{lot_u[1] - lot_u[0]:.2f} x {lot_v[1] - lot_v[0]:.2f} m')

    # ---------------------------------------------------------------- DEM
    dem_clip = fetch_dem(skip)
    ground, dem_sample = read_dem(dem_clip, g)
    log(f'Ground {np.nanmin(ground):.2f}-{np.nanmax(ground):.2f} m NAVD88, {int(np.isnan(ground).sum())} null cells')

    # ---------------------------------------------------------------- footprints + permits
    (wlo, wla), (ehi, nla) = wgs_box(20)
    fp_where = f'within_box(the_geom, {nla}, {wlo}, {wla}, {ehi})'
    fps, fp_url = socrata(FOOTPRINTS_ID, {'$where': fp_where, '$limit': 5000}, CACHE / 'footprints/syp8-uezg.geojson', skip)
    pm_where = (f"latitude between {wla} and {nla} and longitude between {wlo} and {ehi} and issue_date > '2015-01-01' "
                f"and permit_type in ('PERMIT - NEW CONSTRUCTION', 'PERMIT - WRECKING/DEMOLITION')")
    permits, pm_url = socrata(PERMITS_ID, {'$where': pm_where, '$limit': 1000,
                                           '$select': 'permit_,permit_type,issue_date,street_number,street_direction,street_name,'
                                                      'work_description,latitude,longitude'},
                              CACHE / 'footprints/permits-new-wreck.json', skip)
    fp_meta = json.loads(cached(CACHE / 'footprints/syp8-uezg-metadata.json',
                                'https://data.cityofchicago.org/api/views/syp8-uezg.json', skip).read_text())
    fp_updated = datetime.fromtimestamp(fp_meta.get('rowsUpdatedAt', 0), timezone.utc).date().isoformat()

    # ---------------------------------------------------------------- LiDAR (EPT)
    meta = json.loads(cached(CACHE / 'ept/ept.json', f'{EPT_URL}/ept.json', skip).read_text())
    if meta.get('srs', {}).get('horizontal') != '3857':
        raise ValueError(f'Unexpected EPT SRS {meta.get("srs")}')
    fb = FETCH_BUFFER
    box = (g['x0'] - fb, g['y0'] - fb, g['x1'] + fb, g['y1'] + fb)
    ex = np.r_[np.linspace(box[0], box[2], 11), np.full(11, box[2]), np.linspace(box[2], box[0], 11), np.full(11, box[0])]
    ey = np.r_[np.full(11, box[1]), np.linspace(box[1], box[3], 11), np.full(11, box[3]), np.linspace(box[3], box[1], 11)]
    mx, my = utm_to_merc.transform(ex, ey)
    q = (float(mx.min()) - 2, float(my.min()) - 2, float(mx.max()) + 2, float(my.max()) + 2)
    nodes, hier_files = walk_hierarchy(meta, q, skip)
    paths = fetch_nodes(nodes, skip)
    pts, raw_total = load_points(paths, box)
    npts = len(pts['x'])
    log(f'EPT: {len(nodes)} nodes, {raw_total:,} points decoded, {npts:,} in fetch box')

    classes, counts = np.unique(pts['cls'], return_counts=True)
    class_counts = {str(int(c)): int(k) for c, k in zip(classes, counts)}
    hag_raw = pts['z'] - dem_sample(pts['x'], pts['y'])
    cls_audit = {}
    for c in classes:
        m = (pts['cls'] == c) & np.isfinite(hag_raw)
        h = hag_raw[m]
        cls_audit[str(int(c))] = dict(points=int(m.sum()), hagMedianM=r2(np.median(h)) if h.size else None,
                                      hagP95M=r2(np.percentile(h, 95)) if h.size else None)
    gm = np.isin(pts['cls'], GROUND) & np.isfinite(hag_raw)
    dz = hag_raw[gm]
    vmed = float(np.median(dz))
    vertical = dict(class2Points=int(gm.sum()), medianOffsetM=round(vmed, 3),
                    madM=round(float(np.median(np.abs(dz - vmed))), 3), p05M=round(float(np.percentile(dz, 5)), 3),
                    p95M=round(float(np.percentile(dz, 95)), 3))
    if abs(vmed) > 0.15:
        raise ValueError(f'EPT Z is offset from the NAVD88 DEM by {vmed:.2f} m; check units/datum before continuing')
    log(f'Vertical: class-2 vs DEM median {vmed:+.3f} m, MAD {vertical["madM"]:.3f} m')

    gps = pts['gps']
    in_ext = (pts['x'] >= g['x0']) & (pts['x'] < g['x1']) & (pts['y'] >= g['y0']) & (pts['y'] < g['y1'])
    dates = sorted({gps_date(t) for t in np.percentile(gps[in_ext], [0, 1, 50, 99, 100])})
    day_counts = {}
    for t in gps[in_ext][::50]:
        d = gps_date(t)
        day_counts[d] = day_counts.get(d, 0) + 1
    collected_days = sorted(d for d, k in day_counts.items() if k >= 20)
    ext_area = (g['x1'] - g['x0']) * (g['y1'] - g['y0'])
    density = in_ext.sum() / ext_area
    returns_info = bool(((pts['nret'] > 1) | (pts['ret'] > 1)).any())
    log(f'Collected {collected_days}; density {density:.1f} pts/m2; return numbers present: {returns_info}')

    # ---------------------------------------------------------------- surface (DSM)
    keep = ~np.isin(pts['cls'], NOISE) & np.isfinite(hag_raw) & (hag_raw < MAX_PLAUSIBLE_HAG) & in_ext
    idx, ok = cell_index(pts['x'], pts['y'], g)
    sel = keep & ok
    dsm = np.full(n, -np.inf)
    np.maximum.at(dsm, idx[sel], pts['z'][sel])
    dsm = dsm.reshape(rows, cols)
    any_cnt = np.bincount(idx[sel], minlength=n).reshape(rows, cols)
    nonground = sel & ~np.isin(pts['cls'], GROUND)
    ng_cnt = np.bincount(idx[nonground], minlength=n).reshape(rows, cols)
    empty = any_cnt == 0
    dsm[empty] = np.nan
    dsm = np.where(np.isfinite(dsm), np.maximum(dsm, ground), dsm)
    nb = ndimage.maximum_filter(np.nan_to_num(dsm - ground, nan=0.0), footprint=np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]]))
    spikes = np.isfinite(dsm) & ((dsm - ground) - nb > SPIKE_M)
    dsm[spikes] = ground[spikes] + nb[spikes]

    # ---------------------------------------------------------------- buildings
    permits_by_addr = {}
    for pm in permits:
        permits_by_addr.setdefault(((pm.get('street_number') or '').strip(), ' '.join((pm.get('street_name') or '').split()[:-1]).upper()),
                                   []).append(pm)
    feats = []
    for f in fps['features']:
        geom = shape(f['geometry'])
        polys = list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]
        for k, p in enumerate(polys):
            poly = wgs_poly(p.exterior.coords)
            if poly.area < 4:
                continue
            feats.append((f['properties'], poly, k))
    ext_poly = Polygon([(g['x0'], g['y0']), (g['x1'], g['y0']), (g['x1'], g['y1']), (g['x0'], g['y1'])])
    feats = [t for t in feats if t[1].intersects(ext_poly)]
    footprints_union = unary_union([p for _, p, _ in feats])

    # horizontal check: shift of class-6 (building) returns that best matches the city footprints
    hs_ = 0.25
    hx = np.arange(g['x0'], g['x1'], hs_) + hs_ / 2
    hy = np.arange(g['y1'], g['y0'], -hs_) - hs_ / 2
    HX, HY = np.meshgrid(hx, hy)
    F = contains_xy(footprints_union, HX, HY)
    bm = np.isin(pts['cls'], BUILDING) & in_ext
    bc = ((pts['x'][bm] - g['x0']) / hs_).astype(int)
    br = ((g['y1'] - pts['y'][bm]) / hs_).astype(int)
    B = np.zeros_like(F)
    B[np.clip(br, 0, len(hy) - 1), np.clip(bc, 0, len(hx) - 1)] = True
    B = ndimage.binary_closing(B, iterations=2)
    shifts = []
    for dx in np.arange(-2, 2.01, hs_):
        for dy in np.arange(-2, 2.01, hs_):
            S_ = np.roll(np.roll(B, -int(round(dy / hs_)), 0), int(round(dx / hs_)), 1)
            shifts.append(((S_ & F).sum() / (S_ | F).sum(), float(dx), float(dy)))
    best = max(shifts)
    iou0 = next(i for i, dx, dy in shifts if dx == 0 and dy == 0)
    horiz = dict(method='EPT XY EPSG:3857 -> EPSG:26916 with PROJ (pyproj ' + __import__('pyproj').__version__ +
                 '); WGS84 and NAD83 treated as coincident (no datum shift), as when the EPT was built from NAD83 tiles',
                 footprintCheck=dict(bestShiftM=[best[1], best[2]], iouAtBest=round(float(best[0]), 3), iouUnshifted=round(float(iou0), 3),
                                     note='Shift (east, north) of the class-6 building returns that best overlaps the city footprints on a '
                                          '0.25 m raster. Footprints are ~1 m digitised outlines, so sub-metre shifts are within their '
                                          'accuracy; no correction is applied.'))
    log(f'Horizontal: LiDAR buildings best match footprints shifted {best[1]:+.2f} E, {best[2]:+.2f} N m (IoU {best[0]:.3f} vs {iou0:.3f})')

    # points usable for roof statistics: class 6 (building)
    roof_pts = np.isin(pts['cls'], BUILDING)
    rx, ry, rz = pts['x'][roof_pts], pts['y'][roof_pts], pts['z'][roof_pts]

    def frontage(addr):
        if addr and ('54th' in addr.lower()):
            return 'ew'
        return 'ns'  # Kimbark / Woodlawn fronts and unaddressed garages: measure along the north-south street axis

    def side_of(poly):
        # the largest clear gap between the footprint and the lot rectangle picks the side
        u, v = uv(*np.array(poly.exterior.coords).T)
        gaps = dict(west=lot_u[0] - u.max(), east=u.min() - lot_u[1], north=v.min() - lot_v[1], south=lot_v[0] - v.max())
        k = max(gaps, key=gaps.get)
        if gaps[k] <= 0:  # overlaps the lot rectangle in both axes: use the centroid
            bu, bv = uv(*np.array(poly.centroid.coords[0]))
            k = 'north' if bv > 0 else 'south'
        return {'west': 'across-alley', 'east': 'across-street' if gaps['east'] > ROW['kimbark'] / 2 else 'east'}.get(k, k)

    buildings, demolished = [], []
    for props, poly, part in feats:
        addr = address(props)
        num = (props.get('f_add1') or '').strip()
        bid = f"chi-{props['bldg_id']}" + (f'-{part}' if part else '')
        core = poly.buffer(-ROOF_ERODE_M)
        if core.is_empty or core.area < 2:
            core = poly
        bb = core.bounds
        m = (rx >= bb[0]) & (rx <= bb[2]) & (ry >= bb[1]) & (ry <= bb[3])
        m[m] = contains_xy(core, rx[m], ry[m])
        z = rz[m]
        ring = poly.buffer(2.5).difference(poly.buffer(0.5)).difference(footprints_union)
        if ring.is_empty or ring.area < 2:
            ring = poly.buffer(3).difference(poly)
        rb = ring.bounds
        gx, gy = np.meshgrid(np.arange(np.floor(rb[0]), rb[2], 0.5), np.arange(np.floor(rb[1]), rb[3], 0.5))
        inside = contains_xy(ring, gx, gy)
        gz = dem_sample(gx[inside], gy[inside])
        ground_z = float(np.nanmedian(gz))
        z = z[z > ground_z + 1.5]
        stories = as_int(props.get('stories'))
        if z.size >= MIN_ROOF_PTS:
            roof, eave = float(np.percentile(z, 95)), float(np.percentile(z, 25))
            src = f'LiDAR 2017 (USGS 3DEP Cook): p95/p25 of {z.size} class-6 building returns inside the footprint eroded {ROOF_ERODE_M} m'
        elif stories:
            roof = ground_z + stories * M_PER_STORY + 1.0
            eave = ground_z + stories * M_PER_STORY
            src = f'Estimate: {stories} stories x {M_PER_STORY} m + 1 m roof (too few LiDAR roof returns: {z.size})'
        else:
            roof = eave = None
            src = f'No LiDAR roof returns ({z.size}) and no story count'
        u, v = uv(*np.array(poly.exterior.coords).T)
        du, dv = float(u.max() - u.min()), float(v.max() - v.min())
        fr = frontage(addr)
        width, depth = (dv, du) if fr == 'ns' else (du, dv)
        is_lot = num in DEMOLISHED and (props.get('st_name1') or '').upper() == 'KIMBARK'
        b = dict(id=bid, address=addr or 'Unaddressed outbuilding (likely garage)', ring=ring_local(poly),
                 groundZ=r2(ground_z), roofZ=r2(roof), eaveZ=r2(eave),
                 heightM=r2(roof - ground_z) if roof is not None else None, stories=stories,
                 yearBuilt=as_int(props.get('year_built')), widthM=r2(width), depthM=r2(depth),
                 side='lot' if is_lot else side_of(poly), distanceToLotM=r2(poly.distance(lot)),
                 heightSource=src, note='')
        b['_poly'] = poly
        units = as_int(props.get('no_of_unit'))
        bits = []
        if units:
            bits.append(f'{units} unit(s) (city footprint)')
        if stories and b['heightM']:
            bits.append(f'{b["heightM"] / stories:.1f} m per story incl. roof')
        key = (num, (props.get('st_name1') or '').upper())
        for pm in permits_by_addr.get(key, []):
            bits.append(f"{pm['permit_type'].title().replace('Permit - ', '')} permit {pm['permit_']} issued {pm['issue_date'][:10]}: "
                        f"{pm['work_description'][:90].strip().capitalize()}{'…' if len(pm['work_description']) > 90 else ''}")
        new_build = [pm for pm in permits_by_addr.get(key, []) if pm['permit_type'] == 'PERMIT - NEW CONSTRUCTION'
                     and 'ERECT' in pm['work_description'].upper()]
        if new_build and not is_lot:
            pm = new_build[0]
            ns = 3 if '3 -STORY' in pm['work_description'].upper() or '3-STORY' in pm['work_description'].upper() else stories or 2
            b['stories'] = ns
            b['roofZ'] = r2(ground_z + ns * M_PER_STORY + 1.5)
            b['eaveZ'] = r2(ground_z + ns * M_PER_STORY + 1.0)
            b['heightM'] = r2(ns * M_PER_STORY + 1.5)
            b['yearBuilt'] = None
            b['heightSource'] = (f'Estimate: replacement {ns}-story building under permit {pm["permit_"]} ({pm["issue_date"][:4]}); '
                                 f'the 2017 LiDAR showed the demolished house ({r2(roof - ground_z) if roof else "n/a"} m). '
                                 'Outline is the old footprint; built status not verified.')
        if is_lot:
            bits.append('Demolished 2022: ' + DEMOLISHED[num] + '. Still standing in the 2017 LiDAR.')
            b['side'] = 'lot'
            demolished.append(b)
        elif roof is None:
            bits.append('No building returns in the 2017 LiDAR: probably removed before the flight; kept for reference only')
            demolished.append(b)
        else:
            if fr == 'ns' and not addr:
                bits.append('widthM measured along the north-south street axis')
            buildings.append(b)
        b['note'] = '; '.join(bits)

    # building / lot masks on the grid
    bmask = np.zeros((rows, cols), bool)
    for b in buildings:
        bmask |= contains_xy(b['_poly'], CX, CY)
    in_lot = contains_xy(lot, CX, CY)
    lot_demo = [b for b in demolished if b['side'] == 'lot']
    demo_union = unary_union([b['_poly'].buffer(0.5) for b in lot_demo]) if lot_demo else None
    lot_mask = (in_lot | (contains_xy(demo_union, CX, CY) if demo_union is not None else False)) & ~bmask

    # no-return cells: inside a standing footprint -> nearest roof value; elsewhere -> ground
    fill_src = np.isfinite(dsm) & bmask
    if (empty & bmask).any() and fill_src.any():
        _, (ir, ic) = ndimage.distance_transform_edt(~fill_src, return_indices=True)
        nn = dsm[ir, ic]
        dsm = np.where(empty & bmask, nn, dsm)
    dsm = np.where(np.isfinite(dsm), dsm, ground)
    dsm_2017 = dsm.copy()

    # ---------------------------------------------------------------- canopy / trees
    vsel = sel & np.isin(pts['cls'], VEG)
    vmax = np.full(n, -np.inf)
    np.maximum.at(vmax, idx[vsel], pts['z'][vsel])
    vmax = vmax.reshape(rows, cols)
    chm = np.where(np.isfinite(vmax) & np.isfinite(ground), np.maximum(vmax - ground, 0), 0.0)
    # vegetation-classed returns along walls and eaves form 1-2 cell lines around footprints; a 3 x 3 opening drops them
    chm = np.where(ndimage.binary_opening(chm >= 2.0, structure=np.ones((3, 3))), chm, 0.0)
    demo_cells = contains_xy(unary_union([b['_poly'] for b in demolished]), CX, CY) if demolished else np.zeros_like(bmask)
    veg_valid = np.isfinite(ground) & ~bmask & ~demo_cells  # vegetation returns on the derelict 2017 roofs are not trees
    tops, labels = detect_trees(chm, veg_valid, g)
    trees, lot_trees, kept_labels = [], [], []
    for i, t in enumerate(tops, 1):
        x, y = g['cx'][t['c']], g['cy'][t['r']]
        rec = dict(x=round(float(x - ORIGIN[0]), 2), y=round(float(y - ORIGIN[1]), 2),
                   groundZ=r2(ground[t['r'], t['c']]), h=round(t['h'], 2), r=round(t['rad'], 2))
        if not lot_mask[t['r'], t['c']]:
            trees.append(rec)
        elif rec['x'] < LOT_TREE_KEEP_WEST_OF_X:
            trees.append(rec)
            kept_labels.append(i)
            rec_k = dict(rec, kept=True)
            lot_trees.append(rec_k)
        else:
            lot_trees.append(dict(rec, kept=False))

    # mask Lot 25 to ground (demolished houses + anything else standing there in 2017), except retained rear-yard crowns
    kept_crown = np.isin(labels, kept_labels) & lot_mask if kept_labels else np.zeros_like(lot_mask)
    surface = np.where(lot_mask & ~kept_crown, ground, dsm_2017)
    lot_removed = lot_mask & ~kept_crown & (dsm_2017 - ground > 1.0)
    log(f'Buildings {len(buildings)} (+{len(demolished)} demolished), trees {len(trees)} (+{len(lot_trees)} on Lot 25 in 2017), '
        f'lot cells masked {int(lot_mask.sum())} ({int(lot_removed.sum())} were >1 m above ground)')

    # ---------------------------------------------------------------- terrain summary
    lz = ground[in_lot & np.isfinite(ground)]
    A = np.c_[CX[in_lot] - lc[0], CY[in_lot] - lc[1], np.ones(in_lot.sum())]
    coef, *_ = np.linalg.lstsq(A, ground[in_lot], rcond=None)
    grad = coef[:2]
    fall_dir_deg = float(np.degrees(np.arctan2(-grad[0], -grad[1])) % 360)  # bearing of steepest descent, from grid north
    compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][int(((fall_dir_deg + 22.5) % 360) // 45)]
    plane = A @ coef
    fall_across = float(plane.max() - plane.min())
    # front-to-back: mean ground in the east 5 m vs west 5 m of the lot
    cu, cv = uv(CX, CY)
    east5 = in_lot & (cu > lot_u[1] - 5)
    west5 = in_lot & (cu < lot_u[0] + 5)
    front_z, rear_z = float(np.nanmean(ground[east5])), float(np.nanmean(ground[west5]))

    def strip(u_rng, v_rng):
        m = (cu >= u_rng[0]) & (cu <= u_rng[1]) & (cv >= v_rng[0]) & (cv <= v_rng[1]) & np.isfinite(ground)
        return r2(np.median(ground[m])) if m.any() else None
    street_c = lot_u[1] + ROW['kimbark'] / 2
    rear_c = lot_u[0] - ROW['rearAlley'] / 2
    north_c = lot_v[1] + ROW['northAlley'] / 2
    terrain = dict(
        lotMinZ=r2(lz.min()), lotMaxZ=r2(lz.max()), lotMeanZ=r2(lz.mean()),
        fallM=r2(fall_across), fallDirection=compass,
        streetZ=strip((street_c - 1, street_c + 1), lot_v),
        alleyZ=strip((rear_c - 1, rear_c + 1), lot_v),
        northAlleyZ=strip((lot_u[0], lot_u[1]), (north_c - 1, north_c + 1)),
        frontZ=r2(front_z), rearZ=r2(rear_z), planeSlopePct=r2(100 * np.hypot(*grad)),
        fallBearingDeg=round(fall_dir_deg, 1),
        note=('USGS 1 m bare-earth DEM from the 2017 Cook County LiDAR (NAVD88 m), sampled at cell centres inside the county GIS '
              'parcel outline. fallM = range of a best-fit plane over the lot (fallBearingDeg = its downhill bearing); frontZ/rearZ = mean of the east (Kimbark) and west '
              '(rear alley) 5 m strips. streetZ = median ground on the assumed Kimbark centreline (33 ft east of the lot line), '
              'alleyZ = rear 24 ft alley centreline, northAlleyZ = 20 ft side alley centreline; all assume GIS lines = right-of-way '
              'lines. The lot was regraded after the 2022 demolitions; a new topographic survey supersedes these values.'))

    # ---------------------------------------------------------------- neighbours (for the md table)
    for b in buildings + demolished:
        b['distanceToLotM'] = r2(b['_poly'].distance(lot))
    vac = [p for p in permits if p.get('permit_type') == 'PERMIT - NEW CONSTRUCTION']
    wreck = [p for p in permits if p.get('permit_type') == 'PERMIT - WRECKING/DEMOLITION']

    # ---------------------------------------------------------------- outputs
    ground_png_stats = ground_png(ground, PNG_DIR / 'ground-hillshade.png')
    canopy_png(chm, labels * (~lot_mask | kept_crown), PNG_DIR / 'canopy-height.png')

    def pub(b):
        return {k: v for k, v in b.items() if not k.startswith('_')}

    lidar = dict(project='USGS 3DEP IL 4 County QL1 LiDAR 2016 B16 — Cook County 2017 delivery (EPT USGS_LPC_IL_4County_Cook_2017_LAS_2019)',
                 collected=(f'{collected_days[0]} to {collected_days[-1]}' if len(collected_days) > 1 else collected_days[0]) +
                 ' (GPS time of returns inside the extent)', collectedDays=collected_days,
                 quality='QL1 (USGS 3DEP)',
                 pointDensity=dict(allReturnsPerM2=round(float(density), 1), returnNumbersInEpt=returns_info,
                                   groundPerM2=round(float((gm & in_ext).sum() / ext_area), 1)),
                 classes=dict(counts=class_counts, audit=cls_audit,
                              names={'1': 'unclassified', '2': 'ground', '3': 'low vegetation', '4': 'medium vegetation', '5': 'high vegetation',
                                     '6': 'building', '7': 'low noise', '9': 'water', '17': 'bridge deck', '18': 'high noise'},
                              used='surface = max of all non-noise returns (classes other than 7/18); roof statistics = class 6 '
                                   'inside each footprint; trees = vegetation (3/4/5) max minus ground, tops outside standing footprints. '
                                   'The EPT carries every point as return 1 of 1, so first/last-return filtering is not possible.'),
                 vertical=vertical, horizontal=horiz,
                 url=EPT_URL + '/ept.json', dem=DEM_URL)
    data = dict(
        origin=list(ORIGIN), crs='EPSG:26916', verticalDatum='NAVD88 (m)', spacing=SPACING, cols=cols, rows=rows,
        extent=[-HALF, -HALF, HALF, HALF],
        conventions=dict(index='value[row * cols + col]; row 0 = north edge; cell centre x = xmin + 0.5 + col, y = ymax - 0.5 - row (local m).',
                         local='x = E - origin[0] (east), y = N - origin[1] (north), EPSG:26916 metres.',
                         ground='Bare earth, NAVD88 m, USGS 1 m DEM pixel = cell; null = NoData.',
                         surface='Max non-noise LiDAR return per cell (2017), NAVD88 m; ground where there were no returns; '
                                 'Lot 25 masked to ground (demolished 2022).',
                         streetAxisDeg=round(axis_deg, 2)),
        ground=[r2(v) for v in ground.ravel()],
        surface=[r2(v) for v in surface.ravel()],
        lot=ring_local(lot),
        buildings=[pub(b) for b in sorted(buildings, key=lambda b: b['distanceToLotM'])],
        demolished=[pub(b) for b in demolished],
        trees=sorted(trees, key=lambda t: -t['h']),
        lotTrees2017=lot_trees,
        lidar=lidar,
        footprints=dict(source='City of Chicago Building Footprints (Socrata syp8-uezg); stories, year built and units from the city '
                               'record; outlines digitised from 1998+ aerials', url=f'https://data.cityofchicago.org/d/{FOOTPRINTS_ID}',
                        retrieved=datetime.fromtimestamp((CACHE / 'footprints/syp8-uezg.geojson').stat().st_mtime, timezone.utc).date().isoformat(),
                        datasetUpdated=fp_updated),
        terrain=terrain,
        overlays=dict(groundHillshadePng='assets/sites/hydepark/site3d/ground-hillshade.png',
                      canopyHeightPng='assets/sites/hydepark/site3d/canopy-height.png', pxPerCell=PX_PER_CELL,
                      extent=[-HALF, -HALF, HALF, HALF], groundColourRangeM=ground_png_stats),
        notes=[],
    )
    notes = data['notes']
    notes.append(f'LiDAR flown {lidar["collected"].split(" (")[0]}; both Lot 25 houses were demolished in 2022, so the 2017 surface '
                 f'showed them. Surface cells inside the Lot 25 parcel (and the old house footprints + 0.5 m) are set to ground '
                 f'({int(lot_removed.sum())} cells were > 1 m above ground); the old footprints/heights are kept in demolished[].')
    if lot_trees:
        kept = [t for t in lot_trees if t['kept']]
        gone = [t for t in lot_trees if not t['kept']]
        notes.append(f'{len(lot_trees)} vegetation top(s) on Lot 25 in 2017 (lotTrees2017). {len(kept)} rear-yard crown(s) '
                     f'({", ".join(f"{t["h"]:.1f} m" for t in kept)}) are kept in trees and in surface because the 2025 leaf-on county '
                     f'ortho still shows that canopy; they have had 9 growing seasons since the flight. {len(gone)} lower top(s) near the '
                     'demolished houses and the 5422 wall (no tree visible there in 2025) are dropped.')
    notes.append(f'City footprints were last updated {fp_updated}; they still show the 5418/5420 houses. Chicago new-construction '
                 f'permits since 2015 inside the extent: {len(vac)}; wrecking permits: {len(wreck)} (see acquisition.json).')
    notes.append('Building roofZ/eaveZ are the 95th/25th percentiles of class-6 (building) LiDAR returns inside each footprint '
                 f'eroded {ROOF_ERODE_M} m: roofZ approximates the ridge or parapet, eaveZ the lower roof plane. Chimneys and rooftop '
                 'units above p95 are ignored; heightM is measured from the median DEM grade in a 0.5-2.5 m ring around the footprint.')
    notes.append('Footprint outlines are the city\'s digitised roof outlines (about 1 m), not surveyed walls; distances to the lot '
                 'use the county GIS parcel lines, which are also approximate. Use the plats for near-line distances.')
    notes.append('Trees: local maxima on a 1 m canopy height model built from vegetation returns (classes 3/4/5), tops outside '
                 f'standing footprints; h = top above ground, r = watershed crown radius capped by allometry. The {collected_days[0]} '
                 'flight was leaf-off, so crowns are under-represented in surface and summer shade will be larger.')

    body = json.dumps(data, separators=(',', ':'), allow_nan=False, ensure_ascii=False)
    JS_OUT.write_text('// Generated by scripts/prepare-hydepark-3d.py from USGS 3DEP LiDAR/DEM and City of Chicago footprints. Do not edit.\n'
                      f'const SITE_HYDEPARK_3D = {body};\n')

    gj = dict(type='FeatureCollection', name='hydepark-buildings',
              crs=dict(type='name', properties=dict(name='urn:ogc:def:crs:EPSG::26916')),
              note='Generated by scripts/prepare-hydepark-3d.py. Do not edit. Coordinates EPSG:26916 m; heights NAVD88 m.',
              features=[dict(type='Feature', properties=dict(pub(b), ring=None, status='demolished 2022' if b in demolished else 'standing (2017 LiDAR)'),
                             geometry=mapping(b['_poly'])) for b in buildings + demolished])
    for f in gj['features']:
        f['properties'].pop('ring')
        f['geometry'] = json.loads(json.dumps(f['geometry'], default=float))
        f['geometry']['coordinates'] = [[[round(x, 2), round(y, 2)] for x, y in r] for r in f['geometry']['coordinates']]
    BUILDINGS_OUT.write_text(json.dumps(gj, indent=1, ensure_ascii=False) + '\n')

    node_rows = [dict(key=k, points=nodes[k], bytes=p.stat().st_size, sha256=sha256(p)) for k, p in paths]
    acq = dict(
        generated=datetime.now(timezone.utc).isoformat(timespec='seconds'), script='scripts/prepare-hydepark-3d.py',
        frame=dict(crs='EPSG:26916', verticalDatum='NAVD88 m', origin=list(ORIGIN), extent=[-HALF, -HALF, HALF, HALF]),
        lidar=dict(ept=EPT_URL + '/ept.json', projectList=EPT_RESOURCES,
                   projectSearch='Only USGS_LPC_IL_4County_Cook_2017_LAS_2019 covers the lot in the usgs-lidar-public resources list; '
                                 f'the TNM API ({TNM_API}) lists only IL_4_County_QL1_LiDAR_2016_B16 point-cloud tiles here (checked 2026-10-22).',
                   tnmTiles=['https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/LPC/Projects/IL_4_County_QL1_LiDAR_2016_B16/'
                             'IL_4County_Cook_2017/LAZ/USGS_LPC_IL_4_County_QL1_LiDAR_2016_B16_LAS_18508700.laz'],
                   eptSha256=sha256(CACHE / 'ept/ept.json'), fetchBoxEPSG26916=list(box), fetchBoxEPSG3857=[round(v, 2) for v in q],
                   nodes=len(nodes), hierarchyFiles=len(hier_files), pointsDecoded=raw_total, pointsInFetchBox=npts,
                   collectedDays=collected_days, nodeFiles=node_rows),
        dem=dict(url=DEM_URL, method=f'gdal_translate -projwin over /vsicurl/ (origin +/- {HALF + 60:.0f} m)', clip=rel(dem_clip),
                 sha256=sha256(dem_clip)),
        footprints=dict(url=fp_url, dataset=f'https://data.cityofchicago.org/d/{FOOTPRINTS_ID}', datasetUpdated=fp_updated,
                        file=rel(CACHE / 'footprints/syp8-uezg.geojson'), sha256=sha256(CACHE / 'footprints/syp8-uezg.geojson'),
                        features=len(fps['features'])),
        permits=dict(url=pm_url, dataset=f'https://data.cityofchicago.org/d/{PERMITS_ID}', file=rel(CACHE / 'footprints/permits-new-wreck.json'),
                     sha256=sha256(CACHE / 'footprints/permits-new-wreck.json'),
                     records=[{k: p.get(k) for k in ('permit_', 'permit_type', 'issue_date', 'street_number', 'street_direction',
                                                      'street_name', 'work_description')} for p in permits]),
        parcels=dict(file=rel(PARCELS), sha256=sha256(PARCELS)),
    )
    ACQ_OUT.write_text(json.dumps(acq, indent=2, ensure_ascii=False) + '\n')
    write_md(data, buildings, demolished, lot_trees, trees, terrain, lidar, horiz, permits, fp_updated, lot_u, lot_v)

    if a.debug_dir:
        np.savez_compressed(Path(a.debug_dir) / 'hydepark3d-debug.npz', ground=ground, dsm=dsm_2017, surface=surface, chm=chm,
                            labels=labels, bmask=bmask, lot_mask=lot_mask, ng_cnt=ng_cnt, any_cnt=any_cnt)
    log(f'Wrote {rel(JS_OUT)} ({JS_OUT.stat().st_size / 1e6:.2f} MB), {rel(BUILDINGS_OUT)}, {rel(ACQ_OUT)}, {rel(PNG_DIR)}/*.png')


if __name__ == '__main__':
    main()
