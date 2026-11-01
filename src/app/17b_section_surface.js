// 17b_section_surface.js — 단면의 육상·구조물·암반 구간과 샘플 사이 교차 판정
const SECTION_STATE = {water:'바다',land:'육상',breakwater:'방파제·구조물',rock_exposed:'노출 암반·갯바위',unknown:'확인 못 한 구간'};
const sectionSampleIsWater = p => p.state === 'water' && p.r && Number.isFinite(p.r.depth) && p.r.depth >= 0;
function sectionPointInRings(x,y,rings) {
  let inside=false;
  for(const r of rings)for(let i=0,j=r.n-1;i<r.n;j=i++){if(dSeg(x,y,r.xs[j],r.ys[j],r.xs[i],r.ys[i])<1e-7)return true;if((r.ys[i]>y)!==(r.ys[j]>y)&&x<(r.xs[j]-r.xs[i])*(y-r.ys[i])/(r.ys[j]-r.ys[i])+r.xs[i])inside=!inside;}
  return inside;
}
function sectionSurfaceContext(A,B) {
  const dx=B[0]-A[0],dy=B[1]-A[1],len2=dx*dx+dy*dy,k=kAt(latOf((A[1]+B[1])/2)),features=[];
  const at=t=>[A[0]+dx*t,A[1]+dy*t],near=(r,pad=0)=>r.maxx>=Math.min(A[0],B[0])-pad&&r.minx<=Math.max(A[0],B[0])+pad&&r.maxy>=Math.min(A[1],B[1])-pad&&r.miny<=Math.max(A[1],B[1])+pad;
  const add=(a,b,state,source,bufferM=0,confidence='geometry')=>{a=Math.max(0,a);b=Math.min(1,b);if(b>=a)features.push({a,b,state,source,bufferM,confidence});};
  const cutsFor=rings=>{const cuts=[0,1];for(const r of rings)for(let i=0,j=r.n-1;i<r.n;j=i++){
    const ex=r.xs[i]-r.xs[j],ey=r.ys[i]-r.ys[j],qx=r.xs[j]-A[0],qy=r.ys[j]-A[1],den=dx*ey-dy*ex;
    if(Math.abs(den)>1e-12){const t=(qx*ey-qy*ex)/den,u=(qx*dy-qy*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)cuts.push(t);}
    else if(len2&&Math.abs(qx*dy-qy*dx)<1e-7){for(const [x,y] of [[r.xs[j],r.ys[j]],[r.xs[i],r.ys[i]]]){const t=((x-A[0])*dx+(y-A[1])*dy)/len2;if(t>=0&&t<=1)cuts.push(t);}}
  }return [...new Set(cuts)].sort((a,b)=>a-b);};
  const polygon=(rings,state,source)=>{const cuts=cutsFor(rings);for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i];if(sectionPointInRings(...at((a+b)/2),rings))add(a,b,state,source);}};
  // 선형 구조물은 기존과 같은 반폭 4m다. 끝점도 같은 반지름의 원으로 닫는다.
  const circle=(x,y,r,state,source,bufferM,confidence)=>{if(!len2){if(Math.hypot(A[0]-x,A[1]-y)<=r)add(0,1,state,source,bufferM,confidence);return;}const qx=x-A[0],qy=y-A[1],t=(qx*dx+qy*dy)/len2,cross=qx*dy-qy*dx,gap=r*r-cross*cross/len2;if(gap>=0){const half=Math.sqrt(gap/len2);add(t-half,t+half,state,source,bufferM,confidence);}};
  const line=(r,state,source,bufferM)=>{const radius=bufferM*k;for(let i=1;i<r.n;i++){
    const x=r.xs[i-1],y=r.ys[i-1],ex=r.xs[i]-x,ey=r.ys[i]-y,L=Math.hypot(ex,ey);circle(x,y,radius,state,source,bufferM);circle(r.xs[i],r.ys[i],radius,state,source,bufferM);if(!L)continue;
    let lo=0,hi=1;const clip=(v,d,min,max)=>{if(Math.abs(d)<1e-12)return v>=min&&v<=max;const a=(min-v)/d,b=(max-v)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));return lo<=hi;};
    if(clip(((A[0]-x)*ex+(A[1]-y)*ey)/L,(dx*ex+dy*ey)/L,0,L)&&clip(((A[0]-x)*ey-(A[1]-y)*ex)/L,(dx*ey-dy*ex)/L,-radius,radius))add(lo,hi,state,source,bufferM);
  }};
  const osm=OSM.list.filter(o=>near(o,4*k));
  for(const o of osm){const state=OSM_STRUCT.has(o.c)||o.c==='dk'?'breakwater':o.c==='br'?'rock_exposed':['rf','sh','tf'].includes(o.c)?'unknown':null;if(!state)continue;
    const source='OSM:'+o.c+(o.name?':'+o.name:'');if(o.t===2)polygon(o.R,state,source);else for(const r of o.R){if(r.n===1)circle(r.xs[0],r.ys[0],k,state,source,1,'point_location_only');else line(r,state,source,state==='breakwater'?4:1);}
  }
  // OSM 원래 다각형의 구멍을 보존한다. STRUCT의 복사본 외곽선으로 다시 메우지 않는다.
  const duplicate=r=>r.base&&osm.some(o=>OSM_STRUCT.has(o.c)&&o.R.some(q=>q.n===r.n&&Array.from(q.xs).every((x,i)=>x===r.xs[i]&&q.ys[i]===r.ys[i])));
  for(const r of STRUCT.polys)if(near(r)&&!duplicate(r))polygon([r],'breakwater','STRUCT:polygon');
  for(const r of STRUCT.lines)if(near(r,4*k)&&!duplicate(r))line(r,'breakwater','STRUCT:line',4);
  // 낚시 포인트는 면적 경계가 아니다. 좌표 바로 주변 2m만 보수적으로 제외하고 불확실성을 기록한다.
  for(const r of ROCKS)if(!/백사장|모래사장/.test(r.name||'')&&Math.min(A[0],B[0])-2*k<=r.mx&&r.mx<=Math.max(A[0],B[0])+2*k&&Math.min(A[1],B[1])-2*k<=r.my&&r.my<=Math.max(A[1],B[1])+2*k)circle(r.mx,r.my,2*k,'rock_exposed','ROCKS:'+r.name,2,'point_location_only');
  const coast=LOD.full.filter(r=>near(r));polygon(coast,'land','coastline:full');
  const rank={breakwater:0,rock_exposed:1,land:2,unknown:3};
  features.sort((a,b)=>rank[a.state]-rank[b.state]);
  const surface=t=>features.find(r=>t>=r.a-1e-12&&t<=r.b+1e-12)||{state:'water',source:'coastline:water',bufferM:0,confidence:'geometry'};
  const cuts=[...new Set([0,1,...features.flatMap(r=>[r.a,r.b])])].sort((a,b)=>a-b),intervals=[];
  for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i],hit=surface((a+b)/2),prev=intervals[intervals.length-1];if(b-a>1e-12){if(prev&&prev.state===hit.state&&prev.source===hit.source&&Math.abs(prev.b-a)<1e-12)prev.b=b;else intervals.push({...hit,a,b});}}
  return {surface,intervals};
}
function classifySectionSample(sample,context,t) {
  const hit=context.surface(t),out={...sample,distanceM:sample.s,lon:lonOf(sample.mx),lat:latOf(sample.my),state:hit.state,depthM:null,r:null,classification:{source:hit.source,bufferM:hit.bufferM,confidence:hit.confidence}};
  if(hit.state==='water'){
    // 알려진 바다에서만 기존 공식수심/GEBCO·해안 추정 경로를 유지한다. 불확실한 지형은 이 경로로 채우지 않는다.
    const r=depthQuery(sample.mx,sample.my)||(GE?modelDepth(sample.mx,sample.my,sample.dG):null);
    if(r&&Number.isFinite(r.depth)&&r.depth>=0){out.r=r;out.depthM=r.depth;}else{out.state='unknown';out.classification={source:'depth:unavailable',bufferM:0,confidence:'unknown'};}
  }
  out.land=['land','breakwater','rock_exposed'].includes(out.state);return out;
}
function sectionEdgeBlocked(sec,k) {return sec.blockedEdges?sec.blockedEdges[k]:k>0&&(sec.surfaceIntervals||[]).some(r=>r.state!=='water'&&r.a<k/sec.N-1e-12&&r.b>(k-1)/sec.N+1e-12);}
function sectionWaterRuns(sec) {
  if(sec.waterRuns)return sec.waterRuns;
  const runs=[];let start=null;
  for(let k=0;k<=sec.N;k++){const water=sectionSampleIsWater(sec.pts[k]);if(start!==null&&(!water||sectionEdgeBlocked(sec,k))){runs.push([start,k-1]);start=null;}if(water&&start===null)start=k;}
  if(start!==null)runs.push([start,sec.N]);return runs;
}
