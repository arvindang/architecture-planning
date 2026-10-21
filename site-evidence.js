'use strict';

let siteEvidenceTab='overview';
let siteEvidenceImage='aerial-2024-site';
let siteEvidenceOverlays=true;
let siteEvidencePermit=true;
let siteEvidenceZoom=1;
let siteConstraintGroups={documented:true,mapped:true,practice:true};

const SITE_CONSTRAINT_GROUPS=[['documented','Permit drawings','Real APA 2025-0137 · traced'],['mapped','Mapped inventory','APA / NWI GIS · not field-checked'],['practice','Practice PP-01','Fictional · for learning']];
const SITE_CONSTRAINT_ORDER=['wetland','wetland-buffer','setback','well-radius','clearing','buildable','lot','septic','accessory','house','well'];

function siteConstraintLayers(skip=[]){
  if(typeof SITE_CONSTRAINTS==='undefined')return [];
  const rank=l=>SITE_CONSTRAINT_ORDER.indexOf(l.kind)*3+['mapped','practice','documented'].indexOf(l.category);
  return SITE_CONSTRAINTS.layers.filter(l=>!skip.includes(l.id)).sort((a,b)=>rank(a)-rank(b));
}

function siteConstraintArea(l){
  const sqft=Math.round(l.areaM2/0.09290304);
  return `${l.areaAcres>=0.05?`${l.areaAcres.toFixed(2)} ac · `:''}${sqft.toLocaleString()} sq ft`;
}

function siteConstraintSvg(pathOf,lineOf,skip=['lot1','house'],fade={}){
  const layers=siteConstraintLayers(skip);
  const groups=SITE_CONSTRAINT_GROUPS.map(([g])=>{
    const paths=layers.filter(l=>l.category===g&&pathOf(l)).map(l=>`<path d="${e(pathOf(l))}" fill="${e(l.color)}" fill-opacity="${(l.fillOpacity*(fade[l.category]??1)).toFixed(3)}" stroke="${e(l.color)}" stroke-width="${l.kind==='buildable'?3:2}" ${l.dashed?`stroke-dasharray="${l.category==='practice'?'7 4':'3 3'}"`:''} fill-rule="evenodd" vector-effect="non-scaling-stroke"><title>${e(l.label)}</title></path>`).join('');
    const lines=g==='documented'&&typeof SITE_CONSTRAINTS!=='undefined'?SITE_CONSTRAINTS.lines.filter(lineOf).map(l=>`<path d="${e(lineOf(l))}" fill="none" stroke="${e(l.color)}" stroke-width="${l.kind==='stream'?2.5:1.8}" ${l.kind==='stream'?'':'stroke-dasharray="6 3"'} vector-effect="non-scaling-stroke"><title>${e(l.label)}</title></path>`).join(''):'';
    return `<g class="constraint-group" data-cgroup="${g}" ${siteConstraintGroups[g]?'':'hidden'}>${paths}${lines}</g>`;
  });
  return groups[1]+groups[2]+groups[0];
}

function siteConstraintToggles(){
  if(typeof SITE_CONSTRAINTS==='undefined')return '';
  return `<fieldset class="constraint-toggles"><legend>Constraint layers</legend>${SITE_CONSTRAINT_GROUPS.map(([g,title])=>`<label class="${g}"><input type="checkbox" data-constraint-group="${g}" ${siteConstraintGroups[g]?'checked':''}> ${title}${g==='practice'?' <span class="practice-tag">Practice</span>':''}</label>`).join('')}</fieldset>`;
}

