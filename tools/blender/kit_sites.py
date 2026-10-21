"""
Site kit (v6): modular pieces for the big research-based maps (docs/research/pre_islamic_levels.md).

Reusable across maps: Sabaean ashlar walls (with putlog holes), climbable sluice towers,
stepped platforms, monolith pillars, betyl niches, a rock-cut banquet hall (Diwan),
strata wall columns, field plots and canals, mudbrick tower-walls, round towers,
cemeteries, frankincense and dragon's-blood trees.

Every walkable top is an exact box collider (pos.y + half.y = visible top), so the
platforming budget of the game applies: required moves <= 1.35 m up / 2.7 m across.
Positions are Blender world coordinates; L.height is the current map's ground.
"""
import math, random
from mathutils import Vector

import arabia_lib as L
import kit as K
from kit import Local

R = math.radians

ASHLAR = K.bands(["#e6d6b4", "#d4c09a", "#dccaa4", "#f1e6cc"], "Ashlar")      # Sabaean limestone
ASHLAR_DARK = L.mat("AshlarShade", "#b8a27c", 0.9)
PUTLOG = L.mat("Putlog", "#3a2c1e", 1.0)
FIELD = [L.mat("Field0", "#6b7a3a", 0.9), L.mat("Field1", "#7d8a44", 0.9), L.mat("Field2", "#5f6e32", 0.9),
         L.mat("Field3", "#8c8a46", 0.9)]
DEAD_FIELD = [L.mat("DeadField0", "#9a8a62", 0.95), L.mat("DeadField1", "#a8946a", 0.95),
              L.mat("DeadField2", "#8a7a58", 0.95)]
FURROW = L.mat("Furrow", "#5a4a30", 0.95)
SOOT = L.mat("Soot", "#5a4636", 0.95)
MUDBRICK = [L.mat("Mud0", "#b98656", 0.95), L.mat("Mud1", "#c99764", 0.95), L.mat("Mud2", "#a87447", 0.95)]
LAMP = L.LAMP


# ------------------------------------------------------------------ exact boxes
def pbox(mb, ctx, x, y, top, w, d, m, rot=0.0, bottom=None, tag="platform", collide=True):
    """A box whose collider top is exactly `top` (world z); bottom defaults to 1 m below ground."""
    b = (L.height(x, y) - 1.0) if bottom is None else bottom
    h = max(0.05, top - b)
    lc = Local(mb, x, y, b, rot)
    lc.box((0, 0, h / 2), (w, d, h), m)
    if collide:
        ctx.col(x, y, b + h / 2, w, d, h, rot, tag)
    return lc


def strata_column(mb, ctx, x, y, top, w, d, rot=0.0, palette=K.ROCK, bottom=None, tag="cliff", collide=True):
    """Stacked rock layers (2.4-3.6 m) ending exactly at `top`: one solid cliff column."""
    zz = (L.height(x, y) - 1.5) if bottom is None else bottom
    k = random.randint(0, 3)
    while zz < top - 0.1:
        z1 = min(top - 0.05, zz + random.uniform(2.4, 3.6))
        pbox(mb, ctx, x + random.uniform(-0.3, 0.3), y + random.uniform(-0.3, 0.3), z1,
             w + random.uniform(-0.4, 0.3), d, palette[k % len(palette)], rot, bottom=zz, collide=False)
        zz, k = z1, k + 1
    b0 = (L.height(x, y) - 1.5) if bottom is None else bottom
    if collide:
        ctx.col(x, y, (b0 + top - 0.05) / 2, w, d, top - 0.05 - b0, rot, tag)


def strata_wall(mb, ctx, pts, top, depth=5.0, colw=7.0, offset=0.0, palette=K.ROCK, skip=lambda x, y: False,
                tag="cliff"):
    """Strata columns along a polyline (offset sideways by `offset`), each `colw` wide."""
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        dv = b - a
        n = max(1, int(dv.length / colw + 0.5))
        rot = math.atan2(dv.y, dv.x)
        nrm = Vector((-dv.y, dv.x)).normalized()
        for i in range(n):
            c = a + dv * (i + 0.5) / n + nrm * offset
            if skip(c.x, c.y):
                continue
            strata_column(mb, ctx, c.x, c.y, top if not callable(top) else top(c.x, c.y), dv.length / n + 0.6, depth,
                          rot, palette, tag=tag)


