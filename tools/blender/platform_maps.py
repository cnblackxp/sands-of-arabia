"""
Platforming maps (v4): rooftop run, cliff ascent with a ruined aqueduct, ruined temple.

Jump budget the game supports (keep every required move inside it):
    single jump  ~1.8 m up        double jump ~3.2 m up
    running gap  ~4.5 m           step-up without jumping 0.4 m
Every walkable surface here is a box collider whose top (pos.y + half.y) is exactly
the visible top, so crates, roofs, beams, pillars and ledges are all platforms.
Required moves stay <= 1.3 m up with gaps <= 2.6 m (or drops with gaps <= 3.6 m);
secrets need a double jump (2.6 - 3.0 m up). Falling just means a detour.

Importing this module registers the maps in maps.MAPS.
"""
import math, random
from mathutils import Vector, noise

import arabia_lib as L
import kit as K
import maps as M

R = math.radians
MUD = L.MUD
CRATE = L.WOOD


# ------------------------------------------------------------------ platform kit
def pbox(mb, ctx, x, y, top, w, d, m, rot=0.0, bottom=None, tag="platform", collide=True):
    """A box whose collider top is exactly `top` (world z)."""
    b = (L.height(x, y) - 1.0) if bottom is None else bottom
    h = max(0.05, top - b)
    lc = K.Local(mb, x, y, b, rot)
    lc.box((0, 0, h / 2), (w, d, h), m)
    if collide:
        ctx.col(x, y, b + h / 2, w, d, h, rot, tag)
    return lc


def roof_house(mb, ctx, x, y, w, d, top, tower=False, rot=0.0):
    """Flat-roofed mudbrick block (walkable roof at `top`) with low parapet, door, windows, beam ends."""
    m = random.choice(MUD[:3])
    g = L.height(x, y)
    lc = pbox(mb, ctx, x, y, top, w, d, m, rot, tag="roof")
    h = top - (g - 1.0)
    base = -1.0 + 0.0                                         # local z of the ground is +1.0
    zg = 1.0
    # parapet: 0.3 high (under the 0.4 step-up, so no collider needed), gaps at the corners
    for sx in (-1, 1):
        lc.box((0, sx * (d / 2 - 0.12), h + 0.15), (w * 0.7, 0.24, 0.3), m)
        lc.box((sx * (w / 2 - 0.12), 0, h + 0.15), (0.24, d * 0.7, 0.3), m)
    lc.box((0, -d / 2 - 0.02, zg + 1.0), (1.0, 0.1, 2.0), L.SHADOW)
    for k in range(int(w / 0.9)):
        lc.box((-w / 2 + 0.45 + k * 0.9, -d / 2 - 0.22, h - 0.35), (0.13, 0.44, 0.13), L.WOOD)
    floors = int((top - g) / 2.8)
    for f in range(1, floors + 1):
        z = zg + f * 2.8 - 0.9
        if z > h - 0.6:
            break
        for sx in (-w / 3.2, w / 3.2):
            lc.box((sx, -d / 2 - 0.02, z), (0.5, 0.1, 0.7), L.SHADOW)
            lc.box((-w / 2 - 0.02, sx * d / w, z), (0.1, 0.5, 0.7), L.SHADOW)
    if tower:
        lc.box((0, 0, h - 0.8), (w + 0.06, d + 0.06, 1.6), MUD[3])     # limewashed crown band
    return lc


def beam(mb, ctx, x0, y0, x1, y1, top, w=0.55):
    """Level timber bridge between two roofs (top surface at `top`)."""
    a, b = Vector((x0, y0)), Vector((x1, y1))
    dv = b - a
    m = (a + b) / 2
    rot = math.atan2(dv.y, dv.x)
    mb.box((m.x, m.y, top - 0.14), (dv.length + 0.6, w, 0.28), L.WOOD, rot=(0, 0, rot))
    for k in range(int(dv.length / 1.2)):                        # cross slats
        p = a + dv * (k + 0.5) / max(1, int(dv.length / 1.2))
        mb.box((p.x, p.y, top + 0.01), (0.12, w + 0.15, 0.04), L.LEATHER, rot=(0, 0, rot))
    ctx.col(m.x, m.y, top - 0.14, dv.length + 0.6, w, 0.28, rot, "beam")


def crates(mb, ctx, x, y, top, s=1.3):
    """Stack of crates whose top is `top` (re-entry steps, platform starts)."""
    g = L.height(x, y)
    n = max(1, round((top - g) / s))
    for i in range(n):
        z0 = g + i * (top - g) / n
        z1 = g + (i + 1) * (top - g) / n
        mb.box((x + random.uniform(-0.05, 0.05), y, (z0 + z1) / 2), (s, s, z1 - z0 - 0.02), CRATE,
               rot=(0, 0, random.uniform(-0.05, 0.05)))
        mb.box((x, y, (z0 + z1) / 2), (s + 0.02, 0.12, z1 - z0), L.LEATHER)
    ctx.col(x, y, (g - 0.5 + top) / 2, s, s, top - g + 0.5, 0, "crate")


