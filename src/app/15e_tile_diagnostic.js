// 15e_tile_diagnostic.js — localhost 전용 타일 DOM·Canvas 가시성 관찰 (네트워크 요청 없음)
function providerCanvasVisibility(){
  return [base,flow,ui].map(canvas=>{const css=getComputedStyle(canvas),r=canvas.getBoundingClientRect();return {id:canvas.id,opacity:css.opacity,display:css.display,visibility:css.visibility,rect:{left:r.left,top:r.top,width:r.width,height:r.height}};});
}
if(PROVIDER_DEV_HOST){
  window.naksigwangPerfDiagnostic.providerOnly=enabled=>{stage.classList.toggle('provider-only',!!enabled);return {providerOnly:stage.classList.contains('provider-only'),canvases:providerCanvasVisibility()};};
  window.naksigwangTileDiagnostic=(x,y)=>{
    const p=PROVIDER_MAP,container=$('providerMap'),rectOf=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};},rect=rectOf(container);
    // 임의 URL 경로에도 인증정보가 있을 수 있다. 숫자 타일 좌표·공개 확장자만 보존한다.
    const safeSource=src=>{try{const u=new URL(src,location.href);if(!['https:','http:'].includes(u.protocol))return {hostname:null,path:null};return {hostname:/^(?:[a-z0-9-]+\.)*(?:naver\.com|pstatic\.net|naver\.net)$/.test(u.hostname)?u.hostname:'[비공개 호스트]',path:u.pathname.split('/').map(v=>!v?'':/^\d{1,10}(?:\.(?:png|jpg|jpeg|webp))?$/.test(v)?v:'[비공개]').join('/')};}catch(_){return {hostname:null,path:null};}};
    const tiles=[...container.querySelectorAll('img')].map(el=>{const r=rectOf(el);let visible=r.width>0&&r.height>0&&r.left<rect.left+rect.width&&r.top<rect.top+rect.height&&r.left+r.width>rect.left&&r.top+r.height>rect.top;
      for(let node=el;node;node=node.parentElement){const css=getComputedStyle(node);if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0)visible=false;}
      return {rect:r,visible,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,complete:el.complete,currentSrc:safeSource(el.currentSrc||el.src)};});
    const css=getComputedStyle(container),providerStyle={display:css.display,visibility:css.visibility,opacity:css.opacity,transform:css.transform};
    const tileSizeDistribution={};for(const tile of tiles.filter(t=>t.visible)){const key=tile.rect.width+'×'+tile.rect.height;tileSizeDistribution[key]=(tileSizeDistribution[key]||0)+1;}
    const canvasPixels=Number.isFinite(x)&&Number.isFinite(y)?[base,flow,ui].map(c=>{const r=c.getBoundingClientRect(),px=Math.floor((x-r.left)*c.width/r.width),py=Math.floor((y-r.top)*c.height/r.height);let rgba=null;if(px>=0&&py>=0&&px<c.width&&py<c.height)try{rgba=[...c.getContext('2d').getImageData(px,py,1,1).data];}catch(_){}return {id:c.id,rgba};}):null;
    return {providerMode:p.mode,providerZoom:p.adapter?.getZoom()??null,center:p.adapter?.getCenter()??null,bounds:p.adapter?.getBounds()??null,providerRect:rect,providerStyle,lastResize:p.lastResize?{...p.lastResize}:null,resizeCount:p.resizeCount||0,childImageCount:tiles.length,visibleTileCount:tiles.filter(t=>t.visible).length,tiles,tileSizeDistribution,providerMoving:p.providerMoving,revealAfterBase:p.revealAfterBase,commandPending:p.commandPending,heavyHidden:stage.classList.contains('provider-moving'),providerOnly:stage.classList.contains('provider-only'),canvases:providerCanvasVisibility(),canvasPixels,events:p.events.map(e=>({...e})),settleFailure:p.settleFailure||null};
  };
}
