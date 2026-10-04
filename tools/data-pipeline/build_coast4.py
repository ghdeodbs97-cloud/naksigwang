import pickle,json,math
from shapely.strtree import STRtree
from shapely.geometry import Polygon,MultiPolygon
from shapely.geometry.polygon import orient
f=pickle.load(open('coast_final.pkl','rb'))
ns={}; exec(open('access.py').read().replace("json.dump(","(lambda *a,**k:None)("),ns)
geoms=ns['geoms']; car=ns['car']; UNK=set(ns['UNK'])
tree=STRtree(geoms)
def enc(coords):
    out=[];px=py=0
    for x,y in coords:
        X=round((x-124)*1e5);Y=round((y-32.9)*1e5); out+=[X-px,Y-py]; px,py=X,Y
    return out
def polys(g): return list(g.geoms) if g.geom_type=='MultiPolygon' else [g]
full=f.simplify(1e-5,preserve_topology=True)
FP=polys(f); SP=polys(full); assert len(FP)==len(SP)
kinds=[]
for p in FP:
    rp=p.representative_point(); idx=[i for i in tree.query(rp) if geoms[i].contains(rp)]
    if not idx:
        cand=[(geoms[i].intersection(p).area,i) for i in tree.query(p) if geoms[i].intersects(p)]
        idx=[max(cand)[1]] if cand and max(cand)[0]>0.3*p.area else []
    if p.area<1e-6: idx=[]
    kinds.append('car' if idx and idx[0] in car else 'unk' if idx and idx[0] in UNK else 'none')
BK=pickle.load(open('bridges_keep.pkl','rb'))
changed=True; nb=0
while changed:
    changed=False
    for i,j in BK['links']:
        if kinds[i]=='car' and kinds[j]!='car': kinds[j]='car'; changed=True; nb+=1
        elif kinds[j]=='car' and kinds[i]!='car': kinds[i]='car'; changed=True; nb+=1
print('bridge-linked to car:',nb)
rings=[];accC=[];accU=[];stat={'car':0,'unk':0,'none':0}
for pi,p in enumerate(SP):
    p=orient(p,1.0)
    kind=kinds[pi]; stat[kind]+=1
    rr=[p.exterior]+list(p.interiors)
    for r in rr:
        if kind=='car': accC.append(len(rings))
        if kind=='unk': accU.append(len(rings))
        rings.append(enc(r.coords))
def lod(tol,minarea):
    out=[]
    for p in polys(f.simplify(tol,preserve_topology=True)):
        if p.area<minarea: continue
        p=orient(p,1.0)
        for r in [p.exterior]+[i for i in p.interiors if Polygon(i).area>=minarea]: 
            if len(r.coords)>=4: out.append(enc(r.coords))
    return out
mid=lod(1.5e-4,(30/1e5)**2); low=lod(2e-3,0.002)
KR={'full':rings,'mid':mid,'low':low}
s='const KR_COAST='+json.dumps(KR,separators=(',',':'))+';\n'
open('geo/coast.js','w').write(s)
open('access.js','w').write('const ACCESS='+json.dumps({'car':accC,'unk':accU},separators=(',',':'))+';\n')
print(stat, {k:(len(v),sum(len(r) for r in v)//2) for k,v in KR.items()}, len(s)/1e6,'MB')
