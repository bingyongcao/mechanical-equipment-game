"""Render the tower-crane card thumbnail and 16:9 mission preview."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

BASE = Path("D:/repos/mechanical-equipment-game/assets")
TOWER = BASE / "tower-construction"


def set_world(scene, color, strength):
    world = bpy.data.worlds.new(scene.name + "_World")
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs["Color"].default_value = (*color, 1)
    background.inputs["Strength"].default_value = strength
    scene.world = world


def add_camera(scene, name, position, target, lens=52, ortho=None):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    if ortho is None:
        data.type = "PERSP"
        data.lens = lens
    else:
        data.type = "ORTHO"
        data.ortho_scale = ortho
    scene.camera = obj
    return obj


def add_sun(scene, rotation, energy, color):
    data = bpy.data.lights.new("PreviewSun", "SUN")
    data.energy, data.color, data.angle = energy, color, math.radians(18)
    obj = bpy.data.objects.new("PreviewSun", data)
    scene.collection.objects.link(obj)
    obj.rotation_euler = rotation


def add_area(scene, name, position, target, energy, color, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.shape, data.size = energy, color, "DISK", size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def configure(scene, width, height, output):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.view_settings.look = "AgX - Medium High Contrast"


def copy_asset(scene, asset, position=(0, 0, 0), suffix=""):
    path = TOWER / asset / f"{asset}.blend"
    with bpy.data.libraries.load(str(path), link=False) as (source, dest):
        dest.scenes = list(source.scenes)
    source_scene = dest.scenes[0]
    roots = [o for o in source_scene.objects if o.parent is None and o.type == "EMPTY"]
    assert len(roots) == 1, (asset, [o.name for o in roots])
    root = roots[0]
    objects = [root] + list(root.children_recursive)
    mapping = {old: old.copy() for old in objects}
    for old, new in mapping.items():
        scene.collection.objects.link(new)
        new.parent = mapping.get(old.parent)
    result = mapping[root]
    result.name = "Preview_" + asset + suffix
    result.location = position
    return result


def add_ground(scene, size, color):
    material = bpy.data.materials.new(scene.name + "_Ground")
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = 0.72
    bpy.context.window.scene = scene
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, -0.015))
    bpy.context.object.data.materials.append(material)


def render_thumbnail():
    scene = bpy.data.scenes.new("TowerCrane_Thumbnail")
    bpy.context.window.scene = scene
    crane = copy_asset(scene, "tower-crane")
    crane.rotation_euler.z = math.radians(-18)
    add_ground(scene, 160, (0.18, 0.205, 0.22))
    set_world(scene, (0.32, 0.40, 0.49), 0.42)
    add_sun(scene, (math.radians(28), math.radians(-34), math.radians(-32)), 2.0, (1.0, 0.83, 0.64))
    add_area(scene, "Key", (26, -34, 49), (4, 0, 17), 2100, (1.0, 0.86, 0.69), 18)
    add_area(scene, "Fill", (-28, -10, 31), (2, 0, 16), 1500, (0.64, 0.78, 1.0), 15)
    add_area(scene, "Rim", (-4, 28, 42), (0, 0, 19), 1900, (1.0, 0.88, 0.66), 12)
    add_camera(scene, "ThumbnailCamera", (50, -69, 42), (4, 0, 17.5), ortho=52)
    configure(scene, 1600, 1100, TOWER / "tower-crane" / "tower-crane-preview.png")
    bpy.ops.render.render(write_still=True)


def render_scene_preview():
    scene = bpy.data.scenes.new("TowerConstruction_ScenePreview")
    bpy.context.window.scene = scene
    copy_asset(scene, "site-environment")
    copy_asset(scene, "tower-crane", (0, 0, 0.05)).rotation_euler.z = math.radians(-4)
    building = copy_asset(scene, "construction-building", (12, 3, 0.05))
    for i, position in enumerate([(-22, 15, 0.05), (-6, 17, 0.05), (16, 18, 0.05), (-23, -8, 0.05)]):
        copy_asset(scene, "residential-building", position, str(i))
    for asset, x in [("rebar-bundle", 5), ("brick-pallet", 10), ("gypsum-stack", 15)]:
        copy_asset(scene, asset, (x, -10, 0.05))
    set_world(scene, (0.56, 0.68, 0.78), 0.5)
    add_sun(scene, (math.radians(32), math.radians(-25), math.radians(-38)), 2.4, (1.0, 0.82, 0.57))
    add_area(scene, "SceneFill", (-38, -24, 52), (2, 0, 6), 2200, (0.68, 0.82, 1.0), 25)
    add_area(scene, "SceneRim", (34, 30, 44), (4, 0, 10), 1800, (1.0, 0.86, 0.65), 20)
    cam = add_camera(scene, "SceneCamera", (77, -101, 75), (0, 0, 8), ortho=88)
    configure(scene, 1672, 941, BASE / "scenes" / "tower-construction-preview.png")
    bpy.ops.render.render(write_still=True)


render_thumbnail()
render_scene_preview()
print("Rendered tower thumbnail and 16:9 scene preview")
