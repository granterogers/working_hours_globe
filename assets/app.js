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
const DEG=180/Math.PI, MINK=0.85, MAXK=260;
let S=12,E=20,season=0,W=0,H=0,dpr=1,base=300,cx=0,cy=0;
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
TZHIT.features.forEach(f=>fixGeom(f.geometry));['tz','tzL','tzM','cb','cbL','cbM','pb','pbM','gaps'].forEach(n=>prep(D[n]));
const csize=c=>{const b=c[5];let w=b[2]-b[0];if(w>300)w=160;return Math.max(w,b[3]-b[1])};
const cByIso={};D.countries.forEach(c=>{c.size=csize(c);c.np=0;cByIso[c[4]]=c});
D.prov.forEach(p=>{const c=cByIso[p[4]];if(c)c.np++;p.v=vec(p[1],p[2])});D.countries.forEach(c=>c.v=vec(c[1],c[2]));

const cv=document.getElementById('c'),ctx=cv.getContext('2d'),sc=document.getElementById('stars');
const proj=d3.geoOrthographic().clipAngle(90).precision(0.35),path=d3.geoPath(proj,ctx),grat=d3.geoGraticule10();

function theme(){dark=!matchMedia('(prefers-color-scheme: light)').matches;
  if(document.documentElement.dataset.theme)dark=document.documentElement.dataset.theme==='dark';
  pal=dark?{oceanIn:'#163a68',oceanOut:'#071630',glow:'rgba(110,170,255,',grat:'rgba(170,200,255,.07)',border:'rgba(8,14,30,.55)',pb:'rgba(8,14,30,.28)',
            ink:'#f6f7fb',ink2:'rgba(226,232,246,.82)',halo:'rgba(5,10,24,.82)',shadeLite:'rgba(255,255,255,.10)',shadeDark:'rgba(0,4,16,.55)',coast1:'rgba(120,190,255,.07)',coast2:'rgba(140,200,255,.14)'}
          :{oceanIn:'#d4e6f8',oceanOut:'#9dbfe2',glow:'rgba(120,170,235,',grat:'rgba(30,70,130,.08)',border:'rgba(255,255,255,.85)',pb:'rgba(255,255,255,.55)',
            ink:'#111a30',ink2:'rgba(30,42,70,.85)',halo:'rgba(255,255,255,.9)',shadeLite:'rgba(255,255,255,.22)',shadeDark:'rgba(20,40,80,.22)',coast1:'rgba(255,255,255,.25)',coast2:'rgba(255,255,255,.45)'};
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

const F={cn:'600 13.5px Fraunces, Georgia, serif',pn:'500 11.5px "Bricolage Grotesque", "Segoe UI", sans-serif',hr:'700 12.5px "Bricolage Grotesque", "Segoe UI", sans-serif',ov:'600 12px "Bricolage Grotesque", "Segoe UI", sans-serif'};
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
  g.forEach((arr,i)=>{if(!arr.length)return;ctx.beginPath();for(const f of arr)for(const r of f.rings)ring(r,true);ctx.fillStyle=pal['b'+i];ctx.fill('evenodd')});}
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
  ctx.lineJoin='round';strokeFC(CB,pal.coast1,k>4?9:6);strokeFC(CB,pal.coast2,k>4?3.5:2.5);
  fillBands(D.gaps);fillBands(TZ);
  if(k>2.8)strokeFC(k>8?D.pb:D.pbM,pal.pb,0.7);
  strokeFC(CB,pal.border,k>4?1.4:0.9);
  // sphere shading for depth
  ctx.save();ctx.beginPath();path({type:'Sphere'});ctx.clip();
  const sg=ctx.createRadialGradient(cx-s*.42,cy-s*.48,0,cx,cy,s*1.02);sg.addColorStop(0,pal.shadeLite);sg.addColorStop(.55,'rgba(0,0,0,0)');sg.addColorStop(1,pal.shadeDark);
  ctx.fillStyle=sg;ctx.fillRect(0,0,W,H);ctx.restore();
  drawOverlays();drawLabels();
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
  for(const c of D.countries){const px=c.size*ppd;let a=1;if(c.np>1){if(px>340)continue;a=clamp((340-px)/70,0,1)}
    cand.push({lon:c[1],lat:c[2],v:c.v,name:c[0],tz:c[3],star:c[6],pri:2e9+px,kind:'c',ref:c,a});}
  for(const p of D.prov){const px=p[5]*ppd;if(px<38)continue;const c=cByIso[p[4]];let a=clamp((px-38)/36,0,1);
    if(c&&c.np>1){const cpx=c.size*ppd;if(cpx<270)continue;a*=clamp((cpx-270)/70,0,1)}
    if(a<0.05)continue;if(p.v[0]*VC[0]+p.v[1]*VC[1]+p.v[2]*VC[2]<0.07)continue;cand.push({lon:p[1],lat:p[2],v:p.v,name:p[0],tz:p[3],pri:px,kind:'p',ref:p,a});}
  cand.sort((x,y)=>y.pri-x.pri);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';
  let n=0;
  for(const L of cand){
    const v=L.v||vec(L.lon,L.lat);const X=M[0]*v[0]+M[1]*v[1]+M[2]*v[2];if(X<0.07)continue;
    const x=cx+SC*(M[3]*v[0]+M[4]*v[1]),y=cy-SC*(M[6]*v[0]+M[7]*v[1]+M[8]*v[2]);
    if(x<-60||y<-30||x>W+60||y>H+40)continue;
    let nf,hr=null,bi=0;
    if(L.ov){nf=F.ov}else{const o=off(L.tz);nf=L.kind==='c'?F.cn:F.pn;hr=hours(o)+(L.star?'*':'');bi=band(o)}
    const nw=tw(L.name,nf),hw=hr?tw(hr,F.hr)+14:0,w=Math.max(nw,hw)+8,h=hr?32:18;
    const r={x0:x-w/2,y0:y-(hr?23:22),x1:x+w/2,y1:y-(hr?23:22)+h};
    const P=6;if(placed.some(q=>r.x0-P<q.x1&&r.x1+P>q.x0&&r.y0-P/2<q.y1&&r.y1+P/2>q.y0))continue;
    if(L.a>0.3){r.L=L;placed.push(r)}
    ctx.globalAlpha=L.a;
    if(L.ov){ctx.beginPath();ctx.arc(x,y,4.5,0,7);ctx.fillStyle=L.ov.color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=pal.halo;ctx.stroke();
      ctx.font=nf;ctx.lineWidth=4;ctx.strokeText(L.name,x,y-9);ctx.fillStyle=pal.ink;ctx.fillText(L.name,x,y-9);ctx.globalAlpha=1;continue;}
    ctx.font=nf;ctx.lineWidth=4;ctx.strokeStyle=pal.halo;ctx.strokeText(L.name,x,y-9);ctx.fillStyle=L.kind==='c'?pal.ink:pal.ink2;ctx.fillText(L.name,x,y-9);
    const hx=x+7;ctx.font=F.hr;ctx.strokeText(hr,hx,y+6);ctx.fillStyle=pal.ink;ctx.fillText(hr,hx,y+6);
    const dx=hx-tw(hr,F.hr)/2-8;ctx.beginPath();ctx.arc(dx,y+1.5,4,0,7);ctx.fillStyle=pal['b'+bi];ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=pal.halo;ctx.stroke();
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
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);fly=null;vel=[0,0];moved=0;lastMove=performance.now();
  dragging=true;cv.classList.add('drag');if(pts.size===2){const [a,b]=[...pts.values()];pinch0={d:Math.hypot(a[0]-b[0],a[1]-b[1]),k:kT}}});
