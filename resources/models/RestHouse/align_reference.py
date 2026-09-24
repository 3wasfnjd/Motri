"""Align plan-right with the viewer's right when entering toward glTF +Z.
Reflect geometry and physics data, with positive object scales and correct normals.
Idempotent; run between build_rest_house.py and previews/finalization.
"""
import bpy,bmesh,json
root=bpy.data.objects['RestHouse_Root']
if root.get('layout_x_sign',1)!=-1:
    for o in root.children_recursive:
        if o.type=='MESH':
            for v in o.data.vertices:v.co.x=-v.co.x
            bm=bmesh.new();bm.from_mesh(o.data)
            bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.normal_update();bm.to_mesh(o.data);bm.free();o.data.update()
        o.location.x=-o.location.x;o.rotation_euler.z=-o.rotation_euler.z
    colliders=json.loads(root['collision_boxes_json'])
    for c in colliders:c['center'][0]=-c['center'][0];c['rotationY']=-c['rotationY']
    root['collision_boxes_json']=json.dumps(colliders,separators=(',',':'))
    route=json.loads(root['suggested_route_glTF'])
    for p in route:p[0]=-p[0]
    root['suggested_route_glTF']=json.dumps(route,separators=(',',':'))
    root['layout_x_sign']=-1
result={'plan_orientation':'matched to entrance view','object_scales':'positive'}