def square_pillar(mb, ctx, x, y, top, s=1.2, m=K.STONE, broken=True):
    g = L.height(x, y) - 0.6
    lc = pbox(mb, ctx, x, y, top, s, s, m, bottom=g, tag="pillar")
    if broken and random.random() < 0.6:                          # ragged top chunk (visual)
        lc.box((random.uniform(-0.2, 0.2), random.uniform(-0.2, 0.2), top - g + 0.1), (s * 0.5, s * 0.45, 0.2), m)
    else:
        lc.box((0, 0, top - g - 0.15), (s * 1.25, s * 1.25, 0.3), m)  # capital (flush top)
    return lc


def chest_spot(ctx, x, y, z=None, rot=0.0, cid=None, secret=False):
    ctx.spawn("chest", x, y, rot, id=cid, secret=secret, **({"z": round(z, 3)} if z is not None else {}))


def gap_ok(a, b):
    """True if b is reachable from a within the single-jump budget (a, b = (x0,x1,y0,y1,top))."""
    dx = max(0.0, max(a[0], b[0]) - min(a[1], b[1]))
    dy = max(0.0, max(a[2], b[2]) - min(a[3], b[3]))
    gap = math.hypot(dx, dy)
    rise = b[4] - a[4]
    return (rise <= 1.35 and gap <= 2.7) or (rise <= 0.0 and gap <= 3.7) or (rise <= 0.4 and gap <= 0.05)


