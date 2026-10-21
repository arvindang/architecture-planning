# Backlog

Status as of 2026-10-18: static management workspace, evidence gallery and initial historical-terrain pipeline implemented. Dannemora remains a research candidate; Lot 1 registration and site selection remain open. Read [site-findings.md](site-findings.md) before starting dependent design work. Items are ordered by dependency. Unchecked items are outstanding, not commitments to complete without resolving their inputs.

## Planning baseline

- [x] Preserve supplied conversation sources.
- [x] Define project scope and provisional client brief.
- [x] Specify the first prototype and acceptance criteria.
- [x] Record roadmap, technical approach, evidence rules, and unresolved decisions.

## Next: establish a usable site

- [ ] Resolve NYC versus Hudson Valley and record the choice.
- [ ] Set kickoff, available weekly time, and experiment budget.
- [x] Compare Dannemora and Philipstown candidates for data availability and manageable constraints.
- [ ] Select one parcel and jurisdiction; record why it is suitable.
- [x] Inventory primary parcel, permit, elevation and screening sources; archive access and provenance. Applicability and current approvals still need review.
- [x] Record CRS, boundary provenance, imagery orientation, elevation datum and unresolved survey / access information.
- [ ] Extract only the initial supported rules, retaining applicability and review status.

## Build milestone one

- [ ] Settle units, area definitions, edge classification, and height reference conventions.
- [ ] Define versioned project, evidence, constraint, mass, and check-result records.
- [ ] Demonstrate parcel import and supported envelope geometry using a small local spike.
- [ ] Record stack choice based on that spike.
- [ ] Add address / parcel selection and a disclosed manual-import fallback.
- [ ] Build parcel, supported-restriction, and mass-placement views.
- [ ] Add supported setback, height, and coverage feedback with unknown states.
- [ ] Export a report and revision manifest.
- [ ] Verify acceptance cases in [milestone-01.md](milestone-01.md); record results and limitations.

## Design track, alongside weeks one and two

- [ ] Complete client programming and a prioritized space schedule.
- [ ] Define fictional construction budget and area convention.
- [ ] User sketches three spatial concepts and explains the tradeoffs.
- [ ] Compare concepts against requirements and site evidence.

## After the first milestone

- [ ] Select schematic direction and record rationale.
- [ ] Demonstrate authoring-to-IFC exchange before expanding the model.
- [ ] Develop semantic building elements and consistent schematic drawings.
- [ ] Add prioritized model-quality, program, and solar checks.
- [ ] Add quantities / cost ranges and energy analysis only where inputs support them.
- [ ] Assemble the schematic package and unresolved-issues register.
- [ ] Assess whether professional critique and further product exploration are worthwhile.

## Static project workspace — complete

- [x] Create and switch projects with a reusable five-stage template.
- [x] Save stage statuses, checklists, notes, evidence links, and project briefs locally.
- [x] Record design decisions and flag affected checks / deliverables for review.
- [x] Track seven manual review categories and six versioned package deliverables.
- [x] Maintain per-project tool links and usage status.
- [x] Export/import versioned JSON without replacing existing projects.
- [x] Verify creation, reload persistence, evidence validation, review flags, export/import, and invalid imports in a browser.
- [x] Check all ten views at 390px, 768px, and 1440px; fix checks-table mobile overflow.

Remaining: select and register the exact site, implement supported envelope / placement checks and later analyses, and select backend persistence when needed. A precomputed terrain pipeline now exists; current-condition and parcel-specific feasibility remain unresolved. No automated check integrations are connected.

## Site evidence and historical terrain — implemented

- [x] Archive permit, survey / septic drawings, three aerial years and native imagery metadata.
- [x] Match county parent parcel; retain unresolved subdivision / Lot 1 alignment.
- [x] Acquire native historical 1 m DEM and preserve CRS, vertical datum and source dates.
- [x] Generate terrain, slope / hillshade, contours and reference profiles; provide a 3D viewer with rotation and zoom.
- [x] Archive environmental context, partial FEMA results and two candidate weather files.
- [x] Publish a sourced findings register and stage handoff from one structured record.
- [ ] Register Lot 1 to the maps with supported control and measured residuals.
- [x] Acquire the classified point-cloud clip and audit ground coverage / gaps (`ops/canopy.md`).
- [ ] Verify current conditions, recorded instruments and installed services.
- [x] Resolve documented 560 sq ft benchmark versus the larger provisional house brief: practice permit PP-01 (D-011).
- [x] Select weather inputs and run solar / climate analysis (`ops/climate-findings.md`).
- [ ] Recover missing flood geometry and soil / geology screening.

## Practice permit and site climate — in progress

- [x] Record practice permit PP-01 and show it in the Permitted layout tab.
- [x] Demarcate survey wetland, clearing, septic, well, mapped wetlands, practice setbacks and buildable region on aerials, terrain and 3D views.
- [x] Climate, sun, wind, comfort and wildfire screening with Ladybug; findings CF-001–CF-012.
- [x] LiDAR canopy heights and tree crowns around Lot 1.
- [ ] Decide the practice well location: its 100 ft radius cuts the buildable region from 10,411 to 6,446 sq ft (0.15 ac).
- [ ] Decide flag-line vs whole-polygon wetland setback.
- [ ] Verify PP-01 septic sizing and separations against current 10 NYCRR Appendix 75-A.
- [ ] Evaluate house positions inside the buildable region against winter sun, clearing (0.75 ac cap, real clearing already 0.29 ac) and wind.
- [ ] Request the Town of Dannemora's Table R301.2(1): snow load, wind speed, frost depth, ice barrier, code edition.
- [ ] Log on-site wind and temperature for one winter; check seasonal high water during April snowmelt.
- [ ] Add a leaf-on canopy check; replace the roof heuristic with building footprints; rerun canopy statistics after Lot 1 is surveyed.
