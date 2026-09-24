"""Run in Blender with H9 scene open. Read-only except temporary wheel poses, restored."""
import bpy,bmesh,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
s=bpy.context.scene
wheels=[bpy.data.objects['Wheel_'+x] for x in ['FL','FR','RL','RR']]
static=[o for o in s.objects if o.type=='MESH' and o not in wheels]
def bvh(o):
    o.data.calc_loop_triangles()
    return BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[tuple(t.vertices) for t in o.data.loop_triangles],all_triangles=True,epsilon=.000001)
trees={o.name:bvh(o) for o in static}
checks=[]
for w in wheels:
    isfront='SteeringPivot' in w.parent.name
    start=w.matrix_world.translation.copy()
    for steer in ([-30,0,30] if isfront else [0]):
        if isfront:w.parent.rotation_euler.z=math.radians(steer)
        for spin in range(0,361,30):
            w.rotation_euler.x=math.radians(spin);bpy.context.view_layer.update()
            tree=bvh(w)
            hits={name:len(tree.overlap(t)) for name,t in trees.items() if tree.overlap(t)}
            drift=(w.matrix_world.translation-start).length
            if hits or drift>.00001:checks.append({'wheel':w.name,'steer':steer,'spin':spin,'center_drift':drift,'intersections':hits})
    w.rotation_euler=(0,0,0)
    if isfront:w.parent.rotation_euler=(0,0,0)
bpy.context.view_layer.update()
geometry={}
for o in static+wheels:
    bm=bmesh.new();bm.from_mesh(o.data)
    geometry[o.name]={'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts),'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces),'modifiers':len(o.modifiers),'scale':list(o.scale),'rotation':list(o.rotation_euler)}
    bm.free()
positions={w.name:{'center':list(w.matrix_world.translation),'ground_min':min((w.matrix_world@v.co).z for v in w.data.vertices),'max_radius':max(math.hypot(v.co.y,v.co.z) for v in w.data.vertices)} for w in wheels}
vertices=[o.matrix_world@v.co for o in static+wheels for v in o.data.vertices]
bounds={'min':[min(v[i] for v in vertices) for i in range(3)],'max':[max(v[i] for v in vertices) for i in range(3)]}
plate={}
for name in ['LicensePlateSurface_Front','LicensePlateSurface_Rear']:
 o=bpy.data.objects[name]
 plate[name]={'uv':[list(v.uv) for v in o.data.uv_layers.active.data], 'normals':[list(p.normal) for p in o.data.polygons],'triangles':len(o.data.loop_triangles),'material':o.data.materials[0].name}
result={'pose_tests':104,'pose_failures':checks,'geometry':geometry,'wheels':positions,'bounds_blender':bounds,'plates':plate,'eevee_properties':[p.identifier for p in s.eevee.bl_rna.properties] if hasattr(s,'eevee') else [],'samples':s.eevee.taa_render_samples if hasattr(s,'eevee') and hasattr(s.eevee,'taa_render_samples') else None}
