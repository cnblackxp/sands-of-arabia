"""
Export every game asset to ../../assets as GLB / JSON / images.

    blender -b --factory-startup -P export_assets.py -- [only=characters,props,level,sky] [nosky]

Coordinates: models are built in Blender (Z up, facing -Y) and exported with
+Y up, so in glTF / three.js everything faces +Z, stands on y = 0, units = metres.
A Blender point (x, y, z) becomes three.js (x, z, -y).
"""
import sys, os, json, math, random, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy, bmesh
from mathutils import Vector, Matrix, noise

import arabia_lib as L
import rigs

R = math.radians

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = next((a[5:].split(",") for a in ARGS if a.startswith("only=")), None)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
MANIFEST_PATH = os.path.join(ASSETS, "manifest.json")
scene = bpy.context.scene
scene.render.fps = rigs.FPS

try:
    MANIFEST = json.load(open(MANIFEST_PATH, encoding="utf8"))
except Exception:
    MANIFEST = {}
MANIFEST.setdefault("assets", {})
MANIFEST["conventions"] = {
    "units": "metres",
    "up": "+Y",
    "forward": "+Z (models face +Z; rotate a model by yaw about +Y)",
    "origin": "bottom centre of the model at ground level",
    "blender_to_three": "(x, y, z)_blender -> (x, z, -y)_three",
    "fps": rigs.FPS,
}


def want(section):
    return ONLY is None or section in ONLY


