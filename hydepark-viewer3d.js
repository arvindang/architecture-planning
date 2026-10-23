'use strict';
// 3D sun and shade model for Hydepark Home (Lot 25, 5418–5420 S. Kimbark Ave, Chicago).
// Needs (classic defer scripts, before app.js): vendor/three, site-viewer3d.js (siteSolarPosition), hydepark-3d-data.js;
// optional hydepark-imagery-data.js and hydepark-climate-data.js.
// Exposes hydeparkViewer3dView(), initHydeparkViewer3d(), disposeHydeparkViewer3d().
(function(){
  const FT=0.3048, RAD=Math.PI/180, DEG=180/Math.PI, YEAR=2026, TZ_MIN=-360, DRAPE=2048, CELL=0.5;
  const FALLBACK={lat:41.79739,lon:-87.59543}, SUN_R=150;
  const SUN_PRESETS=[['Dec 21',12,21],['Feb 15',2,15],['Mar 20',3,20],['Jun 21',6,21],['Sep 22',9,22]];
  const KEY_DATES=[['Dec 21',12,21],['Mar 20',3,20],['Jun 21',6,21]];
  const MASS={front:15,depth:60,height:35,north:3,south:5,garage:true,garageDepth:24,garageHeight:15,rearGap:2};
  const doyOf=(m,d,y=YEAR)=>Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/864e5)+1;
  const state={doy:doyOf(12,21),minutes:12*60,clock:'standard',trees:true,heat:true,labels:true,imagery:true,ghosts:false,sunPath:true,showMass:true,mass:{...MASS},camera:null};
  let DATA=null, V=null;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  const pad=n=>String(n).padStart(2,'0');
  const hm=min=>{const m=((Math.round(min)%1440)+1440)%1440;return `${pad(Math.floor(m/60))}:${pad(m%60)}`;};
  const dateLabel=doy=>new Date(Date.UTC(YEAR,0,Math.round(doy))).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const fmt=(v,d=0)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const ft=m=>`${fmt(m/FT)} ft`;
  const compass=b=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(b/22.5)%16];
  const get=name=>{try{const v={D3:()=>SITE_HYDEPARK_3D,IMG:()=>SITE_HYDEPARK_IMAGERY,CLIM:()=>SITE_HYDEPARK_CLIMATE}[name]();return v&&typeof v==='object'?v:undefined;}catch{return undefined;}};

  // ---------------------------------------------------------------- sun (shared NOAA model from site-viewer3d.js)
  const msAt=(doy,stdMin,year=YEAR)=>Date.UTC(year,0,1)+(doy-1)*864e5+(stdMin-TZ_MIN)*6e4;
  const sunAt=(doy,stdMin)=>window.siteSolarPosition(msAt(doy,stdMin),DATA.lat,DATA.lon);
  function riseSet(doy){
    const f=m=>sunAt(doy,m).trueAltitude+0.833, out={rise:null,set:null,noon:null,maxAlt:-90};
    let prev=f(0);
    for(let m=10;m<=1440;m+=10){
      const cur=f(m);
      if((prev<0)!==(cur<0)){let a=m-10,b=m,fa=prev;for(let k=0;k<18;k++){const c=(a+b)/2,fc=f(c);if((fa<0)===(fc<0)){a=c;fa=fc;}else b=c;}if(prev<0)out.rise=(a+b)/2;else out.set=(a+b)/2;}
      prev=cur;
    }
    let noon=720-4*DATA.lon+TZ_MIN-sunAt(doy,720).eot;noon=720-4*DATA.lon+TZ_MIN-sunAt(doy,noon).eot;
    out.noon=noon;out.maxAlt=sunAt(doy,noon).altitude;
    return out;
  }
  function nthSunday(month,n){const first=new Date(Date.UTC(YEAR,month-1,1)).getUTCDay();return doyOf(month,1+((7-first)%7)+(n-1)*7);}
  const DST={start:nthSunday(3,2),end:nthSunday(11,1)};
  const isDst=doy=>Math.round(doy)>=DST.start&&Math.round(doy)<DST.end;
  function validateSun(){
    const sun=get('CLIM')?.sun;
    if(!sun||!Array.isArray(sun.keyDates))return null;
    const lat=Number(sun.location?.lat??DATA.lat), lon=Number(sun.location?.lon??DATA.lon), tz=Number(sun.location?.timeZone??-6);
    let n=0,maxSep=0;
    for(const kd of sun.keyDates){
      const m=String(kd.date||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m||!Array.isArray(kd.positions))continue;
      const y=+m[1],doy=doyOf(+m[2],+m[3],y);
      for(const p of kd.positions){
        if(!Array.isArray(p)||!(p[1]>0))continue;
        const s=window.siteSolarPosition(Date.UTC(y,0,1)+(doy-1)*864e5+(p[0]*60-tz*60)*6e4,lat,lon);
        const dAz=Math.abs(((s.azimuth-p[2]+540)%360)-180), a1=s.altitude*RAD, a2=p[1]*RAD;
        maxSep=Math.max(maxSep,Math.acos(clamp(Math.sin(a1)*Math.sin(a2)+Math.cos(a1)*Math.cos(a2)*Math.cos(dAz*RAD),-1,1))*DEG);n++;
      }
    }
    return n?{n,maxSep}:null;
  }

  // ---------------------------------------------------------------- geometry
  function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return a/2;}
  function centroid(r){let a=0,x=0,y=0;for(let i=0,j=r.length-1;i<r.length;j=i++){const f=r[j][0]*r[i][1]-r[i][0]*r[j][1];a+=f;x+=(r[j][0]+r[i][0])*f;y+=(r[j][1]+r[i][1])*f;}return Math.abs(a)<1e-9?[r[0][0],r[0][1]]:[x/(3*a),y/(3*a)];}
  function inRing(r,x,y){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
  const okRing=r=>Array.isArray(r)&&r.length>=3&&r.every(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]));

  // Lot frame: u runs along the long axis toward Kimbark (east), v across it toward the north alley.
  function lotFrame(ring){
    let best=0,u=[1,0];
    for(let i=1;i<ring.length;i++){const dx=ring[i][0]-ring[i-1][0],dy=ring[i][1]-ring[i-1][1],len=Math.hypot(dx,dy);if(len>best){best=len;u=[dx/len,dy/len];}}
    if(u[0]<0)u=[-u[0],-u[1]];
    const v=[-u[1],u[0]], pu=ring.map(p=>p[0]*u[0]+p[1]*u[1]), pv=ring.map(p=>p[0]*v[0]+p[1]*v[1]);
    return {u,v,u0:Math.min(...pu),u1:Math.max(...pu),v0:Math.min(...pv),v1:Math.max(...pv),angle:Math.atan2(u[1],u[0])};
  }
  const fromUV=(pu,pv)=>{const F=DATA.frame;return [F.u[0]*pu+F.v[0]*pv,F.u[1]*pu+F.v[1]*pv];};

  function prepareData(){
    const d=get('D3'), cols=d.cols, rows=d.rows, n=cols*rows, [x0,y0,x1,y1]=d.extent;
    const ground=new Float32Array(n);let gmin=Infinity,gmax=-Infinity;
    for(let i=0;i<n;i++){const g=d.ground[i];if(g==null||!Number.isFinite(g))continue;if(g<gmin)gmin=g;if(g>gmax)gmax=g;}
    for(let i=0;i<n;i++){const g=d.ground[i];ground[i]=g==null||!Number.isFinite(g)?gmin:g;}
    const lot=okRing(d.lot)?d.lot:[[-27,-6],[27,-6],[27,6],[-27,6],[-27,-6]];
    const buildings=(Array.isArray(d.buildings)?d.buildings:[]).filter(b=>okRing(b.ring)&&Number.isFinite(+b.roofZ)).map((b,i)=>{
      const c=centroid(b.ring), gz=Number.isFinite(+b.groundZ)?+b.groundZ:null;
      return {...b,i,c,groundZ:gz,roofZ:+b.roofZ,heightM:Number.isFinite(+b.heightM)?+b.heightM:(gz==null?null:+b.roofZ-gz)};
    });
    const trees=(Array.isArray(d.trees)?d.trees:[]).filter(t=>[t.x,t.y,t.h].every(v=>Number.isFinite(+v))&&t.h>0);
    const site=get('CLIM')?.site;
    DATA={d,cols,rows,n,x0,y0,x1,y1,ground,gmin,gmax,base:Math.floor(gmin),lot,buildings,trees,
      demolished:(Array.isArray(d.demolished)?d.demolished:[]).filter(b=>okRing(b.ring)),
      lat:Number.isFinite(+site?.lat)?+site.lat:FALLBACK.lat,lon:Number.isFinite(+site?.lon)?+site.lon:FALLBACK.lon,
      frame:lotFrame(lot),lotArea:Math.abs(ringArea(lot))};
    DATA.lotGround=groundAt(...centroid(lot));
    DATA.validation=validateSun();
    DATA.neighbours=buildings.filter(b=>b.side&&Number.isFinite(+b.distanceToLotM)&&+b.distanceToLotM<45).sort((a,b)=>+a.distanceToLotM-+b.distanceToLotM);
    return DATA;
  }

  function groundAt(x,y){
    const {cols,rows,ground,x0,y1}=DATA, c=clamp(x-x0-.5,0,cols-1), r=clamp(y1-y-.5,0,rows-1);
    const c0=Math.min(Math.floor(c),cols-2), r0=Math.min(Math.floor(r),rows-2), fc=c-c0, fr=r-r0, g=(rr,cc)=>ground[rr*cols+cc];
    return (g(r0,c0)*(1-fc)+g(r0,c0+1)*fc)*(1-fr)+(g(r0+1,c0)*(1-fc)+g(r0+1,c0+1)*fc)*fr;
  }

  // Illustrative massing boxes in the lot frame (feet in state, metres here).
  function massBoxes(){
    const F=DATA.frame, m=state.mass, out=[];
    const vS=F.v0+m.south*FT, vN=F.v1-m.north*FT, hu1=F.u1-m.front*FT, hu0=hu1-m.depth*FT;
    const box=(id,u0,u1,v0,v1,h)=>{const corners=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([a,b])=>fromUV(a,b));const c=fromUV((u0+u1)/2,(v0+v1)/2),g=Math.min(...corners.map(p=>groundAt(p[0],p[1])));return {id,u0,u1,v0,v1,h,corners,c,ground:g,top:g+h};};
    out.push(box('house',hu0,hu1,vS,vN,m.height*FT));
    if(m.garage){const g0=F.u0+m.rearGap*FT;out.push(box('garage',g0,Math.min(g0+m.garageDepth*FT,hu0-1),vS,vN,m.garageHeight*FT));}
    return out.filter(b=>b.u1>b.u0+1&&b.v1>b.v0+1);
  }
  const inBox=(b,x,y)=>{const F=DATA.frame,pu=x*F.u[0]+y*F.u[1],pv=x*F.v[0]+y*F.v[1];return pu>=b.u0&&pu<=b.u1&&pv>=b.v0&&pv<=b.v1;};

  // ---------------------------------------------------------------- obstruction surface (0.5 m) and ray march
  function buildStatic(){
    const D=DATA, cols=Math.round((D.x1-D.x0)/CELL), rows=Math.round((D.y1-D.y0)/CELL), n=cols*rows;
    const base=new Float32Array(n), trees=new Float32Array(n);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)base[r*cols+c]=groundAt(D.x0+(c+.5)*CELL,D.y1-(r+.5)*CELL);
    const cellRange=(xs,ys)=>[Math.max(0,Math.floor((Math.min(...xs)-D.x0)/CELL)),Math.min(cols-1,Math.ceil((Math.max(...xs)-D.x0)/CELL)),Math.max(0,Math.floor((D.y1-Math.max(...ys))/CELL)),Math.min(rows-1,Math.ceil((D.y1-Math.min(...ys))/CELL))];
    for(const b of D.buildings){
      const [c0,c1,r0,r1]=cellRange(b.ring.map(p=>p[0]),b.ring.map(p=>p[1]));
      for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const x=D.x0+(c+.5)*CELL,y=D.y1-(r+.5)*CELL;if(inRing(b.ring,x,y)){const i=r*cols+c;if(b.roofZ>base[i])base[i]=b.roofZ;}}
    }
    for(const t of D.trees){
      const gz=Number.isFinite(+t.groundZ)?+t.groundZ:groundAt(t.x,t.y), r=Math.max(1,+t.r||1);
      const [c0,c1,r0,r1]=cellRange([t.x-r,t.x+r],[t.y-r,t.y+r]);
      for(let rr=r0;rr<=r1;rr++)for(let c=c0;c<=c1;c++){const dx=D.x0+(c+.5)*CELL-t.x,dy=D.y1-(rr+.5)*CELL-t.y,q=(dx*dx+dy*dy)/(r*r);if(q>1)continue;const z=gz+t.h*(1-.3*q),i=rr*cols+c;if(z>trees[i])trees[i]=z;}
    }
    return {cols,rows,n,base,trees,surf:new Float32Array(n),top:0};
  }
  function composeSurface(){
    const S=V.S, D=DATA, boxes=state.showMass?massBoxes():[];
    for(let i=0;i<S.n;i++)S.surf[i]=state.trees&&S.trees[i]>S.base[i]?S.trees[i]:S.base[i];
    for(const b of boxes){
      const xs=b.corners.map(p=>p[0]),ys=b.corners.map(p=>p[1]);
      const c0=Math.max(0,Math.floor((Math.min(...xs)-D.x0)/CELL)),c1=Math.min(S.cols-1,Math.ceil((Math.max(...xs)-D.x0)/CELL)),r0=Math.max(0,Math.floor((D.y1-Math.max(...ys))/CELL)),r1=Math.min(S.rows-1,Math.ceil((D.y1-Math.min(...ys))/CELL));
      for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)if(inBox(b,D.x0+(c+.5)*CELL,D.y1-(r+.5)*CELL)){const i=r*S.cols+c;if(b.top>S.surf[i])S.surf[i]=b.top;}
    }
    let top=-Infinity;for(let i=0;i<S.n;i++)if(S.surf[i]>top)top=S.surf[i];S.top=top;
    V.boxes=boxes;
  }
  function lit(x,y,z,s){
    const S=V.S, D=DATA, step=CELL*.8;
    for(let k=1;k<2000;k++){
      const d=k*step, zr=z+s.tanA*d;if(zr>S.top)return true;
      const c=Math.floor((x+s.dx*d-D.x0)/CELL), r=Math.floor((D.y1-(y+s.dy*d))/CELL);
      if(c<0||r<0||c>=S.cols||r>=S.rows)return true;
      if(S.surf[r*S.cols+c]>zr)return false;
    }
    return true;
  }
  const sunVec=p=>({tanA:Math.tan(p.altitude*RAD),dx:Math.sin(p.azimuth*RAD),dy:Math.cos(p.azimuth*RAD)});

  // Sample points: lot ground at 1 m by zone, house roof, south wall by level, rear wall level 1.
  function samplePoints(){
    const F=DATA.frame, boxes=V.boxes, house=boxes.find(b=>b.id==='house'), garage=boxes.find(b=>b.id==='garage'), pts=[];
    for(let pu=Math.ceil(F.u0)+.5;pu<F.u1;pu+=1)for(let pv=Math.ceil(F.v0)+.5;pv<F.v1;pv+=1){
      const [x,y]=fromUV(pu,pv);if(!inRing(DATA.lot,x,y))continue;
      if(boxes.some(b=>pu>=b.u0&&pu<=b.u1&&pv>=b.v0&&pv<=b.v1))continue;
      let zone='yard';
      if(house){if(pu>house.u1)zone='front';else if(pu>=house.u0)zone=pv<house.v0?'south':'north';else zone=garage&&pu<garage.u1?'alley':'rear';}
      pts.push({x,y,z:groundAt(x,y)+.05,zone,ground:true});
    }
    if(house){
      for(let i=0;i<4;i++)for(let j=0;j<8;j++){const [x,y]=fromUV(house.u0+(j+.5)/8*(house.u1-house.u0),house.v0+(i+.5)/4*(house.v1-house.v0));pts.push({x,y,z:house.top+.05,zone:'roof'});}
      const off=.6, sN=[-F.v[0],-F.v[1]], rN=[-F.u[0],-F.u[1]];
      [[1.5,'wall1'],[4.5,'wall2'],[7.5,'wall3']].forEach(([h,zone])=>{if(h>house.h-1)return;for(let j=0;j<8;j++){const [x,y]=fromUV(house.u0+(j+.5)/8*(house.u1-house.u0),house.v0-off);pts.push({x,y,z:house.ground+h,zone,normal:sN});}});
      for(let j=0;j<5;j++){const [x,y]=fromUV(house.u0-off,house.v0+(j+.5)/5*(house.v1-house.v0));pts.push({x,y,z:house.ground+1.5,zone:'rearwall',normal:rN});}
    }
    return pts;
  }
  function dayHours(doy,pts){
    const hours=new Float32Array(pts.length);let daylight=0;
    for(let m=5;m<1440;m+=10){
      const p=sunAt(doy,m);if(p.altitude<=0)continue;daylight+=10;
      const s=sunVec(p);
      for(let i=0;i<pts.length;i++){const q=pts[i];if(q.normal&&q.normal[0]*s.dx+q.normal[1]*s.dy<=0)continue;if(lit(q.x,q.y,q.z,s))hours[i]+=10/60;}
    }
    return {hours,daylight:daylight/60};
  }
  const ZONES=[['front','Front yard (Kimbark)'],['south','South side path'],['rear','Rear yard / garden'],['roof','House roof'],['wall1','South wall, level 1 (1.5 m)'],['wall2','South wall, level 2 (4.5 m)'],['wall3','South wall, level 3 (7.5 m)'],['rearwall','Rear (west) wall, level 1']];
  function zoneMeans(pts,hours){const acc={};pts.forEach((p,i)=>{(acc[p.zone]||(acc[p.zone]=[0,0]));acc[p.zone][0]+=hours[i];acc[p.zone][1]++;});const out={};for(const k in acc)out[k]=acc[k][0]/acc[k][1];return out;}
  function analyse(full){
    if(!V)return;
    const pts=samplePoints(), t0=performance.now();
    if(full)V.keyStats=KEY_DATES.map(([l,m,d])=>{const r=dayHours(doyOf(m,d),pts);return {label:l,daylight:r.daylight,zones:zoneMeans(pts,r.hours)};});
    const sel=dayHours(state.doy,pts);
    V.selStats={label:dateLabel(state.doy),daylight:sel.daylight,zones:zoneMeans(pts,sel.hours)};
    V.heat={pts,hours:sel.hours,daylight:sel.daylight};
    V.analysisMs=performance.now()-t0;
    renderStats();drawDrape();
  }
  let analyseTimer=0;
  function scheduleAnalyse(full){clearTimeout(analyseTimer);analyseTimer=setTimeout(()=>analyse(full),full?140:70);}

  // ---------------------------------------------------------------- drape (imagery, outlines, sun-hours map)
  const pxX=x=>(x-DATA.x0)/(DATA.x1-DATA.x0)*DRAPE, pxY=y=>(DATA.y1-y)/(DATA.y1-DATA.y0)*DRAPE;
  function ringPath(ctx,r){r.forEach((p,i)=>i?ctx.lineTo(pxX(p[0]),pxY(p[1])):ctx.moveTo(pxX(p[0]),pxY(p[1])));ctx.closePath();}
  function heatColor(f){const stops=[[0,[40,52,92]],[.25,[74,98,160]],[.5,[124,154,120]],[.75,[236,196,84]],[1,[255,232,140]]];let i=0;while(i<stops.length-2&&f>stops[i+1][0])i++;const [a,ca]=stops[i],[b,cb]=stops[i+1],t=clamp((f-a)/(b-a),0,1);return `rgb(${ca.map((v,k)=>Math.round(v+(cb[k]-v)*t)).join(',')})`;}
  function drawDrape(){
    if(!V)return;
    const ctx=V.drapeCtx, D=DATA;
    ctx.globalAlpha=1;ctx.setLineDash([]);
    ctx.fillStyle='#d9d6cc';ctx.fillRect(0,0,DRAPE,DRAPE);
    if(state.imagery&&V.aerial){
      const im=V.aerial, b=im.bounds;
      try{ctx.drawImage(im.img,pxX(b[0]),pxY(b[3]),pxX(b[2])-pxX(b[0]),pxY(b[1])-pxY(b[3]));ctx.getImageData(0,0,1,1);}
      catch{V.aerial=null;ctx.fillStyle='#d9d6cc';ctx.fillRect(0,0,DRAPE,DRAPE);}
    }
    const feats=Array.isArray(get('IMG')?.features)?get('IMG').features:[];
    for(const f of feats){
      if(f.kind==='parcel'||!['lot','row','alley','neighbourParcel'].includes(f.kind))continue;
      const rings=(Array.isArray(f.rings)?f.rings:[]).filter(okRing), lines=(Array.isArray(f.lines)?f.lines:[]).filter(l=>Array.isArray(l)&&l.length>1);
      ctx.strokeStyle=f.color||'#8a949c';ctx.lineWidth=f.kind==='lot'?5:3;ctx.setLineDash(f.dashed?[18,10]:[]);ctx.globalAlpha=.85;
      for(const r of rings){ctx.beginPath();ringPath(ctx,r);ctx.stroke();}
      for(const l of lines){ctx.beginPath();l.forEach((q,i)=>i?ctx.lineTo(pxX(q[0]),pxY(q[1])):ctx.moveTo(pxX(q[0]),pxY(q[1])));ctx.stroke();}
    }
    ctx.setLineDash([]);ctx.globalAlpha=1;
    if(state.heat&&V.heat&&V.heat.daylight>0){
      const F=D.frame, h=V.heat;
      ctx.globalAlpha=.78;
      h.pts.forEach((p,i)=>{if(!p.ground)return;const pu=p.x*F.u[0]+p.y*F.u[1],pv=p.x*F.v[0]+p.y*F.v[1];ctx.fillStyle=heatColor(h.hours[i]/h.daylight);ctx.beginPath();ringPath(ctx,[fromUV(pu-.5,pv-.5),fromUV(pu+.5,pv-.5),fromUV(pu+.5,pv+.5),fromUV(pu-.5,pv+.5)]);ctx.fill();});
      ctx.globalAlpha=1;
    }
    ctx.strokeStyle='#735bb5';ctx.lineWidth=7;ctx.beginPath();ringPath(ctx,D.lot);ctx.stroke();
    V.drapeTex.needsUpdate=true;V.dirty=true;
  }
  function loadAerial(){
    const imgs=Array.isArray(get('IMG')?.images)?get('IMG').images:[];
    const pick=imgs.find(i=>Array.isArray(i.bounds)&&i.file&&/aerial/i.test(i.file)&&!i.historical)||imgs.find(i=>Array.isArray(i.bounds)&&i.file);
    if(!pick)return;
    const img=new Image();
    img.onload=()=>{if(!V)return;V.aerial={img,bounds:pick.bounds.map(Number),meta:pick};drawDrape();renderImageryNote();};
    img.src=pick.file;
  }

  // ---------------------------------------------------------------- view HTML
  function notes(){
    const d=DATA.d, v=DATA.validation, li=d.lidar||{}, fp=d.footprints||{};
    const list=[
      `Ground: USGS 3DEP Cook County LiDAR${li.collectedDays?.[0]?`, flown ${esc(li.collectedDays[0])} (leaf-off)`:''}, bare earth on a ${d.spacing} m grid, ${esc(d.verticalDatum||'NAVD88 m')}, ${esc(d.crs||'EPSG:26916')}. Area shown ${fmt(DATA.x1-DATA.x0)} × ${fmt(DATA.y1-DATA.y0)} m; beyond it the sky is treated as open.`,
      `Neighbouring buildings: ${esc(fp.source||'building footprints')} outlines, extruded flat to the LiDAR roof top (a high percentile of roof returns). Pitched roofs therefore cast slightly more shadow than they really do, which errs on the cautious side for winter sun.`,
      `Trees: ${fmt(DATA.trees.length)} crowns detected from the same LiDAR, modelled as solid domes when “Trees block sun” is on (leaf-on summer). Bare winter branches let part of the sun through, so winter tree shade is overstated with it on and understated with it off.`,
      'Massing: an illustrative house and rear garage on Lot 25, not a design. Setbacks default to the unverified RT-4 screening numbers in HP-011; the lot outline is the county GIS parcel, not a survey.',
      `Sun hours: direct beam only, ray-marched every 10 minutes on a ${CELL} m surface of ground, buildings, trees and the massing. No sky light, reflections or glazing losses.`,
      v?`Sun model (NOAA equations, Central Standard Time UTC−6) checked against ${v.n} reference positions in the climate study: max error ${v.maxSep.toFixed(3)}°.`:'Sun model: NOAA solar-calculator equations, Central Standard Time (UTC−6).'
    ];
    (Array.isArray(d.notes)?d.notes:[]).forEach(n=>list.push(esc(n)));
    return list.map(n=>`<li>${n}</li>`).join('');
  }
  function neighbourRows(){
    if(!DATA.neighbours.length)return '<tr><td colspan="6">No neighbouring buildings in the data.</td></tr>';
    return DATA.neighbours.map(b=>`<tr><td>${esc(b.address||b.id)}<p>${esc(b.side)}${b.yearBuilt?` · built ${esc(b.yearBuilt)}`:''}</p></td><td>${b.heightM==null?'—':`${fmt(b.heightM,1)} m (${ft(b.heightM)})`}</td><td>${esc(b.stories??'—')}</td><td>${Number.isFinite(+b.widthM)?`${fmt(+b.widthM,1)} m (${ft(+b.widthM)})`:'—'}${Number.isFinite(+b.depthM)?` × ${fmt(+b.depthM,1)} m`:''}</td><td>${fmt(+b.distanceToLotM,1)} m (${ft(+b.distanceToLotM)})</td><td>${esc(b.heightSource||'')}</td></tr>`).join('');
  }
  function slider(id,label,min,max,step,val){return `<div class="v3d-row"><label for="hp3d-${id}">${label} <output id="hp3d-${id}-out"></output></label><input type="range" id="hp3d-${id}" data-hp3d-mass="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;}
  function hydeparkViewer3dView(){
    if(!get('D3'))return '';
    if(!DATA)prepareData();
    const m=state.mass, opt=(v,cur,l)=>`<option value="${v}" ${String(v)===String(cur)?'selected':''}>${l}</option>`;
    const presets=SUN_PRESETS.map(([l,mo,d])=>`<button type="button" class="v3d-chip" data-hp3d-date="${doyOf(mo,d)}" aria-pressed="${Math.round(state.doy)===doyOf(mo,d)}">${l}</button>`).join('');
    const cams=[['overview','Overview'],['south','From south'],['street','From Kimbark'],['plan','Plan'],['sun','Toward sun']].map(([id,l])=>`<button type="button" class="v3d-chip" data-hp3d-cam="${id}">${l}</button>`).join('');
    const chk=(id,on,label,sub)=>`<label class="v3d-check"><input type="checkbox" id="hp3d-${id}" ${on?'checked':''}><span>${label}${sub?`<small>${sub}</small>`:''}</span></label>`;
    return `<section class="panel v3d" id="hp3d-root" aria-labelledby="hp3d-title">
      <div class="section-header"><div><p class="research-eyebrow">Hydepark Home · Lot 25 sun, neighbours &amp; massing</p><h2 id="hp3d-title">Sun and shade model (3D)</h2></div><span class="badge">Exploratory</span></div>
      <p class="subtitle">Move the sun through the day and year and watch the neighbouring buildings and trees shade Lot 25. The illustrative house and car-lift garage show how much winter sun reaches the south wall, the side path and the garden on a 40 ft lot.</p>
      <div class="v3d-layout">
        <div class="v3d-stage">
          <div class="v3d-canvas-wrap" id="hp3d-wrap">
            <canvas id="hp3d-canvas" tabindex="0" role="img" aria-label="Interactive 3D model of Lot 25, its neighbouring buildings, trees and shadows. Drag to rotate, right-drag or two fingers to pan, scroll or pinch to zoom. With the model focused: arrow keys rotate, Shift plus arrows pan, plus and minus zoom."></canvas>
            <div class="hp3d-labels" id="hp3d-labels" aria-hidden="true"></div>
            <div class="v3d-hud" aria-hidden="true"><strong id="hp3d-hud-time"></strong><span id="hp3d-hud-sun"></span></div>
            <div class="v3d-compass" aria-hidden="true"><svg viewBox="-34 -34 68 68"><g id="hp3d-compass-rose"><circle r="22" class="v3d-compass-ring"/><path d="M0-18L5-3H-5Z" class="v3d-compass-n"/><path d="M0 18L5 3H-5Z" class="v3d-compass-s"/><text y="-25" text-anchor="middle" class="v3d-compass-label">N</text><g id="hp3d-compass-sun"><circle cy="-22" r="4" class="v3d-compass-sun"/></g></g></svg></div>
            <div class="v3d-scale" aria-hidden="true"><span class="v3d-scale-bar" id="hp3d-scale-bar"></span><span id="hp3d-scale-label"></span></div>
            <div class="v3d-fallback" id="hp3d-fallback" hidden><p>3D view unavailable: this browser could not start WebGL. The tables below still describe the model.</p></div>
          </div>
          <div class="v3d-cams" role="group" aria-label="Camera presets"><span>View</span>${cams}</div>
          <p class="v3d-hint">Drag to rotate · right-drag / two fingers to pan · scroll or pinch to zoom · focus the model for keyboard: arrows rotate, Shift+arrows pan, + / − zoom.</p>
          <div class="hp3d-legend" aria-hidden="true"><span>Sun-hours map, selected day</span><i></i><small>none</small><small>all daylight</small></div>
        </div>
        <div class="v3d-controls">
          <fieldset class="v3d-group"><legend>Sun</legend>
            <div class="v3d-row"><label for="hp3d-date">Date <output id="hp3d-date-out"></output></label><input type="range" id="hp3d-date" min="1" max="365" step="1" value="${Math.round(state.doy)}"></div>
            <div class="v3d-chips" role="group" aria-label="Season presets">${presets}</div>
            <div class="v3d-row"><label for="hp3d-time">Time <output id="hp3d-time-out"></output></label><input type="range" id="hp3d-time" min="0" max="1435" step="5" value="${state.minutes}"></div>
            <div class="v3d-inline"><label for="hp3d-clock">Clock</label><select id="hp3d-clock">${opt('standard',state.clock,'Standard time, CST (UTC−6)')}${opt('local',state.clock,'Local clock (CDT in summer)')}</select></div>
            <p class="v3d-tz" id="hp3d-tz"></p>
            <div class="v3d-chips"><button type="button" class="button secondary" id="hp3d-play-day" aria-pressed="false">▶ Play day</button><button type="button" class="button secondary" id="hp3d-play-year" aria-pressed="false">▶ Play year</button></div>
            <dl class="v3d-readout"><div><dt>Altitude</dt><dd id="hp3d-alt">–</dd></div><div><dt>Azimuth</dt><dd id="hp3d-az">–</dd></div><div><dt>Sunrise</dt><dd id="hp3d-rise">–</dd></div><div><dt>Sunset</dt><dd id="hp3d-set">–</dd></div><div><dt>Day length</dt><dd id="hp3d-daylen">–</dd></div><div><dt>Noon altitude</dt><dd id="hp3d-noon">–</dd></div></dl>
          </fieldset>
          <fieldset class="v3d-group"><legend>Illustrative massing</legend>
            ${chk('mass',state.showMass,'House and rear garage','Boxes for testing sun, not a design')}
            ${slider('front','Front setback',5,40,1,m.front)}${slider('depth','House depth',30,110,1,m.depth)}${slider('height','House height',12,45,1,m.height)}
            ${slider('south','South side setback',0,12,.5,m.south)}${slider('north','North side setback',0,12,.5,m.north)}
            ${chk('garage',m.garage,'Rear garage for car lifts','Lifts need roughly 12–14 ft clear inside')}
            ${slider('garageDepth','Garage depth',18,40,1,m.garageDepth)}${slider('garageHeight','Garage height',10,24,1,m.garageHeight)}
            <ul class="hp3d-checks" id="hp3d-checks"></ul>
            <button type="button" class="button secondary" id="hp3d-reset">Reset massing</button>
          </fieldset>
          <fieldset class="v3d-group"><legend>Direct sun hours</legend>
            <div class="research-table hp3d-sun-table"><table><thead><tr><th>Where</th>${KEY_DATES.map(([l])=>`<th>${l}</th>`).join('')}<th id="hp3d-sel-head">Selected</th></tr></thead><tbody id="hp3d-sun-body"></tbody></table></div>
            <p class="v3d-note" id="hp3d-walk"></p>
          </fieldset>
          <fieldset class="v3d-group"><legend>Display</legend>
            ${chk('trees',state.trees,'Trees block sun','Solid crowns (leaf-on); off approximates bare winter branches')}
            ${chk('heat',state.heat,'Sun-hours map on the lot','For the selected date')}
            ${chk('labels',state.labels,'Neighbour height labels','')}
            ${chk('imagery',state.imagery,'Aerial imagery on the ground','<span id="hp3d-img-note"></span>')}
            ${DATA.demolished.length?chk('ghosts',state.ghosts,'Houses demolished in 2022','Outlines from the LiDAR, for reference'):''}
            ${chk('sunpath',state.sunPath,'Sun paths','Bold: selected date · orange: Jun 21 · blue: Dec 21')}
          </fieldset>
        </div>
      </div>
      <h3>Neighbouring buildings</h3>
      <div class="research-table"><table><thead><tr><th>Building</th><th>Height</th><th>Storeys</th><th>Frontage × depth</th><th>Clear distance to Lot 25</th><th>Height source</th></tr></thead><tbody>${neighbourRows()}</tbody></table></div>
      <p class="sr-only" id="hp3d-live" role="status" aria-live="polite"></p>
      <details class="v3d-notes"><summary>What this model can and cannot tell you</summary><ul>${notes()}</ul></details>
    </section>`;
  }

  // ---------------------------------------------------------------- scene
  const W=(x,y,z)=>new THREE.Vector3(x,z-DATA.base,-y);
  function extrude(ring,bottom,top,mat){
    const shape=new THREE.Shape(ring.slice(0,ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?-1:undefined).map(p=>new THREE.Vector2(p[0],p[1])));
    const g=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.1,top-bottom),bevelEnabled:false});g.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(g,mat);mesh.position.y=bottom-DATA.base;return mesh;
  }
  function buildScene(canvas){
    const D=DATA, coarse=matchMedia('(pointer: coarse)').matches, dpr=window.devicePixelRatio||1;
    const renderer=new THREE.WebGLRenderer({canvas,antialias:!(coarse&&dpr>=2),powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(dpr,coarse?1.5:2));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=coarse?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
    const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(40,1,.5,4000);

    const {cols,rows}=D, n=cols*rows, pos=new Float32Array(n*3), uv=new Float32Array(n*2);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const i=r*cols+c,x=D.x0+c+.5,y=D.y1-r-.5;pos[i*3]=x;pos[i*3+1]=D.ground[i]-D.base;pos[i*3+2]=-y;uv[i*2]=(c+.5)/cols;uv[i*2+1]=1-(r+.5)/rows;}
    const idx=new Uint32Array((cols-1)*(rows-1)*6);let k=0;
    for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c,b=a+1,d=a+cols,e=d+1;idx[k++]=a;idx[k++]=d;idx[k++]=b;idx[k++]=b;idx[k++]=d;idx[k++]=e;}
    const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(pos,3));tg.setAttribute('uv',new THREE.BufferAttribute(uv,2));tg.setIndex(new THREE.BufferAttribute(idx,1));tg.computeVertexNormals();
    const drapeCanvas=document.createElement('canvas');drapeCanvas.width=drapeCanvas.height=DRAPE;
    const drapeTex=new THREE.CanvasTexture(drapeCanvas);drapeTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const ground=new THREE.Mesh(tg,new THREE.MeshLambertMaterial({map:drapeTex}));ground.receiveShadow=true;scene.add(ground);

    const bMat=new THREE.MeshLambertMaterial({color:0xcfc8bb}), eMat=new THREE.LineBasicMaterial({color:0x5c6670,transparent:true,opacity:.55});
    const bGroup=new THREE.Group();
    for(const b of D.buildings){const g=b.groundZ??groundAt(...b.c),m=extrude(b.ring,g-.3,b.roofZ,bMat);m.castShadow=m.receiveShadow=true;m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry,30),eMat));bGroup.add(m);}
    scene.add(bGroup);
    const ghosts=new THREE.Group(), gMat=new THREE.LineBasicMaterial({color:0xd06a2c});
    for(const b of D.demolished){const g=Number.isFinite(+b.groundZ)?+b.groundZ:groundAt(...centroid(b.ring)),top=Number.isFinite(+b.roofZ)?+b.roofZ:g+(+b.heightM||6);const m=extrude(b.ring,g,top,bMat);ghosts.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),gMat).translateY(m.position.y));m.geometry.dispose();}
    scene.add(ghosts);

    const nT=Math.max(1,D.trees.length);
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshLambertMaterial({color:0x5f8a55}),nT);
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.26,1,6),new THREE.MeshLambertMaterial({color:0x6b5a48}),nT);
    crowns.castShadow=trunks.castShadow=true;crowns.receiveShadow=true;
    const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), p=new THREE.Vector3();
    D.trees.forEach((t,i)=>{const gz=Number.isFinite(+t.groundZ)?+t.groundZ:groundAt(t.x,t.y),r=Math.max(1,+t.r||1),a=clamp(t.h*.3,1.2,6);
      p.set(t.x,gz-D.base+t.h-a,-t.y);s.set(r,a,r);mtx.compose(p,q,s);crowns.setMatrixAt(i,mtx);
      const th=Math.max(.5,t.h-a*1.4);p.set(t.x,gz-D.base+th/2,-t.y);s.set(1,th,1);mtx.compose(p,q,s);trunks.setMatrixAt(i,mtx);});
    if(!D.trees.length){crowns.count=0;trunks.count=0;}
    scene.add(crowns,trunks);

    const massMat=new THREE.MeshLambertMaterial({color:0xf4f0e6}), garMat=new THREE.MeshLambertMaterial({color:0xdde3ea});
    const mkBox=mat=>{const g=new THREE.BoxGeometry(1,1,1);g.translate(0,.5,0);const m=new THREE.Mesh(g,mat);m.castShadow=m.receiveShadow=true;m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x3d4a55})));scene.add(m);return m;};
    const house=mkBox(massMat), garage=mkBox(garMat);

    const mkLine=(color,opacity)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(150*3),3));g.setDrawRange(0,0);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));l.frustumCulled=false;scene.add(l);return l;};
    const paths={sel:mkLine(0x8a5a00,1),jun:mkLine(0xe0893a,.75),dec:mkLine(0x4f7fb8,.75)};
    const sunBall=new THREE.Mesh(new THREE.SphereGeometry(3.5,16,12),new THREE.MeshBasicMaterial({color:0xffc533}));scene.add(sunBall);

    const hemi=new THREE.HemisphereLight(0xe6eef6,0x8c7f68,.5);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff4e0,1);
    const big=!coarse&&renderer.capabilities.maxTextureSize>=8192;
    sun.castShadow=true;sun.shadow.mapSize.set(big?4096:2048,big?4096:2048);sun.shadow.bias=-0.0003;sun.shadow.normalBias=.08;
    scene.add(sun,sun.target);
    return {renderer,scene,camera,ground,bGroup,ghosts,crowns,trunks,house,garage,paths,sunBall,hemi,sun,drapeCanvas,drapeCtx:drapeCanvas.getContext('2d'),drapeTex};
  }

  function placeMassing(){
    const F=DATA.frame;
    for(const id of ['house','garage']){
      const mesh=V[id], b=V.boxes.find(x=>x.id===id);
      mesh.visible=!!b;if(!b)continue;
      const bottom=b.ground-.3-DATA.base;
      mesh.position.set(b.c[0],bottom,-b.c[1]);mesh.scale.set(b.u1-b.u0,b.top-DATA.base-bottom,b.v1-b.v0);mesh.rotation.y=F.angle;
    }
  }
  function sunDir(alt,az){const a=alt*RAD,z=az*RAD;return new THREE.Vector3(Math.sin(z)*Math.cos(a),Math.sin(a),-Math.cos(z)*Math.cos(a));}
  const lotCentre=()=>{const c=centroid(DATA.lot);return W(c[0],c[1],DATA.lotGround);};
  function updatePaths(){
    const c=lotCentre(), R=SUN_R;
    const fill=(line,doy)=>{const arr=line.geometry.attributes.position.array;let n=0;
      for(let m=0;m<=1440&&n<150;m+=10){const s=sunAt(doy,m);if(s.altitude<0)continue;const d=sunDir(s.altitude,s.azimuth).multiplyScalar(R).add(c);arr[n*3]=d.x;arr[n*3+1]=d.y;arr[n*3+2]=d.z;n++;}
      line.geometry.setDrawRange(0,n);line.geometry.attributes.position.needsUpdate=true;line.visible=state.sunPath;};
    fill(V.paths.sel,state.doy);fill(V.paths.jun,doyOf(6,21));fill(V.paths.dec,doyOf(12,21));
  }
  function fitShadowCamera(){
    const D=DATA, cam=V.sun.shadow.camera, inv=new THREE.Matrix4(), v=new THREE.Vector3();
    cam.position.copy(V.sun.position);cam.lookAt(V.sun.target.position);cam.updateMatrixWorld(true);inv.copy(cam.matrixWorld).invert();
    const top=Math.max(V.S.top,D.gmax+15)-D.base+2;
    let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];
    for(const x of [D.x0,D.x1])for(const y of [0,top])for(const z of [-D.y0,-D.y1]){v.set(x,y,z).applyMatrix4(inv);a=[Math.min(a[0],v.x),Math.min(a[1],v.y),Math.min(a[2],v.z)];b=[Math.max(b[0],v.x),Math.max(b[1],v.y),Math.max(b[2],v.z)];}
    cam.left=a[0];cam.right=b[0];cam.bottom=a[1];cam.top=b[1];cam.near=Math.max(.5,-b[2]-5);cam.far=-a[2]+5;cam.updateProjectionMatrix();
  }
  function updateSun(dateChanged){
    if(!V)return;
    const s=sunAt(state.doy,state.minutes);V.sunPos=s;
    const target=lotCentre();V.sun.target.position.copy(target);V.sun.target.updateMatrixWorld();
    V.sun.position.copy(sunDir(Math.max(s.altitude,-5),s.azimuth)).multiplyScalar(600).add(target);
    V.sun.visible=s.altitude>-0.5;V.sun.intensity=.95*smooth(-1.5,4,s.altitude);
    V.sun.color.setRGB(1,.72+.26*smooth(0,25,s.altitude),.5+.42*smooth(0,30,s.altitude));
    V.hemi.intensity=.25+.27*smooth(-10,-1,s.altitude)+.1*smooth(-1,15,s.altitude);
    const bg=new THREE.Color(0x23303c).lerp(new THREE.Color(0xe8c9aa),smooth(-8,0,s.altitude)).lerp(new THREE.Color(0xdbe7f0),smooth(2,18,s.altitude));
    V.scene.background=bg;V.el.wrap.classList.toggle('is-night',s.altitude<-4);
    if(V.sun.visible)fitShadowCamera();
    V.sunBall.visible=s.altitude>-3;V.sunBall.position.copy(sunDir(s.altitude,s.azimuth).multiplyScalar(SUN_R).add(target));
    if(dateChanged){V.riseSet=riseSet(state.doy);updatePaths();}
    renderSunReadout();V.dirty=true;
  }

  // ---------------------------------------------------------------- readouts
  const clockFor=(stdMin,doy)=>state.clock==='local'&&isDst(doy)?`${hm(stdMin+60)} CDT`:`${hm(stdMin)} CST`;
  function renderSunReadout(){
    const el=V.el, s=V.sunPos, rs=V.riseSet||riseSet(state.doy), doy=Math.round(state.doy), dst=isDst(doy);
    const shown=state.clock==='local'&&dst?state.minutes+60:state.minutes;
    el.dateOut.textContent=dateLabel(doy);el.timeOut.textContent=clockFor(state.minutes,doy);
    el.time.value=String(((Math.round(shown/5)*5)%1440+1440)%1440);el.time.setAttribute('aria-valuetext',clockFor(state.minutes,doy));
    el.date.value=String(doy);el.date.setAttribute('aria-valuetext',dateLabel(doy));
    el.tz.textContent=dst?(state.clock==='standard'?`Daylight saving is in force on ${dateLabel(doy)}: wall clocks read ${hm(state.minutes+60)} CDT (UTC−5). Times here are standard time.`:`Wall-clock time, CDT (UTC−5). Standard time is ${hm(state.minutes)} CST.`):`Standard time (CST, UTC−6) is in force on ${dateLabel(doy)}.`;
    el.alt.textContent=`${s.altitude.toFixed(1)}°${s.altitude<0?' (below horizon)':''}`;
    el.az.textContent=`${s.azimuth.toFixed(1)}° ${compass(s.azimuth)}`;
    el.rise.textContent=rs.rise==null?'–':clockFor(rs.rise,doy);el.set.textContent=rs.set==null?'–':clockFor(rs.set,doy);
    el.daylen.textContent=rs.rise==null||rs.set==null?'–':`${Math.floor((rs.set-rs.rise)/60)} h ${pad(Math.round((rs.set-rs.rise)%60))} min`;
    el.noon.textContent=`${rs.maxAlt.toFixed(1)}° at ${clockFor(rs.noon,doy)}`;
    el.hudTime.textContent=`${dateLabel(doy)} · ${clockFor(state.minutes,doy)}`;
    el.hudSun.textContent=s.altitude>0?`Sun ${s.altitude.toFixed(1)}° high, ${s.azimuth.toFixed(0)}° ${compass(s.azimuth)}`:'Sun below the horizon';
    V.root.querySelectorAll('[data-hp3d-date]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.hp3dDate===doy)));
    clearTimeout(V.liveTimer);V.liveTimer=setTimeout(()=>{if(V)el.live.textContent=`${dateLabel(doy)}, ${clockFor(state.minutes,doy)}: sun ${s.altitude.toFixed(0)} degrees high at azimuth ${s.azimuth.toFixed(0)}.`;},600);
  }
  function renderStats(){
    const el=V.el, ks=V.keyStats, sel=V.selStats;if(!ks||!sel)return;
    const cell=(st,z)=>st.zones[z]==null?'<td>—</td>':`<td>${st.zones[z].toFixed(1)} h</td>`;
    el.selHead.textContent=sel.label;
    el.sunBody.innerHTML=ZONES.filter(([z])=>sel.zones[z]!=null||ks.some(k=>k.zones[z]!=null)).map(([z,l])=>`<tr><td>${l}</td>${ks.map(k=>cell(k,z)).join('')}${cell(sel,z)}</tr>`).join('')+`<tr class="hp3d-daylight"><td>Daylight</td>${ks.map(k=>`<td>${k.daylight.toFixed(1)} h</td>`).join('')}<td>${sel.daylight.toFixed(1)} h</td></tr>`;
    const house=V.boxes.find(b=>b.id==='house'), main=side=>DATA.neighbours.find(b=>b.side===side&&b.stories), sN=main('south'), nN=main('north');
    if(house&&state.showMass){
      const s=state.mass.south*FT, nn=state.mass.north*FT, dec=ks[0].zones.south;
      el.walk.innerHTML=`<strong>Walking space.</strong> South side: ${ft(s)} to the lot line${sN?`, ${ft(s+ +sN.distanceToLotM)} to the ${esc(sN.address||'south neighbour')} wall (${ft(+sN.heightM)} tall)`:''}${dec!=null?`; ${dec.toFixed(1)} h of sun there on Dec 21`:''}. North side: ${ft(nn)} to the lot line${nN?`, ${ft(nn+ +nN.distanceToLotM)} to the ${esc(nN.address)} wall across the alley`:''}.`;
    }else el.walk.textContent='Show the massing to read side-path widths.';
  }
  function renderChecks(){
    const el=V.el, m=state.mass, F=DATA.frame, depth=(F.u1-F.u0)/FT, width=(F.v1-F.v0)/FT, house=V.boxes.find(b=>b.id==='house'), garage=V.boxes.find(b=>b.id==='garage');
    for(const k of ['front','depth','height','south','north','garageDepth','garageHeight']){const o=el.root.querySelector(`#hp3d-${k}-out`);if(o)o.textContent=`${fmt(m[k],k==='south'||k==='north'?1:0)} ft`;}
    if(!house){el.checks.innerHTML='<li>Massing hidden or does not fit the lot.</li>';return;}
    const rear=(house.u0-F.u0)/FT, fp=(house.u1-house.u0)*(house.v1-house.v0)/(FT*FT), sides=m.south+m.north;
    const row=(ok,t)=>`<li class="${ok?'':'hp3d-warn'}">${ok?'✓':'!'} ${t}</li>`;
    el.checks.innerHTML=[
      `<li>Lot about ${fmt(width)} × ${fmt(depth)} ft (county GIS). House ${fmt((house.v1-house.v0)/FT)} × ${fmt(m.depth)} ft, footprint ${fmt(fp)} sq ft${garage?`; garage ${fmt((garage.v1-garage.v0)/FT)} × ${fmt((garage.u1-garage.u0)/FT)} ft`:''}.`,
      row(m.height<=38,`Height ${m.height} ft against the 38 ft screening limit`),
      row(m.front>=15,`Front setback ${m.front} ft against 15 ft (or the neighbours' average)`),
      row(sides>=width*.2-.05,`Side setbacks ${fmt(sides,1)} ft combined against 20% of width (${fmt(width*.2,1)} ft); none needed on the north alley side`),
      row(rear>=depth*.3,`Rear of house ${fmt(rear)} ft from the alley line against 30% of depth (${fmt(depth*.3)} ft) for buildings other than detached houses`),
      '<li class="v3d-note">Screening only (HP-011, unverified). The garage sits in the rear yard as an accessory building.</li>'
    ].join('');
  }
  function renderImageryNote(){
    const n=V.el.root.querySelector('#hp3d-img-note');if(!n)return;
    const m=V.aerial?.meta;n.textContent=m?`${m.title||m.source||'Orthoimagery'}${m.date||m.year?` · ${m.date||m.year}`:''}`:(get('IMG')?'Unavailable when opened from a file':'Imagery data not loaded');
  }

  // ---------------------------------------------------------------- labels
  function buildLabels(){
    const box=V.el.labels;box.innerHTML='';V.labels=[];
    const named=DATA.neighbours.filter(b=>b.heightM!=null&&b.stories&&b.distanceToLotM<30), sides=new Set();
    for(const b of named.filter(b=>{const first=!sides.has(b.side);sides.add(b.side);return first||b.heightM>10;})){
      const div=document.createElement('div');div.className='hp3d-label';div.textContent=`${b.address?b.address.replace(/\s+(S\.?|South)\s+/i,' S '):b.id} · ${ft(b.heightM)}`;box.appendChild(div);
      V.labels.push({div,pos:W(b.c[0],b.c[1],b.roofZ+1.5)});
    }
    box.hidden=!state.labels;
  }
  function updateLabels(){
    if(!state.labels||!V.labels)return;
    const w=V.el.canvas.clientWidth,h=V.el.canvas.clientHeight,v=new THREE.Vector3();
    for(const L of V.labels){v.copy(L.pos).project(V.camera);const on=v.z<1&&Math.abs(v.x)<1.05&&Math.abs(v.y)<1.05;L.div.style.display=on?'':'none';if(on)L.div.style.transform=`translate(${((v.x+1)/2*w).toFixed(0)}px,${((1-v.y)/2*h).toFixed(0)}px) translate(-50%,-100%)`;}
  }

  // ---------------------------------------------------------------- camera, loop, events
  function setCamera(preset){
    const t=lotCentre();let p;
    if(preset==='south')p=t.clone().add(new THREE.Vector3(0,62,72));
    else if(preset==='plan')p=t.clone().add(new THREE.Vector3(0,120,.01));
    else if(preset==='street'){const F=DATA.frame,[x,y]=fromUV(F.u1+14,(F.v0+F.v1)/2);p=W(x,y,groundAt(x,y)+1.7);t.y+=3;}
    else if(preset==='sun'){const s=V.sunPos,az=s&&s.altitude>0?s.azimuth:180,alt=s&&s.altitude>0?s.altitude:10;p=t.clone().add(sunDir(alt,az).multiplyScalar(110));}
    else p=t.clone().add(new THREE.Vector3(70,75,85));
    V.controls.target.copy(t);V.camera.position.copy(p);V.controls.update();V.dirty=true;
  }
  function keyNav(ev){
    const k=ev.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','_'].includes(k))return;
    ev.preventDefault();
    const c=V.controls, off=V.camera.position.clone().sub(c.target);
    if(['+','=','-','_'].includes(k)){off.multiplyScalar(k==='+'||k==='='?.84:1.19);off.setLength(clamp(off.length(),c.minDistance,c.maxDistance));}
    else if(ev.shiftKey){
      const fwd=new THREE.Vector3(-off.x,0,-off.z).normalize(), right=new THREE.Vector3(-fwd.z,0,fwd.x), step=off.length()*.06, mv=new THREE.Vector3();
      if(k==='ArrowUp')mv.add(fwd.multiplyScalar(step));if(k==='ArrowDown')mv.add(fwd.multiplyScalar(-step));if(k==='ArrowRight')mv.add(right.multiplyScalar(step));if(k==='ArrowLeft')mv.add(right.multiplyScalar(-step));
      c.target.add(mv);V.camera.position.add(mv);c.update();V.dirty=true;return;
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
    const h=V.el.canvas.clientHeight||1, mpp=2*c.position.distanceTo(t)*Math.tan(c.fov*RAD/2)/h, target=110*mpp, pow=10**Math.floor(Math.log10(target));
    const nice=[1,2,5,10].map(m=>m*pow).reduce((a,b)=>Math.abs(b-target)<Math.abs(a-target)?b:a);
    V.el.scaleBar.style.width=`${Math.round(nice/mpp)}px`;V.el.scaleLabel.textContent=`${nice} m (${fmt(nice/FT)} ft) at view centre`;
    updateLabels();
  }
  const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setAnim(mode){
    V.anim=V.anim&&V.anim.mode===mode?null:mode?{mode,last:performance.now(),acc:0}:null;
    if(!V.anim){state.doy=Math.round(state.doy);scheduleAnalyse(false);}
    for(const [id,m] of [['playDay','day'],['playYear','year']]){const on=V.anim?.mode===m;V.el[id].setAttribute('aria-pressed',String(on));V.el[id].textContent=`${on?'❚❚ Pause':'▶ Play'} ${m}`;}
  }
  function stepAnim(now){
    const a=V.anim, dt=Math.min(.1,(now-a.last)/1000);a.last=now;let step;
    if(reduceMotion()){a.acc+=dt;if(a.acc<.7)return;a.acc=0;step=a.mode==='day'?15:4;}else step=a.mode==='day'?dt*90:dt*18;
    if(a.mode==='day'){state.minutes=((state.minutes+step)%1440+1440)%1440;updateSun(false);}
    else{state.doy=((state.doy-1+step)%365+365)%365+1;updateSun(true);}
  }
  function loop(now){
    if(!V)return;
    if(!V.el.canvas.isConnected){disposeHydeparkViewer3d();return;}
    V.raf=requestAnimationFrame(loop);
    if(V.anim)stepAnim(now);
    if(V.controls.update())V.dirty=true;
    if(V.dirty){V.dirty=false;V.renderer.render(V.scene,V.camera);updateHud();}
  }
  function resize(){if(!V)return;const w=V.el.canvas.clientWidth,h=V.el.canvas.clientHeight;if(!w||!h)return;V.renderer.setSize(w,h,false);V.camera.aspect=w/h;V.camera.updateProjectionMatrix();V.dirty=true;}
  function refreshMassing(){composeSurface();placeMassing();renderChecks();updateSun(false);scheduleAnalyse(true);}

  function onInput(ev){
    const t=ev.target, id=t.id;
    if(id==='hp3d-date'){state.doy=+t.value;updateSun(true);scheduleAnalyse(false);}
    else if(id==='hp3d-time'){const v=+t.value;state.minutes=state.clock==='local'&&isDst(state.doy)?(v-60+1440)%1440:v;updateSun(false);}
    else if(t.dataset.hp3dMass){state.mass[t.dataset.hp3dMass]=+t.value;refreshMassing();}
  }
  function onChange(ev){
    const t=ev.target, id=t.id;
    if(id==='hp3d-clock'){state.clock=t.value;updateSun(false);}
    else if(id==='hp3d-mass'){state.showMass=t.checked;refreshMassing();}
    else if(id==='hp3d-garage'){state.mass.garage=t.checked;refreshMassing();}
    else if(id==='hp3d-trees'){state.trees=t.checked;composeSurface();scheduleAnalyse(true);}
    else if(id==='hp3d-heat'){state.heat=t.checked;drawDrape();}
    else if(id==='hp3d-labels'){state.labels=t.checked;V.el.labels.hidden=!t.checked;V.dirty=true;}
    else if(id==='hp3d-imagery'){state.imagery=t.checked;drawDrape();}
    else if(id==='hp3d-ghosts'){state.ghosts=t.checked;V.ghosts.visible=t.checked;V.dirty=true;}
    else if(id==='hp3d-sunpath'){state.sunPath=t.checked;updatePaths();V.dirty=true;}
  }
  function onClick(ev){
    const b=ev.target.closest('button');if(!b||!V)return;
    if(b.dataset.hp3dDate){state.doy=+b.dataset.hp3dDate;updateSun(true);scheduleAnalyse(false);}
    else if(b.dataset.hp3dCam)setCamera(b.dataset.hp3dCam);
    else if(b.id==='hp3d-play-day')setAnim('day');
    else if(b.id==='hp3d-play-year')setAnim('year');
    else if(b.id==='hp3d-reset'){state.mass={...MASS};for(const k in MASS){const inp=V.root.querySelector(`#hp3d-${k}`);if(!inp)continue;if(inp.type==='checkbox')inp.checked=MASS[k];else inp.value=MASS[k];}refreshMassing();}
  }

  // ---------------------------------------------------------------- lifecycle
  function initHydeparkViewer3d(){
    const root=document.getElementById('hp3d-root');if(!root)return;
    if(V){if(V.root===root)return;disposeHydeparkViewer3d();}
    const q=id=>root.querySelector('#hp3d-'+id), canvas=q('canvas');
    const fail=msg=>{const f=q('fallback');f.hidden=false;if(msg)f.querySelector('p').textContent=msg;canvas.hidden=true;};
    if(typeof THREE==='undefined'||typeof THREE.OrbitControls!=='function'||typeof window.siteSolarPosition!=='function'){fail('3D view unavailable: three.js or the shared sun model did not load.');return;}
    if(!DATA)prepareData();
    let parts;
    try{parts=buildScene(canvas);}catch(err){console.warn('[hydepark-viewer3d] WebGL init failed',err);fail();return;}
    V={root,...parts,dirty:true,anim:null,raf:0,boxes:[],
      el:{root,canvas,wrap:q('wrap'),labels:q('labels'),date:q('date'),dateOut:q('date-out'),time:q('time'),timeOut:q('time-out'),tz:q('tz'),alt:q('alt'),az:q('az'),rise:q('rise'),set:q('set'),daylen:q('daylen'),noon:q('noon'),
        hudTime:q('hud-time'),hudSun:q('hud-sun'),rose:q('compass-rose'),compassSun:q('compass-sun'),scaleBar:q('scale-bar'),scaleLabel:q('scale-label'),
        playDay:q('play-day'),playYear:q('play-year'),checks:q('checks'),sunBody:q('sun-body'),selHead:q('sel-head'),walk:q('walk'),live:q('live')}};
    V.S=buildStatic();
    const controls=new THREE.OrbitControls(V.camera,canvas);
    controls.enableDamping=true;controls.dampingFactor=.12;controls.screenSpacePanning=false;controls.maxPolarAngle=89*RAD;controls.minDistance=4;controls.maxDistance=900;
    controls.addEventListener('change',()=>{if(V)V.dirty=true;});V.controls=controls;
    canvas.addEventListener('keydown',keyNav);
    root.addEventListener('input',onInput);root.addEventListener('change',onChange);root.addEventListener('click',onClick);
    V.resizeObs=new ResizeObserver(resize);V.resizeObs.observe(canvas);resize();
    V.ghosts.visible=state.ghosts;
    composeSurface();placeMassing();renderChecks();buildLabels();drawDrape();loadAerial();renderImageryNote();
    V.riseSet=riseSet(state.doy);updateSun(true);
    if(state.camera){V.camera.position.fromArray(state.camera.p);controls.target.fromArray(state.camera.t);controls.update();}else setCamera('overview');
    analyse(true);
    V.raf=requestAnimationFrame(loop);
  }
  function disposeHydeparkViewer3d(){
    if(!V)return;
    const v=V;V=null;
    cancelAnimationFrame(v.raf);clearTimeout(analyseTimer);clearTimeout(v.liveTimer);
    if(v.controls){state.camera={p:v.camera.position.toArray(),t:v.controls.target.toArray()};v.controls.dispose();}
    state.doy=Math.round(state.doy);
    v.resizeObs?.disconnect();v.el.canvas.removeEventListener('keydown',keyNav);
    v.root.removeEventListener('input',onInput);v.root.removeEventListener('change',onChange);v.root.removeEventListener('click',onClick);
    v.scene.traverse(o=>{o.geometry?.dispose();const m=o.material;(Array.isArray(m)?m:m?[m]:[]).forEach(x=>{x.map?.dispose();x.dispose();});o.dispose?.();});
    v.drapeTex.dispose();v.sun.shadow.map?.dispose();v.renderer.dispose();v.renderer.forceContextLoss?.();
  }

  window.hydeparkViewer3dView=hydeparkViewer3dView;
  window.initHydeparkViewer3d=initHydeparkViewer3d;
  window.disposeHydeparkViewer3d=disposeHydeparkViewer3d;
})();
