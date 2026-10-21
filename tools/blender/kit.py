"""
Building kit shared by every map: dune dressing (rocks, shrubs, acacias, ruins),
waymarkers, wells, cliffs and canyon walls, Nabataean facades, caravanserai,
raider-fort pieces.

Every builder adds geometry to an MB (so a whole map joins into one mesh) and
registers yaw-rotated box colliders, lights and the like on a Ctx.  Positions
are Blender world coordinates; `L.height` gives the current map's ground.
"""
import math, random
from mathutils import Vector, Matrix, Euler
import bmesh

import arabia_lib as L

R = math.radians
ROCK_BANDS = ["#9c5236", "#b8663f", "#cd8150", "#dc9a63"]
ROSE_BANDS = ["#a8604e", "#c27a64", "#d6957a", "#e2ad8e"]     # Petra rose sandstone
GREY_BANDS = ["#7d6a58", "#93806a", "#a8957c", "#b9a88e"]     # basalt-ish plateau rock


def bands(palette, prefix):
    return [L.mat(f"{prefix}{k}", h, 0.9) for k, h in enumerate(palette)]


ROCK = bands(ROCK_BANDS, "RockBand")
ROSE = bands(ROSE_BANDS, "RoseBand")
GREY = bands(GREY_BANDS, "GreyBand")
STONE = L.mat("Stone", "#cdb08a", 0.9)
STONE_DARK = L.mat("StoneDark", "#9a8466", 0.9)
SHRUB = [L.mat("Shrub0", "#7d7a45", 0.9), L.mat("Shrub1", "#8f8a52", 0.9), L.mat("Shrub2", "#6a6e3c", 0.9)]
DRY = L.mat("DryBrush", "#8a6a44", 0.95)
CANOPY = [L.mat("Canopy0", "#5f7434", 0.85), L.mat("Canopy1", "#6f803c", 0.85)]
BARK = L.mat("Bark", "#5a4330", 0.95)
WATER = L.mat("WaterDeep", "#1d4a52", 0.05)
FIRE = L.mat("Fire", "#ffb066", 0.5, emit="#ff7a1a", strength=60)
CLOTH = [L.mat("Banner0", "#8b1e1e", 0.9), L.mat("Banner1", "#1e1a18", 0.9), L.mat("Banner2", "#b5651d", 0.9)]
BONE = L.mat("Bone", "#e8dcc4", 0.8)
FACADE_ROSE = L.mat("FacadeRose", "#dc9a7e", 0.85)
FACADE_HEGRA = L.mat("TombFace", "#d99a63", 0.85)


class Ctx:
    """Per-map collector of colliders, spawns, lights, paths, landmarks and exits (Blender coords)."""

    def __init__(self):
        self.colliders, self.spawns, self.lights, self.exits = [], [], [], []
        self.paths, self.landmarks = {}, {}
        self.names = {}                         # landmark key -> (english, arabic)
        self.keepout = []                       # (x, y, r): no dressing here

    def col(self, cx, cy, cz, sx, sy, sz, rot=0.0, tag="prop"):
        self.colliders.append((cx, cy, cz, sx, sy, sz, rot, tag))

    def spawn(self, role, x, y, rot=0.0, **kw):
        self.spawns.append(dict(role=role, x=x, y=y, rot=rot, **kw))

    def light(self, kind, x, y, z):
        self.lights.append((kind, x, y, z))

    def free(self, x, y, r=0.0):
        return all((x - kx) ** 2 + (y - ky) ** 2 > (kr + r) ** 2 for kx, ky, kr in self.keepout)


class Local:
    """Place primitives in a local frame (origin x, y, z; yaw rot) inside an MB."""

    def __init__(self, mb, x, y, z, rot=0.0):
        self.mb = mb
        self.base = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z")
        self.rot = rot
        self.o = Vector((x, y, z))

    def world(self, c):
        return self.base @ Vector(c)

    def _m(self, c, s, rot):
        return self.base @ Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))

    def box(self, c, s, m, rot=(0, 0, 0)):
        r = bmesh.ops.create_cube(self.mb.bm, size=1.0, matrix=self._m(c, s, rot))
        self.mb._tag(r["verts"], m)

    def cyl(self, c, r1, r2, h, m, segs=8, rot=(0, 0, 0)):
        r = bmesh.ops.create_cone(self.mb.bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2,
                                  depth=h, matrix=self._m(c, (1, 1, 1), rot))
        self.mb._tag(r["verts"], m)

    def ico(self, c, s, m, jitter=0.0, sub=1):
        r = bmesh.ops.create_icosphere(self.mb.bm, subdivisions=sub, radius=1.0, matrix=self._m(c, s, (0, 0, 0)))
        if jitter:
            for v in r["verts"]:
                v.co += Vector([random.uniform(-1, 1) for _ in range(3)]) * jitter
        self.mb._tag(r["verts"], m)

    def col(self, ctx, c, s, tag="prop", z_from_ground=False):
        w = self.world(c)
        ctx.col(w.x, w.y, w.z, s[0], s[1], s[2], self.rot, tag)