function siteConstraintLegend(compact=false,groups=['documented','mapped','practice']){
  if(typeof SITE_CONSTRAINTS==='undefined')return '';
  const layers=siteConstraintLayers();
  return `<div class="constraint-legend ${compact?'compact':''}">${groups.map(g=>SITE_CONSTRAINT_GROUPS.find(x=>x[0]===g)).map(([g,title,note])=>`<div class="constraint-legend-group ${g}" data-cgroup-legend="${g}"><h4>${title}${g==='practice'?' <span class="practice-tag">Practice</span>':''}<small>${note}</small></h4><ul>${layers.filter(l=>l.category===g).map(l=>`<li><i class="${l.dashed?'dashed':''}" style="--c:${e(l.color)};--o:${Math.min(.75,l.fillOpacity+.15)}"></i><span>${e(l.label)}${compact?'':`<small>${e(l.status)}</small>`}</span><b>${siteConstraintArea(l)}</b></li>`).join('')}${g==='documented'?SITE_CONSTRAINTS.lines.map(l=>`<li><i class="line ${l.kind==='stream'?'':'dashed'}" style="--c:${e(l.color)}"></i><span>${e(l.label)}</span><b>line</b></li>`).join(''):''}</ul></div>`).join('')}</div>`;
}

function setSiteConstraintGroup(group,on){
  siteConstraintGroups[group]=on;
  document.querySelectorAll(`[data-cgroup="${group}"]`).forEach(el=>el.toggleAttribute('hidden',!on));
  document.querySelectorAll(`[data-constraint-group="${group}"]`).forEach(el=>{el.checked=on;});
  if(typeof drawSiteTerrain==='function')drawSiteTerrain();
}

function siteResearchView(p){
  const tabs=[['overview','Overview'],['permitted','Permitted layout'],['imagery','Aerial imagery'],['terrain','Terrain & slopes'],['climate','Climate & sun'],['sun3d','3D sun & shade'],['plans','Plans & annotations'],['sources','Sources & gaps'],['findings','Findings']];
  return `<div class="site-tabs" role="tablist" aria-label="Site evidence">${tabs.map(([key,title])=>`<button id="site-tab-${key}" role="tab" aria-selected="${siteEvidenceTab===key}" aria-controls="site-evidence-panel" tabindex="${siteEvidenceTab===key?0:-1}" data-site-tab="${key}">${title}</button>`).join('')}</div><div id="site-evidence-panel" role="tabpanel" aria-labelledby="site-tab-${siteEvidenceTab}">${siteEvidenceTab==='overview'?siteProgressView()+stageOverviewView(p,'site'):siteEvidenceTab==='permitted'?sitePermittedView():siteEvidenceTab==='terrain'?siteTerrainView():siteEvidenceTab==='climate'?siteClimateView():siteEvidenceTab==='sun3d'?siteViewer3dView():siteEvidenceTab==='findings'?siteFindingsView():siteEvidenceTab==='sources'?siteEvidenceSources():siteEvidenceGallery()}</div>`;
}

