// p3_path_checks.js — 투영 전 화면 밖 구간 생략이 기존 mask 픽셀을 보존하는지 검사
function p3LegacyPath(rings,margin){
  const p=new Path2D(),oc=(x,y)=>(x < -margin?1:0)|(x>cw+margin?2:0)|(y < -margin?4:0)|(y>ch+margin?8:0);
  for(const r of rings){const X=[],Y=[],C=[];for(let i=0;i<r.n;i++){[X[i],Y[i]]=toS(r.xs[i],r.ys[i]);C[i]=oc(X[i],Y[i]);}
    let lx=X[0],ly=Y[0],lc=C[0];p.moveTo(lx,ly);
    for(let i=1;i<r.n;i++){if(i<r.n-1){if(lc&C[i]&C[i+1])continue;if(Math.abs(X[i]-lx)<.6&&Math.abs(Y[i]-ly)<.6)continue;}p.lineTo(X[i],Y[i]);lx=X[i];ly=Y[i];lc=C[i];}p.closePath();
  }return p;
}
async function p3PathTest(f){
  const results=[],c=document.createElement('canvas');c.width=mask.width;c.height=mask.height;const g=c.getContext('2d',{willReadFrequently:true});
  const raster=path=>{g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);g.setTransform(.5,0,0,.5,0,0);g.fillStyle='#fff';g.fill(path,'evenodd');return g.getImageData(0,0,c.width,c.height).data;};
  for(const [name,lat,lon] of [['속초',38.20854,128.5947],['포항',36.05,129.38],['홍원',36.15983,126.50376]])for(const width of [600000,60000,10000,2000]){
    await fitGround(lat,lon,width);const gpp=1/pxPerGround(),lod=gpp>2000?LOD.low:gpp>35?LOD.mid:LOD.full;
    const [x0,y0,x1,y1]=viewBounds(4),rings=lod.filter(q=>q.maxx>=x0&&q.minx<=x1&&q.maxy>=y0&&q.miny<=y1);
    let calls=0;const project=f.project;f.project=function(...args){calls++;return project.apply(this,args);};
    let old,newer,oldCalls,newCalls;try{old=raster(p3LegacyPath(rings,4));oldCalls=calls;calls=0;newer=raster(buildPath(rings,4));newCalls=calls;}finally{f.project=project;}
    let changed=0;for(let i=3;i<old.length;i+=4)if(old[i]!==newer[i])changed++;
    if(changed)throw Error(name+' '+width+' 해안 mask 변경 '+changed+'px');
    results.push({name,width,changedPixels:changed,oldProjectCalls:oldCalls,newProjectCalls:newCalls});
  }
  return results;
}
