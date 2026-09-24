"""Original exterior recreation from the user's five aerial images/video.
Blender 5.2; metre units; approximate 40 x 48.8 m site, NOT surveyed.
Blender: entrance at origin, interior -Y. glTF: interior +Z, up +Y.
No downloaded models. Texture authored numerically, packed into the file.
"""
import bpy, bmesh, math, random, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from math import sin, cos, pi

random.seed(42)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes,bpy.data.materials,bpy.data.images):
    for item in list(collection):
        if item.users==0: collection.remove(item)
scene=bpy.context.scene
scene.name='RestHouse_Motri2'
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1

def linear(v):
    return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgb(h):
    return tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,)
def material(name,rough,metal=0,colored=True):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(1,1,1,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if colored:
        a=m.node_tree.nodes.new('ShaderNodeVertexColor');a.layer_name='Color'
        m.node_tree.links.new(a.outputs['Color'],p.inputs['Base Color'])
    return m
M={
 'solid':material('Mat_ExteriorPalette',.86),
 'metal':material('Mat_MetalPalette',.55,.18),
 'glass':material('Mat_OpaqueTintedGlass',.3,.06),
 'foliage':material('Mat_FoliagePalette',.94),
 'stone':material('Mat_StonePaving',.92,colored=False)
}
# A single seamless 512px stone tile: coarse Voronoi cells with thin grout.
N=512
yy,xx=np.mgrid[0:N,0:N].astype(np.float32);xx/=N;yy/=N
best=np.full((N,N),100.,np.float32);second=best.copy();index=np.zeros((N,N),np.int32)
rng=np.random.default_rng(72)
seeds=[((i+rng.uniform(.12,.88))/6,(j+rng.uniform(.12,.88))/6) for j in range(6) for i in range(6)]
for k,(sx,sy) in enumerate(seeds):
    dx=np.abs(xx-sx);dy=np.abs(yy-sy);dx=np.minimum(dx,1-dx);dy=np.minimum(dy,1-dy)
    dist=dx*dx+dy*dy
    mask=dist<best;second=np.where(mask,best,np.minimum(second,dist));index=np.where(mask,k,index);best=np.minimum(best,dist)
edge=(np.sqrt(second)-np.sqrt(best))<.009
colors=np.array([np.array([.67,.665,.62])+rng.uniform(-.10,.12) for _ in seeds])
pixels=np.empty((N,N,4),np.float32)
pixels[:,:,:3]=colors[index];pixels[:,:,:3]=np.where(edge[:,:,None],np.array([.36,.365,.34]),pixels[:,:,:3]);pixels[:,:,3]=1
tex=bpy.data.images.new('StoneTile_512',width=N,height=N,alpha=False)
tex.pixels.foreach_set(pixels.ravel());tex.file_format='PNG';tex.pack()
tn=M['stone'].node_tree.nodes.new('ShaderNodeTexImage');tn.image=tex;tn.extension='REPEAT'
M['stone'].node_tree.links.new(tn.outputs['Color'],M['stone'].node_tree.nodes['Principled BSDF'].inputs['Base Color'])

root=bpy.data.objects.new('RestHouse_Root',None);scene.collection.objects.link(root)
root['units']='metres';root['interior_axis_glTF']='+Z';root['up_axis_glTF']='+Y'
root['entrance_origin']='centre of front gate at ground level'
root['dimensions_are_estimated']=True;root['site_width_m']=40.;root['site_depth_m']=48.8
root['gate_opening_m']=5.2;root['gate_state']='open';root['ground_height_m']=0.
root['scope']='Exterior only; fixed features, no vehicles or people'
root['reference']='User supplied aerial photos IMG_6743..6747 and DJI video'

class Batch:
    def __init__(self,name,mat):self.name=name;self.mat=mat;self.v=[];self.f=[];self.c=[];self.uv=[]
    def add(self,v,f,color='e7e9e1',uv=None):
        i=len(self.v);self.v.extend(v);self.f.extend([tuple(i+j for j in q) for q in f]);self.c.extend([rgb(color)]*len(v))
        self.uv.extend(uv or [(q[0]/1.7,q[1]/1.7) for q in v])
    def finish(self):
        me=bpy.data.meshes.new(self.name+'_Mesh');me.from_pydata(self.v,[],self.f);me.update()
        o=bpy.data.objects.new(self.name,me);scene.collection.objects.link(o);o.parent=root;me.materials.append(M[self.mat])
        if self.mat=='stone':
            uv=me.uv_layers.new(name='UVMap')
            for l in me.loops:uv.data[l.index].uv=self.uv[l.vertex_index]
        else:
            a=me.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
            for l in me.loops:a.data[l.index].color=self.c[l.vertex_index]
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
        return o
B={name:Batch('RH_'+name,mat) for name,mat in [
 ('Ground','solid'),('Paving','stone'),('Walls','solid'),('Roofs','solid'),('Terraces','stone'),
 ('WindowFrames','metal'),('Glass','glass'),('BlueRailings','metal'),('DoorPanels','metal'),
 ('Tent','solid'),('Pergola','solid'),('Basins','solid'),('TreeTrunks','solid'),('Foliage','foliage'),
 ('RoofTanks','solid'),('Gate_Left','metal'),('Gate_Right','metal')
]}
collision=[]
def P(u,v,z=0):return ((u-63)*.4,(v-122)*.4,z)
def collider(name,center,size,angle=0,kind='box'):
    collision.append({'name':name,'shape':kind,'center':[round(center[0],5),round(center[2],5),round(-center[1],5)],'size':[round(size[0],5),round(size[2],5),round(size[1],5)],'rotationY':angle})
def box(g,loc,size,color='e6e9e2',rot=0,collide=None):
    x,y,z=[s/2 for s in size];cx,cy,cz=loc
    v=[(cx+a*x*cos(rot)-b*y*sin(rot),cy+a*x*sin(rot)+b*y*cos(rot),cz+c*z) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    B[g].add(v,[(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],color)
    if collide:collider(collide,loc,size,rot)
def rectbox(g,u0,v0,u1,v1,z,h,color='e6e9e2',collide=None):
    box(g,P((u0+u1)/2,(v0+v1)/2,z+h/2),((u1-u0)*.4,(v1-v0)*.4,h),color,collide=collide)
def beam(g,a,b,r,color='476e76',sides=4):
    a,b=Vector(a),Vector(b);t=(b-a).normalized();ref=Vector((0,0,1)) if abs(t.z)<.9 else Vector((1,0,0))
    u=t.cross(ref).normalized();w=t.cross(u);v=[]
    for p in [a,b]:
        for k in range(sides):v.append(tuple(p+r*(u*cos(2*pi*k/sides)+w*sin(2*pi*k/sides))))
    f=[tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))]
    f.extend((k,(k+1)%sides,(k+1)%sides+sides,k+sides) for k in range(sides));B[g].add(v,f,color)
def cyl(g,loc,r,h,col='e1e7e3',segments=12,axis='Z'):
    v=[]
    for z in [-h/2,h/2]:
        for i in range(segments):
            a=i*2*pi/segments;q=(r*cos(a),r*sin(a),z)
            if axis=='X':q=(z,r*cos(a),r*sin(a))
            v.append(tuple(loc[j]+q[j] for j in range(3)))
    f=[tuple(range(segments-1,-1,-1)),tuple(range(segments,2*segments))]
    f.extend((i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments));B[g].add(v,f,col)
def slab(g,points,z,h,col='e6e9e2'):
    q=[P(*p,z) for p in points];n=len(q);v=q+[(x,y,z+h) for x,y,_ in q]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    B[g].add(v,f,col)
def pane(u,v,z,w,h,side='front',door=False):
    # Single opaque facade panel; no interior is required.
    p=Vector(P(u,v,z+h/2));horizontal=Vector((1,0,0)) if side=='front' else Vector((0,1,0));normal=Vector((0,1,0)) if side=='front' else Vector((-1,0,0))
    p+=normal*.023
    size=(w,.055,h) if side=='front' else (.055,w,h)
    box('DoorPanels' if door else 'Glass',p,size,'273334' if door else '324749')
    for dz in [-h/2,h/2]:
        a=p+Vector((0,0,dz))-horizontal*(w/2+.035);b=p+Vector((0,0,dz))+horizontal*(w/2+.035)
        beam('WindowFrames',a,b,.035,'303b3e',4)
    for dx in [-w/2,w/2]:beam('WindowFrames',p+horizontal*dx-Vector((0,0,h/2)),p+horizontal*dx+Vector((0,0,h/2)),.035,'303b3e',4)
    if not door:
        beam('WindowFrames',p-Vector((0,0,h/2)),p+Vector((0,0,h/2)),.027,'303b3e',4)
    else:
        a=p+normal*.05+horizontal*(w*.32)
        beam('WindowFrames',a-Vector((0,0,.12)),a+Vector((0,0,.12)),.025,'a9aeaa',6)
def rail(a,b,z=.65):
    a,b=Vector(a),Vector(b);L=(b-a).length;n=max(1,round(L/.9))
    for dz in [0,z]:beam('BlueRailings',a+Vector((0,0,dz)),b+Vector((0,0,dz)),.032)
    for i in range(n+1):
        p=a+(b-a)*i/n;beam('BlueRailings',p,p+Vector((0,0,z)),.032)
    for i in range(n):
        p=a+(b-a)*i/n;q=a+(b-a)*(i+1)/n
        beam('BlueRailings',p,q+Vector((0,0,z)),.020)
        beam('BlueRailings',p+Vector((0,0,z)),q,.020)

# Ground plane and external entry apron. The visual paving is only 12mm high.
rectbox('Ground',0,0,100,122,-.18,.18,'b99875')
rectbox('Ground',54.5,122,71.5,138,-.18,.18,'b99875')

# Outer white enclosure. The entrance gap is truly open, not a dark decal.
rectbox('Walls',0,0,100,.65,0,2.65,collide='wall_back')
rectbox('Walls',0,.65,.65,122,0,2.65,collide='wall_left')
rectbox('Walls',99.35,.65,100,122,0,2.65,collide='wall_right')
rectbox('Walls',.65,121.35,56.5,122,0,2.65,collide='wall_front_left')
rectbox('Walls',69.5,121.35,99.35,122,0,2.65,collide='wall_front_right')
for u in [56.05,69.95]:rectbox('Walls',u-.45,120.95,u+.45,122.15,0,2.83,collide='gate_pillar')

# Architectural masses match the approved diagram; dimensions remain estimated.
def building(u0,v0,u1,v1,height,name):
    rectbox('Walls',u0,v0,u1,v1,0,height,'e7eae3',name)
    rectbox('Roofs',u0-.07,v0-.07,u1+.07,v1+.07,height,.095,'afb3ae')
building(2,2,43,13,3.12,'rear_long_block')
building(2,13,12,20,3.12,'rear_long_return')
for u in [15,25,34,40.5]:pane(u,13,.025,.92,2.2,door=True)
for u in [20,30]:pane(u,13,1.30,.95,.60)
pane(7,20,.025,.98,2.15,door=True)
building(71,2,98,14,3.10,'rear_right_block')
pane(84,14,.50,2.5,1.75)
building(70,20,98,53,3.72,'main_building')
pane(70,29,.30,3.5,2.95,'left');pane(70,43,.30,3.5,2.95,'left')
for u in [83,95]:pane(u,53,1.90,.52,.82)
# Elevated main terrace, stairs and the small back niche.
rectbox('Terraces',58.5,19,70,54,0,.21,'ffffff',collide='main_terrace')
for i in range(3):rectbox('Terraces',55-i*.85,20,55.85-i*.85,51,0,.07*(3-i),collide='terrace_step_'+str(i))
for u0,v0,u1,v1 in [(48,7,48.6,15),(61,7,61.6,15),(48,7,61.6,7.6)]:rectbox('Walls',u0,v0,u1,v1,0,.70)
rectbox('Terraces',48.6,7.6,61,15,0,.12)
# Low rail and arch wall at the front of the terrace. Arch remains pedestrian.
rectbox('Walls',58,54,70,54.55,.21,.7)
rail(P(58,54.25,.91),P(70,54.25,.91),.45)
rectbox('Walls',64,57,99.2,57.6,0,2.55,collide='main_front_wall')
rectbox('Walls',55.3,57,57,57.6,0,2.55,collide='arch_left')
rectbox('Walls',61,57,64,57.6,0,2.55,collide='arch_right')
# Arc above the 1.6m pedestrian opening. Car access is through the open yard left of it.
arc=[]
for i in range(13):
    a=pi-i*pi/12;arc.append((.8*cos(a),1.70+.8*sin(a)))
cx,cy,_=P(59,57.3)
for i in range(12):
    x0,z0=arc[i];x1,z1=arc[i+1]
    vv=[(cx+x0,cy-.12,z0),(cx+x1,cy-.12,z1),(cx+x1,cy-.12,2.58),(cx+x0,cy-.12,2.58)]
    vv+= [(x,y+.24,z) for x,y,z in vv]
    B['Walls'].add(vv,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)])
