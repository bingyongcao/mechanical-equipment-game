"""Render crane cards in the excavator's studio without changing source assets.

Run with Blender --background --python scripts/render_machine_thumbnails.py.
The original bevel modifiers are retained; only presentation copies are styled.
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

BASE = Path(__file__).resolve().parents[1] / 'assets'


def enum(owner, prop, value):
    allowed = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    if value not in allowed:
        raise ValueError((prop, value, allowed))
    return value


def load_scene(path, root_prefix=None):
    with bpy.data.libraries.load(str(path), link=False) as (source, dest):
        dest.scenes = list(source.scenes)
    if root_prefix:
        return next(s for s in dest.scenes if any(o.name.startswith(root_prefix) for o in s.objects))
    return next(s for s in dest.scenes if s.name.startswith('Excavator_Studio'))


def bounds(objects):
    bpy.context.view_layer.update()
    return [o.matrix_world @ Vector(v) for o in objects
            if o.type == 'MESH' for v in o.bound_box]


def render_thumbnail(kind):
    studio = load_scene(BASE / 'excavator/excavator.blend')
    scene = bpy.data.scenes.new(kind + '_MatchedStudio')
    bpy.context.window.scene = scene
    for obj in studio.camera.users_collection[0].objects:
        scene.collection.objects.link(obj)
    scene.world = studio.world
    camera = studio.camera
    if kind == 'tower-crane':
        camera.rotation_euler = Vector((-50, 69, -24.5)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    scene.view_settings.view_transform = studio.view_settings.view_transform
    scene.view_settings.look = studio.view_settings.look
    path = (BASE / 'truck-crane/crane-and-ship.blend' if kind == 'truck-crane'
            else BASE / 'tower-construction/tower-crane/tower-crane.blend')
    source = load_scene(path, 'TruckCrane' if kind == 'truck-crane' else 'TowerCrane')
    root = next(o for o in source.objects if o.parent is None and o.type == 'EMPTY'
                and (o.name.startswith('TruckCrane') if kind == 'truck-crane' else True))
    objects = [root] + list(root.children_recursive)
    for obj in objects:
        scene.collection.objects.link(obj)
        obj.hide_render = False
    if kind == 'truck-crane':
        for obj in objects:
            if obj.name.startswith('J_Telescope_'):
                obj.location.x = 0.6
            elif obj.name.startswith('J_Hook'):
                obj.location.z = -2.4
            elif obj.name.startswith('WireRope'):
                obj.location.z = -1.2
                obj.dimensions.z = 2.4
    else:
        root.rotation_euler.z = math.radians(-18)
    root.location = (0, 0, 0)
    points = bounds(objects)
    size = max(max(v[i] for v in points) - min(v[i] for v in points) for i in range(3))
    root.scale *= (7.6 if kind == 'truck-crane' else 5.8) / size
    points = bounds(objects)
    root.location -= Vector(((max(v.x for v in points) + min(v.x for v in points))/2,
                             (max(v.y for v in points) + min(v.y for v in points))/2,
                             min(v.z for v in points)))
    # Match the reference paint response, with reflections from its large softboxes.
    for material in {m for o in objects if o.type == 'MESH' for m in o.data.materials if m}:
        if not material.use_nodes:
            continue
        shader = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if shader is None:
            continue
        color = shader.inputs['Base Color'].default_value
        if color[0] > 0.4 and color[0] > color[1] * 1.3 and color[2] < 0.15:
            shader.inputs['Base Color'].default_value = (0.95, 0.49, 0.018, 1)
            shader.inputs['Metallic'].default_value = 0.32
            shader.inputs['Roughness'].default_value = 0.32
        if 'glass' in material.name.lower():
            shader.inputs['Roughness'].default_value = 0.14
            shader.inputs['Metallic'].default_value = 0.25
    for obj in objects:
        if obj.type == 'MESH':
            for modifier in obj.modifiers:
                if modifier.type == 'BEVEL':
                    modifier.segments = 3
    # Fit projected bounds, leaving at least 13% vertical and horizontal margins.
    points = bounds(objects)
    rotation = camera.rotation_euler.to_quaternion()
    inverse = rotation.inverted()
    projected = [inverse @ p for p in points]
    lo = Vector(tuple(min(p[i] for p in projected) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in projected) for i in range(3)))
    center = rotation @ ((lo + hi) / 2)
    camera.location = center + rotation @ Vector((0, 0, 20))
    camera.data.ortho_scale = max((hi.x-lo.x)/0.76, (hi.y-lo.y)/(1100/1600*0.74))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = enum(scene.render.image_settings, 'file_format', 'PNG')
    scene.render.film_transparent = False
    output = path.parent / (kind + '-preview.png')
    scene.render.filepath = str(output)
    bpy.context.view_layer.update()
    print('THUMBNAIL', kind, 'orthographic width', camera.data.ortho_scale, flush=True)
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    for kind in ('truck-crane', 'tower-crane'):
        render_thumbnail(kind)
