"""Fit a provisional survey-image-to-county-GIS overlay, with explicit diagnostics.

The inputs are manually identified matching parent-boundary corners. This is
not surveyed control, cadastral reconciliation, or an absolute accuracy test.
"""
import json
import math
from pathlib import Path

import numpy as np
from osgeo import osr

ROOT = Path(__file__).resolve().parents[1]
osr.UseExceptions()


def transform(source, target):
    a, b = osr.SpatialReference(), osr.SpatialReference()
    a.ImportFromEPSG(source)
    b.ImportFromEPSG(target)
    a.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    b.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(a, b)


parcel = json.loads((ROOT / 'sources/dannemora/county-parent-parcel.geojson').read_text())
ring = parcel['features'][0]['geometry']['coordinates'][0]
to_utm = transform(4326, 26918)
to_wgs = transform(26918, 4326)
# Source coordinates refer to the archived 2600 x 2009 survey preview.
controls = [
    ('First access strip, west upper corner', 1439, 595, 10),
    ('First access strip, east upper corner', 1496, 588, 11),
    ('First access strip, west lower corner', 1442, 821, 9),
    ('Second access strip, west upper corner', 1828, 615, 16),
    ('Second access strip, east upper corner', 1885, 612, 17),
    ('Second access strip, west lower corner', 1831, 773, 15),
    ('Second access strip, east lower corner', 1887, 784, 18),
    ('Eastern boundary upper bend', 2075, 812, 20),
    ('Lot 1 eastern inset', 2009, 1368, 27),
    ('Lot 1 Garmish frontage upper corner', 2172, 1390, 28),
    ('Lot 1 southern road corner', 2155, 1543, 31),
]
A, B = [], []
for name, x, y, index in controls:
    east, north, _ = to_utm.TransformPoint(*ring[index])
    A.extend([[x, y, 1, 0], [-y, x, 0, 1]])
    B.extend([east, north])
A, B = np.array(A), np.array(B)
params = np.linalg.lstsq(A, B, rcond=None)[0]
errors = np.linalg.norm((A @ params - B).reshape(-1, 2), axis=1)
loo = []
for i in range(len(controls)):
    keep = np.ones(len(A), bool)
    keep[i * 2:i * 2 + 2] = False
    fit = np.linalg.lstsq(A[keep], B[keep], rcond=None)[0]
    loo.append(float(np.linalg.norm(A[i * 2:i * 2 + 2] @ fit - B[i * 2:i * 2 + 2])))
a, b, tx, ty = params


def utm(x, y):
    return a * x + b * y + tx, b * x - a * y + ty


def geographic(points):
    return [list(to_wgs.TransformPoint(*utm(x, y))[:2]) for x, y in points]


lot = [[1778,1108],[2031,1145],[1997,1304],[2009,1368],[2172,1390],[2155,1543],[1684,1476],[1778,1108]]
house = [[1878,1397],[1894,1397],[1894,1442],[1878,1442],[1878,1397]]
features = []
for id_, label, points in [('lot1', 'Approximate Lot 1 survey boundary', lot), ('house', 'Approximate permit house footprint', house)]:
    features.append({'type':'Feature', 'properties':{'id':id_, 'label':label, 'status':'Provisional county-GIS fit; not surveyed coordinates', 'source':'APA2025-0137 page9', 'proposalYear':2025}, 'geometry':{'type':'Polygon', 'coordinates':[geographic(points)]}})
(ROOT / 'sources/dannemora/permit-layout-provisional.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features}, indent=2))
record = {
    'revision':'PA-2026-10-18-01', 'date':'2026-10-18',
    'method':'Least-squares 2D similarity, accounting for image rows increasing southward; source survey image pixels to EPSG:26918 metres, then WGS84 for display',
    'sourceImage':'assets/sites/dannemora/subdivision-survey.png',
    'targetGeometry':'sources/dannemora/county-parent-parcel.geojson',
    'sourcePermit':'https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf#page=9',
    'crs':'EPSG:26918 NAD83 / UTM18N metres', 'parameters':params.tolist(),
    'rmsFitResidualMeters':float(np.sqrt(np.mean(errors**2))), 'maxFitResidualMeters':float(errors.max()),
    'leaveOneOutRmsMeters':float(np.sqrt(np.mean(np.array(loo)**2))), 'leaveOneOutMaxMeters':max(loo),
    'controls':[{'name':c[0], 'sourcePixel':list(c[1:3]), 'countyRingVertex':c[3], 'targetLonLat':ring[c[3]], 'fitResidualMeters':float(errors[i]), 'leaveOneOutResidualMeters':loo[i]} for i,c in enumerate(controls)],
    'traces':{'lot1SourcePixels':lot, 'houseSourcePixels':house},
    'limitations':[
        'All controls come from approximate county tax GIS; no independent surveyed checkpoints or direct aerial ground control.',
        'Fit residual and leave-one-out values measure internal agreement, not absolute or legal boundary accuracy.',
        'Lot 1 lineage and recorded subdivision are not reconciled; house and lot are manually traced from a reduced drawing.',
        'Overlay depicts the 2025 proposal on 2014/2020/2024 imagery; not proof of historical boundary, construction, or permit validity.',
        'House dimensions and location are controlled by original permit drawing, not display coordinates.',
        'Well, septic, clearing and wetland boundaries are not transferred by this registration.'
    ]}
(ROOT / 'sources/dannemora/permit-aerial-registration.json').write_text(json.dumps(record,indent=2))
print(json.dumps({k:record[k] for k in ['rmsFitResidualMeters','maxFitResidualMeters','leaveOneOutRmsMeters','leaveOneOutMaxMeters']}))
