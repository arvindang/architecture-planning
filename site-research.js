'use strict';

function siteFindingsView(){
  const permit='https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf';
  const maps='https://www.google.com/maps/search/?api=1&query=Chazy+Lake+Road+and+Garmish+Street%2C+Dannemora%2C+NY';
  const evidence=[
    ['Boundary & parcel history','Parent GIS matched','Survey, PDF p. 9; Lot 1 is 2.4 acres. Parent 185.2-2-48 matched in county GIS; subdivision geometry remains unresolved.',9],
    ['Well, septic & access','Plan available','C1–C2, pp. 7–8: proposed well/septic, existing driveway and required shift. Installation unverified.',7],
    ['Soils & infiltration','Test results available','C1 records APA deep-hole and percolation tests dated July 14, 2025. Local septic evidence, not a whole-site foundation study.',7],
    ['Wetlands & clearing','Mapped constraints','Survey and C1 show wetland flags; permit controls clearing and warns additional wetlands may exist.',9],
    ['House & permit scope','Conditional authorization','Proposed 14 × 40 ft house; 15 ft height limit. Recordation and present conditions unchecked. Larger brief requires separate review.',4],
    ['Electricity & other utilities','Unknown','No verified electrical route or service capacity. Do not infer buried services from imagery.',null],
    ['Terrain & aerial imagery','Imagery collected','2014, 2020 and 2024 aerials, a 2024 native tile and metadata are archived. Elevation and point-cloud tiles remain to acquire.',null],
    ['Solar, climate & earthwork','Not run','No Ladybug analysis, terrain model or cut/fill calculation has run.',null]
  ];
  return `<section class="panel site-research" aria-labelledby="research-title">
    <div class="section-header"><div><p class="research-eyebrow">Workspace research · October 18, 2026</p><h2 id="research-title">First site: Chazy Lake Road, Dannemora</h2></div>${badge('Candidate')}</div>
    <p class="subtitle">Enough evidence to begin a site reconstruction. Recommended for the first data exercise; parcel selection remains open. This shared notebook does not change the current project’s site or check results.</p>
    <div class="research-links">${link(maps,'Review area on Google Maps')}${link(permit,'APA permit & drawings')}${link('https://clintoncountyny.gov/planning/gis-map','County parcel GIS')}</div>
    <p class="research-location">Parent parcel matched in county GIS. The 2.4-acre subdivision boundary still needs reconciliation with the survey before aerial tracing.</p>
    <div class="research-table" role="region" aria-label="Site evidence inventory" tabindex="0"><table><thead><tr><th>Layer</th><th>Evidence status</th><th>Finding & next check</th></tr></thead><tbody>${evidence.map(([layer,status,notes,page])=>`<tr><td><strong>${e(layer)}</strong></td><td>${e(status)}</td><td>${e(notes)}${page?`<p>${link(`${permit}#page=${page}`,'Source drawing / permit')}</p>`:''}</td></tr>`).join('')}</tbody></table></div>
    <div class="research-next"><h3>Next: one sourced site map, then terrain</h3><ol>
      <li>Match Lot 1 to current county GIS; retain survey bearings, dimensions and revision history.</li>
      <li>Acquire dated imagery. Georeference the survey using control points; report alignment error. Trace documented features, with existing, proposed and inferred layers kept distinct.</li>
      <li>Acquire bare-earth elevation data; record CRS, vertical datum, units, resolution and acquisition date. Generate preliminary contours and compare any survey elevations.</li>
      <li>Build a Three.js terrain viewer with an aerial layer, section profiles and constraint toggles. Then compare building pads, access and approximate cut/fill.</li>
      <li>Use Ladybug for representative EPW climate summaries, sun paths and contextual shadows. Track tree/canopy assumptions separately from bare-earth terrain.</li>
    </ol><p class="subtitle">A screenshot can carry a sourced overlay; it cannot establish boundary accuracy or hidden utilities. Call the generated surface a preliminary topographic model. Earthwork estimates depend on terrain quality and do not establish soil or rock conditions.</p></div>
    <div class="research-links">${link('https://gis.ny.gov/orthoimagery','NYS aerial imagery')}${link('https://gis.ny.gov/node/171','NYS LiDAR')}${link('https://www.usgs.gov/3d-elevation-program/about-3dep-products-services','USGS elevation')}${link('https://github.com/ladybug-tools/ladybug','Ladybug core')}</div>
    <details class="research-alternatives"><summary>Philipstown findings & why Dannemora leads</summary><p>359 East Mountain Road South: engineer describes a topographic site plan, steep slopes, ridgeline and pond buffer. EAF screening and septic testing are documented; underlying drawings, final technical reports and current conditions remain unresolved. September minutes explain passive-solar siting, not a simulation.</p><div class="research-links">${link('https://philipstown.com/Documents/Conservation%20Planning%20Zoning/Planning%20Board/Documents/Agendas/2019/2019-04-18-PB-Agenda.pdf#page=31','Philipstown application & screening')}${link('https://cms3.revize.com/revize/philipstown/Documents/Conservation%20Planning%20Zoning/Planning%20Board/Documents/Minutes/2019/2019-9-19-PB-Minutes.pdf#page=9','Philipstown review discussion')}</div><p>120 Skyline Drive offers terrain and ridgeline review history, but a larger original house and unrecovered technical drawings. Dannemora’s attached survey and septic drawings make it easier to test our workflow now. Neither candidate has a verified present-day site model. ZoLa covers NYC; use local county and town sources here.</p></details>
  </section>`;
}
