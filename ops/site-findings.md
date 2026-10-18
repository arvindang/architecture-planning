# Site findings and stage handoff

Revision: SF-2026-10-18-03 · Updated: 2026-10-18

Site: **Chazy Lake Road, Dannemora · proposed Lot 1**

Research candidate; project site not selected

Continue the Dannemora reconstruction. We have enough historical evidence for terrain and site-context exploration; reconcile Lot 1 before parcel-specific layout or quantities.

Shared candidate research, independent of each project's selected site, checklist, decisions and manual review states. Historical evidence does not establish current site conditions or completed feasibility.

Generated from `ops/site-findings.json` by `scripts/prepare-site-findings.py`. Update the JSON and regenerate both browser data and this document.

## Completed

- Compared Dannemora and Philipstown; archived the Dannemora permit, survey and septic drawings.
- Matched county parent parcel 185.2-2-48; collected 2014, 2020 and 2024 aerials and a georeferenced 2024 imagery tile.
- Acquired native 1 m historical bare-earth elevation and generated slope, hillshade, contours, profiles and an interactive 3D view.
- Archived wetland, land-classification and water context, partial FEMA results and two candidate climate files.
- Added focused permit-drawing images showing Lot 1, house, clearing reference and proposed services. A provisional county-GIS fit now displays Lot 1 and house on all aerial views; well, septic, clearing and wetlands remain on their source drawings.

## Findings

### SF-001 — Parcel identity & alignment

Status: Provisional display alignment

County parent 185.2-2-48 is matched and reports 18.6 acres. The permit covers roughly 22 acres across four parcels and a proposed 2.4-acre Lot 1. A provisional 11-corner similarity fit now places the traced Lot 1 / house on aerials: 3.1 m RMS fit residual, maximum 7.6 m; leave-one-out maximum 11.6 m. All targets are county tax GIS, not independent survey control.

**Design consequence:** Use dashed purple Lot 1 and orange house overlays for orientation only. The fit does not settle parcel lineage, legal boundaries or absolute position; recorded instruments and independent checkpoints are still required before pad, setback or quantity calculations. Retain the permit Lot 3 parcel-reference discrepancy as unresolved.

Sources:

- [Parent geometry](../sources/dannemora/county-parent-parcel.geojson)
- [Permit / survey, page 9](../sources/dannemora/apa-2025-0137.pdf#page=9)
- [Provisional registration method and diagnostics](../sources/dannemora/permit-aerial-registration.json)
- [Provisional display geometry](../sources/dannemora/permit-layout-provisional.geojson)

### SF-002 — Terrain & gradients

Status: Derived from historical data

Native 1 m USGS DEM covers the buffered study rectangle with no missing cells. Source flight window is 2014–15; horizontal reference is EPSG:26918 and heights are NAVD88 metres. Slope, hillshade, 2 m contours, profiles and a simplified 3D mesh are generated.

**Design consequence:** Use for preliminary landform exploration. Full-view statistics include neighbouring land and hydroflattened lake, not only the parcel. Cell size and contour interval do not establish accuracy; no current survey, parcel-specific slope analysis or cut/fill estimate exists.

Sources:

- [Elevation provenance & quality](../sources/dannemora/terrain/terrain-manifest.json)
- [Terrain grid & methods](../assets/sites/dannemora/terrain/terrain-grid.json)

### SF-003 — Imagery & current conditions

Status: Historical imagery collected

2014, 2020 and 2024 site aerials plus a wider 2024 context view are archived. All predate the November 2025 permit. Nearby roofs visible in 2024 lie outside the displayed parent polygon and are not confirmed as the survey's accessory buildings.

**Design consequence:** Compare historical changes without inferring present construction or hidden utilities. The overlaid 2025 proposal is later than every photograph. Obtain current photos and records and independently check the county-GIS fit before transferring additional features; well, septic and clearing remain on source drawings.

Sources:

- [Imagery dates, extents & requests](../sources/dannemora/imagery-manifest.json)
- [Original native imagery metadata](../sources/dannemora/e_06662148_12_22500_4bd_2024.jp2.aux.xml)

### SF-004 — Well, septic, access & ground

Status: Proposal documented

C1/C2 show a proposed well, 1,000-gallon septic tank, absorption field and a required driveway shift. C1 includes localized deep-hole and percolation observations from July 14, 2025. Installed condition, electrical routing and service capacity remain unverified.

**Design consequence:** Carry the driveway/septic conflict into concept planning once aligned. Keep proposed and existing features distinct. Septic tests do not establish foundation bearing, whole-site groundwater, rock depth or structural feasibility.

Sources:

- [C1 site plan, page 7](../sources/dannemora/apa-2025-0137.pdf#page=7)
- [C2 details, page 8](../sources/dannemora/apa-2025-0137.pdf#page=8)

### SF-005 — Wetlands, water & flood context

Status: Screening evidence collected

The survey and C1 document wetland flags. APA wetland/land-classification, NWI and USGS water layers are archived. FEMA returned AOI zone X attributes, but its flood-zone geometry request failed; availability polygons are not flood zones. DEC freshwater wetland mapping excludes Adirondack Park.

**Design consequence:** Retain permit delineation separately from coarser inventories. Map absence or zone X does not resolve site drainage or wetland jurisdiction. Review effective flood records and mapped context against the aligned lot and current field evidence.

Sources:

- [Context acquisition, counts & failures](../sources/dannemora/terrain/context-acquisition.json)
- [FEMA attributes](../sources/dannemora/terrain/fema-flood-zones-attributes.json)
- [Survey wetland evidence, page 9](../sources/dannemora/apa-2025-0137.pdf#page=9)

### SF-006 — House brief & permit scope

Status: Historical proposal documented

APA permit 2025-0137, issued November 25, 2025, describes a 14 × 40 ft dwelling (560 sq ft) with a 15 ft height limit. This is substantially smaller than the original approximately 1,500 sq ft learning brief. Recordation, other approvals and present validity are unchecked.

**Design consequence:** Use the documented house as a reconstruction benchmark. Condition 9 fixes its location and dimensions; changing either needs prior written APA authorization. Clearing limits and wetland conditions further constrain activity. The 2.4-acre lot is not a 2.4-acre construction envelope. A larger alternative is a separate hypothetical design; permit recordation and other approvals remain unchecked.

Sources:

- [Original APA permit](../sources/dannemora/apa-2025-0137.pdf)
- [Annotated Lot 1 survey view](../assets/sites/dannemora/lot1-permitted-layout.svg)
- [Annotated house and services view](../assets/sites/dannemora/house-services-permitted-layout.svg)

### SF-007 — Climate, sun & energy

Status: Inputs collected; analysis pending

Two TMYx 2011–2025 weather candidates are archived: Plattsburgh airport at 71 m and Saranac Lake airport at 507 m. Neither file is selected or analyzed. No Ladybug sun, terrain-shadow or building-energy simulation has run.

**Design consequence:** Compare station elevation, distance and lake/upland climate before choosing an EPW. Use actual site coordinates for sun paths; add terrain and explicit seasonal canopy assumptions for shadows. Building energy needs a defined building and systems.

Sources:

- [Weather candidate metadata](../sources/dannemora/terrain/weather-candidates.json)

### SF-008 — Point cloud & pipeline readiness

Status: Tile verified; download deferred

Classified LiDAR tile 18TWQ592953, its header and public EPT access are verified. The full point-cloud transfer was slow and deferred. The adjacent mapping-race-courses repo supplies a usable GIS runtime and acquisition patterns; this repo has a reproducible terrain-derivative script.

**Design consequence:** No account or paid API is needed for the initial workflow. Acquire a local cloud clip and audit ground coverage/classification before canopy or fine-scale ground analysis. Adapt coordinate handling and non-wrapping profiles rather than copying race-track assumptions.

Sources:

- [Tile header record](../sources/dannemora/terrain/nys-las-header.json)
- [Point-cloud access & source record](../sources/dannemora/terrain/terrain-manifest.json)
- [Pipeline and next steps](../ops/terrain.md)

## Next actions, in order

1. **Validate Lot 1 registration** — Check the provisional county-GIS display fit against independent surveyed control and recorded subdivision, reconcile parcel lineage and report absolute/alignment limits before measured site placement. (SF-001, SF-003)

2. **Confirm the design brief** — Choose the documented 560 sq ft benchmark or keep a larger fictional alternative explicit; retain site selection as an open decision. (SF-006)

3. **Check present conditions & terrain quality** — Recover current/as-built records and photos, acquire a classified cloud clip, and assess ground gaps before pad or earthwork studies. (SF-002, SF-003, SF-004, SF-008)

4. **Complete environmental inputs** — Review aligned wetland/flood evidence, acquire soil/geology screening and choose a representative weather file before running solar/climate analysis. (SF-004, SF-005, SF-007)

## Handoff to later stages

### Brief & requirements

Can proceed provisionally

Resolve area target and priorities against the 560 sq ft historical benchmark. Keep budget, occupants and site selection explicit.

Reference: SF-006

### Concept exploration

Program studies can begin; site placement awaits alignment

Use terrain for context. Locate pads, access, well/septic and wetland constraints only after survey registration; preserve proposed versus existing status.

Reference: SF-001, SF-002, SF-004, SF-005

### Design & modeling

Terrain reference available; building design inputs incomplete

Preserve CRS, units and vertical datum. A DEM does not establish foundations, structural design or an IFC building model.

Reference: SF-002, SF-004, SF-008

### Solar, cost & final package

Not evaluated

Select climate and define geometry/canopy for solar. Cost and excavation need explicit quantities and ground assumptions. Carry unresolved evidence into every report.

Reference: SF-002, SF-004, SF-006, SF-007
