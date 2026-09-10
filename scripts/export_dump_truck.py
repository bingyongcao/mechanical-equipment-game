"""Export a batched game mesh, leaving editable source parts untouched."""
import bpy
from pathlib import Path
out=Path('D:/repos/mechanical-equipment-game/assets/dump-truck')
scene=bpy.context.scene
root=scene.objects['DumpTruck']
preserve={'Cab','Bed_Floor','Bed_Side_-1','Bed_Side_1','Bed_Front','Bed_Tailgate'}
source=[o for o in scene.objects if o.type=='MESH' and o.parent and o.parent.name in {'DumpTruck','J_Tipper','J_Tailgate'}]
copies=[]
deps=bpy.context.evaluated_depsgraph_get()
for o in source:
    mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps))
    copy=bpy.data.objects.new('EXPORT_'+o.name,mesh); scene.collection.objects.link(copy)
    copy.parent=o.parent; copy.matrix_world=o.matrix_world.copy(); copies.append(copy)
for parent in [root,scene.objects['J_Tipper'],scene.objects['J_Tailgate']]:
    group=[o for o in scene.objects if o.name.startswith('EXPORT_') and o.parent==parent and o.name[7:] not in preserve]
    if not group: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.object.join()
    group[0].name='EXPORT_'+parent.name+'_Details'
exportMeshes=[o for o in scene.objects if o.name.startswith('EXPORT_')]
bpy.ops.object.select_all(action='DESELECT')
for o in exportMeshes+[root,scene.objects['J_Tipper'],scene.objects['J_Tailgate']]: o.select_set(True)
# Temporarily free original names so collider identifiers stay exact in GLB.
renamed=[]
for o in exportMeshes:
    name=o.name[7:]
    original=scene.objects.get(name)
    if original: original.name='SOURCE_'+name; renamed.append((original,name))
    o.name=name
try:
    bpy.ops.export_scene.gltf(filepath=str(out/'dump-truck.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True)
finally:
    for o in exportMeshes: bpy.data.objects.remove(o,do_unlink=True)
    for o,name in renamed: o.name=name
print('Optimized export complete')
