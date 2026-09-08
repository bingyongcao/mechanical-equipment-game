import bpy, math, json, os
from mathutils import Vector
OUT = r"D:/repos/mechanical-equipment-game/assets/excavator"
os.makedirs(OUT, exist_ok=True)
scene = bpy.data.scenes.new("Excavator_Studio")
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
asset = bpy.data.collections.new("EXCAVATOR")
scene.collection.children.link(asset)
studio = bpy.data.collections.new("STUDIO")
scene.collection.children.link(studio)
collision = bpy.data.collections.new("COLLISION_PROXIES")
scene.collection.children.link(collision)
def move_to(o, coll=asset):
    for c in list(o.users_collection): c.objects.unlink(o)
    coll.objects.link(o)
def mat(name, color, metal=0, rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value=(*color,1)
    p.inputs["Metallic"].default_value=metal; p.inputs["Roughness"].default_value=rough
    return m
yellow=mat("Paint | construction yellow",(.95,.49,.018),.32,.32)
dark=mat("Steel | charcoal",(.045,.055,.062),.65,.39)
trackmat=mat("Tracks | worn manganese steel",(.11,.125,.135),.75,.48)
rubber=mat("Rubber | seals",(.018,.024,.028),0,.68)
chrome=mat("Hydraulics | polished chrome",(.56,.65,.70),.95,.19)
glass=mat("Cab | blue tinted glass",(.055,.16,.22),.25,.14)
p=glass.node_tree.nodes.get("Principled BSDF")
p.inputs["Transmission Weight"].default_value=.32
p.inputs["IOR"].default_value=1.45
lightmat=mat("Lamp | lens",(.9,.94,1),.1,.18)
p=lightmat.node_tree.nodes.get("Principled BSDF");p.inputs["Emission Color"].default_value=(.8,.9,1,1);p.inputs["Emission Strength"].default_value=.5
orange=mat("Safety | amber", (1,.19,.01),.15,.23)
seatmat=mat("Cab | seat fabric",(.065,.085,.10),0,.9)
def finish(o,name,m,parent=None,bevel=0):
    o.name=name;move_to(o)
    if m:o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new("Edge highlights","BEVEL");mod.width=bevel;mod.segments=2
        mod=o.modifiers.new("Weighted corner normals","WEIGHTED_NORMAL")
    if parent:
        w=o.matrix_world.copy();o.parent=parent;o.matrix_world=w
    return o
def empty(name,pos,parent=None):
    o=bpy.data.objects.new(name,None);asset.objects.link(o);o.location=pos
    o.empty_display_type='PLAIN_AXES';o.empty_display_size=.15
    if parent:
        bpy.context.view_layer.update(); w=o.matrix_world.copy();o.parent=parent;o.matrix_world=w
    return o
def box(name,pos,size,m,parent=None,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object
    o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,m,parent,bevel)
def cyl(name,a,b,r,m,parent=None,vertices=24):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return finish(o,name,m,parent,.008)
def prism(name,outline,y0,y1,m,parent=None,bevel=.02):
    n=len(outline);verts=[(x,y,z) for y in (y0,y1) for x,z in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);asset.objects.link(o)
    import bmesh
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
    return finish(o,name,m,parent,bevel)
root=empty("Excavator_ROOT",(0,0,0));root["units"]="meters";root["forward_axis"]="+X";root["up_axis"]="+Z"
base=empty("J_Base",(0,0,0),root)
upper=empty("J_Slew",(0,0,1.22),base)
boom=empty("J_Boom",(.62,0,1.78),upper)
stick=empty("J_Stick",(3.05,0,4.12),boom)
bucket=empty("J_Bucket",(4.5,0,1.47),stick)
for o,label,axis,limits in [(upper,"回转平台","Z",[-180,180]),(boom,"动臂","Y",[-25,45]),(stick,"斗杆","Y",[-65,50]),(bucket,"铲斗","Y",[-65,65])]:
    o["part_label"]=label;o["joint_axis_blender"]=axis;o["limits_deg_relative_rest"]=limits
box("Undercarriage bridge",(0,0,.62),(2.9,1.85,.48),dark,base,.09)
for side in (-1,1):
    y=side*1.05
    box("Track frame "+str(side),(0,y,.57),(3.5,.52,.46),dark,base,.12)
    # Stadium-shaped path, with rigid individual grouser shoes.
    L=1.47;R=.47;cz=.58
    perimeter=4*L+2*math.pi*R;N=54
    for i in range(N):
        s=i*perimeter/N
        if s<2*L:x=-L+s;z=cz+R;ang=0
        elif s<2*L+math.pi*R:
            t=(s-2*L)/R;x=L+R*math.sin(t);z=cz+R*math.cos(t);ang=-t
        elif s<4*L+math.pi*R:
            t=s-(2*L+math.pi*R);x=L-t;z=cz-R;ang=math.pi
        else:
            t=(s-(4*L+math.pi*R))/R;x=-L-R*math.sin(t);z=cz-R*math.cos(t);ang=math.pi-t
        shoe=box("Track_%s_shoe_%02d"%(side,i),(x,y,z),(.18,.68,.095),trackmat,base,.01)
        shoe.rotation_euler[1]=-ang
        # raised grouser rotated with shoe
        rib=box("Track_%s_grouser_%02d"%(side,i),(x,y,z),(.045,.70,.042),dark,None,.005)
        rib.parent=shoe;rib.location=(0,0,.066);rib.rotation_euler=(0,0,0)
    for j,x in enumerate([-1.47,-.93,-.31,.31,.93,1.47]):
        rr=.39 if j in (0,5) else .27
        cyl("Track wheel",(x,y-.255,.57),(x,y+.255,.57),rr,dark,base,32)
        yy=y+side*.29
        cyl("Wheel hub",(x,yy,.57),(x,yy+side*.035,.57),rr*.68,yellow,base,24)
        cyl("Wheel axle",(x,yy+side*.035,.57),(x,yy+side*.06,.57),.085,chrome,base,16)
        for k in range(6):
            t=k*math.tau/6
            xx=x+rr*.43*math.cos(t);zz=.57+rr*.43*math.sin(t)
            cyl("Wheel bolt",(xx,yy+side*.036,zz),(xx,yy+side*.052,zz),.021,dark,base,6)
cyl("Slew bearing",(0,0,1.03),(0,0,1.31),.78,dark,base,64)
cyl("Slew upper ring",(0,0,1.25),(0,0,1.38),.84,trackmat,upper,64)
box("Upper chassis",(-.22,0,1.48),(3.4,2.15,.28),yellow,upper,.09)
prism("Counterweight",[(-1.95,1.54),(-1.97,2.12),(-1.72,2.39),(-.80,2.39),(-.68,1.54)],-1.04,1.04,yellow,upper,.13)
box("Engine hood",(-.64,.58,2.06),(1.65,.91,.94),yellow,upper,.12)
box("Engine access panel",(-.7,1.048,2.04),(1.12,.025,.59),dark,upper,.025)
for i in range(10):
    box("Engine vent",(-1.18+i*.105,1.07,2.04),(.037,.022,.47),trackmat,upper,.006)
box("Rear bumper",(-1.99,0,1.57),(.12,2.03,.14),dark,upper,.03)
cyl("Exhaust",(-1.13,.64,2.49),(-1.13,.64,2.98),.065,dark,upper)
cyl("Exhaust cap",(-1.13,.64,2.98),(-1.22,.64,3.05),.067,dark,upper)
print("Base and undercarriage complete",len(asset.objects))

