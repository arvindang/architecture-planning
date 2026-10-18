'use strict';
const SITE_FINDINGS = {
  "revision": "SF-2026-10-18-03",
  "updated": "2026-10-18",
  "site": "Chazy Lake Road, Dannemora · proposed Lot 1",
  "status": "Research candidate; project site not selected",
  "recommendation": "Continue the Dannemora reconstruction. We have enough historical evidence for terrain and site-context exploration; reconcile Lot 1 before parcel-specific layout or quantities.",
  "scope": "Shared candidate research, independent of each project's selected site, checklist, decisions and manual review states. Historical evidence does not establish current site conditions or completed feasibility.",
  "completed": [
    "Compared Dannemora and Philipstown; archived the Dannemora permit, survey and septic drawings.",
    "Matched county parent parcel 185.2-2-48; collected 2014, 2020 and 2024 aerials and a georeferenced 2024 imagery tile.",
    "Acquired native 1 m historical bare-earth elevation and generated slope, hillshade, contours, profiles and an interactive 3D view.",
    "Archived wetland, land-classification and water context, partial FEMA results and two candidate climate files.",
    "Added focused permit-drawing images showing Lot 1, house, clearing reference and proposed services. A provisional county-GIS fit now displays Lot 1 and house on all aerial views; well, septic, clearing and wetlands remain on their source drawings."
  ],
  "findings": [
    {
      "id": "SF-001",
      "topic": "Parcel identity & alignment",
      "status": "Provisional display alignment",
      "finding": "County parent 185.2-2-48 is matched and reports 18.6 acres. The permit covers roughly 22 acres across four parcels and a proposed 2.4-acre Lot 1. A provisional 11-corner similarity fit now places the traced Lot 1 / house on aerials: 3.1 m RMS fit residual, maximum 7.6 m; leave-one-out maximum 11.6 m. All targets are county tax GIS, not independent survey control.",
      "implication": "Use dashed purple Lot 1 and orange house overlays for orientation only. The fit does not settle parcel lineage, legal boundaries or absolute position; recorded instruments and independent checkpoints are still required before pad, setback or quantity calculations. Retain the permit Lot 3 parcel-reference discrepancy as unresolved.",
      "sources": [
        {
          "label": "Parent geometry",
          "href": "sources/dannemora/county-parent-parcel.geojson"
        },
        {
          "label": "Permit / survey, page 9",
          "href": "sources/dannemora/apa-2025-0137.pdf#page=9"
        },
        {
          "label": "Provisional registration method and diagnostics",
          "href": "sources/dannemora/permit-aerial-registration.json"
        },
        {
          "label": "Provisional display geometry",
          "href": "sources/dannemora/permit-layout-provisional.geojson"
        }
      ]
    },
    {
      "id": "SF-002",
      "topic": "Terrain & gradients",
      "status": "Derived from historical data",
      "finding": "Native 1 m USGS DEM covers the buffered study rectangle with no missing cells. Source flight window is 2014–15; horizontal reference is EPSG:26918 and heights are NAVD88 metres. Slope, hillshade, 2 m contours, profiles and a simplified 3D mesh are generated.",
      "implication": "Use for preliminary landform exploration. Full-view statistics include neighbouring land and hydroflattened lake, not only the parcel. Cell size and contour interval do not establish accuracy; no current survey, parcel-specific slope analysis or cut/fill estimate exists.",
      "sources": [
        {
          "label": "Elevation provenance & quality",
          "href": "sources/dannemora/terrain/terrain-manifest.json"
        },
        {
          "label": "Terrain grid & methods",
          "href": "assets/sites/dannemora/terrain/terrain-grid.json"
        }
      ]
    },
    {
      "id": "SF-003",
      "topic": "Imagery & current conditions",
      "status": "Historical imagery collected",
      "finding": "2014, 2020 and 2024 site aerials plus a wider 2024 context view are archived. All predate the November 2025 permit. Nearby roofs visible in 2024 lie outside the displayed parent polygon and are not confirmed as the survey's accessory buildings.",
      "implication": "Compare historical changes without inferring present construction or hidden utilities. The overlaid 2025 proposal is later than every photograph. Obtain current photos and records and independently check the county-GIS fit before transferring additional features; well, septic and clearing remain on source drawings.",
      "sources": [
        {
          "label": "Imagery dates, extents & requests",
          "href": "sources/dannemora/imagery-manifest.json"
        },
        {
          "label": "Original native imagery metadata",
          "href": "sources/dannemora/e_06662148_12_22500_4bd_2024.jp2.aux.xml"
        }
      ]
    },
    {
      "id": "SF-004",
      "topic": "Well, septic, access & ground",
      "status": "Proposal documented",
      "finding": "C1/C2 show a proposed well, 1,000-gallon septic tank, absorption field and a required driveway shift. C1 includes localized deep-hole and percolation observations from July 14, 2025. Installed condition, electrical routing and service capacity remain unverified.",
      "implication": "Carry the driveway/septic conflict into concept planning once aligned. Keep proposed and existing features distinct. Septic tests do not establish foundation bearing, whole-site groundwater, rock depth or structural feasibility.",
      "sources": [
        {
          "label": "C1 site plan, page 7",
          "href": "sources/dannemora/apa-2025-0137.pdf#page=7"
        },
        {
          "label": "C2 details, page 8",
          "href": "sources/dannemora/apa-2025-0137.pdf#page=8"
        }
      ]
    },
    {
      "id": "SF-005",
      "topic": "Wetlands, water & flood context",
      "status": "Screening evidence collected",
      "finding": "The survey and C1 document wetland flags. APA wetland/land-classification, NWI and USGS water layers are archived. FEMA returned AOI zone X attributes, but its flood-zone geometry request failed; availability polygons are not flood zones. DEC freshwater wetland mapping excludes Adirondack Park.",
      "implication": "Retain permit delineation separately from coarser inventories. Map absence or zone X does not resolve site drainage or wetland jurisdiction. Review effective flood records and mapped context against the aligned lot and current field evidence.",
      "sources": [
        {
          "label": "Context acquisition, counts & failures",
          "href": "sources/dannemora/terrain/context-acquisition.json"
        },
        {
          "label": "FEMA attributes",
          "href": "sources/dannemora/terrain/fema-flood-zones-attributes.json"
        },
        {
          "label": "Survey wetland evidence, page 9",
          "href": "sources/dannemora/apa-2025-0137.pdf#page=9"
        }
      ]
    },
    {
      "id": "SF-006",
      "topic": "House brief & permit scope",
      "status": "Historical proposal documented",
      "finding": "APA permit 2025-0137, issued November 25, 2025, describes a 14 × 40 ft dwelling (560 sq ft) with a 15 ft height limit. This is substantially smaller than the original approximately 1,500 sq ft learning brief. Recordation, other approvals and present validity are unchecked.",
      "implication": "Use the documented house as a reconstruction benchmark. Condition 9 fixes its location and dimensions; changing either needs prior written APA authorization. Clearing limits and wetland conditions further constrain activity. The 2.4-acre lot is not a 2.4-acre construction envelope. A larger alternative is a separate hypothetical design; permit recordation and other approvals remain unchecked.",
      "sources": [
        {
          "label": "Original APA permit",
          "href": "sources/dannemora/apa-2025-0137.pdf"
        },
        {
          "label": "Annotated Lot 1 survey view",
          "href": "assets/sites/dannemora/lot1-permitted-layout.svg"
        },
        {
          "label": "Annotated house and services view",
          "href": "assets/sites/dannemora/house-services-permitted-layout.svg"
        }
      ]
    },
    {
      "id": "SF-007",
      "topic": "Climate, sun & energy",
      "status": "Inputs collected; analysis pending",
      "finding": "Two TMYx 2011–2025 weather candidates are archived: Plattsburgh airport at 71 m and Saranac Lake airport at 507 m. Neither file is selected or analyzed. No Ladybug sun, terrain-shadow or building-energy simulation has run.",
      "implication": "Compare station elevation, distance and lake/upland climate before choosing an EPW. Use actual site coordinates for sun paths; add terrain and explicit seasonal canopy assumptions for shadows. Building energy needs a defined building and systems.",
      "sources": [
        {
          "label": "Weather candidate metadata",
          "href": "sources/dannemora/terrain/weather-candidates.json"
        }
      ]
    },
    {
      "id": "SF-008",
      "topic": "Point cloud & pipeline readiness",
      "status": "Tile verified; download deferred",
      "finding": "Classified LiDAR tile 18TWQ592953, its header and public EPT access are verified. The full point-cloud transfer was slow and deferred. The adjacent mapping-race-courses repo supplies a usable GIS runtime and acquisition patterns; this repo has a reproducible terrain-derivative script.",
      "implication": "No account or paid API is needed for the initial workflow. Acquire a local cloud clip and audit ground coverage/classification before canopy or fine-scale ground analysis. Adapt coordinate handling and non-wrapping profiles rather than copying race-track assumptions.",
      "sources": [
        {
          "label": "Tile header record",
          "href": "sources/dannemora/terrain/nys-las-header.json"
        },
        {
          "label": "Point-cloud access & source record",
          "href": "sources/dannemora/terrain/terrain-manifest.json"
        },
        {
          "label": "Pipeline and next steps",
          "href": "ops/terrain.md"
        }
      ]
    }
  ],
  "nextActions": [
    {
      "title": "Validate Lot 1 registration",
      "detail": "Check the provisional county-GIS display fit against independent surveyed control and recorded subdivision, reconcile parcel lineage and report absolute/alignment limits before measured site placement.",
      "findingIds": [
        "SF-001",
        "SF-003"
      ]
    },
    {
      "title": "Confirm the design brief",
      "detail": "Choose the documented 560 sq ft benchmark or keep a larger fictional alternative explicit; retain site selection as an open decision.",
      "findingIds": [
        "SF-006"
      ]
    },
    {
      "title": "Check present conditions & terrain quality",
      "detail": "Recover current/as-built records and photos, acquire a classified cloud clip, and assess ground gaps before pad or earthwork studies.",
      "findingIds": [
        "SF-002",
        "SF-003",
        "SF-004",
        "SF-008"
      ]
    },
    {
      "title": "Complete environmental inputs",
      "detail": "Review aligned wetland/flood evidence, acquire soil/geology screening and choose a representative weather file before running solar/climate analysis.",
      "findingIds": [
        "SF-004",
        "SF-005",
        "SF-007"
      ]
    }
  ],
  "handoff": [
    {
      "stage": "Brief & requirements",
      "readiness": "Can proceed provisionally",
      "guidance": "Resolve area target and priorities against the 560 sq ft historical benchmark. Keep budget, occupants and site selection explicit.",
      "findingIds": [
        "SF-006"
      ]
    },
    {
      "stage": "Concept exploration",
      "readiness": "Program studies can begin; site placement awaits alignment",
      "guidance": "Use terrain for context. Locate pads, access, well/septic and wetland constraints only after survey registration; preserve proposed versus existing status.",
      "findingIds": [
        "SF-001",
        "SF-002",
        "SF-004",
        "SF-005"
      ]
    },
    {
      "stage": "Design & modeling",
      "readiness": "Terrain reference available; building design inputs incomplete",
      "guidance": "Preserve CRS, units and vertical datum. A DEM does not establish foundations, structural design or an IFC building model.",
      "findingIds": [
        "SF-002",
        "SF-004",
        "SF-008"
      ]
    },
    {
      "stage": "Solar, cost & final package",
      "readiness": "Not evaluated",
      "guidance": "Select climate and define geometry/canopy for solar. Cost and excavation need explicit quantities and ground assumptions. Carry unresolved evidence into every report.",
      "findingIds": [
        "SF-002",
        "SF-004",
        "SF-006",
        "SF-007"
      ]
    }
  ]
};
