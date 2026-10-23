'use strict';

// Climate & sun view for the Site feasibility stage. siteClimateView(data) renders any dataset in the
// SITE_CLIMATE schema (default: SITE_CLIMATE from climate-data.js); uses the global e() (and badge())
// from app.js. Toggles re-render only their own section, for the dataset that section shows, via
// delegated listeners at the bottom of this file. Dataset-specific wording comes from data.copy,
// falling back to the Dannemora text below.

function climateInitialView(c){const p=c?.site?.primaryStation||c?.stations?.[0]?.id||'';return {windStation:p,windPeriod:'DJF',sunMonth:11,monthlyStation:p,monthlyBars:'precip',surfaceStation:p,comfortStation:p};}
let climateActive=null;
const climateDatasets=new Map(),climateStates=new Map();
let climateView=climateInitialView(null);

const CLIMATE_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CLIMATE_PERIODS=[['annual','Annual'],['DJF','Winter (Dec–Feb)'],['MAM','Spring (Mar–May)'],['JJA','Summer (Jun–Aug)'],['SON','Autumn (Sep–Nov)'],['coldBelowMinus10','Cold hours < −10 °C']];
const CLIMATE_WIND_BINS=['#86b6ef','#5598e7','#2a78d6','#1c5cab','#0d366b'];
const CLIMATE_KEY_COLORS={'March equinox':'#1baf7a','September equinox':'#1baf7a','June solstice':'#eb6834','December solstice':'#2a78d6'};
const CLIMATE_GREEN=['#eef6f1','#d3eadc','#a9d4ba','#78b994','#4c9a71','#2c7a53','#14573a'];
const CLIMATE_BLUE=['#eef4fc','#cde2fb','#9ec5f4','#6da7ec','#3987e5','#1c5cab','#0d366b'];
const CLIMATE_UTCI={'extreme-cold':'#0d366b','very-strong-cold':'#1c5cab','strong-cold':'#3987e5','moderate-cold':'#86b6ef','slight-cold':'#cde2fb','no-stress':'#e7ece4','moderate-heat':'#f6c9b8','strong-heat':'#ec9a7c','very-strong-heat':'#d9583a','extreme-heat':'#9e2f1f'};
const CLIMATE_SECTION_FINDINGS={wind:['CF-003','CF-004'],sun:['CF-005'],monthly:['CF-001','CF-002','CF-011'],surfaces:['CF-006'],comfort:['CF-008','CF-009'],hazards:['CF-010','CF-007','CF-012']};
const CLIMATE_PERIOD_NOTES={
  annual:'The whole-year pattern. Useful for summer breezes or a wind turbine; for winter comfort and heat loss, look at the winter and cold-hour roses.',
  DJF:'Winter wind strips heat from walls and blows snow into doorways. Put the main entry, mudroom door and outdoor sitting spots where the petals are shortest; put the garage, woodshed or a dense evergreen windbreak on the long-petal side.',
  MAM:'Spring wind dries the ground and drives rain. A sunny corner sheltered from these petals is where the outdoor season starts early.',
  JJA:'Summer breezes are welcome. Windows on opposite sides of a room let air cross the house; the large calm share means ceiling fans and high windows that vent warm air also matter.',
  SON:'Autumn wind shows where leaves and early snow will pile up. Same shelter logic as spring.',
  coldBelowMinus10:'Only the hours colder than −10 °C — the ones that matter most for heat loss and cold doorways. A large calm share means many of the coldest hours are clear, still nights, when cold air slides downhill and pools in low spots.'
};

