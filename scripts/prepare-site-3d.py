#!/usr/bin/env python3
"""Build the local terrain + tree-canopy dataset (SITE_3D) around Lot 1.

Ground comes from the archived 1 m USGS DEM (EPSG:26918, NAVD88 m), averaged
2 x 2 onto a 2 m grid; NoData stays null. Canopy comes from the public USGS
EPT point cloud for the same 2014-15 flight: nodes intersecting the AOI are
cached under sources/dannemora/lidar/, XY is reprojected EPSG:3857 -> 26918,
and the EPT Z reference is checked against the DEM using class-2 returns.

Run from anywhere with the repo venv:
  .venv/bin/python scripts/prepare-site-3d.py              # download missing nodes, build
  .venv/bin/python scripts/prepare-site-3d.py --skip-download   # cache only, no network

The Lot 1 / house outlines are the provisional permit-to-aerial display fit
(3-11 m residuals). They are used only to locate the AOI and to summarise
canopy, never as measured boundaries.
"""
import argparse
import hashlib
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import laspy
import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from scipy import ndimage
from shapely import contains_xy
from shapely.geometry import Polygon
from skimage.segmentation import watershed

ROOT = Path(__file__).resolve().parents[1]
EPT_URL = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_NY_Cl_Ess_LChamp_P2_2014_LAS_2016'
EPT_ARCHIVE = ROOT / 'sources/dannemora/terrain/usgs-ept.json'
DEM = ROOT / 'sources/dannemora/terrain/dannemora-dem-1m.tif'
LAYOUT = ROOT / 'sources/dannemora/permit-layout-provisional.geojson'
CACHE = ROOT / 'sources/dannemora/lidar'
OUT = ROOT / 'assets/sites/dannemora/site3d'
JS_OUT = ROOT / 'site3d-data.js'

SPACING = 2.0
BUFFER_M = 200.0
MAX_CELLS = 300
VEG_CLASSES = (3, 4, 5)
# This delivery encodes side-overlap ("swath overage") returns as base class + 16: 17 = overlap
# unclassified, 18 = overlap ground, 25 = overlap water. The project report labels 17/18 as
# bridge decks / high noise, but their heights above the DEM match classes 1/2 (asserted below).
UNCLASSIFIED = (1, 17)
GROUND = (2, 18)
NOISE_CLASSES = (7,)
EXCLUDED_CLASSES = (2, 18, 7, 9, 25, 10)  # ground, low noise, water, ignored ground
CLASS_NOTE = ('Classes 17/18/25 behave as side-overlap copies of 1/2/9 (base + 16): class 17 heights above the DEM match '
              'class 1, class 18 matches class 2 within centimetres, 25 matches water. The project report and FGDC metadata '
              'label 17 bridge decks and 18 high noise and say overlap classes were used to trip the withheld bit; the EPT '
              'carries no withheld/overlap flag. Interpreted empirically; the script fails if that behaviour changes.')
MIN_TREE_H = 3.0
CANOPY_THRESHOLDS = (2.0, 5.0)
MAX_PLAUSIBLE_HAG = 45.0  # taller returns above DEM ground are treated as outliers
SPIKE_M = 8.0             # cell taller than every neighbour by this much -> noise spike
VERT_CORRECTION_TOL = 0.15
UA = {'User-Agent': 'groundwork-site-research/1.0 (public USGS EPT)'}

to_utm_from_wgs = Transformer.from_crs(4326, 26918, always_xy=True)
to_utm_from_merc = Transformer.from_crs(3857, 26918, always_xy=True)
to_merc_from_utm = Transformer.from_crs(26918, 3857, always_xy=True)


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


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def rel(p):
    return str(Path(p).resolve().relative_to(ROOT))


# --------------------------------------------------------------------------- AOI / grid
def load_layout():
    feats = {f['properties']['id']: f for f in json.loads(LAYOUT.read_text())['features']}
    out = {}
    for key in ('lot1', 'house'):
        lon, lat = zip(*feats[key]['geometry']['coordinates'][0])
        x, y = to_utm_from_wgs.transform(lon, lat)
        out[key] = Polygon(list(zip(x, y)))
    return out


