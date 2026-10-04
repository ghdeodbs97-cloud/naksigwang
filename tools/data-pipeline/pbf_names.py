import osmium,json,re,time
t0=time.time()
NAMERE=re.compile(r'(항|포구|선착장|나루|방조제|제방|하구둑|방파제)$')
out={'harb':[],'dyke':[],'place':[]}
class H(osmium.SimpleHandler):
    def __init__(s): super().__init__()
    def rec(s,o,lon,lat,kind):
        t=o.tags; n=t.get('name:ko') or t.get('name')
        out[kind].append({'n':n,'lon':round(lon,6),'lat':round(lat,6),'t':{k:t.get(k) for k in ('harbour','landuse','leisure','man_made','seamark:type','amenity','place','embankment','highway','natural','waterway') if t.get(k)}})
    def classify(s,t):
        n=t.get('name:ko') or t.get('name')
        if t.get('place') in ('village','hamlet','town','suburb','neighbourhood','isolated_dwelling') and n: return 'place'
        if not n: return None
        if t.get('man_made')=='dyke' or t.get('embankment') or re.search(r'(방조제|제방|하구둑)$',n): return 'dyke'
        if t.get('harbour') or t.get('landuse')=='harbour' or t.get('leisure')=='marina' or t.get('seamark:type') in ('harbour','small_craft_facility') or t.get('amenity')=='ferry_terminal' or t.get('man_made') in ('breakwater','pier') or re.search(r'(항|포구|선착장|나루)$',n): 
            if t.get('highway') or t.get('building') or t.get('amenity') in ('restaurant','cafe','bus_station') or t.get('shop') or t.get('railway'): return None
            return 'harb'
        return None
    def node(s,n):
        k=s.classify(n.tags)
        if k: s.rec(n,n.location.lon,n.location.lat,k)
    def way(s,w):
        k=s.classify(w.tags)
        if not k: return
        try:
            xs=[nd.lon for nd in w.nodes]; ys=[nd.lat for nd in w.nodes]
        except osmium.InvalidLocationError: return
        if k=='dyke':
            pts=[(nd.lon,nd.lat) for nd in w.nodes]
            o=w.tags; nm=o.get('name:ko') or o.get('name')
            out['dyke'].append({'n':nm,'pts':[(round(a,6),round(b,6)) for a,b in pts],'t':{kk:o.get(kk) for kk in ('man_made','embankment','highway') if o.get(kk)}})
            return
        s.rec(w,sum(xs)/len(xs),sum(ys)/len(ys),k)
h=H(); h.apply_file('/mnt/user-data/uploads/south-korea-261002_osm.pbf',locations=True,idx='flex_mem')
json.dump(out,open('pbf_names.json','w'),ensure_ascii=False)
print({k:len(v) for k,v in out.items()},time.time()-t0)