# ------------------------------------------------------------------ Sabaean stonework
def ashlar_wall(mb, ctx, x0, y0, x1, y1, h, t=1.6, holes=False, base=None, palette=ASHLAR, tag="wall", collide=True):
    """Dry-laid limestone wall in 0.5 m courses (alternating shades, slight setbacks); optional putlog holes
    on both faces like the Marib sluices. Walkable top at base + h."""
    a, b = Vector((x0, y0)), Vector((x1, y1))
    dv = b - a
    ln = dv.length
    m_ = (a + b) / 2
    rot = math.atan2(dv.y, dv.x)
    z0 = min(L.height(a.x, a.y), L.height(b.x, b.y), L.height(m_.x, m_.y)) - 0.6 if base is None else base
    lc = Local(mb, m_.x, m_.y, z0, rot)
    courses = max(1, int(h / 0.5))
    ch = h / courses
    for k in range(courses):
        inset = 0.03 * (k % 2)
        lc.box((0, 0, k * ch + ch / 2), (ln, t - inset, ch - 0.01), palette[(k + int(x0)) % len(palette)])
    if holes:
        for k in range(2, courses - 1, 2):
            for i in range(int(ln / 1.1)):
                px = -ln / 2 + 0.55 + i * 1.1 + (0.55 if k % 4 else 0)
                if abs(px) > ln / 2 - 0.4:
                    continue
                for sy in (-1, 1):
                    lc.box((px, sy * (t / 2 + 0.005), k * ch + ch / 2), (0.32, 0.03, 0.26), PUTLOG)
    if collide:
        ctx.col(m_.x, m_.y, z0 + h / 2, ln, t, h, rot, tag)
    return z0 + h


def sluice_tower(mb, ctx, x, y, rot, w=8.0, d=6.0, h=14.0, spill_dir=1):
    """Ashlar sluice building: a solid tower (walkable roof at ground + h) wrapped by climbable ledges rising
    1.2 m per step (single-jump route to the roof), a putlog-hole wing wall and an open spillway channel."""
    g = L.height(x, y)
    top = g + h
    lc = Local(mb, x, y, g - 0.8, rot)
    courses = int((h + 0.8) / 0.5)
    for k in range(courses):
        lc.box((0, 0, k * 0.5 + 0.25), (w - 0.04 * (k % 2), d - 0.04 * (k % 2), 0.49), ASHLAR[k % 4])
    lc.box((0, 0, h + 0.8 + 0.2), (w + 0.2, d + 0.2, 0.4), ASHLAR[3])
    ctx.col(*lc.world((0, 0, (h + 0.8) / 2 + 0.2)), w + 0.2, d + 0.2, h + 1.2, rot, "tower")
    # climbing ledges round the tower (counter-clockwise from the front-left corner)
    perim = []
    hw, hd = w / 2 + 0.7, d / 2 + 0.7
    side_pts = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    seg = 0
    zl = 1.2
    t = 0.0
    while zl < h - 0.2:
        a = Vector(side_pts[seg % 4])
        b = Vector(side_pts[(seg + 1) % 4])
        p = a.lerp(b, t)
        ledge_top = g + zl
        wp = lc.world((p.x, p.y, 0))
        pbox(mb, ctx, wp.x, wp.y, ledge_top, 1.5, 1.5, ASHLAR[int(zl) % 4], rot, bottom=ledge_top - 0.6, tag="ledge")
        perim.append((wp.x, wp.y, ledge_top))
        t += 2.6 / (b - a).length
        if t >= 1.0:
            t -= 1.0
            seg += 1
        zl += 1.2
    # the last ledge sits 0.4-1.6 under the roof edge: one more jump onto the roof
    # spillway: a stone channel leaving the tower, dark opening in the wall
    lc.box((0, -d / 2 - 0.02, 2.2), (2.2, 0.05, 2.6), L.SHADOW)
    for k in range(6):
        cy = -d / 2 - 1.5 - k * 3.0
        lc.box((0, cy, 0.5), (3.2, 3.0, 0.6), ASHLAR[k % 4])
        for sx in (-1.4, 1.4):
            lc.box((sx, cy, 1.0), (0.4, 3.0, 0.6), ASHLAR_DARK)
    return {"top": top, "ledges": perim, "spill": lc.world((0, -d / 2 - 18.0, 0))}


