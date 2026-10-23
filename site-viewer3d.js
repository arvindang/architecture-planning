'use strict';
// 3D sun, shade and canopy model for the Dannemora Lot 1 research candidate.
// Needs (classic defer scripts, before app.js): vendor/three/three.min.js, vendor/three/OrbitControls.js,
// site3d-data.js; optional site-constraints-data.js and climate-data.js.
// Exposes siteViewer3dView(), initSiteViewer3d(), disposeSiteViewer3d().
(function(){
  const FT=0.3048, RAD=Math.PI/180, DEG=180/Math.PI;
  const FALLBACK_SITE={lat:44.7298,lon:-73.82775};
  const YEAR=2026, TZ_MIN=-300, CANOPY_MIN=2, DRAPE=2048, SINK=0.4, ACRE=4046.8564;
  const MASSING={w:28*FT,l:40*FT,h:26*FT};
  const SUN_PRESETS=[['Dec 21',12,21],['Mar 20',3,20],['Jun 21',6,21],['Sep 22',9,22]];
  const KEY_DATES=[['Dec 21',12,21],['Mar 20',3,20],['Jun 21',6,21]];
  const GROUPS=[['documented','Documented','Permit-derived geometry'],['mapped','Mapped','Public GIS screening'],['practice','Practice (fictional)','PP-01 study layers, not an approval']];
  const doyOf=(m,d,y=YEAR)=>Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/864e5)+1;

  const state={doy:doyOf(12,21),minutes:12*60,clock:'standard',canopy:'crowns',exag:1,sunPath:true,contours:true,
    groups:{documented:true,mapped:true,practice:true},hidden:{},massing:true,dx:0,dy:0,rot:null,clearR:0,manual:[],camera:null};
  let DATA=null, V=null;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  const pad=n=>String(n).padStart(2,'0');
  const hm=min=>{const m=((Math.round(min)%1440)+1440)%1440;return `${pad(Math.floor(m/60))}:${pad(m%60)}`;};
  const dateLabel=doy=>new Date(Date.UTC(YEAR,0,Math.round(doy))).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const fmt=(v,d=0)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const safeColor=c=>typeof c==='string'&&/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(c.trim())?c.trim():'#55606b';
  const GLOBALS={SITE_3D:()=>typeof SITE_3D!=='undefined'?SITE_3D:undefined,SITE_CONSTRAINTS:()=>typeof SITE_CONSTRAINTS!=='undefined'?SITE_CONSTRAINTS:undefined,SITE_CLIMATE:()=>typeof SITE_CLIMATE!=='undefined'?SITE_CLIMATE:undefined};
  const get=name=>{try{const v=GLOBALS[name]();return v&&typeof v==='object'?v:undefined;}catch{return undefined;}};
  const has=name=>get(name)!==undefined;

  // ---------------------------------------------------------------- sun (NOAA solar calculator equations)
  function solarPosition(ms,lat,lon){
    const jc=(ms/864e5+2440587.5-2451545)/36525;
    const L0=((280.46646+jc*(36000.76983+jc*0.0003032))%360+360)%360;
    const M=357.52911+jc*(35999.05029-0.0001537*jc);
    const ecc=0.016708634-jc*(0.000042037+0.0000001267*jc);
    const C=Math.sin(M*RAD)*(1.914602-jc*(0.004817+0.000014*jc))+Math.sin(2*M*RAD)*(0.019993-0.000101*jc)+Math.sin(3*M*RAD)*0.000289;
    const omega=125.04-1934.136*jc;
    const appLong=L0+C-0.00569-0.00478*Math.sin(omega*RAD);
    const obliq=23+(26+(21.448-jc*(46.815+jc*(0.00059-jc*0.001813)))/60)/60+0.00256*Math.cos(omega*RAD);
    const dec=Math.asin(Math.sin(obliq*RAD)*Math.sin(appLong*RAD));
    const y=Math.tan(obliq*RAD/2)**2;
    const eot=4*DEG*(y*Math.sin(2*L0*RAD)-2*ecc*Math.sin(M*RAD)+4*ecc*y*Math.sin(M*RAD)*Math.cos(2*L0*RAD)-0.5*y*y*Math.sin(4*L0*RAD)-1.25*ecc*ecc*Math.sin(2*M*RAD));
    const utcMin=((ms/6e4)%1440+1440)%1440;
    const tst=((utcMin+eot+4*lon)%1440+1440)%1440;
    const ha=(tst/4-180)*RAD, la=lat*RAD;
    const zen=Math.acos(clamp(Math.sin(la)*Math.sin(dec)+Math.cos(la)*Math.cos(dec)*Math.cos(ha),-1,1));
    const elev=90-zen*DEG, te=Math.tan(elev*RAD);
    let refr=0;
    if(elev>85)refr=0;else if(elev>5)refr=58.1/te-0.07/te**3+0.000086/te**5;else if(elev>-0.575)refr=1735+elev*(-518.2+elev*(103.4+elev*(-12.79+elev*0.711)));else refr=-20.772/te;
    let az=180;
    const sz=Math.sin(zen);
    if(sz>1e-9){const a=Math.acos(clamp((Math.sin(la)*Math.cos(zen)-Math.sin(dec))/(Math.cos(la)*sz),-1,1))*DEG;az=ha>0?(a+180)%360:(540-a)%360;}
    return {altitude:elev+refr/3600,trueAltitude:elev,azimuth:az,declination:dec*DEG,eot};
  }
  const msAt=(doy,stdMin,year=YEAR)=>Date.UTC(year,0,1)+(doy-1)*864e5+(stdMin-TZ_MIN)*6e4;
  const sunAt=(doy,stdMin)=>solarPosition(msAt(doy,stdMin),DATA.lat,DATA.lon);
  function riseSet(doy){
    const f=m=>sunAt(doy,m).trueAltitude+0.833, out={rise:null,set:null,noon:null,maxAlt:-90};
    let prev=f(0);
    for(let m=10;m<=1440;m+=10){
      const cur=f(m);
      if((prev<0)!==(cur<0)){let a=m-10,b=m,fa=prev;for(let k=0;k<18;k++){const c=(a+b)/2,fc=f(c);if((fa<0)===(fc<0)){a=c;fa=fc;}else b=c;}if(prev<0)out.rise=(a+b)/2;else out.set=(a+b)/2;}
      prev=cur;
    }
    const lon=DATA.lon;let noon=720-4*lon+TZ_MIN-sunAt(doy,720).eot;noon=720-4*lon+TZ_MIN-sunAt(doy,noon).eot;
    out.noon=noon;out.maxAlt=sunAt(doy,noon).altitude;
    return out;
  }
  function nthSunday(month,n){const first=new Date(Date.UTC(YEAR,month-1,1)).getUTCDay();return doyOf(month,1+((7-first)%7)+(n-1)*7);}
  const DST={start:nthSunday(3,2),end:nthSunday(11,1)};
  const isDst=doy=>Math.round(doy)>=DST.start&&Math.round(doy)<DST.end;

  function validateSun(){
    const sun=get('SITE_CLIMATE')?.sun;
    if(!sun||!Array.isArray(sun.keyDates))return null;
    const lat=Number(sun.location?.lat??DATA.lat), lon=Number(sun.location?.lon??DATA.lon), tz=Number(sun.location?.timeZone??-5);
    let n=0,maxAlt=0,maxAz=0,maxSep=0;
    for(const kd of sun.keyDates){
      const m=String(kd.date||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m||!Array.isArray(kd.positions))continue;
      const y=+m[1],doy=doyOf(+m[2],+m[3],y);
      for(const p of kd.positions){
        if(!Array.isArray(p)||!(p[1]>0))continue;
        const ms=Date.UTC(y,0,1)+(doy-1)*864e5+(p[0]*60-tz*60)*6e4, s=solarPosition(ms,lat,lon);
        const dAlt=Math.abs(s.altitude-p[1]), dAz=Math.abs(((s.azimuth-p[2]+540)%360)-180);
        const a1=s.altitude*RAD,a2=p[1]*RAD,sep=Math.acos(clamp(Math.sin(a1)*Math.sin(a2)+Math.cos(a1)*Math.cos(a2)*Math.cos(dAz*RAD),-1,1))*DEG;
        n++;maxAlt=Math.max(maxAlt,dAlt);maxAz=Math.max(maxAz,dAz);maxSep=Math.max(maxSep,sep);
      }
    }
    if(!n)return null;
    const r={n,maxAlt,maxAz,maxSep,algorithm:sun.algorithm||'SITE_CLIMATE.sun.keyDates'};
    if(typeof console!=='undefined')console.info(`[site-viewer3d] sun model vs SITE_CLIMATE.sun.keyDates: ${n} samples above horizon, max error altitude ${maxAlt.toFixed(3)}°, azimuth ${maxAz.toFixed(3)}°, angular ${maxSep.toFixed(3)}°`);
    return r;
  }

  // ---------------------------------------------------------------- data preparation (once per page)
  function normPolys(u){
    if(!Array.isArray(u)||!u.length)return [];
    const isPt=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]);
    if(isPt(u[0]))return [[u]];
    if(Array.isArray(u[0])&&isPt(u[0][0]))return [u];
    return u.filter(p=>Array.isArray(p)&&Array.isArray(p[0])&&isPt(p[0][0]));
  }
  function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return a/2;}
  function centroid(r){let a=0,x=0,y=0;for(let i=0,j=r.length-1;i<r.length;j=i++){const f=r[j][0]*r[i][1]-r[i][0]*r[j][1];a+=f;x+=(r[j][0]+r[i][0])*f;y+=(r[j][1]+r[i][1])*f;}return Math.abs(a)<1e-9?[r[0][0],r[0][1]]:[x/(3*a),y/(3*a)];}
  function inRings(rings,x,y){let inside=false;for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}

  function buildLayers(){
    const o=SITE_3D.origin, C=get('SITE_CONSTRAINTS'), src=Array.isArray(C?.layers)?C.layers:[], out=[];
    const toLocal=p=>[+p[0]-o[0],+p[1]-o[1]];
    src.forEach((L,i)=>{
      if(!L||typeof L!=='object')return;
      const polys=normPolys(L.utm).map(poly=>poly.map(ring=>ring.filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])).map(toLocal)).filter(r=>r.length>=3)).filter(p=>p.length);
      const point=Array.isArray(L.point)&&Number.isFinite(+L.point[0])&&Number.isFinite(+L.point[1])?toLocal(L.point):null;
      if(!polys.length&&!point)return;
      out.push({id:String(L.id||`layer-${i}`),label:String(L.label||L.id||'Layer'),category:['documented','mapped','practice'].includes(L.category)?L.category:'mapped',kind:String(L.kind||''),
        color:safeColor(L.color),fillOpacity:Number.isFinite(+L.fillOpacity)?clamp(+L.fillOpacity,0,1):.15,dashed:!!L.dashed,status:L.status?String(L.status):'',areaM2:+L.areaM2||null,areaAcres:+L.areaAcres||null,polys,point});
    });
    const kinds=new Set(out.map(l=>l.kind));
    const base=[];
    if(!kinds.has('lot')&&Array.isArray(SITE_3D.lot1))base.push({id:'site3d-lot1',label:'Lot 1 (provisional fit)',category:'documented',kind:'lot',color:'#735bb5',fillOpacity:.08,dashed:true,status:'Permit-to-aerial display fit, 3–11 m position error',areaM2:Math.abs(ringArea(SITE_3D.lot1)),areaAcres:Math.abs(ringArea(SITE_3D.lot1))/ACRE,polys:[[SITE_3D.lot1]],point:null});
    if(!kinds.has('house')&&Array.isArray(SITE_3D.house))base.push({id:'site3d-house',label:'Permit house footprint (provisional)',category:'documented',kind:'house',color:'#e78222',fillOpacity:.55,dashed:false,status:'Real permit APA 2025-0137, provisional position',areaM2:Math.abs(ringArea(SITE_3D.house)),areaAcres:null,polys:[[SITE_3D.house]],point:null});
    return base.concat(out);
  }

  function limitFrom(id,fallback){
    const lim=get('SITE_CONSTRAINTS')?.practicePermit?.limits;
    const hit=Array.isArray(lim)?lim.find(l=>l&&l.id===id):null;
    return hit&&Number.isFinite(+hit.value)?+hit.value:fallback;
  }

  function prepareData(){
    const d=SITE_3D, cols=d.cols, rows=d.rows, n=cols*rows;
    const ground=new Float32Array(n), orig=new Float32Array(n), water=new Uint8Array(n), nodata=new Uint8Array(n);
    let gmin=Infinity,gmax=-Infinity;
    for(let i=0;i<n;i++){const g=d.ground[i];if(g==null||!Number.isFinite(g))continue;if(g<gmin)gmin=g;if(g>gmax)gmax=g;}
    for(let i=0;i<n;i++){
      const g=d.ground[i];
      if(g==null||!Number.isFinite(g)){ground[i]=gmin;nodata[i]=1;}else ground[i]=g;
      const c=d.canopyHeight[i];orig[i]=c==null||!Number.isFinite(c)?0:Math.max(0,c);
      if(c==null||Math.abs(ground[i]-gmin)<0.03)water[i]=1;
    }
    const trees=Array.isArray(d.trees)?d.trees:[];
    const cellsByCrown=Array.from({length:trees.length+1},()=>[]);
    const crownId=d.crownId||[];
    for(let i=0;i<n;i++){const k=crownId[i];if(k>0&&k<=trees.length)cellsByCrown[k].push(i);}
    let maxCanopy=0;for(let i=0;i<n;i++)if(orig[i]>maxCanopy)maxCanopy=orig[i];
    const house=Array.isArray(d.house)&&d.house.length>=3?d.house:[[0,0],[1,0],[1,-1]];
    const hc=centroid(house.slice(0,-1).length>=3?house.slice(0,-1):house);
    let best=0,bearing=0;
    for(let i=1;i<house.length;i++){const dx=house[i][0]-house[i-1][0],dy=house[i][1]-house[i-1][1],len=Math.hypot(dx,dy);if(len>best){best=len;bearing=((Math.atan2(dx,dy)*DEG)%180+180)%180;}}
    const site=get('SITE_CLIMATE')?.site;
    const lat=Number.isFinite(+site?.lat)?+site.lat:FALLBACK_SITE.lat, lon=Number.isFinite(+site?.lon)?+site.lon:FALLBACK_SITE.lon;
    const hz=get('SITE_CLIMATE')?.sun?.horizon;
    const horizon=hz&&Array.isArray(hz.altitudeDeg)&&hz.altitudeDeg.length&&+hz.stepDeg>0?{step:+hz.stepDeg,alt:hz.altitudeDeg.map(Number)}:null;
    DATA={cols,rows,n,ground,orig,water,nodata,gmin,gmax,base:Math.floor(gmin),trees,cellsByCrown,maxCanopy,houseCentroid:hc,houseBearing:Math.round(bearing),
      lat,lon,latSource:site?'SITE_CLIMATE.site':'built-in fallback',horizon,layers:buildLayers(),
      clearingCap:limitFrom('clearing',0.75),heightLimitFt:limitFrom('height',30),footprintLimitSqFt:limitFrom('footprint',1600)};
    DATA.validation=validateSun();
    DATA.baseCanvas=baseImage();
    DATA.contours=contourPaths();
    return DATA;
  }

  const pxX=x=>(x+1)/(DATA.cols*2)*DRAPE, pxY=y=>(1-y)/(DATA.rows*2)*DRAPE;

  function baseImage(){
    const {cols,rows,ground,water,nodata,gmin,gmax}=DATA, c=document.createElement('canvas');
    c.width=cols;c.height=rows;
    const ctx=c.getContext('2d'), img=ctx.createImageData(cols,rows), lo=[206,213,186], mid=[219,208,176], hi=[201,184,150];
    for(let i=0;i<cols*rows;i++){
      let rgb;
      if(nodata[i])rgb=[190,190,190];else if(water[i])rgb=[158,195,217];
      else{const t=(ground[i]-gmin)/((gmax-gmin)||1),a=t<.5?lo:mid,b=t<.5?mid:hi,f=t<.5?t*2:(t-.5)*2;rgb=a.map((v,k)=>v+(b[k]-v)*f);}
      img.data[i*4]=rgb[0];img.data[i*4+1]=rgb[1];img.data[i*4+2]=rgb[2];img.data[i*4+3]=255;
    }
    ctx.putImageData(img,0,0);
    return c;
  }

  function contourPaths(){
    if(typeof Path2D==='undefined')return null;
    const {cols,rows,ground}=DATA, minor=new Path2D(), major=new Path2D();
    const X=c=>pxX(c*2), Y=r=>pxY(-r*2);
    for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){
      const a=ground[r*cols+c],b=ground[r*cols+c+1],cc=ground[(r+1)*cols+c+1],d=ground[(r+1)*cols+c];
      const lo=Math.min(a,b,cc,d),hi=Math.max(a,b,cc,d);
      for(let lv=Math.ceil(lo/2)*2;lv<hi;lv+=2){
        if(lv===lo)continue;
        const idx=(a>lv?8:0)|(b>lv?4:0)|(cc>lv?2:0)|(d>lv?1:0);
        if(idx===0||idx===15)continue;
        const t=(p,q)=>(lv-p)/(q-p);
        const top=[X(c+t(a,b)),Y(r)],right=[X(c+1),Y(r+t(b,cc))],bottom=[X(c+t(d,cc)),Y(r+1)],left=[X(c),Y(r+t(a,d))];
        const segs={1:[[left,bottom]],2:[[bottom,right]],3:[[left,right]],4:[[top,right]],5:[[left,top],[bottom,right]],6:[[top,bottom]],7:[[left,top]],8:[[left,top]],9:[[top,bottom]],10:[[top,right],[left,bottom]],11:[[top,right]],12:[[left,right]],13:[[bottom,right]],14:[[left,bottom]]}[idx];
        const path=lv%10===0?major:minor;
        for(const [p,q] of segs){path.moveTo(p[0],p[1]);path.lineTo(q[0],q[1]);}
      }
    }
    return {minor,major};
  }

  // ---------------------------------------------------------------- view HTML
  function layerVisible(L){return state.groups[L.category]&&!state.hidden[L.id];}
  function swatch(L){
    const c=L.color;
    return `<i class="v3d-swatch${L.dashed?' dashed':''}${L.point&&!L.polys.length?' point':''}" style="border-color:${esc(c)};--v3d-fill:${esc(c)};--v3d-fill-o:${clamp(L.fillOpacity||0,0,1).toFixed(2)}" aria-hidden="true"></i>`;
  }
  function layersHtml(){
    return GROUPS.map(([id,label,sub])=>{
      const items=DATA.layers.filter(L=>L.category===id);
      const rows=items.map(L=>{
        const area=L.areaAcres?`${fmt(L.areaAcres,2)} ac`:L.areaM2?`${fmt(L.areaM2)} m²`:'';
        const meta=[area,L.status].filter(Boolean).join(' · ');
        return `<li><label class="v3d-check"><input type="checkbox" data-v3d-layer="${esc(L.id)}" ${state.hidden[L.id]?'':'checked'}>${swatch(L)}<span>${esc(L.label)}${meta?`<small>${esc(meta)}</small>`:''}</span></label></li>`;
      }).join('');
      const empty=id==='documented'?'':`<li class="v3d-empty">${has('SITE_CONSTRAINTS')?'No layers in this group.':'Not loaded — site-constraints-data.js is missing.'}</li>`;
      return `<div class="v3d-layer-group"><label class="v3d-check v3d-group-toggle"><input type="checkbox" data-v3d-group="${id}" ${state.groups[id]?'checked':''}><span><strong>${esc(label)}</strong><small>${esc(sub)}</small></span></label><ul>${rows||empty}</ul></div>`;
    }).join('');
  }
  function notesHtml(){
    const v=DATA.validation, d=SITE_3D;
    const check=v?`Sun model (NOAA equations, standard time UTC−5) checked against ${v.n} reference positions in SITE_CLIMATE.sun.keyDates (${esc(v.algorithm.split(';')[0])}): max error ${v.maxSep.toFixed(3)}° (altitude ${v.maxAlt.toFixed(3)}°, azimuth ${v.maxAz.toFixed(3)}°).`:'Sun model uses the NOAA solar-calculator equations (standard time UTC−5); the reference sun table (climate-data.js) was not loaded, so it is not cross-checked in this view.';
    const notes=[
      `Terrain: USGS 2014–15 1 m bare-earth DEM averaged to ${d.spacing} m cells, ${esc(d.verticalDatum)}, ${esc(d.crs)}. Water is hydroflattened. Area shown ${fmt(d.cols*d.spacing)} × ${fmt(d.rows*d.spacing)} m; beyond it the sky is treated as open${DATA.horizon?' except for the SITE_CLIMATE bare-earth horizon':''}.`,
      'Canopy: 2014–15 leaf-off LiDAR (Nov–May flight). Canopy height = every unclassified return, so roofs, vehicles and wires can appear as canopy; ~318 cells look like roofs and are kept as shadow casters. Heights are 10+ years old.',
      'Shadows always come from the 2 m canopy-height grid. "Tree crowns" are symbols for the 1,659 detected dominant crowns; understory and merged crowns are missing.',
      'Shadows are geometric direct-beam only: no diffuse sky light, no light through bare branches or leaves. Leaf-on summer shade is larger than this leaf-off model shows.',
      'Lot 1 and the permit house are a provisional permit-to-aerial display fit (RMS 3.1 m, errors of 3–11 m possible), not survey geometry. Mapped layers are screening data; practice (PP-01) layers are fictional.',
      'Practice massing is an illustrative 28 × 40 ft, 26 ft box, not a design. Roof sun hours use true heights (vertical exaggeration is visual only) on the 2 m grid at 10-minute steps.',
      check
    ];
    return notes.map(n=>`<li>${n}</li>`).join('');
  }

  function siteViewer3dView(){
    if(!has('SITE_3D'))return `<section class="panel v3d"><h2>Sun and shade model</h2><p class="subtitle">The 3D model needs site3d-data.js, which is not loaded.</p></section>`;
    if(!DATA)prepareData();
    const presetBtns=SUN_PRESETS.map(([l,m,d])=>`<button type="button" class="v3d-chip" data-v3d-date="${doyOf(m,d)}" aria-pressed="${Math.round(state.doy)===doyOf(m,d)}">${l}</button>`).join('');
    const cams=[['overview','Overview'],['south','From south'],['plan','Plan'],['sun','Toward sun']].map(([id,l])=>`<button type="button" class="v3d-chip" data-v3d-cam="${id}">${l}</button>`).join('');
    const opt=(v,cur,l)=>`<option value="${v}" ${String(v)===String(cur)?'selected':''}>${l}</option>`;
    return `<section class="panel v3d" id="v3d-root" aria-labelledby="v3d-title">
      <div class="section-header"><div><p class="research-eyebrow">Dannemora · Lot 1 sun, trees &amp; terrain</p><h2 id="v3d-title">Sun and shade model (3D)</h2></div><span class="badge">Exploratory</span></div>
      <p class="subtitle">Move the sun through the day and the year and watch terrain and 2014–15 canopy cast shadows over Lot 1. Place the illustrative massing and clear trees around it to see how position and clearing change direct sun on its roof.</p>
      <div class="v3d-layout">
        <div class="v3d-stage">
          <div class="v3d-canvas-wrap" id="v3d-wrap">
            <canvas id="v3d-canvas" tabindex="0" role="img" aria-label="Interactive 3D model of terrain, canopy and shadows around Lot 1. Drag to rotate, right-drag or two fingers to pan, scroll or pinch to zoom. With the model focused: arrow keys rotate, Shift plus arrows pan, plus and minus zoom."></canvas>
            <div class="v3d-hud" aria-hidden="true"><strong id="v3d-hud-time"></strong><span id="v3d-hud-sun"></span></div>
            <div class="v3d-compass" aria-hidden="true"><svg viewBox="-34 -34 68 68"><g id="v3d-compass-rose"><circle r="22" class="v3d-compass-ring"/><path d="M0-18L5-3H-5Z" class="v3d-compass-n"/><path d="M0 18L5 3H-5Z" class="v3d-compass-s"/><text y="-25" text-anchor="middle" class="v3d-compass-label">N</text><g id="v3d-compass-sun"><circle cy="-22" r="4" class="v3d-compass-sun"/></g></g></svg></div>
            <div class="v3d-scale" aria-hidden="true"><span class="v3d-scale-bar" id="v3d-scale-bar"></span><span id="v3d-scale-label"></span></div>
            <div class="v3d-fallback" id="v3d-fallback" hidden><p>3D view unavailable: this browser could not start WebGL. The controls and notes below still describe the model.</p></div>
          </div>
          <div class="v3d-cams" role="group" aria-label="Camera presets"><span>View</span>${cams}</div>
          <p class="v3d-hint">Drag to rotate · right-drag / two fingers to pan · scroll or pinch to zoom · focus the model for keyboard: arrows rotate, Shift+arrows pan, + / − zoom.</p>
        </div>
        <div class="v3d-controls">
          <fieldset class="v3d-group"><legend>Sun</legend>
            <div class="v3d-row"><label for="v3d-date">Date <output id="v3d-date-out"></output></label><input type="range" id="v3d-date" min="1" max="365" step="1" value="${Math.round(state.doy)}" aria-describedby="v3d-date-out"></div>
            <div class="v3d-chips" role="group" aria-label="Season presets">${presetBtns}</div>
            <div class="v3d-row"><label for="v3d-time">Time <output id="v3d-time-out"></output></label><input type="range" id="v3d-time" min="0" max="1435" step="5" value="${state.minutes}" aria-describedby="v3d-time-out"></div>
            <div class="v3d-inline"><label for="v3d-clock">Clock</label><select id="v3d-clock">${opt('standard',state.clock,'Standard time, EST (UTC−5)')}${opt('local',state.clock,'Local clock (EDT in summer)')}</select></div>
            <p class="v3d-tz" id="v3d-tz"></p>
            <div class="v3d-chips"><button type="button" class="button secondary" id="v3d-play-day" aria-pressed="false">▶ Play day</button><button type="button" class="button secondary" id="v3d-play-year" aria-pressed="false">▶ Play year</button></div>
            <dl class="v3d-readout"><div><dt>Altitude</dt><dd id="v3d-alt">–</dd></div><div><dt>Azimuth</dt><dd id="v3d-az">–</dd></div><div><dt>Sunrise</dt><dd id="v3d-rise">–</dd></div><div><dt>Sunset</dt><dd id="v3d-set">–</dd></div><div><dt>Day length</dt><dd id="v3d-daylen">–</dd></div><div><dt>Noon altitude</dt><dd id="v3d-noon">–</dd></div></dl>
          </fieldset>
          <fieldset class="v3d-group"><legend>Practice massing &amp; tree clearing</legend>
            <label class="v3d-check"><input type="checkbox" id="v3d-massing" ${state.massing?'checked':''}><span>Practice massing (illustrative)<small>28 × 40 ft (1,120 sq ft), 2 storeys, 26 ft box · PP-01 limits ${fmt(DATA.footprintLimitSqFt)} sq ft / ${fmt(DATA.heightLimitFt)} ft</small></span></label>
            <div class="v3d-row"><label for="v3d-dx">East / west <output id="v3d-dx-out"></output></label><input type="range" id="v3d-dx" min="-80" max="80" step="1" value="${state.dx}"></div>
            <div class="v3d-row"><label for="v3d-dy">North / south <output id="v3d-dy-out"></output></label><input type="range" id="v3d-dy" min="-80" max="80" step="1" value="${state.dy}"></div>
            <div class="v3d-row"><label for="v3d-rot">Long-axis bearing <output id="v3d-rot-out"></output></label><input type="range" id="v3d-rot" min="0" max="179" step="1" value="${state.rot??DATA.houseBearing}"></div>
            <div class="v3d-row"><label for="v3d-clear">Clear trees within <output id="v3d-clear-out"></output></label><input type="range" id="v3d-clear" min="0" max="40" step="1" value="${state.clearR}" aria-describedby="v3d-clear-note"></div>
            <p class="v3d-note" id="v3d-clear-note">Removes whole detected crowns whose top lies within this distance of the massing footprint. Trees rooted inside the footprint and canopy over it are always cleared while the massing is shown.</p>
            <div class="v3d-meter" id="v3d-meter" role="meter" aria-valuemin="0" aria-valuemax="${DATA.clearingCap}" aria-valuenow="0" aria-label="Cleared canopy area against the practice clearing cap"><span id="v3d-meter-fill"></span></div>
            <p class="v3d-stat" id="v3d-clear-stat">–</p>
            <p class="v3d-stat" id="v3d-buildable"></p>
            <div class="v3d-sunhours"><h4>Direct sun on the massing roof</h4><dl class="v3d-readout" id="v3d-roof"></dl><p class="v3d-note" id="v3d-roof-now"></p></div>
            <div class="v3d-shaders"><h4>Trees shading the roof most on Dec 21</h4><ol id="v3d-shaders"></ol><button type="button" class="text-button" id="v3d-remove-shaders">Remove these trees</button></div>
            <button type="button" class="button secondary" id="v3d-reset">Reset massing &amp; trees</button>
          </fieldset>
          <fieldset class="v3d-group"><legend>Display</legend>
            <div class="v3d-inline"><label for="v3d-canopy">Canopy</label><select id="v3d-canopy">${opt('crowns',state.canopy,'Tree crowns (detected)')}${opt('surface',state.canopy,'Canopy surface (2 m grid)')}${opt('hidden',state.canopy,'Hidden — shadows only')}</select></div>
            <div class="v3d-inline"><label for="v3d-exag">Terrain relief</label><select id="v3d-exag">${opt(1,state.exag,'1× true scale')}${opt(2,state.exag,'2× (visual only)')}</select></div>
            <label class="v3d-check"><input type="checkbox" id="v3d-sunpath" ${state.sunPath?'checked':''}><span>Sun paths<small>Bold: selected date · orange: Jun 21 · blue: Dec 21</small></span></label>
            <label class="v3d-check"><input type="checkbox" id="v3d-contours" ${state.contours?'checked':''}><span>2 m contours (10 m bold)</span></label>
          </fieldset>
          <fieldset class="v3d-group"><legend>Layers</legend>${layersHtml()}
            <ul class="v3d-key"><li><i class="v3d-swatch" style="--v3d-fill:#9ec3d9;--v3d-fill-o:1;border-color:#7aa6c2"></i>Hydroflattened water (DEM)</li><li><i class="v3d-swatch" style="--v3d-fill:#4f7a4d;--v3d-fill-o:1;border-color:#3b5f3a"></i>Canopy / crowns, 2014–15 leaf-off</li><li><i class="v3d-swatch" style="--v3d-fill:#e0893a;--v3d-fill-o:1;border-color:#b5651d"></i>Top roof-shading trees (Dec 21)</li><li><i class="v3d-swatch" style="--v3d-fill:#f4f0e6;--v3d-fill-o:1;border-color:#3d4a55"></i>Practice massing (illustrative)</li></ul>
          </fieldset>
        </div>
      </div>
      <p class="sr-only" id="v3d-live" role="status" aria-live="polite"></p>
      <details class="v3d-notes" open><summary>What this model can and cannot tell you</summary><ul>${notesHtml()}</ul></details>
    </section>`;
  }

  // ---------------------------------------------------------------- geometry helpers
  const X=x=>x-(DATA.cols-1), Z=y=>-y-(DATA.rows-1);
  function groundAt(x,y){
    const {cols,rows,ground}=DATA, c=clamp(x/2,0,cols-1), r=clamp(-y/2,0,rows-1), c0=Math.min(Math.floor(c),cols-2), r0=Math.min(Math.floor(r),rows-2), fc=c-c0, fr=r-r0;
    const g=(rr,cc)=>ground[rr*cols+cc];
    return (g(r0,c0)*(1-fc)+g(r0,c0+1)*fc)*(1-fr)+(g(r0+1,c0)*(1-fc)+g(r0+1,c0+1)*fc)*fr;
  }
  const gy=g=>(g-DATA.base)*state.exag;
  function footprint(){
    const th=(state.rot??DATA.houseBearing)*RAD, cx=DATA.houseCentroid[0]+state.dx, cy=DATA.houseCentroid[1]+state.dy;
    const u=[Math.sin(th),Math.cos(th)], v=[Math.cos(th),-Math.sin(th)], hl=MASSING.l/2, hw=MASSING.w/2;
    const corners=[[1,1],[1,-1],[-1,-1],[-1,1]].map(([a,b])=>[cx+u[0]*hl*a+v[0]*hw*b,cy+u[1]*hl*a+v[1]*hw*b]);
    const dist=(x,y)=>{const dx=x-cx,dy=y-cy,pu=dx*u[0]+dy*u[1],pv=dx*v[0]+dy*v[1];return Math.hypot(Math.max(Math.abs(pu)-hl,0),Math.max(Math.abs(pv)-hw,0));};
    const g=groundAt(cx,cy);
    return {cx,cy,th,u,v,corners,dist,ground:g,top:g+MASSING.h,minGround:Math.min(...corners.map(p=>groundAt(p[0],p[1])))};
  }

  // ---------------------------------------------------------------- clearing / canopy state
  function computeCanopy(){
    const D=DATA, cur=V.cur, fp=footprint(), removed=new Set(), byRadius=new Set(), inside=new Set();
    cur.set(D.orig);
    D.trees.forEach((t,i)=>{
      const k=i+1, d=fp.dist(t.x,t.y);
      if(state.massing&&d===0){inside.add(k);removed.add(k);}
      if(state.clearR>0&&d<=state.clearR&&!inside.has(k)){byRadius.add(k);removed.add(k);}
    });
    let manual=0;state.manual.forEach(k=>{if(k>0&&k<=D.trees.length&&!removed.has(k)){removed.add(k);manual++;}});
    removed.forEach(k=>{for(const c of D.cellsByCrown[k])cur[c]=0;});
    let footprintCells=0;
    if(state.massing){
      const xs=fp.corners.map(p=>p[0]),ys=fp.corners.map(p=>p[1]);
      const c0=Math.max(0,Math.floor(Math.min(...xs)/2)-1),c1=Math.min(D.cols-1,Math.ceil(Math.max(...xs)/2)+1),r0=Math.max(0,Math.floor(-Math.max(...ys)/2)-1),r1=Math.min(D.rows-1,Math.ceil(-Math.min(...ys)/2)+1);
      for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)if(fp.dist(c*2,-r*2)<=1){const i=r*D.cols+c;if(cur[i]>0){cur[i]=0;footprintCells++;}}
    }
    let cleared=0;for(let i=0;i<D.n;i++)if(D.orig[i]>=CANOPY_MIN&&cur[i]<CANOPY_MIN)cleared++;
    V.removed=removed;
    V.clearing={removed:removed.size,byRadius:byRadius.size,inside:inside.size,manual,clearedM2:cleared*SITE_3D.spacing*SITE_3D.spacing};
    let mx=0;for(let i=0;i<D.n;i++){const s=D.ground[i]+(cur[i]>=CANOPY_MIN?cur[i]:0);V.surf[i]=s;if(s>mx)mx=s;}
    V.surfMax=mx;
  }

  function updateCanopyGeometry(){
    const D=DATA, pos=V.canopyGeo.attributes.position.array, cur=V.cur;
    for(let i=0;i<D.n;i++){const c=cur[i];pos[i*3+1]=gy(D.ground[i])+(c>=CANOPY_MIN?c:-SINK);}
    V.canopyGeo.attributes.position.needsUpdate=true;
    V.canopyGeo.computeVertexNormals();
    V.canopyGeo.computeBoundingSphere();
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), p=new THREE.Vector3(), zero=new THREE.Vector3(0,0,0);
    D.trees.forEach((t,i)=>{
      const gone=V.removed.has(i+1), g=gy(t.z), a=clamp(t.h*.32,1.5,7), r=Math.max(1,t.r);
      p.set(X(t.x),g+t.h-a,Z(t.y));s.set(r,a,r);m.compose(p,q,gone?zero:s);V.crowns.setMatrixAt(i,m);
      const th=Math.max(.5,t.h-a*1.4);p.set(X(t.x),g+th/2,Z(t.y));s.set(1,th,1);m.compose(p,q,gone?zero:s);V.trunks.setMatrixAt(i,m);
    });
    V.crowns.instanceMatrix.needsUpdate=true;V.trunks.instanceMatrix.needsUpdate=true;
  }

  function treeColors(){
    const c=new THREE.Color(), hot=new Set(V.shaders.map(s=>s.k));
    DATA.trees.forEach((t,i)=>{
      if(hot.has(i+1))c.set('#e0893a');else{const f=clamp((t.h-3)/22,0,1);c.setRGB(.42-.14*f,.56-.12*f,.36-.1*f);}
      V.crowns.setColorAt(i,c);
    });
    if(V.crowns.instanceColor)V.crowns.instanceColor.needsUpdate=true;
  }

  // ---------------------------------------------------------------- roof sun analysis (CPU ray march on the 2 m surface)
  function roofSamples(fp){
    const pts=[];
    for(let i=0;i<4;i++)for(let j=0;j<6;j++){const a=((i+.5)/4-.5)*MASSING.w,b=((j+.5)/6-.5)*MASSING.l;pts.push([fp.cx+fp.v[0]*a+fp.u[0]*b,fp.cy+fp.v[1]*a+fp.u[1]*b,fp.top+.05]);}
    return pts;
  }
  function horizonBlocks(alt,az){const h=DATA.horizon;if(!h)return false;const i=Math.round(az/h.step)%h.alt.length;return alt<=h.alt[(i+h.alt.length)%h.alt.length];}
  // returns -1 if lit, -2 if blocked by far horizon, otherwise the blocking cell index
  function march(x,y,z,tanA,dx,dy,far){
    const {cols,rows}=DATA, surf=V.surf, top=V.surfMax;
    for(let s=1;;s+=1){
      const zr=z+tanA*s;if(zr>top)return -1;
      const c=Math.round((x+dx*s)/2), r=Math.round(-(y+dy*s)/2);
      if(c<0||r<0||c>=cols||r>=rows)return far?-2:-1;
      const i=r*cols+c;if(surf[i]>zr)return i;
    }
  }
  function litFraction(samples,sun,track,weight){
    if(sun.altitude<=0)return 0;
    const tanA=Math.tan(sun.altitude*RAD),dx=Math.sin(sun.azimuth*RAD),dy=Math.cos(sun.azimuth*RAD),far=horizonBlocks(sun.altitude,sun.azimuth);
    let lit=0;
    for(const p of samples){const res=march(p[0],p[1],p[2],tanA,dx,dy,far);if(res===-1)lit++;else if(track&&res>=0){const k=SITE_3D.crownId?.[res]||0;if(k>0)track.set(k,(track.get(k)||0)+weight);}}
    return lit/samples.length;
  }
  function dayHours(doy,samples,track){
    let sun=0,day=0;
    for(let m=5;m<1440;m+=10){const p=sunAt(doy,m);if(p.altitude<=0)continue;day+=10;sun+=10*litFraction(samples,p,track,10/samples.length);}
    return {sun:sun/60,day:day/60};
  }
  function analyseRoof(full){
    if(!V)return;
    const fp=footprint(), samples=roofSamples(fp), out=V.roofStats||{};
    if(full){
      const track=new Map();
      out.keys=KEY_DATES.map(([l,m,d],i)=>({label:l,...dayHours(doyOf(m,d),samples,i===0?track:null)}));
      V.shaders=[...track.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,min])=>{const t=DATA.trees[k-1],dx=t.x-fp.cx,dy=t.y-fp.cy;return {k,min,h:t.h,dist:Math.hypot(dx,dy),bearing:(Math.atan2(dx,dy)*DEG+360)%360};});
      treeColors();
    }
    out.sel={label:dateLabel(state.doy),...dayHours(state.doy,samples,null)};
    V.roofStats=out;
    renderRoofStats();
    V.dirty=true;
  }
  const compass=b=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(b/22.5)%16];
  function renderRoofStats(){
    const el=V.el, st=V.roofStats;if(!st||!st.keys)return;
    const row=s=>`<div><dt>${esc(s.label)}</dt><dd>${s.sun.toFixed(1)} h <small>of ${s.day.toFixed(1)} h daylight</small></dd></div>`;
    el.roof.innerHTML=st.keys.map(row).join('')+row({...st.sel,label:`Selected · ${st.sel.label}`});
    el.shaders.innerHTML=V.shaders.length?V.shaders.map(s=>`<li>Tree #${s.k}: ${s.h.toFixed(0)} m tall, ${s.dist.toFixed(0)} m ${compass(s.bearing)} of the massing · ≈${Math.round(s.min)} min of full-roof shade</li>`).join(''):'<li>No tree shades the roof on Dec 21 at this position.</li>';
    el.removeShaders.hidden=!V.shaders.length;
  }
  let roofTimer=0;
  function scheduleRoof(full){clearTimeout(roofTimer);roofTimer=setTimeout(()=>analyseRoof(full),full?120:60);}

  // ---------------------------------------------------------------- drape texture (terrain colours, contours, overlays)
  function drawDrape(){
    const ctx=V.drapeCtx;
    ctx.globalAlpha=1;ctx.setLineDash([]);ctx.imageSmoothingEnabled=true;
    ctx.drawImage(DATA.baseCanvas,0,0,DRAPE,DRAPE);
    if(state.contours&&DATA.contours){ctx.strokeStyle='rgba(74,70,52,.32)';ctx.lineWidth=1.2;ctx.stroke(DATA.contours.minor);ctx.strokeStyle='rgba(74,70,52,.55)';ctx.lineWidth=2.4;ctx.stroke(DATA.contours.major);}
    const order={lot:0,wetland:1,'wetland-buffer':2,setback:3,buildable:4,clearing:5,'well-radius':6,septic:7,well:8,accessory:8,house:9};
    const layers=DATA.layers.filter(layerVisible).sort((a,b)=>(order[a.kind]??5)-(order[b.kind]??5));
    for(const L of layers){
      ctx.strokeStyle=L.color;ctx.fillStyle=L.color;
      for(const poly of L.polys){
        ctx.beginPath();
        for(const ring of poly){ring.forEach((p,i)=>i?ctx.lineTo(pxX(p[0]),pxY(p[1])):ctx.moveTo(pxX(p[0]),pxY(p[1])));ctx.closePath();}
        if(L.fillOpacity>0){ctx.globalAlpha=L.fillOpacity;ctx.fill('evenodd');}
        ctx.globalAlpha=.95;ctx.lineWidth=L.kind==='lot'?7:5;ctx.setLineDash(L.dashed?[22,12]:[]);ctx.stroke();
      }
      if(L.point){
        const x=pxX(L.point[0]),y=pxY(L.point[1]);
        ctx.setLineDash([]);ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.stroke();
      }
      ctx.globalAlpha=1;ctx.setLineDash([]);
    }
    V.drapeTex.needsUpdate=true;V.dirty=true;
  }

  // ---------------------------------------------------------------- scene
  function buildScene(canvas){
    const D=DATA, cols=D.cols, rows=D.rows, n=D.n;
    const coarse=matchMedia('(pointer: coarse)').matches, dpr=window.devicePixelRatio||1;
    const renderer=new THREE.WebGLRenderer({canvas,antialias:!(coarse&&dpr>=2),powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(dpr,coarse?1.5:2));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=coarse?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(40,1,1,8000);

    const pos=new Float32Array(n*3), uv=new Float32Array(n*2);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const i=r*cols+c;pos[i*3]=X(c*2);pos[i*3+2]=Z(-r*2);uv[i*2]=(2*c+1)/(2*cols);uv[i*2+1]=1-(2*r+1)/(2*rows);}
    const idx=new Uint32Array((cols-1)*(rows-1)*6);let k=0;
    for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c,b=a+1,d=a+cols,e=d+1;idx[k++]=a;idx[k++]=d;idx[k++]=b;idx[k++]=b;idx[k++]=d;idx[k++]=e;}
    const terrainGeo=new THREE.BufferGeometry();
    terrainGeo.setAttribute('position',new THREE.BufferAttribute(pos.slice(),3));terrainGeo.setAttribute('uv',new THREE.BufferAttribute(uv,2));terrainGeo.setIndex(new THREE.BufferAttribute(idx,1));
    const drapeCanvas=document.createElement('canvas');drapeCanvas.width=drapeCanvas.height=DRAPE;
    const drapeTex=new THREE.CanvasTexture(drapeCanvas);drapeTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const terrain=new THREE.Mesh(terrainGeo,new THREE.MeshLambertMaterial({map:drapeTex}));
    terrain.castShadow=terrain.receiveShadow=true;scene.add(terrain);

    const canopyGeo=new THREE.BufferGeometry(), col=new Float32Array(n*3), cc=new THREE.Color();
    for(let i=0;i<n;i++){const f=clamp((D.orig[i]-2)/22,0,1);cc.setRGB(.45-.17*f,.58-.16*f,.38-.13*f);col[i*3]=cc.r;col[i*3+1]=cc.g;col[i*3+2]=cc.b;}
    canopyGeo.setAttribute('position',new THREE.BufferAttribute(pos.slice(),3));canopyGeo.setAttribute('color',new THREE.BufferAttribute(col,3));canopyGeo.setIndex(new THREE.BufferAttribute(idx,1));
    const canopy=new THREE.Mesh(canopyGeo,new THREE.MeshLambertMaterial({vertexColors:true}));
    canopy.castShadow=canopy.receiveShadow=true;canopy.frustumCulled=false;scene.add(canopy);

    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshLambertMaterial(),Math.max(1,D.trees.length));
    crowns.receiveShadow=true;crowns.castShadow=false;crowns.frustumCulled=false;scene.add(crowns);
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.32,1,6),new THREE.MeshLambertMaterial({color:0x6b5a48}),Math.max(1,D.trees.length));
    trunks.receiveShadow=true;trunks.frustumCulled=false;scene.add(trunks);

    const skirt=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshLambertMaterial({color:0xb7c2ca,side:THREE.DoubleSide}));scene.add(skirt);

    const boxGeo=new THREE.BoxGeometry(MASSING.w,1,MASSING.l);boxGeo.translate(0,.5,0);
    const massing=new THREE.Mesh(boxGeo,new THREE.MeshLambertMaterial({color:0xf4f0e6}));
    massing.castShadow=massing.receiveShadow=true;
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo),new THREE.LineBasicMaterial({color:0x3d4a55}));massing.add(edges);
    scene.add(massing);

    const mkLine=(color,opacity)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(150*3),3));g.setDrawRange(0,0);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));l.frustumCulled=false;scene.add(l);return l;};
    const paths={sel:mkLine(0x8a5a00,1),jun:mkLine(0xe0893a,.75),dec:mkLine(0x4f7fb8,.75)};
    const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(26*3),3));tg.setDrawRange(0,0);
    const ticks=new THREE.Points(tg,new THREE.PointsMaterial({color:0x8a5a00,size:5,sizeAttenuation:false}));ticks.frustumCulled=false;scene.add(ticks);
    const sunBall=new THREE.Mesh(new THREE.SphereGeometry(5,16,12),new THREE.MeshBasicMaterial({color:0xffc533}));scene.add(sunBall);

    const hemi=new THREE.HemisphereLight(0xe6eef6,0x8c7f68,.5);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff4e0,1);
    const big=!coarse&&renderer.capabilities.maxTextureSize>=8192;
    sun.castShadow=true;sun.shadow.mapSize.set(big?4096:2048,big?4096:2048);sun.shadow.bias=-0.0004;sun.shadow.normalBias=.35;
    scene.add(sun);scene.add(sun.target);

    return {renderer,scene,camera,terrain,terrainGeo,canopy,canopyGeo,crowns,trunks,skirt,massing,paths,ticks,sunBall,hemi,sun,drapeCanvas,drapeCtx:drapeCanvas.getContext('2d'),drapeTex,shadowTexel:0};
  }

  function updateTerrainHeights(){
    const D=DATA, p=V.terrainGeo.attributes.position.array;
    for(let i=0;i<D.n;i++)p[i*3+1]=gy(D.ground[i]);
    V.terrainGeo.attributes.position.needsUpdate=true;V.terrainGeo.computeVertexNormals();V.terrainGeo.computeBoundingSphere();
    // skirt around the outer edge, down to a flat base
    const {cols,rows}=D, base=gy(D.gmin)-8, ring=[];
    for(let c=0;c<cols;c++)ring.push(c);
    for(let r=1;r<rows;r++)ring.push(r*cols+cols-1);
    for(let c=cols-2;c>=0;c--)ring.push((rows-1)*cols+c);
    for(let r=rows-2;r>=0;r--)ring.push(r*cols);
    const sp=new Float32Array(ring.length*6), si=[];
    ring.forEach((i,j)=>{sp[j*6]=p[i*3];sp[j*6+1]=p[i*3+1];sp[j*6+2]=p[i*3+2];sp[j*6+3]=p[i*3];sp[j*6+4]=base;sp[j*6+5]=p[i*3+2];if(j)si.push((j-1)*2,(j-1)*2+1,j*2,j*2,(j-1)*2+1,j*2+1);});
    V.skirt.geometry.dispose();
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(sp,3));g.setIndex(si);g.computeVertexNormals();V.skirt.geometry=g;
  }

  function placeMassing(){
    const fp=footprint();
    V.massing.visible=state.massing;
    const bottom=gy(fp.minGround)-.4, top=gy(fp.ground)+MASSING.h;
    V.massing.position.set(X(fp.cx),bottom,Z(fp.cy));V.massing.scale.set(1,top-bottom,1);V.massing.rotation.y=-fp.th;
    V.fp=fp;
  }

  function sunDir(alt,az){const a=alt*RAD,z=az*RAD;return new THREE.Vector3(Math.sin(z)*Math.cos(a),Math.sin(a),-Math.cos(z)*Math.cos(a));}

  function updatePaths(){
    if(!V)return;
    const fp=V.fp||footprint(), c=new THREE.Vector3(X(fp.cx),gy(fp.ground)+1,Z(fp.cy)), R=160;
    const fill=(line,doy)=>{
      const arr=line.geometry.attributes.position.array;let n=0;
      for(let m=0;m<=1440&&n<150;m+=10){const s=sunAt(doy,m);if(s.altitude<0)continue;const d=sunDir(s.altitude,s.azimuth).multiplyScalar(R).add(c);arr[n*3]=d.x;arr[n*3+1]=d.y;arr[n*3+2]=d.z;n++;}
      line.geometry.setDrawRange(0,n);line.geometry.attributes.position.needsUpdate=true;line.visible=state.sunPath;
    };
    fill(V.paths.sel,state.doy);fill(V.paths.jun,doyOf(6,21));fill(V.paths.dec,doyOf(12,21));
    const ta=V.ticks.geometry.attributes.position.array;let n=0;
    for(let h=0;h<24;h++){const s=sunAt(state.doy,h*60);if(s.altitude<0)continue;const d=sunDir(s.altitude,s.azimuth).multiplyScalar(R).add(c);ta[n*3]=d.x;ta[n*3+1]=d.y;ta[n*3+2]=d.z;n++;}
    V.ticks.geometry.setDrawRange(0,n);V.ticks.geometry.attributes.position.needsUpdate=true;V.ticks.visible=state.sunPath;
    V.pathCentre=c;
  }

  function fitShadowCamera(){
    const D=DATA, cam=V.sun.shadow.camera, inv=new THREE.Matrix4(), v=new THREE.Vector3();
    cam.position.copy(V.sun.position);cam.lookAt(V.sun.target.position);cam.updateMatrixWorld(true);inv.copy(cam.matrixWorld).invert();
    const x0=X(-1),x1=X(D.cols*2-1),z0=Z(1),z1=Z(1-D.rows*2),y0=gy(D.gmin)-9,y1=gy(D.gmax)+D.maxCanopy+12;
    let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];
    for(const x of [x0,x1])for(const y of [y0,y1])for(const z of [z0,z1]){v.set(x,y,z).applyMatrix4(inv);a=[Math.min(a[0],v.x),Math.min(a[1],v.y),Math.min(a[2],v.z)];b=[Math.max(b[0],v.x),Math.max(b[1],v.y),Math.max(b[2],v.z)];}
    cam.left=a[0];cam.right=b[0];cam.bottom=a[1];cam.top=b[1];cam.near=Math.max(.5,-b[2]-5);cam.far=-a[2]+5;cam.updateProjectionMatrix();
    V.shadowTexel=Math.max(b[0]-a[0],b[1]-a[1])/V.sun.shadow.mapSize.x;
  }

  function updateSun(dateChanged){
    if(!V)return;
    const s=sunAt(state.doy,state.minutes);V.sunPos=s;
    const dir=sunDir(Math.max(s.altitude,-5),s.azimuth);
    const target=new THREE.Vector3(0,(gy(DATA.gmin)+gy(DATA.gmax))/2,0);
    V.sun.target.position.copy(target);V.sun.target.updateMatrixWorld();
    V.sun.position.copy(dir).multiplyScalar(1600).add(target);
    V.sun.visible=s.altitude>-0.5;V.sun.intensity=.95*smooth(-1.5,4,s.altitude);
    V.sun.color.setRGB(1,.72+.26*smooth(0,25,s.altitude),.5+.42*smooth(0,30,s.altitude));
    V.hemi.intensity=.25+.27*smooth(-10,-1,s.altitude)+.1*smooth(-1,15,s.altitude);
    V.hemi.color.setRGB(.55+.36*smooth(-8,10,s.altitude),.62+.31*smooth(-8,10,s.altitude),.8+.16*smooth(-8,10,s.altitude));
    const night=new THREE.Color(0x23303c),dusk=new THREE.Color(0xe8c9aa),noon=new THREE.Color(0xdbe7f0),bg=night.clone().lerp(dusk,smooth(-8,0,s.altitude)).lerp(noon,smooth(2,18,s.altitude));
    V.scene.background=bg;V.el.wrap.classList.toggle('is-night',s.altitude<-4);
    if(V.sun.visible)fitShadowCamera();
    V.sunBall.visible=s.altitude>-3;
    if(V.pathCentre)V.sunBall.position.copy(sunDir(s.altitude,s.azimuth).multiplyScalar(160).add(V.pathCentre));
    if(dateChanged){V.riseSet=riseSet(state.doy);updatePaths();}
    renderSunReadout();
    V.dirty=true;
  }

  function clockFor(stdMin,doy){
    const dst=isDst(doy);
    if(state.clock==='local'&&dst)return `${hm(stdMin+60)} EDT`;
    return `${hm(stdMin)} EST`;
  }
  function renderSunReadout(){
    const el=V.el, s=V.sunPos, rs=V.riseSet||riseSet(state.doy), dst=isDst(state.doy), doy=Math.round(state.doy);
    const shown=state.clock==='local'&&dst?state.minutes+60:state.minutes;
    el.dateOut.textContent=dateLabel(doy);
    el.timeOut.textContent=clockFor(state.minutes,doy);
    el.time.value=String(((Math.round(shown/5)*5)%1440+1440)%1440);
    el.time.setAttribute('aria-valuetext',`${clockFor(state.minutes,doy)}${dst&&state.clock==='standard'?`, ${hm(state.minutes+60)} EDT on the clock`:''}`);
    el.date.value=String(doy);el.date.setAttribute('aria-valuetext',dateLabel(doy));
    el.tz.textContent=dst?(state.clock==='standard'?`Daylight saving is in force on ${dateLabel(doy)}: wall clocks read ${hm(state.minutes+60)} EDT (UTC−4). Times here are standard time.`:`Wall-clock time, EDT (UTC−4). Standard time is ${hm(state.minutes)} EST.`):`Standard time (EST, UTC−5) is in force on ${dateLabel(doy)}; no daylight saving.`;
    el.alt.textContent=`${s.altitude.toFixed(1)}°${s.altitude<0?' (below horizon)':''}`;
    el.az.textContent=`${s.azimuth.toFixed(1)}° ${compass(s.azimuth)}`;
    el.rise.textContent=rs.rise==null?'–':clockFor(rs.rise,doy);
    el.set.textContent=rs.set==null?'–':clockFor(rs.set,doy);
    el.daylen.textContent=rs.rise==null||rs.set==null?'–':`${Math.floor((rs.set-rs.rise)/60)} h ${pad(Math.round((rs.set-rs.rise)%60))} min`;
    el.noon.textContent=`${rs.maxAlt.toFixed(1)}° at ${clockFor(rs.noon,doy)}`;
    el.hudTime.textContent=`${dateLabel(doy)} · ${clockFor(state.minutes,doy)}`;
    el.hudSun.textContent=s.altitude>0?`Sun ${s.altitude.toFixed(1)}° high, ${s.azimuth.toFixed(0)}° ${compass(s.azimuth)}`:'Sun below the horizon';
    document.querySelectorAll('#v3d-root [data-v3d-date]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v3dDate===doy)));
    if(state.massing){const f=litFraction(roofSamples(V.fp||footprint()),s,null,0);el.roofNow.textContent=s.altitude>0?`Right now ${Math.round(f*100)}% of the roof is in direct sun.`:'Right now the sun is down.';}
    else el.roofNow.textContent='Show the massing to read roof sun hours.';
    clearTimeout(V.liveTimer);V.liveTimer=setTimeout(()=>{if(V)el.live.textContent=`${dateLabel(doy)}, ${clockFor(state.minutes,doy)}: sun ${s.altitude.toFixed(0)} degrees high at azimuth ${s.azimuth.toFixed(0)}.`;},600);
  }

  function renderClearing(){
    const el=V.el, c=V.clearing, cap=DATA.clearingCap, ac=c.clearedM2/ACRE, frac=ac/cap;
    el.meterFill.style.width=`${clamp(frac,0,1)*100}%`;el.meter.classList.toggle('over',frac>1);
    el.meter.setAttribute('aria-valuenow',ac.toFixed(3));el.meter.setAttribute('aria-valuetext',`${ac.toFixed(2)} of ${cap} acres`);
    const parts=[];if(c.inside)parts.push(`${c.inside} rooted in the footprint`);if(c.byRadius)parts.push(`${c.byRadius} within ${state.clearR} m`);if(c.manual)parts.push(`${c.manual} picked`);
    el.clearStat.innerHTML=`<strong>${c.removed} tree${c.removed===1?'':'s'} removed</strong>${parts.length?` (${esc(parts.join(', '))})`:''} · canopy cleared <strong>${ac.toFixed(2)} ac</strong> (${fmt(c.clearedM2)} m²) of the ${cap} ac practice cap${frac>1?' — <span class="v3d-over">over the cap</span>':''}. House-area canopy only; driveway, septic and well clearing are not counted.`;
    const buildable=DATA.layers.filter(L=>L.kind==='buildable'&&L.polys.length);
    if(buildable.length&&state.massing){
      const fp=V.fp||footprint(), ok=fp.corners.every(([x,y])=>buildable.some(L=>L.polys.some(p=>inRings(p,x,y))));
      el.buildable.innerHTML=ok?'Massing footprint is inside the practice buildable region.':'<span class="v3d-over">Massing footprint extends outside the practice buildable region.</span>';
    }else el.buildable.textContent='';
    const fp=V.fp||footprint();
    el.dxOut.textContent=`${state.dx>0?'+':''}${state.dx} m ${state.dx>=0?'E':'W'}`;
    el.dyOut.textContent=`${state.dy>0?'+':''}${state.dy} m ${state.dy>=0?'N':'S'}`;
    el.rotOut.textContent=`${Math.round(state.rot??DATA.houseBearing)}°`;
    el.clearOut.textContent=state.clearR?`${state.clearR} m`:'0 m (off)';
    el.dx.setAttribute('aria-valuetext',`${el.dxOut.textContent} of the permit house, ground ${fp.ground.toFixed(1)} m`);
  }

  function refreshMassingAndCanopy(){
    if(!V)return;
    placeMassing();computeCanopy();updateCanopyGeometry();renderClearing();updatePaths();
    updateSun(false);scheduleRoof(true);
  }
  let rebuildQueued=false;
  function queueRebuild(){if(rebuildQueued)return;rebuildQueued=true;requestAnimationFrame(()=>{rebuildQueued=false;refreshMassingAndCanopy();});}

  function applyCanopyMode(){
    const m=state.canopy;
    // the canopy grid always casts shadows; when not shown it renders with no colour or depth
    V.canopy.material.colorWrite=V.canopy.material.depthWrite=m==='surface';
    V.crowns.visible=V.trunks.visible=m==='crowns';
    V.dirty=true;
  }

  // ---------------------------------------------------------------- camera
  function setCamera(preset){
    const fp=V.fp||footprint(), t=new THREE.Vector3(X(fp.cx),gy(fp.ground),Z(fp.cy));
    let p;
    if(preset==='south')p=t.clone().add(new THREE.Vector3(0,95,250));
    else if(preset==='plan')p=t.clone().add(new THREE.Vector3(0,640,.01));
    else if(preset==='sun'){
      const s=V.sunPos, az=s&&s.altitude>0?s.azimuth:180, alt=s&&s.altitude>0?s.altitude:8;
      p=new THREE.Vector3(X(fp.cx),gy(fp.ground)+MASSING.h+2,Z(fp.cy));
      const d=sunDir(alt,az).multiplyScalar(-60);p.add(new THREE.Vector3(d.x,0,d.z));
      t.copy(new THREE.Vector3(X(fp.cx),gy(fp.ground)+MASSING.h,Z(fp.cy))).add(sunDir(alt,az).multiplyScalar(80));
    }
    else p=t.clone().add(new THREE.Vector3(115,165,215));
    V.controls.target.copy(t);V.camera.position.copy(p);V.controls.update();V.dirty=true;
  }
  function keyNav(ev){
    const k=ev.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','_'].includes(k))return;
    ev.preventDefault();
    const c=V.controls, off=V.camera.position.clone().sub(c.target);
    if(['+','=','-','_'].includes(k)){off.multiplyScalar(k==='+'||k==='='?.84:1.19);const len=clamp(off.length(),c.minDistance,c.maxDistance);off.setLength(len);}
    else if(ev.shiftKey){
      const fwd=new THREE.Vector3(-off.x,0,-off.z).normalize(), right=new THREE.Vector3(-fwd.z,0,fwd.x), step=off.length()*.06, mv=new THREE.Vector3();
      if(k==='ArrowUp')mv.add(fwd.multiplyScalar(step));if(k==='ArrowDown')mv.add(fwd.multiplyScalar(-step));if(k==='ArrowRight')mv.add(right.multiplyScalar(step));if(k==='ArrowLeft')mv.add(right.multiplyScalar(-step));
      c.target.add(mv);V.camera.position.add(mv);V.dirty=true;c.update();return;
    }else{
      const sp=new THREE.Spherical().setFromVector3(off);
      if(k==='ArrowLeft')sp.theta-=.12;if(k==='ArrowRight')sp.theta+=.12;
      if(k==='ArrowUp')sp.phi=clamp(sp.phi-.08,.02,c.maxPolarAngle);if(k==='ArrowDown')sp.phi=clamp(sp.phi+.08,.02,c.maxPolarAngle);
      off.setFromSpherical(sp);
    }
    V.camera.position.copy(c.target).add(off);c.update();V.dirty=true;
  }

  function updateHud(){
    const c=V.camera, t=V.controls.target, dir=t.clone().sub(c.position);
    let heading=Math.atan2(dir.x,-dir.z)*DEG;
    if(Math.hypot(dir.x,dir.z)<1e-3*dir.length()){const up=new THREE.Vector3(0,1,0).applyQuaternion(c.quaternion);heading=Math.atan2(up.x,-up.z)*DEG;}
    V.el.rose.setAttribute('transform',`rotate(${(-heading).toFixed(1)})`);
    const s=V.sunPos;V.el.compassSun.setAttribute('transform',`rotate(${s?s.azimuth.toFixed(1):0})`);V.el.compassSun.style.opacity=s&&s.altitude>0?1:.25;
    const h=V.el.canvas.clientHeight||1, mpp=2*c.position.distanceTo(t)*Math.tan(c.fov*RAD/2)/h;
    const target=110*mpp, pow=10**Math.floor(Math.log10(target)), nice=[1,2,5,10].map(m=>m*pow).reduce((a,b)=>Math.abs(b-target)<Math.abs(a-target)?b:a);
    V.el.scaleBar.style.width=`${Math.round(nice/mpp)}px`;V.el.scaleLabel.textContent=`${nice>=1000?nice/1000+' km':nice+' m'} at view centre`;
  }

  // ---------------------------------------------------------------- loop / animation
  const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setAnim(mode){
    if(!V)return;
    V.anim=V.anim&&V.anim.mode===mode?null:mode?{mode,last:performance.now(),acc:0}:null;
    if(!V.anim)state.doy=Math.round(state.doy);
    for(const [id,m,l] of [['playDay','day','day'],['playYear','year','year']]){const on=V.anim?.mode===m;V.el[id].setAttribute('aria-pressed',String(on));V.el[id].textContent=`${on?'❚❚ Pause':'▶ Play'} ${l}`;}
    if(!V.anim)scheduleRoof(false);
  }
  function stepAnim(now){
    const a=V.anim, dt=Math.min(.1,(now-a.last)/1000);a.last=now;
    let step;
    if(reduceMotion()){a.acc+=dt;if(a.acc<.7)return;a.acc=0;step=a.mode==='day'?15:4;}
    else step=a.mode==='day'?dt*90:dt*18;
    if(a.mode==='day'){state.minutes=((state.minutes+step)%1440+1440)%1440;updateSun(false);}
    else{state.doy=((state.doy-1+step)%365+365)%365+1;updateSun(true);if(now-(V.lastRoof||0)>400){V.lastRoof=now;analyseRoof(false);}}
  }
  function loop(now){
    if(!V)return;
    if(!V.el.canvas.isConnected){disposeSiteViewer3d();return;}
    V.raf=requestAnimationFrame(loop);
    if(V.anim)stepAnim(now);
    if(V.controls.update())V.dirty=true;
    if(V.dirty){V.dirty=false;V.renderer.render(V.scene,V.camera);updateHud();}
  }
  function resize(){
    if(!V)return;
    const w=V.el.canvas.clientWidth,h=V.el.canvas.clientHeight;if(!w||!h)return;
    V.renderer.setSize(w,h,false);V.camera.aspect=w/h;V.camera.updateProjectionMatrix();V.dirty=true;
  }

  // ---------------------------------------------------------------- events
  function onInput(ev){
    const t=ev.target, id=t.id;
    if(id==='v3d-date'){state.doy=+t.value;updateSun(true);scheduleRoof(false);}
    else if(id==='v3d-time'){const v=+t.value;state.minutes=state.clock==='local'&&isDst(state.doy)?(v-60+1440)%1440:v;updateSun(false);}
    else if(id==='v3d-dx'||id==='v3d-dy'||id==='v3d-rot'||id==='v3d-clear'){state[{'v3d-dx':'dx','v3d-dy':'dy','v3d-rot':'rot','v3d-clear':'clearR'}[id]]=+t.value;if(id!=='v3d-clear'&&id!=='v3d-rot')state.manual=[];queueRebuild();}
  }
  function onChange(ev){
    const t=ev.target, id=t.id;
    if(id==='v3d-clock'){state.clock=t.value;updateSun(false);}
    else if(id==='v3d-canopy'){state.canopy=t.value;applyCanopyMode();}
    else if(id==='v3d-exag'){state.exag=+t.value;const oldY=V.controls.target.y;updateTerrainHeights();refreshMassingAndCanopy();const fp=V.fp;const dy=gy(fp.ground)-oldY;V.controls.target.y+=dy;V.camera.position.y+=dy;}
    else if(id==='v3d-sunpath'){state.sunPath=t.checked;updatePaths();V.dirty=true;}
    else if(id==='v3d-contours'){state.contours=t.checked;drawDrape();}
    else if(id==='v3d-massing'){state.massing=t.checked;queueRebuild();}
    else if(t.dataset.v3dGroup){state.groups[t.dataset.v3dGroup]=t.checked;drawDrape();}
    else if(t.dataset.v3dLayer){if(t.checked)delete state.hidden[t.dataset.v3dLayer];else state.hidden[t.dataset.v3dLayer]=true;drawDrape();}
  }
  function onClick(ev){
    const b=ev.target.closest('button');if(!b||!V)return;
    if(b.dataset.v3dDate){state.doy=+b.dataset.v3dDate;updateSun(true);scheduleRoof(false);}
    else if(b.dataset.v3dCam)setCamera(b.dataset.v3dCam);
    else if(b.id==='v3d-play-day')setAnim('day');
    else if(b.id==='v3d-play-year')setAnim('year');
    else if(b.id==='v3d-reset'){state.dx=0;state.dy=0;state.rot=null;state.clearR=0;state.manual=[];V.el.dx.value=0;V.el.dy.value=0;V.el.rot.value=DATA.houseBearing;V.el.clear.value=0;queueRebuild();}
    else if(b.id==='v3d-remove-shaders'){state.manual=[...new Set(state.manual.concat(V.shaders.map(s=>s.k)))];queueRebuild();}
  }

  // ---------------------------------------------------------------- lifecycle
  function initSiteViewer3d(){
    const root=document.getElementById('v3d-root');if(!root)return;
    if(V){if(V.root===root)return;disposeSiteViewer3d();}
    const canvas=root.querySelector('#v3d-canvas');
    const q=id=>root.querySelector('#'+id);
    const fail=msg=>{const f=q('v3d-fallback');if(f){f.hidden=false;if(msg)f.querySelector('p').textContent=msg;}canvas.hidden=true;};
    if(typeof THREE==='undefined'||typeof THREE.OrbitControls!=='function'){fail('3D view unavailable: vendor/three/three.min.js or OrbitControls.js did not load.');return;}
    if(!has('SITE_3D')){fail('3D view unavailable: site3d-data.js did not load.');return;}
    if(!DATA)prepareData();
    let parts;
    try{parts=buildScene(canvas);}catch(err){console.warn('[site-viewer3d] WebGL init failed',err);fail();return;}
    V={root,...parts,cur:new Float32Array(DATA.n),surf:new Float32Array(DATA.n),surfMax:0,removed:new Set(),shaders:[],dirty:true,anim:null,raf:0,
      el:{canvas,wrap:q('v3d-wrap'),date:q('v3d-date'),dateOut:q('v3d-date-out'),time:q('v3d-time'),timeOut:q('v3d-time-out'),tz:q('v3d-tz'),alt:q('v3d-alt'),az:q('v3d-az'),rise:q('v3d-rise'),set:q('v3d-set'),daylen:q('v3d-daylen'),noon:q('v3d-noon'),
        hudTime:q('v3d-hud-time'),hudSun:q('v3d-hud-sun'),rose:q('v3d-compass-rose'),compassSun:q('v3d-compass-sun'),scaleBar:q('v3d-scale-bar'),scaleLabel:q('v3d-scale-label'),
        playDay:q('v3d-play-day'),playYear:q('v3d-play-year'),dx:q('v3d-dx'),dy:q('v3d-dy'),rot:q('v3d-rot'),clear:q('v3d-clear'),dxOut:q('v3d-dx-out'),dyOut:q('v3d-dy-out'),rotOut:q('v3d-rot-out'),clearOut:q('v3d-clear-out'),
        meter:q('v3d-meter'),meterFill:q('v3d-meter-fill'),clearStat:q('v3d-clear-stat'),buildable:q('v3d-buildable'),roof:q('v3d-roof'),roofNow:q('v3d-roof-now'),shaders:q('v3d-shaders'),removeShaders:q('v3d-remove-shaders'),live:q('v3d-live')}};
    const controls=new THREE.OrbitControls(V.camera,canvas);
    controls.enableDamping=true;controls.dampingFactor=.12;controls.screenSpacePanning=false;controls.maxPolarAngle=88*RAD;controls.minDistance=12;controls.maxDistance=2600;controls.zoomSpeed=1.1;
    controls.addEventListener('change',()=>{if(V)V.dirty=true;});
    V.controls=controls;
    canvas.addEventListener('keydown',keyNav);
    root.addEventListener('input',onInput);root.addEventListener('change',onChange);root.addEventListener('click',onClick);
    V.resizeObs=new ResizeObserver(resize);V.resizeObs.observe(canvas);
    resize();
    updateTerrainHeights();drawDrape();applyCanopyMode();
    placeMassing();computeCanopy();updateCanopyGeometry();renderClearing();updatePaths();
    V.riseSet=riseSet(state.doy);updateSun(true);
    if(state.camera){V.camera.position.fromArray(state.camera.p);controls.target.fromArray(state.camera.t);controls.update();}else setCamera('overview');
    analyseRoof(true);
    V.raf=requestAnimationFrame(loop);
  }

  function disposeSiteViewer3d(){
    if(!V)return;
    const v=V;V=null;
    cancelAnimationFrame(v.raf);clearTimeout(roofTimer);clearTimeout(v.liveTimer);
    if(v.controls){state.camera={p:v.camera.position.toArray(),t:v.controls.target.toArray()};v.controls.dispose();}
    state.doy=Math.round(state.doy);
    v.resizeObs?.disconnect();
    v.el?.canvas?.removeEventListener('keydown',keyNav);
    v.root.removeEventListener('input',onInput);v.root.removeEventListener('change',onChange);v.root.removeEventListener('click',onClick);
    v.scene.traverse(o=>{o.geometry?.dispose();const m=o.material;(Array.isArray(m)?m:m?[m]:[]).forEach(x=>{x.map?.dispose();x.dispose();});o.dispose?.();});
    v.drapeTex.dispose();v.sun.shadow.map?.dispose();
    v.renderer.dispose();v.renderer.forceContextLoss?.();
  }

  window.siteSolarPosition=solarPosition;
  window.siteViewer3dView=siteViewer3dView;
  window.initSiteViewer3d=initSiteViewer3d;
  window.disposeSiteViewer3d=disposeSiteViewer3d;
})();