cv.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;const p=pts.get(e.pointerId),dx=e.clientX-p[0],dy=e.clientY-p[1];pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pts.size===1){const now=performance.now(),dt=Math.max(8,now-lastMove);lastMove=now;moved+=Math.abs(dx)+Math.abs(dy);rotateBy(dx,dy);
    vel=[vel[0]*0.3+dx*16/dt*0.7,vel[1]*0.3+dy*16/dt*0.7];draw();}
  else if(pts.size===2&&pinch0){const [a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);const r=cv.getBoundingClientRect();
    moved+=10;zoomTo(pinch0.k*d/pinch0.d,[(a[0]+b[0])/2-r.left,(a[1]+b[1])/2-r.top]);}});
function up(e){if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch0=null;
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
function showFeature(L,f,ll){
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
    ${!desc&&!rows.length?'<p class="nometa">This feature has no metadata in the file.</p>':''}`;
  document.getElementById('info').classList.add('show');}
let hoverPending=false;
cv.addEventListener('pointermove',e=>{if(dragging||!overlays.length||hoverPending)return;hoverPending=true;
  requestAnimationFrame(()=>{hoverPending=false;const r=cv.getBoundingClientRect();cv.style.cursor=overlayHit(e.clientX-r.left,e.clientY-r.top)?'pointer':''});});

// details
function clickAt(x,y){
  const oh=overlays.length?overlayHit(x,y):null;
  if(oh){selected=oh;showFeature(oh.L,oh.f,proj.invert([x,y]));draw();return}
  if(selected){selected=null;draw()}
  const hit=placed.find(q=>x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1&&!q.L.ov);let title,tz,where='';
  if(hit){title=hit.L.name;tz=hit.L.tz;where=hit.L.kind==='p'?(hit.L.ref[6]||''):'';}
  else{const ll=proj.invert([x,y]);if(!ll||d3.geoDistance(ll,viewCap[0])>1.56){hideInfo();return}
    const f=TZHIT.features.find(f=>d3.geoContains(f,ll));
    let best=null,bd=1e9;for(const p of D.prov){const d=d3.geoDistance(ll,[p[1],p[2]]);if(d<bd){bd=d;best=p}}
    if(!f&&!(best&&bd<0.05)){hideInfo();return}
    tz=f?f.properties.z:best[3];title=best&&bd<0.12?best[0]:tz.split('/').pop().replace(/_/g,' ');where=best&&bd<0.12?(best[6]||''):'';}
  showInfo(title,where,tz);
}
function showInfo(title,where,tz){const z=D.zones[tz]||[0,0],o=z[season],b=band(o),other=z[1-season];
  document.getElementById('infob').innerHTML=`<h2>${esc(title)}</h2><p class="where">${esc(where&&where!==title?where:' ')}</p>
  <div class="big"><i style="background:${pal['b'+b]}"></i>${hours(o)}</div><p class="bandname">${BANDS[b].name}, ${season?'summer':'winter'}</p>
  <dl><dt>${season?'Winter':'Summer'}</dt><dd>${hours(other)}</dd><dt>Difference</dt><dd>${vsUK(o)}</dd><dt>Clock follows</dt><dd>${esc(tz)}</dd></dl>`;
  document.getElementById('info').classList.add('show');}
function hideInfo(){document.getElementById('info').classList.remove('show');if(selected){selected=null;draw()}}
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
function ui(){document.getElementById('sum').textContent=`${hhmm(S)}–${hhmm(E)} UK, ${season?'summer':'winter'}`;
  document.getElementById('snote').textContent=season?'Late March to late October, while the UK is on BST.':'Late October to late March, while the UK is on GMT.';
  document.getElementById('key').innerHTML=BANDS.map((b,i)=>`<li><i style="background:${pal['b'+i]}"></i>${b.name} <small>${b.sub}</small></li>`).join('');
  document.getElementById('strip').innerHTML=BANDS.map((b,i)=>`<span><i style="background:${pal['b'+i]}"></i>${b.name}</span>`).join('');}
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
function pick(m){flyTo(m.lon,m.lat,m.size);closeSearch();setTimeout(()=>showInfo(m.n,m.sub==='Country'?'':m.sub,m.tz),400)}
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
  fc.features.forEach(x=>fixGeom(x.geometry));const L={name:f.name,fc,on:true,color:COLORS[overlays.length%COLORS.length]};overlays.push(L);renderLayers();
  const c=d3.geoCentroid(fc),b=d3.geoBounds(fc);flyTo(c[0],c[1],Math.max(Math.abs(b[1][0]-b[0][0]),Math.abs(b[1][1]-b[0][1]),1));}
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
  overlays.forEach((L,i)=>{const li=document.createElement('li');
    li.innerHTML=`<input type="checkbox" ${L.on?'checked':''} aria-label="Show ${esc(L.name)}"><i style="width:10px;height:10px;border-radius:50%;background:${L.color};flex:none"></i><span title="${esc(L.name)}">${esc(L.name)}</span><button class="x" aria-label="Remove ${esc(L.name)}">×</button>`;
    li.querySelector('input').onchange=e=>{L.on=e.target.checked;draw()};li.querySelector('.x').onclick=()=>{if(selected&&selected.L===L){selected=null;hideInfo()}overlays.splice(i,1);renderLayers();draw()};ul.appendChild(li)});}

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
