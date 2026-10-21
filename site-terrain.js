'use strict';

let terrainLayer='slope';
let terrainBoundary=true;
let terrainContours=false;
let terrainContext=true;
let terrainYaw=-.55;
let terrainTilt=.75;
let terrainExaggeration=1;
let terrainZoom=1;
let terrainFocusLot=false;

function terrainLotFocus(){
  if(typeof SITE_CONSTRAINTS==='undefined')return null;
  const lot=SITE_CONSTRAINTS.layers.find(l=>l.id==='lot1'),[x0,y0,x1,y1]=SITE_TERRAIN.bounds,pts=lot.utm.flat(2);
  const us=pts.map(p=>(p[0]-x0)/(x1-x0)),vs=pts.map(p=>(y1-p[1])/(y1-y0));
  const cu=(Math.min(...us)+Math.max(...us))/2,cv=(Math.min(...vs)+Math.max(...vs))/2,span=Math.max(Math.max(...us)-Math.min(...us),Math.max(...vs)-Math.min(...vs))*1.8;
  return {cu,cv,span,u0:Math.max(0,Math.min(1-span,cu-span/2)),v0:Math.max(0,Math.min(1-span,cv-span/2))};
}

function terrainElevationAt(u,v){
  const t=SITE_TERRAIN,gx=Math.max(0,Math.min(t.cols-1,u*(t.cols-1))),gy=Math.max(0,Math.min(t.rows-1,v*(t.rows-1)));
  const c=Math.min(t.cols-2,Math.floor(gx)),r=Math.min(t.rows-2,Math.floor(gy)),fx=gx-c,fy=gy-r;
  const z=[t.elevations[r*t.cols+c],t.elevations[r*t.cols+c+1],t.elevations[(r+1)*t.cols+c],t.elevations[(r+1)*t.cols+c+1]];
  if(z.some(x=>x===null))return z.find(x=>x!==null)??null;
  return (z[0]*(1-fx)+z[1]*fx)*(1-fy)+(z[2]*(1-fx)+z[3]*fx)*fy;
}

function terrainProfile(points,title){
  const finite=points.filter(p=>p.elevation!==null);
  if(!finite.length)return '';
  const min=Math.floor(Math.min(...finite.map(p=>p.elevation))/5)*5;
  const max=Math.max(min+5,Math.ceil(Math.max(...finite.map(p=>p.elevation))/5)*5);
  const distance=points[points.length-1].distance;
  let path='',start=true;
  points.forEach(p=>{if(p.elevation===null){start=true;return;}path+=`${start?'M':'L'}${(45+p.distance/distance*500).toFixed(1)},${(155-(p.elevation-min)/(max-min)*125).toFixed(1)} `;start=false;});
  return `<article><h3>${title}</h3><svg viewBox="0 0 570 200" role="img" aria-label="${title}, elevation ${min} to ${max} metres over ${Math.round(distance)} metres"><path d="M45 25V155H545" fill="none" stroke="#b4c4cf"/><path d="${path}" fill="none" stroke="#365f9c" stroke-width="2"/><g fill="#637383" font-size="11"><text x="2" y="34">${max} m</text><text x="2" y="157">${min} m</text><text x="45" y="180">0</text><text x="475" y="180">${Math.round(distance)} m</text></g></svg></article>`;
}

