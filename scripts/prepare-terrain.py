#!/usr/bin/env python3
"""Build exploratory terrain derivatives from a projected, metre-unit DEM.

Run with the mapping-race-courses GIS Python environment. Slope is the NumPy
central-difference gradient on the native raster, in percent; neighbours of
NoData remain NoData. Contours are every 2 m, an exploratory display interval,
not a statement of vertical accuracy. Mesh/profile samples use pixel centres.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import CRS, Transformer
from scipy.ndimage import map_coordinates
from skimage.measure import find_contours
from shapely.geometry import box, shape
from shapely.ops import transform as transform_geometry

ROOT = Path(__file__).resolve().parents[1]
COLORS = ['#d8e5bf', '#a8c58d', '#ead28a', '#dca465', '#ae6e5b']


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dem', required=True)
    p.add_argument('--source', default='USGS 3D Elevation Program')
    p.add_argument('--title', default='Dannemora terrain study')
    p.add_argument('--acquisition', default='Not verified')
    p.add_argument('--vertical-datum', default='Not verified')
    p.add_argument('--source-resolution', type=float, default=1)
    a = p.parse_args()
    dem_path = Path(a.dem).resolve()
    out = ROOT / 'assets/sites/dannemora/terrain'
    out.mkdir(parents=True, exist_ok=True)
    with rasterio.open(dem_path) as ds:
        crs = CRS(ds.crs)
        if not crs.is_projected or any(abs(axis.unit_conversion_factor - 1) > 1e-9 for axis in crs.axis_info[:2]):
            raise ValueError('Input horizontal CRS must be projected in metres; explicitly reproject first.')
        if ds.transform.b or ds.transform.d or ds.transform.a <= 0 or ds.transform.e >= 0:
            raise ValueError('Input must be a north-up, unrotated raster.')
        z = ds.read(1, masked=True).astype(float).filled(np.nan)
        t = ds.transform
        dx, dy = t.a, -t.e
        raster_bounds = list(ds.bounds)
    valid = np.isfinite(z)
    if not valid.any():
        raise ValueError('DEM contains no finite elevations.')
    lo, hi = float(np.nanmin(z)), float(np.nanmax(z))
    dzdy, dzdx = np.gradient(z, dy, dx)
    slope = 100 * np.hypot(dzdx, dzdy)
    slope[~valid] = np.nan
    slope_valid = np.isfinite(slope)
    bins = np.digitize(slope, [5, 10, 15, 25])
    rgb = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in COLORS], dtype=np.uint8)
    rgba = np.zeros((*z.shape, 4), np.uint8)
    rgba[..., :3] = rgb[np.minimum(bins, 4)]
    rgba[..., 3] = slope_valid.astype(np.uint8) * 255
    Image.fromarray(rgba).save(out / 'slope.png')
    # Light from northwest; raster rows increase southward.
    normal = np.stack([-dzdx, dzdy, np.ones(z.shape)], axis=-1)
    normal /= np.sqrt(np.sum(normal ** 2, axis=-1))[..., None]
    light = np.array([-0.5, 0.5, np.sqrt(0.5)])
    shade = np.clip(np.sum(normal * light, axis=-1), 0, 1)
    hs = np.zeros((*z.shape, 4), np.uint8)
    hs[..., :3] = np.nan_to_num(shade[..., None] * 215 + 35).astype(np.uint8)
    hs[..., 3] = slope_valid.astype(np.uint8) * 255
    Image.fromarray(hs).save(out / 'hillshade.png')
    f = np.clip((z - lo) / max(hi - lo, 1e-9), 0, 1)
    stops = np.array([[224, 233, 209], [143, 174, 132], [199, 179, 133], [133, 115, 100]])
    ergb = np.stack([np.interp(np.nan_to_num(f), np.linspace(0, 1, 4), stops[:, i]) for i in range(3)], axis=-1)
    ergb *= np.nan_to_num(0.75 + shade[..., None] * 0.25, nan=0.9)
    el = np.zeros((*z.shape, 4), np.uint8)
    el[..., :3] = ergb.astype(np.uint8)
    el[..., 3] = valid.astype(np.uint8) * 255
    Image.fromarray(el).save(out / 'elevation.png')
    to_wgs = Transformer.from_crs(crs, 4326, always_xy=True)
    features = []
    for level in np.arange(np.ceil(lo / 2) * 2, hi, 2):
        for line in find_contours(z, level, mask=valid):
            if len(line) < 3:
                continue
            xs = t.c + (line[:, 1] + 0.5) * dx
            ys = t.f - (line[:, 0] + 0.5) * dy
            lon, lat = to_wgs.transform(xs, ys)
            features.append({'type': 'Feature', 'properties': {'elevation_m': float(level), 'interval_m': 2},
                             'geometry': {'type': 'LineString', 'coordinates': np.round(np.c_[lon, lat], 8).tolist()}})
    (out / 'contours.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}))
    rows, cols = min(81, z.shape[0]), min(81, z.shape[1])
    rr = np.linspace(0, z.shape[0] - 1, rows)
    cc = np.linspace(0, z.shape[1] - 1, cols)
    rgrid, cgrid = np.meshgrid(rr, cc, indexing='ij')
    def sample(arr, r, c):
        return map_coordinates(arr, [r, c], order=1, mode='constant', cval=np.nan, prefilter=False)
    gridz = sample(z, rgrid, cgrid)
    grids = sample(slope, rgrid, cgrid)
    xmin, ymax = t * (0.5, 0.5)
    xmax, ymin = t * (z.shape[1] - 0.5, z.shape[0] - 0.5)
    bounds = [xmin, ymin, xmax, ymax]
    clip = box(*bounds)
    def svg_path(geometry):
        def line_path(coords, closed=False):
            points = [(1000 * (x - xmin) / (xmax - xmin), 1000 * (ymax - y) / (ymax - ymin)) for x, y, *rest in coords]
            return 'M' + 'L'.join(f'{u:.2f},{v:.2f}' for u, v in points) + ('Z' if closed else '')
        if geometry.is_empty:
            return ''
        if geometry.geom_type == 'Polygon':
            return line_path(geometry.exterior.coords, True) + ''.join(line_path(ring.coords, True) for ring in geometry.interiors)
        if geometry.geom_type in ('LineString', 'LinearRing'):
            return line_path(geometry.coords)
        if geometry.geom_type in ('Point', 'MultiPoint'):
            return ''
        return ''.join(svg_path(g) for g in geometry.geoms)
    from_wgs = Transformer.from_crs(4326, crs, always_xy=True)
    overlays = {'contours': [], 'water': [], 'wetlands': []}
    for feature in features:
        geom = transform_geometry(from_wgs.transform, shape(feature['geometry'])).intersection(clip).simplify(2, preserve_topology=True)
        path = svg_path(geom)
        if path:
            overlays['contours'].append({'elevation': feature['properties']['elevation_m'], 'path': path})
    for layer, filename in [('water', 'hydro-waterbodies.geojson'), ('wetlands', 'apa-wetland-areas.geojson')]:
        source_path = ROOT / 'sources/dannemora/terrain' / filename
        if source_path.exists():
            source_data = json.loads(source_path.read_text())
            for feature in source_data.get('features', []):
                if not feature.get('geometry'):
                    continue
                geom = transform_geometry(from_wgs.transform, shape(feature['geometry']))
                if not geom.is_valid:
                    geom = geom.buffer(0)
                geom = geom.intersection(clip).simplify(1, preserve_topology=True)
                path = svg_path(geom)
                if path:
                    overlays[layer].append({'path': path})
    boundary = []
    parcel = ROOT / 'sources/dannemora/county-parent-parcel.geojson'
    if parcel.exists():
        gj = json.loads(parcel.read_text())
        geom = gj['features'][0]['geometry']
        ring = geom['coordinates'][0] if geom['type'] == 'Polygon' else geom['coordinates'][0][0]
        tr = Transformer.from_crs(4326, crs, always_xy=True)
        x, y = tr.transform(*zip(*[v[:2] for v in ring]))
        boundary = [[round((xx - xmin) / (xmax - xmin), 6), round((ymax - yy) / (ymax - ymin), 6)] for xx, yy in zip(x, y)]
    def nullable(values):
        return [round(float(v), 3) if np.isfinite(v) else None for v in np.asarray(values).ravel()]
    def profile(vals, length):
        return [{'distance': round(float(d), 2), 'elevation': v} for d, v in zip(np.linspace(0, length, len(vals)), nullable(vals))]
    base = 'assets/sites/dannemora/terrain/'
    data = dict(cols=cols, rows=rows, elevations=nullable(gridz), slopes=nullable(grids), bounds=bounds,
                rasterBounds=raster_bounds, crs=crs.to_string(), verticalDatum=a.vertical_datum,
                sourceResolution=a.source_resolution, gridSpacing=[(xmax - xmin) / (cols - 1), (ymax - ymin) / (rows - 1)],
                min=round(lo, 3), max=round(hi, 3), validPercent=round(100 * valid.mean(), 2),
                source=a.source, title=a.title, acquisition=a.acquisition,
                files={k: base + v for k, v in dict(elevation='elevation.png', slope='slope.png', hillshade='hillshade.png', contours='contours.geojson').items()},
                boundary=boundary, overlays=overlays, overlayCoordinates='SVG viewBox 0 0 1000 1000; north at top; polygon holes require fill-rule evenodd.',
                profiles=dict(westEast=profile(sample(z, np.full(cols, (z.shape[0] - 1) / 2), cc), xmax - xmin),
                                                southNorth=profile(sample(z, rr[::-1], np.full(rows, (z.shape[1] - 1) / 2)), ymax - ymin)),
                slopeClasses=[dict(label=l, color=c, percent=round(100 * np.count_nonzero(slope_valid & (bins == i)) / slope_valid.sum(), 2))
                              for i, (l, c) in enumerate(zip(['0–5%', '5–10%', '10–15%', '15–25%', '25%+'], COLORS))],
                slopeMethod='NumPy central differences on native metre grid; percent rise/run. Edge differences are one-sided. NoData neighbours are excluded.',
                contourInterval=2, meshSampling='Bilinear samples at pixel centres; bounds describe outer pixel centres; rasterBounds describe outer pixel edges.',
                statisticsScope='Full rectangular DEM area of interest; not Lot 1 or a buildable-area calculation.',
                boundaryLabel='Approximate current county parent parcel; not surveyed Lot 1.',
                limitations='Historical bare-earth terrain; not a current survey. Grid spacing and contour interval do not establish accuracy. NoData retained.')
    data['files']['dem'] = str(dem_path.relative_to(ROOT))
    data['files']['grid'] = base + 'terrain-grid.json'
    (out / 'terrain-grid.json').write_text(json.dumps(data, separators=(',', ':'), allow_nan=False))
    (ROOT / 'terrain-data.js').write_text('const SITE_TERRAIN = ' + json.dumps(data, separators=(',', ':'), allow_nan=False) + ';\n')
    print(json.dumps({'source_shape': list(z.shape), 'grid': [cols, rows], 'min': lo, 'max': hi, 'valid_percent': data['validPercent'], 'contours': len(features), 'output': str(out)}))


if __name__ == '__main__':
    main()
