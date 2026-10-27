"""Orthographic workbench renders of a set of objects from fixed directions, for checking models without opening Blender."""
import bpy
from mathutils import Vector

VIEWS = (("front", (0, -1, 0.1)), ("right", (1, 0, 0.1)), ("back", (0, 1, 0.15)), ("tq", (0.8, -1, 0.35)))


def shots(prefix, objects, views=VIEWS, size=480, color="SINGLE"):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = color
    shading.show_cavity = True
    scene.render.resolution_x = scene.render.resolution_y = size
    data = bpy.data.cameras.get("ShotCam") or bpy.data.cameras.new("ShotCam")
    data.type = "ORTHO"
    camera = bpy.data.objects.get("ShotCam") or bpy.data.objects.new("ShotCam", data)
    if camera.name not in scene.collection.objects:
        scene.collection.objects.link(camera)
    scene.camera = camera
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for item in objects:
        evaluated = item.evaluated_get(graph)
        points += [evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (low + high) / 2
    data.ortho_scale = max(high - low) * 1.15
    for name, direction in views:
        direction = Vector(direction).normalized()
        camera.location = center + direction * 6
        camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{prefix}_{name}.png"
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)