function siteTerrainView(){
  const t=SITE_TERRAIN;
  const file=(key,label)=>t.files[key]?`<a href="${e(t.files[key])}" download>${label}</a>`:'';
  return `<section class="panel"><div class="section-header"><div><p class="research-eyebrow">Dannemora · Historical bare-earth terrain</p><h2>Read the shape of the land</h2></div>${badge('Exploratory')}</div><p class="subtitle">Measured elevation data, with derived slope maps and an interactive 3D surface. This covers the parent tract and its surroundings; Lot 1 has not been aligned to the aerial or terrain.</p>
    <div class="terrain-metrics"><div><strong>${Number(t.sourceResolution).toFixed(0)} m</strong><span>Source DEM cells</span></div><div><strong>${t.min.toFixed(1)}–${t.max.toFixed(1)} m</strong><span>Elevation across this view</span></div><div><strong>${t.validPercent.toFixed(1)}%</strong><span>DEM coverage of view</span></div><div><strong>2014–15</strong><span>${e(t.acquisition)}</span></div></div>
    <div class="terrain-toolbar"><label>Color by <select id="terrain-layer"><option value="slope" ${terrainLayer==='slope'?'selected':''}>Slope (%)</option><option value="elevation" ${terrainLayer==='elevation'?'selected':''}>Elevation</option><option value="hillshade" ${terrainLayer==='hillshade'?'selected':''}>Hillshade</option></select></label><label><input id="terrain-boundary" type="checkbox" ${terrainBoundary?'checked':''}> Parent GIS boundary</label><label><input id="terrain-contours" type="checkbox" ${terrainContours?'checked':''}> 2 m contours</label><label><input id="terrain-context" type="checkbox" ${terrainContext?'checked':''}> Mapped water${typeof SITE_CONSTRAINTS==='undefined'?' / wetlands':''}</label>${typeof SITE_CONSTRAINTS==='undefined'?'':`<label><input id="terrain-focus" type="checkbox" ${terrainFocusLot?'checked':''}> Focus on Lot 1</label>${siteConstraintToggles()}`}<label>Vertical scale <select id="terrain-exaggeration">${[1,2,4].map(n=>`<option value="${n}" ${terrainExaggeration===n?'selected':''}>${n}×${n===1?' · true scale':''}</option>`).join('')}</select></label><button class="text-button" id="terrain-reset">Reset 3D view</button></div>
    <div class="terrain-views"><article><div class="section-header"><h3>Plan view · grid north ↑</h3><span class="meta">Click to inspect a sample</span></div><div class="terrain-plan ${terrainFocusLot?'focus':''}" id="terrain-plan"><div class="terrain-plan-inner" id="terrain-plan-inner" style="${terrainPlanTransform()}"><img id="terrain-map" src="${e(t.files[terrainLayer])}" alt="${e(terrainLayer)} map derived from the historical bare-earth DEM"></div><svg id="terrain-plan-svg" viewBox="${terrainPlanViewBox()}" preserveAspectRatio="none" aria-hidden="true"><g id="terrain-context-overlay" ${terrainContext?'':'hidden'}>${(t.overlays?.water||[]).map(x=>`<path d="${e(x.path)}" fill="#9bbfd6" fill-opacity=".85" stroke="#5b8ca8" stroke-width="1" fill-rule="evenodd"/>`).join('')}${(typeof SITE_CONSTRAINTS==='undefined'?t.overlays?.wetlands||[]:[]).map(x=>`<path d="${e(x.path)}" fill="#387f83" fill-opacity=".35" stroke="#256a70" stroke-width="2" fill-rule="evenodd"/>`).join('')}</g><g id="terrain-contour-overlay" ${terrainContours?'':'hidden'}>${(t.overlays?.contours||[]).map(x=>`<path d="${e(x.path)}" fill="none" stroke="#334f46" stroke-width="${x.elevation%10===0?1.6:.6}" opacity=".7"/>`).join('')}</g><path d="M0 500H1000M500 0V1000" class="terrain-transect"/><polyline id="terrain-plan-boundary" points="${t.boundary.map(p=>`${p[0]*1000},${p[1]*1000}`).join(' ')}" class="parcel-outline" ${terrainBoundary?'':'hidden'}/>${typeof SITE_CONSTRAINTS==='undefined'?'':siteConstraintSvg(l=>l.terrain,l=>l.terrain,[])}</svg></div><p class="subtitle" id="terrain-sample" role="status">Dashed crosshairs locate the two centreline profiles below. These are context transects, not a proposed driveway.</p></article><article><div class="section-header"><h3>3D terrain</h3><span class="meta" id="terrain-scale-label">${terrainExaggeration}× vertical scale</span></div><canvas id="terrain-3d" tabindex="0" role="img" aria-label="Interactive 3D bare-earth terrain. Drag to rotate or use arrow keys. Scroll, pinch, or use plus and minus to zoom."></canvas><div class="terrain-zoom-controls" role="group" aria-label="3D zoom"><button class="button secondary" id="terrain-zoom-out" aria-label="Zoom out">−</button><output id="terrain-zoom-level" aria-live="polite">${Math.round(terrainZoom*100)}%</output><button class="button secondary" id="terrain-zoom-in" aria-label="Zoom in">+</button></div><p class="subtitle">Drag to rotate · scroll or pinch to zoom · arrow keys rotate · + / − zooms. North marker follows the surface. The display mesh is simplified; map derivatives use the full DEM.</p></article></div>
    <div class="terrain-legend">${t.slopeClasses.map(c=>`<span><i style="background:${e(c.color)}"></i>${e(c.label)}: ${c.percent.toFixed(1)}%</span>`).join('')}</div><p class="subtitle" id="terrain-color-note">Slope legend and percentages describe valid cells across the entire rectangular view, including land outside the parcel. Slope classes are descriptive, not zoning thresholds. Blue = mapped water. Constraint layers: teal / amber / yellow-green = traced from the real permit drawings; dashed green outlines = APA / NWI mapped inventory (not field delineation); long red / green dashes = fictional practice permit PP-01. All Lot 1 layers sit on the provisional county-GIS fit and are drawn over the surface for display only; they do not change terrain statistics. Elevation and hillshade use their own color scales.</p>${typeof SITE_CONSTRAINTS==='undefined'?'':`<details class="terrain-constraint-key"><summary>Constraint layer key & areas</summary>${siteConstraintLegend(true)}</details>`}
    <div class="terrain-profiles">${terrainProfile(t.profiles.westEast,'West → east · middle of view')}${terrainProfile(t.profiles.southNorth,'South → north · middle of view')}</div>
    <p class="subtitle">${e(t.crs)} · elevations ${e(t.verticalDatum)} · metres. Slope = 100 × rise / horizontal run; 100% equals 45°. Source cell size is not a claim of positional or elevation accuracy. Canopy, buildings, buried services and soils are not represented by this ground surface.</p>
    <div class="research-links">${file('dem','Clipped DEM · GeoTIFF')}${file('contours','2 m contours · GeoJSON')}<a href="assets/sites/dannemora/terrain/terrain-grid.json" download>Display grid · JSON</a><a href="sources/dannemora/terrain/terrain-manifest.json" target="_blank">Source & quality record ↗</a>${link('https://www.fisheries.noaa.gov/inport/item/70271','Original LiDAR source')}</div><p class="subtitle">Contours are interpolated at a 2 m interval for exploration; this is not a topographic survey. Flat hydroflattened lake areas are included in the map and slope statistics. No excavation volumes or buildable-area claims have been calculated.</p></section>
    ${terrainAcquisitionView()}`;
}

