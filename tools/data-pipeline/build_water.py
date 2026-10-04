import json,pickle,collections
from shapely.geometry import shape,box
from shapely.ops import unary_union
f=pickle.load(open('coast_final_nowater.pkl','rb'))
BOX=[(37.05,128.30,38.65,129.50),(35.40,129.00,37.10,129.70),(34.55,128.40,35.45,129.35),(34.20,127.20,35.10,128.45),(33.85,125.95,34.75,127.25),(34.40,125.00,35.50,126.70),(35.45,125.95,36.55,126.95),(36.50,124.55,37.85,127.00),(33.05,126.05,34.05,127.05),(37.20,130.75,37.60,131.95)]
world=box(124.4,32.9,131.95,38.7); sea=world.difference(f)
seab=sea.buffer(0.004)
d=json.load(open('coast/water.geojson'))
sel=[];tags=collections.Counter();skip=collections.Counter()
for ft in d['features']:
    p=ft['properties']; w=p.get('water','')
    if w in ('river','canal','stream','ditch','drain','oxbow','moat','wastewater','fishpond','pond','basin'): skip[w]+=1; continue
    g=shape(ft['geometry']).buffer(0)
    if not g.intersects(f): continue
    if not g.intersects(seab): continue
    sel.append((g,p.get('name:ko') or p.get('name') or '',w)); tags[w]+=1
print('selected',len(sel),tags,'skipped',skip)
for g,n,w in sorted(sel,key=lambda x:-x[0].area)[:25]:
    c=g.representative_point(); print(n,w,round(g.area*1.1e4*.85,1),'km2',round(c.y,3),round(c.x,3))
W=unary_union([g for g,_,_ in sel])
f2=f.difference(W).buffer(0)
print('land area change km2', (f.area-f2.area)*1.1e4*.85)
pickle.dump(f2,open('coast_final.pkl','wb'))
pickle.dump(W,open('water_sel.pkl','wb'))
