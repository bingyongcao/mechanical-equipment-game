"""Render the exported game asset, using the saved Blender studio lighting."""
import bpy
from pathlib import Path

out = Path(__file__).resolve().parents[1] / "assets" / "excavator"
source = bpy.data.scenes["Excavator_Studio"]
preview = bpy.data.scenes.new("Export_preview")
bpy.context.window.scene = preview
bpy.ops.import_scene.gltf(filepath=str(out / "excavator.glb"))
for obj in bpy.data.collections["STUDIO"].objects:
    preview.collection.objects.link(obj)
preview.world = source.world
preview.camera = source.camera
preview.render.engine = 'CYCLES'
preview.cycles.samples = 48
preview.cycles.use_denoising = True
preview.render.resolution_x = 1600
preview.render.resolution_y = 1100
preview.render.resolution_percentage = 100
preview.render.image_settings.file_format = 'PNG'
preview.render.filepath = str(out / "excavator-preview.png")
preview.view_settings.view_transform = 'AgX'
bpy.ops.render.render(write_still=True)