function sitePermittedView(){
  return `<section class="panel permitted-intro"><div class="section-header"><div><p class="research-eyebrow">Dannemora · APA permit 2025-0137</p><h2>The lot, the house footprint and the service layout</h2></div>${badge('Conditional permit layout')}</div><p class="subtitle">Lot 1 is 2.4 acres in total. The permit authorizes the depicted 14 × 40 ft house, subject to its conditions; the full lot is not an approved construction area. A different house location or dimensions require prior written APA authorization.</p><div class="permitted-key"><span><i style="background:#55e5ff"></i>Cyan on aerials: larger parent tax parcel</span><span><i style="background:#735bb5"></i>Purple here: Lot 1 on the survey</span><span><i style="background:#e78222"></i>Orange: depicted house footprint</span></div><div class="research-links"><a href="sources/dannemora/apa-2025-0137.pdf#page=4" target="_blank" rel="noopener">Permit conditions 9, 15 and 16 ↗</a><button class="text-button" data-site-open="plans">Review full original drawings →</button>${typeof SITE_CONSTRAINTS==='undefined'?'':'<button class="text-button" data-scroll-to="practice-permit">Compare with practice permit PP-01 ↓</button>'}</div><p class="subtitle">These views follow the source drawings. A provisional Lot 1 / house overlay is now available on aerials, based on county GIS rather than surveyed control. Services remain on their source drawings; terrain has not been updated. Permit recordation, current validity and other approvals remain unchecked.</p></section>
  <figure class="panel permitted-figure"><figcaption><h2>1. Find Lot 1 and the house within it</h2><p class="subtitle">Purple follows the lot boundary on the survey. Orange emphasizes the house position; callout 3 points to the source’s dotted clearing limit. Wetland delineation remains visible across the lot.</p></figcaption><a href="assets/sites/dannemora/lot1-permitted-layout.svg" target="_blank" rel="noopener" aria-label="Open enlarged Lot 1 and house illustration"><img src="assets/sites/dannemora/lot1-permitted-layout.svg" width="1200" height="1210" alt="Focused permit survey: Lot 1 boundary emphasized in purple; small house footprint in orange near Chazy Lake Road and the Garmish Street driveway; wetland and clearing lines remain visible."></a><div class="research-links"><a href="assets/sites/dannemora/lot1-permitted-layout.svg" download>Download annotated Lot 1 image</a><a href="sources/dannemora/apa-2025-0137.pdf#page=9" target="_blank" rel="noopener">Original survey · page 9 ↗</a></div></figure>
  <figure class="panel permitted-figure"><figcaption><h2>2. Read the house, septic, well and driveway together</h2><p class="subtitle">Orange marks the proposed house on C1. Amber identifies the septic / fill area for visual reference; blue marks the proposed well. The drawing requires the driveway to shift away from the absorption field. These are proposed features, not verified installations.</p></figcaption><a href="assets/sites/dannemora/house-services-permitted-layout.svg" target="_blank" rel="noopener" aria-label="Open enlarged house and services illustration"><img src="assets/sites/dannemora/house-services-permitted-layout.svg" width="1200" height="880" loading="lazy" alt="Annotated C1 source plan showing house footprint, septic and fill area, proposed well, driveway from Garmish Street, and wetland flags or stream."></a><div class="research-links"><a href="assets/sites/dannemora/house-services-permitted-layout.svg" download>Download annotated house / services image</a><a href="sources/dannemora/apa-2025-0137.pdf#page=7" target="_blank" rel="noopener">Original C1 plan · page 7 ↗</a><a href="sources/dannemora/permitted-layout-register.json" target="_blank" rel="noopener">Image provenance ↗</a></div></figure>
  <section class="panel"><h2>What the remaining space means for our design</h2><p class="subtitle">We can study the 2.4-acre lot as a whole, including access, landscape and alternative layouts. The current record fixes a specific house position and clearing limits; wetland activity requires a new or amended permit. We have not calculated an unrestricted buildable envelope or a remaining developable acreage.</p><p class="subtitle">Next: validate the provisional Lot 1 / house alignment with surveyed control before adding it to terrain, then compare any alternative pad against wetland evidence, access, septic, slopes and applicable rules.</p><div class="research-links"><button class="text-button" data-site-open="findings">Read findings & unresolved checks →</button></div></section>${sitePracticePermitView()}`;
}

