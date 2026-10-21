"""
Big research maps (v6), from docs/research/pre_islamic_levels.md. Importing registers them in maps.MAPS.

    jabal_ithlib  600 x 600 m   Hegra's sacred mountain: siq, sanctuary bowl, betyl niches, the Diwan,
                                a ledge climb to the high place, tombs and robber camps on the plain
    marib         1000 x 800 m  Saba: the Great Dam with sluice towers, reservoir, canals and the two
                                gardens, Marib on its tell, Barran's pillars, the Awwam oval and cemetery
    marib_breach  same layout   after the flood of al-'Arim: breached dam, empty reservoir, dead fields

Bilingual: map titles, exit labels and landmark names carry English and classical Arabic (no harakat).
Everything walkable is an exact collider; required moves stay inside the game's single-jump budget.
"""
import math, random
from mathutils import Vector, noise

import arabia_lib as L
import kit as K
import kit_sites as S
import maps as M
import inst as I
from maps import MapDef, ground_color, rock_top, dress, people, wander_pts, face

R = math.radians


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def poly_dist(px, py, pts):
    return min(seg_dist(px, py, a, b) for a, b in zip(pts, pts[1:]))


def rrect_inside(x, y, cx, cy, hx, hy, r):
    """Signed distance inside a rounded rectangle (positive inside)."""
    qx, qy = abs(x - cx) - (hx - r), abs(y - cy) - (hy - r)
    out = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r
    return -out


def boundary_loop(inside_fn, cx, cy, n=120, rmax=400.0):
    """Points on the zero contour of inside_fn, found by bisection along rays from (cx, cy)."""
    pts = []
    for k in range(n + 1):
        a = k / n * math.tau
        lo, hi = 0.0, rmax
        for _ in range(30):
            mid = (lo + hi) / 2
            if inside_fn(cx + math.cos(a) * mid, cy + math.sin(a) * mid) > 0:
                lo = mid
            else:
                hi = mid
        pts.append((cx + math.cos(a) * lo, cy + math.sin(a) * lo))
    return pts


