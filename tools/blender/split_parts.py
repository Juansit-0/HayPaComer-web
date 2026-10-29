"""Splits the selected figure into its loose parts and gives each one its own flat colour, to see where the hat ends and the face begins.

usage: in Blender, select the figure (one mesh, one material with its image texture), open this file in the Text Editor and press Run Script;
then view in Solid mode with the shading colour set to Material (or in Material Preview).
1. Keeps a packed copy of every image the object uses, named <image>_backup, so the original texture survives whatever is done next.
2. Separates the mesh into one object per loose part.
3. Gives each part a new material of its own (use_nodes on) and moves all its faces to it; the original material stays in the first slot.
4. Paints each part a distinct flat colour and prints the parts, largest first, with their height range to tell which is which.
A part only comes apart if it is not welded to its neighbour: when the hat and the head share vertices, they stay one part.
"""
import colorsys

import bpy

source = bpy.context.active_object
if source is None or source.type != "MESH":
    raise RuntimeError("Select the figure's mesh first.")
if bpy.context.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")

for material in source.data.materials:
    if material is None or not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type != "TEX_IMAGE" or node.image is None or node.image.name.endswith("_backup"):
            continue
        backup = node.image.copy()
        backup.name = f"{node.image.name}_backup"
        backup.use_fake_user = True
        if not backup.packed_file:
            try:
                backup.pack()
            except RuntimeError as error:
                print("could not pack", backup.name, error)
        print("texture kept as", backup.name)

bpy.ops.object.select_all(action="DESELECT")
source.select_set(True)
bpy.context.view_layer.objects.active = source
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
parts = sorted(bpy.context.selected_objects, key=lambda part: len(part.data.vertices), reverse=True)

base = source.name
for index, part in enumerate(parts):
    part.name = f"{base}_part_{index:02d}"
    # Hues a golden-ratio step apart, so neighbouring parts never get similar colours.
    red, green, blue = colorsys.hsv_to_rgb((index * 0.618034) % 1, 0.65, 0.95)
    material = bpy.data.materials.new(f"{part.name}_color")
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (red, green, blue, 1)
    material.diffuse_color = (red, green, blue, 1)
    part.data.materials.append(material)
    slot = len(part.data.materials) - 1
    for polygon in part.data.polygons:
        polygon.material_index = slot
    heights = [(part.matrix_world @ vertex.co).z for vertex in part.data.vertices]
    print(f"{part.name}: {len(part.data.vertices)} vertices, z {min(heights):.3f} to {max(heights):.3f}, colour {red:.2f} {green:.2f} {blue:.2f}")

print(len(parts), "parts")
