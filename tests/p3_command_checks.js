// p3_command_checks.js — 지연 fitBounds·검색·범위 버튼의 목표 도착 검사
class CommandMapAdapter extends DelayedMapAdapter {
  enqueue(center,z) {
    const ticket=++this.ticket;this.reportedCenter=center;this.reportedZoom=z;
    this.viewportListener?.('center_changed');this.viewportListener?.('zoom_changed');this.viewportListener?.('idle');
    if(this.noop)return;
    let frames=0;const delay=this.fitDelay||2+ticket%4;
    const commit=()=>{if(++frames<delay){requestAnimationFrame(commit);return;}
      if(ticket===this.ticket){this.center=center;this.z=z;this.renderMarkers();this.viewportListener?.('bounds_changed');}
      // 취소된 옛 명령도 늦은 idle을 발생시킨다. 새 목표를 확정하는 근거로 쓰면 안 된다.
      this.viewportListener?.('idle');
    };requestAnimationFrame(commit);
  }
}
window.p3CommandTest=async()=>{
  const check=(ok,msg)=>{if(!ok)throw Error(msg);},f=new CommandMapAdapter();
  showTab('map');await new Promise(r=>setTimeout(r,350));f.init($('providerMap'));
  Object.assign(PROVIDER_MAP,{adapter:f,failed:false,loaded:true,active:false,signature:'',sizeKey:'',events:[],lastCommand:null});
  f.onViewportReady(providerViewportChanged);f.onTilesLoaded(()=>{PROVIDER_MAP.loaded=true;providerCheck();});
  f.center=[126.502,36.151];f.reportedCenter=f.center;f.z=13;f.reportedZoom=f.z;providerSync();providerCheck();
  const savedAB=JSON.stringify({A:S.A,B:S.B}),samples=[];
  const verify=async(name,command,lat,lon)=>{
    check(command?.ok&&command.status==='settled',name+' 명령 완료 '+command?.reason);
    const o=command.trace.at(-1);check(o.reached&&o.inside&&command.trace.at(-2).key===o.key,name+' 목표/중심/배율·두 프레임 안정화');
    const c=f.unproject(cw/2,ch/2);check(Math.abs(V.cx-mxOf(c[0]))<.001&&Math.abs(V.cy-myOf(c[1]))<.001&&Math.abs(V.s*kAt(c[1])-f.getGroundScale())<1e-9,'settled V 호환');
    const r=await naksigwangMapDiagnostic(lat??command.target[1],lon??command.target[0]);
    check(r.valid&&r.errorPx<=2&&r.domMismatchPx<=2,name+' native DOM/Canvas');
    check(JSON.stringify({A:S.A,B:S.B})===savedAB,'A/B 원좌표 보존');
    samples.push({name,id:command.id,target:command.target,center:command.center,zoom:r.providerZoom,errorPx:r.errorPx,domMismatchPx:r.domMismatchPx,trace:command.trace});
  };
  for(const [name,lat,lon,width] of [['홍원→속초',38.20854,128.5947,10000],['속초→포항',36.05,129.38,10000]]){
    const before=JSON.stringify(V),reads=PROVIDER_MAP.reads,promise=fitGround(lat,lon,width);
    providerSync();providerReadView();check(PROVIDER_MAP.commandPending&&JSON.stringify(V)===before&&PROVIDER_MAP.reads===reads,'fit 직후 옛 viewport 읽기 차단');
    await verify(name,await promise,lat,lon);
  }
  await verify('포항→전국',await fitLonLat([124.4,32.9,131.95,38.7]));
  await verify('전국→주문진 2km',await fitGround(37.89192,128.8312883028771,2000),37.89192,128.8312883028771);
  const zoomOnly=await fitGround(37.89192,128.8312883028771,1000);
  check(zoomOnly.trace.some(o=>o.zoomPending&&!o.reached),'같은 중심의 옛 zoom projection도 확정하지 않음');
  await verify('같은 중심 zoom 변경',zoomOnly,37.89192,128.8312883028771);
  const submit=q=>{$('coordIn').value=q;$('coordForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return PROVIDER_MAP.pendingCommand?.promise;};
  for(let i=0;i<10;i++){
    const [lat,lon]=i%2?[36.05,129.38]:[38.20854,128.5947];
    await verify('좌표 검색 '+i,await submit(lat+','+lon),lat,lon);
    check(JSON.stringify(S.pin)===JSON.stringify([mxOf(lon),myOf(lat)]),'검색 pin 좌표');
  }
  const rapid=[];for(let i=0;i<10;i++)rapid.push(submit(i%2?'36.05,129.38':'38.20854,128.5947'));
  const results=await Promise.all(rapid);check(results.slice(0,-1).every(r=>!r.ok&&r.reason==='superseded'),'이전 검색 9개 취소');
  await verify('빠른 연속 검색 최종',results.at(-1),36.05,129.38);
  check(findPlace('홍원항'),'항구 이름 fixture');await verify('항구 이름 검색',await submit('홍원항'));
  for(const b of document.querySelectorAll('[data-bb]')){b.click();await verify('범위 '+b.textContent,await PROVIDER_MAP.pendingCommand.promise);}
  // 진단 fit은 8프레임보다 늦은 반영도 기다린 후에 측정한다.
  f.fitDelay=12;const slow=await naksigwangMapDiagnostic.fit(10000,38.20854,128.5947);
  check(slow.valid&&slow.command.ok&&slow.command.trace.length>=12&&slow.errorPx<=2,'진단 fit 완료 대기');
  f.fitDelay=3;
  const timeout=PROVIDER_MAP.commandTimeoutMs;PROVIDER_MAP.commandTimeoutMs=180;f.noop=true;
  const failed=await naksigwangMapDiagnostic.fit(10000,36.05,129.38);
  check(!failed.valid&&failed.reason==='requested viewport not reached'&&failed.command.status==='failed'&&failed.errorPx===null,'미도착 원인 구분');
  check(PROVIDER_MAP.active&&!PROVIDER_MAP.commandPending,'미도착은 projection fallback 아님');
  f.noop=false;PROVIDER_MAP.commandTimeoutMs=timeout;
  const recovered=await naksigwangMapDiagnostic.fit(10000,36.05,129.38);check(recovered.valid&&recovered.errorPx<=2,'timeout 뒤 재검색');
  // 사용자 pan 명령은 미완료 fit을 취소한다.
  const interrupted=fitGround(38.20854,128.5947,10000);providerPanBy(5,3);check((await interrupted).reason==='interrupted','사용자 이동 우선');
  await new Promise(r=>setTimeout(r,200));
  providerClearDiagnostic();f.destroy();PROVIDER_MAP.adapter=null;providerFallback();
  return {samples,slow:{errorPx:slow.errorPx,frames:slow.command.trace.length},timeout:{reason:failed.reason,center:failed.center,target:failed.command.target},superseded:results.length-1,maxErrorPx:Math.max(...samples.map(s=>s.errorPx),slow.errorPx,recovered.errorPx)};
};
