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
| P-001 | Start with one NYC parcel for the software prototype | The conversation identifies public-data access as the advantage; validate actual data before selection |
| P-002 | Keep the house brief provisional until the parcel is chosen | A weekend-home brief may not suit an urban lot; avoid quietly treating them as interchangeable |
| P-003 | Begin local and file-based, with a small Python geometry pipeline | One project does not yet need hosted infrastructure; revisit on deployment or multiple-project needs |
| P-004 | Allow manual imports and reviewed rule entry | Demonstrates the workflow before brittle automation |
| P-005 | Defer detailed energy and structural integrations | Prioritize dependable geometry and evidence over breadth |

## Decisions needed, in order

1. **Site direction:** NYC data-first prototype or Hudson Valley house-first experiment? Recommendation: NYC for the first milestone. If the landscape-house design matters more, select Hudson Valley and accept more manual sourcing. Keep one parcel throughout when feasible; record a deliberate change if needed.
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
