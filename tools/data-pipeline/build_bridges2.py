import pickle,collections
from shapely.strtree import STRtree
from shapely.geometry import Point,box
from shapely.ops import linemerge,unary_union
f=pickle.load(open('coast_final.pkl','rb')); polys=list(f.geoms); tree=STRtree(polys)
B=pickle.load(open('bridges_sel.pkl','rb'))
JP=box(128.9,32.9,132,34.8); NK=box(124.4,37.72,126.1,38.7)
keep=[]
for b in B:
    if b['kind'] in ('construction','proposed'): continue
    g=b['g']
    if g.intersects(JP) or g.within(NK): continue
    if len(tree.query_nearest(g,max_distance=0.03))==0: continue
    keep.append(b)
print('kept',len(keep),collections.Counter(b['kind'] for b in keep).most_common(10))
# connectivity via car bridges
car_lines=unary_union([b['g'] for b in keep if b['car']])
merged=linemerge(car_lines); merged=list(merged.geoms) if merged.geom_type=='MultiLineString' else [merged]
links=[]
for m in merged:
    a,z=Point(m.coords[0]),Point(m.coords[-1])
    ia=[int(i) for i in tree.query(a.buffer(0.0004)) if polys[i].distance(a)<0.0004]
    iz=[int(i) for i in tree.query(z.buffer(0.0004)) if polys[i].distance(z)<0.0004]
    for i in ia:
        for j in iz:
            if i!=j: links.append((i,j))
print('chains',len(merged),'links',len(links))
pickle.dump({'B':keep,'links':links},open('bridges_keep.pkl','wb'))