# ------------------------------------------------------------------ dune dressing
def rock(mb, ctx, x, y, s, palette=ROCK, flat=0.6, collide=True):
    z = L.height(x, y)
    u1, u2 = random.uniform(0.8, 1.3), random.uniform(0.7, 1.1)
    m = palette[min(len(palette) - 1, int(random.random() * len(palette)))]
    mb.ico((x, y, z + s * flat * 0.35), (s * u1, s * u2, s * flat), m, sub=1, jitter=0.16 * s,
           rot=(0, 0, random.uniform(0, math.tau)))
    if collide and s > 0.7:
        ctx.col(x, y, z + s * flat * 0.5, 1.6 * s * u1, 1.6 * s * u2, s * flat * 1.6, 0.0, "rock")


def rock_cluster(mb, ctx, x, y, s=1.0, palette=ROCK):
    rock(mb, ctx, x, y, 1.6 * s, palette)
    for _ in range(random.randint(2, 5)):
        a, r = random.uniform(0, math.tau), random.uniform(1.6, 3.2) * s
        rock(mb, ctx, x + math.cos(a) * r, y + math.sin(a) * r, random.uniform(0.35, 0.9) * s, palette)


def shrub(mb, x, y, s=1.0):
    z = L.height(x, y)
    for _ in range(random.randint(2, 4)):
        o = Vector((random.uniform(-0.35, 0.35) * s, random.uniform(-0.35, 0.35) * s, 0))
        r = random.uniform(0.3, 0.55) * s
        mb.ico(Vector((x, y, z + r * 0.6)) + o, (r, r, r * 0.8), random.choice(SHRUB), sub=1, jitter=0.08 * s)
    for _ in range(random.randint(1, 3)):
        a = random.uniform(0, math.tau)
        mb.box((x + math.cos(a) * 0.3 * s, y + math.sin(a) * 0.3 * s, z + 0.35 * s), (0.04, 0.04, 0.7 * s), DRY,
               rot=(random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), 0))


def dry_bush(mb, x, y, s=1.0):
    z = L.height(x, y)
    for _ in range(7):
        a, t = random.uniform(0, math.tau), random.uniform(0.4, 0.9)
        mb.box((x + math.cos(a) * 0.25 * s, y + math.sin(a) * 0.25 * s, z + 0.3 * s), (0.05, 0.05, 0.8 * s), DRY,
               rot=(math.sin(a) * t, -math.cos(a) * t, 0))


def acacia(mb, ctx, x, y, s=1.0):
    """Umbrella thorn acacia: leaning trunk, forked branches, flat canopy."""
    z = L.height(x, y)
    lean = random.uniform(-0.2, 0.2)
    lc = Local(mb, x, y, z, random.uniform(0, math.tau))
    lc.box((0, 0, 1.2 * s), (0.32 * s, 0.32 * s, 2.5 * s), BARK, rot=(lean, 0, 0))
    top = Vector((0, -math.sin(lean) * 2.4 * s, 2.4 * s))
    for k in range(3):
        a = k * math.tau / 3 + random.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 1.1)).normalized()
        c = top + d * 1.0 * s
        lc.box(tuple(c), (0.18 * s, 0.18 * s, 2.0 * s), BARK,
               rot=(-math.asin(d.y) * 0.9, math.asin(d.x) * 0.9, 0))
    cz = top.z + 1.6 * s
    for k in range(3):
        o = (random.uniform(-1.2, 1.2) * s, random.uniform(-1.2, 1.2) * s, random.uniform(-0.2, 0.3) * s)
        lc.ico((top.x + o[0], top.y + o[1], cz + o[2]), (2.4 * s, 2.1 * s, 0.55 * s), random.choice(CANOPY),
               jitter=0.25 * s)
    ctx.col(x, y, z + 1.5 * s, 0.6 * s, 0.6 * s, 3 * s, 0, "tree")


def dead_tree(mb, ctx, x, y, s=1.0):
    z = L.height(x, y)
    lc = Local(mb, x, y, z, random.uniform(0, math.tau))
    lc.box((0, 0, 1.1 * s), (0.26 * s, 0.26 * s, 2.2 * s), BARK, rot=(0.15, 0, 0))
    for k in range(4):
        a = random.uniform(0, math.tau)
        lc.box((math.cos(a) * 0.5 * s, math.sin(a) * 0.5 * s, 2.0 * s + k * 0.2), (0.1 * s, 0.1 * s, 1.4 * s), BARK,
               rot=(math.sin(a) * 0.8, -math.cos(a) * 0.8, 0))
    ctx.col(x, y, z + 1.2 * s, 0.5 * s, 0.5 * s, 2.4 * s, 0, "tree")


