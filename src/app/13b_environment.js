// 13b_environment.js — 포인트 환경을 한 번 추출하고 수심 출처·기준면을 보존
const BITE_ENV_CACHE=new Map();
function getPointEnvironment(pt){
 const p=pt, mx=mxOf(p.lon),my=myOf(p.lat),k=kAt(p.lat);
 const revision=[totalPts(),OFFICIAL_DEPTH.generation,[...OFFICIAL_DEPTH.cache.keys()].join(','),STRUCT.n,ROCKS.length,OSM.list.length,!!GE].join('|');
 const key=[p.lat,p.lon,p.kind,p.type,p.name,revision].join('|'),cached=BITE_ENV_CACHE.get(key);
 if(cached&&Date.now()>=cached.at&&Date.now()-cached.at<60000)return cached.value;
 const surface=sectionSurfaceContext([mx,my],[mx,my]).surface(0);
 const habitat={},evidence={},land=inLand(mx,my)||['land','breakwater','rock_exposed'].includes(surface.state),samples=[];
 const read=(x,y,distance)=>{
  if(inLand(x,y)||sectionSurfaceContext([x,y],[x,y]).surface(0).state!=='water')return null;
  const r=depthQuery(x,y);let value=r;
  // GEBCO 격자만 허용한다. 해안 경사 가정(modelDepth/estimateAt)은 점수에 쓰지 않는다.
  if(!value&&GE){const z=gebcoAt(latOf(y),lonOf(x));if(Number.isFinite(z)&&z<0)value=depthResult({depth:-z,type:'gebco',label:'GEBCO 2026',res:460,verticalDatum:'MSL_assumed',estimated:true,conf:'낮음'});}
  if(!value||!Number.isFinite(value.depth)||value.depth<0)return null;
  samples.push({distance,...value});return value;
 };
 const center=land?null:read(mx,my,0);
 for(const distance of [250,500])for(let i=0;i<8;i++){const a=i*Math.PI/4;read(mx+Math.cos(a)*distance*k,my+Math.sin(a)*distance*k,distance);}
 // 같은 자료집·기준면이고, 표본 간격보다 촘촘하지 않은 해상도만 수심 변화에 사용한다.
 const groups=new Map();for(const r of samples){if(!r.datasetId||r.verticalDatum==='unknown'||!(r.res<=250))continue;const id=r.datasetId+'|'+r.verticalDatum;const g=groups.get(id)||[];g.push(r);groups.set(id,g);}
 const group=[...groups.values()].sort((a,b)=>b.length-a.length)[0]||[];
 const relief=group.length>=3?Math.max(...group.map(r=>r.depth))-Math.min(...group.map(r=>r.depth)):null;
 const near=(cats)=>osmDist(mx,my,cats,300),put=(name,value,why)=>{habitat[name]=value;evidence[name]=why;};
 if(p.kind==='rock')put('rock',1,'갯바위 포인트 자료');
 if(near(['br','rf','cl'])<150)put('rock',1,'OSM 암반·암초·절벽 150 m 안');
 if(near(['be','sh'])<150)put('sand',1,'OSM 해변·사주 150 m 안 (바닥은 추정)');
 if(near(['tf'])<150)put('mud',1,'OSM 갯벌 150 m 안 (바닥은 추정)');
 const sd=structDist(mx,my,300*k)/k;
 if(sd<150)put('breakwater',1-sd/300,'OSM 해안 구조물 접근성');
 const port=PORTS.some(q=>gdist(p,q)<.35),hb=near(['hb','ma'])<200;
 if(port||hb){put('harbor',.75,hb?'OSM 항만 구역 주변 (차폐 추정)':'항·포구 좌표 350 m 안 (차폐 미확인)');}
 // 육지 위 항 이름 좌표에서는 내항/외항을 단정하지 않는다.
 if(!land){let water=0;for(let i=0;i<16;i++){const a=i*Math.PI/8; if(!inLand(mx+Math.cos(a)*500*k,my+Math.sin(a)*500*k))water++;}put('openSea',water/16,'500 m 둘레 바다 비율 (노출도 추정)');if(habitat.harbor!=null)habitat.harbor*=1-.7*water/16;}
 if(relief!=null)put('deepEdge',clamp(relief/25,0,1),'동일 자료집·기준면 250~500 m 수심 변화');
 const depthConfidence=center?(center.sourceType==='khoa'?.65:center.type==='gebco'?.25:.5):0;
 const habitatConfidence=Object.keys(habitat).length?Math.min(.8,.3+Object.keys(habitat).length*.08):0;
 const value={surface,depth:center?.depth??null,depthConfidence,depthSource:center,depthRelief:relief,depthReliefConfidence:relief==null?0:.5,coastDistance:Number.isFinite(groundToCoast(mx,my))?groundToCoast(mx,my):null,land,habitat,habitatConfidence,evidence,samples};
 if(BITE_ENV_CACHE.size>64)BITE_ENV_CACHE.clear();BITE_ENV_CACHE.set(key,{at:Date.now(),value});return value;
}
