import pickle,json,time
from shapely.geometry import LineString,box
from shapely.ops import unary_union,polygonize
from shapely.geometry.polygon import orient
t0=time.time()
W=pickle.load(open('pbf_coast.pkl','rb'))
A=box(124.4,32.9,131.95,38.65)
R=lambda p:(round(p[0],7),round(p[1],7))
seg=set()
for c in W.values():
    for a,b in zip(c,c[1:]): seg.add((R(a),R(b)))
lines=[LineString(c) for c in W.values() if len(c)>1]
noded=unary_union(lines+[A.boundary]); clipped=noded.intersection(A.buffer(1e-9))
faces=list(polygonize(clipped)); print('faces',len(faces),time.time()-t0)
land=[];und=0
for f in faces:
    f=orient(f,1.0); same=rev=0
    for r in [f.exterior]+list(f.interiors):
        cs=list(r.coords)
        for a,b in zip(cs,cs[1:]):
            a,b=R(a),R(b)
            if (a,b) in seg: same+=1
            elif (b,a) in seg: rev+=1
    if same>rev: land.append(f)
    elif same==rev: und+=1
print('land',len(land),'und',und)
osm=unary_union(land)
sg=pickle.load(open('coast_step2.pkl','rb')); sgis=sg['sgis']; near=sgis.buffer(0.03,resolution=4)
NK=unary_union([box(124.4,37.55,126.0,38.7),box(126.0,37.78,126.35,38.7),box(126.35,37.86,127.2,38.7),box(127.2,38.30,129.0,39.0),box(128.0,38.615,129.5,38.7)]).difference(unary_union([box(125.55,37.58,125.80,37.705),box(124.55,37.70,124.82,38.0)]))
JP=box(128.9,32.9,132,34.8)
cut=NK.difference(near).union(JP.difference(near))
final=osm.difference(cut).buffer(0)
print(final.geom_type,len(final.geoms),'area km2',final.area*1.1e4*.85,time.time()-t0)
pickle.dump(final,open('coast_final_nowater.pkl','wb'))