rail(P(64,57.3,2.55),P(70,57.3,2.55),.45)

# Front-left L shaped small block with low roof parapet and blue rail.
building(23,101,46,113,3.0,'front_left_main')
building(23,113,34,120,3.0,'front_left_return')
pane(28,120,.68,2.2,1.50)
pane(40,113,.04,.95,2.14,door=True)
pane(35.8,113,.66,1.15,1.52)
for a,b in [((23,101),(46,101)),((46,101),(46,113)),((23,101),(23,120))]:
    aa,bb=P(*a,3.03),P(*b,3.03);beam('Walls',aa,bb,.14,'e8ebe4',4)
rail(P(24,101,3.14),P(45,101,3.14),.42)
rail(P(23,102,3.14),P(23,117,3.14),.42)

# Small front-right block; uncertain footprint simplified as shown in the concept.
building(89,96,99,114,3.12,'front_right_block')
pane(89,108,.72,1.6,1.4,'left')
pane(89,99,.025,.95,2.15,'left',True)
rail(P(89,96,3.23),P(89,104,3.23),.48)
rectbox('Terraces',84.5,96,89,114,0,.12,collide='right_terrace')

# Open entrance leaves, hinged outside the swept vehicle lane.
for name,hinge,angle,sign in [('Gate_Left',(-2.6,.01,0),math.radians(110),1),('Gate_Right',(2.6,.01,0),math.radians(-110),-1)]:
    w=2.48;cent=(hinge[0]+sign*w/2*cos(angle),hinge[1]+sign*w/2*sin(angle),1.30)
    box(name,cent,(w,.10,2.45),'26302f',angle,collide=name)
    for z in [.20,.42,2.18,2.48]:box(name,(cent[0],cent[1],z),(w,.155,.048),'47504b',angle)
    for f in [-.46,.46]:
        cc=(cent[0]+f*w*cos(angle),cent[1]+f*w*sin(angle),1.30)
        box(name,cc,(.05,.155,2.35),'47504b',angle)

