# Six-week roadmap

The weeks are timeboxes, not promises that every proposed integration will fit. The two-week prototype is the first commitment to scope; later work depends on its outcome and available time. Record start date and weekly time budget at kickoff.

| Week | Architecture learning | Software / artifact | Completion gate |
| --- | --- | --- | --- |
| 1 | Read a site, distinguish mapped data from survey evidence, investigate constraints | Select parcel; site dossier; first sourced rules; basic parcel view | Parcel identity, coordinate reference system, source inventory, and blocking unknowns recorded |
| 2 | Write a client program and sketch three adjacency / floor-plan concepts | Finish envelope prototype; manual mass placement; report and check feedback | First milestone acceptance criteria pass; three human-led concepts and their tradeoffs recorded |
| 3 | Explore orientation, volume, roof form, and sections together | Parametric massing studies; compare design alternatives | Select a direction using explicit criteria; retain rejected options and reasons |
| 4 | Develop dimensions, openings, assemblies, and model semantics | Semantic IFC model; first consistent plans, sections, elevations | Model can be reopened and inspected; chosen elements carry stable identity and units |
| 5 | Evaluate design decisions against evidence | Prioritized analysis pipeline and comparison report | Results trace to model revision, settings, evidence, and limitations |
| 6 | Communicate a schematic design coherently | Assemble design package and unresolved-issues register | Package is internally consistent and labeled with scope and review status |

## First two weeks

See [milestone-01.md](milestone-01.md) for the narrow prototype contract. Manual sourcing and reviewed rule entry are acceptable. Unreliable ingestion should not block a useful first demonstration.

## Later analysis priorities

1. Program and model-quality checks, plus the supported envelope checks.
2. Solar / shadow studies with documented location, north, date, time, and context.
3. Material quantities and preliminary cost ranges if quantities and pricing evidence are adequate.
4. Detailed daylight or energy simulation only if model inputs and integration time support it.

Structural heuristics are optional flags for review. They do not establish structural adequacy. If energy analysis is deferred, say so in the package and list missing inputs; do not substitute an unsupported estimate.

## Week-six package

- Site and feasibility report with evidence, assumptions, and unresolved constraints.
- Dimensioned conceptual plans, elevations, and sections.
- Exterior and interior views appropriate to model maturity.
- Completed solar / energy studies, or an explicit record of omitted studies and why.
- Available quantity takeoffs and cost assumptions; no invented pricing.
- Semantic IFC model, model-quality report, and other completed checks.
- Design rationale, revision manifest, and professional-review questions.

## Scope fallback

If the first milestone overruns, finish one dependable parcel-to-envelope workflow before adding analysis engines. Reduce later integration breadth and record what was deferred. Preserve the distinction between a demonstration with synthetic inputs and a real-parcel result.
