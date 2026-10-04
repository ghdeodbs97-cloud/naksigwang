import json,pickle,re,math,collections
from shapely.geometry import Point,shape
from shapely.strtree import STRtree
from shapely.prepared import prep
d=json.load(open('pbf_names.json'))
f=pickle.load(open('coast_final.pkl','rb')); pf=prep(f)
bnd=f.boundary
s=open('ports_embed.js',encoding='utf-8').read(); BP=json.loads(s[s.index('=')+1:].strip().rstrip(';'))
km=lambda a,b:math.hypot((a[0]-b[0])*111*math.cos(math.radians(a[1])),(a[1]-b[1])*111)
# coastline segment tree for distance
from shapely import STRtree as T2
segs=[]
for p in f.geoms:
    for r in [p.exterior]+list(p.interiors): segs.append(r)
ctree=STRtree(segs)
def coastdist(lon,lat):
    pt=Point(lon,lat); i=ctree.query_nearest(pt,max_distance=0.05)
    if len(i)==0: return 9e9
    return min(segs[j].distance(pt) for j in i)*111000*math.cos(math.radians(lat))
JP=lambda lo,la: lo>128.9 and la<34.8
harb=[]
for h in d['harb']:
    n=h['n'].strip(); lo,la=h['lon'],h['lat']
    if JP(lo,la) or not (124.5<lo<131.95 and 33<la<38.65): continue
    if re.search(r'[ぁ-んァ-ン]',n): continue
    if n in ('남방파제','북방파제','동방파제','서방파제','방파제','유람선','선착장','부두','등대','남방파재'): continue
    if re.search(r'(유람선|여객선|터미널|마리나|요트|크루즈)',n) and not re.search(r'(항|선착장)$',n): continue
    cd=coastdist(lo,la)
    if cd>1500: continue
    # port name derived from breakwater name e.g. '구룡포북방파제' -> keep '구룡포항'? only if 항 in name
    m=re.match(r'^(.+?항)\s*.*(방파제|방파재|부두|안벽)$',n)
    if m: n=m.group(1)
    elif re.search(r'(방파제|방파재)$',n): continue  # 이름이 방파제 자체면 항 이름이 아님 (방파제 이름은 이미 표시)
    harb.append([n,lo,la,cd])
print('candidates',len(harb))
# dedupe: same name within 3 km
harb.sort(key=lambda x:x[3])
out=[]
for n,lo,la,cd in harb:
    if any(o[0]==n and km((lo,la),(o[1],o[2]))<3 for o in out): continue
    out.append([n,lo,la,cd])
# drop if BASE_PORTS has same name within 5 km (already labeled)
bpn=collections.defaultdict(list)
for nm,ty,la,lo in BP: bpn[nm.replace(' ','')].append((lo,la))
new=[o for o in out if not any(km((o[1],o[2]),q)<5 for q in bpn.get(o[0].replace(' ',''),[]))]
print('unique',len(out),'new (not in base ports)',len(new))
print([o[0] for o in new[:80]])
json.dump(new,open('harb_new.json','w'),ensure_ascii=False)
# relocation of base ports: OSM object with same name within 5 km and base port >150 m inland
moves=[]
for i,(nm,ty,la,lo) in enumerate(BP):
    cands=[o for o in out if o[0].replace(' ','')==nm.replace(' ','') and km((lo,la),(o[1],o[2]))<5]
    if not cands: continue
    c=min(cands,key=lambda o:km((lo,la),(o[1],o[2])))
    if pf.contains(Point(lo,la)) and coastdist(lo,la)>150 and c[3]<coastdist(lo,la):
        moves.append([i,nm,round(km((lo,la),(c[1],c[2]))*1000),c[1],c[2]])
print('moves',len(moves),moves[:15])
json.dump(moves,open('port_moves.json','w'),ensure_ascii=False)