def ruin_wall(mb, ctx, x, y, rot, length, h, m=STONE, collide=True):
    """Broken dry-stone wall: block columns of falling height toward ragged ends."""
    z0 = L.height(x, y)
    lc = Local(mb, x, y, z0 - 0.2, rot)
    n = max(2, int(length / 0.9))
    hs = []
    for i in range(n):
        t = i / (n - 1)
        edge = min(t, 1 - t) * 2                      # 0 at ends, 1 in the middle
        hh = h * (0.35 + 0.65 * edge ** 0.6) * random.uniform(0.6, 1.0)
        if random.random() < 0.15:
            hh *= 0.3                                 # breach
        hs.append(hh)
        px = -length / 2 + (i + 0.5) * length / n
        rows = max(1, int(hh / 0.5))
        for r in range(rows):
            off = 0.2 if r % 2 else 0.0
            lc.box((px + off + random.uniform(-0.04, 0.04), random.uniform(-0.05, 0.05), 0.25 + r * 0.5),
                   (length / n * 0.96, 0.62, 0.48), m if random.random() > 0.2 else STONE_DARK)
    for _ in range(int(length / 2)):                  # tumbled blocks
        lc.box((random.uniform(-length / 2, length / 2), random.choice((-1, 1)) * random.uniform(0.7, 1.8), 0.4),
               (0.8, 0.55, 0.45), m, rot=(0, 0, random.uniform(-0.6, 0.6)))
    if collide and max(hs) > 0.8:
        lc.col(ctx, (0, 0, 0.2 + sum(hs) / len(hs) / 2 + 0.5), (length, 0.8, sum(hs) / len(hs) + 1.0), "ruin")


def column(mb, ctx, x, y, h, m=STONE, fallen=True, r=0.42):
    z = L.height(x, y) - 0.1
    lc = Local(mb, x, y, z, random.uniform(0, math.tau))
    lc.box((0, 0, 0.2), (r * 2.6, r * 2.6, 0.4), m)
    dz = 0.4
    drums = max(1, int(h / 0.9))
    for i in range(drums):
        lc.cyl((random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), dz + 0.45), r, r * 0.97, 0.88, m, segs=10,
               rot=(0, 0, random.uniform(0, 1)))
        dz += 0.9
    if drums * 0.9 > 3:
        lc.box((0, 0, dz + 0.2), (r * 2.8, r * 2.8, 0.4), m)
    if fallen:
        for k in range(random.randint(1, 3)):
            a = random.uniform(0, math.tau)
            d = random.uniform(1.4, 3.0)
            lc.cyl((math.cos(a) * d, math.sin(a) * d, r * 0.95), r, r, 0.88, m, segs=10,
                   rot=(math.pi / 2, 0, a + math.pi / 2))
    ctx.col(x, y, z + dz / 2, r * 2.6, r * 2.6, dz + 0.4, 0, "ruin")


def ruin_site(mb, ctx, x, y, size=1.0, m=STONE):
    """A collapsed building: partial rectangle of broken walls, a few columns, rubble."""
    rot = random.uniform(0, math.tau)
    w, d = random.uniform(8, 14) * size, random.uniform(6, 10) * size
    c, s = math.cos(rot), math.sin(rot)

    def at(lx, ly):
        return x + lx * c - ly * s, y + lx * s + ly * c
    for (lx, ly, rr, ln) in [(0, -d / 2, 0, w), (0, d / 2, 0, w), (-w / 2, 0, math.pi / 2, d), (w / 2, 0, math.pi / 2, d)]:
        if random.random() < 0.75:
            px, py = at(lx, ly)
            ruin_wall(mb, ctx, px, py, rot + rr, ln * random.uniform(0.5, 0.95), random.uniform(1.2, 2.8) * size, m)
    for _ in range(random.randint(1, 4)):
        px, py = at(random.uniform(-w / 2, w / 2) * 0.8, random.choice((-1, 1)) * (d / 2 + 2.2))
        column(mb, ctx, px, py, random.uniform(1.0, 4.5), m)
    ctx.keepout.append((x, y, max(w, d) * 0.8))


def cairn(mb, ctx, x, y, flag=None):
    """Waymarker: stacked stones and a post with a cloth strip (exits use these)."""
    z = L.height(x, y)
    for i, r in enumerate((0.55, 0.45, 0.35, 0.25)):
        mb.ico((x + random.uniform(-0.05, 0.05), y, z + 0.25 + i * 0.38), (r, r * 0.9, 0.24), STONE_DARK, sub=1,
               jitter=0.05)
    mb.box((x, y, z + 2.0), (0.1, 0.1, 2.8), L.WOOD)
    mb.box((x + 0.35, y, z + 3.0), (0.65, 0.04, 0.4), flag or CLOTH[0])
    ctx.col(x, y, z + 0.8, 1.1, 1.1, 1.6, 0, "prop")


def well(mb, ctx, x, y):
    z = L.height(x, y)
    for k in range(10):
        a = k / 10 * math.tau
        mb.box((x + math.cos(a) * 1.0, y + math.sin(a) * 1.0, z + 0.4), (0.62, 0.36, 0.8), STONE,
               rot=(0, 0, a + math.pi / 2))
    mb.cyl((x, y, z + 0.55), 0.85, 0.85, 0.05, WATER, segs=10)
    for sx in (-1.15, 1.15):
        mb.box((x + sx, y, z + 1.3), (0.14, 0.14, 2.6), L.WOOD)
    mb.box((x, y, z + 2.55), (2.6, 0.14, 0.14), L.WOOD)
    mb.box((x, y, z + 1.7), (0.02, 0.02, 1.7), L.LEATHER)
    mb.cyl((x, y, z + 0.95), 0.16, 0.13, 0.26, L.WOOD, segs=6)
    ctx.col(x, y, z + 0.6, 2.5, 2.5, 1.2, 0, "prop")


