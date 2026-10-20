"""
Count z-fighting candidates in exported GLBs: overlapping faces of different materials that
face the same way and lie within TOL of the same plane.

    blender -b --factory-startup -P check_zfight.py -- level/rooftops/town.glb [more.glb ...] [tol=0.006]
Paths are relative to assets/ unless absolute.
"""
import sys, os, math
from collections import defaultdict
import bpy, bmesh
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
VERBOSE = "verbose" in ARGS
TOL = float(next((a[4:] for a in ARGS if a.startswith("tol=")), "0.006"))
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def check(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    pairs = 0
    area = 0.0
    for ob in [o for o in bpy.data.objects if o.type == "MESH"]:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.transform(ob.matrix_world)
        bm.normal_update()
        groups = defaultdict(list)
        for f in bm.faces:
            n = f.normal
            if n.length < 0.5 or n.z < -0.9:
                continue
            d = n.dot(f.verts[0].co)
            for dk in (math.floor(d / TOL), math.floor(d / TOL) + 1):       # straddle bucket edges
                groups[(round(n.x, 2), round(n.y, 2), round(n.z, 2), dk)].append(f)
        seen = set()
        for key, fs in groups.items():
            if len({f.material_index for f in fs}) < 2:
                continue
            n = fs[0].normal
            a = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
            u = n.cross(a).normalized()
            v = n.cross(u)
            bx = []
            for f in fs:
                us = [p.co.dot(u) for p in f.verts]
                vs = [p.co.dot(v) for p in f.verts]
                bx.append((min(us), max(us), min(vs), max(vs), n.dot(f.verts[0].co)))
            cell = defaultdict(list)
            for i, b in enumerate(bx):
                for cx in range(int(b[0] // 4), int(b[1] // 4) + 1):
                    for cy in range(int(b[2] // 4), int(b[3] // 4) + 1):
                        cell[cx, cy].append(i)
            for idxs in cell.values():
                for x in range(len(idxs)):
                    for y in range(x + 1, len(idxs)):
                        i, j = idxs[x], idxs[y]
                        if fs[i].material_index == fs[j].material_index:
                            continue
                        if abs(bx[i][4] - bx[j][4]) > TOL:
                            continue
                        ox = min(bx[i][1], bx[j][1]) - max(bx[i][0], bx[j][0])
                        oy = min(bx[i][3], bx[j][3]) - max(bx[i][2], bx[j][2])
                        if ox > 1e-3 and oy > 1e-3:
                            k = (min(fs[i].index, fs[j].index), max(fs[i].index, fs[j].index), ob.name)
                            if k not in seen:
                                seen.add(k)
                                pairs += 1
                                area += ox * oy
                                if VERBOSE and ox * oy > 0.01:
                                    ms = ob.data.materials
                                    print("  PAIR", ms[fs[i].material_index].name, ms[fs[j].material_index].name,
                                          tuple(round(c, 2) for c in n), round(bx[i][4], 4), round(bx[j][4], 4),
                                          round(ox * oy, 2))
        bm.free()
    return pairs, area


for a in ARGS:
    if a.startswith("tol=") or a == "verbose":
        continue
    p = a if os.path.isabs(a) else os.path.join(ROOT, "assets", a)
    n, ar = check(p)
    print(f"ZCHECK {a}: {n} overlapping coplanar pairs, {ar:.1f} m2")