function sitePracticePlan(){
  const c=SITE_CONSTRAINTS,lot=c.layers.find(l=>l.id==='lot1'),pts=lot.utm.flat(2),pad=12;
  const minE=Math.min(...pts.map(p=>p[0]))-pad,maxE=Math.max(...pts.map(p=>p[0]))+pad,minN=Math.min(...pts.map(p=>p[1]))-pad,maxN=Math.max(...pts.map(p=>p[1]))+pad,w=maxE-minE,h=maxN-minN;
  const cx=pts.reduce((t,p)=>t+p[0],0)/pts.length-minE,cy=maxN-pts.reduce((t,p)=>t+p[1],0)/pts.length;
  const xy=([E,N])=>`${(E-minE).toFixed(2)},${(maxN-N).toFixed(2)}`;
  const poly=l=>l.utm.map(p=>p.map(r=>'M'+r.map(xy).join('L')+'Z').join('')).join('');
  const roads=c.edges.filter(x=>x.class==='road').map(x=>{const [a,b]=x.utm,mx=(a[0]+b[0])/2-minE,my=maxN-(a[1]+b[1])/2;let ang=Math.atan2(-(b[1]-a[1]),b[0]-a[0])*180/Math.PI;if(ang>90)ang-=180;if(ang<-90)ang+=180;const dx=b[0]-a[0],dy=a[1]-b[1],len=Math.hypot(dx,dy);let nx=dy/len,ny=-dx/len;if(Math.hypot(mx+nx-cx,my+ny-cy)<Math.hypot(mx-cx,my-cy)){nx=-nx;ny=-ny;}return `<text transform="translate(${(mx+nx*6).toFixed(1)},${(my+ny*6+1.2).toFixed(1)}) rotate(${ang.toFixed(1)})" text-anchor="middle" class="plan-road">${e(x.name)} · road frontage</text>`;}).join('');
  return `<svg class="practice-plan" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Lot 1 plan, north up, with real permit traces and practice PP-01 constraint layers">${siteConstraintSvg(poly,l=>'M'+l.utm.map(xy).join('L'),[])}${roads}<g class="plan-north" transform="translate(${(w-9).toFixed(1)},12)"><path d="M0 -7L3.5 4L0 2L-3.5 4Z"/><text y="12" text-anchor="middle">N</text></g><g class="plan-scale" transform="translate(6,${(h-6).toFixed(1)})"><path d="M0 0H20M0 -1.5V1.5M10 -1V1M20 -1.5V1.5"/><text x="10" y="-3" text-anchor="middle">20 m</text></g></svg>`;
}

