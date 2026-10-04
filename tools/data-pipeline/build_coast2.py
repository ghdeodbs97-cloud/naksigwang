import json,pickle,time,math
from shapely.geometry import shape,box,Point
from shapely.ops import unary_union
t0=time.time()
d=pickle.load(open('coast_step1.pkl','rb')); A=d['A']
for u in d['und']: print('und',u.area*1e4,'(~km2)',u.representative_point())
osm=unary_union(d['land']); print('osm land',osm.geom_type,len(getattr(osm,'geoms',[osm])),time.time()-t0)
g=json.load(open('geo/kr_land.json')); sg=[shape(x) for x in g['geometries']]
sgis=unary_union(sg); print('sgis',time.time()-t0)
near=sgis.buffer(0.03,resolution=4)
osm_k=osm.intersection(near)
out=sgis.difference(A)
final=unary_union([osm_k,out]); print('final',final.geom_type,len(final.geoms),time.time()-t0)
# compare: area diff
print('sgis area in A',sgis.intersection(A).area*1e4,'osm area',osm_k.area*1e4)
pickle.dump({'final':final,'sg':sg,'sgis':sgis},open('coast_step2.pkl','wb'))
