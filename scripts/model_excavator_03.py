# Remove only our two opaque side infills: glazing must reveal the interior.
for name in ("Cab structural shell","Cab inner side"):
    bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
# Four-bar linkage driven by bucket angle, with only built-in math in the driver.
D=Vector((4.03,2.31));B=Vector((4.48,2.02));C=Vector((4.76,1.50))
r=(B-D).length;l=(C-B).length
cx="(0.47+0.26*cos(t)+0.03*sin(t))"
cz="(-0.84-0.26*sin(t)+0.03*cos(t))"
dd="sqrt(("+cx+")**2+("+cz+")**2)"
theta="(atan2("+cz+","+cx+")+acos(max(-1,min(1,("+str(r*r-l*l)+"+("+dd+")**2)/(2*"+str(r)+"*("+dd+"))))))"
f=rocker.driver_add("rotation_euler",1);drv=f.driver;drv.type='SCRIPTED'
v=drv.variables.new();v.name='t';v.type='SINGLE_PROP';v.targets[0].id=bucket;v.targets[0].data_path="rotation_euler[1]"
drv.expression=str(math.atan2((B-D).y,(B-D).x))+"-"+theta
# Replace link geometry with a local-Z aligned rod pair, aiming at the bucket lug.
for o in list(link.children): bpy.data.objects.remove(o,do_unlink=True)
target=empty("Bucket_link_target",(4.76,0,1.50),bucket)
for yy in (-.31,.31):
    o=cyl("Bucket connecting link",(0,yy,0),(0,yy,l),.055,trackmat,None,16)
    o.parent=link;o.matrix_parent_inverse.identity();o.location=(0,yy,l/2);o.rotation_mode='XYZ';o.rotation_euler=(0,0,0)
co=link.constraints.new('DAMPED_TRACK');co.target=target;co.track_axis='TRACK_Z'
# Safe bucket range for this illustrative four-bar mechanism.
bucket["limits_deg_relative_rest"]=[-48,48]
# Metal inspection covers and small fasteners.
for yy in (-.26,.26):
    for xx,zz in [(1.10,2.18),(1.49,2.68),(2.26,3.49)]:
        cyl("Boom weld boss",(xx,yy,zz),(xx,yy+math.copysign(.018,yy),zz),.032,dark,boom,12)
for yy in (-.8,.8):
    box("Rear tail light",(-2.054,yy,1.87),(.027,.20,.12),orange,upper,.015)
# Brand-free machine identification.
def text_mesh(name,body,pos,size,rotation,material,parent):
    cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.size=size;cu.extrude=.0008;cu.align_x='CENTER'
    o=bpy.data.objects.new(name,cu);asset.objects.link(o);o.location=pos;o.rotation_euler=rotation;cu.materials.append(material)
    bpy.context.view_layer.update();w=o.matrix_world.copy();o.parent=parent;o.matrix_world=w
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    return bpy.context.object
text_mesh("Machine designation","EX 200",(-1.37,-1.048,2.02),.20,(math.pi/2,0,0),dark,upper)
text_mesh("Boom designation","EX 200",(1.85,-.282,3.34),.15,(math.pi/2,0,.72),dark,boom)
# A separate, invisible collection contains simple collision proxies.
proxy_mat=mat("Collision debug",(.8,.03,.15),0,.8)
proxies=[]
def proxy_for(source,shape="convex_hull"):
    o=source.copy();o.data=source.data.copy();o.name="COL_"+source.name;collision.objects.link(o)
    for mod in list(o.modifiers):o.modifiers.remove(mod)
    o.hide_render=True;o.hide_set(True);o.display_type='WIRE';o["collision_shape"]=shape
    proxies.append(o);return o
for o in list(asset.objects):
    if o.type=='MESH' and (o.name.startswith("Bucket shell segment") or o.name.startswith("Bucket side plate") or o.name.startswith("Bucket tooth") or o.name in ("Bucket cutting edge","Boom main box","Stick main box","Counterweight","Engine hood","Upper chassis","Undercarriage bridge")):
        proxy_for(o)
for side in (-1,1):
    p=box("Track collider "+str(side),(0,side*1.05,.57),(3.92,.69,1.04),None,base,0)
    move_to(p,collision);p.name="COL_Track_"+str(side);p.hide_render=True;p.hide_set(True);p["collision_shape"]="cuboid";proxies.append(p)
p=box("Cab collider",(.03,-.56,2.43),(1.72,1.06,1.53),None,upper,0)
move_to(p,collision);p.name="COL_Cab";p.hide_render=True;p.hide_set(True);p["collision_shape"]="cuboid";proxies.append(p)
# Studio presentation.
groundmat=mat("Studio | warm grey",(.19,.215,.23),.05,.68)
ground=box("Studio floor",(0,0,-.055),(200,200,.10),groundmat,None,0);move_to(ground,studio)
world=bpy.data.worlds.new("Studio world");scene.world=world;world.use_nodes=True
world.node_tree.nodes["Background"].inputs[0].default_value=(.32,.40,.49,1)
world.node_tree.nodes["Background"].inputs[1].default_value=.45
def area_light(name,pos,power,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=pos;o.rotation_euler=(Vector((1,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
area_light("Key softbox",(1,-6,10),2300,(1,.86,.69),7)
area_light("Cool fill",(4,5,6),1800,(.65,.79,1),6)
area_light("Rear rim",(-5,1,7),2600,(1,.88,.65),5)
camdata=bpy.data.cameras.new("Presentation camera");cam=bpy.data.objects.new("Presentation camera",camdata);studio.objects.link(cam)
cam.location=(10,-13,8);cam.rotation_euler=(Vector((1.5,0,1.9))-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO';camdata.ortho_scale=10.0;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=OUT+"/excavator-preview.png"
scene.view_settings.view_transform='AgX'
bpy.context.view_layer.update()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.overlay.show_overlays=False
print("Rig, collision proxies and studio complete", len(proxies))

