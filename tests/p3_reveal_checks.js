// p3_reveal_checks.js — 종료 이벤트 누락·역순과 타일/분석 Canvas 분리 회귀
async function p3RevealTest(f){
  const check=(v,msg)=>{if(!v)throw Error(msg);},tick=()=>new Promise(requestAnimationFrame),samples=[];
  const settle=async label=>{for(let i=0;i<140;i++){await tick();if(!PROVIDER_MAP.providerMoving&&!PROVIDER_MAP.commandPending&&!dirty&&!PROVIDER_MAP.revealAfterBase)break;}const d=window.naksigwangTileDiagnostic();check(!d.providerMoving&&!d.commandPending&&!d.revealAfterBase&&!d.heavyHidden,label+' 종료 상태');check(d.canvases.every(c=>c.visibility==='visible'&&c.display!=='none'&&Number(c.opacity)>0),label+' Canvas 실제 visible');samples.push({label,providerMoving:d.providerMoving,revealAfterBase:d.revealAfterBase,commandPending:d.commandPending,heavyHidden:d.heavyHidden,canvases:d.canvases});};
  const order=[],originals={read:providerReadView,base:renderBase,ui:drawUI,current:drawCurrentOverlay,section:drawSection,reveal:providerRevealOverlay};
  providerReadView=(...a)=>{order.push('read');return originals.read(...a);};renderBase=(...a)=>{order.push('base');return originals.base(...a);};drawUI=(...a)=>{order.push('ui');return originals.ui(...a);};drawCurrentOverlay=(...a)=>{order.push('current');return originals.current(...a);};drawSection=(...a)=>{order.push('section');return originals.section(...a);};providerRevealOverlay=(...a)=>{if(PROVIDER_MAP.revealAfterBase)order.push('reveal');return originals.reveal(...a);};
  try{f.map.panBy(new P3ProbeXY(1,1));await settle('DRAW→REVEAL 순서');check(['read','base','ui','current','section','reveal'].every((name,i,all)=>order.indexOf(name)>=0&&(!i||order.indexOf(name)>order.indexOf(all[i-1]))),'최종 viewport→base→UI→조류→단면→공개 순서');}
  finally{providerReadView=originals.read;renderBase=originals.base;drawUI=originals.ui;drawCurrentOverlay=originals.current;drawSection=originals.section;providerRevealOverlay=originals.reveal;}
  // 과거 코드는 idle만 오면 gesture가 남고, idle→end에서는 waitingIdle이 다시 켜졌다.
  for(const kind of ['drag','zoom','pinch'])for(let i=0;i<20;i++){
    f.viewportListener(kind+'start');
    if(kind==='drag')f.map.panBy(new P3ProbeXY(i%2?3:-3,i%2?2:-2));else f.map.zoomBy(i%2?-1:1,new P3ProbeLL(38.20854,128.5947));
    if(i%3===0){f.viewportListener('idle');f.viewportListener(kind+'end');}
    else if(i%3===1){f.viewportListener(kind+'end');f.viewportListener('idle');}
    else f.viewportListener('idle'); // SDK 종료 이벤트 누락
    await settle(kind+i);
  }
  f.viewportListener('dragstart');f.viewportListener('dragend');await settle('동일 viewport/no idle');
  nativePointers.add(-2);f.viewportListener('pinchstart');f.viewportListener('idle');
  await tick();check(PROVIDER_MAP.providerMoving,'실제 누른 포인터 중 조기 idle 차단');
  $('providerMap').addEventListener('pointerup',e=>e.stopPropagation(),{once:true});$('providerMap').dispatchEvent(new PointerEvent('pointerup',{pointerId:-2,bubbles:true}));await settle('포인터 종료/SDK end 누락·버블 차단');
  for(const mode of ['satellite','hybrid','normal']){providerSetMode(mode);await settle('mode '+mode);}
  const width=stage.style.width;stage.style.width=(cw-9)+'px';resize();await settle('resize');stage.style.width=width;resize();await settle('resize 복원');
  showTab('today');await tick();showTab('map');await settle('오늘→지도');
  const originalProjection=f.project;f.project=(...args)=>{const p=originalProjection.apply(f,args);return [p[0]+4,p[1]];};
  const fallbackCount=PROVIDER_MAP.fallbackCount||0;
  // 표시 조건을 못 맞춰도 정상 SDK는 유지하고 Canvas만 보류한다.
  for(let i=0;i<130;i++){f.center=[f.center[0]+.000001,f.center[1]];f.reportedCenter=f.center;f.renderMarkers();f.viewportListener('zoom_changed');await tick();check(!PROVIDER_MAP.failed,'계속 이동하는 SDK의 조기 fallback 금지');}
  f.viewportListener('zoom_changed');for(let i=0;i<125;i++)await tick();
  const timeout=window.naksigwangTileDiagnostic();check(timeout.active&&!timeout.failed&&timeout.settleTimedOut&&timeout.fallbackCount===fallbackCount&&timeout.providerDOMVisible,'안정화 timeout은 provider 유지');check(timeout.heavyHidden,'timeout Canvas 보류');f.project=originalProjection;
  f.viewportListener('idle');await settle('settle timeout 이후 idle 복구');
  // IMG는 DOM 관찰용 fixture. src를 설정하거나 타일을 fetch하지 않는다.
  const image=document.createElement('img');image.style.cssText='position:absolute;left:0;top:0;width:256px;height:256px';
  Object.defineProperty(image,'currentSrc',{value:'https://host-secret.map.pstatic.net/private-secret/1234567890/345/678.jpg?clientId=credential-secret#secret'});
  $('providerMap').append(image);
  Object.defineProperty(image,'naturalWidth',{value:256});Object.defineProperty(image,'naturalHeight',{value:256});Object.defineProperty(image,'complete',{value:false});
  const before=window.naksigwangTileDiagnostic();check(before.childImageCount>=1&&before.visibleTileCount>=1,'보이는 IMG metadata');
  const serialized=JSON.stringify(before);check(!serialized.includes('credential-secret')&&!serialized.includes('private-secret')&&!serialized.includes('clientId=')&&!serialized.includes('1234567890')&&!serialized.includes('host-secret'),'query/path 인증정보 제외');
  const providerVisibility=getComputedStyle($('providerMap')).visibility;
  window.naksigwangPerfDiagnostic.providerOnly(true);const only=window.naksigwangTileDiagnostic();
  check(only.canvases.every(c=>c.visibility==='hidden'),'providerOnly 분석 Canvas만 숨김');check(getComputedStyle(image).visibility==='visible'&&getComputedStyle($('providerMap')).visibility===providerVisibility,'provider IMG 유지');
  const savedPixel=bctx.getImageData(0,0,3,3);bctx.save();bctx.setTransform(1,0,0,1,0,0);bctx.fillStyle='#102030';bctx.fillRect(0,0,3,3);bctx.restore();
  const r=base.getBoundingClientRect();const pixels=window.naksigwangTileDiagnostic(r.left+1,r.top+1).canvasPixels;check(pixels.length===3&&pixels.every(p=>p.rgba?.length===4)&&pixels[0].rgba[3]===255,'블록 위치 Canvas 실제 RGBA 분리');bctx.putImageData(savedPixel,0,0);
  window.naksigwangPerfDiagnostic.providerOnly(false);image.remove();await settle('providerOnly 해제');
  providerViewportChanged('zoomstart');providerViewportChanged('zoom_changed');providerViewportChanged('zoomend');providerViewportChanged('idle');
  f.loaded();await settle('idle 이후 tilesloaded');
  check(PROVIDER_MAP.events.slice(-5).map(e=>e.name).join(',')==='zoomstart,zoom_changed,zoomend,idle,tilesloaded','타일과 viewport 이벤트 순서');
  return {samples,drawRevealOrder:order,permanentHidden:0,providerOnly:true,tileMetadata:true,credentialRedacted:true,canvasPixelSeparation:true,eventOrder:PROVIDER_MAP.events.slice(-5)};
}
