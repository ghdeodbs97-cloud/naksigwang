// p3_viewport_checks.js — projection 지연·이른 idle·연속 이동의 최종 렌더링 검사
class DelayedMapAdapter extends FakeMapAdapter {
  init(el) {
    super.init(el);this.reportedCenter=this.center;this.reportedZoom=this.z;this.ticket=0;
    this.map.panBy=p=>{const c=fakeWorld(...this.center);this.enqueue(fakeCoord(c[0]+p.x/this.scale(),c[1]-p.y/this.scale()),this.z);};
    this.map.zoomBy=(delta,ll)=>{const p=this.referenceProject(ll.lng(),ll.lat()),w=fakeWorld(ll.lng(),ll.lat()),z=Math.max(6,Math.min(21,this.z+delta)),s=2**z/200000;
      this.enqueue(fakeCoord(w[0]-(p[0]-cw/2)/s,w[1]+(p[1]-ch/2)/s),z);};
  }
  enqueue(center,z) {
    const ticket=++this.ticket;this.reportedCenter=center;this.reportedZoom=z;
    this.viewportListener?.('center_changed');this.viewportListener?.('zoom_changed');this.viewportListener?.('idle');
    let frames=0;const commit=()=>{if(ticket!==this.ticket)return;if(++frames<3){requestAnimationFrame(commit);return;}
      this.center=center;this.z=z;this.renderMarkers();
      // 절반은 최종 이벤트도 생략해 매 프레임 projection 읽기로 회복하는지 검사한다.
      if(ticket%2){this.viewportListener?.('bounds_changed');this.viewportListener?.('idle');}
    };requestAnimationFrame(commit);
  }
  getCenter(){return this.reportedCenter;}
  getZoom(){return this.reportedZoom;}
  setCenter(lon,lat){this.enqueue([lon,lat],this.z);}
  applyGeographicBounds(bounds){const view=p3BoundsView(bounds);this.enqueue([lonOf(view.cx),latOf(view.cy)],Math.max(6,Math.min(21,Math.round(Math.log2(view.s*200000)))));this.loaded?.();}
}
window.p3ViewportTest=async()=>{
  const check=(ok,msg)=>{if(!ok)throw Error(msg);},wait=async()=>{for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);};
  showTab('map');await new Promise(r=>setTimeout(r,350));
  const f=new DelayedMapAdapter();f.init($('providerMap'));
  Object.assign(PROVIDER_MAP,{adapter:f,failed:false,loaded:true,active:false,signature:'',sizeKey:'',events:[],lastBaseFrame:null});
  f.onViewportReady(providerViewportChanged);f.onTilesLoaded(()=>{PROVIDER_MAP.loaded=true;providerCheck();});
  fitGround(38.20854,128.5947,10000);providerSync();await wait();providerCheck();
  S.pin=[mxOf(128.5947),myOf(38.20854)];S.A=[mxOf(128.59),myOf(38.21)];S.B=[mxOf(128.60),myOf(38.20)];
  const coordinates=()=>JSON.stringify({pin:S.pin,A:S.A,B:S.B}),saved=coordinates(),samples=[];
  const sample=async(kind,i,action)=>{
    const result=await providerMarkerDiagnostic(38.20854,128.5947,action);
    check(result.timeline.length===9,'0~8프레임 기록');
    check(providerCanvasVisibility().every(c=>c.visibility==='visible'&&c.display!=='none'&&Number(c.opacity)>0),kind+' 최종 Canvas 공개');
    check(result.passes&&result.errorPx<=2&&result.domMismatchPx<=2,kind+' 최종 정합 '+i);
    check(result.timeline.slice(-3).every(s=>s.valid&&s.errorPx<=2),'마지막 3프레임 정합');
    check(result.baseFrame?.viewport===PROVIDER_MAP.signature,'최종 base 재그리기');
    check(Math.abs(result.baseFrame.gpp-result.gpp)<1e-8,'LOD 축척 최신화');
    check(coordinates()===saved,'A/B/pin 원좌표 유지');
    samples.push({kind,i,errorPx:result.errorPx,domMismatchPx:result.domMismatchPx,maxObservedErrorPx:result.maxObservedErrorPx,timeline:result.timeline});
  };
  await sample('initial',0);
  const writes=f.syncCalls||0,commands=PROVIDER_MAP.commands,actual=pxPerGround();V.s*=1000;
  check(Math.abs(pxPerGround()-actual)<1e-12,'stale V가 표시 축척에 영향 없음');providerSync();
  check((f.syncCalls||0)===writes&&PROVIDER_MAP.commands===commands,'V 변경을 SDK로 역전송하지 않음');
  for(let i=0;i<20;i++)await sample('pan',i,()=>f.map.panBy(new P3ProbeXY(i%2?7:-7,i%2?4:-4)));
  for(let i=0;i<20;i++)await sample('zoom',i,()=>providerZoomAt(cw/2,ch/2,i%2?.5:2));
  for(let i=0;i<20;i++)await sample('mixed',i,()=>i%3===0?providerZoomAt(cw/2,ch/2,i%2?.5:2):providerPanBy(i%2?5:-5,i%2?3:-3));
  for(const mode of ['satellite','hybrid','normal'])await sample('mode',mode,()=>providerSetMode(mode));
  const oldWidth=stage.style.width;
  await sample('resize',0,()=>{stage.style.width=(cw-37)+'px';resize();});
  await sample('resize',1,()=>{stage.style.width=oldWidth;resize();});
  // 근거리 V를 남긴 뒤 SDK만 전국으로 이동한 이전 실패와 같은 조건.
  fitGround(36,128,1000);await wait();f.enqueue([128,36],7);await wait();renderBase();
  const nation={...stationDrawStats,providerGpp:1/f.getGroundScale(),view:{...V}};
  check(nation.gpp>1000&&nation.count<200&&nation.labels<30,'전국 과밀 방지');
  const lod=[];
  for(const [name,width,lat,lon] of [['전국',600000,36,128],['동해안',300000,37.2,129],['60km',60000,38.20854,128.5947],['10km',10000,38.20854,128.5947],['2km',2000,38.20854,128.5947],['1km',1000,38.20854,128.5947]]){
    fitGround(lat,lon,width);await wait();renderBase();lod.push({name,width,...stationDrawStats,eligible:POINTS.filter(p=>stationDetailAllowed(p,stationDrawStats.gpp)).length});
  }
  check(lod.every((s,i)=>!i||s.eligible>=lod[i-1].eligible),'확대할수록 상세 포인트 허용 집합 증가');
  check(coordinates()===saved,'LOD 전환에서도 원좌표 유지');
  providerClearDiagnostic();f.destroy();PROVIDER_MAP.adapter=null;providerFallback();
  return {samples,nation,lod,maxFinalErrorPx:Math.max(...samples.map(s=>s.errorPx)),staleFrames:samples.flatMap(s=>s.timeline).filter(s=>s.errorPx>2).length};
};
