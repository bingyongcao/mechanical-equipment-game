"""Assemble separate asset files for PNG review; never save a combined .blend."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

BASE=Path('D:/repos/mechanical-equipment-game/assets/tower-construction')
ns={}
exec(compile((BASE.parents[1]/'scripts/model_tower_assets.py').read_text(encoding='utf8'),'model_tower_assets.py','exec'),ns)
scene=bpy.data.scenes.new('TC_Assembly_Review_UNSAVED')
bpy.context.window.scene=scene

def copy_asset(asset,pos=(0,0,0),suffix=''):
    source=bpy.data.scenes.get('TC_'+asset)
    if source is None:
        with bpy.data.libraries.load(str(BASE/asset/(asset+'.blend')),link=False) as (a,b):
            b.scenes=list(a.scenes)
        source=b.scenes[0]
    roots=[o for o in source.objects if o.parent is None and o.type=='EMPTY']
    assert len(roots)==1,(asset,roots)
    original=roots[0]
    objects=[original]+list(original.children_recursive)
    mapping={o:o.copy() for o in objects}
    for old,new in mapping.items():
        scene.collection.objects.link(new)
        new.parent=mapping.get(old.parent)
    root=mapping[original]; root.location=pos
    root.name='Review_'+asset+suffix
    return root

copy_asset('site-environment')
copy_asset('tower-crane',(0,0,.05))
copy_asset('construction-building',(12,3,.05))
for i,p in enumerate([(-22,15,.05),(-6,17,.05),(16,18,.05),(-23,-8,.05)]):
    copy_asset('residential-building',p,str(i))
for asset,x in [('rebar-bundle',5),('brick-pallet',10),('gypsum-stack',15)]:
    copy_asset(asset,(x,-10,.05))
ns['SCENE']=scene
ns['studio']((80,-104,81),(0,0,4),119)
scene.render.resolution_x=1600
scene.render.resolution_y=1100
scene.render.filepath=str(BASE/'site-overview.png')
bpy.ops.render.render(write_still=True)
scene.camera.location=(47,-66,46)
scene.camera.rotation_euler=(Vector((6,0,14))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=62
scene.render.filepath=str(BASE/'construction-detail.png')
bpy.ops.render.render(write_still=True)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_location=(6,0,14)
        area.spaces.active.region_3d.view_distance=80
        area.spaces.active.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
print(json.dumps({'preview_scene':scene.name,'objects':len(scene.objects),'saved_blend':False}))
