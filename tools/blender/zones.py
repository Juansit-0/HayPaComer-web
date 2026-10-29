"""Garment zones for the figures, which come without a texture: which part of the body or the clothes each face is.

A rule per figure names the zone of each face of the full mesh from where it sits (Blender axes, feet on z 0, centred on the feet, front -y).
The hat is whatever loose part holds the highest point, so it never bleeds onto the face. Rules alone leave ragged edges, so the mesh is cut
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


# Each rule takes a face centre and the figure's height and returns a zone name.
def campesino(c, H):
    if c.z > 0.78 * H and abs(c.x) < 0.2:
        if c.z < 0.81 * H and math.hypot(c.x, c.y) > 0.09:
            return "top"
        return "beard" if c.y < -0.05 and c.z < 0.86 * H else "skin"
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
    if c.z > 0.78 * H and abs(c.x) < 0.2:
        if c.y > 0.02 and c.z < 0.84 * H:
            return "top"
        return "hair" if c.y > 0.02 or abs(c.x) > 0.075 else "skin"
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
    if c.z > 0.905 * H or (c.z > 0.875 * H and math.hypot(c.x, c.y) > 0.12):
        return "hat"
    if c.z > 0.79 * H and abs(c.x) < 0.1 and c.y < -0.04 and c.z < 0.87 * H:
        return "beard"
    if c.z > 0.83 * H and abs(c.x) < 0.17:
        return "skin"
    if _arm(c, 0.27) and c.z < 0.52 * H:
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
        return "skin" if c.y < -0.03 and 0.83 * H < c.z < 0.95 * H and abs(c.x) < 0.075 else "hair"
    if _arm(c, 0.47) and c.z < 0.62 * H:
        return "skin"
    if c.z < 0.07 * H:
        return "shoes"
    if c.z < 0.55 * H and abs(c.x) < 0.3:
        return "bottom"
    return "inner" if abs(c.x) < 0.075 and c.y < -0.03 and c.z < 0.8 * H else "top"


def vecino(c, H):
    if c.z > 0.85 * H and abs(c.x) < 0.17:
        return "hair" if c.z > 0.955 * H or (c.y > 0.0 and c.z > 0.88 * H) else "skin"
    if c.z > 0.8 * H and abs(c.x) < 0.1 and c.y < 0.02:
        return "skin" if c.z > 0.83 * H else "inner"
    if _arm(c, 0.3) and c.z < 0.5 * H:
        return "skin"
    if c.z < 0.055 * H:
        return "shoes"
    if c.z < 0.46 * H:
        return "bottom"
    return "inner" if abs(c.x) < 0.06 and c.y < -0.03 else "top"


RULES = {"CampesinoMejorHecho": campesino, "Campesina": campesina, "cargador": cargador, "vecina": vecina, "Vecino": vecino}
# Figures whose hat is a loose part of its own; the cargador's is welded to his head, so his rule draws the line.
HATTED = {"CampesinoMejorHecho", "Campesina"}


def label(mesh, name):
    """Zone index per polygon of the mesh, from the figure's rule, voted over small patches and smoothed."""
    rule = RULES[name]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    H = max(v.co.z for v in bm.verts)
    zones = [zone_index(rule(face.calc_center_median(), H)) for face in bm.faces]
    area = [face.calc_area() for face in bm.faces]
    total = sum(area)
    hat = set()
    if name in HATTED:
        top = max(bm.verts, key=lambda vertex: vertex.co.z)
        stack = list(top.link_faces)
        hat = {face.index for face in stack}
        while stack:
            for vertex in stack.pop().verts:
                for other in vertex.link_faces:
                    if other.index not in hat:
                        hat.add(other.index)
                        stack.append(other)
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
    neighbours = [[other.index for edge in face.edges for other in edge.link_faces if other is not face] for face in bm.faces]
    for _ in range(SMOOTH):
        settled = list(zones)
        for face in bm.faces:
            around = [zones[index] for index in neighbours[face.index]]
            if around:
                common = max(set(around), key=around.count)
                if around.count(common) > len(around) / 2:
                    settled[face.index] = common
        zones = settled
    for index in hat:
        zones[index] = zone_index("hat")
    bm.free()
    return zones
