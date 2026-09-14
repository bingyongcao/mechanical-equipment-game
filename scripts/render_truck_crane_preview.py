"""Render the truck crane alone from the combined editable Blender source."""
import bpy
from mathutils import Vector

scene = bpy.context.scene
crane = bpy.data.objects["TruckCrane"]
ship = bpy.data.objects.get("CargoShip")
if ship:
    for obj in [ship] + list(ship.children_recursive):
        obj.hide_render = True
crane.location = (0, 0, 0)

# Present the crane in its compact transport pose so the chassis can fill the
# thumbnail without cropping the boom. Telescope joints are nested, so every
# stage must be moved back to its minimum local offset.
for name in ("J_Telescope_1", "J_Telescope_2", "J_Telescope_3"):
    bpy.data.objects[name].location.x = 0.6

# Keep the hook readable in the compact composition.
hook = bpy.data.objects["J_Hook"]
hook.location.z = -2.4
rope = bpy.data.objects["WireRope"]
rope.location.z = -1.2
rope.dimensions.z = 2.4

# Match the excavator thumbnail's blue-grey environment, warm grey floor and
# warm-key/cool-fill studio lighting.
ground = bpy.data.objects["StudioGround"]
ground.hide_render = False
ground_material = ground.data.materials[0]
ground_material.diffuse_color = (0.19, 0.215, 0.23, 1)
ground_material.roughness = 0.68

scene.world.use_nodes = True
background = scene.world.node_tree.nodes["Background"]
background.inputs[0].default_value = (0.32, 0.40, 0.49, 1)
background.inputs[1].default_value = 0.45

lighting = {
    "Key": ((1, -6, 10), 2300, (1.0, 0.86, 0.69), 7),
    "Fill": ((4, 5, 6), 1800, (0.65, 0.79, 1.0), 6),
    "Rim": ((-5, 1, 7), 2600, (1.0, 0.88, 0.65), 5),
}
for name, (position, power, color, size) in lighting.items():
    light = bpy.data.objects[name]
    light.hide_render = False
    light.location = position
    light.data.energy = power
    light.data.color = color
    light.data.size = size
    light.rotation_euler = (Vector((0.7, 0, 2.2)) - light.location).to_track_quat("-Z", "Y").to_euler()

camera = bpy.data.objects["PresentationCamera"]
camera.location = (11, -14, 9)
camera.rotation_euler = (Vector((0.5, 0, 2.25)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 11.8
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.render.filepath = "D:/repos/mechanical-equipment-game/assets/truck-crane/truck-crane-preview.png"
bpy.context.view_layer.update()
bpy.ops.render.render(write_still=True)
