#!/usr/bin/env python3
"""Hydepark Lot 25: Cook County orthoimagery clips, parcel / right-of-way outlines and hydepark-imagery-data.js.

All geometry is in EPSG:26916 (NAD83 / UTM 16N, metres) and, for the browser, in local metres from the
shared Hydepark origin [450532, 4627452] (x east, y north). County parcels, clerk lots, right-of-way and
planimetry are GIS compilations, not survey. The plat lot is the 40 x 175 ft record lot with its 10 ft
corner cut, placed on the county parcel by a provisional anchor (see PLAT_ANCHOR); it is not surveyed.

  .venv/bin/python scripts/prepare-hydepark-imagery.py            # rebuild from sources/hydepark/cache/
  .venv/bin/python scripts/prepare-hydepark-imagery.py --acquire  # re-fetch imagery + GIS layers first
"""
import argparse
import hashlib
import json
import math
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from shapely.geometry import LineString, Point, Polygon, box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'sources/hydepark/cache'
ASSETS = ROOT / 'assets/sites/hydepark'
ACQ = ROOT / 'sources/hydepark/imagery/acquisition.json'
GEOM = ROOT / 'sources/hydepark/site-geometry.geojson'
OUT = ROOT / 'hydepark-imagery-data.js'

CRS = 'EPSG:26916'
ORIGIN = (450532.0, 4627452.0)
FT = 0.3048
IMAGERY = 'https://gis.cookcountyil.gov/imagery/rest/services'
TRAD = 'https://gis.cookcountyil.gov/traditional/rest/services'
GIS_BOX = 120  # half-size (m) of the GIS query window around the origin
NEIGHBOUR_RADIUS = 80
VIEW = 80  # half-size (m) of the site view; ROW and pavement are clipped to it

# Cook County publishes 6 in (0.5 ft) four-band orthophotography as one ImageServer per flight year
# (vendor Merrick from 2024). The services do not carry a flight date.
IMAGES = [
    dict(id='aerial-2025', year=2025, half=80, px=1067, title='2025 · vacant lot, leaf-on',
         note='Latest county flight. Lot 25 is vacant grass with large trees on the rear (west) third; spring leaf-on canopy hides parts of the alley and parkway.'),
    dict(id='aerial-2024', year=2024, half=80, px=1067, title='2024 · vacant lot, leaf-off',
         note='Leaf-off, so pavement, fences and the lot edges read best. Used for the line-offset check.'),
    dict(id='aerial-2020', year=2020, half=80, px=1067, title='2020 · before demolition',
         note='Leaf-off. Shows both frame houses (5418 north, 5420 south) before the June 2022 wrecking permits.'),
    dict(id='aerial-2025-context', year=2025, half=200, px=1600, title='2025 · block context (400 m)',
         note='Block context: Kimbark Ave and Nichols Park to the east, E 54th St to the north, the T-shaped alley system of Block 29.'),
]

LAYERS = {  # cache name -> (service path, description)
    'parcels': ('cookVwrDynmc/MapServer/44', 'Cook County current parcels (tax year 2024 geometry)'),
    'lots': ('clerkCadastre/MapServer/2', 'Cook County Clerk subdivision lots'),
    'row': ('clerkCadastre/MapServer/0', 'Cook County Clerk right-of-way'),
    'road-edge': ('planimetry/MapServer/7', 'Cook County planimetry road edge (pavement)'),
    'street': ('planimetry/MapServer/5', 'Cook County planimetry street centrelines'),
}

PLATS = 'Plats of survey: 5418 (Chicagoland Survey Co., July 21, 2014) and 5420 (Carradus Land Survey, Sept. 11, 2018)'
COLORS = dict(lot='#735bb5', parcel='#55e5ff', neighbour='#9aa0a6', row='#c9b37e', alley='#b59b6a',
              pavement='#7d838c', centre='#e2c36b', note='#d63b3b', building='#e78222')


def fetch(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'groundwork-hydepark/1.0'})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    path.write_bytes(data)
    return data


def export_url(img):
    x0, y0 = ORIGIN[0] - img['half'], ORIGIN[1] - img['half']
    x1, y1 = ORIGIN[0] + img['half'], ORIGIN[1] + img['half']
    q = dict(bbox=f'{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}', bboxSR=26916, imageSR=26916, size=f"{img['px']},{img['px']}",
             format='tiff', pixelType='U8', bandIds='0,1,2', interpolation='RSP_BilinearInterpolation', noData=0, f='image')
    return f"{IMAGERY}/CookOrtho{img['year']}/ImageServer/exportImage?" + urllib.parse.urlencode(q)