def brazier(mb, ctx, x, y):
    z = L.height(x, y)
    for k in range(3):
        a = k / 3 * math.tau
        mb.box((x + math.cos(a) * 0.25, y + math.sin(a) * 0.25, z + 0.45), (0.06, 0.06, 0.9), L.GOLD,
               rot=(math.sin(a) * 0.2, -math.cos(a) * 0.2, 0))
    mb.cyl((x, y, z + 0.95), 0.25, 0.4, 0.25, L.GOLD, segs=8)
    mb.cyl((x, y, z + 1.3), 0.28, 0.04, 0.5, FIRE, segs=5)
    ctx.light("fire", x, y, z + 1.4)
    ctx.col(x, y, z + 0.6, 0.8, 0.8, 1.2, 0, "prop")


def campfire(mb, ctx, x, y):
    z = L.height(x, y)
    mb.cyl((x, y, z + 0.3), 0.35, 0.05, 0.6, FIRE, segs=5)
    for k, a in enumerate((0.3, 1.9, 3.6, 5.0)):
        mb.box((x + math.cos(a) * 0.45, y + math.sin(a) * 0.45, z + 0.06), (0.5, 0.12, 0.12), L.WOOD, rot=(0, 0, a))
    for k in range(8):
        a = k / 8 * math.tau
        mb.box((x + math.cos(a) * 0.85, y + math.sin(a) * 0.85, z + 0.1), (0.3, 0.25, 0.2), STONE_DARK, rot=(0, 0, a))
    ctx.light("fire", x, y, z + 0.6)


def bones(mb, x, y):
    """Bleached camel bones half buried in the sand."""
    z = L.height(x, y)
    lc = Local(mb, x, y, z, random.uniform(0, math.tau))
    lc.box((0, 0, 0.1), (0.25, 1.6, 0.18), BONE)
    for k in range(6):
        lc.box((0, -0.6 + k * 0.24, 0.25), (0.9, 0.06, 0.06), BONE, rot=(0, 0.3 * (1 if k % 2 else -1), 0))
    lc.box((0.1, -1.2, 0.15), (0.3, 0.5, 0.25), BONE, rot=(0, 0, 0.3))


# ------------------------------------------------------------------ cliffs and canyons
def cliff(mb, ctx, x, y, w, d, h, rot=0.0, palette=ROCK, collide=True, tag="cliff"):
    """Stratified sandstone block: stacked, slightly offset layers in band colours."""
    z = L.height(x, y) - 2.0
    lc = Local(mb, x, y, z, rot)
    zz, k = 0.0, random.randint(0, 3)
    while zz < h:
        th = random.uniform(2.2, 3.8)
        shrink = 1.0 - 0.18 * (zz / max(h, 1)) ** 1.5
        ox, oy = random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6)
        lc.box((ox, oy, zz + th / 2), (w * shrink + random.uniform(-0.8, 0.8), d * shrink + random.uniform(-0.8, 0.8), th),
               palette[k % len(palette)], rot=(0, 0, random.uniform(-0.03, 0.03)))
        zz += th
        k += 1
    if collide:
        lc.col(ctx, (0, 0, zz / 2), (w, d, zz), tag)
    return z + zz


def canyon(mb, ctx, pts, width, height, thick=14.0, palette=ROCK):
    """Rock walls on both sides of a polyline (a siq). Returns floor path points."""
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        dv = b - a
        ln = dv.length
        n = Vector((-dv.y, dv.x)).normalized()
        rot = math.atan2(dv.y, dv.x)
        for side in (-1, 1):
            c = (a + b) / 2 + n * side * (width / 2 + thick / 2)
            cliff(mb, ctx, c.x, c.y, ln + 3.0, thick, height * random.uniform(0.8, 1.15), rot, palette)


def tomb_facade(mb, ctx, x, y, z, rot, w=9.0, h=14.0, face=FACADE_HEGRA):
    """Hegra-style rock-cut tomb front (crowstep crown), facing local -Y."""
    lc = Local(mb, x, y, z, rot)
    fy = 0.0
    lc.box((0, fy, h / 2), (w, 1.6, h), face)
    for sx in (-w * 0.42, w * 0.42):
        lc.box((sx, fy - 0.9, h * 0.39), (0.8, 0.4, h * 0.78), face)
    lc.box((0, fy - 1.0, h * 0.81), (w + 0.4, 0.6, 0.7), face)
    lc.box((0, fy - 0.9, h * 0.24), (w * 0.24, 0.5, h * 0.3), face)
    lc.box((0, fy - 1.0, h * 0.21), (w * 0.17, 0.3, h * 0.26), L.SHADOW)
    lc.box((0, fy - 0.9, h * 0.43), (w * 0.36, 0.4, 0.4), face)
    lc.box((0, fy - 0.9, h * 0.46), (w * 0.22, 0.4, 0.5), face)
    for i in range(2):
        for sx in (-w * 0.29, w * 0.29):
            for k in range(3):
                lc.box((sx, fy - 0.7, h * 0.885 + i * 1.4 + k * 0.45), (2.0 - k * 0.6, 0.6, 0.45), face)
    for k in range(4):
        lc.box((0, fy - 0.6, h + 1.0 + k * 0.5), (w * 0.72 - k * 1.5, 0.8, 0.5), face)
    ctx.light("door", *lc.world((0, -1.6, 0.4)))
    return lc.world((0, -2.0, 0))