def build_grid(lot1, raster_bounds):
    left, bottom, right, top = raster_bounds
    minx, miny, maxx, maxy = lot1.bounds
    s = SPACING
    x0 = np.floor((minx - BUFFER_M) / s) * s
    x1 = np.ceil((maxx + BUFFER_M) / s) * s
    y0 = np.floor((miny - BUFFER_M) / s) * s
    y1 = np.ceil((maxy + BUFFER_M) / s) * s
    # clip to DEM outer pixel edges, staying on the 2 m lattice
    x0 = max(x0, np.ceil((left - 1e-6) / s) * s)
    y0 = max(y0, np.ceil((bottom - 1e-6) / s) * s)
    x1 = min(x1, np.floor((right + 1e-6) / s) * s)
    y1 = min(y1, np.floor((top + 1e-6) / s) * s)
    cols, rows = int(round((x1 - x0) / s)), int(round((y1 - y0) / s))
    if cols > MAX_CELLS or rows > MAX_CELLS:
        raise ValueError(f'Grid {cols} x {rows} exceeds {MAX_CELLS}; coarsen SPACING or reduce BUFFER_M.')
    return dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), cols=cols, rows=rows)


def ground_grid(g):
    """2 x 2 mean of native 1 m DEM pixels; any NoData pixel in a block -> NoData."""
    with rasterio.open(DEM) as ds:
        if ds.crs.to_epsg() != 26918:
            raise ValueError(f'DEM CRS {ds.crs} is not EPSG:26918')
        t = ds.transform
        if abs(t.a - 1) > 1e-9 or abs(t.e + 1) > 1e-9:
            raise ValueError('Expected a 1 m north-up DEM')
        dem = ds.read(1, masked=True).astype(float).filled(np.nan)
        left, top = t.c, t.f
        bounds = list(ds.bounds)
    c0 = int(round(g['x0'] - left))
    r0 = int(round(top - g['y1']))
    k = int(SPACING)
    win = dem[r0:r0 + g['rows'] * k, c0:c0 + g['cols'] * k]
    if win.shape != (g['rows'] * k, g['cols'] * k):
        raise ValueError('AOI window falls outside the DEM')
    blocks = win.reshape(g['rows'], k, g['cols'], k)
    ground = blocks.mean(axis=(1, 3))  # NaN propagates: incomplete blocks stay NoData
    offset_check = abs((g['x0'] - left) - c0) + abs((top - g['y1']) - r0)
    return ground, dem, (left, top), bounds, offset_check


def dem_sampler(dem, left, top):
    def sample(x, y):
        c = (x - left) - 0.5
        r = (top - y) - 0.5
        return ndimage.map_coordinates(dem, [r, c], order=1, mode='constant', cval=np.nan)
    return sample


# --------------------------------------------------------------------------- EPT
def ept_meta(skip_download):
    cached = CACHE / 'ept.json'
    if skip_download:
        src = cached if cached.exists() else EPT_ARCHIVE
        return json.loads(src.read_text()), rel(src)
    raw = get(f'{EPT_URL}/ept.json')
    cached.write_bytes(raw)
    return json.loads(raw), f'{EPT_URL}/ept.json'


def walk_hierarchy(meta, q, skip_download):
    b = np.array(meta['bounds'], float)
    hdir = CACHE / 'ept-hierarchy'
    hdir.mkdir(parents=True, exist_ok=True)

    def node_box(key):
        d, x, y, z = map(int, key.split('-'))
        w = (b[3:] - b[:3]) / 2 ** d
        lo = b[:3] + w * np.array([x, y, z])
        return lo, lo + w

    def hit(key):
        lo, hi = node_box(key)
        return lo[0] < q[2] and hi[0] > q[0] and lo[1] < q[3] and hi[1] > q[1]

    def hierarchy(key):
        p = hdir / f'{key}.json'
        if not p.exists():
            if skip_download:
                raise FileNotFoundError(f'{p} missing; rerun without --skip-download')
            p.write_bytes(get(f'{EPT_URL}/ept-hierarchy/{key}.json'))
        return json.loads(p.read_text())

    todo, nodes, files = ['0-0-0-0'], {}, []
    while todo:
        key = todo.pop()
        files.append(key)
        for k, n in hierarchy(key).items():
            if not hit(k):
                continue
            if n == -1:
                todo.append(k)
            elif n > 0:
                nodes[k] = n
    return nodes, sorted(files), node_box


def fetch_nodes(nodes, skip_download):
    ddir = CACHE / 'ept-data'
    ddir.mkdir(parents=True, exist_ok=True)

    def dl(k):
        p = ddir / f'{k}.laz'
        fetched = False
        if not p.exists():
            if skip_download:
                raise FileNotFoundError(f'{p} missing; rerun without --skip-download')
            tmp = p.with_suffix('.part')
            tmp.write_bytes(get(f'{EPT_URL}/ept-data/{k}.laz'))
            tmp.rename(p)
            fetched = True
        return k, p, fetched

    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(dl, sorted(nodes, key=lambda k: tuple(map(int, k.split('-'))))))
    return res