def layer_url(path):
    q = dict(geometry=f'{ORIGIN[0]-GIS_BOX:.0f},{ORIGIN[1]-GIS_BOX:.0f},{ORIGIN[0]+GIS_BOX:.0f},{ORIGIN[1]+GIS_BOX:.0f}',
             geometryType='esriGeometryEnvelope', inSR=26916, spatialRel='esriSpatialRelIntersects',
             outFields='*', returnGeometry='true', outSR=26916, f='geojson')
    return f'{TRAD}/{path}/query?' + urllib.parse.urlencode(q)


def acquire():
    for img in IMAGES:
        fetch(export_url(img), CACHE / 'imagery' / f"{img['id']}.tif")
        print('fetched', img['id'])
    for name, (path, _) in LAYERS.items():
        data = json.loads(fetch(layer_url(path), CACHE / 'gis' / f'{name}.geojson'))
        if 'error' in data or not data.get('features'):
            sys.exit(f'{name}: empty or error response')
        print('fetched', name, len(data['features']))
    (CACHE / 'acquired.json').write_text(json.dumps({'retrieved': date.today().isoformat()}))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(name):
    p = CACHE / 'gis' / f'{name}.geojson'
    if not p.exists():
        sys.exit(f'Missing {p.relative_to(ROOT)}; run with --acquire')
    return json.loads(p.read_text())['features']


def build_images(retrieved):
    out, prov = [], []
    for img in IMAGES:
        tif = CACHE / 'imagery' / f"{img['id']}.tif"
        if not tif.exists():
            sys.exit(f'Missing {tif.relative_to(ROOT)}; run with --acquire')
        with rasterio.open(tif) as src:
            assert src.crs.to_epsg() == 26916, src.crs
            b = src.bounds
            rgb = np.moveaxis(src.read([1, 2, 3]), 0, -1)
            res = src.res[0]
        expect = (ORIGIN[0] - img['half'], ORIGIN[1] - img['half'], ORIGIN[0] + img['half'], ORIGIN[1] + img['half'])
        assert max(abs(a - e) for a, e in zip(b, expect)) < 0.01, (b, expect)
        jpg = ASSETS / f"{img['id']}.jpg"
        Image.fromarray(rgb).save(jpg, quality=85, optimize=True)
        bounds = [round(b.left - ORIGIN[0], 3), round(b.bottom - ORIGIN[1], 3), round(b.right - ORIGIN[0], 3), round(b.top - ORIGIN[1], 3)]
        service = f"{IMAGERY}/CookOrtho{img['year']}/ImageServer"
        out.append(dict(id=img['id'], title=img['title'], year=img['year'], date=f"{img['year']} flight (exact date not published)",
                        source=f"Cook County orthophotography CookOrtho{img['year']}", url=service, resolutionM=round(res, 4),
                        file=str(jpg.relative_to(ROOT)), bounds=bounds, width=rgb.shape[1], height=rgb.shape[0], note=img['note']))
        prov.append(dict(id=img['id'], service=service, layer=f"CookOrtho{img['year']} (bands 1-3 of RGB+NIR)", flightYear=img['year'],
                         flightDate='Not published in the service metadata; leaf state indicates a spring flight.',
                         nativeResolution='0.5 ft US (0.152 m), 4-band RGB+NIR',
                         nativeCrs='NAD83(2011) / Illinois East ftUS (EPSG:6455)' if img['year'] >= 2024 else 'NAD83 / Illinois East ftUS (EPSG:3435)',
                         request=export_url(img), outputCrs=CRS, boundsEPSG26916=[round(v, 3) for v in b], boundsLocalM=bounds,
                         pixelSizeM=round(res, 6), width=rgb.shape[1], height=rgb.shape[0], resampling='Server-side bilinear reprojection',
                         rawFile=str(tif.relative_to(ROOT)), rawSha256=sha(tif), file=str(jpg.relative_to(ROOT)), sha256=sha(jpg),
                         retrieved=retrieved))
    return out, prov


