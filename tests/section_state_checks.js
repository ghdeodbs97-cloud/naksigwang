// section_state_checks.js — 단면의 실제 샘플과 Canvas 수심 경로 회귀
window.sectionStateTest=({onlyWater=false}={})=>{
  const check=(v,m)=>{if(!v)throw Error(m);},x0=mxOf(128),y0=myOf(36),scale=kAt(36),xy=(x,y)=>[x0+x*scale,y0+y*scale];
  const ring=points=>{const q=points.map(p=>xy(...p)),xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);return {xs,ys,n:q.length,minx:Math.min(...xs),maxx:Math.max(...xs),miny:Math.min(...ys),maxy:Math.max(...ys)};};
  const rect=(a,b)=>ring([[a,-10],[b,-10],[b,10],[a,10]]),poly=(c,a,b)=>{const r=rect(a,b);return {c,t:2,name:'회귀 형상',R:[r],...{minx:r.minx,maxx:r.maxx,miny:r.miny,maxy:r.maxy}};};
  let coast=[];LOD.full=coast;OSM.list=[];ROCKS.length=0;Object.assign(STRUCT,{lines:[],polys:[],seg:[],idx:new Map(),n:0,nb:0});
  inLand=(x,y)=>{let c=false;for(const r of coast)for(let i=0,j=r.n-1;i<r.n;j=i++)if((r.ys[i]>y)!==(r.ys[j]>y)&&x<(r.xs[j]-r.xs[i])*(y-r.ys[i])/(r.ys[j]-r.ys[i])+r.xs[i])c=!c;return c||inStruct(x,y);};
  scheduleDepthArea=()=>{};S.autoShore=false;S.playing=false;
  const validDepth=(x,y)=>depthResult({depth:10+(x-x0)/scale/100,type:'survey',verticalDatum:'test_datum',datasetId:'test_survey',conf:'높음',res:1});depthQuery=validDepth;
  const state=p=>p.state||(p.land?'land':'water'),results=[];let waterGolden=null;
  const run=(name,setup,expected,end=[300,0])=>{coast=[];LOD.full=coast;OSM.list=[];ROCKS.length=0;Object.assign(STRUCT,{lines:[],polys:[],seg:[],idx:new Map(),n:0,nb:0});depthQuery=validDepth;setup();S.A=xy(0,0);S.B=xy(...end);analyzeSection();check(SEC.pts.length===301,name+' 301개 보존');for(const [index,want] of expected)check(state(SEC.pts[index])===want,name+' '+want+' sample '+index+' 실제 '+state(SEC.pts[index]));
    for(const p of SEC.pts)if(p.state&&p.state!=='water')check(p.r===null&&p.depthM===null,'비수중 구간 수심 없음');
    const paths=[];let path=[];const move=sctx.moveTo,line=sctx.lineTo,stroke=sctx.stroke;sctx.moveTo=function(x,y){path=[[x,y]];return move.call(this,x,y);};sctx.lineTo=function(x,y){path.push([x,y]);return line.call(this,x,y);};sctx.stroke=function(...args){if(Math.abs(this.lineWidth-2.8)<.001)paths.push(path.slice());return stroke.apply(this,args);};
    try{drawSection(0,getTide());}finally{sctx.moveTo=move;sctx.lineTo=line;sctx.stroke=stroke;}
    check(!SEC.pts.some(p=>state(p)==='water')||paths.length>0,'바다 수심 stroke가 실제로 그려짐 '+name);
    if(SEC.surfaceIntervals)for(const path of paths)for(let i=1;i<path.length;i++){const a=(path[i-1][0]-50)/(sw-64),b=(path[i][0]-50)/(sw-64);check(!SEC.surfaceIntervals.some(r=>r.state!=='water'&&r.startM/SEC.L<Math.max(a,b)-1e-9&&r.endM/SEC.L>Math.min(a,b)+1e-9),'수심 stroke가 비수중 구간을 연결하지 않음 '+name);}
    if(name==='전부 바다')waterGolden={positions:SEC.pts.map(p=>[p.mx,p.my,p.s]),depthResults:SEC.pts.map(p=>p.r),depthPaths:paths};
    results.push({name,states:[...new Set(SEC.pts.map(state))],samples:SEC.pts.length,waterStrokes:paths.length,...(['바다→갯바위→바다','바다→방파제→바다','암초 노출 여부 미확인'].includes(name)?{image:sec.toDataURL('image/png')}:{})});return SEC;
  };
  const all=run('전부 바다',()=>{},[[0,'water'],[150,'water'],[300,'water']]);check(all.pts.every(p=>Math.abs(p.r.depth-validDepth(p.mx,p.my).depth)<1e-12&&p.r.verticalDatum==='test_datum'),'순수 바다 수심·기준면 보존');
  if(onlyWater)return waterGolden;
  run('바다→육지',()=>coast.push(rect(150,400)),[[50,'water'],[200,'land']]);
  run('바다→갯바위→바다',()=>OSM.list.push(poly('br',100,130)),[[50,'water'],[115,'rock_exposed'],[200,'water']]);
  run('바다→방파제→바다',()=>addStructLine([xy(150,-10),xy(150,10)],false,false),[[100,'water'],[150,'breakwater'],[200,'water']]);
  run('육지→바다→육지',()=>coast.push(rect(-10,75),rect(225,310)),[[25,'land'],[150,'water'],[275,'land']]);
  const thin=run('샘플 사이 20cm 암반',()=>OSM.list.push(poly('br',100.2,100.4)),[[100,'water'],[101,'water']]);check(thin.surfaceIntervals?.some(r=>r.state==='rock_exposed'&&(r.b-r.a)*300<.21),'매우 짧은 암반 segment 교차');
  const text=sctx.fillText,labels=[],hover=S.secHover;sctx.fillText=function(t,...args){labels.push(t);return text.call(this,t,...args);};try{S.secHover=100.3/300;drawSection(0,getTide());check(labels.includes('노출 암반·갯바위')&&!labels.some(t=>/^수심 |^추정 수심 /.test(t)),'샘플 사이 암반 hover도 수심 대신 상태 표시');}finally{sctx.fillText=text;S.secHover=hover;}
  run('갯바위 포인트 최소 범위',()=>ROCKS.push({name:'시험 갯바위',mx:xy(150,0)[0],my:y0}),[[145,'water'],[150,'rock_exposed'],[155,'water']]);
  run('암초 노출 여부 미확인',()=>OSM.list.push(poly('rf',100,130)),[[115,'unknown'],[200,'water']]);
  run('다각형 구멍',()=>{const o=poly('br',100,160);o.R.push(rect(120,140));OSM.list.push(o);},[[110,'rock_exposed'],[130,'water'],[150,'rock_exposed']]);
  run('겹친 지형 우선순위',()=>{coast.push(rect(90,170));OSM.list.push(poly('br',100,160));addStructLine([xy(130,-10),xy(130,10)],false,false);},[[95,'land'],[110,'rock_exposed'],[130,'breakwater']]);
  run('암반 경계와 나란한 단면',()=>{const o=poly('br',100,130);o.R=[ring([[100,0],[130,0],[130,10],[100,10]])];OSM.list.push(o);},[[115,'rock_exposed']]);
  const diagonal=run('비스듬한 단면의 거리축',()=>{const o=poly('br',100,130);o.R=[ring([[100,-1000],[130,-1000],[130,1000],[100,1000]])];OSM.list.push(o);},[[50,'water'],[115,'rock_exposed'],[200,'water']],[300,300]);const boundary=diagonal.surfaceIntervals.find(r=>r.state==='rock_exposed');check(Math.abs(boundary.startM-diagonal.pts[100].s)<1e-6&&Math.abs(boundary.endM-diagonal.pts[130].s)<1e-6,'교차 경계와 샘플 누적 지상거리 정합');
  const saveGE=GE,saveModel=modelDepth;GE=null;modelDepth=()=>null;try{run('수심 자료 없음',()=>{depthQuery=()=>null;},[[150,'unknown']]);}finally{GE=saveGE;modelDepth=saveModel;}
  return results;
};
