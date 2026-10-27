"""Turns a static A-pose figure (.glb, front facing -Y, feet on z 0) into a light, skinned, walking .glb for the story.

usage: Blender -b --factory-startup -P tools/blender/character.py -- <name> <out dir> [--shots]
reads ~/Downloads/<name>.glb, writes <out dir>/<name>.glb and <name>.blend (and review renders with --shots).
Steps: centre on the feet, simplify to 6000 triangles, bake ambient occlusion into COLOR_0.r, place a 19-bone skeleton from body proportions
and the arm line, skin it, hand cloth that hangs off the arms back to the torso, then key a 26-frame walk at 24 fps.
"""
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector
from mathutils.geometry import intersect_point_line

ARGS = sys.argv[sys.argv.index("--") + 1:]
NAME, OUT = ARGS[0], ARGS[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Per figure: how cloth near the arms behaves, the arm's resting hang, and anything special.
#   sleeve: (inner, outer) keep arm weight inside inner, none past outer (fitted sleeves)
#   drape: x past which a ruana belongs fully to the arm (cloth spreading off the shoulders); drape_from: x where it starts to follow
#   skirt: hem height, cloth between hem and hips follows the hips more than the legs
#   hold: side whose arm keeps its pose (holding something), with the box of vertices it holds
FIGURES = {
    "CampesinoMejorHecho": {"drape": 0.47, "hang": 62},
    "Campesina": {"drape": 0.5, "skirt": 0.33, "hang": 62},
    "cargador": {"sleeve": (0.06, 0.09), "hang": 82, "hold": ("R", ((-0.75, -0.3, 0.2), (-0.25, 0.3, 0.88)))},
    "vecina": {"sleeve": (0.16, 0.24), "drape": 0.32, "drape_from": 0.2, "hang": 80},
    "Vecino": {"sleeve": (0.11, 0.17), "hang": 82},
}
FIGURE = FIGURES[NAME]
TRIANGLES = 6000
FRAMES = 26


def clusters(points, gap=0.02):
    groups, current = [], []
    for value in sorted(points):
        if current and value - current[-1] > gap:
            groups.append(current)
            current = []
        current.append(value)
    if current:
        groups.append(current)
    return groups


def smooth(edge0, edge1, value):
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.expanduser(f"~/Downloads/{NAME}.glb"))
source = [item for item in bpy.data.objects if item.type == "MESH"][0]
source.name = f"{NAME}_original"
scene = bpy.context.scene

# Centre on the feet so the hips sit over the origin even when a carried load widens the bounding box.
vertices = [source.matrix_world @ v.co for v in source.data.vertices]
height = max(v.z for v in vertices)
feet = [v for v in vertices if v.z < height * 0.06]
feet_x = clusters([v.x for v in feet], 0.04)
feet_x = sorted(feet_x, key=len)[-2:]
centre_x = sum((group[0] + group[-1]) / 2 for group in feet_x) / len(feet_x)
torso = [v for v in vertices if abs(v.z - height * 0.7) < 0.01]
centre_y = (min(v.y for v in torso) + max(v.y for v in torso)) / 2
source.location.x -= centre_x
bpy.context.view_layer.update()
bpy.ops.object.select_all(action="DESELECT")
source.select_set(True)
bpy.context.view_layer.objects.active = source
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

body = source.copy()
body.data = source.data.copy()
body.name = NAME
scene.collection.objects.link(body)
source.hide_set(True)
source.hide_render = True
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
weld = body.modifiers.new("Weld", "WELD")
weld.merge_threshold = 0.0005
decimate = body.modifiers.new("Decimate", "DECIMATE")
decimate.ratio = TRIANGLES / len(source.data.polygons)
decimate.use_collapse_triangulate = True
for modifier in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=modifier.name)
body.data.validate()
bpy.ops.object.shade_smooth()
mesh = body.data
print("TRIANGLES", len(mesh.polygons), "VERTICES", len(mesh.vertices))

occlusion = mesh.color_attributes.new("Occlusion", "BYTE_COLOR", "POINT")
mesh.color_attributes.active_color = occlusion
scene.world = bpy.data.worlds.new("World")
scene.world.light_settings.distance = 0.2
scene.render.engine = "CYCLES"
scene.cycles.samples = 192
bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")