def lot_frame(lot25):
    """Front-line midpoint and unit vectors (u: along the side lines toward the street, v: north) of the county Lot 25."""
    pts = np.array(lot25.exterior.coords[:-1])
    east = pts[pts[:, 0] > ORIGIN[0]]
    ne, se = east[east[:, 1].argmax()], east[east[:, 1].argmin()]
    sw = pts[(pts[:, 0] < ORIGIN[0])][:, 1].argmin()
    sw = pts[pts[:, 0] < ORIGIN[0]][sw]
    u = (se - sw) / np.linalg.norm(se - sw)
    v = np.array([-u[1], u[0]])
    return ne, se, sw, u, v


def plat_lot(ne, se, sw, u, v):
    """Record Lot 25: 40 ft on Kimbark, 175 ft deep, 10 x 10 ft corner cut at the NW alley corner (14.13 ft chord).
    PLAT_ANCHOR: centred in the county Lot 25 (county is 41.8 x 177.3 ft, so each plat line sits ~0.28 m inside the
    county side lines and ~0.35 m inside the front and rear) on the county side-line bearing. This puts the south line
    ~0.3 m north of the county line, which matches the 5422 building and garage offsets read off the imagery (ALIGNMENT)."""
    W, D, C = 40 * FT, 175 * FT, 10 * FT
    a0 = ((se - sw) @ u - D) / 2
    b0 = ((ne - se) @ v - W) / 2
    P = lambda a, b: tuple(se - (a + a0) * u + (b + b0) * v)
    ring = [P(0, 0), P(0, W), P(D - C, W), P(D, W - C), P(D, 0), P(0, 0)]
    half = [P(0, W / 2), P(D, W / 2)]
    return Polygon(ring), LineString(half), P, (a0, b0)


# Manual readings off the 2020 / 2024 clips (0.15 m pixels) against the county lines, in metres; + = feature lies
# outside the county parcel (north of the north line, south of the south line, east of the front, west of the rear).
ALIGNMENT = [
    dict(edge='south', image='aerial-2024, aerial-2020', feature='5422 building north roof edge; plat: building 0.35 ft south of the line',
         reading='Roof edge 0.2-0.3 m north of the county line in both years', impliedLineVsCounty='+0.3 to +0.4 m north (county line sits south of the plat-implied line)'),
    dict(edge='south (rear)', image='aerial-2024', feature='5422 brick garage north roof edge; plat: garage 0.3-0.35 ft south of the line',
         reading='Roof edge ~0.2 m north of the county line', impliedLineVsCounty='~+0.3 m north'),
    dict(edge='front (Kimbark)', image='aerial-2024', feature='5422 front face; plat: building corner 12.0 ft west of the front line',
         reading='Front face at x = 23.4-23.6 m', impliedLineVsCounty='-0.1 to -0.2 m (within reading error)'),
    dict(edge='rear (alley)', image='aerial-2024', feature='5422 garage west face, drawn on the rear line on the 2018 plat',
         reading='West face at x = -26.4 m', impliedLineVsCounty='~0.3 m east of the county rear line'),
    dict(edge='north', image='aerial-2020', feature='5418 house roof / shadow edge; plat: house 0.25-0.5 ft south of the line',
         reading='Eave edge at y = 6.0-6.3 m (eave overhang uncertain)', impliedLineVsCounty='0 to +0.4 m north'),
    dict(edge='north', image='aerial-2024', feature='South edge of the 20 ft alley pavement',
         reading='Pavement edge at y = 6.6-6.8 m; paved width ~5.7 m (18.7 ft) to the 5412 face', impliedLineVsCounty='+0.7 to +0.9 m north if the pavement reaches the lot line'),
]