function terrainAcquisitionView(){
  const rows=[
    ['Bare-earth elevation','Collected','USGS native 1 m DEM, clipped locally; terrain, slopes, hillshade and contours generated. Historical ground surface, not a current survey.','https://apps.nationalmap.gov/downloader/','USGS National Map'],
    ['Classified point cloud','Tile verified','Tile 18TWQ592953 and its LAS header are verified. Full download was deferred after a slow transfer; no complete local cloud or ground-return audit yet.','https://gis.ny.gov/lidar','NYS LiDAR'],
    ['Boundary & survey registration','Unresolved','Parent tax polygon is available. Reconcile Lot 1, recorded subdivision and survey control before locating pads or transferring septic/well lines.','https://clintoncountyny.gov/planning/gis-map','County GIS'],
    ['Wetlands & water','Collected context','Archived APA wetland polygons, NWI wetlands and USGS flowlines / waterbody. Permit flags remain separate. DEC freshwater mapping excludes Adirondack Park; map absence does not establish dry land.','https://apa.ny.gov/gis/','APA GIS'],
    ['Flood hazard','Partial response','AOI attributes returned zone X / minimal flood hazard; geometry failed HTTP 500. Availability polygons are archived but are not flood zones. This is not a Lot 1 flood determination.','https://msc.fema.gov/portal/home','FEMA Map Service Center'],
    ['Soils & geology','Screening sources','NRCS SSURGO, surficial geology and bedrock help plan investigations. Septic tests do not establish foundations or excavation conditions.','https://websoilsurvey.nrcs.usda.gov/','NRCS Web Soil Survey'],
    ['Weather & solar','2 candidates collected','Plattsburgh (71 m) and Saranac Lake (507 m) TMYx 2011–2025 weather ZIPs are archived. Neither is selected or analyzed; compare elevation, distance and lake / upland climate.','https://www.ladybug.tools/epwmap/','Ladybug EPW map'],
    ['Current site & utilities','Field evidence needed','Dated ground photos, measured control, wetland review, as-built well/septic and utility-owner records. Aerial images cannot locate buried electric lines.','https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf','Existing permit packet']
  ];
  return `<section class="panel"><p class="research-eyebrow">Parcel acquisition plan</p><h2>What we can gather, and what still needs verification</h2><div class="research-table"><table><thead><tr><th>Layer</th><th>State</th><th>Purpose & next step</th><th>Source</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${e(r[0])}</td><td>${badge(r[1])}</td><td>${e(r[2])}</td><td>${link(r[3],r[4])}</td></tr>`).join('')}</tbody></table></div><div class="research-links"><a href="sources/dannemora/terrain/context-sources.json" target="_blank">Full source inventory ↗</a><a href="sources/dannemora/terrain/context-acquisition.json" target="_blank">Context queries & failures ↗</a><a href="sources/dannemora/terrain/apa-wetland-areas.geojson" download>APA wetlands · GeoJSON</a><a href="sources/dannemora/terrain/nwi-wetlands.geojson" download>NWI wetlands · GeoJSON</a><a href="sources/dannemora/terrain/hydro-waterbodies.geojson" download>Waterbody · GeoJSON</a><a href="sources/dannemora/terrain/hydro-flowlines.geojson" download>Flowlines · GeoJSON</a><a href="sources/dannemora/terrain/apa-land-classification.geojson" download>APA land classes · GeoJSON</a><a href="sources/dannemora/terrain/fema-flood-zones-attributes.json" target="_blank">FEMA attributes ↗</a><a href="sources/dannemora/terrain/weather-candidates.json" target="_blank">Weather metadata ↗</a><a href="sources/dannemora/terrain/USA_NY_Plattsburgh.Intl.AP.726225_TMYx.2011-2025.zip" download>Plattsburgh weather ZIP</a><a href="sources/dannemora/terrain/USA_NY_Saranac.Lake-Adirondack.Rgnl.AP.726228_TMYx.2011-2025.zip" download>Saranac Lake weather ZIP</a></div><div class="evidence-gap-grid"><article><h3>Access needed now: none</h3><p>The initial pipeline uses public county, NYS and USGS data. The terrain preview runs locally with no account, API key or third-party scripts. QGIS is useful for reviewing alignment, but is not required to view these outputs.</p><p>Next: acquire the classified LiDAR clip, audit ground-point gaps, confirm the Lot 1 survey registration, then evaluate a tentative building pad and access corridor.</p></article><article><h3>Useful public APIs & optional viewers</h3><p><strong>USGS TNM / public point-cloud storage:</strong> discover DEMs, source dates and classified returns. <strong>ArcGIS REST:</strong> parcel, ortho and public screening layers. <strong>NRCS Soil Data Access:</strong> spatial soil queries.</p><p><strong>Cesium:</strong> useful later for a regional globe and tiled point clouds. Cesium ion assets use a token and account quotas. <strong>Google Maps:</strong> optional location review; platform APIs require a key and billing setup. Neither is needed for our measured terrain pipeline.</p><div class="research-links">${link('https://tnmaccess.nationalmap.gov/api/v1/docs','TNM API')}${link('https://sdmdataaccess.nrcs.usda.gov/','Soil Data Access')}${link('https://cesium.com/learn/ion/cesium-ion-access-tokens/','Cesium access tokens')}${link('https://developers.google.com/maps/documentation/elevation/get-api-key','Google API setup')}</div></article></div></section>`;
}

function terrainPlanTransform(){
  const f=terrainFocusLot&&terrainLotFocus();
  return f?`transform:scale(${(1/f.span).toFixed(4)}) translate(${(-f.u0*100).toFixed(3)}%,${(-f.v0*100).toFixed(3)}%)`:'';
}

function terrainPlanViewBox(){
  const f=terrainFocusLot&&terrainLotFocus();
  return f?[f.u0,f.v0,f.span,f.span].map(x=>(x*1000).toFixed(2)).join(' '):'0 0 1000 1000';
}

function terrainColor(z,s){
  if(terrainLayer==='slope')return SITE_TERRAIN.slopeClasses[s<5?0:s<10?1:s<15?2:s<25?3:4].color;
  const f=(z-SITE_TERRAIN.min)/(SITE_TERRAIN.max-SITE_TERRAIN.min||1);
  if(terrainLayer==='hillshade'){const v=Math.round(120+f*110);return `rgb(${v},${v},${v})`;}
  return `hsl(${145-f*110},30%,${72-f*25}%)`;
}

function drawSiteTerrain(){
  const canvas=document.getElementById('terrain-3d');if(!canvas)return;
  const t=SITE_TERRAIN,w=canvas.clientWidth,h=canvas.clientHeight,ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.fillStyle='#edf2f4';ctx.fillRect(0,0,w,h);
  const sizeX=t.bounds[2]-t.bounds[0],sizeY=t.bounds[3]-t.bounds[1],span=Math.max(sizeX,sizeY),scale=Math.min(w*.73,h*.8)*terrainZoom;
  const focus=terrainFocusLot&&terrainLotFocus(),cu=focus?focus.cu:.5,cv=focus?focus.cv:.5,cz=focus?terrainElevationAt(cu,cv):(t.min+t.max)/2;
  function projectPoint(u,v,z){
    const x=(u-cu)*sizeX/span,y=(v-cv)*sizeY/span,up=(z-cz)/span*terrainExaggeration;
    const rx=x*Math.cos(terrainYaw)-y*Math.sin(terrainYaw),ry=x*Math.sin(terrainYaw)+y*Math.cos(terrainYaw);
    return [w/2+rx*scale,h*.53+(ry*Math.sin(terrainTilt)-up*Math.cos(terrainTilt))*scale,ry*Math.cos(terrainTilt)+up*Math.sin(terrainTilt)];
  }
  const points=t.elevations.map((z,i)=>z===null?null:projectPoint((i%t.cols)/(t.cols-1),Math.floor(i/t.cols)/(t.rows-1),z));
  const faces=[];
  for(let r=0;r<t.rows-1;r++)for(let c=0;c<t.cols-1;c++){
    const a=r*t.cols+c,b=a+1,d=a+t.cols,k=d+1;
    for(const tri of [[a,d,b],[b,d,k]])if(tri.every(i=>points[i])){
      const z=tri.reduce((s,i)=>s+t.elevations[i],0)/3,s=tri.reduce((s,i)=>s+(t.slopes[i]||0),0)/3;
      let color=terrainColor(z,s);
      if(terrainLayer==='hillshade'){
        const left=t.elevations[a],right=t.elevations[b],south=t.elevations[d];
        const gx=(right-left)/t.gridSpacing[0],gy=(left-south)/t.gridSpacing[1];
        const light=Math.max(0,(-gx*-.5-gy*.5+Math.sqrt(.5))/Math.sqrt(gx*gx+gy*gy+1));
        const value=Math.round(35+215*light);color=`rgb(${value},${value},${value})`;
      }
      faces.push({tri,depth:tri.reduce((s,i)=>s+points[i][2],0)/3,color});
    }
  }
  faces.sort((a,b)=>a.depth-b.depth);
  faces.forEach(f=>{ctx.beginPath();f.tri.forEach((i,j)=>j?ctx.lineTo(points[i][0],points[i][1]):ctx.moveTo(points[i][0],points[i][1]));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();ctx.strokeStyle=f.color;ctx.lineWidth=.45;ctx.stroke();});
  drawTerrainConstraints(ctx,projectPoint);
  if(terrainBoundary){ctx.beginPath();let start=true;t.boundary.forEach(([u,v])=>{const c=Math.max(0,Math.min(t.cols-1,Math.round(u*(t.cols-1)))),r=Math.max(0,Math.min(t.rows-1,Math.round(v*(t.rows-1)))),z=t.elevations[r*t.cols+c];if(z===null){start=true;return;}const p=projectPoint(u,v,z+1);start?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]);start=false;});ctx.strokeStyle='#007d9e';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.stroke();ctx.setLineDash([]);}
  const n=focus?projectPoint(cu,cv-focus.span*.6,cz+8):projectPoint(.5,-.06,t.max);ctx.fillStyle='#243b4d';ctx.font='600 13px sans-serif';ctx.fillText('N',n[0]-5,n[1]);
  ctx.font='11px sans-serif';ctx.fillText(`${Math.round(sizeX)} × ${Math.round(sizeY)} m · ${terrainExaggeration}× vertical`,14,h-15);
}

function drawTerrainConstraints(ctx,projectPoint){
  if(typeof SITE_CONSTRAINTS==='undefined')return;
  const [x0,y0,x1,y1]=SITE_TERRAIN.bounds,kinds=['wetland','wetland-buffer','setback','clearing','buildable','lot','septic','house'];
  const uv=([E,N])=>[(E-x0)/(x1-x0),(y1-N)/(y1-y0)];
  siteConstraintLayers().filter(l=>siteConstraintGroups[l.category]&&kinds.includes(l.kind)).forEach(l=>{
    ctx.beginPath();
    l.utm.forEach(poly=>poly.forEach(ring=>{
      let first=true;
      ring.forEach((p,i)=>{
        const q=ring[i+1];if(!q)return;
        const n=Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])/4));
        for(let j=0;j<n;j++){const [u,v]=uv([p[0]+(q[0]-p[0])*j/n,p[1]+(q[1]-p[1])*j/n]),z=terrainElevationAt(u,v);if(z===null)continue;const s=projectPoint(u,v,z+.6);first?ctx.moveTo(s[0],s[1]):ctx.lineTo(s[0],s[1]);first=false;}
      });
      ctx.closePath();
    }));
    ctx.globalAlpha=Math.min(.6,l.fillOpacity+.15);ctx.fillStyle=l.color;ctx.fill('evenodd');ctx.globalAlpha=1;
    ctx.strokeStyle=l.color;ctx.lineWidth=l.kind==='buildable'||l.kind==='lot'?2:1.2;ctx.setLineDash(l.category==='practice'?[6,3]:l.dashed?[3,3]:[]);ctx.stroke();ctx.setLineDash([]);
  });
}

function setTerrainZoom(value){
  terrainZoom=Math.max(.5,Math.min(8,value));
  const output=document.getElementById('terrain-zoom-level');
  if(output)output.textContent=`${Math.round(terrainZoom*100)}%`;
  const out=document.getElementById('terrain-zoom-out'),inside=document.getElementById('terrain-zoom-in');
  if(out)out.disabled=terrainZoom<=.5;
  if(inside)inside.disabled=terrainZoom>=8;
  drawSiteTerrain();
}

function initSiteTerrain(){
  const canvas=document.getElementById('terrain-3d');if(!canvas||canvas.dataset.ready)return;canvas.dataset.ready='true';
  setTerrainZoom(terrainZoom);
  const pointers=new Map();
  const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a[0]-b[0],a[1]-b[1]);};
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;pointers.set(event.pointerId,[event.clientX,event.clientY]);canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);if(!previous)return;
    const oldDistance=pointers.size===2?distance():0;
    pointers.set(event.pointerId,[event.clientX,event.clientY]);
    if(pointers.size===2){if(oldDistance>0)setTerrainZoom(terrainZoom*distance()/oldDistance);return;}
    if(pointers.size!==1)return;
    terrainYaw-=(event.clientX-previous[0])*.008;
    terrainTilt=Math.max(.2,Math.min(1.3,terrainTilt+(event.clientY-previous[1])*.006));
    drawSiteTerrain();
  });
  const release=event=>pointers.delete(event.pointerId);
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',event=>{event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);setTerrainZoom(terrainZoom*Math.exp(-Math.max(-100,Math.min(100,delta))*.003));},{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(event.key))return;
    event.preventDefault();
    if(['+','-','='].includes(event.key)){setTerrainZoom(terrainZoom*(event.key==='-'?1/1.2:1.2));return;}
    if(event.key==='ArrowLeft')terrainYaw+=.12;
    if(event.key==='ArrowRight')terrainYaw-=.12;
    if(event.key==='ArrowUp')terrainTilt=Math.max(.2,terrainTilt-.1);
    if(event.key==='ArrowDown')terrainTilt=Math.min(1.3,terrainTilt+.1);
    drawSiteTerrain();
  });
  document.getElementById('terrain-plan').addEventListener('click',event=>{const box=event.currentTarget.getBoundingClientRect(),t=SITE_TERRAIN,f=terrainFocusLot&&terrainLotFocus(),k=f?f.span:1,u=Math.max(0,Math.min(1,(f?f.u0:0)+(event.clientX-box.left)/box.width*k)),v=Math.max(0,Math.min(1,(f?f.v0:0)+(event.clientY-box.top)/box.height*k)),c=Math.round(u*(t.cols-1)),r=Math.round(v*(t.rows-1)),i=r*t.cols+c;document.getElementById('terrain-sample').textContent=t.elevations[i]===null?'No elevation sample at this location.':`Display-grid sample: ${t.elevations[i].toFixed(1)} m elevation; ${t.slopes[i]===null?'slope unavailable':t.slopes[i].toFixed(1)+'% slope'}. Approximate easting ${Math.round(t.bounds[0]+u*(t.bounds[2]-t.bounds[0]))} m, northing ${Math.round(t.bounds[3]-v*(t.bounds[3]-t.bounds[1]))} m (${t.crs}).`;});
  const observer=new ResizeObserver(()=>{if(canvas.isConnected)drawSiteTerrain();else observer.disconnect();});observer.observe(canvas);
}

document.addEventListener('change',event=>{
  if(event.target.id==='terrain-layer'){terrainLayer=event.target.value;const image=document.getElementById('terrain-map');image.src=SITE_TERRAIN.files[terrainLayer];image.alt=`${terrainLayer} map derived from the historical bare-earth DEM`;drawSiteTerrain();}
  if(event.target.id==='terrain-contours'){terrainContours=event.target.checked;document.getElementById('terrain-contour-overlay').toggleAttribute('hidden',!terrainContours);}
  if(event.target.id==='terrain-context'){terrainContext=event.target.checked;document.getElementById('terrain-context-overlay').toggleAttribute('hidden',!terrainContext);}
  if(event.target.id==='terrain-boundary'){terrainBoundary=event.target.checked;document.getElementById('terrain-plan-boundary').toggleAttribute('hidden',!terrainBoundary);drawSiteTerrain();}
  if(event.target.id==='terrain-focus'){terrainFocusLot=event.target.checked;document.getElementById('terrain-plan-inner').style.cssText=terrainPlanTransform();document.getElementById('terrain-plan-svg').setAttribute('viewBox',terrainPlanViewBox());document.getElementById('terrain-plan').classList.toggle('focus',terrainFocusLot);setTerrainZoom(terrainFocusLot?7:1);}
  if(event.target.id==='terrain-exaggeration'){terrainExaggeration=Number(event.target.value);document.getElementById('terrain-scale-label').textContent=`${terrainExaggeration}× vertical scale`;drawSiteTerrain();}
});
document.addEventListener('click',event=>{if(event.target.id==='terrain-zoom-in')setTerrainZoom(terrainZoom*1.2);if(event.target.id==='terrain-zoom-out')setTerrainZoom(terrainZoom/1.2);if(event.target.id==='terrain-reset'){terrainYaw=-.55;terrainTilt=.75;terrainExaggeration=1;setTerrainZoom(terrainFocusLot?7:1);document.getElementById('terrain-exaggeration').value=1;document.getElementById('terrain-scale-label').textContent='1× vertical scale';drawSiteTerrain();}});
