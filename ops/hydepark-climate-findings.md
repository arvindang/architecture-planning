# Climate, sun and hazard findings — Hydepark Home (Lot 25, 5418–5420 S. Kimbark Ave)

Revision: HC-2026-10-22-01 · Updated: 2026-10-22

Regional climate and public-record screening; no site measurements and no professional review. Code values come from a third-party copy of the 2019 Chicago Building Code and must be confirmed with the Department of Buildings.

Lot 25 is about 40 × 175 ft (12.2 × 53.3 m), long axis east–west (GIS bearing 89°): S. Kimbark Ave on the east, a 24 ft alley on the west, neighbouring buildings across narrow side yards to the north and south. Analyses use three TMYx 2011–2025 weather files (Chicago Midway primary, O'Hare comparison, Northerly Island lakefront), the ASHRAE header of a fourth lakefront file (Calumet Harbor) as a design cross-check, ladybug-core/ladybug-comfort, FEMA NFHL, USGS 3DEP point elevation, Chicago 311 records and MWRD. Sun numbers assume a flat horizon; neighbouring buildings and trees belong to the 3D sun & shade model, and the neighbour-shading table uses hypothetical heights. Numbers describe a typical year at a station, not the lot.

Generated from `ops/hydepark-climate-findings.json` by `scripts/prepare-hydepark-climate.py`. Edit the JSON and rerun.

## Summary

| ID | Topic | Finding (short) | Status |
|---|---|---|---|
| HC-001 | Weather file choice & temperature regime | Use Midway (13 km W): HDD18 2,974, CDD18 760, climate zone 5A; a heating-led climate with a real cooling season | Computed from TMYx |
| HC-002 | Design temperatures | Heating 99.6 % −17.2 °C (1 °F), 99 % −14.3 °C (6 °F); cooling 0.4 % 33.2 °C (92 °F) with 23.3 °C coincident wet bulb | From ASHRAE 2025 header in TMYx |
| HC-003 | Sun angles & the neighbour to the south | 21 Dec noon sun 24.8° (shadow 2.16 × height): behind a 7 m neighbour, a ground-floor sill needs a 13 m gap, wider than the 12.2 m lot | Geometry (hypothetical heights) |
| HC-004 | Prevailing winds by season | Winter and cold-hour wind from the W–NW; summer from WSW–SSW inland but N at the lakefront; S most common over the year | Computed from TMYx |
| HC-005 | Lake Michigan: spring chill & summer afternoon breezes | Lakefront daily highs run ~4–5 °C below Midway in Apr–Jun; on-lake afternoon winds are 2.3 °C cooler at Midway | Computed from TMYx |
| HC-006 | Urban heat & hot nights | Midway has 25 days ≥ 90 °F and 55 nights ≥ 20 °C, and nights ~1.4 °C warmer than O'Hare — plan for heat and warm nights | Computed from TMYx |
| HC-007 | Passive strategies & what still needs equipment | Passive means cover ~65 % of hours on paper; 34 % still need heat, and the passive-solar share assumes south sun this lot lacks | Computed from TMYx |
| HC-008 | Sun on walls & roofs | Unshaded: a 30° south roof gets 1,714 kWh/m²·yr, a flat roof 1,515; a south wall 686 Oct–Apr but only if nothing shades it | Computed from TMYx |
| HC-009 | Outdoor comfort (UTCI) | Sunny, sheltered spots carry Mar–Apr and Oct–Nov; Jun–Aug need shade; a breezy shaded spot is best in high summer | Computed from TMYx |
| HC-010 | Cold, frost & snow | 160 h below −10 °C, ground at 0.5 m reaches −0.9 °C in Feb; code frost depth 42 in; snow data in these files is weak | Computed from TMYx |
| HC-011 | Flood zone & basement water | FEMA Zone X (minimal) on panel 17031C0536K; nearest flood zone is the lakeshore 1.25 km away; 47 basement-water 311 reports within 500 m | Screening (public records) |
| HC-012 | Code climatic design values | Chicago code text: ground snow 25 psf, wind 107 mph (Risk Cat. II), frost 42 in — from a third-party copy; confirm edition | Stated in code text (unverified copy) |

## Findings

### HC-001 — Weather file choice & temperature regime

Status: Computed from TMYx

The site point is at 179.1 m NAVD88 (USGS 3DEP 1 m, 2017). Midway airport is 13.1 km west at 190 m in the same flat, built-up south-side fabric; O'Hare is 33.3 km north-west at 202 m; the Northerly Island lakefront station (former Meigs Field) is 6.6 km north at 181 m but its file has no ASHRAE design conditions. Midway TMYx: mean 11.9 °C, January mean −2.8 °C (daily max 0.8, min −6.4), July mean 25.6 °C (daily max 29.9, min 21.2), HDD18 2,974 (the .stat long-term HDD18.3 is 3,164; TMYx HDD65 °F ≈ 5,478), CDD18 760, ASHRAE climate zone 5A, Köppen Dfa (hot-summer humid continental). O'Hare is ~0.7 °C cooler (HDD18 3,124, CDD18 647).

**Design consequence for Lot 25:** Size heating and cooling from Midway. Chicago needs both: insulation and airtightness for about four months of real cold, and solar control plus dehumidifying cooling for June–August. Do not design as a heating-only house; a 40 ft-wide row-house form with shared side exposure to neighbours already cuts heat loss, so the remaining levers are the roof, the street and alley ends, and glazing ratios.

Sources:

- [SITE_HYDEPARK_CLIMATE stations[].annual / climateZone](../hydepark-climate-data.js)
- [Station provenance and parsed headers](../sources/hydepark/climate/climate-reference.json)
- [Midway TMYx zip](../sources/hydepark/climate/raw/USA_IL_Chicago.Midway.Intl.AP.725340_TMYx.2011-2025.zip)
- [O'Hare TMYx zip](../sources/hydepark/climate/raw/USA_IL_Chicago.OHare.Intl.AP.725300_TMYx.2011-2025.zip)
- [Northerly Island TMYx zip](../sources/hydepark/climate/raw/USA_IL_Chicago-Meigs.Field-Northerly.Island.725346_TMYx.2011-2025.zip)
- [USGS 3DEP elevation at the site (acquisition record)](../sources/hydepark/climate/acquisition.json)

### HC-002 — Design temperatures

Status: From ASHRAE 2025 header in TMYx

Midway (ASHRAE 2025 Handbook header): heating 99.6 % −17.2 °C, 99 % −14.3 °C, with 4.7 m/s mean coincident wind from 270° (west) on the design-cold hours; cooling 0.4 % 33.2 °C dry bulb / 23.3 °C mean coincident wet bulb, 1 % 32.0 °C. Mean annual extreme minimum −21.0 °C, maximum 35.8 °C; 50-year return −29.9 °C and 41.0 °C. O'Hare: −18.1 / −15.3 °C heating, 32.9 °C cooling. The lakefront Calumet Harbor file (10.6 km SE) gives almost the same heating values (−17.3 / −14.4 °C) but a cooler 0.4 % cooling value, 31.9 °C (1.3 °C below Midway).

**Design consequence for Lot 25:** Use Midway 99 % −14.3 °C (6 °F) and 1 % 32.0 °C for Manual J/S unless the engineer chooses 99.6 %/0.4 %; the lake trims summer peaks a little at Hyde Park but not winter design cold. The high coincident wet bulb means latent load matters: specify equipment for dehumidification, not just sensible cooling.

Sources:

- [SITE_HYDEPARK_CLIMATE stations[].design and designCrossCheck](../hydepark-climate-data.js)
- [Parsed design header fields](../sources/hydepark/climate/climate-reference.json)
- [Calumet Harbor TMYx zip (design header only)](../sources/hydepark/climate/raw/USA_IL_Chicago-CGS.Calumet.725344_TMYx.2011-2025.zip)

### HC-003 — Sun angles & the neighbour to the south

Status: Geometry (hypothetical heights)

At 41.797° N, noon sun is 24.8° on 21 Dec (each metre of height casts 2.16 m of shadow), 48.3° at the equinoxes (0.89 m) and 71.6° on 21 Jun (0.33 m). Day length is 9.1 h in December (sun rises at 122° and sets at 238°) and 15.2 h in June (57° to 303°); solar noon is about 11:50 CST. The lot's long side lot lines face 179° and 359°, so winter sun reaches it over the building on the south side. For a continuous wall of height H at gap d south of our south wall, its noon shadow on 21 Dec climbs our wall to: H 7 m (≈ 2-storey eave) → 5.6 m at d 3 m, 4.2 m at 6 m, 1.5 m at 12 m; H 10 m (≈ 3-storey) → 8.6 m at 3 m, 7.2 m at 6 m, 4.5 m at 12 m; H 13 m → 11.6 m at 3 m. The gap needed for noon sun on a 1 m sill is 13.0 / 19.5 / 26.0 m for H 7 / 10 / 13 m in December and 5.3 / 8.0 / 10.7 m at the equinoxes; in June a 7–10 m neighbour only matters within about 3 m. These are worst-case infinite-wall numbers for hypothetical heights; real buildings are shorter and lower sun passes their ends.

**Design consequence for Lot 25:** Expect almost no direct winter sun on ground-floor south windows; put the winter-sun rooms and south glass high (upper floor, clerestory, roof monitor or light well above the neighbour's roof line), and use the ground floor's street (east) and alley (west) ends for morning and afternoon light. Place the house toward the north side lot line to widen the south side yard. The 3D sun & shade model, with the measured heights of the 5422 building to the south and 5416 to the north, should replace this table.

Sources:

- [SITE_HYDEPARK_CLIMATE sun.monthly21st, sun.keyDates, sun.neighbourShading](../hydepark-climate-data.js)
- [Lot outline (Cook County GIS parcels, approximate)](../sources/hydepark/county-parcels.geojson)

### HC-004 — Prevailing winds by season

Status: Computed from TMYx

Midway: annual prevailing S (then W, SSW). Winter (Dec–Feb) prevailing W (W, WSW, WNW), mean 4.8 m/s, 31 % of hours above 6 m/s; hours below −10 °C (160 h) come from W, WNW and NW with only 1.2 % calm. Spring S/SSW/W; summer WSW/SW/SSW at a lighter 4.0 m/s; autumn S. O'Hare is similar but spring shows NNE first. The lakefront station has the same winter pattern (W) but in spring and summer the most common direction is N (summer N, S, W), the lake-breeze signal. Station winds are 10 m open-exposure values; between rows of buildings wind at the lot is much weaker and steered along Kimbark Ave and the alley.

**Design consequence for Lot 25:** Shelter the west (alley) end and any rear-yard sitting area from W–NW winter wind: a garage, solid fence or vestibule on the alley side earns its keep. The street (east) entry is on the lee side in winter; a recessed or vestibuled door still helps. For summer cross-ventilation, openings at both the east and west ends plus a high outlet (stair or light-well top) work with both the inland SW and the lake-breeze E/NE directions.

Sources:

- [SITE_HYDEPARK_CLIMATE stations[].windRose](../hydepark-climate-data.js)

### HC-005 — Lake Michigan: spring chill & summer afternoon breezes

Status: Computed from TMYx

Mean daily maximum, Midway vs Northerly Island lakefront: Apr 15.8 vs 11.3 °C, May 21.8 vs 17.5, Jun 27.9 vs 23.2, Jul 29.9 vs 27.2, Aug 27.7 vs 25.8; in Dec–Feb the difference is under 1.5 °C. Days ≥ 32.2 °C (90 °F): Midway 25, lakefront 4. At Midway 35 % of June–August afternoon hours (12–18 h) have wind from NNE–SSE (off the lake for Hyde Park), and those hours average 25.8 °C against 28.1 °C for the rest. TMYx months come from different years at each station, so station-to-station differences mix weather years; read them as indicative. Hyde Park, about 1.1 km from the shore, will sit between the two records and nearer the lakefront when the wind is onshore.

**Design consequence for Lot 25:** Treat spring as long and cool: outdoor rooms need sun and shelter well into May. Easterly lake breezes on hot afternoons are a free cooling source; keep operable windows on the street (east) end and avoid sealing that façade. Do not size cooling from the lakefront file — use Midway.

Sources:

- [SITE_HYDEPARK_CLIMATE stations[].monthly, stations[].lake, stations[].heat](../hydepark-climate-data.js)

### HC-006 — Urban heat & hot nights

Status: Computed from TMYx

Midway typical year: 257 h above 30 °C, 25 days with a maximum ≥ 32.2 °C (90 °F; longest run 3 days), 2 days ≥ 35 °C, 55 nights with a minimum ≥ 20 °C and 9 nights ≥ 23.9 °C (75 °F). Compared with O'Hare, Midway's mean daily minimum is 1.4 °C higher in both January (−6.4 vs −7.8 °C) and July (21.2 vs 19.8 °C), it has 160 vs 249 h below −10 °C, and 25 vs 17 hot days — consistent with Midway sitting inside the dense city (an urban heat island signal), though the different source years also contribute. A typical year under-represents heat waves.

**Design consequence for Lot 25:** Night flushing alone will not cool the house on warm, humid nights; pair it with shading, a light-coloured or green roof and mechanical cooling. Give bedrooms a cooler orientation or floor, and keep west glass (alley end) small or shaded against hot afternoons.

Sources:

- [SITE_HYDEPARK_CLIMATE stations[].heat, stations[].thresholds, stations[].monthly](../hydepark-climate-data.js)

### HC-007 — Passive strategies & what still needs equipment

Status: Computed from TMYx

ladybug-comfort PMV polygon at Midway, all 8,760 h: comfortable with no help 12 %; internal heat gains 23.7 %; passive solar through a south window 18.4 %; thermal mass + night flush 6.7 %; ceiling fan 7.4 %; evaporative cooling 10.3 %; all strategies combined 64.9 %, leaving 33.8 % that still needs active heating. The passive-solar share assumes an unobstructed south window; HC-003 shows a ground-floor south window on this lot gets little or no winter sun.

**Design consequence for Lot 25:** Count on a well-insulated envelope and internal gains, not passive solar, for the ground floor; only upper-floor or roof-level south glass can earn the passive-solar hours. Ceiling fans are cheap summer insurance; evaporative cooling is weak in humid Chicago summers.

Sources:

- [SITE_HYDEPARK_CLIMATE comfort.byStation.midway.pmvStrategies](../hydepark-climate-data.js)

### HC-008 — Sun on walls & roofs

Status: Computed from TMYx

Midway, unobstructed, isotropic sky: roof 30° south 1,714 kWh/m² a year, 45° south 1,687, flat 1,515; south wall 1,144 a year and 686 in October–April; east wall 840 (361), west wall 932 (407), north wall 458 (197). Neighbouring buildings and trees are not included.

**Design consequence for Lot 25:** The roof is the only surface on a 40 ft city lot that reliably sees the sky: reserve it for PV (a flat roof with tilted racks or a south monopitch) and avoid shading it with tall parapets or rooftop equipment. Treat the south side wall's winter sun as available only above the neighbour's roof line.

Sources:

- [SITE_HYDEPARK_CLIMATE surfaceIrradiance.values.midway](../hydepark-climate-data.js)

### HC-009 — Outdoor comfort (UTCI)

Status: Computed from TMYx

Share of daytime hours (08–18 h) with no thermal stress at Midway. Sun, sheltered: Mar 72 %, Apr 75 %, Oct 80 %, Nov 55 %, but Jul 0 % and Aug 7 %. Shade, sheltered: May 74 %, Sep 61 %, Oct 95 %. Shade with station wind: Jun 69 %, Aug 75 %, Jul 55 %. December and January stay at or below 33 % in every case (February 43 % in sheltered sun). The lakefront file gives more comfortable shaded hours in June–August (breezy shade 90 / 71 / 91 %).

**Design consequence for Lot 25:** Plan the rear yard or a roof terrace as two zones: a sun trap sheltered from the west wind for spring and autumn, and a shaded, breezy spot (tree, pergola or the house's own shadow) for summer. A south-facing roof terrace above the neighbour's shadow is the best shoulder-season outdoor room on this lot.

Sources:

- [SITE_HYDEPARK_CLIMATE comfort.byStation](../hydepark-climate-data.js)

### HC-010 — Cold, frost & snow

Status: Computed from TMYx

Midway typical year: 160 h below −10 °C, none below −20 °C (the 50-year return minimum is −29.9 °C), 1,328 h below 0 °C, 25 ice days and 85 frost days; frost-free season 224 days (2 Apr → 13 Nov in this composite year); TMY-season air freezing index ~165 °C·days. Undisturbed ground at 0.5 m is coldest in February (−0.9 °C). The files report snow on the ground on 44 days with a maximum 15 cm (O'Hare 61 days, 53 cm); TMYx snow depth is reanalysis-derived and inconsistent between stations, so use the code's 25 psf, not these depths, for structure.

**Design consequence for Lot 25:** Footings at 42 in below finish grade (HC-012); keep exterior steps, slabs and the alley-side garage on frost-protected footings. Detail entries, drains and the roof for freeze–thaw and ice: Chicago winters swing around freezing.

Sources:

- [SITE_HYDEPARK_CLIMATE stations[].thresholds, annual, groundTemperatureC](../hydepark-climate-data.js)

### HC-011 — Flood zone & basement water

Status: Screening (public records)

FEMA NFHL at the site point: Zone X, area of minimal flood hazard; FIRM panel 17031C0536K (countywide, not printed — no special flood hazard areas), effective 10 Sep 2021. The nearest Special Flood Hazard Area is a Lake Michigan shoreline Zone AE about 1,250 m away; within 2.5 km the shoreline zones carry base flood elevations of 584–590 ft NAVD88 (AE and VE) plus an AO zone. Ground at the site is 179.1 m (587.6 ft) NAVD88 by USGS 3DEP, within a few feet of those shoreline BFEs, but the lot itself is mapped Zone X. Chicago 311 shows 9 'Water in Basement Complaint' requests within 250 m and 47 within 500 m (Mar 2019 – Aug 2026; 70,566 city-wide since Dec 2018). MWRD states that most of Chicago has a combined sewer system carrying sewage and rainwater in the same pipes. Groundwater depth is not known.

**Design consequence for Lot 25:** No flood-insurance mandate is indicated, but basement water is the real risk: if the house has a basement, plan an overhead sewer or backwater valve, a sump with battery backup, waterproofing rather than damp-proofing, and grading and downspouts that send water away from the house (and check city stormwater rules). Ask for a geotechnical boring to find groundwater before committing to a deep basement.

Sources:

- [FEMA NFHL MapServer (layers 28 and 3)](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer)
- [Archived NFHL responses and query URLs](../sources/hydepark/climate/acquisition.json)
- [Chicago 311 Service Requests (v6vf-nfxy)](https://data.cityofchicago.org/resource/v6vf-nfxy.json)
- [MWRD Tunnel and Reservoir Plan](https://mwrd.org/what-we-do/tunnel-and-reservoir-plan-tarp)
- [SITE_HYDEPARK_CLIMATE hazards](../hydepark-climate-data.js)

### HC-012 — Code climatic design values

Status: Stated in code text (unverified copy)

The 2019 Chicago Building Code as copied by UpCodes: §14B-16 amends IBC 1608.2 so the ground snow load is 25 psf (1.20 kN/m²); amends 1609.3 so the basic design wind speed (3-second gust at 33 ft, Exposure C) is 101 / 107 / 114 / 119 mph for Risk Categories I–IV; §1809.5 as adopted by 14B-18-1809 requires footings at least 42 in (1,067 mm) below final grade (or ASCE 32 frost-protected design, or rock). The official City copy refused automated requests (HTTP 403) and the ASCE Hazard Tool needs an account, so these values are not checked against an official source. Midway's ASHRAE climate zone is 5A; the energy code's Cook County assignment was not archived.

**Design consequence for Lot 25:** Carry 25 psf ground snow, 107 mph and 42 in frost as working values, flagged unverified, and have the structural engineer confirm the code edition and exposure category (likely B in a dense block). On a narrow lot next to taller buildings, snow drifting onto a lower roof against a neighbour's wall can govern roof framing.

Sources:

- [Chicago Building Code 2019 Ch. 16 (UpCodes)](https://up.codes/viewer/chicago/chi-building-code-2019/chapter/16/structural-design)
- [Chicago Building Code 2019 Ch. 18 (UpCodes)](https://up.codes/viewer/chicago/chi-building-code-2019/chapter/18/soils-and-foundations)
- [Code-page fetch records and text checks](../sources/hydepark/climate/acquisition.json)

## Next actions, in order

1. **Replace the neighbour table with the 3D model** — Use measured or estimated heights of the 5422 (south) and 5416 (north) buildings and their side-yard gaps in the 3D sun & shade view to get real winter sun hours on candidate south windows, a roof terrace and PV areas. (HC-003, HC-008, HC-009)

2. **Decide basement or not** — Get a geotechnical boring (groundwater, soil bearing) and the sewer connection details before committing to a basement; if yes, budget for an overhead sewer or backwater valve, sump and waterproofing. (HC-011, HC-010)

3. **Confirm code climatic values** — Confirm snow 25 psf, wind 107 mph and exposure, frost 42 in and the energy-code climate zone against the official Chicago Construction Codes in force. (HC-012)

4. **Size the envelope and HVAC from Midway** — Use 99 % −14.3 °C and 1 % 32.0 °C (22.6 °C coincident wet bulb) for early load estimates; test glazing ratios on the east and west ends and upper-floor south glass. (HC-001, HC-002, HC-006, HC-007)

## Questions for an architect / engineer / building official

- **Building official:** Which Chicago Construction Codes edition applies now, and are ground snow 25 psf, wind 107 mph (Risk Category II) and frost 42 in still the city values? (HC-012)
- **Building official / DWM:** Is an overhead sewer or backwater valve required for a new basement on this block, and what stormwater rules apply to a lot of about 6,960 sq ft? (HC-011)
- **Structural engineer:** Which wind exposure category applies in this block, and does snow drift against the taller neighbouring wall govern the roof? (HC-012, HC-003)
- **Mechanical engineer:** Is 99 % −14.3 °C / 1 % 32.0 °C at Midway acceptable for Manual J/S here, and how much should the lake breeze be credited (if at all)? (HC-002, HC-005)
