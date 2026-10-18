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
