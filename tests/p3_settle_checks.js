// p3_settle_checks.js — 비치명적 settle timeout·다음 idle 복원·반복 이동 검사
window.p3SettleTest=async()=>{
  const {f,check,settle}=p3HealthFixture,p=PROVIDER_MAP;
  const center=f.getCenter,bounds=f.getBounds,falls=p.fallbackCount||0;
  setMode('pan');S.playing=false;await settle();
  // SDK 이벤트 뒤 RAF만 결정적으로 진행한다. 앱 frame은 호출하지 않으므로 실제 draw는 다음 idle에서 검사한다.
  const pump=action=>{
    const raf=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,queue=new Map();let id=0,probes=0;
    window.requestAnimationFrame=fn=>{queue.set(++id,fn);return id;};window.cancelAnimationFrame=n=>queue.delete(n);
    try{action();while(queue.size){const [key,fn]=queue.entries().next().value;queue.delete(key);fn(performance.now());check(++probes<130,'settle 감시 상한');}}
    finally{window.requestAnimationFrame=raf;window.cancelAnimationFrame=cancel;}
    return probes;
  };
  const retained=()=>{const d=naksigwangTileDiagnostic();check(d.active&&!d.failed&&d.fallbackCount===falls&&d.healthState==='settle-timeout','healthy settle timeout은 위성 유지');check(d.providerDOMVisible&&f.interactive&&d.heavyHidden,'지도 입력 유지·Canvas 보류');check(!p.syncRAF,'timeout 뒤 자체 재시도 없음');return d;};
  const recover=async()=>{f.getCenter=center;f.getBounds=bounds;f.viewportListener('idle');await settle();check(!p.settleTimedOut&&naksigwangTileDiagnostic().healthState==='healthy','다음 idle 재settle');};
  f.getCenter=()=>f.unproject(cw/2+3,ch/2);
  const bases=PERF.counts.renderBase||0;check(pump(()=>f.viewportListener('idle'))===120,'정확히 120 RAF 상한');let d=retained();
  check(Math.abs(d.lastSettleObservation.centerErrorPx-3)<1e-5,'center 3px 원인 기록');check((PERF.counts.renderBase||0)===bases,'timeout 중 heavy rebuild 0');
  await recover();check((PERF.counts.renderBase||0)===bases+1,'다음 idle base 1회');
  p.stableZoom=f.z-1;p.stableScale=f.scale();pump(()=>f.viewportListener('idle'));d=retained();check(d.lastSettleObservation.zoomScalePending,'zoom/scale 대기 원인 기록');p.stableZoom=f.z;await recover();
  let jitter=0;f.getBounds=()=>{const b=bounds.call(f);b[1][0]+=((++jitter)%2)*1e-10;return b;};
  pump(()=>f.viewportListener('idle'));d=retained();check(d.lastSettleObservation.keyChanges===119,'소수 key 변동도 bounded timeout');await recover();
  const timeoutStart=p.settleTimeoutCount;let movingHeavy=0;
  for(let i=0;i<100;i++){
    f.getCenter=()=>f.unproject(cw/2+3,ch/2);const before=PERF.counts.renderBase||0;
    pump(()=>{f.viewportListener(i%2?'zoomstart':'dragstart');if(i%2)f.map.setZoom(i%4===1?12:13);else f.map.panBy({x:4,y:-2});f.viewportListener(i%2?'zoomend':'dragend');f.viewportListener('idle');});
    retained();movingHeavy+=(PERF.counts.renderBase||0)-before;
  }
  check(p.settleTimeoutCount-timeoutStart===100&&movingHeavy===0,'100회 pan/zoom timeout·heavy 0');
  f.getCenter=center;f.getBounds=bounds;await fitGround(38.20854,128.5947,10000);await settle();check(!p.settleTimedOut&&p.lastCommand.status==='settled','timeout 이후 명시적 fit 성공도 상태 해제');const marker=await naksigwangMapDiagnostic(38.20854,128.5947);check(marker.errorPx<=2&&marker.passes,'최종 복구 native Marker 정합');
  return {healthyTimeoutRetained:true,nextIdleRecovered:true,fitRecovered:true,reasonCases:['centerErrorPx','zoomScalePending','keyChanges'],repeatedPanZoom:100,repeatedTimeouts:100,fallbacks:p.fallbackCount-falls,movingHeavy,errorPx:marker.errorPx};
};
