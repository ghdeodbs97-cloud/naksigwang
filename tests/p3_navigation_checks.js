// p3_navigation_checks.js — 장봉항 광역 잔류·부분 반영·옛 이벤트와 명시적 이동 보정 회귀
class NavigationMapAdapter extends CommandMapAdapter {
  init(el) {
    super.init(el);this.behavior='normal';this.repairs=0;
    const zoom=this.map.setZoom;
    this.map.setZoom=(z,effect)=>{this.repairs++;if(this.behavior==='all-noop')return;zoom(z,effect);};
  }
  applyGeographicBounds(bounds) {
    const view=p3BoundsView(bounds),center=[lonOf(view.cx),latOf(view.cy)],z=clamp(Math.round(Math.log2(view.s*200000)),6,21);
    this.primaryCalls=(this.primaryCalls||0)+1;
    if(['fit-noop','all-noop','unchanged'].includes(this.behavior))return;
    if(['center-only','wrong-scale'].includes(this.behavior)){this.center=center;this.reportedCenter=center;this.renderMarkers();this.viewportListener('idle');return;}
    if(this.behavior==='delayed')this.fitDelay=20;
    if(this.behavior==='delayed-long')this.fitDelay=40;
    if(this.behavior==='idle-before-zoom'){this.viewportListener('idle');this.fitDelay=12;}
    this.enqueue(center,z);
    if(['late-bounds','stale-idle'].includes(this.behavior)){
      const generation=PROVIDER_MAP.commandId;
      setTimeout(()=>{for(const name of ['idle','center_changed','bounds_changed','zoom_changed'])this.viewportListener(name);this.loaded?.();this.lateGeneration=generation;},90);
    }
  }
  setCenter(lon,lat){if(this.behavior==='all-noop')return;super.setCenter(lon,lat);}
}
window.p3NavigationTest=async({repeat=100}={})=>{
  const tick=()=>new Promise(requestAnimationFrame),p=PROVIDER_MAP,check=(ok,msg)=>{if(!ok)throw Error(msg);};
  showTab('map');await new Promise(r=>setTimeout(r,350));S.playing=false;S.layers.flow=false;
  const f=new NavigationMapAdapter();f.init($('providerMap'));
  Object.assign(p,{adapter:f,active:false,failed:false,loaded:true,signature:'',sizeKey:'',stableZoom:null,stableScale:0,navigationFailed:false,fallbackCount:0,lastFallbackReason:null,healthState:'healthy'});
  f.onViewportReady(providerViewportChanged);f.onTilesLoaded(providerTilesLoaded);providerSync();providerCheck();
  const jang=PORTS.find(q=>q.name==='장봉항'),j=POINTS.findIndex(q=>q.name==='장봉항');
  check(jang&&j>=0,'저장소 실제 장봉항 POINTS/PORTS 필수');
  const ports=[jang,{name:'속초',lat:38.20854,lon:128.5947},{name:'포항',lat:36.05,lon:129.38},{name:'주문진',lat:37.89192,lon:128.8312883028771},{name:'묵호',lat:37.55,lon:129.12},jang];
  const samples=[],counts={};let ab=JSON.stringify([S.A,S.B]),permanentHidden=0,movingHeavy=0,maxMarker=0;
  const settle=async()=>{for(let i=0;i<100;i++){await tick();if(!p.commandPending&&!p.providerMoving&&!p.revealAfterBase&&!dirty)return;}throw Error('navigation 공개 누락 '+JSON.stringify({pending:p.commandPending,moving:p.providerMoving,reveal:p.revealAfterBase,dirty,gesture:p.gesture,waiting:p.waitingIdle,health:p.healthState,last:p.lastCommand?.status,trace:p.pendingCommand?.trace.at(-1)}));};
  const broad=(commit=true)=>{f.center=[129,35];f.reportedCenter=f.center;f.z=Math.log2(cw/(1049000*kAt(35))*200000);f.reportedZoom=f.z;p.stableZoom=null;p.navigationFailed=false;if(commit)providerReadView();p.signature=providerViewportKey();};
  const verify=async(r,name)=>{
    check(r?.ok&&r.status==='settled',name+' 도착 '+JSON.stringify(r));await settle();
    const o=r.trace.at(-1);check(o.reached&&o.inside&&r.visibleWidthM/r.requestedGroundWidth>=.5&&r.visibleWidthM/r.requestedGroundWidth<=2,name+' 실제 목표·폭');
    check(r.navigationType==='point'||r.navigationType==='bounds','명령 종류');
    if(r.requestedGroundWidth<10000)check(r.visibleWidthM<20000,'1049km 잔류 거절');
    const hidden=stage.classList.contains('provider-moving');permanentHidden+=Number(hidden);
    check(p.active&&!p.failed&&!p.fallbackCount&&!p.commandPending&&!hidden,'provider/Canvas 종료');
    check(JSON.stringify([S.A,S.B])===ab,'A/B 좌표 유지');
    providerClearDiagnostic();PROVIDER_DEBUG={lat:r.target[1],lon:r.target[0],native:f.createDebugMarker(r.target[1],r.target[0])};drawUI();
    const probe=providerProbeSample(PROVIDER_DEBUG,0);check(probe.valid&&probe.errorPx<=2,name+' DOM Marker vs Canvas');maxMarker=Math.max(maxMarker,probe.errorPx);
    samples.push({name,status:r.navigationStatus,visibleWidthM:r.visibleWidthM,requestedWidthM:r.requestedGroundWidth,usedRepair:r.usedRepair,primaryMs:r.primaryLatencyMs,noopMs:r.noopDetectionMs,repairMs:r.repairLatencyMs,totalMs:r.totalLatencyMs,errorPx:probe.errorPx});
    counts[name]=(counts[name]||0)+1;if(samples.length%100===0)console.log('navigation progress '+samples.length);
  };
  const go=async(point,name,width=2500)=>{
    const previous={key:providerViewportKey(),center:f.unproject(cw/2,ch/2),reported:JSON.stringify(f.getCenter()),bounds:JSON.stringify(f.getBounds())};
    const promise=fitGround(point.lat,point.lon,width,{targetName:point.name});
    const before=PERF.counts.renderBase||0;await tick();if(p.commandPending){movingHeavy+=(PERF.counts.renderBase||0)-before;check((PERF.counts.renderBase||0)===before,'navigation 중 heavy 0');}
    const r=await promise;await verify(r,name);
    if(Math.hypot(previous.center[0]-point.lon,previous.center[1]-point.lat)>.001)check(previous.key!==providerViewportKey()&&previous.bounds!==JSON.stringify(f.getBounds())&&previous.reported!==JSON.stringify(f.getCenter()),name+' 실제 center/key/bounds 변경');return r;
  };
  // 과거의 정확한 실패 조건: 건강한 SDK가 fit을 무시하여 약 1049km 화면에 남음.
  broad();f.behavior='fit-noop';const repaired=await go(jang,'reproduction');
  check(repaired.trace.some(o=>o.visibleWidthM>1000000&&!o.reached)&&repaired.usedRepair,'광역 no-op 재현과 보정');
  const previous=JSON.stringify(V),selection=S.pt,timeout=p.commandTimeoutMs;p.commandTimeoutMs=900;f.behavior='all-noop';broad(false);const saved=JSON.stringify(V);
  const fail=await selectPoint(j,true);await settle();
  check(!fail.ok&&fail.usedRepair&&fail.settledView===null&&JSON.stringify(V)===saved&&S.pt===selection,'실패 시 V/선택 성공 commit 금지');
  check(fail.visibleWidthM>1000000&&$('providerNotice').textContent.includes('장봉항'),'미도착 명시');
  S.lock=true;const lockedFail=await selectPoint(j,true);S.lock=false;await settle();check(!lockedFail.ok&&S.pt===selection&&JSON.stringify(V)===saved,'오늘 잠금 지도도 실패 선택/V 보존');p.commandTimeoutMs=timeout;
  f.behavior='normal';
  for(let i=0;i<repeat;i++){broad();$('stSel').value=String(j);$('stSel').dispatchEvent(new Event('change'));await verify(await p.pendingCommand.promise,'장봉항 광역→근접');check(S.pt===j,'dropdown 성공 후 선택 확정');}
  for(let cycle=0;cycle<repeat;cycle++)for(const port of ports)await go(port,'원거리 순환');
  f.behavior='fit-noop';for(let i=0;i<repeat;i++){broad();const r=await go(jang,'fitBounds no-op');check(r.usedRepair&&r.noopDetectionMs>=500&&r.noopDetectionMs<1000,'8초 전 유한 no-op 감지');}
  for(const behavior of ['center-only','delayed','delayed-long','idle-before-zoom','late-bounds','stale-idle','wrong-scale','unchanged']){
    broad();f.behavior=behavior;await go(jang,behavior);
  }
  f.behavior='normal';f.fitDelay=4;
  const rapid=ports.slice(0,3).map(q=>fitGround(q.lat,q.lon,2500,{targetName:q.name})),results=await Promise.all(rapid);
  check(results.slice(0,-1).every(r=>r.status==='cancelled'&&r.reason==='superseded'),'이전 generation 취소');await verify(results.at(-1),'rapid supersession');
  const id=p.commandId;await new Promise(r=>setTimeout(r,120));check(p.commandId===id&&p.lastCommand.targetName===ports[2].name,'옛 callback 최종 명령 덮어쓰기 차단');
  const submit=q=>{$('coordIn').value=q;$('coordForm').dispatchEvent(new Event('submit',{cancelable:true}));return p.pendingCommand?.promise;};
  const searches=[submit('장봉항'),submit('38.20854,128.5947'),submit('36.05,129.38')],searchResults=await Promise.all(searches);
  check(searchResults.slice(0,-1).every(r=>r.reason==='superseded'),'빠른 검색 이전 선택 callback 취소');await verify(searchResults.at(-1),'rapid search supersession');
  check(JSON.stringify(S.pin)===JSON.stringify([mxOf(129.38),myOf(36.05)]),'빠른 검색 마지막 pin만 commit');
  await verify(await submit('장봉항'),'정확한 항구 검색');
  const rock=POINTS.find(q=>q.kind==='rock');check(rock,'실제 갯바위');await verify(await submit(rock.name),'갯바위 검색');
  await verify(await submit(jang.lat+','+jang.lon),'좌표 검색');
  const station=STATIONS.find(q=>!findPlace(q.name));check(station,'관측소 fallback fixture');const oldLink=$('kakaoLink').href,stationPromise=submit(station.name);check($('coordMsg').textContent===''&&$('kakaoLink').href===oldLink,'완료 안내/링크도 성공 전 commit 보류');await verify(await stationPromise,'station fallback');
  for(const b of document.querySelectorAll('[data-bb]')){b.click();const r=await p.pendingCommand.promise;check(r.navigationType==='bounds','preset bounds 종류');await verify(r,'범위 '+b.textContent);}
  await verify(await fitBox(jang.mx-2000,jang.my-2000,jang.mx+2000,jang.my+2000),'fitBox');
  for(const kind of ['drag','wheel','mode','tabs','resize']){
    if(kind==='drag'){f.viewportListener('dragstart');f.map.panBy({x:30,y:15});f.viewportListener('dragend');f.viewportListener('idle');}
    if(kind==='wheel')providerZoomAt(cw/2,ch/2,2);
    if(kind==='mode')providerSetMode('hybrid');
    if(kind==='tabs'){showTab('today');await tick();showTab('map');ab=JSON.stringify([S.A,S.B]);}
    if(kind==='resize'){stage.style.width=(cw-13)+'px';resize();}
    await go(jang,kind+' 후 장봉항');
  }
  await settle();await new Promise(r=>setTimeout(r,150));await settle();
  const diag=naksigwangMapDiagnostic.lastNavigation();check(diag.ok&&diag.targetName==='장봉항'&&diag.visibleWidthM<20000,'한 줄 진단');
  check(movingHeavy===0&&permanentHidden===0,'성능·공개 회귀');
  return {expectedFailures:2,scope:'실 API/credential 없는 native RAF SDK mock',jang:{name:jang.name,lat:jang.lat,lon:jang.lon},counts,samples,fail:{visibleWidthM:fail.visibleWidthM,status:fail.navigationStatus,usedRepair:fail.usedRepair,VUnchanged:true,selectionUnchanged:true},movingHeavy,permanentHidden,fallbacks:p.fallbackCount,maxMarker,diag};
};
