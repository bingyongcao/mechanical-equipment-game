import struct
from mathutils import Matrix
bpy.context.view_layer.update()
dg=bpy.context.evaluated_depsgraph_get()
hyd_names={h[k] for h in hydraulics for k in ("barrel","rod")}
# Snapshot evaluated transforms before creating a temporary export scene.
source_objects=list(asset.objects)
worlds={o.name:o.evaluated_get(dg).matrix_world.copy() for o in source_objects}
kept=[o for o in source_objects if o.type=='EMPTY' or o.name in hyd_names]
export_scene=bpy.data.scenes.new("Excavator_Export_Temporary")
mapping={}
for o in kept:
    cp=bpy.data.objects.new(o.name+"_EXPORT",None);export_scene.collection.objects.link(cp)
    for k in o.keys():cp[k]=o[k]
    mapping[o.name]=cp
for o in kept:
    cp=mapping[o.name]
    if o.parent and o.parent.name in mapping:
        cp.parent=mapping[o.parent.name]
        cp.matrix_basis=worlds[o.parent.name].inverted()@worlds[o.name]
    else:cp.matrix_basis=worlds[o.name]
groups={}
for o in source_objects:
    if o.type not in ('MESH','CURVE'):continue
    if o.name in hyd_names:key=o.name
    else:
        p=o.parent
        while p and p.name not in mapping:p=p.parent
        key=p.name if p else root.name
    groups.setdefault(key,[]).append(o)
for key,items in groups.items():
    verts=[];faces=[];material_indices=[];smooth=[];materials=[];corner_normals=[]
    for o in items:
        ev=o.evaluated_get(dg)
        me=bpy.data.meshes.new_from_object(ev,depsgraph=dg)
        transform=worlds[key].inverted()@worlds[o.name]
        normal_transform=transform.to_3x3().inverted().transposed()
        start=len(verts)
        verts.extend([tuple(transform@v.co) for v in me.vertices])
        remap=[]
        for m in me.materials:
            if m not in materials:materials.append(m)
            remap.append(materials.index(m))
        for p in me.polygons:
            faces.append(tuple(start+i for i in p.vertices))
            material_indices.append(remap[p.material_index] if remap else 0)
            smooth.append(p.use_smooth)
            corner_normals.extend([tuple((normal_transform@me.corner_normals[i].vector).normalized()) for i in p.loop_indices])
        bpy.data.meshes.remove(me)
    me=bpy.data.meshes.new("Geometry_"+key);me.from_pydata(verts,[],faces);me.update()
    for m in materials:me.materials.append(m)
    for i,p in enumerate(me.polygons):p.material_index=material_indices[i];p.use_smooth=True
    me.normals_split_custom_set(corner_normals)
    meshobj=bpy.data.objects.new("Mesh_"+key+"_EXPORT",me);export_scene.collection.objects.link(meshobj);meshobj.parent=mapping[key]
# Collision geometry in the local frame of its owning joint, converted to glTF Y-up.
physics=[]
for o in proxies:
    p=o.parent
    while p and p.name not in mapping:p=p.parent
    key=p.name if p else base.name
    transform=worlds[key].inverted()@o.matrix_world
    vv=[transform@v.co for v in o.data.vertices]
    physics.append({"name":o.name,"parent":key,"shape":"convex_hull","vertices":[[round(v.x,6),round(v.z,6),round(-v.y,6)] for v in vv]})
bpy.context.window.scene=export_scene
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=OUT+"/excavator.glb",export_format='GLB',use_active_scene=True,export_extras=True,export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
# Strip temporary suffixes in the self-contained GLB JSON chunk.
path=OUT+"/excavator.glb"
raw=open(path,'rb').read();json_len,kind=struct.unpack_from('<II',raw,12)
doc=json.loads(raw[20:20+json_len])
for node in doc.get('nodes',[]):
    if 'name' in node:node['name']=node['name'].removesuffix('_EXPORT')
payload=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf-8')
payload+=b' '*((-len(payload))%4)
tail=raw[20+json_len:]
open(path,'wb').write(struct.pack('<III',0x46546c67,2,20+len(payload)+len(tail))+struct.pack('<II',len(payload),0x4e4f534a)+payload+tail)
bpy.context.window.scene=scene
for o in list(export_scene.objects):
    data=o.data;bpy.data.objects.remove(o,do_unlink=True)
    if data and data.users==0 and isinstance(data,bpy.types.Mesh):bpy.data.meshes.remove(data)
bpy.data.scenes.remove(export_scene)
rig={
"version":1,"units":"meters","coordinates":{"glbUp":"+Y","glbForward":"+X","blenderUp":"+Z","blenderForward":"+X"},
"joints":[{"node":o.name,"axis":[0,1,0] if o==upper else [0,0,-1],"limitsDegrees":list(o["limits_deg_relative_rest"]),"label":o["part_label"]} for o in (upper,boom,stick,bucket)],
"hydraulics":hydraulics,
"bucketLinkage":{"rocker":rocker.name,"link":link.name,"target":target.name,"pivotInStickXZ":[4.03,2.31],"bucketPivotInStickXZ":[4.5,1.47],"lugOffsetXZ":[.26,.03],"rockerLength":r,"linkLength":l,"rockerRestAngle":math.atan2((B-D).y,(B-D).x),"note":"XZ values use the Blender rest frame; runtime needs to reproduce linkage and hydraulic constraints because glTF does not store Blender drivers."},
"annotations":[{"node":o.name,"text":o["label_zh"]} for o in source_objects if "label_zh" in o],
"limitations":["Illustrative excavator, not a manufacturer dimensional replica.","Joint limits are provisional, not validated for whole-machine self-collision.","Track shoes are static in the optimized GLB; tread motion requires runtime animation or a separate animated track asset.","Physics proxies are supplied separately and require a physics engine.","Hydraulic and linkage constraints must be implemented at runtime."]
}
open(OUT+"/excavator.rig.json",'w',encoding='utf-8').write(json.dumps(rig,ensure_ascii=False,indent=2))
open(OUT+"/excavator.physics.json",'w',encoding='utf-8').write(json.dumps({"units":"meters","up":"+Y","colliders":physics},ensure_ascii=False,indent=2))
stats={"nodes":len(doc["nodes"]),"meshes":len(doc.get("meshes",[])),"primitives":sum(len(m["primitives"]) for m in doc.get("meshes",[])),"triangles":sum(doc["accessors"][p["indices"]]["count"]//3 for m in doc.get("meshes",[]) for p in m["primitives"]),"glbBytes":os.path.getsize(path),"collisionHulls":len(physics),"linkageTests":tests}
open(OUT+"/validation.json",'w').write(json.dumps(stats,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=OUT+"/excavator.blend")
print(json.dumps(stats))
