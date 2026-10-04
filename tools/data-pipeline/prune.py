import json,collections
d=json.load(open('ports_isl.json'));ports=d['ports'];main=d['main']
NO_CAR={290:'금오도(여수 남면)',299:'개도(여수 화정면)',316:'여자도(여수 화정면)',344:'경도(여수)',261:'송도(돌산항 앞)',413:'장도(보성 벌교)',
 482:'금일도(완도)',501:'노화도(완도)',566:'보길도(완도)',543:'청산도(완도)',777:'흑산도(신안)',802:'하의도(신안)',810:'신의도(신안)',
 763:'도초도(신안)',750:'비금도(신안)',745:'비금면 부속섬(신안)',826:'장산도(신안)',759:'우이도(신안)',786:'흑산면 부속섬(신안)',765:'가거도(신안)',
 780:'홍도(신안)',713:'병풍도·기점·소악도(신안 증도면)',664:'선도(신안 지도읍)',458:'낙월도(영광)',332:'초도(여수 삼산면)',322:'거문도 서도(여수)',
 339:'소거문도(여수)',285:'연도(여수 남면)',287:'안도(여수 남면)',293:'대두라도(여수)',292:'소두라도(여수)',296:'금오도 부속섬(여수 남면)',297:'월호도 일대(여수 화정면)'}
pri=lambda t:0 if '국가' in t else 1 if t in('어항','충남 어항') or '지방' in t else 2 if '정주' in t else 3
by=collections.defaultdict(list)
for i,p in enumerate(ports):
  if p['isl'] in NO_CAR or str(p['isl']) in NO_CAR: by[p['isl']].append(i)
removed=[];report=[]
for isl,idx in by.items():
  if len(idx)<2: continue
  base=NO_CAR[isl].split('(')[0].split('·')[0].rstrip('도') or NO_CAR[isl][:2]
  idx.sort(key=lambda i:(base not in ports[i]['name'],pri(ports[i]['type']),-ports[i]['boats'],'선착장' in ports[i]['name'],ports[i]['name']))
  nat=[i for i in idx if '국가' in ports[i]['type']]
  keeps=nat if nat else idx[:1]
  rm=[i for i in idx if i not in keeps];removed+=rm
  report.append((NO_CAR[isl],'·'.join(ports[k]['name'] for k in keeps),ports[keeps[0]]['type'],len(rm)))
keep=[p for i,p in enumerate(ports) if i not in set(removed)]
print('removed',len(removed),'remain',len(keep))
for r in sorted(report,key=lambda r:-r[3]): print(r)
json.dump([[p['name'],p['type'],p['lat'],p['lon']] for p in keep],open('ports_pruned.json','w'),ensure_ascii=False)
json.dump(report,open('prune_report.json','w'),ensure_ascii=False)