function sitePracticePermitView(){
  if(typeof SITE_CONSTRAINTS==='undefined')return '';
  const pp=SITE_CONSTRAINTS.practicePermit,k=SITE_CONSTRAINTS.checks,sb=pp.septicBasis,fit=k.footprintFits['40x40ft']||k.footprintFits['32x50ft'];
  const limits=pp.limits.filter(x=>['height','footprint','clearing','setback-road','setback-side-rear','wetland-setback','well-septic'].includes(x.id));
  return `<section class="panel practice-panel" id="practice-permit" aria-labelledby="practice-title"><div class="section-header"><div><p class="research-eyebrow">${e(pp.id)} · fictional alternative to APA 2025-0137</p><h2 id="practice-title">Practice permit: a family house on the same Lot 1</h2></div><span class="practice-badge">Practice · fictional</span></div>
    <p class="practice-status"><strong>${e(pp.status)}.</strong> ${e(pp.realPermit.note)}</p>
    <p class="subtitle">${e(pp.household.summary)} About ${pp.program.grossFloorAreaSqFt.toLocaleString()} sq ft over ${pp.program.storeys} storeys: ${e(pp.program.rooms.join(', '))}. ${e(pp.program.garage)}; house location chosen by us.</p>
    <div class="terrain-metrics practice-metrics"><div><strong>${k.buildableSqFt.toLocaleString()} sq ft</strong><span>Practice buildable region (${k.buildableAcres.toFixed(2)} ac of ${k.lotAreaAcres.toFixed(1)} ac)</span></div><div><strong>${fit?'Fits':'Does not fit'}</strong><span>1,600 sq ft footprint (40 × 40 ft test)</span></div><div><strong>${k.realClearingAcres.toFixed(2)} / ${k.practiceClearingCapAcres} ac</strong><span>Real clearing limits vs practice cap</span></div><div><strong>${sb.designFlowGpd} gpd</strong><span>${sb.bedrooms}-bedroom septic basis · ${sb.tankGallons.toLocaleString()} gal tank</span></div></div>
    <div class="practice-grid"><figure class="practice-figure">${sitePracticePlan()}<figcaption>Lot 1, north up, on the provisional county-GIS fit. Solid / dotted = traced from the real permit drawings; long dashes = practice PP-01. ${siteConstraintToggles()}</figcaption></figure><div>${siteConstraintLegend(false,['practice','documented'])}</div></div>
    <h3 class="practice-heading">Practice limits</h3><div class="practice-limits">${limits.map(x=>`<div><strong>${x.value.toLocaleString()} ${e(x.unit)}</strong><span>${e(x.label)}</span></div>`).join('')}</div>
    <h3 class="practice-heading">Real permit vs practice</h3><div class="research-table"><table><thead><tr><th>Item</th><th>APA 2025-0137 · real</th><th>${e(pp.id)} · practice</th></tr></thead><tbody>${pp.comparison.map(r=>`<tr><td>${e(r.item)}</td><td>${e(r.real)}</td><td>${e(r.practice)}</td></tr>`).join('')}<tr><td>Clearing area</td><td>${k.realClearingAcres.toFixed(2)} ac traced from the Site Plan (${Math.round(k.realClearingShareOfCap*100)}% of the practice cap)</td><td>≤ ${k.practiceClearingCapAcres} ac total</td></tr></tbody></table></div>
    <div class="evidence-gap-grid"><article><h3>Kept from the real permit</h3><ul>${pp.retainedConditions.map(c=>`<li><strong>Condition ${c.condition}.</strong> ${e(c.text)}</li>`).join('')}</ul><h3>Septic basis · practice assumption</h3><p>${sb.bedrooms} bedrooms × ${sb.designFlowGpdPerBedroom} gpd = ${sb.designFlowGpd} gpd; perc ${sb.percolationMinPerInch} min/in → ${sb.applicationRateGpdPerSqFt} gpd/sq ft → ≈ ${sb.trenchBottomAreaSqFt} sq ft of trench bottom. ${e(sb.layout)}; ${sb.reserveFootprintFt[0]} × ${sb.reserveFootprintFt[1]} ft reserve footprint. ${e(sb.soil)}</p><p class="subtitle">Well → practice absorption field ${k.wellToPracticeFieldFeet} ft; field → stream ${k.practiceFieldToStreamFeet} ft. ${e(sb.status)}.</p></article><article><h3>To verify</h3><ul>${pp.toVerify.map(x=>`<li>${e(x)}</li>`).join('')}</ul><h3>Limitations</h3><ul>${SITE_CONSTRAINTS.limitations.map(x=>`<li>${e(x)}</li>`).join('')}</ul></article></div>
    <div class="research-links"><a href="ops/practice-permit.md" target="_blank" rel="noopener">Practice permit (readable) ↗</a><a href="ops/practice-permit.json" target="_blank" rel="noopener">PP-01 source JSON ↗</a><a href="sources/dannemora/constraints/constraints-register.json" target="_blank" rel="noopener">Traces, fits & areas ↗</a><a href="sources/dannemora/constraints/site-constraints.geojson" download>Constraint layers · GeoJSON</a></div></section>`;
}

