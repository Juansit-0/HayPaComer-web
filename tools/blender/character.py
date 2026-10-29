"""Turns a static A-pose figure (.glb, front facing -Y, feet on z 0) into a light, skinned, walking .glb for the story.

usage: Blender -b --factory-startup -P tools/blender/character.py -- <name> <out dir> [--shots]
reads ~/Downloads/<name>.glb and the Mixamo clips in ~/Downloads/<clip>.fbx, writes <out dir>/<name>.glb and <name>.blend (and review renders
with --shots). Steps: centre on the feet, simplify to 8000 triangles, bake ambient occlusion into COLOR_0.r, place a 19-bone skeleton from body
proportions and the arm line, skin it, hand cloth that hangs off the arms back to the torso, then carry each of the figure's clips onto the skeleton.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import intersect_point_line

ARGS = sys.argv[sys.argv.index("--") + 1:]
NAME, OUT = ARGS[0], ARGS[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Per figure: how cloth near the arms behaves, the arm's resting hang, and anything special.
#   sleeve: (inner, outer) keep arm weight inside inner, none past outer (fitted sleeves)
#   coat: (hem, behind, side) coat tails below the hips, behind y or wider than x, follow the hips like a skirt instead of a leg
#   drape: x past which a ruana belongs fully to the arm (cloth spreading off the shoulders); drape_from: x where it starts to follow
#   skirt: hem height, cloth between hem and hips follows the hips more than the legs
#   hold: side whose arm keeps its pose (holding something), with the box of vertices it holds
#   clips: name -> (Mixamo file, keep every nth frame, frames kept, side whose arm carries a bag). Walks keep every frame so the feet
#   land where the stride says;
#   gestures keep every other frame, slow ones every third. A clip cut short is looped by blending its last frames into its first.
REST = {"Rest": ("Breathing Idle", 3)}
SEATED = {"Sit": ("Talking-2", 3), "SitTalk": ("Talking", 3)}
FIGURES = {
    "CampesinoMejorHecho": {"drape": 0.47, "hang": 62, "clips": {"Walk": ("Walking-2",), "Old": ("Old Man Walk",), "Haul": ("Walking-3",), **REST,
                                                                  "Talk": ("Talking-3", 2), "Argue": ("Standing Arguing", 3, 240), "Point": ("Pointing", 2), **SEATED}},
    "Campesina": {"drape": 0.5, "skirt": 0.33, "hang": 62, "clips": {"Walk": ("Walking",), "Haul": ("Walking-3",), **REST, "Talk": ("Talking-4", 2),
                                                                      "Point": ("Pointing", 2), **SEATED}},
    "cargador": {"sleeve": (0.06, 0.09), "coat": (0.57, 0.05, 0.2), "hang": 82, "hold": ("R", ((-0.75, -0.3, 0.2), (-0.25, 0.3, 0.88))),
                 "clips": {"Walk": ("Walking-2",), **REST}},
    "vecina": {"sleeve": (0.16, 0.24), "drape": 0.32, "drape_from": 0.2, "hang": 80,
               "clips": {"Walk": ("Walking",), "Carry": ("Walking", 1, None, "R"), **REST, "Talk": ("Talking-5", 2), **SEATED}},
    "Vecino": {"sleeve": (0.11, 0.17), "hang": 82, "clips": {"Walk": ("Walking-2",), **REST, "Talk": ("Talking-3", 2), **SEATED}},
}
BLEND = 20
FIGURE = FIGURES[NAME]
TRIANGLES = 8000


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


# Each ankle is the leg's cross-section above its foot, measured on the full mesh; the knee sits on the straight line from hip to ankle, as the
# figures stand with straight legs. Sampling the knee from the simplified mesh caught coat tails, cords and the load instead of the leg.
shins = clusters([v.co.x for v in source.data.vertices if abs(v.co.z - 0.1 * H) < 0.01], 0.1)
ankles = [min(((group[0] + group[-1]) / 2 for group in shins), key=lambda x: abs(x - foot))
          for foot in sorted((group[0] + group[-1]) / 2 - centre_x for group in feet_x)]


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
    ankle_x = abs(ankles[1 if sign > 0 else 0])
    knee_x = 0.055 * H + (ankle_x - 0.055 * H) * (hip_z - knee_z) / (hip_z - ankle_z)
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
if "coat" in FIGURE:
    hem, behind, side = FIGURE["coat"]
    for vertex in mesh.vertices:
        point = vertex.co
        if hem - 0.02 < point.z < hip_z + 0.05 and (point.y > behind or abs(point.x) > side):
            legs = 0.3 * (1 - smooth(hem, hip_z, point.z))
            reassign(vertex, lambda name: legs if name.split(".")[0] in ("thigh", "shin", "foot") else None)
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

# Motion capture from Mixamo, carried onto this skeleton. Spine and head copy the source's change of orientation; every limb is aimed where the
# source limb points, which absorbs the different rest poses (these figures stand in an A-pose, Mixamo's in a T-pose). The hips keep their height
# against the source's standing height, so a seated clip sits; walks are kept in place and their stride is stored on the rig, so the page moves
# the figure by exactly the ground the feet cover.
MAP = {"hips": "Hips", "spine": "Spine1", "chest": "Spine2", "neck": "Neck", "head": "Head"}
for side, word in (("L", "Left"), ("R", "Right")):
    MAP.update({f"shoulder.{side}": f"{word}Shoulder", f"upper_arm.{side}": f"{word}Arm", f"forearm.{side}": f"{word}ForeArm", f"hand.{side}": f"{word}Hand",
                f"thigh.{side}": f"{word}UpLeg", f"shin.{side}": f"{word}Leg", f"foot.{side}": f"{word}Foot"})
TORSO = {"hips", "spine", "chest", "neck", "head"}
ORDER = sorted(MAP, key=lambda name: len(armature.bones[name].parent_recursive))
AXIS = Vector((0, 1, 0))
scene.render.fps = 30
rig.animation_data_create()
poses = rig.pose.bones
for bone in poses:
    bone.rotation_mode = "QUATERNION"
for clip, (file, step, *more) in ((name, spec + (1,) * (2 - len(spec))) for name, spec in FIGURE["clips"].items()):
    limit, holding = more + [None, None][len(more):]
    loaded = FIGURE.get("hold", ("-",))[0]
    # An arm that carries a bag in this clip hangs straight down, held out enough for the bag to clear the leg; the arm of a figure modelled
    # holding its load keeps the modelled pose, which is where the load is.
    hang = {}
    if holding:
        sign = 1 if holding == "L" else -1
        bone = armature.bones[f"upper_arm.{holding}"]
        rest = bone.matrix_local.to_quaternion()
        reach = (bone.tail_local - bone.head_local).normalized()
        down = Vector((sign * math.sin(math.radians(15)), 0, -math.cos(math.radians(15))))
        hang[bone.name] = rest.inverted() @ reach.rotation_difference(down) @ rest
    holding = holding or loaded
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.expanduser(f"~/Downloads/{file}.fbx"))
    imported = [item for item in bpy.data.objects if item not in before]
    source = next(item for item in imported if item.type == "ARMATURE")
    for item in imported:
        if item.type == "MESH":
            bpy.data.objects.remove(item)
    first, last = (int(round(frame)) for frame in source.animation_data.action.frame_range)
    by = {bone.name.split(":")[-1]: bone for bone in source.pose.bones}
    standing = (source.matrix_world @ by["Hips"].bone.head_local).z
    ratio = hip_z / standing
    length = min(limit, last - first) if limit else last - first
    blend = min(BLEND, last - first - length)

    def world(name, matrix):
        return source.matrix_world @ matrix(by[MAP[name]])

    def hips_at(frame):
        scene.frame_set(frame)
        return world("hips", lambda bone: bone.matrix).translation.copy()

    start, end = hips_at(first), hips_at(first + length)
    travel = end - start
    travel.z = 0
    taken = {}
    for offset in range(length + blend + 1):
        scene.frame_set(first + offset)
        share = offset / max(1, length)
        for name in ORDER:
            bone = poses[name]
            # The arm that holds a load keeps its rest pose, so the load hangs at the side instead of swinging with the walk.
            if name.endswith("." + holding) and name.split(".")[0] in ARM_PARTS + ("shoulder",):
                bone.rotation_quaternion = hang.get(name, (1, 0, 0, 0))
                bpy.context.view_layer.update()
                continue
            pose = world(name, lambda bone: bone.matrix)
            rest = world(name, lambda bone: bone.bone.matrix_local)
            turn = pose.to_quaternion() @ rest.to_quaternion().inverted() @ (rig.matrix_world @ bone.bone.matrix_local).to_quaternion()
            if name not in TORSO:
                turn = (turn @ AXIS).rotation_difference(pose.to_quaternion() @ AXIS) @ turn
            if name == "hips":
                place = pose.translation - Vector((start.x, start.y, standing)) - travel * share
                where = rig.matrix_world @ bone.bone.head_local + place * ratio
            else:
                where = rig.matrix_world @ bone.head
            bone.matrix = rig.matrix_world.inverted() @ Matrix.LocRotScale(where, turn, Vector((1, 1, 1)))
            bpy.context.view_layer.update()
        taken[offset] = {name: poses[name].rotation_quaternion.copy() for name in ORDER}, poses["hips"].location.copy()
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    rig.animation_data.action = action
    for offset in sorted({*range(0, length, step), length}):
        turns, place = taken[offset]
        # A clip cut short: its opening frames lean toward the frames that follow its end, so the loop closes without a jump.
        if blend > offset:
            weight = 1 - offset / blend
            later, later_place = taken[length + offset]
            turns = {name: turn.slerp(later[name], weight) for name, turn in turns.items()}
            place = place.lerp(later_place, weight)
        if offset == length and blend:
            turns, place = taken[length]
        for name in ORDER:
            poses[name].rotation_quaternion = turns[name]
            poses[name].keyframe_insert("rotation_quaternion", frame=offset + 1)
        poses["hips"].location = place
        poses["hips"].keyframe_insert("location", frame=offset + 1)
    # Linear keys exported as they are: sampling would key every frame again, undoing the thinning of gestures.
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    rig[f"stride_{clip}"] = travel.length * ratio
    rig[f"frames_{clip}"] = length
    print("CLIP", clip, "frames", length, "stride", round(travel.length * ratio, 3))
    source_action = source.animation_data.action
    bpy.data.objects.remove(source)
    bpy.data.actions.remove(source_action)
scene.frame_set(1)

os.makedirs(OUT, exist_ok=True)
print("FIXED", mesh.validate())
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
target = os.path.join(OUT, f"{NAME}.glb")
bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", use_selection=True, export_texcoords=False, export_normals=True, export_extras=True,
                          export_skins=True, export_animations=True, export_force_sampling=False, export_animation_mode="ACTIONS", export_vertex_color="ACTIVE", export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{NAME}.blend"))
print("EXPORTED", target, os.path.getsize(target), "HIP", round(hip_z, 3), "HEIGHT", round(H, 3))

if "--shots" in ARGS:
    from shot import shots
    for clip in FIGURE["clips"]:
        rig.animation_data.action = bpy.data.actions[clip]
        for share in (0.25, 0.6):
            scene.frame_set(1 + round(rig[f"frames_{clip}"] * share))
            shots(os.path.join(OUT, f"{NAME}_{clip}_{round(share * 100)}"), [body], views=(("tq", (0.8, -1, 0.35)),), size=300, color="VERTEX")
