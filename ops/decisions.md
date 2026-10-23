# Decisions and open questions

Updated: 2026-10-18. This log distinguishes the user's request, direction from the supplied conversation, and proposed implementation defaults.

## Established direction

| ID | Direction | Basis |
| --- | --- | --- |
| D-001 | Start planning in this repository; maintain project state in `ops/` | Current user request and workspace instructions |
| D-002 | Frame the work as a six-week residential design and software experiment | Supplied conversation; calendar and capacity still unset |
| D-003 | Make a narrow address-to-envelope prototype the first milestone | Supplied conversation |
| D-004 | Aim for a schematic package with explicit review gaps | Supplied conversation |
| D-005 | Keep geometry and structured building data authoritative over images | Supplied conversation |
| D-006 | Have the user create the initial three spatial concepts; use AI as critic | Supplied learning approach |

## Proposed defaults

| ID | Recommendation | Reason / revisit trigger |
| --- | --- | --- |
| P-001 · superseded recommendation | Original NYC-first default replaced by a Dannemora data exercise recommendation | Rural-site exploration has supplied survey, septic and elevation evidence. This does not select the final project site |
| P-002 | Keep the house brief provisional until the parcel is chosen | A weekend-home brief may not suit an urban lot; avoid quietly treating them as interchangeable |
| P-003 | Begin local and file-based, with a small Python geometry pipeline | One project does not yet need hosted infrastructure; revisit on deployment or multiple-project needs |
| P-004 | Allow manual imports and reviewed rule entry | Demonstrates the workflow before brittle automation |
| P-005 | Defer detailed energy and structural integrations | Prioritize dependable geometry and evidence over breadth |

## Decisions needed, in order

1. **Site direction:** Dannemora is now the recommended first reconstruction exercise, based on recovered survey, septic and terrain inputs. Final project-site selection remains open; see [current findings](site-findings.md). Philipstown remains an alternative closer to the original house scale.
2. **Exact parcel and jurisdiction:** choose only after checking boundary data, source availability, and manageable constraints. No listing or example in the source conversation is selected.
3. **Time and budget:** kickoff date, weekly hours, experiment spending ceiling, and fictional construction budget.
4. **Client program:** occupants, guest patterns, workspace needs, area definition, and ranked tradeoffs.
5. **Modeling workflow:** existing tools / licenses and the simplest demonstrated route to semantic IFC.
6. **Implementation stack:** confirm after a parcel-data and geometry spike; no framework commitment yet.
7. **Review access:** whether and when to arrange an architect's critique or specialist review. Outreach requires authorization.

## Recording later decisions

Add date, decision, status, rationale, alternatives considered, evidence, and consequences. Mark superseded decisions explicitly. Move answered questions into the log and update the brief, roadmap, and backlog so they describe the same project.

## Implementation decisions — 2026-10-18

| ID | Decision | Basis / consequences |
| --- | --- | --- |
| D-007 | Build a static project-management site in this repository | User requested HTML, CSS, and JS now; Rails remains a possible later direction |
| D-008 | Use five reusable stages with separate checks, decisions, tools, and package views | Reflects the requested path from site feasibility through final modeling and renderings |
| D-009 | Store projects locally and provide versioned JSON export/import | Static implementation default; repository files are not updated when a user edits a project |
| D-010 | Record tool results manually; let decisions flag affected work for review | Provides the management workflow before actual backend pipelines exist |

The site choice, modeling tools, analysis workers, and future backend are still unresolved.

## Naming and structural review — 2026-10-18

- Rename the workspace Groundwork; retain the existing storage key and v1 JSON compatibility to preserve saved work.
- Label the existing structural check **Structural feasibility** and show it in the overview, concept exploration, and design/modeling reviews. This is early review of structural assumptions, with engineering questions captured alongside evidence and model revision. It remains a manual check; structural design and certification are outside the static workspace.

## Evidence and handoff — 2026-10-18

