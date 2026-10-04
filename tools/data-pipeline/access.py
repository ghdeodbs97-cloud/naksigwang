import json,math
from shapely.geometry import shape,Point
g=json.load(open('geo/kr_land.json'));feats=g.get('geometries') or g.get('features')
geoms=[shape(x.get('geometry',x)) for x in feats]
# ring index mapping identical to coast.js 'full' encoding order
ring_of_feat={};ri=0
for fi,x in enumerate(feats):
  geo=x.get('geometry',x);c=geo['coordinates'];polys=[c] if geo['type']=='Polygon' else c
  first=True
  for p in polys:
    for k,r in enumerate(p):
      if k==0: ring_of_feat.setdefault(fi,[]).append(ri)
      ri+=1
print('rings',ri)
def km2(gm): c=gm.centroid; return gm.area*111.32**2*math.cos(math.radians(c.y))
main=max(range(len(geoms)),key=lambda i:geoms[i].area)
car=set([main]); reason={main:'본토'}
for i,gm in enumerate(geoms):
  a=km2(gm)
  if a>60: car.add(i); reason.setdefault(i,f'큰 섬 {a:.0f}km²')
BR=[271,367,694,832,834,844,739,719,670,734,386,390,310,313,311,349,576,957,1010]
for i in BR: car.add(i); reason.setdefault(i,'연륙교(검토 목록)')
extra={'석모도':(37.70,126.36),'교동도':(37.78,126.28),'무의도':(37.39,126.42),'영흥도':(37.26,126.47),'대부도':(37.27,126.58),'원산도':(36.38,126.42),'신시도':(35.82,126.47),'선유도':(35.81,126.41),'장자도':(35.80,126.40),'고하도':(34.78,126.36),'소록도':(34.52,127.21),'화태도':(34.59,127.65),'둔병도':(34.62,127.55)}
for nm,(la,lo) in extra.items():
  pt=Point(lo,la); hit=[i for i,gm in enumerate(geoms) if gm.contains(pt)]
  if not hit:
    i=min(range(len(geoms)),key=lambda i:geoms[i].distance(pt)); d=geoms[i].distance(pt)*100
    hit=[i] if d<1.5 else []
    print(nm,'nearest',i,f'{d:.2f}km',f'{km2(geoms[i]):.1f}km²')
  else: print(nm,'inside',hit[0],f'{km2(geoms[hit[0]]):.1f}km²', 'MAINLAND' if hit[0]==main else '')
  for i in hit: car.add(i); reason.setdefault(i,nm+' 연륙교')
UNK=[388,371,839,829,704,698,680,852]
acc_rings=sorted(r for i in car for r in ring_of_feat[i]); unk_rings=sorted(r for i in UNK for r in ring_of_feat[i])
json.dump({'car':acc_rings,'unk':unk_rings},open('access.json','w'))
print('car features',len(car),'rings',len(acc_rings),'unk rings',len(unk_rings))
