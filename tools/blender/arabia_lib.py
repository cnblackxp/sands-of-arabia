"""
Shared library for the Arabia project: materials, the box-mesh builder (MB), the
terrain height function and every procedural builder (houses, stalls, palms,
tents, tomb, buttes, static voxel people/camels).  Imported by render_still.py
and export_assets.py; importing it resets Blender to an empty scene.

A desert oasis town at sunset: a market with striped awnings, mudbrick houses,
palms around a pool, a Nabataean rock-cut tomb in a sandstone outcrop, and a
camel caravan on the dune crest, against a physical sky. People and camels are
voxel-style figures made of boxes.
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, Euler, noise

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "preview" in ARGS
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = next((a[4:] for a in ARGS if a.startswith("out=")),
           os.path.join(HERE, "preview.png" if PREVIEW else "arabia.png"))

random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Sun: low over the dunes, front-left of the camera so the caravan is backlit.
SUN_ELEV = math.radians(8.0)
SUN_AZ = math.radians(-37)           # sky convention: 0 = +Y, +90deg = +X
SUN_DIR = Vector((math.sin(SUN_AZ) * math.cos(SUN_ELEV),
                  math.cos(SUN_AZ) * math.cos(SUN_ELEV),
                  math.sin(SUN_ELEV)))


# ----------------------------------------------------------------- helpers
def lin(h):
    """sRGB hex -> linear rgb tuple."""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def coll(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


MATS = {}


def mat(name, hexcol, rough=0.85, emit=None, strength=0.0, sheen=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*lin(hexcol), 1)
    p.inputs["Roughness"].default_value = rough
    if sheen and "Sheen Weight" in p.inputs:
        p.inputs["Sheen Weight"].default_value = sheen * 0.3
    if emit:
        p.inputs["Emission Color"].default_value = (*lin(emit), 1)
        p.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*lin(hexcol), 1)
    MATS[name] = m
    return m


def node_mat(name, build):
    """Material whose base colour comes from a small node graph."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    build(nt, p)
    MATS[name] = m
    return m


def ramp(nt, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    el = r.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], (*lin(stops[0][1]), 1)
    el[1].position, el[1].color = stops[-1][0], (*lin(stops[-1][1]), 1)
    for pos, col in stops[1:-1]:
        e = el.new(pos)
        e.color = (*lin(col), 1)
    return r


def striped(name, a, b, scale=6.0):
    def build(nt, p):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = "X"
        wave.wave_profile = "SAW" if "SAW" in [i.identifier for i in wave.bl_rna.properties["wave_profile"].enum_items] else wave.wave_profile
        wave.inputs["Scale"].default_value = scale
        wave.inputs["Distortion"].default_value = 0.0
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        r = ramp(nt, [(0.0, a), (0.5, a), (0.5001, b), (1.0, b)])
        r.color_ramp.interpolation = "CONSTANT"
        nt.links.new(wave.outputs["Fac"], r.inputs["Fac"])
        nt.links.new(r.outputs["Color"], p.inputs["Base Color"])
        p.inputs["Roughness"].default_value = 0.9
        if "Sheen Weight" in p.inputs:
            p.inputs["Sheen Weight"].default_value = 0.4
    return node_mat(name, build)