# Skeleton from proportions (Drillis and Contini) plus each arm's measured line from shoulder to fingertip.
points = [v.co.copy() for v in mesh.vertices]
H = height
Y = centre_y


def leg_x(z, side):
    near = [p.x for p in points if abs(p.z - z) < 0.01 and p.x * side > 0.03]
    groups = clusters([abs(x) for x in near])
    return (groups[-1][0] + groups[-1][-1]) / 2 if groups else 0.11 * H / 1.7


ankle_z, knee_z, hip_z = 0.045 * H, 0.285 * H, 0.5 * H
shoulder_z, neck_z = 0.815 * H, 0.85 * H
bones = {
    "hips": ((0, Y, hip_z), (0, Y, 0.58 * H), None),
    "spine": ((0, Y, 0.58 * H), (0, Y, 0.69 * H), "hips"),
    "chest": ((0, Y, 0.69 * H), (0, Y, shoulder_z), "spine"),
    "neck": ((0, Y, shoulder_z), (0, Y, neck_z), "chest"),
    "head": ((0, Y, neck_z), (0, Y, H * 0.985), "neck"),
}
for side, sign in (("L", 1), ("R", -1)):
    shoulder = Vector((0.1 * H * sign, Y, shoulder_z - 0.01 * H))
    arm = [p for p in points if p.x * sign > 0.2 * H / 1.7 and p.z > 0.4 * H and p.z < shoulder_z]
    tip = max(arm, key=lambda p: abs(p.x))
    if FIGURE.get("hold", (None,))[0] == side:
        lowest = [p for p in arm if abs(p.x) < 0.24 * H]
        tip = min(lowest, key=lambda p: p.z - abs(p.x))
    reach = tip - shoulder
    elbow = shoulder + reach * 0.42
    wrist = shoulder + reach * 0.76
    knee_x, ankle_x = leg_x(knee_z, sign), leg_x(0.1 * H, sign)
    foot = [p for p in points if p.z < 0.03 * H and p.x * sign > 0]
    toe_y = min(p.y for p in foot)
    heel_y = max(p.y for p in foot)
    ankle = (ankle_x * sign, Y + (heel_y - Y) * 0.35, ankle_z)
    bones.update({
        f"shoulder.{side}": ((0.025 * H * sign, Y, shoulder_z - 0.01 * H), tuple(shoulder), "chest"),
        f"upper_arm.{side}": (tuple(shoulder), tuple(elbow), f"shoulder.{side}"),
        f"forearm.{side}": (tuple(elbow), tuple(wrist), f"upper_arm.{side}"),
        f"hand.{side}": (tuple(wrist), tuple(tip), f"forearm.{side}"),
        f"thigh.{side}": ((0.055 * H * sign, Y, hip_z), (knee_x * sign, Y, knee_z), "hips"),
        f"shin.{side}": ((knee_x * sign, Y, knee_z), ankle, f"thigh.{side}"),
        f"foot.{side}": (ankle, (ankle_x * sign * 1.08, toe_y + 0.03, 0.012 * H), f"shin.{side}"),
    })
    print("ARM", side, "tip", tuple(round(c, 3) for c in tip), "hang", round(math.degrees(math.atan2(-reach.z, abs(reach.x))), 1))

armature = bpy.data.armatures.new("Skeleton")
rig = bpy.data.objects.new("Skeleton", armature)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, (head, tail, parent) in bones.items():
    bone = armature.edit_bones.new(name)
    bone.head, bone.tail, bone.roll = Vector(head), Vector(tail), 0
for name, (head, tail, parent) in bones.items():
    if parent:
        bone = armature.edit_bones[name]
        bone.parent = armature.edit_bones[parent]
        bone.use_connect = (bone.parent.tail - bone.head).length < 1e-4
bpy.ops.object.mode_set(mode="OBJECT")
armature.display_type = "STICK"
rig.show_in_front = True
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
groups = {group.name: group for group in body.vertex_groups}
names = {group.index: group.name for group in body.vertex_groups}
print("UNWEIGHTED", sum(1 for v in mesh.vertices if not any(g.weight > 0.01 for g in v.groups)))


def torso_for(z):
    return "chest" if z > 0.69 * H else "spine" if z > 0.58 * H else "hips"