def outcrop_with_tombs(mb, ctx, x, y, w, d, h, facades, palette=ROCK, face=FACADE_HEGRA):
    """A sandstone outcrop with tomb facades cut into its sides. facades: [(side, offset, fw, fh)]
    side 0..3 = -Y, +X, +Y, -X face."""
    rot = random.uniform(-0.25, 0.25)
    top = cliff(mb, ctx, x, y, w, d, h, rot, palette)
    doors = []
    c, s = math.cos(rot), math.sin(rot)
    for side, off, fw, fh in facades:
        normal_rot = rot + side * math.pi / 2
        half = (d if side % 2 == 0 else w) / 2
        lx, ly = (off, -half) if side == 0 else (half, off) if side == 1 else (-off, half) if side == 2 else (-half, -off)
        wx, wy = x + lx * c - ly * s, y + lx * s + ly * c
        doors.append(tomb_facade(mb, ctx, wx, wy, L.height(wx, wy) - 0.4, normal_rot, fw, fh, face))
    return doors


def khazneh(mb, ctx, x, y, rot, face=FACADE_ROSE, palette=ROSE):
    """Treasury-style two-storey facade (after al-Khazneh, Petra) cut into a cliff, facing local -Y."""
    z = L.height(x, y) - 0.3
    lc = Local(mb, x, y, z, rot)
    # the cliff mass behind and the carved recess walls
    cliff(mb, ctx, *lc.world((0, 14, 0)).xy, 46, 26, 36, rot, palette)
    for sx in (-15.5, 15.5):
        wpt = lc.world((sx, 1.5, 0))
        cliff(mb, ctx, wpt.x, wpt.y, 9, 9, 34, rot, palette)
    for k in range(3):                                         # podium steps
        lc.box((0, -1.6 - k * 0.6, 0.15 + k * 0.3), (21 - k * 0.6, 1.4, 0.3 + k * 0.6), face)
    lc.box((0, 0.3, 16), (22, 1.2, 32), face)                  # back plane of the facade
    for i, cx in enumerate((-7.5, -4.5, -1.5, 1.5, 4.5, 7.5)):  # lower order columns
        lc.cyl((cx, -1.4, 5.0), 0.55, 0.52, 8.0, face, segs=10)
        lc.box((cx, -1.4, 9.2), (1.4, 1.4, 0.5), face)
    lc.box((0, -1.2, 10.1), (19, 1.8, 1.3), face)              # entablature
    lc.box((0, -1.4, 10.9), (19.4, 1.9, 0.35), face)
    for k in range(4):                                         # stepped pediment
        lc.box((0, -1.2, 11.3 + k * 0.5), (9 - k * 2.0, 1.6, 0.5), face)
    lc.box((0, -0.8, 3.2), (3.0, 0.4, 6.2), L.SHADOW)          # great doorway
    for sx in (-6.0, 6.0):                                     # side doors
        lc.box((sx, -0.6, 2.4), (1.6, 0.3, 4.0), L.SHADOW)
    # upper order: central tholos between broken half-pediments
    lc.box((0, -0.6, 13.6), (20, 1.4, 1.0), face)
    lc.cyl((0, -1.6, 18.2), 2.4, 2.4, 8.0, face, segs=12)
    for a in range(6):
        ang = math.pi + a * math.pi / 5
        lc.cyl((math.cos(ang) * 2.9, -1.6 + math.sin(ang) * 2.9 * 0.6, 18.2), 0.32, 0.3, 8.0, face, segs=8)
    lc.box((0, -1.6, 22.5), (6.6, 4.2, 0.6), face)
    lc.cyl((0, -1.6, 24.2), 3.0, 0.4, 2.8, face, segs=12)      # conical roof
    lc.cyl((0, -1.6, 26.0), 0.45, 0.6, 1.2, face, segs=8)      # the urn
    lc.ico((0, -1.6, 26.9), (0.6, 0.6, 0.6), face)
    for sx in (-7.0, 7.0):                                     # side pavilions
        for cx in (sx - 1.8, sx + 1.8):
            lc.cyl((cx, -1.2, 18.0), 0.4, 0.38, 7.6, face, segs=8)
        lc.box((sx, -1.2, 22.2), (5.0, 1.8, 0.8), face)
        for k in range(3):
            lc.box((sx + (1 if sx < 0 else -1) * k * 0.6, -1.2, 22.9 + k * 0.45), (4.2 - k * 1.2, 1.6, 0.45), face)
    lc.col(ctx, (0, -0.5, 6), (22, 3.6, 12), "facade")
    ctx.light("brazier", *lc.world((-3.5, -4.5, 0.5)))
    ctx.light("brazier", *lc.world((3.5, -4.5, 0.5)))
    return lc.world((0, -6, 0))


