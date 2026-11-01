// p3_perf_baseline.js — 이전 빌드를 그대로 계측하는 고정 60프레임 mock
window.p3PerfBaseline=async()=>{
  showTab('map');await new Promise(r=>setTimeout(r,400));
  const f=new FakeMapAdapter();f.init($('providerMap'));Object.assign(PROVIDER_MAP,{adapter:f,failed:false,active:false,loaded:true,signature:''});
  f.onViewportReady(providerViewportChanged);f.onTilesLoaded(()=>{PROVIDER_MAP.loaded=true;providerCheck();});
  await fitGround(36.15983,126.50376,10000);S.layers.flow=true;S.playing=false;
  await OFFICIAL_DEPTH.init;await Promise.all([...OFFICIAL_DEPTH.pending.values()]);await new Promise(r=>setTimeout(r,600));
  let counts={};const wrap=(name,fn)=>(...args)=>{counts[name]=(counts[name]||0)+1;return fn(...args);};
  providerSync=wrap('providerSync',providerSync);providerCheck=wrap('providerCheck',providerCheck);providerAlignment=wrap('providerAlignment',providerAlignment);
  renderBase=wrap('renderBase',renderBase);drawUI=wrap('drawUI',drawUI);updateHover=wrap('updateHover',updateHover);drawCrnt=wrap('drawCrnt',drawCrnt);stepParticles=wrap('stepParticles',stepParticles);drawSection=wrap('drawSection',drawSection);drawStations=wrap('drawStations',drawStations);
  const original=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...a){counts.getImageData=(counts.getImageData||0)+1;return original.apply(this,a);};
  const phase=async(moving)=>{counts={};const deltas=[];let last=performance.now(),start=last;
    for(let i=0;i<60;i++){const now=await new Promise(requestAnimationFrame);deltas.push(now-last);last=now;if(moving){f.center=[126.50376+(i%2?.001:0),36.15983];f.renderMarkers();f.viewportListener('center_changed');f.viewportListener('idle');}}
    const ms=performance.now()-start,sorted=[...deltas].sort((a,b)=>a-b);return {frames:60,elapsedMs:ms,fps:60000/ms,averageFrameMs:deltas.reduce((a,b)=>a+b,0)/60,p95FrameMs:sorted[Math.floor(sorted.length*.95)],longFrames:deltas.filter(x=>x>=50).length,counts,perSecond:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v*1000/ms]))};
  };
  const stationary=await phase(false),pan=await phase(true);counts={};for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);const afterPan={counts:{...counts},moving:!!PROVIDER_MAP.providerMoving,heavyHidden:stage.classList.contains('provider-moving')};CanvasRenderingContext2D.prototype.getImageData=original;
  return {stationary,pan,afterPan,particles:typeof PARTICLE_BUDGET==='number'?PARTICLE_BUDGET:NP,scope:'headless mock; 실 NAVER/사용자 PC 성능 아님'};
};