def segment(name):
    bone = armature.bones[name]
    return bone.head_local, bone.tail_local


def distance(point, head, tail):
    _, t = intersect_point_line(point, head, tail)
    t = max(0.0, min(1.0, t))
    return (point - (head + (tail - head) * t)).length


def reassign(vertex, keep):
    """keep(name) -> share of that limb group's weight to keep; the rest goes to the torso."""
    given = 0.0
    for group in list(vertex.groups):
        name = names[group.group]
        share = keep(name)
        if share is None or share >= 1:
            continue
        given += group.weight * (1 - share)
        groups[name].add([vertex.index], group.weight * share, "REPLACE")
    if given > 0.001:
        groups[torso_for(vertex.co.z)].add([vertex.index], given, "ADD")


ARM_PARTS = ("upper_arm", "forearm", "hand")
if "sleeve" in FIGURE:
    inner, outer = (value * H / 1.7 for value in FIGURE["sleeve"])
    for vertex in mesh.vertices:
        def keep(name, point=vertex.co):
            if name.split(".")[0] not in ARM_PARTS:
                return None
            return 1 - smooth(inner, outer, distance(point, *segment(name)))
        reassign(vertex, keep)
if "drape" in FIGURE:
    edge = FIGURE["drape"] * H / 1.76
    for vertex in mesh.vertices:
        point = vertex.co
        if abs(point.x) >= edge or point.z < 0.39 * H or (point.z > shoulder_z and abs(point.x) < 0.08 * H):
            continue
        side = "L" if point.x > 0 else "R"
        follow = smooth(FIGURE.get("drape_from", 0.08 * H), edge, abs(point.x)) * smooth(0.41 * H, 0.65 * H, point.z)
        limbs = {names[g.group]: g.weight for g in vertex.groups if names[g.group].split(".")[0] in ARM_PARTS + ("shoulder",)}
        rest = {names[g.group]: g.weight for g in vertex.groups if names[g.group] not in limbs}
        for name in limbs:
            groups[name].remove([vertex.index])
        if not rest:
            rest = {torso_for(point.z): 1.0}
        total = sum(rest.values())
        for name, weight in rest.items():
            groups[name].add([vertex.index], (1 - follow) * weight / total, "REPLACE")
        if follow > 0.001:
            groups[f"upper_arm.{side}"].add([vertex.index], follow, "REPLACE")
if "skirt" in FIGURE:
    hem = FIGURE["skirt"] * H / 1.7
    for vertex in mesh.vertices:
        point = vertex.co
        if not hem - 0.02 < point.z < hip_z + 0.05:
            continue
        # the legs hidden under the skirt follow the hips too, so skirt and legs never pull apart above the hem
        legs = 0.3 * (1 - smooth(hem, hip_z, point.z))
        right = smooth(-0.15, 0.15, point.x)
        for group in list(vertex.groups):
            groups[names[group.group]].remove([vertex.index])
        groups["hips"].add([vertex.index], 1 - legs, "REPLACE")
        groups["thigh.L"].add([vertex.index], legs * right, "REPLACE")
        groups["thigh.R"].add([vertex.index], legs * (1 - right), "REPLACE")
if "hold" in FIGURE:
    side, (low, high) = FIGURE["hold"]
    low, high = Vector(low), Vector(high)
    for vertex in mesh.vertices:
        point = vertex.co
        if all(low[i] <= point[i] <= high[i] for i in range(3)):
            for group in list(vertex.groups):
                groups[names[group.group]].remove([vertex.index])
            groups[f"hand.{side}"].add([vertex.index], 1.0, "REPLACE")

# The walk: legs from a phase function, arms lowered from the A-pose to their hang and swung in armature space.
R = math.radians
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, FRAMES
rig.animation_data_create()
action = bpy.data.actions.new("Walk")
action.use_fake_user = True
rig.animation_data.action = action
poses = rig.pose.bones
for bone in poses:
    bone.rotation_mode = "XYZ"


def local(name, rotation):
    rest = armature.bones[name].matrix_local.to_quaternion()
    return rest.inverted() @ rotation @ rest


