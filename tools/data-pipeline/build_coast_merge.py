import pickle
from shapely.geometry import box
from shapely.ops import unary_union
BOX=[(37.05,128.30,38.65,129.50),(35.40,129.00,37.10,129.70),(34.55,128.40,35.45,129.35),(34.20,127.20,35.10,128.45),(33.85,125.95,34.75,127.25),(34.40,125.00,35.50,126.70),(35.45,125.95,36.55,126.95),(36.50,124.55,37.85,127.00),(33.05,126.05,34.05,127.05),(37.20,130.75,37.60,131.95)]
AB=unary_union([box(w,s,e,n) for s,w,n,e in BOX])
old=pickle.load(open('coast_final_boxes.pkl','rb'))   # 10구역 OSM + 구역 밖 SGIS (호수 빼기 전/후?)
full=pickle.load(open('coast_final_nowater.pkl','rb'))  # pbf 전체: 닫힌 섬들만 제대로 나옴
inside=old.intersection(AB)
osm_out=[p for p in full.geoms if not p.within(AB.buffer(-1e-6)) ]
osm_out=unary_union(osm_out).difference(AB)
oo=list(osm_out.geoms) if osm_out.geom_type=='MultiPolygon' else [osm_out]
outside_old=old.difference(AB); oldp=list(outside_old.geoms) if outside_old.geom_type=='MultiPolygon' else [outside_old]
keep_sgis=[p for p in oldp if not p.intersects(osm_out)]
print('osm islands outside boxes',len(oo),'sgis kept',len(keep_sgis),'sgis replaced',len(oldp)-len(keep_sgis))
final=unary_union([inside]+oo+keep_sgis).buffer(0)
print(final.geom_type,len(final.geoms),'area',final.area*1.1e4*.85)
pickle.dump(final,open('coast_final_nowater.pkl','wb'))
