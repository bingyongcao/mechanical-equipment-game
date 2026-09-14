"""Export both assets, document joints and create studio preview."""
def select_tree(root):
 bpy.ops.object.select_all(action='DESELECT')
 for o in [root]+list(root.children_recursive): o.select_set(True)
 bpy.context.view_layer.objects.active=root
def export_asset(root,folder,name):
 out=BASE/folder; out.mkdir(exist_ok=True,parents=True)
 loc=root.location.copy(); root.location=(0,0,0); bpy.context.view_layer.update()
 select_tree(root)
 bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),use_selection=True,export_format='GLB',export_extras=True,export_animations=False)
 root.location=loc
 return out
co=export_asset(crane,'truck-crane','truck-crane')
so=export_asset(ship,'cargo-ship','cargo-ship')
rig={'units':'meters','blender_axes':'X forward, Z up','gltf_axes':'X forward, Y up; (x,y,z) -> (x,z,-y)','controls':{'slew':{'node':'J_Slew','blender_axis':'Z','gltf_axis':'Y'},'boom':{'node':'J_BoomPitch','blender_axis':'Y','gltf_axis':'Z','blender_limits_degrees':[-75,-15]},'telescope':{'nodes':['J_Telescope_1','J_Telescope_2','J_Telescope_3'],'axis':'X','local_translation_limits':[.6,2.6]},'hoist':{'node':'J_Hook','rope':'WireRope','vertical_frame':'J_RopeVertical','length_limits':[.8,12],'rest_length':4.2}},'attachments':{'tip':'A_BoomTip','cargo':'A_CargoAttach'},'runtime_required':['Keep J_RopeVertical world rotation aligned to TruckCrane; Blender constraint is not exported','Change WireRope midpoint/scale together with J_Hook position','Update hydraulic mount aim and piston extension after boom pitch changes','Implement collisions and grab/release in game; no game code is changed']}
(co/'truck-crane.rig.json').write_text(json.dumps(rig,indent=2),encoding='utf-8')
(so/'cargo-ship.rig.json').write_text(json.dumps({'units':'meters','cargo_nodes':[o.name for o in crates],'grab_anchor_prefix':'A_GrabPoint','deck_height_blender_z':1.45,'note':'Reparent cargo to crane hook preserving world transform on pickup; hull collider must not enclose the cargo deck.'},indent=2),encoding='utf-8')
floor=box('StudioGround',(0,4,-.18),(200,200,.2),mat('StudioFloor',(.12,.17,.21)),None,0)
scene.world=bpy.data.worlds.new('HarborStudioWorld'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.4,.5,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
for name,loc,power,size in [('Key',(4,-8,19),3300,10),('Fill',(-10,5,14),2500,10),('Rim',(7,15,18),4000,8)]:
 d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.shape='DISK'; d.size=size
 o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=loc; o.rotation_euler=(Vector((0,4,2))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('PresentationCamera'); cam=bpy.data.objects.new('PresentationCamera',d); scene.collection.objects.link(cam)
cam.location=(23,-29,23); cam.rotation_euler=(Vector((1,4,3))-cam.location).to_track_quat('-Z','Y').to_euler(); d.type='ORTHO'; d.ortho_scale=27; scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=1400; scene.render.resolution_y=1050; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for a in bpy.context.screen.areas:
 if a.type=='VIEW_3D':
  a.spaces.active.region_3d.view_perspective='CAMERA'; a.spaces.active.shading.color_type='MATERIAL'
scene.render.filepath=str(co/'crane-and-ship-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(co/'crane-and-ship.blend'))
print('Saved blend and GLBs',str(co),str(so))