def stepped_platform(mb, ctx, x, y, rot, w, d, tiers=3, tier_h=1.2, inset=2.0, stairs=True, palette=ASHLAR,
                     tag="platform"):
    """Tiered ashlar temple platform with a front stair (local -Y). Returns the top height."""
    g = L.height(x, y)
    for k in range(tiers):
        pbox(mb, ctx, x, y, g + (k + 1) * tier_h, w - k * inset * 2, d - k * inset * 2, palette[k % len(palette)], rot,
             bottom=g - 1.0 + k * tier_h, tag=tag)
    if stairs:
        lc = Local(mb, x, y, g, rot)
        steps = int(tiers * tier_h / 0.3)
        sw = min(6.0, w * 0.3)
        for s in range(steps):
            lz = (s + 1) * 0.3
            ly = -d / 2 - (steps - s) * 0.4 + 0.2 + (tiers - 1) * 0.0
            lc.box((0, ly, lz / 2), (sw, 0.42, lz), palette[s % len(palette)])
            wpt = lc.world((0, ly, 0))
            ctx.col(wpt.x, wpt.y, g + lz / 2, sw, 0.42, lz, rot, "stair")
    return g + tiers * tier_h


def monolith(mb, ctx, x, y, top, s=1.1, m=None, broken=False):
    """Square Sabaean pillar (Barran style) with a plain capital band; walkable top at `top`."""
    m = m or ASHLAR[3]
    g = L.height(x, y) - 0.4
    lc = pbox(mb, ctx, x, y, top, s, s, m, bottom=g, tag="pillar")
    h = top - g
    if broken:
        lc.box((random.uniform(-0.2, 0.2), 0, h + 0.08), (s * 0.6, s * 0.5, 0.16), m)
    else:
        lc.box((0, 0, h - 0.25), (s * 1.18, s * 1.18, 0.5), ASHLAR[1])
    return top


def altar(mb, ctx, x, y, z, rot=0.0, w=1.4, d=1.0, h=1.1):
    """Sabaean altar block with recessed 'false window' panels (walkable top)."""
    pbox(mb, ctx, x, y, z + h, w, d, ASHLAR[3], rot, bottom=z, tag="altar")
    lc = Local(mb, x, y, z, rot)
    for k in range(3):
        lc.box((-w / 3 + k * w / 3, -d / 2 - 0.01, h * 0.55), (w / 4, 0.03, h * 0.45), ASHLAR_DARK)
    lc.box((0, 0, h + 0.05), (w + 0.12, d + 0.12, 0.1), ASHLAR[1])


# ------------------------------------------------------------------ Nabataean rock-cut work
def niche(mb, ctx, x, y, z, rot, w=1.6, h=2.2, depth=0.9, betyl=True, lamp=True, face=K.FACADE_HEGRA, soot=False):
    """Ritual niche cut into a rock face that faces local -Y: framed recess, a walkable sill (ledge) at z,
    a plinth and an aniconic betyl block, an optional lamp. Returns the sill centre."""
    lc = Local(mb, x, y, z, rot)
    lc.box((0, 0.02, h / 2), (w, 0.05, h), L.SHADOW)                                   # the recess
    for sx in (-w / 2 - 0.15, w / 2 + 0.15):
        lc.box((sx, -0.1, h / 2), (0.3, 0.25, h + 0.1), face)
    lc.box((0, -0.12, h + 0.15), (w + 0.7, 0.3, 0.3), face)                           # lintel
    sill = lc.world((0, -depth / 2 + 0.05, 0))
    pbox(mb, ctx, sill.x, sill.y, z, w + 0.6, depth, face, rot, bottom=z - 0.5, tag="ledge")
    if betyl:
        lc.box((0, 0.0, 0.18), (0.6, 0.3, 0.36), face)
        lc.box((0, 0.0, 0.36 + 0.4), (0.34, 0.2, 0.8), K.STONE_DARK)
    if lamp:
        lc.box((w / 2 - 0.12, -depth + 0.25, 0.08), (0.12, 0.12, 0.12), LAMP)
        ctx.light("lamp", *lc.world((w / 2 - 0.12, -depth + 0.25, 0.25)))
    if soot:
        lc.box((0, -0.11, h + 0.65), (w * 0.8, 0.02, 0.7), SOOT)
    return sill