def feature(geom, **props):
    return {'type': 'Feature', 'properties': props, 'geometry': mapping(geom) if geom is not None else None}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--acquire', action='store_true', help='re-fetch imagery and GIS layers from Cook County')
    args = ap.parse_args()
    if args.acquire:
        acquire()
    acq = CACHE / 'acquired.json'
    retrieved = json.loads(acq.read_text())['retrieved'] if acq.exists() else '2026-10-22'

    ASSETS.mkdir(parents=True, exist_ok=True)
    images, prov = build_images(retrieved)

    parcels = load('parcels')
    by_pin = {f['properties']['PIN14']: f for f in parcels}
    p5418, p5420 = shape(by_pin['20114200250000']['geometry']), shape(by_pin['20114200260000']['geometry'])
    lot25 = unary_union([p5418, p5420]).buffer(0.001).buffer(-0.001).simplify(0.002)
    clerk = [f for f in load('lots') if shape(f['geometry']).buffer(-0.2).contains(Point(ORIGIN))]
    clerk_lot = shape(clerk[0]['geometry']) if clerk else None
    clerk_match = clerk_lot is not None and clerk_lot.symmetric_difference(lot25).area < 0.05
    ne, se, sw, u, v = lot_frame(lot25)
    plat, half, P, (a0, b0) = plat_lot(ne, se, sw, u, v)
    bearing = math.degrees(math.atan2(u[1], u[0]))

    src_parcels = f'{TRAD}/cookVwrDynmc/MapServer/44'
    feats = []
    feats.append(feature(plat, id='plat-lot25', label='Lot 25 · plat dimensions (provisional placement)', kind='lot', category='provisional',
                         source=PLATS, status='40 × 175 ft record lot with 10 × 10 ft corner cut (14.13 ft chord), centred in the county Lot 25 on its bearing. Not surveyed; not for setbacks or areas.',
                         color=COLORS['lot'], dashed=True, areaSqft=round(plat.area / FT ** 2)))
    feats.append(feature(half, id='plat-half-line', label='North / south half line (5418 | 5420)', kind='lot', category='provisional',
                         source=PLATS, status='Measured 171.51 ft (2014) vs 175.00 ft (2018, record) — HP-003. Goes away when the PINs are combined.',
                         color=COLORS['lot'], dashed=True))
    feats.append(feature(lot25, id='county-lot25', label='Lot 25 · county parcels combined', kind='parcel', category='mapped',
                         source=src_parcels, status='Union of PINs 20-11-420-025 and -026 (2024 geometry). '
                         + ('Identical to the Cook County Clerk subdivision Lot 25 polygon. ' if clerk_match else '')
                         + f'GIS, not survey: {lot25.area / FT ** 2:,.0f} sq ft vs 6,960 on the plats.',
                         color=COLORS['parcel'], dashed=False, areaSqft=round(lot25.area / FT ** 2)))
    for pin, g, addr in [('20-11-420-025-0000', p5418, '5418'), ('20-11-420-026-0000', p5420, '5420')]:
        feats.append(feature(g, id=f'county-{addr}', label=f'{addr} S. Kimbark · PIN {pin}', kind='parcel', category='mapped',
                             source=src_parcels, status=f'County GIS parcel, {g.area / FT ** 2:,.0f} sq ft in GIS; separate tax parcel until the consolidation is recorded.',
                             color=COLORS['parcel'], dashed=False, areaSqft=round(g.area / FT ** 2)))
    for f in parcels:
        p = f['properties']
        if p['PIN14'] in ('20114200250000', '20114200260000'):
            continue
        g = shape(f['geometry'])
        if g.distance(Point(ORIGIN)) > NEIGHBOUR_RADIUS:
            continue
        feats.append(feature(g, id=f"parcel-{p['PIN14']}", label=f"{p['Address'].title().replace('S ', 'S. ').replace('E ', 'E. ')} · {p['PIN14'][:2]}-{p['PIN14'][2:4]}-{p['PIN14'][4:7]}-{p['PIN14'][7:10]}",
                             kind='neighbourParcel', category='mapped', source=src_parcels,
                             status=f"Class {p.get('BLDGClass')}; building age {p.get('BldgAge')} y; county GIS geometry",
                             color=COLORS['neighbour'], dashed=False))

    view = box(ORIGIN[0] - VIEW, ORIGIN[1] - VIEW, ORIGIN[0] + VIEW, ORIGIN[1] + VIEW)
    roads = [shape(f['geometry']) for f in load('row') if f['properties']['ROWTYPE'] == 1]
    row = unary_union(roads).intersection(view)
    feats.append(feature(row, id='county-row', label='Public right-of-way (streets and alleys)', kind='row', category='mapped',
                         source=f'{TRAD}/clerkCadastre/MapServer/0', status='Cook County Clerk road right-of-way, clipped to the 160 m view. Compiled from tax maps; not survey.',
                         color=COLORS['row'], dashed=False))
    vac = [shape(f['geometry']) for f in load('row') if f['properties']['ROWTYPE'] == 6]
    for i, g in enumerate(vac):
        g = g.intersection(view)
        if not g.is_empty:
            feats.append(feature(g, id=f'county-vacated-{i + 1}', label='Vacated right-of-way', kind='row', category='mapped',
                                 source=f'{TRAD}/clerkCadastre/MapServer/0', status='Clerk ROWTYPE 6 (vacated); not adjoining Lot 25.',
                                 color=COLORS['neighbour'], dashed=True))
    for f in load('road-edge'):
        g = shape(f['geometry']).intersection(view)
        if g.is_empty:
            continue
        alley = f['properties']['TYPE'] == 5
        feats.append(feature(g, id=f"pavement-{f['properties']['OBJECTID']}", label='Alley pavement' if alley else 'Street pavement',
                             kind='alley' if alley else 'row', category='mapped', source=f'{TRAD}/planimetry/MapServer/7',
                             status='County planimetry road edge (photogrammetric, compilation year not stated).',
                             color=COLORS['pavement'], dashed=False))
    for f in load('street'):
        g = shape(f['geometry']).intersection(view)
        if g.is_empty:
            continue
        name = f['properties'].get('FULLSTNA') or 'Street'
        feats.append(feature(g, id=f"centreline-{f['properties']['OBJECTID']}", label=f"{name.title()} centreline", kind='alley' if name == 'ALLEY' else 'row',
                             category='mapped', source=f'{TRAD}/planimetry/MapServer/5', status='County street centreline (routing data, not a ROW line).',
                             color=COLORS['centre'], dashed=True))

    # Plat-documented right-of-way widths, drawn off the provisional plat lot.
    W, D, C = 40 * FT, 175 * FT, 10 * FT
    north_alley = Polygon([P(0, W), P(0, W + 20 * FT), P(D, W + 20 * FT), P(D, W - C), P(D - C, W)])
    feats.append(feature(north_alley, id='plat-north-alley', label='20 ft public alley (north side)', kind='alley', category='provisional',
                         source=PLATS, status='Width from the 2014 plat (asphalt; 5412 brick building 20.37 ft north of the Lot 25 line, i.e. ~0.37 ft beyond the alley). Placement follows the provisional plat lot.',
                         color=COLORS['alley'], dashed=True))
    rear_alley = Polygon([P(D, -20), P(D, W + 20 * FT), P(D + 24 * FT, W + 20 * FT), P(D + 24 * FT, -20)])
    feats.append(feature(rear_alley, id='plat-rear-alley', label='24 ft public alley (rear, west)', kind='alley', category='provisional',
                         source=PLATS, status='Width from both plats (asphalt / bituminous). Placement follows the provisional plat lot.',
                         color=COLORS['alley'], dashed=True))
    kimbark = Polygon([P(0, -20), P(-66 * FT, -20), P(-66 * FT, W + 20 * FT + 20), P(0, W + 20 * FT + 20)])
    feats.append(feature(kimbark, id='plat-kimbark-row', label='S. Kimbark Ave · 66 ft right-of-way', kind='row', category='provisional',
                         source=PLATS, status='66 ft ROW per the 2018 plat (bituminous roadway, curb & gutter, concrete walk). Placement follows the provisional plat lot.',
                         color=COLORS['row'], dashed=True))

    # What the plats record about easements, building lines and near-line items.
    c = plat.centroid
    feats.append(feature(Point(c.x, c.y + 2), id='note-easements', label='Easements: none shown', kind='easement', category='documented', source=PLATS,
                         status='None shown on the 2014/2018 plats; both defer to deed, title policy and local regulations. No title or recorded-document search done.',
                         color=COLORS['note'], dashed=True))
    feats.append(feature(Point(c.x, c.y - 2), id='note-building-lines', label='Building lines: none shown', kind='buildingLine', category='documented', source=PLATS,
                         status='No recorded building line on either plat. Zoning setbacks (RT-4) are separate and unverified (HP-011).',
                         color=COLORS['note'], dashed=True))
    near = [
        ('near-5422-bldg', (12 * FT, -0.35 * FT), '5422 building corner 0.35 ft south of the south line, 12.0 ft west of Kimbark (2018 plat)'),
        ('near-5422-wall', (3 * FT, -0.95 * FT), 'Concrete wall north face 0.9–1.0 ft south of the south line near the front (2018 plat)'),
        ('near-5422-garage', (D - 8 * FT, -0.33 * FT), '5422 brick garage corners 0.3–0.35 ft south of the south line at the rear (2018 plat)'),
        ('near-5412-bldg', (30 * FT, W + 20.37 * FT), '5412 brick building 20.37 ft north of the Lot 25 north line, across the 20 ft alley (2014 plat)'),
    ]
    for fid, ab, text in near:
        x, y = P(*ab)
        feats.append(feature(Point(x, y), id=fid, label=text.split(' (')[0], kind='note', category='documented', source=PLATS,
                             status=text + '. Outside Lot 25; no encroachment onto Lot 25 is recorded. Position follows the provisional plat lot.',
                             color=COLORS['note'], dashed=False))

    gj = {'type': 'FeatureCollection', 'name': 'hydepark-site-geometry',
          'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::26916'}},
          'note': 'EPSG:26916 metres. Generated by scripts/prepare-hydepark-imagery.py. County/clerk geometry is GIS compilation, not survey; '
                  'plat-derived features are provisional placements of record dimensions.',
          'origin': list(ORIGIN), 'retrieved': retrieved,
          'features': [{**f, 'geometry': _round(f['geometry'], 3)} for f in feats]}
    GEOM.write_text(json.dumps(gj, indent=1, ensure_ascii=False) + '\n')

    def local(geom):
        g = shape(geom)
        if g.geom_type == 'Point':
            return {'point': [round(g.x - ORIGIN[0], 2), round(g.y - ORIGIN[1], 2)]}
        if g.geom_type in ('LineString', 'MultiLineString'):
            ls = [g] if g.geom_type == 'LineString' else list(g.geoms)
            return {'lines': [[[round(x - ORIGIN[0], 2), round(y - ORIGIN[1], 2)] for x, y in l.coords] for l in ls]}
        polys = [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']
        return {'rings': [[[round(x - ORIGIN[0], 2), round(y - ORIGIN[1], 2)] for x, y in r.coords]
                          for p in polys for r in [p.exterior, *p.interiors]]}

    js_feats = [{**f['properties'], **local(f['geometry'])} for f in feats]
    data = dict(revision=f'HI-{retrieved}-01', retrieved=retrieved, crs=CRS, origin=list(ORIGIN), units='m',
                axes='x east, y north, metres from origin',
                lotFrame=dict(bearingDeg=round(bearing, 3), note='Side lines of the county Lot 25 run %.2f° from grid east in UTM 16N.' % bearing),
                platAnchor=dict(insetFrontRearM=round(a0, 3), insetSidesM=round(b0, 3), note='Plat lot centred in the county Lot 25 on the county bearing; provisional.'),
                alignment=ALIGNMENT, method='See ops/hydepark-imagery.md', images=images, features=js_feats)
    OUT.write_text('// Generated by scripts/prepare-hydepark-imagery.py from Cook County imagery and GIS. Do not edit.\n'
                   f'const SITE_HYDEPARK_IMAGERY = {json.dumps(data, ensure_ascii=False)};\n')

    ACQ.parent.mkdir(parents=True, exist_ok=True)
    ACQ.write_text(json.dumps(dict(
        retrieved=retrieved, crs=CRS, origin=list(ORIGIN),
        note='Exported through each ImageServer exportImage in EPSG:26916 (server reprojection from Illinois East State Plane ftUS; '
             'any NAD83(2011) -> NAD83 datum shift is whatever the server applies, so absolute position may differ by a few decimetres; '
             'parcels came through the same server and share that frame). Raw GeoTIFFs stay in the gitignored cache.',
        images=prov,
        layers=[dict(name=n, service=f'{TRAD}/{p}', description=d, request=layer_url(p), rawFile=f'sources/hydepark/cache/gis/{n}.geojson',
                     rawSha256=sha(CACHE / 'gis' / f'{n}.geojson'), features=len(load(n))) for n, (p, d) in LAYERS.items()],
        outputs=dict(geometry=dict(file=str(GEOM.relative_to(ROOT)), sha256=sha(GEOM)), data=dict(file=OUT.name, sha256=sha(OUT)))),
        indent=1, ensure_ascii=False) + '\n')
    print(f'Wrote {len(images)} images, {len(feats)} features; Lot 25 county {lot25.area / FT ** 2:,.0f} sq ft, plat {plat.area / FT ** 2:,.0f} sq ft, '
          f'clerk lot match={clerk_match}, side-line bearing {bearing:.3f}°')


def _round(g, n):
    if g is None:
        return None
    def r(c):
        return [round(c[0], n), round(c[1], n)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {**g, 'coordinates': r(g['coordinates'])} if 'coordinates' in g else {**g, 'geometries': [_round(x, n) for x in g['geometries']]}


if __name__ == '__main__':
    main()
