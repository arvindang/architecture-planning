# Evidence and review protocol

Every meaningful constraint and analysis result must be traceable. This is part of the product behavior, not paperwork to add at the end.

## Source record

For each source retain:

- Stable evidence ID, publisher, title, URL or file reference, and exact section / page / feature locator.
- Retrieval date, publication date if available, and effective date if known. An unknown effective date stays explicit.
- A permitted local snapshot or enough version information to recover what was used.
- Parcel / jurisdiction scope and original units or CRS where relevant.
- Extracted statement or measurement, separate from its interpretation and any derived geometry.
- Review status, reviewer identity or role, and review date.

Use primary municipal or agency material for regulatory and mapped constraints where available. A source supplied in the conversation is a lead until checked; a real-estate listing is not evidence of buildability.

## Input states

| State | Meaning |
| --- | --- |
| Sourced | Located in identified evidence; applicability may still need review |
| Reviewed for prototype | Interpretation and scope checked for this experiment; not professional certification |
| Assumed | Temporary input used for a stated purpose; visible in dependent outputs |
| Unknown | Needed information unavailable or unresolved |
| Professionally verified | Explicit documented review by the relevant professional, limited to its stated scope |

These states describe evidence and review. They do not replace the independent `pass`, `fail`, `unknown`, or `not_applicable` outcome of a software check.

Conflicting sources remain visible until resolved. Record which source controls the prototype and why. Do not upgrade an assumption because it produces plausible geometry.

## Reporting rules

- Identify the parcel, input / model revision, check version, settings, and generation date.
- Show measurements and rule references next to results.
- Distinguish GIS boundaries from survey evidence and schematic massing from a developed building model.
- Label synthetic demonstrations separately from results for the real parcel.
- Explain unsupported rules, exceptions, and missing inputs next to the affected result.
- Invalidate or mark stale results when dependent inputs change.
- Carry assumptions and limitations into exported artifacts.

## Professional-review register

Seed the register with these unresolved categories, then replace generic entries with parcel-specific questions:

| Area | Initial question / missing evidence |
| --- | --- |
| Boundary / title | Survey, easements, access rights, and encroachments |
| Regulatory | Applicable rules, definitions, overlays, exceptions, and approvals |
| Ground / water | Soil conditions, groundwater, drainage, flood / wetland constraints |
| Services | Water, sewer or septic, electrical service, and other utility constraints |
| Structure | Loads, spans, foundations, connections, and lateral stability |
| Building systems | Coordinated envelope, ventilation, heating / cooling, plumbing, and electrical design |
| Economics | Scope, quantities, local pricing basis, exclusions, and uncertainty |

No professional review has taken place. A passing automated check evaluates only the modeled rule and inputs; it does not establish overall legal compliance or engineering safety.
