# Technical plan

Status: static project-management frontend implemented in vanilla HTML, CSS, and JavaScript. Analysis architecture below remains proposed; no backend services or analysis dependencies are installed.

## Design principle

Structured site evidence, versioned constraints, a structured client program, and dimensionally accurate model geometry drive results. Renderings and generated prose are derived outputs. An LLM may help organize evidence or critique a design, but it must not silently establish a regulatory rule or measurement.

## Proposed components

| Component | Responsibility |
| --- | --- |
| Project record | Client program, parcel selection, decisions, revisions |
| Evidence store | Source snapshots or references, dates, locators, interpretations, review state |
| Site adapter | Retrieve or import data for the single selected jurisdiction |
| Constraint model | Express supported rules, scope, units, edge assignments, and dependencies |
| Geometry worker | Normalize geometry, derive supported regions, evaluate mass placement |
| Review interface | Parcel, restrictions, mass editing, check feedback, evidence inspection |
| Export pipeline | Report, input manifest, and result revision |
| Later model adapter | Link authoring tools and IFC elements to project requirements and analyses |

Flow: site data + brief → reviewed inputs → geometry / building model → checks → views and reports. A changed input invalidates dependent outputs.

## Recommended starting approach

Start local and file-based for one project. Use Python for the first geometry pipeline and a small browser interface for review. Evaluate Three.js for the 3D viewer when implementation begins. This keeps the first milestone independent of hosted infrastructure and account features.

The conversation suggested Rails + Postgres/PostGIS, Python, and Three.js. Treat that as an option, not a selected stack. Arvin's default for new products is Cloudflare Workers + D1/KV/R2, Stripe, and PostHog. If this becomes a hosted product, evaluate that default first; paid features and analytics are outside the prototype.

Choose a database only when file-backed project records become inadequate. Keep geometry and simulation processing behind a clear input/output boundary so hosting choices do not dictate the analysis engine. Do not assume Python geometry workloads can run inside Workers without validating runtime support.

## Minimum records

| Record | Minimum contents |
| --- | --- |
| Project | ID, brief revision, selected parcel, decision references |
| Parcel | Jurisdiction, parcel ID, boundary, CRS, units, north reference, evidence IDs |
| Evidence | Source, locator, retrieval date, effective-date status, interpretation, review status |
| Constraint | Type, value and units, applicability, edge or datum references, evidence IDs, status |
| Mass | ID, geometry or parameters, position, orientation, units, revision |
| Check result | Check version, input revision, rule IDs, outcome, measurements, explanation, limitations |
| Export manifest | Artifact paths, generating revisions, settings, timestamp, unresolved issues |

Use `pass`, `fail`, `unknown`, and `not_applicable` as check outcomes. Applicability must have a reason. Keep evidence confidence and professional review separate from software outcomes.

## Geometry conventions to settle before coding

- Retain original source geometry and CRS; calculate distances and areas in an appropriate projected system.
- Declare units at every import and conversion boundary.
- Preserve edge labels and their evidence through geometry transformations.
- State whether each area is parcel area, footprint, gross floor area, or room area.
- Record the reference datum for height; do not substitute mass height for a different regulatory definition.
- Reject invalid geometry with an actionable explanation; record any repairs.

## Authoring and analysis after milestone one

Rhino + Grasshopper is the conversation's proposed conceptual workflow; Bonsai + IfcOpenShell is the proposed semantic IFC workflow. Verify licenses, platform support, scripting access, and export fidelity before committing. Avoid requiring a second authoring tool unless a small exchange exercise demonstrates its value.

Evaluate Ladybug for climate / solar studies, Honeybee with Radiance or EnergyPlus for detailed simulation, and IDS for IFC information requirements only at the relevant milestone. These are candidates, not verified integrations.

Store the native authoring revision with each IFC export. Use stable element IDs to connect requirements, quantities, and results, and check for lost identity on re-export.

## Open technical risks

- Parcel data may be inaccurate, incomplete, or unavailable for the preferred site.
- Regulations may have exceptions or definitions beyond the supported geometry model.
- Terrain and height datums can make a simple extrusion misleading.
- Authoring-tool exchange may lose units, semantic objects, or stable identity.
- Useful energy and cost results may require inputs unavailable in six weeks.

Resolve these through narrow import and modeling trials before expanding scope.

## Current static implementation

`index.html`, `styles.css`, and `app.js` implement the management layer. The `fieldwork.workspace.v1` local-storage record contains projects, stage tasks/references, manual check results, deliverables, decisions, tool links, and an activity record. JSON exports include `schemaVersion: 1`; imports validate the structure and append projects under new project IDs.

Each project has a monotonically increasing workspace revision. Check and deliverable records separately identify the model/input revision supplied by the user. Decisions mark explicitly selected dependencies stale; reviewing an affected item clears that flag. This is manual dependency tracking, not automatic model-change detection. Check and deliverable updates retain their latest record; the decision log retains previous choices.

The interface does not fetch parcel data, render project models, run simulations, upload files, or synchronize across browsers. The overview sketch is illustrative. Future pipelines can populate the existing result / evidence / revision concepts, but an authenticated backend and API contract still need implementation.
