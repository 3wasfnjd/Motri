"""Extract placement metadata and verify the self-contained GLB payload."""
import json,struct,hashlib,io
from pathlib import Path
from PIL import Image

folder=Path(__file__).parent
path=folder/'RestHouse_Motri2.glb';data=path.read_bytes()
magic,version,length=struct.unpack_from('<III',data,0)
assert magic==0x46546c67 and version==2 and length==len(data)
jlen,jtype=struct.unpack_from('<II',data,12);assert jtype==0x4e4f534a
g=json.loads(data[20:20+jlen]);off=20+jlen
blen,btype=struct.unpack_from('<II',data,off);assert btype==0x004e4942
binary=data[off+8:off+8+blen]
assert not g.get('animations') and not g.get('skins') and not g.get('cameras')
assert not g.get('extensionsRequired');assert not g.get('extensions')
assert all('uri' not in b for b in g['buffers'])
assert all(not m.get('doubleSided',False) for m in g['materials'])
images=[]
for img in g.get('images',[]):
    assert 'uri' not in img
    v=g['bufferViews'][img['bufferView']];raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    im=Image.open(io.BytesIO(raw));im.load();assert im.size==(512,512)
    images.append({'name':img.get('name'),'width':im.width,'height':im.height,'bytes':len(raw),'decode':'PASS'})
extras=next(n for n in g['nodes'] if n.get('name')=='RestHouse_Root')['extras']
collision={'units':'metres','up':'+Y','inside_direction':'+Z','dimensions_estimated':True,
 'site_bounds_xz':{'min':[-14.8,0],'max':[25.2,48.8]},
 'ground_y':0,'spawn_at_ground':[0,0,-5.5],
 'nominal_gate_opening_m':5.2,
 'ground_areas':[{'center':[5.2,-.15,24.4],'size':[40,.30,48.8]}, {'center':[0,-.15,-3.2],'size':[6.8,.30,6.4]}],
 'static_shapes':json.loads(extras['collision_boxes_json']),
 'clearance_route':json.loads(extras['suggested_route_glTF']),
 'note':'Connect to game physics; route is not a kinematic driving controller.'}
(folder/'collision_and_placement.json').write_text(json.dumps(collision,indent=2))
primitives=[p for m in g['meshes'] for p in m['primitives']]
triangles=sum(g['accessors'][p['indices']]['count']//3 for p in primitives)
assert triangles<=12000 and len(data)<1000000
manifest={'asset':path.name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':triangles,
 'mesh_nodes':len(g['meshes']),'render_primitives':len(primitives),'materials':len(g['materials']),'images':images,
 'static_shapes':len(collision['static_shapes']),'lights':0,'cameras':0,'animations':0,'decoder_extensions':[],
 'root':'RestHouse_Root','units':'metres','up':'+Y','inside':'+Z','layout':'Matched to supplied plan when looking through the front gate',
 'dimensions_estimated':True,'tested_in_Motri2':False}
(folder/'asset_manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
