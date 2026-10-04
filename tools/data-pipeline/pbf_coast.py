import osmium,pickle
W={}
class H(osmium.SimpleHandler):
    def way(s,w):
        if w.tags.get('natural')!='coastline': return
        try: W[w.id]=[(a.lon,a.lat) for a in w.nodes]
        except osmium.InvalidLocationError: pass
H().apply_file('/mnt/user-data/uploads/south-korea-261002_osm.pbf',locations=True,idx='flex_mem')
pickle.dump(W,open('pbf_coast.pkl','wb')); print(len(W),sum(len(c) for c in W.values()))