# Paving: non-overlapping rectangular coverage plus one continuous curved path.
areas=[(54,15,70,58),(2,13,70,21),(12,20,16,61),(13,54,56,58),
       (2,59,99,63),(57,58,69,138),(2,95,57,100),(19,90,24,122),
       (24,97,57,122),(2,112,24,122),(69,111,99,116),(87,80,99,116),(23,63,25,79)]
xs=sorted(set(a[i] for a in areas for i in (0,2)));ys=sorted(set(a[i] for a in areas for i in (1,3)))
for x0,x1 in zip(xs,xs[1:]):
    for y0,y1 in zip(ys,ys[1:]):
        x=(x0+x1)/2;y=(y0+y1)/2
        if any(a<=x<=c and b<=y<=d for a,b,c,d in areas):
            B['Paving'].add([P(x0,y0,.012),P(x1,y0,.012),P(x1,y1,.012),P(x0,y1,.012)],[(0,1,2,3)])
curve=[]
for i in range(19):
    t=i/18
    u=(1-t)**3*21+3*(1-t)**2*t*31+3*(1-t)*t*t*37+t**3*59
    v=(1-t)**3*81+3*(1-t)**2*t*72+3*(1-t)*t*t*73+t**3*81
    curve.append(Vector(P(u,v,.021)))
