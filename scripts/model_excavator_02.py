# Cabin with independent glazing, frame, interior and safety details.
cabpoly=[(-.78,1.66),(.94,1.66),(1.03,2.56),(.71,3.14),(-.72,3.14)]
prism("Cab structural shell",cabpoly,-1.03,-.96,dark,upper,.03)
prism("Cab inner side",cabpoly,-.12,-.07,dark,upper,.03)
sideglass=[(-.64,1.97),(.79,1.97),(.88,2.54),(.62,3.0),(-.62,3.0)]
prism("Cab door glazing",sideglass,-1.055,-1.035,glass,upper,.012)
prism("Cab inner glazing",sideglass,-.07,-.05,glass,upper,.012)
box("Cab floor",(.02,-.56,1.73),(1.71,1.03,.17),yellow,upper,.05)
box("Cab roof",(-.02,-.56,3.16),(1.64,1.10,.13),yellow,upper,.06)
# Forward windshield laid along sloping front profile.
prism("Front windshield",[(.963,2.10),(1.008,2.56),(.715,3.10),(.685,3.075),(.975,2.55),(.93,2.10)],-.94,-.14,glass,upper,.004)
for yy in (-1.075,-.045):
    for i in range(len(cabpoly)):
        a=cabpoly[i];b=cabpoly[(i+1)%len(cabpoly)]
        cyl("Cab frame",(a[0],yy,a[1]),(b[0],yy,b[1]),.036,dark,upper,12)
    cyl("Window divider",(.17,yy,1.92),(.17,yy,3.07),.027,dark,upper,12)
box("Door lower panel",(-.01,-1.079,1.87),(1.47,.043,.25),yellow,upper,.025)
box("Door handle",(.37,-1.12,2.08),(.21,.05,.035),chrome,upper,.01)
box("Seat cushion",(-.23,-.55,2.12),(.49,.48,.13),seatmat,upper,.06)
back=box("Seat back",(-.46,-.55,2.38),(.13,.49,.49),seatmat,upper,.06);back.rotation_euler[1]=-.13
box("Seat pedestal",(-.23,-.55,1.92),(.27,.29,.30),dark,upper)
for yy in (-.89,-.23):
    box("Control console",(.05,yy,2.1),(.57,.15,.16),dark,upper,.04)
    cyl("Joystick",(.20,yy,2.16),(.17,yy,2.37),.022,rubber,upper,12)
box("Instrument display",(.59,-.56,2.25),(.12,.47,.25),dark,upper,.025)
for zz in (1.13,1.43):
    box("Access step",(.38,-1.24,zz),(.78,.28,.075),trackmat,upper,.015)
cyl("Grab rail",(.78,-1.12,1.67),(.78,-1.12,2.18),.025,chrome,upper,12)
cyl("Mirror stalk",(.7,-1.02,2.94),(.89,-1.35,2.92),.023,dark,upper,12)
box("Mirror housing",(.90,-1.36,2.87),(.16,.075,.25),dark,upper,.04)
box("Mirror face",(.91,-1.404,2.87),(.125,.008,.20),chrome,upper,.018)
for yy in (-.91,-.20):
    box("Work lamp",(.76,yy,3.12),(.14,.21,.13),dark,upper)
    box("Work lamp lens",(.84,yy,3.12),(.016,.17,.09),lightmat,upper,.008)
cyl("Beacon base",(-.49,-.54,3.23),(-.49,-.54,3.28),.105,dark,upper)
cyl("Amber beacon",(-.49,-.54,3.28),(-.49,-.54,3.43),.083,orange,upper)
# Boom is a bent welded box section. Stick and bucket have their own pivots.
prism("Boom main box",[(.44,1.66),(.88,1.60),(2.04,3.05),(3.15,3.97),(3.17,4.24),(2.86,4.32),(1.68,3.54)],-.24,.24,yellow,boom,.055)
for yy in (-.255,.255):
    prism("Boom cheek reinforcement",[(.42,1.68),(.76,1.55),(1.12,1.99),(.79,2.22),(.49,2.05)],yy-.035,yy+.035,yellow,boom,.03)
prism("Stick main box",[(2.88,4.31),(3.23,4.29),(3.50,3.59),(4.67,1.55),(4.53,1.30),(4.29,1.42),(3.08,3.31)],-.19,.19,yellow,stick,.04)
for name,pos,par,r,w in [("Boom pivot",(.62,0,1.78),boom,.17,.72),("Boom stick pin",(3.05,0,4.12),stick,.145,.65),("Bucket pivot",(4.5,0,1.47),bucket,.12,.64)]:
    x,y,z=pos
    cyl(name,(x,-w/2,z),(x,w/2,z),r,dark,par,32)
    for side in (-1,1):
        cyl(name+" cap",(x,side*w/2,z),(x,side*(w/2+.045),z),r*.76,chrome,par,24)
# Hollow bucket: side plates and a segmented curved back/bottom, with an open mouth.
profile=[(4.43,1.47),(4.11,1.10),(4.08,.70),(4.30,.38),(4.76,.27),(5.35,.34)]
for side in (-1,1):
    prism("Bucket side plate "+str(side),profile,side*.58-.035,side*.58+.035,trackmat,bucket,.015)