class MB:
    """Accumulates primitives into one bmesh with per-part materials."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _tag(self, verts, m):
        i = self._mi(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = i

    @staticmethod
    def _mtx(c, s, rot):
        return Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))

    def box(self, c, s, m, rot=(0, 0, 0)):
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=self._mtx(c, s, rot))
        self._tag(r["verts"], m)
        return self

    def cyl(self, c, r1, r2, h, m, segs=8, rot=(0, 0, 0)):
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segs, radius1=r1,
                                  radius2=r2, depth=h, matrix=self._mtx(c, (1, 1, 1), rot))
        self._tag(r["verts"], m)
        return self

    def ico(self, c, s, m, sub=1, jitter=0.0, rot=(0, 0, 0)):
        r = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0,
                                       matrix=self._mtx(c, s, rot))
        if jitter:
            for v in r["verts"]:
                v.co += Vector((random.uniform(-1, 1) for _ in range(3))) * jitter
        self._tag(r["verts"], m)
        return self

    def build(self, name, col, loc=(0, 0, 0), rotz=0.0, scale=1.0):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        ob.rotation_euler.z = rotz
        ob.scale = (scale,) * 3
        col.objects.link(ob)
        return ob


# ----------------------------------------------------------------- terrain
TOWN = Vector((0, 22))          # centre of the flat (non-dune) zone
TOWN_R = 58.0
WALL_C, WALL_RX, WALL_RY = Vector((0, 46)), 40.0, 24.0   # walled town ellipse


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def height(x, y):
    """Ground height used by every builder; maps swap HEIGHT_FN to place props on their own terrain."""
    return HEIGHT_FN(x, y)


def oasis_height(x, y):
    d = (Vector((x, y)) - TOWN).length
    dune_w = smooth(TOWN_R * 0.8, TOWN_R * 1.9, d)
    # long wind-aligned dunes with sharp crests
    p = Vector((x * 0.010 + y * 0.004, y * 0.024 - x * 0.006, 0.3))
    ridge = (1 - abs(noise.noise(p))) ** 3
    big = noise.noise(Vector((x * 0.004, y * 0.004, 1.7))) * 0.5 + 0.5
    h = dune_w * (ridge * 11 + big * 9)
    # the town sits on a low tell
    e = math.hypot((x - WALL_C.x) / WALL_RX, (y - WALL_C.y) / WALL_RY)
    h += 3.2 * (1 - smooth(0.9, 1.35, e)) + 1.6 * (1 - smooth(0.0, 0.6, e))
    # the caravan crest: one big dune sweeping across the left horizon
    cx, cy = -70.0, 118.0
    u = (x - cx) * math.cos(0.32) + (y - cy) * math.sin(0.32)
    v = -(x - cx) * math.sin(0.32) + (y - cy) * math.cos(0.32)
    crest = math.exp(-(v / (22 if v < 0 else 12)) ** 2) * math.exp(-(u / 95) ** 2)
    h += crest * 20
    # gentle ripples close in
    h += noise.noise(Vector((x * 0.15, y * 0.15, 4.2))) * 0.25
    # rising ground toward the right-hand mesa
    h += smooth(60, 160, x) * smooth(40, 200, y) * 10
    return h


HEIGHT_FN = oasis_height


def crest_point(u):
    """Point on the caravan dune crest, u along it (metres)."""
    cx, cy, a = -70.0, 118.0, 0.32
    x = cx + u * math.cos(a)
    y = cy + u * math.sin(a)
    return Vector((x, y, height(x, y)))


C_LAND = coll("Land")


def build_terrain():
    size, n = 900.0, 260
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    step = size / n
    for v in bm.verts:
        x, y = v.co.x + 120, v.co.y + 200          # shift so the grid covers the view
        r = (Vector((x, y)) - Vector((0, -40))).length
        j = step * 0.33 if r < 260 else 0          # low-poly jitter
        x += random.uniform(-j, j)
        y += random.uniform(-j, j)
        v.co = Vector((x, y, height(x, y)))
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new("Desert")
    bm.to_mesh(me)
    bm.free()

    def build(nt, p):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 0.02
        nz.inputs["Detail"].default_value = 3
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        r = ramp(nt, [(0.30, "#c98a4b"), (0.5, "#dba366"), (0.68, "#e9bb7c")])
        nt.links.new(nz.outputs["Fac"], r.inputs["Fac"])
        # darker, redder sand in the slopes
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.75
        mr.inputs["From Max"].default_value = 0.98
        nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], mix.inputs["Factor"])
        mix.inputs["A"].default_value = (*lin("#b46f3a"), 1)
        nt.links.new(r.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
        p.inputs["Roughness"].default_value = 0.95
    me.materials.append(node_mat("Sand", build))
    ob = bpy.data.objects.new("Desert", me)
    C_LAND.objects.link(ob)


def build_mountains():
    m = node_mat("Rock", lambda nt, p: _rock(nt, p, "#8a4a35", "#c27a4e"))
    far = mat("FarRock", "#7a4f4a", 0.9)
    mb = MB()
    # ragged range across the back, higher on the right
    for i in range(34):
        t = i / 33
        x = -420 + t * 900
        y = 520 + random.uniform(-60, 80)
        hgt = random.uniform(50, 110) * (0.55 + 0.8 * t)
        mb.ico((x, y, -10), (random.uniform(50, 90), random.uniform(40, 70), hgt),
               far, sub=2, jitter=0.12)
    mb.build("Mountains", C_LAND)
    # sandstone mesas on the right (Hegra-style outcrops)
    mb = MB()
    for (x, y, r, h) in [(130, 190, 26, 30), (190, 250, 36, 44), (100, 290, 20, 34),
                         (250, 175, 24, 26), (165, 330, 30, 52), (300, 300, 40, 38),
                         (-210, 360, 34, 26), (-150, 420, 22, 34)]:
        butte(mb, x, y, r, h, m)
    mb.build("Mesas", C_LAND)


def butte(mb, x, y, r, h, m):
    """Faceted flat-topped sandstone butte: a jittered tapering prism in tiers."""
    z = height(x, y) - 4
    tiers = random.randint(2, 3)
    for t in range(tiers):
        r0 = r * (1 - t * 0.22)
        th = h / tiers * (1.15 if t == 0 else 1.0)
        segs = random.randint(6, 9)
        res = bmesh.ops.create_cone(mb.bm, cap_ends=True, segments=segs, radius1=r0,
                                    radius2=r0 * random.uniform(0.72, 0.88), depth=th,
                                    matrix=Matrix.Translation((x, y, z + th / 2)))
        for v in res["verts"]:
            v.co.x += random.uniform(-0.12, 0.12) * r0
            v.co.y += random.uniform(-0.12, 0.12) * r0
            v.co.z += random.uniform(-0.04, 0.04) * th
        mb._tag(res["verts"], m)
        z += th * 0.92


def _rock(nt, p, a, b):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")          # sedimentary banding
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 0.05
    wave.inputs["Distortion"].default_value = 3
    nt.links.new(tc.outputs["Generated"] if False else tc.outputs["Object"], wave.inputs["Vector"])
    r = ramp(nt, [(0.0, a), (0.45, b), (0.6, a), (1.0, b)])
    nt.links.new(wave.outputs["Fac"], r.inputs["Fac"])
    nt.links.new(r.outputs["Color"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.9


def build_tomb():
    """Rock-cut Nabataean tomb (after Qasr al-Farid) in a lone outcrop."""
    col = coll("Tomb")
    rock = node_mat("TombRock", lambda nt, p: _rock(nt, p, "#a85a3a", "#d8955d"))
    face = mat("TombFace", "#d99a63", 0.85)
    dark = mat("TombDoor", "#2a140c", 1.0)
    x0, y0 = 72.0, 112.0
    z0 = height(x0, y0)
    mb = MB()
    mb.ico((0, 6, 9), (15, 12, 14), rock, sub=2, jitter=0.05)
    mb.ico((-9, 9, 6), (9, 9, 10), rock, sub=1, jitter=0.06)
    mb.ico((10, 10, 5), (8, 8, 9), rock, sub=1, jitter=0.06)
    fy = -5.2
    mb.box((0, fy, 7), (9, 1.6, 14), face)                        # facade slab
    for sx in (-3.8, 3.8):                                         # pilasters
        mb.box((sx, fy - 0.9, 5.5), (0.8, 0.4, 11), face)
    mb.box((0, fy - 1.0, 11.4), (9.4, 0.6, 0.7), face)            # cornice
    mb.box((0, fy - 0.9, 3.3), (2.2, 0.5, 4.2), face)             # door frame
    mb.box((0, fy - 1.0, 3.0), (1.5, 0.3, 3.6), dark)             # doorway
    mb.box((0, fy - 0.9, 6.0), (3.2, 0.4, 0.4), face)             # pediment
    mb.box((0, fy - 0.9, 6.5), (2.0, 0.4, 0.5), face)
    for i in range(2):                                             # crowstep crowns
        for sx in (-2.6, 2.6):
            for k in range(3):
                mb.box((sx + (k - 1) * 0.5 * (1 if sx > 0 else -1) * 0 + (k - 1) * 0.9 * 0, fy - 0.7,
                        12.4 + i * 1.4 + k * 0.45), (2.0 - k * 0.6, 0.6, 0.45), face)
    for k in range(4):                                             # top steps
        mb.box((0, fy - 0.6, 15.0 + k * 0.5), (6.5 - k * 1.5, 0.8, 0.5), face)
    mb.build("Tomb", col, loc=(x0, y0, z0 - 2.0), rotz=math.radians(-18))


# ------------------------------------------------------------------ figures
SKIN = [mat(f"Skin{i}", h, 0.6) for i, h in enumerate(["#8d5a3b", "#a86b45", "#6e4128", "#b97c52"])]
ROBES = [mat(f"Robe{i}", h, 0.9, sheen=0.3) for i, h in enumerate(
    ["#e9dfc8", "#2f3f7a", "#8b2a1f", "#c99a3b", "#6b4a2e", "#f1ece0", "#3b5a4a", "#7a2e55", "#d1b48a"])]
WRAPS = [mat(f"Wrap{i}", h, 0.9) for i, h in enumerate(
    ["#f4efe4", "#b8352b", "#24366e", "#1e1a18", "#e2c27a"])]
LEATHER = mat("Leather", "#5a3520", 0.7)
HAIR = mat("Hair", "#1a120c", 0.8)
WOOD = mat("Wood", "#6e4a2c", 0.8)
CLAY = mat("Clay", "#b0603a", 0.8)
CLAY2 = mat("Clay2", "#d79a68", 0.8)
GOLD = mat("Brass", "#c99a3a", 0.35)


def person(mb, pose="stand", robe=None, wrap=None, skin=None, beard=None, carry=None):
    """Voxel person ~1.75 m, facing -Y in local space."""
    robe = robe or random.choice(ROBES)
    wrap = wrap or random.choice(WRAPS)
    skin = skin or random.choice(SKIN)
    sash = random.choice(ROBES)
    if pose == "sit":
        mb.box((0, -0.1, 0.18), (0.55, 0.75, 0.36), robe)          # crossed legs
        mb.box((0, 0.05, 0.66), (0.5, 0.32, 0.62), robe)
        mb.box((0, 0.05, 0.62), (0.52, 0.34, 0.08), sash)
        for sx in (-0.28, 0.28):
            mb.box((sx, -0.12, 0.62), (0.15, 0.4, 0.15), robe, rot=(0.6, 0, 0))
        hz = 1.17
    else:
        mb.box((0, 0, 0.62), (0.52, 0.34, 1.24), robe)              # long robe
        mb.box((0, 0, 1.0), (0.54, 0.36, 0.08), sash)
        for sx in (-0.13, 0.13):
            mb.box((sx, -0.03, 0.03), (0.16, 0.26, 0.06), LEATHER)  # sandals
        hz = 1.5
        for side, sx in (("L", -0.34), ("R", 0.34)):
            a = 0.0
            if pose == "wave" and side == "R":
                mb.box((sx + 0.06, -0.05, hz + 0.05), (0.15, 0.15, 0.62), robe, rot=(0, -0.35, 0))
                mb.box((sx + 0.17, -0.05, hz + 0.4), (0.13, 0.13, 0.13), skin)
                continue
            if pose == "carry_head":
                mb.box((sx, 0, hz + 0.05), (0.14, 0.14, 0.55), robe)
                continue
            if pose == "point" and side == "R":
                mb.box((sx, -0.32, hz - 0.08), (0.15, 0.6, 0.15), robe)
                mb.box((sx, -0.66, hz - 0.08), (0.12, 0.14, 0.12), skin)
                continue
            if pose == "staff" and side == "R":
                mb.box((sx, -0.15, hz - 0.3), (0.15, 0.2, 0.5), robe, rot=(0.5, 0, 0))
                mb.box((sx + 0.02, -0.33, hz - 0.45), (0.12, 0.12, 0.12), skin)
                mb.box((sx + 0.02, -0.33, 0.95), (0.06, 0.06, 1.95), WOOD)
                continue
            if pose == "trade" and side == "R":
                mb.box((sx, -0.22, hz - 0.3), (0.15, 0.4, 0.15), robe)
                mb.box((sx, -0.46, hz - 0.3), (0.12, 0.12, 0.12), skin)
                continue
            mb.box((sx, 0, hz - 0.32), (0.15, 0.17, 0.6), robe)
            mb.box((sx, 0, hz - 0.67), (0.12, 0.13, 0.12), skin)
    # head
    mb.box((0, 0, hz + 0.08), (0.14, 0.14, 0.1), skin)                 # neck
    mb.box((0, 0, hz + 0.3), (0.34, 0.34, 0.34), skin)
    mb.box((-0.08, -0.172, hz + 0.33), (0.05, 0.01, 0.05), HAIR)       # eyes
    mb.box((0.08, -0.172, hz + 0.33), (0.05, 0.01, 0.05), HAIR)
    if beard is None:
        beard = random.random() < 0.55
    if beard:
        mb.box((0, -0.12, hz + 0.16), (0.36, 0.14, 0.16), HAIR)
    # head wrap (some with a cord ring, some veil-style draped to the shoulders)
    style = random.random()
    mb.box((0, 0.02, hz + 0.5), (0.4, 0.4, 0.14), wrap)
    if style < 0.5:
        mb.box((0, 0.08, hz + 0.25), (0.42, 0.3, 0.42), wrap)          # drape
        mb.box((0, 0.02, hz + 0.5), (0.42, 0.42, 0.05), HAIR)          # agal cord
    else:
        mb.box((0, 0.02, hz + 0.6), (0.34, 0.34, 0.1), wrap)           # turban
    if pose == "carry_head" or carry == "jar":
        mb.cyl((0, 0, hz + 0.82), 0.17, 0.1, 0.42, CLAY, segs=8)
        mb.cyl((0, 0, hz + 0.66), 0.1, 0.17, 0.12, CLAY, segs=8)


def camel(mb, laden=True, rider=False, saddle_col=None, sit=False):
    """Voxel dromedary ~2.1 m at the hump, facing -Y."""
    fur = random.choice([mat("Camel0", "#c4935e", 0.95, sheen=0.5),
                         mat("Camel1", "#b07c4a", 0.95, sheen=0.5),
                         mat("Camel2", "#d8b07c", 0.95, sheen=0.5)])
    dark = mat("CamelDark", "#3a2414", 0.9)
    lz = 0.0 if not sit else -1.05
    if not sit:
        for sx in (-0.26, 0.26):
            for sy, ph in ((-0.62, 0.0), (0.62, 0.0)):
                mb.box((sx, sy, 0.62), (0.16, 0.18, 1.2), fur)
                mb.box((sx, sy, 0.05), (0.22, 0.26, 0.1), dark)
                mb.box((sx, sy, 0.66), (0.2, 0.22, 0.14), fur)          # knee
    else:
        mb.box((0, 0, 0.18), (0.9, 1.9, 0.36), fur)                      # folded legs
    bz = 1.55 + lz
    mb.box((0, 0, bz), (0.72, 1.85, 0.62), fur)                          # body
    mb.box((0, 0.05, bz + 0.42), (0.6, 0.85, 0.4), fur)                 # hump
    mb.box((0, 0.1, bz + 0.67), (0.42, 0.5, 0.2), fur)
    mb.box((0, 0.95, bz + 0.05), (0.08, 0.08, 0.55), fur, rot=(0.25, 0, 0))   # tail
    # neck: dips forward then rises
    mb.box((0, -1.05, bz - 0.05), (0.32, 0.6, 0.38), fur, rot=(0.55, 0, 0))
    mb.box((0, -1.38, bz + 0.25), (0.28, 0.32, 0.75), fur, rot=(-0.25, 0, 0))
    mb.box((0, -1.55, bz + 0.68), (0.3, 0.62, 0.3), fur)                # head
    mb.box((0, -1.88, bz + 0.6), (0.26, 0.2, 0.22), fur)                # muzzle
    for sx in (-0.1, 0.1):
        mb.box((sx, -1.42, bz + 0.88), (0.06, 0.08, 0.12), fur)          # ears
        mb.box((sx * 1.6, -1.65, bz + 0.74), (0.03, 0.06, 0.06), dark)   # eyes
    sc = saddle_col or random.choice(ROBES)
    if laden or rider:
        mb.box((0, 0.05, bz + 0.62), (0.9, 1.0, 0.1), sc)               # saddle cloth
        mb.box((0, 0.05, bz + 0.72), (0.56, 0.8, 0.12), WOOD)
        tassel = random.choice(WRAPS)
        for sx in (-0.46, 0.46):
            mb.box((sx, 0.05, bz + 0.35), (0.05, 1.0, 0.5), sc)
            mb.box((sx * 1.02, 0.05, bz + 0.08), (0.05, 1.0, 0.08), tassel)
    if laden and not rider:
        for sx in (-0.62, 0.62):
            b = random.choice([mat("Bale0", "#d9c9a3", 0.95), mat("Bale1", "#8a6a4a", 0.95),
                               mat("Bale2", "#5b3b5e", 0.95)])
            mb.box((sx, 0.05, bz + 0.38), (0.45, 0.7, 0.6), b)
            mb.box((sx, 0.05, bz + 0.38), (0.47, 0.08, 0.62), LEATHER)
        mb.box((0, 0.05, bz + 1.02), (0.8, 0.5, 0.45), random.choice(ROBES))
    if rider:
        sub = MB()
        person(sub, pose="staff" if random.random() < 0.5 else "stand")
        # fold legs over the saddle: just place a shortened rider
        m = Matrix.Translation((0, 0.1, bz + 0.15))
        bmesh.ops.transform(sub.bm, matrix=m, verts=sub.bm.verts)
        _merge(mb, sub)
    # halter rope to the front
    mb.box((0, -1.98, bz + 0.35), (0.03, 0.03, 0.6), LEATHER)


def _merge(dst, src):
    me = bpy.data.meshes.new("tmp")
    src.bm.to_mesh(me)
    remap = [dst._mi(m) for m in src.mats]
    for p in me.polygons:
        p.material_index = remap[p.material_index]
    dst.bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    src.bm.free()


C_PEOPLE = coll("People")
C_CAMELS = coll("Camels")


def place(builder_fn, name, col, x, y, rotz, *a, **k):
    mb = MB()
    builder_fn(mb, *a, **k)
    return mb.build(name, col, loc=(x, y, height(x, y)), rotz=rotz)


# -------------------------------------------------------------- architecture
MUD = [mat("Mud0", "#b98656", 0.95), mat("Mud1", "#c99764", 0.95), mat("Mud2", "#a87447", 0.95),
       mat("Lime", "#e6d5b5", 0.9)]
SHADOW = mat("Opening", "#1d0f08", 1.0)
C_TOWN = coll("Town")


def house(x, y, rot, w, d, h, floors=1):
    mb = MB()
    m = random.choice(MUD)
    mb.box((0, 0, h / 2), (w, d, h), m)
    mb.box((0, 0, h + 0.25), (w + 0.1, d + 0.1, 0.5), m)            # parapet band
    for sx in (-1, 1):                                              # crenellations
        for k in range(int(w / 1.2)):
            px = -w / 2 + 0.6 + k * 1.2
            mb.box((px, sx * d / 2, h + 0.75), (0.5, 0.25, 0.5), m)
    mb.box((0, -d / 2 - 0.02, 1.0), (1.0, 0.1, 2.0), SHADOW)        # door
    mb.box((0, -d / 2 - 0.05, 2.15), (1.4, 0.2, 0.2), WOOD)          # lintel
    for k in range(int(w / 0.9)):                                   # roof beams
        mb.box((-w / 2 + 0.45 + k * 0.9, -d / 2 - 0.25, h - 0.4), (0.14, 0.5, 0.14), WOOD)
    if h > 4:
        for sx in (-w / 3, w / 3):
            mb.box((sx, -d / 2 - 0.02, h - 1.6), (0.5, 0.1, 0.7), SHADOW)
    if floors > 1:
        w2, d2, h2 = w * 0.55, d * 0.55, h * 0.6
        mb.box((w * 0.18, d * 0.15, h + h2 / 2), (w2, d2, h2), m)
        mb.box((w * 0.18, d * 0.15 - d2 / 2 - 0.02, h + 1.0), (0.8, 0.1, 1.6), SHADOW)
        mb.box((w * 0.18, d * 0.15, h + h2 + 0.2), (w2 + 0.1, d2 + 0.1, 0.4), m)
    return mb.build("House", C_TOWN, loc=(x, y, height(x, y) - 0.3), rotz=rot)


def tower_house(x, y, rot, w, d, h):
    """Mudbrick tower house (South Arabian style), limewashed crown, rows of small windows."""
    mb = MB()
    m = random.choice(MUD[:3])
    lime = MUD[3]
    mb.box((0, 0, h / 2), (w, d, h), m, rot=(0, 0, 0))
    mb.box((0, 0, h - 0.9), (w + 0.06, d + 0.06, 1.8), lime)          # limewashed top storey
    mb.box((0, 0, h + 0.3), (w + 0.2, d + 0.2, 0.6), lime)
    for k in range(int(w / 1.0)):
        for sy in (-1, 1):
            mb.box((-w / 2 + 0.5 + k * 1.0, sy * (d / 2), h + 0.85), (0.45, 0.25, 0.5), lime)
    floors = int(h / 2.6)
    for f in range(1, floors):
        z = f * 2.6 + 0.4
        for k in range(max(1, int(w / 1.6))):
            px = -w / 2 + (k + 0.5) * w / max(1, int(w / 1.6))
            mb.box((px, -d / 2 - 0.02, z), (0.45, 0.1, 0.7), SHADOW)
            mb.box((px, -d / 2 - 0.04, z + 0.42), (0.6, 0.1, 0.12), lime)
            mb.box((-w / 2 - 0.02, px * d / w, z), (0.1, 0.45, 0.7), SHADOW)
    mb.box((0, -d / 2 - 0.02, 1.0), (1.0, 0.1, 2.0), SHADOW)
    return mb.build("TowerHouse", C_TOWN, loc=(x, y, height(x, y) - 0.3), rotz=rot)


def temple(x, y, rot):
    """Hilltop shrine: stepped platform, columns, horned altar, standing stones."""
    mb = MB()
    lime = MUD[3]
    stone = mat("Stone", "#cdb08a", 0.9)
    for k in range(4):
        s = 16 - k * 2.2
        mb.box((0, 0, 0.5 + k * 1.0), (s, s * 0.8, 1.0), stone)
    top = 4.0
    for i in range(6):
        for sy in (-3.6, 3.6):
            px = -5 + i * 2
            mb.box((px, sy, top + 2.5), (0.7, 0.7, 5.0), lime)
            mb.box((px, sy, top + 5.1), (1.0, 1.0, 0.25), lime)
    mb.box((0, 0, top + 5.5), (12, 8.4, 0.6), lime)                 # architrave/roof
    mb.box((0, 0, top + 6.1), (10.5, 7, 0.6), lime)
    mb.box((0, 1.5, top + 2.0), (4.0, 3.0, 4.0), stone)             # cella
    mb.box((0, 0.0, top + 1.5), (1.3, 0.1, 2.6), SHADOW)
    for sx in (-6.5, 6.5):                                           # betyls
        mb.box((sx, -6.0, top - 2.0 + 1.2), (0.8, 0.5, 2.4), mat("Betyl", "#4a3a32", 0.6))
    mb.build("Temple", C_TOWN, loc=(x, y, height(x, y) - 0.5), rotz=rot)


def town_wall():
    mb = MB()
    m = MUD[2]
    pts = []
    for i in range(41):                       # all the way round, leaving a gate at the front
        a = math.radians(188 + i * (344 / 40))
        pts.append(Vector((WALL_C.x + math.sin(a) * WALL_RX, WALL_C.y + math.cos(a) * WALL_RY)))
    for a, b in zip(pts, pts[1:]):
        mid = (a + b) / 2
        dv = b - a
        rz = math.atan2(dv.y, dv.x)
        z = height(mid.x, mid.y)
        mb.box((mid.x, mid.y, z + 2.2), (dv.length + 0.3, 1.4, 4.4), m, rot=(0, 0, rz))
        for k in range(3):
            o = a + dv * (k + 0.5) / 3
            mb.box((o.x, o.y, z + 4.7), (0.8, 1.5, 0.7), m, rot=(0, 0, rz))
    for i in (0, 10, 20, 30, 40):
        p = pts[i]
        z = height(p.x, p.y)
        mb.box((p.x, p.y, z + 3.2), (3.2, 3.2, 6.4), m)
        mb.box((p.x, p.y, z + 6.7), (3.6, 3.6, 0.6), m)
    # gatehouse over the opening
    g = Vector((WALL_C.x, WALL_C.y - WALL_RY))
    z = height(g.x, g.y)
    for sx in (-3.6, 3.6):
        mb.box((g.x + sx, g.y, z + 4.0), (3.4, 4.0, 8.0), m)
        mb.box((g.x + sx, g.y, z + 8.3), (3.8, 4.4, 0.6), m)
        for k in range(3):
            mb.box((g.x + sx + (k - 1) * 1.2, g.y - 2.0, z + 8.9), (0.6, 0.4, 0.7), m)
    mb.box((g.x, g.y, z + 6.6), (4.0, 3.6, 2.2), m)
    mb.box((g.x, g.y - 1.85, z + 5.4), (3.8, 0.1, 0.25), WOOD)
    mb.build("TownWall", C_TOWN)


# ------------------------------------------------------------------- market
C_MARKET = coll("Market")
AWNINGS = [("Aw0", "#b8322a", "#efe2c4"), ("Aw1", "#2e4b8f", "#efe2c4"), ("Aw2", "#d39a2c", "#7a2a1f"),
           ("Aw3", "#3d6b4f", "#e8d8b0"), ("Aw4", "#7a2e55", "#e3b45a"), ("Aw5", "#efe2c4", "#a0522d")]
SPICES = [mat(f"Spice{i}", h, 0.95) for i, h in enumerate(
    ["#c0391b", "#e0a21b", "#7a4a1e", "#d9c27a", "#4f6b2a", "#9b2d1f"])]
FABRICS = [mat(f"Rug{i}", h, 0.95, sheen=0.4) for i, h in enumerate(
    ["#8b1e1e", "#1f3a6e", "#b5651d", "#4b2a5c", "#2f5d50"])]
LAMP = mat("LampFlame", "#ffb347", 0.5, emit="#ff9a3c", strength=40)


def stall(x, y, rot, kind=None, awning=None):
    """Market stall facing local -Y. The object gets custom props `wd` (width, depth)
    and `lamps` (flat list of local lamp positions) for game export."""
    a, b, c = random.choice(AWNINGS)
    if awning is not None:
        a, b, c = AWNINGS[awning]
    ma = mat(a + "a", b, 0.9)
    mbm = mat(a + "b", c, 0.9)
    mb = MB()
    w, d = random.uniform(3.2, 4.4), random.uniform(2.4, 3.0)
    for sx in (-w / 2, w / 2):
        mb.box((sx, -d / 2, 1.2), (0.1, 0.1, 2.4), WOOD)
        mb.box((sx, d / 2, 1.5), (0.1, 0.1, 3.0), WOOD)
    tilt = math.atan2(0.6, d)
    n_str = random.choice([5, 7, 9])                                  # striped awning, strip by strip
    sw = (w + 0.5) / n_str
    for k in range(n_str):
        sx = -(w + 0.5) / 2 + sw * (k + 0.5)
        m_k = ma if k % 2 == 0 else mbm
        mb.box((sx, 0, 2.75), (sw, d + 0.7, 0.05), m_k, rot=(-tilt, 0, 0))
        mb.box((sx, -d / 2 - 0.35, 2.4), (sw, 0.04, 0.4 + 0.12 * (k % 2)), m_k)   # scalloped valance
    mb.box((0, -d / 2 + 0.3, 0.45), (w - 0.2, 0.7, 0.9), WOOD)        # counter
    mb.box((0, -d / 2 + 0.3, 0.92), (w - 0.1, 0.8, 0.06), random.choice(FABRICS))
    k = random.choice(["spice", "pots", "cloth", "spice", "pots", "brass"])
    kind = kind or k
    n = int(w / 0.55)
    for k in range(n):
        px = -w / 2 + 0.4 + k * (w - 0.8) / max(1, n - 1)
        if kind == "spice":
            mb.cyl((px, -d / 2 + 0.3, 1.02), 0.2, 0.2, 0.14, WOOD, segs=8)
            mb.cyl((px, -d / 2 + 0.3, 1.2), 0.19, 0.02, 0.24, random.choice(SPICES), segs=8)
        elif kind == "pots":
            m = random.choice([CLAY, CLAY2])
            hh = random.uniform(0.3, 0.55)
            mb.cyl((px, -d / 2 + 0.3, 0.95 + hh / 2), 0.15, 0.09, hh, m, segs=7)
            mb.cyl((px, -d / 2 + 0.3, 0.95 + hh + 0.04), 0.06, 0.08, 0.08, m, segs=7)
        elif kind == "brass":
            mb.cyl((px, -d / 2 + 0.3, 1.05), 0.17, 0.12, 0.18, GOLD, segs=10)
        else:
            mb.box((px, -d / 2 + 0.3, 1.0 + k % 2 * 0.06), (0.45, 0.6, 0.1 + k % 3 * 0.05),
                   random.choice(FABRICS))
    if kind == "cloth":                                              # hanging rugs
        for k in range(2):
            mb.box((-w / 4 + k * w / 2, d / 2 - 0.05, 1.6), (w / 2 - 0.2, 0.04, 2.0),
                   random.choice(FABRICS))
    # big jars and sacks on the ground
    for k in range(random.randint(2, 4)):
        px, py = random.uniform(-w / 2, w / 2), d / 2 + random.uniform(0.2, 0.7)
        if random.random() < 0.5:
            mb.cyl((px, py, 0.4), 0.28, 0.18, 0.8, random.choice([CLAY, CLAY2]), segs=8)
        else:
            mb.box((px, py, 0.3), (0.5, 0.45, 0.6), mat("Sack", "#cdb48a", 1.0))
    # hanging lamp
    lamps = []
    if random.random() < 0.6:
        mb.box((w / 2 - 0.4, -d / 2 - 0.1, 2.2), (0.02, 0.02, 0.4), LEATHER)
        mb.box((w / 2 - 0.4, -d / 2 - 0.1, 1.95), (0.14, 0.14, 0.18), LAMP)
        lamps = [w / 2 - 0.4, -d / 2 - 0.1, 1.95]
    ob = mb.build("Stall", C_MARKET, loc=(x, y, height(x, y)), rotz=rot)
    ob["wd"] = [w, d]
    ob["lamps"] = lamps
    return ob


def palm(x, y, s=1.0, lean=0.0):
    trunk = mat("Trunk", "#6b4a32", 0.95)
    leaf = mat("Frond", "#4f7a2c", 0.7, sheen=0.2)
    dates = mat("Dates", "#e08a1e", 0.6)
    mb = MB()
    h = random.uniform(7, 11) * s
    segs = 9
    lean_dir = random.uniform(0, math.tau)
    top = Vector((0, 0, 0))
    for i in range(segs):
        t = i / segs
        off = Vector((math.cos(lean_dir), math.sin(lean_dir), 0)) * (t ** 2) * h * lean
        c = off + Vector((0, 0, (i + 0.5) * h / segs))
        r = 0.32 * s * (1 - t * 0.35)
        mb.cyl(c, r * 1.12, r, h / segs * 1.02, trunk, segs=6, rot=(0, 0, i * 0.4))
        top = off + Vector((0, 0, h))
    n = 11
    for i in range(n):
        a = i / n * math.tau + random.uniform(-0.2, 0.2)
        ln = random.uniform(3.2, 4.4) * s
        droop = random.uniform(0.2, 0.7)
        prev = top.copy()
        k = 4
        for j in range(k):
            t = (j + 1) / k
            pitch = droop * t * 2.2 - 0.25
            dirv = Vector((math.cos(a) * math.cos(pitch), math.sin(a) * math.cos(pitch), -math.sin(pitch)))
            nxt = prev + dirv * ln / k
            mid = (prev + nxt) / 2
            wdt = (0.9 - abs(t - 0.4)) * s * 1.1
            mb.box(mid, (ln / k * 1.05, wdt, 0.04), leaf, rot=(0, pitch, a))
            prev = nxt
    for i in range(3):
        a = random.uniform(0, math.tau)
        mb.ico(top + Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, -0.6)), (0.25, 0.25, 0.4), dates, sub=1)
    return mb.build("Palm", C_LAND, loc=(x, y, height(x, y) - 0.2))


def tent(x, y, rot, s=1.0):
    mb = MB()
    black = mat("GoatHair", "#4a3a2e", 1.0)
    stripe = random.choice(FABRICS)
    mb.box((0, 0, 1.6 * s), (7 * s, 4 * s, 0.1), black, rot=(0.12, 0, 0))
    mb.box((0, 2.0 * s, 0.85 * s), (7 * s, 0.06, 1.7 * s), black)
    mb.box((0, -2.1 * s, 1.0 * s), (7 * s, 0.06, 0.5 * s), stripe)
    for sx in (-3.4, 0, 3.4):
        mb.box((sx * s, -2.0 * s, 0.9 * s), (0.08, 0.08, 1.8 * s), WOOD)
    mb.build("Tent", C_LAND, loc=(x, y, height(x, y)), rotz=rot)