for i in range(len(curve)-1):
    a,b=curve[i:i+2];t=(b-a).normalized();n=Vector((-t.y,t.x,0))*.76
    B['Paving'].add([tuple(a-n),tuple(b-n),tuple(b+n),tuple(a+n)],[(0,1,2,3)])

# Beige hipped tent, striped exterior walls and inexpensive opaque doorway.
u0,v0,u1,v1=74,64,94,80
rectbox('Tent',u0,v0,u1,v1,0,2.22,'8f8978','tent_body')
for z,h,col in [(.18,.22,'444642'),(.68,.19,'434541'),(1.12,.17,'55574e'),(1.69,.17,'626256'),(2.07,.13,'a9a48e')]:
    rectbox('Tent',u0-.015,v0-.015,u1+.015,v1+.015,z,h,col)
corners=[P(u0-.4,v0-.4,2.25),P(u1+.4,v0-.4,2.25),P(u1+.4,v1+.4,2.25),P(u0-.4,v1+.4,2.25)]
ridge=[P(84,69,3.94),P(84,75,3.94)]
B['Tent'].add(corners+ridge,[(0,1,4),(1,2,5,4),(2,3,5),(3,0,4,5),(3,2,1,0)],'d6c59f')
for u in [81.8,86.2]:pane(u,80,.025,1.58,2.16,door=True)
for u in [79.6,84,88.4]:beam('Tent',P(u,80.1,.05),P(u,80.1,2.3),.04,'ddd7c5',4)
rectbox('Tent',81.6,71,82.6,72,3.42,.75,'e0dccb')
# Four flat rug silhouettes: palette only, no extra texture or material.
for u in [77,82.7]:
    for v in [84,89.7]:
        rectbox('Tent',u,v,u+4.8,v+4.8,.012,.01,'544e47')
        rectbox('Tent',u+.25,v+.25,u+4.55,v+4.55,.023,.006,'beb5a0')
        rectbox('Tent',u+.48,v+.48,u+4.32,v+4.32,.030,.004,'817c6f')
        cx,cy,_=P(u+2.4,v+2.4);r=.36
        B['Tent'].add([(cx,cy-r,.037),(cx+r,cy,.037),(cx,cy+r,.037),(cx-r,cy,.037)],[(0,1,2,3)],'56534c')

