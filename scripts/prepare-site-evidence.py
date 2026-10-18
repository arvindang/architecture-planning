"""Build display metadata and geospatial overlays from archived source files."""
import json, math
from pathlib import Path
root = Path(__file__).resolve().parent.parent
assets = 'assets/sites/dannemora/'
manifest = json.loads((root/'sources/dannemora/imagery-manifest.json').read_text())
parcel = json.loads((root/'sources/dannemora/county-parent-parcel.geojson').read_text())
R = 6378137

def project(lon, lat):
    return R*math.radians(lon), R*math.log(math.tan(math.pi/4+math.radians(lat)/2))

def outline(extent):
    paths=[]
    for ring in parcel['features'][0]['geometry']['coordinates']:
        points=[]
        for lon,lat in ring:
            x,y=project(lon,lat)
            points.append(f'{(x-extent["xmin"])/(extent["xmax"]-extent["xmin"])*1000:.2f},{(extent["ymax"]-y)/(extent["ymax"]-extent["ymin"])*1000:.2f}')
        paths.append('M'+' L'.join(points)+' Z')
    return ' '.join(paths)

items=[]
for entry in manifest:
    year=entry['year']; context='context' in entry['id']
    items.append({
        'id':entry['id'],'group':'imagery','title':f'{year} · '+('Landscape context' if context else 'Site aerial'),
        'file':entry['file'],'width':1600,'height':1600,'date':f'{year} imagery program; exact flight day unverified',
        'source':entry['source'],'credit':entry['credit'],'boundary':outline(entry['response']['extent']),
        'caption':'North-up natural-color orthophotography. '+('Shows the parent tract, surrounding roads and lake.' if context else 'Same extent across all three years; visual comparison only. All images predate the 2025 proposal.'),
        'annotations':([
            {'x':66,'y':58,'title':'Parent tax parcel','kind':'GIS reference','note':'185.2-2-48 from county GIS. This is the larger parent tract, not the 2.4-acre Lot 1 boundary.'},
            {'x':85,'y':19,'title':'Chazy Lake','kind':'Visible in image','note':'Landscape context; shoreline and water levels vary with date.'},
            {'x':32,'y':43,'title':'Chazy Lake Road','kind':'Visible in image','note':'Road corridor along the western side of the parent tract.'}
        ] if context else [
            {'x':79,'y':34,'title':'Nearby roof / structure','kind':'Visible in image','note':'Visible outside the displayed parent GIS outline. Do not assume this is a Lot 1 accessory building; survey-to-aerial reconciliation is pending.'},
            {'x':62,'y':73,'title':'Garmish Street corridor','kind':'Visible in image','note':'Road corridor and approach to the site. No subsurface utilities inferred.'},
            {'x':31,'y':47,'title':'Tree canopy & shadows','kind':'Visible in image','note':'Canopy obscures portions of the ground. Image brightness and shadows are not elevations.'}
        ])
    })

for item in items:
    if item['id'] in ['aerial-2014-site','aerial-2020-site']:
        item['annotations'][0].update(title='Compare with 2024 roofs', kind='Historical comparison', note='The same nearby roof forms are not apparent here in this earlier image. Compare against 2024; construction timing and parcel identity remain unverified.')

plans=[
 {'id':'septic-site-c1','title':'C1 · Septic, well & access','page':7,'date':'August 6, 2025','caption':'Engineering site plan. Pins identify features on the drawing, not installed systems. No aerial alignment has been applied.','annotations':[
  {'x':39.3,'y':57.5,'title':'Septic tank','kind':'Proposed','note':'Proposed 1,000-gallon concrete tank; installation not verified.'},
  {'x':46.8,'y':66.5,'title':'Absorption field & fill','kind':'Proposed','note':'Shallow absorption trenches and fill area. Follow original engineering dimensions and details.'},
  {'x':46.0,'y':37.1,'title':'Well','kind':'Proposed','note':'Proposed well; drawing states minimum separation from distribution box and absorption field.'},
  {'x':37.6,'y':52.1,'title':'House footprint','kind':'Proposed','note':'One-bedroom dwelling in the engineering plan. Not proof of construction.'},
  {'x':51.7,'y':60.0,'title':'Driveway conflict','kind':'Required change','note':'Plan calls for shifting the existing driveway away from the absorption field.'},
  {'x':26.8,'y':42.0,'title':'Wetland flags / stream','kind':'Documented constraint','note':'APA delineation flags and stream line shown on the plan; preserve original mapping.'},
  {'x':45.8,'y':64.1,'title':'Soil & percolation tests','kind':'Documented test','note':'Deep-hole/percolation locations; test table is at upper left. These are localized septic observations.'}
 ]},
 {'id':'subdivision-survey','title':'Survey · Boundaries & wetlands','page':9,'date':'Revised August 18, 2025','caption':'Boundary/subdivision survey by Dean H. Lashway, L.S., P.C. Drawing orientation follows its north arrow. It is not yet georeferenced to the aerials.','annotations':[
  {'x':70.3,'y':61.9,'title':'Lot 1','kind':'Survey reference','note':'Proposed 2.4-acre building lot. County download still represents the larger parent parcel.'},
  {'x':74.6,'y':67.9,'title':'Accessory buildings','kind':'Documented existing','note':'Two accessory buildings recorded by the survey; current condition unverified.'},
  {'x':70.0,'y':65.8,'title':'Wetland delineation','kind':'Documented constraint','note':'APA wetland line and flagged points. No completeness claim for all wetlands on or adjacent to site.'},
  {'x':81.5,'y':70.3,'title':'Access from Garmish','kind':'Survey reference','note':'Driveway alignment on the survey. Check against C1’s required change.'},
  {'x':8.0,'y':54.7,'title':'Utility symbols in legend','kind':'Survey reference','note':'Survey legend includes utility pole and overhead utility symbols. No verified service capacity or buried electric route.'}
 ]},
 {'id':'septic-details-c2','title':'C2 · Septic construction details','page':8,'date':'August 6, 2025','caption':'Engineering details and hydraulic profile. Diagrams marked N.T.S. must not be measured as scaled site geometry.','annotations':[]}
]
permit='https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf'
for plan in plans:
    items.append({**plan,'group':'plans','file':assets+plan['id']+'.png','width':2600,'height':2009,'source':permit+'#page='+str(plan['page']),'credit':'APA public permit packet; original survey / Moser Engineering drawings'})
(root/'site-evidence-data.js').write_text("'use strict';\nconst SITE_EVIDENCE = "+json.dumps(items,indent=2,ensure_ascii=False)+';\n')
