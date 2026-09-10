"""Run in Blender through MCP. Original generic 3-axle sand-hauling truck."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

OUT = Path('D:/repos/mechanical-equipment-game/assets/dump-truck')
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('DumpTruck_Studio')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

def mat(name, color, metal=0, rough=.5):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m

ochre=mat('DT_Safety ochre',(.82,.39,.055),.22)
bedmat=mat('DT_Sage steel',(.27,.38,.32),.45)
dark=mat('DT_Chassis graphite',(.055,.073,.077),.45)
rubber=mat('DT_Tire rubber',(.024,.03,.035),0,.88)
steel=mat('DT_Brushed steel',(.49,.55,.55),.75,.3)
glass=mat('DT_Blue glazing',(.075,.18,.23),.35,.2)
lamp=mat('DT_Headlight ivory',(.91,.9,.72),.1,.25)
red=mat('DT_Tail lamps',(.65,.045,.025),.15,.25)
root=bpy.data.objects.new('DumpTruck',None); scene.collection.objects.link(root)
root['units']='meters'; root['vehicle_type']='generic three axle dump truck'
objects=[]; colliders=[]

def empty(name,location,parent):
    o=bpy.data.objects.new(name,None); scene.collection.objects.link(o)
    o.location=location; o.parent=parent; return o

bed=empty('J_Tipper',(-3,0,1.38),root)
gate=empty('J_Tailgate',(-.12,0,1.57),bed)

def finish(o,name,material,parent,bevel=0):
    o.name=name; o.data.materials.append(material)
    world=o.matrix_world.copy(); o.parent=parent; o.matrix_world=world
    if bevel:
        mod=o.modifiers.new('Manufactured edge','BEVEL'); mod.width=bevel; mod.segments=2
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    objects.append(o); return o

def box(name,pos,size,material,parent=root,bevel=.025,collision=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos); o=bpy.context.object
    o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,material,parent,bevel)
    if collision:
        # Box coordinates in glTF root space, Y up; bed in loading position.
        colliders.append(dict(name=name,parent='DumpTruck',center=[pos[0],pos[2],-pos[1]],halfExtents=[size[0]/2,size[2]/2,size[1]/2]))
    return o

def cyl(name,pos,radius,depth,material,parent=root,axis='Y',vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=pos)
    o=bpy.context.object
    if axis=='Y': o.rotation_euler.x=math.pi/2
    if axis=='X': o.rotation_euler.y=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,material,parent,.014)

def beam(name,a,b,r,material,parent=root):
    a,b=Vector(a),Vector(b)
    o=cyl(name,(a+b)/2,r,(b-a).length,material,parent,'Z',20)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o

# X forward, Z up. Three axles with dual rear tires.
for y in [-.76,.76]: box('Frame rail',(-.1,y,.95),(7,.16,.3),dark)
for x in [-2.45,-1.05,2.15]:
    cyl('Axle',(x,0,.59),.13,2.2,dark)
    for sign in [-1,1]:
        tireYs=[sign*1.06] if x>0 else [sign*.87,sign*1.22]
        for y in tireYs:
            cyl('Tire',(x,y,.59),.59,.32,rubber,vertices=40)
            for j in range(24):
                t=j*math.tau/24
                o=box('Tread',(x+.578*math.sin(t),y,.59+.578*math.cos(t)),(.105,.33,.035),rubber,bevel=.008)
                o.rotation_euler.y=t
        y=sign*(1.235 if x>0 else 1.395)
        cyl('Wheel rim',(x,y,.59),.34,.035,steel)
        cyl('Hub',(x,y+sign*.025,.59),.16,.08,dark)
        for j in range(8):
            t=j*math.tau/8
            cyl('Lug',(x+.235*math.sin(t),y+sign*.03,.59+.235*math.cos(t)),.025,.035,dark,vertices=8)
for sign in [-1,1]:
    box('Rear fender',(-1.75,sign*1.12,1.25),(2.7,.66,.12),dark)
    box('Mud flap',(-3.13,sign*1.12,.55),(.07,.6,.62),rubber)
    box('Fuel tank',(.35,sign*.95,.85),(1.18,.54,.53),steel,bevel=.12)
    for x in [0,.7]: box('Tank strap',(x,sign*1.23,.85),(.07,.025,.48),dark)

# Cab-over cabin with split windshield, doors, steps, mirrors and grille.
box('Cab',(2.25,0,1.92),(2.35,2.36,2.3),ochre,bevel=.14,collision=True)
box('Roof',(2.23,0,3.11),(2.48,2.48,.17),ochre,bevel=.07)
for y in [-.57,.57]: box('Windshield',(3.436,y,2.59),(.025,1.06,.7),glass,bevel=.055)
box('Grille',(3.45,0,1.55),(.04,1.38,.54),dark)
for z in [1.35,1.48,1.61,1.74]: box('Grille slat',(3.478,0,z),(.025,1.25,.022),steel,bevel=.005)
box('Bumper',(3.51,0,.94),(.22,2.52,.27),steel,bevel=.05)
for sign in [-1,1]:
    box('Headlight',(3.455,sign*.95,1.34),(.045,.35,.25),lamp,bevel=.035)
    box('Indicator',(3.46,sign*1.02,1.61),(.045,.22,.09),ochre)
    box('Side window',(2.42,sign*1.187,2.57),(1.55,.025,.73),glass,bevel=.06)
    box('Door lower',(2.37,sign*1.19,1.8),(1.7,.024,.57),ochre)
    box('Door handle',(1.81,sign*1.222,2.13),(.21,.045,.055),dark)
    for z in [.6,.9]: box('Cab step',(1.31,sign*1.22,z),(.45,.38,.09),steel)
    beam('Mirror arm',(3.12,sign*1.16,2.75),(3.0,sign*1.53,2.7),.027,dark)
    box('Mirror',(3.0,sign*1.54,2.52),(.14,.16,.43),dark,bevel=.04)
    box('Mirror face',(2.917,sign*1.54,2.52),(.012,.125,.36),steel)
    cyl('Beacon',(2.25,sign*.78,3.26),.115,.19,ochre,axis='Z')

# Open rectangular bed: inner bounds x[-3,1], y[-1.1,1.1], z[1.55,2.95].
# Five separate collision panels; NEVER use one convex hull for the whole bed.
box('Bed_Floor',(-1,0,1.49),(4.24,2.44,.12),bedmat,bed,bevel=.012,collision=True)
for sign in [-1,1]:
    box('Bed_Side_'+str(sign),(-1,sign*1.16,2.25),(4.24,.12,1.4),bedmat,bed,bevel=.012,collision=True)
    box('Bed top rail',(-1,sign*1.18,2.99),(4.32,.18,.1),steel,bed)
    for x in [-2.9,-2,-1.1,-.2,.9]:
        box('Bed reinforcement',(x,sign*1.25,2.24),(.1,.1,1.44),bedmat,bed)
box('Bed_Front',(1.06,0,2.25),(.12,2.2,1.4),bedmat,bed,bevel=.012,collision=True)
box('Bed_Tailgate',(-3.06,0,2.25),(.12,2.2,1.4),bedmat,gate,bevel=.012,collision=True)
for y in [-.8,0,.8]: box('Tailgate rib',(-3.15,y,2.25),(.09,.1,1.38),bedmat,gate)
for y in [-1,1]:
    cyl('Tailgate hinge',(-3.12,y,2.95),.08,.22,steel,bed)
    box('Tail lamp',(-3.28,y,1.08),(.07,.28,.13),red)
beam('Tipper cylinder',(-.9,0,1.02),(.2,0,1.41),.13,dark)
beam('Tipper piston',(-.3,0,1.24),(.5,0,1.48),.075,steel)
bed['rotation_axis']='local Y'; bed['loading_angle_degrees']=0
bed['tip_limit_degrees']=45
gate['rotation_axis']='local Y'; gate['opening_limit_degrees']=85

# Export only vehicle objects; retain studio and editable construction in blend.
bpy.ops.object.select_all(action='DESELECT')
for o in [root,bed,gate]+objects: o.select_set(True)
bpy.context.view_layer.objects.active=root
exec(compile(Path('D:/repos/mechanical-equipment-game/scripts/export_dump_truck.py').read_text(encoding='utf-8'), 'export_dump_truck.py', 'exec'), {'__name__':'__main__'})
config=dict(version=1,units='m',coordinates='Y-up, X-forward',loadingPoseOnly=True,
    bed=dict(innerMin=[-3,1.55,-1.1],innerMax=[1,2.95,1.1],capacityM3=12.32,targetFraction=.8,targetVolumeM3=9.856),
    joints=dict(tipper='J_Tipper',tailgate='J_Tailgate'),colliders=colliders)
(OUT/'dump-truck.physics.json').write_text(json.dumps(config,indent=2),encoding='utf-8')

floor=box('Studio floor',(0,0,-.09),(200,200,.1),mat('Studio warm grey',(.31,.34,.32)))
floor.parent=None
scene.world=bpy.data.worlds.new('DT World'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.7,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,pos,power,size in [('Key',(5,-6,10),1800,7),('Fill',(-2,5,7),1400,6),('Rim',(-6,-3,6),1200,5)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o); o.location=pos
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('DT Camera'); cam=bpy.data.objects.new('DT Camera',data); scene.collection.objects.link(cam)
cam.location=(10,-12,9); cam.rotation_euler=(Vector((0,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=10.5; scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1200; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(OUT/'dump-truck-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'dump-truck.blend'))
print(json.dumps(dict(scene=scene.name,objects=len(objects)-1,capacityM3=12.32,output=str(OUT))))