# ================================================================== Jabal Ithlib
class JabalIthlib(MapDef):
    name = "jabal_ithlib"
    title = "Jabal Ithlib: the sacred mountain"
    title_ar = "جبل إثلب: الجبل المقدس"
    bounds = (-300.0, 300.0, -300.0, 300.0)
    step = 2.0
    tile = 120.0
    instanced = True
    culture = "nabataean"
    batch = 2
    sun = (6.0, -70.0)                                   # blue hour into night is the mood; the game owns the clock
    fog = {"color": "#d9a98a", "near": 90, "far": 520}
    TOP = 32.0
    MC, MH, MR = (40.0, 60.0), (130.0, 100.0), 40.0
    SIQ = [(28, -48), (24, -30), (30, -14), (26, 2), (34, 18), (40, 34)]
    SIQ_HW = 3.0
    BOWL, BR = (40.0, 72.0), 38.0
    DIWAN = (76.0, 90.0, 65.0, 79.0)                     # carved hall rectangle x0, x1, y0, y1
    color = staticmethod(rock_top(ground_color("#d49a68", "#e0ae7c", "#ebc193", steep_bands=K.ROCK_BANDS),
                                  K.ROCK_BANDS, 10, 22))

    def inside(self, x, y):
        return rrect_inside(x, y, *self.MC, *self.MH, self.MR)

    def carve(self, x, y):
        x0, x1, y0, y1 = self.DIWAN
        rect = max(x0 - x, x - x1, y0 - y, y - y1)
        # the terrain cut runs ~1.5 m behind the strata wall faces so the coarse grid never pokes through them
        return min(poly_dist(x, y, self.SIQ) - (self.SIQ_HW + 1.5),
                   math.hypot(x - self.BOWL[0], y - self.BOWL[1]) - (self.BR + 1.5), rect)

    def height(self, x, y):
        base = 1.0 * noise.noise(Vector((x * 0.01, y * 0.01, 3.3))) + 0.4 * noise.noise(Vector((x * 0.04, y * 0.04, 1.2)))
        ins = self.inside(x, y)
        if ins < -1:
            return base
        m = L.smooth(1.0, 4.0, ins) * L.smooth(0.0, 2.0, self.carve(x, y))
        top = self.TOP + 0.5 * noise.noise(Vector((x * 0.05, y * 0.05, 7.0)))
        return base * (1 - m) + top * m

    def build(self, mb, ctx):
        TOP, (bx, by), BR = self.TOP, self.BOWL, self.BR
        N = ctx.names
        # ---- the massif's faces: strata columns (solid, tops level with the plateau)
        loop = boundary_loop(self.inside, *self.MC, n=110)
        mouth = Vector(self.SIQ[0])
        S.strata_wall(mb, ctx, loop, TOP, depth=5.0, colw=9.0, offset=-2.5,
                      skip=lambda x, y: (Vector((x, y)) - mouth).length < 10)
        # siq walls (both sides), bowl rim (inner face at BR), with openings for the siq and the Diwan
        S.strata_wall(mb, ctx, self.SIQ, TOP, depth=4.0, colw=6.0, offset=self.SIQ_HW + 2.0)
        S.strata_wall(mb, ctx, self.SIQ, TOP, depth=4.0, colw=6.0, offset=-(self.SIQ_HW + 2.0))
        rim = [(bx + math.cos(k / 36 * math.tau) * (BR + 2.5), by + math.sin(k / 36 * math.tau) * (BR + 2.5))
               for k in range(37)]
        siq_end = Vector(self.SIQ[-1])
        S.strata_wall(mb, ctx, rim, TOP, depth=5.0, colw=7.0, offset=0.0,
                      skip=lambda x, y: (Vector((x, y)) - siq_end).length < 9 or (x > bx + BR - 4 and abs(y - by) < 9))
        ctx.paths["siq"] = list(self.SIQ)
        ctx.landmarks["siq_mouth"] = self.SIQ[0]
        N["siq_mouth"] = ("Mouth of the siq", "مدخل السيق")
        ctx.keepout += [(x, y, 8) for x, y in self.SIQ]
        # ---- lore stones on the siq walls (inscriptions to read aloud)
        for i, k in enumerate((1, 3, 4)):
            a, b = Vector(self.SIQ[k]), Vector(self.SIQ[k + 1])
            d = (b - a).normalized()
            n = Vector((-d.y, d.x))
            p = a + (b - a) * 0.5 - n * (self.SIQ_HW - 0.3)
            ctx.spawn("lore", p.x, p.y, math.atan2(n.x, -n.y), id=f"siq_inscription_{i + 1}",
                      z=round(L.height(p.x, p.y) + 1.6, 3))
        # ---- the chockstone at 5.3 m, with wall ledges climbing to it
        a, b = Vector(self.SIQ[2]), Vector(self.SIQ[3])
        d = (b - a).normalized()
        n = Vector((-d.y, d.x))
        cs = a + (b - a) * 0.55
        g = L.height(cs.x, cs.y)
        S.pbox(mb, ctx, cs.x, cs.y, g + 5.3, 2.0, 2 * self.SIQ_HW + 2.5, K.ROCK[2], math.atan2(d.y, d.x),
               bottom=g + 3.6, tag="ledge")
        for i in range(4):
            p = cs - d * (2.6 + i * 2.2) + n * (self.SIQ_HW - 0.6)
            S.pbox(mb, ctx, p.x, p.y, L.height(p.x, p.y) + 1.25 * (4 - i) - 0.05, 1.8, 1.2, K.ROCK[i % 4],
                   math.atan2(d.y, d.x), bottom=L.height(p.x, p.y) + 1.25 * (4 - i) - 0.7, tag="ledge")
        ctx.landmarks["chockstone"] = (cs.x, cs.y)
        N["chockstone"] = ("The chockstone", "الصخرة المعلقة")
        chock_z = g + 5.3
        # ---- niches round the north of the bowl, three staggered tiers with lamps
        ctx.landmarks["sanctuary"] = (bx, by)
        N["sanctuary"] = ("The sanctuary bowl", "حوض الحرم")
        gb = L.height(bx, by)
        sills = []
        for tier, z in enumerate((1.25, 2.5, 3.75)):
            for k in range(9):
                ang = R(55) + (k + 0.5 * (tier % 2)) * (3.6 / BR) * 1.0 + R(0)
                ang = R(58) + (k * 2 + tier % 2) * (1.9 / BR)
                x, y = bx + math.cos(ang) * BR, by + math.sin(ang) * BR
                rot = face(x, y, bx, by)
                sill = S.niche(mb, ctx, x, y, L.height(bx, by) + z, rot, w=1.5, h=2.1, depth=0.9,
                               betyl=(k + tier) % 2 == 0, lamp=True, soot=tier == 2)
                sills.append((sill, z, rot, k, tier))
        nx_, ny_ = bx + math.cos(R(80)) * (BR - 6), by + math.sin(R(80)) * (BR - 6)
        ctx.landmarks["niches"] = (nx_, ny_)
        N["niches"] = ("Niches of the betyls", "كوى الأنصاب")
        # the dry cistern: a pocket above the last tier-3 niche, 2.5 m over its sill (double jump)
        last = [s_ for s_ in sills if s_[4] == 2][-1]
        lp, lz, lrot = last[0], last[1], last[2]
        S.pbox(mb, ctx, lp.x, lp.y, gb + lz + 2.55, 1.6, 1.2, K.ROCK[1], lrot, bottom=gb + lz + 2.0, tag="ledge")
        ctx.spawn("chest", lp.x, lp.y, lrot, id="ithlib_dry_cistern", secret=True, z=round(gb + lz + 2.55, 3))
        ctx.landmarks["dry_cistern"] = (lp.x, lp.y)
        N["dry_cistern"] = ("The dry cistern", "الصهريج الجاف")
        # the betyl that the 18:12 sun lights: a lone niche on the west rim at floor level
        sx_, sy_ = bx + math.cos(R(190)) * BR, by + math.sin(R(190)) * BR
        S.niche(mb, ctx, sx_, sy_, gb + 0.3, face(sx_, sy_, bx, by), w=1.4, h=1.9, betyl=True, lamp=False)
        ctx.landmarks["sunset_betyl"] = (sx_, sy_)
        N["sunset_betyl"] = ("The betyl of the setting sun", "نصب الغروب")
        # ---- the Diwan, cut into the east rim
        x0, x1, y0, y1 = self.DIWAN
        dw = S.diwan(mb, ctx, (x0 + x1) / 2 - 0.5, (y0 + y1) / 2, -math.pi / 2, w=11.0, d=10.0, h=5.0)
        S.strata_column(mb, ctx, (x0 + x1) / 2 - 0.5, (y0 + y1) / 2, TOP, x1 - x0 + 1.0, y1 - y0 + 1.0, 0.0,
                        bottom=dw["floor"] + 5.0 + 1.6, tag="cliff")                   # living rock above the hall
        ctx.landmarks["diwan"] = ((x0 + x1) / 2, (y0 + y1) / 2)
        N["diwan"] = ("The Diwan", "الديوان")
        ctx.keepout.append((bx, by, BR + 6))
        # ---- the stepped path to the summit up the west of the bowl (two radial bands, switchbacks)
        def band_r(dirn):
            return BR - 1.4 if dirn > 0 else BR - 4.0
        ang, dirn, z = R(150), 1, 1.2
        ledges = []
        while z < TOP - 2.0:
            w = random.uniform(3.8, 4.6)
            r = band_r(dirn)
            x, y = bx + math.cos(ang) * r, by + math.sin(ang) * r
            rot = math.atan2(math.cos(ang), -math.sin(ang))          # tangent along the arc
            S.pbox(mb, ctx, x, y, gb + z, w, 2.8, K.ROCK[len(ledges) % 4], rot,
                   bottom=gb + z - (1.4 if dirn > 0 else 3.0), tag="ledge")
            ledges.append((x, y, gb + z))
            if len(ledges) == 12:
                ctx.spawn("enemy", x, y, face(x, y, bx, by), kind="archer", camp="night_archers", night_only=True,
                          z=round(gb + z, 3))
            nang = ang + dirn * (w / 2 + random.uniform(1.0, 1.8) + 2.1) / r
            if not R(140) <= nang <= R(255):
                dirn = -dirn
                nang = ang + dirn * 0.6 / r
            ang = nang
            z = round(z + 1.2, 2)
        r = BR - 1.4
        x, y = bx + math.cos(ang) * r, by + math.sin(ang) * r
        S.pbox(mb, ctx, x, y, gb + TOP - 0.8, 4.4, 2.8, K.ROCK[2], math.atan2(math.cos(ang), -math.sin(ang)),
               bottom=gb + TOP - 2.6, tag="ledge")
        ledges.append((x, y, gb + TOP - 0.8))
        ctx.paths["summit_path"] = [(p[0], p[1]) for p in ledges]
        # ---- the high place on the plateau: altar, basin, channel, braziers
        hx, hy = 10.0, 128.0
        hz = L.height(hx, hy)
        S.pbox(mb, ctx, hx, hy, hz + 0.6, 12, 9, K.FACADE_HEGRA, 0, bottom=hz - 0.5, tag="altar")
        S.pbox(mb, ctx, hx, hy + 2.0, hz + 1.7, 2.6, 1.6, K.STONE, 0, bottom=hz + 0.5, tag="altar")
        mb.cyl((hx - 3.0, hy - 1.5, hz + 0.68), 1.0, 1.0, 0.12, K.WATER, segs=10)
        mb.box((hx - 3.0, hy - 4.2, hz + 0.66), (0.4, 5.0, 0.08), K.WATER)
        for sx in (-4.5, 4.5):
            K.brazier(mb, ctx, hx + sx, hy + 3.0)
        ctx.landmarks["high_place"] = (hx, hy)
        N["high_place"] = ("The high place", "المرتفع المقدس")
        ctx.spawn("enemy", hx + 8, hy - 6, R(200), kind="archer", camp="night_archers", night_only=True,
                  z=round(hz, 3))
        ctx.spawn("enemy", bx + 30, by + 34, R(220), kind="archer", camp="night_archers", night_only=True,
                  z=round(L.height(bx + 30, by + 34), 3))
        # ---- the plain: palm spring, Hegra tombs, robber camps
        gx, gy = -180.0, -150.0
        mb.cyl((gx, gy, L.height(gx, gy) + 0.1), 7.0, 7.0, 0.1, K.WATER, segs=14)
        for k in range(14):
            a = k / 14 * math.tau + random.uniform(-0.2, 0.2)
            px, py = gx + math.cos(a) * random.uniform(9, 16), gy + math.sin(a) * random.uniform(9, 16)
            I.palm(ctx, px, py, random.uniform(0.9, 1.15))
        ctx.landmarks["grove"] = (gx, gy)
        N["grove"] = ("The palm spring", "عين النخيل")
        ctx.spawn("pickup", gx + 8, gy + 2, 0.0, id="wadi_wine")
        ctx.keepout.append((gx, gy, 20))
        tombs = []
        for (x, y, w, d, h, fac) in [(-200, 120, 20, 16, 15, [(0, 0, 8, 12)]), (-150, 222, 22, 18, 17, [(0, 2, 9, 13)]),
                                     (210, -150, 18, 16, 14, [(0, 0, 7, 11)]), (232, 205, 24, 18, 18, [(0, -3, 9, 13), (3, 0, 7, 10)]),
                                     (-236, -24, 16, 20, 15, [(1, 0, 8, 12)]), (150, -238, 20, 16, 16, [(0, 0, 8, 12)])]:
            tombs += K.outcrop_with_tombs(mb, ctx, x, y, w, d, h, fac)
            ctx.keepout.append((x, y, max(w, d) * 0.8 + 4))
        for i, t in enumerate(tombs):
            ctx.landmarks[f"tomb_{i}"] = (t.x, t.y)
            N[f"tomb_{i}"] = ("Tomb of Hegra", "مقبرة من مقابر الحجر")
        ctx.spawn("pickup", tombs[2].x, tombs[2].y, 0.0, id="betyl_oil")
        camps = {"robbers_east": (186, -112, [("raider", 0, 0), ("raider", 4, 3), ("slinger", -4, 5), ("hound", 2, -4),
                                              ("hound", -3, -3)]),
                 "robbers_north": (-136, 186, [("raider", 0, 0), ("skirmisher", 4, -2), ("slinger", -3, 4)])}
        for camp, (cx, cy, members) in camps.items():
            for (kind, ox, oy) in members:
                ctx.spawn("enemy", cx + ox, cy + oy, random.uniform(-3, 3), kind=kind, camp=camp)
            K.campfire(mb, ctx, cx, cy - 6)
            L.tent(cx + 8, cy - 4, random.uniform(-0.5, 0.5))
            ctx.col(cx + 8, cy - 4, L.height(cx + 8, cy - 4) + 1, 7, 4, 2, 0, "tent")
            ctx.keepout.append((cx, cy, 16))
        K.goods(mb, ctx, 186 + 9, -112 + 5, n=5)
        ctx.spawn("chest", 186 + 6, -112 + 7, 0.0, id="ithlib_robber_chest")
        ctx.spawn("chest", -96, 62, 0.0, id="ithlib_hoard", secret=True, buried=True)
        # ---- the brotherhood and their feast
        sits = dw["bench_sits"]
        ctx.spawn("feast_master", sits[len(sits) // 3].x, sits[len(sits) // 3].y, R(90), id="ithlib_feast_master",
                  z=round(dw["floor"] + 0.45, 3))
        for i, p in enumerate(sits[:6]):
            ctx.spawn("sitter", p.x, p.y, R(90), group="brotherhood", z=round(dw["floor"] + 0.45, 3))
        ctx.spawn("musician", sits[-1].x, sits[-1].y, R(180), id="ithlib_lyre", z=round(dw["floor"] + 0.45, 3))
        people(ctx, "wanderer", wander_pts(5, bx, by, 16, 16), group="brotherhood")
        ctx.spawn("quest_giver", nx_, ny_, face(nx_, ny_, bx + math.cos(R(80)) * BR, by + math.sin(R(80)) * BR),
                  id="ithlib_priest")
        # ---- arrival, bonfires, exit
        ctx.exits.append({"to": "hegra", "x": -284, "y": -284, "r": 6, "label": "Back to Hegra",
                          "label_ar": "العودة إلى الحجر"})
        ctx.spawn("player", -268, -268, face(-268, -268, 0, 0), **{"from": "hegra"})
        ctx.spawn("player", -268, -268, face(-268, -268, 0, 0))
        # south-east: the road to the fair of Ukaz
        ctx.exits.append({"to": "ukaz", "x": 284, "y": -284, "r": 6, "label": "South to the fair of Ukaz",
                          "label_ar": "جنوبا إلى سوق عكاظ"})
        ctx.spawn("player", 268, -268, face(268, -268, 0, 0), **{"from": "ukaz"})
        K.cairn(mb, ctx, 279, -276)
        ctx.keepout += [(270, -270, 16)]
        K.cairn(mb, ctx, -279, -276)
        ctx.spawn("bonfire", -256, -262, 0.0, id="ithlib_arrival")
        ctx.spawn("bonfire", bx - 6, by - 18, 0.0, id="ithlib_bowl")
        ctx.keepout += [(-270, -270, 16)]
        I.dress(mb, ctx, self, lambda x, y: self.inside(x, y) < -6, rocks=60, singles=120, shrubs=200, dry=90,
                acacias=26, dead=8, ruins=3, nbones=4)
        print("ITHLIB ledges", len(ledges), "niches", len(sills), "chockstone", round(chock_z, 2))


# ================================================================== Marib
class Marib(MapDef):
    name = "marib"
    title = "Marib: the Great Dam of Saba"
    title_ar = "مأرب: سد سبأ العظيم"
    bounds = (-500.0, 500.0, -400.0, 400.0)
    step = 4.0
    tile = 125.0
    instanced = True
    culture = "sabaean"
    batch = 2
    sun = (16.0, -110.0)                                 # golden hour over green fields
    fog = {"color": "#e6d2a8", "near": 140, "far": 820}
    breach = False
    DAM_X, DAM_H = -300.0, 15.0
    WATER = 11.5
    CITY, BARRAN, AWWAM = (220.0, 20.0), (120.0, 112.0), (330.0, -175.0)
    _hills = K.bands(["#9a8a72", "#b09c7e", "#c4b08e", "#d4c09a"], "MaribHill")

    @staticmethod
    def hw(x):
        if x < -360:
            return 170.0
        if x < -330:
            return 170.0 - (x + 360) / 30 * 20
        if x < -270:
            return 150.0
        return min(420.0, 150.0 + (x + 270) * 1.3)

    def canal_y(self, side, x):
        return side * (165 + 6 * math.sin(x * 0.012))

    def in_garden(self, x, y):
        return -240 < x < 340 and 178 < abs(y) < 338

    def height(self, x, y):
        hw = self.hw(x)
        mtn = 55 * L.smooth(hw, hw + 55, abs(y)) + 55 * L.smooth(-440, -485, x)
        mtn += 8 * noise.noise(Vector((x * 0.012, y * 0.012, 2.2))) * L.smooth(hw - 10, hw + 20, abs(y))
        base = 0.8 * noise.noise(Vector((x * 0.008, y * 0.008, 5.0)))
        if x < self.DAM_X - 6:
            base -= 3.0 * L.smooth(self.DAM_X - 6, self.DAM_X - 40, x) * (1 - L.smooth(hw - 30, hw, abs(y)))
        dx = abs(x - self.DAM_X)
        dam = self.DAM_H * max(0.0, min(1.0, (30 - dx) / 24)) * (1 - L.smooth(hw, hw + 12, abs(y)))
        if self.breach:
            dam *= L.smooth(14, 22, abs(y - 5))
        wy = 20 * math.sin(x * 0.008)
        ww, wd = (18, 1.2) if not self.breach else (44, 2.6)
        wadi = -wd * (1 - L.smooth(ww * 0.4, ww, abs(y - wy))) * L.smooth(self.DAM_X, self.DAM_X + 40, x)
        cr = math.hypot(x - self.CITY[0], y - self.CITY[1])
        tell = 8 * (1 - L.smooth(58, 92, cr))
        return mtn + base + dam + wadi + tell

    def color(self, c, nz):
        x, y, z = c.x, c.y, c.z
        if z > 8 or nz < 0.8:
            u = 0.5 + 0.5 * math.sin(z * 0.5 + noise.noise(c * 0.04) * 3)
            hexes = ["#9a8a72", "#b09c7e", "#c4b08e", "#d4c09a"]
            col = L.lin(hexes[min(3, int(u * 4))])
        elif x < self.DAM_X and abs(y) < self.hw(x):
            col = L.lin("#8a7a62" if self.breach else "#9c8a68")                     # reservoir bed
        elif self.in_garden(x, y) or abs(abs(y) - 165) < 8:
            col = L.lin("#a8946a" if self.breach else "#7a6a46")                     # irrigated soil
        else:
            f = noise.noise(Vector((x * 0.02, y * 0.02, 0.5))) * 0.5 + 0.5
            col = M.lerp3(L.lin("#cfac7a"), L.lin("#e0c294"), f)
        k = 1 + noise.noise(c * 0.9) * 0.05
        return tuple(min(1, v * k) for v in col)

    def build(self, mb, ctx):
        N = ctx.names
        br = self.breach
        hwd = self.hw(self.DAM_X)
        # ---- reservoir (a flat water plane; breach = a muddy puddle in the dish)
        lvl = self.WATER if not br else 0.6
        x0 = -500.0
        x1 = self.DAM_X - (8 if not br else 40)
        hwr = 175.0 if not br else 70.0
        if not br:
            mb.box(((x0 + x1) / 2, 0, lvl - 0.05), (x1 - x0, hwr * 2, 0.1), K.WATER)
        else:                                                                      # a few muddy pools in the dish
            for (px_, py_, rr) in [(-380, 10, 34), (-350, -26, 22), (-410, 40, 26), (-336, 30, 14)]:
                mb.cyl((px_, py_, lvl - 0.05), rr, rr, 0.1, K.WATER, segs=14)
        ctx.water = [{"level": lvl, "x": [x0, x1], "y": [-hwr, hwr]}]
        ctx.landmarks["reservoir"] = ((x0 + x1) / 2, 0)
        N["reservoir"] = ("The reservoir of Wadi Dhana", "بحيرة وادي ذنة")
        # ---- the dam crest: a walkable bank top (two pieces after the breach)
        crest = self.DAM_H + 0.05
        segs = [(-hwd + 2, hwd - 2)] if not br else [(-hwd + 2, -14), (24, hwd - 2)]
        for (ya, yb) in segs:
            S.pbox(mb, ctx, self.DAM_X, (ya + yb) / 2, crest + L.height(self.DAM_X, (ya + yb) / 2) * 0 + 0.0,
                   8.0, yb - ya, S.ASHLAR[1], 0.0, bottom=crest - 1.2, tag="wall")
            for yy in range(int(ya) + 4, int(yb) - 2, 9):                              # crest kerb stones
                mb.box((self.DAM_X - 3.6, yy, crest + 0.15), (0.6, 1.4, 0.3), S.ASHLAR[2])
        ctx.landmarks["dam"] = (self.DAM_X, 0)
        N["dam"] = ("The Great Dam", "السد العظيم")
        if br:
            ctx.landmarks["breach"] = (self.DAM_X, 5)
            N["breach"] = ("The breach", "الثلمة")
        # ---- sluice buildings at both ends: big tower, putlog-hole wing wall, small tower, spillway
        sluices = {}
        for side, key in ((1, "sluice_north"), (-1, "sluice_south")):
            tx, ty = self.DAM_X + 10, side * (hwd + 10)
            info = S.sluice_tower(mb, ctx, tx, ty, R(-90) if side > 0 else R(90), w=9, d=7, h=14)
            S.ashlar_wall(mb, ctx, tx + 6, ty, tx + 32, ty, 9.0, t=2.4, holes=True)
            S.pbox(mb, ctx, tx + 35, ty, L.height(tx + 35, ty) + 10.5, 6, 5, S.ASHLAR[2], 0, tag="tower")
            sluices[key] = (tx, ty, info)
            ctx.landmarks[key] = (tx, ty)
            ctx.spawn("sluice", tx + 18, ty - side * 4, 0.0, id=key)
            ctx.keepout.append((tx + 15, ty, 28))
        N["sluice_north"] = ("North sluice", "المصرف الشمالي")
        N["sluice_south"] = ("South sluice", "المصرف الجنوبي")
        top_n = sluices["sluice_north"][2]["top"]
        ctx.spawn("chest", sluices["sluice_north"][0], sluices["sluice_north"][1], 0.0, id="marib_sluice_chest",
                  z=round(top_n + 0.4, 3))
        # ---- canals, branch gates and the two gardens
        ctx.landmarks["north_garden"] = (50, 260)
        ctx.landmarks["south_garden"] = (50, -260)
        N["north_garden"] = ("The north garden", "الجنة الشمالية")
        N["south_garden"] = ("The south garden", "الجنة الجنوبية")
        for side in (1, -1):
            xs = list(range(int(self.DAM_X) + 40, 341, 20))
            main = [(x, self.canal_y(side, x)) for x in xs]
            S.canal(mb, main, w=3.2, water=not br)
            ctx.paths["canal_north" if side > 0 else "canal_south"] = main
            for gi, gx in enumerate((-160, 20, 200)):
                gy = self.canal_y(side, gx)
                S.sluice_gate(mb, ctx, gx, gy + side * 3.5, 0.0)
                gid = f"gate_{'n' if side > 0 else 's'}{gi + 1}"
                ctx.spawn("sluice", gx + 3, gy + side * 6, 0.0, id=gid)
                S.canal(mb, [(gx, gy + side * 5), (gx, side * 338)], w=2.0, water=not br)
            for x in range(-235, 340, 34):
                for row in range(6):
                    y = side * (182 + row * 26 + 11)
                    if abs(x - 20) < 6 or abs(x + 160) < 6 or abs(x - 200) < 6:
                        continue
                    mats = S.DEAD_FIELD if br else S.FIELD
                    I.field(ctx, x + 15, y, random.choice(mats))
            for k, x in enumerate(range(-250, 340, 22)):                                # palms along the main canal
                y = self.canal_y(side, x) + side * 5.0
                if br and k % 2:
                    I.dead_tree(ctx, x, y, 0.9)
                else:
                    I.palm(ctx, x, y, random.uniform(0.85, 1.05), lite=True)
            for k in range(5):                                                          # farmsteads
                fx, fy = -200 + k * 120, side * 350
                L.house(fx, fy, 0.0 if side > 0 else math.pi, 6, 5, 4)
                ctx.col(fx, fy, L.height(fx, fy) + 2.5, 6, 5, 6, 0, "building")
            ctx.keepout.append((50, side * 260, 200))
        # ---- Marib on its tell: tower wall, round bastions, stone-footed tower houses, palace, market
        cx, cy = self.CITY
        wall = [(cx + math.cos(k / 28 * math.tau) * 72, cy + math.sin(k / 28 * math.tau) * 56) for k in range(28)]
        S.tower_wall(mb, ctx, wall, h=6.5, t=2.6, tower_every=34.0, closed=True, gaps=(13, 27))
        for k in (3, 10, 17, 24):
            S.round_tower(mb, ctx, *wall[k], r=4.0, h=11.0)
        ctx.landmarks["city"] = (cx, cy)
        N["city"] = ("Marib", "مأرب")
        spots = []
        for _ in range(26):
            for _ in range(60):
                a, r = random.uniform(0, math.tau), math.sqrt(random.uniform(0.05, 1)) * 48
                x, y = cx + math.cos(a) * r * 1.2, cy + math.sin(a) * r * 0.9
                if abs(y - cy) < 6 or math.hypot(x - (cx + 30), y - (cy - 14)) < 16 or math.hypot(x - cx, y - (cy + 24)) < 16:
                    continue
                if all((Vector((x, y)) - s_).length > 8.5 for s_ in spots):
                    spots.append(Vector((x, y)))
                    break
        for s_ in spots:
            S.stone_footed_tower_house(mb, ctx, s_.x, s_.y, random.uniform(-0.15, 0.15), random.uniform(4.6, 6.0),
                                       random.uniform(4.6, 5.6), random.uniform(8, 14), stone_h=2.5)
        px, py = cx, cy + 24                                                           # palace of the mukarrib
        ptop = S.stepped_platform(mb, ctx, px, py, 0.0, 22, 16, tiers=2, tier_h=1.5)
        for (ox, oy) in ((-5, 2), (5, 2)):
            ob = L.tower_house(px + ox, py + oy, 0.0, 7.0, 6.0, 16.0)
            ob.location.z += ptop - L.height(px + ox, py + oy) + 0.3
            ctx.col(px + ox, py + oy, ptop + 8, 7, 6, 16.5, 0, "building")
        ctx.landmarks["palace"] = (px, py)
        N["palace"] = ("Palace of the mukarrib", "قصر المكرب")
        ctx.spawn("official", px, py - 9.5, 0.0, id="marib_mukarrib", title="mukarrib", z=round(ptop, 3))
        ctx.spawn("chest", px + 5, py + 2, 0.0, id="marib_archive", secret=True, z=round(ptop + 16.3, 3))
        for k in range(2):
            ctx.spawn("official", px - 4 + k * 8, py - 14, 0.0, id=f"himyar_envoy_{k + 1}", title="Himyarite envoy",
                      culture="himyarite")
        mx, my = cx + 30, cy - 14                                                      # market
        for k, (ox, oy, r) in enumerate([(-8, -6, 0.0), (0, -7, 0.0), (8, -6, 0.0), (-8, 6, math.pi), (8, 6, math.pi)]):
            L.stall(mx + ox, my + oy, r)
        ctx.spawn("shopkeeper", mx, my + 1.5, math.pi, id="marib_trader")
        ctx.landmarks["market"] = (mx, my)
        N["market"] = ("Market of Marib", "سوق مأرب")
        people(ctx, "wanderer", wander_pts(30, cx, cy, 50, 38, lambda x, y: all((Vector((x, y)) - s_).length > 4 for s_ in spots)))
        ctx.keepout.append((cx, cy, 95))
        # ---- Barran: stepped platform, five monoliths standing and one broken, a pillar-top route
        bx, by = self.BARRAN
        rot_b = math.pi / 2                                                            # stair faces east
        btop = S.stepped_platform(mb, ctx, bx, by, rot_b, 30, 22, tiers=3, tier_h=1.2)
        gb = L.height(bx, by)
        lc = K.Local(mb, bx, by, 0, rot_b)
        heights = [14.2, 12.0, 12.0, 12.0, 6.0, 12.0]
        pil = []
        for i, hgt in enumerate(heights):
            p = lc.world((-6.25 + i * 2.5, -5.0, 0))
            S.monolith(mb, ctx, p.x, p.y, gb + hgt, s=1.1, broken=hgt < 7)
            pil.append((p, gb + hgt))
        steps = [(5.0, -2.6, 4.8), (3.75, -2.6, 6.0), (3.75, -0.4, 7.2), (1.75, -1.2, 8.4), (0.0, -2.0, 9.6),
                 (-1.25, -3.2, 10.8)]
        for (lx, ly, t) in steps:
            p = lc.world((lx, ly, 0))
            S.pbox(mb, ctx, p.x, p.y, gb + t, 1.4, 1.4, S.ASHLAR[int(t) % 4], rot_b, bottom=btop - 0.2, tag="ruin")
        S.altar(mb, ctx, *lc.world((0, -16.5, 0)).xy, gb, rot_b)
        ctx.spawn("chest", pil[0][0].x, pil[0][0].y, rot_b, id="barran_secret", secret=True, z=round(pil[0][1], 3))
        pr = lc.world((0, -15.0, 0))
        ctx.spawn("quest_giver", pr.x, pr.y, rot_b, id="barran_priest")
        ctx.landmarks["barran"] = (bx, by)
        N["barran"] = ("Barran temple", "معبد بران")
        ctx.keepout.append((bx, by, 26))
        # ---- Awwam: the oval (9 m ashlar wall, walkable top), north gate, pillared hall, cemetery
        ax, ay = self.AWWAM
        n = 48
        pts = [(ax + math.cos(k / n * math.tau) * 46, ay + math.sin(k / n * math.tau) * 32) for k in range(n + 1)]
        for k, (a, b) in enumerate(zip(pts, pts[1:])):
            mid_ang = (k + 0.5) / n * math.tau
            if abs(mid_ang - math.pi / 2) < R(5):
                continue                                                               # the single gate
            S.ashlar_wall(mb, ctx, a[0], a[1], b[0], b[1], 9.0, t=3.0)
        gx_, gy_ = ax, ay + 32
        for sx in (-4.5, 4.5):
            S.pbox(mb, ctx, gx_ + sx, gy_, L.height(gx_, gy_) + 11.0, 4.5, 5.0, S.ASHLAR[3], 0, tag="tower")
        hall_y = gy_ + 13
        for i in range(8):                                                             # eight tall pillars
            S.monolith(mb, ctx, ax - 10.5 + i * 3.0, hall_y + 8.0, L.height(ax, hall_y) + 8.0, s=1.0)
        for i in range(5):
            for sx in (-13, 13):
                S.monolith(mb, ctx, ax + sx, hall_y - 7 + i * 3.4, L.height(ax, hall_y) + 4.2, s=0.8)
        S.ashlar_wall(mb, ctx, ax - 14, hall_y - 9, ax + 14, hall_y - 9, 1.2, t=0.8)
        S.altar(mb, ctx, ax, ay - 8, L.height(ax, ay - 8), 0.0)
        S.cemetery(mb, ctx, ax + 74, ay - 4, 0.0, rows=6, cols=9)
        ctx.landmarks.update({"awwam": (ax, ay), "awwam_hall": (ax, hall_y), "awwam_altar": (ax, ay - 8),
                              "cemetery": (ax + 74, ay - 4)})
        N["awwam"] = ("Awwam temple", "معبد أوام")
        N["awwam_hall"] = ("The pillared hall", "البهو المعمد")
        N["awwam_altar"] = ("Altar of Almaqah", "مذبح المقه")
        N["cemetery"] = ("Cemetery of Awwam", "مقبرة أوام")
        ctx.spawn("quest_giver", ax, gy_ + 4, math.pi, id="awwam_priest")
        ctx.spawn("pickup", ax + 1.5, ay - 6, 0.0, id="awwam_offering_place")
        ctx.keepout += [(ax, ay, 56), (ax, hall_y, 20), (ax + 74, ay - 4, 22)]
        # ---- people of the dam and the fields
        tn, sn = sluices["sluice_north"], sluices["sluice_south"]
        if not br:
            ctx.spawn("official", tn[0] + 20, tn[1] - 8, 0.0, id="marib_warden_north", title="canal warden")
            ctx.spawn("official", sn[0] + 20, sn[1] + 8, math.pi, id="marib_warden_south", title="canal warden")
            ctx.spawn("pickup", tn[0], tn[1] - 12, 0.0, id="warden_rota")
            for side in (1, -1):
                people(ctx, "farmer", wander_pts(12, 50, side * 258, 270, 70))
        else:
            rc = Vector((100.0, -40.0))                                                 # refugee camp
            for k in range(6):
                a = k / 6 * math.tau
                tx_, ty_ = rc.x + math.cos(a) * 14, rc.y + math.sin(a) * 11
                L.tent(tx_, ty_, face(tx_, ty_, rc.x, rc.y))
                ctx.col(tx_, ty_, L.height(tx_, ty_) + 1, 7, 4, 2, face(tx_, ty_, rc.x, rc.y), "tent")
            K.campfire(mb, ctx, rc.x, rc.y)
            people(ctx, "refugee", wander_pts(12, rc.x, rc.y, 22, 18))
            ctx.landmarks["refugee_camp"] = tuple(rc)
            N["refugee_camp"] = ("Camp of the scattered tribes", "مخيم القبائل المتفرقة")
            ctx.keepout.append((rc.x, rc.y, 26))
        # caravan master and camels at the east gate
        eg = wall[0]
        ctx.spawn("caravaneer", eg[0] + 10, eg[1], R(-90), id="marib_caravan_master")
        for k in range(6):
            ctx.spawn("camel", eg[0] + 16 + (k % 3) * 3.4, eg[1] - 6 + (k // 3) * 4, R(-90), sitting=k % 2 == 0)
        for (x, y, r) in [(eg[0] + 14, eg[1] + 10, 0.3), (eg[0] + 17, eg[1] + 11, 0.6)]:
            ctx.spawn("horse", x, y, r)
        # ---- enemies: Himyarite raiders in the south-west hills, jackals, rats at the dam, hyenas at night
        hc = Vector((-150.0, -296.0))
        for k in range(3):
            L.tent(hc.x + (k - 1) * 9, hc.y - 6, 0.0)
            ctx.col(hc.x + (k - 1) * 9, hc.y - 6, L.height(hc.x, hc.y) + 1, 7, 4, 2, 0, "tent")
        K.campfire(mb, ctx, hc.x, hc.y + 4)
        K.banner(mb, hc.x + 14, hc.y, K.CLOTH[1])
        for (kind, ox, oy) in [("raider", 0, 8), ("raider", 5, 10), ("raider", -6, 9), ("skirmisher", 9, 4),
                               ("archer", -10, 2), ("clubman", 2, 14)]:
            ctx.spawn("enemy", hc.x + ox, hc.y + oy, random.uniform(-3, 3), kind=kind, camp="himyar", variant="himyar")
        ctx.landmarks["himyar_camp"] = tuple(hc)
        N["himyar_camp"] = ("Himyarite camp", "معسكر حمير")
        ctx.keepout.append((hc.x, hc.y, 26))
        for (x, y) in [(40, -370), (46, -366), (-60, 368), (-54, 372)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="hound", variant="jackal", camp="jackals")
        for (x, y) in [(-276, 60), (-272, -40), (-268, 10), (-262, 90)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="rat", camp="dam_rats", night_only=True)
        for (x, y) in [(ax + 70, ay - 22), (ax + 80, ay + 16), (ax + 62, ay + 12)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="hound", variant="hyena", camp="cemetery",
                      night_only=True)
        if br:
            for (x, y) in [(60, 230), (90, 250), (-40, -240), (-10, -262)]:
                ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="raider", camp="looters", variant="himyar")
        # ---- bonfires, arrival, exit to the caravanserai
        ctx.exits.append({"to": "caravanserai", "x": 486, "y": 386, "r": 7, "label": "North to the caravanserai",
                          "label_ar": "شمالا إلى الخان"})
        ctx.spawn("player", 468, 368, face(468, 368, 0, 0), **{"from": "caravanserai"})
        ctx.spawn("player", 468, 368, face(468, 368, 0, 0))
        # north: the road to the fair of Ukaz
        ctx.exits.append({"to": "ukaz", "x": 0, "y": 388, "r": 7, "label": "North to the fair of Ukaz",
                          "label_ar": "شمالا إلى سوق عكاظ"})
        ctx.spawn("player", 0, 372, face(0, 372, 0, 0), **{"from": "ukaz"})
        K.cairn(mb, ctx, 6, 382)
        ctx.keepout += [(0, 372, 18)]
        K.cairn(mb, ctx, 480, 380)
        for (x, y, bid) in [(452, 352, "marib_arrival"), (136, 8, "marib_city_gate"), (-250, 40, "marib_dam_foot"),
                            (ax, ay + 52, "marib_awwam")]:
            ctx.spawn("bonfire", x, y, 0.0, id=bid)
        ctx.keepout += [(468, 368, 20)]
        I.dress(mb, ctx, self, lambda x, y: not self.in_garden(x, y) and abs(abs(y) - 165) > 14 and
                x > self.DAM_X + 30 and self.height(x, y) < 6, rocks=50, singles=110,
                shrubs=160 if not br else 60, dry=80 if not br else 160, acacias=40 if not br else 14,
                dead=6 if not br else 30, ruins=3, nbones=4 if not br else 12, palette=self._hills, pal_name="maribhill")
        print("MARIB", "breach" if br else "whole", "plots", "spots", len(spots))


class MaribBreach(Marib):
    name = "marib_breach"
    title = "Marib after the flood of al-'Arim"
    title_ar = "مأرب بعد سيل العرم"
    variant_of = "marib"
    breach = True
    sun = (10.0, -110.0)
    fog = {"color": "#b8ad98", "near": 80, "far": 560}


# ================================================================== Ukaz fair
class Ukaz(MapDef):
    """Suq 'Ukaz: the poets' fair on a gravel plain ringed by granite hills (holy-month truce)."""
    name = "ukaz"
    title = "The fair of Ukaz"
    title_ar = "سوق عكاظ"
    bounds = (-400.0, 400.0, -400.0, 400.0)
    step = 4.0
    tile = 125.0
    instanced = True
    culture = "hijazi"
    batch = 2
    sun = (18.0, -115.0)                                 # golden afternoon
    fog = {"color": "#e7cfa4", "near": 140, "far": 760}
    FAIR = (-110.0, 60.0)
    NABIGHA = (-110.0, 150.0)
    RACE_C, RACE_A, RACE_B = (190.0, -20.0), 115.0, 75.0
    TRUCE = (-60.0, 20.0, 260.0)
    TORS = [(-300, 230, 9), (300, 250, 7), (-300, -280, 8), (330, -120, 6), (90, 300, 6)]
    GRANITE = ["#9c8a80", "#b49a8c", "#c4ab9c", "#8a7a72"]
    TRIBES = [  # key, english, arabic, banner colour, camp centre
        ("thaqif", "Thaqif", "ثقيف", "#3d6b4f", (-265, 120)),
        ("hawazin", "Hawazin", "هوازن", "#2e3f7a", (-280, 10)),
        ("kinana", "Kinana", "كنانة", "#d39a2c", (-230, -115)),
        ("tamim", "Tamim", "تميم", "#8b1e1e", (-30, -135)),
        ("dhubyan", "Dhubyan", "ذبيان", "#1e1a18", (10, 150)),
        ("taghlib", "Taghlib", "تغلب", "#5b2e5e", (30, 70)),
    ]
    _granite = K.bands(GRANITE, "Granite")

    def race_ell(self, x, y):
        return math.hypot((x - self.RACE_C[0]) / self.RACE_A, (y - self.RACE_C[1]) / self.RACE_B)

    def height(self, x, y):
        r = math.hypot(x, y)
        pass_ = 1.0 - (1 - L.smooth(14, 44, abs(x))) * L.smooth(250, 300, abs(y))       # passes north and south
        hills = (26 * L.smooth(330, 395, r) + 7 * noise.noise(Vector((x * 0.015, y * 0.015, 9.0))) * L.smooth(300, 360, r))
        hills *= pass_
        tors = sum(h * (1 - L.smooth(10, 32, math.hypot(x - tx, y - ty))) for tx, ty, h in self.TORS)
        nab = 9 * (1 - L.smooth(16, 40, math.hypot(x - self.NABIGHA[0], y - self.NABIGHA[1])))
        base = 0.5 * noise.noise(Vector((x * 0.01, y * 0.01, 4.0))) + 0.25 * noise.noise(Vector((x * 0.05, y * 0.05, 2.0)))
        return base + hills + tors + nab

    def color(self, c, nz):
        if c.z > 6 or nz < 0.82:
            u = 0.5 + 0.5 * math.sin(c.z * 0.45 + noise.noise(c * 0.05) * 3)
            col = L.lin(self.GRANITE[min(3, int(u * 4))])
        elif abs(self.race_ell(c.x, c.y) - 1.0) < 0.075:
            col = L.lin("#a8916e")                                                      # trampled race course
        else:
            f = noise.noise(Vector((c.x * 0.02, c.y * 0.02, 0.5))) * 0.5 + 0.5
            col = M.lerp3(L.lin("#b8a48a"), L.lin("#d2bea0"), f)
        k = 1 + noise.noise(c * 0.9) * 0.05
        return tuple(min(1, v * k) for v in col)

    def build(self, mb, ctx):
        N = ctx.names
        fx, fy = self.FAIR
        ctx.truce = self.TRUCE
        ctx.landmarks["fair"] = (fx, fy)
        N["fair"] = ("The fair grounds of Ukaz", "ساحة سوق عكاظ")
        # ---- al-Nabigha's red leather tent on its hill, and the poets' ground below it
        nx_, ny_ = self.NABIGHA
        red = L.mat("RedLeather", "#8b2a1e", 0.7)
        K.big_tent(mb, ctx, nx_, ny_, face(nx_, ny_, fx, fy), 1.5, m=L.mat("RedLeatherDark", "#6e1f16", 0.7), body=red)
        ctx.landmarks["nabigha_tent"] = (nx_, ny_)
        N["nabigha_tent"] = ("The red tent of al-Nabigha", "قبة النابغة الحمراء")
        nz_ = L.height(nx_, ny_ - 8)
        ctx.spawn("poet", nx_, ny_ - 7.5, face(nx_, ny_ - 7.5, fx, fy), id="ukaz_nabigha", title="judge of poets",
                  name="al-Nabigha al-Dhubyani", name_ar="النابغة الذبياني", tribe="dhubyan")
        sx_, sy_ = fx, fy + 52                                                         # the recitation stage
        S.pbox(mb, ctx, sx_, sy_, L.height(sx_, sy_) + 0.6, 14, 6, K.STONE, 0.0, tag="stage")
        for k in range(2):
            K.banner(mb, sx_ + (k * 2 - 1) * 8, sy_ + 1, red)
        ctx.landmarks["poets_ground"] = (sx_, sy_ - 8)
        N["poets_ground"] = ("The poets' ground", "مجلس الشعراء")
        poets = [("al-A'sha", "الأعشى", "bakr"), ("Zuhayr ibn Abi Sulma", "زهير بن أبي سلمى", "muzayna"),
                 ("Amr ibn Kulthum", "عمرو بن كلثوم", "taghlib"), ("Tarafa ibn al-Abd", "طرفة بن العبد", "bakr"),
                 ("Imru' al-Qais", "امرؤ القيس", "kinda"), ("al-Harith ibn Hilliza", "الحارث بن حلزة", "bakr")]
        for i, (en, ar, tribe) in enumerate(poets):
            px = sx_ - 5 + i * 2.0
            ctx.spawn("poet", px, sy_ + (0.4 if i in (2, 3) else -1.6), math.pi if i in (2, 3) else 0.0,
                      id=f"ukaz_poet_{i + 1}", name=en, name_ar=ar, tribe=tribe,
                      **({"z": round(L.height(sx_, sy_) + 0.6, 3)} if i in (2, 3) else {}))
        for k in range(18):                                                            # listeners in a half ring
            a = math.pi * (0.12 + 0.76 * k / 17)
            lx, ly = sx_ + math.cos(a) * 14, sy_ - 4 - math.sin(a) * 9
            ctx.spawn("sitter", lx, ly, face(lx, ly, sx_, sy_), group="audience")
        ctx.keepout += [(nx_, ny_, 26), (sx_, sy_ - 6, 22)]
        # ---- the market street: two facing rows of stalls, the best shop in the game
        stalls = []
        for i in range(10):
            x = -200 + i * 20
            stalls.append(L.stall(x, -34, math.pi, awning=i % 6))
            stalls.append(L.stall(x + 10, -48, 0.0, awning=(i + 3) % 6))
        for st in stalls:
            r = st.rotation_euler.z
            ctx.spawn("merchant", st.location.x - math.sin(r) * 1.3, st.location.y + math.cos(r) * 1.3, r)
        ctx.spawn("shopkeeper", -100, -41, 0.0, id="ukaz_trader")
        ctx.landmarks["market"] = (-100, -41)
        N["market"] = ("The market street", "سوق التجار")
        ctx.keepout.append((-100, -41, 110))
        kx, ky = -214, -26                                                             # the kahin's tent
        I.tent(ctx, kx - 6, ky + 6, 0.3)
        ctx.spawn("kahin", kx, ky, R(200), id="ukaz_kahin")
        # ---- tribal camps: a chief's tent in the tribe's colour, goat-hair tents, banners, an elder, camels
        for key, en, ar, hexc, (cx, cy) in self.TRIBES:
            tm = L.mat(f"Tribe_{key}", hexc, 0.85)
            rot = face(cx, cy, fx, fy)
            K.big_tent(mb, ctx, cx, cy, rot, 1.3, m=tm)
            for j in range(6):
                a = rot + math.pi / 2 + (j - 2.5) * 0.6 + math.pi
                tx, ty = cx + math.cos(a) * 27, cy + math.sin(a) * 27
                I.tent(ctx, tx, ty, face(tx, ty, cx, cy) + random.uniform(-0.3, 0.3))
            for sgn in (-1, 1):
                K.banner(mb, cx + math.cos(rot) * sgn * 7, cy + math.sin(rot) * sgn * 7, tm, h=6.0)
            fx2, fy2 = cx + math.sin(rot) * 9, cy - math.cos(rot) * 9
            K.campfire(mb, ctx, fx2, fy2)
            ex_, ey_ = cx + math.sin(rot) * 5.5, cy - math.cos(rot) * 5.5
            ctx.spawn("elder", ex_, ey_, rot, id=f"ukaz_elder_{key}", tribe=key, name_ar=ar)
            people(ctx, "wanderer", wander_pts(3, fx2, fy2, 10, 10), tribe=key)
            for j in range(2):
                ctx.spawn("camel", cx + math.cos(rot + 2.2 + j) * 26, cy + math.sin(rot + 2.2 + j) * 26,
                          random.uniform(-3, 3), sitting=True)
            ctx.landmarks[f"camp_{key}"] = (cx, cy)
            N[f"camp_{key}"] = (f"Camp of {en}", f"مضارب {ar}")
            ctx.keepout.append((cx, cy, 34))
        people(ctx, "wanderer", wander_pts(30, fx, fy - 30, 120, 90))
        # wells with palm groves, and pilgrims' tents scattered across the fair
        for k, (wx, wy) in enumerate([(-40.0, 10.0), (-190.0, 70.0)]):
            K.well(mb, ctx, wx, wy)
            for j in range(9):
                a = j / 9 * math.tau + random.uniform(-0.2, 0.2)
                I.palm(ctx, wx + math.cos(a) * random.uniform(7, 12), wy + math.sin(a) * random.uniform(7, 12),
                       random.uniform(0.85, 1.1), lite=True)
            ctx.landmarks[f"well_{k + 1}"] = (wx, wy)
            N[f"well_{k + 1}"] = ("Well of the fair", "بئر السوق")
            ctx.keepout.append((wx, wy, 15))
        placed = 0
        for _ in range(600):
            if placed >= 44:
                break
            a, r = random.uniform(0, math.tau), random.uniform(60, 215)
            x, y = fx + math.cos(a) * r, fy + math.sin(a) * r * 0.9
            if ctx.free(x, y, 6) and abs(self.race_ell(x, y) - 1) > 0.25 and math.hypot(x, y) < 300:
                I.tent(ctx, x, y, random.uniform(0, math.tau))
                ctx.keepout.append((x, y, 6))
                placed += 1
        # ---- the race course: a cairn-marked oval (~600 m), brushwood hurdles, start and checkpoints
        rcx, rcy = self.RACE_C
        A, B = self.RACE_A, self.RACE_B
        n = 26
        race = []
        for k in range(n):
            t = k / n * math.tau
            race.append((rcx + math.cos(t) * A, rcy + math.sin(t) * B))
            for off in (-9.0, 9.0):
                K.cairn(mb, ctx, rcx + math.cos(t) * (A + off), rcy + math.sin(t) * (B + off * B / A),
                        L.mat("RaceFlag", "#efe2c4", 0.9))
        race.append(race[0])
        ctx.paths["race"] = race
        for t in (0.55, 1.9, 3.5, 5.0):                                                # hurdles across the course
            px, py = rcx + math.cos(t) * A, rcy + math.sin(t) * B
            tx, ty = -A * math.sin(t), B * math.cos(t)
            rot = math.atan2(ty, tx) + math.pi / 2
            S.pbox(mb, ctx, px, py, L.height(px, py) + 0.85, 16.0, 0.7, K.DRY, rot, tag="hurdle")
        st_t = -math.pi / 2
        sx2, sy2 = rcx + math.cos(st_t) * A, rcy + math.sin(st_t) * B
        ctx.spawn("race_start", sx2, sy2, R(90), id="ukaz_race_start")
        for k in range(8):
            t = st_t + (k + 1) / 8 * math.tau
            ctx.spawn("race_checkpoint", rcx + math.cos(t) * A, rcy + math.sin(t) * B, 0.0, id=f"ukaz_race_cp_{k + 1}")
        for k in range(3):
            ctx.spawn("racer", sx2 - 6 - k * 3.5, sy2 + 5, R(90), id=f"ukaz_racer_{k + 1}")
            ctx.spawn("horse", sx2 - 6 - k * 3.5, sy2 + 8, R(90), racer=f"ukaz_racer_{k + 1}")
        ctx.landmarks["race_course"] = (rcx, rcy)
        N["race_course"] = ("The race course", "مضمار السباق")
        ctx.keepout += [(x, y, 13) for x, y in race]
        # ---- the ransom ground: a pen, prisoners from the raider fort, the broker
        rx, ry = -200.0, -220.0
        for (a, b) in [((rx - 6, ry - 4), (rx + 6, ry - 4)), ((rx + 6, ry - 4), (rx + 6, ry + 4)),
                       ((rx - 6, ry + 4), (rx - 6, ry - 4))]:
            K.palisade(mb, ctx, a[0], a[1], b[0], b[1], h=1.6)
        ctx.spawn("prisoner", rx, ry, 0.0, id="ukaz_ransom_prisoner")
        for k in range(2):
            ctx.spawn("prisoner", rx - 2 + k * 4, ry + 1.5, 0.0)
        ctx.spawn("official", rx, ry - 9, math.pi, id="ukaz_ransom_broker", title="ransom broker", culture="bedouin")
        ctx.landmarks["ransom_ground"] = (rx, ry)
        N["ransom_ground"] = ("The ransom ground", "ساحة الفداء")
        ctx.keepout.append((rx, ry, 16))
        # ---- the duelling ground outside the truce: a ring of stones, the champion of Ukaz
        dx, dy = 150.0, -250.0
        for k in range(14):
            a = k / 14 * math.tau
            K.rock(mb, ctx, dx + math.cos(a) * 14, dy + math.sin(a) * 14, 0.8, self._granite, collide=False)
        ctx.spawn("enemy", dx, dy + 4, math.pi, kind="champion", boss=True, id="ukaz_champion", camp="duel",
                  title="champion of Ukaz")
        ctx.landmarks["duel_ground"] = (dx, dy)
        N["duel_ground"] = ("The duelling ground", "ساحة المبارزة")
        ctx.keepout.append((dx, dy, 20))
        # ---- the lost ode: a palm-leaf rib on top of a granite tor (a boulder climb)
        tx_, ty_ = -300.0, 230.0
        g0 = L.height(tx_, ty_)
        steps = [(8, -6, 1.2), (5, -8, 2.4), (2, -6.5, 3.6), (0, -3.5, 4.8), (-1.5, -0.5, 6.0), (0, 2, 7.2)]
        for (ox, oy, t) in steps:
            px, py = tx_ + ox, ty_ + oy
            S.pbox(mb, ctx, px, py, g0 + t, 2.6, 2.4, self._granite[int(t) % 4], random.uniform(0, 1),
                   bottom=g0 - 1.0, tag="rock")
        ctx.spawn("pickup", tx_, ty_ + 2, 0.0, id="lost_ode", z=round(g0 + 7.2, 3))
        ctx.landmarks["lost_ode_tor"] = (tx_, ty_)
        N["lost_ode_tor"] = ("Tor of the lost ode", "صخرة القصيدة الضائعة")
        ctx.keepout.append((tx_, ty_, 14))
        # ---- outside the truce: night hyenas, jackals, hill bandits
        for (x, y) in [(260, 230), (268, 222), (252, 238), (-250, -300)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="hound", variant="hyena", camp="hills", night_only=True)
        for (x, y) in [(330, 40), (336, 46), (-340, 110), (-334, 118)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="hound", variant="jackal", camp="jackals")
        for (kind, x, y) in [("raider", 290, -180), ("skirmisher", 296, -172), ("archer", 284, -168)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind=kind, camp="hill_bandits")
        # ---- horses, more camels, bonfires, exits
        for k in range(5):
            ctx.spawn("horse", -60 + k * 4, 10, R(30))
        for k in range(6):
            ctx.spawn("camel", -150 + k * 5, -70, R(90), sitting=k % 2 == 0)
        for (x, y, bid) in [(-14, 352, "ukaz_north"), (14, -352, "ukaz_south"), (fx + 10, fy - 16, "ukaz_fair"),
                            (dx - 24, dy + 22, "ukaz_duel")]:
            ctx.spawn("bonfire", x, y, 0.0, id=bid)
        ctx.exits.append({"to": "jabal_ithlib", "x": 0, "y": 392, "r": 7, "label": "North to Jabal Ithlib",
                          "label_ar": "شمالا إلى جبل إثلب"})
        ctx.exits.append({"to": "marib", "x": 0, "y": -392, "r": 7, "label": "South to Marib",
                          "label_ar": "جنوبا إلى مأرب"})
        ctx.spawn("player", 0, 362, face(0, 362, fx, fy), **{"from": "jabal_ithlib"})
        ctx.spawn("player", 0, -362, face(0, -362, fx, fy), **{"from": "marib"})
        ctx.spawn("player", 0, -362, face(0, -362, fx, fy))
        K.cairn(mb, ctx, 6, 384)
        K.cairn(mb, ctx, 6, -384)
        ctx.keepout += [(0, 362, 20), (0, -362, 20)]
        I.dress(mb, ctx, self, lambda x, y: True, rocks=70, singles=140, shrubs=180, dry=110, acacias=34, dead=6,
                ruins=1, nbones=4, palette=self._granite, pal_name="granite")
        print("UKAZ stalls", len(stalls), "race cairns", n * 2)


for _m in (JabalIthlib(), Marib(), MaribBreach(), Ukaz()):
    M.MAPS[_m.name] = _m