# ================================================================== Rooftops
class Rooftops(M.MapDef):
    name, title = "rooftops", "Rooftops of Qaryat al-Faw"
    bounds = (-100.0, 100.0, -95.0, 100.0)
    sun = (24.0, -30.0)
    fog = {"color": "#ecd2a8", "near": 70, "far": 380}
    color = staticmethod(M.ground_color("#c49464", "#d0a473", "#dbb586", "#b98a5c"))

    def height(self, x, y):
        town = max(abs(x) / 78, abs(y - 5) / 80)
        dune = (noise.noise(Vector((x * 0.01, y * 0.01, 4.4))) * 0.5 + 0.5) * 8
        return dune * L.smooth(1.0, 1.25, town)

    def build(self, mb, ctx):
        rects = []                                              # (x0,x1,y0,y1,top)

        def free(r, margin, skip=None):
            return all(r[1] + margin < o[0] or o[1] + margin < r[0] or r[3] + margin < o[2] or o[3] + margin < r[2]
                       for o in rects if o is not skip)

        # start plaza: market, crates up onto the first roof
        ctx.spawn("player", 0, -84, math.pi)
        ctx.spawn("player", 0, -84, math.pi, **{"from": "oasis"})
        ctx.exits.append({"to": "oasis", "x": 0, "y": -90, "r": 6, "label": "Back to the oasis"})
        K.cairn(mb, ctx, 4, -88)
        ctx.spawn("bonfire", -6, -76, 0.0, id="rooftops_plaza")
        for (x, y, r) in [(-14, -70, R(90)), (14, -68, R(-90)), (-14, -62, R(90))]:
            L.stall(x, y, r)
            ctx.spawn("merchant", x - math.sin(r) * 1.3, y + math.cos(r) * 1.3, r)
        ctx.spawn("shopkeeper", 14 - math.sin(R(-90)) * 1.3, -68, R(-90), id="rooftops_trader")
        ctx.spawn("quest_giver", -3, -70, math.pi, id="rooftops_runner")
        ctx.keepout.append((0, -72, 18))
        # the main route, generated and checked against the jump budget
        random.seed(404)
        plan = [1.25, 2.5, 3.7, 4.9, 6.1, 6.1, 7.3, 8.5, 7.3, 8.5, 9.7, 9.7, 10.9, 9.6, 8.4, 9.6, 10.8, 12.0,
                12.0, 13.2, 11.9, 10.6, 11.8, 13.0]
        cur = (-0.8, 0.8, -58.6, -57.0, 1.25)                    # crate step
        crates(mb, ctx, 0, -57.8, 1.25, 1.6)
        rects.append(cur)
        route = [cur]
        heading = 0.0                                            # 0 = north
        for i, top in enumerate(plan[1:], 1):
            placed = False
            for attempt in range(60):
                turn = random.choice([0, 0, 0, 1, -1]) if attempt < 40 else random.choice([1, -1, 0])
                hd = heading + turn * math.pi / 2
                dx, dy = round(math.sin(hd)), round(math.cos(hd))
                w, d = random.uniform(3.6, 6.0), random.uniform(3.6, 6.0)
                rise = top - cur[4]
                same = abs(rise) < 0.05
                use_beam = same and random.random() < 0.7
                gap = random.uniform(4.5, 7.0) if use_beam else (
                    random.uniform(0.8, 2.3) if rise > 0 else random.uniform(1.2, 3.3))
                cx, cy = (cur[0] + cur[1]) / 2, (cur[2] + cur[3]) / 2
                pw, pd = cur[1] - cur[0], cur[3] - cur[2]
                if dy:
                    nx = cx + random.uniform(-0.3, 0.3) * min(pw, w)
                    ny = cy + dy * (pd / 2 + gap + d / 2)
                else:
                    nx = cx + dx * (pw / 2 + gap + w / 2)
                    ny = cy + random.uniform(-0.3, 0.3) * min(pd, d)
                r = (nx - w / 2, nx + w / 2, ny - d / 2, ny + d / 2, top)
                if not (-70 < nx < 70 and -62 < ny < 85):
                    continue
                if not free(r, 2.0, skip=cur) or not free(r, 0.3):
                    continue
                if not use_beam and not gap_ok(cur, r):
                    continue
                rects.append(r)
                roof_house(mb, ctx, nx, ny, w, d, top, tower=top > 8.0)
                if use_beam:
                    if dy:
                        beam(mb, ctx, nx, cur[3] if dy > 0 else cur[2], nx, r[2] if dy > 0 else r[3], top)
                    else:
                        beam(mb, ctx, cur[1] if dx > 0 else cur[0], ny, r[0] if dx > 0 else r[1], ny, top)
                heading = hd if turn else heading
                route.append(r)
                cur = r
                placed = True
                break
            if not placed:
                print("ROUTE: could not place step", i)
                break
        ctx.paths["roof_route"] = [((r[0] + r[1]) / 2, (r[2] + r[3]) / 2) for r in route]
        for k, r in enumerate(route):
            cx, cy = (r[0] + r[1]) / 2, (r[2] + r[3]) / 2
            if k in (6, 13, 19):
                chest_spot(ctx, cx, cy, r[4], cid=f"rooftops_chest_{k}")
            if k == 11:
                ctx.spawn("bonfire", cx, cy, 0.0, id="rooftops_high", z=round(r[4], 3))
            if k == 9:
                ctx.spawn("pickup", cx + 0.8, cy, 0.0, id="rooftops_lost_kite", z=round(r[4], 3))
        # secret: a lone tower beside the summit, ~2.8 m above it (double jump only)
        top_r = max(route, key=lambda r: r[4])
        for side in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            w = d = 3.0
            cx, cy = (top_r[0] + top_r[1]) / 2, (top_r[2] + top_r[3]) / 2
            sx = cx + side[0] * ((top_r[1] - top_r[0]) / 2 + 1.0 + w / 2)
            sy = cy + side[1] * ((top_r[3] - top_r[2]) / 2 + 1.0 + d / 2)
            r = (sx - w / 2, sx + w / 2, sy - d / 2, sy + d / 2, top_r[4] + 2.8)
            if free(r, 0.6) and -75 < sx < 75 and -55 < sy < 90:
                rects.append(r)
                roof_house(mb, ctx, sx, sy, w, d, r[4], tower=True)
                chest_spot(ctx, sx, sy, r[4], cid="rooftops_secret", secret=True)
                ctx.landmarks["secret_tower"] = (sx, sy)
                break
        # re-entry crate stairs beside low route roofs (falling = a detour, not a restart)
        for r in route[1:9]:
            for (ox, oy) in ((-1, 0), (1, 0), (0, -1)):
                cx = (r[0] + r[1]) / 2 + ox * ((r[1] - r[0]) / 2 + 0.9)
                cy = (r[2] + r[3]) / 2 + oy * ((r[3] - r[2]) / 2 + 0.9)
                steps = []
                t = r[4] - 1.0
                k = 0
                while t > 0.3 and k < 8:
                    steps.append((cx + ox * k * 1.35, cy + oy * k * 1.35, t))
                    t -= 1.0
                    k += 1
                rs = [(sx - 0.65, sx + 0.65, sy - 0.65, sy + 0.65, st) for sx, sy, st in steps]
                if steps and all(free(q, 0.3) for q in rs):
                    for (sx, sy, st), q in zip(steps, rs):
                        crates(mb, ctx, sx, sy, st)
                        rects.append(q)
                    break
        # filler houses make the dense town (they also open alternative routes)
        random.seed(405)
        for _ in range(900):
            x, y = random.uniform(-72, 72), random.uniform(-52, 86)
            w, d = random.uniform(4, 7.5), random.uniform(4, 7)
            top = random.choice([2.6, 3.8, 5.0, 5.0, 6.2, 7.4, 3.8])
            r = (x - w / 2, x + w / 2, y - d / 2, y + d / 2, top)
            near_route = any(not (r[1] + 2.0 < o[0] or o[1] + 2.0 < r[0] or r[3] + 2.0 < o[2] or o[3] + 2.0 < r[2])
                             for o in route)
            if not near_route and free(r, 1.3):
                rects.append(r)
                roof_house(mb, ctx, x, y, w, d, top, tower=top > 7)
                ctx.keepout.append((x, y, max(w, d) * 0.7))
        for r in route:
            ctx.keepout.append(((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, max(r[1] - r[0], r[3] - r[2]) * 0.8))
        # street life
        people_ok = lambda x, y: all(not (o[0] - 0.8 < x < o[1] + 0.8 and o[2] - 0.8 < y < o[3] + 0.8) for o in rects)
        M.people(ctx, "wanderer", M.wander_pts(26, 0, 10, 66, 60, people_ok))
        M.people(ctx, "sitter", M.wander_pts(5, 0, -10, 50, 50, people_ok))
        ctx.spawn("quest_giver", 10, -60, 0.0, id="rooftops_lantern_maker")
        for (x, y) in M.wander_pts(6, 0, 20, 60, 60, people_ok):
            L.palm(x, y, random.uniform(0.8, 1.0), 0.15)
            ctx.col(x, y, L.height(x, y) + 2, 0.7, 0.7, 4, 0, "palm")
        ctx.landmarks.update({"plaza": (0, -72), "route_start": (0, -57.8),
                              "summit": ((top_r[0] + top_r[1]) / 2, (top_r[2] + top_r[3]) / 2)})
        print("ROOFTOPS route", len(route), "steps, summit", round(top_r[4], 2), "m, houses", len(rects))
        # v5 enemies: slingers holding roofs along the route
        arrivals = [(sp_["x"], sp_["y"]) for sp_ in ctx.spawns if sp_["role"] == "player"]
        picked = []
        for k, r in enumerate(route):                      # roofs >= 40 m from every arrival, spread along the route
            cx, cy = (r[0] + r[1]) / 2, (r[2] + r[3]) / 2
            if min(math.hypot(cx - ax, cy - ay) for ax, ay in arrivals) >= 40 and all(k - j >= 5 for j in picked):
                picked.append(k)
                ctx.spawn("enemy", cx + 0.8, cy, math.pi, kind="slinger", camp="roofs", z=round(r[4], 3))
            if len(picked) == 3:
                break
        M.dress(mb, ctx, self, lambda x, y: max(abs(x) / 78, abs(y - 5) / 80) > 1.05, rocks=10, singles=20,
                shrubs=50, dry=30, acacias=6, dead=2, ruins=0, bones=1)


# ================================================================== Cliff ascent
class Cliffs(M.MapDef):
    name, title = "cliffs", "The aqueduct cliffs"
    bounds = (-100.0, 100.0, -60.0, 110.0)
    sun = (18.0, 70.0)
    fog = {"color": "#e6c9a2", "near": 80, "far": 420}
    Y0, TOP = 40.0, 36.0
    color = staticmethod(M.rock_top(M.ground_color("#c39566", "#cfa575", "#dab687", steep_bands=K.ROCK_BANDS),
                                    K.ROCK_BANDS, 20, 34))

    def height(self, x, y):
        base = 0.6 * noise.noise(Vector((x * 0.03, y * 0.03, 1.5)))
        stream = -1.6 * math.exp(-((y + 18) / 3.0) ** 2)
        cliff = self.TOP * L.smooth(self.Y0 - 2.0, self.Y0 + 2.0, y)
        top_n = L.smooth(self.Y0, self.Y0 + 6, y) * 0.0
        return base * (1 - L.smooth(self.Y0 - 3, self.Y0, y)) + stream + cliff + top_n

    def build(self, mb, ctx):
        Y0, TOP = self.Y0, self.TOP
        ctx.spawn("player", -80, -50, math.pi * 0.85)
        ctx.spawn("player", -80, -50, math.pi * 0.85, **{"from": "wadi"})
        ctx.exits.append({"to": "wadi", "x": -88, "y": -55, "r": 6, "label": "Back down to the wadi"})
        K.cairn(mb, ctx, -84, -53)
        ctx.spawn("bonfire", -72, -42, 0.0, id="cliffs_foot")
        ctx.spawn("quest_giver", -68, -44, R(-120), id="cliffs_waterman")
        ctx.keepout += [(-78, -48, 14)]
        # the cliff face: exact strata columns from the foot to the plateau edge (solid, tops = plateau)
        for i, x in enumerate(range(-100, 101, 9)):
            zz, k = -1.0, i
            while zz < TOP - 0.1:
                z1 = min(TOP - 0.05, zz + random.uniform(2.4, 3.6))
                pbox(mb, ctx, x + random.uniform(-0.4, 0.4), Y0 + 0.6 + random.uniform(-0.5, 0.3), z1, 9.6, 5.0, K.ROCK[k % 4],
                     bottom=zz, collide=False)
                zz, k = z1, k + 1
            ctx.col(x, Y0 + 0.6, (TOP - 0.05 - 1.0) / 2, 9.0, 4.6, TOP - 0.05 + 1.0, 0, "cliff")
        # stream with stepping stones
        x = -100.0
        while x < 100:
            mb.box((x + 2, -18, L.height(x + 2, -18) + 0.3), (4.1, 2.6, 0.1), K.WATER)
            x += 4
        # the ruined aqueduct: broken pillars climb to a channel at 7 m, with collapsed spans
        AQ_Y, AQ_TOP = 8.0, 7.0
        xs = [-64 + 6 * i for i in range(21)]                    # pillar centres, -64 .. 56
        stairs = [(-74, AQ_Y, 1.2), (-71.5, AQ_Y + 0.4, 2.6), (-69, AQ_Y - 0.3, 3.8), (-66.6, AQ_Y, 5.0)]
        for (px, py, t) in stairs:
            square_pillar(mb, ctx, px, py, t, 1.5, K.STONE)
        collapsed = {4, 5, 11, 16}                               # spans missing (gap ~4.6 m: drop-in not needed)
        for i, px in enumerate(xs):
            square_pillar(mb, ctx, px, AQ_Y, AQ_TOP - 0.8, 1.4, K.STONE, broken=False)
            if i < len(xs) - 1 and i not in collapsed:
                pbox(mb, ctx, px + 3, AQ_Y, AQ_TOP, 6.2, 1.8, K.STONE, bottom=AQ_TOP - 0.8, tag="aqueduct")
                mb.box((px + 3, AQ_Y, AQ_TOP + 0.02), (6.2, 0.7, 0.04), K.WATER)              # channel water
                for s in (-0.8, 0.8):
                    mb.box((px + 3, AQ_Y + s, AQ_TOP + 0.13), (6.2, 0.2, 0.26), K.STONE_DARK)  # kerbs (step-up)
            elif i in collapsed:
                # a broken stub on each side shortens the jump to ~2.4 m
                for sgn in (-1, 1):
                    pbox(mb, ctx, px + 3 + sgn * 2.3, AQ_Y, AQ_TOP - 0.25, 1.4, 1.8, K.STONE_DARK, bottom=AQ_TOP - 1.2,
                         tag="aqueduct")
                for k in range(4):
                    K.rock(mb, ctx, px + 3 + random.uniform(-3, 3), AQ_Y + random.uniform(-3, 3), random.uniform(0.4, 0.9),
                           [K.STONE, K.STONE_DARK], collide=False)
        # first span lands on the stair top: bridge pillar -64 to the stair at -66.6 (5.0) via a 6.0 block
        square_pillar(mb, ctx, -65.4, AQ_Y + 1.2, 6.0, 1.2, K.STONE)
        ctx.paths["aqueduct"] = [(x, AQ_Y) for x in xs]
        chest_spot(ctx, -22 + 3, AQ_Y, AQ_TOP, cid="cliffs_aqueduct_chest")
        ctx.spawn("pickup", 26 + 3, AQ_Y, 0.0, id="cliffs_sluice_key", z=AQ_TOP)
        # east end: a broken tower, then rock pillars north to the cliff foot
        tx = 62.0
        pbox(mb, ctx, tx, AQ_Y, AQ_TOP, 4.0, 4.0, MUD[2], tag="tower")
        hops = [(64, 13.2, 8.2), (61.5, 17.6, 9.4), (64.5, 21.8, 10.6), (62, 26.2, 11.8), (64, 30.6, 13.0), (61.6, 34.6, 14.2)]
        for (x, y, t) in hops:
            pbox(mb, ctx, x, y, t, 2.6, 2.6, K.ROCK[(int(t) % 4)], tag="rock")
        # ledges zigzag up the face
        def band(d):                                             # westward rows hug the face, eastward rows stand out
            return Y0 - 2.4 if d < 0 else Y0 - 5.0
        z, x, dirn = 15.4, 56.0, -1
        ledges = []
        while z < TOP - 0.4:
            w = random.uniform(3.6, 5.2)
            ly = band(dirn)
            ledges.append((x, ly, z, w))
            pbox(mb, ctx, x, ly, z, w, 2.8, K.ROCK[len(ledges) % 4], bottom=z - (1.6 if dirn < 0 else 3.0), tag="ledge")
            if len(ledges) == 9:                                 # mid-height landing with a bonfire
                pbox(mb, ctx, x + dirn * 4.0, ly - 1.0, z, 7.0, 4.8, K.ROCK[1], bottom=z - 2.0, tag="ledge")
                ctx.spawn("bonfire", x + dirn * 4.0, ly - 1.2, 0.0, id="cliffs_midway", z=round(z, 3))
                x += dirn * (7.5 - w / 2)
            nx = x + dirn * (w / 2 + random.uniform(1.0, 2.0) + 2.2)
            if abs(nx) > 60:
                dirn = -dirn                                     # switchback: next row in the other band
                nx = x + dirn * 0.8
            x = nx
            z = round(z + 1.2, 2)
        # final step onto the plateau (35.8, then a 0.2 step-up)
        pbox(mb, ctx, x, Y0 - 1.0, TOP - 0.2, 5.0, 6.5, K.ROCK[2], bottom=TOP - 2.7, tag="ledge")
        ctx.paths["ledges"] = [(lx, ly) for lx, ly, lz, lw in ledges]
        chest_spot(ctx, ledges[5][0], ledges[5][1], ledges[5][2], cid="cliffs_ledge_chest")
        ctx.landmarks.update({"aqueduct_start": (-74, AQ_Y), "tower": (tx, AQ_Y), "summit": (x, Y0 + 4)})
        # summit plateau: scrub, a cairn, and the hidden valley
        vx, vy, vr = -40.0, 78.0, 13.0
        ctx.keepout.append((vx, vy, vr + 6))
        wall_top = TOP + 5.8
        n = 22
        for k in range(n):
            a = k / n * math.tau
            cx, cy = vx + math.cos(a) * vr, vy + math.sin(a) * vr * 0.85
            for li, (b0, b1) in enumerate(((TOP - 1.0, TOP + 2.0), (TOP + 2.0, TOP + 4.2), (TOP + 4.2, wall_top))):
                pbox(mb, ctx, cx, cy, b1, 6.6 - li * 0.3 + random.uniform(-0.2, 0.2), 3.0 - li * 0.2, K.ROCK[(k + li) % 4],
                     a + math.pi / 2, bottom=b0, collide=False)
            ctx.col(cx, cy, (TOP - 1.0 + wall_top) / 2, 6.6, 3.0, wall_top - (TOP - 1.0), a + math.pi / 2, "rock")
        # the only way in: a pillar 3.0 up from the plateau, then 2.8 up onto the rim (two double jumps)
        a = -math.pi / 2
        px, py = vx + math.cos(a) * (vr + 3.6), vy + math.sin(a) * (vr * 0.85 + 3.6)
        pbox(mb, ctx, px, py, TOP + 3.0, 1.8, 1.8, K.ROCK[3], bottom=TOP - 1.0, tag="rock")
        ctx.spawn("pickup", px, py, 0.0, id="white_feather", z=TOP + 3.0)
        # inside: a spring, palms, the winged horse
        mb.cyl((vx, vy, TOP + 0.1), 3.2, 3.2, 0.1, K.WATER, segs=12)
        for k in range(5):
            aa = k / 5 * math.tau + 0.4
            L.palm(vx + math.cos(aa) * 6.5, vy + math.sin(aa) * 5.5, random.uniform(0.8, 1.0), 0.1)
            ctx.col(vx + math.cos(aa) * 6.5, vy + math.sin(aa) * 5.5, TOP + 2, 0.7, 0.7, 4, 0, "palm")
        for k in range(14):
            aa = random.uniform(0, math.tau)
            K.shrub(mb, vx + math.cos(aa) * random.uniform(4, 10), vy + math.sin(aa) * random.uniform(3, 8), 1.0)
        ctx.spawn("winged_horse", vx + 1.5, vy - 3.5, R(160), id="winged_horse")
        chest_spot(ctx, vx - 3.0, vy + 4.0, None, cid="hidden_valley_chest", secret=True)
        ctx.landmarks["hidden_valley"] = (vx, vy)
        # the valley floor can always be left: blocks step back up to 3.0 under the rim (double jump out)
        pbox(mb, ctx, vx, vy - vr * 0.85 + 3.0, TOP + 1.5, 2.0, 2.0, K.ROCK[1], bottom=TOP - 1.0, tag="rock")
        pbox(mb, ctx, vx + 2.2, vy - vr * 0.85 + 3.4, TOP + 3.0, 1.8, 1.8, K.ROCK[2], bottom=TOP - 1.0, tag="rock")
        ctx.keepout += [(x, Y0, 12) for x in range(-100, 101, 10)]
        ctx.keepout += [(x, AQ_Y, 5) for x in range(-76, 66, 6)]
        M.people(ctx, "farmer", [(-50, -30), (-30, -36), (10, -28), (40, -34)])
        M.dress(mb, ctx, self, lambda x, y: y < Y0 - 6 or y > Y0 + 6, rocks=24, singles=50, shrubs=90, dry=40,
                acacias=10, dead=4, ruins=1, bones=1)
        print("CLIFFS ledges", len(ledges), "top ledge", ledges[-1][2])
        # v5 enemies: slingers on ledges and the aqueduct, vultures over the cliff face
        for k in (7, 13):
            if k < len(ledges):
                lx, ly, lz, lw = ledges[k]
                ctx.spawn("enemy", lx, ly, math.pi, kind="slinger", camp="ledges", z=round(lz, 3))
        ctx.spawn("enemy", 10.0 + 3, 8.0, math.pi, kind="slinger", camp="aqueduct", z=7.0)
        for (x, y, h) in [(-30, -20, 18), (20, 12, 24), (52, 30, 30)]:
            ctx.spawn("enemy", x, y, 0.0, kind="vulture", camp="sky", z=round(L.height(x, y) + h, 3), airborne=True)


# ================================================================== Ruined temple
class RuinedTemple(M.MapDef):
    name, title = "ruined_temple", "Ruins of the Sabaean temple"
    bounds = (-90.0, 90.0, -95.0, 90.0)
    sun = (12.0, -140.0)
    fog = {"color": "#e9cfa6", "near": 70, "far": 380}
    color = staticmethod(M.ground_color("#d2a874", "#ddb885", "#e7c898", "#c49a64"))
    EC, ERX, ERY = Vector((0, 8)), 40.0, 31.0

    def height(self, x, y):
        e = math.hypot((x - self.EC.x) / self.ERX, (y - self.EC.y) / self.ERY)
        p = Vector((x * 0.012 + y * 0.004, y * 0.022 - x * 0.006, 8.1))
        dune = (1 - abs(noise.noise(p))) ** 3 * 8 + (noise.noise(Vector((x * 0.006, y * 0.006, 2.0))) * 0.5 + 0.5) * 4
        drift = 2.2 * math.exp(-((x + 30) ** 2 + (y - 26) ** 2) / 90)      # sand drift against the wall
        return dune * L.smooth(0.9, 1.3, e) + drift * (1 - L.smooth(0.85, 1.0, e))

    def build(self, mb, ctx):
        ctx.spawn("player", 0, -84, math.pi)
        ctx.spawn("player", 0, -84, math.pi, **{"from": "hegra"})
        ctx.exits.append({"to": "hegra", "x": 0, "y": -90, "r": 6, "label": "South, back to Hegra"})
        K.cairn(mb, ctx, 4, -88)
        ctx.spawn("bonfire", -5, -70, 0.0, id="temple_approach")
        ctx.spawn("quest_giver", 5, -68, math.pi, id="temple_scholar")
        # the oval enclosure: collapsed to many heights, its top is a walkway (2 m wide)
        n = 40
        pts = [Vector((self.EC.x + math.sin(k / n * math.tau) * self.ERX, self.EC.y + math.cos(k / n * math.tau) * self.ERY))
               for k in range(n + 1)]
        tops = []
        h = 3.0
        for k in range(n):
            h = max(0.0, min(6.5, h + random.choice([-1.2, -0.6, 0.0, 0.6, 1.2])))
            if k in (19, 20, 21):
                h = 0.0                                          # the south breach = the way in
            tops.append(h)
        for k, (a, b) in enumerate(zip(pts, pts[1:])):
            if tops[k] < 0.3:
                K.ruin_wall(mb, ctx, ((a + b) / 2).x, ((a + b) / 2).y, math.atan2((b - a).y, (b - a).x), (b - a).length,
                            0.6, K.STONE, collide=False)
                continue
            m_ = (a + b) / 2
            dv = b - a
            g = L.height(m_.x, m_.y)
            pbox(mb, ctx, m_.x, m_.y, g + tops[k], dv.length + 0.25, 2.0, K.STONE if k % 3 else K.STONE_DARK,
                 math.atan2(dv.y, dv.x), bottom=g - 1.0, tag="wall")
        ctx.paths["enclosure"] = [tuple(p) for p in pts]
        # hypostyle hall: square pillars south of the sanctuary, a snaking route rising to 5.0 m
        cols, rows, sp = 5, 6, 3.6
        gx0, gy0 = -7.2, -6.5
        path = [(0, 0), (1, 0), (1, 1), (2, 1), (2, 2), (1, 2), (1, 3), (0, 3), (0, 4), (1, 4), (2, 4), (2, 5)]
        heights = {}
        for i, c in enumerate(path):
            heights[c] = round(0.9 + i * 0.37 + (0.0 if i else 0.0), 2)            # 0.9 .. 5.0
        for ci in range(cols):
            for rj in range(rows):
                x, y = gx0 + ci * sp, gy0 + rj * sp
                t = heights.get((ci, rj))
                if t is None:
                    if random.random() < 0.25:                    # toppled: drums lying in the sand
                        for k in range(3):
                            ang = random.uniform(0, math.tau)
                            mb.box((x + math.cos(ang) * (k * 1.0), y + math.sin(ang) * (k * 1.0), L.height(x, y) + 0.45),
                                   (0.95, 0.95, 0.9), K.STONE, rot=(0, 0, ang))
                        ctx.col(x, y, L.height(x, y) + 0.45, 3.0, 3.0, 0.9, 0, "ruin")
                        continue
                    t = random.choice([1.2, 2.0, 3.2, 4.4, 6.5, 8.0])
                square_pillar(mb, ctx, x, y, L.height(x, y) + t, 1.2, K.STONE)
        last = path[-1]
        lx, ly = gx0 + last[0] * sp, gy0 + last[1] * sp
        ctx.paths["column_route"] = [(gx0 + c[0] * sp, gy0 + c[1] * sp) for c in path]
        # raised sanctuary: three tiers; the broken stair only reaches the first
        sx, sy = 0.0, 14.0 + 7.0
        g = L.height(sx, sy)
        pbox(mb, ctx, sx, sy, g + 3.0, 16, 11, K.STONE, bottom=g - 1, tag="sanctuary")
        pbox(mb, ctx, sx, sy + 1.0, g + 5.4, 11, 8, K.STONE, bottom=g + 2.9, tag="sanctuary")
        pbox(mb, ctx, sx, sy + 1.5, g + 7.8, 7, 5, MUD[3], bottom=g + 5.3, tag="sanctuary")
        for k, t in enumerate((0.6, 1.2, 1.8)):                    # broken stair: ends 1.2 below tier one
            pbox(mb, ctx, sx + 4 + random.uniform(-0.2, 0.2), sy - 5.5 - 3.0 + k * 1.0, g + t, 2.6, 1.0, K.STONE_DARK,
                 bottom=g - 0.5, tag="stair")
        # column route end (5.0) sits beside tier two (5.4): link it with a fallen lintel at 5.0
        beam(mb, ctx, lx, ly + 0.6, lx, sy - 4.0 + 0.3, g + 5.0, w=1.0)
        pbox(mb, ctx, sx, sy + 0.8, g + 8.5, 1.6, 1.0, K.STONE_DARK, bottom=g + 7.7, tag="altar")
        # four tall corner pillars on the top tier (double jump from 7.8 to 10.6)
        for (ox, oy) in ((-3.0, -1.6), (3.0, -1.6), (-3.0, 4.6), (3.0, 4.6)):
            square_pillar(mb, ctx, sx + ox, sy + oy, g + 10.6, 1.1, K.STONE, broken=False)
        chest_spot(ctx, sx + 3.0, sy + 4.6, g + 10.6, cid="temple_pillar_secret", secret=True)
        chest_spot(ctx, sx, sy + 2.5, g + 7.8, cid="temple_sanctuary_chest")
        ctx.spawn("pickup", sx - 5.0, sy - 4.5, 0.0, id="bronze_inscription", z=round(g + 3.0, 3))
        # the six standing pillars of the east court, paired by architrave walkways
        bx = 24.0
        for k in range(3):
            y = 0 + k * 6.0
            t = 9.0 + k * 1.2
            for xx in (bx, bx + 4.0):
                square_pillar(mb, ctx, xx, y, L.height(xx, y) + t, 1.4, K.STONE, broken=False)
            pbox(mb, ctx, bx + 2.0, y, L.height(bx, y) + t, 5.4, 1.2, K.STONE, bottom=L.height(bx, y) + t - 0.8,
                 tag="architrave")
            if k < 2:                                             # stepping pillar up to the next architrave
                sxp = bx if k == 0 else bx + 4.0
                square_pillar(mb, ctx, sxp, y + 3.0, L.height(sxp, y + 3) + t + 0.6, 1.2, K.STONE, broken=False)
        for (x, y, t) in [(20.5, -6.0, 1.3), (22.4, -8.0, 2.5), (25.0, -7.4, 3.7), (27.2, -5.6, 4.9), (26.6, -3.0, 6.1),
                          (24.6, -2.6, 7.3), (22.6, -1.8, 8.5)]:
            square_pillar(mb, ctx, x, y, L.height(x, y) + t, 1.2, K.STONE)
        chest_spot(ctx, bx + 2.0, 12.0, L.height(bx, 12) + 11.4, cid="temple_architrave_chest")
        ctx.landmarks.update({"sanctuary": (sx, sy), "hall": (0, -9), "east_court": (bx + 2, 6),
                              "breach": (0, self.EC.y - self.ERY)})
        ctx.keepout += [(self.EC.x, self.EC.y, 44)]
        # tomb robbers digging in the court
        for (x, y, kind) in [(-20, 0, "raider"), (-24, 6, "skirmisher"), (-16, 8, "raider"), (18, 24, "brute")]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind=kind, camp="temple_robbers")
        for (x, y) in [(-22, 3), (-18, -2)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="hound", camp="temple_robbers")
        M.dress(mb, ctx, self, lambda x, y: True, rocks=26, singles=50, shrubs=70, dry=40, acacias=8, dead=4, ruins=3,
                bones=3)


for _m in (Rooftops(), Cliffs(), RuinedTemple()):
    M.MAPS[_m.name] = _m