def diwan(mb, ctx, x, y, rot, w=11.0, d=8.0, h=5.0, face=K.FACADE_HEGRA):
    """Open rock-cut banquet hall (the Diwan of Jabal Ithlib), mouth toward local -Y: floor, benches on three
    sides (0.45 m, walkable), side and back walls, a ceiling slab, framing pilasters, a feast fire."""
    g = L.height(x, y)
    lc = Local(mb, x, y, g, rot)
    fl = g + 0.25

    def wpt(px, py):
        return lc.world((px, py, 0))
    p = wpt(0, 0)
    pbox(mb, ctx, p.x, p.y, fl, w, d, face, rot, bottom=g - 1.0, tag="floor")
    for (bx, by, bw, bd) in [(0, d / 2 - 0.45, w - 0.2, 0.9), (-w / 2 + 0.45, 0, 0.9, d - 0.2), (w / 2 - 0.45, 0, 0.9, d - 0.2)]:
        q = wpt(bx, by)
        pbox(mb, ctx, q.x, q.y, fl + 0.45, bw, bd, K.STONE, rot, bottom=fl - 0.1, tag="ledge")
    for (bx, by, bw, bd) in [(0, d / 2 + 0.6, w + 2.4, 1.2), (-w / 2 - 0.6, 0, 1.2, d + 1.2), (w / 2 + 0.6, 0, 1.2, d + 1.2)]:
        q = wpt(bx, by)
        pbox(mb, ctx, q.x, q.y, fl + h, bw, bd, face, rot, bottom=g - 1.0, tag="wall")
    q = wpt(0, 0.3)
    pbox(mb, ctx, q.x, q.y, fl + h + 1.6, w + 2.4, d + 1.8, face, rot, bottom=fl + h, tag="roof")
    for sx in (-w / 2 - 0.3, w / 2 + 0.3):
        lc.box((sx, -d / 2 - 0.25, h / 2 + 0.25), (0.8, 0.5, h + 0.5), face)
    lc.box((0, -d / 2 - 0.3, h + 0.6), (w + 2.0, 0.6, 0.6), face)
    K.campfire(mb, ctx, *wpt(0, -0.5).xy)
    return {"floor": fl, "bench_sits": [wpt(i * 1.6 - w / 2 + 1.4, d / 2 - 0.6) for i in range(int((w - 1.8) / 1.6))]
            + [wpt(-w / 2 + 0.6, j * 1.6 - d / 2 + 1.6) for j in range(3)] + [wpt(w / 2 - 0.6, j * 1.6 - d / 2 + 1.6) for j in range(3)],
            "mouth": wpt(0, -d / 2 - 2.0)}


# ------------------------------------------------------------------ farming and water
def field_plot(mb, x, y, w, d, rot, m, furrows=True):
    """A crop plot: flat coloured slab a few cm above the ground with darker furrow lines (visual only)."""
    g = L.height(x, y)
    lc = Local(mb, x, y, g + 0.05, rot)
    lc.box((0, 0, 0), (w, d, 0.16), m)
    if furrows:
        for k in range(int(w / 1.6)):
            lc.box((-w / 2 + 0.8 + k * 1.6, 0, 0.09), (0.18, d - 0.4, 0.04), FURROW)
    for sy in (-1, 1):                                                                 # low bund walls
        lc.box((0, sy * d / 2, 0.12), (w, 0.35, 0.3), FURROW)


def canal(mb, pts, w=2.4, water=True, depth=0.5):
    """Stone-lined irrigation channel along a polyline (water or dry). Visual; no collider (step-in)."""
    wm = K.WATER if water else L.mat("DryCanal", "#b8a07a", 0.95)
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        dv = b - a
        m_ = (a + b) / 2
        rot = math.atan2(dv.y, dv.x)
        z = min(L.height(a.x, a.y), L.height(b.x, b.y))
        mb.box((m_.x, m_.y, z + 0.06), (dv.length + 0.2, w, 0.08), wm, rot=(0, 0, rot))
        nrm = Vector((-dv.y, dv.x)).normalized()
        for s in (-1, 1):
            c = m_ + nrm * s * (w / 2 + 0.25)
            mb.box((c.x, c.y, z + 0.2), (dv.length + 0.2, 0.5, 0.4), ASHLAR_DARK, rot=(0, 0, rot))


