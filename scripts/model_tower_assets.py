"""Original tower-crane assets. Run build_asset(name) in live Blender via MCP.

Each asset has an isolated Scene and is written with libraries.write, so other
open scenes never leak into its .blend. No existing user scene is removed.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

BASE = Path('D:/repos/mechanical-equipment-game/assets/tower-construction')
SCENE = None
M = {}

def enum(owner, prop, value):
    allowed = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    if value not in allowed:
        raise ValueError((prop, value, allowed))
    return value

def material(name, color, metallic=0, roughness=.55):
    m = bpy.data.materials.new('TC_' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return m

def empty(name, pos=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    SCENE.collection.objects.link(o)
    o.parent = parent
    o.location = pos
    o.empty_display_size = .25
    return o

def mesh(name, vertices, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    o = bpy.data.objects.new(name, data)
    SCENE.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(M[mat] if isinstance(mat, str) else mat)
    return o

def box(name, pos, size, mat, parent, bevel=0):
    x,y,z = [v/2 for v in size]
    vs = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    o = mesh(name, vs, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat, parent)
    o.location = pos
    if bevel:
        mod = o.modifiers.new('Soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return o

def rod(name, a, b, radius, mat, parent, sides=8):
    a,b = Vector(a),Vector(b)
    length = (b-a).length
    vs = [(radius*math.cos(i*math.tau/sides),radius*math.sin(i*math.tau/sides),z) for z in [-length/2,length/2] for i in range(sides)]
    fs = [tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    fs += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    o = mesh(name,vs,fs,mat,parent)
    o.location = (a+b)/2
    o.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return o

def ring(name, center, radius, tube, mat, parent, start=0, end=math.tau, steps=24):
    # Ring in X/Z plane, used for lift eyes, hook and ladder cages.
    vs=[]
    for i in range(steps+1):
        a=start+(end-start)*i/steps
        for j in range(8):
            t=j*math.tau/8
            r=radius+tube*math.cos(t)
            vs.append((center[0]+r*math.sin(a),center[1]+tube*math.sin(t),center[2]+r*math.cos(a)))
    fs=[]
    for i in range(steps):
        for j in range(8):
            fs.append((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j))
    fs += [tuple(reversed(range(8))),tuple(range(steps*8,(steps+1)*8))]
    return mesh(name,vs,fs,mat,parent)

def text(name, body, pos, size, parent, mat='dark', rotation=(math.pi/2,0,0)):
    c=bpy.data.curves.new(name,'FONT'); c.body=body; c.size=size; c.extrude=.001
    o=bpy.data.objects.new(name,c); SCENE.collection.objects.link(o)
    o.parent=parent; o.location=pos; o.rotation_euler=rotation; c.materials.append(M[mat])
    return o

def rail(name, a, b, parent, mat='yellow', height=.85):
    a,b=Vector(a),Vector(b)
    for i in range(max(2,math.ceil((b-a).length/1.8)+1)):
        count=max(2,math.ceil((b-a).length/1.8)+1)
        p=a.lerp(b,i/(count-1)); rod(name+'_Post',p,p+Vector((0,0,height)),.027,mat,parent)
    for z in [height*.48,height]:
        rod(name+'_Rail',a+Vector((0,0,z)),b+Vector((0,0,z)),.025,mat,parent)

def crane():
    root=empty('TowerCrane'); root['asset_type']='tower_crane'; root['fixed_base']=True
    base=empty('Base',parent=root)
    box('ConcreteFoundation',(0,0,.35),(5,5,.7),'concrete',base,.08)
    for x in [-1.1,1.1]:
        for y in [-1.1,1.1]:
            box('AnchorPlate',(x,y,.78),(.65,.65,.14),'dark',base)
            for dx in [-.22,.22]:
                for dy in [-.22,.22]: rod('AnchorBolt',(x+dx,y+dy,.8),(x+dx,y+dy,1.0),.045,'steel',base)
    mast=empty('TowerMast',parent=root)
    for n in range(10):
        z=.9+n*2.9
        part=empty('MastSection_%02d'%(n+1),parent=mast)
        for x in [-.85,.85]:
            for y in [-.85,.85]:
                box('MastChord',(x,y,z+1.45),(.16,.16,2.9),'yellow',part)
                box('MastFlange',(x,y,z+.05),(.27,.27,.1),'ochre',part)
        for h in [z+.1,z+2.85]:
            for y in [-.85,.85]: box('MastHorizontal',(0,y,h),(1.8,.11,.12),'yellow',part)
            for x in [-.85,.85]: box('MastHorizontal',(x,0,h),(.11,1.8,.12),'yellow',part)
        for s in [-1,1]:
            rod('MastDiagonal',(-.85,s*.85,z+.12),(.85,s*.85,z+2.8),.055,'yellow',part)
            rod('MastDiagonal',(s*.85,-.85,z+.12),(s*.85,.85,z+2.8),.055,'yellow',part)
        for x in [-.28,.28]: rod('LadderStringer',(x,.2,z),(x,.2,z+2.9),.026,'steel',part)
        for i in range(10): rod('LadderRung',(-.28,.2,z+i*.29),(.28,.2,z+i*.29),.022,'steel',part)
    ties=empty('BuildingAttachments',parent=root)
    for z in [3,5.6]:
        for y in [-1,1]:
            box('AttachmentCollar',(0,y,z),(2.1,.16,.2),'dark',ties)
            rod('AttachmentRod',(1,y,z),(6,3+y*2.1,z),.09,'yellow',ties)
            box('WallAttachmentPlate',(6,3+y*2.1,z),(.12,.45,.45),'steel',ties)
        rod('AttachmentDiagonal',(1,-1,z),(6,5.1,z),.065,'yellow',ties)
    rod('FixedBearing',(0,0,29.7),(0,0,30.0),1.12,'dark',root,48)
    slew=empty('J_Slew',(0,0,30),root); slew['axis_blender']='Z'; slew['axis_gltf']='Y'
    rod('SlewRing',(0,0,-.02),(0,0,.22),1.2,'steel',slew,48)
    for i in range(24):
        a=i*math.tau/24
        rod('SlewBolt',(.99*math.cos(a),.99*math.sin(a),.21),(.99*math.cos(a),.99*math.sin(a),.28),.035,'dark',slew)
    platform=empty('SlewPlatform',parent=slew)
    box('PlatformDeck',(0,0,.37),(3.1,3,.25),'yellow',platform)
    rail('PlatformRail',(-1.45,1.4,.5),(1.45,1.4,.5),platform)
    cap=empty('TowerHead',parent=slew)
    for x in [-.85,.85]:
        for y in [-.75,.75]: rod('HeadChord',(x,y,.5),(0,y*.4,4.6),.09,'yellow',cap)
    for z in [1.5,2.6,3.7]:
        t=1-(z-.5)/4.1
        rod('HeadCrossbar',(-.85*t,-.75*t-.1,z),(.85*t,-.75*t-.1,z),.055,'yellow',cap)
    jib=empty('Jib',parent=slew)
    for i in range(12):
        x=i*2
        for y in [-.6,.6]:
            rod('JibLowerChord',(x,y,.65),(x+2,y,.65),.07,'yellow',jib)
            rod('JibWeb',(x,y,.65),(x+1,0,2.1),.047,'yellow',jib)
            rod('JibWeb',(x+1,0,2.1),(x+2,y,.65),.047,'yellow',jib)
        rod('JibTopChord',(x,0,2.1),(x+2,0,2.1),.07,'yellow',jib)
        rod('JibCrossMember',(x,-.6,.65),(x,.6,.65),.048,'yellow',jib)
        box('JibWalkway',(x+1,.18,.75),(2,.36,.055),'steel',jib)
    for y in [-.61,.61]: box('TrolleyTrack',(12,y,.53),(24,.095,.14),'dark',jib)
    box('JibTip',(24,0,.86),(.2,1.35,.7),'yellow',jib)
    for x in [2,23.7]: box('TrolleyEndStop',(x,0,.42),(.15,1.35,.3),'red',jib)
    counter=empty('CounterJib',parent=slew)
    for i in range(4):
        a=-i*2; b=a-2
        for y in [-.85,.85]:
            for z in [.65,1.6]: rod('CounterChord',(a,y,z),(b,y,z),.07,'yellow',counter)
            rod('CounterDiagonal',(a,y,.65),(b,y,1.6),.05,'yellow',counter)
        box('CounterDeck',((a+b)/2,0,.65),(2,1.8,.12),'dark',counter)
    for y in [-.88,.88]: rail('CounterRail',(-1.4,y,.72),(-8,y,.72),counter)
    weights=empty('Counterweights',parent=slew)
    for x in [-6.3,-6.95,-7.6]:
        box('CounterweightSlab',(x,0,.45),(.56,2.15,2.25),'concrete',weights,.045)
        for y in [-1.083,1.083]: box('WeightYellowStripe',(x,y,.2),(.44,.024,.2),'yellow',weights)
    ties=empty('JibTieRods',parent=slew)
    for y in [-.32,.32]:
        for x in [12,22]: rod('FrontTieRod',(0,y,4.6),(x,y,2.1),.038,'steel',ties)
        rod('CounterTieRod',(0,y,4.6),(-7.5,y,1.6),.05,'steel',ties)
    cab=empty('OperatorCab',parent=slew)
    box('CabShell',(1,-1.5,1.12),(1.65,1.3,1.75),'yellow',cab,.09)
    box('CabFrontGlass',(1.837,-1.5,1.32),(.025,1.1,1.05),'glass',cab,.02)
    box('CabSideGlass',(1,-2.163,1.32),(1.4,.025,1.08),'glass',cab,.02)
    box('CabRoof',(1,-1.5,2.08),(1.85,1.45,.16),'ivory',cab,.04)
    box('CabLowerTrim',(1,-2.18,.54),(1.45,.04,.22),'dark',cab)
    rod('CabWiper',(1.86,-1.95,.95),(1.86,-1.3,1.45),.018,'dark',cab)
    winch=empty('HoistWinch',parent=slew)
    rod('HoistDrum',(-3,-.5,1.15),(-3,.5,1.15),.38,'steel',winch,24)
    for y in [-.55,.55]: rod('DrumFlange',(-3,y-.04,1.15),(-3,y+.04,1.15),.46,'dark',winch,24)
    box('HoistMotor',(-4,0,1.1),(.9,.8,.6),'blue',winch,.04)
    trolley=empty('J_Trolley',(11,0,.3),slew); trolley['travel_min']=2.4; trolley['travel_max']=23
    box('TrolleyFrame',(0,0,0),(1.25,1.5,.26),'red',trolley,.035)
    for x in [-.43,.43]:
        for y in [-.65,.65]: rod('TrolleyWheel',(x,y-.09,.22),(x,y+.09,.22),.19,'dark',trolley,16)
    rope=empty('J_Rope',parent=trolley)
    for y in [-.16,.16]: rod('WireRope',(0,y,0),(0,y,-17),.021,'dark',rope)
    hook=empty('J_Hook',(0,0,-17),trolley)
    box('HookBlock',(0,0,0),(.7,.52,.75),'yellow',hook,.055)
    for x in [-.2,0,.2]:
        o=box('HookWarning',(x,-.267,0),(.08,.018,.6),'dark',hook); o.rotation_euler.y=-.25
    rod('HookAxle',(0,-.32,0),(0,.32,0),.14,'steel',hook,16)
    rod('HookSwivel',(0,0,-.3),(0,0,-.61),.095,'steel',hook,16)
    ring('ForgedHook',(0,0,-.77),.22,.065,'steel',hook,start=-.4,end=4.65,steps=24)
    rod('HookLatch',(-.21,0,-.78),(-.05,0,-.56),.022,'dark',hook)
    empty('A_CargoAttach',(0,0,-.96),hook)
    text('JibIdentity','TC / 24', (5,-.655,.95),.47,jib)
    rig_crane(root,slew,trolley,hook,rope)
    return root, (45,-59,37), (6,0,17.5), 52

def rig_crane(root,slew,trolley,hook,rope):
    """Live Blender controls; GLB keeps the joint hierarchy for runtime control."""
    for key,value,low,high,description in [
        ('slew_degrees',0.0,-360.0,360.0,'Horizontal rotation of the entire upper structure'),
        ('trolley_radius',11.0,2.4,23.0,'Trolley distance from mast, metres'),
        ('rope_length',17.0,2.0,28.5,'Vertical distance from trolley to hook block, metres'),
    ]:
        root[key]=value
        root.id_properties_ui(key).update(min=low,max=high,description=description)
    for obj,path,index,prop,expression in [
        (slew,'rotation_euler',2,'slew_degrees','v * 0.017453292519943295'),
        (trolley,'location',0,'trolley_radius','min(23.0,max(2.4,v))'),
        (hook,'location',2,'rope_length','-min(28.5,max(2.0,v))'),
        (rope,'scale',2,'rope_length','min(28.5,max(2.0,v))/17.0'),
    ]:
        driver=obj.driver_add(path,index).driver
        driver.type=enum(driver,'type','SCRIPTED')
        variable=driver.variables.new(); variable.name='v'
        variable.type=enum(variable,'type','SINGLE_PROP')
        variable.targets[0].id=root; variable.targets[0].data_path='["'+prop+'"]'
        driver.expression=expression

def cargo(kind):
    title={'rebar-bundle':'RebarBundle','brick-pallet':'BrickPallet','gypsum-stack':'GypsumStack'}[kind]
    root=empty(title); root['material_type']=kind; root['initial_count']=5
    width=3.5 if kind=='rebar-bundle' else 2.25
    depth=1.15 if kind=='rebar-bundle' else 1.5
    h=.66 if kind=='rebar-bundle' else (.9 if kind=='brick-pallet' else .56)
    for x in [-width*.35,width*.35]: box('PalletFoot',(x,0,.1),(.16,depth,.2),'wood',root,.015)
    for y in [-depth*.38,0,depth*.38]: box('PalletDeck',(0,y,.23),(width+.08,.22,.09),'wood',root,.01)
    if kind=='rebar-bundle':
        for row in range(3):
            for col in range(7-row%2):
                y=(col-3+row%2*.5)*.145
                z=.36+row*.125
                rod('Rebar',(-width/2,y,z),(width/2,y,z),.065,'steel',root,10)
                # Raised ribs provide recognizable steel bundle detail.
                for x in [-1.45,-.95,-.45,.05,.55,1.05,1.55]:
                    rod('RebarRib',(x-.018,y,z),(x+.018,y,z),.075,'dark',root,10)
    elif kind=='brick-pallet':
        for z in range(4):
            for x in range(5):
                for y in range(3):
                    box('Brick',((x-2)*.435,(y-1)*.47,.34+z*.155),(.418,.45,.14),'brick' if (x+y+z)%3 else 'bricklight',root,.009)
    else:
        for z in range(7):
            box('GypsumBoard',(0,0,.3+z*.038),(width,depth,.031),'ivory',root,.005)
            box('BlueBoardEdge',(0,-depth/2-.002,.3+z*.038),(width,.012,.023),'paleblue',root)
    # Rigid lifting frame allows identical packages to stack without sling intersection.
    frame_top=h+.56
    for x in [-width*.42,width*.42]:
        for y in [-depth*.48,depth*.48]:
            rod('LiftingCagePost',(x,y,.23),(x,y,frame_top),.027,'blue',root)
        rod('LiftFrameTop',(x,-depth*.48,frame_top),(x,depth*.48,frame_top),.027,'blue',root)
    for y in [-depth*.48,depth*.48]: rod('LiftFrameRail',(-width*.42,y,frame_top),(width*.42,y,frame_top),.027,'blue',root)
    for x in [-width*.32,width*.32]:
        for y in [-depth*.38,depth*.38]: rod('LiftingSling',(x,y,h),(0,0,h+.25),.018,'dark',root)
    ring('GrabEye',(0,0,h+.35),.105,.024,'yellow',root)
    empty('A_GrabPoint_'+title,(0,0,h+.455),root)
    root['stack_pitch']=frame_top+.027
    root['grab_height']=h+.455
    root['bottom_height']=0.0
    return root,(5,-6,4),(0,0,.65),4.9

def floor_geometry(parent, z=0, suffix=''):
    f=empty('FloorModule'+suffix,(0,0,z),parent)
    # 12 x 10 metre building, with 3 metre repeat height.
    for x in [-5.7,0,5.7]:
        for y in [-4.7,0,4.7]: box('ConcreteColumn',(x,y,1.35),(.45,.45,2.7),'concrete',f,.025)
    for y in [-4.7,0,4.7]: box('ConcreteBeam',(0,y,2.66),(12,.38,.4),'concrete',f,.02)
    for x in [-5.7,0,5.7]: box('ConcreteBeam',(x,0,2.66),(.4,10,.4),'concrete',f,.02)
    box('FloorSlab',(0,0,2.87),(12,10,.26),'concrete',f,.025)
    # Partial masonry infill keeps the structure visually under construction.
    for x in [-3,3]: box('MasonryInfill',(x,4.73,.85),(4.6,.22,1.65),'bricklight',f,.02)
    box('ServiceCore',(1,1.2,1.35),(2.1,2.5,2.7),'concrete',f,.02)
    return f

def roof(parent, z):
    r=empty('RoofWorkPlatform',(0,0,z),parent)
    for y in [-4.85,4.85]: rail('RoofGuardrail',(-5.85,y,0),(5.85,y,0),r,mat='red',height=.95)
    for x in [-5.85,5.85]: rail('RoofGuardrail',(x,-4.85,0),(x,4.85,0),r,mat='red',height=.95)
    for i,(label,ma) in enumerate([('REBAR','blue'),('BRICK','orange'),('BOARD','green')]):
        x=-3.8+i*3.8
        pad=empty('UnloadPad_'+label,(x,-2.1,0),r); pad['accepts_material']=['rebar-bundle','brick-pallet','gypsum-stack'][i]
        box('PadSurface',(0,0,.018),(3.55,2.65,.03),ma,pad)
        for y in [-1.3,1.3]: box('PadBorder',(0,y,.041),(3.5,.05,.02),'ivory',pad)
        for xx in [-1.75,1.75]: box('PadBorder',(xx,0,.041),(.05,2.6,.02),'ivory',pad)
        text('PadLabel',label,(-1.1,-1.15,.056),.28,pad,'ivory',rotation=(0,0,0))
    empty('A_RoofCenter',parent=r)
    return r

def building(kind):
    if kind=='floor-module':
        root=empty('RepeatableFloor'); floor_geometry(root); root['repeat_height']=3
        return root,(19,-23,16),(0,0,1.5),19
    root=empty('ConstructionBuilding'); root['initial_floors']=2; root['floor_height']=3; root['max_floors']=7
    box('BuildingFoundation',(0,0,-.2),(12.6,10.6,.4),'concrete',root,.05)
    for i in range(2): floor_geometry(root,i*3,'_%02d'%(i+1))
    roof(root,6)
    for y in [-2.1,2.1]: empty('A_AttachmentWall',(-6,y,5.6),root)
    return root,(20,-25,20),(0,0,3),21

def residential():
    root=empty('ResidentialBuilding')
    box('Plinth',(0,0,.25),(12.8,10.8,.5),'dark',root,.05)
    box('ResidentialBody',(0,0,9.3),(12,10,18),'ivory',root,.06)
    for x in [-5.7,5.7]: box('FacadeFin',(x,-5.12,9.4),(.55,.4,18.2),'ochre',root)
    for f in range(6):
        z=1.6+f*3
        for y in [-5.025,5.025]:
            for x in [-4,-1.35,1.35,4]:
                box('WindowSurround',(x,y,z+.25),(1.95,.09,1.9),'dark',root)
                box('WindowGlass',(x,y*1.011,z+.25),(1.75,.025,1.67),'glass',root)
                box('WindowMullion',(x,y*1.016,z+.25),(.055,.027,1.69),'ivory',root)
            box('FloorBand',(0,y,z+1.6),(12.12,.22,.16),'concrete',root)
        for x in [-6.025,6.025]:
            for y in [-3,0,3]: box('EndWindow',(x,y,z+.2),(.04,1.7,1.8),'glass',root)
    box('RoofCap',(0,0,18.5),(12.5,10.5,.3),'concrete',root,.04)
    for y in [-5.1,5.1]: box('Parapet',(0,y,18.95),(12.4,.2,.7),'ivory',root)
    for x in [-6.1,6.1]: box('Parapet',(x,0,18.95),(.2,10.2,.7),'ivory',root)
    box('RoofServiceRoom',(1.5,1.5,19.45),(3,3,1.6),'concrete',root,.03)
    box('EntranceCanopy',(0,-5.8,2.9),(3.7,2,.2),'dark',root,.03)
    box('EntryDoors',(0,-5.065,1.15),(2.2,.05,2.2),'glass',root)
    return root,(29,-37,27),(0,0,9.5),29

def tree(parent,x,y,scale=1):
    t=empty('LandscapeTree',(x,y,0),parent)
    rod('Trunk',(0,0,0),(0,0,2.4*scale),.14*scale,'wood',t)
    # Faceted layered crowns without texture dependencies.
    for z,r in [(2.6,1.15),(3.4,.9),(4.0,.55)]:
        vs=[(0,0,(z+.9)*scale),(0,0,(z-.7)*scale)]
        vs += [(r*scale*math.cos(i*math.tau/9),r*scale*math.sin(i*math.tau/9),z*scale) for i in range(9)]
        fs=[(0,i+2,(i+1)%9+2) for i in range(9)]+[(1,(i+1)%9+2,i+2) for i in range(9)]
        mesh('TreeCrown',vs,fs,'foliage' if z<3 else 'green',t)

def environment():
    root=empty('ResidentialSiteEnvironment')
    box('Terrain',(0,0,-.3),(96,80,.5),'grass',root)
    box('SitePaving',(0,1,-.04),(65,51,.08),'paving',root)
    box('WorkYard',(6,-6,.005),(41,29,.09),'sand',root)
    for y in [-31,33]:
        box('PublicRoad',(0,y,-.015),(96,7,.12),'asphalt',root)
        for yy in [y-4.3,y+4.3]: box('Sidewalk',(0,yy,.055),(96,1.5,.22),'concrete',root)
        for x in range(-45,46,6): box('RoadDash',(x,y,.051),(2.8,.13,.016),'ivory',root)
        for x in range(-43,44,6): tree(root,x,y+6, .85+(x%3)*.06)
    for x in [-37,37]:
        box('SideRoad',(x,1,-.015),(7,57,.12),'asphalt',root)
        for y in range(-24,28,6): box('RoadDash',(x,y,.051),(.13,2.8,.016),'ivory',root)
    for y in [-25.5,26.5]:
        for x in range(-31,32,3):
            if y<0 and -3<x<9: continue
            box('SiteFence',(x,y,1.1),(2.96,.14,2.2),'blue',root,.02)
            box('FencePost',(x-1.47,y,1.15),(.1,.22,2.3),'ivory',root)
    for x in [-32.5,32.5]:
        for y in range(-24,26,3): box('SiteFence',(x,y,1.1),(.14,2.96,2.2),'blue',root,.02)
    for i,(name,x,ma) in enumerate([('REBAR',5,'blue'),('BRICK',10,'orange'),('BOARD',15,'green')]):
        pad=empty('StorageBay_'+name,(x,-10,0),root)
        for y in [-1.5,1.5]: box('StorageLine',(0,y,.071),(4.3,.09,.025),ma,pad)
        for xx in [-2.15,2.15]: box('StorageLine',(xx,0,.071),(.09,3,.025),ma,pad)
        box('StorageSign',(0,1.8,1),(2.3,.08,.56),ma,pad,.025)
        for xx in [-.8,.8]: rod('SignLeg',(xx,1.8,0),(xx,1.8,.8),.035,'steel',pad)
        text('StorageLabel',name,(-.86,1.75,.84),.34,pad,'ivory')
        empty('A_Stack_'+name,(0,0,.05),pad)
    # Building/crane are external assets, represented here only by placement anchors.
    empty('A_TowerCrane',(0,0,.05),root)
    empty('A_ConstructionBuilding',(12,3,.05),root)
    for i,p in enumerate([(-22,15,.05),(-6,17,.05),(16,18,.05),(-23,-8,.05)]):
        empty('A_ResidentialBuilding_%02d'%(i+1),p,root)
    for x,y in [(-13,-18),(-23,3),(27,14),(27,-15)]:
        box('Planter',(x,y,.2),(3.4,3.4,.4),'concrete',root,.07)
        box('PlantingSoil',(x,y,.43),(3.05,3.05,.06),'soil',root)
        tree(root,x,y)
    hut=empty('SiteOffice',(-22,-20,0),root)
    box('OfficeBody',(0,0,1.4),(6,3,2.8),'ivory',hut,.04)
    box('OfficeRoof',(0,0,2.87),(6.3,3.3,.15),'blue',hut,.02)
    for x in [-1.8,1.8]: box('OfficeWindow',(x,-1.52,1.7),(1.3,.05,1),'glass',hut)
    box('OfficeDoor',(0,-1.52,1.1),(.85,.05,2.2),'blue',hut)
    return root,(72,-89,76),(0,0,0),111

BUILDERS={'tower-crane':crane,'rebar-bundle':lambda:cargo('rebar-bundle'),'brick-pallet':lambda:cargo('brick-pallet'),'gypsum-stack':lambda:cargo('gypsum-stack'),'construction-building':lambda:building('construction-building'),'floor-module':lambda:building('floor-module'),'residential-building':residential,'site-environment':environment}

def prepare(name):
    global SCENE,M
    SCENE=bpy.data.scenes.new('TC_'+name)
    bpy.context.window.scene=SCENE
    SCENE.unit_settings.system=enum(SCENE.unit_settings,'system','METRIC')
    SCENE.unit_settings.scale_length=1
    colors={'yellow':(.95,.57,.035),'ochre':(.57,.3,.065),'dark':(.038,.052,.064),'steel':(.3,.38,.43),'glass':(.035,.16,.22),'ivory':(.83,.85,.8),'concrete':(.47,.51,.51),'red':(.76,.065,.035),'blue':(.04,.24,.36),'paleblue':(.37,.58,.67),'brick':(.57,.19,.095),'bricklight':(.72,.29,.13),'wood':(.4,.24,.11),'orange':(.85,.35,.07),'green':(.16,.4,.24),'foliage':(.07,.23,.13),'grass':(.28,.4,.25),'paving':(.43,.47,.46),'sand':(.51,.43,.3),'asphalt':(.095,.13,.15),'soil':(.18,.12,.07)}
    M={n:material(n,c,.6 if n=='steel' else (.2 if n in ['yellow','dark','blue'] else 0),.25 if n=='glass' else .58) for n,c in colors.items()}

def studio(camera_pos,target,ortho):
    s=SCENE
    world=bpy.data.worlds.new(s.name+'_World'); world.use_nodes=True
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.63,.72,.8,1); bg.inputs['Strength'].default_value=.45; s.world=world
    camdata=bpy.data.cameras.new('PreviewCamera'); camdata.type=enum(camdata,'type','ORTHO'); camdata.ortho_scale=ortho
    cam=bpy.data.objects.new('PreviewCamera',camdata); s.collection.objects.link(cam); cam.location=camera_pos
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler(); s.camera=cam
    ld=bpy.data.lights.new('Daylight','SUN'); ld.energy=2.4; ld.angle=.18
    sun=bpy.data.objects.new('Daylight',ld); s.collection.objects.link(sun); sun.rotation_euler=(.42,-.6,-.42)
    s.render.resolution_x=1100; s.render.resolution_y=900; s.render.resolution_percentage=100
    s.render.image_settings.file_format=enum(s.render.image_settings,'file_format','PNG')
    s.render.film_transparent=False
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            sp=area.spaces.active
            sp.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            sp.region_3d.view_location=target; sp.region_3d.view_distance=ortho*1.2
            sp.shading.color_type=enum(sp.shading,'color_type','MATERIAL')
            sp.overlay.show_relationship_lines=False
            sp.clip_end=1000

def build_asset(name):
    prepare(name)
    root,cp,target,ortho=BUILDERS[name]()
    root['units']='metres'; root['coordinate_system']='Blender Z up; glTF Y up'
    bpy.context.view_layer.update()
    dest=BASE/name; dest.mkdir(parents=True,exist_ok=True)
    if name in ['rebar-bundle','brick-pallet','gypsum-stack']:
        for o in SCENE.objects: o.select_set(True)
        bpy.context.view_layer.objects.active=root
        bpy.ops.export_scene.gltf(filepath=str(dest/(name+'-unit.glb')),use_selection=True,use_active_scene=True,export_animations=False,export_extras=True,export_apply=True)
        root=make_stack(root)
        top=5*root['stack_pitch']
        cp=(9,-12,top+3); target=(0,0,top/2); ortho=max(7.5,top*1.6)
    # Selected-only export precedes studio construction. No camera/light export.
    for o in SCENE.objects: o.select_set(True)
    bpy.context.view_layer.objects.active=root
    # Exporter default is GLB; avoid relying on its dynamic enum introspection.
    bpy.ops.export_scene.gltf(filepath=str(dest/(name+'.glb')),use_selection=True,use_active_scene=True,export_animations=False,export_extras=True,export_apply=True)
    for o in SCENE.objects: o.select_set(False)
    studio(cp,target,ortho)
    SCENE.render.filepath=str(dest/(name+'-preview.png'))
    bpy.data.libraries.write(str(dest/(name+'.blend')),{SCENE},fake_user=True,compress=True)
    report={'asset':name,'objects':len(SCENE.objects),'meshes':sum(o.type=='MESH' for o in SCENE.objects),'root':root.name,'blend':str(dest/(name+'.blend')),'glb':str(dest/(name+'.glb'))}
    (dest/'asset.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report))
    return SCENE

def make_stack(unit):
    stack=empty(unit.name+'Stack')
    stack['count']=5; stack['stack_pitch']=unit['stack_pitch']; stack['material_type']=unit['material_type']
    objects=[unit]+list(unit.children_recursive)
    for i in range(1,5):
        mapping={o:o.copy() for o in objects}
        for old,new in mapping.items():
            SCENE.collection.objects.link(new)
            new.parent=mapping.get(old.parent,stack)
        mapping[unit].location.z=i*unit['stack_pitch']
        mapping[unit]['stack_index']=i
    unit.parent=stack; unit['stack_index']=0
    return stack

if __name__=='__main__':
    print('Call build_asset(name), then bpy.ops.render.render(write_still=True) separately.')