function siteEvidenceGallery(){
  const items=SITE_EVIDENCE.filter(x=>x.group===siteEvidenceTab);
  const selected=items.find(x=>x.id===siteEvidenceImage)||items[0];
  const pins=selected.annotations;
  const proposed=siteEvidenceTab==='plans';
  return `<section class="panel evidence-gallery" aria-labelledby="evidence-title"><div class="section-header"><div><p class="research-eyebrow">Dannemora · Source collection</p><h2 id="evidence-title">${proposed?'Read the documented proposal':'See the site before the proposal'}</h2></div>${badge(proposed?'2025 plans':'Historical imagery')}</div><p class="subtitle">${proposed?'Proposed services are marked on their source drawings. Transferring them to an aerial is pending survey alignment.':'Cyan shows the parent tax parcel; purple is an approximate Lot 1 overlay and orange is the 2025 permit house proposal. The photographs predate the permit and do not show current construction.'}</p>
    ${proposed?'':'<div class="research-links"><button class="text-button" data-site-open="permitted">See Lot 1 & the permitted house layout →</button></div>'}<div class="evidence-choices" role="group" aria-label="Choose ${proposed?'drawing':'aerial'}">${items.map(item=>`<button class="evidence-choice ${item.id===selected.id?'selected':''}" data-evidence-image="${item.id}" aria-pressed="${item.id===selected.id}"><img src="${e(item.file)}" alt="" loading="lazy"><span>${e(item.title)}</span></button>`).join('')}</div>
    <div class="evidence-toolbar"><label><input type="checkbox" id="evidence-overlays" ${siteEvidenceOverlays?'checked':''}> Show annotations</label>${selected.permitOverlay?`<label><input type="checkbox" id="evidence-permit" ${siteEvidencePermit?'checked':''}> Lot 1 & house · approximate</label>${siteConstraintToggles()}`:''}<label for="evidence-zoom">Zoom <select id="evidence-zoom">${[1,1.5,2,3].map(x=>`<option value="${x}" ${siteEvidenceZoom===x?'selected':''}>${Math.round(x*100)}%</option>`).join('')}</select></label><a href="${e(selected.file)}" target="_blank" rel="noopener">Open full-resolution image ↗</a></div>
    ${selected.permitOverlay?'<div class="info-strip">Approximate drawing overlay · 2025 proposal shown on historical photography. Lot 1 is not an unrestricted building area. Use original permit drawings for dimensions; alignment and parcel lineage still need verification. Constraint layers: teal and amber = traced from the real permit drawings; dashed red / green = fictional practice permit PP-01.</div>':''}<div class="evidence-layout"><div><div class="evidence-viewport" tabindex="0" role="region" aria-label="${e(selected.title)}; scroll to pan when zoomed"><div class="evidence-canvas" style="width:${siteEvidenceZoom*100}%"><img class="evidence-original" src="${e(selected.file)}" width="${selected.width}" height="${selected.height}" alt="${e(selected.title)}. ${e(selected.caption)}"><svg class="evidence-overlay" viewBox="0 0 1000 ${1000*selected.height/selected.width}" aria-hidden="true" ${siteEvidenceOverlays?'':'hidden'}>${selected.boundary?`<path d="${selected.boundary}" class="parcel-outline"/>`:''}${selected.permitOverlay?siteConstraintSvg(l=>l.aerial[selected.id],l=>l.aerial[selected.id],['lot1','house'],{practice:.5})+sitePermitOverlay(selected.permitOverlay):''}${pins.map((pin,i)=>`<g transform="translate(${pin.x*10},${pin.y*10*selected.height/selected.width})" class="evidence-pin ${pin.kind==='Proposed'||pin.kind==='Required change'?'proposed':''}"><circle r="12"/><text text-anchor="middle" dy="4">${i+1}</text></g>`).join('')}</svg></div></div><div class="evidence-caption"><strong>${e(selected.title)}</strong><p>${e(selected.caption)}</p><p class="meta">${e(selected.date)} · ${e(selected.credit)}</p>${link(selected.source,'View source')}</div></div><aside class="evidence-legend" aria-label="Image annotations"><h3>What to look at</h3>${pins.length?`<ol>${pins.map((pin,i)=>`<li><span class="legend-pin">${i+1}</span><div><strong>${e(pin.title)}</strong><small>${e(pin.kind)}</small><p>${e(pin.note)}</p></div></li>`).join('')}</ol>`:'<p class="subtitle">Read this sheet alongside C1. No location pins apply to these construction details.</p>'}${selected.boundary?'<p class="boundary-key"><span></span> County parent boundary · GIS reference, not a surveyed Lot 1 outline</p>':''}${selected.permitOverlay?`<div class="permit-aerial-legend"><p><span class="permit-swatch lot"></span>Approximate Lot 1 · total 2.4-acre lot</p><p><span class="permit-swatch house"></span>Approximate 2025 house proposal · not proof of construction</p><p>County-GIS fit: ${selected.permitOverlay.rms} m RMS, up to ${selected.permitOverlay.maxResidual} m mismatch. These are fit diagnostics, not absolute accuracy; no independent survey checkpoints.</p><a href="${e(selected.permitOverlay.registration)}" target="_blank" rel="noopener">Alignment method & controls ↗</a></div>${siteConstraintAerialNote()}`:''}</aside></div></section>`;
}

