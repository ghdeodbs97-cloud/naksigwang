// 15e_tile_diagnostic.js — localhost 전용 타일 DOM·Canvas 가시성 관찰 (네트워크 요청 없음)
function providerCanvasVisibility(){
  return [base,flow,ui].map(canvas=>{const css=getComputedStyle(canvas),r=canvas.getBoundingClientRect();return {id:canvas.id,opacity:css.opacity,display:css.display,visibility:css.visibility,rect:{left:r.left,top:r.top,width:r.width,height:r.height}};});
}
if(PROVIDER_DEV_HOST){
  window.naksigwangPerfDiagnostic.providerOnly=enabled=>{stage.classList.toggle('provider-only',!!enabled);return {providerOnly:stage.classList.contains('provider-only'),canvases:providerCanvasVisibility()};};
  window.naksigwangTileDiagnostic=(x,y)=>{
    const p=PROVIDER_MAP,container=$('providerMap'),rectOf=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};},rect=rectOf(container);
    const health=providerHealthSnapshot();
    const tiles=[...container.querySelectorAll('img')].map(el=>{const r=rectOf(el);let visible=r.width>0&&r.height>0&&r.left<rect.left+rect.width&&r.top<rect.top+rect.height&&r.left+r.width>rect.left&&r.top+r.height>rect.top;
      for(let node=el;node;node=node.parentElement){const css=getComputedStyle(node);if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0)visible=false;}
      return {rect:r,visible,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,complete:el.complete};});
    const css=getComputedStyle(container),providerStyle={display:css.display,visibility:css.visibility,opacity:css.opacity,transform:css.transform};
    const tileSizeDistribution={};for(const tile of tiles.filter(t=>t.visible)){const key=tile.rect.width+'×'+tile.rect.height;tileSizeDistribution[key]=(tileSizeDistribution[key]||0)+1;}
    const canvasPixels=Number.isFinite(x)&&Number.isFinite(y)?[base,flow,ui].map(c=>{const r=c.getBoundingClientRect(),px=Math.floor((x-r.left)*c.width/r.width),py=Math.floor((y-r.top)*c.height/r.height);let rgba=null;if(px>=0&&py>=0&&px<c.width&&py<c.height)try{rgba=[...c.getContext('2d').getImageData(px,py,1,1).data];}catch(_){}return {id:c.id,rgba};}):null;
    return {
      providerMode:p.mode,providerZoom:health.zoom,mode:p.mode,zoom:health.zoom,center:health.center,bounds:health.bounds,
      providerActive:p.active,providerFailed:p.failed,active:p.active,failed:p.failed,
      lastFallbackReason:p.lastFallbackReason||null,providerFallbackReason:p.lastFallbackReason||null,
      fallbackCount:p.fallbackCount||0,lastFallbackAt:p.lastFallbackAt??null,
      mapObjectPresent:health.mapObjectPresent,mapProjectionHealthy:health.mapProjectionHealthy,providerDOMVisible:health.providerDOMVisible,sdkSurfaceCount:health.sdkSurfaceCount,
      healthState:p.failed?'failed':p.healthPromise?'checking':!health.mapObjectPresent?'unavailable':!health.mapProjectionHealthy?'degraded':p.settleTimedOut&&p.providerMoving?'settle-timeout':!health.providerDOMVisible?'hidden':health.sdkSurfaceCount?'healthy':'waiting-for-tiles',
      settleTimedOut:!!p.settleTimedOut,settleTimeoutCount:p.settleTimeoutCount||0,settleRecoveredAt:p.settleRecoveredAt??null,lastSettleObservation:p.lastSettleObservation?{...p.lastSettleObservation}:null,
      finalViewportCount:p.finalViewportCount||0,lastFinalViewport:p.lastFinalViewport?{...p.lastFinalViewport,center:[...p.lastFinalViewport.center],bounds:p.lastFinalViewport.bounds.map(v=>[...v])}:null,gesture:p.gesture,waitingIdle:p.waitingIdle,nativePointerCount:nativePointers.size,
      duplicateEvents:p.duplicateEvents||0,gestureDeadlinePending:!!p.gestureTimer,
      recoverable:!!p.recoverable,recoveryCount:p.recoveryCount||0,recoveredAt:p.recoveredAt??null,
      projectionErrorCount:p.projectionErrorCount||0,projectionFailures:p.projectionFailures||0,interactionFailures:p.interactionFailures||0,
      tileErrorCount:p.tileErrorCount||0,tileErrorsLast10s:providerTileErrorsLast10s(),lastTileErrorAt:p.lastTileErrorAt??null,tileErrors:(p.tileErrors||[]).map(e=>({...e})),
      tilesLoadedCount:p.tilesLoadedCount||0,lastTilesLoadedAt:p.lastTilesLoadedAt??null,
      modeHealthChecks:p.modeHealthChecks||0,lastModeHealthAt:p.lastModeHealthAt??null,
      providerRect:rect,providerStyle,lastResize:p.lastResize?{...p.lastResize}:null,resizeCount:p.resizeCount||0,
      childImageCount:tiles.length,tileImageCount:tiles.length,completeTileCount:tiles.filter(t=>t.complete).length,incompleteTileCount:tiles.filter(t=>!t.complete).length,
      decodedTileCount:tiles.filter(t=>t.complete&&t.naturalWidth>0&&t.naturalHeight>0).length,visibleTileCount:tiles.filter(t=>t.visible).length,tiles,tileSizeDistribution,
      providerMoving:p.providerMoving,revealAfterBase:p.revealAfterBase,commandPending:p.commandPending,heavyHidden:stage.classList.contains('provider-moving'),providerOnly:stage.classList.contains('provider-only'),
      canvases:providerCanvasVisibility(),canvasPixels,events:p.events.map(e=>({...e})),settleFailure:p.settleFailure||null
    };
  };
  window.naksigwangTileDiagnostic.retry=()=>providerTryRecover('manual');
}
