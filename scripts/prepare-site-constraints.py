"""Build site constraint layers: documented permit traces, mapped wetlands, practice PP-01.

Documented layers are traced by hand in source-drawing pixels and carried to
EPSG:26918 through the provisional survey-to-county-GIS display fit
(sources/dannemora/permit-aerial-registration.json). C1 features are first
fitted to the survey with a separate similarity on shared wetland flags.
Everything here is display and learning geometry, not surveyed coordinates.
Practice PP-01 values come from ops/practice-permit.json.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'sources/dannemora/constraints'
REVISION, UPDATED = 'SC-2026-10-20-01', '2026-10-20'
FT, ACRE = 0.3048, 4046.8564224
SURVEY, C1 = 'assets/sites/dannemora/subdivision-survey.png', 'assets/sites/dannemora/septic-site-c1.png'
PERMIT = 'https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf'

registration = json.loads((ROOT / 'sources/dannemora/permit-aerial-registration.json').read_text())
provisional = json.loads((ROOT / 'sources/dannemora/permit-layout-provisional.geojson').read_text())
grid = json.loads((ROOT / 'assets/sites/dannemora/terrain/terrain-grid.json').read_text())
manifest = json.loads((ROOT / 'sources/dannemora/imagery-manifest.json').read_text())
practice = json.loads((ROOT / 'ops/practice-permit.json').read_text())
limit = {x['id']: x['value'] for x in practice['limits']}
to_utm = Transformer.from_crs(4326, 26918, always_xy=True).transform
to_wgs = Transformer.from_crs(26918, 4326, always_xy=True).transform

# ---------------------------------------------------------------- survey traces
# Source pixels in the archived 2600 x 2009 survey preview (APA 2025-0137 page 9).
SURVEY_FLAGS = {
    'd1': (1750, 1487), 'd2': (1698, 1430), 'd3': (1710, 1417), 'd4': (1734, 1408), 'd5': (1755, 1369),
    'd6': (1746, 1354), 'd7': (1805, 1358), 'd8': (1813, 1350), 'd9': (1800, 1324), 'd10': (1856, 1300),
    'd11': (1896, 1290), 'd12': (1921, 1267), 'd13': (1902, 1225), 'd14': (1878, 1162), 'd15': (1860, 1107),
    'd16': (1843, 1058), 'd17': (1837, 1012)}
# Heavy dashed "stream" line, south-west (Chazy Lake Road) to north-east (past the Lot 1 east line).
STREAM = [(1764, 1500), (1764, 1490), (1764, 1474), (1765, 1463), (1763, 1448), (1766, 1435), (1778, 1422),
          (1783, 1411), (1788, 1394), (1793, 1378), (1798, 1372), (1807, 1362), (1842, 1340), (1860, 1328),
          (1873, 1319), (1886, 1310), (1902, 1306), (1914, 1303), (1933, 1292), (1963, 1273), (1977, 1263),
          (1990, 1247), (2010, 1240), (2047, 1227)]
# Dotted limits of clearing (lot1-permitted-layout.svg callout 3): house, camps, septic and the driveway corridor.
CLEARING_OUTER = [(2180, 1403), (2127, 1404), (2073, 1408), (2040, 1406), (2013, 1399), (1992, 1393), (1985, 1389),
                  (1978, 1382), (1977, 1373), (1977, 1363), (1972, 1355), (1968, 1350), (1961, 1350), (1931, 1346),
                  (1922, 1345), (1916, 1358), (1917, 1368), (1905, 1378), (1890, 1383), (1879, 1386), (1870, 1392),
                  (1867, 1398), (1866, 1409), (1864, 1419), (1865, 1429), (1866, 1437), (1871, 1449), (1874, 1461),
                  (1877, 1471), (1882, 1480), (1889, 1484), (1895, 1487), (1910, 1491), (1923, 1494), (1933, 1496),
                  (1941, 1499), (1945, 1522)]
CLEARING_INNER = [(1978, 1526), (1973, 1496), (1969, 1485), (1965, 1475), (1949, 1459), (1945, 1453), (1939, 1447),
                  (1934, 1441), (1928, 1428), (1930, 1412), (1940, 1407), (1955, 1407), (1973, 1407), (1983, 1410),
                  (2007, 1418), (2040, 1428), (2060, 1430), (2100, 1422), (2130, 1420), (2180, 1422)]
ACCESSORY = [[(1924, 1352), (1938, 1352), (1938, 1375), (1924, 1375)],
             [(1955, 1355), (1968, 1355), (1968, 1379), (1955, 1379)]]
# Explicit Lot 1 edge classification from survey bearings, labels and adjoiners (never from polygon order).
EDGES = [
    ((1778, 1108), (2031, 1145), 'side-rear', 'North line S46°35\'00"E 227.49\' · adjoins Lot 2 (lands to be merged with adjoining owner)'),
    ((2031, 1145), (1997, 1304), 'side-rear', 'East line S46°34\'05"W 143.72\' · adjoins adjoining owner'),
    ((1997, 1304), (2009, 1368), 'side-rear', 'East jog S24°09\'05"W 56.25\' · adjoins adjoining owner'),
    ((2009, 1368), (2172, 1390), 'side-rear', 'South-east line S46°35\'02"E 150.00\' · adjoins adjoining owner'),
    ((2172, 1390), (2155, 1543), 'road', 'Garmish Street frontage S41°55\'21"W 135.76\' · corner falls in existing pavement'),
    ((2155, 1543), (1684, 1476), 'road', 'Chazy Lake Road frontage N47°14\'47"W 402.19\' + 25.29\' (traced as one edge)'),
    ((1684, 1476), (1778, 1108), 'side-rear', 'West line N49°27\'48"E 340.37\' · adjoins Lot 2'),
]

# ---------------------------------------------------------------- C1 traces
# Source pixels in the archived 2600 x 2009 C1 preview (APA 2025-0137 page 7). Flags share labels with the survey.
C1_FLAGS = {
    'd1': (515, 1452), 'd2': (235, 1228), 'd3': (283, 1162), 'd4': (390, 1100), 'd5': (455, 932), 'd6': (400, 872),
    'd7': (675, 856), 'd8': (702, 827), 'd9': (625, 708), 'd10': (868, 562), 'd11': (1015, 518), 'd12': (1128, 390)}
C1_TANK = [(1013, 1132), (1037, 1132), (1037, 1175), (1013, 1175)]
C1_DBOX = (1134, 1340)
C1_TRENCHES = [[(1137, 1306), (1265, 1306), (1265, 1316), (1137, 1316)], [(1140, 1336), (1292, 1336), (1292, 1346), (1140, 1346)]]
C1_FILL = [(1077, 1246), (1352, 1246), (1352, 1409), (1077, 1409)]
C1_WELL = (1197, 745)
C1_HOUSE_BOX = [(875, 1010), (1052, 1010), (1052, 1080), (875, 1080)]
SURVEY_DRIVE_WINDOW = (1895, 1395, 1990, 1505)
# Survey symbols used only as independent checks of the C1 fit (not controls).
SURVEY_DBOX = (1897, 1475)
SURVEY_FIELD = [(1892, 1465), (1933, 1465), (1933, 1486), (1892, 1486)]

# ---------------------------------------------------------------- transforms
a, b, tx, ty = registration['parameters']


def survey_utm(x, y):
    return a * x + b * y + tx, b * x - a * y + ty


def fit_similarity(pairs):
    A, B = [], []
    for (x, y), (X, Y) in pairs:
        A += [[x, -y, 1, 0], [y, x, 0, 1]]
        B += [X, Y]
    A, B = np.array(A, float), np.array(B, float)
    p = np.linalg.lstsq(A, B, rcond=None)[0]
    err = np.hypot(*(A @ p - B).reshape(-1, 2).T)
    loo = []
    for i in range(len(pairs)):
        keep = np.ones(len(A), bool)
        keep[2 * i:2 * i + 2] = False
        q = np.linalg.lstsq(A[keep], B[keep], rcond=None)[0]
        loo.append(float(np.hypot(*(A[2 * i:2 * i + 2] @ q - B[2 * i:2 * i + 2]))))
    return p, err, np.array(loo)


names = list(C1_FLAGS)
c1p, c1_err, c1_loo = fit_similarity([(C1_FLAGS[k], SURVEY_FLAGS[k]) for k in names])


def c1_survey(x, y):
    return c1p[0] * x - c1p[1] * y + c1p[2], c1p[1] * x + c1p[0] * y + c1p[3]


SURVEY_M_PER_PX = math.hypot(a, b)
C1_SCALE = math.hypot(c1p[0], c1p[1])
C1_M_PER_PX = C1_SCALE * SURVEY_M_PER_PX


def survey_geom(points):
    return Polygon([survey_utm(*p) for p in points])


def c1_geom(points):
    return Polygon([survey_utm(*c1_survey(*p)) for p in points])


def drive_check():
    """Independent check: chamfer distance of warped C1 linework to survey linework in the driveway hook."""
    s = Image.open(ROOT / SURVEY).convert('L')
    c = Image.open(ROOT / C1).convert('L')
    M = np.linalg.inv(np.array([[c1p[0], -c1p[1], c1p[2]], [c1p[1], c1p[0], c1p[3]], [0, 0, 1]]))
    warped = np.array(c.transform(s.size, Image.AFFINE, tuple(M[:2].ravel()), resample=Image.BILINEAR, fillcolor=255))
    x0, y0, x1, y1 = SURVEY_DRIVE_WINDOW
    sv, cv = np.array(s)[y0:y1, x0:x1] < 170, warped[y0:y1, x0:x1] < 170
    dist = ndimage.distance_transform_edt(~sv)[cv]
    return {'window': list(SURVEY_DRIVE_WINDOW), 'c1DarkPixels': int(cv.sum()),
            'medianPx': round(float(np.median(dist)), 2), 'p90Px': round(float(np.percentile(dist, 90)), 2),
            'medianMeters': round(float(np.median(dist)) * SURVEY_M_PER_PX, 2),
            'p90Meters': round(float(np.percentile(dist, 90)) * SURVEY_M_PER_PX, 2)}


# ---------------------------------------------------------------- geometry
lot_feature = next(f for f in provisional['features'] if f['properties']['id'] == 'lot1')
house_feature = next(f for f in provisional['features'] if f['properties']['id'] == 'house')


def from_wgs(geometry):
    return Polygon([to_utm(lon, lat) for lon, lat in geometry['coordinates'][0]])


lot = from_wgs(lot_feature['geometry'])
house = from_wgs(house_feature['geometry'])

# Match the explicit edge classes to the provisional Lot 1 ring by coordinates.
lot_ring = list(lot.exterior.coords)[:-1]
edge_records, road_lines, side_lines = [], [], []
for start, end, kind, evidence in EDGES:
    pa, pb = survey_utm(*start), survey_utm(*end)
    ia = min(range(len(lot_ring)), key=lambda i: math.dist(lot_ring[i], pa))
    ib = min(range(len(lot_ring)), key=lambda i: math.dist(lot_ring[i], pb))
    assert math.dist(lot_ring[ia], pa) < 0.5 and math.dist(lot_ring[ib], pb) < 0.5, (start, end)
    line = LineString([lot_ring[ia], lot_ring[ib]])
    (road_lines if kind == 'road' else side_lines).append(line)
    if evidence.startswith('Chazy Lake Road'):
        chazy_line = line
    edge_records.append({'sourcePixels': [list(start), list(end)], 'class': kind, 'evidence': evidence,
                         'name': evidence.split(' frontage')[0] if kind == 'road' else 'Side / rear line',
                         'utm': [[round(c, 2) for c in lot_ring[ia]], [round(c, 2) for c in lot_ring[ib]]],
                         'lengthMeters': round(line.length, 2), 'lengthFeet': round(line.length / FT, 1)})

flag_order = list(SURVEY_FLAGS)
flag_line = LineString([survey_utm(*SURVEY_FLAGS[k]) for k in flag_order])
stream_line = LineString([survey_utm(*p) for p in STREAM])
# Wetland closure: flag line d1 → d15 (just outside the Lot 1 north line), out around the north-east corner
# beyond Lot 1, back along the stream to Chazy Lake Road, then intersected with Lot 1.
closure_px = ([(1762, 1500)] + [SURVEY_FLAGS[k] for k in flag_order[:15]] + [(1860, 1090), (2060, 1090), (2060, 1222)]
              + STREAM[::-1])
wetland_raw = survey_geom(closure_px)
if not wetland_raw.is_valid:
    wetland_raw = wetland_raw.buffer(0)
wetland = wetland_raw.intersection(lot)
clearing = survey_geom(CLEARING_OUTER + CLEARING_INNER).buffer(0).intersection(lot)
accessory = MultiPolygon([survey_geom(r) for r in ACCESSORY])
tank = c1_geom(C1_TANK)
field = unary_union([c1_geom(r) for r in C1_TRENCHES])
fill = c1_geom(C1_FILL)
well_point = Point(survey_utm(*c1_survey(*C1_WELL)))
well = well_point.buffer(1.5, 24)
dbox_point = Point(survey_utm(*c1_survey(*C1_DBOX)))
c1_house = c1_geom(C1_HOUSE_BOX)

# Practice geometry.
road_setback = unary_union([l.buffer(limit['setback-road'] * FT) for l in road_lines]).intersection(lot)
side_setback = unary_union([l.buffer(limit['setback-side-rear'] * FT) for l in side_lines]).intersection(lot).difference(road_setback)
wetland_buffer_full = unary_union([wetland, flag_line]).buffer(limit['wetland-setback'] * FT, 32)
wetland_buffer = wetland_buffer_full.intersection(lot).difference(wetland)
flag_only_buffer = flag_line.buffer(limit['wetland-setback'] * FT, 32).intersection(lot).difference(wetland)
sb = practice['septicBasis']
reserve_w, reserve_l = sb['reserveFootprintFt']
ppf = 1 / (C1_M_PER_PX / FT)  # C1 pixels per foot
fx0, fy1 = C1_FILL[0][0], C1_FILL[2][1]  # keep the C1 fill west and south edges; grow north and east
reserve_px = [(fx0, fy1 - reserve_w * ppf), (fx0 + reserve_l * ppf, fy1 - reserve_w * ppf), (fx0 + reserve_l * ppf, fy1), (fx0, fy1)]
septic_reserve = c1_geom(reserve_px)
cx, cy = fx0 + reserve_l * ppf / 2, fy1 - reserve_w * ppf / 2
field_l, field_w = 50, 20
practice_field = c1_geom([(cx - field_l * ppf / 2, cy - field_w * ppf / 2), (cx + field_l * ppf / 2, cy - field_w * ppf / 2),
                          (cx + field_l * ppf / 2, cy + field_w * ppf / 2), (cx - field_l * ppf / 2, cy + field_w * ppf / 2)])
well_radius = well_point.buffer(limit['well-septic'] * FT, 64).intersection(lot)
buildable = lot.difference(unary_union([road_setback, side_setback, wetland, wetland_buffer, septic_reserve, well_radius]))
buildable = unary_union([g for g in getattr(buildable, 'geoms', [buildable]) if g.area > 1])


def fits(region, w_ft, l_ft):
    """Brute-force test: can a w × l ft rectangle sit inside the region (1 m grid, 10° steps)?"""
    if region.is_empty:
        return None
    import shapely
    shapely.prepare(region)
    minx, miny, maxx, maxy = region.bounds
    base = box(-w_ft * FT / 2, -l_ft * FT / 2, w_ft * FT / 2, l_ft * FT / 2)
    for angle in range(0, 180, 10):
        r = affinity.rotate(base, angle, origin=(0, 0))
        for x in np.arange(minx, maxx, 1.0):
            cand = [affinity.translate(r, x, y) for y in np.arange(miny, maxy, 1.0)]
            ok = shapely.contains(region, cand)
            if ok.any():
                c = cand[int(np.argmax(ok))].centroid
                return {'angleDeg': angle, 'centerUtm': [round(c.x, 1), round(c.y, 1)]}
    return None


# ---------------------------------------------------------------- mapped inventory
study = box(*grid['bounds'])


def mapped(filename, keep):
    data = json.loads((ROOT / 'sources/dannemora/terrain' / filename).read_text())
    parts, props = [], []
    for f in data['features']:
        if not keep(f['properties']):
            continue
        g = shape(f['geometry'])
        utm = transform_geom(g, to_utm)
        utm = (utm if utm.is_valid else utm.buffer(0)).intersection(study)
        if not utm.is_valid:
            utm = utm.buffer(0)
        if not utm.is_empty:
            parts.append(utm)
            props.append(f['properties'])
    return unary_union(parts), props


def transform_geom(g, fn):
    import shapely
    return shapely.transform(g, lambda xy: np.array([fn(x, y) for x, y in xy]))


apa_wet, apa_props = mapped('apa-wetland-areas.geojson', lambda p: True)
nwi_wet, nwi_props = mapped('nwi-wetlands.geojson', lambda p: not str(p.get('ATTRIBUTE', '')).startswith('L'))
nwi_stream, _ = mapped('nwi-wetlands.geojson', lambda p: p.get('ATTRIBUTE') == 'R4SB3C')

# ---------------------------------------------------------------- normalization
xmin, ymin, xmax, ymax = grid['bounds']
R = 6378137


def terrain_xy(E, N):
    return 1000 * (E - xmin) / (xmax - xmin), 1000 * (ymax - N) / (ymax - ymin)


def mercator(lon, lat):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def aerial_fn(extent):
    def fn(E, N):
        x, y = mercator(*to_wgs(E, N))
        return ((x - extent['xmin']) / (extent['xmax'] - extent['xmin']) * 1000,
                (extent['ymax'] - y) / (extent['ymax'] - extent['ymin']) * 1000)
    return fn


def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']


def svg_path(g, fn, clip=None):
    out = []
    for poly in polygons(g):
        q = transform_geom(poly, fn)
        if not q.is_valid:
            q = q.buffer(0)
        if clip is not None:
            q = q.intersection(clip)
        for part in polygons(q):
            for ring in [part.exterior, *part.interiors]:
                pts = list(ring.coords)[:-1]
                out.append('M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pts) + ' Z')
    return ' '.join(out)


def line_path(line, fn, clip=None):
    q = transform_geom(line, fn)
    if clip is not None:
        q = q.intersection(clip)
    parts = [q] if q.geom_type == 'LineString' else list(getattr(q, 'geoms', []))
    return ' '.join('M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in p.coords) for p in parts if not p.is_empty)


VIEW = box(-20, -20, 1020, 1020)
aerials = {m['id']: aerial_fn(m['response']['extent']) for m in manifest}


def utm_list(g):
    return [[[[round(x, 2), round(y, 2)] for x, y in ring.coords] for ring in [p.exterior, *p.interiors]] for p in polygons(g)]


# ---------------------------------------------------------------- layers
SRC_SURVEY = f'APA 2025-0137 survey (page 9) traced in source pixels; provisional county-GIS display fit ({registration["rmsFitResidualMeters"]:.1f} m RMS)'
SRC_C1 = 'APA 2025-0137 C1 site plan (page 7) → survey via wetland-flag similarity → provisional county-GIS display fit'
SRC_PP = 'Practice permit PP-01 (ops/practice-permit.json), computed on provisional Lot 1'
LAYERS = [
    dict(id='lot1', label='Lot 1 · survey boundary', category='documented', kind='lot', color='#735bb5', fillOpacity=0.04, dashed=True,
         status='Documented on the survey; provisional display position', source=SRC_SURVEY, geom=lot),
    dict(id='house', label='Permit house · 14 × 40 ft (APA 2025-0137)', category='documented', kind='house', color='#e78222', fillOpacity=0.55, dashed=True,
         status='Real permit location (condition 9); provisional display position', source=SRC_SURVEY, geom=house),
    dict(id='wetland-survey', label='Survey wetland delineation · closed to Lot 1', category='documented', kind='wetland', color='#387f83', fillOpacity=0.5, dashed=False,
         status='Flag line documented; polygon closure is ours (stream + Lot 1 lines)', source=SRC_SURVEY, geom=wetland),
    dict(id='clearing-real', label='Limits of clearing · real permit', category='documented', kind='clearing', color='#a5c94a', fillOpacity=0.32, dashed=False,
         status='Documented dotted line (condition 15); closed at the driveway ends on Lot 1 lines', source=SRC_SURVEY, geom=clearing),
    dict(id='accessory', label='Existing accessory buildings · 2 × 12 × 20 ft', category='documented', kind='accessory', color='#6b5a4a', fillOpacity=0.6, dashed=False,
         status='Recorded existing on the survey and permit; current condition unverified', source=SRC_SURVEY, geom=accessory),
    dict(id='septic-fill-real', label='Septic fill area · ±32 × 56 ft (C1)', category='documented', kind='septic', color='#d08c00', fillOpacity=0.18, dashed=True,
         status='Proposed on C1 (1 bedroom); not installed / verified', source=SRC_C1, geom=fill),
    dict(id='septic-field-real', label='Absorption trenches · 25 ft + 30 ft (C1)', category='documented', kind='septic', color='#d08c00', fillOpacity=0.6, dashed=False,
         status='Proposed on C1; not installed / verified', source=SRC_C1, geom=field),
    dict(id='septic-tank-real', label='Septic tank · 1,000 gal (C1)', category='documented', kind='septic', color='#9a6200', fillOpacity=0.8, dashed=False,
         status='Proposed on C1; not installed / verified', source=SRC_C1, geom=tank, point=tank.centroid),
    dict(id='well-real', label='Proposed well (C1)', category='documented', kind='well', color='#1f78c8', fillOpacity=0.85, dashed=False,
         status='Proposed on C1; symbol enlarged to 1.5 m radius for display', source=SRC_C1, geom=well, point=well_point),
    dict(id='apa-wetlands', label='APA mapped wetlands (inventory)', category='mapped', kind='wetland', color='#2f8f6f', fillOpacity=0.22, dashed=True,
         status='Regional GIS inventory, clipped to the terrain study extent; not a field delineation', source='sources/dannemora/terrain/apa-wetland-areas.geojson', geom=apa_wet),
    dict(id='nwi-wetlands', label='NWI wetlands & streams (inventory)', category='mapped', kind='wetland', color='#4f9fbf', fillOpacity=0.18, dashed=True,
         status='USFWS NWI, clipped to the terrain study extent; lacustrine Chazy Lake omitted; not a field delineation', source='sources/dannemora/terrain/nwi-wetlands.geojson', geom=nwi_wet),
    dict(id='pp-setback-road', label='Practice · 50 ft road frontage setback', category='practice', kind='setback', color='#d63b3b', fillOpacity=0.16, dashed=True,
         status='Practice PP-01 rule; Garmish Street and Chazy Lake Road edges', source=SRC_PP, geom=road_setback),
    dict(id='pp-setback-side', label='Practice · 25 ft side / rear setback', category='practice', kind='setback', color='#e06b6b', fillOpacity=0.12, dashed=True,
         status='Practice PP-01 rule; all non-road Lot 1 edges', source=SRC_PP, geom=side_setback),
    dict(id='pp-wetland-buffer', label='Practice · 100 ft wetland setback', category='practice', kind='wetland-buffer', color='#7cc4bd', fillOpacity=0.22, dashed=True,
         status='Practice PP-01 rule; from the closed survey wetland polygon and full flag line, clipped to Lot 1', source=SRC_PP, geom=wetland_buffer),
    dict(id='pp-septic-reserve', label='Practice · 4-bedroom septic reserve', category='practice', kind='septic', color='#f0a020', fillOpacity=0.28, dashed=True,
         status=f'Practice sizing assumption: {reserve_w} × {reserve_l} ft fill footprint over the C1 test location', source=SRC_PP, geom=septic_reserve),
    dict(id='pp-well-radius', label='Practice · 100 ft well radius', category='practice', kind='well-radius', color='#3d8fe0', fillOpacity=0.1, dashed=True,
         status='Practice PP-01 rule around the C1 proposed well, clipped to Lot 1', source=SRC_PP, geom=well_radius, point=well_point),
    dict(id='pp-buildable', label='Practice · buildable region', category='practice', kind='buildable', color='#1fbf4a', fillOpacity=0.3, dashed=True,
         status='Lot 1 minus practice setbacks, wetland + buffer, septic reserve and well radius', source=SRC_PP, geom=buildable),
]
LINES = [
    dict(id='wetland-flag-line', label='Survey wetland flag line d1–d17', kind='wetland-flag-line', color='#256a70', geom=flag_line),
    dict(id='stream', label='Stream (survey)', kind='stream', color='#3c7fb0', geom=stream_line),
]


def layer_out(L):
    g = L['geom']
    out = {k: L[k] for k in ['id', 'label', 'category', 'kind', 'color', 'fillOpacity', 'dashed', 'status', 'source']}
    out.update(areaM2=round(g.area, 1), areaAcres=round(g.area / ACRE, 4), utm=utm_list(g))
    if L.get('point') is not None:
        out['point'] = [round(L['point'].x, 2), round(L['point'].y, 2)]
    out['terrain'] = svg_path(g, terrain_xy)
    out['aerial'] = {k: svg_path(g, fn, VIEW) for k, fn in aerials.items()}
    return out


layers = [layer_out(L) for L in LAYERS]
lines = [{'id': L['id'], 'label': L['label'], 'kind': L['kind'], 'color': L['color'],
          'utm': [[round(x, 2), round(y, 2)] for x, y in L['geom'].coords],
          'terrain': line_path(L['geom'], terrain_xy), 'aerial': {k: line_path(L['geom'], fn, VIEW) for k, fn in aerials.items()}}
         for L in LINES]
area = {L['id']: L['geom'].area for L in LAYERS}

# ---------------------------------------------------------------- checks
footprint_tests = {f'{w}x{l}ft': fits(buildable, w, l) for w, l in [(40, 40), (32, 50), (28, 57)]}
cap_m2 = limit['clearing'] * ACRE
checks = {
    'lotAreaM2': round(lot.area, 1), 'lotAreaAcres': round(lot.area / ACRE, 3),
    'lotAreaDocumentedAcres': practice['site']['lotAreaAcres'],
    'realClearingM2': round(clearing.area, 1), 'realClearingAcres': round(clearing.area / ACRE, 3),
    'practiceClearingCapAcres': limit['clearing'], 'realClearingShareOfCap': round(clearing.area / cap_m2, 3),
    'buildableM2': round(buildable.area, 1), 'buildableAcres': round(buildable.area / ACRE, 4), 'buildableSqFt': round(buildable.area / FT ** 2),
    'buildableParts': len(polygons(buildable)),
    'footprintFits': footprint_tests,
    'permitHouseInsideLot': lot.contains(house),
    'permitHouseInsideClearing': clearing.buffer(0.5).contains(house),
    'permitHouseInPracticeBuildable': buildable.contains(house),
    'wellToRealTrenchesMeters': round(well_point.distance(field), 1), 'wellToRealTrenchesFeet': round(well_point.distance(field) / FT, 1),
    'wellToPracticeFieldFeet': round(well_point.distance(practice_field) / FT, 1),
    'wellToPracticeReserveFeet': round(well_point.distance(septic_reserve) / FT, 1),
    'practiceFieldToStreamFeet': round(practice_field.distance(stream_line) / FT, 1),
    'practiceFieldToFlagLineFeet': round(practice_field.distance(flag_line) / FT, 1),
    'practiceReserveToStreamFeet': round(septic_reserve.distance(stream_line) / FT, 1),
    'realTrenchesToStreamFeet': round(field.distance(stream_line) / FT, 1),
    'surveyAbsorptionToStreamDimensionFeet': 110,
    'dboxToWellFeet': round(dbox_point.distance(well_point) / FT, 1),
    'buildableWithoutWellRadiusSqFt': round(lot.difference(unary_union([road_setback, side_setback, wetland, wetland_buffer, septic_reserve])).area / FT ** 2),
    'surveyStreamAtRoadToNwiR4SB3CMeters': round(stream_line.intersection(chazy_line).distance(nwi_stream), 1) if stream_line.intersects(chazy_line) else None,
    'flagOnlyWetlandBufferM2': round(flag_only_buffer.area, 1),
    'polygonWetlandBufferM2': round(wetland_buffer.area, 1),
    'c1HouseBoxVsSurveyHouse': {
        'overlapM2': round(c1_house.intersection(house).area, 1), 'c1BoxM2': round(c1_house.area, 1), 'surveyHouseM2': round(house.area, 1),
        'centroidOffsetMeters': round(c1_house.centroid.distance(house.centroid), 1),
        'note': 'C1 labels the house as a horizontal box; the survey draws a vertical 14 × 40 ft footprint. Not used as a control.'},
}

survey_field = survey_geom(SURVEY_FIELD)
field_check = {'dboxOffsetMeters': round(dbox_point.distance(Point(survey_utm(*SURVEY_DBOX))), 2),
               'trenchCentroidOffsetMeters': round(field.centroid.distance(survey_field.centroid), 2),
               'trenchesInsideSurveyFieldShare': round(field.intersection(survey_field).area / field.area, 3),
               'note': 'C1 D-box and trenches compared with the survey absorption-field circle and rectangle; not used in the fit.'}

# ---------------------------------------------------------------- outputs
OUT.mkdir(parents=True, exist_ok=True)
features = []
for L, out in zip(LAYERS, layers):
    g = transform_geom(L['geom'], to_wgs)
    props = {k: out[k] for k in ['id', 'label', 'category', 'kind', 'color', 'status', 'source', 'areaM2', 'areaAcres']}
    features.append({'type': 'Feature', 'properties': props, 'geometry': mapping(MultiPolygon(polygons(g)))})
    if L.get('point') is not None:
        p = to_wgs(L['point'].x, L['point'].y)
        features.append({'type': 'Feature', 'properties': {**props, 'id': L['id'] + '-point'}, 'geometry': {'type': 'Point', 'coordinates': list(p)}})
for L in LINES:
    features.append({'type': 'Feature', 'properties': {'id': L['id'], 'label': L['label'], 'category': 'documented', 'kind': L['kind'], 'color': L['color']},
                     'geometry': mapping(transform_geom(L['geom'], to_wgs))})
(OUT / 'site-constraints.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'name': 'Dannemora Lot 1 site constraints', 'revision': REVISION,
                                                          'note': 'Display and practice geometry on a provisional county-GIS fit; not surveyed.', 'features': features}, indent=1))

limitations = [
    'Every documented polygon is a manual trace of a reduced permit drawing carried through the provisional county-GIS display fit (RMS 3.1 m, max 7.6 m against county tax GIS, not survey control). Treat positions as ±several metres.',
    'The survey wetland polygon closes the flag line along the stream and Lot 1 lines; the survey shows no flags south-east of the stream, so the true wetland extent there is unknown.',
    'Clearing limits are closed across the driveway mouths on the Lot 1 lines; the dotted line is faint and partly hidden by labels.',
    'C1 is fitted to the survey on twelve shared wetland flags only; flags and drawings are both reduced previews. The C1 house box does not match the survey house and was not used.',
    'Mapped APA / NWI wetlands are regional inventories, not field delineations; map absence does not establish dry land.',
    'Practice PP-01 setbacks, buffers, septic reserve and buildable region are fictional learning geometry. They are not a regulatory determination, an engineered septic design or a buildable-area claim for the real permit.',
    'Practice geometry is computed on provisional display traces, an exception to the rule against feeding traces to setback calculations; it must not inform real construction, earthwork or terrain statistics.',
    'Areas are EPSG:26918 grid areas (within 0.1% of ground area here).',
]
register = {
    'revision': REVISION, 'updated': UPDATED, 'crs': 'EPSG:26918 NAD83 / UTM 18N metres',
    'script': 'scripts/prepare-site-constraints.py',
    'sources': {'survey': SURVEY, 'c1': C1, 'permit': PERMIT, 'registration': 'sources/dannemora/permit-aerial-registration.json',
                'lot1': 'sources/dannemora/permit-layout-provisional.geojson', 'practicePermit': 'ops/practice-permit.json'},
    'surveyToUtm': {'parameters': registration['parameters'], 'model': 'E = a*x + b*y + tx, N = b*x - a*y + ty',
                    'metersPerPixel': round(SURVEY_M_PER_PX, 5), 'rmsFitResidualMeters': registration['rmsFitResidualMeters'],
                    'maxFitResidualMeters': registration['maxFitResidualMeters'], 'leaveOneOutRmsMeters': registration['leaveOneOutRmsMeters'],
                    'note': 'Existing provisional fit (scripts/align-permit-aerial.py); unchanged here.'},
    'c1ToSurvey': {
        'model': 'X = s·cosθ·x − s·sinθ·y + tx, Y = s·sinθ·x + s·cosθ·y + ty (image rows down in both)',
        'parameters': [float(v) for v in c1p], 'scale': round(C1_SCALE, 5), 'rotationDeg': round(math.degrees(math.atan2(c1p[1], c1p[0])), 2),
        'c1MetersPerPixel': round(C1_M_PER_PX, 5), 'c1PixelsPerFoot': round(ppf, 3),
        'rmsResidualSurveyPx': round(float(np.sqrt(np.mean(c1_err ** 2))), 2), 'maxResidualSurveyPx': round(float(c1_err.max()), 2),
        'rmsResidualMeters': round(float(np.sqrt(np.mean(c1_err ** 2))) * SURVEY_M_PER_PX, 2), 'maxResidualMeters': round(float(c1_err.max()) * SURVEY_M_PER_PX, 2),
        'leaveOneOutRmsMeters': round(float(np.sqrt(np.mean(c1_loo ** 2))) * SURVEY_M_PER_PX, 2), 'leaveOneOutMaxMeters': round(float(c1_loo.max()) * SURVEY_M_PER_PX, 2),
        'controls': [{'flag': k, 'c1Pixel': list(C1_FLAGS[k]), 'surveyPixel': list(SURVEY_FLAGS[k]), 'residualSurveyPx': round(float(c1_err[i]), 2),
                      'residualMeters': round(float(c1_err[i]) * SURVEY_M_PER_PX, 2), 'leaveOneOutMeters': round(float(c1_loo[i]) * SURVEY_M_PER_PX, 2)}
                     for i, k in enumerate(names)],
        'independentCheck': {'driveway': drive_check(), 'absorptionField': field_check},
        'note': 'Residuals are relative to the survey drawing; absolute position additionally carries the provisional county-GIS fit error.'},
    'traces': {
        'surveyWetlandFlags': {k: list(v) for k, v in SURVEY_FLAGS.items()}, 'surveyStream': [list(p) for p in STREAM],
        'surveyClearingOuter': [list(p) for p in CLEARING_OUTER], 'surveyClearingInner': [list(p) for p in CLEARING_INNER],
        'surveyAccessory': [[list(p) for p in r] for r in ACCESSORY],
        'c1WetlandFlags': {k: list(v) for k, v in C1_FLAGS.items()}, 'c1Tank': [list(p) for p in C1_TANK], 'c1DBox': list(C1_DBOX),
        'c1Trenches': [[list(p) for p in r] for r in C1_TRENCHES], 'c1Fill': [list(p) for p in C1_FILL], 'c1Well': list(C1_WELL),
        'c1HouseBox': [list(p) for p in C1_HOUSE_BOX], 'practiceReserveC1Pixels': [[round(x, 1), round(y, 1)] for x, y in reserve_px]},
    'wetlandClosure': ('Survey flag line d1 → d15 (d15 lies just north of the Lot 1 north line), then outside Lot 1 to the north-east, '
                       'back along the survey stream line from beyond the Lot 1 east line to Chazy Lake Road, and closed; the ring is then '
                       'intersected with Lot 1. Inside Lot 1 the polygon is therefore bounded by the flag line (west / north), the Lot 1 north '
                       'and east lines, the stream (south-east) and a short piece of the Chazy Lake Road line between flag d1 and the stream. '
                       'Wetland labels on the survey sit between the flag line and the stream. Flags d16–d17 continue north beyond Lot 1 and are used only for the buffer.'),
    'clearingClosure': 'Dotted clearing line traced around the house, camps and septic area and along both sides of the driveway; closed across the driveway mouths on the Chazy Lake Road and Garmish Street lot lines, then intersected with Lot 1.',
    'edgeClassification': edge_records,
    'practice': {'id': practice['id'], 'status': practice['status'], 'septicBasis': sb,
                 'wetlandBufferBasis': 'Buffer of the closed survey wetland polygon plus the full flag line d1–d17 by 100 ft, clipped to Lot 1 (flag-line-only alternative reported in checks).',
                 'wellBasis': 'C1 proposed well location kept as the practice well.'},
    'areas': {L['id']: {'m2': round(area[L['id']], 1), 'acres': round(area[L['id']] / ACRE, 4), 'sqft': round(area[L['id']] / FT ** 2)} for L in LAYERS},
    'checks': checks, 'limitations': limitations,
}
(OUT / 'constraints-register.json').write_text(json.dumps(register, indent=2, ensure_ascii=False))

practice_out = {k: practice[k] for k in ['id', 'title', 'revision', 'updated', 'status', 'approvedBy', 'realPermit', 'site', 'household', 'program',
                                         'limits', 'comparison', 'retainedConditions', 'septicBasis', 'assumptions', 'toVerify']}
practice_out['results'] = {'buildableAcres': checks['buildableAcres'], 'buildableSqFt': checks['buildableSqFt'], 'realClearingAcres': checks['realClearingAcres'],
                           'footprintFits': footprint_tests, 'wellToPracticeFieldFeet': checks['wellToPracticeFieldFeet'],
                           'practiceFieldToStreamFeet': checks['practiceFieldToStreamFeet']}
data = {'revision': REVISION, 'updated': UPDATED, 'crs': 'EPSG:26918', 'practicePermit': practice_out, 'layers': layers, 'lines': lines,
        'edges': [{k: r[k] for k in ['name', 'class', 'evidence', 'lengthFeet', 'utm']} for r in edge_records],
        'fits': {'surveyToUtmRmsMeters': round(registration['rmsFitResidualMeters'], 1), 'c1ToSurveyRmsMeters': register['c1ToSurvey']['rmsResidualMeters'],
                 'c1ToSurveyMaxMeters': register['c1ToSurvey']['maxResidualMeters'], 'register': 'sources/dannemora/constraints/constraints-register.json'},
        'checks': checks, 'limitations': limitations,
        'coordinates': 'utm: EPSG:26918 metres, polygons → rings → [E,N]; terrain: SVG 1000×1000 over terrain-grid bounds; aerial: SVG 1000×1000 per imagery extent (Web Mercator).'}
(ROOT / 'site-constraints-data.js').write_text("'use strict';\nconst SITE_CONSTRAINTS = " + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

# Readable practice permit.
P = practice
md = [f"# {P['title']}", '', f"> **{P['status']}.** Generated from `ops/practice-permit.json` by `scripts/prepare-site-constraints.py`; do not edit by hand.", '',
      f"Revision {P['revision']} · updated {P['updated']} · {P['approvedBy']}", '',
      f"Real permit: **{P['realPermit']['id']}** (issued {P['realPermit']['issued']}). {P['realPermit']['note']}", '',
      '## Household & program', '', f"- {P['household']['summary']}",
      f"- ~{P['program']['grossFloorAreaSqFt']:,} sq ft gross over {P['program']['storeys']} storeys: " + ', '.join(P['program']['rooms']) + '.',
      f"- Location: {P['program']['location']}.", f"- {P['program']['garage']}.", '', '## Limits', '', '| Limit | Value | Rule |', '| --- | --- | --- |']
md += [f"| {x['label']} | {x['value']:,} {x['unit']} | {x['rule']} |" for x in P['limits']]
md += ['', '## Real permit vs practice', '', '| Item | APA 2025-0137 (real) | PP-01 (practice) |', '| --- | --- | --- |']
md += [f"| {r['item']} | {r['real']} | {r['practice']} |" for r in P['comparison']]
md += ['', '## Kept from the real permit', ''] + [f"- Condition {c['condition']}: {c['text']}" for c in P['retainedConditions']]
md += ['', '## Septic basis (practice assumption)', '', f"_{sb['status']}._", '',
       f"- {sb['bedrooms']} bedrooms × {sb['designFlowGpdPerBedroom']} gpd = {sb['designFlowGpd']} gpd; perc {sb['percolationMinPerInch']} min/in → {sb['applicationRateGpdPerSqFt']} gpd/sq ft.",
       f"- Trench bottom ≈ {sb['trenchBottomAreaSqFt']} sq ft → ≈ {sb['trenchLengthFt']} ft of {sb['trenchWidthFt']} ft trench; {sb['layout']}.",
       f"- Reserve / fill footprint {sb['reserveFootprintFt'][0]} × {sb['reserveFootprintFt'][1]} ft ({sb['fillMarginFt']} ft fill margin). {sb['replacement']}.",
       f"- Tank {sb['tankGallons']:,} gal. {sb['placement']}", f"- Soil: {sb['soil']}"]
md += ['', '## Constraint results (practice geometry on provisional traces)', '', '| Layer | Category | Area (m²) | Area (acres) |', '| --- | --- | ---: | ---: |']
md += [f"| {L['label']} | {L['category']} | {L['areaM2']:,.0f} | {L['areaAcres']:.3f} |" for L in layers]
fit_text = ', '.join(f"{k}: {'fits' if v else 'does not fit'}" for k, v in footprint_tests.items())
md += ['', f"- Lot 1 (provisional trace): {checks['lotAreaAcres']} ac vs {checks['lotAreaDocumentedAcres']} ac documented.",
       f"- Real clearing limits: {checks['realClearingAcres']} ac = {checks['realClearingShareOfCap'] * 100:.0f}% of the 0.75 ac practice cap.",
       f"- Practice buildable region: {checks['buildableSqFt']:,} sq ft ({checks['buildableAcres']} ac) in {checks['buildableParts']} part(s). 1,600 sq ft footprint tests: {fit_text}.",
       f"- Well → practice absorption field {checks['wellToPracticeFieldFeet']} ft; practice field → stream {checks['practiceFieldToStreamFeet']} ft; → flag line {checks['practiceFieldToFlagLineFeet']} ft.",
       f"- Real permit house inside practice buildable region: {'yes' if checks['permitHouseInPracticeBuildable'] else 'no'}."]
md += ['', '## Assumptions', ''] + [f"- {x}" for x in P['assumptions']]
md += ['', '## To verify', ''] + [f"- {x}" for x in P['toVerify']]
md += ['', '## Limitations', ''] + [f"- {x}" for x in limitations]
md += ['', 'Geometry: `sources/dannemora/constraints/site-constraints.geojson` · method and residuals: `sources/dannemora/constraints/constraints-register.json`.', '']
(ROOT / 'ops/practice-permit.md').write_text('\n'.join(md))

print(json.dumps({'c1Fit': {k: register['c1ToSurvey'][k] for k in ['scale', 'rotationDeg', 'rmsResidualMeters', 'maxResidualMeters', 'leaveOneOutRmsMeters', 'leaveOneOutMaxMeters']},
                  'driveway': register['c1ToSurvey']['independentCheck']['driveway'],
                  'areas': {k: v['sqft'] for k, v in register['areas'].items()}, 'checks': checks}, indent=1, ensure_ascii=False))
