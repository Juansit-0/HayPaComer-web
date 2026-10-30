"""Garment zones for the figures, which come without a texture: which part of the body or the clothes each face is.

A rule per figure names the zone of each face of the full mesh from where it sits (Blender axes, feet on z 0, centred on the feet, front -y).
Rules alone leave ragged edges, so the mesh is cut
into patches along its creases and a small patch that mostly reads as one zone takes that zone whole; then each face takes its neighbours'
majority a few times, which clears stray specks. zone_index() gives the number stored in COLOR_0.g, read by app/story/figures.js.
"""
import math

import bmesh
from mathutils import Vector

ZONES = ("skin", "hair", "hat", "beard", "top", "band", "inner", "belt", "bottom", "shoes", "held")
CREASE = math.radians(25)
TRUST = 0.7
PATCH = 0.02
SMOOTH = 3


def zone_index(name):
    return ZONES.index(name)


def _arm(c, reach):
    return abs(c.x) > reach


def _hand(c, elbow, wrist, margin=0.0):
    """Past the wrist along the forearm and near its line, so a cuff is cut square to the arm rather than along a vertical line."""
    dx, dz = wrist[0] - elbow[0], wrist[1] - elbow[1]
    length = math.hypot(dx, dz)
    along = ((abs(c.x) - wrist[0]) * dx + (c.z - wrist[1]) * dz) / length
    across = abs((abs(c.x) - wrist[0]) * dz - (c.z - wrist[1]) * dx) / length
    return along > margin and 0.12 > across and 0.25 > along


# Each rule takes a face centre and the figure's height and returns a zone name.
def campesino(c, H):
    # The brim stands out past the head; the crown sits above it; the back of the head pokes through the hat above the brim.
    # The brim droops a little behind and at the sides, below the crown's band: anything that far from the head above the collar is brim.
    if c.z > 0.905 * H or (c.z > 0.895 * H and (math.hypot(c.x, c.y) > 0.14 or c.y > 0.03)) or (c.z > 0.862 * H and math.hypot(c.x, c.y) > 0.13):
        return "hat"
    if c.z > 0.78 * H and abs(c.x) < 0.2:
        # Behind, the ruana's collar rides up to the hat brim; read the back of the neck as cloth, so it shows no saw-toothed skin.
        if (c.z < 0.815 * H and math.hypot(c.x, c.y) > 0.07 and c.y > -0.06) or (c.y > 0.03 and c.z < 0.86 * H):
            return "top"
        # The beard covers the chin and the mouth, below the nose (0.875 of his height) and no wider than the jaw.
        return "beard" if c.y < -0.04 and c.z < 0.857 * H and abs(c.x) < 0.065 else "skin"
    if _arm(c, 0.5):
        return "skin"
    if c.z > 0.34 * H:
        near_leg = 0.1 > math.hypot(abs(c.x) - 0.12, c.y - 0.04)
        return "top" if c.z > 0.42 * H or not near_leg else "bottom"
    if c.z < 0.045 * H:
        return "shoes"
    if c.z < 0.105 * H:
        return "skin"
    return "bottom"


def campesina(c, H):
    # Her head is centred 0.11 forward of the body, with the face out to y -0.22; the brim is whatever stands out past the head above the brow.
    behind = c.y + 0.11
    # The back of her head pokes through the hat above the brim, so it is painted as the hat too.
    if (c.z > 0.895 * H and (math.hypot(c.x, behind) > 0.15 or behind > -0.02)) or (c.z > 0.92 * H and behind > -0.06) or c.z > 0.95 * H:
        return "hat"
    if c.z > 0.78 * H and abs(c.x) < 0.2:
        if behind > 0.05 and c.z < 0.86 * H:
            return "top"
        if c.z < 0.83 * H and abs(c.x) >= 0.12:
            return "top"
        if c.z < 0.815 * H and behind < 0:
            return "inner"
        return "hair" if behind > 0.01 or (0.13 > abs(c.x) > 0.085 and behind > -0.06) else "skin"
    if _arm(c, 0.42):
        return "skin"
    if c.z < 0.045 * H:
        return "shoes"
    if c.z < 0.2 * H or (c.z < 0.3 * H and 0.09 > math.hypot(abs(c.x) - 0.12, c.y)):
        return "skin"
    if c.z < 0.58 * H:
        return "top" if (c.z > 0.36 * H and c.y > 0.06) or (c.z > 0.42 * H and abs(c.x) > 0.27) else "bottom"
    if c.z < 0.62 * H and math.hypot(c.x, c.y) < 0.2 and c.y < 0.02:
        return "belt"
    return "inner" if abs(c.x) < 0.1 and c.y < -0.04 and c.z > 0.62 * H else "top"


