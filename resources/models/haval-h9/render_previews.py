"""Temporary studio preview setup; does not belong in the vehicle export.
The worker artifacts API publishes renders when available; ordinary Blender
writes images into a previews folder beside the open .blend file.
"""
import bpy
from mathutils import Vector
s=bpy.context.scene
if not s.camera:
 data=bpy.data.cameras.new('Temporary_InspectionCamera')
 camera=bpy.data.objects.new('Temporary_InspectionCamera',data);s.collection.objects.link(camera);s.camera=camera
if not any(o.type=='LIGHT' for o in s.objects):
 for name,loc,power,size in [('Key',(4,-4,7),900,5),('Fill',(-4,-1,4),650,4),('Rim',(1,5,5),850,4)]:
  data=bpy.data.lights.new('Temporary_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
  light=bpy.data.objects.new('Temporary_'+name,data);s.collection.objects.link(light);light.location=loc
  light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
s.render.resolution_x=1200;s.render.resolution_y=800;s.render.resolution_percentage=100
s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG'
s.eevee.taa_render_samples=24
for obj in s.objects:
 if obj.type=='LIGHT' and hasattr(obj.data,'use_shadow_jitter'):obj.data.use_shadow_jitter=False
s.eevee.use_raytracing=False
s.eevee.use_fast_gi=False
m=bpy.data.materials.new('Temporary_StudioFloor');m.diffuse_color=(.29,.31,.34,1);m.use_nodes=True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.29,.31,.34,1)
m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));bpy.context.object.data.materials.append(m);bpy.context.object.name='Temporary_StudioFloor'
views=[
 ('01_front',(0,-10,1.02),3.75),
 ('02_front_left',(6,-8,3.25),6.15),
 ('03_front_right',(-6,-8,3.25),6.15),
 ('04_left_orthographic',(10,0,1.02),5.92),
 ('05_rear_left',(6,8,3.15),6.15),
 ('06_rear',(0,10,1.02),3.75)
]
for name,loc,scale in views:
 s.camera.location=loc;s.camera.rotation_euler=(Vector((0,0,1.02))-s.camera.location).to_track_quat('-Z','Y').to_euler()
 s.camera.data.type='ORTHO';s.camera.data.ortho_scale=scale
 if 'artifacts' in globals():
  target=artifacts.file(name=name+'.png',media_type='image/png')
  s.render.filepath=str(target.path);bpy.ops.render.render(write_still=True);target.publish()
 else:
  from pathlib import Path
  folder=Path(bpy.path.abspath('//'))/'previews';folder.mkdir(exist_ok=True)
  s.render.filepath=str(folder/(name+'.png'));bpy.ops.render.render(write_still=True)
