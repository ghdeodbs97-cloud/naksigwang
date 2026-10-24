// 15c_map_diagnostic.js — 로컬에서만 native Marker DOM과 실제 Canvas 픽셀 비교
const PROVIDER_DEV_HOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let PROVIDER_DEBUG = null;

function providerClearDiagnostic() {
  PROVIDER_DEBUG?.native.marker.setMap(null);
  PROVIDER_DEBUG = null;
}
function drawProviderDebugCrosshair() {
  const d = PROVIDER_DEBUG;
  if (!PROVIDER_DEV_HOST || !d || !PROVIDER_MAP.active) return;
  const p = toS(mxOf(d.lon), myOf(d.lat));
  // native 아이콘의 중심은 청록색 원, Canvas 중심은 자홍색 십자다.
  uctx.save(); uctx.fillStyle = '#ff00ff';
  uctx.fillRect(p[0] - 9, p[1] - 1, 18, 2);
  uctx.fillRect(p[0] - 1, p[1] - 9, 2, 18); uctx.restore();
  d.lastDraw = {pixel:p, time:performance.now(), view:{...V}};
}
function providerCanvasProbePixel(d) {
  if (!d.lastDraw) return null;
  const r = DPR(), p = d.lastDraw.pixel;
  const x0 = Math.max(0, Math.floor((p[0] - 11) * r)), y0 = Math.max(0, Math.floor((p[1] - 11) * r));
  const x1 = Math.min(ui.width, Math.ceil((p[0] + 11) * r)), y1 = Math.min(ui.height, Math.ceil((p[1] + 11) * r));
  if (x1 <= x0 || y1 <= y0) return null;
  const data = uctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let weight = 0, sx = 0, sy = 0;
  for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < x1 - x0; x++) {
    const k = (y * (x1 - x0) + x) * 4;
    if (data[k] > 245 && data[k + 1] < 10 && data[k + 2] > 245 && data[k + 3]) {
      const a = data[k + 3] / 255; weight += a; sx += (x0 + x + .5) * a; sy += (y0 + y + .5) * a;
    }
  }
  if (!weight) return null;
  // 실제 그림의 backing pixel 중심을 viewport CSS pixel로 환산한다. 예상 toS 값 자체를 측정값으로 쓰지 않는다.
  const rect = providerRect(ui);
  return [sx / weight / ui.width * rect.width, sy / weight / ui.height * rect.height];
}
function providerProbeSample(d, frame) {
  const canvasRect = providerRect(ui), element = d.native.element.isConnected ? d.native.element
    : $('providerMap').querySelector('[data-naksigwang-native-probe]');
  const nr = element?.getBoundingClientRect();
  const nativeMarkerPixel = nr?.width && nr?.height ? [nr.left + nr.width / 2 - canvasRect.left, nr.top + nr.height / 2 - canvasRect.top] : null;
  const canvasPixel = providerCanvasProbePixel(d);
  const painted = d.lastDraw?.pixel;
  const visible = !!painted && painted[0] >= 11 && painted[0] <= cw - 11 && painted[1] >= 11 && painted[1] <= ch - 28 - 11;
  const valid = PROVIDER_MAP.active && !PROVIDER_MAP.providerMoving && !PROVIDER_MAP.revealAfterBase && !stage.classList.contains('provider-moving') && !!nativeMarkerPixel && !!canvasPixel && visible;
  const dx = valid ? canvasPixel[0] - nativeMarkerPixel[0] : null, dy = valid ? canvasPixel[1] - nativeMarkerPixel[1] : null;
  return {frame, time:performance.now(), nativeMarkerPixel, canvasPixel, dx, dy, errorPx:valid ? Math.hypot(dx, dy) : null,
    valid, visible, providerMoving:!!PROVIDER_MAP.providerMoving,heavyHidden:stage.classList.contains('provider-moving'),canvasDraw:d.lastDraw ? structuredClone(d.lastDraw) : null,
    providerCenter:PROVIDER_MAP.adapter.getCenter(), providerZoom:PROVIDER_MAP.adapter.getZoom(), providerBounds:PROVIDER_MAP.adapter.getBounds(), pxPerGround:pxPerGround(), gpp:1/pxPerGround(), providerRect:providerRect($('providerMap')), canvasRect, baseFrame:structuredClone(PROVIDER_MAP.lastBaseFrame), stationDrawStats:{...stationDrawStats}, events:structuredClone(PROVIDER_MAP.events), view:{...V}};
}
function providerDiagnosticRectDeltas() {
  const origin = providerRect(ui), deltas = {};
  for (const [name,el] of [['providerMap',$('providerMap')],['base',base],['flow',flow],['ui',ui],['stage',stage]]) {
    const rect = providerRect(el); deltas[name] = {};
    for (const key of ['left','top','width','height']) deltas[name][key] = rect[key] - origin[key];
  }
  return deltas;
}
function providerDiagnosticStyle(el) {
  const s = getComputedStyle(el), out = {};
  for (const k of ['position','boxSizing','transform','transformOrigin','paddingLeft','paddingTop','paddingRight','paddingBottom','borderLeftWidth','borderTopWidth','borderRightWidth','borderBottomWidth','clipPath']) out[k] = s[k];
  return out;
}
async function providerMarkerDiagnostic(lat, lon, action) {
  if (!PROVIDER_DEV_HOST) throw Error('로컬 개발 환경에서만 사용할 수 있습니다.');
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 32.5 || lat > 39 || lon < 123.8 || lon > 132.2) throw Error('한국 연안의 숫자 경위도를 입력하세요.');
  const a = PROVIDER_MAP.adapter;
  if (!a || !PROVIDER_MAP.active) return {providerMode:PROVIDER_MAP.mode,providerZoom:null,lat,lon,
    providerRect:providerRect($('providerMap')),canvasRect:providerRect(ui),baseRect:providerRect(base),flowRect:providerRect(flow),stageRect:providerRect(stage),
    rectDeltas:providerDiagnosticRectDeltas(),domMismatchPx:providerRectError(),dpr:devicePixelRatio,canvasDpr:DPR(),
    nativeMarkerPixel:null,canvasPixel:null,dx:null,dy:null,errorPx:null,center:null,bounds:null,valid:false,passes:false,
    reason:'온라인 지도가 준비되지 않았거나 DOM 크기/원점 검사를 통과하지 못했습니다. 지도 탭과 rectDeltas를 확인하세요.',internal:structuredClone(PROVIDER_MAP.diagnostic)};
  if (!PROVIDER_DEBUG || PROVIDER_DEBUG.lat !== lat || PROVIDER_DEBUG.lon !== lon) {
    providerClearDiagnostic();
    PROVIDER_DEBUG = {lat, lon, native:a.createDebugMarker(lat, lon)};
    drawUI();
  }
  const d = PROVIDER_DEBUG;
  action?.();
  const timeline = [providerProbeSample(d, 0)];
  for (let frame = 1; frame <= 8; frame++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (PROVIDER_DEBUG !== d) throw Error('다른 기준점 검사로 바뀌었습니다.');
    timeline.push(providerProbeSample(d, frame));
    /* 최소 8프레임을 모두 기록해 초기 오차와 최종 오차를 분리한다. */
  }
  const sample = timeline.at(-1), canvasRect = providerRect(ui), providerRect_ = providerRect($('providerMap'));
  return {providerMode:PROVIDER_MAP.mode, providerZoom:a.getZoom(), lat, lon,
    providerRect:providerRect_, canvasRect, baseRect:providerRect(base), flowRect:providerRect(flow), stageRect:providerRect(stage),
    rectDeltas:providerDiagnosticRectDeltas(), center:a.getCenter(), bounds:a.getBounds(),
    ...sample, passes:sample.valid && sample.errorPx <= 2, domMismatchPx:providerRectError(),
    dpr:devicePixelRatio, canvasDpr:DPR(), drawingDpr:DPR(), backingSize:[ui.width, ui.height], logicalSize:[cw, ch],
    attribution:{reservedCssPx:28, fullViewportUnchanged:true},
    styles:{stage:providerDiagnosticStyle(stage),provider:providerDiagnosticStyle($('providerMap')),canvas:providerDiagnosticStyle(ui),base:providerDiagnosticStyle(base),flow:providerDiagnosticStyle(flow)},
    timeline, maxObservedErrorPx:Math.max(0,...timeline.filter(s => s.valid).map(s => s.errorPx)),
    reason:sample.valid ? null : '기준점이 화면 밖·출처 영역에 있거나 native Marker/Canvas가 아직 표시되지 않았습니다.',
    measurement:'native Marker DOM 중심 vs Canvas 자홍색 실제 픽셀 중심', internal:structuredClone(PROVIDER_MAP.diagnostic)};
}
if (PROVIDER_DEV_HOST) {
  window.naksigwangMapDiagnostic = (lat, lon) => lat === undefined && lon === undefined
    ? {...structuredClone(PROVIDER_MAP.diagnostic),measurement:'SDK 내부 일관성 검사',nativeMarkerMeasured:false} : providerMarkerDiagnostic(lat, lon);
  window.naksigwangMapDiagnostic.overlay = () => {
    const p=PROVIDER_MAP,key=p.active&&!p.failed?providerViewportKey():null,sample=PROVIDER_DEBUG?providerProbeSample(PROVIDER_DEBUG,0):null;
    return {visible:!stage.classList.contains('provider-moving')&&getComputedStyle(ui).visibility==='visible',providerActive:p.active,providerFailed:p.failed,providerMoving:p.providerMoving,gesture:p.gesture,commandPending:p.commandPending,nativePointers:nativePointers.size,
      providerKey:key,renderedKey:RENDER.renderedProviderViewportKey??null,keysMatch:!!key&&providerRenderedViewportMatches(key),
      markerMaxErrorPx:sample?.valid?sample.errorPx:null,markerMeasurement:sample?.valid?'현재 native DOM 대 Canvas 실제 픽셀':'기준점 미측정',
      staleRevealCount:p.staleRevealCount||0,blockedReveals:p.blockedReveals||0,finalizations:p.finalViewportCount||0,generation:p.moveGeneration||0,lastFinalViewport:p.lastFinalViewport??null};
  };
  window.naksigwangMapDiagnostic.lastNavigation = () => {
    const p=PROVIDER_MAP,c=p.pendingCommand||p.lastCommand,a=p.adapter;
    return {ok:c?.ok??false,status:p.commandPending?'pending':c?.navigationStatus??'none',targetName:c?.targetName??null,target:c?.target??null,
      actualCenter:a?.unproject(cw/2,ch/2)??null,zoom:a?.getZoom()??null,visibleWidthM:a?cw/a.getGroundScale():null,centerErrorM:c?.centerErrorM??null,
      usedRepair:c?.usedRepair??false,providerActive:p.active,commandPending:p.commandPending};
  };
  window.naksigwangMapDiagnostic.clear = providerClearDiagnostic;
  // 같은 기준점을 남긴 채 명령 직후부터 8프레임을 기록한다.
  window.naksigwangMapDiagnostic.pan = (dx,dy,lat=38.20854,lon=128.5947) => {
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||TAB!=='map'||S.lock)throw Error('지도 탭에서 숫자 CSS px 이동량을 입력하세요.');
    return providerMarkerDiagnostic(lat,lon,()=>providerPanBy(dx,dy));
  };
  window.naksigwangMapDiagnostic.zoom = (factor,lat=38.20854,lon=128.5947) => {
    if(!Number.isFinite(factor)||factor<=0||TAB!=='map'||S.lock)throw Error('지도 탭에서 양수 확대 비율을 입력하세요.');
    return providerMarkerDiagnostic(lat,lon,()=>providerZoomAt(cw/2,ch/2,factor));
  };
  window.naksigwangMapDiagnostic.fit = async (width, lat = 38.20854, lon = 128.5947) => {
    if (![1000,2000,5000,10000,60000,600000].includes(width)) throw Error('폭은 1000/2000/5000/10000/60000/600000 m 중에서 고르세요.');
    if (TAB !== 'map' || S.lock) throw Error('지도 탭에서 실행하세요.');
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 32.5 || lat > 39 || lon < 123.8 || lon > 132.2) throw Error('한국 연안의 숫자 경위도를 입력하세요.');
    const command=await fitGround(lat,lon,width);
    if(!command.ok)return {providerMode:PROVIDER_MAP.mode,providerZoom:PROVIDER_MAP.adapter?.getZoom()??null,lat,lon,
      providerRect:providerRect($('providerMap')),canvasRect:providerRect(ui),baseRect:providerRect(base),flowRect:providerRect(flow),stageRect:providerRect(stage),
      rectDeltas:providerDiagnosticRectDeltas(),domMismatchPx:providerRectError(),dpr:devicePixelRatio,canvasDpr:DPR(),
      nativeMarkerPixel:null,canvasPixel:null,dx:null,dy:null,errorPx:null,valid:false,passes:false,
      center:PROVIDER_MAP.adapter?.getCenter()??null,bounds:PROVIDER_MAP.adapter?.getBounds()??null,reason:command.reason,command};
    return {...await providerMarkerDiagnostic(lat,lon),command};
  };
}
