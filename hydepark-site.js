'use strict';

let hydeparkTab='overview';
let hydeparkDoc='survey-5418';
let hydeparkPins=true;
let hydeparkZoom=1;
let hydeparkAerial='aerial-2024';
let hydeparkRelief='groundHillshadePng';
const hydeparkLayers={lot:true,row:true,neighbours:true,notes:true};

const HYDEPARK_TABS=[['overview','Overview'],['permitted','Lot & zoning'],['imagery','Aerial imagery'],['terrain','Terrain & slopes'],['climate','Climate & sun'],['sun3d','3D sun & shade'],['plans','Plans & annotations'],['sources','Sources & gaps'],['findings','Findings']];
const hpDoc=id=>SITE_HYDEPARK.documents.find(d=>d.id===id);
const hpGap=tab=>SITE_HYDEPARK.gaps.find(g=>g.tab===tab);
const hpSources=list=>list.map(([url,label])=>link(url,label)).join('');
const hpFinding=id=>SITE_HYDEPARK.findings.find(f=>f.id===id);
const money=n=>`$${Number(n).toLocaleString('en-US')}`;

function hydeparkSiteView(p){
  const views={overview:()=>hydeparkProgressView()+stageOverviewView(p,'site'),permitted:hydeparkLotView,plans:hydeparkPlansView,sources:hydeparkSourcesView,findings:hydeparkFindingsView,climate:()=>typeof siteClimateView==='function'?siteClimateView(typeof SITE_HYDEPARK_CLIMATE==='undefined'?null:SITE_HYDEPARK_CLIMATE):hydeparkGapView('climate'),terrain:()=>typeof SITE_HYDEPARK_3D!=='undefined'?hydeparkTerrainView():hydeparkGapView('terrain'),imagery:()=>typeof SITE_HYDEPARK_IMAGERY!=='undefined'?hydeparkImageryView():hydeparkGapView('imagery'),sun3d:()=>typeof SITE_HYDEPARK_3D!=='undefined'&&typeof hydeparkViewer3dView==='function'?hydeparkViewer3dView():hydeparkGapView('sun3d')};
  return `<div class="site-tabs" role="tablist" aria-label="Site evidence">${HYDEPARK_TABS.map(([key,title])=>`<button id="hp-tab-${key}" role="tab" aria-selected="${hydeparkTab===key}" aria-controls="hp-panel" tabindex="${hydeparkTab===key?0:-1}" data-hp-tab="${key}">${title}</button>`).join('')}</div><div id="hp-panel" role="tabpanel" aria-labelledby="hp-tab-${hydeparkTab}">${(views[hydeparkTab]||(()=>hydeparkGapView(hydeparkTab)))()}</div>`;
}

function hydeparkProgressView(){
  const s=SITE_HYDEPARK;
  return `<section class="panel site-progress"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · site evidence · updated ${e(s.updated)}</p><h2>A narrow vacant RT-4 lot shaded from the south in winter; verify zoning and order the survey next</h2></div>${badge('Research in progress')}</div><p class="subtitle">${e(s.summary)}</p><div class="site-progress-grid"><article><h3>Collected</h3><p>Plats of survey for 5418 (2014) and 5420 (2018); city and county records; Cook County orthophotos 2020–2025; 2017 USGS LiDAR terrain, neighbour heights and trees; Chicago weather files, flood zone and code values.</p></article><article><h3>What we know</h3><p>A vacant 40 × 175 ft lot, zoned RT-4, one owner, still two tax parcels. Nearly flat, Zone X. The 29 ft 2-flat at 5422 stands 0.35 ft off the south line and shades the front of the lot all winter; the north side opens onto a 20 ft alley.</p></article><article><h3>Still unresolved</h3><p>Verified RT-4 rules, parcel consolidation, title and easements, a 3.5 ft boundary discrepancy, current grades and trees, and code design values from the official city text.</p></article></div><div class="research-links"><button class="text-button" data-hp-open="findings">Read findings & next actions →</button><button class="text-button" data-hp-open="plans">Review the surveys →</button><button class="text-button" data-hp-open="permitted">See lot & zoning →</button><button class="text-button" data-hp-open="sun3d">Open the 3D sun & shade model →</button></div></section>`;
}

