# Refine the neutral linkage geometry to allow a useful bucket sweep.
newB=Vector((4.65,0,2.24));oldB=Vector((4.48,0,2.02));shift=newB-oldB
for o in rocker.children:
    if o.type=='MESH' and o.name.startswith("Bucket rocker"):
        for v in o.data.vertices:
            if v.co.x>4.3:v.co+=shift
link.location+=shift
bpy.data.objects["Bucket ram_tip_anchor"].location+=shift
# The pin is a sibling of the anchor in this generated assembly.
for o in rocker.children:
    if o.type=='MESH' and o.name.startswith("Bucket ram_pin"):
        o.location+=shift
B=Vector((4.65,2.24));D=Vector((4.03,2.31));C=Vector((4.76,1.50))
r=(B-D).length;l=(C-B).length
for o in list(link.children):bpy.data.objects.remove(o,do_unlink=True)
for yy in (-.31,.31):
    o=cyl("Bucket connecting link",(0,yy,0),(0,yy,l),.055,trackmat,None,16)
    o.parent=link;o.matrix_parent_inverse.identity();o.location=(0,yy,l/2);o.rotation_mode='XYZ';o.rotation_euler=(0,0,0)
# Use short built-in expressions; Blender driver expressions are limited in length.
rocker.driver_remove("rotation_euler",1)
for prop,expr in [("cx","0.47+0.26*cos(t)+0.03*sin(t)"),("cz","-0.84-0.26*sin(t)+0.03*cos(t)")]:
    rocker[prop]=0.0
    dr=rocker.driver_add('["'+prop+'"]').driver
    vv=dr.variables.new();vv.name='t';vv.type='SINGLE_PROP';vv.targets[0].id=bucket;vv.targets[0].data_path='rotation_euler[1]'
    dr.expression=expr
dr=rocker.driver_add("rotation_euler",1).driver
for prop in ("cx","cz"):
    vv=dr.variables.new();vv.name=prop;vv.type='SINGLE_PROP';vv.targets[0].id=rocker;vv.targets[0].data_path='["'+prop+'"]'
dr.expression=f"{math.atan2((B-D).y,(B-D).x):.12f}-atan2(cz,cx)-acos(max(-1,min(1,({r*r-l*l:.12f}+cx*cx+cz*cz)/({2*r:.12f}*sqrt(cx*cx+cz*cz)))))"
bpy.data.objects["Boom designation"].rotation_euler=(math.pi/2,-.72,0)
tests=[]
for angle in (-48,-24,0,24,48):
    bucket.rotation_euler[1]=math.radians(angle)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get()
    endpoint=link.evaluated_get(dg).matrix_world@Vector((0,0,l))
    err=(endpoint-target.evaluated_get(dg).matrix_world.translation).length
    tests.append({"bucket_deg":angle,"link_closure_error_m":err})
bucket.rotation_euler[1]=0;bpy.context.view_layer.update()
print(json.dumps(tests))
print('Drivers:',[(f.data_path,f.driver.is_valid,len(f.driver.expression)) for f in rocker.animation_data.drivers])
assert max(t["link_closure_error_m"] for t in tests)<.0001,"Linkage closure failed"