function siteConstraintAerialNote(){
  if(typeof SITE_CONSTRAINTS==='undefined')return '';
  const f=SITE_CONSTRAINTS.fits;
  return `<div class="permit-aerial-legend"><h3>Constraint layers</h3>${siteConstraintLegend(true)}<p>Wetland, clearing and accessory buildings are traced on the survey; septic and well come from C1 through a fit on 12 shared wetland flags (${f.c1ToSurveyRmsMeters} m RMS, ${f.c1ToSurveyMaxMeters} m max relative to the survey), then the same county-GIS fit (${f.surveyToUtmRmsMeters} m RMS). Mapped wetlands are regional inventories. Practice layers are fictional.</p><a href="${e(f.register)}" target="_blank" rel="noopener">Traces, fits & residuals ↗</a></div>`;
}

function sitePermitOverlay(overlay){
  const [x,y]=overlay.houseCenter;
  const labelX=Math.max(8,Math.min(790,x-235)),labelY=Math.max(25,y-48);
  return `<g class="permit-layout-overlay" ${siteEvidencePermit?'':'hidden'}><path d="${e(overlay.lot1)}" class="aerial-lot1"/><path d="${e(overlay.house)}" class="aerial-house"/><path d="M${labelX+110} ${labelY+8}L${x} ${y}" class="aerial-house-leader"/><rect x="${labelX}" y="${labelY-17}" width="218" height="25" rx="4" fill="white" fill-opacity=".95"/><text x="${labelX+8}" y="${labelY}" class="aerial-house-label">2025 house · approximate</text></g>`;
}