function hydeparkLotView(){
  const s=SITE_HYDEPARK,zoning=hpGap('permitted'),z=s.records.zoning,rules=hpFinding('HP-011'),lot=hpFinding('HP-009');
  return `<section class="panel"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · Lot 25, Block 29</p><h2>The lot from the plats and county records</h2></div>${badge('Documented')}</div><p class="subtitle">${e(s.site)}. Together the halves are about 40 ft wide and 175 ft deep, 6,960 sq ft by the two plat areas (assessor land areas: 3,402 + 3,498 sq ft). This is a working envelope, not a buildable area: yards, height and floor area come from zoning.</p><div class="research-table"><table><thead><tr><th></th>${s.parcels.map(x=>`<th>${e(x.address)}</th>`).join('')}</tr></thead><tbody>${[['Legal description','legal'],['PIN','pin'],['Plat area','area'],['Dimensions','dimensions'],['Plat structure','structure'],['Now','now'],['Survey','survey']].map(([label,key])=>`<tr><td>${label}</td>${s.parcels.map(x=>`<td>${e(x[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="research-links">${s.parcels.map(x=>`<button class="text-button" data-hp-open="plans" data-hp-show="${e(x.document)}">Open ${e(x.id)} survey →</button>`).join('')}</div></section>
  <section class="panel"><div class="section-header"><h2>${e(lot.topic)}</h2>${badge(lot.status)}</div><p class="subtitle">${e(lot.finding)}</p><p class="subtitle">${e(lot.implication)}</p></section>
  <section class="panel"><div class="section-header"><div><p class="research-eyebrow">${e(z.source)}</p><h2>Zoning: ${e(z.district)} · ${e(z.name)}</h2></div>${badge(zoning.status)}</div><p class="subtitle">${e(z.nearby)} ${e(zoning.need)}</p><h3>Screening numbers ${badge(rules.status)}</h3><p class="subtitle">${e(rules.finding)}</p><p class="subtitle"><strong>Carry forward</strong> ${e(rules.implication)}</p><div class="research-links">${hpSources(zoning.sources)}${hpSources(rules.sources.slice(0,1))}</div></section>`;
}

const HP_LAYER_GROUPS=[['lot','Lot 25','County parcels (cyan) and the plat lot, provisional (purple dashed)',['lot','parcel']],['row','Streets & alleys','Right-of-way, pavement and centrelines',['row','alley']],['neighbours','Neighbour parcels','County GIS, within 80 m',['neighbourParcel']],['notes','Plat notes','Items the surveyors located near the lines',['note','easement','buildingLine']]];
function hpFeatureSvg(f){
  const pts=r=>r.map(([x,y])=>`${x},${-y}`).join(' '),dash=` vector-effect="non-scaling-stroke"${f.dashed?' stroke-dasharray="7 4"':''}`,c=e(f.color||'#7d838c'),title=`<title>${e(f.label)} — ${e(f.status||'')}</title>`;
  const w=f.kind==='lot'?3:f.kind==='parcel'?2.5:f.kind==='neighbourParcel'?1:1.6,fill=f.kind==='parcel'&&f.id==='county-lot25'?`fill="${c}" fill-opacity=".08"`:'fill="none"';
  if(f.rings)return f.rings.map(r=>`<polygon points="${pts(r)}" ${fill} stroke="${c}" stroke-width="${w}"${dash}>${title}</polygon>`).join('');
  if(f.lines)return f.lines.map(l=>`<polyline points="${pts(l)}" fill="none" stroke="${c}" stroke-width="${w}"${dash}>${title}</polyline>`).join('');
  if(f.point&&f.kind==='note')return `<circle cx="${f.point[0]}" cy="${-f.point[1]}" r=".9" fill="${c}" stroke="#fff" stroke-width=".3">${title}</circle>`;
  return '';
}
function hydeparkImageryView(){
  const I=SITE_HYDEPARK_IMAGERY,img=I.images.find(i=>i.id===hydeparkAerial)||I.images[0],[x0,y0,x1,y1]=img.bounds;
  const groups=HP_LAYER_GROUPS.map(([key,label,sub,kinds])=>({key,label,sub,feats:I.features.filter(f=>kinds.includes(f.kind))}));
  const svg=groups.map(g=>`<g data-hp-layer="${g.key}" ${hydeparkLayers[g.key]?'':'hidden'}>${g.feats.map(hpFeatureSvg).join('')}</g>`).join('');
  const notes=I.features.filter(f=>['easement','buildingLine','note'].includes(f.kind));
  const align=Array.isArray(I.alignment)?I.alignment:[];
  return `<section class="panel evidence-gallery"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · Cook County 6-inch orthophotos</p><h2>Lot 25 from the air, 2020–2025</h2></div>${badge('Mapped · not survey')}</div><p class="subtitle">County orthophotos with the county parcels, the plat lot (placed provisionally) and the public right-of-way. Lines agree with visible features to about ±0.5 m except the north line (up to about 0.9 m); treat every line as ±1 m until the combined survey (HP-003, HP-014).</p>
    <div class="evidence-choices" role="group" aria-label="Choose aerial">${I.images.map(i=>`<button class="evidence-choice ${i.id===img.id?'selected':''}" data-hp-aerial="${e(i.id)}" aria-pressed="${i.id===img.id}"><img src="${e(i.file)}" alt="" loading="lazy"><span>${e(i.title)}</span></button>`).join('')}</div>
    <fieldset class="constraint-toggles"><legend>Show</legend>${groups.map(g=>`<label title="${e(g.sub)}"><input type="checkbox" data-hp-layer-toggle="${g.key}" ${hydeparkLayers[g.key]?'checked':''}> ${e(g.label)}</label>`).join('')}</fieldset>
    <div class="evidence-layout"><div><div class="evidence-viewport" style="max-height:none"><div class="evidence-canvas"><img class="evidence-original" src="${e(img.file)}" width="${img.width||1067}" height="${img.height||1067}" alt="${e(img.title)}. ${e(img.note)}"><svg class="evidence-overlay" viewBox="${x0} ${-y1} ${x1-x0} ${y1-y0}" aria-hidden="true">${svg}</svg></div></div>
      <div class="evidence-caption"><strong>${e(img.title)}</strong><p>${e(img.note)} ${e(img.date)} · ${img.resolutionM} m per pixel · ${Math.round(x1-x0)} m across.</p></div></div>
      <aside class="evidence-legend"><h3>Easements & building lines</h3><ol>${notes.map(f=>`<li><span class="legend-pin" style="background:${e(f.color)}">${f.kind==='note'?'•':'!'}</span><div><strong>${e(f.label)}</strong><p>${e(String(f.status).startsWith(f.label)?f.status.slice(f.label.length).replace(/^[\s.(]+|\)\.?$/g,'').replace(/^2018 plat|^2014 plat/,m=>`From the ${m}`):f.status)}</p></div></li>`).join('')}</ol></aside></div>
    ${align.length?`<h3>Line check against the imagery</h3><div class="research-table"><table><thead><tr><th>Edge</th><th>Feature read</th><th>Line vs county GIS</th></tr></thead><tbody>${align.map(a=>`<tr><td>${e(a.edge)}<p>${e(a.image)}</p></td><td>${e(a.feature)}<p>${e(a.reading)}</p></td><td>${e(a.impliedLineVsCounty)}</td></tr>`).join('')}</tbody></table></div>`:''}
    <div class="research-links"><a href="ops/hydepark-imagery.md" target="_blank" rel="noopener">Method & limits ↗</a><a href="sources/hydepark/site-geometry.geojson" download>Site outlines · GeoJSON (EPSG:26916)</a><a href="sources/hydepark/imagery/acquisition.json" target="_blank" rel="noopener">Acquisition register ↗</a>${link('https://gis.cookcountyil.gov/imagery/rest/services','Cook County imagery services')}</div></section>`;
}

function hydeparkTerrainView(){
  const D=SITE_HYDEPARK_3D,t=D.terrain,o=D.overlays,[x0,y0,x1,y1]=o.extent,m=v=>`${v.toFixed(2)} m`;
  const pts=r=>r.map(([x,y])=>`${x},${-y}`).join(' ');
  const near=D.buildings.filter(b=>b.stories&&b.distanceToLotM<30);
  const svg=`${D.buildings.map(b=>`<polygon points="${pts(b.ring)}" fill="none" stroke="#243b4d" stroke-opacity=".45" stroke-width="1" vector-effect="non-scaling-stroke"><title>${e(b.address||b.id)} · ${b.heightM.toFixed(1)} m</title></polygon>`).join('')}${D.demolished.map(b=>`<polygon points="${pts(b.ring)}" fill="none" stroke="#d06a2c" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"><title>${e(b.address||b.id)} · demolished 2022</title></polygon>`).join('')}<polygon points="${pts(D.lot)}" fill="#735bb5" fill-opacity=".1" stroke="#735bb5" stroke-width="3" vector-effect="non-scaling-stroke"><title>Lot 25 (county GIS)</title></polygon>`;
  const relief=[['groundHillshadePng','Ground elevation'],['canopyHeightPng','Buildings & canopy height']];
  return `<section class="panel"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · USGS 3DEP LiDAR, flown ${e(D.lidar.collectedDays?.[0]||'2017')}</p><h2>A nearly flat lot that drains toward Kimbark and the south</h2></div>${badge('Preliminary')}</div><p class="subtitle">Bare earth from the April 2017 Cook County LiDAR on a 1 m grid (NAVD88). The lot was backfilled after the 2022 demolitions, so the new topographic survey's spot grades replace these values.</p>
    <div class="terrain-metrics"><div><strong>${m(t.lotMaxZ-t.lotMinZ)}</strong><span>Ground range on the lot (${t.lotMinZ.toFixed(2)}–${t.lotMaxZ.toFixed(2)} m)</span></div><div><strong>${t.planeSlopePct.toFixed(1)}%</strong><span>Best-fit fall, ${m(t.fallM)} toward ${e(t.fallDirection)} (${Math.round(t.fallBearingDeg)}°)</span></div><div><strong>${m(Math.abs(t.rearZ-t.frontZ))}</strong><span>${t.rearZ>t.frontZ?'Rear':'Front'} 5 m strip higher (front ${t.frontZ.toFixed(2)}, rear ${t.rearZ.toFixed(2)} m)</span></div><div><strong>${m(t.alleyZ-t.lotMeanZ)}</strong><span>Rear alley above the lot mean; Kimbark centreline ${t.streetZ.toFixed(2)} m, north alley ${t.northAlleyZ.toFixed(2)} m</span></div></div>
    <div class="terrain-toolbar"><label for="hp-relief">Show <select id="hp-relief">${relief.map(([k,l])=>`<option value="${k}" ${hydeparkRelief===k?'selected':''}>${l}</option>`).join('')}</select></label><span>Purple: Lot 25 (county GIS) · orange dashed: buildings gone since the 2017 flight · grey: city building footprints</span></div>
    <div class="evidence-viewport" style="max-height:none;max-width:760px"><div class="evidence-canvas"><img class="evidence-original" src="${e(o[hydeparkRelief])}" alt="${hydeparkRelief==='groundHillshadePng'?'Shaded ground elevation':'Height of buildings and tree canopy'} for 160 m around Lot 25"><svg class="evidence-overlay" viewBox="${x0} ${-y1} ${x1-x0} ${y1-y0}" aria-hidden="true">${svg}</svg></div></div>
    <p class="subtitle">Elevations are sampled inside the county parcel outline; street and alley values are medians along their assumed centrelines. The low spot on the front half is where the old houses stood.</p></section>
  <section class="panel"><div class="section-header"><div><p class="research-eyebrow">City footprints · LiDAR roof heights</p><h2>Neighbouring buildings within 30 m</h2></div>${badge('Measured')}</div><p class="subtitle">Heights above each building's own grade from 2017 LiDAR roof returns; footprints from the City of Chicago (last updated 2015). Clear distances are to the county lot line, which sits up to about 1 m off the record lines (HP-014).</p>
    <div class="research-table"><table><thead><tr><th>Building</th><th>Height</th><th>Frontage × depth</th><th>Clear distance</th></tr></thead><tbody>${near.map(b=>`<tr><td>${e(b.address)}<p>${e(b.side)} · ${e(b.stories)} storeys${b.yearBuilt?` · built ${e(b.yearBuilt)}`:''}</p></td><td>${b.heightM.toFixed(1)} m (${Math.round(b.heightM/.3048)} ft)${b.eaveZ?`<p>lower roof level ${(b.eaveZ-b.groundZ).toFixed(1)} m</p>`:''}</td><td>${b.widthM.toFixed(1)} × ${b.depthM.toFixed(1)} m</td><td>${b.distanceToLotM.toFixed(1)} m (${(b.distanceToLotM/.3048).toFixed(1)} ft)</td></tr>`).join('')}</tbody></table></div>
    <div class="research-links"><button class="text-button" data-hp-open="sun3d">Open the 3D sun & shade model →</button><a href="ops/hydepark-3d.md" target="_blank" rel="noopener">Method & neighbour table ↗</a><a href="sources/hydepark/buildings.geojson" download>Buildings · GeoJSON (EPSG:26916)</a>${link(D.lidar.url,'USGS LiDAR (EPT)')}</div></section>`;
}

function hydeparkGapView(tab){
  const g=hpGap(tab);
  return `<section class="panel"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · ${e(g.title)}</p><h2>${e(g.title)} for Lot 25</h2></div>${badge(g.status)}</div><p class="subtitle">${e(g.need)}</p><p class="subtitle">This tab mirrors the Dannemora study. It fills in once the evidence is collected and the matching script has been run for this site.</p><div class="research-links">${hpSources(g.sources)}<button class="text-button" data-hp-open="findings">See next actions →</button></div></section>`;
}

function hydeparkPlansView(){
  const docs=SITE_HYDEPARK.documents,selected=hpDoc(hydeparkDoc)||docs[0],pins=selected.annotations;
  return `<section class="panel evidence-gallery" aria-labelledby="hp-evidence-title"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · Source collection</p><h2 id="hp-evidence-title">Read the two plats of survey</h2></div>${badge('2014 & 2018 plats')}</div><p class="subtitle">Pins mark what to read on each plat. Dimensions are the surveyors' measurements on their dates; the plats have not been aligned to GIS or to each other.</p>
    <div class="evidence-choices" role="group" aria-label="Choose survey">${docs.map(d=>`<button class="evidence-choice ${d.id===selected.id?'selected':''}" data-hp-doc="${d.id}" aria-pressed="${d.id===selected.id}"><img src="${e(d.file)}" alt="" loading="lazy"><span>${e(d.title)}</span></button>`).join('')}</div>
    <div class="evidence-toolbar"><label><input type="checkbox" id="hp-pins" ${hydeparkPins?'checked':''}> Show annotations</label><label for="hp-zoom">Zoom <select id="hp-zoom">${[1,1.5,2,3].map(x=>`<option value="${x}" ${hydeparkZoom===x?'selected':''}>${Math.round(x*100)}%</option>`).join('')}</select></label><a href="${e(selected.file)}" target="_blank" rel="noopener">Open full-resolution image ↗</a></div>
    <div class="evidence-layout"><div><div class="evidence-viewport" tabindex="0" role="region" aria-label="${e(selected.title)}; scroll to pan when zoomed"><div class="evidence-canvas" style="width:${hydeparkZoom*100}%"><img class="evidence-original" src="${e(selected.file)}" width="${selected.width}" height="${selected.height}" alt="${e(selected.title)}. ${e(selected.caption)}"><svg class="evidence-overlay" viewBox="0 0 1000 ${1000*selected.height/selected.width}" aria-hidden="true" ${hydeparkPins?'':'hidden'}>${pins.map((pin,i)=>`<g transform="translate(${pin.x*10},${pin.y*10*selected.height/selected.width})" class="evidence-pin ${pin.kind==='Needs review'?'proposed':''}"><circle r="12"/><text text-anchor="middle" dy="4">${i+1}</text></g>`).join('')}</svg></div></div><div class="evidence-caption"><strong>${e(selected.title)}</strong><p>${e(selected.caption)}</p><p class="meta">${e(selected.date)} · ${e(selected.credit)}</p></div></div><aside class="evidence-legend" aria-label="Survey annotations"><h3>What to look at</h3><ol>${pins.map((pin,i)=>`<li><span class="legend-pin">${i+1}</span><div><strong>${e(pin.title)}</strong><small>${e(pin.kind)}</small><p>${e(pin.note)}</p></div></li>`).join('')}</ol></aside></div></section>`;
}

function hydeparkSourcesView(){
  const s=SITE_HYDEPARK;
  return `<section class="panel"><p class="research-eyebrow">Collection register · ${e(s.updated)}</p><h2>Collected materials & remaining evidence</h2><p class="subtitle">${e(s.scope)}</p><div class="research-table"><table><thead><tr><th>Material</th><th>Available now</th><th>Source / download</th></tr></thead><tbody>${s.documents.map(d=>`<tr><td>${e(d.title)}</td><td>${e(d.credit)} · ${e(d.date)}. Readable image for the app; client name masked where printed.</td><td><a href="${e(d.file)}" target="_blank" rel="noopener">Open image ↗</a><p><a href="${e(d.pdf)}" target="_blank" rel="noopener">Original PDF (local copy) ↗</a></p></td></tr>`).join('')}${s.gaps.map(g=>`<tr><td>${e(g.title)}</td><td>${badge(g.status)} ${e(g.need)}</td><td>${hpSources(g.sources)}</td></tr>`).join('')}</tbody></table></div></section>${hydeparkRecordsView()}`;
}

function hydeparkRecordsView(){
  const r=SITE_HYDEPARK.records;
  return `<section class="panel"><p class="research-eyebrow">Public records · retrieved ${e(r.retrieved)}</p><h2>City and county records for Lot 25</h2><p class="subtitle">${e(r.note)}</p>
    <h3>Tax parcels</h3><div class="research-table"><table><thead><tr><th>PIN</th><th>Class history</th><th>Assessed value</th></tr></thead><tbody>${r.parcels.map(x=>`<tr><td>${e(x.pin)}<p>${e(x.address)} · ${x.landSqftAssessor.toLocaleString('en-US')} sq ft</p></td><td>${e(x.classHistory)}</td><td>2025: land ${money(x.assessed2025.land)}, building ${money(x.assessed2025.building)}${link(x.assessor,'Assessor record')}</td></tr>`).join('')}</tbody></table></div><p class="subtitle">${e(r.consolidation)}</p>
    <h3>Building permits</h3><div class="research-table"><table><thead><tr><th>Permit</th><th>Work</th><th>Issued</th></tr></thead><tbody>${r.permits.map(x=>`<tr><td>${e(x.permit)}<p>${e(x.address)} · ${e(x.type)} · ${e(x.status)}</p></td><td>${e(x.work)} (${money(x.cost)})</td><td>${e(x.issued)}</td></tr>`).join('')}</tbody></table></div><p class="subtitle">${e(r.permitNote)}</p>
    <h3>Sales</h3><div class="research-table"><table><thead><tr><th>Date</th><th>PIN</th><th>Price</th><th>Deed · document</th></tr></thead><tbody>${r.sales.map(x=>`<tr><td>${e(x.date)}</td><td>${e(x.pin)}</td><td>${money(x.price)}</td><td>${e(x.deed)} · ${e(x.doc)}</td></tr>`).join('')}</tbody></table></div>
    <div class="evidence-gap-grid"><article><h3>Violations</h3><p>${e(r.violations)}</p></article><article><h3>Landmarks & historic district</h3><p>${e(r.landmarks)}</p></article><article><h3>South neighbour</h3><p>${e(r.neighbourSouth.address)}: ${e(r.neighbourSouth.class)}, ${e(r.neighbourSouth.construction)}, ${r.neighbourSouth.buildingSqft.toLocaleString('en-US')} sq ft, about ${r.neighbourSouth.ageYears} years old.</p></article></div>
    <div class="research-links">${hpSources(r.sources)}<a href="sources/hydepark/public-records.json" target="_blank" rel="noopener">Records register · JSON ↗</a><a href="sources/hydepark/county-parcels.geojson" download>County parcel outlines · GeoJSON</a></div></section>`;
}

function hydeparkFindingsView(){
  const s=SITE_HYDEPARK;
  return `<section class="panel site-research" aria-labelledby="hp-findings-title"><div class="section-header"><div><p class="research-eyebrow">Site summary · ${e(s.updated)} · ${e(s.revision)}</p><h2 id="hp-findings-title">${e(s.site)}</h2></div>${badge('Research in progress')}</div><p class="subtitle">${e(s.summary)}</p><p class="subtitle">${e(s.scope)}</p><div class="research-links"><a href="ops/hydepark-site.json" target="_blank" rel="noopener">Structured findings · JSON ↗</a><button class="text-button" data-hp-open="plans">Review the surveys →</button></div><div class="findings-register">${s.findings.map(x=>`<article id="finding-${e(x.id)}"><div class="section-header"><h3><span class="finding-id">${e(x.id)}</span> ${e(x.topic)}</h3>${badge(x.status)}</div><p>${e(x.finding)}</p><p class="finding-implication"><strong>Carry forward</strong> ${e(x.implication)}</p><div class="research-links">${x.sources.map(id=>Array.isArray(id)?link(...id):`<button class="text-button" data-hp-open="plans" data-hp-show="${e(id)}">${e(hpDoc(id).title)} →</button>`).join('')}</div></article>`).join('')}</div><div class="research-next"><h3>Next actions, in order</h3><ol>${s.nextActions.map(x=>`<li><strong>${e(x.title)}</strong> ${e(x.detail)}</li>`).join('')}</ol></div></section>`;
}

document.addEventListener('click',event=>{
  const tabButton=event.target.closest('[data-hp-tab],[data-hp-open]');
  const docButton=event.target.closest('[data-hp-doc]');
  const aerialButton=event.target.closest('[data-hp-aerial]');
  if(aerialButton){hydeparkAerial=aerialButton.dataset.hpAerial;render();document.querySelector(`[data-hp-aerial="${hydeparkAerial}"]`).focus();}
  if(tabButton){hydeparkTab=tabButton.dataset.hpTab||tabButton.dataset.hpOpen;if(tabButton.dataset.hpShow)hydeparkDoc=tabButton.dataset.hpShow;hydeparkZoom=1;render();document.getElementById(`hp-tab-${hydeparkTab}`).focus();}
  if(docButton){hydeparkDoc=docButton.dataset.hpDoc;hydeparkZoom=1;render();document.querySelector(`[data-hp-doc="${hydeparkDoc}"]`).focus();}
});
document.addEventListener('change',event=>{
  if(event.target.dataset.hpLayerToggle){const k=event.target.dataset.hpLayerToggle;hydeparkLayers[k]=event.target.checked;document.querySelector(`[data-hp-layer="${k}"]`).toggleAttribute('hidden',!hydeparkLayers[k]);}
  if(event.target.id==='hp-relief'){hydeparkRelief=event.target.value;render();document.getElementById('hp-relief').focus();}
  if(event.target.id==='hp-pins'){hydeparkPins=event.target.checked;document.querySelector('.evidence-overlay').toggleAttribute('hidden',!hydeparkPins);}
  if(event.target.id==='hp-zoom'){hydeparkZoom=Number(event.target.value);document.querySelector('.evidence-canvas').style.width=`${hydeparkZoom*100}%`;}
});
document.addEventListener('keydown',event=>{
  if(!event.target.matches('[data-hp-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=[...document.querySelectorAll('[data-hp-tab]')];const index=buttons.indexOf(event.target);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].click();
});
