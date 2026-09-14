"""Execute in Blender through MCP; metric articulated original game assets."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
BASE=Path('D:/repos/mechanical-equipment-game/assets')
scene=bpy.data.scenes.new('Crane_and_CargoShip_Studio')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
def mat(n,c,metal=0,rough=.45):
 m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
yellow=mat('Crane_SafetyYellow',(.94,.55,.035),.25)
dark=mat('Graphite',(.045,.065,.085),.5)
rubber=mat('Rubber',(.018,.025,.032),0,.85)
steel=mat('Chrome',(.48,.59,.66),.8,.23)
glass=mat('BlueGlass',(.035,.16,.23),.45,.18)
white=mat('Ivory',(.83,.86,.81),.2)
red=mat('SignalRed',(.75,.065,.035),.2)
teal=mat('Ship_Teal',(.035,.26,.29),.45)
deckmat=mat('Deck',(.23,.33,.34),.35)
wood=mat('CargoWood',(.55,.31,.12))
def empty(n,p=(0,0,0),parent=None):
 o=bpy.data.objects.new(n,None); scene.collection.objects.link(o); o.parent=parent; o.location=p; return o
def finish(o,n,m,parent):
 o.name=n; o.parent=parent; o.data.materials.append(m)
 return o
def box(n,p,s,m,parent,bev=.035):
 bpy.ops.mesh.primitive_cube_add(size=1); o=bpy.context.object; o.dimensions=s
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 finish(o,n,m,parent); o.location=p
 if bev:
  mod=o.modifiers.new('EdgeHighlights','BEVEL'); mod.width=bev; mod.segments=2
  o.modifiers.new('Normals','WEIGHTED_NORMAL')
 return o
def cyl(n,p,r,d,m,parent,axis='Z'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=d); o=bpy.context.object; finish(o,n,m,parent); o.location=p
 if axis=='Y': o.rotation_euler.x=math.pi/2
 if axis=='X': o.rotation_euler.y=math.pi/2
 mod=o.modifiers.new('Rim','BEVEL'); mod.width=.012; mod.segments=2
 o.modifiers.new('Normals','WEIGHTED_NORMAL'); return o
def rod(n,a,b,r,m,parent):
 a,b=Vector(a),Vector(b); o=cyl(n,(a+b)/2,r,(b-a).length,m,parent); o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def curve(n,pts,r,m,parent):
 c=bpy.data.curves.new(n,'CURVE'); c.dimensions='3D'; c.bevel_depth=r; c.bevel_resolution=3
 s=c.splines.new('POLY'); s.points.add(len(pts)-1)
 for p,v in zip(s.points,pts): p.co=(*v,1)
 o=bpy.data.objects.new(n,c); scene.collection.objects.link(o); o.parent=parent; c.materials.append(m); return o
crane=empty('TruckCrane'); crane['fixed_chassis']=True
box('Chassis',(0,0,1.05),(8.8,2.45,.46),dark,crane)
box('CarrierDeck',(-.7,0,1.49),(7.1,2.65,.3),yellow,crane)
for x in [-3.25,-1.9,1.65,3.05]:
 cyl('Axle',(x,0,.65),.15,2.5,dark,crane,'Y')
 for y in [-1.25,1.25]:
  cyl('Tire',(x,y,.65),.65,.43,rubber,crane,'Y')
  cyl('WheelHub',(x,y*1.18,.65),.36,.055,steel,crane,'Y')
  cyl('HubCap',(x,y*1.21,.65),.14,.07,dark,crane,'Y')
  for a in range(8):
   t=a*math.tau/8; cyl('WheelBolt',(x+.25*math.cos(t),y*1.215,.65+.25*math.sin(t)),.035,.03,steel,crane,'Y')
box('DriverCab',(3.35,0,2.03),(2.1,2.5,1.55),yellow,crane,.12)
box('Windshield',(4.414,0,2.27),(.025,2.18,.87),glass,crane,.06)
for y in [-1.26,1.26]:
 box('DriverSideWindow',(3.4,y,2.3),(1.55,.025,.8),glass,crane)
 box('DoorHandle',(3.12,y*1.015,1.77),(.23,.04,.06),dark,crane)
 box('CabStep',(3.35,y,1.12),(1.45,.35,.14),steel,crane)
 rod('MirrorArm',(3.95,y,2.5),(4.05,y*1.24,2.5),.035,dark,crane)
 box('Mirror',(4.05,y*1.26,2.36),(.16,.12,.34),dark,crane)
box('FrontBumper',(4.46,0,1.18),(.18,2.6,.26),dark,crane)
box('Radiator',(4.42,0,1.62),(.04,1.15,.35),dark,crane)
for y in [-.92,.92]: box('HeadLamp',(4.43,y,1.66),(.04,.42,.22),white,crane)
for x in [-2.65,1.3]:
 for sign in [-1,1]:
  y=sign*2.65
  box('OutriggerBeam',(x,sign*1.8,1.1),(.5,2.4,.4),yellow,crane)
  cyl('OutriggerSleeve',(x,y,.77),.2,.9,yellow,crane)
  cyl('OutriggerPiston',(x,y,.35),.115,.48,steel,crane)
  box('SupportPad',(x,y,.07),(.85,.85,.14),dark,crane)
  for k in range(3): box('SupportWarning',(x-.258,y-.28+k*.27,1.1),(.015,.12,.31),dark,crane,.005)
slew=empty('J_Slew',(-.9,0,1.7),crane)
cyl('SlewBearing',(0,0,0),1.05,.28,dark,slew)
box('UpperPlatform',(0,0,.35),(3.2,2.3,.42),yellow,slew)
box('Counterweight',(-1.35,0,.92),(.85,2.6,1.0),dark,slew,.12)
for y in [-1.32,1.32]: box('CounterweightAccent',(-1.35,y,.95),(.72,.035,.14),yellow,slew)
box('OperatorCab',(.42,-1.02,1.05),(1.7,1.0,1.65),yellow,slew,.1)
box('OperatorFrontGlass',(1.28,-1.02,1.25),(.025,.83,1.03),glass,slew)
box('OperatorSideGlass',(.48,-1.53,1.27),(1.37,.025,1.0),glass,slew)
box('OperatorRoof',(.42,-1.02,1.93),(1.85,1.12,.12),white,slew)
cyl('WinchDrum',(-.72,.66,.95),.32,.7,steel,slew,'Y')
for y in [.29,1.03]: cyl('WinchFlange',(-.72,y,.95),.4,.055,dark,slew,'Y')
boom=empty('J_BoomPitch',(-.55,.2,1.12),slew)
box('Boom_Main',(2.1,0,0),(4.7,.78,.9),yellow,boom)
cyl('BoomHinge',(0,0,0),.25,1.04,steel,boom,'Y')
sections=[]; parent=boom
for i in range(1,4):
 j=empty('J_Telescope_'+str(i),(2.6,0,0),parent); sections.append(j)
 box('Boom_Stage_'+str(i),(1.48,0,0),(3.5,.78-i*.13,.9-i*.15),yellow if i<3 else dark,j,.025)
 box('SliderCollar_'+str(i),(0,0,0),(.14,.83-i*.13,.95-i*.15),dark,j)
 parent=j
tip=empty('A_BoomTip',(3.25,0,0),parent)
box('SheaveBracket',(0,0,-.12),(.42,.53,.52),yellow,tip)
cyl('TipSheave',(.08,0,-.27),.22,.34,steel,tip,'Y')
boom.rotation_euler.y=-math.radians(43)
# Aim constraints keep the two hydraulic pieces on their mounting points.
base=empty('A_CylinderBase',(.8,.2,.45),slew)
end=empty('A_CylinderRodEnd',(2.7,0,-.43),boom)
base_target=empty('A_CylinderBaseTarget',(.8,.2,.45),slew)
end_target=empty('A_CylinderEndTarget',(2.7,0,-.43),boom)
barrel=rod('HydraulicBarrel',(0,0,0),(0,0,1.55),.145,dark,base)
c=base.constraints.new('DAMPED_TRACK'); c.target=end_target; c.track_axis='TRACK_Z'
rodmesh=rod('HydraulicPiston',(0,0,0),(0,0,1.8),.09,steel,end)
c=end.constraints.new('DAMPED_TRACK'); c.target=base_target; c.track_axis='TRACK_Z'
ropeframe=empty('J_RopeVertical',(0,0,-.32),tip)
c=ropeframe.constraints.new('COPY_ROTATION'); c.target=crane; c.target_space='WORLD'; c.owner_space='WORLD'
rope=cyl('WireRope',(0,0,-2.1),.025,4.2,steel,ropeframe)
hook=empty('J_Hook',(0,0,-4.2),ropeframe)
box('HookBlock',(0,0,-.16),(.48,.36,.48),yellow,hook)
for x in [-.14,.05]: box('HookWarning',(x,-.186,-.16),(.09,.012,.4),dark,hook,.003)
pts=[]
for i in range(25):
 a=math.radians(90+i*285/24); pts.append((.17*math.cos(a),0,-.52+.23*math.sin(a)))
curve('ForgedHook',pts,.065,steel,hook)
empty('A_CargoAttach',(.03,0,-.7),hook)
crane['controls']='J_Slew local Z; J_BoomPitch local Y negative raises; J_Telescope_1..3 local X; J_Hook local Z and WireRope length together'
print('Crane built',len(list(crane.children_recursive)))
