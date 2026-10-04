import json,pickle,re,math,glob
from shapely.geometry import Point,shape,LineString
from shapely.strtree import STRtree
from shapely.ops import unary_union
f=pickle.load(open('coast_final.pkl','rb')); W=pickle.load(open('water_sel.pkl','rb'))
from shapely.geometry import box
sea=box(124.4,32.9,131.95,38.7).difference(f.buffer(0))
km=lambda a,b:math.hypot((a[0]-b[0])*111*math.cos(math.radians(a[1])),(a[1]-b[1])*111)
d=json.load(open('pbf_names.json')); dk=json.load(open('pbf_dyke.json'))
s=open('ports_embed.js',encoding='utf-8').read(); BP=json.loads(s[s.index('=')+1:].strip().rstrip(';'))
new=json.load(open('harb_new.json'))
named=[(lo,la) for _,_,la,lo in BP]+[(o[1],o[2]) for o in new]
# structure clusters
st=[]
for fn in glob.glob('osm/*.geojson'):
    for ft in json.load(open(fn))['features']:
        p=ft['properties']
        if p.get('man_made') in ('breakwater','pier','groyne','quay') and ft['geometry']['type']!='Point': st.append(shape(ft['geometry']))
cl=list(unary_union([g.buffer(0.003) for g in st]).geoms)
ntree=STRtree([Point(p) for p in named])
places=[x for x in d['place'] if x['t'].get('place') in ('village','hamlet','town','neighbourhood','suburb')]
ptree=STRtree([Point(x['lon'],x['lat']) for x in places])
unn=[]
for c in cl:
    ctr=c.centroid
    if len(ntree.query(ctr.buffer(0.011)))>0: continue   # ~1 km 안에 이름 있음
    i=ptree.query_nearest(ctr,max_distance=0.025)
    if len(i)==0: unn.append([None,ctr.x,ctr.y]); continue
    pl=places[int(i[0])]; unn.append([pl['n'],ctr.x,ctr.y])
print('unnamed clusters',len(unn),'with village',sum(1 for u in unn if u[0]))
# dykes
DK=[]
def near_both(lo,la):
    pt=Point(lo,la); return sea.distance(pt)*100000, W.distance(pt)*100000
fixed={'고흥만방조제':'고흥만방조제','삼산방조제':'삼산방조제','서산 A지구 방조제':'서산 A지구 방조제','서산 B지구 방조제':'서산 B지구 방조제','아산만방조제':'아산만방조제','영산강하구둑':'영산강하구둑','완도방조제':'완도방조제','낙동강 하굿둑':'낙동강 하굿둑','금강하굿둑 인증센터':'금강하굿둑','새만금방조제준공조형물':'새만금방조제','홍성보령방조제 준공탑':'홍성보령방조제','영암금호방조제 준공기념탑':'영암·금호방조제'}
for x in dk:
    if x['n'] in fixed:
        pts=x['pts']; lo=sum(p[0] for p in pts)/len(pts); la=sum(p[1] for p in pts)/len(pts)
        if not any(o[0]==fixed[x['n']] for o in DK): DK.append([fixed[x['n']],lo,la])
roads={}
for x in dk:
    m=re.match(r'^(.+방조제)로$',x['n'])
    if m and len(x['pts'])>1: roads.setdefault(m.group(1),[]).extend(x['pts'])
for nm,pts in roads.items():
    best=None
    for lo,la in pts[::2]:
        a,b=near_both(lo,la)
        sc=a+b
        if best is None or sc<best[0]: best=(sc,lo,la,a,b)
    print(nm,best)
    if best and best[3]<400 and best[4]<600: DK.append([nm,best[1],best[2]])
# old ones from first scan
for x in d['dyke']:
    if x['n'] in ('주매제방','목포제방') and 'pts' in x:
        pts=x['pts']; lo=sum(p[0] for p in pts)/len(pts); la=sum(p[1] for p in pts)/len(pts)
        a,_=near_both(lo,la)
        if a<1500: DK.append([x['n'],lo,la])
print('dykes',DK)
json.dump({'unn':unn,'dyke':DK},open('names2.json','w'),ensure_ascii=False)