# White open pergola; only the metal frame and a low sitting edge are included.
rectbox('Terraces',7,78,21,92,0,.11)
for u0,v0,u1,v1 in [(7,78,7.55,92),(20.45,78,21,92),(7,91.45,21,92)]:
    rectbox('Pergola',u0,v0,u1,v1,.11,.55,'e4e8de',collide='pergola_low_wall')
for u in [7.3,20.7]:
    for v in [78.3,85,91.7]:beam('Pergola',P(u,v,.1),P(u,v,2.65),.045,'eceee5',4)
for u in [7.3,10.6,14,17.4,20.7]:beam('Pergola',P(u,78.3,2.65),P(u,91.7,2.65),.045,'e6eae2',4)
for v in [78.3,82.7,87.3,91.7]:beam('Pergola',P(7.3,v,2.65),P(20.7,v,2.65),.045,'e6eae2',4)

# Empty square basin and two circular bowls, keeping the recognisable garden layout.
rectbox('Basins',29.2,82.2,39.8,92.8,.005,.06,'9e9d8d')
for u0,v0,u1,v1 in [(29,82,40,82.8),(29,92.2,40,93),(29,82.8,29.8,92.2),(39.2,82.8,40,92.2)]:
    rectbox('Basins',u0,v0,u1,v1,0,.47,'d9d8c9','basin_square_wall')
# Low green screening visible around part of the basin, simplified without alpha.
for a,b in [((28.1,81.2),(41,81.2)),((41,81.2),(41,94)),((29,94),(41,94))]:
    aa,bb=Vector(P(*a,.28)),Vector(P(*b,.28));beam('Basins',aa,bb,.065,'34675e',4)
    aa.z=.15;bb.z=.15;beam('Basins',aa,bb,.10,'34675e',4)