def to3(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for coll in (bpy.data.meshes, bpy.data.armatures):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def descendants(objs):
    out = []
    for o in objs:
        out.append(o)
        out += descendants(list(o.children))
    return out


def bounds(objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != "MESH":
            continue
        oe = o.evaluated_get(dg)
        for v in oe.data.vertices:
            w = oe.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


# cap layers win over what they sit on; higher rank is lifted further (ties: the smaller face lifts)
CAP_RANK = {"Lime": 6, "Stone": 5, "StoneDark": 4, "Mud2": 3, "Mud1": 2, "Mud0": 1}
ZF_STEP = 0.015
ZF_TOL = 0.006                     # faces closer than this to the same plane count as coplanar


def fix_coplanar(ob, step=ZF_STEP):
    """Remove z-fighting at the source: where faces of different materials lie in the same plane,
    face the same way and overlap, push the higher-ranked face(s) out along their normal by
    rank-index * step. Each MB primitive owns its vertices, so this just thickens the cap a few mm."""
    from collections import defaultdict
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    names = [(m.name.split(".")[0] if m else "") for m in me.materials]

    def basis(n):
        a = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
        u = n.cross(a).normalized()
        return u, n.cross(u)
    groups = defaultdict(list)
    for f in bm.faces:
        n = f.normal
        if n.length < 0.5 or n.z < -0.9:                     # undersides are never seen
            continue
        dk = math.floor(n.dot(f.verts[0].co) / ZF_TOL)
        for k in (dk, dk + 1):                                # straddle bucket edges
            groups[(round(n.x, 2), round(n.y, 2), round(n.z, 2), k)].append(f)
    disp = defaultdict(dict)                                  # vert -> {normal key: offset}
    fixed = 0
    for key, fs in groups.items():
        if len({f.material_index for f in fs}) < 2:
            continue
        n = fs[0].normal.copy()
        u, v = basis(n)
        boxes = []
        for f in fs:
            us = [p.co.dot(u) for p in f.verts]
            vs = [p.co.dot(v) for p in f.verts]
            boxes.append((min(us), max(us), min(vs), max(vs), n.dot(f.verts[0].co)))
        mats = sorted({f.material_index for f in fs},
                      key=lambda i: (CAP_RANK.get(names[i] if i < len(names) else "", 0), i))
        level = {m: k for k, m in enumerate(mats)}
        cell = defaultdict(list)                              # spatial buckets keep big groups fast
        for i, b in enumerate(boxes):
            for cx in range(int(b[0] // 4), int(b[1] // 4) + 1):
                for cy in range(int(b[2] // 4), int(b[3] // 4) + 1):
                    cell[cx, cy].append(i)
        lift = {}
        for idxs in cell.values():
            for a_ in range(len(idxs)):
                for b_ in range(a_ + 1, len(idxs)):
                    i, j = idxs[a_], idxs[b_]
                    fi, fj = fs[i], fs[j]
                    if fi.material_index == fj.material_index:
                        continue
                    bi, bj = boxes[i], boxes[j]
                    if abs(bi[4] - bj[4]) > ZF_TOL:
                        continue
                    ox = min(bi[1], bj[1]) - max(bi[0], bj[0])
                    oy = min(bi[3], bj[3]) - max(bi[2], bj[2])
                    if ox <= 1e-3 or oy <= 1e-3:
                        continue
                    li, lj = level[fi.material_index], level[fj.material_index]
                    if li == lj:
                        continue
                    hi = i if li > lj else j
                    lift[hi] = max(lift.get(hi, 0), max(li, lj))
        for i, lv in lift.items():
            for p in fs[i].verts:
                disp[p][key[:3]] = max(disp[p].get(key[:3], 0.0), lv * step)
            fixed += 1
    fixed = len({p for p in disp})
    for p, offs in disp.items():
        for nk, d in offs.items():
            p.co += Vector(nk).normalized() * d
    bm.to_mesh(me)
    bm.free()
    return fixed


def export(objs, rel, kind, anim=False, extra=None, vcol=False, normals=True, instances=False, bake=False):
    """Export objs (and children) to assets/rel; record it in the manifest."""
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    objs = descendants(objs)
    if not anim and not vcol:
        n = 0
        for o in [o for o in objs if o.type == "MESH" and o.data.users == 1]:
            for _ in range(3):                      # a lift can land near another plane; re-check
                k = fix_coplanar(o)
                n += k
                if not k:
                    break
        if n:
            print("ZFIGHT", rel, n, "faces lifted")
    if bake:                                       # after the coplanar fix, which needs the original materials
        seen = set()
        for o in objs:
            if o.type == "MESH" and o.data.name not in seen:
                seen.add(o.data.name)
                bake_flat_materials(o.data)
    vl = bpy.context.view_layer
    for o in bpy.data.objects:
        if o.name in vl.objects:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=not anim, export_yup=True, export_extras=True,
        export_animations=anim, export_animation_mode="ACTIONS",
        export_force_sampling=not anim, export_anim_slide_to_zero=True, export_def_bones=False, export_leaf_bone=False,
        export_vertex_color="ACTIVE" if (vcol or bake) else "NONE", export_all_vertex_colors=False,
        export_normals=normals, export_image_format="NONE", export_gpu_instances=instances,
    )
    lo, hi = bounds([o for o in objs if o.type != "MESH" or o.data.users == 1] or objs)
    info = {"file": rel.replace("\\", "/"), "kind": kind,
            "size": [round(hi.x - lo.x, 3), round(hi.z - lo.z, 3), round(hi.y - lo.y, 3)],
            "materials": sorted({s.material.name for o in objs if o.type == "MESH"
                                 for s in o.material_slots if s.material})}
    if extra:
        info.update(extra)
    key = os.path.splitext(os.path.basename(rel))[0]
    MANIFEST["assets"][key] = info
    print("EXPORTED", rel, info["size"])
    return info


def to_origin(ob, sink=0.0):
    """Put a built prop at the world origin (bottom centre), optionally sunk by `sink`."""
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    lo, hi = bounds([ob])
    off = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + sink))
    ob.data.transform(Matrix.Translation(-off))
    return ob


# ------------------------------------------------------------------ colours baked to vertices
VC_MATS = {}


def vc_material(name):
    if name in VC_MATS:
        return VC_MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.95
    VC_MATS[name] = m
    return m


# materials that keep their own slot when a tile is baked (the game animates / tints these by name)
BAKE_KEEP = ("LampFlame", "Fire", "BonfireFlame", "Water", "WaterDeep", "Lime")


def vc_metal_material(name="TileMetal"):
    if name in VC_MATS:
        return VC_MATS[name]
    m = vc_material(name)
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Metallic"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.35
    return m


def _flat_colour(m):
    if m is None:
        return (0.8, 0.8, 0.8), 0.0
    p = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.node_tree else None
    if p is None:
        return tuple(m.diffuse_color[:3]), 0.0
    col = tuple(p.inputs["Base Color"].default_value[:3]) if not p.inputs["Base Color"].is_linked \
        else tuple(m.diffuse_color[:3])
    return col, p.inputs["Metallic"].default_value


def bake_flat_materials(me):
    """Collapse a mesh's flat-coloured materials into per-corner vertex colours on two shared materials,
    TileMatte and TileMetal; BAKE_KEEP materials (flames, water, limewash) keep their own slots.
    Idempotent: faces already on TileMatte/TileMetal keep their existing colours."""
    matte, metal = vc_material("TileMatte"), vc_metal_material("TileMetal")
    old = me.color_attributes.get("Col")
    old_vals = None
    if old is not None and old.domain == "CORNER":
        old_vals = [0.0] * (len(me.loops) * 4)
        old.data.foreach_get("color", old_vals)
    mats = list(me.materials)
    slots = [matte, metal]
    cols = [1.0] * (len(me.loops) * 4)
    targets = [0] * len(me.polygons)
    for p in me.polygons:
        m = mats[p.material_index] if p.material_index < len(mats) else None
        base = m.name.split(".")[0] if m else ""
        if base in ("TileMatte", "TileMetal"):
            tgt = 0 if base == "TileMatte" else 1
            li = p.loop_indices[0]
            c = tuple(old_vals[li * 4: li * 4 + 3]) if old_vals else (0.8, 0.8, 0.8)
        elif m is not None and any(base.startswith(k) for k in BAKE_KEEP):
            if m not in slots:
                slots.append(m)
            tgt, c = slots.index(m), (1.0, 1.0, 1.0)
        else:
            c, metallic = _flat_colour(m)
            tgt = 1 if metallic > 0.5 else 0
        targets[p.index] = tgt
        for li in p.loop_indices:
            cols[li * 4: li * 4 + 4] = (c[0], c[1], c[2], 1.0)
    me.materials.clear()                          # (this resets face indices, so assign them afterwards)
    for m in slots:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", targets)
    if old is not None:
        me.color_attributes.remove(old)
    attr = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    attr.data.foreach_set("color", cols)
    me.color_attributes.active_color = attr
    try:
        me.color_attributes.render_color_index = me.color_attributes.find("Col")
    except AttributeError:
        pass
    return len(slots)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def rock_color(c, seed=0.0):
    a, b = L.lin("#a85a3a"), L.lin("#d8955d")
    t = 0.5 + 0.5 * math.sin(c.z * 0.55 + noise.noise(c * 0.03 + Vector((seed, 0, 0))) * 3)
    return mix(a, b, t)


def sand_color(c, nz):
    # softened in v3: the old palette went maroon under the dusk grade
    f = noise.noise(Vector((c.x * 0.02, c.y * 0.02, 0.5))) * 0.5 + 0.5
    lo, mid, hi = L.lin("#c8955c"), L.lin("#d8ac74"), L.lin("#e6c28e")
    col = mix(lo, mid, min(1, f * 2)) if f < 0.5 else mix(mid, hi, (f - 0.5) * 2)
    slope = 1 - L.smooth(0.75, 0.98, nz)
    col = mix(col, L.lin("#bf8a58"), slope * 0.5)
    k = 1 + noise.noise(c * 0.9) * 0.06                     # low-poly speckle
    return tuple(min(1, x * k) for x in col)


ROCK_BANDS = ["#9c5236", "#b8663f", "#cd8150", "#dc9a63"]


def band_rock(ob, only_mats, seed=0.0):
    """Split rock faces into four flat strata materials (no vertex colours needed)."""
    me = ob.data
    tidx = {i for i, m in enumerate(me.materials) if m and m.name in only_mats}
    base = len(me.materials)
    for k, h in enumerate(ROCK_BANDS):
        me.materials.append(L.mat(f"RockBand{k}", h, 0.9))
    mw = ob.matrix_world
    for p in me.polygons:
        if p.material_index in tidx:
            c = mw @ p.center
            t = 0.5 + 0.5 * math.sin(c.z * 0.55 + noise.noise(c * 0.03 + Vector((seed, 0, 0))) * 3)
            p.material_index = base + min(3, int(t * 4))


def bake_point_colors(ob, fn, mat_name="SandVC"):
    """Per-vertex colours from fn(world_pos, normal_z); whole mesh uses one vertex-colour material."""
    me = ob.data
    me.materials.clear()
    me.materials.append(vc_material(mat_name))
    attr = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    me.color_attributes.active_color = attr
    mw = ob.matrix_world
    cols = []
    for v in me.vertices:
        cols += [*fn(mw @ v.co, (mw.to_3x3() @ v.normal).normalized().z), 1.0]
    attr.data.foreach_set("color", cols)
    try:
        me.shade_smooth()           # shared vertices; three.js flat-shades when normals are omitted
    except AttributeError:
        for p in me.polygons:
            p.use_smooth = True


def bake_face_colors(ob, fn, only_mats=None, mat_name="TerrainVC"):
    """Flat per-face vertex colours from fn(world_centre, normal_z). Faces using
    node-coloured materials (or all faces) switch to a vertex-colour material."""
    me = ob.data
    if "Col" not in me.color_attributes:
        me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    attr = me.color_attributes["Col"]
    mw = ob.matrix_world
    vcm = vc_material(mat_name)
    if only_mats is None:
        me.materials.clear()
        me.materials.append(vcm)
        is_target = lambda p: True
    else:
        tidx = {i for i, m in enumerate(me.materials) if m and m.name in only_mats}
        is_target = lambda p: p.material_index in tidx
    me.materials.append(vcm)
    vci = len(me.materials) - 1
    cols = [1.0] * (len(me.loops) * 4)
    for p in me.polygons:
        if is_target(p):
            c = fn(mw @ p.center, (mw.to_3x3() @ p.normal).normalized().z)
            p.material_index = vci
        else:
            c = (1, 1, 1)
        for li in p.loop_indices:
            cols[li * 4:li * 4 + 4] = (*c, 1.0)
    attr.data.foreach_set("color", cols)


# ------------------------------------------------------------------ characters
UPPER = {"spine", "head", "arm_L", "arm_R", "hand_L", "hand_R"}


def _action_bones(a):
    paths = []
    try:
        paths = [fc.data_path for fc in a.fcurves]
    except AttributeError:
        pass
    if not paths:                                    # slotted / layered actions (Blender 4.4+)
        for layer in getattr(a, "layers", []):
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", []):
                    paths += [fc.data_path for fc in bag.fcurves]
    return {p.split('"')[1] for p in paths if '"' in p}


def clip_info():
    """Per-clip frames, loop flag, layer (upper-body clips only key UPPER bones) and hit timing."""
    out = {}
    fps = rigs.FPS
    for a in bpy.data.actions:
        bones = _action_bones(a)
        d = {"frames": a["frames"], "loop": bool(a["loop"]), "duration": round(a["frames"] / fps, 3),
             "layer": "upper" if bones and bones <= UPPER else "full"}
        if "hit" in a:
            d["hit_frame"] = a["hit"]
            d["hit_time"] = round((a["hit"] - 1) / fps, 3)
        if "windup_end" in a:
            d["windup_end_time"] = round((a["windup_end"] - 1) / fps, 3)
        if "release" in a:
            d["release_time"] = round((a["release"] - 1) / fps, 3)
        for k in ("chain", "cancel"):                       # earliest next attack / earliest move or roll out
            if k in a:
                d[k + "_time"] = round((a[k] - 1) / fps, 3)
        for k in ("travel", "speed"):                       # metres the feet cover / ground speed m/s
            if k in a:
                d[k] = a[k]
        out[a.name] = d
    return out


def export_characters():
    clear_scene()
    col = L.coll("Characters")
    arm = rigs.build_person(col)
    clips = clip_info()
    export([arm], "characters/person.glb", "character", anim=True, extra={
        "bones": [b[0] for b in rigs.PERSON_BONES],
        "accessories": sorted(o.name for o in bpy.data.objects if o.get("accessory")),
        "clips": clips,
        "notes": ("Body + accessory SkinnedMeshes share one skeleton; toggle accessories with .visible. "
                  "Recolour by cloning materials named P_*. Upper-body clips (Attack, Attack2, Talk, Hit) key only "
                  "spine/arms/head so they layer over Walk/Run/Ride (see each clip's layer and hit_time). "
                  "Thrust rotates hand_R so the upright Spear levels out; Shield sits on hand_L and faces forward in Block. "
                  "Clip ground speeds: Walk 1.5 m/s, Run 4.8 m/s. Death ends lying down (clampWhenFinished)."),
    })
    clear_scene()
    arm = rigs.build_horse(col)
    clips = clip_info()
    export([arm], "characters/horse.glb", "character", anim=True, extra={
        "accessories": ["Saddle"], "clips": clips,
        "sockets": {"mount": "attach the rider's root here; rider plays Ride"},
        "notes": "Clip ground speeds: Walk 1.7 m/s, Gallop 9 m/s. Recolour H_Coat / H_Mane / H_Blanket.",
    })
    clear_scene()
    arm = rigs.build_horse(col, winged=True)
    clips = clip_info()
    export([arm], "characters/horse_winged.glb", "character", anim=True, extra={
        "accessories": sorted(o.name for o in bpy.data.objects if o.get("accessory")), "clips": clips,
        "sockets": {"mount": "attach the rider's root here; rider plays Ride"},
        "notes": ("Winged horse (spawn role winged_horse). Wings live on the Body mesh, skinned to wing_L/wing_R: "
                  "folded flat on the back in Idle/Walk/Gallop/Rear, spread in Flap (loop, one beat = 0.5 s, the "
                  "downstroke peaks at frame 7) and Glide (loop). Legs tuck in both. Bareback (no saddle)."),
    })
    clear_scene()
    arm = rigs.build_camel(col)
    clips = clip_info()
    export([arm], "characters/camel.glb", "character", anim=True, extra={
        "accessories": ["Saddle", "Cargo"], "clips": clips,
        "sockets": {"mount": "attach the rider's root here; rider plays Ride"},
        "notes": "Clip ground speeds: Walk 1.8 m/s, Run 6 m/s. Sit is a lying-down loop.",
    })
    clear_scene()
    arm = rigs.build_dog(col)
    clips = clip_info()
    export([arm], "characters/dog.glb", "character", anim=True, extra={
        "accessories": ["Collar"], "clips": clips,
        "notes": ("Desert hound (enemy kind 'hound'). Walk 1.6 m/s, Run 7 m/s. Lunge leaps forward (move the root "
                  "~3 m over 0.25-0.55 s); bite lands at hit_time. Growl is a crouched loop. Death ends on its side. "
                  "Recolour D_Coat / D_Dark."),
    })
    clear_scene()
    arm = rigs.build_rat(col)
    clips = clip_info()
    export([arm], "characters/rat.glb", "character", anim=True, extra={
        "clips": clips,
        "notes": ("Giant rat (enemy kind 'rat'), ~0.35 m plus tail. Same clip names as the hound (Idle, Walk, Run, "
                  "Lunge, Bite, Hit, Death, Growl), offsets scaled to its size. Recolour R_Fur / R_Skin."),
    })
    clear_scene()
    arm = rigs.build_bird(col)
    clips = clip_info()
    export([arm], "characters/bird.glb", "character", anim=True, extra={
        "origin": "body centre (it lives in the air; on the ground the origin sits ~0.32 m up)",
        "clips": clips,
        "notes": ("Lappet-faced vulture (enemy kind 'vulture'), ~2 m wingspan, rest pose = wings spread. Fly: one "
                  "wingbeat per 0.5 s (downstroke peaks 0.25 s). Dive: wings sweep back, talons forward, strike at "
                  "hit_time. Death tumbles and ends sprawled (rest it on the ground with the origin ~0.15 m up). "
                  "Recolour B_Feather / B_Dark."),
    })


# ------------------------------------------------------------------ prop kit
def export_props():
    clear_scene()
    random.seed(101)
    jobs = []
    # buildings
    for name, w, d, h, fl in [("house_a", 5.0, 5.0, 4.0, 1), ("house_b", 6.5, 5.5, 5.5, 2),
                              ("house_c", 4.2, 4.2, 3.6, 1), ("house_d", 7.0, 6.0, 4.5, 2)]:
        jobs.append(("buildings/" + name, "building", lambda w=w, d=d, h=h, fl=fl: L.house(0, 0, 0, w, d, h, fl)))
    for name, h in [("tower_house_a", 11.0), ("tower_house_b", 14.5)]:
        jobs.append(("buildings/" + name, "building", lambda h=h: L.tower_house(0, 0, 0, 4.8, 4.6, h)))
    jobs.append(("buildings/temple", "building", lambda: _build_at_origin(L.temple)))
    # market
    for i, kind in enumerate(["spice", "pots", "cloth", "brass"]):
        jobs.append((f"market/stall_{kind}", "prop", lambda kind=kind, i=i: L.stall(0, 0, 0, kind=kind, awning=i)))
    # nature
    for i, s in enumerate([1.0, 1.15, 0.9]):
        jobs.append((f"nature/palm_{'abc'[i]}", "nature", lambda s=s: L.palm(0, 0, s, 0.2)))
    jobs.append(("nature/tent", "prop", lambda: _tent()))
    for k in jobs:
        rel, kind, fn = k
        clear_scene()
        random.seed(hash(rel) % 1000)
        ob = fn()
        to_origin(ob, sink=0.0)
        export([ob], rel + ".glb", kind)

    # small props
    small = {
        "jar_large": lambda mb: (mb.cyl((0, 0, 0.4), 0.28, 0.18, 0.8, L.CLAY, segs=8),
                                 mb.cyl((0, 0, 0.84), 0.12, 0.16, 0.1, L.CLAY, segs=8)),
        "jar_small": lambda mb: (mb.cyl((0, 0, 0.2), 0.15, 0.09, 0.4, L.CLAY2, segs=7),
                                 mb.cyl((0, 0, 0.44), 0.06, 0.08, 0.08, L.CLAY2, segs=7)),
        "sack": lambda mb: mb.box((0, 0, 0.3), (0.5, 0.45, 0.6), L.mat("Sack", "#cdb48a", 1.0)),
        "crate": lambda mb: (mb.box((0, 0, 0.35), (0.7, 0.7, 0.7), L.WOOD),
                             mb.box((0, 0, 0.35), (0.72, 0.1, 0.72), L.LEATHER)),
        "lantern": lambda mb: (mb.box((0, 0, 0.11), (0.16, 0.16, 0.22), L.LAMP),
                               mb.box((0, 0, 0.24), (0.2, 0.2, 0.04), L.GOLD)),
        "campfire": lambda mb: (mb.cyl((0, 0, 0.3), 0.35, 0.05, 0.6, L.mat("Fire", "#ffb066", 0.5, emit="#ff7a1a", strength=60), segs=5),
                                *[mb.box((math.cos(a) * 0.45, math.sin(a) * 0.45, 0.06), (0.5, 0.12, 0.12), L.WOOD, rot=(0, 0, a))
                                  for a in (0.3, 1.9, 3.6, 5.0)]),
        "spice_pile": lambda mb: (mb.cyl((0, 0, 0.07), 0.2, 0.2, 0.14, L.WOOD, segs=8),
                                  mb.cyl((0, 0, 0.26), 0.19, 0.02, 0.24, L.SPICES[0], segs=8)),
        "rug": lambda mb: mb.box((0, 0, 0.02), (1.6, 2.4, 0.04), L.FABRICS[0]),
    }
    for name, fn in small.items():
        clear_scene()
        mb = L.MB()
        fn(mb)
        ob = mb.build(name, L.C_LAND)
        export([ob], f"props/{name}.glb", "prop")

    # bonfire: rest point. Separate "Flame" node so the game can light it.
    clear_scene()
    mb = L.MB()
    stone = L.mat("StoneDark", "#9a8466", 0.9)
    for k in range(9):
        a = k / 9 * math.tau
        mb.ico((math.cos(a) * 0.75, math.sin(a) * 0.75, 0.12), (0.22, 0.18, 0.15), stone, sub=1, jitter=0.03)
    mb.cyl((0, 0, 0.03), 0.62, 0.62, 0.05, L.mat("Ash", "#2e2620", 1.0), segs=10)
    for a in (0.2, 1.4, 2.6, 3.8, 5.0):
        mb.box((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.14), (0.6, 0.11, 0.11), L.mat("Charred", "#2a1d14", 1.0),
               rot=(0, -0.5, a))
    steel = rigs.mat("P_Steel", "#c9cdd2", 0.25, metallic=1.0)
    brass = rigs.mat("P_Brass", "#c99a3a", 0.35, metallic=1.0)
    lean = (0.18, 0.12, 0.4)
    mb.box((0, 0, 0.45), (0.025, 0.08, 0.9), steel, rot=lean)                 # blade, buried in the embers
    mb.box((0.075, -0.04, 0.95), (0.06, 0.3, 0.05), brass, rot=lean)         # guard
    mb.box((0.1, -0.06, 1.08), (0.05, 0.05, 0.2), rigs.mat("P_Grip", "#3a2414", 0.8), rot=lean)
    mb.box((0.12, -0.07, 1.2), (0.07, 0.07, 0.06), brass, rot=lean)
    base = mb.build("Bonfire", L.C_LAND)
    fm = L.MB()
    flame = L.mat("BonfireFlame", "#ffb066", 0.5, emit="#ff7a1a", strength=40)
    fm.cyl((0, 0, 0.4), 0.38, 0.03, 0.75, flame, segs=5)
    fm.cyl((0.12, 0.08, 0.3), 0.18, 0.02, 0.5, flame, segs=4)
    fl = fm.build("Flame", L.C_LAND)
    export([base, fl], "props/bonfire.glb", "prop", extra={
        "notes": "Nodes: Bonfire (stone ring, logs, sword in the embers) and Flame (emissive; hide when unlit)."})

    # chest: Lid node pivots on the back hinge; lid.rotation.x = -1.7 opens it (same sign in three.js)
    clear_scene()
    mb = L.MB()
    wood = L.mat("ChestWood", "#6b4423", 0.8)
    band = brass
    w, d, h = 1.0, 0.62, 0.5
    mb.box((0, 0, h / 2), (w, d, h), wood)
    for sx in (-0.38, 0.0, 0.38):
        mb.box((sx, 0, h / 2), (0.06, d + 0.02, h + 0.01), band)
    mb.box((0, -d / 2 - 0.01, h - 0.08), (0.12, 0.03, 0.14), band)
    cb = mb.build("ChestBase", L.C_LAND)
    lm = L.MB()
    lm.box((0, -d / 2, 0.12), (w, d, 0.24), wood)
    for sx in (-0.38, 0.0, 0.38):
        lm.box((sx, -d / 2, 0.12), (0.06, d + 0.02, 0.25), band)
    lm.box((0, -d - 0.01, 0.06), (0.12, 0.03, 0.12), band)
    lid = lm.build("ChestLid", L.C_LAND, loc=(0, d / 2, h))
    export([cb, lid], "props/chest.glb", "prop", extra={
        "notes": "Nodes: ChestBase and ChestLid (origin on the back hinge). Open with lid.rotation.x = -1.7."})

    # arrow: shaft along +Z (three.js) = -Y (Blender), bronze tip at +Z, origin at the shaft centre
    clear_scene()
    mb = L.MB()
    mb.box((0, 0, 0), (0.012, 0.75, 0.012), rigs.mat("P_Wood", "#7a5a3a", 0.8))
    mb.box((0, -0.395, 0), (0.026, 0.05, 0.008), rigs.mat("P_Brass", "#c99a3a", 0.35, metallic=1.0))
    mb.box((0, -0.43, 0), (0.014, 0.025, 0.006), rigs.mat("P_Brass", "#c99a3a", 0.35, metallic=1.0))
    mb.box((0, 0.375, 0), (0.018, 0.02, 0.018), rigs.mat("P_Bow", "#5a3a22", 0.7))
    vane = rigs.mat("P_Vane", "#2a2420", 0.9)
    for a in (0, 120, 240):
        mb.box((math.cos(R(a)) * 0.012, 0.31, math.sin(R(a)) * 0.012), (0.003, 0.09, 0.022), vane, rot=(0, R(a), 0))
    ob = mb.build("arrow", L.C_LAND)
    export([ob], "props/arrow.glb", "prop", extra={"notes": "~0.84 m overall; shaft along +Z, bronze tip at +Z, origin = shaft centre"})
    # thrown stone: fist-sized, origin at its centre
    clear_scene()
    mb = L.MB()
    mb.ico((0, 0, 0), (0.085, 0.075, 0.07), L.mat("ThrowStone", "#8a7a66", 0.9), sub=1, jitter=0.012)
    ob = mb.build("rock_throw", L.C_LAND)
    export([ob], "props/rock_throw.glb", "prop", extra={"notes": "~0.16 m stone, origin at its centre"})
    # archery target
    clear_scene()
    import kit as _K
    mb = L.MB()
    _ctx = _K.Ctx()
    _saved = L.HEIGHT_FN
    L.HEIGHT_FN = lambda x, y: 0.0
    _K.archery_target(mb, _ctx, 0, 0, 0.0)
    L.HEIGHT_FN = _saved
    ob = mb.build("archery_target", L.C_LAND)
    export([ob], "props/archery_target.glb", "prop", extra={
        "notes": "Straw butt on an A-frame; painted face toward +Z, centre 1.1 m up. In maps its collider tag is 'target'."})

    # standalone sword (pickups / racks): grip at origin, blade along +Y (three.js)
    clear_scene()
    mb = L.MB()
    steel = rigs.mat("P_Steel", "#c9cdd2", 0.25, metallic=1.0)
    brass = rigs.mat("P_Brass", "#c99a3a", 0.35, metallic=1.0)
    mb.box((0, 0, 0.55), (0.02, 0.07, 0.82), steel)
    mb.box((0, 0, 0.98), (0.02, 0.045, 0.06), steel)
    mb.box((0, 0, 0.11), (0.26, 0.05, 0.04), brass)
    mb.box((0, 0, 0.0), (0.04, 0.04, 0.18), rigs.mat("P_Grip", "#3a2414", 0.8))
    mb.box((0, 0, -0.11), (0.06, 0.06, 0.05), brass)
    ob = mb.build("sword", L.C_LAND)
    export([ob], "props/sword.glb", "prop", extra={"notes": "origin = grip; blade points +Y"})

    # sandstone buttes and the rock-cut tomb (vertex coloured strata)
    for i, (r, h) in enumerate([(14, 16), (20, 26), (10, 22)]):
        clear_scene()
        random.seed(40 + i)
        mb = L.MB()
        rockm = L.MATS.get("Rock") or L.mat("Rock", "#c27a4e", 0.9)
        L.butte(mb, 0, 0, r, h, rockm)
        ob = mb.build(f"butte_{'abc'[i]}", L.C_LAND)
        to_origin(ob, sink=2.0)
        band_rock(ob, {rockm.name}, i)
        export([ob], f"nature/butte_{'abc'[i]}.glb", "nature")


def _build_at_origin(fn):
    before = set(bpy.data.objects)
    fn(0, 0, 0)
    return next(o for o in bpy.data.objects if o not in before)


def _tent():
    before = set(bpy.data.objects)
    L.tent(0, 0, 0, 1.0)
    return next(o for o in bpy.data.objects if o not in before)


# ------------------------------------------------------------------ level
# playable terrain in Blender coords
TX0, TX1, TY0, TY1, TSTEP = -200.0, 200.0, -150.0, 250.0, 2.0


def export_level():
    clear_scene()
    random.seed(11)
    colliders = []
    spawns = []
    lights = []

    def box_col(cx, cy, cz, sx, sy, sz, rot, tag):
        colliders.append({"pos": to3((cx, cy, cz)), "half": [round(sx / 2, 3), round(sz / 2, 3), round(sy / 2, 3)],
                          "yaw": round(rot, 4), "tag": tag})

    # --- terrain (regular grid, flat-shaded triangles, vertex colours)
    nx, ny = int((TX1 - TX0) / TSTEP), int((TY1 - TY0) / TSTEP)
    bm = bmesh.new()
    verts = [[bm.verts.new((TX0 + i * TSTEP, TY0 + j * TSTEP, L.height(TX0 + i * TSTEP, TY0 + j * TSTEP)))
              for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            a, b, c, d = verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]
            if (i + j) % 2:
                bm.faces.new((a, b, c)); bm.faces.new((a, c, d))
            else:
                bm.faces.new((a, b, d)); bm.faces.new((b, c, d))
    me = bpy.data.meshes.new("Terrain")
    bm.to_mesh(me)
    bm.free()
    terrain = bpy.data.objects.new("Terrain", me)
    L.C_LAND.objects.link(terrain)
    bake_point_colors(terrain, sand_color)
    export([terrain], "level/terrain.glb", "terrain", vcol=True, normals=False,
           extra={"notes": "vertex colours, no normals: GLTFLoader enables flatShading automatically"})
    # heights for physics / ground queries, row-major over three.js z (= -blender y)
    rows = []
    zs = [TY1 - j * TSTEP for j in range(ny + 1)]          # three z from -TY1 .. -TY0
    with open(os.path.join(ASSETS, "level", "heights.bin"), "wb") as f:
        for by in zs:
            f.write(struct.pack(f"<{nx + 1}f", *[L.height(TX0 + i * TSTEP, by) for i in range(nx + 1)]))
    heights_meta = {"file": "level/heights.bin", "format": "float32 little-endian, row-major",
                    "cols": nx + 1, "rows": ny + 1, "step": TSTEP,
                    "x0": TX0, "z0": -TY1,
                    "index": "h = data[row * cols + col]; x = x0 + col*step; z = z0 + row*step"}
    bpy.data.objects.remove(terrain, do_unlink=True)

    # --- town (mirrors render_still.py layout)
    town = []
    POOL = Vector((-30, 0))
    bpy.ops.mesh.primitive_circle_add(vertices=14, radius=9, fill_type="NGON",
                                      location=(POOL.x, POOL.y, L.height(POOL.x, POOL.y) + 0.12))
    pool = bpy.context.active_object
    pool.name = "Pool"
    pool.scale.y = 0.6
    water = rigs.mat("Water", "#1d4a52", 0.05)
    pool.data.materials.append(water)
    town.append(pool)
    box_col(POOL.x, POOL.y, L.height(POOL.x, POOL.y), 15, 9, 2, 0, "water")
    mb = L.MB()
    for i in range(120):
        a = random.uniform(0, math.tau)
        r = random.uniform(9.2, 13)
        gx, gy = POOL.x + math.cos(a) * r, POOL.y + math.sin(a) * r * 0.65
        mb.cyl((gx, gy, L.height(gx, gy) + 0.25), 0.25, 0.02, random.uniform(0.4, 0.9), L.mat("Grass", "#6f7f30", 0.9), segs=4)
    town.append(mb.build("Reeds", L.C_LAND))
    palms = []
    for i in range(16):
        a = random.uniform(0, math.tau)
        r = random.uniform(10, 17)
        palms.append((POOL.x + math.cos(a) * r, POOL.y + math.sin(a) * r * 0.7, random.uniform(0.9, 1.25)))
    palms += [(x, y, random.uniform(0.9, 1.2)) for x, y in
              [(14, 52), (24, 40), (-12, 50), (30, 12), (-46, 16), (44, 30), (-44, 34), (22, -30), (-20, -34)]]
    for x, y, s in palms:
        town.append(L.palm(x, y, s, 0.2))
        box_col(x, y, L.height(x, y) + 2, 0.7, 0.7, 4, 0, "palm")

    random.seed(3)
    spots = []
    for i in range(46):
        for _ in range(60):
            a = random.uniform(0, math.tau)
            r = math.sqrt(random.uniform(0.02, 1)) * 0.86
            x, y = L.WALL_C.x + math.sin(a) * r * L.WALL_RX, L.WALL_C.y + math.cos(a) * r * L.WALL_RY
            if abs(x) < 3.5 and y < L.WALL_C.y - 4:
                continue
            if (Vector((x, y)) - Vector((6, 54))).length < 13:
                continue
            if all((Vector((x, y)) - s).length > 6.5 for s in spots):
                spots.append(Vector((x, y)))
                break
    for i, s in enumerate(spots):
        rot = random.uniform(-0.15, 0.15)
        z = L.height(s.x, s.y)
        if i % 4 == 0:
            w, d, h = random.uniform(4.2, 5.5), random.uniform(4.2, 5.2), random.uniform(9, 15)
            town.append(L.tower_house(s.x, s.y, rot, w, d, h))
        else:
            w, d = random.uniform(4, 7), random.uniform(4, 6.5)
            h = random.uniform(3.5, 6.0)
            town.append(L.house(s.x, s.y, rot, w, d, h, floors=2 if random.random() < 0.45 else 1))
        box_col(s.x, s.y, z + h / 2, w, d, h + 2, rot, "building")
    before = set(bpy.data.objects)
    L.temple(6, 54, math.radians(-4))
    L.town_wall()
    town += [o for o in bpy.data.objects if o not in before]
    tz = L.height(6, 54)
    box_col(6, 54, tz + 2, 16, 12.8, 4, math.radians(-4), "building")
    box_col(6, 55.5, tz + 7, 12, 8.4, 6, math.radians(-4), "building")
    # wall colliders (same polyline as arabia_lib.town_wall)
    pts = []
    for i in range(41):
        a = math.radians(188 + i * (344 / 40))
        pts.append(Vector((L.WALL_C.x + math.sin(a) * L.WALL_RX, L.WALL_C.y + math.cos(a) * L.WALL_RY)))
    for a, b in zip(pts, pts[1:]):
        mid, dv = (a + b) / 2, b - a
        z = L.height(mid.x, mid.y)
        box_col(mid.x, mid.y, z + 2.5, dv.length + 0.4, 1.6, 6, math.atan2(dv.y, dv.x), "wall")
    for i in (0, 10, 20, 30, 40):
        p = pts[i]
        box_col(p.x, p.y, L.height(p.x, p.y) + 3.4, 3.4, 3.4, 7, 0, "wall")
    g = Vector((L.WALL_C.x, L.WALL_C.y - L.WALL_RY))
    for sx in (-3.6, 3.6):
        box_col(g.x + sx, g.y, L.height(g.x, g.y) + 4, 3.4, 4.0, 8, 0, "wall")

    random.seed(5)
    stalls = []
    for i in range(7):
        y = -24 + i * 5.0
        stalls.append(L.stall(-7.0 - random.uniform(0, 0.6), y, math.radians(90) + random.uniform(-0.06, 0.06)))
        stalls.append(L.stall(7.0 + random.uniform(0, 0.6), y + 2.0, math.radians(-90) + random.uniform(-0.06, 0.06)))
    for (x, y, r) in [(-15, -14, 0.4), (15, -10, -0.5), (-14, 2, 0.2), (16, 6, -0.3),
                      (-17, -26, 0.7), (18, -22, -0.8)]:
        stalls.append(L.stall(x, y, r))
    bpy.context.view_layer.update()
    for st in stalls:
        w, d = list(st["wd"])
        box_col(st.location.x, st.location.y, st.location.z + 1.25, w + 0.2, d, 2.5, st.rotation_euler.z, "stall")
        if len(st["lamps"]):
            lights.append({"type": "lamp", "pos": to3(st.matrix_world @ Vector(list(st["lamps"])))})
    town += stalls
    random.seed(4)
    for (x, y, r) in [(58, 40, -0.4), (66, 52, -0.7), (52, 60, -0.2)]:
        before = set(bpy.data.objects)
        L.tent(x, y, r, 1.0)
        town += [o for o in bpy.data.objects if o not in before]
        box_col(x, y, L.height(x, y) + 1, 7, 4, 2, r, "tent")
    fire = L.MB()
    fire.cyl((0, 0, 0.25), 0.35, 0.05, 0.6, L.mat("Fire", "#ffb066", 0.5, emit="#ff7a1a", strength=60), segs=5)
    town.append(fire.build("Campfire", L.C_LAND, loc=(60, 46, L.height(60, 46))))
    lights.append({"type": "fire", "pos": to3((60, 46, L.height(60, 46) + 0.6))})
    # tomb
    before = set(bpy.data.objects)
    L.build_tomb()
    tomb = [o for o in bpy.data.objects if o not in before]
    for o in tomb:
        band_rock(o, {"TombRock"}, 3)
    town += tomb
    box_col(72, 118, L.height(72, 112) + 8, 30, 22, 18, math.radians(-18), "rock")

    # join the static town into one mesh (one draw call per material)
    bpy.context.view_layer.update()
    vl = bpy.context.view_layer
    for o in bpy.data.objects:
        if o.name in vl.objects:
            o.select_set(False)
    meshes = [o for o in town if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    vl.objects.active = meshes[0]
    bpy.ops.object.join()
    town_ob = vl.objects.active
    town_ob.name = "Town"
    export([town_ob], "level/town.glb", "level")
    bpy.data.objects.remove(town_ob, do_unlink=True)

    # --- backdrop: mountains + far mesas + a coarse far-terrain ring (no colliders)
    random.seed(11)
    before = set(bpy.data.objects)
    L.build_mountains()
    back = [o for o in bpy.data.objects if o not in before]
    for o in back:
        if o.name.startswith("Mesas"):
            band_rock(o, {"Rock"}, 7)
    step = 20.0
    bm = bmesh.new()
    N = 90
    vv = {}
    for j in range(N + 1):
        for i in range(N + 1):
            x, y = -900 + i * step, -810 + j * step
            inside = TX0 + 2 < x < TX1 - 2 and TY0 + 2 < y < TY1 - 2
            vv[i, j] = bm.verts.new((x, y, L.height(x, y) - (0.6 if inside else 0.3)))
    for j in range(N):
        for i in range(N):
            x, y = -900 + i * step, -810 + j * step
            if TX0 <= x and x + step <= TX1 and TY0 <= y and y + step <= TY1:
                continue                                  # hole under the playable terrain
            bm.faces.new((vv[i, j], vv[i + 1, j], vv[i + 1, j + 1], vv[i, j + 1]))
    me = bpy.data.meshes.new("FarTerrain")
    bm.to_mesh(me)
    bm.free()
    far = bpy.data.objects.new("FarTerrain", me)
    L.C_LAND.objects.link(far)
    bake_point_colors(far, sand_color)
    export([far], "level/backdrop_ground.glb", "backdrop", vcol=True, normals=False,
           extra={"notes": "coarse ground ring around the playable terrain (hole in the middle)"})
    export(back, "level/backdrop.glb", "backdrop")

    # --- spawns (three.js coords, yaw about +Y)
    def sp(role, x, y, rot, **kw):
        z = kw.pop("z", None)
        d = {"role": role, "pos": to3((x, y, L.height(x, y) if z is None else z)), "yaw": round(rot, 4)}
        d.update(kw)
        spawns.append(d)
    random.seed(9)
    sp("player", 1.0, -44.0, 0.0)
    for i in range(40):
        x = random.uniform(-4.8, 4.8) if i < 30 else random.uniform(-14, 14)
        y = random.uniform(-30, 18)
        sp("wanderer", x, y, random.uniform(-math.pi, math.pi))
    for i in range(7):
        y = -24 + i * 5.0
        sp("merchant", -8.6, y, math.radians(90))
        sp("merchant", 8.6, y + 2.0, math.radians(-90))
    for (x, y, r) in [(-21.5, 4, 1.2), (-22, 7, 2.0), (-36, 6, -0.7), (10.5, -28, 0.3), (-10.5, -27, -0.5)]:
        sp("sitter", x, y, r)
    for (x, y, r) in [(-18, -8, -2.2), (-13, -14, -2.6), (-21, -4, -1.9)]:
        sp("water_carrier", x, y, r)
    # clear of the gate towers (tower front faces sit at y = 20)
    sp("guard", -2.6, 18.6, 0.0)
    sp("guard", 2.6, 18.6, 0.0)
    sp("priest", 6.0, 47.0, 0.0)
    for (x, y, r, sit) in [(-5, -34, 0.9, False), (-11, -36, -1.2, True), (12, -33, 2.4, False),
                           (-12, -31, 1.6, True), (13, 14, 0.3, False), (-24, -16, 2.8, False),
                           (21, -14, -2.0, True), (-8, 12, 1.4, False),
                           (60, 30, 2.0, True), (70, 44, 1.1, False), (48, 48, -0.6, True)]:
        sp("camel", x, y, r, sitting=sit)
    for (x, y, r) in [(6.0, -46.0, 0.3), (9.0, -44.0, 0.6), (-24.0, -26.0, 1.2)]:
        sp("horse", x, y, r)
    # hostile raider camps out in the dunes: kind = raider | brute | skirmisher
    raider_camps = {
        "tomb": [(64, 90, "raider"), (76, 91, "brute"), (70, 84, "skirmisher"), (82, 86, "raider")],
        "south_dunes": [(-40, -96, "raider"), (-31, -102, "skirmisher"), (-46, -106, "raider"), (-37, -110, "brute")],
        "crest": [(-92, 98, "skirmisher"), (-84, 104, "raider"), (-98, 106, "raider")],
        "east_flats": [(110, -20, "raider"), (118, -12, "brute"), (104, -8, "skirmisher")],
    }
    for camp, members in raider_camps.items():
        for (x, y, kind) in members:
            sp("enemy", x, y, random.uniform(-math.pi, math.pi), kind=kind, camp=camp)
    # caravan path along the big dune crest (patrol waypoints)
    crest = [L.crest_point(u) for u in range(-90, 30, 10)]

    # --- v3: exits to the other maps, arrival points, dune dressing (own seed: spawns unchanged)
    import kit as K
    import maps as MP
    exits = [("caravanserai", 0, -146, (3.5, -142), (0, -138, math.pi), "South along the incense road to the caravanserai"),
             ("hegra", 196, 30, (192, 33.5), (188, 30, -math.pi / 2), "East to Hegra, the rock-cut city"),
             ("wadi", -196, 0, (-192, 3.5), (-188, 0, math.pi / 2), "West to the wadi gardens"),
             ("raider_fort", 40, 246, (43.5, 242), (40, 238, 0.0), "North, into raider country")]
    for to, x, y, cairn, arrive, label in exits:
        sp("player", arrive[0], arrive[1], arrive[2], **{"from": to})
    random.seed(77)
    dctx = K.Ctx()
    dctx.keepout += [(L.TOWN.x, L.TOWN.y + 10, 66), (72, 112, 24), (60, 46, 20), (POOL.x, POOL.y, 20)]
    for s_ in spawns:
        dctx.keepout.append((s_["pos"][0], -s_["pos"][2], 8 if s_["role"] == "enemy" else 3))
    dctx.keepout += [(p.x, p.y, 4) for p in crest]
    dmb = L.MB()
    for to, x, y, cairn, arrive, label in exits:
        dctx.keepout.append((x, y, 12))
        K.cairn(dmb, dctx, *cairn)

    class _Oasis:
        bounds = (TX0, TX1, TY0, TY1)
    MP.dress(dmb, dctx, _Oasis, lambda x, y: True, rocks=60, singles=120, shrubs=260, dry=120, acacias=30, dead=12,
             ruins=6, bones=8)
    # v4: exit to the rooftop town, gameplay markers (after the dressing pass, so it is unchanged)
    exits.append(("rooftops", 186, 150, (182, 153.5), (180, 144, R(45)), "North-east to the rooftops of Qaryat al-Faw"))
    K.cairn(dmb, dctx, 182, 153.5)
    sp("player", 180, 144, R(45), **{"from": "rooftops"})
    sp("bonfire", -4.0, -42.0, 0.0, id="oasis_market")
    sp("bonfire", 54.0, 70.0, 0.0, id="oasis_tomb_approach")
    sp("shopkeeper", -15.5, -12.8, 0.4, id="oasis_trader")
    sp("quest_giver", 9.0, 47.0, 0.0, id="oasis_priest")
    sp("quest_giver", -19.0, 9.0, 2.0, id="oasis_elder")
    sp("pickup", -21.0, -3.0, 0.0, id="pool_jar")
    sp("pickup", 72.0, 105.0, 0.0, id="tomb_tablet")
    cb = L.crest_point(-30)
    sp("pickup", cb.x, cb.y, 0.0, id="crest_lost_bundle")
    sp("chest", 63.0, 50.0, 0.0, id="oasis_camp_chest")
    # v5: hound packs with the raider camps, test enemies near the start, slingers on high dunes
    for camp, pts in {"tomb": [(70, 96), (75, 98), (66, 94)], "south_dunes": [(-34, -92), (-44, -90)],
                      "crest": [(-88, 96), (-95, 101)], "east_flats": [(114, -24), (106, -25)]}.items():
        for (x, y) in pts:
            sp("enemy", x, y, random.uniform(-math.pi, math.pi), kind="hound", camp=camp)
    # the test camp lives out in the south-east dunes, >70 m from every arrival and bonfire
    for (x, y) in [(108, -78), (111.5, -80), (106, -82)]:
        sp("enemy", x, y, R(140), kind="hound", camp="test")
    sp("enemy", 110, -86, 0.0, kind="vulture", camp="test", z=round(L.height(110, -86) + 16, 3), airborne=True)
    sp("enemy", -60, -60, 0.0, kind="vulture", camp="sky", z=round(L.height(-60, -60) + 20, 3), airborne=True)
    sp("enemy", 103, -73, R(140), kind="slinger", camp="test")
    sp("enemy", 120, -8, R(-120), kind="slinger", camp="east_flats")
    sp("enemy", 116, -75, R(140), kind="clubman", camp="test")
    sp("enemy", 112, -14, R(-100), kind="clubman", camp="east_flats")
    # archery range west of the gate: targets face south toward the market
    for k, (tx, ty) in enumerate([(-9.5, 18.6), (-13.5, 18.4), (-17.5, 18.0)]):
        tc = K.archery_target(dmb, dctx, tx, ty, 0.0)
    dctx.landmarks = getattr(dctx, "landmarks", {})
    dob = dmb.build("Dressing", L.C_LAND)
    export([dob], "level/dressing.glb", "level", extra={"notes": "dune dressing; colliders are in level.json"})
    bpy.data.objects.remove(dob, do_unlink=True)
    for c in dctx.colliders:
        box_col(*c)
    archery = {"archery_range": to3((-13.5, 11.0, L.height(-13.5, 11.0)))}
    for k, x, y, z in dctx.lights:
        lights.append({"type": k, "pos": to3((x, y, z))})
    level = {
        "name": "oasis", "title": "The oasis town",
        "dressing": "level/dressing.glb", "backdrop_ground": "level/backdrop_ground.glb",
        "sky": {"env_hdr": "sky/sunset_env.hdr", "background_jpg": "sky/sunset_bg.jpg"},
        "exits": [{"to": to, "pos": to3((x, y, L.height(x, y))), "radius": 6.0, "label": label}
                  for to, x, y, cairn, arrive, label in exits],
        "terrain": "level/terrain.glb", "town": "level/town.glb", "backdrop": "level/backdrop.glb",
        "bounds": {"x": [TX0, TX1], "z": [-TY1, -TY0]},
        "heights": heights_meta,
        "sun": {"direction_to_sun": to3(tuple(L.SUN_DIR)), "color": "#ffb46b", "elevation_deg": 8.0},
        "fog": {"color": "#e8c49a", "near": 60, "far": 520},
        "colliders": colliders,
        "spawns": spawns,
        "lights": lights,
        "paths": {"caravan": [to3(p) for p in crest],
                  "market_lane": [to3((0, y, L.height(0, y))) for y in range(-34, 24, 4)]},
        "landmarks": {"gate": to3((0, 22, L.height(0, 22))), "temple": to3((6, 54, tz)),
                      "pool": to3((POOL.x, POOL.y, L.height(POOL.x, POOL.y))),
                      "tomb": to3((72, 106, L.height(72, 106))), "camp": to3((60, 46, L.height(60, 46))), **archery},
    }
    import maps as _MP
    _MP.enforce_spacing(level, L.oasis_height, "oasis")
    test = [s_["pos"] for s_ in spawns if s_.get("camp") == "test"]
    keep = [s_["pos"] for s_ in spawns if s_["role"] in ("player", "bonfire")]
    dmin = min(math.hypot(a[0] - b[0], a[2] - b[2]) for a in test for b in keep)
    print("TESTCAMP min distance to arrivals/bonfires", round(dmin, 1), "m")
    with open(os.path.join(ASSETS, "level", "level.json"), "w", encoding="utf8") as f:
        json.dump(level, f, indent=1)
    MANIFEST["assets"]["level"] = {"file": "level/level.json", "kind": "level-data",
                                   "notes": "colliders: yaw-rotated boxes (pos centre, half extents); spawns by role"}
    print("LEVEL", len(colliders), "colliders", len(spawns), "spawns", len(lights), "lights")


# ------------------------------------------------------------------ sky
def export_sky():
    """Equirectangular sunset sky (+ low-poly clouds): an HDR for lighting, a JPG for the background."""
    clear_scene()
    world = bpy.data.worlds.new("Sky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.asin(L.SUN_DIR.z)
    sky.sun_rotation = math.atan2(L.SUN_DIR.x, L.SUN_DIR.y)
    sky.sun_disc = True
    sky.sun_size = math.radians(1.6)
    sky.sun_intensity = 0.25
    sky.altitude = 400
    sky.air_density = 1.4
    sky.aerosol_density = 1.3
    sky.ozone_density = 3.0
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.16
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 5.0
    sun_data.color = L.lin("#ffb46b")
    sun = bpy.data.objects.new("Sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (-L.SUN_DIR).to_track_quat("-Z", "Y").to_euler()
    cloud_m = L.mat("Cloud", "#fff4ea", 1.0)
    mb = L.MB()
    random.seed(31)
    placed = 0
    while placed < 40:
        az = random.uniform(-180, 180)
        if -52 < az < -24:
            continue
        placed += 1
        dist = random.uniform(1600, 3200)
        c = Vector((math.sin(math.radians(az)) * dist, math.cos(math.radians(az)) * dist,
                    random.uniform(280, 900) * dist / 2400))
        ln = random.uniform(80, 260)
        for k in range(random.randint(3, 7)):
            o = Vector((random.uniform(-ln, ln) * 0.6, random.uniform(-30, 30), random.uniform(-6, 12)))
            r = random.uniform(32, 64)
            mb.ico(c + o, (r * random.uniform(1.4, 2.2), r, r * 0.42), cloud_m, sub=1, jitter=0.18,
                   rot=(0, 0, math.radians(-az)))
    mb.build("Clouds", L.C_LAND)
    cd = bpy.data.cameras.new("Pano")
    cd.type = "PANO"
    cd.panorama_type = "EQUIRECTANGULAR"
    cd.clip_end = 5000
    cam = bpy.data.objects.new("Pano", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0, 0, 10)
    # three.js equirect: image centre (u=0.5) = +X, u=0.75 = +Z  ->  camera looks along blender +X
    cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
        scene.cycles.device = "GPU"
    except TypeError:
        pass
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    os.makedirs(os.path.join(ASSETS, "sky"), exist_ok=True)
    # HDR for image-based lighting
    scene.render.resolution_x, scene.render.resolution_y = 1024, 512
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "HDR"
    scene.render.filepath = os.path.join(ASSETS, "sky", "sunset_env.hdr")
    bpy.ops.render.render(write_still=True)
    # display-ready background
    scene.render.resolution_x, scene.render.resolution_y = 4096, 2048
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 90
    scene.render.filepath = os.path.join(ASSETS, "sky", "sunset_bg.jpg")
    bpy.ops.render.render(write_still=True)
    MANIFEST["assets"]["sky"] = {
        "kind": "sky", "env_hdr": "sky/sunset_env.hdr", "background_jpg": "sky/sunset_bg.jpg",
        "notes": ("Equirectangular in three.js orientation (EquirectangularReflectionMapping, no rotation needed). HDR is linear (use RGBELoader + "
                  "PMREM for scene.environment). JPG is already tone-mapped (AgX), use as scene.background."),
    }


# ------------------------------------------------------------------ run
if want("characters"):
    export_characters()
if want("props"):
    export_props()
if want("level"):
    export_level()
MAP_NAMES = next((a[5:].split(",") for a in ARGS if a.startswith("maps=")), None)
if want("maps"):
    import maps as _maps
    import platform_maps  # noqa: F401  (registers the v4 platforming maps)
    import big_maps  # noqa: F401  (registers the v6 research maps)
    _maps.run(sys.modules[__name__], MAP_NAMES)
if want("maps") or want("level"):
    import maps as _maps
    import platform_maps  # noqa: F401  (registers the v4 platforming maps)
    import big_maps  # noqa: F401  (registers the v6 research maps)
    _maps.write_index(sys.modules[__name__])
if want("sky") and "nosky" not in ARGS:
    export_sky()
with open(MANIFEST_PATH, "w", encoding="utf8") as f:
    json.dump(MANIFEST, f, indent=1)
print("DONE")
