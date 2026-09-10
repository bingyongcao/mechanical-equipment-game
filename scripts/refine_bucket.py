"""Revise the existing bucket; run with Blender --background excavator.blend --python this_file.
Idempotent: only named bucket surfaces/proxies are replaced. Export preserves the rest of the machine.
"""
import bpy, bmesh, math, json, os
from pathlib import Path
from mathutils import Vector, Matrix

OUT = str(Path(__file__).resolve().parents[1] / "assets" / "excavator")
scene = bpy.data.scenes["Excavator_Studio"]
bpy.context.window.scene = scene
asset = bpy.data.collections["EXCAVATOR"]
collision = bpy.data.collections["COLLISION_PROXIES"]
bucket = bpy.data.objects["J_Bucket"]
for name in ("J_Slew","J_Boom","J_Stick","J_Bucket"):
    bpy.data.objects[name].rotation_euler=(0,0,0)
bpy.context.view_layer.update()
steel = bpy.data.materials["Steel | charcoal"]
chrome = bpy.data.materials["Hydraulics | polished chrome"]
trackmat = bpy.data.materials["Tracks | worn manganese steel"]

def prism_mesh(name, outline, y0, y1):
    n=len(outline)
    vertices=[(x,y,z) for y in (y0,y1) for x,z in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name)
    me.from_pydata(vertices,[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(me);bm.free()
    return me

def surface(name, outline, y0, y1, material, bevel=.004):
    old=bpy.data.objects.get(name)
    if old: bpy.data.objects.remove(old,do_unlink=True)
    proxy=bpy.data.objects.get("COL_"+name)
    if proxy: bpy.data.objects.remove(proxy,do_unlink=True)
    me=prism_mesh(name,outline,y0,y1)
    # Geometry supplied in the original Blender world frame.
    me.transform(bucket.matrix_world.inverted())
    obj=bpy.data.objects.new(name,me);asset.objects.link(obj);obj.parent=bucket
    obj.data.materials.append(material)
    mod=obj.modifiers.new("Small edge bevel","BEVEL");mod.width=bevel;mod.segments=2
    obj.modifiers.new("Weighted normals","WEIGHTED_NORMAL")
    proxy=bpy.data.objects.new("COL_"+name,me.copy());collision.objects.link(proxy)
    proxy.parent=bucket;proxy.hide_render=True;proxy.hide_set(True);proxy.display_type='WIRE'
    proxy["collision_shape"]="convex_hull"

profile=[(4.43,1.47),(4.11,1.10),(4.08,.70),(4.30,.36),(4.76,.30),(5.35,.30)]
for side in (-1,1):
    surface("Bucket side plate "+str(side),profile,side*.58-.025,side*.58+.025,trackmat)
for i in range(len(profile)-1):
    ax,az=profile[i];bx,bz=profile[i+1]
    length=math.hypot(bx-ax,bz-az)
    # 4 cm floor/back thickness; shared endpoints with no upright entrance step.
    nx=-(bz-az)/length*.020;nz=(bx-ax)/length*.020
    surface("Bucket shell segment "+str(i),[(ax+nx,az+nz),(bx+nx,bz+nz),(bx-nx,bz-nz),(ax-nx,az-nz)],-.585,.585,trackmat)
surface("Bucket cutting edge",[(5.20,.320),(5.58,.267),(5.58,.253),(5.20,.280)],-.615,.615,chrome,.002)
for i,yy in enumerate((-.48,-.24,0,.24,.48)):
    name="Bucket tooth" + ("" if i==0 else "."+str(i).zfill(3))
    surface(name,[(5.39,.294),(5.82,.267),(5.82,.255),(5.39,.269)],yy-.055,yy+.055,chrome,.002)
bpy.context.view_layer.update()
# Recover export inputs from the saved rig, rather than depending on a live MCP namespace.
old_rig=json.loads(Path(OUT,"excavator.rig.json").read_text(encoding="utf-8"))
hydraulics=old_rig["hydraulics"]
root=bpy.data.objects["Excavator_ROOT"];base=bpy.data.objects["J_Base"]
upper=bpy.data.objects["J_Slew"];boom=bpy.data.objects["J_Boom"];stick=bpy.data.objects["J_Stick"]
rocker=bpy.data.objects["J_BucketRocker"];link=bpy.data.objects["J_BucketLink"];target=bpy.data.objects["Bucket_link_target"]
r=old_rig["bucketLinkage"]["rockerLength"];l=old_rig["bucketLinkage"]["linkLength"]
B=Vector((4.65,2.24));D=Vector((4.03,2.31))
proxies=list(collision.objects)
tests=[]
for degrees in (-48,-24,0,24,48):
    bucket.rotation_euler.y=math.radians(degrees);bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get()
    error=((link.evaluated_get(dg).matrix_world@Vector((0,0,l)))-target.evaluated_get(dg).matrix_world.translation).length
    tests.append({"bucket_deg":degrees,"link_closure_error_m":error})
assert max(t["link_closure_error_m"] for t in tests)<.0001,tests
bucket.rotation_euler.y=0;bpy.context.view_layer.update()
exec(compile(Path(__file__).with_name("model_excavator_05.py").read_text(encoding="utf-8"),"export","exec"),globals())
# Publish the same cross-section for runtime cavity tests / assist geometry.
rig_path=Path(OUT,"excavator.rig.json")
updated=json.loads(rig_path.read_text(encoding="utf-8"))
updated["version"]=2
updated["bucketGeometry"]={
    "innerProfileXY":[[round(x-4.5,6),round(z-1.47,6)] for x,z in profile],
    "innerHalfWidth":.55,
    "skidPoint":[1.08,-1.217,0],
    "cuttingEdgeThickness":.014,
    "toothTipThickness":.012,
    "description":"Thin continuous wedge, matching visual and collision geometry; no below-ground allowance."
}
rig_path.write_text(json.dumps(updated,ensure_ascii=False,indent=2),encoding="utf-8")
print("BUCKET_V2_COMPLETE")

