import pickle,collections,datetime,zlib,base64,json,struct
recs=pickle.load(open('crnt_recs.pkl','rb'))
T0=datetime.datetime(2026,9,30)   # tA 기준 (KST)
LO=T0-datetime.timedelta(days=1); HI=datetime.datetime(2027,1,1)
st=collections.defaultdict(list); pos={}
for r in recs:
    t=datetime.datetime.strptime(r['predcDt'],'%Y-%m-%d %H:%M')
    if LO<=t<HI:
        st[r['obsvtrNm']].append((int((t-T0).total_seconds()//60),round(float(r['crdir'])),round(float(r['crsp'])*10)))
        pos[r['obsvtrNm']]=(float(r['lat']),float(r['lot']))
names=sorted(st,key=lambda n:(-pos[n][0],pos[n][1]))
meta=[];dt=[];dr=[];sp=[]
for n in names:
    v=sorted(set(st[n])); prev=None
    meta.append([n,pos[n][0],pos[n][1],len(v),v[0][0]])
    for i,(t,d,s) in enumerate(v):
        dt.append(0 if i==0 else t-prev); prev=t; dr.append(d%360); sp.append(s)
assert max(dt)<65536 and max(sp)<65536
n=len(dt)
buf=bytearray()
for arr in (dt,dr,sp):
    a=bytes(x&255 for x in arr); b=bytes(x>>8 for x in arr); buf+=a+b
z=zlib.compress(bytes(buf),9)
js='const CRNT='+json.dumps({'st':meta,'n':n,'b64':base64.b64encode(z).decode()},ensure_ascii=False,separators=(',',':'))+';'
open('crnt_embed.js','w',encoding='utf-8').write(js)
print(len(names),n,len(buf),len(z),len(js))
