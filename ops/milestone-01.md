# Milestone 01: address to buildable envelope

Status: specified; not implemented. Target: end of week two after kickoff.

## User flow

1. Enter an address or explicit parcel identifier. Resolve ambiguity by selecting the intended parcel; show source and parcel identity.
2. Load available parcel geometry and attributes. When ingestion is unavailable, allow a reviewed manual import and disclose that path.
3. Review a feasibility dossier with sourced facts, proposed constraints, assumptions, and unknowns.
4. Visualize the parcel and supported restrictions. An envelope is preliminary and limited to the modeled constraints.
5. Manually place, rotate, and resize a simple building volume.
6. Receive feedback for supported checks and export a report tied to the current inputs and placement.

The prototype must remain useful when a rule is missing: explain the gap rather than inventing a value.

## Included

- One parcel at a time, one jurisdiction, one residential use case.
- Parcel identity, boundary, coordinate system, north direction, and source metadata.
- Reviewed front / side / rear setbacks, height, and coverage limits when applicable and supported.
- Explicit edge classification; do not infer front and rear boundaries solely from polygon order.
- A 2D footprint region and a simple 3D envelope where a supported height rule allows it.
- Simple mass dimensions, position, orientation, and separate check results.
- Human-readable report with evidence, assumptions, unknowns, and check outcomes.

Coverage can be evaluated against a placed footprint without pretending a single envelope encodes every coverage constraint. Sloping sites or rules with unsupported height reference methods must remain unresolved.

## Excluded

- Automatic interpretation of arbitrary zoning ordinances.
- Multi-jurisdiction coverage, automated house design, or optimization.
- Terrain-aware grading, foundations, full solar / energy modeling, or structural analysis.
- Permit-ready determinations, construction drawings, authentication, billing, or collaboration.

## Acceptance criteria

| Case | Expected behavior |
| --- | --- |
| Ambiguous address | User selects a parcel; no silent choice |
| Missing geometry or coordinate system | Geometry-dependent checks remain unavailable with a reason |
| Missing required rule | Report lists the gap; no overall compliance claim |
| Rule entered with evidence | Exact source reference, effective-date status, reviewer status, and interpretation are retained |
| Supported setback geometry | Footprint region reflects the reviewed edge assignments and distances in consistent units |
| Invalid or empty region | Explain invalid input or no supported footprint region; do not display misleading geometry |
| Mass placed inside / outside region | Setback check changes with placement and reports the relevant rule |
| Height or coverage exceeds supported limit | Corresponding check identifies the value and limit |
| Only some checks pass | Show individual outcomes and unresolved checks; no universal approval badge |
| Inputs or mass change | Checks and exports identify the new revision; stale results are marked |
| Report exported | Parcel, sources, rules, assumptions, model placement, results, and revision are identifiable |

## Verification plan

Use a small synthetic rectangular parcel with explicit edge labels and known distances to verify geometry, including a boundary case and a mass outside the region. Add an irregular parcel and an invalid or empty result case. Compare the selected real parcel's modeled restrictions against the source material through a documented manual review.

Synthetic fixtures test software behavior, not real-world eligibility. The real-parcel report must retain its own evidence and review status.

## Done means

A repeatable local demonstration and export work for the selected parcel; the acceptance cases above have recorded results; and known limitations are visible in both the interface and report.