def cargador(c, H):
    if c.x < -0.26 and 0.1 * H < c.z < 0.55 * H and (c.z < 0.43 * H or c.x < -0.32):
        return "held"
    # His head pokes through the back of the hat, so above the brim the back of it is painted as the hat.
    if c.z > 0.93 * H or (c.z > 0.875 * H and math.hypot(c.x, c.y) > 0.15) or (c.z > 0.89 * H and c.y > -0.02):
        return "hat"
    if c.z > 0.79 * H and abs(c.x) < 0.065 and c.y < -0.04 and c.z < 0.862 * H:
        return "beard"
    if c.z > 0.83 * H and abs(c.x) < 0.17:
        return "top" if c.y > 0.03 and c.z < 0.86 * H else "skin"
    if _hand(c, (0.26, 1.191), (0.329, 1.021), -0.02) and c.z < 0.62 * H:
        return "skin"
    if c.z < 0.08 * H:
        return "shoes"
    if c.z < 0.58 * H:
        return "top" if c.z > 0.33 * H and (c.y > 0.05 or abs(c.x) > 0.2) else "bottom"
    if c.z < 0.62 * H and math.hypot(c.x, c.y) < 0.22:
        return "belt"
    return "inner" if abs(c.x) < 0.07 and c.y < -0.04 else "top"


def vecina(c, H):
    if c.z > 0.8 * H and abs(c.x) < 0.2:
        # Her face is an oval from the chin (0.845) to the hairline (0.955), framed by the hair; below it a high collar, behind it the hood.
        if c.y < -0.05 and (c.x / 0.088) ** 2 + ((c.z - 0.9 * H) / (0.056 * H)) ** 2 <= 1:
            return "skin"
        if c.z < 0.85 * H and abs(c.x) < 0.075 and c.y < 0.0:
            return "inner"
        if c.z < 0.83 * H and abs(c.x) > 0.11:
            return "top"
        if c.z < 0.84 * H and c.y > 0.04:
            return "top"
        return "hair"
    if _hand(c, (0.362, 1.146), (0.516, 0.957), 0.028) and c.z < 0.62 * H:
        return "skin"
    if c.z < 0.07 * H:
        return "shoes"
    if c.z < 0.55 * H and abs(c.x) < 0.3:
        return "bottom"
    return "inner" if abs(c.x) < 0.075 and c.y < -0.03 and c.z < 0.8 * H else "top"


def vecino(c, H):
    if c.z > 0.85 * H and abs(c.x) < 0.17:
        # Hair over the crown, behind the ear, and down the temples above it; his head is centred a little forward, at y -0.02.
        return "hair" if c.z > 0.955 * H or (c.z > 0.88 * H and (c.y > -0.04 or (c.z > 0.89 * H and abs(c.x) > 0.08 and c.y > -0.09))) else "skin"
    if c.z > 0.8 * H and abs(c.x) < 0.1 and c.y < 0.02:
        return "skin" if c.z > 0.83 * H else "inner"
    if _hand(c, (0.323, 1.184), (0.437, 0.948), -0.02) and c.z < 0.6 * H:
        return "skin"
    if c.z < 0.055 * H:
        return "shoes"
    if c.z < 0.46 * H:
        return "bottom"
    return "inner" if abs(c.x) < 0.06 and c.y < -0.03 else "top"


RULES = {"CampesinoMejorHecho": campesino, "Campesina": campesina, "cargador": cargador, "vecina": vecina, "Vecino": vecino}


def smooth(bm, zones, passes=SMOOTH):
    """Each face takes the zone most of its edge neighbours share, a few times over."""
    bm.faces.ensure_lookup_table()
    neighbours = [[other.index for edge in face.edges for other in edge.link_faces if other is not face] for face in bm.faces]
    for _ in range(passes):
        settled = list(zones)
        for face in bm.faces:
            around = [zones[index] for index in neighbours[face.index]]
            if around:
                common = max(set(around), key=around.count)
                if around.count(common) > len(around) / 2:
                    settled[face.index] = common
        zones = settled
    return zones


def label(mesh, name):
    """Zone index per polygon of the mesh, from the figure's rule, voted over small patches and smoothed."""
    rule = RULES[name]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    H = max(v.co.z for v in bm.verts)
    zones = [zone_index(rule(face.calc_center_median(), H)) for face in bm.faces]
    rules_said = list(zones)
    area = [face.calc_area() for face in bm.faces]
    total = sum(area)
    patch = [-1] * len(bm.faces)
    count = 0
    for face in bm.faces:
        if patch[face.index] >= 0:
            continue
        patch[face.index] = count
        stack = [face]
        members = []
        while stack:
            current = stack.pop()
            members.append(current.index)
            for edge in current.edges:
                if len(edge.link_faces) != 2 or edge.calc_face_angle(math.pi) > CREASE:
                    continue
                for other in edge.link_faces:
                    if patch[other.index] < 0:
                        patch[other.index] = count
                        stack.append(other)
        votes = {}
        for index in members:
            votes[zones[index]] = votes.get(zones[index], 0) + area[index]
        winner, weight = max(votes.items(), key=lambda item: item[1])
        if weight >= TRUST * sum(votes.values()) and PATCH * total > sum(votes.values()):
            for index in members:
                zones[index] = winner
        count += 1
    zones = smooth(bm, zones)
    # Where the head pokes through the crown, the head's patch would vote it back to skin: the rule's hat wins above the brim.
    hat = zone_index("hat")
    for face in bm.faces:
        if rules_said[face.index] == hat and face.calc_center_median().z > 0.88 * H:
            zones[face.index] = hat
    bm.free()
    return zones