- Use `ops/site-findings.json` as the current structured candidate findings record. Stable IDs SF-001–SF-008 connect facts, uncertainties, source files and consequences for later stages. Regenerate the Markdown handoff and browser data with `python3 scripts/prepare-site-findings.py` after updates.
- The Overview research summary and Findings page describe completed acquisition / generated terrain separately from manual project check states. A researched candidate is not a selected project site or completed feasibility review.
- Keep public archived data and the local terrain viewer as the current implementation. No paid GIS integration or backend choice is required yet. Exact Lot 1 alignment precedes parcel-specific pad, access and quantity work.

## Practice permit and site climate — 2026-10-20

| ID | Decision | Basis / consequences |
| --- | --- | --- |
| D-011 | Design under **practice permit PP-01**, a fictional alternative to APA 2025-0137 for Lot 1 | User request, for learning. 2 adults + 2 kids; ~2,200 sq ft over 2 storeys; footprint ≤ 1,600 sq ft; height ≤ 30 ft (condition 9 measuring rule); clearing ≤ 0.75 ac; setbacks 50 ft road / 25 ft side-rear / 100 ft wetland; well ≥ 100 ft from absorption field; septic sized for 4 bedrooms. Real conditions 13, 14, 16 and 17 kept. The real permit record is unchanged. Source of truth: `ops/practice-permit.json` |
| D-012 | Compute practice setbacks and buffers on the provisional display traces | Explicit learning exception: survey fit 3.1 m RMS against county GIS; C1→survey fit 0.64 m RMS on 12 wetland flags. Never use for real setback, earthwork or terrain calculations. Wetland setback measured from the closed survey wetland polygon (including the stream edge); practice well kept at the C1 location |
| D-013 | Use Saranac Lake TMYx (726228, 507 m) as the primary weather file | Elevation match to the site (~481 m). Saranac and Plattsburgh winds are treated as bounds until on-site wind data exists (CF-001, CF-003) |
| D-014 | Treat W–NW as the weather side and E–SE–S as the entry / outdoor side for layout studies | CF-003, CF-008. Code design values (snow, wind, frost) wait for the Town of Dannemora's R301.2(1) table (CF-007, CF-012) |
| D-015 | Adopt `SITE_3D`: 2 m terrain + canopy grid around Lot 1 from full-density USGS EPT | EPT heights confirmed NAVD88 (median −0.001 m vs DEM). Canopy = all unclassified returns (no vegetation classes delivered). Raw LAZ (70 MB) gitignored; manifest with sha256 committed. See `ops/canopy.md` |
| D-016 | Use vendored Three.js r147 (UMD) for the 3D sun/season viewer | Classic scripts keep `file://` and offline use working; no CDN at runtime |

## Hydepark Home — 2026-10-22

| ID | Decision | Basis / consequences |
| --- | --- | --- |
| D-017 | Add **Hydepark Home** (5418 & 5420 S. Kimbark Ave, Chicago) as its own project with its own site evidence | User request. Same five stages, tasks, checks, deliverables and tools as every project; a `siteKey` selects Hydepark site tabs instead of the shared Dannemora research. Seeded once into existing workspaces (`state.seeds`) and set active |
| D-018 | Treat all of Lot 25 (north + south halves) as the working site, about 40 × 175 ft and 6,960 sq ft by plat areas | Two plats (2014, 2018). Working envelope only: zoning lot status, ownership and the 171.51 vs 175.00 ft shared line (HP-003) are unresolved |
| D-019 | Keep the raw plat PDFs local (gitignored) and mask the client name on the app images | The repo is public; the 2014 plat prints a private client's name in its ordered-by line. Surveyor and firm credits stay |
| D-020 | Design Lot 25 as **one site** (both halves, about 40 × 175 ft, 6,960 sq ft) | Customer, 2026-10-22: the parcels are not yet combined but will be before construction. Zoning and massing studies use the combined lot; applications cite both PINs until the consolidation is recorded (HP-009) |
