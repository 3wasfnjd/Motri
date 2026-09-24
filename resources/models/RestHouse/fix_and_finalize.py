"""Run after build_rest_house.py for an export with geometry only."""
import bpy,bmesh,json
root=bpy.data.objects['RestHouse_Root']
# Derive gate collider yaw from the real hinged object, idempotently.
colliders=json.loads(root['collision_boxes_json'])
for c in colliders:
    if c['name'] in ['Gate_Left','Gate_Right']:
        c['rotationY']=float(bpy.data.objects['RH_'+c['name']].rotation_euler.z)
for i in range(3):
    name='terrace_step_'+str(i)
    if not any(c['name']==name for c in colliders):
        h=.07*(3-i);x=(55.425-i*.85-63)*.4*root.get('layout_x_sign',1)
        colliders.append({'name':name,'shape':'box','center':[x,h/2,34.6],'size':[.34,h,12.4],'rotationY':0})
root['collision_boxes_json']=json.dumps(colliders,separators=(',',':'))
route=[(0,-5.5),(0,19.5),(-6.,23.5),(-10.5,28.5),(-13,35.5),(-8,38),(-7.3,34),(-7.3,29),(-10.5,28.5),(-6,23.5),(0,19.5),(0,-5.5)]
root['suggested_route_glTF']=json.dumps([[x*root.get('layout_x_sign',1),0,z] for x,z in route],separators=(',',':'))
removed=0
for o in list(bpy.context.scene.objects):
    if o.type=='MESH':
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bad=[f for f in bm.faces if f.calc_area()<1e-10];removed+=len(bad)
        if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
        loose=[v for v in bm.verts if not v.link_faces]
        if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bm.to_mesh(o.data);bm.free();o.data.update()
if globals().get('REMOVE_STUDIO',True):
    for m in bpy.data.materials:m.use_backface_culling=True
    for o in list(bpy.context.scene.objects):
        if o.type in {'CAMERA','LIGHT'}:bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.scene.camera=None
    for group in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.cameras,bpy.data.lights]:
        for item in list(group):
            if item.users==0:group.remove(item)
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=62
        area.spaces.active.region_3d.view_location=(5.2,-24.4,1)
result={'removed_zero_area_faces':removed,'studio_removed':globals().get('REMOVE_STUDIO',True)}