for i in range(len(profile)-1):
    a=Vector((profile[i][0],0,profile[i][1]));b=Vector((profile[i+1][0],0,profile[i+1][1]))
    mid=(a+b)/2
    plate=box("Bucket shell segment %d"%i,mid,((b-a).length,1.17,.065),trackmat,bucket,.01)
    plate.rotation_euler[1]=-math.atan2((b-a).z,(b-a).x)
box("Bucket cutting edge",(5.30,0,.355),(.18,1.25,.09),chrome,bucket,.01)
for yy in (-.48,-.24,0,.24,.48):
    prism("Bucket tooth",[(5.27,.39),(5.68,.27),(5.59,.21),(5.25,.29)],yy-.067,yy+.067,chrome,bucket,.012)
for yy in (-.34,.34):
    prism("Bucket mounting ear",[(4.25,1.15),(4.36,1.57),(4.54,1.62),(4.68,1.44),(4.53,1.21)],yy-.065,yy+.065,yellow,bucket,.022)
# Anchor-based hydraulic assemblies. Fixed barrel and rod lengths overlap as they telescope.
hydraulics=[]
def hydraulic(name,a,b,pa,pb,r=.085):
    a,b=Vector(a),Vector(b);dist=(b-a).length
    aa=empty(name+"_base_anchor",a,pa);bb=empty(name+"_tip_anchor",b,pb)
    barrel=cyl(name+"_barrel",a,a+Vector((0,0,dist*.60)),r,yellow,None)
    rod=cyl(name+"_rod",b,b+Vector((0,0,dist*.67)),r*.47,chrome,None)
    # Put the cylinder mesh origin at the endpoint so it aims around the pin.
    for obj,anchor,target,start in [(barrel,aa,bb,a),(rod,bb,aa,b)]:
        for v in obj.data.vertices:v.co.z+=obj.dimensions.z/2
        obj.location=start
        bpy.context.view_layer.update()
        w=obj.matrix_world.copy();obj.parent=anchor;obj.matrix_world=w
        co=obj.constraints.new('DAMPED_TRACK');co.target=target;co.track_axis='TRACK_Z'
    hydraulics.append({"name":name,"base":aa.name,"tip":bb.name,"barrel":barrel.name,"rod":rod.name,"barrelLength":dist*.60,"rodLength":dist*.67})
    for pt,par in [(a,pa),(b,pb)]:
        cyl(name+"_pin",pt+Vector((0,-r*1.55,0)),pt+Vector((0,r*1.55,0)),r*.85,dark,par,20)
for yy in (-.34,.34):
    hydraulic("Boom lift "+str(yy),(.78,yy,1.54),(1.83,yy,3.21),upper,boom,.095)
hydraulic("Stick ram",(1.88,0,3.68),(3.24,0,4.43),boom,stick,.09)
# Bell crank mounted to stick; bucket link closes the four-bar loop in the neutral pose.
rocker=empty("J_BucketRocker",(4.03,0,2.31),stick)
cyl("Rocker pivot",(4.03,-.32,2.31),(4.03,.32,2.31),.10,dark,rocker)
for yy in (-.27,.27):
    prism("Bucket rocker",[(3.95,2.34),(4.08,2.42),(4.53,2.07),(4.48,1.94)],yy-.035,yy+.035,yellow,rocker,.016)
link=empty("J_BucketLink",(4.48,0,2.02),rocker)
for yy in (-.31,.31):
    cyl("Bucket connecting link",(4.48,yy,2.02),(4.76,yy,1.50),.055,trackmat,link,16)
prism("Bucket link lug",[(4.47,1.37),(4.70,1.61),(4.85,1.58),(4.78,1.30)],-.16,.16,yellow,bucket,.025)
cyl("Bucket link pin",(4.76,-.38,1.50),(4.76,.38,1.50),.09,chrome,bucket)
hydraulic("Bucket ram",(3.25,0,3.91),(4.48,0,2.02),stick,rocker,.072)
# Thin hydraulic hoses, parented to the boom; flexible crossings are left to runtime.
def hose(name,pts,parent):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=.017;cu.bevel_resolution=2
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for bp,pt in zip(sp.bezier_points,pts):bp.co=pt;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cu);asset.objects.link(o);o.data.materials.append(rubber)
    bpy.context.view_layer.update();w=o.matrix_world.copy();o.parent=parent;o.matrix_world=w
for yy in (-.17,.17):
    hose("Boom hydraulic hose",[(.52,yy,2.12),(.94,yy,2.78),(1.69,yy,3.61),(2.39,yy,4.08),(2.93,yy,4.30)],boom)
# Labels become named anchors for Three.js DOM annotations.
for name,pt,par in [("动臂",(1.65,-.27,3.15),boom),("斗杆",(3.79,-.23,2.94),stick),("铲斗",(4.68,-.64,.65),bucket),("连杆",(4.55,-.36,1.82),link),("驾驶室",(.0,-1.13,2.65),upper),("履带",(-.2,-1.43,.60),base),("液压缸",(1.30,-.48,2.30),boom)]:
    o=empty("Label_"+name,pt,par);o["label_zh"]=name
print("Cab and working equipment complete",len(asset.objects))

