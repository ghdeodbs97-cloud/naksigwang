// 15d_render_state.js — 용도별 렌더 무효화와 localhost 성능 계측
const RENDER={uiKey:'',sectionKey:'',section:null,readKey:'',readSection:null,lastTab:'',lastSection:0,lastFlow:0,arrowKey:'',arrowStations:null,arrowCanvas:document.createElement('canvas')};
const PERF_NAMES=['frame','providerSync','providerViewportKey','providerCheck','providerAlignment','renderBase','coastPath','structPath','updateHover','drawUI','drawCrnt','stepParticles','drawSection','stationRedraw','maskRebuild','getImageData','buildFlowField','particleRespawn'];
const PERF={enabled:PROVIDER_DEV_HOST,start:performance.now(),counts:{},costs:{},frames:[],work:[],last:0,idleRecoveryMs:[],particleReductions:0,longTasks:[]};
function perfCount(name){if(PERF.enabled)PERF.counts[name]=(PERF.counts[name]||0)+1;}
function perfWrap(name,fn){if(!PERF.enabled)return fn;return function(...args){const start=performance.now();perfCount(name);try{return fn.apply(this,args);}finally{const ms=performance.now()-start,c=PERF.costs[name]||={totalMs:0,maxMs:0};c.totalMs+=ms;c.maxMs=Math.max(c.maxMs,ms);if(name==='frame'){if(PERF.last)PERF.frames.push(start-PERF.last);PERF.last=start;PERF.work.push(ms);if(PERF.frames.length>1800)PERF.frames.shift();if(PERF.work.length>1800)PERF.work.shift();}}};}
providerSync=perfWrap('providerSync',providerSync);providerViewportKey=perfWrap('providerViewportKey',providerViewportKey);
providerCheck=perfWrap('providerCheck',providerCheck);providerAlignment=perfWrap('providerAlignment',providerAlignment);
buildPath=perfWrap('coastPath',buildPath);structPath=perfWrap('structPath',structPath);renderBase=perfWrap('renderBase',renderBase);drawUI=perfWrap('drawUI',drawUI);drawCrnt=perfWrap('drawCrnt',drawCrnt);
stepParticles=perfWrap('stepParticles',stepParticles);drawSection=perfWrap('drawSection',drawSection);updateHover=perfWrap('updateHover',updateHover);
drawStations=perfWrap('stationRedraw',drawStations);buildFlowField=perfWrap('buildFlowField',buildFlowField);frame=perfWrap('frame',frame);
if(PROVIDER_DEV_HOST){
  if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.startTime>=PERF.start)PERF.longTasks.push({startTime:e.startTime,duration:e.duration});if(PERF.longTasks.length>300)PERF.longTasks.splice(0,PERF.longTasks.length-300);}).observe({type:'longtask',buffered:false});
  const readPixels=CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData=function(...args){perfCount('getImageData');return readPixels.apply(this,args);};
  window.naksigwangPerfDiagnostic=()=>{
    const elapsedMs=performance.now()-PERF.start,percentile=a=>{const v=[...a].sort((a,b)=>a-b);return v.length?v[Math.min(v.length-1,Math.floor(v.length*.95))]:0;},average=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
    const counts=Object.fromEntries(PERF_NAMES.map(name=>[name,PERF.counts[name]||0]));
    return {scope:'이 브라우저의 계측; 실 NAVER 성공 판정과 별도',elapsedMs,fps:(PERF.counts.frame||0)*1000/elapsedMs,averageFrameMs:average(PERF.frames),p95FrameMs:percentile(PERF.frames),averageWorkMs:average(PERF.work),p95WorkMs:percentile(PERF.work),longFrames:PERF.frames.filter(x=>x>=50).length,longWorkFrames:PERF.work.filter(x=>x>=50).length,longTasks:[...PERF.longTasks],counts,callsPerSecond:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v*1000/elapsedMs])),costs:structuredClone(PERF.costs),idleRecoveryMs:[...PERF.idleRecoveryMs],providerMoving:!!PROVIDER_MAP.providerMoving,heavyHidden:stage.classList.contains('provider-moving'),particles:PARTICLE_BUDGET,particleReductions:PERF.particleReductions,background:document.hidden};
  };
  window.naksigwangPerfDiagnostic.reset=()=>{PERF.start=performance.now();PERF.counts={};PERF.costs={};PERF.frames=[];PERF.work=[];PERF.last=0;PERF.idleRecoveryMs=[];PERF.particleReductions=0;PERF.longTasks=[];};
}
function drawCurrentOverlay(tide){
  const key=JSON.stringify([PROVIDER_MAP.signature,V.cx,V.cy,V.s,cw,ch,DPR(),S.layers.flow,tide.tA,CR.ready]);
  const c=RENDER.arrowCanvas;
  if(key!==RENDER.arrowKey||RENDER.arrowStations!==CR.st){RENDER.arrowKey=key;RENDER.arrowStations=CR.st;c.width=ui.width;c.height=ui.height;drawCrnt(tide,c.getContext('2d'));}
  uctx.setTransform(1,0,0,1,0,0);uctx.drawImage(c,0,0);
}