def circular_basin(u,v,r):
    loc=P(u,v);N=24;verts=[]
    for radius,z in [(r,.03),(r,.22),(r-.12,.22),(r-.12,.06)]:
        verts.extend((loc[0]+radius*cos(2*pi*i/N),loc[1]+radius*sin(2*pi*i/N),z) for i in range(N))
    faces=[]
    for j in range(3):faces.extend((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for i in range(N))
    B['Basins'].add(verts,faces,'d6d8c8');cyl('Basins',(loc[0],loc[1],.037),r-.12,.04,'969d8a',24)
    collider('circular_basin',(loc[0],loc[1],.13),(r*2,r*2,.26),kind='cylinder')
circular_basin(35,68,1.2);circular_basin(48,89,1.35)
for (u0,v0),(u1,v1) in [((37,70),(39.7,74.1)),((44.2,83),(46,86.6))]:
    a,b=Vector(P(u0,v0,.045)),Vector(P(u1,v1,.045));t=(b-a).normalized();n=Vector((-t.y,t.x,0))*.26
    B['Basins'].add([tuple(a-n),tuple(b-n),tuple(b+n),tuple(a+n)],[(0,1,2,3)],'b1b29f')
    for s in [-1,1]:beam('Basins',a+n*s+Vector((0,0,.08)),b+n*s+Vector((0,0,.08)),.07,'d6d8c8',4)

# Low-poly olive-like trees: opaque solid crowns, no alpha cards.
phi=(1+math.sqrt(5))/2
ico=[(-1,phi,0),(1,phi,0),(-1,-phi,0),(1,-phi,0),(0,-1,phi),(0,1,phi),(0,-1,-phi),(0,1,-phi),(phi,0,-1),(phi,0,1),(-phi,0,-1),(-phi,0,1)]
ico=[Vector(p).normalized() for p in ico]
icof=[(0,11,5),(0,5,1),(0,1,7),(0,7,10),(0,10,11),(1,5,9),(5,11,4),(11,10,2),(10,7,6),(7,1,8),(3,9,4),(3,4,2),(3,2,6),(3,6,8),(3,8,9),(4,9,5),(2,4,11),(6,2,10),(8,6,7),(9,8,1)]
def ellipsoid(loc,size,col):
    B['Foliage'].add([tuple(loc[j]+v[j]*size[j] for j in range(3)) for v in ico],icof,col)
route_xz=[(0,-5.5),(0,19.5),(-6.,23.5),(-10.5,28.5),(-13.,35.5),(-8.,38.),(-7.3,34.),(-7.3,29.),(-10.5,28.5),(-6.,23.5),(0,19.5),(0,-5.5)]
def distance_to_route(x,z):
    point=Vector((x,z));best=1e9
    # Preserve the authored planting layout across later route refinements.
    planting_clearance=[(0,-5.5),(0,19.5),(-5.,24),(-10.5,28.5),(-13,35.5),(-8,38),(-5.5,34),(-5.8,28),(0,19.5),(0,-5.5)]
    for a,b in zip(planting_clearance,planting_clearance[1:]):
        a,b=Vector(a),Vector(b);t=max(0,min(1,(point-a).dot(b-a)/(b-a).length_squared));best=min(best,(point-(a+(b-a)*t)).length)
    return best
trees=[(19,24),(27,24),(36,24),(45,24),(49,31),(49,44),(19,38),(19,49),(30,56),(41,56),(52,56),
 (6,26),(7,49),(8,62),(17,62),(39,63),(53,64),(51,96),(6,104),(9,109),(7,69),(18,68),(30,64),(45,65),(53,71),(49,94),(18,93),(6,94),
 (71,68),(71,80),(72,96),(77,99),(84,100),(95,82),(95,87),(87,105),(79,61),(89,61),(5,117)]
tree_count=0
for u,v in trees:
    x,y,_=P(u,v)
    # Keep the gameplay route clear of crowns as well as trunks.
    if distance_to_route(x,-y)<3.05:continue
    h=random.uniform(2.25,3.45);r=random.uniform(.60,.88)
    beam('TreeTrunks',(x,y,.02),(x+.05,y,h*.78),.08,'776751',6)
    for dx,dy,dz,col in [(-.28,0,.75,'697e57'),(.25,.13,.88,'718661'),(0,-.2,1.,'82926b')]:
        branch=(x+dx,y+dy,h*dz)
        beam('TreeTrunks',(x,y,h*.48),branch,.035,'776751',5)
        ellipsoid(branch,(r,r*.82,r*1.07),col)
    collider('tree_trunk',(x,y,h*.40),(.20,.20,h*.80),kind='cylinder');tree_count+=1
for u,v in [(72,84),(72,89),(72,94),(77,98),(82,99),(86,99),(96,83),(96,87),(96,91),(8,94),(12,94),(17,94)]:
    x,y,_=P(u,v);ellipsoid((x,y,.43),(.60,.45,.54),'5e7955')

# Three simple horizontal water tanks, visible in the supplied images.
for u,v,z in [(28,117,3.35),(92,24,4.03),(97,111,3.48)]:
    x,y,_=P(u,v)
    cyl('RoofTanks',(x,y,z+.30),.42,1.20,'dce8e3',12,'X')
    for dx in [-.50,.50]:cyl('RoofTanks',(x+dx,y,z+.30),.43,.045,'cadbd5',12,'X')
    for dx in [-.40,.40]:box('RoofTanks',(x+dx,y,z-.07),(.15,.55,.22),'dce6df')
    cyl('RoofTanks',(x,y,z+.735),.11,.08,'b4cec4',8)

objects={k:b.finish() for k,b in B.items() if b.v}
# Reduce coplanar paving subdivisions and remove duplicate vertices.
for key in ['Paving','Terraces']:
    o=objects[key];bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),use_dissolve_boundaries=False,delimit={'UV'})
    bm.to_mesh(o.data);bm.free();o.data.update()
