"""Climate, sun, wind, comfort and screening hazards for Hydepark Home (Lot 25, 5418–5420 S. Kimbark Ave, Chicago).

Reuses the Dannemora pipeline in scripts/prepare-climate.py (imported, not copied) and writes
hydepark-climate-data.js (SITE_HYDEPARK_CLIMATE, same schema as SITE_CLIMATE), the generated
ops/hydepark-climate-findings.md and sources/hydepark/climate/climate-reference.json.

    .venv/bin/python scripts/prepare-hydepark-climate.py            # rebuild from archived inputs
    .venv/bin/python scripts/prepare-hydepark-climate.py --acquire  # first re-fetch weather files + screening data

Network access happens only with --acquire. Everything else is deterministic.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import re
import sys
import tempfile
import time
import urllib.parse
from importlib import metadata
from pathlib import Path

import numpy as np
from pyproj import Geod, Transformer
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('prepare_climate', ROOT / 'scripts/prepare-climate.py')
pc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pc)

from ladybug.epw import EPW
from ladybug.ddy import DDY
from ladybug.sunpath import Sunpath
from ladybug.wea import Wea

r, now_iso, http_get = pc.r, pc.now_iso, pc.http_get
HP = ROOT / 'sources/hydepark/climate'
RAW = HP / 'raw'
ACQ_FILE = HP / 'acquisition.json'
FINDINGS = ROOT / 'ops/hydepark-climate-findings.json'
OUT_JS = ROOT / 'hydepark-climate-data.js'
OUT_MD = ROOT / 'ops/hydepark-climate-findings.md'
PARCELS = ROOT / 'sources/hydepark/county-parcels.geojson'
LOT_PINS = ('20114200250000', '20114200260000')  # 5418 + 5420 = all of Lot 25
SITE = {'lat': 41.79739, 'lon': -87.59543}
TIME_ZONE = -6
ONEBUILDING = ('https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/'
               'USA_United_States_of_America/IL_Illinois/')
STATIONS = [
    {'id': 'midway', 'name': 'Midway – Chicago Midway International Airport', 'wmo': '725340',
     'file': 'USA_IL_Chicago.Midway.Intl.AP.725340_TMYx.2011-2025.zip'},
    {'id': 'ohare', 'name': "O'Hare – Chicago O'Hare International Airport", 'wmo': '725300',
     'file': 'USA_IL_Chicago.OHare.Intl.AP.725300_TMYx.2011-2025.zip'},
    {'id': 'northerly-island', 'name': 'Northerly Island – Chicago lakefront (former Meigs Field)', 'wmo': '725346',
     'file': 'USA_IL_Chicago-Meigs.Field-Northerly.Island.725346_TMYx.2011-2025.zip'},
]
# Lakefront file with a full ASHRAE header; only its design conditions are used (lakefront cooling cross-check).
DESIGN_ONLY = [{'id': 'calumet', 'name': 'Calumet Harbor – Coast Guard station, south lakefront', 'wmo': '725344',
                'file': 'USA_IL_Chicago-CGS.Calumet.725344_TMYx.2011-2025.zip'}]
PRIMARY = 'midway'
LAKEFRONT = 'northerly-island'
ONSHORE = (22.5, 157.5)  # wind FROM NNE…SSE crosses Lake Michigan before reaching Hyde Park
NEIGHBOUR_HEIGHTS = [7.0, 10.0, 13.0]  # m above our grade: ~2 storey eave, ~3 storey, 3 storey + parapet
NEIGHBOUR_GAPS = [1.5, 3.0, 6.0, 12.0]  # m between the neighbour's north wall and our south wall
SILL = 1.0  # m above grade: ground-floor window sill used for the sun-hours count
SUN_WINDOW = 60  # count sun only within ±60° of the wall normal (useful, not grazing, on south glass)
FEMA = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer'
EPQS = 'https://epqs.nationalmap.gov/v1/json'
CHI311 = 'https://data.cityofchicago.org/resource/v6vf-nfxy.json'
UPCODES = 'https://up.codes/viewer/chicago/chi-building-code-2019/chapter/'
CODE_PAGES = [
    ('chicago-bc-2019-ch16', UPCODES + '16/structural-design', 'Chicago Building Code 2019, Ch. 16 Structural Design (UpCodes copy)',
     {'groundSnowLoad25psf': '25 pounds per square foot (1.20 kN/m', 'windRiskII107mph': '107 mph (48 m/s)'}),
    ('chicago-bc-2019-ch18', UPCODES + '18/soils-and-foundations', 'Chicago Building Code 2019, Ch. 18 Soils and Foundations (UpCodes copy)',
     {'frost42in': '42 inches (1067 mm) below final grade'}),
]


# --------------------------------------------------------------------------- site
def site_point(acq):
    gj = json.loads(PARCELS.read_text())
    feats = [f for f in gj['features'] if f['properties'].get('PIN14') in LOT_PINS]
    assert len(feats) == 2, 'Lot 25 parcels not found in county-parcels.geojson'
    to_utm = Transformer.from_crs(4326, 26916, always_xy=True)
    to_ll = Transformer.from_crs(26916, 4326, always_xy=True)
    utm = unary_union([shape({'type': 'Polygon', 'coordinates': [[to_utm.transform(*p) for p in f['geometry']['coordinates'][0]]]})
                       for f in feats])
    rect = [to_ll.transform(*p) for p in utm.minimum_rotated_rectangle.exterior.coords]
    geod = Geod(ellps='WGS84')
    edges = sorted((geod.inv(a[0], a[1], b[0], b[1])[2], geod.inv(a[0], a[1], b[0], b[1])[0] % 180)
                   for a, b in zip(rect[:-1], rect[1:]))
    long_axis = edges[-1][1]
    clon, clat = to_ll.transform(utm.centroid.x, utm.centroid.y)
    elev = (acq or {}).get('records', {}).get('usgs-epqs-elevation', {}).get('valueM')
    return {
        'lat': SITE['lat'], 'lon': SITE['lon'], 'elevation': r(elev, 1) if elev is not None else None,
        'lot': {'longAxisBearingDeg': r(long_axis, 1), 'sideLotLineFacesDeg': [r((long_axis + 90) % 360, 1), r((long_axis + 270) % 360, 1)],
                'lengthM': r(edges[-1][0], 1), 'widthM': r(edges[0][0], 1), 'gisCentroid': [r(clon, 6), r(clat, 6)],
                'areaM2': r(utm.area, 0),
                'status': ('Cook County GIS parcel outlines for PINs 20-11-420-025 and -026 (approximate, not survey); the plats give '
                           '40 × 175 ft (12.2 × 53.3 m). Street (S. Kimbark Ave) on the east, 24 ft public alley on the west.')},
    }


# ------------------------------------------------------------------ station files
def design_header(epw_path):
    line2 = epw_path.read_text(errors='replace').splitlines()[1]
    if line2.split(',')[1].strip() == '0':
        return None
    return pc.parse_design_header(epw_path)


def day_arrays(epw):
    T = np.roll(np.array(epw.dry_bulb_temperature.values, float), -1).reshape(365, 24)
    return T.max(1), T.min(1)


def heat_stats(epw):
    dmax, dmin = day_arrays(epw)
    hot = dmax >= 32.2
    run = best = 0
    for v in hot:
        run = run + 1 if v else 0
        best = max(best, run)
    return {'daysMaxAtLeast32_2C': int(hot.sum()), 'daysMaxAtLeast35C': int((dmax >= 35).sum()),
            'longestRunMaxAtLeast32_2C': int(best), 'nightsMinAtLeast20C': int((dmin >= 20).sum()),
            'nightsMinAtLeast23_9C': int((dmin >= 23.9).sum()),
            'note': '32.2 °C = 90 °F, 35 °C = 95 °F, 23.9 °C = 75 °F; daily max/min from hourly EPW values of the typical year.'}


def lake_stats(epw):
    ws = np.array(epw.wind_speed.values, float)
    wd = np.array(epw.wind_direction.values, float)
    T = np.array(epw.dry_bulb_temperature.values, float)
    dts = epw.dry_bulb_temperature.datetimes
    m = np.array([d.month for d in dts])
    h = np.array([d.hour for d in dts])
    onshore = (ws >= 0.5) & (wd >= ONSHORE[0]) & (wd <= ONSHORE[1])
    out = {}
    for key, months in (('MAM', [3, 4, 5]), ('JJA', [6, 7, 8])):
        aft = np.isin(m, months) & (h >= 12) & (h <= 18)
        out[key] = {'afternoonHours': int(aft.sum()), 'onshorePct': r(100 * onshore[aft].mean(), 0),
                    'meanTOnshore': r(T[aft & onshore].mean(), 1), 'meanTOther': r(T[aft & ~onshore].mean(), 1)}
    return out


# --------------------------------------------------------------- neighbour sun
def neighbour_shading(sun, lot):
    """Worst-case geometry: an infinitely long wall of height H, parallel to the side lot line, gap d to the south."""
    normal = lot['sideLotLineFacesDeg'][0] if abs(lot['sideLotLineFacesDeg'][0] - 180) < 90 else lot['sideLotLineFacesDeg'][1]
    dates = []
    for kd in sun['keyDates']:
        pts = [(h, alt, az) for h, alt, az in kd['positions'] if alt > 0 and math.cos(math.radians(az - normal)) >= math.cos(math.radians(SUN_WINDOW))]
        noon = max(kd['positions'], key=lambda p: p[1])
        rows = []
        for H in NEIGHBOUR_HEIGHTS:
            for d in NEIGHBOUR_GAPS:
                # profile angle of the sun in the plane perpendicular to the wall
                lit = [p for p in pts if (H - SILL) <= d * math.tan(math.radians(p[1])) / math.cos(math.radians(p[2] - normal))]
                rows.append({'heightM': H, 'gapM': d,
                             'noonShadeHeightOnOurWallM': r(max(0.0, H - d * math.tan(math.radians(noon[1]))), 1),
                             'sunHoursAtSill': r(len(lit) * 0.25, 2),
                             'firstLit': pc.hours_to_hhmm(lit[0][0]) if lit else None,
                             'lastLit': pc.hours_to_hhmm(lit[-1][0]) if lit else None})
        dates.append({'label': kd['label'], 'date': kd['date'], 'noonAltitudeDeg': r(noon[1], 1),
                      'noonShadowPerMetre': r(1 / math.tan(math.radians(noon[1])), 2),
                      'clearGapForSillAtNoonM': {str(H): r((H - SILL) / math.tan(math.radians(noon[1])), 1) for H in NEIGHBOUR_HEIGHTS},
                      'rows': rows})
    return {'wallNormalDeg': r(normal, 1), 'sillHeightM': SILL, 'heightsM': NEIGHBOUR_HEIGHTS, 'gapsM': NEIGHBOUR_GAPS,
            'dates': dates,
            'method': ('Geometry only, not the 3D model: a neighbour wall of height H (m above our grade) runs the full length of our '
                       'south lot line at gap d. "Noon shade height" is how far up our south wall its shadow reaches at solar noon; '
                       f'"sun hours at sill" counts 15-minute key-date sun positions that clear the wall top for a point {SILL:g} m above '
                       'grade on our south wall (profile angle; only sun within ±' + f'{SUN_WINDOW}° of the wall normal, so grazing sun is ignored). An infinite wall is the worst case: real '
                       'buildings are shorter, so low morning and afternoon sun also slips past their ends. Heights are hypothetical '
                       'test values, not measurements of the neighbouring building.')}


# --------------------------------------------------------------------- acquire
def get_json(url, tries=4, timeout=60):
    last = None
    for k in range(tries):
        st, ct, body = http_get(url, timeout=timeout)
        if st == 200:
            try:
                return st, json.loads(body), body
            except Exception as exc:
                last = (st, f'not JSON: {exc!r}', body)
        else:
            last = (st, body[:300].decode(errors='replace') if body else 'no body', body)
        time.sleep(2 * (k + 1))
    return last


def save_raw(name, body):
    (RAW / name).write_bytes(body)
    return {'file': f'raw/{name}', 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}


def acquire():
    RAW.mkdir(parents=True, exist_ok=True)
    recs = {}
    for meta in STATIONS + DESIGN_ONLY:
        url = ONEBUILDING + meta['file']
        st, ct, body = http_get(url, binary=True, timeout=120)
        rec = {'id': f"tmyx-{meta['id']}", 'label': f"{meta['name']} TMYx 2011–2025 (climate.onebuilding.org)", 'url': url,
               'retrievedAt': now_iso(), 'httpStatus': st}
        if st == 200 and body[:2] == b'PK':
            rec.update(save_raw(meta['file'], body))
        else:
            rec['error'] = 'download failed'
        recs[rec['id']] = rec
    pt = f"{SITE['lon']},{SITE['lat']}"
    q = lambda layer, extra: f'{FEMA}/{layer}/query?' + urllib.parse.urlencode(dict({
        'geometry': pt, 'geometryType': 'esriGeometryPoint', 'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects',
        'returnGeometry': 'false', 'f': 'json'}, **extra))
    for rid, label, url, fname in (
            ('fema-nfhl-zone', 'FEMA NFHL Flood Hazard Zones (layer 28) at the site point',
             q(28, {'outFields': 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,V_DATUM,DFIRM_ID,STUDY_TYP,SOURCE_CIT'}), 'fema-nfhl-zone.json'),
            ('fema-nfhl-panel', 'FEMA NFHL FIRM Panels (layer 3) at the site point',
             q(3, {'outFields': 'FIRM_PAN,PANEL_TYP,EFF_DATE,PNP_REASON,DFIRM_ID'}), 'fema-nfhl-panel.json'),
            ('fema-nfhl-sfha-2500m', 'FEMA NFHL Special Flood Hazard Areas within 2.5 km (geometry, for distance)',
             q(28, {'where': "SFHA_TF='T'", 'distance': 2500, 'units': 'esriSRUnit_Meter', 'outSR': 4326, 'returnGeometry': 'true',
                    'outFields': 'FLD_ZONE,STATIC_BFE,V_DATUM,LEN_UNIT', 'geometryPrecision': 6}), 'fema-nfhl-sfha-2500m.json')):
        res = get_json(url)
        rec = {'id': rid, 'label': label, 'url': url, 'retrievedAt': now_iso(), 'httpStatus': res[0],
               'access': 'public ArcGIS REST; no key or account'}
        if res[0] == 200 and isinstance(res[1], dict) and 'features' in res[1]:
            rec.update(save_raw(fname, res[2]))
        else:
            rec['error'] = res[1] if isinstance(res[1], str) else json.dumps(res[1])[:300]
        recs[rid] = rec
    url = EPQS + '?' + urllib.parse.urlencode({'x': SITE['lon'], 'y': SITE['lat'], 'units': 'Meters', 'wkid': 4326, 'includeDate': 'true'})
    res = get_json(url)
    rec = {'id': 'usgs-epqs-elevation', 'label': 'USGS 3DEP Elevation Point Query Service at the site point', 'url': url,
           'retrievedAt': now_iso(), 'httpStatus': res[0], 'verticalDatum': 'NAVD88 metres (3DEP)'}
    if res[0] == 200 and isinstance(res[1], dict):
        rec.update(valueM=float(res[1]['value']), resolutionM=res[1].get('resolution'),
                   acquisitionDate=(res[1].get('attributes') or {}).get('AcquisitionDate'))
    else:
        rec['error'] = str(res[1])[:300]
    recs[rec['id']] = rec
    sr = "sr_type='Water in Basement Complaint'"
    for rid, label, where in (
            ('chi311-basement-250m', 'Chicago 311 "Water in Basement Complaint" requests within 250 m', f'within_circle(location,{SITE["lat"]},{SITE["lon"]},250) AND {sr}'),
            ('chi311-basement-500m', 'Chicago 311 "Water in Basement Complaint" requests within 500 m', f'within_circle(location,{SITE["lat"]},{SITE["lon"]},500) AND {sr}'),
            ('chi311-basement-city', 'Chicago 311 "Water in Basement Complaint" requests, whole city', sr)):
        url = CHI311 + '?' + urllib.parse.urlencode({'$select': 'count(*) as n, min(created_date) as first, max(created_date) as last', '$where': where})
        res = get_json(url)
        rec = {'id': rid, 'label': label, 'url': url, 'retrievedAt': now_iso(), 'httpStatus': res[0],
               'dataset': 'City of Chicago Data Portal, 311 Service Requests (v6vf-nfxy)', 'access': 'public Socrata API; no key'}
        if res[0] == 200 and isinstance(res[1], list) and res[1]:
            row = res[1][0]
            rec.update(count=int(row['n']), first=row.get('first'), last=row.get('last'))
        else:
            rec['error'] = str(res[1])[:300]
        recs[rid] = rec
    for rid, url, label, needles in CODE_PAGES:
        st, ct, body = http_get(url, timeout=90)
        rec = {'id': rid, 'label': label, 'url': url, 'retrievedAt': now_iso(), 'httpStatus': st,
               'note': 'Third-party (UpCodes) copy of the 2019 Chicago Building Code; the official text is on the City site, which refused automated requests.'}
        if st == 200:
            rec.update(save_raw(f'{rid}.html', body))
            txt = body.decode(errors='replace')
            rec['verified'] = {k: (n in txt) for k, n in needles.items()}
        else:
            rec['error'] = body[:300].decode(errors='replace') if body else 'no body'
        recs[rid] = rec
    url = 'https://mwrd.org/what-we-do/tunnel-and-reservoir-plan-tarp'
    st, ct, body = http_get(url, timeout=60)
    rec = {'id': 'mwrd-tarp', 'label': 'MWRD Tunnel and Reservoir Plan (combined-sewer context)', 'url': url,
           'retrievedAt': now_iso(), 'httpStatus': st}
    if st == 200:
        rec.update(save_raw('mwrd-tarp.html', body))
        rec['verified'] = {'combinedSewer': 'Most of Chicago has a combined sewer system' in body.decode(errors='replace')}
    else:
        rec['error'] = 'download failed'
    recs['mwrd-tarp'] = rec
    recs['chicago-gov-structural-deck'] = {
        'id': 'chicago-gov-structural-deck', 'label': 'Chicago DOB 2019 code training deck, Ch. 16 (official City host)',
        'url': 'https://www.chicago.gov/content/dam/city/depts/bldgs/general/Self_Cert_Program/2019/16A-STRUCTURAL.pdf',
        'retrievedAt': now_iso(), 'httpStatus': 403, 'error': 'Access Denied (CDN bot block); not retried by other means.'}
    recs['asce7-hazard-tool'] = {'id': 'asce7-hazard-tool', 'label': 'ASCE 7 Hazard Tool (ground snow load, wind speed)',
                                 'url': 'https://ascehazardtool.org/', 'status': 'not queried',
                                 'error': 'Requires a registered ASCE account; this project does not create accounts.'}
    ACQ_FILE.write_text(json.dumps({'retrievedAt': now_iso(), 'site': SITE,
                                    'limits': 'Screening-level public data sampled at one point; not a flood determination, survey, code review or insurance rating.',
                                    'records': recs}, indent=2, ensure_ascii=False) + '\n')
    print(f'Acquired {len(recs)} records -> {ACQ_FILE.relative_to(ROOT)}')


def load_acq():
    return json.loads(ACQ_FILE.read_text()) if ACQ_FILE.exists() else None


# --------------------------------------------------------------------- hazards
def sfha_distance(rec):
    if not rec or not rec.get('file'):
        return None
    data = json.loads((HP / rec['file']).read_text())
    to_utm = Transformer.from_crs(4326, 26916, always_xy=True)
    from shapely.geometry import Point, Polygon
    p = Point(*to_utm.transform(SITE['lon'], SITE['lat']))
    best = None
    for f in data.get('features', []):
        rings = f['geometry']['rings']
        poly = Polygon([to_utm.transform(*c) for c in rings[0]], [[to_utm.transform(*c) for c in h] for h in rings[1:]])
        d = poly.distance(p)
        if best is None or d < best[0]:
            best = (d, f['attributes'])
    zones = sorted({(f['attributes']['FLD_ZONE'], f['attributes'].get('STATIC_BFE')) for f in data.get('features', [])},
                   key=lambda z: (z[0], z[1] or 0))
    return {'nearestM': r(best[0], 0), 'nearestZone': best[1]['FLD_ZONE'], 'nearestBfe': best[1].get('STATIC_BFE'),
            'vDatum': best[1].get('V_DATUM'), 'lenUnit': best[1].get('LEN_UNIT'),
            'zonesWithin2500m': [f'{z}{" BFE " + format(b, "g") if b and b > 0 else ""}' for z, b in zones]} if best else None


def hazards_summary(site, acq, prim):
    if not acq:
        return {'status': 'not acquired', 'note': 'Run with --acquire to fetch screening data.'}
    recs = acq['records']
    zone_rec, panel_rec = recs.get('fema-nfhl-zone', {}), recs.get('fema-nfhl-panel', {})
    zone = panel = None
    if zone_rec.get('file'):
        fs = json.loads((HP / zone_rec['file']).read_text()).get('features', [])
        zone = fs[0]['attributes'] if fs else None
    if panel_rec.get('file'):
        fs = json.loads((HP / panel_rec['file']).read_text()).get('features', [])
        panel = fs[0]['attributes'] if fs else None
    sfha = sfha_distance(recs.get('fema-nfhl-sfha-2500m'))
    eff = None
    if panel and panel.get('EFF_DATE'):
        import datetime as dt
        eff = dt.datetime.fromtimestamp(panel['EFF_DATE'] / 1000, dt.timezone.utc).strftime('%Y-%m-%d')
    elev = site['elevation']
    screening = []
    if zone:
        detail = (f"FIRM panel {panel['FIRM_PAN']} ({panel['PANEL_TYP'].lower()}; {(panel.get('PNP_REASON') or 'printed').lower()}), effective {eff}. " if panel else '')
        if sfha:
            bfe_ft = sfha['nearestBfe']
            detail += (f"Nearest Special Flood Hazard Area: Zone {sfha['nearestZone']} on the Lake Michigan shore, "
                       f"{sfha['nearestM']:,.0f} m from the site point; zones within 2.5 km: {', '.join(sfha['zonesWithin2500m'])} "
                       f"({sfha['vDatum'] or 'datum not stated'}, {(sfha['lenUnit'] or 'feet').lower()}). ")
            if elev is not None and bfe_ft:
                detail += (f"Ground at the site is {elev:.1f} m ({elev / 0.3048:.1f} ft) NAVD88 by USGS 3DEP, within a few feet of those "
                           "lakeshore base flood elevations; the coastal zones are mapped along the shore only and the lot itself is Zone X.")
        screening.append({'id': 'fema-flood-zone', 'label': 'FEMA flood zone at the site',
                          'value': f"Zone {zone['FLD_ZONE']} — {str(zone.get('ZONE_SUBTY') or '').capitalize()}",
                          'status': 'obtained', 'detail': detail.strip(), 'source': zone_rec['url'], 'retrievedAt': zone_rec['retrievedAt']})
    else:
        screening.append({'id': 'fema-flood-zone', 'label': 'FEMA flood zone at the site', 'value': None, 'status': 'failed',
                          'detail': str(zone_rec.get('error')), 'source': zone_rec.get('url')})
    b250, b500, bcity = (recs.get(k, {}) for k in ('chi311-basement-250m', 'chi311-basement-500m', 'chi311-basement-city'))
    if b500.get('count') is not None:
        screening.append({'id': 'basement-flooding-311', 'label': 'Basement-flooding reports nearby (Chicago 311)',
                          'value': f"{b250.get('count')} within 250 m · {b500['count']} within 500 m",
                          'status': 'obtained',
                          'detail': (f"\"Water in Basement Complaint\" service requests {str(b500.get('first'))[:10]} → {str(b500.get('last'))[:10]} "
                                     f"(city-wide {bcity.get('count'):,} since {str(bcity.get('first'))[:10]}). "
                                     + ("MWRD: most of Chicago has a combined sewer system, sewage and rainwater in the same pipes, " if recs.get('mwrd-tarp', {}).get('verified', {}).get('combinedSewer') else '')
                                     + "so heavy rain can back water up into basements even outside a FEMA flood zone; complaints are "
                                     "self-reported and also count leaks and seepage, so read them as context, not a rate."),
                          'source': b500['url'], 'retrievedAt': b500['retrievedAt']})
    h = prim['heat']
    screening.append({'id': 'extreme-heat', 'label': 'Hot days and warm nights (Midway typical year)',
                      'value': f"{h['daysMaxAtLeast32_2C']} days ≥ 32.2 °C (90 °F) · {h['nightsMinAtLeast20C']} nights ≥ 20 °C",
                      'status': 'computed',
                      'detail': (f"Longest run of ≥ 90 °F days {h['longestRunMaxAtLeast32_2C']}; {h['daysMaxAtLeast35C']} days ≥ 35 °C; "
                                 f"{h['nightsMinAtLeast23_9C']} nights stay ≥ 23.9 °C (75 °F). ASHRAE 0.4 % cooling design "
                                 f"{prim['design']['cooling']['db004']} °C dry bulb. A typical year under-represents heat waves."),
                      'source': 'hydepark-climate-data.js', 'retrievedAt': None})
    code = {k: recs.get(k, {}) for k in ('chicago-bc-2019-ch16', 'chicago-bc-2019-ch18')}
    v16, v18 = code['chicago-bc-2019-ch16'].get('verified', {}), code['chicago-bc-2019-ch18'].get('verified', {})
    src16 = f"Chicago Building Code 2019 §14B-16-1608.2 / 1609.3 via UpCodes ({str(code['chicago-bc-2019-ch16'].get('retrievedAt', ''))[:10]})"
    src18 = f"Chicago Building Code 2019 §14B-18-1809.5 via UpCodes ({str(code['chicago-bc-2019-ch18'].get('retrievedAt', ''))[:10]})"
    design_values = {
        'groundSnowLoad': {'value': '25 psf (1.20 kN/m²)' if v16.get('groundSnowLoad25psf') else None,
                           'status': 'stated in code text (third-party copy)' if v16.get('groundSnowLoad25psf') else 'unknown',
                           'known': ('Chicago amends IBC 1608.2: the ground snow load for roofs shall be 25 psf city-wide. Roof (flat, drift, '
                                     'sliding) loads still follow ASCE 7 with exposure, thermal and slope factors — drifts against a taller '
                                     'neighbouring wall on a narrow lot can govern.'),
                           'source': src16, 'gap': 'Confirm the edition in force (2019 code with later amendments) with the Department of Buildings.'},
        'basicWindSpeed': {'value': '107 mph (48 m/s), Risk Category II' if v16.get('windRiskII107mph') else None,
                           'status': 'stated in code text (third-party copy)' if v16.get('windRiskII107mph') else 'unknown',
                           'known': 'Chicago amends IBC 1609.3: nominal 3-second gust at 33 ft, Exposure C; Risk Category I 101, II 107, III 114, IV 119 mph. Exposure for a dense urban block is likely B, set by the engineer.',
                           'source': src16},
        'frostDepth': {'value': '42 in (1,067 mm) below final grade' if v18.get('frost42in') else None,
                       'status': 'stated in code text (third-party copy)' if v18.get('frost42in') else 'unknown',
                       'known': 'Footings extend at least 42 in below final grade (or follow ASCE 32 frost-protected design, or bear on rock), per §1809.5 as adopted by 14B-18-1809.',
                       'source': src18},
        'energyClimateZone': {'value': prim['climateZone'].get('ashraeClimateZone'), 'status': 'from the weather file (ASHRAE 169)',
                              'known': 'The .stat file for Midway gives the ASHRAE climate zone; the energy code applies the county assignment (Cook County), which should be confirmed in the Chicago Energy Transformation Code.',
                              'source': 'Midway TMYx .stat', 'gap': 'County climate-zone table not archived.'},
    }
    gaps = [{'id': k, 'label': v.get('label'), 'status': v.get('httpStatus') or v.get('status'), 'detail': v.get('error')}
            for k, v in recs.items() if v.get('error')]
    return {'acquiredAt': acq['retrievedAt'], 'samplePoints': [{'id': 'site', 'lon': SITE['lon'], 'lat': SITE['lat']}],
            'limits': acq['limits'] + ' Code values are read from a third-party copy of the 2019 Chicago Building Code and are not verified against the official text.',
            'screening': screening, 'flood': {'zone': zone, 'panel': panel, 'panelEffective': eff, 'nearestSfha': sfha},
            'basement311': {k: {kk: recs.get(k, {}).get(kk) for kk in ('count', 'first', 'last')} for k in ('chi311-basement-250m', 'chi311-basement-500m', 'chi311-basement-city')},
            'designValues': design_values, 'gaps': gaps,
            'questionsForBuildingOfficial': [
                'Which edition of the Chicago Construction Codes (and which amendments) governs a permit applied for now?',
                'Confirm ground snow load 25 psf, basic wind speed 107 mph (Risk Category II) and the expected exposure category (B for a dense block?).',
                'Confirm the 42 in frost depth and whether frost-protected shallow foundations are accepted for a slab or garage.',
                'Is a backwater valve / overhead sewer required for a basement on this combined-sewer block, and are there stormwater-detention rules for a lot this size?',
                'Winter design temperature to use for Manual J (ASHRAE 99 % for Midway is −14.3 °C / 6 °F).',
            ]}


# ------------------------------------------------------------------- findings
def load_findings():
    if not FINDINGS.exists():
        return None
    data = json.loads(FINDINGS.read_text())
    ids = [f['id'] for f in data['findings']]
    assert len(ids) == len(set(ids)), 'duplicate finding IDs'
    for group in ('nextActions', 'questions'):
        for item in data.get(group, []):
            assert set(item.get('findingIds', [])) <= set(ids), item
    for sec, fids in (data.get('sectionFindings') or {}).items():
        assert set(fids) <= set(ids), sec
    return data


def write_findings_md(data):
    lines = ['# Climate, sun and hazard findings — Hydepark Home (Lot 25, 5418–5420 S. Kimbark Ave)', '',
             f"Revision: {data['revision']} · Updated: {data['updated']}", '',
             data['status'], '', data['scope'], '',
             'Generated from `ops/hydepark-climate-findings.json` by `scripts/prepare-hydepark-climate.py`. Edit the JSON and rerun.',
             '', '## Summary', '', '| ID | Topic | Finding (short) | Status |', '|---|---|---|---|']
    for f in data['findings']:
        lines.append(f"| {f['id']} | {f['title']} | {f['headline']} | {f['status']} |")
    lines += ['', '## Findings', '']
    for f in data['findings']:
        lines += [f"### {f['id']} — {f['title']}", '', f"Status: {f['status']}", '', f['finding'], '',
                  '**Design consequence for Lot 25:** ' + f['designConsequence'], '', 'Sources:', '']
        for s in f['sources']:
            href = s['href']
            assert href.startswith(('sources/', 'assets/', 'ops/', 'https://', 'hydepark-climate-data.js', 'scripts/')), href
            if not href.startswith('https://'):
                assert (ROOT / href.split('#')[0]).exists(), href
                href = '../' + href
            lines.append(f"- [{s['label']}]({href})")
        lines.append('')
    lines += ['## Next actions, in order', '']
    for i, a in enumerate(data['nextActions'], 1):
        lines += [f"{i}. **{a['title']}** — {a['detail']} ({', '.join(a['findingIds'])})", '']
    lines += ['## Questions for an architect / engineer / building official', '']
    for q in data['questions']:
        lines += [f"- **{q['to']}:** {q['question']} ({', '.join(q['findingIds'])})"]
    lines.append('')
    OUT_MD.write_text('\n'.join(lines))


# ------------------------------------------------------------------------ copy
COPY = {
    'headerTitle': 'How sun, wind, cold, heat and the lake should shape the house',
    'headerIntro': ('This tab turns three Chicago weather files (two airports and a lakefront station) and public flood and code '
                    'records into pictures you can read without a design background: where the sun is, where cold wind and lake '
                    'breezes come from, how cold, hot and snowy it gets, and what that means for a narrow city lot.'),
    'limits': [
        ['A typical year, not a forecast.', 'Each month comes from a different year (2011–2025); real winters and heat waves are more extreme than the averages show.'],
        ['Station wind is not street wind.', 'The stations are open airfields or a lakefront point with 10 m masts; between rows of 2–3 storey buildings, wind at the lot is weaker and channelled along the street and alley.'],
        ['Neighbouring buildings are not in these sun numbers.', 'The horizon here is flat; houses and trees around the lot are handled by the 3D sun & shade model. The neighbour table below is geometry for hypothetical heights only.'],
        ['The lake matters within a kilometre or two.', 'Hyde Park sits about 1.1 km from Lake Michigan, between the inland airport (Midway) and the lakefront station; expect it to be cooler than Midway on spring and summer afternoons when wind comes off the lake.'],
    ],
    'hazardsNav': 'Flood, heat & code values',
    'hazardsTitle': 'Flood screening and the numbers the city sets',
    'hazardsLede': ('Public flood maps, 311 basement-flooding reports and heat statistics at the lot, plus the structural design values '
                    'the Chicago Building Code fixes city-wide. Screening only; the Department of Buildings and an engineer confirm.'),
    'windStationNote': ('Station winds at 10 m. On the lot expect much lower speeds, with gusts channelled along Kimbark Ave and the '
                        'alley (both run north–south); treat the stations as bounds and the lakefront rose as the lake-breeze case.'),
    'periodNotes': {
        'DJF': ('Winter wind strips heat from walls and blows snow into doorways. On a narrow lot the front (east) and rear (west) '
                'doors are the exposed ones: a vestibule or recessed entry on the side facing the long petals, and a garage or fence on the alley, give shelter.'),
        'MAM': 'Spring winds off the lake (N to E petals) keep the lakefront cold into May; a sunny, wind-sheltered rear yard or roof terrace is where the outdoor season starts.',
        'JJA': 'Summer breezes are welcome. Windows at both ends of the long plan (street and alley) plus a stair or light well that vents at the top let air cross a deep narrow house; lake breezes come from the east on many afternoons.',
        'coldBelowMinus10': 'Only the hours colder than −10 °C — the ones that matter most for heat loss and cold doorways. In Chicago these come mostly on north-west and west winds behind cold fronts.',
    },
    'sunTitle': 'Sun path diagram for Lot 25, 5418–5420 S. Kimbark Ave',
    'sunMeaning': ('The lot runs east–west, so its long sides face north and south across narrow side yards. Winter sun stays low in '
                   'the south and arrives over the neighbouring building to the south; sun on the street (east) and alley (west) '
                   'fronts comes in the morning and afternoon. South glass high in the section — upper floor, clerestory, roof '
                   'monitor — keeps winter sun that the ground floor loses; east and west glass needs shading in summer.'),
    'surfacesLede': ('Total sunshine landing on one square metre of each surface. The heating season (October–April) is what warms '
                     'the house through windows; the annual total is what solar panels see. Neighbouring buildings and trees are NOT '
                     'included, so ground-floor south walls on this lot will get much less in winter.'),
    'surfacesMeaning': ('On a 40 ft lot the roof is the one surface that reliably sees the sky: put solar panels there, and use the '
                        'south side wall above the neighbour’s roof line for winter sun.'),
    'precipNote': 'Typical-year precipitation is a composite; use it for seasonality, not for stormwater or sewer design.',
}

SECTION_FINDINGS = None  # taken from ops/hydepark-climate-findings.json "sectionFindings"


# ------------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--acquire', action='store_true', help='re-fetch weather files and screening data first')
    args = ap.parse_args()
    HP.mkdir(parents=True, exist_ok=True)
    if args.acquire:
        acquire()
    acq = load_acq()
    site = site_point(acq)
    geod = Geod(ellps='WGS84')
    stations, station_ref, irr_values, comfort_out = [], [], {}, {}
    design_only = []
    with tempfile.TemporaryDirectory() as tmpd:
        tmp = Path(tmpd)
        for meta in STATIONS + DESIGN_ONLY:
            zpath = RAW / meta['file']
            files = pc.extract_station({**meta, 'file': str(zpath)}, tmp)
            header = design_header(files['epw'])
            if meta in DESIGN_ONLY:
                epw = EPW(str(files['epw']))
                _, _, dist = geod.inv(site['lon'], site['lat'], epw.location.longitude, epw.location.latitude)
                design_only.append({'id': meta['id'], 'name': meta['name'], 'wmo': meta['wmo'], 'distanceKm': r(dist / 1000, 1),
                                    'file': f"sources/hydepark/climate/raw/{meta['file']}", 'sha256': files['zipSha256'],
                                    'heating': header['heating'], 'cooling': header['cooling'], 'source': header['source']})
                continue
            epw = EPW(str(files['epw']))
            loc = epw.location
            az, _, dist = geod.inv(site['lon'], site['lat'], loc.longitude, loc.latitude)
            stat = pc.parse_stat(files['stat'])
            try:
                ddy = DDY.from_ddy_file(str(files['ddy']))
                ddy_days = [{'name': d.name.split('. ', 1)[-1], 'type': d.day_type,
                             'dryBulbMax': d.dry_bulb_condition.dry_bulb_max, 'dryBulbRange': d.dry_bulb_condition.dry_bulb_range,
                             'windSpeed': d.wind_condition.wind_speed, 'windDirection': d.wind_condition.wind_direction}
                            for d in ddy.design_days if d.name.split('. ', 1)[-1].startswith('Ann')]
            except Exception:
                ddy_days = []
            monthly, annual, thresholds = pc.monthly_stats(epw)
            rose = pc.wind_rose(epw)
            ground = {f'{depth:g}m': [r(v, 1) for v in coll.values] for depth, coll in epw.monthly_ground_temperature.items()}
            comments = epw.comments_1
            period = re.search(r'Period of Record=([\d-]+)', comments)
            sid = meta['id']
            design = ({'source': header['source'], 'heating': header['heating'], 'cooling': header['cooling'],
                       'extremes': header['extremes'], 'annualDesignDays': ddy_days,
                       'units': 'dry bulb °C; wind m/s at 10 m; direction degrees from true north'} if header else
                      {'source': None, 'heating': {}, 'cooling': {}, 'extremes': {}, 'annualDesignDays': ddy_days,
                       'note': 'This TMYx file carries no ASHRAE design conditions (DESIGN CONDITIONS,0); use Midway or O’Hare design values.'})
            st = {
                'id': sid, 'name': meta['name'], 'wmo': meta['wmo'], 'lat': r(loc.latitude, 4), 'lon': r(loc.longitude, 4),
                'elevation': r(loc.elevation, 0),
                'elevationDiffM': r(loc.elevation - site['elevation'], 0) if site['elevation'] is not None else None,
                'distanceKm': r(dist / 1000, 1), 'bearingFromSiteDeg': r(az % 360, 0),
                'period': period.group(1) if period else None, 'dataSource': loc.source,
                'sourceMonths': comments.split(';', 1)[-1].strip().strip('"') if ';' in comments else comments,
                'file': f"sources/hydepark/climate/raw/{meta['file']}", 'sha256': files['zipSha256'],
                'epwSha256': files['entries']['epw']['sha256'], 'timeZone': loc.time_zone,
                'climateZone': {k: stat.get(k) for k in ('ashraeClimateZone', 'ashraeStandard', 'koppen', 'koppenLabel')},
                'monthly': monthly, 'annual': annual, 'thresholds': thresholds, 'heat': heat_stats(epw), 'lake': lake_stats(epw),
                'longTermStat': {k: stat.get(k) for k in ('standardHdd18_3', 'standardPrecipMm', 'standardMeanT', 'designConditionsPeriod', 'note')},
                'design': design, 'groundTemperatureC': ground,
                'windRose': {k: v for k, v in rose.items() if k != 'ladybugPrevailingAnnual'},
                'windRoseCheck': {'ladybugWindRosePrevailingAnnual': rose['ladybugPrevailingAnnual']},
            }
            stations.append(st)
            station_ref.append({'id': sid, 'zip': meta['file'], 'zipSha256': files['zipSha256'], 'entries': files['entries'],
                                'designHeaderFields': header['rawFields'] if header else None, 'stat': stat})
            wea = Wea.from_epw_file(str(files['epw']))
            irr_values[sid] = pc.surface_irradiance(wea, epw, pc.SURFACES)
            _, s_dir, s_dif, s_ref = wea.directional_irradiance(altitude=0, azimuth=180, ground_reflectance=1.0)
            snow = np.roll(np.array(epw.snow_depth.values, float), -1)
            rho = np.where(snow > 0, pc.SNOW_ALBEDO, pc.BARE_ALBEDO)
            south = s_dir.duplicate()
            south.values = list(np.array(s_dir.values) + np.array(s_dif.values) + np.array(s_ref.values) * rho)
            comfort_out[sid] = pc.comfort(epw, wea, south)
            print(f"{sid}: {annual['meanT']} °C mean, HDD18 {annual['hdd18']}, CDD18 {annual['cdd18']}, min {annual['minT']} °C, "
                  f"prevailing {rose['annual']['prevailing']} / DJF {rose['DJF']['prevailing']} / JJA {rose['JJA']['prevailing']}")
    sun = pc.sun_data(site, None, time_zone=TIME_ZONE, time_convention=(
        'All clock times are local STANDARD time, UTC−6 (CST), with no daylight saving applied, matching the EPW files. '
        'Add 1 h for CDT (UTC−5), in force from the second Sunday of March to the first Sunday of November.'))
    sun['horizonNote'] = ('Horizon treated as flat (0°): the land around Hyde Park is level lake plain, so a terrain horizon adds '
                          'nothing; buildings and trees are the real horizon and are handled by the 3D sun & shade model.')
    sun['neighbourShading'] = neighbour_shading(sun, site['lot'])
    prim = next(s for s in stations if s['id'] == PRIMARY)
    lake = next(s for s in stations if s['id'] == LAKEFRONT)
    ohare = next(s for s in stations if s['id'] == 'ohare')
    hz = hazards_summary(site, acq, prim)
    findings = load_findings()
    climate = {
        'schemaVersion': 1,
        'datasetId': 'hydepark',
        'generatedBy': 'scripts/prepare-hydepark-climate.py',
        'dataFile': 'hydepark-climate-data.js',
        'libraries': {p: metadata.version(p) for p in ('ladybug-core', 'ladybug-comfort', 'numpy', 'rasterio', 'pyproj')},
        'site': {
            'name': 'Hydepark Home · Lot 25, 5418–5420 S. Kimbark Ave, Chicago',
            'lat': site['lat'], 'lon': site['lon'], 'elevation': site['elevation'],
            'elevationDatum': 'NAVD88 m, USGS 3DEP 1 m (2017) via the Elevation Point Query Service at the site point',
            'timezone': 'UTC−6 (CST) standard time throughout; CDT (UTC−5) applies Mar–Nov but is not used in any data here',
            'source': 'Site point for Lot 25 (centre of the combined 5418 + 5420 parcels)',
            'lot': site['lot'],
            'primaryStation': PRIMARY,
            'rationale': (f"Midway ({prim['distanceKm']} km W) is the nearest full airport record with ASHRAE design conditions and sits in the same "
                          f"dense, flat south-side city fabric; O'Hare ({ohare['distanceKm']} km NW) is the suburban-edge comparison. The lakefront file "
                          f"at Northerly Island ({lake['distanceKm']} km N) shows the lake's pull on spring and summer afternoons; Hyde Park, ~1.1 km "
                          "inland, lies between Midway and the lakefront. Use Midway for heating, cooling and design temperatures; read the "
                          "lakefront station as the cool-breeze bound."),
            'limits': ('TMYx is a composite typical year (months drawn from 2011–2025), not site observations; it under-represents extremes. '
                       'Station winds are 10 m open-exposure winds; street-level wind on a built-up block is much lower. Neighbouring '
                       'buildings, trees and the urban heat island at the block scale are not modelled.'),
        },
        'stations': stations,
        'designCrossCheck': design_only,
        'surfaceIrradiance': {
            'primaryStation': PRIMARY,
            'units': 'kWh/m² (monthly and annual totals of hourly Wh/m²)',
            'method': (f'ladybug-core Wea.from_epw_file → directional_irradiance (isotropic sky). Ground reflectance {pc.SNOW_ALBEDO} in hours '
                       f'with EPW snow depth > 0, otherwise {pc.BARE_ALBEDO}. Unobstructed: no neighbouring buildings, trees or self-shading.'),
            'surfaces': pc.SURFACES,
            'values': irr_values,
        },
        'sun': sun,
        'comfort': {
            'categories': [{'id': c[0], 'label': c[1], 'minC': None if c[2] == -math.inf else c[2],
                            'maxC': None if c[3] == math.inf else c[3]} for c in pc.UTCI_CATEGORIES],
            'method': ('ladybug-comfort UTCI on every EPW hour, same method as the Dannemora study. "Shade" sets mean radiant temperature '
                       'equal to air temperature; "Sun" uses OutdoorSolarCal MRT. Sheltered cases fix wind at 0.5 m/s. Passive-solar '
                       'strategy assumes an unobstructed south window, which a ground floor on this lot will not have.'),
            'byStation': comfort_out,
        },
        'windRoseFormat': {
            'directions': pc.DIRS16, 'sectorWidthDeg': 22.5,
            'directionMeaning': 'direction the wind blows FROM, degrees clockwise from true north; sector 0 = N (348.75–11.25°)',
            'speedBins': pc.SPEED_BINS,
            'freqPct': 'freqPct[direction][bin] for the 5 non-calm bins (0.5–2 … >8 m/s), % of ALL hours in the period; calmPct is separate, so the rose sums to 100 %',
            'periods': {'annual': 'all hours', 'DJF': 'Dec–Feb', 'MAM': 'Mar–May', 'JJA': 'Jun–Aug', 'SON': 'Sep–Nov',
                        'coldBelowMinus10': 'all hours with air temperature < −10 °C (the winds that drive heat loss and drifting)'},
            'method': 'Computed directly with NumPy from EPW wind speed/direction; annual prevailing direction cross-checked with ladybug WindRose (16 directions).',
            'onshoreSectorDeg': list(ONSHORE),
            'onshoreMeaning': 'station.lake: afternoon (12–18 h LST) hours with wind from NNE–SSE, i.e. off Lake Michigan for Hyde Park',
        },
        'hazards': hz,
        'copy': COPY,
        'docs': {'findingsMd': 'ops/hydepark-climate-findings.md', 'findingsJson': 'ops/hydepark-climate-findings.json'},
        'sectionFindings': (findings or {}).get('sectionFindings'),
        'findings': findings,
    }
    js = "'use strict';\nconst SITE_HYDEPARK_CLIMATE = " + json.dumps(climate, ensure_ascii=False, separators=(',', ':')) + ';\n'
    OUT_JS.write_text(js)
    ref = {'generatedBy': climate['generatedBy'], 'libraries': climate['libraries'], 'site': climate['site'],
           'stations': station_ref, 'designCrossCheck': design_only,
           'summary': [{k: s[k] for k in ('id', 'name', 'elevation', 'distanceKm', 'period', 'annual', 'thresholds', 'heat', 'lake', 'design')} for s in stations],
           'sunKeyDates': {k: sun[k] for k in ('timeConvention', 'location', 'keyDatesFormat', 'keyDates')}}
    (HP / 'climate-reference.json').write_text(json.dumps(ref, indent=1, ensure_ascii=False) + '\n')
    if findings:
        write_findings_md(findings)
    size = len(js.encode())
    print(f'Wrote {OUT_JS.name} ({size / 1024:.0f} KB); findings: {len(findings["findings"]) if findings else 0}')
    assert size < 1.5e6, 'hydepark-climate-data.js too large'


if __name__ == '__main__':
    sys.exit(main())
