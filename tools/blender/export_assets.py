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


def export(objs, rel, kind, anim=False, extra=None, vcol=False, normals=True):
    """Export objs (and children) to assets/rel; record it in the manifest."""
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    objs = descendants(objs)
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
        export_vertex_color="ACTIVE" if vcol else "NONE", export_all_vertex_colors=False,
        export_normals=normals, export_image_format="NONE",
    )
    lo, hi = bounds(objs)
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


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def rock_color(c, seed=0.0):
    a, b = L.lin("#a85a3a"), L.lin("#d8955d")
    t = 0.5 + 0.5 * math.sin(c.z * 0.55 + noise.noise(c * 0.03 + Vector((seed, 0, 0))) * 3)
    return mix(a, b, t)


def sand_color(c, nz):
    f = noise.noise(Vector((c.x * 0.02, c.y * 0.02, 0.5))) * 0.5 + 0.5
    lo, mid, hi = L.lin("#c98a4b"), L.lin("#dba366"), L.lin("#e9bb7c")
    col = mix(lo, mid, min(1, f * 2)) if f < 0.5 else mix(mid, hi, (f - 0.5) * 2)
    slope = 1 - L.smooth(0.75, 0.98, nz)
    return mix(col, L.lin("#b46f3a"), slope * 0.85)


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
def export_characters():
    clear_scene()
    col = L.coll("Characters")
    arm = rigs.build_person(col)
    clips = {a.name: {"frames": a["frames"], "loop": bool(a["loop"])} for a in bpy.data.actions}
    export([arm], "characters/person.glb", "character", anim=True, extra={
        "bones": [b[0] for b in rigs.PERSON_BONES],
        "accessories": ["Beard", "Hair", "Keffiyeh", "Turban", "Veil", "Jar", "Sword"],
        "clips": clips,
        "notes": ("Body + accessory SkinnedMeshes share one skeleton; toggle accessories with .visible. "
                  "Recolour by cloning materials named P_*. Upper-body clips (Attack, Attack2, Talk, Hit) key only "
                  "spine/arms/head so they layer over Walk/Run/Ride. Attack hit frame ~10 (0.4 s), Attack2 ~9. "
                  "Clip ground speeds: Walk 1.5 m/s, Run 4.8 m/s. Death ends lying down (clampWhenFinished)."),
    })
    clear_scene()
    arm = rigs.build_horse(col)
    clips = {a.name: {"frames": a["frames"], "loop": bool(a["loop"])} for a in bpy.data.actions}
    export([arm], "characters/horse.glb", "character", anim=True, extra={
        "accessories": ["Saddle"], "clips": clips,
        "sockets": {"mount": "attach the rider's root here; rider plays Ride"},
        "notes": "Clip ground speeds: Walk 1.7 m/s, Gallop 9 m/s. Recolour H_Coat / H_Mane / H_Blanket.",
    })
    clear_scene()
    arm = rigs.build_camel(col)
    clips = {a.name: {"frames": a["frames"], "loop": bool(a["loop"])} for a in bpy.data.actions}
    export([arm], "characters/camel.glb", "character", anim=True, extra={
        "accessories": ["Saddle", "Cargo"], "clips": clips,
        "sockets": {"mount": "attach the rider's root here; rider plays Ride"},
        "notes": "Clip ground speeds: Walk 1.8 m/s, Run 6 m/s. Sit is a lying-down loop.",
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
        d = {"role": role, "pos": to3((x, y, L.height(x, y))), "yaw": round(rot, 4)}
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
    sp("guard", -2.2, 20.0, 0.0)
    sp("guard", 2.2, 20.0, 0.0)
    sp("priest", 6.0, 47.0, 0.0)
    for (x, y, r, sit) in [(-5, -34, 0.9, False), (-11, -36, -1.2, True), (12, -33, 2.4, False),
                           (-12, -31, 1.6, True), (13, 14, 0.3, False), (-24, -16, 2.8, False),
                           (21, -14, -2.0, True), (-8, 12, 1.4, False),
                           (60, 30, 2.0, True), (70, 44, 1.1, False), (48, 48, -0.6, True)]:
        sp("camel", x, y, r, sitting=sit)
    for (x, y, r) in [(6.0, -46.0, 0.3), (9.0, -44.0, 0.6), (-24.0, -26.0, 1.2)]:
        sp("horse", x, y, r)
    # caravan path along the big dune crest (patrol waypoints)
    crest = [L.crest_point(u) for u in range(-90, 30, 10)]
    level = {
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
                      "tomb": to3((72, 106, L.height(72, 106))), "camp": to3((60, 46, L.height(60, 46)))},
    }
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
if want("sky") and "nosky" not in ARGS:
    export_sky()
with open(MANIFEST_PATH, "w", encoding="utf8") as f:
    json.dump(MANIFEST, f, indent=1)
print("DONE")
