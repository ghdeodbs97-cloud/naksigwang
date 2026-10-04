import json,csv,io,re,math,collections
from shapely.geometry import shape,Point
from shapely.strtree import STRtree
csv.field_size_limit(10**9)
L=lambda f:list(csv.reader(io.StringIO(open(f,'rb').read().decode('cp949'))))
# rich port table
emb=json.loads(open('ports_embed.js',encoding='utf-8').read()[len('const BASE_PORTS='):-1])
extra={}
for fn in ['ports_small.csv','ports_jj.csv']:
  for r in L(fn)[1:]:
    try: extra[(r[4].strip(),round(float(r[2]),4))]=(r[5],int(r[6] or 0))
    except: pass
info={r[0].strip():r[2] for r in L('p_info.csv')[1:]}
nat={r[3].strip():r[10] for r in L('p_nat.csv')[1:]}
ports=[]
for n,t,la,lo in emb:
  a,b=extra.get((n,round(la,4)),('',0))
  if not a: a=nat.get(n) or info.get(n) or ''
  ports.append(dict(name=n,type=t,lat=la,lon=lo,addr=a,boats=b))
g=json.load(open('geo/kr_land.json'));geoms=[shape(x.get('geometry',x)) for x in (g.get('geometries') or g.get('features'))]
tree=STRtree(geoms)
main=max(range(len(geoms)),key=lambda i:geoms[i].area)
for p in ports:
  pt=Point(p['lon'],p['lat'])
  idx=tree.query_nearest(pt,max_distance=0.03)  # ~3km
  if len(idx)==0: p['isl']=None;continue
  i=min(idx,key=lambda i:geoms[i].distance(pt)); p['isl']=int(i); p['dkm']=geoms[i].distance(pt)*100
json.dump(dict(ports=ports,main=main,area={i:geoms[i].area for i in set(p['isl'] for p in ports if p['isl'] is not None)}),open('ports_isl.json','w'),ensure_ascii=False)
by=collections.defaultdict(list)
for p in ports:
  if p['isl'] is not None and p['isl']!=main: by[p['isl']].append(p)
south=lambda p: p['lat']<35.7 and p['lat']>33.75 and p['lon']<129.3
multi={i:v for i,v in by.items() if len(v)>=2 and any(south(p) for p in v)}
print('ports',len(ports),'unassigned',sum(p['isl'] is None for p in ports),'on mainland',sum(p['isl']==main for p in ports))
print('islands with ports',len(by),'multi-port islands in 전라/남해',len(multi),'ports on them',sum(len(v) for v in multi.values()))
rows=[]
for i,v in sorted(multi.items(),key=lambda kv:-len(kv[1])):
  addrs=collections.Counter(' '.join(p['addr'].split()[1:3]) for p in v if p['addr'])
  c=geoms[i].centroid
  rows.append((i,len(v),round(geoms[i].area*1e4,1),f"{c.y:.3f},{c.x:.3f}",addrs.most_common(2),[p['name'] for p in v][:6]))
for r in rows: print(r)
