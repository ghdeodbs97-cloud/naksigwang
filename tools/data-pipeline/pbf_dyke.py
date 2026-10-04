import osmium,json,re
R=re.compile(r'(방조제|하구둑|하굿둑|방수제|방潮堤)')
out=[]
class H(osmium.SimpleHandler):
    def node(s,n):
        nm=n.tags.get('name:ko') or n.tags.get('name') or ''
        if R.search(nm): out.append({'n':nm,'pts':[(n.location.lon,n.location.lat)],'t':dict(n.tags)})
    def way(s,w):
        nm=w.tags.get('name:ko') or w.tags.get('name') or ''
        if not R.search(nm): return
        try: pts=[(round(a.lon,6),round(a.lat,6)) for a in w.nodes]
        except osmium.InvalidLocationError: return
        out.append({'n':nm,'pts':pts,'t':{k:v for k,v in w.tags}})
H().apply_file('/mnt/user-data/uploads/south-korea-261002_osm.pbf',locations=True,idx='flex_mem')
json.dump(out,open('pbf_dyke.json','w'),ensure_ascii=False); print(len(out))