def load_points(paths, g):
    parts, raw_total = [], 0
    for _, p, _ in paths:
        las = laspy.read(p)
        raw_total += len(las.points)
        x, y = to_utm_from_merc.transform(np.asarray(las.x), np.asarray(las.y))
        m = (x >= g['x0']) & (x < g['x1']) & (y >= g['y0']) & (y < g['y1'])
        if not m.any():
            continue
        parts.append(dict(
            x=x[m], y=y[m], z=np.asarray(las.z)[m],
            cls=np.asarray(las.classification)[m].astype(np.uint8),
            ret=np.asarray(las.return_number)[m].astype(np.uint8),
            nret=np.asarray(las.number_of_returns)[m].astype(np.uint8),
            gps=np.asarray(las.gps_time)[m],
        ))
    pts = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
    return pts, raw_total


# --------------------------------------------------------------------------- canopy
def cell_index(x, y, g):
    c = np.floor((x - g['x0']) / SPACING).astype(int)
    r = np.floor((g['y1'] - y) / SPACING).astype(int)
    c = np.clip(c, 0, g['cols'] - 1)
    r = np.clip(r, 0, g['rows'] - 1)
    return r * g['cols'] + c


def grid_max(idx, val, n):
    out = np.full(n, -np.inf)
    np.maximum.at(out, idx, val)
    return out


def crown_width(h):
    """Popescu & Wynne (2004) mixed-forest allometry: crown width (m) from height (m)."""
    return 2.51503 + 0.00901 * h ** 2


def detect_trees(chm, ground, valid, structure, g):
    rows, cols = chm.shape
    base = np.where(valid & ~structure, chm, 0.0)
    sm = ndimage.gaussian_filter(base, sigma=0.75)
    cand = (sm == ndimage.maximum_filter(sm, size=3)) & (sm >= MIN_TREE_H) & valid & ~structure
    rr, cc = np.nonzero(cand)
    order = np.argsort(-sm[rr, cc])
    tops = []
    for r, c in zip(rr[order], cc[order]):
        h = sm[r, c]
        rad = max(1, int(np.round((crown_width(h) / 2) / SPACING)))
        r0, r1, c0, c1 = max(0, r - rad), min(rows, r + rad + 1), max(0, c - rad), min(cols, c + rad + 1)
        yy, xx = np.mgrid[r0:r1, c0:c1]
        disk = (yy - r) ** 2 + (xx - c) ** 2 <= rad ** 2
        if sm[r0:r1, c0:c1][disk].max() > h + 1e-9:
            continue
        tops.append((r, c))
    markers = np.zeros(chm.shape, int)
    for i, (r, c) in enumerate(tops, 1):
        markers[r, c] = i
    mask = (sm >= 2.0) & valid & ~structure
    labels = watershed(-sm, markers, mask=mask)
    areas = np.bincount(labels.ravel(), minlength=len(tops) + 1) * SPACING ** 2
    trees = []
    for i, (r, c) in enumerate(tops, 1):
        h = float(chm[max(0, r - 1):r + 2, max(0, c - 1):c + 2][valid[max(0, r - 1):r + 2, max(0, c - 1):c + 2]].max())
        cw = crown_width(h)
        r_seg = np.sqrt(areas[i] / np.pi) if areas[i] else SPACING / 2
        rad = float(np.clip(r_seg, 1.0, 0.75 * cw))
        z = ground[r, c]
        trees.append(dict(x=round(c * SPACING, 2), y=round(-r * SPACING, 2), h=round(h, 2),
                          r=round(rad, 2), z=None if not np.isfinite(z) else round(float(z), 2)))
    return trees, labels, sm


def structure_mask(pts_idx, hag, nret, n, shape):
    """Cells whose elevated returns look like roofs: nearly all single-return pulses, little height spread.

    Leaf-off trees produce many multi-return pulses; roofs return once. Heuristic only.
    """
    above = hag > 2.0
    idx = pts_idx[above]
    cnt = np.bincount(idx, minlength=n)
    single = np.bincount(idx, weights=(nret[above] == 1).astype(float), minlength=n)
    s1 = np.bincount(idx, weights=hag[above], minlength=n)
    s2 = np.bincount(idx, weights=hag[above] ** 2, minlength=n)
    with np.errstate(invalid='ignore', divide='ignore'):
        frac = single / cnt
        sd = np.sqrt(np.maximum(s2 / cnt - (s1 / cnt) ** 2, 0))
    m = (cnt >= 4) & (frac >= 0.9) & (sd <= 0.6)
    m = m.reshape(shape)
    # roofs are contiguous patches; drop isolated cells, then close small holes
    lab, k = ndimage.label(m)
    if k:
        sizes = ndimage.sum(m, lab, index=np.arange(1, k + 1))
        keep = np.isin(lab, np.nonzero(sizes >= 6)[0] + 1)
        m = ndimage.binary_closing(keep, iterations=1) & (keep | m)
    return m


