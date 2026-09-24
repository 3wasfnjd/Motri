import bpy
from mathutils import Vector
from pathlib import Path
s=bpy.context.scene
s.render.engine='BLENDER_EEVEE';s.view_settings.view_transform='Khronos PBR Neutral'
s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG'
s.render.resolution_x=1100;s.render.resolution_y=850;s.render.resolution_percentage=100
s.eevee.taa_render_samples=16;s.eevee.use_raytracing=False;s.eevee.use_fast_gi=False
views=globals().get('PREVIEW_VIEWS',[
 ('01_aerial',(48,42,62),(5,-23,0),'ORTHO',72),
 ('02_top',(5.2,-21.2,80),(5.2,-21.2,0),'ORTHO',66),
 ('03_open_entrance',(-1,12,6.5),(2,-16,.5),'PERSP',28)
])
for name,loc,target,typ,scale in views:
    s.camera.location=loc;s.camera.rotation_euler=(Vector(target)-s.camera.location).to_track_quat('-Z','Y').to_euler()
    if name=='02_top':
        s.camera.rotation_euler=(0,0,3.141592653589793)
        s.render.resolution_x=900;s.render.resolution_y=1100
    else:s.render.resolution_x=1100;s.render.resolution_y=850
    s.camera.data.type=typ
    if typ=='ORTHO':s.camera.data.ortho_scale=scale
    else:s.camera.data.lens=scale
    if 'artifacts' in globals():
        out=artifacts.file(name=name+'.png',media_type='image/png');s.render.filepath=str(out.path)
        bpy.ops.render.render(write_still=True);out.publish()
    else:
        folder=Path(bpy.path.abspath('//'))/'previews';folder.mkdir(exist_ok=True)
        s.render.filepath=str(folder/(name+'.png'));bpy.ops.render.render(write_still=True)
