// p3_pane_checks.js — 실제 NAVER 어댑터의 내부 pane 좌표와 고정 Canvas 좌표 분리 검사
window.p3PaneTest=async()=>{
  const check=(v,m)=>{if(!v)throw Error(m);},tick=()=>new Promise(requestAnimationFrame);
  showTab('map');await new Promise(r=>setTimeout(r,350));S.playing=false;S.layers.flow=true;setMode('pan');
  const container=$('providerMap'),listeners=new Map(),markers=new Set();
  class LL extends P3ProbeLL{}
  class XY extends P3ProbeXY{}
  class PaneMap{
    constructor(el,o){this.c=o.center;this.z=o.zoom;this.origin=this.c;this.shift=[0,0];this.pane=document.createElement('div');this.pane.style.cssText='position:absolute;left:0;top:0;width:0;height:0';el.append(this.pane);const surface=document.createElement('canvas');surface.width=surface.height=1;this.surface=surface;el.append(surface);}
    emit(name){for(const f of listeners.get(name)||[])f();}
    scale(){return 2**this.z/200000;}
    setMapTypeId(){}setOptions(){}setSize(){}stop(){}
    getCenter(){return this.c;}getZoom(){return this.z;}getPanes(){return {overlayLayer:this.pane};}
    setCenter(c){this.c=c;const o=fakeWorld(this.origin.lng(),this.origin.lat()),n=fakeWorld(c.lng(),c.lat());this.shift=[(o[0]-n[0])*this.scale(),(n[1]-o[1])*this.scale()];this.pane.style.transform=`translate(${this.shift[0]}px,${this.shift[1]}px)`;this.emit('center_changed');this.emit('bounds_changed');}
    setZoom(z){this.z=z;this.origin=this.c;this.shift=[0,0];this.pane.style.transform='';for(const m of markers)m.render();this.emit('zoom_changed');}
    fitBounds(b){const v=p3BoundsView(p3StrictBounds(b));this.setCenter(new LL(latOf(v.cy),lonOf(v.cx)));this.setZoom(Math.round(Math.log2(v.s*200000)));this.emit('idle');}
    getBounds(){const c=fakeWorld(this.c.lng(),this.c.lat()),s=this.scale(),sw=fakeCoord(c[0]-cw/2/s,c[1]-ch/2/s),ne=fakeCoord(c[0]+cw/2/s,c[1]+ch/2/s);return new P3ProbeBounds(new LL(sw[1],sw[0]),new LL(ne[1],ne[0]));}
    getProjection(){const c=fakeWorld(this.origin.lng(),this.origin.lat()),s=this.scale(),point=p=>new XY((p.x-c[0])*s+cw/2,(c[1]-p.y)*s+ch/2);return {
      fromCoordToPoint:ll=>new XY(...fakeWorld(ll.lng(),ll.lat())),fromPointToOffset:point,
      fromCoordToOffset:ll=>{const w=fakeWorld(ll.lng(),ll.lat());return point(new XY(...w));},
      fromOffsetToCoord:p=>{const ll=fakeCoord(c[0]+(p.x-cw/2)/s,c[1]-(p.y-ch/2)/s);return new LL(ll[1],ll[0]);},
      getDestinationCoord:(ll,angle,m)=>{const p=fakeDestination(ll.lng(),ll.lat(),m);return new LL(p[1],p[0]);}
    };}
    destroy(){this.pane.remove();this.surface.remove();}
  }
  class Marker{
    constructor(o){this.o=o;this.element=o.icon.content;this.setMap(o.map);}
    setMap(map){markers.delete(this);this.element.remove();this.map=map;if(map){markers.add(this);map.pane.append(this.element);this.render();}}
    render(){const m=this.map,o=fakeWorld(m.origin.lng(),m.origin.lat()),w=fakeWorld(this.o.position.lng(),this.o.position.lat()),a=this.o.icon.anchor;this.element.style.position='absolute';this.element.style.left=((w[0]-o[0])*m.scale()+cw/2-a.x)+'px';this.element.style.top=((o[1]-w[1])*m.scale()+ch/2-a.y)+'px';}
  }
  const sdk={Map:PaneMap,LatLng:LL,LatLngBounds:P3ProbeBounds,Point:XY,Size:XY,Marker,MapTypeId:{SATELLITE:1,HYBRID:2,NORMAL:3},Event:{addListener:(m,name,f)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(f);return [name,f];},removeListener:([name,f])=>listeners.get(name)?.delete(f)}};
  const a=new NaverMapAdapter(sdk);a.init(container);const p=PROVIDER_MAP;
  Object.assign(p,{adapter:a,failed:false,active:false,loaded:true,signature:'',sizeKey:'',navigationFailed:false,stableZoom:null,healthState:'healthy',fallbackCount:0});a.onViewportReady(providerViewportChanged);
  const jang=PORTS.find(q=>q.name==='장봉항');await fitGround(jang.lat,jang.lon,2500);
  const wait=async()=>{for(let i=0;i<60;i++){await tick();if(!p.providerMoving&&!p.commandPending&&!p.revealAfterBase&&!dirty&&!stage.classList.contains('provider-moving'))return;}throw Error('pane 최종 공개 상한');};
  await wait();S.pin=[mxOf(jang.lon),myOf(jang.lat)];S.A=[mxOf(jang.lon-.0005),myOf(jang.lat+.0005)];S.B=[mxOf(jang.lon+.0005),myOf(jang.lat-.0005)];
  const abMarkers=[S.A,S.B].map(q=>a.createDebugMarker(latOf(q[1]),lonOf(q[0]))),arc=uctx.arc,draw=drawUI;let arcs=[],inUI=false;
  uctx.arc=function(x,y,r,...rest){if(inUI&&r===9)arcs.push([x,y]);return arc.call(this,x,y,r,...rest);};drawUI=(...args)=>{arcs=[];inUI=true;try{return draw(...args);}finally{inUI=false;}};
  PROVIDER_DEBUG={lat:jang.lat,lon:jang.lon,native:a.createDebugMarker(jang.lat,jang.lon)};dirty=true;await p3WaitDepthQuiet();await wait();
  const before=JSON.stringify([S.pin,S.A,S.B]),rawStart=a.map.getProjection().fromCoordToOffset(new LL(jang.lat,jang.lon));let maxError=0,maxAB=0,maxRawError=0,maxRoundtrip=0,visible=0;
  const rect=container.getBoundingClientRect(),pointer=type=>container.dispatchEvent(new PointerEvent(type,{pointerId:951,pointerType:'mouse',clientX:rect.left+cw*.2,clientY:rect.top+ch*.2,bubbles:true}));
  for(let i=0;i<100;i++){
    pointer('pointerdown');check(getComputedStyle(ui).visibility==='hidden','pane pan 첫 paint 전 숨김');
    const dir=[[1,0],[0,1],[-1,0],[0,-1]][i%4],w=fakeWorld(a.map.c.lng(),a.map.c.lat()),ll=fakeCoord(w[0]+dir[0]*37.375/a.map.scale(),w[1]+dir[1]*29.625/a.map.scale());
    a.map.setCenter(new LL(ll[1],ll[0]));await tick();check(getComputedStyle(ui).visibility==='hidden','pane pan 중 숨김');pointer('pointerup');a.map.emit('idle');await wait();
    const marker=PROVIDER_DEBUG.native.element.getBoundingClientRect(),canvas=ui.getBoundingClientRect(),expected=[marker.left+marker.width/2-canvas.left,marker.top+marker.height/2-canvas.top],actual=toS(...S.pin),e=Math.hypot(actual[0]-expected[0],actual[1]-expected[1]);
    maxError=Math.max(maxError,e);check(e<=.1,'실제 adapter pane DOM 중심 정합 '+e);
    const raw=a.map.getProjection().fromCoordToOffset(new LL(jang.lat,jang.lon));maxRawError=Math.max(maxRawError,Math.hypot(raw.x-expected[0],raw.y-expected[1]));
    if(i===0)check(raw.x===rawStart.x&&raw.y===rawStart.y,'pan 중 SDK offset 불변 재현');
    const sample=providerProbeSample(PROVIDER_DEBUG,0);check(sample.valid&&sample.errorPx<=2,'pane native DOM 대 Canvas raster '+sample.errorPx);maxError=Math.max(maxError,sample.errorPx);
    check(arcs.length>=2,'A/B 실제 draw 중심 존재');for(let k=0;k<2;k++){const r=abMarkers[k].element.getBoundingClientRect(),e=Math.hypot(arcs[k][0]-(r.left+r.width/2-canvas.left),arcs[k][1]-(r.top+r.height/2-canvas.top));maxAB=Math.max(maxAB,e);check(e<=.1,'pane 실제 A/B draw와 Marker DOM 정합 '+e);}
    for(const point of [S.pin,S.A,S.B]){const q=toS(...point),back=toM(...q);maxRoundtrip=Math.max(maxRoundtrip,Math.hypot(back[0]-point[0],back[1]-point[1]));}
    check(getComputedStyle(ui).visibility==='visible'&&!p.failed&&p.active,'pan 뒤 위성·overlay 유지');visible++;
  }
  check(maxRawError>30,'기존 미변환 offset의 pan 오차 재현');check(before===JSON.stringify([S.pin,S.A,S.B]),'pin/A/B 경위도 보존');check(maxRoundtrip<.001,'pane 역변환 정합');
  a.map.setCenter(new LL(jang.lat,jang.lon+.0002));a.map.setZoom(a.map.z+1);a.map.emit('idle');await wait();check(a.screenOrigin.every(v=>Math.abs(v)<.01),'zoom 후 pane 원점 reset 재현');
  const rawAfter=a.map.getProjection().fromCoordToOffset(new LL(jang.lat,jang.lon)),fixedAfter=a.project(jang.lon,jang.lat);check(Math.hypot(rawAfter.x-fixedAfter[0],rawAfter.y-fixedAfter[1])<.01,'zoom 후 기존 좌표가 다시 맞는 증상 재현');
  for(const m of abMarkers)m.marker.setMap(null);uctx.arc=arc;drawUI=draw;providerClearDiagnostic();a.destroy();p.adapter=null;p.active=false;stage.classList.remove('provider-active');dirty=true;
  return {pans:100,visible,maxErrorPx:maxError,maxABErrorPx:maxAB,oldRawErrorPx:maxRawError,maxRoundtripM:maxRoundtrip,zoomResetsOrigin:true};
};
