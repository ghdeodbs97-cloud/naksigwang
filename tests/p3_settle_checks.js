// p3_settle_checks.js — 종료 뒤 무입력 복원·idle authority·100회 반복 drag 검사
window.p3SettleTest=async()=>{
  const {f,check,settle}=p3HealthFixture,p=PROVIDER_MAP,center=f.getCenter,falls=p.fallbackCount||0;
  const tick=()=>new Promise(requestAnimationFrame);setMode('pan');S.playing=false;await settle();
  let quiet=0,previous=-1;for(let i=0;i<300&&quiet<45;i++){await tick();const count=PERF.counts.renderBase||0;quiet=!OFFICIAL_DEPTH.pending.size&&!dirty&&(CR.ready||CR.err)&&count===previous?quiet+1:0;previous=count;}check(quiet>=45,'이동 계측 전 자료 로딩 '+JSON.stringify({pending:OFFICIAL_DEPTH.pending.size,queued:RENDER.depthQueued,dirty,cr:CR.ready,err:CR.err,quiet,previous}));
  const visible=()=>{const d=naksigwangTileDiagnostic();check(d.active&&!d.failed&&d.fallbackCount===falls&&d.providerDOMVisible,'위성 유지');check(!d.providerMoving&&!d.gesture&&!d.waitingIdle&&!d.heavyHidden&&!d.revealAfterBase,'최종 종료 상태');check(d.canvases.every(c=>c.visibility==='visible'),'모든 overlay visible');return d;};
  f.getCenter=()=>f.unproject(cw/2+3,ch/2);
  // idle은 2px 오차가 있어도 최종 SDK 표시 좌표를 읽는다. 그 뒤 timeout도 강제해 같은 DRAW 경로를 검사한다.
  const bases=PERF.counts.renderBase||0;nativePointers.add(-7);f.viewportListener('dragstart');
  for(let i=0;i<4;i++)await tick();check((PERF.counts.renderBase||0)===bases,'이동 중 heavy 0');
  $('providerMap').dispatchEvent(new PointerEvent('pointerup',{pointerId:-7,bubbles:true}));check(nativePointers.size===0,'pointerup capture 종료');f.viewportListener('dragend');f.viewportListener('idle');
  cancelAnimationFrame(p.syncRAF);p.syncRAF=0;providerSettleTimeout();await settle();visible();
  check((PERF.counts.renderBase||0)===bases+1,'idle→강제 timeout 뒤 base 1회');
  const idleBase=PERF.counts.renderBase||0;f.viewportListener('idle');await settle();for(let i=0;i<20;i++)await tick();visible();check((PERF.counts.renderBase||0)===idleBase+1,'center 3px idle base 횟수 '+((PERF.counts.renderBase||0)-idleBase)+' / '+p.lastFinalViewport.source);
  // idle 없이 dragend만 온 뒤 더 이상 이벤트를 보내지 않는다. 실제 RAF·시계로 자동 복원을 검사한다.
  const before=PERF.counts.renderBase||0,time=performance.now(),timeouts=p.settleTimeoutCount;
  f.viewportListener('dragstart');f.viewportListener('dragend');await settle();const noInputRecoveryMs=performance.now()-time;visible();
  check(p.settleTimeoutCount===timeouts+1&&noInputRecoveryMs<750,'무입력 자동 복구 상한 750ms');check((PERF.counts.renderBase||0)===before+1,'자동 timeout base 1회');
  let movingHeavy=0,permanentHidden=0;const recovery=[];
  for(let i=0;i<100;i++){
    const before=PERF.counts.renderBase||0;nativePointers.add(-7);f.viewportListener('dragstart');f.map.panBy({x:i%2?4:-4,y:i%2?2:-2});
    await tick();movingHeavy+=(PERF.counts.renderBase||0)-before;nativePointers.delete(-7);
    // 실제 pointerup capture 경로도 사용한다. 이후 SDK idle이 없어도 종료 감시가 남는다.
    $('providerMap').dispatchEvent(new PointerEvent('pointerup',{pointerId:-7,bubbles:true}));f.viewportListener('dragend');
    const start=performance.now();if(i%2)f.viewportListener('idle');else {cancelAnimationFrame(p.syncRAF);p.syncRAF=0;providerSettleTimeout();}
    await settle();const d=visible();permanentHidden+=Number(d.heavyHidden);recovery.push(performance.now()-start);
    check((PERF.counts.renderBase||0)===before+1,'반복 종료 base 정확히 1회');
  }
  check(movingHeavy===0&&permanentHidden===0,'100회 drag heavy/영구 숨김 0');
  f.getCenter=center;await fitGround(38.20854,128.5947,10000);await settle();const marker=await naksigwangMapDiagnostic(38.20854,128.5947);check(marker.passes&&marker.errorPx<=2,'최종 native Marker 정합');
  return {idleAuthoritative:true,forcedTimeoutVisible:true,noInputRecoveryMs,repeatedDrag:100,permanentHidden,movingHeavy,basePerEnd:1,fallbacks:p.fallbackCount-falls,maxRecoveryMs:Math.max(...recovery),errorPx:marker.errorPx};
};
