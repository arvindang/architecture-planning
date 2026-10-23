"""Climate, sun, wind, comfort and hazard context for the Dannemora Lot 1 candidate.

Reads the archived TMYx weather zips, the provisional permit house footprint and the
1 m DEM; writes climate-data.js (SITE_CLIMATE), ops/climate-findings.md and provenance
JSON under sources/dannemora/climate/.

    .venv/bin/python scripts/prepare-climate.py            # rebuild from archived inputs
    .venv/bin/python scripts/prepare-climate.py --acquire  # first re-fetch hazards + horizon DEM

Network access happens only with --acquire. Everything else is deterministic.
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from importlib import metadata
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Geod, Transformer
from rasterio.io import MemoryFile
from shapely.geometry import shape

from ladybug.epw import EPW
from ladybug.stat import STAT
from ladybug.ddy import DDY
from ladybug.sunpath import Sunpath
from ladybug.wea import Wea
from ladybug.windrose import WindRose
from ladybug.psychchart import PsychrometricChart
from ladybug_comfort.collection.utci import UTCI
from ladybug_comfort.collection.solarcal import OutdoorSolarCal
from ladybug_comfort.chart.polygonpmv import PolygonPMV

ROOT = Path(__file__).resolve().parents[1]
TERRAIN = ROOT / 'sources/dannemora/terrain'
CLIMATE = ROOT / 'sources/dannemora/climate'
RAW = CLIMATE / 'raw'
ACQ_FILE = CLIMATE / 'hazards-acquisition.json'
HORIZON_DEM = CLIMATE / 'horizon-dem-3dep-100m.tif'
FINDINGS = ROOT / 'ops/climate-findings.json'

STATIONS = [
    {'id': 'saranac-lake', 'name': 'Saranac Lake – Adirondack Regional Airport', 'wmo': '726228',
     'file': 'USA_NY_Saranac.Lake-Adirondack.Rgnl.AP.726228_TMYx.2011-2025.zip'},
    {'id': 'plattsburgh', 'name': 'Plattsburgh International Airport', 'wmo': '726225',
     'file': 'USA_NY_Plattsburgh.Intl.AP.726225_TMYx.2011-2025.zip'},
]
PRIMARY = 'saranac-lake'
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
SEASONS = {'annual': list(range(1, 13)), 'DJF': [12, 1, 2], 'MAM': [3, 4, 5],
           'JJA': [6, 7, 8], 'SON': [9, 10, 11]}
DIRS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
          'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
SPEED_BINS = [  # m/s at 10 m station height
    {'id': 'calm', 'label': 'calm (<0.5 m/s)', 'min': 0, 'max': 0.5},
    {'id': '0-2', 'label': '0.5–2 m/s', 'min': 0.5, 'max': 2},
    {'id': '2-4', 'label': '2–4 m/s', 'min': 2, 'max': 4},
    {'id': '4-6', 'label': '4–6 m/s', 'min': 4, 'max': 6},
    {'id': '6-8', 'label': '6–8 m/s', 'min': 6, 'max': 8},
    {'id': '>8', 'label': '>8 m/s', 'min': 8, 'max': None},
]
UTCI_CATEGORIES = [  # (id, label, lower bound °C inclusive, upper bound exclusive) — Bröde et al. 2012
    ('extreme-cold', 'Extreme cold stress', -math.inf, -40),
    ('very-strong-cold', 'Very strong cold stress', -40, -27),
    ('strong-cold', 'Strong cold stress', -27, -13),
    ('moderate-cold', 'Moderate cold stress', -13, 0),
    ('slight-cold', 'Slight cold stress', 0, 9),
    ('no-stress', 'No thermal stress', 9, 26),
    ('moderate-heat', 'Moderate heat stress', 26, 32),
    ('strong-heat', 'Strong heat stress', 32, 38),
    ('very-strong-heat', 'Very strong heat stress', 38, 46),
    ('extreme-heat', 'Extreme heat stress', 46, math.inf),
]
SURFACES = [  # surface normal: tilt from horizontal, azimuth clockwise from true north
    {'id': 'wall-S', 'label': 'Vertical wall, south', 'tiltDeg': 90, 'azimuthDeg': 180},
    {'id': 'wall-E', 'label': 'Vertical wall, east', 'tiltDeg': 90, 'azimuthDeg': 90},
    {'id': 'wall-W', 'label': 'Vertical wall, west', 'tiltDeg': 90, 'azimuthDeg': 270},
    {'id': 'wall-N', 'label': 'Vertical wall, north', 'tiltDeg': 90, 'azimuthDeg': 0},
    {'id': 'roof-S30', 'label': 'Roof 30° tilt, south', 'tiltDeg': 30, 'azimuthDeg': 180},
    {'id': 'roof-S45', 'label': 'Roof 45° tilt, south', 'tiltDeg': 45, 'azimuthDeg': 180},
    {'id': 'roof-flat', 'label': 'Horizontal roof', 'tiltDeg': 0, 'azimuthDeg': 180},
]
SNOW_ALBEDO, BARE_ALBEDO = 0.6, 0.2
USER_AGENT = 'Groundwork-architecture-research/1.0 (public data; no account)'


def r(x, n=1):
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return None
    v = round(float(x), n)
    return int(v) if n == 0 else v


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


# --------------------------------------------------------------------------- site
def site_point():
    gj = json.loads((ROOT / 'sources/dannemora/permit-layout-provisional.geojson').read_text())
    house = next(f for f in gj['features'] if f['properties']['id'] == 'house')
    poly = shape(house['geometry'])
    c = poly.centroid
    to_utm = Transformer.from_crs(4326, 26918, always_xy=True)
    x, y = to_utm.transform(c.x, c.y)
    with rasterio.open(TERRAIN / 'dannemora-dem-1m.tif') as src:
        z = float(next(src.sample([(x, y)]))[0])
        # least-squares plane over a 31 m window: local ground slope and downhill aspect
        row, col = src.index(x, y)
        win = src.read(1, window=((row - 15, row + 16), (col - 15, col + 16))).astype(float)
        win[win == src.nodata] = np.nan
    yy, xx = np.mgrid[15:-16:-1, -15:16]  # metres north/east of centre (1 m cells)
    ok = np.isfinite(win)
    A = np.c_[xx[ok], yy[ok], np.ones(ok.sum())]
    (gx, gy, _), *_ = np.linalg.lstsq(A, win[ok], rcond=None)
    slope = math.degrees(math.atan(math.hypot(gx, gy)))
    aspect_grid = (math.degrees(math.atan2(-gx, -gy)) + 360) % 360  # direction the slope faces
    # long-axis bearing of the traced footprint, true north, via geodesic azimuth
    geod = Geod(ellps='WGS84')
    to_ll = Transformer.from_crs(26918, 4326, always_xy=True)
    utm_poly = shape({'type': 'Polygon', 'coordinates': [[to_utm.transform(*pt) for pt in house['geometry']['coordinates'][0]]]})
    rect = [to_ll.transform(*pt) for pt in utm_poly.minimum_rotated_rectangle.exterior.coords]
    edges = []
    for (lon1, lat1), (lon2, lat2) in zip(rect[:-1], rect[1:]):
        az, _, d = geod.inv(lon1, lat1, lon2, lat2)
        edges.append((d, az % 180))
    edges.sort()
    long_axis = edges[-1][1]
    short_len, long_len = edges[0][0], edges[-1][0]
    # meridian convergence for converting grid aspect to true
    gx1, gy1 = to_utm.transform(c.x, c.y + 0.001)
    conv = math.degrees(math.atan2(gx1 - x, gy1 - y))
    aspect = (aspect_grid + conv) % 360
    return {
        'lat': r(c.y, 5), 'lon': r(c.x, 5), 'elevation': r(z, 1),
        'utm18n': [r(x, 1), r(y, 1)],
        'house': {'longAxisBearingDeg': r(long_axis, 1), 'longFacadeAzimuthsDeg':
                  [r((long_axis + 90) % 360, 1), r((long_axis + 270) % 360, 1)],
                  'lengthM': r(long_len, 1), 'widthM': r(short_len, 1),
                  'status': 'Real APA permit house footprint (provisional county-GIS fit, RMS 3.1 m, max LOO 11.6 m; not surveyed), used only as the analysis reference point. Under practice permit PP-01 the house location and orientation are chosen by us.'},
        'groundAtHouse': {'slopeDeg': r(slope, 1), 'facesAzimuthDeg': r(aspect, 0), 'windowM': 31,
                          'method': 'Least-squares plane through the 1 m DEM within ±15 m of the provisional house centroid (bare earth, 2014–15).'},
    }


# ------------------------------------------------------------------ station files
def extract_station(meta, tmp):
    z = TERRAIN / meta['file']
    out = {'zipSha256': sha256(z), 'zipBytes': z.stat().st_size, 'entries': {}}
    with zipfile.ZipFile(z) as zf:
        for info in zf.infolist():
            name = Path(info.filename).name
            ext = name.rsplit('.', 1)[-1]
            if ext in ('epw', 'ddy', 'stat'):
                data = zf.read(info)
                (tmp / name).write_bytes(data)
                out['entries'][ext] = {'name': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
                out[ext] = tmp / name
    return out


def parse_design_header(epw_path):
    line = epw_path.read_text(errors='replace').splitlines()[1].split(',')
    i_h, i_c, i_e = line.index('Heating'), line.index('Cooling'), line.index('Extremes')
    h, c, x = line[i_h + 1:i_c], line[i_c + 1:i_e], line[i_e + 1:]
    f = lambda v: float(v)
    heating = {'coldestMonth': int(h[0]), 'db996': f(h[1]), 'db990': f(h[2]),
               'ws004': f(h[9]), 'ws010': f(h[11]),
               'mcws996': f(h[13]), 'pcwd996': f(h[14])}
    cooling = {'hottestMonth': int(c[0]), 'dbRange': f(c[1]), 'db004': f(c[2]), 'mcwb004': f(c[3]),
               'db010': f(c[4]), 'mcwb010': f(c[5]), 'db020': f(c[6]), 'mcwb020': f(c[7]),
               'wb004': f(c[8]), 'mcdb_wb004': f(c[9]), 'mcws004': f(c[14]), 'pcwd004': f(c[15]),
               'dp004': f(c[16])}
    extremes = {'ws010': f(x[0]), 'ws025': f(x[1]), 'ws050': f(x[2]),
                'meanExtremeMinDb': f(x[3]), 'meanExtremeMaxDb': f(x[4]),
                'returnPeriodDb': {str(n): {'min': f(x[7 + 2 * k]), 'max': f(x[8 + 2 * k])}
                                   for k, n in enumerate((5, 10, 20, 50))}}
    return {'source': line[2], 'heating': heating, 'cooling': cooling, 'extremes': extremes,
            'rawFields': line}


def parse_stat(stat_path):
    txt = stat_path.read_text(errors='replace')
    out = {}
    m = re.search(r'Climate Zone "([^"]+)" \(ASHRAE Standard ([^)]+)\)', txt)
    if m:
        out['ashraeClimateZone'] = m.group(1)
        out['ashraeStandard'] = m.group(2)
    m = re.search(r'Probable K.{1,2}ppen classification=([\w/]+), ([^\r\n]+)', txt)
    if m:
        out['koppen'] = m.group(1)
        out['koppenLabel'] = m.group(2).strip()
    def row(label):
        m = re.search(r'\n\s*' + re.escape(label) + r'\s*\t([^\n]+)', txt)
        return [float(v) for v in m.group(1).split()] if m else None
    for key, label in (('standardHdd18_3', 'HDD base 18.3C'), ('standardCdd18_3', 'CDD base 18.3C')):
        v = row(label)
        if v:
            out[key] = {'monthly': v[:12], 'annual': r(sum(v[:12]), 0)}
    m = re.search(r'Monthly Standard Average Liquid Precipitation mm.*?Average\s*\t([^\n]+)', txt, re.S)
    if m:
        v = [float(t) for t in m.group(1).split()][:12]
        out['standardPrecipMm'] = {'monthly': v, 'annual': r(sum(v), 0)}
    m = re.search(r'Monthly Standard Average Temperature \[C\].*?Average\s*\t([^\n]+)', txt, re.S)
    if m:
        out['standardMeanT'] = [float(t) for t in m.group(1).split()][:12]
    m = re.search(r'Period for Design Conditions= ?([\d-]+)', txt)
    if m:
        out['designConditionsPeriod'] = m.group(1)
    out['note'] = ('"Standard" rows are the long-term climatology quoted in the .stat file, not '
                   'values recomputed from this TMYx year.')
    return out


# ------------------------------------------------------------------- statistics
def monthly_stats(epw):
    T = np.array(epw.dry_bulb_temperature.values, float)
    months = np.array([d.month for d in epw.dry_bulb_temperature.datetimes])
    # ladybug places EPW hour 24 of Dec 31 at index 0 (01 Jan 00:00); restore EPW order for days
    T_epw = np.roll(T, -1)
    days = T_epw.reshape(365, 24)
    day_month = np.array([dt.date(2017, 1, 1) + dt.timedelta(d) for d in range(365)])
    day_month = np.array([d.month for d in day_month])
    dmean, dmax, dmin = days.mean(1), days.max(1), days.min(1)
    ghi = np.array(epw.global_horizontal_radiation.values, float)
    dni = np.array(epw.direct_normal_radiation.values, float)
    dhi = np.array(epw.diffuse_horizontal_radiation.values, float)
    pr = np.array(epw.liquid_precipitation_depth.values, float)
    snow = np.array(epw.snow_depth.values, float)
    ws = np.array(epw.wind_speed.values, float)
    rh = np.array(epw.relative_humidity.values, float)
    snow_day = np.roll(snow, -1).reshape(365, 24).max(1)
    out = []
    for m in range(1, 13):
        h = months == m
        d = day_month == m
        out.append({
            'month': MONTHS[m - 1],
            'meanT': r(T[h].mean()), 'meanDailyMax': r(dmax[d].mean()), 'meanDailyMin': r(dmin[d].mean()),
            'minT': r(T[h].min()), 'maxT': r(T[h].max()),
            'ghiKWhM2': r(ghi[h].sum() / 1000, 1), 'dniKWhM2': r(dni[h].sum() / 1000, 1),
            'dhiKWhM2': r(dhi[h].sum() / 1000, 1),
            'precipMm': r(pr[h].sum(), 0), 'maxSnowDepthCm': r(snow[h].max(), 0),
            'snowCoverDays': int((snow_day[d] > 0).sum()),
            'meanWindMs': r(ws[h].mean()), 'meanRH': r(rh[h].mean(), 0),
            'hdd18': r(np.clip(18 - dmean[d], 0, None).sum(), 0),
            'cdd18': r(np.clip(dmean[d] - 18, 0, None).sum(), 0),
        })
    # air freezing index over a Jul–Jun "season" assembled from the TMY months (°C·days)
    season = np.r_[dmean[day_month >= 7], dmean[day_month < 7]]
    cum = np.cumsum(season)
    afi_c = 0.0
    run_max = -math.inf
    for v in cum:
        run_max = max(run_max, v)
        afi_c = max(afi_c, run_max - v)
    annual = {
        'meanT': r(T.mean()), 'minT': r(T.min()), 'maxT': r(T.max()),
        'ghiKWhM2': r(ghi.sum() / 1000, 0), 'dniKWhM2': r(dni.sum() / 1000, 0), 'dhiKWhM2': r(dhi.sum() / 1000, 0),
        'precipMm': r(pr.sum(), 0), 'maxSnowDepthCm': r(snow.max(), 0),
        'snowCoverDays': int((snow_day > 0).sum()),
        'meanWindMs': r(ws.mean()),
        'hdd18': r(np.clip(18 - dmean, 0, None).sum(), 0), 'cdd18': r(np.clip(dmean - 18, 0, None).sum(), 0),
        'hdd18_3': r(np.clip(18.3 - dmean, 0, None).sum(), 0),
        'hdd65F': r(np.clip(18.3 - dmean, 0, None).sum() * 1.8, 0),
        'airFreezingIndexCDays': r(afi_c, 0), 'airFreezingIndexFDays': r(afi_c * 1.8, 0),
        'frostFreeSeason': frost_free(dmin),
    }
    thresholds = {
        'hoursBelowMinus20': int((T < -20).sum()), 'hoursBelowMinus10': int((T < -10).sum()),
        'hoursBelow0': int((T < 0).sum()), 'hoursAbove25': int((T > 25).sum()),
        'hoursAbove30': int((T > 30).sum()),
        'daysMaxBelow0': int((dmax < 0).sum()), 'daysMinBelow0': int((dmin < 0).sum()),
    }
    return out, annual, thresholds


def frost_free(dmin):
    """Last spring and first autumn day with Tmin < 0 °C in the TMY calendar."""
    doy = np.arange(365)
    spring = doy[(dmin < 0) & (doy < 182)]
    autumn = doy[(dmin < 0) & (doy >= 182)]
    if not len(spring) or not len(autumn):
        return None
    d0 = dt.date(2017, 1, 1)
    last, first = d0 + dt.timedelta(int(spring.max())), d0 + dt.timedelta(int(autumn.min()))
    return {'lastSpringFrost': last.strftime('%m-%d'), 'firstAutumnFrost': first.strftime('%m-%d'),
            'days': int(autumn.min() - spring.max() - 1)}


def wind_rose(epw, T_mask=None):
    ws = np.array(epw.wind_speed.values, float)
    wd = np.array(epw.wind_direction.values, float)
    months = np.array([d.month for d in epw.wind_speed.datetimes])
    T = np.array(epw.dry_bulb_temperature.values, float)
    sector = (np.floor(((wd + 11.25) % 360) / 22.5)).astype(int)
    calm = ws < 0.5
    edges = [0.5, 2, 4, 6, 8, np.inf]
    out = {}
    subsets = dict(SEASONS)
    subsets['coldBelowMinus10'] = None
    for key, mlist in subsets.items():
        sel = np.isin(months, mlist) if mlist else (T < -10)
        n = int(sel.sum())
        freq = []
        mean = []
        for s in range(16):
            row = []
            hs = sel & ~calm & (sector == s)
            for lo, hi in zip(edges[:-1], edges[1:]):
                row.append(r(100 * (hs & (ws >= lo) & (ws < hi)).sum() / n, 2))
            freq.append(row)
            mean.append(r(ws[hs].mean(), 1) if hs.any() else None)
        totals = [r(sum(f), 1) for f in freq]
        prevailing = int(np.argmax([sum(f) for f in freq]))
        out[key] = {
            'hours': n, 'calmPct': r(100 * (sel & calm).sum() / n, 1),
            'freqPct': freq, 'directionTotalPct': totals, 'meanSpeedMs': mean,
            'meanSpeedAllMs': r(ws[sel].mean(), 2),
            'prevailing': DIRS16[prevailing],
            'top3': [DIRS16[i] for i in np.argsort([-sum(f) for f in freq])[:3]],
            'pctAbove6': r(100 * (sel & (ws >= 6)).sum() / n, 1),
        }
    # cross-check prevailing direction with the ladybug WindRose implementation (annual)
    lb = WindRose(epw.wind_direction, epw.wind_speed, 16)
    out['ladybugPrevailingAnnual'] = [DIRS16[int(round(a / 22.5)) % 16] for a in lb.prevailing_direction]
    return out


# ------------------------------------------------------------------------- sun
def hours_to_hhmm(h):
    m = int(round(h * 60))
    return f'{m // 60:02d}:{m % 60:02d}'


def dt_hours(d):
    return d.hour + d.minute / 60 + d.second / 3600


def sun_data(site, horizon, time_zone=-5, time_convention=None):
    sp = Sunpath(site['lat'], site['lon'], time_zone=time_zone)
    monthly = []
    for m in range(1, 13):
        ss = sp.calculate_sunrise_sunset(m, 21)
        rise, noon, sett = dt_hours(ss['sunrise']), dt_hours(ss['noon']), dt_hours(ss['sunset'])
        sun_noon = sp.calculate_sun(m, 21, noon)
        path = []
        for q in range(0, 24 * 4):
            h = q / 4
            s = sp.calculate_sun(m, 21, h)
            if s.altitude > -1:
                path.append([h, r(s.altitude, 2), r(s.azimuth, 2)])
        entry = {'month': MONTHS[m - 1], 'date': f'2017-{m:02d}-21',
                 'sunrise': hours_to_hhmm(rise), 'solarNoon': hours_to_hhmm(noon), 'sunset': hours_to_hhmm(sett),
                 'sunriseH': r(rise, 3), 'solarNoonH': r(noon, 3), 'sunsetH': r(sett, 3),
                 'dayLengthH': r(sett - rise, 2), 'maxAltitudeDeg': r(sun_noon.altitude, 2),
                 'sunriseAzimuthDeg': r(sp.calculate_sun(m, 21, rise).azimuth, 1),
                 'sunsetAzimuthDeg': r(sp.calculate_sun(m, 21, sett).azimuth, 1),
                 'path15min': path}
        if horizon:
            above = [p for p in path if p[1] > horizon_at(horizon, p[2])]
            entry['terrainSunriseH'] = above[0][0] if above else None
            entry['terrainSunsetH'] = above[-1][0] if above else None
            entry['terrainSunHours'] = r(len(above) * 0.25, 2) if above else 0
        monthly.append(entry)
    key_dates = []
    for label, (m, d) in (('March equinox', (3, 20)), ('June solstice', (6, 21)),
                          ('September equinox', (9, 22)), ('December solstice', (12, 21))):
        pts = []
        for q in range(0, 24 * 4):
            h = q / 4
            s = sp.calculate_sun(m, d, h)
            pts.append([h, r(s.altitude, 3), r(s.azimuth, 3)])
        key_dates.append({'label': label, 'date': f'2017-{m:02d}-{d:02d}', 'positions': pts})
    return {
        'timeConvention': time_convention or ('All clock times are local STANDARD time, UTC−5 (EST), with no daylight saving '
                                              'applied, matching the EPW files. Add 1 h for EDT (UTC−4), in force from the '
                                              'second Sunday of March to the first Sunday of November.'),
        'angleConvention': ('altitude: degrees above the horizon, corrected for atmospheric refraction; '
                            'azimuth: degrees clockwise from TRUE north (90 = east, 180 = south).'),
        'algorithm': ('ladybug-core Sunpath (NOAA solar calculator equations); dates use ladybug\'s '
                      'non-leap reference year 2017. Sunrise/sunset use a 0.5334° solar-disc depression.'),
        'location': {'lat': site['lat'], 'lon': site['lon'], 'timeZone': time_zone},
        'monthly21st': monthly,
        'keyDates': key_dates,
        'keyDatesFormat': '[hourDecimalLocalStandardTime, altitudeDeg, azimuthDeg] every 15 min, 00:00–23:45',
        'monthlyPathFormat': '[hourDecimal, altitudeDeg, azimuthDeg] every 15 min while altitude > −1°',
    }


# ---------------------------------------------------------------------- horizon
def horizon_at(horizon, az):
    step = horizon['stepDeg']
    a = horizon['altitudeDeg']
    i = (az % 360) / step
    i0 = int(math.floor(i)) % len(a)
    i1 = (i0 + 1) % len(a)
    f = i - math.floor(i)
    return a[i0] * (1 - f) + a[i1] * f


def compute_horizon(site):
    if not HORIZON_DEM.exists():
        return None
    x0, y0 = site['utm18n']
    eye = site['elevation'] + 1.6
    R, k = 6371000.0, 0.13
    step = 2
    near = rasterio.open(TERRAIN / 'dannemora-dem-1m.tif')
    nz = near.read(1).astype(float)
    nz[nz == near.nodata] = np.nan
    far = rasterio.open(HORIZON_DEM)
    fz = far.read(1).astype(float)
    if far.nodata is not None:
        fz[fz == far.nodata] = np.nan

    def sample(src, arr, xs, ys):
        rows, cols = rasterio.transform.rowcol(src.transform, xs, ys)
        rows, cols = np.asarray(rows), np.asarray(cols)
        ok = (rows >= 0) & (rows < arr.shape[0]) & (cols >= 0) & (cols < arr.shape[1])
        out = np.full(len(xs), np.nan)
        out[ok] = arr[rows[ok], cols[ok]]
        return out

    alts, dists, near_alts = [], [], []
    d_near = np.arange(5, 900, 2.0)
    d_far = np.arange(300, 30000, 50.0)
    for az in range(0, 360, step):
        s, c = math.sin(math.radians(az)), math.cos(math.radians(az))
        best, best_d, best_near = -90.0, None, -90.0
        for src, arr, ds in ((near, nz, d_near), (far, fz, d_far)):
            z = sample(src, arr, x0 + s * ds, y0 + c * ds)
            ang = np.degrees(np.arctan((z - eye - ds ** 2 * (1 - k) / (2 * R)) / ds))
            if np.isfinite(ang).any():
                j = int(np.nanargmax(ang))
                if src is near:
                    best_near = float(ang[j])
                if ang[j] > best:
                    best, best_d = float(ang[j]), float(ds[j])
        alts.append(r(max(best, 0.0), 2))
        near_alts.append(r(max(best_near, 0.0), 2))
        dists.append(r(best_d / 1000, 2) if best_d else None)
    return {
        'stepDeg': step, 'azimuthsDeg': list(range(0, 360, step)), 'altitudeDeg': alts,
        'nearFieldAltitudeDeg': near_alts, 'distanceKm': dists, 'eyeHeightM': 1.6,
        'method': ('Bare-earth terrain horizon from the provisional house centroid at 1.6 m eye height: '
                   'max elevation angle along each 2° azimuth, combining the 1 m USGS DEM to ~0.9 km '
                   'and a 100 m 3DEP export to 30 km, with earth curvature and refraction (k = 0.13). '
                   'Negative angles are clipped to 0. Trees and buildings are NOT included.'),
    }


def terrain_shading(wea, horizon):
    sp = Sunpath.from_location(wea.location)
    dni = np.array(wea.direct_normal_irradiance.values, float)
    months = np.array([d.month for d in wea.datetimes])
    blocked = np.zeros(len(dni), bool)
    up = np.zeros(len(dni), bool)
    beam_h = np.zeros(len(dni))
    beam_s = np.zeros(len(dni))
    for i, d in enumerate(wea.datetimes):
        s = sp.calculate_sun_from_date_time(d)
        if s.altitude > 0:
            up[i] = True
            blocked[i] = s.altitude <= horizon_at(horizon, s.azimuth)
            beam_h[i] = dni[i] * math.sin(math.radians(s.altitude))
            cos_s = math.cos(math.radians(s.altitude)) * math.cos(math.radians(s.azimuth - 180))
            beam_s[i] = dni[i] * max(cos_s, 0)
    monthly = []
    for m in range(1, 13):
        h = months == m
        monthly.append({'month': MONTHS[m - 1],
                        'sunUpHoursBlockedPct': r(100 * (blocked & h).sum() / max((up & h).sum(), 1), 1),
                        'beamHorizontalLostPct': r(100 * beam_h[blocked & h].sum() / max(beam_h[h].sum(), 1e-9), 1),
                        'beamSouthWallLostPct': r(100 * beam_s[blocked & h].sum() / max(beam_s[h].sum(), 1e-9), 1)})
    return {'monthly': monthly,
            'annual': {'sunUpHoursBlockedPct': r(100 * blocked.sum() / up.sum(), 1),
                       'beamHorizontalLostPct': r(100 * beam_h[blocked].sum() / beam_h.sum(), 1),
                       'beamSouthWallLostPct': r(100 * beam_s[blocked].sum() / beam_s.sum(), 1)},
            'note': 'Direct beam only, per weather-file hour (sun position at mid-hour). Diffuse sky blocking is not modelled.'}


# --------------------------------------------------------------- irradiance
def surface_irradiance(wea, epw, surfaces):
    snow = np.array(epw.snow_depth.values, float)
    # Wea datetimes are mid-hour (00:30…); EPW collections are interval-end; align to Wea
    snow = np.roll(snow, -1)
    rho = np.where(snow > 0, SNOW_ALBEDO, BARE_ALBEDO)
    months = np.array([d.month for d in wea.datetimes])
    out = {}
    for srf in surfaces:
        _, direct, diffuse, refl = wea.directional_irradiance(
            altitude=90 - srf['tiltDeg'], azimuth=srf['azimuthDeg'], ground_reflectance=1.0)
        dirv, difv, refv = (np.array(c.values, float) for c in (direct, diffuse, refl))
        tot = dirv + difv + refv * rho
        tot02 = dirv + difv + refv * BARE_ALBEDO
        out[srf['id']] = {
            'monthly': [r(tot[months == m].sum() / 1000, 1) for m in range(1, 13)],
            'annual': r(tot.sum() / 1000, 0),
            'annualConstantAlbedo02': r(tot02.sum() / 1000, 0),
            'heatingSeasonOctApr': r(tot[np.isin(months, [10, 11, 12, 1, 2, 3, 4])].sum() / 1000, 0),
            'directFractionPct': r(100 * dirv.sum() / max(tot.sum(), 1e-9), 0),
        }
    return out


# --------------------------------------------------------------------- comfort
def utci_monthly(values, months):
    v = np.asarray(values, float)
    res = []
    for m in range(1, 13):
        h = v[months == m]
        res.append([r(100 * ((h >= lo) & (h < hi)).sum() / len(h), 1) for _, _, lo, hi in UTCI_CATEGORIES])
    ann = [r(100 * ((v >= lo) & (v < hi)).sum() / len(v), 1) for _, _, lo, hi in UTCI_CATEGORIES]
    return res, ann


def comfort(epw, wea, south_irr):
    T, RH, WS = epw.dry_bulb_temperature, epw.relative_humidity, epw.wind_speed
    months = np.array([d.month for d in T.datetimes])
    hours = np.array([d.hour for d in T.datetimes])
    day = (hours >= 8) & (hours <= 18)
    calm = WS.duplicate()
    calm.values = [0.5] * len(WS.values)
    scenarios = {}
    notes = []
    defs = [('shadeWind', 'Shade (MRT = air temperature), station 10 m wind', None, WS),
            ('shadeCalm', 'Shade (MRT = air temperature), wind sheltered to 0.5 m/s', None, calm)]
    try:
        surf_t = T  # ground/surroundings assumed at air temperature
        osc = OutdoorSolarCal(epw.location, epw.direct_normal_radiation, epw.diffuse_horizontal_radiation,
                              epw.horizontal_infrared_radiation_intensity, surf_t)
        defs.append(('sunCalm', 'Full sun (SolarCal MRT, body fully exposed), wind sheltered to 0.5 m/s',
                     osc.mean_radiant_temperature, calm))
    except Exception as exc:  # pragma: no cover - recorded, not fatal
        notes.append(f'Sun-exposed scenario skipped: {exc!r}')
    for key, label, mrt, wind in defs:
        u = UTCI(T, RH, rad_temperature=mrt if mrt is not None else T, wind_speed=wind)
        vals = np.array(u.universal_thermal_climate_index.values, float)
        monthly, annual = utci_monthly(vals, months)
        nostress = [c[0] for c in UTCI_CATEGORIES].index('no-stress')
        scenarios[key] = {
            'label': label, 'monthlyPct': monthly, 'annualPct': annual,
            'daytimeNoStressPctByMonth': [r(100 * ((vals[(months == m) & day] >= 9) & (vals[(months == m) & day] < 26)).mean(), 0) for m in range(1, 13)],
            'annualNoStressPct': annual[nostress],
        }
    # psychrometric passive strategies (single PMV polygon, ladybug defaults)
    pmv = None
    try:
        pressure = np.mean(epw.atmospheric_station_pressure.values)
        psy = PsychrometricChart(T, RH, average_pressure=pressure)
        poly = PolygonPMV(psy)
        n = len(T.values)
        base = np.array(poly.merged_comfort_data.values, int)
        ih = np.array(poly.evaluate_polygon(poly.internal_heat_polygon(12.8)), int)
        ps, delta = poly.evaluate_passive_solar(south_irr, 50, 8, 12.8)
        ps = np.array(ps, int)
        nf = np.array(poly.evaluate_night_flush_polygon(poly.night_flush_polygon(12), T, 3.0, 8), int)
        fan = np.array(poly.evaluate_polygon(poly.fan_use_polygon(1.0)), int)
        evap = np.array(poly.evaluate_polygon(poly.evaporative_cooling_polygon()), int)
        strategies = {'comfortPolygon': base, 'internalHeat': ih, 'passiveSolar': ps,
                      'massNightFlush': nf, 'occupantFan': fan, 'evaporativeCooling': evap}
        union = np.zeros(n, int)
        for v in strategies.values():
            union |= v
        too_cold = 1 - union
        too_cold &= (np.array(T.values) < 22).astype(int)
        pmv = {
            'method': ('ladybug-comfort PolygonPMV on a psychrometric chart at station pressure; one PMV '
                       'comfort polygon with ladybug defaults (PPD ≤ 10%, met 1.1, clo 0.7, air speed 0.1 m/s, '
                       'MRT = air temperature). Strategy polygons/parameters follow the LB PMV Polygon '
                       'defaults: internal heat balance 12.8 °C; passive solar 50 W/m² per °C, 8 h time '
                       'constant, driven by snow-adjusted irradiance on a vertical SOUTH window; mass + night '
                       'flush 12 °C above / 3 °C below comfort, 8 h; occupant fan 1 m/s; direct evaporative cooling.'),
            'annualPct': {k: r(100 * v.mean(), 1) for k, v in strategies.items()},
            'allStrategiesPct': r(100 * union.mean(), 1),
            'notComfortableColdPct': r(100 * too_cold.mean(), 1),
            'monthlyPct': {k: [r(100 * v[months == m].mean(), 0) for m in range(1, 13)]
                           for k, v in list(strategies.items()) + [('allStrategies', union)]},
            'passiveSolarMaxDeltaC': r(delta, 1),
            'note': 'Strategy hours overlap; percentages are of all 8,760 hours (day and night), not occupied hours.',
        }
    except Exception as exc:  # pragma: no cover
        notes.append(f'PMV polygon strategies skipped: {exc!r}')
    return {'scenarios': scenarios, 'pmvStrategies': pmv, 'notes': notes}


# --------------------------------------------------------------------- hazards
FBFM40 = {
    91: 'NB1 Urban/developed', 92: 'NB2 Snow/ice', 93: 'NB3 Agricultural', 98: 'NB8 Open water', 99: 'NB9 Bare ground',
    101: 'GR1 Short, sparse dry-climate grass', 102: 'GR2 Low-load dry-climate grass', 103: 'GR3 Low-load very coarse humid-climate grass',
    104: 'GR4 Moderate-load dry-climate grass', 105: 'GR5 Low-load humid-climate grass', 106: 'GR6 Moderate-load humid-climate grass',
    107: 'GR7 High-load dry-climate grass', 108: 'GR8 High-load very coarse humid-climate grass', 109: 'GR9 Very high-load humid-climate grass',
    121: 'GS1 Low-load dry-climate grass-shrub', 122: 'GS2 Moderate-load dry-climate grass-shrub',
    123: 'GS3 Moderate-load humid-climate grass-shrub', 124: 'GS4 High-load humid-climate grass-shrub',
    141: 'SH1 Low-load dry-climate shrub', 142: 'SH2 Moderate-load dry-climate shrub', 143: 'SH3 Moderate-load humid-climate shrub',
    144: 'SH4 Low-load humid-climate timber-shrub', 145: 'SH5 High-load dry-climate shrub', 146: 'SH6 Low-load humid-climate shrub',
    147: 'SH7 Very high-load dry-climate shrub', 148: 'SH8 High-load humid-climate shrub', 149: 'SH9 Very high-load humid-climate shrub',
    161: 'TU1 Low-load dry-climate timber-grass-shrub', 162: 'TU2 Moderate-load humid-climate timber-shrub',
    163: 'TU3 Moderate-load humid-climate timber-grass-shrub', 164: 'TU4 Dwarf conifer with understory',
    165: 'TU5 Very high-load dry-climate timber-shrub',
    181: 'TL1 Low-load compact conifer litter', 182: 'TL2 Low-load broadleaf litter', 183: 'TL3 Moderate-load conifer litter',
    184: 'TL4 Small downed logs', 185: 'TL5 High-load conifer litter', 186: 'TL6 Moderate-load broadleaf litter',
    187: 'TL7 Large downed logs', 188: 'TL8 Long-needle litter', 189: 'TL9 Very high-load broadleaf litter',
    201: 'SB1 Low-load activity fuel', 202: 'SB2 Moderate-load activity fuel or low-load blowdown',
    203: 'SB3 High-load activity fuel or moderate-load blowdown', 204: 'SB4 High-load blowdown',
}
WHP_CLASSES = {1: 'Very low', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Very high', 6: 'Non-burnable', 7: 'Water'}
IIPP = 'https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation'
LF = 'https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2024'
RASTER_TARGETS = [
    ('wrc-burn-probability', f'{IIPP}/USFS_EDW_RMRS_WRC_BurnProbability/ImageServer', 'USFS Wildfire Risk to Communities 2024 — annual burn probability (service-scaled integer)'),
    ('wrc-conditional-flame-length', f'{IIPP}/USFS_EDW_RMRS_WRC_ConditionalFlameLength/ImageServer', 'WRC conditional flame length (service-scaled integer)'),
    ('wrc-flame-length-exceed-4ft', f'{IIPP}/USFS_EDW_RMRS_WRC_FlameLengthExceedProb4ft/ImageServer', 'WRC probability flame length > 4 ft given fire (service-scaled)'),
    ('wrc-risk-to-potential-structures', f'{IIPP}/USFS_EDW_RMRS_WRC_RiskToPotentialStructures/ImageServer', 'WRC risk to potential structures (service-scaled)'),
    ('wrc-exposure-type', f'{IIPP}/USFS_EDW_RMRS_WRC_ExposureType/ImageServer', 'WRC exposure type (service-scaled)'),
    ('whp-2023-classified', f'{IIPP}/USFS_EDW_RMRS_WildfireHazardPotentialClassified/ImageServer', 'Wildfire Hazard Potential 2023, 5 classes (270 m)'),
    ('whp-2023-continuous', f'{IIPP}/USFS_EDW_RMRS_WildfireHazardPotentialContinuous/ImageServer', 'Wildfire Hazard Potential 2023, continuous index (270 m)'),
    ('landfire-fbfm40', f'{LF}/LF2024_FBFM40_CONUS/ImageServer', 'LANDFIRE 2024 Scott & Burgan 40 fire behaviour fuel model (30 m)'),
    ('landfire-canopy-cover', f'{LF}/LF2024_CC_CONUS/ImageServer', 'LANDFIRE 2024 forest canopy cover, % (30 m)'),
    ('landfire-canopy-height', f'{LF}/LF2024_CH_CONUS/ImageServer', 'LANDFIRE 2024 forest canopy height, m × 10 (30 m)'),
]
WRC_API = 'https://api.wildfirerisk.org/wrc'


def http_get(url, binary=False, timeout=90):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            if resp.headers.get('Content-Encoding') == 'gzip' or body[:2] == b'\x1f\x8b':
                body = gzip.decompress(body)  # api.wildfirerisk.org gzips regardless of Accept-Encoding
            return resp.status, resp.headers.get('Content-Type'), body
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get('Content-Type') if exc.headers else None, exc.read()
    except Exception as exc:
        return None, None, repr(exc).encode()


def sample_points(site):
    to_ll = Transformer.from_crs(26918, 4326, always_xy=True)
    x0, y0 = site['utm18n']
    pts = [('house', site['lon'], site['lat'])]
    for k, az in enumerate(range(0, 360, 45)):
        lon, lat = to_ll.transform(x0 + 200 * math.sin(math.radians(az)), y0 + 200 * math.cos(math.radians(az)))
        pts.append((f'ring200m-{DIRS16[2 * k]}', round(lon, 6), round(lat, 6)))
    return pts


def acquire(site):
    RAW.mkdir(parents=True, exist_ok=True)
    records = []
    pts = sample_points(site)
    geom = json.dumps({'points': [[p[1], p[2]] for p in pts], 'spatialReference': {'wkid': 4326}})
    for rid, base, label in RASTER_TARGETS:
        rec = {'id': rid, 'label': label, 'url': base, 'access': 'public HTTPS; no API key or account used'}
        st, ct, body = http_get(base + '?f=json')
        if st == 200:
            info = json.loads(body)
            rec['serviceInfo'] = {k: info.get(k) for k in ('name', 'pixelType', 'pixelSizeX', 'minValues', 'maxValues')}
            desc = re.sub('<[^>]+>', ' ', info.get('description') or '')
            m = re.search(r'Pixel values in this image service have been altered[^.]*\.', desc)
            if m:
                rec['serviceInfo']['valueNote'] = m.group(0)
        q = urllib.parse.urlencode({'geometry': geom, 'geometryType': 'esriGeometryMultipoint',
                                    'returnFirstValueOnly': 'true', 'f': 'json'})
        rec['queryUrl'] = f'{base}/getSamples?{q}'
        rec['retrievedAt'] = now_iso()
        st, ct, body = http_get(rec['queryUrl'])
        rec['httpStatus'] = st
        try:
            data = json.loads(body)
            if 'samples' in data:
                vals = {s['locationId']: s.get('value') for s in data['samples']}
                rec['samples'] = [{'point': p[0], 'lon': p[1], 'lat': p[2], 'value': vals.get(i)} for i, p in enumerate(pts)]
            else:
                rec['error'] = data
        except Exception:
            rec['error'] = body[:500].decode(errors='replace')
        records.append(rec)
    for rid, path, label in (('wrc-clinton-county', '/place/36019', 'wildfirerisk.org Clinton County summary'),
                             ('wrc-clinton-county-exposure', '/wildfireData/36019/county/exposure_type.json', 'wildfirerisk.org Clinton County exposure type'),
                             ('wrc-place-dannemora', '/place/3600019642', 'wildfirerisk.org Dannemora (village CDP, ~8 km east of site)'),
                             ('wrc-place-lyon-mountain', '/place/3600043951', 'wildfirerisk.org Lyon Mountain (CDP whose bounds reach the site longitude)')):
        url = WRC_API + path
        rec = {'id': rid, 'label': label, 'url': url, 'retrievedAt': now_iso(),
               'access': 'public JSON API used by wildfirerisk.org; no key'}
        st, ct, body = http_get(url, timeout=60)
        rec['httpStatus'] = st
        try:
            rec['response'] = json.loads(body)
        except Exception as exc:
            rec['error'] = f'{exc!r}: {body[:200]!r}'
        records.append(rec)
    # code/design-value sources
    bulletin = 'https://dos.ny.gov/requirements-completing-table-r30121-2020-residential-code-new-york-state'
    st, ct, body = http_get(bulletin)
    rec = {'id': 'nys-dos-tb-1009', 'label': 'NYS DOS Technical Bulletin TB-1009-RCNYS: completing Table R301.2(1), 2020 RCNYS',
           'url': bulletin, 'retrievedAt': now_iso(), 'httpStatus': st, 'contentType': ct}
    if st == 200 and body[:4] == b'%PDF':
        (RAW / 'nys-dos-tb-1009-rcnys.pdf').write_bytes(body)
        rec.update(file='raw/nys-dos-tb-1009-rcnys.pdf', sha256=hashlib.sha256(body).hexdigest(), bytes=len(body))
    records.append(rec)
    for rid, url, label in (
            ('atc-hazards-snow-api', 'https://api-hazards.atcouncil.org/public/v1/snow.json?lat=%s&lng=%s' % (site['lat'], site['lon']),
             'ATC Hazards by Location snow API (unauthenticated probe)'),
            ('ncei-air-freezing-index', 'https://www.ncei.noaa.gov/sites/default/files/attachments/Air-Freezing-Index-Return-Periods-and-Associated-Probabilities.pdf',
             'NOAA/NCEI Air Freezing Index return-period table cited by TB-1009 (new host)'),
            ('ncdc-air-freezing-index', 'https://www.ncdc.noaa.gov/sites/default/files/attachments/Air-Freezing-Index-Return-Periods-and-Associated-Probabilities.pdf',
             'Same table at the URL printed in TB-1009')):
        st, ct, body = http_get(url, timeout=45)
        rec = {'id': rid, 'label': label, 'url': url, 'retrievedAt': now_iso(), 'httpStatus': st, 'contentType': ct}
        if st == 200 and body[:4] == b'%PDF':
            name = f'raw/{rid}.pdf'
            (CLIMATE / name).write_bytes(body)
            rec.update(file=name, sha256=hashlib.sha256(body).hexdigest())
        else:
            rec['error'] = body[:300].decode(errors='replace') if body else 'no body'
        records.append(rec)
    records.append({'id': 'asce7-hazard-tool', 'label': 'ASCE 7 Hazard Tool (ground snow load, wind speed)',
                    'url': 'https://ascehazardtool.org/', 'status': 'not queried',
                    'error': 'Requires a registered ASCE account; this project does not create accounts. Recorded as a gap.'})
    # horizon DEM for the terrain-horizon study
    x0, y0 = site['utm18n']
    bbox = [round(x0 - 30000, -2), round(y0 - 30000, -2), round(x0 + 30000, -2), round(y0 + 30000, -2)]
    q = urllib.parse.urlencode({'bbox': ','.join(str(int(b)) for b in bbox), 'bboxSR': 26918, 'imageSR': 26918,
                                'size': '600,600', 'format': 'tiff', 'pixelType': 'F32',
                                'interpolation': 'RSP_BilinearInterpolation', 'f': 'image'})
    url = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?' + q
    st, ct, body = http_get(url, timeout=180)
    rec = {'id': 'horizon-dem-3dep', 'label': 'USGS 3DEP dynamic elevation, 100 m export, 60 × 60 km around the site (horizon study only)',
           'url': url, 'retrievedAt': now_iso(), 'httpStatus': st, 'contentType': ct,
           'bboxUtm18n': bbox, 'crs': 'EPSG:26918', 'verticalDatum': 'NAVD88 metres (3DEP)'}
    if st == 200 and ct and 'tiff' in ct:
        with MemoryFile(body) as mem, mem.open() as src:
            prof = src.profile
            prof.update(compress='deflate', predictor=3, tiled=False)
            arr = src.read(1)
            with rasterio.open(HORIZON_DEM, 'w', **prof) as dst:
                dst.write(arr, 1)
        rec.update(file=HORIZON_DEM.name, sha256=sha256(HORIZON_DEM), bytes=HORIZON_DEM.stat().st_size,
                   minM=r(float(np.nanmin(arr)), 1), maxM=r(float(np.nanmax(arr)), 1))
    records.append(rec)
    ACQ_FILE.write_text(json.dumps({'retrievedAt': now_iso(), 'site': {'lat': site['lat'], 'lon': site['lon']},
                                    'samplePoints': [{'id': p[0], 'lon': p[1], 'lat': p[2]} for p in pts],
                                    'limits': 'Screening-level public datasets at 30–270 m resolution sampled at a provisional, '
                                              'unsurveyed house point; not a site assessment, code determination or insurance rating.',
                                    'records': records}, indent=2, ensure_ascii=False) + '\n')
    print(f'Acquired {len(records)} hazard records -> {ACQ_FILE.relative_to(ROOT)}')


def hazards_summary(site):
    if not ACQ_FILE.exists():
        return {'status': 'not acquired', 'note': 'Run with --acquire to fetch public hazard data.'}
    acq = json.loads(ACQ_FILE.read_text())
    recs = {rec['id']: rec for rec in acq['records']}

    def vals(rid):
        rec = recs.get(rid) or {}
        s = rec.get('samples')
        if not s:
            return None, None, rec.get('error') or rec.get('httpStatus')
        house = s[0]['value']
        ring = [p['value'] for p in s[1:]]
        return house, ring, None

    wildfire = {}
    for rid, _, label in RASTER_TARGETS:
        h, ring, err = vals(rid)
        item = {'label': label, 'source': recs.get(rid, {}).get('url'), 'retrievedAt': recs.get(rid, {}).get('retrievedAt')}
        if err is not None and h is None:
            item.update(status='failed', error=str(err))
        else:
            item.update(status='obtained', house=h, ring200m=ring)
            try:
                hv = int(float(h))
                if rid == 'landfire-fbfm40':
                    item['houseDecoded'] = FBFM40.get(hv, 'unknown code')
                    item['ringDecoded'] = sorted({FBFM40.get(int(float(v)), str(v)) for v in ring if v not in (None, 'NoData')})
                if rid == 'whp-2023-classified':
                    item['houseDecoded'] = WHP_CLASSES.get(hv)
                    item['ringDecoded'] = [WHP_CLASSES.get(int(float(v))) for v in ring if v not in (None, 'NoData')]
                if rid == 'landfire-canopy-height':
                    item['houseDecoded'] = f'{hv / 10:.1f} m'
                if rid == 'landfire-canopy-cover':
                    item['houseDecoded'] = f'{hv} %'
            except (TypeError, ValueError):
                pass
            info = recs.get(rid, {}).get('serviceInfo', {})
            if rid.startswith('wrc-') or info.get('valueNote'):
                item['valueNote'] = 'Service values are altered from the source raster for web display; use for relative comparison only.'
                item['serviceRange'] = [info.get('minValues', [None])[0], info.get('maxValues', [None])[0]]
        wildfire[rid] = item
    community = {}
    for rid in ('wrc-clinton-county', 'wrc-place-dannemora', 'wrc-place-lyon-mountain'):
        resp = recs.get(rid, {}).get('response') or {}
        if resp:
            community[rid] = {'name': resp.get('name'),
                              'riskToHomes': resp.get('risk_to_homes_class'),
                              'wildfireLikelihood': resp.get('wildfire_likelihood_class'),
                              'exposureType': resp.get('exposure_type_class'),
                              'ranks': resp.get('ranks'), 'source': recs[rid]['url'],
                              'retrievedAt': recs[rid]['retrievedAt']}
    elev_ft = site['elevation'] / 0.3048
    over = max(0.0, elev_ft - 1000)
    design_values = {
        'groundSnowLoad': {'value': None, 'status': 'unknown',
                           'known': (f'2020 RCNYS Figure R301.2(6) gives mapped Pg; NYS amendment to footnote "o" adds 2 psf per 100 ft '
                                     f'above 1,000 ft. At the DEM elevation {site["elevation"]:.0f} m ({elev_ft:.0f} ft) that adds about '
                                     f'{2 * over / 100:.0f} psf ({over:.0f} ft above 1,000 ft) to the mapped value.'),
                           'elevationAdderPsf': r(2 * over / 100, 1),
                           'source': 'NYS DOS TB-1009-RCNYS (archived)', 'gap': 'Mapped Pg for the Town of Dannemora not obtained; Figure R301.2(6) not archived; ASCE hazard tool requires an account.'},
        'basicWindSpeed': {'value': None, 'status': 'unknown', 'known': 'Ultimate design wind speed is read from 2020 RCNYS Figure R301.2(5)A and entered by the AHJ in Table R301.2(1); exposure category is site-specific (R301.2.1.4); topographic speed-up is a YES/NO jurisdiction entry.',
                           'source': 'NYS DOS TB-1009-RCNYS (archived)', 'gap': 'Figure value not obtained.'},
        'frostDepth': {'value': None, 'status': 'unknown', 'known': 'Set by the local jurisdiction as minimum footing depth below finish grade (may use air freezing index, soil type, water table, local experience).',
                       'source': 'NYS DOS TB-1009-RCNYS (archived)', 'gap': 'Town of Dannemora Table R301.2(1) not found online.'},
        'weathering': {'value': 'Severe', 'status': 'stated', 'known': 'TB-1009: all of NYS is in the "Severe" weathering category (Figure R301.2(4)).', 'source': 'NYS DOS TB-1009-RCNYS (archived)'},
        'seismicDesignCategory': {'value': None, 'status': 'unknown', 'known': 'NYS contains SDC A, B and C (Figure R301.2(2)); AHJ enters the value.', 'source': 'NYS DOS TB-1009-RCNYS (archived)'},
        'iceBarrierUnderlayment': {'value': None, 'status': 'unknown', 'known': 'AHJ enters YES where there is a local history of ice-dam damage (R905.1.2).', 'source': 'NYS DOS TB-1009-RCNYS (archived)'},
    }
    gaps = [{'id': k, 'label': v.get('label'), 'status': v.get('httpStatus') or v.get('status'), 'detail': v.get('error')}
            for k, v in recs.items() if v.get('error') or (v.get('httpStatus') not in (200, None))]
    return {'acquiredAt': acq['retrievedAt'], 'samplePoints': acq['samplePoints'], 'limits': acq['limits'],
            'wildfire': wildfire, 'community': community, 'designValues': design_values, 'gaps': gaps,
            'questionsForBuildingOfficial': [
                'Which Uniform Code / RCNYS edition will govern a permit applied for now, and does the Town of Dannemora publish its Table R301.2(1)?',
                'Ground snow load (mapped Pg) for the site, and confirmation that the +2 psf per 100 ft above 1,000 ft adjustment applies (site ≈ 1,580 ft).',
                'Ultimate design wind speed, topographic-effects entry and expected exposure category for a hillside clearing.',
                'Minimum frost-line footing depth; whether frost-protected shallow foundations are accepted.',
                'Is ice-barrier underlayment required (local ice-dam history)?',
                'Winter design temperature to use for Manual J (ASHRAE 99% for Saranac Lake is −24.5 °C / −12 °F).',
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
    return data


def write_findings_md(data):
    lines = ['# Climate, sun and hazard findings — Dannemora Lot 1 candidate', '',
             f"Revision: {data['revision']} · Updated: {data['updated']}", '',
             data['status'], '', data['scope'], '',
             'Generated from `ops/climate-findings.json` by `scripts/prepare-climate.py`. Edit the JSON and rerun; '
             'methods and limits are in `ops/climate.md`.', '', '## Summary', '',
             '| ID | Topic | Finding (short) | Status |', '|---|---|---|---|']
    for f in data['findings']:
        lines.append(f"| {f['id']} | {f['title']} | {f['headline']} | {f['status']} |")
    lines += ['', '## Findings', '']
    for f in data['findings']:
        lines += [f"### {f['id']} — {f['title']}", '', f"Status: {f['status']}", '', f['finding'], '',
                  '**Design consequence for Lot 1:** ' + f['designConsequence'], '', 'Sources:', '']
        for s in f['sources']:
            href = s['href']
            assert href.startswith(('sources/', 'assets/', 'ops/', 'https://', 'climate-data.js', 'scripts/')), href
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
    (ROOT / 'ops/climate-findings.md').write_text('\n'.join(lines))


# ------------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--acquire', action='store_true', help='re-fetch public hazard data and the horizon DEM first')
    args = ap.parse_args()
    CLIMATE.mkdir(parents=True, exist_ok=True)
    site = site_point()
    if args.acquire:
        acquire(site)
    horizon = compute_horizon(site)
    geod = Geod(ellps='WGS84')
    stations, station_ref = [], []
    irr_values, comfort_out = {}, {}
    terrain = None
    with tempfile.TemporaryDirectory() as tmpd:
        tmp = Path(tmpd)
        for meta in STATIONS:
            files = extract_station(meta, tmp)
            epw = EPW(str(files['epw']))
            loc = epw.location
            _, _, dist = geod.inv(site['lon'], site['lat'], loc.longitude, loc.latitude)
            az, _, _ = geod.inv(site['lon'], site['lat'], loc.longitude, loc.latitude)
            header = parse_design_header(files['epw'])
            stat = parse_stat(files['stat'])
            ddy = DDY.from_ddy_file(str(files['ddy']))
            ddy_days = [{'name': d.name.split('. ', 1)[-1], 'type': d.day_type,
                         'dryBulbMax': d.dry_bulb_condition.dry_bulb_max,
                         'dryBulbRange': d.dry_bulb_condition.dry_bulb_range,
                         'windSpeed': d.wind_condition.wind_speed, 'windDirection': d.wind_condition.wind_direction}
                        for d in ddy.design_days if d.name.split('. ', 1)[-1].startswith('Ann')]
            monthly, annual, thresholds = monthly_stats(epw)
            rose = wind_rose(epw)
            ground = {}
            for depth, coll in epw.monthly_ground_temperature.items():
                ground[f'{depth:g}m'] = [r(v, 1) for v in coll.values]
            comments = epw.comments_1
            period = re.search(r'Period of Record=([\d-]+)', comments)
            sid = meta['id']
            st = {
                'id': sid, 'name': meta['name'], 'wmo': meta['wmo'], 'lat': r(loc.latitude, 4), 'lon': r(loc.longitude, 4),
                'elevation': r(loc.elevation, 0), 'elevationDiffM': r(loc.elevation - site['elevation'], 0),
                'distanceKm': r(dist / 1000, 1), 'bearingFromSiteDeg': r(az % 360, 0),
                'period': period.group(1) if period else None, 'dataSource': loc.source,
                'sourceMonths': comments.split(';', 1)[-1].strip().strip('"') if ';' in comments else comments,
                'file': f"sources/dannemora/terrain/{meta['file']}", 'sha256': files['zipSha256'],
                'epwSha256': files['entries']['epw']['sha256'], 'timeZone': loc.time_zone,
                'climateZone': {k: stat.get(k) for k in ('ashraeClimateZone', 'ashraeStandard', 'koppen', 'koppenLabel')},
                'monthly': monthly, 'annual': annual, 'thresholds': thresholds,
                'longTermStat': {k: stat.get(k) for k in ('standardHdd18_3', 'standardPrecipMm', 'standardMeanT', 'designConditionsPeriod', 'note')},
                'design': {'source': header['source'], 'heating': header['heating'], 'cooling': header['cooling'],
                           'extremes': header['extremes'], 'annualDesignDays': ddy_days,
                           'units': 'dry bulb °C; wind m/s at 10 m; direction degrees from true north'},
                'groundTemperatureC': ground,
                'windRose': {k: v for k, v in rose.items() if k != 'ladybugPrevailingAnnual'},
                'windRoseCheck': {'ladybugWindRosePrevailingAnnual': rose['ladybugPrevailingAnnual']},
            }
            stations.append(st)
            station_ref.append({'id': sid, 'zip': meta['file'], 'zipSha256': files['zipSha256'],
                                'entries': files['entries'], 'designHeaderFields': header['rawFields'], 'stat': stat})
            # irradiance + comfort
            wea = Wea.from_epw_file(str(files['epw']))
            irr_values[sid] = surface_irradiance(wea, epw, SURFACES + [
                {'id': 'wall-permit-SE', 'tiltDeg': 90, 'azimuthDeg': site['house']['longFacadeAzimuthsDeg'][0]},
                {'id': 'wall-permit-NW', 'tiltDeg': 90, 'azimuthDeg': site['house']['longFacadeAzimuthsDeg'][1]}])
            _, s_dir, s_dif, s_ref = wea.directional_irradiance(altitude=0, azimuth=180, ground_reflectance=1.0)
            snow = np.roll(np.array(epw.snow_depth.values, float), -1)
            rho = np.where(snow > 0, SNOW_ALBEDO, BARE_ALBEDO)
            south = s_dir.duplicate()
            south.values = list(np.array(s_dir.values) + np.array(s_dif.values) + np.array(s_ref.values) * rho)
            comfort_out[sid] = comfort(epw, wea, south)
            if sid == PRIMARY and horizon:
                terrain = terrain_shading(wea, horizon)
            print(f"{sid}: {annual['meanT']} °C mean, HDD18 {annual['hdd18']}, min {annual['minT']} °C, "
                  f"prevailing {rose['annual']['prevailing']} / DJF {rose['DJF']['prevailing']}")
    sun = sun_data(site, horizon)
    if horizon:
        sun['horizon'] = horizon
        sun['terrainShading'] = terrain
    hz = hazards_summary(site)
    findings = load_findings()
    prim = next(s for s in stations if s['id'] == PRIMARY)
    platt = next(s for s in stations if s['id'] != PRIMARY)
    climate = {
        'schemaVersion': 1,
        'generatedBy': 'scripts/prepare-climate.py',
        'libraries': {p: metadata.version(p) for p in ('ladybug-core', 'ladybug-comfort', 'numpy', 'rasterio', 'pyproj')},
        'site': {
            'name': 'Chazy Lake Road, Dannemora · proposed Lot 1 (research candidate)',
            'lat': site['lat'], 'lon': site['lon'], 'elevation': site['elevation'],
            'elevationDatum': 'NAVD88 m from the 2014–15 USGS 1 m DEM at the provisional house centroid',
            'timezone': 'UTC−5 (EST) standard time throughout; EDT (UTC−4) applies Mar–Nov but is not used in any data here',
            'source': 'Centroid of the "house" feature in sources/dannemora/permit-layout-provisional.geojson (provisional county-GIS fit; not surveyed)',
            'house': site['house'], 'groundAtHouse': site['groundAtHouse'],
            'primaryStation': PRIMARY,
            'rationale': (f"Saranac Lake ({prim['elevation']} m) is within {abs(prim['elevationDiffM'])} m of the site elevation and, like the site, "
                          f"sits in Adirondack upland terrain; Plattsburgh ({platt['elevation']} m) is closer ({platt['distanceKm']} km vs {prim['distanceKm']} km) "
                          f"but {abs(platt['elevationDiffM'])} m lower on the Champlain valley floor, ~2.4 °C warmer. Use Saranac Lake for temperature, heating, snow "
                          "and comfort; treat both stations' winds as bounds because the site lies between the Champlain valley "
                          "(N–S channelled) and the upland (SW-dominated) regimes."),
            'limits': ('TMYx is a composite typical year (months drawn from 2011–2025), not site observations; it under-represents extremes. '
                       'Station winds are 10 m airport winds in open terrain — the site is a forest clearing on a slope, so speeds will be '
                       'lower and directions steered by terrain. Canopy shading, cold-air pooling and lake effects are not modelled.'),
        },
        'stations': stations,
        'surfaceIrradiance': {
            'primaryStation': PRIMARY,
            'units': 'kWh/m² (monthly and annual totals of hourly Wh/m²)',
            'method': (f'ladybug-core Wea.from_epw_file → directional_irradiance (isotropic sky). Ground reflectance {SNOW_ALBEDO} in hours '
                       f'with EPW snow depth > 0, otherwise {BARE_ALBEDO} ("annualConstantAlbedo02" keeps {BARE_ALBEDO} all year). '
                       'No terrain, canopy or self-shading; see sun.terrainShading for the terrain beam loss.'),
            'surfaces': SURFACES + [
                {'id': 'wall-permit-SE', 'label': 'Permit house long wall facing SE (provisional orientation)', 'tiltDeg': 90,
                 'azimuthDeg': site['house']['longFacadeAzimuthsDeg'][0]},
                {'id': 'wall-permit-NW', 'label': 'Permit house long wall facing NW (provisional orientation)', 'tiltDeg': 90,
                 'azimuthDeg': site['house']['longFacadeAzimuthsDeg'][1]}],
            'values': irr_values,
        },
        'sun': sun,
        'comfort': {
            'categories': [{'id': c[0], 'label': c[1], 'minC': None if c[2] == -math.inf else c[2],
                            'maxC': None if c[3] == math.inf else c[3]} for c in UTCI_CATEGORIES],
            'method': ('ladybug-comfort UTCI on every EPW hour. "Shade" sets mean radiant temperature equal to air temperature. '
                       '"Sun" uses ladybug-comfort OutdoorSolarCal MRT (person fully exposed, surroundings at air temperature). '
                       'Station 10 m wind is used directly in the exposed case; sheltered cases fix wind at 0.5 m/s (UTCI minimum) to '
                       'bound what a windbreak or courtyard could achieve.'),
            'byStation': comfort_out,
        },
        'windRoseFormat': {
            'directions': DIRS16, 'sectorWidthDeg': 22.5,
            'directionMeaning': 'direction the wind blows FROM, degrees clockwise from true north; sector 0 = N (348.75–11.25°)',
            'speedBins': SPEED_BINS,
            'freqPct': 'freqPct[direction][bin] for the 5 non-calm bins (0.5–2 … >8 m/s), % of ALL hours in the period; calmPct is separate, so the rose sums to 100 %',
            'periods': {'annual': 'all hours', 'DJF': 'Dec–Feb', 'MAM': 'Mar–May', 'JJA': 'Jun–Aug', 'SON': 'Sep–Nov',
                        'coldBelowMinus10': 'all hours with air temperature < −10 °C (the winds that drive heat loss and drifting)'},
            'method': 'Computed directly with NumPy from EPW wind speed/direction; annual prevailing direction cross-checked with ladybug WindRose (16 directions).',
        },
        'hazards': hz,
        'findings': findings,
    }
    js = "'use strict';\nconst SITE_CLIMATE = " + json.dumps(climate, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (ROOT / 'climate-data.js').write_text(js)
    ref = {'generatedBy': 'scripts/prepare-climate.py', 'libraries': climate['libraries'], 'site': climate['site'],
           'stations': station_ref,
           'summary': [{k: s[k] for k in ('id', 'name', 'elevation', 'distanceKm', 'period', 'annual', 'thresholds', 'design')} for s in stations]}
    (CLIMATE / 'climate-reference.json').write_text(json.dumps(ref, indent=2, ensure_ascii=False) + '\n')
    (CLIMATE / 'sun-reference.json').write_text(json.dumps(
        {k: sun[k] for k in ('timeConvention', 'angleConvention', 'algorithm', 'location', 'keyDatesFormat', 'keyDates')},
        indent=1, ensure_ascii=False) + '\n')
    if findings:
        write_findings_md(findings)
    size = len(js.encode())
    print(f'Wrote climate-data.js ({size / 1024:.0f} KB); findings: {len(findings["findings"]) if findings else 0}')
    assert size < 1.5e6, 'climate-data.js too large'


if __name__ == '__main__':
    sys.exit(main())
