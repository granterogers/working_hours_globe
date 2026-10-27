// Working hours globe. Loads its map data, then runs the app.
fetch('data/globe-data.json').then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(start,err=>{
  const el=document.getElementById('loading');el.classList.add('fail');
  el.textContent='The map data could not be loaded ('+err.message+'). If you opened index.html straight from your disk, run a local web server instead (see README).';});

function start(D){
document.getElementById('loading').remove();
const TZHIT={type:'FeatureCollection',features:D.tzM.features.map(f=>({type:'Feature',properties:f.properties,geometry:JSON.parse(JSON.stringify(f.geometry))}))};
const BANDS=[
  {lo:5,hi:8,name:"Early bird",sub:"starts 05:00–08:00",dark:"#b7a3f3",light:"#8c72e0"},
  {lo:8,hi:11,name:"Classic day",sub:"starts 08:00–11:00",dark:"#f7d774",light:"#e6b92e"},
  {lo:11,hi:14,name:"Late start",sub:"starts 11:00–14:00",dark:"#f4a844",light:"#e9922a"},
  {lo:14,hi:17,name:"Afternoon into evening",sub:"starts 14:00–17:00",dark:"#ee7a5a",light:"#e0623f"},
  {lo:17,hi:21,name:"Evening into night",sub:"starts 17:00–21:00",dark:"#d8578f",light:"#c63e78"},
  {lo:21,hi:29,name:"Overnight",sub:"starts 21:00–05:00",dark:"#5a6bdc",light:"#4656c8"}];
const DEG=180/Math.PI, MINK=0.85, MAXK=9000;
let S=12,E=20,season=0,W=0,H=0,dpr=1,base=300,cx=0,cy=0;
let showHours=(()=>{try{return localStorage.getItem('whg.hours')!=='off'}catch(e){return true}})();
let rot=[-8,-36,0],k=0.7,kT=1,vel=[0,0],anchor=null,dragging=false,running=false,fly=null,overlays=[],placed=[],dark=true,pal={};
try{if(new Date().toLocaleString('en-GB',{timeZone:'Europe/London',timeZoneName:'short'}).includes('BST'))season=1}catch(e){}

// geometry prep: d3 wants clockwise outer rings; add a bounding cap to each feature for fast culling
function fixGeom(g){if(!g)return;const ps=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  ps.forEach(p=>{if(d3.geoArea({type:'Polygon',coordinates:p})>2*Math.PI)p.forEach(r=>r.reverse())});}
function cap(f){let x0=180,y0=90,x1=-180,y1=-90;const walk=c=>{if(typeof c[0]==='number'){if(c[0]<x0)x0=c[0];if(c[0]>x1)x1=c[0];if(c[1]<y0)y0=c[1];if(c[1]>y1)y1=c[1]}else c.forEach(walk)};
  walk(f.geometry.coordinates);const ctr=[(x0+x1)/2,(y0+y1)/2];
  const r=Math.max(d3.geoDistance(ctr,[x0,y0]),d3.geoDistance(ctr,[x1,y1]),d3.geoDistance(ctr,[x0,y1]),d3.geoDistance(ctr,[x1,y0]),d3.geoDistance(ctr,[ctr[0],y0]),d3.geoDistance(ctr,[ctr[0],y1]));
  f.cap=1;f.v=vec(ctr[0],ctr[1]);f.cr=r;f.ccr=Math.cos(r);f.scr=Math.sin(r);}
function vec(lon,lat){const L=lon*Math.PI/180,B=lat*Math.PI/180,c=Math.cos(B);return[c*Math.cos(L),c*Math.sin(L),Math.sin(B)]}
const RAD=Math.PI/180;
function pack(f){const g=f.geometry;const ps=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:g.type==='MultiLineString'?[g.coordinates]:[];f.rings=[];
  ps.forEach(p=>p.forEach(r=>{const a=new Float32Array(r.length*3);for(let i=0;i<r.length;i++){const L=r[i][0]*RAD,B=r[i][1]*RAD,cb=Math.cos(B);a[i*3]=cb*Math.cos(L);a[i*3+1]=cb*Math.sin(L);a[i*3+2]=Math.sin(B)}f.rings.push(a)}));}
function prep(fc){fc.features.forEach(f=>{if(f.geometry){cap(f);pack(f);delete f.geometry.coordinates;f.geometry=1}});return fc}
TZHIT.features.forEach(f=>fixGeom(f.geometry));['tz','tzL','tzM','cb','cbL','cbM','gaps'].forEach(n=>prep(D[n]));
const csize=c=>{const b=c[5];let w=b[2]-b[0];if(w>300)w=160;return Math.max(w,b[3]-b[1])};
const cByIso={};D.countries.forEach(c=>{c.size=csize(c);c.np=0;cByIso[c[4]]=c});
D.prov.forEach(p=>{const c=cByIso[p[4]];if(c)c.np++;p.v=vec(p[1],p[2])});D.countries.forEach(c=>c.v=vec(c[1],c[2]));

const cv=document.getElementById('c'),ctx=cv.getContext('2d'),sc=document.getElementById('stars');
const proj=d3.geoOrthographic().clipAngle(90).precision(0.35),path=d3.geoPath(proj,ctx),grat=d3.geoGraticule10();

function theme(){dark=!matchMedia('(prefers-color-scheme: light)').matches;
  if(document.documentElement.dataset.theme)dark=document.documentElement.dataset.theme==='dark';
  pal=dark?{oceanIn:'#163a68',oceanOut:'#071630',glow:'rgba(110,170,255,',grat:'rgba(170,200,255,.07)',border:'rgba(8,14,30,.55)',pb:'rgba(8,14,30,.28)',
            land:'#2b3854',ink:'#f6f7fb',ink2:'rgba(226,232,246,.82)',halo:'rgba(5,10,24,.82)',shadeLite:'rgba(255,255,255,.10)',shadeDark:'rgba(0,4,16,.55)',coast1:'rgba(120,190,255,.07)',coast2:'rgba(140,200,255,.14)',pbTile:'rgba(40,30,80,.45)',borderTile:'rgba(30,20,70,.75)'}
          :{oceanIn:'#d4e6f8',oceanOut:'#9dbfe2',glow:'rgba(120,170,235,',grat:'rgba(30,70,130,.08)',border:'rgba(255,255,255,.85)',pb:'rgba(255,255,255,.55)',
            land:'#e9e3d6',ink:'#111a30',ink2:'rgba(30,42,70,.85)',halo:'rgba(255,255,255,.9)',shadeLite:'rgba(255,255,255,.22)',shadeDark:'rgba(20,40,80,.22)',coast1:'rgba(255,255,255,.25)',coast2:'rgba(255,255,255,.45)',pbTile:'rgba(40,30,80,.4)',borderTile:'rgba(30,20,70,.7)'};
  BANDS.forEach((b,i)=>pal['b'+i]=dark?b.dark:b.light);stars();ui();draw();}
matchMedia('(prefers-color-scheme: light)').addEventListener('change',theme);

function stars(){const r=sc.getBoundingClientRect();sc.width=r.width*dpr;sc.height=r.height*dpr;const s=sc.getContext('2d');s.clearRect(0,0,sc.width,sc.height);
  if(!dark)return;let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<Math.round(r.width*r.height/2600);i++){const a=rnd()*0.7+0.1,rad=(rnd()<0.08?1.3:0.6)*dpr;s.fillStyle=`rgba(220,230,255,${a})`;s.beginPath();s.arc(rnd()*sc.width,rnd()*sc.height,rad,0,7);s.fill();}}

// time helpers
const off=tz=>(D.zones[tz]||[0,0])[season];
const hhmm=x=>{x=((x%24)+24)%24;let h=Math.floor(x+1e-9),m=Math.round((x-h)*60);if(m===60){h=(h+1)%24;m=0}return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')};
const hours=o=>hhmm(S+o)+'–'+hhmm(E+o);
const band=o=>{let s=(((S+o)%24)+24)%24;if(s<5)s+=24;for(let i=0;i<6;i++)if(s>=BANDS[i].lo&&s<BANDS[i].hi)return i;return 5};
const vsUK=o=>{if(!o)return'Same as the UK';const a=Math.abs(o),h=Math.floor(a),m=Math.round((a-h)*60);
  return(h?h+(h===1?' hour':' hours'):'')+(h&&m?' ':'')+(m?m+' min':'')+(o>0?' ahead of':' behind')+' the UK'};
const utc=o=>{const u=o+(season?1:0),a=Math.abs(u),h=Math.floor(a),m=Math.round((a-h)*60);return'UTC'+(u?(u>0?'+':'−')+h+(m?':'+String(m).padStart(2,'0'):''):'')};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// sizing
function resize(){dpr=Math.min(window.devicePixelRatio||1,2);const r=cv.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;
  base=Math.min(W,H)/2*0.86;cx=W/2;cy=H/2+(W<=700?-20:0);proj.translate([cx,cy]).clipExtent([[0,0],[W,H]]);stars();draw();}

// visibility cap of the viewport for culling
let viewCap=null;
function computeView(){const s=base*k;const far=Math.max(Math.hypot(cx,cy),Math.hypot(W-cx,cy),Math.hypot(cx,H-cy),Math.hypot(W-cx,H-cy));
  const rho=(far>=s?Math.PI/2:Math.asin(far/s))+0.02;viewCap=[[-rot[0],-rot[1]],rho];VC=vec(-rot[0],-rot[1]);VR=rho;CR=Math.cos(rho);SR=Math.sin(rho);}
let VC=[1,0,0],VR=1,CR=0,SR=1;
const inView=f=>{if(f.cr+VR>=Math.PI)return true;return f.v[0]*VC[0]+f.v[1]*VC[1]+f.v[2]*VC[2]>f.ccr*CR-f.scr*SR};

const F={cn:'600 13.5px Fraunces, Georgia, serif',pn:'500 11.5px "Bricolage Grotesque", "Segoe UI", sans-serif',hr:'700 12.5px "Bricolage Grotesque", "Segoe UI", sans-serif',ov:'600 12px "Bricolage Grotesque", "Segoe UI", sans-serif',cl:'600 11px "Bricolage Grotesque", "Segoe UI", sans-serif'};
const mcache={};const tw=(t,f)=>{const key=f+'|'+t;let v=mcache[key];if(v==null){ctx.font=f;v=mcache[key]=ctx.measureText(t).width}return v};

// fast orthographic: rotate unit vectors, push hidden points onto the limb for fills, lift the pen for strokes
let M=[1,0,0,0,1,0,0,0,1],SC=1;
function setMatrix(){const l=rot[0]*RAD,p=rot[1]*RAD,cl=Math.cos(l),sl=Math.sin(l),cp=Math.cos(p),sp=Math.sin(p);
  M=[cl*cp,-sl*cp,-sp, sl,cl,0, cl*sp,-sl*sp,cp];SC=base*k;}
function ring(a,fill){const n=a.length/3;let pen=false;
  const m0=M[0],m1=M[1],m2=M[2],m3=M[3],m4=M[4],m6=M[6],m7=M[7],m8=M[8];
  for(let i=0;i<n;i++){const x=a[i*3],y=a[i*3+1],z=a[i*3+2];const X=m0*x+m1*y+m2*z;let Y=m3*x+m4*y,Z=m6*x+m7*y+m8*z;
    if(X<0){if(!fill){pen=false;continue}const h=Math.hypot(Y,Z)||1;Y/=h;Z/=h}
    const sx=cx+SC*Y,sy=cy-SC*Z;if(pen)ctx.lineTo(sx,sy);else{ctx.moveTo(sx,sy);pen=true}}
  if(fill)ctx.closePath();}
function fillBands(fc){const g=[[],[],[],[],[],[]];
  for(const f of fc.features){if(f.rings&&inView(f))g[band(off(f.properties.z))].push(f)}
  g.forEach((arr,i)=>{if(!arr.length)return;ctx.beginPath();for(const f of arr)for(const r of f.rings)ring(r,true);ctx.fillStyle=showHours?pal['b'+i]:pal.land;ctx.fill('evenodd')});}
function strokeFC(fc,style,w){ctx.beginPath();for(const f of fc.features)if(f.rings&&inView(f))for(const r of f.rings)ring(r,false);ctx.strokeStyle=style;ctx.lineWidth=w;ctx.stroke();}

function draw(){
  if(!W)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const s=base*k;proj.rotate(rot).scale(s);computeView();setMatrix();
  // atmosphere
  if(s<Math.hypot(W,H)){const g=ctx.createRadialGradient(cx,cy,s*0.96,cx,cy,s*1.22);g.addColorStop(0,pal.glow+(dark?'.42)':'.45)'));g.addColorStop(.35,pal.glow+'.12)');g.addColorStop(1,pal.glow+'0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,s*1.22,0,7);ctx.fill();}
  // ocean
  const og=ctx.createRadialGradient(cx-s*.35,cy-s*.4,s*.05,cx,cy,s*1.05);og.addColorStop(0,pal.oceanIn);og.addColorStop(1,pal.oceanOut);
  ctx.beginPath();path({type:'Sphere'});ctx.fillStyle=og;ctx.fill();
  ctx.beginPath();path(grat);ctx.strokeStyle=pal.grat;ctx.lineWidth=1;ctx.stroke();
  // land
  // pick detail by zoom; drop one level while the globe is moving, then redraw crisp at rest
  const lv=k<2.5?0:k<5?1:2;
  const TZ=[D.tzL,D.tzM,D.tz][lv],CB=[D.cbL,D.cbM,D.cb][lv];
  const tileA=clamp((k-TILE_K)/4.5,0,1),bA=1-tileA,raster=basemap!=='street';
  let shown=false;
  if(raster){shown=drawTiles();if(shown)ctx.drawImage(tcv,0,0,W,H);
    // working-hours colours over the imagery, see-through, fading out as you zoom in
    if(bA>0.02&&showHours){ctx.save();ctx.globalAlpha=bA*0.5;fillBands(D.gaps);fillBands(TZ);ctx.restore()}}
  else{
    if(bA>0.02){ctx.globalAlpha=bA;ctx.lineJoin='round';strokeFC(CB,pal.coast1,k>4?9:6);strokeFC(CB,pal.coast2,k>4?3.5:2.5);ctx.globalAlpha=1}
    fillBands(D.gaps);fillBands(TZ);
    // street map fades in as you zoom towards a country, replacing the time-zone colours once fully in
    shown=tileA>0&&drawTiles();if(shown){ctx.globalAlpha=tileA;ctx.drawImage(tcv,0,0,W,H);ctx.globalAlpha=1}}
  if(shown)attrib.textContent=raster?BM().attr:VT_ATTR;attrib.classList.toggle('show',shown);
  // the colour key fades with the working-hours colours
  const stripEl=document.getElementById('strip');if(stripEl){const o=bA<0.03?0:bA;if(stripEl._o!==o){stripEl._o=o;stripEl.style.opacity=o;stripEl.style.visibility=o?'':'hidden'}}
  if(bA>0.02){ctx.globalAlpha=bA;strokeFC(CB,pal.border,k>4?1.4:0.9);ctx.globalAlpha=1}
  // sphere shading for depth
  ctx.save();ctx.beginPath();path({type:'Sphere'});ctx.clip();
  const sg=ctx.createRadialGradient(cx-s*.42,cy-s*.48,0,cx,cy,s*1.02);sg.addColorStop(0,pal.shadeLite);sg.addColorStop(.55,'rgba(0,0,0,0)');sg.addColorStop(1,pal.shadeDark);
  ctx.fillStyle=sg;ctx.fillRect(0,0,W,H);ctx.restore();
  drawOverlays();if(typeof clDraw==='function')clDraw();drawLabels();if(shown&&(!raster||BM().labels))drawMapLabels(raster?Math.max(tileA,k>=4?1:0):tileA);drawPin();
}

function drawOverlays(){overlays.forEach(L=>{if(!L.on)return;L.fc.features.forEach(f=>{const g=f.geometry;if(!g||/Point/.test(g.type))return;
  ctx.beginPath();path(f);if(/Polygon/.test(g.type)){ctx.globalAlpha=.2;ctx.fillStyle=L.color;ctx.fill();ctx.globalAlpha=1}
  ctx.strokeStyle=pal.halo;ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle=L.color;ctx.lineWidth=2.2;ctx.stroke();})});
  if(selected&&selected.L.on){const f=selected.f,g=f.geometry;
    if(/Point/.test(g.type)){(g.type==='Point'?[g.coordinates]:g.coordinates).forEach(p=>{const s=scr(p);if(!s)return;
      ctx.beginPath();ctx.arc(s[0],s[1],10,0,7);ctx.strokeStyle=pal.halo;ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=selected.L.color;ctx.lineWidth=2.5;ctx.stroke();});}
    else{ctx.beginPath();path(f);if(/Polygon/.test(g.type)){ctx.globalAlpha=.35;ctx.fillStyle=selected.L.color;ctx.fill();ctx.globalAlpha=1}
      ctx.strokeStyle=pal.halo;ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle=selected.L.color;ctx.lineWidth=3.5;ctx.stroke();}}}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function drawLabels(){
  placed=[];const ctr=viewCap[0],ppd=base*k/DEG,cand=[];
  overlays.forEach(L=>{if(!L.on)return;L.fc.features.forEach(f=>{const g=f.geometry;if(!g)return;
    (g.type==='Point'?[g.coordinates]:g.type==='MultiPoint'?g.coordinates:[]).forEach(p=>cand.push({ov:L,f,lon:p[0],lat:p[1],name:(f.properties&&f.properties.name)||'',pri:4e9,a:1}))})});
  for(const f of favs)cand.push({fav:f,v:f.v,lon:f.lon,lat:f.lat,name:f.name,pri:5e9,a:1});
  if(typeof clLabels==='function')clLabels(cand);
  // One label per country, then extra labels only where they add something: a region on a different
  // clock, a separate island, or a repeat of the country's hours once the last one is far off screen.
  const gap=clamp(Math.min(W,H)*0.45,260,480);
  for(const c of D.countries){const px=c.size*ppd;
    cand.push({lon:c[1],lat:c[2],v:c.v,name:c[0],tz:c[3],star:c[6]&&px<340,pri:2e9+px,kind:'c',ref:c,a:1,key:c[4]+'|'+off(c[3]),gap});}
  for(const p of D.prov){const px=p[5]*ppd;if(px<38)continue;if(p.v[0]*VC[0]+p.v[1]*VC[1]+p.v[2]*VC[2]<0.07)continue;
    const c=cByIso[p[4]],o=off(p[3]),same=c&&off(c[3])===o,a=clamp((px-38)/36,0,1);if(a<0.05)continue;
    if(!same)cand.push({lon:p[1],lat:p[2],v:p.v,name:p[0],tz:p[3],pri:1e9+px,kind:'p',ref:p,a,key:p[4]+'|'+o,gap});
    else if(!p[7])cand.push({lon:p[1],lat:p[2],v:p.v,name:p[0],tz:p[3],pri:5e8+px,kind:'p',ref:p,a,key:p[4]+'|'+o+'|isle',gap:gap*0.55});
    else cand.push({lon:p[1],lat:p[2],v:p.v,name:c[0],tz:p[3],pri:px,kind:'c',rep:true,ref:p,a,key:p[4]+'|'+o,gap});}
  cand.sort((x,y)=>y.pri-x.pri);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';
  let n=0;const seen=[];
  for(const L of cand){
    const v=L.v||vec(L.lon,L.lat);const X=M[0]*v[0]+M[1]*v[1]+M[2]*v[2];if(X<0.07)continue;
    const x=cx+SC*(M[3]*v[0]+M[4]*v[1]),y=cy-SC*(M[6]*v[0]+M[7]*v[1]+M[8]*v[2]);
    if(x<-60||y<-30||x>W+60||y>H+40)continue;
    if(L.fav){const nw=tw(L.name,F.ov)+8,r={x0:x-Math.max(nw,22)/2,y0:y-30,x1:x+Math.max(nw,22)/2,y1:y+9};
      if(placed.some(q=>r.x0<q.x1&&r.x1>q.x0&&r.y0<q.y1&&r.y1>q.y0)&&L.fav!==activeFav)continue;r.L=L;placed.push(r);
      heart(x,y,L.fav===activeFav?9:7.5,FAVC,pal.halo);ctx.font=F.ov;ctx.lineWidth=4;ctx.strokeStyle=pal.halo;ctx.strokeText(L.name,x,y-14);ctx.fillStyle=pal.ink;ctx.fillText(L.name,x,y-14);continue;}
    if(L.cl){const s=L.name.length>30?L.name.slice(0,28)+'…':L.name,nw=tw(s,F.cl)+6,r={x0:x-nw/2,y0:y-22,x1:x+nw/2,y1:y-6};
      if(placed.some(q=>r.x0<q.x1&&r.x1>q.x0&&r.y0<q.y1&&r.y1>q.y0))continue;r.L=L;placed.push(r);
      ctx.font=F.cl;ctx.lineWidth=3.5;ctx.strokeStyle=pal.halo;ctx.strokeText(s,x,y-10);ctx.fillStyle=pal.ink;ctx.fillText(s,x,y-10);if(++n>450)break;continue;}
    let nf,hr=null,bi=0;
    if(L.ov){nf=F.ov}else{const o=off(L.tz);nf=L.kind==='c'?F.cn:F.pn;if(showHours){hr=hours(o)+(L.star?'*':'');bi=band(o)}}
    const nw=tw(L.name,nf),hw=hr?tw(hr,F.hr):0,w=Math.max(nw,hw)+8,h=hr?32:18;
    const r={x0:x-w/2,y0:y-(hr?23:22),x1:x+w/2,y1:y-(hr?23:22)+h};
    if(L.key&&seen.some(s=>s.key===L.key&&Math.hypot(s.x-x,s.y-y)<L.gap))continue;
    const P=6;if(placed.some(q=>r.x0-P<q.x1&&r.x1+P>q.x0&&r.y0-P/2<q.y1&&r.y1+P/2>q.y0))continue;
    if(L.key)seen.push({key:L.key,x,y});
    if(L.a>0.3){r.L=L;placed.push(r)}
    ctx.globalAlpha=L.a;
    if(L.ov){ctx.beginPath();ctx.arc(x,y,4.5,0,7);ctx.fillStyle=L.ov.color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=pal.halo;ctx.stroke();
      ctx.font=nf;ctx.lineWidth=4;ctx.strokeText(L.name,x,y-9);ctx.fillStyle=pal.ink;ctx.fillText(L.name,x,y-9);ctx.globalAlpha=1;continue;}
    ctx.font=nf;ctx.lineWidth=4;ctx.strokeStyle=pal.halo;ctx.strokeText(L.name,x,y-9);ctx.fillStyle=L.kind==='c'?pal.ink:pal.ink2;ctx.fillText(L.name,x,y-9);
    if(hr){ctx.font=F.hr;ctx.strokeText(hr,x,y+6);ctx.fillStyle=pal.ink;ctx.fillText(hr,x,y+6);}
    ctx.globalAlpha=1;if(++n>450)break;
  }
}

// motion loop: eased zoom, inertia, fly-to
const moving=()=>running||dragging;
function kick(){if(!running){running=true;requestAnimationFrame(tick)}}
function wrap(d){return((d+540)%360)-180}
function tick(now){
  let busy=false;
  if(fly){const t=Math.min(1,(now-fly.t0)/fly.dur),e=d3.easeCubicInOut(t);rot=fly.ir(e);k=Math.exp(fly.ik(e));kT=k;if(t>=1)fly=null;busy=true;}
  else{
    if(Math.abs(Math.log(kT/k))>0.002){const before=anchor?proj.rotate(rot).scale(base*k).invert(anchor):null;
      k=Math.exp(Math.log(k)+(Math.log(kT)-Math.log(k))*0.2);
      if(before&&anchor){const after=proj.rotate(rot).scale(base*k).invert(anchor);if(after){rot[0]+=wrap(after[0]-before[0]);rot[1]=clamp(rot[1]+(after[1]-before[1]),-85,85)}}
      busy=true;} else k=kT;
    if(!dragging&&(Math.abs(vel[0])>0.02||Math.abs(vel[1])>0.02)){rotateBy(vel[0],vel[1]);vel[0]*=0.93;vel[1]*=0.93;busy=true}
  }
  draw();
  if(busy)requestAnimationFrame(tick);else{running=false;draw()}
}
function rotateBy(dx,dy){const s=base*k;rot[0]=wrap(rot[0]+dx/s*DEG);rot[1]=clamp(rot[1]-dy/s*DEG,-85,85)}
function zoomTo(nk,at){kT=clamp(nk,MINK,MAXK);anchor=at||null;fly=null;kick()}

const pts=new Map();let moved=0,lastMove=0,pinch0=null;
cv.addEventListener('pointerdown',e=>{
  if(!pts.size){const r=cv.getBoundingClientRect(),t=pinTarget(e.clientX-r.left,e.clientY-r.top);if(t){pinDrag={o:t,id:e.pointerId,moved:0};cv.setPointerCapture(e.pointerId);cv.classList.add('drag');fly=null;vel=[0,0];return}}
  cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);fly=null;vel=[0,0];moved=0;lastMove=performance.now();
  dragging=true;cv.classList.add('drag');if(pts.size===2){const [a,b]=[...pts.values()];pinch0={d:Math.hypot(a[0]-b[0],a[1]-b[1]),k:kT}}});
cv.addEventListener('pointermove',e=>{if(pinDrag&&e.pointerId===pinDrag.id){const r=cv.getBoundingClientRect();pinDrag.moved++;movePin(pinDrag.o,e.clientX-r.left,e.clientY-r.top+(pinDrag.o===draft?0:0));return}
  if(!pts.has(e.pointerId))return;const p=pts.get(e.pointerId),dx=e.clientX-p[0],dy=e.clientY-p[1];pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pts.size===1){const now=performance.now(),dt=Math.max(8,now-lastMove);lastMove=now;moved+=Math.abs(dx)+Math.abs(dy);rotateBy(dx,dy);
    vel=[vel[0]*0.3+dx*16/dt*0.7,vel[1]*0.3+dy*16/dt*0.7];draw();}
  else if(pts.size===2&&pinch0){const [a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);const r=cv.getBoundingClientRect();
    moved+=10;zoomTo(pinch0.k*d/pinch0.d,[(a[0]+b[0])/2-r.left,(a[1]+b[1])/2-r.top]);}});
function up(e){if(pinDrag&&e.pointerId===pinDrag.id){const p=pinDrag;pinDrag=null;cv.classList.remove('drag');if(p.moved>1)endPinDrag(p.o);return}
  if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch0=null;
  if(pts.size===0){dragging=false;draw();cv.classList.remove('drag');if(performance.now()-lastMove>80)vel=[0,0];kick();
    if(moved<6){const r=cv.getBoundingClientRect();clickAt(e.clientX-r.left,e.clientY-r.top)}}}
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();const d=e.deltaMode===1?e.deltaY*16:e.deltaY;
  zoomTo(kT*Math.exp(-clamp(d,-120,120)*0.0022),[e.clientX-r.left,e.clientY-r.top]);},{passive:false});
