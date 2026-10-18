# Architecture planning

A six-week experiment in residential architecture and software: design a house for a fictional client on a real parcel, while building tools that make the design easier to evaluate.

The first software milestone is an **address-to-buildable-envelope prototype**: select a parcel, assemble a sourced feasibility report, visualize supported restrictions, and manually place a simple building volume for preliminary feedback.

This repository contains the planning baseline and Groundwork, a static project-management workspace. No parcel has been selected and no regulatory feasibility determination has been made. Dannemora is a documented data exercise, with archived imagery and an initial terrain pipeline. The schedule is relative to project kickoff; calendar dates are not committed.

## Run the workspace

Open `index.html` directly, or serve the repository locally for a stable browser-storage origin:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open [Groundwork](http://localhost:4173). No installation, build step, account, or external scripts are required. Keep the same hostname and port between sessions; browser storage is specific to the origin. The running development preview may use `127.0.0.1`, which has separate storage from `localhost`.

Each new project includes five stages, editable checklists and notes, stage references, seven check categories, six deliverables, and candidate tool links. Record a decision and select affected checks / deliverables to flag them for review. Updating a review clears its flag; previous decisions remain in the log. Marking a stage complete is a separate manual action from completing its tasks.

Data saves in this browser's local storage, not in repository files. Use **Export JSON** for backups or transfer; **Import JSON** validates the v1 format and adds copies without overwriting existing projects. References are HTTP(S) links to externally stored work; this version does not upload files or launch analysis jobs. The Site feasibility terrain tab displays precomputed geospatial derivatives. A source, link, findings, and model/input revision are required to record a passing check or ready deliverable.

The initial Hudson Valley House is explicitly an example, with every stage and check unstarted. Create your own project or edit its brief to use it as your working record.

The static entry points are `index.html`, `styles.css`, and `app.js`. Exported records carry a schema version and stable IDs for a future backend. There are no framework dependencies or backend services yet. The existing `fieldwork.workspace.v1` storage key is retained so the Groundwork rename preserves saved projects and older JSON exports remain compatible. Structural feasibility is visible on the overview and in both concept and modeling reviews.

## Start here

| Document | Purpose |
| --- | --- |
| [Project brief](ops/brief.md) | Goals, fictional client, scope, and success criteria |
| [Six-week roadmap](ops/roadmap.md) | Weekly deliverables and completion gates |
| [First milestone](ops/milestone-01.md) | Concrete behavior and acceptance criteria for the prototype |
| [Technical plan](ops/architecture.md) | Data ownership, components, and proposed implementation approach |
| [Decisions and questions](ops/decisions.md) | Working defaults, unresolved choices, and decision history |
| [Backlog](ops/backlog.md) | Ordered work and current status |
| [Evidence and review](ops/evidence.md) | Sources, uncertainty, reproducibility, and professional review |

Maintain durable project state in `ops/`. Update the backlog and decision log as work progresses.

## Original context

The two supplied conversations are preserved verbatim in [sources](sources/):

- [Residential architecture workflow](sources/01-residential-architecture-workflow.txt)
- [Six-week experiment](sources/02-six-week-experiment.txt)

The conversations are planning inputs, not verified technical references. Their tool suggestions, external links, and regulatory examples need research before use. The example rear setback and property listing do not establish constraints or select a site.

## Site evidence and terrain

Site feasibility has separate Overview, Aerial imagery, Terrain & slopes, Plans & annotations, Sources & gaps, and Findings tabs. Shared Dannemora research never changes a project's selected site or manual check states.

The terrain tab displays a native 1 m historical USGS DEM, slope / elevation / hillshade maps, a rotatable local 3D surface, reference profiles, and downloadable 2 m contours. It runs without accounts, external scripts or API keys. Context layers and two candidate weather files are archived. See [Terrain acquisition and next steps](ops/terrain.md) for provenance, regeneration, reuse from mapping-race-courses, and unresolved accuracy / boundary issues.