def sluice_gate(mb, ctx, x, y, rot):
    """Small ashlar gate where a branch canal leaves the main canal (a quest lever spot)."""
    g = L.height(x, y)
    lc = Local(mb, x, y, g, rot)
    for sx in (-1.6, 1.6):
        lc.box((sx, 0, 0.9), (0.8, 1.0, 1.8), ASHLAR[sx > 0 and 1 or 2])
    lc.box((0, 0, 1.9), (4.0, 1.0, 0.4), ASHLAR[3])
    lc.box((0, 0, 0.7), (2.2, 0.15, 1.2), L.WOOD)
    ctx.col(x, y, g + 1.05, 4.0, 1.0, 2.1, rot, "gate")


# ------------------------------------------------------------------ fortification
def tower_wall(mb, ctx, pts, h=6.0, t=2.2, tower_every=32.0, tw=5.5, th=9.0, closed=False, gaps=(), m=None,
               crenel=True):
    """Mudbrick curtain wall with square towers (South Arabian / Yathill style). Walkable wall top (h) and
    tower tops (th). `gaps` = indices of segments left open as gates."""
    m = m or MUDBRICK[2]
    seq = list(pts) + ([pts[0]] if closed else [])
    since = tower_every
    for i, (a, b) in enumerate(zip(seq, seq[1:])):
        a, b = Vector(a), Vector(b)
        dv = b - a
        if i in gaps:
            since = 0
            for p in (a, b):
                pbox(mb, ctx, p.x, p.y, L.height(p.x, p.y) + th + 1.5, tw + 1, tw + 1, MUDBRICK[1], math.atan2(dv.y, dv.x),
                     tag="tower")
            continue
        m_ = (a + b) / 2
        rot = math.atan2(dv.y, dv.x)
        z = min(L.height(a.x, a.y), L.height(b.x, b.y), L.height(m_.x, m_.y))
        pbox(mb, ctx, m_.x, m_.y, z + h, dv.length + 0.4, t, m, rot, bottom=z - 1.0, tag="wall")
        if crenel:
            lc = Local(mb, m_.x, m_.y, z + h, rot)
            for k in range(int(dv.length / 1.4)):
                for sy in (-1, 1):
                    lc.box((-dv.length / 2 + 0.7 + k * 1.4, sy * (t / 2 - 0.15), 0.3), (0.6, 0.3, 0.6), m)
        since += dv.length
        if since >= tower_every:
            since = 0.0
            pbox(mb, ctx, b.x, b.y, L.height(b.x, b.y) + th, tw, tw, MUDBRICK[0], rot, tag="tower")
            lc = Local(mb, b.x, b.y, L.height(b.x, b.y) + th, rot)
            for k in range(4):
                for sy in (-1, 1):
                    lc.box((-tw / 2 + 0.6 + k * (tw - 1.2) / 3, sy * (tw / 2 - 0.15), 0.3), (0.6, 0.3, 0.6), MUDBRICK[0])


def round_tower(mb, ctx, x, y, r=3.5, h=10.0, m=None):
    """Round bastion: 12-sided drum with a crenellated rim. Collider: a box inscribed in the drum, top = h."""
    m = m or MUDBRICK[1]
    g = L.height(x, y)
    mb.cyl((x, y, g - 0.5 + (h + 0.5) / 2), r, r * 0.94, h + 0.5, m, segs=12)
    for k in range(12):
        a = k / 12 * math.tau
        mb.box((x + math.cos(a) * (r - 0.2), y + math.sin(a) * (r - 0.2), g + h + 0.3), (0.6, 0.4, 0.6), m,
               rot=(0, 0, a))
    ctx.col(x, y, g + h / 2 - 0.25, r * 1.4, r * 1.4, h + 0.5, 0.0, "tower")