cv.addEventListener('dblclick',e=>{const r=cv.getBoundingClientRect();zoomTo(kT*2.2,[e.clientX-r.left,e.clientY-r.top])});
cv.addEventListener('keydown',e=>{const st=40;if(e.key==='ArrowLeft'){vel=[st/4,0]}else if(e.key==='ArrowRight'){vel=[-st/4,0]}else if(e.key==='ArrowUp'){vel=[0,st/4]}else if(e.key==='ArrowDown'){vel=[0,-st/4]}
  else if(e.key==='+'||e.key==='='){zoomTo(kT*1.6,[cx,cy])}else if(e.key==='-'){zoomTo(kT/1.6,[cx,cy])}else return;e.preventDefault();kick()});
document.getElementById('zi').onclick=()=>zoomTo(kT*1.8,[cx,cy]);
document.getElementById('zo').onclick=()=>zoomTo(kT/1.8,[cx,cy]);

function flyTo(lon,lat,sizeDeg,dur){
  const target=clamp((Math.min(W,H)*0.38)/(Math.max(sizeDeg,1.2)*base/DEG),1,MAXK);
  const r0=rot.slice(),r1=[-lon,clamp(-lat,-85,85),0];r1[0]=r0[0]+wrap(r1[0]-r0[0]);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // arc out a little on long trips so it feels like travelling
  const ik0=Math.log(k),ik1=Math.log(target),dist=d3.geoDistance([-r0[0],-r0[1]],[lon,lat]),lift=Math.min(1.2,dist)*0.9;
  fly={t0:performance.now(),dur:reduce?1:dur||1500,ir:d3.interpolate(r0,r1),ik:t=>ik0+(ik1-ik0)*t-Math.sin(Math.PI*t)*lift};vel=[0,0];kick();
}

// street map: OpenFreeMap vector tiles (OpenMapTiles schema). Each tile is painted to its own canvas and
// reprojected onto the globe; place, road and water names are then set upright on top in screen space,
// in English where OpenStreetMap has an English name (name:en), otherwise in the local name.
const TILE_K=9,VT_JSON='https://tiles.openfreemap.org/planet',VT_DRAW_MAX=19;
const VT_ATTR='OpenFreeMap · © OpenMapTiles · Data © OpenStreetMap contributors';
const attrib=document.getElementById('attrib');
let tileDrawPending=false;const tcv=document.createElement('canvas'),tctx=tcv.getContext('2d');
function tileRedraw(){if(tileDrawPending||running)return;tileDrawPending=true;requestAnimationFrame(()=>{tileDrawPending=false;if(!running)draw()})}
// the tile URL changes with every weekly build, so read it from the TileJSON first
const vt={url:null,max:14,state:0};
function vtSource(){if(vt.state===0){vt.state=1;
    fetch(VT_JSON).then(r=>{if(!r.ok)throw 0;return r.json()}).then(j=>{if(!j||!j.tiles||!j.tiles[0])throw 0;vt.url=j.tiles[0];if(j.maxzoom)vt.max=Math.min(j.maxzoom,16);vt.state=2;tileRedraw()})
      .catch(()=>setTimeout(()=>{vt.state=0;tileRedraw()},15000));}
  return vt.state===2;}
// minimal Mapbox Vector Tile decoder: layers → features with properties and geometry parts in tile units
const TD=new TextDecoder();
function mvt(buf){const b=new Uint8Array(buf),dv=new DataView(buf);let p=0;const out={};
  const vi=()=>{let r=0,s=1,c;do{c=b[p++];r+=(c&127)*s;s*=128}while(c&128);return r};
  const skip=t=>{if(t===0)vi();else if(t===1)p+=8;else if(t===2)p+=vi();else if(t===5)p+=4};
  const str=()=>{const l=vi(),s=TD.decode(b.subarray(p,p+l));p+=l;return s};
  while(p<b.length){const tag=vi();if(tag===26){const end=vi()+p,L={name:'',e:4096,f:[]},keys=[],vals=[],raw=[];
      while(p<end){const t=vi(),f=t>>3,w=t&7;
        if(f===1)L.name=str();
        else if(f===2){const fe=vi()+p,F={t:0,tags:null,g:[]};
          while(p<fe){const t2=vi(),f2=t2>>3;
            if(f2===2){const e2=vi()+p,a=[];while(p<e2)a.push(vi());F.tags=a}
            else if(f2===3)F.t=vi();
            else if(f2===4){const e2=vi()+p;let x=0,y=0,cur=null;
              while(p<e2){const c=vi(),id=c&7,n=c>>3;if(id===1||id===2)for(let i=0;i<n;i++){const dx=vi(),dy=vi();x+=(dx>>>1)^-(dx&1);y+=(dy>>>1)^-(dy&1);if(id===1){cur=[];F.g.push(cur)}if(cur)cur.push(x,y)}}}
            else skip(t2&7)}
          raw.push(F)}
        else if(f===3)keys.push(str());
        else if(f===4){const ve=vi()+p;let v=null;
          while(p<ve){const t2=vi(),f2=t2>>3;
            if(f2===1)v=str();else if(f2===2){v=dv.getFloat32(p,true);p+=4}else if(f2===3){v=dv.getFloat64(p,true);p+=8}
            else if(f2===4||f2===5)v=vi();else if(f2===6){const z=vi();v=z%2?-(z+1)/2:z/2}else if(f2===7)v=!!vi();else skip(t2&7)}
          vals.push(v)}
        else if(f===5)L.e=vi();
        else skip(w)}
      for(const F of raw){const pr={};if(F.tags)for(let i=0;i+1<F.tags.length;i+=2)pr[keys[F.tags[i]]]=vals[F.tags[i+1]];L.f.push({t:F.t,p:pr,g:F.g})}
      out[L.name]=L;p=end}
    else skip(tag&7)}
  return out;}
