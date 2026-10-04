import json,glob,time,pickle
from shapely.geometry import LineString,Polygon,box,shape
from shapely.ops import unary_union,polygonize
from shapely.geometry.polygon import orient
t0=time.time()
BOX=[(37.05,128.30,38.65,129.50),(35.40,129.00,37.10,129.70),(34.55,128.40,35.45,129.35),(34.20,127.20,35.10,128.45),(33.85,125.95,34.75,127.25),(34.40,125.00,35.50,126.70),(35.45,125.95,36.55,126.95),(36.50,124.55,37.85,127.00),(33.05,126.05,34.05,127.05),(37.20,130.75,37.60,131.95)]
A=unary_union([box(w,s,e,n) for s,w,n,e in BOX])
W={}
for f in glob.glob('coast/*.geojson'):
    for ft in json.load(open(f))['features']:
        g=ft['geometry']; c=g['coordinates'] if g['type']=='LineString' else g['coordinates'][0]
        W[ft['id']]=[tuple(p) for p in c]
R=lambda p:(round(p[0],7),round(p[1],7))
seg=set()
for c in W.values():
    for a,b in zip(c,c[1:]): seg.add((R(a),R(b)))
lines=[LineString(c) for c in W.values() if len(c)>1]
print('ways',len(lines),time.time()-t0)
noded=unary_union(lines+[A.boundary])
clipped=noded.intersection(A.buffer(1e-9))
faces=list(polygonize(clipped)); print('faces',len(faces),time.time()-t0)
land=[];und=[]
for f in faces:
    f=orient(f,1.0); same=rev=0
    rings=[f.exterior]+list(f.interiors)
    for k,r in enumerate(rings):
        cs=list(r.coords); sgn=1 if k==0 else -1   # interiors of CCW-oriented polygon are CW: same-direction match means land outside hole -> still interior on left
        for a,b in zip(cs,cs[1:]):
            a,b=R(a),R(b)
            if (a,b) in seg: same+=1
            elif (b,a) in seg: rev+=1
    if same>rev: land.append(f)
    elif rev>same: pass
    else: und.append(f)
print('land faces',len(land),'undetermined',len(und),time.time()-t0)
pickle.dump({'land':land,'und':und,'A':A},open('coast_step1.pkl','wb'))