def cemetery(mb, ctx, x, y, rot, rows=5, cols=8, sp=(3.2, 2.6)):
    """Rows of small ashlar tomb blocks with stelae (Awwam style). Tombs are walkable boxes."""
    lc = Local(mb, x, y, 0, rot)
    for i in range(cols):
        for j in range(rows):
            if random.random() < 0.15:
                continue
            p = lc.world(((i - cols / 2) * sp[0], (j - rows / 2) * sp[1], 0))
            g = L.height(p.x, p.y)
            hh = random.uniform(0.6, 1.3)
            pbox(mb, ctx, p.x, p.y, g + hh, 2.2, 1.4, ASHLAR[(i + j) % 4], rot, tag="tomb")
            if random.random() < 0.6:
                q = lc.world(((i - cols / 2) * sp[0], (j - rows / 2) * sp[1] - 0.55, 0))
                mb.box((q.x, q.y, g + hh + 0.45), (0.5, 0.12, 0.9), ASHLAR[1], rot=(0, 0, rot))


# ------------------------------------------------------------------ trees of the incense lands
INCENSE_BARK = L.mat("IncenseBark", "#a8a08c", 0.9)
INCENSE_LEAF = L.mat("IncenseLeaf", "#7c8a4a", 0.85)
DRAGON_BARK = L.mat("DragonBark", "#8e8270", 0.9)
DRAGON_LEAF = L.mat("DragonLeaf", "#4f6a38", 0.85)


def frankincense_tree(mb, ctx, x, y, s=1.0):
    """Boswellia sacra: short papery trunk forking low into crooked limbs with small leaf clusters."""
    g = L.height(x, y)
    lc = Local(mb, x, y, g, random.uniform(0, math.tau))
    lc.box((0, 0, 0.5 * s), (0.28 * s, 0.28 * s, 1.0 * s), INCENSE_BARK)
    for k in range(4):
        a = k / 4 * math.tau + random.uniform(-0.3, 0.3)
        tilt = random.uniform(0.4, 0.8)
        d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        c = Vector((0, 0, 1.0 * s)) + d * 0.7 * s
        lc.box(tuple(c), (0.12 * s, 0.12 * s, 1.4 * s), INCENSE_BARK, rot=(-math.asin(d.y), math.asin(d.x), 0))
        tip = Vector((0, 0, 1.0 * s)) + d * 1.4 * s
        lc.ico(tuple(tip + Vector((0, 0, 0.15 * s))), (0.5 * s, 0.45 * s, 0.3 * s), INCENSE_LEAF, jitter=0.06 * s)
    ctx.col(x, y, g + 0.8 * s, 0.5 * s, 0.5 * s, 1.6 * s, 0, "tree")


def dragons_blood_tree(mb, ctx, x, y, s=1.0):
    """Dracaena cinnabari (Socotra): stout trunk, a fan of upturned branches, a dense umbrella crown."""
    g = L.height(x, y)
    lc = Local(mb, x, y, g, random.uniform(0, math.tau))
    lc.box((0, 0, 1.2 * s), (0.5 * s, 0.5 * s, 2.4 * s), DRAGON_BARK)
    for k in range(7):
        a = k / 7 * math.tau
        d = Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, 0.8)).normalized()
        c = Vector((0, 0, 2.4 * s)) + d * 0.8 * s
        lc.box(tuple(c), (0.16 * s, 0.16 * s, 1.6 * s), DRAGON_BARK, rot=(-math.asin(d.y), math.asin(d.x), 0))
    lc.cyl((0, 0, 3.75 * s), 3.0 * s, 2.6 * s, 0.7 * s, DRAGON_LEAF, segs=12)
    lc.cyl((0, 0, 4.25 * s), 2.6 * s, 1.6 * s, 0.4 * s, DRAGON_LEAF, segs=12)
    ctx.col(x, y, g + 1.2 * s, 0.8 * s, 0.8 * s, 2.4 * s, 0, "tree")


def stone_footed_tower_house(mb, ctx, x, y, rot, w, d, h, stone_h=3.0):
    """Sabaean town house: ashlar footing course (stone_h) under a mudbrick tower house (L.tower_house)."""
    g = L.height(x, y)
    pbox(mb, ctx, x, y, g + stone_h, w + 0.3, d + 0.3, ASHLAR[1], rot, tag="building")
    ob = L.tower_house(x, y, rot, w, d, h)
    ob.location.z += stone_h - 0.0
    ctx.col(x, y, g + stone_h + h / 2, w, d, h + 1.5, rot, "building")
    return ob