function siteEvidenceSources(){
  return `<section class="panel"><p class="research-eyebrow">Collection register · October 18, 2026</p><h2>Collected materials & remaining evidence</h2><p class="subtitle">Local copies remain available without third-party image services. Dates below describe source records, not a verified present-day inspection.</p><div class="research-table"><table><thead><tr><th>Material</th><th>Available now</th><th>Source / download</th></tr></thead><tbody>
    <tr><td>Aerial photographs</td><td>2014, 2020, 2024 site images; 2024 landscape context. North up, matching site extents.</td><td>${link('https://gis.ny.gov/clinton-county-orthoimagery-downloads','NYS imagery catalog')}<p><a href="sources/dannemora/imagery-manifest.json" target="_blank">Image extents & requests ↗</a></p></td></tr>
    <tr><td>Native 2024 imagery tile</td><td>Four-band JP2 plus georeferencing. 1 US survey foot pixels; NAD83(2011), NY East State Plane, US survey feet. Exact flight day remains unknown. Tile coverage must be checked before analysis of the full tract.</td><td><a href="sources/dannemora/e_06662148_12_22500_4bd_2024.zip" download>Download original tile ZIP</a><p><a href="sources/dannemora/e_06662148_12_22500_4bd_2024.jp2.aux.xml" target="_blank">CRS & pixel metadata ↗</a></p></td></tr>
    <tr><td>Survey & septic drawings</td><td>Original APA packet; readable previews of C1, C2 and boundary survey. Preview rotation only; source PDF preserved.</td><td><a href="sources/dannemora/apa-2025-0137.pdf" target="_blank">Open archived permit PDF ↗</a></td></tr>
    <tr><td>County parent parcel</td><td>Matched 185.2-2-48. County acreage is 18.6; permit describes a roughly 22-acre project across four parcels. Neither equals the proposed 2.4-acre Lot 1.</td><td><a href="sources/dannemora/county-parent-parcel.geojson" download>Download county geometry</a><p>${link('https://clintoncountyny.gov/planning/gis-map','Official county map')}</p></td></tr>
    </tbody></table></div>
    <div class="evidence-gap-grid"><article><h3>Still needed for a current site record</h3><ul><li>Dated ground photographs of access, structures, wet areas and utility poles / service equipment.</li><li>Recorded subdivision and any installed-system / as-built records.</li><li>Independent surveyed control to check the provisional county-GIS alignment and reconcile recorded Lot 1.</li><li>Verified electrical connection and buried utility locations.</li></ul><p class="subtitle">No site visit or verified ground-level photo set has been obtained. Historical aerials do not establish present conditions.</p>${link('https://www.google.com/maps/@44.7298,-73.82775,18z/data=!3m1!1e3','Review site area in Google Maps')}</article><article><h3>Terrain acquired · point cloud next</h3><p>The Terrain & slopes tab now uses a native 1 m USGS bare-earth DEM from the 2014–15 collection. Elevation, slope, hillshade, 2 m contours and a simplified 3D surface are available. Exact classified tile 18TWQ592953 is verified; its full download remains deferred.</p><p>These flat orthophotos are not overlapping camera frames suitable for reconstructing a reliable point cloud. A new photogrammetric survey needs overlapping photographs, camera information and ground control.</p><p class="subtitle">No complete local point cloud, ground-return audit or earthwork estimate exists yet. The historical DEM is not a current topographic survey.</p><div class="research-links">${link('https://gis.ny.gov/node/171','NYS LiDAR collections')}${link('https://apps.nationalmap.gov/lidar-explorer/','USGS LiDAR Explorer')}${link('https://www.usgs.gov/programs/national-land-imaging-program/science/nuso-research-activities','USGS photogrammetry guidance')}</div></article></div></section>`;
}

document.addEventListener('click',event=>{
  const tabButton=event.target.closest('[data-site-tab],[data-site-open]');
  const imageButton=event.target.closest('[data-evidence-image]');
  if(tabButton){siteEvidenceTab=tabButton.dataset.siteTab||tabButton.dataset.siteOpen;siteEvidenceZoom=1;render();document.getElementById(`site-tab-${siteEvidenceTab}`).focus();}
  const scrollButton=event.target.closest('[data-scroll-to]');
  if(scrollButton)document.getElementById(scrollButton.dataset.scrollTo)?.scrollIntoView({behavior:'smooth',block:'start'});
  if(imageButton){siteEvidenceImage=imageButton.dataset.evidenceImage;siteEvidenceZoom=1;render();document.querySelector(`[data-evidence-image="${siteEvidenceImage}"]`).focus();}
});
document.addEventListener('change',event=>{
  if(event.target.id==='evidence-permit'){siteEvidencePermit=event.target.checked;document.querySelector('.permit-layout-overlay').toggleAttribute('hidden',!siteEvidencePermit);}
  if(event.target.id==='evidence-overlays'){siteEvidenceOverlays=event.target.checked;document.querySelector('.evidence-overlay').toggleAttribute('hidden',!siteEvidenceOverlays);}
  if(event.target.dataset.constraintGroup)setSiteConstraintGroup(event.target.dataset.constraintGroup,event.target.checked);
  if(event.target.id==='evidence-zoom'){siteEvidenceZoom=Number(event.target.value);document.querySelector('.evidence-canvas').style.width=`${siteEvidenceZoom*100}%`;}
});
document.addEventListener('keydown',event=>{
  if(!event.target.matches('[data-site-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=[...document.querySelectorAll('[data-site-tab]')];const index=buttons.indexOf(event.target);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].click();
});