# ------------------------------------------------------------------ caravanserai
def caravanserai(mb, ctx, x, y, rot, S=46.0, wall_h=6.5):
    """Square fortified inn: outer wall with corner towers, a gate on local -Y, an arcade of
    cells round the courtyard, a well and troughs in the middle."""
    z = L.height(x, y) - 0.2
    lc = Local(mb, x, y, z, rot)
    mud, mud2, lime = L.MUD[1], L.MUD[2], L.MUD[3]
    t, half, gate = 1.4, S / 2, 5.0
    # outer walls (gate gap on -Y)
    for side in range(4):
        a = side * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        if side == 0:
            for sgn in (-1, 1):
                ln = half - gate / 2
                cx = sgn * (gate / 2 + ln / 2)
                lc.box((cx, -half, wall_h / 2), (ln, t, wall_h), mud)
                lc.col(ctx, (cx, -half, wall_h / 2), (ln, t + 0.2, wall_h), "wall")
        else:
            cx, cy = [(0, -half), (half, 0), (0, half), (-half, 0)][side]
            sx, sy = (S, t) if side % 2 == 0 else (t, S)
            lc.box((cx, cy, wall_h / 2), (sx, sy, wall_h), mud)
            lc.col(ctx, (cx, cy, wall_h / 2), (sx + 0.2, sy + 0.2, wall_h), "wall")
    for k in range(int(S / 1.2)):                                   # crenellations
        p = -half + 0.6 + k * 1.2
        for (cx, cy) in ((p, -half), (p, half), (-half, p), (half, p)):
            if abs(cx) < gate / 2 + 0.5 and cy < 0:
                continue
            lc.box((cx, cy, wall_h + 0.35), (0.55, 0.55, 0.7) if True else (0, 0, 0), mud2)
    for (cx, cy) in ((-half, -half), (half, -half), (half, half), (-half, half)):   # towers
        lc.box((cx, cy, (wall_h + 2) / 2), (4.2, 4.2, wall_h + 2), mud2)
        lc.box((cx, cy, wall_h + 2.25), (4.6, 4.6, 0.5), lime)
        lc.col(ctx, (cx, cy, (wall_h + 2) / 2), (4.4, 4.4, wall_h + 2), "wall")
    for sgn in (-1, 1):                                             # gatehouse
        lc.box((sgn * (gate / 2 + 1.6), -half - 0.6, (wall_h + 3) / 2), (3.2, 3.4, wall_h + 3), mud2)
        lc.col(ctx, (sgn * (gate / 2 + 1.6), -half - 0.6, (wall_h + 3) / 2), (3.2, 3.4, wall_h + 3), "wall")
    lc.box((0, -half - 0.6, wall_h + 0.6), (gate + 0.4, 3.4, 2.4), mud2)
    lc.box((0, -half - 2.35, wall_h - 0.75), (gate + 0.2, 0.1, 0.3), L.WOOD)
    lc.box((0, -half - 0.6, wall_h + 3.3), (gate + 6.8, 3.8, 0.5), lime)
    # arcade of cells along the inside of each wall
    depth, bay, ph = 4.2, 4.0, 4.4
    inner = half - t / 2
    for side in range(4):
        a = side * math.pi / 2
        loc = Local(mb, *lc.world((0, 0, 0)), rot + a)          # local -Y faces the wall on this side
        nb = int((S - 2 * t - 2 * depth) / bay)
        span = nb * bay
        loc.box((0, -inner + depth / 2, ph + 0.25), (span + 2 * depth, depth, 0.5), lime)     # arcade roof
        for i in range(nb + 1):
            px = -span / 2 + i * bay
            if side == 0 and abs(px) < gate / 2 + 1.5:        # keep the gate passage open
                continue
            loc.box((px, -inner + depth, ph / 2), (0.9, 0.9, ph), mud)                         # piers
            loc.col(ctx, (px, -inner + depth, ph / 2), (0.9, 0.9, ph), "pier")
            loc.box((px, -inner + depth * 0.45, ph / 2), (0.35, depth * 0.9, ph), mud2)        # cell walls
            loc.col(ctx, (px, -inner + depth * 0.45, ph / 2), (0.35, depth * 0.9, ph), "wall")
            if i < nb and not (side == 0 and abs(px + bay / 2) < gate / 2 + 1.5):
                loc.box((px + bay / 2, -inner + depth, ph - 0.35), (bay - 0.9, 0.7, 0.7), lime)   # lintels
                loc.box((px + bay / 2, -inner + 0.25, 1.1), (1.0, 0.1, 2.2), L.SHADOW)          # cell doors
    # courtyard: well, troughs, a raised stone platform
    well(mb, ctx, *lc.world((0, 2, 0)).xy)
    for sgn in (-1, 1):
        p = lc.world((sgn * 7, 6, 0))
        lc.box((sgn * 7, 6, 0.35), (1.0, 5.0, 0.7), STONE)
        lc.box((sgn * 7, 6, 0.66), (0.7, 4.6, 0.05), WATER)
        lc.col(ctx, (sgn * 7, 6, 0.35), (1.0, 5.0, 0.8), "prop")
    lc.box((0, 12, 0.4), (8, 4, 0.8), STONE)
    lc.col(ctx, (0, 12, 0.4), (8, 4, 0.8), "prop")
    return {"gate": lc.world((0, -half - 4, 0)), "court": lc.world((0, 0, 0)), "half": half}