# Restrained edge treatment only on masonry and roof volumes.
for key in ['Walls','Roofs']:
    o=objects[key];bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Small finished masonry edges','BEVEL');mod.width=.022;mod.segments=1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=o.modifiers.new('Surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
# Centre gate origins on their actual hinges, preserving the open state.
for key,x,angle in [('Gate_Left',-2.6,math.radians(110)),('Gate_Right',2.6,math.radians(-110))]:
    o=objects[key]
    for vertex in o.data.vertices:
        p=vertex.co-Vector((x,.01,0));vertex.co=(p.x*cos(-angle)-p.y*sin(-angle),p.x*sin(-angle)+p.y*cos(-angle),p.z)
    o.location=(x,.01,0);o.rotation_euler.z=angle;o['open_angle_degrees']=110.;o['state']='open'
for name,loc in [('RH_Entrance',(0,0,0)),('RH_CarSpawn',(0,5.5,0))]:
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=root;o.location=loc;o.empty_display_size=.25
for o in objects.values():
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bad=[f for f in bm.faces if f.calc_area()<1e-10]
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(o.data);bm.free();o.data.update()
root['collision_boxes_json']=json.dumps(collision,separators=(',',':'))
root['suggested_route_glTF']=json.dumps([[x,0,z] for x,z in route_xz],separators=(',',':'))
root['driving_surface']='Ground y=0 in GLB; paving visual offset 0.012-0.021m'
root['collision_note']='Optional external physics definitions; GLB alone does not activate collisions'

# Temporary inspection camera and neutral day lighting, removed before final export.
world=bpy.data.worlds.new('Inspection_Daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.55,.63,.72,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
cd=bpy.data.cameras.new('Temporary_Camera');cam=bpy.data.objects.new('Temporary_Camera',cd);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(44,44,51);target=Vector((-5.2,-22,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
cd.type='ORTHO';cd.ortho_scale=76
ld=bpy.data.lights.new('Temporary_Sun','SUN');ld.energy=2.7;ld.angle=math.radians(20)
lo=bpy.data.objects.new('Temporary_Sun',ld);scene.collection.objects.link(lo);lo.rotation_euler=(.45,-.55,-.45)
ld=bpy.data.lights.new('Temporary_Fill','AREA');ld.energy=2200;ld.shape='DISK';ld.size=45
lo=bpy.data.objects.new('Temporary_Fill',ld);scene.collection.objects.link(lo);lo.location=(-28,-10,26);lo.rotation_euler=(Vector((-5,-24,0))-lo.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE';scene.view_settings.view_transform='Khronos PBR Neutral'
scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.eevee.taa_render_samples=16;scene.eevee.use_raytracing=False;scene.eevee.use_fast_gi=False
for o in scene.objects:
    if o.type=='LIGHT' and hasattr(o.data,'use_shadow_jitter'):o.data.use_shadow_jitter=False
for o in scene.objects:o.select_set(False)
root.select_set(True);bpy.context.view_layer.objects.active=root
triangles=0
for o in objects.values():o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
result={'triangles':triangles,'mesh_objects':len(objects),'materials':len(M),'trees':tree_count,'site_dimensions_estimated_m':[40,48.8],'gate_clear_width_m':5.2,'colliders':len(collision),'texture':[512,512], 'root':'RestHouse_Root'}