function climateDefaultData(){return typeof SITE_CLIMATE==='undefined'?null:SITE_CLIMATE;}
function climateData(){return climateActive||climateDefaultData();}
function climateDatasetId(c){return String(c?.datasetId||c?.generatedBy||'climate');}
function climateUse(c){climateActive=c||null;if(!c)return;const id=climateDatasetId(c);climateDatasets.set(id,c);if(!climateStates.has(id))climateStates.set(id,climateInitialView(c));climateView=climateStates.get(id);}
function climateCopy(key,fallback){const v=climateData()?.copy?.[key];return v===undefined||v===null?fallback:e(v);}
function climateTz(){return {'-5':'EST','-6':'CST','-7':'MST','-8':'PST'}[String(climateData()?.sun?.location?.timeZone??-5)]||'local standard time';}
function climateSectionFindings(){return climateData()?.sectionFindings||CLIMATE_SECTION_FINDINGS;}
function climateStationById(id){const c=climateData();return c.stations.find(s=>s.id===id)||c.stations[0];}
function climateShort(s){return String(s.name||s.id).split(/\s+[–-]\s+/)[0];}
function climateNum(v,d=0){if(v===null||v===undefined||v===''||Number.isNaN(Number(v)))return '—';const n=Number(v);const s=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});return (n<0&&Number(s.replace(/,/g,''))!==0?'−':'')+s;}
function climateHM(h){if(h===null||h===undefined)return '—';const m=Math.round(Number(h)*60);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function climateR(v){return Math.round(v*10)/10;}
function climateHref(href){const s=String(href||'').trim();if(/^https?:\/\//i.test(s))return s;if(/^[a-z][a-z0-9+.-]*:/i.test(s)||s.startsWith('//'))return '';return s;}
function climateLink(href,label){const h=climateHref(href);return h?`<a class="source-link" href="${e(h)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`:`<span class="source-link">${e(label)}</span>`;}
function climateHost(href){try{return new URL(href).hostname;}catch{return String(href||'');}}
function climateBadge(v){return typeof badge==='function'?badge(String(v)):`<span class="badge">${e(v)}</span>`;}
function climateRamp(ramp,pct){const i=Math.max(0,Math.min(ramp.length-1,Math.round(Number(pct)/100*(ramp.length-1))));return {bg:ramp[i],dark:i>=Math.ceil(ramp.length/2)+1};}
function climateTextLabel(key){return String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());}

function climateSeg(key,options,current,label,section){
  return `<div class="climate-seg" role="group" aria-label="${e(label)}">${options.map(([v,t])=>`<button type="button" data-climate-set="${e(key)}" data-climate-value="${e(v)}" data-climate-section="${e(section)}" aria-pressed="${String(v)===String(current)}">${e(t)}</button>`).join('')}</div>`;
}
function climateStationSeg(key,section,withBoth=false){
  const c=climateData();const opts=c.stations.map(s=>[s.id,`${climateShort(s)}${s.id===c.site.primaryStation?' (primary)':''}`]);
  if(withBoth&&c.stations.length>1)opts.push(['both',c.stations.length>2?'Compare all':'Compare both']);
  return climateSeg(key,opts,climateView[key],'Weather station',section);
}
function climateRefs(section){
  const c=climateData();const ids=(climateSectionFindings()[section]||[]).map(id=>c.findings?.findings?.find(f=>f.id===id)).filter(Boolean);
  if(!ids.length)return '';
  return `<p class="climate-refs"><span>Related findings</span>${ids.map(f=>`<button type="button" class="climate-ref" data-climate-jump="climate-finding-${e(f.id)}"><b>${e(f.id)}</b> ${e(f.title)}</button>`).join('')}</p>`;
}
function climateSectionHead(section,num,title,lede){
  return `<div class="section-header climate-head"><div><p class="research-eyebrow">${num}</p><h2 id="climate-${section}-title">${title}</h2></div></div>${lede?`<p class="subtitle climate-lede">${lede}</p>`:''}`;
}

/* ---------- 0. Header ---------- */
function climateHeaderView(){
  const c=climateData(),s=c.site,p=climateStationById(s.primaryStation),f=c.findings||{};
  const dec=c.sun.monthly21st[11],cold=p.windRose.coldBelowMinus10;
  const tiles=[
    [`${climateNum(p.design.heating.db996,1)} °C`,'Winter design temperature','Only 0.4 % of hours are colder (ASHRAE 99.6 %)'],
    [climateNum(p.annual.hdd18),'Heating degree-days (18 °C)','A heating-dominated climate; insulation and airtightness come first'],
    [`${climateNum(dec.maxAltitudeDeg,1)}°`,'Noon sun height on 21 Dec','Low winter sun: south glass and a clear south view matter'],
    [`${climateNum(p.annual.snowCoverDays)} days`,'Snow on the ground','Typical year; plan roofs, entries and snow storage'],
    [`${e(cold.prevailing)}`,'Wind in the coldest hours',`Most often from ${cold.top3.map(e).join(', ')} at ${e(climateShort(p))}`]
  ];
  const sections=[['wind','Wind'],['sun','Sun path'],['monthly','Temperature & snow'],['surfaces','Sun on walls & roofs'],['comfort','Outdoor comfort'],['hazards',climateCopy('hazardsNav','Wildfire & code values')],['findings','Findings']];
  const lim=c.copy?.limits;
  return `<section class="panel climate-intro" aria-labelledby="climate-intro-title">
    <div class="section-header"><div><p class="research-eyebrow">Climate & sun · ${e(f.revision||'')} · updated ${e(f.updated||'')}</p><h2 id="climate-intro-title">${climateCopy('headerTitle','How sun, wind, cold and fire should shape the house')}</h2></div>${climateBadge('Screening')}</div>
    <p class="subtitle">${e(s.name)}. ${climateCopy('headerIntro','This tab turns two airport weather files, a terrain horizon and public wildfire maps into pictures you can read without a design background: where the sun is, where cold wind comes from, how cold and snowy it gets and what that means for where the house sits and which way it faces.')} ${e(f.status||'')}</p>
    <div class="climate-tiles">${tiles.map(([v,l,n])=>`<div class="climate-tile"><strong>${v}</strong><span>${e(l)}</span><small>${e(n)}</small></div>`).join('')}</div>
    <div class="climate-intro-grid">
      <article><h3>Weather station used</h3><p><strong>${e(p.name)}</strong> · ${climateNum(p.elevation)} m elevation, ${climateNum(p.distanceKm,1)} km from the site. ${e(s.rationale)}</p></article>
      <article><h3>Read these limits first</h3><ul class="climate-limits">${Array.isArray(lim)?lim.map(([t,x])=>`
        <li><strong>${e(t)}</strong> ${e(x)}</li>`).join(''):`
        <li><strong>A typical year, not a forecast.</strong> Each month comes from a different year (2011–2025); real winters have colder snaps than the averages show.</li>
        <li><strong>Station wind is not site wind.</strong> Both stations are open airfields with 10 m masts; Lot 1 is a forest clearing on a slope, so wind there is weaker and bent by terrain.</li>
        <li><strong>The house position is provisional.</strong> ${e(s.house?.status||'')}</li>
        <li><strong>Trees are not in the sun numbers.</strong> The horizon and irradiance are bare-earth; canopy shading is the biggest unknown for winter sun.</li>`}
      </ul></article>
    </div>
    <nav class="climate-jump" aria-label="Climate sections">${sections.map(([k,t],i)=>`<button type="button" class="text-button" data-climate-jump="climate-${k}">${i+1}. ${t}</button>`).join('')}</nav>
  </section>`;
}

/* ---------- 1. Wind ---------- */
function climateArc(cx,cy,r1,r2,a1,a2){
  const P=(r,a)=>{const t=a*Math.PI/180;return `${climateR(cx+r*Math.sin(t))} ${climateR(cy-r*Math.cos(t))}`;};
  return `M${P(r2,a1)}A${climateR(r2)} ${climateR(r2)} 0 0 1 ${P(r2,a2)}L${P(r1,a2)}A${climateR(r1)} ${climateR(r1)} 0 0 0 ${P(r1,a1)}Z`;
}
function climateNiceMax(v){const step=v<=10?2:v<=25?5:10;return {max:Math.max(step,Math.ceil(v/step)*step),step};}
function climateRoseSvg(rose,station,scale,uid){
  const c=climateData(),dirs=c.windRoseFormat.directions,bins=c.windRoseFormat.speedBins.filter(b=>b.id!=='calm');
  const cx=160,cy=160,R=126,r0=24,rad=p=>r0+(R-r0)*p/scale.max,half=c.windRoseFormat.sectorWidthDeg/2*0.82;
  const nRings=Math.round(scale.max/scale.step);let rings='';for(let k=1;k<=nRings;k++){const v=k*scale.step;rings+=`<circle cx="${cx}" cy="${cy}" r="${climateR(rad(v))}" class="climate-grid"/>`;if(nRings>3&&k%2&&k!==nRings)continue;rings+=`<text x="${climateR(cx+rad(v)*Math.sin(Math.PI*101.25/180))}" y="${climateR(cy-rad(v)*Math.cos(Math.PI*101.25/180))+3}" class="climate-axis-label climate-halo">${v}%</text>`;}
  const spokes=[0,45,90,135,180,225,270,315].map(a=>{const t=a*Math.PI/180;return `<line x1="${climateR(cx+r0*Math.sin(t))}" y1="${climateR(cy-r0*Math.cos(t))}" x2="${climateR(cx+R*Math.sin(t))}" y2="${climateR(cy-R*Math.cos(t))}" class="climate-grid"/>`;}).join('');
  const labels=['N','NE','E','SE','S','SW','W','NW'].map((t,i)=>{const a=i*45*Math.PI/180,rr=R+15;return `<text x="${climateR(cx+rr*Math.sin(a))}" y="${climateR(cy-rr*Math.cos(a))+4}" text-anchor="middle" class="${i%2?'climate-axis-label':'climate-compass'}">${t}</text>`;}).join('');
  const petals=dirs.map((d,i)=>{
    const az=i*22.5;let cum=0;const parts=rose.freqPct[i].map((p,b)=>{if(!(p>0))return '';const path=`<path d="${climateArc(cx,cy,rad(cum),rad(cum+p),az-half,az+half)}" fill="${CLIMATE_WIND_BINS[b]}"/>`;cum+=p;return path;}).join('');
    const tip=`From ${d}: ${climateNum(rose.directionTotalPct[i],1)} % of hours, mean ${climateNum(rose.meanSpeedMs[i],1)} m/s. `+bins.map((b,k)=>`${b.label} ${climateNum(rose.freqPct[i][k],1)} %`).join(' · ');
    return `<g class="climate-petal"><title>${e(tip)}</title><path d="${climateArc(cx,cy,r0,R,az-11.25,az+11.25)}" fill="transparent"/>${parts}</g>`;
  }).join('');
  const per=CLIMATE_PERIODS.find(p=>p[0]===climateView.windPeriod)?.[1]||'';
  return `<svg viewBox="0 0 320 320" class="climate-rose" role="img" aria-labelledby="rose-t-${uid} rose-d-${uid}"><title id="rose-t-${uid}">Wind rose, ${e(station.name)}, ${e(per)}</title><desc id="rose-d-${uid}">Sixteen petals show the direction wind blows from; petal length is the share of hours, stacked by speed. Prevailing ${e(rose.prevailing)}; calm ${climateNum(rose.calmPct,1)} % of hours shown in the centre.</desc>${rings}${spokes}${petals}<circle cx="${cx}" cy="${cy}" r="${r0}" class="climate-calm"/><text x="${cx}" y="${cy-1}" text-anchor="middle" class="climate-calm-value">${climateNum(rose.calmPct,0)}%</text><text x="${cx}" y="${cy+10}" text-anchor="middle" class="climate-calm-label">calm</text>${labels}</svg>`;
}
function climateRoseCaption(rose,station){
  const dirs=climateData().windRoseFormat.directions;
  const least=dirs.map((d,i)=>[d,rose.directionTotalPct[i]]).sort((a,b)=>a[1]-b[1]).slice(0,3);
  return `<p><strong>${e(climateShort(station))}:</strong> wind most often from <strong>${rose.top3.map(e).join(', ')}</strong> (prevailing ${e(rose.prevailing)}); least often from ${least.map(([d])=>e(d)).join(', ')} (${climateNum(least.reduce((s,x)=>s+x[1],0),1)} % of hours together). ${climateNum(rose.pctAbove6,1)} % of hours are stronger than 6 m/s (a stiff breeze); ${climateNum(rose.calmPct,1)} % are calm. Mean ${climateNum(rose.meanSpeedAllMs,1)} m/s over ${climateNum(rose.hours)} hours.</p>`;
}
function climateRoseTable(rose,station){
  const c=climateData(),bins=c.windRoseFormat.speedBins.filter(b=>b.id!=='calm');
  return `<div class="research-table climate-table"><table><caption>${e(climateShort(station))} · % of all hours (calm ${climateNum(rose.calmPct,1)} %)</caption><thead><tr><th scope="col">From</th>${bins.map(b=>`<th scope="col">${e(b.label)}</th>`).join('')}<th scope="col">Total</th><th scope="col">Mean m/s</th></tr></thead><tbody>${c.windRoseFormat.directions.map((d,i)=>`<tr><th scope="row">${e(d)}</th>${rose.freqPct[i].map(v=>`<td>${climateNum(v,1)}</td>`).join('')}<td><strong>${climateNum(rose.directionTotalPct[i],1)}</strong></td><td>${climateNum(rose.meanSpeedMs[i],1)}</td></tr>`).join('')}</tbody></table></div>`;
}
function climateWindView(){
  const c=climateData(),period=climateView.windPeriod;
  const stations=climateView.windStation==='both'?c.stations:[climateStationById(climateView.windStation)];
  const roses=stations.map(s=>s.windRose[period]).filter(Boolean);
  const scale=climateNiceMax(Math.max(...roses.map(r=>Math.max(...r.directionTotalPct))));
  const bins=c.windRoseFormat.speedBins.filter(b=>b.id!=='calm');
  return `${climateSectionHead('wind','1 · Wind','Where cold wind comes from',`Each petal points to the direction the wind blows <em>from</em> (north at top). Longer petal = more hours; darker colour = stronger wind. Use it to decide which side of the house gets the front door, the porch and the windbreak.`)}
    <div class="climate-controls">${climateStationSeg('windStation','wind',true)}${climateSeg('windPeriod',CLIMATE_PERIODS,period,'Season or condition','wind')}</div>
    <div class="climate-rose-grid ${stations.length>1?'two':''}">${stations.map((s,i)=>s.windRose[period]?`<figure class="climate-rose-figure">${climateRoseSvg(s.windRose[period],s,scale,`${s.id}-${period}-${i}`)}<figcaption>${climateRoseCaption(s.windRose[period],s)}</figcaption></figure>`:'').join('')}
      <aside class="climate-aside"><ul class="climate-legend" aria-label="Wind speed legend">${bins.map((b,i)=>`<li><i style="background:${CLIMATE_WIND_BINS[i]}"></i>${e(b.label)}</li>`).join('')}<li><i class="calm"></i>Calm (&lt; 0.5 m/s), centre</li></ul>
      <div class="climate-note"><h3>What it means</h3><p>${e(c.copy?.periodNotes?.[period]||CLIMATE_PERIOD_NOTES[period]||'')}</p><p class="climate-muted">Rings are ${scale.step} % steps; ${stations.length>1?(stations.length>2?'all roses share one scale. ':'both roses share one scale. '):''}${climateCopy('windStationNote','Airport winds at 10 m in open ground. On Lot 1 expect lower speeds and terrain-steered directions; treat the two stations as bounds.')}</p></div></aside></div>
    <details class="climate-details"><summary>Show the wind rose as a table</summary>${roses.map((r,i)=>climateRoseTable(r,stations[i])).join('')}</details>
    ${climateRefs('wind')}`;
}

/* ---------- 2. Sun path ---------- */
function climateHorizonAt(az){
  const h=climateData().sun.horizon;if(!h)return 0;const step=h.stepDeg||2,n=h.altitudeDeg.length;
  const x=(((az%360)+360)%360)/step,i=Math.floor(x)%n,j=(i+1)%n,t=x-Math.floor(x);
  return h.altitudeDeg[i]*(1-t)+h.altitudeDeg[j]*t;
}
function climateSunPath(points,P,attrs,blockedAttrs){
  const vis=points.filter(p=>p[1]>=0);if(vis.length<2)return '';
  const runs=[];
  vis.forEach(p=>{const blocked=p[1]<climateHorizonAt(p[2]),last=runs[runs.length-1];if(!last||last.blocked!==blocked)runs.push({blocked,pts:last?[last.pts[last.pts.length-1],p]:[p]});else last.pts.push(p);});
  return runs.filter(r=>r.pts.length>1).map(r=>`<polyline points="${r.pts.map(p=>P(p[1],p[2]).join(',')).join(' ')}" ${r.blocked&&blockedAttrs?blockedAttrs:attrs}/>`).join('');
}
function climateSunSvg(){
  const c=climateData(),sun=c.sun,S=460,cx=230,cy=230,R=184;
  const P=(alt,az)=>{const r=R*Math.tan((90-Math.max(0,alt))*Math.PI/360),t=az*Math.PI/180;return [climateR(cx+r*Math.sin(t)),climateR(cy-r*Math.cos(t))];};
  let grid='';
  for(let a=10;a<90;a+=10){const r=R*Math.tan((90-a)*Math.PI/360);grid+=`<circle cx="${cx}" cy="${cy}" r="${climateR(r)}" class="climate-grid"/>`;if(a%20===10)grid+=`<text x="${cx+3}" y="${climateR(cy-r)-2}" class="climate-axis-label climate-halo">${a}°</text>`;}
  for(let a=0;a<360;a+=30){const [x,y]=P(0,a);grid+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="climate-grid"/>`;const t=a*Math.PI/180,rr=R+15,lab={0:'N',90:'E',180:'S',270:'W'}[a]||`${a}°`;grid+=`<text x="${climateR(cx+rr*Math.sin(t))}" y="${climateR(cy-rr*Math.cos(t))+4}" text-anchor="middle" class="${a%90?'climate-axis-label':'climate-compass'}">${lab}</text>`;}
  const hz=sun.horizon,inner=hz?hz.azimuthsDeg.map((az,i)=>P(hz.altitudeDeg[i],az).join(' ')).join('L'):'';
  const horizon=!hz?'':`<path d="M${cx} ${cy-R}A${R} ${R} 0 1 1 ${cx} ${cy+R}A${R} ${R} 0 1 1 ${cx} ${cy-R}ZM${inner}Z" fill-rule="evenodd" class="climate-horizon"><title>Bare-earth terrain horizon: up to ${climateNum(Math.max(...hz.altitudeDeg),1)}° above level. Trees are not included.</title></path>`;
  const months=sun.monthly21st.map((m,i)=>i===climateView.sunMonth?'':`<g class="climate-month-path"><title>21 ${e(m.month)}: noon sun ${climateNum(m.maxAltitudeDeg,1)}° high</title>${climateSunPath(m.path15min,P,'class="climate-path-month"')}</g>`).join('');
  const hourLines={};sun.monthly21st.forEach(m=>m.path15min.forEach(p=>{if(Number.isInteger(p[0])&&p[1]>0)(hourLines[p[0]]=hourLines[p[0]]||[]).push(p);}));
  const hours=Object.values(hourLines).filter(l=>l.length>2).map(l=>`<polyline points="${l.map(p=>P(p[1],p[2]).join(',')).join(' ')}" class="climate-hourline"/>`).join('');
  const keys=sun.keyDates.map(k=>{const col=CLIMATE_KEY_COLORS[k.label]||'#52514e',noon=k.positions.reduce((a,b)=>b[1]>a[1]?b:a),[nx,ny]=P(noon[1],noon[2]),dash=/September/.test(k.label)?'stroke-dasharray="6 4"':'';
    return `<g><title>${e(k.label)} (${e(k.date.slice(5))}): noon sun ${climateNum(noon[1],1)}° high</title>${climateSunPath(k.positions,P,`stroke="${col}" class="climate-path-key" ${dash}`,`stroke="${col}" class="climate-path-key blocked"`)}${/September/.test(k.label)?'':`<circle cx="${nx}" cy="${ny}" r="4" fill="${col}" class="climate-ring"/><text x="${/December/.test(k.label)?nx:nx-8}" y="${/December/.test(k.label)?ny+18:ny+4}" text-anchor="${/December/.test(k.label)?'middle':'end'}" class="climate-key-label climate-halo">${e(k.label.replace(' solstice','').replace('March equinox','Equinoxes'))} ${climateNum(noon[1],0)}°</text>`}</g>`;}).join('');
  const m=sun.monthly21st[climateView.sunMonth];
  const sel=`<g class="climate-selected"><title>21 ${e(m.month)}: sunrise ${e(m.sunrise)}, noon ${climateNum(m.maxAltitudeDeg,1)}°, sunset ${e(m.sunset)} ${climateTz()}</title>${climateSunPath(m.path15min,P,'class="climate-path-sel"','class="climate-path-sel blocked"')}${m.path15min.filter(p=>Number.isInteger(p[0])&&p[1]>0).map(p=>{const [x,y]=P(p[1],p[2]);return `<circle cx="${x}" cy="${y}" r="3.2" class="climate-hourdot"/><text x="${x+5}" y="${y-5}" class="climate-hour-label climate-halo">${p[0]}</text>`;}).join('')}</g>`;
  const h=c.site.house;let house='';
  if(h&&h.longAxisBearingDeg!==undefined){const b=h.longAxisBearingDeg*Math.PI/180,s=3.4,L=(h.lengthM||12)*s/2,W=(h.widthM||4)*s/2,u=[Math.sin(b),-Math.cos(b)],v=[Math.cos(b),Math.sin(b)];
    const pts=[[1,1],[1,-1],[-1,-1],[-1,1]].map(([a,d])=>`${climateR(cx+a*L*u[0]+d*W*v[0])},${climateR(cy+a*L*u[1]+d*W*v[1])}`).join(' ');
    const arrows=(h.longFacadeAzimuthsDeg||[]).map(az=>{const t=az*Math.PI/180,x1=cx+W*Math.sin(t),y1=cy-W*Math.cos(t),x2=cx+(W+26)*Math.sin(t),y2=cy-(W+26)*Math.cos(t);return `<line x1="${climateR(x1)}" y1="${climateR(y1)}" x2="${climateR(x2)}" y2="${climateR(y2)}" class="climate-facade" marker-end="url(#climate-arrow)"/>`;}).join('');
    house=`<g><title>Real-permit house footprint at its provisional orientation; long walls face ${(h.longFacadeAzimuthsDeg||[]).map(a=>climateNum(a,0)+'°').join(' and ')}</title><polygon points="${pts}" class="climate-house"/>${arrows}</g>`;}
  const [sx,sy]=P(0,180);
  return `<svg viewBox="-10 -10 ${S+20} ${S+20}" class="climate-sunpath" role="img" aria-labelledby="sun-t sun-d"><title id="sun-t">${climateCopy('sunTitle','Sun path diagram for the Lot 1 candidate')}</title><desc id="sun-d">Sky dome seen from above, north at top, east at right. Rings are sun height above the horizon, the edge is the horizon. Coloured lines are the sun's track on the solstices and equinoxes; grey lines are the 21st of each month; dotted lines join the same clock hour.${hz?' The shaded rim is the bare-earth terrain horizon; dashed parts of a track are hidden behind terrain.':' The horizon is treated as flat.'} 21 ${e(m.month)} is highlighted.</desc>
    <defs><marker id="climate-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#c4621d"/></marker></defs>
    <circle cx="${cx}" cy="${cy}" r="${R}" class="climate-dome"/>${grid}${horizon}<line x1="${cx}" y1="${cy}" x2="${sx}" y2="${sy}" class="climate-south"/>${hours}${months}${keys}${sel}${house}</svg>`;
}
function climateSunView(){
  const c=climateData(),sun=c.sun,m=sun.monthly21st[climateView.sunMonth],sh=sun.terrainShading?.monthly?.[climateView.sunMonth];
  const canopy=c.hazards?.wildfire?.['landfire-canopy-height'];const treeH=canopy&&Number(canopy.house)>0?Number(canopy.house)/10:null;
  const ratio=1/Math.tan(m.maxAltitudeDeg*Math.PI/180);
  const g=c.site.groundAtHouse,hz=sun.horizon,hasHouse=c.site.house&&c.site.house.longAxisBearingDeg!==undefined;
  return `${climateSectionHead('sun','2 · Sun','Where the sun is, month by month',`Imagine lying on your back at the house looking up: the centre is straight overhead, the edge is the horizon, north is at top. Winter sun stays low in the south (bottom); summer sun rises in the north-east and sets in the north-west. Times are standard time (${climateTz()}); add 1 h in summer.`)}
    <div class="climate-controls">${climateSeg('sunMonth',CLIMATE_MONTHS.map((x,i)=>[i,x]),climateView.sunMonth,'Highlight the 21st of a month','sun')}</div>
    <div class="climate-figure">
      <figure>${climateSunSvg()}</figure>
      <aside class="climate-aside">
        <ul class="climate-legend"><li><i style="background:#eb6834"></i>21 June (highest)</li><li><i style="background:#1baf7a"></i>Equinoxes, Mar (solid) and Sep (dashed)</li><li><i style="background:#2a78d6"></i>21 December (lowest)</li><li><i class="line-ink"></i>21 ${e(m.month)} (selected), dots on the hour</li><li><i class="line-grey"></i>Other months · dotted lines join clock hours</li>${hz?'<li><i class="horizon"></i>Terrain horizon (bare earth, no trees)</li>':''}${hasHouse?'<li><i class="house"></i>Real-permit house, provisional orientation; arrows show the long walls</li>':''}</ul>
        <div class="climate-stats">
          <div><strong>${e(m.sunrise)}–${e(m.sunset)}</strong><span>Sun above a flat horizon, 21 ${e(m.month)} (${climateNum(m.dayLengthH,1)} h)</span></div>
          ${hz?`<div><strong>${climateHM(m.terrainSunriseH)}–${climateHM(m.terrainSunsetH)}</strong><span>Above the terrain horizon (${climateNum(m.terrainSunHours,1)} h)${sh?`; terrain blocks ${climateNum(sh.sunUpHoursBlockedPct,0)} % of sun-up hours this month`:''}</span></div>`:''}
          <div><strong>${climateNum(m.maxAltitudeDeg,1)}°</strong><span>Noon sun height. Each metre of height casts a ${climateNum(ratio,1)} m shadow at noon${treeH?`; a ${climateNum(treeH,0)} m tree (LANDFIRE canopy height at the house) shades about ${climateNum(treeH*ratio,0)} m to its north`:''}.</span></div>
        </div>
        <div class="climate-note"><h3>What it means</h3><p>${climateCopy('sunMeaning','Glass facing within about 30° of due south (the dark line) catches low winter sun and is easy to shade in summer with a roof overhang, because the summer noon sun is high. East and west glass gets low, hard-to-shade sun in summer mornings and evenings. Keep tall trees well back on the south side; trees to the north cost little sun.')}</p><p class="climate-muted">${g?`Ground at the house slopes ${climateNum(g?.slopeDeg,1)}° toward ${climateNum(g?.facesAzimuthDeg,0)}° (north-east). `:''}${e(sun.terrainShading?.note||sun.horizonNote||'')}</p></div>
      </aside>
    </div>
    <div class="research-table climate-table"><table><caption>Sun on the 21st of each month (times ${climateTz()}). Select a month to highlight it.</caption><thead><tr><th scope="col">Month</th><th scope="col">Sunrise</th><th scope="col">Solar noon</th><th scope="col">Sunset</th><th scope="col">Day length</th><th scope="col">Noon height</th><th scope="col">Rises / sets at</th>${hz?'<th scope="col">Above terrain</th><th scope="col">Terrain sun hours</th><th scope="col">Sun-up hours blocked</th>':''}</tr></thead><tbody>${sun.monthly21st.map((x,i)=>{const t=sun.terrainShading?.monthly?.[i];return `<tr class="${i===climateView.sunMonth?'climate-row-selected':''}"><th scope="row"><button type="button" class="text-button" data-climate-set="sunMonth" data-climate-value="${i}" data-climate-section="sun" aria-pressed="${i===climateView.sunMonth}">${e(x.month)}</button></th><td>${e(x.sunrise)}</td><td>${e(x.solarNoon)}</td><td>${e(x.sunset)}</td><td>${climateNum(x.dayLengthH,1)} h</td><td>${climateNum(x.maxAltitudeDeg,1)}°</td><td>${climateNum(x.sunriseAzimuthDeg,0)}° / ${climateNum(x.sunsetAzimuthDeg,0)}°</td>${hz?`<td>${climateHM(x.terrainSunriseH)}–${climateHM(x.terrainSunsetH)}</td><td>${climateNum(x.terrainSunHours,2)} h</td><td>${t?climateNum(t.sunUpHoursBlockedPct,1)+' %':'—'}</td>`:''}</tr>`;}).join('')}</tbody></table></div>
    ${climateNeighbourView(sun.neighbourShading)}${climateRefs('sun')}`;
}
function climateNeighbourView(ns){
  if(!ns||!Array.isArray(ns.dates))return '';
  const dates=ns.dates.filter(d=>!/September/.test(d.label)),cell=(d,H,g)=>d.rows.find(r=>r.heightM===H&&r.gapM===g);
  return `<h3 class="climate-subhead">A building to the south: how far up its winter shadow climbs</h3><p class="subtitle">How high up our south wall (m above our grade) the noon shadow of a neighbour wall of height H at gap d reaches; in brackets, the hours that day when sun clears the wall for a window sill ${climateNum(ns.sillHeightM,0)} m above grade. Hypothetical heights; the 3D sun & shade model gives the real answer.</p>
    <div class="research-table climate-table"><table><thead><tr><th scope="col">Date · noon sun</th><th scope="col">Neighbour H</th>${ns.gapsM.map(g=>`<th scope="col">d = ${climateNum(g,1)} m</th>`).join('')}<th scope="col">Gap for noon sun on the sill</th></tr></thead><tbody>${dates.map(d=>ns.heightsM.map((H,i)=>`<tr>${i===0?`<th scope="rowgroup" rowspan="${ns.heightsM.length}">${e(d.label)}<small>${climateNum(d.noonAltitudeDeg,1)}° · shadow ${climateNum(d.noonShadowPerMetre,2)} × height</small></th>`:''}<th scope="row">${climateNum(H,0)} m</th>${ns.gapsM.map(g=>{const r=cell(d,H,g);return `<td>${r?`${climateNum(r.noonShadeHeightOnOurWallM,1)} m <small>(${climateNum(r.sunHoursAtSill,1)} h)</small>`:'—'}</td>`;}).join('')}<td>${climateNum(d.clearGapForSillAtNoonM?.[String(H.toFixed(1))]??d.clearGapForSillAtNoonM?.[String(H)],1)} m</td></tr>`).join('')).join('')}</tbody></table></div><p class="climate-muted">${e(ns.method||'')}</p>`;
}

/* ---------- 3. Monthly climate ---------- */
const CLIMATE_BAR_OPTIONS=[['precip','Precipitation (mm)','precipMm'],['snow','Deepest snow (cm)','maxSnowDepthCm'],['snowdays','Days with snow on ground','snowCoverDays'],['hdd','Heating degree-days','hdd18']];
function climateBarPath(x,y,w,h){const r=Math.min(3,h,w/2);if(h<=0)return '';return `M${climateR(x)} ${climateR(y+h)}V${climateR(y+r)}Q${climateR(x)} ${climateR(y)} ${climateR(x+r)} ${climateR(y)}H${climateR(x+w-r)}Q${climateR(x+w)} ${climateR(y)} ${climateR(x+w)} ${climateR(y+r)}V${climateR(y+h)}Z`;}
function climateMonthlySvg(st){
  const c=climateData(),opt=CLIMATE_BAR_OPTIONS.find(o=>o[0]===climateView.monthlyBars)||CLIMATE_BAR_OPTIONS[0],key=opt[2],mon=st.monthly;
  const W=720,ml=46,mr=14,y0=26,y1=200,y2=250,y3=332,bw=(W-ml-mr)/12,X=i=>ml+bw*(i+.5);
  const all=c.stations.flatMap(s=>s.monthly);const tMin=Math.floor(Math.min(...all.map(m=>m.minT))/10)*10,tMax=Math.ceil(Math.max(...all.map(m=>m.maxT))/10)*10;
  const T=t=>y0+(tMax-t)/(tMax-tMin)*(y1-y0);
  const bMaxRaw=Math.max(...all.map(m=>Number(m[key])||0)),bStep=bMaxRaw>400?200:bMaxRaw>100?50:bMaxRaw>40?10:5,bMax=Math.ceil(bMaxRaw/bStep)*bStep||1,B=v=>y3-(v/bMax)*(y3-y2);
  let g='';for(let t=tMin;t<=tMax;t+=10)g+=`<line x1="${ml}" x2="${W-mr}" y1="${climateR(T(t))}" y2="${climateR(T(t))}" class="${t===0?'climate-zero':'climate-grid'}"/><text x="${ml-6}" y="${climateR(T(t))+4}" text-anchor="end" class="climate-axis-label">${climateNum(t)}°</text>`;
  [0,bMax/2,bMax].forEach(v=>{g+=`<line x1="${ml}" x2="${W-mr}" y1="${climateR(B(v))}" y2="${climateR(B(v))}" class="climate-grid"/><text x="${ml-6}" y="${climateR(B(v))+4}" text-anchor="end" class="climate-axis-label">${climateNum(v)}</text>`;});
  const whisk=mon.map((m,i)=>`<line x1="${climateR(X(i))}" x2="${climateR(X(i))}" y1="${climateR(T(m.maxT))}" y2="${climateR(T(m.minT))}" class="climate-whisker"/>`).join('');
  const band=`<path d="M${mon.map((m,i)=>`${climateR(X(i))} ${climateR(T(m.meanDailyMax))}`).join('L')}L${mon.map((m,i)=>`${climateR(X(i))} ${climateR(T(m.meanDailyMin))}`).reverse().join('L')}Z" class="climate-band"/>`;
  const line=`<polyline points="${mon.map((m,i)=>`${climateR(X(i))},${climateR(T(m.meanT))}`).join(' ')}" class="climate-meanline"/>`+mon.map((m,i)=>`<circle cx="${climateR(X(i))}" cy="${climateR(T(m.meanT))}" r="4" class="climate-meandot"/>`).join('');
  const lo=mon.reduce((a,b,i)=>b.meanT<mon[a].meanT?i:a,0),hi=mon.reduce((a,b,i)=>b.meanT>mon[a].meanT?i:a,0);
  const lab=[lo,hi].map(i=>`<text x="${climateR(X(i)+7)}" y="${climateR(T(mon[i].meanT))+(i===lo?16:-8)}" class="climate-value-label climate-halo">${climateNum(mon[i].meanT,1)}°</text>`).join('');
  const bmax=mon.reduce((a,b,i)=>(Number(b[key])||0)>(Number(mon[a][key])||0)?i:a,0);
  const bars=mon.map((m,i)=>{const v=Number(m[key])||0;return `<path d="${climateBarPath(X(i)-bw*.28,B(v),bw*.56,y3-B(v))}" class="climate-bar"/>`;}).join('')+`<text x="${climateR(X(bmax))}" y="${climateR(B(Number(mon[bmax][key])||0))-5}" text-anchor="middle" class="climate-value-label">${climateNum(mon[bmax][key])}</text>`;
  const hits=mon.map((m,i)=>`<rect x="${climateR(X(i)-bw/2)}" y="${y0}" width="${climateR(bw)}" height="${y3-y0}" class="climate-hit"><title>${e(m.month)}: mean ${climateNum(m.meanT,1)} °C; daily max ${climateNum(m.meanDailyMax,1)}, daily min ${climateNum(m.meanDailyMin,1)}; hourly range ${climateNum(m.minT,1)} to ${climateNum(m.maxT,1)} °C. ${opt[1]}: ${climateNum(m[key])}</title></rect>`).join('');
  const months=mon.map((m,i)=>`<text x="${climateR(X(i))}" y="350" text-anchor="middle" class="climate-axis-label">${e(m.month)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} 360" class="climate-monthly" role="img" aria-labelledby="mon-t mon-d"><title id="mon-t">Monthly temperature and ${e(opt[1].toLowerCase())}, ${e(st.name)}</title><desc id="mon-d">Top: shaded band from average daily low to average daily high, line for the monthly mean, thin grey lines for the coldest and warmest hour of each month. Bottom: ${e(opt[1])} per month. Typical-year (TMYx) data.</desc>
    <text x="${ml}" y="14" class="climate-panel-label">Air temperature, °C</text><text x="${ml}" y="${y2-12}" class="climate-panel-label">${e(opt[1])}</text>${g}<text x="${ml+4}" y="${climateR(T(0))-4}" class="climate-axis-label climate-halo">freezing</text>${whisk}${band}${line}${lab}${bars}${months}${hits}</svg>`;
}
function climateStationTable(){
  const c=climateData(),S=c.stations;
  const rows=[
    ['Where',s=>`${climateNum(s.elevation)} m elevation (${s.elevationDiffM>=0?'+':'−'}${climateNum(Math.abs(s.elevationDiffM))} m vs site) · ${climateNum(s.distanceKm,1)} km at ${climateNum(s.bearingFromSiteDeg)}°`],
    ['Mean temperature, year / Jan / Jul',s=>`${climateNum(s.annual.meanT,1)} / ${climateNum(s.monthly[0].meanT,1)} / ${climateNum(s.monthly[6].meanT,1)} °C`],
    ['Heating / cooling degree-days (18 °C)',s=>`${climateNum(s.annual.hdd18)} / ${climateNum(s.annual.cdd18)}`],
    ['Winter design temperature, 99.6 % / 99 %',s=>`${climateNum(s.design.heating.db996,1)} / ${climateNum(s.design.heating.db990,1)} °C`],
    ['Wind on design-cold hours',s=>`${climateNum(s.design.heating.mcws996,1)} m/s from ${climateNum(s.design.heating.pcwd996)}°`],
    ['Summer design temperature, 0.4 %',s=>`${climateNum(s.design.cooling.db004,1)} °C`],
    ['Coldest hour, 50-year return',s=>`${climateNum(s.design.extremes?.returnPeriodDb?.['50']?.min,1)} °C`],
    ['Hours below −20 / −10 / 0 °C',s=>`${climateNum(s.thresholds.hoursBelowMinus20)} / ${climateNum(s.thresholds.hoursBelowMinus10)} / ${climateNum(s.thresholds.hoursBelow0)}`],
    ['Hours above 25 / 30 °C',s=>`${climateNum(s.thresholds.hoursAbove25)} / ${climateNum(s.thresholds.hoursAbove30)}`],
    ['Ice days (max < 0) / frost days (min < 0)',s=>`${climateNum(s.thresholds.daysMaxBelow0)} / ${climateNum(s.thresholds.daysMinBelow0)}`],
    ['Frost-free season',s=>{const f=s.annual.frostFreeSeason||{};return `${climateNum(f.days)} days (${e(f.lastSpringFrost||'')} → ${e(f.firstAutumnFrost||'')}, MM-DD)`;}],
    ['Snow on ground / deepest',s=>`${climateNum(s.annual.snowCoverDays)} days / ${climateNum(s.annual.maxSnowDepthCm)} cm`],
    ['Air freezing index (typical year)',s=>`${climateNum(s.annual.airFreezingIndexCDays)} °C-days`],
    ['Precipitation, TMYx / long-term',s=>`${climateNum(s.annual.precipMm)} / ${climateNum(s.longTermStat?.standardPrecipMm?.annual)} mm`],
    ['Ground at 0.5 m, coldest month',s=>`${climateNum(Math.min(...(s.groundTemperatureC?.['0.5m']||[NaN])),1)} °C`],
    ['ASHRAE climate zone · Köppen',s=>`${e(s.climateZone?.ashraeClimateZone)} · ${e(s.climateZone?.koppen)} (${e(s.climateZone?.koppenLabel)})`],
    ['Months drawn from',s=>`<small>${e(s.sourceMonths)}</small>`]
  ];
  return `<div class="research-table climate-table climate-compare"><table><caption>Station comparison (typical year unless noted; design values from the ASHRAE 2025 header)</caption><thead><tr><th scope="col">Measure</th>${S.map(s=>`<th scope="col">${e(climateShort(s))}${s.id===c.site.primaryStation?' · primary':''}</th>`).join('')}</tr></thead><tbody>${rows.map(([l,f])=>`<tr><th scope="row">${e(l)}</th>${S.map(s=>`<td>${f(s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function climateMonthlyView(){
  const st=climateStationById(climateView.monthlyStation),mon=st.monthly;
  const frozen=mon.filter(m=>m.meanDailyMax<0).map(m=>m.month),snowy=mon.filter(m=>m.snowCoverDays>=15).map(m=>m.month);
  return `${climateSectionHead('monthly','3 · Cold & snow','How cold, how snowy, how long',`The band shows a normal day's range (average low to average high); the thin grey lines reach the coldest and warmest single hour of the month. Cold drives insulation and heating; snow drives roof shape, entries and where plowed snow goes.`)}
    <div class="climate-controls">${climateStationSeg('monthlyStation','monthly')}${climateSeg('monthlyBars',CLIMATE_BAR_OPTIONS.map(o=>[o[0],o[1]]),climateView.monthlyBars,'Bottom chart shows','monthly')}</div>
    <figure class="climate-wide"><div class="climate-scroll" tabindex="0" aria-label="Monthly chart, scrolls sideways on small screens">${climateMonthlySvg(st)}</div><figcaption><ul class="climate-legend inline"><li><i class="band"></i>Average daily low–high</li><li><i class="line-blue"></i>Monthly mean</li><li><i class="line-grey"></i>Coldest / warmest hour</li><li><i style="background:#2a78d6"></i>Bottom chart (selected measure)</li></ul><p>At ${e(climateShort(st))}, ${frozen.length?`days stay below freezing on average in <strong>${frozen.map(e).join(', ')}</strong>`:'no month averages a high below freezing'}; snow covers the ground for half the month or more in <strong>${snowy.map(e).join(', ')||'no month'}</strong>. Hover a month for its numbers.</p></figcaption></figure>
    <details class="climate-details"><summary>Monthly values table (${e(climateShort(st))})</summary><div class="research-table climate-table"><table><thead><tr><th scope="col">Month</th><th scope="col">Mean °C</th><th scope="col">Avg high</th><th scope="col">Avg low</th><th scope="col">Coldest h</th><th scope="col">Warmest h</th><th scope="col">Precip mm</th><th scope="col">Snow cm</th><th scope="col">Snow days</th><th scope="col">HDD18</th><th scope="col">Sun kWh/m²</th><th scope="col">Wind m/s</th></tr></thead><tbody>${mon.map(m=>`<tr><th scope="row">${e(m.month)}</th><td>${climateNum(m.meanT,1)}</td><td>${climateNum(m.meanDailyMax,1)}</td><td>${climateNum(m.meanDailyMin,1)}</td><td>${climateNum(m.minT,1)}</td><td>${climateNum(m.maxT,1)}</td><td>${climateNum(m.precipMm)}</td><td>${climateNum(m.maxSnowDepthCm)}</td><td>${climateNum(m.snowCoverDays)}</td><td>${climateNum(m.hdd18)}</td><td>${climateNum(m.ghiKWhM2,1)}</td><td>${climateNum(m.meanWindMs,1)}</td></tr>`).join('')}</tbody></table></div></details>
    ${climateStationTable()}
    <p class="climate-muted">${climateCopy('precipNote','Precipitation totals in these typical-year files run well above the long-term record; use them for seasonality, not drainage design.')}</p>
    ${climateRefs('monthly')}`;
}

/* ---------- 4. Sun on surfaces ---------- */
function climateSurfacesView(){
  const c=climateData(),si=c.surfaceIrradiance,id=climateView.surfaceStation,vals=si.values[id]||si.values[si.primaryStation];
  const rows=si.surfaces.filter(s=>vals[s.id]).map(s=>({...s,...vals[s.id]})).sort((a,b)=>b.annual-a.annual);
  const max=Math.max(...rows.map(r=>r.annual));
  const get=k=>rows.find(r=>r.id===k);const S=get('wall-S'),N=get('wall-N'),SE=get('wall-permit-SE'),R45=get('roof-S45'),RF=get('roof-flat');
  const msg=[S&&N?`A south wall gets <strong>${climateNum(S.heatingSeasonOctApr)} kWh/m²</strong> from October to April, ${climateNum(S.heatingSeasonOctApr/N.heatingSeasonOctApr,1)}× a north wall.`:'',S&&SE?`The real permit's south-east-facing long wall gets ${climateNum(SE.heatingSeasonOctApr)} (${climateNum((SE.heatingSeasonOctApr/S.heatingSeasonOctApr-1)*100)} % vs due south) in the same months.`:'',R45&&RF?(()=>{const roofs=rows.filter(r=>r.id.startsWith('roof')),top=roofs[0];return `For solar panels, the best roof here (${e(top.label.toLowerCase())}) collects ${climateNum(top.annual)} kWh/m² a year vs ${climateNum(RF.annual)} flat; a steeper 45° south roof gets ${climateNum(R45.annual)} and sheds snow better.`;})():''].filter(Boolean).join(' ');
  return `${climateSectionHead('surfaces','4 · Sun on surfaces','Which walls and roofs collect the most sun',climateCopy('surfacesLede','Total sunshine landing on one square metre of each surface. The heating season (October–April) is what warms the house through windows; the annual total is what solar panels see. No trees or terrain shading included.'))}
    <div class="climate-controls">${climateStationSeg('surfaceStation','surfaces')}</div>
    <div class="climate-bars" role="table" aria-label="Solar energy per square metre by surface">
      <div class="climate-bars-head" role="row"><span role="columnheader">Surface</span><span role="columnheader"><i style="background:#2a78d6"></i>Year <i style="background:#1baf7a"></i>Oct–Apr · kWh/m²</span></div>
      ${rows.map(r=>`<div class="climate-bars-row ${r.id.startsWith('wall-permit')?'permit':''}" role="row"><span role="rowheader">${e(r.label)}${r.id.startsWith('wall-permit')?' <span class="climate-prov">provisional</span>':''}<small>${climateNum(r.tiltDeg)}° tilt · faces ${climateNum(r.azimuthDeg)}° · ${climateNum(r.directFractionPct)} % direct</small></span><span role="cell" class="climate-bar-cell"><span class="climate-hbar year" style="width:${climateR(r.annual/max*100)}%" title="Year ${climateNum(r.annual)} kWh/m²"></span><b>${climateNum(r.annual)}</b><span class="climate-hbar heat" style="width:${climateR(r.heatingSeasonOctApr/max*100)}%" title="Oct–Apr ${climateNum(r.heatingSeasonOctApr)} kWh/m²"></span><b>${climateNum(r.heatingSeasonOctApr)}</b></span></div>`).join('')}
    </div>
    <div class="climate-note"><h3>What it means</h3><p>${msg} ${climateCopy('surfacesMeaning','Snow on the ground reflects extra light onto south walls in winter. This is the case for putting most windows on the south side and keeping east, west and north glass modest.')}</p></div>
    <details class="climate-details"><summary>Monthly kWh/m² by surface</summary><div class="research-table climate-table"><table><thead><tr><th scope="col">Surface</th>${CLIMATE_MONTHS.map(m=>`<th scope="col">${m}</th>`).join('')}<th scope="col">Year (albedo 0.2)</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${e(r.label)}</th>${(r.monthly||[]).map(v=>`<td>${climateNum(v)}</td>`).join('')}<td>${climateNum(r.annualConstantAlbedo02)}</td></tr>`).join('')}</tbody></table></div><p class="climate-muted">${e(si.method||'')}</p></details>
    ${climateRefs('surfaces')}`;
}

/* ---------- 5. Outdoor comfort ---------- */
const CLIMATE_SCENARIO_SHORT={shadeWind:'Shade, in the wind',shadeCalm:'Shade, sheltered from wind',sunCalm:'Sun, sheltered from wind'};
const CLIMATE_STRATEGIES={comfortPolygon:'Comfortable with no help',internalHeat:'Heat from people, cooking and appliances',passiveSolar:'Sun through south windows (passive solar)',massNightFlush:'Thermal mass + night cooling',occupantFan:'Ceiling fan',evaporativeCooling:'Evaporative cooling',allStrategies:'All of the above combined'};
function climateHeatCells(values,ramp,label){return values.map((v,i)=>{const c=climateRamp(ramp,v);return `<td class="climate-heat ${c.dark?'dark':''}" style="background:${c.bg}" title="${e(label)}, ${CLIMATE_MONTHS[i]}: ${climateNum(v)} %">${climateNum(v)}</td>`;}).join('');}
function climateComfortView(){
  const c=climateData(),cs=c.comfort.byStation[climateView.comfortStation]||c.comfort.byStation[c.site.primaryStation],sc=cs.scenarios,keys=Object.keys(sc);
  const best=CLIMATE_MONTHS.map((_,i)=>keys.reduce((a,k)=>sc[k].daytimeNoStressPctByMonth[i]>sc[a].daytimeNoStressPctByMonth[i]?k:a,keys[0]));
  const gain=sc.sunCalm&&sc.shadeWind?CLIMATE_MONTHS.filter((_,i)=>sc.sunCalm.daytimeNoStressPctByMonth[i]-sc.shadeWind.daytimeNoStressPctByMonth[i]>=30):[];
  const shadeBetter=sc.sunCalm&&sc.shadeCalm?CLIMATE_MONTHS.filter((_,i)=>sc.shadeCalm.daytimeNoStressPctByMonth[i]-sc.sunCalm.daytimeNoStressPctByMonth[i]>=20):[];
  const ps=cs.pmvStrategies;
  return `${climateSectionHead('comfort','5 · Outdoor comfort','When it is pleasant to be outside',`Share of daytime hours (08–18 h) with no heat or cold stress (UTCI 9–26 °C) for a person standing in three kinds of outdoor spot. Darker green = more comfortable hours.`)}
    <div class="climate-controls">${climateStationSeg('comfortStation','comfort')}</div>
    <div class="research-table climate-table climate-heatmap"><table><caption>Daytime hours without thermal stress, % by month</caption><thead><tr><th scope="col">Outdoor spot</th>${CLIMATE_MONTHS.map(m=>`<th scope="col">${m}</th>`).join('')}<th scope="col">Year, all hours</th></tr></thead><tbody>${keys.map(k=>`<tr><th scope="row">${e(CLIMATE_SCENARIO_SHORT[k]||sc[k].label)}<small>${e(sc[k].label)}</small></th>${climateHeatCells(sc[k].daytimeNoStressPctByMonth,CLIMATE_GREEN,CLIMATE_SCENARIO_SHORT[k]||k)}<td><strong>${climateNum(sc[k].annualNoStressPct,0)} %</strong></td></tr>`).join('')}<tr class="climate-best"><th scope="row">Best spot this month</th>${best.map(k=>`<td>${e({shadeWind:'Breezy shade',shadeCalm:'Calm shade',sunCalm:'Sunny & calm'}[k]||k)}</td>`).join('')}<td></td></tr></tbody></table></div>
    <div class="climate-note"><h3>What it means</h3><p>${gain.length?`A sunny spot sheltered from wind — a south-facing porch or courtyard tucked out of the cold-wind side — turns <strong>${gain.join(', ')}</strong> from mostly uncomfortable into usable outdoor months. `:''}${shadeBetter.length?`In <strong>${shadeBetter.join(', ')}</strong> a shaded spot beats full sun, so the same outdoor room needs a roof, trellis or tree for midsummer.`:''}</p></div>
    <h3 class="climate-subhead">Whole year, all hours, by stress level</h3>
    <div class="climate-stack-list">${keys.map(k=>`<div class="climate-stack-row"><span>${e(CLIMATE_SCENARIO_SHORT[k]||k)}</span><div class="climate-stack" role="img" aria-label="${e(sc[k].label)}: ${c.comfort.categories.map((cat,i)=>`${cat.label} ${climateNum(sc[k].annualPct[i],0)} %`).join(', ')}">${c.comfort.categories.map((cat,i)=>sc[k].annualPct[i]>0?`<i style="width:${sc[k].annualPct[i]}%;background:${CLIMATE_UTCI[cat.id]||'#ccc'}" title="${e(cat.label)}: ${climateNum(sc[k].annualPct[i],1)} %"></i>`:'').join('')}</div></div>`).join('')}</div>
    <ul class="climate-legend inline">${c.comfort.categories.filter(cat=>keys.some(k=>sc[k].annualPct[c.comfort.categories.indexOf(cat)]>0)).map(cat=>`<li><i style="background:${CLIMATE_UTCI[cat.id]||'#ccc'}"></i>${e(cat.label)}</li>`).join('')}</ul>
    ${ps?`<h3 class="climate-subhead">Indoors: what passive design can cover</h3><p class="subtitle">Share of all hours each strategy could make comfortable indoors without a heater or air-conditioner (strategies overlap). ${climateNum(ps.allStrategiesPct,0)} % of the year is covered by passive means; <strong>${climateNum(ps.notComfortableColdPct,0)} % still needs active heating</strong>.</p>
    <div class="research-table climate-table climate-heatmap"><table><thead><tr><th scope="col">Strategy</th>${CLIMATE_MONTHS.map(m=>`<th scope="col">${m}</th>`).join('')}<th scope="col">Year</th></tr></thead><tbody>${Object.entries(ps.monthlyPct||{}).map(([k,v])=>`<tr class="${k==='allStrategies'?'climate-total':''}"><th scope="row">${e(CLIMATE_STRATEGIES[k]||climateTextLabel(k))}</th>${climateHeatCells(v,CLIMATE_BLUE,CLIMATE_STRATEGIES[k]||k)}<td><strong>${climateNum(k==='allStrategies'?ps.allStrategiesPct:ps.annualPct?.[k],1)} %</strong></td></tr>`).join('')}</tbody></table></div><p class="climate-muted">${e(ps.note||'')}</p>`:''}
    ${climateRefs('comfort')}`;
}

/* ---------- 6. Hazards & design values ---------- */
function climateRingSummary(l,points){
  const ring=l.ring200m||[];if(!ring.length)return '—';
  const dec=Array.isArray(l.ringDecoded)&&l.ringDecoded.length===ring.length?l.ringDecoded:null;
  const vals=ring.map((v,i)=>dec?dec[i]:v),counts={};vals.forEach(v=>{counts[v]=(counts[v]||0)+1;});
  const dirs=points.filter(p=>p.id!=='house').map(p=>String(p.id).replace(/^ring200m-/,''));
  return `${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([v,n])=>`${e(v)} ×${n}`).join(' · ')}<small>${vals.map((v,i)=>`${e(dirs[i]||i+1)} ${e(v)}`).join(' · ')}${!dec&&Array.isArray(l.ringDecoded)&&l.ringDecoded.length?`<br>Classes present: ${l.ringDecoded.map(e).join('; ')}`:''}</small>`;
}
function climateHazardsView(){
  const c=climateData(),h=c.hazards,pts=h.samplePoints||[];
  const wf=Object.entries(h.wildfire||{}),com=Object.values(h.community||{}),dv=Object.entries(h.designValues||{});
  const DV={groundSnowLoad:'Ground snow load (Pg)',basicWindSpeed:'Design wind speed',frostDepth:'Frost line (footing depth)',weathering:'Weathering (concrete & masonry)',seismicDesignCategory:'Seismic design category',iceBarrierUnderlayment:'Ice-barrier underlayment',energyClimateZone:'Energy-code climate zone'};
  const pct=v=>v===undefined||v===null?'—':`${climateNum(v*100,0)}th`;
  const scr=Array.isArray(h.screening)?h.screening:[];
  return `${climateSectionHead('hazards','6 · Hazards & code values',climateCopy('hazardsTitle','Wildfire screening and the numbers the town sets'),climateCopy('hazardsLede',`Public wildfire maps sampled at the house point and at eight points 200 m away. They are coarse (30–270 m cells) and pre-date any clearing, so read them as context. Structural design values come from the town, not from this research.`))}
    ${scr.length?`<h3 class="climate-subhead">Screening at the lot</h3><div class="research-table climate-table"><table><thead><tr><th scope="col">Item</th><th scope="col">Result</th><th scope="col">Detail</th><th scope="col">Source</th></tr></thead><tbody>${scr.map(x=>`<tr><th scope="row">${e(x.label||x.id)}</th><td>${x.value?`<strong>${e(x.value)}</strong>`:'<span class="climate-unknown">Unknown</span>'}<small>${e(x.status||'')}</small></td><td>${e(x.detail||'')}</td><td>${x.source?climateLink(x.source,/^https?:/i.test(x.source)?climateHost(x.source):x.source):''}<small>${e(String(x.retrievedAt||'').slice(0,10))}</small></td></tr>`).join('')}</tbody></table></div>`:''}${wf.length?`<h3 class="climate-subhead">Wildfire layers at the house</h3>
    <div class="research-table climate-table"><table><thead><tr><th scope="col">Layer</th><th scope="col">At the house</th><th scope="col">Ring 200 m away</th><th scope="col">Source</th></tr></thead><tbody>${wf.map(([k,l])=>`<tr><th scope="row">${e(l.label||k)}${l.valueNote?`<small>${e(l.valueNote)}</small>`:''}</th><td><strong>${e(l.houseDecoded??l.house??'—')}</strong>${l.houseDecoded&&l.house!==undefined?`<small>code ${e(l.house)}</small>`:l.serviceRange?`<small>scale ${climateNum(l.serviceRange[0])}–${climateNum(l.serviceRange[1])}</small>`:''}${l.status&&l.status!=='obtained'?`<small class="climate-unknown">${e(l.status)}</small>`:''}</td><td>${climateRingSummary(l,pts)}</td><td>${climateLink(l.source,climateHost(l.source))}<small>${e(String(l.retrievedAt||'').slice(0,10))}</small></td></tr>`).join('')}</tbody></table></div>`:''}
    ${com.length?`<h3 class="climate-subhead">Community wildfire risk (wildfirerisk.org)</h3><div class="research-table climate-table"><table><thead><tr><th scope="col">Place</th><th scope="col">Risk to homes</th><th scope="col">Likelihood</th><th scope="col">Exposure</th><th scope="col">Percentile: nation / state</th><th scope="col">Source</th></tr></thead><tbody>${com.map(x=>`<tr><th scope="row">${e(x.name)}</th><td>${e(x.riskToHomes)}</td><td>${e(x.wildfireLikelihood)}</td><td>${e(x.exposureType)}</td><td>${pct(x.ranks?.rps_within_nation)} / ${pct(x.ranks?.rps_within_state)}</td><td>${climateLink(x.source,'API record')}<small>${e(String(x.retrievedAt||'').slice(0,10))}</small></td></tr>`).join('')}</tbody></table></div><p class="climate-muted">Percentile of risk to potential structures; lower means lower risk than most places. Low likelihood with high exposure means fire is rare, but if one comes homes here sit in or next to fuel — so a cleared, lean zone around the house still matters.</p>`:''}
    <h3 class="climate-subhead">Structural design values</h3>
    <div class="research-table climate-table"><table><thead><tr><th scope="col">Value</th><th scope="col">Status</th><th scope="col">What we know</th><th scope="col">Gap · source</th></tr></thead><tbody>${dv.map(([k,v])=>`<tr class="${v.value===null||v.value===undefined?'climate-row-unknown':''}"><th scope="row">${e(DV[k]||climateTextLabel(k))}</th><td>${v.value===null||v.value===undefined?'<span class="climate-unknown">Unknown</span>':`<strong>${e(v.value)}</strong>`}<small>${e(v.status||'')}</small></td><td>${e(v.known||'')}</td><td>${v.gap?`${e(v.gap)}`:''}<small>${e(v.source||'')}</small></td></tr>`).join('')}</tbody></table></div>
    <div class="evidence-gap-grid climate-gaps">
      <article><h3>Data we tried and could not get</h3><ul>${(h.gaps||[]).map(g=>{const d=String(g.detail||'');return `<li><strong>${e(g.label)}</strong> — ${e(g.status===null||g.status===undefined?'no response':g.status)}${d&&!d.trim().startsWith('<')?`: ${e(d.slice(0,160))}`:d?': error page returned':''}</li>`;}).join('')}</ul></article>
      <article><h3>Questions for the building official</h3><ol>${(h.questionsForBuildingOfficial||[]).map(q=>`<li>${e(typeof q==='string'?q:q.question)}</li>`).join('')}</ol></article>
    </div>
    <p class="climate-muted">${e(h.limits||'')}</p>
    ${climateRefs('hazards')}`;
}

/* ---------- 7. Findings ---------- */
function climateFindingsView(){
  const f=climateData().findings;if(!f||!Array.isArray(f.findings))return `${climateSectionHead('findings','7 · Findings','Climate findings')}<p class="subtitle">No findings in this data file.</p>`;
  const docs=climateData().docs||{findingsMd:'ops/climate-findings.md',findingsJson:'ops/climate-findings.json',methods:'ops/climate.md'};
  const refs=ids=>(ids||[]).map(id=>`<button type="button" class="finding-id climate-idlink" data-climate-jump="climate-finding-${e(id)}">${e(id)}</button>`).join(' ');
  return `${climateSectionHead('findings','7 · Findings',`Climate findings · ${e(f.revision||'')}`,e(f.scope||''))}
    <div class="research-links"><a href="${e(docs.findingsMd)}" target="_blank">Findings · Markdown ↗</a><a href="${e(docs.findingsJson)}" download>Structured findings · JSON</a>${docs.methods?`<a href="${e(docs.methods)}" target="_blank">Methods & limits ↗</a>`:''}</div>
    <div class="research-table climate-table"><table><thead><tr><th scope="col">ID</th><th scope="col">Finding</th><th scope="col">Status</th></tr></thead><tbody>${f.findings.map(x=>`<tr><td>${refs([x.id])}</td><td><strong>${e(x.title)}</strong><small>${e(x.headline)}</small></td><td>${climateBadge(x.status)}</td></tr>`).join('')}</tbody></table></div>
    <div class="findings-register">${f.findings.map(x=>`<article id="climate-finding-${e(x.id)}" tabindex="-1"><div class="section-header"><h3><span class="finding-id">${e(x.id)}</span> ${e(x.title)}</h3>${climateBadge(x.status)}</div><p><strong>${e(x.headline)}</strong></p><p>${e(x.finding)}</p><p class="finding-implication"><strong>Design consequence</strong> ${e(x.designConsequence)}</p><div class="research-links">${(x.sources||[]).map(s=>climateLink(s.href,s.label)).join('')}</div></article>`).join('')}</div>
    ${f.nextActions?.length?`<div class="research-next"><h3>Next actions, in order</h3><ol>${f.nextActions.map(x=>`<li><strong>${e(x.title)}.</strong> ${e(x.detail)} ${refs(x.findingIds)}</li>`).join('')}</ol></div>`:''}
    ${f.questions?.length?`<h3 class="climate-subhead">Questions for an architect or engineer</h3><div class="research-table climate-table"><table><thead><tr><th scope="col">Ask</th><th scope="col">Question</th><th scope="col">Findings</th></tr></thead><tbody>${f.questions.map(q=>`<tr><th scope="row">${e(q.to)}</th><td>${e(q.question)}</td><td>${refs(q.findingIds)}</td></tr>`).join('')}</tbody></table></div>`:''}`;
}

/* ---------- Assembly & events ---------- */
const CLIMATE_SECTIONS={wind:climateWindView,sun:climateSunView,monthly:climateMonthlyView,surfaces:climateSurfacesView,comfort:climateComfortView,hazards:climateHazardsView,findings:climateFindingsView};
function climateSectionInner(key){
  try{return CLIMATE_SECTIONS[key]();}
  catch(err){console.error(`Climate section "${key}" failed`,err);return `<h2 id="climate-${key}-title">${e(climateTextLabel(key))}</h2><p class="subtitle">This section could not be drawn from the current ${e(climateData()?.dataFile||'climate-data.js')} (${e(err.message)}). Regenerate it with ${e(climateData()?.generatedBy||'scripts/prepare-climate.py')}.</p>`;}
}
function siteClimateView(data=climateDefaultData()){
  climateUse(data);
  if(!data&&arguments.length&&arguments[0]!==undefined)return `<section class="panel climate-missing"><p class="research-eyebrow">Climate & sun</p><h2>Climate data not generated</h2><p class="subtitle">This project's climate data file is missing or failed to load. Run its <code>scripts/prepare-*-climate.py</code> script from the repository root, then reload.</p></section>`;
  if(!data)return `<section class="panel climate-missing"><p class="research-eyebrow">Climate & sun</p><h2>Climate data not generated</h2><p class="subtitle">climate-data.js is missing or failed to load. Run <code>.venv/bin/python scripts/prepare-climate.py</code> from the repository root, then reload. Methods and inputs are in <a href="ops/climate.md" target="_blank">ops/climate.md</a>.</p></section>`;
  let head;try{head=climateHeaderView();}catch(err){console.error('Climate header failed',err);head='';}
  return `<div class="climate-view" data-climate-dataset="${e(climateDatasetId(data))}">${head}${Object.keys(CLIMATE_SECTIONS).map(k=>`<section class="panel climate-section" id="climate-${k}" tabindex="-1" aria-labelledby="climate-${k}-title">${climateSectionInner(k)}</section>`).join('')}</div>`;
}
function climateRerender(section,key,value){
  const box=document.getElementById(`climate-${section}`);if(!box)return;
  box.innerHTML=climateSectionInner(section);
  box.querySelector(`[data-climate-set="${key}"][data-climate-value="${CSS.escape(String(value))}"]`)?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
  const set=event.target.closest('[data-climate-set]');
  if(set){const root=set.closest('[data-climate-dataset]'),ds=root&&climateDatasets.get(root.dataset.climateDataset);if(ds)climateUse(ds);const key=set.dataset.climateSet,raw=set.dataset.climateValue;if(!(key in climateView))return;climateView[key]=typeof climateView[key]==='number'?Number(raw):raw;climateRerender(set.dataset.climateSection,key,raw);return;}
  const jump=event.target.closest('[data-climate-jump]');
  if(jump){const el=document.getElementById(jump.dataset.climateJump);if(!el)return;const smooth=!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;el.scrollIntoView({behavior:smooth?'smooth':'auto',block:'start'});el.focus({preventScroll:true});}
});
