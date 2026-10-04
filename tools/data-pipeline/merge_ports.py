import csv,io,re,math,json,collections
csv.field_size_limit(10**9)
def load(fn): return list(csv.reader(io.StringIO(open(fn,'rb').read().decode('cp949'))))
D2R=math.pi/180
def tm_inv(x,y,a,f,lat0,lon0,k0,fe,fn):
  e2=2*f-f*f;ep2=e2/(1-e2)
  def Mf(p): return a*((1-e2/4-3*e2*e2/64-5*e2**3/256)*p-(3*e2/8+3*e2*e2/32+45*e2**3/1024)*math.sin(2*p)+(15*e2*e2/256+45*e2**3/1024)*math.sin(4*p)-(35*e2**3/3072)*math.sin(6*p))
  M=Mf(lat0*D2R)+(y-fn)/k0;mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2**3/256));e1=(1-math.sqrt(1-e2))/(1+math.sqrt(1-e2))
  p1=mu+(3*e1/2-27*e1**3/32)*math.sin(2*mu)+(21*e1*e1/16-55*e1**4/32)*math.sin(4*mu)+(151*e1**3/96)*math.sin(6*mu)+(1097*e1**4/512)*math.sin(8*mu)
  C1=ep2*math.cos(p1)**2;T1=math.tan(p1)**2;N1=a/math.sqrt(1-e2*math.sin(p1)**2);R1=a*(1-e2)/(1-e2*math.sin(p1)**2)**1.5;D=(x-fe)/(N1*k0)
  lat=p1-(N1*math.tan(p1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720)
  lon=lon0*D2R+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/math.cos(p1)
  return lat,lon
def bessel_to_wgs(lat,lon):
  # 3-parameter shift (EPSG:2097 TOWGS84 -146.43,507.89,681.46) via geocentric
  a=6377397.155;f=1/299.1528128;e2=2*f-f*f
  N=a/math.sqrt(1-e2*math.sin(lat)**2);X=N*math.cos(lat)*math.cos(lon);Y=N*math.cos(lat)*math.sin(lon);Z=N*(1-e2)*math.sin(lat)
  X+=-146.43;Y+=507.89;Z+=681.46
  a2=6378137;f2=1/298.257223563;e22=2*f2-f2*f2;p=math.hypot(X,Y);lt=math.atan2(Z,p*(1-e22))
  for _ in range(6): N2=a2/math.sqrt(1-e22*math.sin(lt)**2);lt=math.atan2(Z+e22*N2*math.sin(lt),p)
  return lt/D2R,math.atan2(Y,X)/D2R
def norm(n): return re.sub(r'\(.*?\)|\s','',n).replace('항','')
out={}
# 1) national port zones -> centroid of polygon vertices
nat=load('p_nat.csv');H=nat[0];gi=H.index('공간정보');ni=H.index('국가어항구역명')
for r in nat[1:]:
  pts=[tuple(map(float,m)) for m in re.findall(r'(-?\d+\.\d+)\s+(-?\d+\.\d+)',r[gi])]
  if not pts: continue
  lon=sum(p[0] for p in pts)/len(pts);lat=sum(p[1] for p in pts)/len(pts)
  out[norm(r[ni])]=[r[ni].strip(),'국가어항',round(lat,5),round(lon,5),'nat']
# 2) 충남 bbox centers (Bessel TM central belt, mm)
cn=load('p_cn.csv')
for r in cn[1:]:
  x=(float(r[1])+float(r[3]))/2/1000;y=(float(r[2])+float(r[4]))/2/1000
  la,lo=tm_inv(x,y,6377397.155,1/299.1528128,38,127,1,200000,500000)
  la,lo=bessel_to_wgs(la,lo)
  k=norm(r[6])
  if k not in out: out[k]=[r[6].strip(),'충남 어항',round(la,5),round(lo,5),'cn']
  else: out[k].append(('cn',round(la,5),round(lo,5)))
# 3) 어항정보 (2-decimal)
info=load('p_info.csv')
cmp=[]
for r in info[1:]:
  k=norm(r[0]);la=float(r[3]);lo=float(r[4])
  if k in out:
    o=out[k];cmp.append((o[0],o[4],round(math.hypot((o[2]-la)*111000,(o[3]-lo)*111000*math.cos(la*D2R)))))
  else: out[k]=[r[0].strip(),'어항',la,lo,'info']
print('total',len(out),collections.Counter(v[4] for v in out.values()))
print('info vs better source distance (m):',sorted(cmp,key=lambda c:c[2]))
cnchk=[(v[0],v[2],v[3],v[5:]) for v in out.values() if len(v)>5]
print('cn overlap with nat:',cnchk)
json.dump(list(out.values()),open('ports_new.json','w'),ensure_ascii=False)