def leg(phase):
    thigh = -24 * math.cos(phase)
    swing = max(0.0, -math.sin(phase))
    stance = max(0.0, math.sin(phase))
    knee = 4 + 42 * swing ** 1.8 + 12 * math.sin(2 * phase) ** 2 * stance
    heel = -14 * max(0.0, math.cos(phase)) ** 6
    push = 22 * max(0.0, math.cos(phase - 2.6)) ** 8
    return thigh, knee, -(thigh + knee) + heel + push


arms = {}
for side, sign in (("L", 1), ("R", -1)):
    for part in ("upper_arm", "forearm"):
        poses[f"{part}.{side}"].rotation_mode = "QUATERNION"
    reach = armature.bones[f"upper_arm.{side}"].tail_local - armature.bones[f"upper_arm.{side}"].head_local
    rest_hang = math.degrees(math.atan2(-reach.z, abs(reach.x)))
    forearm = armature.bones[f"forearm.{side}"]
    hinge = (forearm.tail_local - forearm.head_local).normalized().cross(Vector((0, -1, 0))).normalized()
    held = FIGURE.get("hold", (None,))[0] == side
    arms[side] = (sign, max(0.0, FIGURE["hang"] - rest_hang), hinge, held)
for frame in range(1, FRAMES + 2):
    phase = 2 * math.pi * (frame - 1) / FRAMES
    for side, offset in (("L", 0.0), ("R", math.pi)):
        thigh, knee, foot = leg(phase + offset)
        poses[f"thigh.{side}"].rotation_euler = (R(thigh), 0, 0)
        poses[f"shin.{side}"].rotation_euler = (R(knee), 0, 0)
        poses[f"foot.{side}"].rotation_euler = (R(foot), 0, 0)
        sign, down, hinge, held = arms[side]
        swing = 3 * math.cos(phase + offset) if held else 15 * math.cos(phase + offset)
        bend = 4 if held else 12 + 10 * max(0.0, -math.cos(phase + offset))
        poses[f"upper_arm.{side}"].rotation_quaternion = local(f"upper_arm.{side}", Quaternion((1, 0, 0), R(swing)) @ Quaternion((0, 1, 0), R(down) * sign))
        poses[f"forearm.{side}"].rotation_quaternion = local(f"forearm.{side}", Quaternion(hinge, R(bend)))
        for name in (f"thigh.{side}", f"shin.{side}", f"foot.{side}"):
            poses[name].keyframe_insert("rotation_euler", frame=frame)
        for name in (f"upper_arm.{side}", f"forearm.{side}"):
            poses[name].keyframe_insert("rotation_quaternion", frame=frame)
    poses["hips"].location = (0.012 * math.cos(phase - 0.6), -0.022 * math.cos(2 * phase), 0)
    poses["hips"].rotation_euler = (R(3), R(6 * math.cos(phase)), R(-3 * math.cos(phase - 0.6)))
    poses["spine"].rotation_euler = (R(2), R(-4 * math.cos(phase)), R(2 * math.cos(phase - 0.6)))
    poses["chest"].rotation_euler = (R(1 + math.cos(2 * phase)), R(-5 * math.cos(phase)), 0)
    poses["head"].rotation_euler = (R(-3 - 1.5 * math.cos(2 * phase)), R(4 * math.cos(phase)), 0)
    poses["hips"].keyframe_insert("location", frame=frame)
    for name in ("hips", "spine", "chest", "head"):
        poses[name].keyframe_insert("rotation_euler", frame=frame)
for curve in action.fcurves:
    curve.modifiers.new("CYCLES")
scene.frame_set(1)

os.makedirs(OUT, exist_ok=True)
print("FIXED", mesh.validate())
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
target = os.path.join(OUT, f"{NAME}.glb")
bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", use_selection=True, export_texcoords=False, export_normals=True,
                          export_skins=True, export_animations=True, export_vertex_color="ACTIVE", export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{NAME}.blend"))
print("EXPORTED", target, os.path.getsize(target), "HIP", round(hip_z, 3), "HEIGHT", round(H, 3))

if "--shots" in ARGS:
    from shot import shots
    for frame in (1, 8, 14, 21):
        scene.frame_set(frame)
        shots(os.path.join(OUT, f"{NAME}_{frame:02d}"), [body], views=(("right", (1, 0, 0.1)), ("tq", (0.8, -1, 0.35))), size=360, color="VERTEX")