# ------------------------------------------------------------------ raider fort pieces
def palisade(mb, ctx, x0, y0, x1, y1, h=3.4):
    a, b = Vector((x0, y0)), Vector((x1, y1))
    dv = b - a
    n = max(2, int(dv.length / 0.38))
    for i in range(n):
        p = a + dv * (i + 0.5) / n
        z = L.height(p.x, p.y)
        hh = h * random.uniform(0.88, 1.08)
        mb.box((p.x, p.y, z + hh / 2 - 0.3), (0.34, 0.34, hh), BARK, rot=(0, 0, random.uniform(-0.2, 0.2)))
        mb.cyl((p.x, p.y, z + hh - 0.1), 0.2, 0.0, 0.5, BARK, segs=4)
    for zz in (1.0, 2.4):                                         # cross rails on the inside
        m = (a + b) / 2
        mb.box((m.x, m.y, L.height(m.x, m.y) + zz), (dv.length, 0.12, 0.14), L.WOOD,
               rot=(0, 0, math.atan2(dv.y, dv.x)))
    m = (a + b) / 2
    ctx.col(m.x, m.y, L.height(m.x, m.y) + h / 2, dv.length + 0.2, 0.6, h + 0.6, math.atan2(dv.y, dv.x), "wall")


def watchtower(mb, ctx, x, y, rot=0.0, h=6.0):
    z = L.height(x, y)
    lc = Local(mb, x, y, z, rot)
    for sx in (-1.1, 1.1):
        for sy in (-1.1, 1.1):
            lc.box((sx, sy, h / 2), (0.22, 0.22, h), BARK)
    lc.box((0, 0, h - 1.4), (3.0, 3.0, 0.18), L.WOOD)
    for k in range(4):
        a = k * math.pi / 2
        lc.box((math.cos(a) * 1.45, math.sin(a) * 1.45, h - 0.85), (0.1 if k % 2 == 0 else 3.0, 3.0 if k % 2 == 0 else 0.1, 0.9),
               L.WOOD)
    lc.box((0, 0.25, h + 0.6), (3.4, 3.6, 0.12), random.choice(CLOTH), rot=(0.18, 0, 0))
    for k in range(int(h / 0.45)):                               # ladder
        lc.box((0, -1.3, 0.3 + k * 0.45), (0.7, 0.06, 0.06), L.WOOD)
    lc.box((-0.35, -1.3, (h - 1.4) / 2), (0.06, 0.06, h - 1.4), L.WOOD)
    lc.box((0.35, -1.3, (h - 1.4) / 2), (0.06, 0.06, h - 1.4), L.WOOD)
    lc.col(ctx, (0, 0, (h - 1.31) / 2), (2.6, 2.6, h - 1.31), "tower")      # top = the walkable platform


def archery_target(mb, ctx, x, y, rot=0.0):
    """Straw butt on a timber A-frame, painted face toward local -Y. Collider tag 'target'."""
    z = L.height(x, y)
    lc = Local(mb, x, y, z, rot)
    for sx in (-0.45, 0.45):
        lc.box((sx, 0.12, 0.7), (0.08, 0.08, 1.5), L.WOOD, rot=(R(-12), 0, 0))
    lc.box((0, 0.45, 0.55), (0.08, 0.08, 1.2), L.WOOD, rot=(R(30), 0, 0))
    lc.cyl((0, 0, 1.1), 0.55, 0.55, 0.3, L.mat("Straw", "#d8be7a", 0.95), segs=12, rot=(R(90), 0, 0))
    for k, (r, hexc) in enumerate(((0.48, "#efe6d2"), (0.37, "#24201c"), (0.26, "#8b1e1e"), (0.13, "#d9b25a"))):
        lc.cyl((0, -0.152 - k * 0.004, 1.1), r, r, 0.006, L.mat(f"TargetRing{k}", hexc, 0.9), segs=12, rot=(R(90), 0, 0))
    lc.col(ctx, (0, 0, 1.1), (1.1, 0.32, 1.1), "target")
    return lc.world((0, -0.17, 1.1))


