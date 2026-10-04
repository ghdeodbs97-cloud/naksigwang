import json,pickle,collections
from shapely.geometry import shape,LineString
from shapely.strtree import STRtree
f=pickle.load(open('coast_final.pkl','rb'))
d=json.load(open('coast/bridges.geojson'))
polys=list(f.geoms); tree=STRtree(polys)
out=[];cnt=collections.Counter()
for ft in d['features']:
    g=shape(ft['geometry']); p=ft['properties']
    if g.geom_type=='Polygon': g=g.exterior
    if g.geom_type!='LineString': continue
    import shapely
    x0,y0,x1,y1=g.bounds; e=.001
    near=[shapely.clip_by_rect(polys[i],x0-e,y0-e,x1+e,y1+e) for i in tree.query(g)]
    wet=g
    for q in near:
        if not q.is_empty and q.intersects(wet): wet=wet.difference(q)
    wl=wet.length*111000*0.82
    if wl<60: continue
    kind='rail' if 'railway' in p and 'highway' not in p else (p.get('highway') or 'road')
    car = 'highway' in p and kind not in ('footway','path','cycleway','pedestrian','steps')
    out.append({'g':g,'name':p.get('name:ko') or p.get('name') or '','kind':kind,'car':car,'wet':wl})
    cnt[kind]+=1
print(len(out),cnt.most_common())
pickle.dump(out,open('bridges_sel.pkl','wb'))
for b in sorted(out,key=lambda b:-b['wet'])[:15]: print(b['name'],b['kind'],round(b['wet']))