# --------------------------------------------------------------------------- rendering
def chm_png(chm, valid, path):
    stops = np.array([0, 2, 5, 10, 15, 20, 25, 30], float)
    colors = np.array([[0, 0, 0], [222, 235, 197], [173, 210, 140], [120, 180, 95],
                       [64, 145, 72], [30, 110, 60], [16, 80, 48], [8, 55, 36]], float)
    h = np.where(valid, chm, 0)
    rgba = np.zeros((*chm.shape, 4), np.uint8)
    for i in range(3):
        rgba[..., i] = np.interp(h, stops, colors[:, i]).astype(np.uint8)
    rgba[..., 3] = np.where(valid & (h >= 2.0), 215, 0).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(path, optimize=True)


# --------------------------------------------------------------------------- main
def r2(v):
    return None if v is None or not np.isfinite(v) else round(float(v), 2)


def pct(a, b):
    return round(100.0 * a / b, 2) if b else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--skip-download', action='store_true', help='use only the local EPT cache; no network access')
    ap.add_argument('--debug-dir', help='also write intermediate grids (npz) here for inspection')
    a = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    layout = load_layout()
    with rasterio.open(DEM) as ds:
        raster_bounds = list(ds.bounds)
    g = build_grid(layout['lot1'], raster_bounds)
    ground, dem, (dem_left, dem_top), _, align_err = ground_grid(g)
    if align_err > 1e-3:
        raise ValueError('2 m grid is not aligned to DEM pixel edges')
    rows, cols, n = g['rows'], g['cols'], g['rows'] * g['cols']
    E0, N0 = g['x0'] + SPACING / 2, g['y1'] - SPACING / 2
    log(f'AOI EPSG:26918 {g["x0"]},{g["y0"]} - {g["x1"]},{g["y1"]}  grid {cols} x {rows} @ {SPACING} m')

    # AOI in 3857 (densified edges; Mercator distortion is non-linear but small over 0.5 km)
    ex = np.r_[np.linspace(g['x0'], g['x1'], 21), np.full(21, g['x1']), np.linspace(g['x1'], g['x0'], 21), np.full(21, g['x0'])]
    ey = np.r_[np.full(21, g['y0']), np.linspace(g['y0'], g['y1'], 21), np.full(21, g['y1']), np.linspace(g['y1'], g['y0'], 21)]
    mx, my = to_merc_from_utm.transform(ex, ey)
    q = (float(mx.min()) - 2, float(my.min()) - 2, float(mx.max()) + 2, float(my.max()) + 2)

    meta, meta_src = ept_meta(a.skip_download)
    archived = json.loads(EPT_ARCHIVE.read_text())
    if meta.get('srs', {}).get('horizontal') != '3857':
        raise ValueError(f'Unexpected EPT SRS {meta.get("srs")}')
    nodes, hier_files, _ = walk_hierarchy(meta, q, a.skip_download)
    t0 = time.time()
    paths = fetch_nodes(nodes, a.skip_download)
    log(f'EPT: {len(nodes)} nodes, {sum(nodes.values()):,} points before crop ({time.time() - t0:.0f}s fetch)')
    node_rows, total_bytes = [], 0
    for k, p, fetched in paths:
        size = p.stat().st_size
        total_bytes += size
        node_rows.append(dict(key=k, depth=int(k.split('-')[0]), points=nodes[k], bytes=size, sha256=sha256(p),
                              url=f'{EPT_URL}/ept-data/{k}.laz', file=rel(p)))

    pts, raw_total = load_points(paths, g)
    npts = len(pts['x'])
    log(f'Cropped {npts:,} of {raw_total:,} points to AOI')

    # Horizontal round-trip check: source LAS used 0.01 m UTM encoding
    frac = np.abs(pts['x'] * 100 - np.round(pts['x'] * 100))
    hz = dict(method='EPT XY (EPSG:3857, WGS84 Pseudo-Mercator) -> EPSG:26918 with PROJ default pipeline (pyproj ' +
              __import__('pyproj').__version__ + '); WGS84 and NAD83 treated as coincident (ballpark), matching how '
              'the EPT was built from NAD83 UTM source tiles',
              sourceGridResidualCm=dict(median=round(float(np.median(frac)), 4), p95=round(float(np.percentile(frac, 95)), 4),
                                        note='Distance of reprojected X from the 0.01 m grid of the original LAS tiles, in cm units. '
                                             'Uniform noise would give a median near 0.25; values near 0 indicate exact inversion of the EPT build reprojection.'))

    # Class audit
    classes, counts = np.unique(pts['cls'], return_counts=True)
    class_counts = {str(int(c)): int(k) for c, k in zip(classes, counts)}
    aoi_area = (g['x1'] - g['x0']) * (g['y1'] - g['y0'])
    sample = dem_sampler(dem, dem_left, dem_top)
    hag_raw = pts['z'] - sample(pts['x'], pts['y'])
    class_audit = {}
    for c in classes:
        m = pts['cls'] == c
        h = hag_raw[m]
        h = h[np.isfinite(h)]
        class_audit[str(int(c))] = dict(
            points=int(m.sum()), hagMedianM=round(float(np.median(h)), 2), hagP95M=round(float(np.percentile(h, 95)), 2),
            singleReturnPct=pct(int((pts['nret'][m] == 1).sum()), int(m.sum())))
    for c, kind in ((17, 'unclassified'), (18, 'ground')):
        a_ = class_audit.get(str(c))
        if a_ and ((kind == 'ground') != (abs(a_['hagMedianM']) < 0.1)):
            raise ValueError(f'Class {c} no longer behaves like overlap {kind} ({a_}); revisit the class mapping.')

    # Vertical comparison: class-2 returns (and overlap ground, class 18) vs DEM bilinear
    def vstats(mask):
        d = hag_raw[mask]
        d = d[np.isfinite(d)]
        md = float(np.median(d))
        return d, dict(points=int(d.size), medianOffsetM=round(md, 3), madM=round(float(np.median(np.abs(d - md))), 3),
                       p05M=round(float(np.percentile(d, 5)), 3), p95M=round(float(np.percentile(d, 95)), 3),
                       rmseM=round(float(np.sqrt(np.mean(d ** 2))), 3), pctWithin15cm=pct(int((np.abs(d) <= 0.15).sum()), d.size))
    dz, v2 = vstats(pts['cls'] == 2)
    _, v18 = vstats(pts['cls'] == 18) if (pts['cls'] == 18).any() else (None, None)
    med, mad = v2['medianOffsetM'], v2['madM']
    correction = -med if abs(med) > VERT_CORRECTION_TOL else 0.0
    vertical = dict(
        eptZ='EPT schema Z: int32, scale 0.001, offset 666; srs block declares horizontal EPSG:3857 only (no vertical code).',
        class2=v2, class18OverlapGround=v18, medianOffsetM=med, madM=mad,
        correctionAppliedM=round(correction, 3),
        interpretation=('EPT Z matches the NAVD88 (Geoid12A) DEM to within centimetres: heights are the source orthometric '
                        'metres passed through unchanged, not ellipsoidal (NY geoid undulation is about -32 m). No correction applied.'
                        if correction == 0.0 else
                        f'EPT Z is offset from the NAVD88 DEM by a median {med:.2f} m; a constant {correction:+.2f} m was applied.'),
        caveat='The DEM was interpolated from these same ground returns, so agreement checks datum/consistency only, not absolute accuracy.')
    z = pts['z'] + correction
    log(f'Vertical: median {med:+.3f} m, MAD {mad:.3f} m over {v2["points"]:,} class-2 returns')

    idx = cell_index(pts['x'], pts['y'], g)
    gm = np.isin(pts['cls'], GROUND)
    ground_cnt = np.bincount(idx[gm], minlength=n).reshape(rows, cols)
    ground2_cnt = np.bincount(idx[pts['cls'] == 2], minlength=n).reshape(rows, cols)
    any_cnt = np.bincount(idx, minlength=n).reshape(rows, cols)
    ground_valid = np.isfinite(ground)

    # Vegetation source
    veg_n = int(sum(class_counts.get(str(c), 0) for c in VEG_CLASSES))
    if veg_n > 0.01 * npts:
        veg_mask = np.isin(pts['cls'], VEG_CLASSES)
        veg_source = 'Classes 3/4/5 (low/medium/high vegetation)'
    else:
        veg_mask = np.isin(pts['cls'], UNCLASSIFIED)
        veg_source = ('No vegetation classes (3/4/5) in this delivery: canopy uses every unclassified return, class 1 plus '
                      'overlap-unclassified class 17 (vegetation, buildings, vehicles, wires). All returns are used, not only '
                      'first returns; the per-cell maximum is a first/only return in practice. Structures are screened only heuristically.')
    hag = (hag_raw + correction)[veg_mask]
    vidx = idx[veg_mask]
    outlier_hi = hag > MAX_PLAUSIBLE_HAG
    below = hag < -0.5
    keep = ~outlier_hi & np.isfinite(hag)
    chm = grid_max(vidx[keep], np.maximum(hag[keep], 0.0), n).reshape(rows, cols)
    has_any = any_cnt > 0
    chm[~np.isfinite(chm) & has_any] = 0.0  # returns exist but none above ground
    chm_valid = has_any & ground_valid
    chm[~chm_valid] = np.nan

    # Spike filter: a cell taller than all 8 neighbours by SPIKE_M is treated as noise
    nb = ndimage.maximum_filter(np.nan_to_num(chm, nan=0.0), footprint=np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]]))
    spikes = chm_valid & (chm - nb > SPIKE_M)
    if spikes.any():
        med_nb = ndimage.median_filter(np.nan_to_num(chm, nan=0.0), size=3)
        chm[spikes] = med_nb[spikes]

    structure = structure_mask(vidx[keep], hag[keep], pts['nret'][veg_mask][keep], n, (rows, cols)) & chm_valid
    trees, labels, chm_s = detect_trees(np.nan_to_num(chm, nan=0.0), ground, chm_valid, structure, g)

    # Lot 1 / house in local metres and cell masks
    cx = E0 + np.arange(cols) * SPACING
    cy = N0 - np.arange(rows) * SPACING
    CX, CY = np.meshgrid(cx, cy)
    in_lot = contains_xy(layout['lot1'], CX, CY)
    in_house = contains_xy(layout['house'], CX, CY)
    loc = lambda poly: [[round(x - E0, 2), round(y - N0, 2)] for x, y in poly.exterior.coords]

    def cover(mask, thr):
        m = mask & chm_valid
        return pct(int(((chm >= thr) & m & ~structure).sum()), int(m.sum()))

    tx = np.array([t['x'] for t in trees]) + E0
    ty = np.array([t['y'] for t in trees]) + N0
    th = np.array([t['h'] for t in trees])
    lot_trees = contains_xy(layout['lot1'], tx, ty) if len(trees) else np.zeros(0, bool)
    near_house = layout['house'].buffer(30)
    house_trees = contains_xy(near_house, tx, ty) if len(trees) else np.zeros(0, bool)

    gcell = ground_cnt[ground_valid]
    water_cnt = np.bincount(idx[np.isin(pts['cls'], (9, 25))], minlength=n).reshape(rows, cols)
    land_gap = (ground_cnt == 0) & ground_valid & (water_cnt == 0)
    gap_lab, gap_k = ndimage.label(land_gap)
    largest_gap = int(np.bincount(gap_lab.ravel())[1:].max()) if gap_k else 0
    lot_g = ground_cnt[in_lot & ground_valid]
    stats = dict(
        aoiAreaM2=round(aoi_area, 1), lot1AreaM2=round(layout['lot1'].area, 1), lot1Cells=int(in_lot.sum()),
        groundNullCells=int((~ground_valid).sum()), canopyNullCells=int((~chm_valid).sum()),
        groundMinM=r2(np.nanmin(ground)), groundMaxM=r2(np.nanmax(ground)),
        canopyCoverPct={f'ge{int(t)}m': dict(aoi=cover(np.ones_like(in_lot), t), lot1=cover(in_lot, t)) for t in CANOPY_THRESHOLDS},
        canopyCoverDefinition='Share of valid 2 m cells whose CHM is at or above the threshold, excluding cells flagged as likely structures; '
                              'Lot 1 = cells whose centre lies inside the provisional outline.',
        meanCanopyHeightM=dict(aoi=r2(np.nanmean(chm)), lot1=r2(np.nanmean(chm[in_lot]))),
        maxCanopyHeightM=dict(aoi=r2(np.nanmax(chm)), lot1=r2(np.nanmax(chm[in_lot]))),
        houseFootprintMeanCanopyM=r2(np.nanmean(chm[in_house])) if in_house.any() else None,
        trees=dict(aoi=len(trees), lot1=int(lot_trees.sum()), within30mOfHouse=int(house_trees.sum()),
                   heightMedianM=r2(np.median(th)) if len(th) else None, heightP90M=r2(np.percentile(th, 90)) if len(th) else None,
                   heightMaxM=r2(th.max()) if len(th) else None, minHeightM=MIN_TREE_H),
        structureCells=int(structure.sum()), spikeCellsSuppressed=int(spikes.sum()),
    )

    lidar = dict(
        source='USGS 3DEP LPC NY Clinton/Essex/Lake Champlain P2 2014 (QL2), public Entwine Point Tile',
        ept=EPT_URL + '/ept.json', flightWindow='2014-11-02 to 2015-05-08 (project-wide)',
        nodes=len(nodes), downloadBytes=total_bytes, pointsInNodes=int(sum(nodes.values())), pointsInAoi=npts,
        densityPtsPerM2=round(npts / aoi_area, 2), groundDensityPtsPerM2=round(int(gm.sum()) / aoi_area, 2),
        groundClasses='2 + 18 (overlap ground)', class2OnlyDensityPtsPerM2=round(int((pts['cls'] == 2).sum()) / aoi_area, 2),
        groundPtsPerCell=dict(median=float(np.median(gcell)), p05=float(np.percentile(gcell, 5)),
                              zeroCells=int((gcell == 0).sum()), zeroCellsPct=pct(int((gcell == 0).sum()), gcell.size),
                              class2OnlyZeroCells=int((ground2_cnt[ground_valid] == 0).sum()),
                              lot1Median=float(np.median(lot_g)) if lot_g.size else None,
                              lot1ZeroCells=int((lot_g == 0).sum()),
                              zeroCellsExcludingWater=int(land_gap.sum()),
                              largestLandGapCells=largest_gap, lot1ZeroCellsExcludingWater=int((land_gap & in_lot).sum())),
        noLidarReturnCells=int((~has_any).sum()),
        classCounts=class_counts, classAudit=class_audit, vegetationSource=veg_source,
        classNote=CLASS_NOTE,
        noisePoints=int(sum(class_counts.get(str(c), 0) for c in NOISE_CLASSES)),
        vegOutliersAbove45m=int(outlier_hi.sum()), vegReturnsBelowGround05m=int(below.sum()),
        verticalOffsetM=vertical['medianOffsetM'], verticalMadM=vertical['madM'], verticalCorrectionM=vertical['correctionAppliedM'],
    )

    limitations = [
        'Leaf-off flight window (2014-11-02 to 2015-05-08): deciduous crowns return mostly from bare branches, so crown extent and canopy cover are under-represented; summer shade will be larger than this model.',
        'Canopy is 10+ years old: trees have grown and some may have been cut (including any 2025 clearing). Treat heights as a 2014-15 baseline, not current conditions.',
        'No vegetation classes in the delivery: the canopy surface is every unclassified return (classes 1 and 17), so roofs, vehicles and wires can appear as canopy. A single-return/flatness heuristic flags likely structures, but it is not a classification.',
        'Classes 17/18/25 are interpreted as side-overlap unclassified/ground/water from their heights above the DEM, not from the report labels (bridge decks/high noise); overlap classification was automated and never manually verified by the vendor.',
        'Classification errors in ground (classes 2/18) propagate to both ground and canopy height; cells with no ground returns rely on the USGS DEM interpolation.',
        'Tree tops come from local maxima on a lightly smoothed 2 m CHM: clustered crowns merge, small understory trees are missed, and multi-stem crowns can split. Crown radius is a watershed-area estimate capped by allometry, not a measured crown.',
        'Lot 1 and house outlines are the provisional permit-to-aerial display fit (RMS 3.1 m, leave-one-out max 11.6 m), not survey geometry. Lot 1 canopy statistics inherit that position error.',
        'Ground is the 1 m DEM averaged 2 x 2 (NAVD88 m, Geoid12A); hydroflattened water is not lake bottom. Heights relative to NAVD88, not ellipsoidal.',
    ]

    site3d = dict(
        crs='EPSG:26918', verticalDatum='NAVD88 m', origin=[E0, N0], spacing=SPACING, cols=cols, rows=rows,
        rowOrder='north-to-south, west-to-east',
        bounds=[g['x0'], g['y0'], g['x1'], g['y1']],
        conventions=dict(
            origin='Centre of the north-west cell, EPSG:26918 metres.',
            index='value[row * cols + col]; cell centre E = origin[0] + col*spacing, N = origin[1] - row*spacing.',
            local='Tree, lot1 and house x = E - origin[0] (east), y = N - origin[1] (north); y is <= 0 inside the grid.',
            ground='NAVD88 m; mean of the 2 x 2 native DEM pixels in each cell; null = NoData.',
            canopyHeight='Metres above ground; max return height above the DEM per cell, negatives clamped to 0; null = no LiDAR returns or no ground.',
            trees='h = CHM top (m above ground), r = crown radius (m), z = ground elevation at the top (NAVD88 m).',
            crownId='Addition to the base contract: per-cell watershed crown segment, 0 = none, k = trees[k-1]. '
                    'To model removing tree k, set canopyHeight to 0 where crownId == k.',
            shading='Use canopyHeight (raster) for shadow casting; trees are the interactive/removable abstraction of the same surface.',
            bounds='Outer cell edges [minE, minN, maxE, maxN].'),
        ground=[r2(v) for v in ground.ravel()],
        canopyHeight=[r2(v) for v in chm.ravel()],
        crownId=[int(v) for v in labels.ravel()],
        trees=trees, lot1=loc(layout['lot1']), house=loc(layout['house']),
        overlay=dict(canopyPng='assets/sites/dannemora/site3d/canopy-height.png', bounds=[g['x0'], g['y0'], g['x1'], g['y1']],
                     note='One pixel per cell; alpha only where CHM >= 2 m.'),
        stats=stats, lidar=lidar, limitations=limitations,
        generated=dict(script='scripts/prepare-site-3d.py', at=datetime.now(timezone.utc).isoformat(timespec='seconds')),
    )

    chm_png(np.nan_to_num(chm, nan=0.0), chm_valid, OUT / 'canopy-height.png')
    if a.debug_dir:
        np.savez_compressed(Path(a.debug_dir) / 'site3d-debug.npz', chm=chm, chm_s=chm_s, structure=structure, labels=labels,
                            ground=ground, ground_cnt=ground_cnt, any_cnt=any_cnt, spikes=spikes)
    body = json.dumps(site3d, separators=(',', ':'), allow_nan=False)
    (OUT / 'site3d.json').write_text(body + '\n')
    JS_OUT.write_text('// Generated by scripts/prepare-site-3d.py - do not hand-edit.\nconst SITE_3D = ' + body + ';\n')

    manifest = dict(
        ept=dict(url=EPT_URL + '/ept.json', metadataSource=meta_src, matchesArchivedCopy=meta == archived,
                 archivedCopy=rel(EPT_ARCHIVE), srs=meta['srs'].get('horizontal'), version=meta.get('version'),
                 schemaZ=next(d for d in meta['schema'] if d['name'] == 'Z')),
        retrieved=datetime.fromtimestamp(max(pp.stat().st_mtime for _, pp, _ in paths), timezone.utc).isoformat(timespec='seconds'),
        retrievedNote='Latest download time among cached node files (file mtime); generated is the time this manifest was written.',
        generated=datetime.now(timezone.utc).isoformat(timespec='seconds'),
        aoi={'EPSG:26918': [g['x0'], g['y0'], g['x1'], g['y1']], 'EPSG:3857': [round(v, 3) for v in q],
             'definition': f'Provisional Lot 1 bbox + {BUFFER_M:.0f} m, snapped to the 2 m lattice aligned with DEM pixel edges, clipped to DEM extent.'},
        selection=f'Every EPT node at every depth whose XY box intersects the AOI (EPSG:3857 +2 m); full density, depths '
                  f'{min(r["depth"] for r in node_rows)}-{max(r["depth"] for r in node_rows)}.',
        hierarchyFiles=[f'sources/dannemora/lidar/ept-hierarchy/{k}.json' for k in hier_files],
        nodeCount=len(nodes), totalBytes=total_bytes, pointsInNodes=int(sum(nodes.values())), pointsDecoded=raw_total,
        pointsInAoi=npts, classCounts=class_counts,
        classAudit=class_audit, classNote=CLASS_NOTE,
        classNames={'1': 'unclassified (vegetation, structures, other)', '2': 'ground', '7': 'low noise', '9': 'water',
                    '10': 'ignored ground (breakline proximity)', '17': 'overlap unclassified (report label: bridge decks)',
                    '18': 'overlap ground (report label: high noise)', '25': 'overlap water'},
        horizontal=hz, vertical=vertical,
        gitignore='sources/dannemora/lidar/ept-data/*.laz is ignored; re-download with scripts/prepare-site-3d.py and verify sha256 below.',
        nodes=node_rows,
    )
    (CACHE / 'lidar-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

    log(f'Canopy cover >=2 m: AOI {stats["canopyCoverPct"]["ge2m"]["aoi"]}%, Lot 1 {stats["canopyCoverPct"]["ge2m"]["lot1"]}%')
    log(f'Trees: {len(trees)} (Lot 1 {int(lot_trees.sum())}); structures {int(structure.sum())} cells; spikes {int(spikes.sum())}')
    log(f'Wrote {rel(JS_OUT)} ({JS_OUT.stat().st_size / 1e6:.2f} MB), {rel(OUT / "site3d.json")}, {rel(CACHE / "lidar-manifest.json")}')


if __name__ == '__main__':
    main()
