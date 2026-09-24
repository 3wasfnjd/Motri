"""Geometric clearance of a 5.2 x 2.24 metre vehicle along the suggested route.
This is a static swept-body test, not an in-game physics/turning-radius test.
"""
import bpy,json,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=bpy.data.objects['RestHouse_Root']
colliders=json.loads(root['collision_boxes_json'])
route=json.loads(root['suggested_route_glTF'])
def corners(x,z,w,l,a):
    c=math.cos(a);s=math.sin(a)
    return [(x+dx*c+dz*s,z-dx*s+dz*c) for dx,dz in [(-w/2,-l/2),(w/2,-l/2),(w/2,l/2),(-w/2,l/2)]]
def intersect(A,B):
    for points in (A,B):
        for i in range(2):
            p,q=points[i],points[i+1];ax,az=q[1]-p[1],p[0]-q[0]
            aa=[x*ax+z*az for x,z in A];bb=[x*ax+z*az for x,z in B]
            if max(aa)<=min(bb)+1e-7 or max(bb)<=min(aa)+1e-7:return False
    return True
hits=[];samples=0;poses=[]
for si,(a,b) in enumerate(zip(route,route[1:])):
    dx,dz=b[0]-a[0],b[2]-a[2];length=math.hypot(dx,dz);angle=math.atan2(dx,dz)
    count=max(1,math.ceil(length/.2))
    for i in range(count+1):
        t=i/count;x=a[0]+t*dx;z=a[2]+t*dz;body=corners(x,z,2.24,5.2,angle);samples+=1;poses.append((x,z,angle))
        for ob in colliders:
            cx,cy,cz=ob['center'];w,h,l=ob['size']
            if cy+h/2<=.04 or cy-h/2>=2.05:continue
            if intersect(body,corners(cx,cz,w,l,ob['rotationY'])):
                hits.append({'segment':si,'t':round(t,3),'object':ob['name']})
                break
# Test the exported shape's surfaces too, including foliage overhangs.
bpy.context.view_layer.update();vv=[];ff=[];owners=[]
for ob in bpy.context.scene.objects:
    if ob.type!='MESH' or ob.name in ['RH_Ground','RH_Paving']:continue
    offset=len(vv);vv.extend(tuple(ob.matrix_world@v.co) for v in ob.data.vertices)
    ob.data.calc_loop_triangles();ff.extend(tuple(offset+i for i in t.vertices) for t in ob.data.loop_triangles);owners.extend([ob.name]*len(ob.data.loop_triangles))
static=BVHTree.FromPolygons(vv,ff,all_triangles=True)
for p in route[1:-1]:
    for degrees in range(0,360,20):poses.append((p[0],p[2],math.radians(degrees)))
geometry_hits=[];geometry_details=[]
for i,(x,z,angle) in enumerate(poses):
    points=corners(x,z,2.24,5.2,angle)
    verts=[(px,-pz,h) for h in [.06,2.05] for px,pz in points]
    faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    body=BVHTree.FromPolygons(verts,faces)
    overlap=static.overlap(body)
    if overlap:
        geometry_hits.append(i)
        geometry_details.append({'pose':i,'position':[x,z],'angle':angle,'objects':sorted(set(owners[a] for a,b in overlap))})
triangles=0;zero=0;mods=[];bad_scales=[];names=[]
for ob in bpy.context.scene.objects:
    if ob.type!='MESH' or not ob.name.startswith('RH_'):continue
    names.append(ob.name);ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
    zero+=sum(t.area<1e-12 for t in ob.data.loop_triangles)
    if ob.modifiers:mods.append(ob.name)
    if any(abs(v-1)>1e-6 for v in ob.scale):bad_scales.append(ob.name)
gate={}
for name in ['RH_Gate_Left','RH_Gate_Right']:
    ob=bpy.data.objects[name]
    pts=[ob.matrix_world@Vector(c) for c in ob.bound_box]
    gate[name]={'blender_hinge':list(ob.location),'open_angle_degrees':math.degrees(ob.rotation_euler.z),'world_x_min':min(p.x for p in pts),'world_x_max':max(p.x for p in pts)}
result={'triangles':triangles,'mesh_objects':len(names),'names':names,'zero_area_triangles':zero,'modifiers':mods,'nonunit_scales':bad_scales,'vehicle_envelope_m':{'length':5.2,'width':2.24,'height':2.05},'route_samples':samples,'route_clearance':'PASS' if not hits else 'FAIL','collisions':hits[:25],'collision_sample_count':len(hits),'mesh_clearance_poses':len(poses),'mesh_clearance':'PASS' if not geometry_hits else 'FAIL','mesh_hits':geometry_details[:60],'gate':gate,'limitations':['Static sampled envelope only; not Motri2 runtime physics.','Route is a clearance example, not a steering-feasible AI trajectory.','All real-site dimensions are estimated.']}
