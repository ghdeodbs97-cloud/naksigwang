import pickle,json,time
from shapely.geometry import box,Polygon
from shapely.ops import unary_union
d=pickle.load(open('coast_step1.pkl','rb')); d2=pickle.load(open('coast_step2.pkl','rb'))
A=d['A']; sgis=d2['sgis']; near=sgis.buffer(0.03,resolution=4)
osm=unary_union(d['land'])
NK=unary_union([box(124.4,37.55,126.0,38.7),box(126.0,37.78,126.35,38.7),box(126.35,37.86,127.2,38.7),box(127.2,38.30,129.0,39.0)]).difference(unary_union([box(125.55,37.58,125.80,37.705),box(124.55,37.70,124.82,37.88)]))
JP=box(129.1,33.9,129.8,34.8)
keep=[];drop=[]
for p in osm.geoms:
    bad=(p.intersects(NK) or p.intersects(JP)) and not p.intersects(near)
    (drop if bad else keep).append(p)
print('keep',len(keep),'drop',len(drop))
# mainland: NK land contiguous with SK (DMZ) — cut by NK box beyond 38.62 at east and 37.9 at west only within A
osm_k=unary_union(keep)
# remove NK land within A that is contiguous (east coast north of DMZ ~38.61, west side north of Han estuary handled by near)
cut=unary_union([box(128.0,38.615,129.5,38.7)])
osm_k=osm_k.difference(cut.difference(sgis))
final=unary_union([osm_k,sgis.difference(A)])
final=final.buffer(0)
print(final.geom_type,len(final.geoms))
pickle.dump(final,open('coast_final.pkl','wb'))
