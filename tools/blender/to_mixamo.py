"""Readies a generated figure for Mixamo's auto-rigger, which takes FBX, not glTF: feet centred on the origin, front facing -Y (Mixamo shows
it facing the camera), the original texture embedded so the rigged download keeps its colours.

usage: Blender -b --factory-startup -P tools/blender/to_mixamo.py -- <out dir> <name> [<name> ...]
reads ~/Downloads/<name>.glb, writes <out dir>/<name>.fbx.
"""
import os
import sys

import bpy

ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT, NAMES = ARGS[0], ARGS[1:]
os.makedirs(OUT, exist_ok=True)

for name in NAMES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.expanduser(f"~/Downloads/{name}.glb"))
    meshes = [item for item in bpy.data.objects if item.type == "MESH"]
    for item in meshes:
        item.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    points = [item.matrix_world @ v.co for item in meshes for v in item.data.vertices]
    low = min(p.z for p in points)
    feet = [p for p in points if p.z < low + 0.05]
    shift = ((min(p.x for p in feet) + max(p.x for p in feet)) / 2, (min(p.y for p in feet) + max(p.y for p in feet)) / 2, low)
    for item in meshes:
        item.location = (-shift[0], -shift[1], -shift[2])
    bpy.ops.object.transform_apply(location=True)
    # The importer keeps textures packed in memory; written next to the FBX they can be embedded in it.
    for image in bpy.data.images:
        if image.has_data:
            image.filepath_raw = os.path.join(OUT, f"{name}_{image.name}.png")
            image.file_format = "PNG"
            image.save()
    target = os.path.join(OUT, f"{name}.fbx")
    bpy.ops.export_scene.fbx(filepath=target, use_selection=True, path_mode="COPY", embed_textures=True, object_types={"MESH"})
    print("WROTE", target, os.path.getsize(target), "HEIGHT", round(max(p.z for p in points) - low, 3))