def weapon_rack(mb, ctx, x, y, rot):
    z = L.height(x, y)
    lc = Local(mb, x, y, z, rot)
    lc.box((0, 0, 0.9), (2.0, 0.12, 0.12), L.WOOD)
    lc.box((0, 0, 0.3), (2.0, 0.5, 0.1), L.WOOD)
    for sx in (-0.95, 0.95):
        lc.box((sx, 0, 0.55), (0.12, 0.6, 1.1), L.WOOD)
    steel = L.mat("Steel", "#c9cdd2", 0.3)
    for k in range(5):
        px = -0.8 + k * 0.4
        lc.box((px, 0.12, 1.2), (0.05, 0.05, 2.4), L.WOOD, rot=(-0.15, 0, 0))
        lc.box((px, 0.31, 2.45), (0.08, 0.02, 0.3), steel, rot=(-0.15, 0, 0))
    lc.col(ctx, (0, 0, 0.6), (2.1, 0.8, 1.2), "prop")


def banner(mb, x, y, m=None, h=5.0):
    z = L.height(x, y)
    mb.box((x, y, z + h / 2), (0.12, 0.12, h), L.WOOD)
    mb.box((x + 0.55, y, z + h - 0.9), (1.0, 0.04, 1.6), m or random.choice(CLOTH))


def spikes(mb, ctx, x0, y0, x1, y1):
    a, b = Vector((x0, y0)), Vector((x1, y1))
    dv = b - a
    rot = math.atan2(dv.y, dv.x)
    n = max(1, int(dv.length / 1.2))
    for i in range(n):
        p = a + dv * (i + 0.5) / n
        z = L.height(p.x, p.y)
        for s in (-1, 1):
            mb.box((p.x, p.y, z + 0.6), (0.12, 0.12, 2.0), BARK, rot=(s * 0.8, 0, rot))
    mb.box(tuple((a + b) / 2) + (L.height(*((a + b) / 2)) + 0.6,), (dv.length, 0.14, 0.14), BARK, rot=(0, 0, rot))
    m = (a + b) / 2
    ctx.col(m.x, m.y, L.height(m.x, m.y) + 0.6, dv.length, 1.4, 1.2, rot, "prop")


def dummy(mb, ctx, x, y):
    z = L.height(x, y)
    mb.box((x, y, z + 0.9), (0.14, 0.14, 1.8), L.WOOD)
    mb.box((x, y, z + 1.35), (1.1, 0.12, 0.12), L.WOOD)
    mb.box((x, y, z + 1.2), (0.5, 0.36, 0.7), L.mat("Sack", "#cdb48a", 1.0))
    mb.box((x, y, z + 1.8), (0.32, 0.32, 0.32), L.mat("Sack", "#cdb48a", 1.0))
    ctx.col(x, y, z + 0.9, 0.6, 0.6, 1.8, 0, "prop")


def goods(mb, ctx, x, y, n=6, spread=1.6):
    """Heap of crates, sacks and jars (loot, market back-stock)."""
    for _ in range(n):
        px, py = x + random.uniform(-spread, spread), y + random.uniform(-spread, spread)
        z = L.height(px, py)
        k = random.random()
        if k < 0.35:
            mb.box((px, py, z + 0.35), (0.7, 0.7, 0.7), L.WOOD, rot=(0, 0, random.uniform(0, 1)))
        elif k < 0.7:
            mb.box((px, py, z + 0.3), (0.5, 0.45, 0.6), L.mat("Sack", "#cdb48a", 1.0), rot=(0, 0, random.uniform(0, 1)))
        else:
            mb.cyl((px, py, z + 0.4), 0.28, 0.18, 0.8, random.choice([L.CLAY, L.CLAY2]), segs=8)
    z = L.height(x, y)
    ctx.col(x, y, z + 0.5, spread * 1.6, spread * 1.6, 1.0, 0, "prop")


def big_tent(mb, ctx, x, y, rot, s=1.6, m=None, body=None):
    """Chief's tent: striped walls, peaked roof. body= replaces the pale cloth (e.g. red leather)."""
    z = L.height(x, y)
    lc = Local(mb, x, y, z, rot)
    stripe = m or CLOTH[0]
    _cloth = body or L.mat("TentCloth", "#d9c9a3", 0.95)
    lc.box((0, 0, 1.2 * s), (6 * s, 5 * s, 2.4 * s), _cloth)
    for k in range(6):
        lc.box((-2.5 * s + k * s, -2.52 * s, 1.2 * s), (0.45 * s, 0.04, 2.4 * s), stripe)
    for k in range(4):
        lc.box((0, 0, 2.5 * s + k * 0.35 * s), ((6 - k * 1.4) * s, (5 - k * 1.2) * s, 0.36 * s), stripe if k % 2 else
               _cloth)
    lc.box((0, -2.53 * s, 0.9 * s), (1.2 * s, 0.05, 1.8 * s), L.SHADOW)
    lc.col(ctx, (0, 0, 1.4 * s), (6 * s, 5 * s, 2.8 * s), "tent")


def terrace_wall(mb, x0, y0, x1, y1, h=0.6, m=STONE_DARK):
    a, b = Vector((x0, y0)), Vector((x1, y1))
    m_ = (a + b) / 2
    z = min(L.height(a.x, a.y), L.height(b.x, b.y), L.height(m_.x, m_.y))
    dv = b - a
    mb.box((m_.x, m_.y, z + h / 2 - 0.1), (dv.length + 0.1, 0.5, h), m, rot=(0, 0, math.atan2(dv.y, dv.x)))
