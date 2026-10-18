# First project: evidence-led site selection

Research date: 2026-10-18. Status: exploratory shortlist, not a selected site. The parent GIS parcel and historical elevation are now archived; terrain derivatives have been generated. Lot 1 survey registration and current permit/building status remain unresolved. Earlier dated notes below record the acquisition sequence.

## Recommendation

Use a rural residential site with an existing public design/review record as a retrospective benchmark. Reconstruct documented constraints first, then explore a fictional alternative design. Preserve the historical rules and design separately from any current-rule analysis. A historical approval does not transfer to a different design.

The recommended first data exercise is now **Chazy Lake Road, Dannemora, Lot 1**, because its public packet includes the survey and septic drawings. Site selection remains open pending visual review and a current GIS match. **359 East Mountain Road South, Philipstown**, historical tax map ID **17.-3-28**, remains the closer match to the original house brief but requires recovery of the underlying drawings.

## Candidates

### 359 East Mountain Road South — first candidate

- The town's September 19, 2019 agenda describes an approximately 1.58-acre site, RR district, a proposed house and detached garage with private septic and well, and a rear-setback variance granted September 9, 2019.
- September planning-board minutes describe a roughly 1,600-sq-ft two-story passive-solar house, placement chosen for solar gain and reduced grading, and septic matters still pending at that meeting.
- The April application packet contains a pre-application engineering memo, environmental assessment, and deed description. Acreage differs: approximately 1.58 acres in the agenda versus 1.617 acres in the deed description / application. Reconcile rather than silently choose one.
- This offers a useful test of solar orientation versus setbacks, terrain disturbance, access, and pond buffers. Applicant statements and discussion in minutes are not independently verified site facts.
- Missing: final endorsed plan, final approval conditions, actual septic approval record, current parcel match, selected terrain tiles, and suitable weather file. The municipal engineer memo also contains an unrelated address in its introductory text; use the subject, parcel ID, and drawings to reconcile the record.

Sources:

- [April 18, 2019 agenda and application packet](https://philipstown.com/Documents/Conservation%20Planning%20Zoning/Planning%20Board/Documents/Agendas/2019/2019-04-18-PB-Agenda.pdf), PDF pp. 21–24 application, pp. 31–33 engineer memo, pp. 41–42 deed description.
- [September 19, 2019 agenda](https://philipstown.com/Documents/Conservation%20Planning%20Zoning/Planning%20Board/Documents/Agendas/2019/2019-09-19-PB-Agenda.pdf).
- [September 19, 2019 minutes](https://cms3.revize.com/revize/philipstown/Documents/Conservation%20Planning%20Zoning/Planning%20Board/Documents/Minutes/2019/2019-9-19-PB-Minutes.pdf), pp. 9–10. These published minutes identify themselves as subject to board review.

### 120 Skyline Drive — larger-site alternative

Historical tax map ID **16.-1-23.13**, Philipstown. August 2019 application describes a 13.268-acre parcel and a house over 4,000 sq ft. September minutes describe revised placement to avoid regulated steep slopes, a shortened driveway, a ridgeline, and an already-approved septic system as reported by the applicant's representative. It provides a rich site-design record but is a larger design and modeling exercise than our brief. Final approval and underlying septic documentation remain unverified.

Sources:

- [August 15, 2019 agenda and application packet](https://philipstown.com/Documents/Conservation%20Planning%20Zoning/Planning%20Board/Documents/Agendas/2019/2019-08-15-PB-Agenda.pdf).
- September minutes above, pp. 10–12.

### Chazy Lake Road, Dannemora — explicit agency-permit alternative

[APA Permit 2025-0137](https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf), issued November 25, 2025, includes reduced survey/site and septic plans. It describes Lot 1 as 2.4 acres with a proposed 14-by-40-foot dwelling. The parent project involves four parcels and subdivision/merger conditions; wetlands are documented. It has stronger explicit agency authorization evidence, but the small approved dwelling, wetland conditions, and parcel lineage make it a weaker fit for our 1,500-sq-ft first exercise. Permit recordation, other approvals, and current parcel identity remain unchecked.

## GIS acquisition gate

Before committing to a candidate:

1. Match historical tax ID to current county parcel geometry, including splits/mergers and municipality. A Cold Spring postal address does not establish that the lot lies in the Village of Cold Spring.
2. Record polygon, CRS, vintage, units, and area differences against the survey/deed.
3. Obtain the actual site plan with contours, north, scale, access, and relevant constraints; distinguish proposed from approved revisions.
4. Confirm terrain tile coverage, acquisition date, resolution, and horizontal/vertical datums.
5. Recover final decisions and conditions; mark unavailable evidence unknown.

[NYS parcel resources](https://gis.ny.gov/parcels) link to [Putnam County's GIS portal](https://data-pcny.opendata.arcgis.com/). [NYS LiDAR resources](https://gis.ny.gov/node/171) list a 2019 FEMA Putnam/Westchester collection. These establish data leads, not a completed parcel-specific acquisition.

## First environmental pipeline

- Use [ladybug-core](https://github.com/ladybug-tools/ladybug) for EPW weather data and [sun positions](https://www.ladybug.tools/ladybug/docs/ladybug.sunpath.html). The Python core can be used independently of Grasshopper.
- Compute sun paths at the parcel's actual coordinates with explicit north and time convention. A sun path alone does not establish shading on the land.
- Select and document an EPW station/file: location, elevation, vintage, and representativeness. No file has been selected.
- Produce temperature, humidity, wind, and radiation summaries using [EPW fields](https://www.ladybug.tools/ladybug/docs/ladybug.epw.html).
- Add terrain and context geometry for shadow/solar-access studies. Model trees as explicit seasonal assumptions, rather than treating bare-earth terrain as canopy.
- Compare three simple house orientations / placements, including the historical proposal where drawings support reconstruction.
- Defer [Honeybee energy simulation](https://github.com/ladybug-tools/honeybee-energy) until spaces, envelope, glazing, schedules, and systems are defined.

Ladybug weather/solar analysis is one part of environmental feasibility. It does not establish septic suitability, wetland boundaries, flood conditions, geotechnical adequacy, or regulatory compliance.

First deliverable: a sourced site dossier plus terrain/context model, seasonal sun paths, climate summary, and a comparison of three mass placements. No tools have been installed for this research.


## Site feasibility page update — October 18, 2026

The static Site feasibility page now includes a shared research notebook (`site-research.js`) with the candidate comparison, source links, evidence inventory, unknowns, and acquisition sequence. It appears for existing saved projects without overwriting their site, notes, check states or decisions. This is research, not a selection decision or completed feasibility check.

### Dannemora readiness

Start with the boundary/site survey and proposed services, then acquire imagery and elevation data. The survey is not established as a complete topographic survey. The county GIS match, coordinates, exact imagery footprint and elevation tiles have not been obtained. No current installation or construction status is verified.

Source: [APA packet](https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf). PDF page 7 is septic C1; page 8 is C2 details; page 9 is the subdivision survey. Reviewed the rendered drawing sheets as well as extracted text.

- C1 includes a proposed well, septic layout, existing driveway and its required shift, wetland delineation flags and localized soil/percolation tests. These do not prove installed services or foundation suitability across the parcel.
- The approved 560-sq-ft dwelling is substantially smaller than our original brief. Retain the documented proposal as the benchmark; any larger alternative is hypothetical and requires separate review.
- No verified electric routing or service capacity is available. No Ladybug or earthwork analyses have run.
- Permit recordation and current validity remain unchecked. The permit's lot-merger text appears inconsistent between the project description and condition 7 concerning Lot 3; resolve against recorded instruments before treating parcel lineage as settled.

[Google Maps area search](https://www.google.com/maps/search/?api=1&query=Chazy+Lake+Road+and+Garmish+Street%2C+Dannemora%2C+NY) is an orientation link, not a verified Lot 1 pin. [Official Clinton County NY GIS entry](https://clintoncountyny.gov/planning/gis-map) is the next parcel-matching source. Do not confuse it with Clinton County, Pennsylvania.

### First map and terrain workflow

1. Confirm current parcel geometry against survey dimensions and bearings.
2. Acquire dated georeferenced orthophotography; a Google Earth screenshot can serve as visual context, with source attribution retained. Do not assign measurement accuracy based only on the screenshot's scale bar.
3. Georeference the survey with control points and quantify alignment error. Keep existing, proposed and inferred features in separate layers. Store each feature's source, revision/date and confidence.
4. Acquire bare-earth elevation, record acquisition date, resolution, CRS, units and vertical datum, and derive preliminary contours. Compare available surveyed elevation control; do not invent it if absent.
5. Build a Three.js terrain viewer, aerial texture, constraint layers and section profiles, then compare pads/access and approximate cut/fill. Keep canopy distinct from terrain. Earthwork volumes depend on pad/grading assumptions and do not reveal rock or soil stability.
6. Use Ladybug with a documented EPW choice for sun/climate, then model shadows with explicit terrain/canopy assumptions.

Do not broaden the search yet. Reopen it if Lot 1 cannot be matched, drawings cannot be aligned adequately, elevation coverage is unusable, or the small authorized dwelling makes this a poor learning exercise.

## Imagery collection — October 18, 2026

The Site feasibility page now has Aerial imagery, Plans & annotations, Sources & gaps, and Findings tabs. Collected four NYS ortho service exports (2014/2020/2024 site extent plus wider 2024 context), the original 2024 four-band imagery tile ZIP with CRS/world-file metadata, original permit PDF, three rotated drawing previews, and county parcel geometry. Browser overlays are SVG layers; photographic pixels remain unchanged. Annotated septic/well features are confined to C1 pending survey-to-aerial alignment.

The official county web map resolves to ArcGIS item `12630ed4abd34289926d26c06bcb7ce3`. The currently referenced county parcel service is `https://services3.arcgis.com/33FPYaVQYNa7sFJ5/arcgis/rest/services/Parcels_ClintonWeb1_view/FeatureServer/0`. Queried `PRINT_KEY = 185.2-2-48`, retaining parcel ID, address, acreage and geometry. It reports 18.6 acres. The county parcel is drawn as a GIS reference on historical images, not as a verified historical boundary or a surveyed Lot 1 outline. Nearby visible roofs in the 2024 close view fall outside the archived parent GIS outline; do not equate these with the survey's accessory structures. Earlier 2014/2020 frames do not visibly show the same roof forms. Parcel lineage and survey alignment remain unresolved.

The native tile was located using the official ortho index, layer `ind24e_one_ft_4bd` (8), at the site-area point. Tile `e_06662148_12_22500_4bd_2024.jp2` has 1 US survey foot pixels and NAD83(2011) NY East State Plane coordinates in US survey feet. A point intersection establishes this tile as an acquisition lead, not coverage of the entire tract. Full export extents, retrieval dates and source requests are in `sources/dannemora/imagery-manifest.json`. Exact flight dates remain unverified.

No present-day ground photographs, as-built septic/well records, buried utility map, or measured survey-to-aerial registration has been acquired. These remain explicit gaps. NYS lists a 2014/15 Clinton/Essex/Franklin LiDAR collection; exact point-cloud tiles and quality have not been checked. No elevation surface or point cloud was generated. The collected orthophotos are flattened mosaics, not a calibrated overlapping camera sequence for photogrammetric reconstruction.

## Terrain and context collection — October 18, 2026

A native 1 m USGS DEM now covers the buffered site context with 100% finite cells. It is based on 2014–15 LiDAR, not the 2024 publication date. Elevations are NAVD88 metres and horizontal CRS is EPSG:26918. Generated slope, hillshade, elevation maps, 2 m exploratory contours, reference profiles and a simplified 3D mesh. No local point-cloud completeness / classification audit or earthwork volume is available. Full raw-cloud transfer was deferred after a slow download; exact tile and stream endpoints are recorded.

Archived APA wetland and land-classification context, NWI wetland inventory, USGS waterbody/flowlines, FEMA availability and partial flood-zone attributes. FEMA geometry failed and is not displayed as a flood-zone polygon. Two weather candidates (Plattsburgh and Saranac Lake) are archived but unselected. Details and next gates: [terrain.md](terrain.md). This supersedes earlier notes about terrain not yet being acquired; legal Lot 1 registration remains open.
