import json,glob,collections
CAT={'breakwater':'bw','groyne':'gr','pier':'pi','quay':'qu','lighthouse':'lh','beach':'be','bare_rock':'br','cliff':'cl','reef':'rf','shoal':'sh','tidalflat':'tf','saltmarsh':'sm','harbour':'hb','marina':'ma','slipway':'sl'}
def cat(p):
    for k in ('man_made','leisure','landuse'):
        if p.get(k) in CAT: return CAT[p[k]]
    if p.get('natural')=='wetland': return CAT.get(p.get('wetland'))
    if p.get('natural') in CAT: return CAT[p['natural']]
    return None
def rdp(pts,eps):
    if len(pts)<3: return pts
    import math
    keep=[False]*len(pts); keep[0]=keep[-1]=True; st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop(); ax,ay=pts[a]; bx,by=pts[b]; dx,dy=bx-ax,by-ay; L=math.hypot(dx,dy); best=-1; bi=-1
        for i in range(a+1,b):
            px,py=pts[i]
            d=abs(dy*(px-ax)-dx*(py-ay))/L if L else math.hypot(px-ax,py-ay)
            if d>best: best=d; bi=i
        if best>eps: keep[bi]=True; st+=[(a,bi),(bi,b)]
    return [p for p,k in zip(pts,keep) if k]
def enc(ring,closed):
    q=[(round(x*1e5),round(y*1e5)) for x,y in ring]
    # simplify in degree*1e5 units (~1.1 m per unit at lat); eps 0.6 units
    q=rdp(q,0.6)
    if closed and len(q)<4: return None
    out=[]; px,py=12400000,3300000
    for x,y in q: out+= [x-px,y-py]; px,py=x,y
    return out
seen=set(); F=[]; cnt=collections.Counter(); names=0
for f in sorted(glob.glob('osm/*.geojson')):
    for ft in json.load(open(f))['features']:
        if ft['id'] in seen: continue
        seen.add(ft['id']); p=ft['properties']; c=cat(p)
        if not c: continue
        g=ft['geometry']; t=g['type']; nm=p.get('name:ko') or p.get('name') or ''
        if c in ('lh',) and t!='Point':
            # lighthouse building polygon -> point
            xs=[a[0] for a in g['coordinates'][0]]; ys=[a[1] for a in g['coordinates'][0]]
            t='Point'; g={'type':'Point','coordinates':[sum(xs)/len(xs),sum(ys)/len(ys)]}
        if t=='Point':
            if c in ('pi','sl','gr','bw','qu'): continue
            x,y=g['coordinates']; F.append([c,0,nm,[[round(x*1e5)-12400000,round(y*1e5)-3300000]]])
        elif t in ('LineString','MultiLineString'):
            ls=[g['coordinates']] if t=='LineString' else g['coordinates']
            rs=[r for r in (enc(l,False) for l in ls) if r and len(r)>=4]
            if rs: F.append([c,1,nm,rs])
        elif t in ('Polygon','MultiPolygon'):
            ps=[g['coordinates']] if t=='Polygon' else g['coordinates']
            for poly in ps:
                rs=[r for r in (enc(r,True) for r in poly) if r]
                if rs: F.append([c,2,nm,rs])
        else: continue
        cnt[(c,F[-1][1])]+=1
        if nm: names+=1
s='const OSMF='+json.dumps(F,ensure_ascii=False,separators=(',',':'))+';\n'
open('osm_embed.js','w',encoding='utf-8').write(s)
print(len(F),'features',len(s)/1e6,'MB',names,'named'); print(sorted(cnt.items(),key=lambda x:-x[1]))
# ── 다리 (바다·간척호를 건너는 것만, build_bridges*.py에서 선별)
import pickle
BK=pickle.load(open('bridges_keep.pkl','rb'))['B']
nb=0
for b in BK:
    k=b['kind']; c='bt' if k=='rail' else 'bm' if k.startswith(('motorway','trunk')) else 'bf' if k in ('footway','path','cycleway','pedestrian','steps') else 'bd'
    r=enc(list(b['g'].coords),False)
    if r and len(r)>=4: F.append([c,1,b['name'],[r]]); nb+=1
s='const OSMF='+json.dumps(F,ensure_ascii=False,separators=(',',':'))+';\n'
open('osm_embed.js','w',encoding='utf-8').write(s)
print('bridges',nb,'total',len(F),len(s)/1e6,'MB')
# ── 섬 이름 (해안선 자료의 place=island/islet)
seen=set(); ni=0
for fn in sorted(glob.glob('coast/*____*.geojson')):
    for ft in json.load(open(fn))['features']:
        if ft['id'] in seen: continue
        seen.add(ft['id']); p=ft['properties']; nm=p.get('name:ko') or p.get('name')
        if not nm or p.get('place') not in ('island','islet'): continue
        g=ft['geometry']; cs=g['coordinates'] if g['type']=='LineString' else g['coordinates'][0]
        x=sum(c[0] for c in cs)/len(cs); y=sum(c[1] for c in cs)/len(cs)
        F.append(['is' if p['place']=='island' else 'il',0,nm,[[round(x*1e5)-12400000,round(y*1e5)-3300000]]]); ni+=1
s='const OSMF='+json.dumps(F,ensure_ascii=False,separators=(',',':'))+';\n'
open('osm_embed.js','w',encoding='utf-8').write(s)
print('islands',ni,'total',len(F),len(s)/1e6,'MB')
# ── 항 이름(OSM, 기존 항구 목록에 없는 것) · 이름 없는 방파제 묶음의 가까운 마을 · 방조제 이름
HN=json.load(open('harb_new.json')); N2=json.load(open('names2.json'))
pt=lambda lo,la:[[round(lo*1e5)-12400000,round(la*1e5)-3300000]]
for n,lo,la,cd in HN: F.append(['hn',0,n,pt(lo,la)])
for n,lo,la in N2['unn']:
    if n: F.append(['hu',0,n,pt(lo,la)])
for n,lo,la in N2['dyke']: F.append(['dk',0,n,pt(lo,la)])
s='const OSMF='+json.dumps(F,ensure_ascii=False,separators=(',',':'))+';\n'
open('osm_embed.js','w',encoding='utf-8').write(s)
print('names added',len(HN),sum(1 for u in N2['unn'] if u[0]),len(N2['dyke']),'total',len(F),len(s)/1e6,'MB')
