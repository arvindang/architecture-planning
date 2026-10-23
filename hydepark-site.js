'use strict';

let hydeparkTab='overview';
let hydeparkDoc='survey-5418';
let hydeparkPins=true;
let hydeparkZoom=1;

const HYDEPARK_TABS=[['overview','Overview'],['permitted','Lot & zoning'],['imagery','Aerial imagery'],['terrain','Terrain & slopes'],['climate','Climate & sun'],['sun3d','3D sun & shade'],['plans','Plans & annotations'],['sources','Sources & gaps'],['findings','Findings']];
const hpDoc=id=>SITE_HYDEPARK.documents.find(d=>d.id===id);
const hpGap=tab=>SITE_HYDEPARK.gaps.find(g=>g.tab===tab);
const hpSources=list=>list.map(([url,label])=>link(url,label)).join('');
const hpFinding=id=>SITE_HYDEPARK.findings.find(f=>f.id===id);
const money=n=>`$${Number(n).toLocaleString('en-US')}`;

function hydeparkSiteView(p){
  const views={overview:()=>hydeparkProgressView()+stageOverviewView(p,'site'),permitted:hydeparkLotView,plans:hydeparkPlansView,sources:hydeparkSourcesView,findings:hydeparkFindingsView};
  return `<div class="site-tabs" role="tablist" aria-label="Site evidence">${HYDEPARK_TABS.map(([key,title])=>`<button id="hp-tab-${key}" role="tab" aria-selected="${hydeparkTab===key}" aria-controls="hp-panel" tabindex="${hydeparkTab===key?0:-1}" data-hp-tab="${key}">${title}</button>`).join('')}</div><div id="hp-panel" role="tabpanel" aria-labelledby="hp-tab-${hydeparkTab}">${(views[hydeparkTab]||(()=>hydeparkGapView(hydeparkTab)))()}</div>`;
}

function hydeparkProgressView(){
  const s=SITE_HYDEPARK;
  return `<section class="panel site-progress"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · site evidence · updated ${e(s.updated)}</p><h2>Vacant RT-4 lot under one owner; verify zoning rules and combine the parcels next</h2></div>${badge('Research in progress')}</div><p class="subtitle">${e(s.summary)}</p><div class="site-progress-grid"><article><h3>Collected</h3><p>Plats of survey for 5418 (2014) and 5420 (2018); city permits, violations and zoning; county PINs, sales, assessments and parcel outlines.</p></article><article><h3>What we know</h3><p>A vacant 40 × 175 ft lot since the 2022 demolitions, zoned RT-4, one owner since 2018, still two tax parcels.</p></article><article><h3>Still unresolved</h3><p>Verified RT-4 rules, parcel consolidation, a 3.5 ft boundary discrepancy, current conditions, terrain and climate.</p></article></div><div class="research-links"><button class="text-button" data-hp-open="findings">Read findings & next actions →</button><button class="text-button" data-hp-open="plans">Review the surveys →</button><button class="text-button" data-hp-open="permitted">See lot & zoning →</button></div></section>`;
}

function hydeparkLotView(){
  const s=SITE_HYDEPARK,zoning=hpGap('permitted'),z=s.records.zoning,rules=hpFinding('HP-011'),lot=hpFinding('HP-009');
  return `<section class="panel"><div class="section-header"><div><p class="research-eyebrow">Hydepark Home · Lot 25, Block 29</p><h2>The lot from the plats and county records</h2></div>${badge('Documented')}</div><p class="subtitle">${e(s.site)}. Together the halves are about 40 ft wide and 175 ft deep, 6,960 sq ft by the two plat areas (assessor land areas: 3,402 + 3,498 sq ft). This is a working envelope, not a buildable area: yards, height and floor area come from zoning.</p><div class="research-table"><table><thead><tr><th></th>${s.parcels.map(x=>`<th>${e(x.address)}</th>`).join('')}</tr></thead><tbody>${[['Legal description','legal'],['PIN','pin'],['Plat area','area'],['Dimensions','dimensions'],['Plat structure','structure'],['Now','now'],['Survey','survey']].map(([label,key])=>`<tr><td>${label}</td>${s.parcels.map(x=>`<td>${e(x[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="research-links">${s.parcels.map(x=>`<button class="text-button" data-hp-open="plans" data-hp-show="${e(x.document)}">Open ${e(x.id)} survey →</button>`).join('')}</div></section>
  <section class="panel"><div class="section-header"><h2>${e(lot.topic)}</h2>${badge(lot.status)}</div><p class="subtitle">${e(lot.finding)}</p><p class="subtitle">${e(lot.implication)}</p></section>
  <section class="panel"><div class="section-header"><div><p class="research-eyebrow">${e(z.source)}</p><h2>Zoning: ${e(z.district)} · ${e(z.name)}</h2></div>${badge(zoning.status)}</div><p class="subtitle">${e(z.nearby)} ${e(zoning.need)}</p><h3>Screening numbers ${badge(rules.status)}</h3><p class="subtitle">${e(rules.finding)}</p><p class="subtitle"><strong>Carry forward</strong> ${e(rules.implication)}</p><div class="research-links">${hpSources(zoning.sources)}${hpSources(rules.sources.slice(0,1))}</div></section>`;
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
  if(tabButton){hydeparkTab=tabButton.dataset.hpTab||tabButton.dataset.hpOpen;if(tabButton.dataset.hpShow)hydeparkDoc=tabButton.dataset.hpShow;hydeparkZoom=1;render();document.getElementById(`hp-tab-${hydeparkTab}`).focus();}
  if(docButton){hydeparkDoc=docButton.dataset.hpDoc;hydeparkZoom=1;render();document.querySelector(`[data-hp-doc="${hydeparkDoc}"]`).focus();}
});
document.addEventListener('change',event=>{
  if(event.target.id==='hp-pins'){hydeparkPins=event.target.checked;document.querySelector('.evidence-overlay').toggleAttribute('hidden',!hydeparkPins);}
  if(event.target.id==='hp-zoom'){hydeparkZoom=Number(event.target.value);document.querySelector('.evidence-canvas').style.width=`${hydeparkZoom*100}%`;}
});
document.addEventListener('keydown',event=>{
  if(!event.target.matches('[data-hp-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=[...document.querySelectorAll('[data-hp-tab]')];const index=buttons.indexOf(event.target);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].click();
});
