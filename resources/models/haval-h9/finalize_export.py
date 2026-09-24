"""Clean the inspection scene before exporting the vehicle. Run after build_h9.py."""
import bpy
from mathutils import Vector, Quaternion
s=bpy.context.scene
for o in list(s.objects):
    if o.type in {'CAMERA','LIGHT'} or o.name.startswith('Temporary_'):
        bpy.data.objects.remove(o,do_unlink=True)
for o in s.objects:
    if o.type=='MESH' and not o.name.startswith('LicensePlateSurface_'):
        for layer in list(o.data.uv_layers):o.data.uv_layers.remove(layer)
for collection in list(bpy.data.collections):
    if not collection.objects and not collection.children:bpy.data.collections.remove(collection)
for blocks in [bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.images,bpy.data.cameras,bpy.data.lights,bpy.data.actions]:
    for block in list(blocks):
        if block.users==0:blocks.remove(block)
root=bpy.data.objects['H9_Root']
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.context.view_layer.objects.active=root
# A useful editable viewport when the .blend is opened without a camera.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=7.4
            area.spaces.active.region_3d.view_location=Vector((0,0,1))
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.region_3d.view_rotation=Quaternion((0.806,0.49,0.164,0.288)).normalized()
stats={}
for o in s.objects:
    if o.type=='MESH':o.data.calc_loop_triangles();stats[o.name]=len(o.data.loop_triangles)
result={'triangles':sum(stats.values()),'mesh_count':len(stats),'nodes':len(s.objects),'materials':[m.name for m in bpy.data.materials],'cameras':sum(o.type=='CAMERA' for o in s.objects),'lights':sum(o.type=='LIGHT' for o in s.objects),'modifiers':sum(len(o.modifiers) for o in s.objects),'images':len(bpy.data.images),'animations':len(bpy.data.actions),'per_mesh':stats,'forward_glTF':'+Z','up_glTF':'+Y','spin_axis_local':'X','steering_axis_glTF':'Y'}