// downloaded tile data, least recently used dropped first
const vdata=new Map();let vInflight=0;
function vtData(z,x,y,load){const key=z+'/'+x+'/'+y;let d=vdata.get(key);
  if(d){vdata.delete(key);vdata.set(key,d);if(d.err&&load&&performance.now()>d.retry){vdata.delete(key);d=null}else return d}
  if(!load||vInflight>=16||!vtSource())return null;
  d={ok:false};vdata.set(key,d);vInflight++;
  fetch(vt.url.replace('{z}',z).replace('{x}',x).replace('{y}',y)).then(async r=>{
      if(r.status===204||r.status===404)return new ArrayBuffer(0);if(!r.ok)throw new Error('HTTP '+r.status);
      let ab=await r.arrayBuffer();const h=new Uint8Array(ab,0,Math.min(2,ab.byteLength));
      if(h[0]===0x1f&&h[1]===0x8b)ab=await new Response(new Blob([ab]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      return ab})
    .then(ab=>{d.L=mvt(ab);d.ok=true;tileRedraw()})
    .catch(()=>{d.err=true;d.retry=performance.now()+20000})
    .finally(()=>{vInflight--});
  if(vdata.size>260){let n=vdata.size-220;for(const kk of vdata.keys()){if(kk!==key){vdata.delete(kk);if(--n<=0)break}}}
  return d;}
// tile paint styles, modelled on the standard OpenStreetMap map (openstreetmap-carto) so it reads the same
// in light and dark mode. Tiles are opaque, so once fully faded in the time-zone shapes no longer show through.
const OC={land:'#f2efe9',water:'#aad3df',res:'#e0dfdf',com:'#f2dad9',retail:'#ffd6d1',ind:'#ebdbe8',garages:'#dfddce',quarry:'#c5c3c3',
  cemetery:'#aacbaf',civic:'#ffffe5',military:'#f6d4cf',sports:'#dffce2',pitch:'#aae0cb',park:'#c8facc',wood:'#add19e',scrub:'#c8d7ab',
  heath:'#d6d99f',grass:'#cdebb0',farm:'#eef0d5',orchard:'#aedfa3',rock:'#eee5dc',scree:'#ede4dc',sand:'#f5e9c6',beach:'#fff1ba',ice:'#ddecec',
  wet:'#d0e6d2',aerodrome:'#e9e7e2',apron:'#dadae0',runway:'#bbbbcc',bld:'#d9d0c9',bldE:'#c4b6ab',bound:'#8d618b',nature:'rgba(0,128,0,',
  rail:'#707070',path:'#fa8072',track:'#996600'};
const ROADC={motorway:['#e892a2','#dc2a67'],trunk:['#f9b29c','#c84e2f'],primary:['#fcd6a4','#a06b00'],secondary:['#f7fabf','#707d05'],
  tertiary:['#ffffff','#8f8f8f'],minor:['#ffffff','#bbbbbb'],service:['#ffffff','#bbbbbb']};
const RW={motorway:7,trunk:7,primary:6.5,secondary:6,tertiary:5,minor:3.6,service:2.2};
const ROADS=['service','minor','tertiary','secondary','primary','trunk','motorway'];
const LCOVER={wood:OC.wood,forest:OC.wood,scrub:OC.scrub,heath:OC.heath,grass:OC.grass,grassland:OC.grass,meadow:OC.grass,fell:OC.heath,park:OC.park,garden:OC.park,
  farmland:OC.farm,farm:OC.farm,orchard:OC.orchard,vineyard:OC.orchard,plant_nursery:OC.orchard,allotments:OC.orchard,bare_rock:OC.rock,rock:OC.rock,scree:OC.scree,shingle:OC.scree,
  sand:OC.sand,dune:OC.sand,beach:OC.beach,glacier:OC.ice,ice:OC.ice,wetland:OC.wet,marsh:OC.wet,bog:OC.wet,swamp:OC.wet,wet_meadow:OC.wet,reedbed:OC.wet,golf_course:OC.grass};
const LUSE={residential:OC.res,commercial:OC.com,retail:OC.retail,industrial:OC.ind,railway:OC.ind,garages:OC.garages,quarry:OC.quarry,cemetery:OC.cemetery,
  hospital:OC.civic,school:OC.civic,college:OC.civic,university:OC.civic,kindergarten:OC.civic,library:OC.civic,military:OC.military,stadium:OC.sports,
  pitch:OC.pitch,track:OC.pitch,playground:OC.sports,theme_park:OC.sports,zoo:OC.sports,bus_station:OC.com,dam:OC.rock};
// paint one display tile (z/x/y) from data tile (z-d) into canvas context g of S device pixels
function vtPaint(g,L,S,z,d,ox,oy){const px=S/256,k2=2**d,tx=-ox*S,ty=-oy*S;
  g.fillStyle=OC.land;g.fillRect(0,0,S,S);g.lineCap='round';g.lineJoin='round';
  const trace=(F,e,close)=>{const sc=S*k2/e;for(const a of F.g){g.moveTo(a[0]*sc+tx,a[1]*sc+ty);for(let i=2;i<a.length;i+=2)g.lineTo(a[i]*sc+tx,a[i+1]*sc+ty);if(close)g.closePath()}};
  const fill=(name,pick)=>{const lay=L[name];if(!lay)return;const grp=new Map();
    for(const F of lay.f){if(F.t!==3)continue;const c=pick(F.p);if(!c)continue;let a=grp.get(c);if(!a)grp.set(c,a=[]);a.push(F)}
    for(const [c,a] of grp){g.beginPath();for(const F of a)trace(F,lay.e,true);g.fillStyle=c;g.fill()}};
  const stroke=(lay,arr,col,w,dash,cap)=>{if(!arr||!arr.length||w<0.2)return;g.beginPath();for(const F of arr)trace(F,lay.e,false);g.strokeStyle=col;g.lineWidth=w;
    g.setLineDash(dash||[]);g.lineCap=cap||'round';g.stroke();g.setLineDash([]);g.lineCap='round'};
  const zr=2**((z-14)*0.62);   // road width scale: about 0.4 at z12, 1 at z14, 3.5 at z17
  fill('landcover',p=>LCOVER[p.subclass]||LCOVER[p.class]);
  fill('landuse',p=>LUSE[p.class]);
  // parks are filled; national parks and nature reserves get openstreetmap-carto's green edge band instead
  const pk=L.park;if(pk){const parks=[],nat=[];for(const F of pk.f)if(F.t===3)(F.p.class==='park'||F.p.class==='garden'?parks:nat).push(F);
    if(parks.length){g.beginPath();for(const F of parks)trace(F,pk.e,true);g.fillStyle=OC.park;g.fill()}
    if(nat.length&&z>=8){g.save();g.beginPath();for(const F of nat)trace(F,pk.e,true);g.clip();g.strokeStyle=OC.nature+'.16)';g.lineWidth=(z>=12?10:6)*px;g.stroke();
      g.strokeStyle=OC.nature+'.38)';g.lineWidth=1.6*px;g.stroke();g.restore()}}
  const ar=L.aeroway;if(ar){fill('aeroway',p=>p.class==='aerodrome'?OC.aerodrome:p.class==='apron'?OC.apron:p.class==='runway'||p.class==='taxiway'?OC.runway:null);
    stroke(ar,ar.f.filter(F=>F.t===2&&F.p.class==='runway'),OC.runway,Math.max(2*px,9*zr*px),null,'butt');
    if(z>=13)stroke(ar,ar.f.filter(F=>F.t===2&&F.p.class==='taxiway'),OC.runway,Math.max(1*px,3*zr*px),null,'butt')}
  const ww=L.waterway;if(ww){const big=[],small=[];for(const F of ww.f)if(F.t===2&&F.p.brunnel!=='tunnel')(F.p.class==='river'||F.p.class==='canal'?big:small).push(F);
    stroke(ww,big,OC.water,Math.max(1*px,3.4*zr*px));if(z>=13)stroke(ww,small,OC.water,Math.max(0.7*px,1.4*zr*px))}
  fill('water',()=>OC.water);
  if(z>=13&&L.building){fill('building',()=>OC.bld);if(z>=15){g.beginPath();for(const F of L.building.f)if(F.t===3)trace(F,L.building.e,true);g.strokeStyle=OC.bldE;g.lineWidth=0.7*px;g.stroke()}}
  const tr=L.transportation;if(tr){const by={};
    for(const F of tr.f){if(F.t!==2||F.p.class==='ferry')continue;let c=String(F.p.class||'').replace('_construction','');
      if(c==='raceway'||c==='busway')c='minor';else if(c==='bus_guideway')c='service';
      if(c==='path'&&/^(cycleway)$/.test(F.p.subclass))c='cycle';(by[c]||(by[c]=[])).push(F)}
    if(z>=14){stroke(tr,by.path,OC.path,Math.max(1*px,1.4*px*Math.min(zr,1.6)),[2.5*px,2*px],'butt');stroke(tr,by.cycle,'#0000ff',Math.max(0.9*px,1.2*px*Math.min(zr,1.6)),[2.5*px,2*px],'butt');
      stroke(tr,by.track,OC.track,Math.max(1*px,1.4*px*Math.min(zr,1.6)),[4*px,2.5*px],'butt')}
    const rails=(by.rail||[]).concat(by.transit||[]);
    if(z>=13){stroke(tr,rails,OC.rail,3*px);stroke(tr,rails,'#ffffff',1.2*px,[5*px,5*px],'butt')}else stroke(tr,rails,OC.rail,Math.max(0.8*px,1.2*px*zr*2));
    const vis=c=>by[c]&&(z>=13||!(c==='service')),w=c=>Math.min(20,Math.max(c==='minor'||c==='service'?0.6:0.9,RW[c]*zr))*px;
    const casing=c=>z>=12&&(z>=13||!/minor|service/.test(c));
    for(const c of ROADS)if(vis(c)&&casing(c))stroke(tr,by[c],ROADC[c][1],w(c)+(z>=15?2:1.3)*px);
    for(const c of ROADS)if(vis(c))stroke(tr,by[c],casing(c)||c==='motorway'||c==='trunk'||c==='primary'||c==='secondary'?ROADC[c][0]:(c==='tertiary'?'#c7c7c7':'#d4d4d4'),w(c))}
  const bd=L.boundary;if(bd){const a2=[],a4=[];for(const F of bd.f)if(F.t===2&&!F.p.maritime)(F.p.admin_level<=2?a2:F.p.admin_level<=4?a4:[]).push(F);
    stroke(bd,a2,OC.bound,(z>=10?2:1.4)*px,[6*px,3*px,1.5*px,3*px],'butt');if(z>=8)stroke(bd,a4,OC.bound,1*px,[5*px,3*px],'butt')}}
// painted tiles, least recently used dropped first; painting is spread over frames to keep motion smooth
const vimg=new Map(),vtUsed=new Set();let vBudget=0;
// base maps: the English street map (vector, above) or a raster layer. Raster layers show from the whole-globe
// view down, under softened working-hours colours that fade as you zoom in. 'labels' adds the English place
// names from the vector tiles on top (for imagery without its own names).
const BASEMAPS={
  street:{name:'Street map',sub:'OpenStreetMap data, names in English'},
  satellite:{name:'Satellite',sub:'Esri World Imagery, with English names',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',max:19,labels:true,dark:true,
    attr:'Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community · Names © OpenStreetMap contributors'},
  s2:{name:'Sentinel-2 cloudless',sub:'Cloud-free satellite mosaic, EOX',url:'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',max:15,labels:true,dark:true,
    attr:'Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020) · Names © OpenStreetMap contributors'},
  osm:{name:'OpenStreetMap',sub:'The standard openstreetmap.org map, local names',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',max:19,attr:'© OpenStreetMap contributors'},
  topo:{name:'Topographic',sub:'Contours and relief, OpenTopoMap',url:'https://tile.opentopomap.org/{z}/{x}/{y}.png',max:17,attr:'Map data © OpenStreetMap contributors, SRTM · Style © OpenTopoMap (CC BY-SA)'},
  ocean:{name:'Ocean',sub:'Sea-floor relief and bathymetry, Esri',url:'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',max:13,labels:true,
    attr:'Tiles © Esri: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ · Names © OpenStreetMap contributors'},
  night:{name:'Earth at night',sub:'City lights from space, NASA Black Marble',url:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',max:8,labels:true,dark:true,
    attr:'NASA Earth Observatory / NASA GIBS · Names © OpenStreetMap contributors'}};
let basemap=(()=>{try{const b=localStorage.getItem('whg.basemap');return BASEMAPS[b]?b:'street'}catch(e){return'street'}})();
const BM=()=>BASEMAPS[basemap];
const rimg=new Map();
function rtile(z,x,y,load){const B=BM(),key=basemap+z+'/'+x+'/'+y;let t=rimg.get(key);
  if(t){rimg.delete(key);rimg.set(key,t);if(t.ok&&B.labels&&!t.dk)t.dk=vtLabelKey(z,x,y);return t}
  if(!load)return null;
  t={ok:false,img:new Image()};t.img.crossOrigin='anonymous';t.img.decoding='async';
  t.img.onload=()=>{t.ok=true;tileRedraw()};t.img.onerror=()=>{t.err=true};
  t.img.src=B.url.replace('{z}',z).replace('{x}',x).replace('{y}',y);rimg.set(key,t);
  if(rimg.size>220){let n=rimg.size-180;for(const kk of rimg.keys()){if(kk!==key){rimg.delete(kk);if(--n<=0)break}}}
  return t;}
// the vector tile holding a raster tile's names, fetched for its labels only
function vtLabelKey(z,x,y){const dz=Math.min(z,vt.max),d=z-dz,dx=x>>d,dy=y>>d,dd=vtData(dz,dx,dy,true);return dd&&dd.ok?dz+'/'+dx+'/'+dy:null}
function tile(z,x,y,load){return basemap==='street'?vtTile(z,x,y,load):rtile(z,x,y,load)}
function vtTile(z,x,y,load){const key=z+'/'+x+'/'+y;let t=vimg.get(key);
  if(t){vimg.delete(key);vimg.set(key,t);return t}
  if(!load)return null;
  const dz=Math.min(z,vt.max),d=z-dz,dx=x>>d,dy=y>>d,dd=vtData(dz,dx,dy,true);
  if(!dd||!dd.ok)return null;
  if(performance.now()>vBudget){tileRedraw();return null}
  const S=Math.round(256*Math.min(2,Math.max(1,dpr))),c=document.createElement('canvas');c.width=c.height=S;
  vtPaint(c.getContext('2d'),dd.L,S,z,d,x-(dx<<d),y-(dy<<d));
  t={img:c,ok:true,dk:dz+'/'+dx+'/'+dy};vimg.set(key,t);
  if(vimg.size>150){let n=vimg.size-130;for(const kk of vimg.keys()){if(kk!==key){vimg.delete(kk);if(--n<=0)break}}}
  return t;}
const inflate=1.2;
const lon2x=(lon,n)=>(lon+180)/360*n;
const lat2y=(lat,n)=>{const r=clamp(lat,-85.05,85.05)*RAD;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n};
const y2lat=(y,n)=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*DEG;
function drawTiles(){
  if(tcv.width!==cv.width||tcv.height!==cv.height){tcv.width=cv.width;tcv.height=cv.height}
  tctx.setTransform(dpr,0,0,dpr,0,0);tctx.clearRect(0,0,W,H);let drew=0;vtUsed.clear();vBudget=performance.now()+(running?6:14);
  const c0=-rot[0];let r0=1e9,r1=-1e9,la0=90,la1=-90,hit=0;
  for(let i=0;i<=8;i++)for(let j=0;j<=8;j++){const ll=proj.invert([W*i/8,H*j/8]);if(!ll||d3.geoDistance(ll,viewCap[0])>1.5)continue;hit++;
    const r=wrap(ll[0]-c0);r0=Math.min(r0,r);r1=Math.max(r1,r);la0=Math.min(la0,ll[1]);la1=Math.max(la1,ll[1]);}
  if(!hit)return false;const pad=(r1-r0)*0.08+0.01;r0-=pad;r1+=pad;la0=Math.max(-85,la0-pad);la1=Math.min(85,la1+pad);
  const ppd=base*k/DEG,lat=clamp(-rot[1],-80,80);
  const zmax=basemap==='street'?VT_DRAW_MAX:BM().max;
  let z=clamp(Math.round(Math.log2(ppd*360*Math.cos(lat*RAD)/256*(dpr>1?1.25:1))),Math.min(2,zmax),zmax),x0,x1,y0,y1,n;
  for(;;){n=2**z;x0=Math.floor(lon2x(c0+r0,n));x1=Math.floor(lon2x(c0+r1,n));y0=Math.floor(lat2y(la1,n));y1=Math.floor(lat2y(la0,n));
    if((x1-x0+1)*(y1-y0+1)<=90||z<=2)break;z--;}
  vtZ=z;
  // finer pieces when tiles are large on screen (zoomed out), so the curve of the globe has no gaps
  const N=z<=3?8:z<=5?5:k<14?3:2;
  // draw one tile image (or a square part of it) over tile tx,ty of a 2^z grid of size n, split into NxN cells
  const quad=(tx,ty,n,img,sx,sy,sz,N)=>{const cs=sz/N;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const P=(u,v)=>scr([(tx+u)/n*360-180,y2lat(ty+v,n)]);
      const p0=P(i/N,j/N),p1=P((i+1)/N,j/N),p2=P(i/N,(j+1)/N),p3=P((i+1)/N,(j+1)/N);if(!p0||!p1||!p2||!p3)continue;
      const mx=(p0[0]+p1[0]+p2[0]+p3[0])/4,my=(p0[1]+p1[1]+p2[1]+p3[1])/4,inf=q=>{const dx=q[0]-mx,dy=q[1]-my,l=Math.hypot(dx,dy)||1;return[q[0]+dx/l*inflate,q[1]+dy/l*inflate]};
      const a=inf(p0),b=inf(p1),c=inf(p3),d=inf(p2);
      if(Math.max(a[0],b[0],c[0],d[0])<0||Math.min(a[0],b[0],c[0],d[0])>W||Math.max(a[1],b[1],c[1],d[1])<0||Math.min(a[1],b[1],c[1],d[1])>H)continue;
      tctx.save();tctx.beginPath();tctx.moveTo(a[0],a[1]);tctx.lineTo(b[0],b[1]);tctx.lineTo(c[0],c[1]);tctx.lineTo(d[0],d[1]);tctx.closePath();tctx.clip();
      tctx.transform((p1[0]-p0[0])/cs,(p1[1]-p0[1])/cs,(p2[0]-p0[0])/cs,(p2[1]-p0[1])/cs,p0[0],p0[1]);
      const e=1.2*cs/Math.max(1,Math.hypot(p1[0]-p0[0],p1[1]-p0[1]));tctx.drawImage(img,sx+i*cs,sy+j*cs,cs,cs,-e,-e,cs+2*e,cs+2*e);tctx.restore();drew++;}};
  // stand-ins while a tile is being painted: zooming out, the sharper tiles already painted (up to two levels
  // down); zooming in, the nearest coarser one. Either way the street map never blinks out to the outlines.
  const kids=(x,y,zz,depth)=>{let all=true;const n2=2**(zz+1);
    for(let j=0;j<2;j++)for(let i=0;i<2;i++){const X=x*2+i,Y=y*2+j,c=zz+1<=zmax?tile(zz+1,X,Y,false):null;
      if(c&&c.ok){quad(X,Y,n2,c.img,0,0,c.img.width,depth?1:2);c.dk&&vtUsed.add(c.dk)}else if(!(depth<1&&kids(X,Y,zz+1,depth+1)))all=false}
    return all};
  for(let ty=Math.max(0,y0);ty<=Math.min(n-1,y1);ty++)for(let tx=x0;tx<=x1;tx++){
    const wx=((tx%n)+n)%n,t=tile(z,wx,ty,true);
    if(t&&t.ok){quad(tx,ty,n,t.img,0,0,t.img.width,N);t.dk&&vtUsed.add(t.dk);continue}
    let par=null,pd=0;for(let d=1;d<=5&&z-d>=0;d++){const p=tile(z-d,wx>>d,ty>>d,false);if(p&&p.ok){par=p;pd=d;break}}
    // coarser stand-in first, then any sharper painted pieces on top of it
    if(par){const s=par.img.width/(1<<pd);quad(tx,ty,n,par.img,(wx-((wx>>pd)<<pd))*s,(ty-((ty>>pd)<<pd))*s,s,N);par.dk&&vtUsed.add(par.dk)}
    kids(wx,ty,z,0);
  }
  return drew>0;
}
// map names, read once per data tile: English (name:en) where OpenStreetMap has it, else the local name.
// Country and state names are left to the time-zone labels. Each kind of name appears from the zoom
// openstreetmap-carto shows it at, so villages, hamlets and points of interest wait until you're close.
const PLACE={city:[900,6],town:[800,9],island:[700,9],village:[600,12],suburb:[500,12],quarter:[420,14],hamlet:[400,14],islet:[300,13],
  neighbourhood:[300,15],locality:[200,15],isolated_dwelling:[150,16]};
const ROADPRI={motorway:[260,11],trunk:[250,11],primary:[240,12],secondary:[220,13],tertiary:[200,14],minor:[150,15],service:[100,17]};
const POIC=c=>/restaurant|fast_food|cafe|bar|pub|ice_cream|beer|food|bakery/.test(c)?'#c77400':/lodging|hotel|hostel|motel|camp|bus|railway|harbor|ferry|fuel|parking|aerialway|airport|car/.test(c)?'#0092da':
  /hospital|doctor|dentist|pharmacy|clinic/.test(c)?'#bf0000':/park|garden|playground|pitch|sports|stadium|golf|beach|swimming|zoo/.test(c)?'#0e8517':/shop|grocery|clothing|supermarket|mall/.test(c)?'#ac39ac':'#734a08';
const nameOf=p=>p['name:en']||p.name||'';
function vtLabels(dk,dd){if(dd.labels)return dd.labels;const [z,x,y]=dk.split('/').map(Number),n=2**z,out=[];
  const ll=(e,a,i)=>[(x+a[i]/e)/n*360-180,y2lat(y+a[i+1]/e,n)];
  const pts=(lay,F,o)=>{const name=nameOf(F.p);if(!name)return;
    for(const a of F.g){if(a[0]<0||a[1]<0||a[0]>=lay.e||a[1]>=lay.e)continue;const q=ll(lay.e,a,0);out.push(Object.assign({name,v:vec(q[0],q[1])},o))}};
  const line=(lay,F,o)=>{const name=nameOf(F.p);if(!name)return;let best=null,bl=0;
    for(const a of F.g){let l=0;for(let i=2;i<a.length;i+=2)l+=Math.hypot(a[i]-a[i-2],a[i+1]-a[i-1]);if(l>bl){bl=l;best=a}}
    if(!best||bl<lay.e*0.04)return;const step=Math.max(1,Math.floor(best.length/2/32)),vs=[];
    for(let i=0;i<best.length;i+=2*step){const q=ll(lay.e,best,i);vs.push(vec(q[0],q[1]))}
    if((best.length/2-1)%step){const q=ll(lay.e,best,best.length-2);vs.push(vec(q[0],q[1]))}
    out.push(Object.assign({name,line:vs},o))};
  const L=dd.L;
  if(L.place)for(const F of L.place.f){const P=PLACE[F.p.class];if(P&&F.t===1)pts(L.place,F,{kind:'place',cls:F.p.class,pri:P[0]-(+F.p.rank||10),minz:P[1]})}
  if(L.water_name)for(const F of L.water_name.f){const c=F.p.class,w=c==='ocean'?880:c==='sea'?760:450,mz=c==='ocean'||c==='sea'?0:c==='bay'||c==='strait'?10:12;
    if(F.t===1)pts(L.water_name,F,{kind:'water',cls:c,pri:w,minz:mz});else if(F.t===2)line(L.water_name,F,{kind:'water',cls:c,pri:w,minz:mz})}
  if(L.waterway)for(const F of L.waterway.f)if(F.t===2&&(F.p.class==='river'||F.p.class==='canal'))line(L.waterway,F,{kind:'water',cls:'river',pri:300,minz:13});
  if(L.mountain_peak)for(const F of L.mountain_peak.f)if(F.t===1&&F.p.class!=='saddle')pts(L.mountain_peak,F,{kind:'peak',cls:'peak',ele:F.p.ele,pri:560-(+F.p.rank||10),minz:F.p.class==='volcano'||(+F.p.ele>2500)?10:12});
  if(L.aerodrome_label)for(const F of L.aerodrome_label.f)if(F.t===1)pts(L.aerodrome_label,F,{kind:'poi',cls:'airport',color:'#0092da',pri:520,minz:11});
  if(L.poi)for(const F of L.poi.f){if(F.t!==1)continue;const r=+F.p.rank||30;pts(L.poi,F,{kind:'poi',cls:F.p.class,color:POIC(F.p.class+' '+(F.p.subclass||'')),pri:120-r,minz:r<=5?15:r<=15?16:17})}
  if(L.transportation_name)for(const F of L.transportation_name.f){const c=String(F.p.class||'').replace('_construction',''),R=ROADPRI[c];if(R&&F.t===2)line(L.transportation_name,F,{kind:'road',cls:c,pri:R[0],minz:R[1]})}
  return dd.labels=out;}
const FONT='"Bricolage Grotesque", "Segoe UI", sans-serif';
const LF={city:'700 14px '+FONT,town:'600 12.5px '+FONT,place:'500 11.5px '+FONT,small:'500 10.5px '+FONT,poi:'500 10.5px '+FONT,
  water:'italic 500 12px Fraunces, Georgia, serif',road:'500 10.5px '+FONT,peak:'500 11px '+FONT};
const LINK={place:'#000000',small:'#333333',water:'#4d80b3',road:'#222222',peak:'#3a2a10'};
let vtZ=0;
function drawMapLabels(alpha){
  const cand=[];for(const dk of vtUsed){const dd=vdata.get(dk);if(dd&&dd.ok)for(const L of vtLabels(dk,dd))if(vtZ>=L.minz)cand.push(L)}
  if(!cand.length)return;cand.sort((p,q)=>q.pri-p.pri);
  const boxes=placed.map(r=>[r.x0,r.y0,r.x1,r.y1]),seen=new Map();
  const free=bs=>!bs.some(b=>b[0]<0||b[1]<0||b[2]>W||b[3]>H||boxes.some(q=>b[0]-3<q[2]&&b[2]+3>q[0]&&b[1]-2<q[3]&&b[3]+2>q[1]));
  const near=(name,x,y,gap)=>{const s=seen.get(name);return s&&s.some(q=>Math.hypot(q[0]-x,q[1]-y)<gap)};
  const mark=(name,q)=>{if(!seen.has(name))seen.set(name,[]);seen.get(name).push(q)};
  const sp=v=>{if(M[0]*v[0]+M[1]*v[1]+M[2]*v[2]<0.07)return null;return[cx+SC*(M[3]*v[0]+M[4]*v[1]),cy-SC*(M[6]*v[0]+M[7]*v[1]+M[8]*v[2])]};
  const onDark=basemap!=='street'&&BM().dark;
  const text=(s,x,y,font,col,hw)=>{ctx.font=font;ctx.lineWidth=hw||3;ctx.strokeText(s,x,y);ctx.fillStyle=onDark?(col===LINK.water?'#cfe8ff':/^#(000000|222222|333333|3a2a10)$/.test(col)?'#ffffff':col):col;ctx.fillText(s,x,y)};
  ctx.save();ctx.globalAlpha=alpha;ctx.lineJoin='round';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeStyle=onDark?'rgba(0,0,0,.75)':'rgba(255,255,255,.9)';let n=0;
  const cap=clamp(Math.round(W*H/9000),40,140);
  for(const L of cand){if(n>=cap)break;
    if(L.line){const pp=[];for(const v of L.line){const q=sp(v);if(!q){if(pp.length>1)break;pp.length=0;continue}pp.push(q)}
      if(pp.length<2)continue;const font=L.kind==='water'?LF.water:LF.road,w=tw(L.name,font)+6,h=L.kind==='water'?15:13;
      const cum=[0];for(let i=1;i<pp.length;i++)cum.push(cum[i-1]+Math.hypot(pp[i][0]-pp[i-1][0],pp[i][1]-pp[i-1][1]));
      const tot=cum[cum.length-1];if(tot<w+16)continue;
      const at=s=>{let i=1;while(i<cum.length-1&&cum[i]<s)i++;const f=(s-cum[i-1])/((cum[i]-cum[i-1])||1);return[pp[i-1][0]+(pp[i][0]-pp[i-1][0])*f,pp[i-1][1]+(pp[i][1]-pp[i-1][1])*f]};
      const m=at(tot/2),a=at(tot/2-w/2),b=at(tot/2+w/2),chord=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(chord<w*0.88||near(L.name,m[0],m[1],L.kind==='water'?420:280))continue;
      let ang=Math.atan2(b[1]-a[1],b[0]-a[0]);if(ang>Math.PI/2)ang-=Math.PI;else if(ang<-Math.PI/2)ang+=Math.PI;
      const ux=Math.cos(ang),uy=Math.sin(ang),bs=[],nb=Math.max(1,Math.ceil(w/h));
      for(let i=0;i<nb;i++){const o=(i+0.5)/nb*w-w/2,X=m[0]+ux*o,Y=m[1]+uy*o;bs.push([X-h/2,Y-h/2,X+h/2,Y+h/2])}
      if(!free(bs))continue;boxes.push(...bs);mark(L.name,m);
      ctx.save();ctx.translate(m[0],m[1]);ctx.rotate(ang);text(L.name,0,0,font,L.kind==='water'?LINK.water:LINK.road);ctx.restore();n++;continue}
    const q=sp(L.v);if(!q)continue;const [x,y]=q;if(x<0||y<0||x>W||y>H)continue;
    if(L.kind==='peak'||L.kind==='poi'){
      const ele=L.kind==='peak'&&+L.ele>0?Math.round(+L.ele).toLocaleString('en-GB')+' m':'',font=L.kind==='peak'?LF.peak:LF.poi,w=Math.max(tw(L.name,font),ele?tw(ele,LF.small):0)+6;
      const bx=[x-w/2,y-7,x+w/2,y+(ele?32:20)];if(near(L.name,x,y,300)||!free([bx]))continue;boxes.push(bx);mark(L.name,q);
      ctx.beginPath();if(L.kind==='peak'){ctx.moveTo(x,y-5);ctx.lineTo(x+5,y+4);ctx.lineTo(x-5,y+4);ctx.closePath();ctx.fillStyle='#d08f55'}else{ctx.arc(x,y,3.5,0,7);ctx.fillStyle=L.color}
      ctx.lineWidth=1.5;ctx.stroke();ctx.fill();
      text(L.name,x,y+13,font,L.kind==='peak'?LINK.peak:L.color);if(ele)text(ele,x,y+26,LF.small,LINK.peak);n++;continue}
    const font=L.kind==='water'?LF.water:L.cls==='city'?LF.city:L.cls==='town'?LF.town:/hamlet|neighbourhood|locality|isolated|islet/.test(L.cls)?LF.small:LF.place;
    const w=tw(L.name,font)+6,h=L.cls==='city'?18:15,bx=[x-w/2,y-h/2,x+w/2,y+h/2];
    if(near(L.name,x,y,600)||!free([bx]))continue;boxes.push(bx);mark(L.name,q);
    text(L.name,x,y,font,L.kind==='water'?LINK.water:/city|town|village|island/.test(L.cls)?LINK.place:LINK.small,L.cls==='city'?3.5:3);n++;}
  ctx.restore();}


// favourites, kept in this browser between visits
const FKEY='whg.favourites.v1';let favs=[];
try{const v=JSON.parse(localStorage.getItem(FKEY)||'[]');if(Array.isArray(v))favs=v.filter(f=>f&&isFinite(f.lon)&&isFinite(f.lat))}catch(e){}
favs.forEach(f=>f.v=vec(f.lon,f.lat));
const strip=f=>{const{v,...rest}=f;return rest};
function saveFavs(){try{localStorage.setItem(FKEY,JSON.stringify(favs.map(strip)))}catch(e){}}
function tzAt(ll){const zf=TZHIT.features.find(z=>d3.geoContains(z,ll));if(zf)return zf.properties.z;let bd=0.08,t=null;for(const q of D.prov){const d=d3.geoDistance(ll,[q[1],q[2]]);if(d<bd){bd=d;t=q[3]}}return t}
function addFav(name,ll,tz,where){const f={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:name||'Saved place',where:where||'',lon:+(+ll[0]).toFixed(5),lat:+(+ll[1]).toFixed(5),tz:tz||tzAt(ll),note:'',created:new Date().toISOString()};
  f.v=vec(f.lon,f.lat);favs.push(f);saveFavs();renderFavs();showFav(f,true);draw();}
function heart(x,y,s,fill,stroke){ctx.beginPath();ctx.moveTo(x,y+0.9*s);ctx.bezierCurveTo(x-1.5*s,y-0.1*s,x-0.75*s,y-1.2*s,x,y-0.45*s);ctx.bezierCurveTo(x+0.75*s,y-1.2*s,x+1.5*s,y-0.1*s,x,y+0.9*s);ctx.closePath();
  ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=stroke;ctx.stroke();}
const FAVC='#ff4f87';let activeFav=null,favTimer=0;
function hoursBlock(tz){if(!tz||!D.zones[tz])return'';const z=D.zones[tz],o=z[season],b=band(o);
  return`<div class="big"><i style="background:${pal['b'+b]}"></i>${hours(o)}</div><p class="bandname">${BANDS[b].name}, ${season?'summer':'winter'}. ${season?'Winter':'Summer'}: ${hours(z[1-season])}</p>`}
function showFav(f,focus){activeFav=f;selected=null;draft=null;
  const when=new Date(f.created);const ds=isNaN(when)?'':when.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  document.getElementById('infob').innerHTML=`<input class="ftitle" id="fname" value="${esc(f.name)}" aria-label="Favourite name" maxlength="80">
    <p class="where"><span class="fh" aria-hidden="true">♥</span> ${esc(f.where?f.where+', ':'')}saved ${ds}</p><p class="coords">${coordStr(f)}</p>${hoursBlock(f.tz)}
    <label class="nl" for="fnote">Note</label><textarea id="fnote" rows="4" placeholder="Where to stay, who to contact, what to check…">${esc(f.note||'')}</textarea>
    ${flightsBlock()}<p class="hint2">Drag the heart to move it.</p><div class="frow"><span class="saved" id="fsaved"></span><button class="ghost" id="fdel">Remove favourite</button></div>`;wireFlights([f.lon,f.lat]);
  const nm=document.getElementById('fname'),nt=document.getElementById('fnote'),sv=document.getElementById('fsaved');
  const commit=()=>{clearTimeout(favTimer);favTimer=setTimeout(()=>{f.name=nm.value.trim()||'Saved place';f.note=nt.value;saveFavs();renderFavs();draw();sv.textContent='Saved';setTimeout(()=>sv.textContent='',1500)},400)};
  nm.oninput=commit;nt.oninput=commit;
  document.getElementById('fdel').onclick=()=>{favs=favs.filter(x=>x!==f);saveFavs();renderFavs();activeFav=null;document.getElementById('info').classList.remove('show');draw()};
  document.getElementById('info').classList.add('show');if(focus)setTimeout(()=>nt.focus(),50);}
function renderFavs(){const ul=document.getElementById('favs');if(!ul)return;
  if(!favs.length){ul.innerHTML='<li class="empty">Use Add a favourite, then click the map to drop a pin.</li>';return}
  ul.innerHTML='';favs.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(f=>{const li=document.createElement('li'),b=document.createElement('button');
    const o=f.tz&&D.zones[f.tz]?D.zones[f.tz][season]:null;
    b.innerHTML=`<span class="fh" aria-hidden="true">♥</span><span class="fn">${esc(f.name)}</span>${o!=null?`<span class="fhrs">${hours(o)}</span>`:''}`;
    b.onclick=()=>{flyTo(f.lon,f.lat,2);showFav(f)};li.appendChild(b);ul.appendChild(li)});}



// flights: nearest airports to a place, then Google Flights or Skyscanner's month price calendar, one way
let airports=null,airportsP=null;
const METRO={LON:'London (all airports)',NYC:'New York (all airports)',PAR:'Paris (all airports)',MIL:'Milan (all airports)',ROM:'Rome (all airports)',
  TYO:'Tokyo (all airports)',SEL:'Seoul (all airports)',BJS:'Beijing (all airports)',SHA:'Shanghai (all airports)',MOW:'Moscow (all airports)',STO:'Stockholm (all airports)',
  BUE:'Buenos Aires (all airports)',SAO:'São Paulo (all airports)',RIO:'Rio de Janeiro (all airports)',CHI:'Chicago (all airports)',WAS:'Washington (all airports)',
  OSA:'Osaka (all airports)',BER:'Berlin',IST:'Istanbul (all airports)',BKK:'Bangkok (all airports)',JKT:'Jakarta (all airports)',TCI:'Tenerife (both airports)'};
function loadAirports(){return airportsP||(airportsP=fetch('data/airports.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(a=>{airports=a;return a}))}
const apShort=n=>n.replace(/\b(International|Intl\.?|Regional|Airport|Aeropuerto|Aéroport|Flughafen)\b/gi,'').replace(/\s+/g,' ').replace(/[\s,–-]+$/,'').trim()||n;
function nearAirports(ll,n=5){const out=[];for(const a of airports){const d=d3.geoDistance(ll,[a[5],a[4]])*6371;if(d<700)out.push([d,a])}
  out.sort((x,y)=>(x[0]-(x[1][6]?40:0))-(y[0]-(y[1][6]?40:0)));return out.slice(0,n)}
function apSearch(q){q=q.trim().toLowerCase();if(q.length<2)return[];const res=[];
  for(const [c,name] of Object.entries(METRO))if(c.toLowerCase()===q||name.toLowerCase().startsWith(q))res.push([c,name,'',1]);
  for(const a of airports){const code=a[0].toLowerCase(),s=(a[2]+' '+a[1]).toLowerCase();
    const score=code===q?0:a[2].toLowerCase().startsWith(q)?1:s.includes(q)?2:9;if(score<9)res.push([a[0],a[1],a[2],score+(a[6]?0:0.5)])}
  return res.sort((x,y)=>x[3]-y[3]).slice(0,8)}
// where you fly from: the last one used, the last six searched, and the busiest European cities to pick from
const fromGet=()=>{try{return localStorage.getItem('whg.from')||''}catch(e){return''}};
const fromRecent=()=>{try{const v=JSON.parse(localStorage.getItem('whg.fromRecent')||'[]');return Array.isArray(v)?v.filter(c=>typeof c==='string').slice(0,6):[]}catch(e){return[]}};
const fromSet=v=>{try{localStorage.setItem('whg.from',v);localStorage.setItem('whg.fromRecent',JSON.stringify([v,...fromRecent().filter(c=>c!==v)].slice(0,6)))}catch(e){}};
const BUSY=['LON','IST','PAR','AMS','MAD','FRA','BCN','ROM','MUC','DUB'];
const SKY={LON:'lond',PAR:'pari',ROM:'rome',IST:'ista',MIL:'mila',NYC:'nyca',TYO:'tyoa',MOW:'mosc',STO:'stoc',CHI:'chia',WAS:'wasa',SEL:'sela',BJS:'bjsa',SHA:'csha',OSA:'osaa',BKK:'bkkt',BUE:'buea',SAO:'saoa',RIO:'rioa',JKT:'jkta',TCI:'tci'};
function apLabel(c){if(c in METRO)return METRO[c].replace(/ \((all|both) airports\)/,'')+' (all)';const a=airports&&airports.find(x=>x[0]===c);return a?(a[2]||apShort(a[1])).replace(/ am Main$/,'')+' '+c:c}
const chips=(codes,cls)=>codes.map(c=>`<button type="button" class="flchip${cls||''}" data-c="${esc(c)}">${esc(apLabel(c))}</button>`).join('');
function isoDay(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function flightsBlock(){return`<div class="fl"><button class="fltog" id="fltog" aria-expanded="false"><span aria-hidden="true">✈</span> Flights here<span class="flchev" aria-hidden="true">›</span></button><div class="flbody" id="flbody" hidden></div></div>`}
function wireFlights(ll){const tog=document.getElementById('fltog'),body=document.getElementById('flbody');if(!tog||!ll)return;
  tog.onclick=async()=>{const open=body.hidden;body.hidden=!open;tog.setAttribute('aria-expanded',String(open));if(!open||body.dataset.ready)return;
    body.innerHTML='<p class="flnote">Loading airports…</p>';
    try{await loadAirports()}catch(e){body.innerHTML='<p class="flnote">The airport list could not be loaded.</p>';return}
    const near=nearAirports(ll);if(!near.length){body.innerHTML='<p class="flnote">No airport with scheduled flights within 700 km of here.</p>';return}
    const t=new Date();t.setDate(t.getDate()+14);const min=isoDay(new Date());
    body.innerHTML=`<label class="fll" for="flfrom">From</label>
      <input id="flfrom" class="flin" list="fllist" placeholder="City or airport code, e.g. London or LGW" value="${esc(fromGet())}" autocomplete="off"><datalist id="fllist"></datalist>
      <div class="flchips" id="flrecent"></div>
      <div class="flchips"><span class="flcap">Busiest in Europe</span>${chips(BUSY)}</div>
      <label class="fll" for="flto">To</label>
      <select id="flto" class="flin">${near.map(([d,a])=>`<option value="${a[0]}">${a[0]}, ${esc(apShort(a[1]))} (${Math.round(d)} km)</option>`).join('')}</select>
      <label class="fll" for="fldate">Date, one way</label><input id="fldate" class="flin" type="date" min="${min}" value="${isoDay(t)}">
      <div class="flbtns"><button class="primary flb" id="flg">Google Flights</button><button class="flb2" id="flm">Cheapest days this month</button></div>
      <p class="flnote" id="flmsg">Opens in a new tab with your route filled in.</p>`;
    body.dataset.ready='1';
    const from=document.getElementById('flfrom'),dl=document.getElementById('fllist'),msg=document.getElementById('flmsg');
    const recent=()=>{const r=fromRecent(),el=document.getElementById('flrecent');el.hidden=!r.length;el.innerHTML=r.length?'<span class="flcap">Recent</span>'+chips(r,' rec'):''};recent();
    body.querySelectorAll('.flchips').forEach(el=>el.onclick=e=>{const b=e.target.closest('.flchip');if(!b)return;from.value=b.dataset.c;msg.textContent='Opens in a new tab with your route filled in.'});
    from.oninput=()=>{dl.innerHTML=apSearch(from.value).map(r=>`<option value="${r[0]}">${esc(r[1])}${r[2]?', '+esc(r[2]):''}</option>`).join('')};
    const code=()=>{const v=from.value.trim();const m=v.match(/^[A-Za-z]{3}\b/);let c=m?m[0].toUpperCase():'';
      if(!(c in METRO)&&!airports.some(a=>a[0]===c)){const r=apSearch(v);c=r.length?r[0][0]:''}
      if(!c){msg.textContent='Choose where you are flying from first.';from.focus();return''}from.value=c;fromSet(c);recent();return c};
    document.getElementById('flg').onclick=()=>{const o=code();if(!o)return;const d=document.getElementById('flto').value,dt=document.getElementById('fldate').value;
      window.open('https://www.google.com/travel/flights?q='+encodeURIComponent(`Flights from ${o} to ${d} on ${dt} one way`)+'&hl=en-GB&curr=GBP','_blank','noopener')};
    document.getElementById('flm').onclick=()=>{const o=code();if(!o)return;const d=document.getElementById('flto').value,dt=document.getElementById('fldate').value||isoDay(t);
      const ym=dt.slice(2,4)+dt.slice(5,7);
      window.open(`https://www.skyscanner.net/transport/flights/${SKY[o]||o.toLowerCase()}/${d.toLowerCase()}/?adultsv2=1&cabinclass=economy&rtn=0&oym=${ym}&selectedoday=01&currency=GBP&locale=en-GB&market=UK`,'_blank','noopener')};};}

// dropping a pin for a new favourite
let placing=false,draft=null,pinDrag=null,geoTimer=0,geoSeq=0;
const coordStr=o=>`${(+o.lat).toFixed(5)}, ${(+o.lon).toFixed(5)}`;
const ptoast=document.getElementById('ptoast'),infob=document.getElementById('infob');
function startPlacing(){placing=true;draft=null;cv.classList.add('placing');ptoast.hidden=false;hideInfo();
  if(innerWidth<=700&&!panel.classList.contains('collapsed')){panel.classList.add('collapsed');ph.setAttribute('aria-expanded','false')}draw();}
function stopPlacing(){placing=false;cv.classList.remove('placing');ptoast.hidden=true}
document.getElementById('favnew').onclick=startPlacing;
document.getElementById('pcancel').onclick=()=>{stopPlacing();draw()};
// nearest named place: OpenStreetMap's Nominatim, falling back to the nearest region offline
function geocode(o,cb){clearTimeout(geoTimer);const seq=++geoSeq;
  geoTimer=setTimeout(async()=>{let res=null;
    // detail follows the map zoom: town level on the whole globe, down to the building once at street level
    try{const z=clamp(Math.round(Math.log2(base*k/DEG*360/256))+2,10,18);
      const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${(+o.lat).toFixed(6)}&lon=${(+o.lon).toFixed(6)}&zoom=${z}&accept-language=en`);
      if(r.ok){const d=await r.json();if(d&&!d.error){const a=d.address||{};
        const local=a.village||a.town||a.city||a.hamlet||a.suburb||a.municipality||a.county;
        const primary=d.name||local||a.state||a.country;
        const rest=[local,a.island||a.archipelago,a.province||a.state_district,a.state||a.region,a.country].filter((v,i,arr)=>v&&v!==primary&&arr.indexOf(v)===i);
        if(primary)res={name:primary,where:rest.join(', ')}}}}catch(e){}
    if(!res){let bd=1e9,best=null;for(const q of D.prov){const d=d3.geoDistance([o.lon,o.lat],[q[1],q[2]]);if(d<bd){bd=d;best=q}}
      res=best?{name:'Near '+best[0],where:best[6]||''}:{name:'Dropped pin',where:''}}
    if(seq===geoSeq)cb(res)},300);}
function dropPin(ll){stopPlacing();draft={lon:ll[0],lat:ll[1],v:vec(ll[0],ll[1]),name:'',where:'',note:'',edited:false};showDraft();lookupDraft();draw();}
function lookupDraft(){const d=draft;const nm=document.getElementById('dname');if(nm&&!d.edited){nm.value='';nm.placeholder='Finding the nearest place…'}
  geocode(d,res=>{if(draft!==d)return;if(!d.edited)d.name=res.name;d.where=res.where;updateDraft()});}
function showDraft(){const d=draft;activeFav=null;selected=null;
  infob.innerHTML=`<input class="ftitle" id="dname" value="${esc(d.name)}" placeholder="Finding the nearest place…" aria-label="Favourite name" maxlength="80">
    <p class="where" id="dwhere">${esc(d.where)}</p><p class="coords" id="dcoords">${coordStr(d)}</p><div id="dhrs">${hoursBlock(tzAt([d.lon,d.lat]))}</div>
    <label class="nl" for="dnote">Note</label><textarea id="dnote" rows="3" placeholder="Where to stay, who to contact, what to check…">${esc(d.note)}</textarea>
    ${flightsBlock()}<p class="hint2">Drag the pin to fine-tune the spot, or click elsewhere to move it.</p>
    <div class="frow"><button class="ghost" id="dcancel">Cancel</button><button class="primary" id="dsave"><span aria-hidden="true">♥</span> Save favourite</button></div>`;
  wireFlights([d.lon,d.lat]);document.getElementById('dname').oninput=e=>{d.name=e.target.value;d.edited=true};
  document.getElementById('dnote').oninput=e=>{d.note=e.target.value};
  document.getElementById('dcancel').onclick=()=>{draft=null;hideInfo();draw()};
  document.getElementById('dsave').onclick=()=>{const f={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:(d.name||'').trim()||'Saved place',where:d.where,
      lon:+d.lon.toFixed(6),lat:+d.lat.toFixed(6),tz:tzAt([d.lon,d.lat]),note:d.note,created:new Date().toISOString()};
    f.v=vec(f.lon,f.lat);favs.push(f);draft=null;saveFavs();renderFavs();showFav(f);draw();};
  document.getElementById('info').classList.add('show');}
function updateDraft(){const d=draft;if(!d)return;const nm=document.getElementById('dname');if(!nm)return;
  if(!d.edited)nm.value=d.name;document.getElementById('dwhere').textContent=d.where;document.getElementById('dcoords').textContent=coordStr(d);
  document.getElementById('dhrs').innerHTML=hoursBlock(tzAt([d.lon,d.lat]));}
let clickPin=null;
function pinShape(x,y,col){ctx.save();ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
  ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-3,y-7,x-11,y-13,x-11,y-22);ctx.arc(x,y-22,11,Math.PI,0);ctx.bezierCurveTo(x+11,y-13,x+3,y-7,x,y);ctx.closePath();
  ctx.fillStyle=col;ctx.fill();ctx.restore();ctx.lineWidth=1.5;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.stroke();
  ctx.beginPath();ctx.arc(x,y-22,4.2,0,7);ctx.fillStyle='#fff';ctx.fill();}
function drawPin(){if(clickPin&&!draft){const s=scr(clickPin);if(s)pinShape(s[0],s[1],'#2f7df6')}
  if(!draft)return;const s=scr([draft.lon,draft.lat]);if(!s)return;const x=s[0],y=s[1];
  ctx.save();ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
  ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-3,y-7,x-11,y-13,x-11,y-22);ctx.arc(x,y-22,11,Math.PI,0);ctx.bezierCurveTo(x+11,y-13,x+3,y-7,x,y);ctx.closePath();
  ctx.fillStyle=FAVC;ctx.fill();ctx.restore();ctx.lineWidth=1.5;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.stroke();
  ctx.beginPath();ctx.arc(x,y-22,4.2,0,7);ctx.fillStyle='#fff';ctx.fill();}
function pinTarget(x,y){if(draft){const s=scr([draft.lon,draft.lat]);if(s&&Math.hypot(x-s[0],y-(s[1]-17))<17)return draft}
  if(activeFav){const s=scr([activeFav.lon,activeFav.lat]);if(s&&Math.hypot(x-s[0],y-s[1])<15)return activeFav}return null}
function movePin(o,x,y){const ll=proj.invert([x,y]);if(!ll||d3.geoDistance(ll,viewCap[0])>1.5)return;o.lon=ll[0];o.lat=ll[1];o.v=vec(ll[0],ll[1]);
  const el=document.getElementById(o===draft?'dcoords':'');if(o===draft&&el)el.textContent=coordStr(o);draw();}
function endPinDrag(o){if(o===draft){lookupDraft();updateDraft();return}
  o.lon=+o.lon.toFixed(6);o.lat=+o.lat.toFixed(6);o.tz=tzAt([o.lon,o.lat]);saveFavs();renderFavs();showFav(o);
  geocode(o,res=>{o.where=res.where?res.name+', '+res.where:res.name;saveFavs();if(activeFav===o)showFav(o)});}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(placing){stopPlacing();draw()}else if(draft&&document.activeElement.tagName!=='TEXTAREA'){draft=null;hideInfo();draw()}}});

// layer features: hit-testing and metadata
let selected=null;
function scr(p){const v=vec(p[0],p[1]);if(M[0]*v[0]+M[1]*v[1]+M[2]*v[2]<0)return null;return[cx+SC*(M[3]*v[0]+M[4]*v[1]),cy-SC*(M[6]*v[0]+M[7]*v[1]+M[8]*v[2])]}
function segDist(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((x-a[0])*dx+(y-a[1])*dy)/l:0;t=clamp(t,0,1);return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)}
function linesOf(g){return g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'||g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[]}
function overlayHit(x,y){
  const lab=placed.find(q=>q.L.ov&&x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1);if(lab)return{L:lab.L.ov,f:lab.L.f};
  const ll=proj.invert([x,y]),onGlobe=ll&&d3.geoDistance(ll,viewCap[0])<1.56;
  for(let li=overlays.length-1;li>=0;li--){const L=overlays[li];if(!L.on)continue;let best=null,bd=12;
    for(const f of L.fc.features){const g=f.geometry;if(!g||!/Point/.test(g.type))continue;
      for(const p of(g.type==='Point'?[g.coordinates]:g.coordinates)){const s=scr(p);if(s){const d=Math.hypot(s[0]-x,s[1]-y);if(d<bd){bd=d;best=f}}}}
    if(best)return{L,f:best};bd=7;
    for(const f of L.fc.features){const g=f.geometry;if(!g||/Point/.test(g.type))continue;
      for(const line of linesOf(g)){let prev=null;for(const p of line){const s=scr(p);if(s&&prev){const d=segDist(x,y,prev,s);if(d<bd){bd=d;best=f}}prev=s}}}
    if(best)return{L,f:best};
    if(onGlobe)for(let i=L.fc.features.length-1;i>=0;i--){const f=L.fc.features[i];if(f.geometry&&/Polygon/.test(f.geometry.type)&&d3.geoContains(f,ll))return{L,f}}}
  return null;}
function cleanHTML(html){
  if(!/<[a-z][\s\S]*>/i.test(html))return esc(html).replace(/\n/g,'<br>');
  const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,base').forEach(e=>e.remove());
  doc.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(a=>{const n=a.name.toLowerCase(),v=a.value.trim().toLowerCase();
    if(n.startsWith('on')||n==='style'||n==='class'||n==='id'||((n==='href'||n==='src')&&/^(javascript|data|vbscript):/.test(v)&&!(n==='src'&&v.startsWith('data:image/'))))el.removeAttribute(a.name)});
    if(el.tagName==='A'){el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}});
  return doc.body.firstChild.innerHTML;}
const isURL=v=>/^https?:\/\/\S+$/i.test(v);
function showFeature(L,f,ll){activeFav=null;draft=null;
  const p=f.properties||{},g=f.geometry,name=p.name||p.Name||p.title||'Untitled feature';
  const at=g.type==='Point'?g.coordinates:(ll&&d3.geoDistance(ll,viewCap[0])<1.56?ll:d3.geoCentroid(f));
  const zf=TZHIT.features.find(z=>d3.geoContains(z,at));let tzid=zf&&zf.properties.z;
  if(!tzid){let bd=0.08;for(const q of D.prov){const d=d3.geoDistance(at,[q[1],q[2]]);if(d<bd){bd=d;tzid=q[3]}}}
  let hrs='';if(tzid){const z=D.zones[tzid],o=z[season],b=band(o);
    hrs=`<div class="big"><i style="background:${pal['b'+b]}"></i>${hours(o)}</div><p class="bandname">Your hours here, ${season?'summer':'winter'}. ${season?'Winter':'Summer'}: ${hours(z[1-season])}</p>`;}
  const skip=new Set(['name','Name','title','description','Description','styleUrl','styleHash','styleMapHash','stroke','stroke-width','stroke-opacity','fill','fill-opacity','marker-color','marker-size','marker-symbol','icon','visibility','tessellate','extrude','altitudeMode','drawOrder']);
  const desc=p.description||p.Description;
  const rows=Object.entries(p).filter(([k,v])=>!skip.has(k)&&v!=null&&v!==''&&typeof v!=='object');
  const kind=/Point/.test(g.type)?'Point':/Line/.test(g.type)?'Line':'Area';
  const coord=g.type==='Point'?`${g.coordinates[1].toFixed(5)}, ${g.coordinates[0].toFixed(5)}`:'';
  document.getElementById('infob').innerHTML=`<h2>${esc(name)}</h2>
    <p class="where"><i class="ldot" style="background:${L.color}"></i>${esc(L.name)}, ${kind.toLowerCase()}</p>${hrs}
    ${desc?`<div class="desc">${cleanHTML(String(desc))}</div>`:''}
    ${rows.length||coord?`<dl class="meta">${rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${isURL(String(v))?`<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`:esc(v)}</dd>`).join('')}${coord?`<dt>Coordinates</dt><dd>${coord}</dd>`:''}</dl>`:''}
    ${!desc&&!rows.length?'<p class="nometa">This feature has no metadata in the file.</p>':''}${flightsBlock()}`;
  wireFlights(at);document.getElementById('info').classList.add('show');}
let hoverPending=false;
cv.addEventListener('pointermove',e=>{if(dragging||pinDrag||placing||hoverPending||(!overlays.length&&!draft&&!activeFav))return;hoverPending=true;
  requestAnimationFrame(()=>{hoverPending=false;const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;cv.style.cursor=pinTarget(x,y)?'grab':(overlays.length&&overlayHit(x,y)?'pointer':'')});});

// details
function clickAt(x,y){
  if(placing||draft){const ll=proj.invert([x,y]);if(ll&&d3.geoDistance(ll,viewCap[0])<1.5){
    if(placing){dropPin(ll);return}const fh0=placed.find(q=>q.L.fav&&x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1);
    if(!fh0){draft.lon=ll[0];draft.lat=ll[1];draft.v=vec(ll[0],ll[1]);lookupDraft();updateDraft();draw();return}}else if(placing)return}
  const fh=placed.find(q=>q.L.fav&&x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1);
  if(fh){if(selected)selected=null;showFav(fh.L.fav);draw();return}
  if(activeFav){activeFav=null;draw()}
  const ch=typeof clHit==='function'?clHit(x,y):null;if(ch){clShow(ch);draw();return}
  if(typeof CL!=='undefined'&&CL.sel){CL.sel=null;draw()}
  const oh=overlays.length?overlayHit(x,y):null;
  if(oh){selected=oh;showFeature(oh.L,oh.f,proj.invert([x,y]));draw();return}
  if(selected){selected=null;draw()}
  const hit=placed.find(q=>x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1&&!q.L.ov&&!q.L.fav);let title,tz,where='',at=null,fallback=null;
  if(hit){title=hit.L.name;tz=hit.L.tz;where=hit.L.kind==='p'?(hit.L.ref[6]||''):'';at=proj.invert([x,y])||[hit.L.lon,hit.L.lat];}
  else{const ll=proj.invert([x,y]);at=ll;if(!ll||d3.geoDistance(ll,viewCap[0])>1.56){hideInfo();return}
    const f=TZHIT.features.find(f=>d3.geoContains(f,ll));
    let best=null,bd=1e9;for(const p of D.prov){const d=d3.geoDistance(ll,[p[1],p[2]]);if(d<bd){bd=d;best=p}}
    if(!f&&!(best&&bd<0.05)){hideInfo();return}
    tz=f?f.properties.z:best[3];title=best&&bd<0.03?best[0]:tz.split('/').pop().replace(/_/g,' ');where=best&&bd<0.03?(best[6]||''):'';
    // until the lookup answers: the nearest town on the street map if one is close, otherwise a placeholder
    fallback=title;const mp=nearestMapPlace(ll);title=mp||'Looking up this spot…';where=mp?'':where;}
  if(hit)tz=tzAt(at)||tz;
  clickPin=hit&&k<TILE_K?null:at;
  showInfo(title,where,tz,at);
  // a country or region label clicked on the zoomed-out globe keeps its name; anywhere else, look up
  // the actual spot clicked (nearest village, town or feature, at a detail matching the zoom)
  if(at&&(!hit||k>=TILE_K)){const h=document.querySelector('#infob h2'),w=document.querySelector('#infob .where'),tok=infoTok;h.classList.add('pending');
    geocode({lon:at[0],lat:at[1]},res=>{if(tok!==infoTok)return;h.classList.remove('pending');if(res.name.startsWith('Near ')||res.name==='Dropped pin'){if(fallback)h.textContent=fallback;return}
      h.textContent=res.name;w.textContent=res.where||' '});}
}
// nearest named place in the street-map tiles on screen, if one is close by
function nearestMapPlace(ll){let best=null,bd=0.004;const VQ=vec(ll[0],ll[1]);
  for(const dk of vtUsed){const dd=vdata.get(dk);if(!dd||!dd.ok)continue;
    for(const L of vtLabels(dk,dd)){if(L.kind!=='place'||vtZ<L.minz-1)continue;const v=L.v,d=Math.acos(clamp(v[0]*VQ[0]+v[1]*VQ[1]+v[2]*VQ[2],-1,1));
      if(d<bd){bd=d;best=L.name}}}
  return best;}
let infoTok=0;
function showInfo(title,where,tz,ll){activeFav=null;draft=null;infoTok++;const z=D.zones[tz]||[0,0],o=z[season],b=band(o),other=z[1-season];
  document.getElementById('infob').innerHTML=`<h2>${esc(title)}</h2><p class="where">${esc(where&&where!==title?where:' ')}</p>
  <div class="big"><i style="background:${pal['b'+b]}"></i>${hours(o)}</div><p class="bandname">${BANDS[b].name}, ${season?'summer':'winter'}</p>
  <dl><dt>${season?'Winter':'Summer'}</dt><dd>${hours(other)}</dd><dt>Difference</dt><dd>${vsUK(o)}</dd><dt>Time zone</dt><dd>${utc(o)}</dd></dl>${ll?photosBlock():''}${ll?flightsBlock():''}`;
  wireFlights(ll);photosLoad(ll);document.getElementById('info').classList.add('show');}
function hideInfo(){document.getElementById('info').classList.remove('show');PH.tok++;if(clickPin){clickPin=null;draw()}if(typeof CL!=='undefined'&&CL.sel){CL.sel=null;draw()}if(selected||activeFav||draft){selected=null;activeFav=null;draft=null;draw()}}
document.getElementById('infox').onclick=hideInfo;

// panel & controls
const panel=document.getElementById('panel'),ph=document.getElementById('ph');
ph.onclick=()=>{const c=panel.classList.toggle('collapsed');ph.setAttribute('aria-expanded',String(!c))};
const tval=v=>{const[a,b]=v.split(':').map(Number);return a+(b||0)/60};
document.getElementById('s').oninput=e=>{if(e.target.value){S=tval(e.target.value);ui();draw()}};
document.getElementById('e').oninput=e=>{if(e.target.value){E=tval(e.target.value);ui();draw()}};
const bw=document.getElementById('w'),bs=document.getElementById('su');
function setSeason(v){season=v;bw.setAttribute('aria-pressed',String(v===0));bs.setAttribute('aria-pressed',String(v===1));ui();draw();hideInfo()}
bw.onclick=()=>setSeason(0);bs.onclick=()=>setSeason(1);
function ui(){renderFavs();renderLayers();document.getElementById('sum').textContent=`${hhmm(S)}–${hhmm(E)} UK, ${season?'summer':'winter'}`;
  document.getElementById('snote').textContent=season?'Late March to late October, while the UK is on BST.':'Late October to late March, while the UK is on GMT.';
  document.getElementById('key').innerHTML=BANDS.map((b,i)=>`<li><i style="background:${pal['b'+i]}"></i>${b.name} <small>${b.sub}</small></li>`).join('');
  document.getElementById('strip').classList.toggle('off',!showHours);
  document.getElementById('strip').innerHTML=BANDS.map((b,i)=>`<span><i style="background:${pal['b'+i]}"></i>${b.name}</span>`).join('');}
// base map menu (top right)
function bmRender(){const m=document.getElementById('bmmenu');
  m.innerHTML=`<div class="bmh">Base map</div>`+Object.entries(BASEMAPS).map(([id,b])=>`<button type="button" role="menuitemradio" aria-checked="${id===basemap}" data-id="${id}"><i class="bmdot"></i><span><b>${b.name}</b><small>${b.sub}</small></span></button>`).join('')+
    `<button type="button" class="bm3d" data-3d="1"><b>3D view</b><small>Fly around in 3D with terrain</small></button>`;
  m.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{setBasemap(b.dataset.id);bmToggle(false)});m.querySelector('[data-3d]').onclick=()=>{bmToggle(false);open3D()}}
function setBasemap(id){if(!BASEMAPS[id]||id===basemap)return;basemap=id;try{localStorage.setItem('whg.basemap',id)}catch(e){}vtUsed.clear();if(typeof m3d!=='undefined'&&m3d.map)m3dStyle();draw()}
function bmToggle(open){const m=document.getElementById('bmmenu'),b=document.getElementById('bmbtn');const show=open==null?m.hidden:open;if(show)bmRender();m.hidden=!show;b.setAttribute('aria-expanded',String(show));
  if(show)setTimeout(()=>{const f=m.querySelector('[aria-checked=true]');if(f)f.focus()})}
document.getElementById('bmbtn').onclick=e=>{e.stopPropagation();bmToggle()};
document.addEventListener('click',e=>{const m=document.getElementById('bmmenu');if(!m.hidden&&!e.target.closest('.bmwrap'))bmToggle(false)});
document.getElementById('bmmenu').addEventListener('keydown',e=>{if(e.key==='Escape'){bmToggle(false);document.getElementById('bmbtn').focus()}});
document.getElementById('b3d').onclick=()=>open3D();

// 3D view: MapLibre GL with terrain, opened over the globe at the same spot; left-drag pans, right-drag (or
// Ctrl+drag) tilts and turns, the wheel zooms. Uses the current base map; satellite gets English place names.
const M3D_JS='https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js',M3D_CSS='https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css';
const m3d={map:null,el:null,lib:null};
function m3dLoad(){if(m3d.lib)return m3d.lib;m3d.lib=new Promise((ok,fail)=>{const l=document.createElement('link');l.rel='stylesheet';l.href=M3D_CSS;document.head.appendChild(l);
  const sc=document.createElement('script');sc.src=M3D_JS;sc.onload=()=>window.maplibregl?ok(window.maplibregl):fail(new Error('MapLibre missing'));sc.onerror=()=>{m3d.lib=null;fail(new Error('load'))};document.head.appendChild(sc)});return m3d.lib}
const NAME_EN=['coalesce',['get','name:en'],['get','name']];
function m3dStyleDef(){const B=BM();
  if(basemap==='street')return'https://tiles.openfreemap.org/styles/liberty';
  return{version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources:{base:{type:'raster',tiles:[B.url],tileSize:256,maxzoom:B.max,attribution:B.attr},
      ofm:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'OpenFreeMap © OpenMapTiles · © OpenStreetMap contributors'}},
    layers:[{id:'base',type:'raster',source:'base'}].concat(B.labels?[
      {id:'water-names',type:'symbol',source:'ofm','source-layer':'water_name',layout:{'text-field':NAME_EN,'text-font':['Noto Sans Italic'],'text-size':13},paint:{'text-color':B.dark?'#cfe8ff':'#2c66a3','text-halo-color':B.dark?'rgba(0,0,0,.7)':'#fff','text-halo-width':1.4}},
      {id:'peaks',type:'symbol',source:'ofm','source-layer':'mountain_peak',minzoom:10,filter:['has','ele'],layout:{'text-field':['concat',NAME_EN,'\n',['to-string',['get','ele']],' m'],'text-font':['Noto Sans Regular'],'text-size':11},paint:{'text-color':'#fff','text-halo-color':'rgba(0,0,0,.75)','text-halo-width':1.3}},
      {id:'places',type:'symbol',source:'ofm','source-layer':'place',filter:['in',['get','class'],['literal',['city','town','village','suburb','hamlet','island']]],
        layout:{'text-field':NAME_EN,'text-font':['Noto Sans Bold'],'text-size':['match',['get','class'],'city',16,'town',14,12]},paint:{'text-color':B.dark?'#fff':'#111','text-halo-color':B.dark?'rgba(0,0,0,.8)':'#fff','text-halo-width':1.5}}]:[])}}
function m3dExtras(map){
  if(!map.getSource('dem'))map.addSource('dem',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:15,
    attribution:'Terrain: Mapzen / AWS Terrain Tiles (SRTM, GMTED, ETOPO1, others)'});
  try{map.setTerrain({source:'dem',exaggeration:1.3})}catch(e){}
  if(basemap!=='satellite'&&basemap!=='s2'&&basemap!=='night'&&!map.getLayer('hills')){
    const first=(map.getStyle().layers.find(l=>l.type==='symbol')||{}).id;
    map.addLayer({id:'hills',type:'hillshade',source:'dem',paint:{'hillshade-exaggeration':0.35,'hillshade-shadow-color':'rgba(0,0,0,.35)'}},first)}
  try{map.setSky({'sky-color':'#7fb4ff','horizon-color':'#cfe3ff','fog-color':'#e8f0ff','sky-horizon-blend':0.5,'horizon-fog-blend':0.6,'fog-ground-blend':0.35,'atmosphere-blend':['interpolate',['linear'],['zoom'],0,1,10,1,12,0]})}catch(e){}
  // street style: every name label in English where OpenStreetMap has one (road numbers and house numbers left alone)
  if(basemap==='street')for(const l of map.getStyle().layers)if(l.type==='symbol'&&l.layout&&/"name|\{name/.test(JSON.stringify(l.layout['text-field']||'')))try{map.setLayoutProperty(l.id,'text-field',NAME_EN)}catch(e){}}
function m3dStyle(){const map=m3d.map;if(map)map.setStyle(m3dStyleDef(),{diff:false})}
async function open3D(){let el=m3d.el;
  if(!el){el=m3d.el=document.createElement('div');el.className='m3d';el.innerHTML=`<div class="m3dmap" id="m3dmap"></div><div class="m3dbar glass"><b>3D</b><small>Drag to move · right-drag or Ctrl+drag to tilt and turn · wheel to zoom</small><button type="button" class="flb2" id="m3dlayers">Base map ▾</button><button type="button" class="primary" id="m3dx">Back to globe</button></div><p class="m3dmsg" id="m3dmsg" hidden></p>`;document.body.appendChild(el);
    el.querySelector('#m3dx').onclick=close3D;el.querySelector('#m3dlayers').onclick=e=>{e.stopPropagation();bmToggle()}}
  el.hidden=false;document.body.classList.add('in3d');const msg=el.querySelector('#m3dmsg');msg.hidden=true;
  let lib;try{lib=await m3dLoad()}catch(e){msg.textContent='The 3D view couldn’t load. Check your connection and try again.';msg.hidden=false;return}
  const lon=-rot[0],lat=clamp(-rot[1],-80,80),ppd=base*k/DEG,zoom=clamp(Math.log2(ppd*360/512),1,17);
  if(m3d.map){m3d.map.jumpTo({center:[lon,lat],zoom});m3d.map.resize();return}
  try{const map=m3d.map=new lib.Map({container:'m3dmap',style:m3dStyleDef(),center:[lon,lat],zoom,pitch:zoom>6?60:0,bearing:0,maxPitch:85,attributionControl:{compact:true},hash:false});
    map.addControl(new lib.NavigationControl({visualizePitch:true}),'bottom-right');
    map.on('style.load',()=>{try{map.setProjection({type:'globe'})}catch(e){}m3dExtras(map)});
    map.on('error',e=>{if(e&&e.error&&/webgl/i.test(String(e.error.message)))msg.textContent='3D needs WebGL, which this browser has switched off.',msg.hidden=false})}
  catch(e){msg.textContent='3D needs WebGL, which this browser has switched off.';msg.hidden=false}}
function close3D(){if(!m3d.el)return;const map=m3d.map;
  if(map){const c=map.getCenter(),z=map.getZoom();rot=[-c.lng,-clamp(c.lat,-85,85),0];k=kT=clamp(512*2**z/360*DEG/base,MINK,MAXK);fly=null;vel=[0,0]}
  m3d.el.hidden=true;document.body.classList.remove('in3d');bmToggle(false);draw()}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&m3d.el&&!m3d.el.hidden&&document.getElementById('bmmenu').hidden&&!(PH.box&&!PH.box.hidden)&&!(PH.grid&&!PH.grid.hidden))close3D()});

document.getElementById('fs').onclick=()=>{try{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen()}catch(e){}};
if(!document.documentElement.requestFullscreen)document.getElementById('fs').style.display='none';

// search
const index=D.countries.map(c=>({n:c[0],sub:'Country',lon:c[1],lat:c[2],size:c.size,tz:c[3]})).concat(D.prov.map(p=>({n:p[0],sub:p[6]||'',lon:p[1],lat:p[2],size:p[5],tz:p[3]})));
const sbox=document.getElementById('search'),q=document.getElementById('q'),res=document.getElementById('res');let hl=-1,matches=[];
document.getElementById('sbtn').onclick=()=>{if(sbox.classList.contains('open')&&!q.value){closeSearch()}else{sbox.classList.add('open');q.focus()}};
function closeSearch(){sbox.classList.remove('open');res.classList.remove('show');q.value='';q.blur()}
function renderRes(){res.innerHTML='';if(!q.value.trim()){res.classList.remove('show');return}
  if(!matches.length){res.innerHTML='<li class="empty">No place by that name. Try a country, state or island.</li>'}
  matches.forEach((m,i)=>{const li=document.createElement('li'),b=document.createElement('button');b.className=i===hl?'hl':'';
    b.innerHTML=`${esc(m.n)}<small>${esc(m.sub)}</small>`;b.onclick=()=>pick(m);li.appendChild(b);res.appendChild(li)});res.classList.add('show');}
function pick(m){flyTo(m.lon,m.lat,m.size);closeSearch();setTimeout(()=>showInfo(m.n,m.sub==='Country'?'':m.sub,m.tz,[m.lon,m.lat]),400)}
q.addEventListener('input',()=>{const v=q.value.trim().toLowerCase();hl=0;
  matches=v.length<2?[]:index.filter(i=>i.n.toLowerCase().includes(v)).sort((a,b)=>(a.n.toLowerCase().startsWith(v)?0:1)-(b.n.toLowerCase().startsWith(v)?0:1)||b.size-a.size).slice(0,8);
  if(v.length<2){res.classList.remove('show');return}renderRes();});
q.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSearch();cv.focus()}else if(e.key==='ArrowDown'){hl=Math.min(matches.length-1,hl+1);renderRes();e.preventDefault()}
  else if(e.key==='ArrowUp'){hl=Math.max(0,hl-1);renderRes();e.preventDefault()}else if(e.key==='Enter'&&matches[hl]){pick(matches[hl])}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==q&&!/INPUT/.test(document.activeElement.tagName)){e.preventDefault();sbox.classList.add('open');q.focus()}});
document.addEventListener('pointerdown',e=>{if(!sbox.contains(e.target)&&sbox.classList.contains('open')&&!q.value)closeSearch()});

// overlay layers
const COLORS=['#2ee6c8','#ff5fae','#4aa3ff','#b07cff','#ffb020'];
document.getElementById('add').onclick=()=>document.getElementById('file').click();
document.getElementById('file').onchange=async e=>{for(const f of e.target.files){try{await loadFile(f)}catch(err){alert(f.name+' could not be added: '+err.message)}}e.target.value=''};
async function loadFile(f){let fc;const n=f.name.toLowerCase();
  if(n.endsWith('.kmz')){const zip=await JSZip.loadAsync(f);const kf=Object.keys(zip.files).find(x=>x.toLowerCase().endsWith('.kml'));if(!kf)throw new Error('the KMZ has no KML inside');fc=kml2geo(await zip.file(kf).async('string'))}
  else if(n.endsWith('.kml'))fc=kml2geo(await f.text());
  else{fc=JSON.parse(await f.text());if(fc.type==='Feature')fc={type:'FeatureCollection',features:[fc]};fc.features.forEach(x=>{if(!x.properties)x.properties={}})}
  if(!fc.features||!fc.features.length)throw new Error('it has no placemarks or features');
  fc.features.forEach(x=>fixGeom(x.geometry));
  const used=new Set(overlays.map(o=>o.color)),color=COLORS.find(c=>!used.has(c))||COLORS[overlays.length%COLORS.length];
  const L={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:f.name,fc,on:true,color,added:Date.now()};
  overlays.push(L);renderLayers();draw();storeLayer(L);}
// added layers are kept between visits in this browser's IndexedDB (room for large files, unlike localStorage)
const layerDB=(()=>{let p=null;const open=()=>p||(p=new Promise((res,rej)=>{const r=indexedDB.open('working-hours-globe',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('layers',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
  const run=async(mode,fn)=>{const db=await open();return new Promise((res,rej)=>{const t=db.transaction('layers',mode),req=fn(t.objectStore('layers'));
    t.oncomplete=()=>res(req&&req.result);t.onerror=t.onabort=()=>rej(t.error)})};
  return{all:()=>run('readonly',s=>s.getAll()),put:v=>run('readwrite',s=>s.put(v)),del:id=>run('readwrite',s=>s.delete(id))};})();
function storeLayer(L){layerDB.put({id:L.id,name:L.name,fc:L.fc,on:L.on,color:L.color,added:L.added}).catch(err=>{
  if(err&&err.name==='QuotaExceededError')alert(L.name+' is shown now, but it is too large to keep for your next visit.')})}
layerDB.all().then(list=>{if(!list||!list.length)return;list.sort((a,b)=>(a.added||0)-(b.added||0)).forEach(v=>{
  if(v&&v.fc&&Array.isArray(v.fc.features)&&!overlays.some(o=>o.id===v.id))overlays.push({id:v.id,name:v.name,fc:v.fc,on:v.on!==false,color:v.color||COLORS[overlays.length%COLORS.length],added:v.added})});
  renderLayers();draw();}).catch(()=>{});
function kml2geo(txt){const doc=new DOMParser().parseFromString(txt,'text/xml'),out=[];
  const T=(el,t)=>Array.from(el.getElementsByTagNameNS('*',t));
  const C=el=>(el?el.textContent:'').trim().split(/\s+/).filter(Boolean).map(s=>s.split(',').slice(0,2).map(Number)).filter(p=>isFinite(p[0])&&isFinite(p[1]));
  const kids=(el,t)=>Array.from(el.children).filter(c=>c.localName===t);
  T(doc,'Placemark').forEach(pm=>{
    const props={name:((kids(pm,'name')[0]||{}).textContent||'').trim()};
    const d=kids(pm,'description')[0];if(d&&d.textContent.trim())props.description=d.textContent.trim();
    ['address','phoneNumber','Snippet'].forEach(t=>{const e=kids(pm,t)[0];if(e&&e.textContent.trim())props[t]=e.textContent.trim()});
    const when=T(pm,'when')[0]||T(pm,'begin')[0];if(when)props.when=when.textContent.trim();
    T(pm,'Data').forEach(dd=>{const key=((T(dd,'displayName')[0]||{}).textContent||dd.getAttribute('name')||'').trim();const v=T(dd,'value')[0];if(key&&v)props[key]=v.textContent.trim()});
    T(pm,'SimpleData').forEach(sd=>{const key=sd.getAttribute('name');if(key)props[key]=sd.textContent.trim()});
    T(pm,'Point').forEach(p=>{const c=C(T(p,'coordinates')[0]);if(c.length)out.push({type:'Feature',properties:props,geometry:{type:'Point',coordinates:c[0]}})});
    T(pm,'LineString').forEach(l=>{const c=C(T(l,'coordinates')[0]);if(c.length>1)out.push({type:'Feature',properties:props,geometry:{type:'LineString',coordinates:c}})});
    T(pm,'LinearRing').filter(r=>!r.closest||!r.closest('Polygon')).forEach(l=>{const c=C(T(l,'coordinates')[0]);if(c.length>1)out.push({type:'Feature',properties:props,geometry:{type:'LineString',coordinates:c}})});
    T(pm,'Polygon').forEach(p=>{const rings=[],ob=T(p,'outerBoundaryIs')[0];if(ob)rings.push(C(T(ob,'coordinates')[0]));
      T(p,'innerBoundaryIs').forEach(ib=>rings.push(C(T(ib,'coordinates')[0])));
      if(rings[0]&&rings[0].length>3)out.push({type:'Feature',properties:props,geometry:{type:'Polygon',coordinates:rings}})});});
  return{type:'FeatureCollection',features:out}}
function renderLayers(){const ul=document.getElementById('layers');ul.innerHTML='';
  // the built-in working-hours colours and labels, which can be switched off to see only your own layers
  const wh=document.createElement('li');wh.className='builtin';
  wh.innerHTML=`<input type="checkbox" ${showHours?'checked':''} aria-label="Show working hours"><i class="sw" style="background:linear-gradient(90deg,${BANDS.map((b,i)=>pal['b'+i]).join(',')})"></i><span>Working hours</span>`;
  wh.querySelector('input').onchange=e=>{showHours=e.target.checked;try{localStorage.setItem('whg.hours',showHours?'on':'off')}catch(err){}ui();draw()};ul.appendChild(wh);
  if(typeof clRow==='function'&&CL.data.length)ul.appendChild(clRow());
  overlays.forEach((L,i)=>{const li=document.createElement('li');
    li.innerHTML=`<input type="checkbox" ${L.on?'checked':''} aria-label="Show ${esc(L.name)}"><i class="sw" style="background:${L.color}"></i><span class="ln" title="${esc(L.name)} (double-click to rename)">${esc(L.name)}</span>`+
      `<button class="ed" aria-label="Rename ${esc(L.name)}" title="Rename"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button class="x" aria-label="Remove ${esc(L.name)}" title="Remove">×</button>`;
    li.querySelector('input').onchange=e=>{L.on=e.target.checked;draw();storeLayer(L)};
    li.querySelector('.x').onclick=()=>{if(selected&&selected.L===L){selected=null;hideInfo()}overlays.splice(i,1);renderLayers();draw();layerDB.del(L.id).catch(()=>{})};
    const rename=()=>{const sp=li.querySelector('.ln');if(!sp)return;const inp=document.createElement('input');inp.type='text';inp.className='lnin';inp.value=L.name;inp.maxLength=80;
      inp.setAttribute('aria-label','Layer name');sp.replaceWith(inp);inp.focus();inp.select();let done=false;
      const finish=keep=>{if(done)return;done=true;const v=inp.value.trim();if(keep&&v&&v!==L.name){L.name=v;storeLayer(L);draw()}renderLayers()};
      inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(true)}else if(e.key==='Escape'){e.preventDefault();finish(false)}};inp.onblur=()=>finish(true)};
    li.querySelector('.ed').onclick=rename;li.querySelector('.ln').ondblclick=rename;ul.appendChild(li)});}

// Colivings layer: every listing from colivingDB (https://colivingdb.com) as a dot on the globe, with filters
// tucked behind one button in Map layers, a details card per listing, and a check for new additions.
// data/coliving.json is refreshed by .github/workflows/coliving.yml (scripts/coliving.py update).
const CL={data:[],vis:[],byId:new Map(),on:true,sel:null,meta:null,f:null};
const CLT={p:{name:'Permanent coliving',short:'Permanent',col:'#2fb36a'},u:{name:'Pop-up or dated edition',short:'Pop-up',col:'#f08a24'},f:{name:'Nomad festival',short:'Festival',col:'#a35bd6'}};
const CL_MAX=3000,CL_STEP=50;
const CL_DEF={q:'',types:['p','u','f'],min:0,max:CL_MAX,nop:true,rooms:[],stay:0,rating:0,tags:[],vibes:[],region:'',month:''};
const CL_TAGS=['community','coworking','wellness','city','beach','rural','surf','island','mountain','eco','startup','ski'];
const CL_VIBES=['social','quiet','focused','creative','adventure','entrepreneur','luxury','budget','family-friendly','fitness','party','spiritual'];
const CL_NOT=new Set(['beach','surf','island','mountain','community','coworking','wellness','city','rural','eco','startup','ski','family','index','all','pop-ups','festivals']);
const clStore={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
CL.f=Object.assign({},CL_DEF,clStore.get('whg.clF',{}));CL.on=clStore.get('whg.clOn',true);
const clToday=()=>new Date().toISOString().slice(0,10);
const clEur=v=>'€'+Math.round(v).toLocaleString('en-GB');
const clActive=f=>JSON.stringify(Object.assign({},f,{q:f.q.trim()}))!==JSON.stringify(CL_DEF);

function clPass(x,f,now){
  if(!f.types.includes(x.t))return false;
  if(x.dr.length&&x.dr.every(r=>r[1]<now))return false;   // editions that have already finished
  if(f.q.trim()){const s=(x.n+' '+x.a+' '+x.c).toLowerCase();if(!f.q.trim().toLowerCase().split(/\s+/).every(w=>s.includes(w)))return false}
  if(f.region&&x.rg!==f.region)return false;
  if(f.min>0||f.max<CL_MAX){if(x.eur==null){if(!f.nop)return false}else if(x.eur<f.min||(f.max<CL_MAX&&x.eur>f.max))return false}
  if(f.rooms.length&&!f.rooms.some(r=>r==='dorm'?x.dorm:r==='private'?x.rm.some(m=>/private|apartment|studio/.test(m)):x.rm.includes(r)))return false;
  if(f.stay&&(x.ms==null||x.ms>f.stay))return false;
  if(f.rating&&(x.rt==null||x.rt<f.rating))return false;
  if(f.tags.length&&!f.tags.some(t=>x.tg.includes(t)))return false;
  if(f.vibes.length&&!f.vibes.some(t=>x.vb.includes(t)||(t==='wellness'&&x.tg.includes(t))))return false;
  if(f.month&&x.t!=='p'&&x.dr.length){const [y,m]=f.month.split('-').map(Number),s=f.month+'-01',e=f.month+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
    if(!x.dr.some(r=>r[0]<=e&&r[1]>=s))return false}
  return true;}
function clApply(){const now=clToday();CL.vis=CL.data.filter(x=>clPass(x,CL.f,now));CL.total=CL.data.filter(x=>!(x.dr.length&&x.dr.every(r=>r[1]<now))).length;clStore.set('whg.clF',CL.f);
  if(CL.sel&&!CL.vis.includes(CL.sel))CL.sel=null;clCounts();if(typeof draw==='function')draw();}
function clSetData(list,meta){CL.data=list.filter(x=>isFinite(x.lat)&&isFinite(x.lon)).map(x=>Object.assign(x,{v:vec(x.lon,x.lat),rm:x.rm||[],tg:x.tg||[],vb:x.vb||[],dr:x.dr||[]}));
  CL.byId=new Map(CL.data.map(x=>[x.id,x]));if(meta)CL.meta=meta;
  if(!clStore.get('whg.clSeen',null))clStore.set('whg.clSeen',CL.data.map(x=>x.id));   // first visit: nothing counts as new
  if(CL.sel)CL.sel=CL.byId.get(CL.sel.id)||null;clApply();clUpdText();}

// drawing: dots always (cheap, no overlap test), names once zoomed in close
function clProj(v){if(M[0]*v[0]+M[1]*v[1]+M[2]*v[2]<0.02)return null;return[cx+SC*(M[3]*v[0]+M[4]*v[1]),cy-SC*(M[6]*v[0]+M[7]*v[1]+M[8]*v[2])]}
function clDraw(){if(!CL.on||!CL.vis.length)return;const r=k<2?3:k<6?3.6:k<30?4.4:5.4;ctx.lineWidth=1.4;ctx.strokeStyle=pal.halo;
  for(const t of['p','u','f']){ctx.beginPath();let any=false;
    for(const x of CL.vis){if(x.t!==t)continue;const s=clProj(x.v);if(!s||s[0]<-8||s[1]<-8||s[0]>W+8||s[1]>H+8)continue;ctx.moveTo(s[0]+r,s[1]);ctx.arc(s[0],s[1],r,0,7);any=true}
    if(any){ctx.fillStyle=CLT[t].col;ctx.fill();ctx.stroke()}}
  if(CL.sel){const s=clProj(CL.sel.v);if(s){ctx.beginPath();ctx.arc(s[0],s[1],r+5,0,7);ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=CLT[CL.sel.t].col;ctx.lineWidth=2.5;ctx.stroke()}}}
function clLabels(cand){if(!CL.on||k<9)return;for(const x of CL.vis)cand.push({cl:x,v:x.v,lon:x.lon,lat:x.lat,name:x.n,pri:x===CL.sel?6e9:3e9+(x.rt||0),a:1})}
function clHit(x,y){if(!CL.on)return null;const lab=placed.find(q=>q.L.cl&&x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1);if(lab)return lab.L.cl;
  let best=null,bd=11;for(const it of CL.vis){const s=clProj(it.v);if(!s)continue;const d=Math.hypot(s[0]-x,s[1]-y);if(d<bd){bd=d;best=it}}return best}

// details card
function clShow(x){activeFav=null;draft=null;selected=null;CL.sel=x;clickPin=null;if(typeof infoTok!=='undefined')infoTok++;
  const T=CLT[x.t],isNew=x.add&&(Date.now()-new Date(x.add))/864e5<21,stay=x.ms==null?'':x.ms===1?'1 night':x.ms+' nights';
  const rows=[['Price',x.pr||(x.eur!=null?'≈ '+clEur(x.eur)+'/month':'')],['Rating',x.rt!=null?`${x.rt} ★${x.rv?` (${x.rv} review${x.rv===1?'':'s'})`:''}`:''],
    ['Rooms',x.rm.join(', ')],['Min stay',stay],['Dates',x.dt],['Opening',x.op],['WiFi',x.wf?x.wf+' Mbps':''],
    ['Interests',x.tg.join(', ')],['Vibe',x.vb.join(', ')]].filter(r=>r[1]);
  const links=[x.w&&`<a class="clbtn" href="${esc(x.w)}" target="_blank" rel="noopener noreferrer">Website ↗</a>`,x.db&&`<a class="clbtn" href="${esc(x.db)}" target="_blank" rel="noopener noreferrer">colivingDB ↗</a>`,
    x.sch&&x.sch!==x.w&&`<a class="clbtn" href="${esc(x.sch)}" target="_blank" rel="noopener noreferrer">Schedule ↗</a>`].filter(Boolean).join('');
  document.getElementById('infob').innerHTML=`<p class="cltype"><i style="background:${T.col}"></i>${T.name}${isNew?' <b class="clnew">New</b>':''}</p>
    <h2>${esc(x.n)}</h2><p class="where">${esc([x.a,x.c].filter(Boolean).join(', '))}</p>
    <dl class="meta">${rows.map(([a,b])=>`<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
    ${x.src==='estimate'&&x.eur!=null?'<p class="clsmall">Price is colivingDB’s estimate; check with the host.</p>':''}
    <div class="cllinks">${links}</div><div>${hoursBlock(tzAt([x.lon,x.lat]))}</div>${photosBlock()}${flightsBlock()}`;
  wireFlights([x.lon,x.lat]);photosLoad([x.lon,x.lat]);document.getElementById('info').classList.add('show');}
function clGo(x){if(!CL.vis.includes(x)){CL.f=Object.assign({},CL_DEF);clSync();clApply()}flyTo(x.lon,x.lat,0.6);clShow(x);draw()}

// Map layers row and the filter card
const FUNNEL='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>';
function clRow(){const li=document.createElement('li');li.className='builtin clrowli';
  li.innerHTML=`<input type="checkbox" ${CL.on?'checked':''} aria-label="Show colivings"><i class="sw" style="background:conic-gradient(${CLT.p.col} 0 50%,${CLT.u.col} 0 80%,${CLT.f.col} 0)"></i><span>Colivings</span><small class="clcnt" id="clcnt"></small>`+
    `<button class="ed clfb${clActive(CL.f)?' on':''}" id="clfb" aria-label="Filter colivings" title="Filter and updates" aria-expanded="${!document.getElementById('clf')?.hidden}">${FUNNEL}</button>`;
  li.querySelector('input').onchange=e=>{CL.on=e.target.checked;clStore.set('whg.clOn',CL.on);if(!CL.on&&CL.sel){CL.sel=null;hideInfo()}draw()};
  li.querySelector('.clfb').onclick=()=>clToggle();setTimeout(clCounts);return li}
function clCounts(){const c=document.getElementById('clcnt');if(c)c.textContent=CL.data.length?(CL.vis.length===CL.total?CL.total:`${CL.vis.length}/${CL.total}`):'';
  const b=document.getElementById('clfb');if(b)b.classList.toggle('on',clActive(CL.f));
  const s=document.getElementById('clshow');if(s)s.textContent=CL.vis.length?`Show ${CL.vis.length}`:'None match'}
function clToggle(open){let el=document.getElementById('clf');if(!el)el=clBuild();const show=open==null?el.hidden:open;el.hidden=!show;
  const b=document.getElementById('clfb');if(b)b.setAttribute('aria-expanded',String(show));if(show){clSync();el.querySelector('#clq').focus({preventScroll:true})}}
const chip=(k,v,label,dot)=>`<button type="button" class="clchip" data-k="${k}" data-v="${v}" aria-pressed="false">${dot?`<i style="background:${dot}"></i>`:''}${label}</button>`;
function clBuild(){const el=document.createElement('aside');el.className='clf glass';el.id='clf';el.hidden=true;el.setAttribute('aria-label','Coliving filters');
  const months=[...Array(12)].map((_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+i);return[d.toISOString().slice(0,7),d.toLocaleDateString('en-GB',{month:'long',year:'numeric'})]});
  const regions=[...new Set(CL.data.map(x=>x.rg).filter(Boolean))].sort();
  const pv=v=>`<option value="${v[0]}">${v[1]}</option>`;
  el.innerHTML=`<div class="clfh"><b>Colivings</b><button class="x" id="clfx" aria-label="Close filters">×</button></div>
    <input id="clq" class="flin" type="search" placeholder="Search name, town or country" autocomplete="off">
    <div class="clg"><span class="cll">Type</span><div class="clchips">${['p','u','f'].map(t=>chip('types',t,CLT[t].short,CLT[t].col)).join('')}</div></div>
    <div class="clg"><span class="cll">Price per month <output id="clpv"></output></span>
      <div class="dual"><div class="dtrack"><i id="clfill"></i></div><input type="range" id="clmin" min="0" max="${CL_MAX}" step="${CL_STEP}" aria-label="Minimum price per month"><input type="range" id="clmax" min="0" max="${CL_MAX}" step="${CL_STEP}" aria-label="Maximum price per month"></div>
      <label class="clchk"><input type="checkbox" id="clnop"> Include places without a monthly price</label></div>
    <div class="clg"><span class="cll">Rooms</span><div class="clchips">${chip('rooms','private','Private')}${chip('rooms','shared','Shared')}${chip('rooms','dorm','Dorm')}</div></div>
    <div class="clpair"><label><span class="cll">Minimum stay</span><select id="clstay" class="flin">${[[0,'Any'],[3,'Up to 3 nights'],[7,'Up to a week'],[14,'Up to 2 weeks'],[30,'Up to a month']].map(pv).join('')}</select></label>
      <label><span class="cll">Rating</span><select id="clrt" class="flin">${[[0,'Any'],[4.5,'4.5 ★ and up'],[4,'4 ★ and up'],[3.5,'3.5 ★ and up']].map(pv).join('')}</select></label></div>
    <div class="clpair"><label><span class="cll">Region</span><select id="clrg" class="flin"><option value="">Anywhere</option>${regions.map(r=>`<option>${esc(r)}</option>`).join('')}</select></label>
      <label><span class="cll">Pop-ups running in</span><select id="clmo" class="flin"><option value="">Any month</option>${months.map(pv).join('')}</select></label></div>
    <details class="clmore"><summary>Interests and vibe</summary><span class="cll">Interests</span><div class="clchips">${CL_TAGS.map(t=>chip('tags',t,t)).join('')}</div>
      <span class="cll">Vibe</span><div class="clchips">${CL_VIBES.map(t=>chip('vibes',t,t)).join('')}</div></details>
    <div class="clfoot"><button type="button" class="flb2" id="clreset">Reset</button><button type="button" class="primary" id="clshow"></button></div>
    <div class="clupd"><span class="cll">Updates from colivingDB</span><p class="clsmall" id="clupdtxt"></p>
      <button type="button" class="add" id="clchk">Check for new colivings</button><div id="clres" aria-live="polite"></div></div>`;
  document.body.appendChild(el);
  const $=id=>el.querySelector('#'+id),set=(k,v)=>{CL.f[k]=v;clApply();clSync()};
  $('clfx').onclick=()=>clToggle(false);$('clshow').onclick=()=>clToggle(false);
  $('clreset').onclick=()=>{CL.f=Object.assign({},CL_DEF);clApply();clSync()};
  $('clq').oninput=e=>{CL.f.q=e.target.value;clApply()};
  const rng=()=>{let a=+$('clmin').value,b=+$('clmax').value;if(a>b-CL_STEP){if(document.activeElement===$('clmin'))a=b-CL_STEP;else b=a+CL_STEP}CL.f.min=Math.max(0,a);CL.f.max=Math.min(CL_MAX,b);clApply();clSync()};
  $('clmin').oninput=rng;$('clmax').oninput=rng;$('clnop').onchange=e=>set('nop',e.target.checked);
  $('clstay').onchange=e=>set('stay',+e.target.value);$('clrt').onchange=e=>set('rating',+e.target.value);$('clrg').onchange=e=>set('region',e.target.value);$('clmo').onchange=e=>set('month',e.target.value);
  el.addEventListener('click',e=>{const c=e.target.closest('.clchip');if(!c)return;const k=c.dataset.k,v=c.dataset.v,a=CL.f[k].slice(),i=a.indexOf(v);
    if(i>=0)a.splice(i,1);else a.push(v);if(k==='types'&&!a.length)return;set(k,a)});
  $('clchk').onclick=clCheck;
  el.addEventListener('keydown',e=>{if(e.key==='Escape'){clToggle(false);document.getElementById('clfb')?.focus()}});
  return el}
function clSync(){const el=document.getElementById('clf');if(!el)return;const f=CL.f,$=id=>el.querySelector('#'+id);
  if($('clq').value!==f.q)$('clq').value=f.q;$('clmin').value=f.min;$('clmax').value=f.max;$('clnop').checked=f.nop;
  $('clpv').textContent=f.min<=0&&f.max>=CL_MAX?'any':f.max>=CL_MAX?`${clEur(f.min)}+`:f.min<=0?`up to ${clEur(f.max)}`:`${clEur(f.min)}–${clEur(f.max)}`;
  $('clfill').style.left=(f.min/CL_MAX*100)+'%';$('clfill').style.right=(100-f.max/CL_MAX*100)+'%';
  $('clnop').closest('label').style.opacity=f.min>0||f.max<CL_MAX?1:.5;
  $('clstay').value=String(f.stay);$('clrt').value=String(f.rating);$('clrg').value=f.region;$('clmo').value=f.month;
  el.querySelectorAll('.clchip').forEach(c=>c.setAttribute('aria-pressed',String(f[c.dataset.k].includes(c.dataset.v))));
  if(f.tags.length||f.vibes.length)el.querySelector('.clmore').open=true;clCounts();clUpdText()}
function clUpdText(){const p=document.getElementById('clupdtxt');if(!p||!CL.meta)return;const m=CL.meta,d=new Date(m.checked);
  p.textContent=`${m.source==='KML export'?'List from your colivingDB export of':'Last scanned'} ${d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}. A scan runs every Monday.`+(m.error?' The last scan couldn’t read colivingDB, so nothing changed.':'')}
function clRepo(){const h=location.hostname,p=location.pathname.split('/').filter(Boolean);return h.endsWith('.github.io')&&p[0]?`https://github.com/${h.split('.')[0]}/${p[0]}`:'https://github.com/granterogers/working_hours_globe'}
async function clCheck(){const res=document.getElementById('clres'),btn=document.getElementById('clchk');btn.disabled=true;res.innerHTML='<p class="clsmall">Checking…</p>';
  let fresh,meta;
  try{const nc={cache:'no-store'},t=Date.now();[fresh,meta]=await Promise.all([fetch('data/coliving.json?t='+t,nc).then(r=>{if(!r.ok)throw 0;return r.json()}),fetch('data/coliving-updates.json?t='+t,nc).then(r=>r.ok?r.json():null).catch(()=>null)])}
  catch(e){res.innerHTML='<p class="clsmall">Couldn’t load the coliving list. Try again in a moment.</p>';btn.disabled=false;return}
  const seen=new Set(clStore.get('whg.clSeen',[])),newer=fresh.filter(x=>!seen.has(x.id)).map(x=>x.id),gone=[...seen].filter(id=>!fresh.some(x=>x.id===id)).length;
  clSetData(fresh,meta);clStore.set('whg.clSeen',fresh.map(x=>x.id));
  // a direct look at colivingDB too, for listings newer than the last scan (only works if colivingDB allows it)
  let live=null;try{const r=await fetch('https://colivingdb.com/sitemap.xml',{cache:'no-store'});if(r.ok){const xml=await r.text();
    if(/\/coliving\//.test(xml))live=[...new Set([...xml.matchAll(/\/coliving\/([a-z0-9-]+)\//g)].map(m=>m[1]))].filter(s=>!CL_NOT.has(s)&&!CL.byId.has(s))}}catch(e){}
  const items=newer.map(id=>CL.byId.get(id)).filter(Boolean);
  let h=items.length?`<p class="clsum"><b>${items.length} new</b> since you last checked:</p><ul class="cllist">${items.map(x=>`<li><button type="button" data-id="${esc(x.id)}"><i style="background:${CLT[x.t].col}"></i><span><b>${esc(x.n)}</b><small>${esc([x.a,x.c].filter(Boolean).join(', '))}${x.eur!=null?' · ≈ '+clEur(x.eur)+'/month':''}</small></span></button></li>`).join('')}</ul>`
    :'<p class="clsum">No new colivings since you last checked.</p>';
  if(gone)h+=`<p class="clsmall">${gone} listing${gone===1?' has':'s have'} been dropped by colivingDB and removed from the map.</p>`;
  if(live&&live.length&&live.length<60)h+=`<p class="clsmall">colivingDB also lists ${live.length} not on the map yet; they’ll appear with full details after the next scan:</p><ul class="cllist">${live.map(s=>`<li><a href="https://colivingdb.com/coliving/${s}/" target="_blank" rel="noopener noreferrer">${esc(s.replace(/-/g,' '))} ↗</a></li>`).join('')}</ul>`;
  h+=`<p class="clsmall">Want a fresh scan now? <a href="${clRepo()}/actions/workflows/coliving.yml" target="_blank" rel="noopener noreferrer">Run it on GitHub ↗</a> (press “Run workflow”, then check again in a few minutes).</p>`;
  res.innerHTML=h;btn.disabled=false;
  res.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>{const x=CL.byId.get(b.dataset.id);if(x)clGo(x)})}

Promise.all([fetch('data/coliving.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}),fetch('data/coliving-updates.json').then(r=>r.ok?r.json():null).catch(()=>null)])
  .then(([list,meta])=>{clSetData(list,meta);if(typeof renderLayers==='function')renderLayers()}).catch(()=>{});

// Photos near a clicked spot, from open sources that need no key: Wikimedia Commons, Wikidata, iNaturalist,
// Panoramax, KartaView and OpenStreetMap. All are asked at once; results are merged, de-duplicated and
// sorted nearest first. The search widens (500 m → 2 km → 10 km → 50 km) until about ten photos turn up.
// Any source that fails is skipped. Mapillary is used too if a token is set in this browser
// (localStorage 'whg.mapillary'); none is built in, since a public page would expose it.
const PH={cache:new Map(),list:[],tok:0,box:null,grid:null,i:0};
(()=>{const m=/[#&]mapillary=([^&]+)/.exec(location.hash);if(!m)return;try{localStorage.setItem('whg.mapillary',decodeURIComponent(m[1]))}catch(e){}
  history.replaceState(null,'',location.pathname+location.search)})();
const PH_RADII=[500,2000,10000,50000],PH_WANT=10,PH_SHOW=6;
const phDist=(a,b,c,d)=>{const R=6371000,r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const phFmtD=m=>m<10?'<10 m':m<1000?Math.round(m/10)*10+' m':m<10000?(m/1000).toFixed(1)+' km':Math.round(m/1000)+' km';
const phStrip=h=>{const d=document.createElement('div');d.innerHTML=String(h||'');return d.textContent.replace(/\s+/g,' ').trim()};
const phJSON=(u,o)=>fetch(u,o).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()});
const phTimeout=(p,ms)=>Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(new Error('timeout')),ms))]);
const phFile=t=>String(t||'').replace(/^(File|Image):/i,'').replace(/_/g,' ').trim();
const phFilePath=(f,w)=>`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f.replace(/ /g,'_'))}?width=${w}`;
function phBox(lat,lon,m){const dl=m/111320,dn=m/(111320*Math.max(0.2,Math.cos(lat*Math.PI/180)));return[lon-dn,lat-dl,lon+dn,lat+dl]}

// --- sources: each returns [{key,thumb,full,lat,lon,src,author,lic,date,link,title}] ---
async function phCommons(lat,lon,r){const rad=Math.min(r,10000);
  const u=`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${rad}&ggsnamespace=6&ggslimit=50&prop=imageinfo|coordinates&iiprop=url|extmetadata|size|mime&iiurlwidth=400&iiextmetadatafilter=Artist|LicenseShortName|DateTimeOriginal|ObjectName|Categories|ImageDescription`;
  const j=await phJSON(u);return Object.values((j.query||{}).pages||{}).map(p=>{const ii=(p.imageinfo||[])[0],c=(p.coordinates||[])[0];if(!ii||!c||!/^image\/(jpeg|png|webp)/.test(ii.mime||''))return null;const m=ii.extmetadata||{};
    if(ii.width&&ii.width<500)return null;const off=PH_NATURE.test(phFile(p.title))||phOff(phAbout(phFile(p.title),m));
    return{off,key:'c:'+phFile(p.title),thumb:ii.thumburl||ii.url,full:ii.width>1600?(ii.thumburl||'').replace(/\/\d+px-/,'/1600px-'):ii.url,lat:c.lat,lon:c.lon,src:'Wikimedia Commons',
      author:phStrip(m.Artist&&m.Artist.value),lic:phStrip(m.LicenseShortName&&m.LicenseShortName.value),date:phStrip(m.DateTimeOriginal&&m.DateTimeOriginal.value).slice(0,10),link:ii.descriptionurl,title:phStrip(m.ObjectName&&m.ObjectName.value)||phFile(p.title).replace(/\.\w+$/,'')}}).filter(Boolean)}
async function phWikidata(lat,lon,r){const km=Math.min(r,50000)/1000;
  const q=`SELECT ?item ?itemLabel ?img ?coord WHERE { SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral; wikibase:radius "${km}". } ?item wdt:P18 ?img. SERVICE wikibase:label { bd:serviceParam wikibase:language "en,[AUTO_LANGUAGE]". } } LIMIT 60`;
  const j=await phJSON('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(q),{headers:{Accept:'application/sparql-results+json'}});
  return(j.results.bindings||[]).map(b=>{const m=/Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);if(!m)return null;const f=phFile(decodeURIComponent(b.img.value.split('/').pop()));
    return{key:'c:'+f,file:f,thumb:phFilePath(f,400),full:phFilePath(f,1600),lat:+m[2],lon:+m[1],src:'Wikidata',author:'',lic:'',date:'',link:b.item.value,title:b.itemLabel?b.itemLabel.value:''}}).filter(Boolean)}
async function phINat(lat,lon,r){const j=await phJSON(`https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lon}&radius=${Math.max(0.1,r/1000)}&photos=true&per_page=40&order_by=observed_on&quality_grade=research`);
  const out=[];for(const o of j.results||[]){const loc=String(o.location||'').split(',').map(Number);if(loc.length<2||!isFinite(loc[0]))continue;const p=(o.photos||[])[0];if(!p||!p.url)continue;
    const t=o.taxon||{};out.push({key:'i:'+p.id,thumb:p.url.replace('square','medium'),full:p.url.replace('square','large'),lat:loc[0],lon:loc[1],src:'iNaturalist',
      author:(o.user&&(o.user.name||o.user.login))||'',lic:p.license_code?p.license_code.toUpperCase():'All rights reserved',date:o.observed_on||'',link:o.uri||`https://www.inaturalist.org/observations/${o.id}`,title:t.preferred_common_name||t.name||'Observation'})}
  return out}
async function phPanoramax(lat,lon,r){const b=phBox(lat,lon,Math.min(r,5000)).map(v=>v.toFixed(5)).join(',');
  const j=await phJSON(`https://api.panoramax.xyz/api/search?bbox=${b}&limit=20`);
  return(j.features||[]).map(f=>{const a=f.assets||{},th=a.thumb||Object.values(a).find(x=>(x.roles||[]).includes('thumbnail')),sd=a.sd||Object.values(a).find(x=>(x.roles||[]).includes('visual'))||a.hd;
    const g=f.geometry&&f.geometry.coordinates;if(!th||!g)return null;const pr=f.properties||{},prov=(f.providers||pr.providers||[]).map(x=>x.name).filter(Boolean)[0];
    return{key:'p:'+f.id,thumb:th.href,full:(sd||th).href,lat:g[1],lon:g[0],src:'Panoramax',author:prov||'',lic:pr.license||'',date:String(pr.datetime||'').slice(0,10),
      link:`https://api.panoramax.xyz/?pic=${encodeURIComponent(f.id)}&focus=pic`,title:'Street-level photo'}}).filter(Boolean)}
async function phKarta(lat,lon,r){const fd=new URLSearchParams({lat,lng:lon,radius:Math.min(r,5000)});
  const j=await phJSON('https://api.openstreetcam.org/1.0/list/nearby-photos/',{method:'POST',body:fd});
  const items=j.currentPageItems||j.osv&&j.osv.photos||[];
  return items.map(p=>{const la=+p.lat,lo=+(p.lng||p.lon);if(!isFinite(la)||!isFinite(lo)||!(p.lth_name||p.th_name))return null;const base='https://api.openstreetcam.org/';
    return{key:'k:'+p.id,thumb:base+(p.th_name||p.lth_name),full:base+(p.lth_name||p.name||p.th_name),lat:la,lon:lo,src:'KartaView',author:p.username||'',lic:'CC BY-SA 4.0',
      date:String(p.shot_date||p.date_added||'').slice(0,10),link:p.sequence_id?`https://kartaview.org/details/${p.sequence_id}/${p.sequence_index||0}`:'https://kartaview.org/',title:'Street-level photo'}}).filter(Boolean)}
async function phOverpass(lat,lon,r){const rad=Math.min(r,2000);
  const q=`[out:json][timeout:5];nwr(around:${rad},${lat},${lon})[~"^(image|wikimedia_commons)$"~"."];out center tags 40;`;
  const j=await phJSON('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  const out=[];for(const e of j.elements||[]){const t=e.tags||{},la=e.lat??(e.center&&e.center.lat),lo=e.lon??(e.center&&e.center.lon);if(la==null)continue;
    const name=t['name:en']||t.name||'';const link=`https://www.openstreetmap.org/${e.type}/${e.id}`;
    const wc=t.wikimedia_commons;if(wc&&/^File:/i.test(wc)){const f=phFile(wc);out.push({key:'c:'+f,file:f,thumb:phFilePath(f,400),full:phFilePath(f,1600),lat:la,lon:lo,src:'OpenStreetMap',author:'',lic:'',date:'',link,title:name});continue}
    const im=t.image;if(im&&/^https:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(im))out.push({key:'u:'+im,thumb:im,full:im,lat:la,lon:lo,src:'OpenStreetMap',author:'',lic:'See source',date:'',link,title:name});
    else if(im&&/^File:/i.test(im)){const f=phFile(im);out.push({key:'c:'+f,file:f,thumb:phFilePath(f,400),full:phFilePath(f,1600),lat:la,lon:lo,src:'OpenStreetMap',author:'',lic:'',date:'',link,title:name})}}
  return out}
async function phMapillary(lat,lon,r){let tok='';try{tok=localStorage.getItem('whg.mapillary')||''}catch(e){}if(!tok)return[];
  // one small box (the API is slow on big ones); 360° panoramas are skipped since their thumbnails are mostly sky
  const b=phBox(lat,lon,Math.min(r,1000)).map(v=>v.toFixed(5)).join(',');
  const j=await phJSON(`https://graph.mapillary.com/images?fields=id,is_pano,thumb_256_url,thumb_1024_url,captured_at,geometry,creator&bbox=${b}&limit=50`,{headers:{Authorization:'OAuth '+tok}});
  return(j.data||[]).map(p=>{const g=p.geometry&&p.geometry.coordinates;if(!g||p.is_pano)return null;
    return{key:'m:'+p.id,thumb:p.thumb_256_url,full:p.thumb_1024_url||p.thumb_256_url,lat:g[1],lon:g[0],src:'Mapillary',author:(p.creator&&p.creator.username)||'',lic:'CC BY-SA (© Mapillary contributors)',
      date:p.captured_at?new Date(p.captured_at).toISOString().slice(0,10):'',link:`https://www.mapillary.com/app/?pKey=${p.id}`,title:'Street-level photo'}}).filter(Boolean)}
// iNaturalist is left out: its photos are close-ups of plants and animals rather than the place itself
// KartaView is left out: its API no longer answers from browsers
const PH_SOURCES=[phCommons,phWikidata,phPanoramax,phOverpass,phMapillary],PH_WAIT=5000;
const PH_NATURE=/\b(bird|insect|butterfl|moth|beetle|bee|wasp|spider|dragonfl|lizard|gecko|snake|frog|caterpillar|larva|fung|lichen|moss|seed|leaf|leaves|flower|petal|specimen|herbarium|ant|fly|snail|crab|mushroom)s?\b|\b[A-Z][a-z]+ [a-z]{4,} \(|\b[A-Z][a-z]+_[a-z]{4,}\b/i;
const PH_STREET=new Set(['Panoramax','KartaView','Mapillary']);
// subjects that aren't the place itself: sea life and diving, wildlife and plants, food, people, vehicles being
// spotted, maps and documents. Matched against Commons categories and descriptions as well as file names.
const PH_OFFTOPIC=new RegExp(['under ?water','diving','\\bdivers?\\b','scuba','snorkel','marine (life|fauna|animals|biology|organisms)','sea ?life','\\bfish(es)?\\b','actinopterygii','elasmobranch',
  '\\brays?\\b','stingrays?','batoidea','dasyatis','taeniura','sharks?','whales?','dolphins?','cetacea','sea turtles?','octopus','cephalopod','jellyfish','nudibranch','crustacea','corals?\\b','sponges?\\b','echinoderm',
  'fauna','\\bflora\\b','animals','mammals','reptiles','amphibians','birds','\\baves\\b','insects','arthropod','lepidoptera','coleoptera','hymenoptera','diptera','arachnid','spiders','plants','botan','taxon','species','specimens',
  'herbarium','fungi','lichens','close-?up','macro photograph','\\bfood','dishes','cuisine','portraits?\\b','people of','selfie','aircraft','airliner','aviation photograph','\\bregistration','buses in','trams in',
  'locomotive','maps? of','diagrams?','\\blogos?\\b','\\bdocuments?\\b','screenshots?','scans? of','coats? of arms','postage stamps'].join('|'),'i');
// a category or title that is just a species' Latin name (e.g. "Pinus canariensis")
const PH_LATIN=/(^|\|)\s*[A-Z][a-z]+ [a-z]+(ensis|ii|ae|us|um|oides|ata|atus|ana|iana|ica|icum|icus|aria|ella|ina|inus)\b[^|]{0,12}(\||$)/;
const phOff=t=>PH_OFFTOPIC.test(t)||PH_LATIN.test(t);
const phAbout=(file,m)=>[file,m&&m.Categories&&m.Categories.value,phStrip(m&&m.ImageDescription&&m.ImageDescription.value).slice(0,300)].join(' | ');
// author and licence for Commons files found through Wikidata or OpenStreetMap
async function phFillCommons(list){const need=list.filter(p=>p.file&&!p.lic).slice(0,50);if(!need.length)return;
  try{const j=await phTimeout(phJSON('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=Artist|LicenseShortName|DateTimeOriginal|Categories|ImageDescription&titles='+encodeURIComponent(need.map(p=>'File:'+p.file).join('|'))),8000);
    const by={};for(const p of Object.values((j.query||{}).pages||{})){const ii=(p.imageinfo||[])[0];if(ii)by[phFile(p.title)]=ii}
    for(const p of need){const ii=by[p.file];if(!ii)continue;const m=ii.extmetadata||{};p.author=phStrip(m.Artist&&m.Artist.value);p.lic=phStrip(m.LicenseShortName&&m.LicenseShortName.value);
      p.date=p.date||phStrip(m.DateTimeOriginal&&m.DateTimeOriginal.value).slice(0,10);p.commons=ii.descriptionurl;if(phOff(phAbout(p.file,m)))p.off=true}}catch(e){}}

// Each radius asks every source at once and reports as each one answers (onUpdate(list,radius,done));
// a source that takes longer than PH_WAIT is dropped for that step so one slow server can't hold things up.
function phRank(seen){
  // street-level cameras take a frame every few metres; keep one per ~60 m so the same road doesn't fill the grid,
  // and rank them after photos of the place itself (landmarks, views, buildings) at a similar distance
  // photos pinned to a generic spot (an island's or town's centre) pile up on exactly the same coordinates;
  // three or more Commons/OpenStreetMap photos sharing one point are treated as unlocated and left out
  const at={},spot=p=>p.lat.toFixed(5)+','+p.lon.toFixed(5),own=p=>!PH_STREET.has(p.src)&&p.src!=='Wikidata';
  for(const p of seen.values())if(own(p))at[spot(p)]=(at[spot(p)]||0)+1;
  const all=[...seen.values()].filter(p=>!p.off&&!(own(p)&&at[spot(p)]>=3)).sort((a,b)=>a.d-b.d),kept=[],street=[];
  for(const p of all){if(PH_STREET.has(p.src)){if(street.some(q=>phDist(p.lat,p.lon,q.lat,q.lon)<60))continue;street.push(p)}kept.push(p)}
  return kept.sort((a,b)=>a.d*(PH_STREET.has(a.src)?2:1)-b.d*(PH_STREET.has(b.src)?2:1))}
async function phSearch(lat,lon,onUpdate){const seen=new Map();let radius=0;
  const add=(got,r)=>{for(const p of got){const k=p.key.toLowerCase();const d=phDist(lat,lon,p.lat,p.lon);if(d>r*1.05)continue;
    const prev=seen.get(k);if(!prev||(prev.src==='Wikidata'||prev.src==='OpenStreetMap')&&p.src==='Wikimedia Commons')seen.set(k,Object.assign({},p,{d}))}};
  for(const r of PH_RADII){radius=r;const key=lat.toFixed(4)+','+lon.toFixed(4)+','+r;
    let got=PH.cache.get(key);
    if(got){add(got,r)}else{got=[];
      await Promise.allSettled(PH_SOURCES.map(f=>phTimeout(f(lat,lon,r),PH_WAIT).then(v=>{got.push(...v);add(v,r);if(onUpdate(phRank(seen),r,false)===false)throw 0})));
      PH.cache.set(key,got);if(PH.cache.size>60)PH.cache.delete(PH.cache.keys().next().value)}
    if(onUpdate(phRank(seen),r,false)===false)return;
    if(phRank(seen).length>=PH_WANT)break;}
  const list=phRank(seen);onUpdate(list,radius,true);
  // files found through Wikidata or OpenStreetMap get their categories checked too, then the list is re-ranked
  await phFillCommons(list);if(list.some(p=>p.off))onUpdate(phRank(seen),radius,true)}

// --- card section ---
// The search starts as soon as the card opens; the thumbnails only show once the Photos button is pressed.
const photosBlock=()=>`<div class="phs" id="phs"><button type="button" class="phbtn" id="phbtn" aria-expanded="false" aria-controls="phg"><span>Photos nearby</span><small id="phst">Searching…</small><i class="phchev" aria-hidden="true">›</i></button><div class="phg" id="phg" hidden></div></div>`;
function photosLoad(ll){if(!ll)return;const tok=++PH.tok;PH.list=[];PH.done=false;PH.radius=0;PH.sig='';
  const btn=document.getElementById('phbtn');if(btn)btn.onclick=()=>{const g=document.getElementById('phg');const open=g.hidden;g.hidden=!open;btn.setAttribute('aria-expanded',open);if(open)photosRender(true)};
  phSearch(ll[1],ll[0],(list,r,done)=>{if(tok!==PH.tok||!document.getElementById('phg'))return false;PH.list=list;PH.radius=r;PH.done=done;photosRender()})}
function photosRender(force){const st=document.getElementById('phst'),g=document.getElementById('phg'),btn=document.getElementById('phbtn');if(!st||!g)return;
  const n=PH.list.length;
  st.textContent=PH.done?(n?`${n} within ${phFmtD(PH.radius)}`:`none within ${phFmtD(PH.radius)}`):n?`${n} so far…`:'Searching…';
  btn.classList.toggle('empty',PH.done&&!n);
  if(g.hidden)return;
  if(!n){PH.sig='';g.innerHTML=PH.done?`<p class="clsmall">No photos found within ${phFmtD(PH.radius)}.</p>`:Array(6).fill('<span class="phsk"></span>').join('');return}
  const shown=PH.list.slice(0,PH_SHOW),more=n>PH_SHOW,sig=shown.map(p=>p.key).join('|')+'#'+(more?n:0);
  if(sig===PH.sig&&!force)return;PH.sig=sig;
  g.innerHTML=shown.map((p,i)=>{const m=i===PH_SHOW-1&&more;
    return`<button type="button" class="pht" data-i="${i}" title="${esc([p.title,phFmtD(p.d)+' away',p.src,p.author&&'© '+p.author,p.lic,p.date].filter(Boolean).join(' · '))}" aria-label="${esc((p.title||'Photo')+', '+phFmtD(p.d)+' away, '+p.src)}">`+
      `<img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.pht').classList.add('bad')">`+
      (m?`<b class="phmore">+${n-PH_SHOW+1}</b>`:'')+`</button>`}).join('')+(shown.length<PH_SHOW&&!PH.done?'<span class="phsk"></span>'.repeat(PH_SHOW-shown.length):'');
  g.querySelectorAll('.pht').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;if(i===PH_SHOW-1&&PH.list.length>PH_SHOW)phGrid();else phOpen(i)})}

// --- full-size gallery: 80% of the screen, arrows by click, keyboard or swipe ---
// The app behind the gallery is shown softened by painting a blurred snapshot of the globe onto one plain canvas
// under the gallery. (Blurring the live page with CSS filters made Edge/Chrome draw the gallery in the wrong
// place on high-DPI screens.) The snapshot is a downscale-then-upscale, which blurs in every browser.
function phBlur(on){let bg=document.getElementById('phbg');
  if(!on){if(bg)bg.hidden=true;window.removeEventListener('resize',phBgPaint);return}
  if(!bg){bg=document.createElement('div');bg.id='phbg';bg.setAttribute('aria-hidden','true');document.body.appendChild(bg)}
  bg.hidden=false;phBgPaint();window.addEventListener('resize',phBgPaint)}
function phBgPaint(){const bg=document.getElementById('phbg');if(!bg||bg.hidden)return;const w=innerWidth,h=innerHeight;
  const big=document.createElement('canvas');big.width=Math.round(w/2);big.height=Math.round(h/2);const g=big.getContext('2d');
  const sm=document.createElement('canvas');sm.width=Math.max(1,Math.round(w/14));sm.height=Math.max(1,Math.round(h/14));const s2=sm.getContext('2d');
  s2.imageSmoothingEnabled=true;s2.imageSmoothingQuality='high';
  try{s2.drawImage(sc,0,0,sm.width,sm.height)}catch(e){}s2.drawImage(cv,0,0,sm.width,sm.height);
  g.fillStyle=getComputedStyle(document.body).backgroundColor||'#0b1020';g.fillRect(0,0,big.width,big.height);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(sm,0,0,big.width,big.height);
  g.fillStyle=dark?'rgba(8,12,24,.3)':'rgba(255,255,255,.2)';g.fillRect(0,0,big.width,big.height);
  try{bg.style.backgroundImage=`url(${big.toDataURL('image/jpeg',.82)})`}catch(e){bg.style.backgroundImage=''}}
function phGrid(){if(!PH.list.length)return;let el=PH.grid;
  if(!el){el=PH.grid=document.createElement('div');el.className='phgrid';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','All photos nearby');
    el.innerHTML=`<div class="phgp"><div class="phgh"><b></b><button class="phx" aria-label="Close">×</button></div><div class="phgl"></div></div>`;document.body.appendChild(el);
    el.querySelector('.phx').onclick=phGridClose;el.addEventListener('click',e=>{if(e.target===el)phGridClose()})}
  el.querySelector('.phgh b').textContent=`${PH.list.length} photos nearby`;
  el.querySelector('.phgl').innerHTML=PH.list.map((p,i)=>`<button type="button" class="pht" data-i="${i}" title="${esc([p.title,phFmtD(p.d)+' away',p.src].filter(Boolean).join(' · '))}" aria-label="${esc((p.title||'Photo')+', '+p.src)}"><img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.pht').classList.add('bad')"></button>`).join('');
  el.querySelectorAll('.pht').forEach(b=>b.onclick=()=>phOpen(+b.dataset.i,true));
  el.hidden=false;phBlur(true);PH.prevFocus=PH.prevFocus&&PH.box&&!PH.box.hidden?PH.prevFocus:document.activeElement;document.addEventListener('keydown',phGridKey,true);el.querySelector('.pht')?.focus({preventScroll:true})}
function phGridClose(){if(!PH.grid)return;PH.grid.hidden=true;document.removeEventListener('keydown',phGridKey,true);if(!PH.box||PH.box.hidden){phBlur(false);if(PH.prevFocus&&PH.prevFocus.focus)PH.prevFocus.focus({preventScroll:true})}}
function phGridKey(e){if(PH.box&&!PH.box.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();phGridClose()}}
function phOpen(i,fromGrid){if(!PH.list.length)return;let el=PH.box;PH.fromGrid=!!fromGrid;
  if(!el){el=PH.box=document.createElement('div');el.className='phbox';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Photo gallery');
    el.innerHTML=`<button class="phx" aria-label="Close gallery">×</button><button class="pha phprev" aria-label="Previous photo">‹</button><figure><div class="phimg"><img alt="" referrerpolicy="no-referrer"><span class="phspin"></span></div><figcaption></figcaption></figure><button class="pha phnext" aria-label="Next photo">›</button><button class="phall" aria-label="Show all photos">▦ All photos</button>`;
    document.body.appendChild(el);
    el.querySelector('.phx').onclick=phClose;el.querySelector('.phall').onclick=()=>{phClose(true);phGrid()};el.querySelector('.phprev').onclick=()=>phGo(-1);el.querySelector('.phnext').onclick=()=>phGo(1);
    el.addEventListener('click',e=>{if(e.target===el)phClose()});
    const img=el.querySelector('img');img.onload=()=>el.classList.remove('loading');img.onerror=()=>{const p=PH.list[PH.i];if(p&&img.src!==p.thumb){img.src=p.thumb}else el.classList.remove('loading')};
    let sx=null;el.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});el.addEventListener('touchend',e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50)phGo(dx<0?1:-1);sx=null})}
  if(!PH.fromGrid)PH.prevFocus=document.activeElement;if(PH.grid)PH.grid.hidden=true;el.hidden=false;phBlur(true);document.addEventListener('keydown',phKey,true);phShow(i);el.querySelector('.phnext').focus({preventScroll:true})}
function phShow(i){const n=PH.list.length;PH.i=(i+n)%n;const p=PH.list[PH.i],el=PH.box,img=el.querySelector('img');el.classList.add('loading');img.src=p.full;img.alt=p.title||'Photo';
  const credit=[p.author?'© '+p.author:'',p.lic].filter(Boolean).join(' · ')||'Licence: see source';
  el.querySelector('figcaption').innerHTML=`<b>${esc(p.title||'Photo')}</b><span>${phFmtD(p.d)} away · ${esc(p.src)}${p.date?' · '+esc(p.date):''}</span><span>${esc(credit)}</span>`+
    `<span class="phlinks"><a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">Original ↗</a>${p.commons&&p.commons!==p.link?` <a href="${esc(p.commons)}" target="_blank" rel="noopener noreferrer">Commons file ↗</a>`:''}<em>${PH.i+1} / ${n}</em></span>`;
  el.querySelectorAll('.pha').forEach(b=>b.hidden=n<2);
  for(const d of[1,-1]){const q=PH.list[(PH.i+d+n)%n];if(q){const im=new Image();im.referrerPolicy='no-referrer';im.src=q.full}}}
function phGo(d){phShow(PH.i+d)}
function phClose(toGrid){if(!PH.box)return;PH.box.hidden=true;document.removeEventListener('keydown',phKey,true);
  if(toGrid!==true&&PH.fromGrid){phGrid();return}if(toGrid!==true){phBlur(false);if(PH.prevFocus&&PH.prevFocus.focus)PH.prevFocus.focus({preventScroll:true})}}
function phKey(e){if(e.key==='ArrowRight'){phGo(1)}else if(e.key==='ArrowLeft'){phGo(-1)}else if(e.key==='Escape'){phClose()}
  else if(e.key==='Tab'){const f=[...PH.box.querySelectorAll('button:not([hidden]),a')];const a=f.indexOf(document.activeElement);e.preventDefault();f[(a+(e.shiftKey?-1:1)+f.length)%f.length].focus()}
  else return;e.preventDefault();e.stopPropagation()}

// start
window.addEventListener('resize',resize);setSeason(season);theme();resize();
const intro=()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches){k=kT=1;draw();return}
  const t0=performance.now(),r0=[-70,-20,0],r1=rot.slice();
  fly={t0,dur:2200,ir:d3.interpolate(r0,r1),ik:t=>Math.log(0.7)+(Math.log(1)-Math.log(0.7))*t};kick();};
intro();
const fontsReady=document.fonts?Promise.all([document.fonts.load(F.cn),document.fonts.load(F.pn),document.fonts.load(F.hr)]):Promise.resolve();
fontsReady.then(()=>{for(const x in mcache)delete mcache[x];draw()});
setTimeout(()=>document.getElementById('toast').classList.add('hide'),4500);
setTimeout(()=>document.getElementById('toast').remove(),5600);
}
