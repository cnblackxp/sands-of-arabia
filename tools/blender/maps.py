"""
Extra maps, written with the same schema as the main oasis level.

Each map is a MapDef with its own height function, ground palette and build();
export_map() writes, under assets/level/<name>/:
    terrain.glb   vertex-coloured, no normals (GLTFLoader flat-shades it)
    town.glb      everything static, joined into one mesh
    backdrop_ground.glb   coarse ground ring round the playable area
    heights.bin   float32 heightfield
    level.json    colliders, spawns, lights, paths, landmarks, exits, sun, fog, bounds
assets/level/maps.json indexes every map, the oasis included.
"""
import json, math, os, random, struct
import bpy, bmesh
from mathutils import Vector, noise

import arabia_lib as L
import kit as K

R = math.radians


def lerp3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def ground_color(lo, mid, hi, steep=None, steep_bands=None, speckle=0.06):
    """Palette colour fn(world_pos, normal_z): noise-blended sand, rock strata on steep faces."""
    lo, mid, hi = L.lin(lo), L.lin(mid), L.lin(hi)
    steep = L.lin(steep) if steep else None
    bands = [L.lin(h) for h in steep_bands] if steep_bands else None

    def fn(c, nz):
        f = noise.noise(Vector((c.x * 0.02, c.y * 0.02, 0.5))) * 0.5 + 0.5
        col = lerp3(lo, mid, min(1, f * 2)) if f < 0.5 else lerp3(mid, hi, (f - 0.5) * 2)
        s = 1 - L.smooth(0.55, 0.9, nz)
        if s > 0 and (bands or steep):
            if bands:
                t = 0.5 + 0.5 * math.sin(c.z * 0.55 + noise.noise(c * 0.03) * 3)
                rc = bands[min(len(bands) - 1, int(t * len(bands)))]
            else:
                rc = steep
            col = lerp3(col, rc, s)
        k = 1 + noise.noise(c * 0.9) * speckle
        return tuple(min(1, x * k) for x in col)
    return fn


def rock_top(base, bands_hex, z0, z1):
    """Wrap a colour fn so ground above z0..z1 turns into banded rock (plateaus, mesas)."""
    bands = [L.lin(h) for h in bands_hex]

    def fn(c, nz):
        col = base(c, nz)
        t = L.smooth(z0, z1, c.z)
        if t <= 0:
            return col
        u = 0.5 + 0.5 * math.sin(c.z * 0.9 + noise.noise(c * 0.05) * 3)
        rc = bands[min(len(bands) - 1, int(u * len(bands)))]
        k = 1 + noise.noise(c * 0.7) * 0.08
        return tuple(min(1, x * k) for x in lerp3(col, rc, t * 0.85))
    return fn


# Arabic titles for the maps that predate the bilingual schema (classical Arabic, no harakat)
AR_TITLES = {
    "oasis": "بلدة الواحة",
    "hegra": "الحجر: مدينة المقابر المنحوتة",
    "caravanserai": "خان على طريق البخور",
    "wadi": "وادي بساتين النخيل",
    "raider_fort": "معقل الغزاة",
    "rooftops": "سطوح قرية الفاو",
    "cliffs": "جروف القناطر",
    "ruined_temple": "أطلال المعبد السبئي",
}


class MapDef:
    name = "map"
    title = "Map"
    title_ar = ""
    chunk = None                              # metres: export the town mesh as culling tiles (big maps)
    tile = None                               # metres: tile terrain + town into Terrain_i_j / Town_i_j nodes
    instanced = False                         # repeated props exported as EXT_mesh_gpu_instancing (inst.py)
    culture = None                            # hijazi | nabataean | sabaean | ... (see game spec)
    batch = None                              # maps.json "batch" (2 = the new lands)
    variant_of = None                         # another map's name if this is an alternate state of it
    bounds = (-120.0, 120.0, -120.0, 120.0)   # blender x0, x1, y0, y1
    step = 2.0
    sun = (8.0, -37.0)                        # elevation, sky azimuth (deg)
    fog = {"color": "#e8c49a", "near": 60, "far": 420}
    color = staticmethod(ground_color("#c8955c", "#d8ac74", "#e6c28e", "#bf8a58"))

    def height(self, x, y):
        return 0.0

    def build(self, mb, ctx):
        pass


# ------------------------------------------------------------------ helpers
def scatter(ctx, m, n, fn, ok=lambda x, y: True, margin=8.0, r=2.0, tries=40):
    x0, x1, y0, y1 = m.bounds
    placed = 0
    for _ in range(n):
        for _ in range(tries):
            x, y = random.uniform(x0 + margin, x1 - margin), random.uniform(y0 + margin, y1 - margin)
            if ok(x, y) and ctx.free(x, y, r):
                fn(x, y)
                placed += 1
                break
    return placed


def dress(mb, ctx, m, ok, rocks=40, singles=60, shrubs=120, dry=50, acacias=12, dead=5, ruins=2, bones=3,
          palette=K.ROCK):
    scatter(ctx, m, rocks, lambda x, y: K.rock_cluster(mb, ctx, x, y, random.uniform(0.7, 1.6), palette), ok, r=4)
    scatter(ctx, m, singles, lambda x, y: K.rock(mb, ctx, x, y, random.uniform(0.4, 1.4), palette), ok, r=1.5)
    scatter(ctx, m, shrubs, lambda x, y: K.shrub(mb, x, y, random.uniform(0.7, 1.4)), ok, r=0.5)
    scatter(ctx, m, dry, lambda x, y: K.dry_bush(mb, x, y, random.uniform(0.7, 1.3)), ok, r=0.5)
    scatter(ctx, m, acacias, lambda x, y: K.acacia(mb, ctx, x, y, random.uniform(0.8, 1.25)), ok, r=4)
    scatter(ctx, m, dead, lambda x, y: K.dead_tree(mb, ctx, x, y, random.uniform(0.8, 1.2)), ok, r=2)
    scatter(ctx, m, ruins, lambda x, y: K.ruin_site(mb, ctx, x, y, random.uniform(0.8, 1.2)), ok, r=12)
    scatter(ctx, m, bones, lambda x, y: K.bones(mb, x, y), ok, r=2)


def new_objects(before):
    return [o for o in bpy.data.objects if o not in before]


# ------------------------------------------------------------------ export
def to3(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def export_ground(ex, m, rel_dir):
    """Terrain mesh + heightfield for a map (also used for the oasis via ex)."""
    x0, x1, y0, y1 = m.bounds
    st = m.step
    nx, ny = int(round((x1 - x0) / st)), int(round((y1 - y0) / st))
    bm = bmesh.new()
    vs = [[bm.verts.new((x0 + i * st, y0 + j * st, m.height(x0 + i * st, y0 + j * st))) for i in range(nx + 1)]
          for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            a, b, c, d = vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]
            if (i + j) % 2:
                bm.faces.new((a, b, c)); bm.faces.new((a, c, d))
            else:
                bm.faces.new((a, b, d)); bm.faces.new((b, c, d))
    me = bpy.data.meshes.new("Terrain")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Terrain", me)
    L.C_LAND.objects.link(ob)
    ex.bake_point_colors(ob, m.color)
    if m.tile:
        parts = split_chunks(ob, m.tile, "Terrain")
        ex.export(parts, f"{rel_dir}/terrain.glb", "terrain", vcol=True, normals=False,
                  extra={"tiles": len(parts), "tile_size": m.tile})
        for o in parts:
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        ex.export([ob], f"{rel_dir}/terrain.glb", "terrain", vcol=True, normals=False)
        bpy.data.objects.remove(ob, do_unlink=True)
    path = os.path.join(ex.ASSETS, rel_dir, "heights.bin")
    with open(path, "wb") as f:
        for j in range(ny + 1):
            by = y1 - j * st
            f.write(struct.pack(f"<{nx + 1}f", *[m.height(x0 + i * st, by) for i in range(nx + 1)]))
    return {"file": f"{rel_dir}/heights.bin", "format": "float32 little-endian, row-major",
            "cols": nx + 1, "rows": ny + 1, "step": st, "x0": x0, "z0": -y1,
            "index": "h = data[row * cols + col]; x = x0 + col*step; z = z0 + row*step"}


def export_far_ground(ex, m, rel_dir, extent=700.0, step=20.0, drop=0.5):
    x0, x1, y0, y1 = m.bounds
    gx0 = x0 - math.ceil((extent) / step) * step
    gy0 = y0 - math.ceil((extent) / step) * step
    N = int((x1 - x0 + 2 * extent) / step) + 2
    M = int((y1 - y0 + 2 * extent) / step) + 2
    bm = bmesh.new()
    vv = {}
    for j in range(M + 1):
        for i in range(N + 1):
            x, y = gx0 + i * step, gy0 + j * step
            inside = x0 + 1 < x < x1 - 1 and y0 + 1 < y < y1 - 1
            edge_h = m.height(min(max(x, x0), x1), min(max(y, y0), y1))
            vv[i, j] = bm.verts.new((x, y, (m.height(x, y) if inside else edge_h) - drop))
    for j in range(M):
        for i in range(N):
            x, y = gx0 + i * step, gy0 + j * step
            if x0 <= x and x + step <= x1 and y0 <= y and y + step <= y1:
                continue
            bm.faces.new((vv[i, j], vv[i + 1, j], vv[i + 1, j + 1], vv[i, j + 1]))
    me = bpy.data.meshes.new("FarGround")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("FarGround", me)
    L.C_LAND.objects.link(ob)
    ex.bake_point_colors(ob, m.color)
    ex.export([ob], f"{rel_dir}/backdrop_ground.glb", "backdrop", vcol=True, normals=False)
    bpy.data.objects.remove(ob, do_unlink=True)


def split_chunks(ob, size, prefix="Chunk"):
    """Split a joined mesh into square tiles (by face centre) so a big map can be frustum-culled per tile."""
    import bmesh as _bm
    from collections import defaultdict
    me = ob.data
    tiles = defaultdict(list)
    for p in me.polygons:
        c = ob.matrix_world @ p.center
        tiles[(math.floor(c.x / size), math.floor(c.y / size))].append(p.index)
    out = []
    for (tx, ty), faces in sorted(tiles.items()):
        keep = set(faces)
        bm = _bm.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        _bm.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
        nm = bpy.data.meshes.new(f"{prefix}_{tx}_{ty}")
        bm.to_mesh(nm)
        bm.free()
        for mt in me.materials:
            nm.materials.append(mt)
        if len(nm.color_attributes):                                     # keep vertex colours exportable
            nm.color_attributes.active_color = nm.color_attributes[0]
            try:
                nm.color_attributes.render_color_index = 0
            except AttributeError:
                pass
        o = bpy.data.objects.new(f"{prefix}_{tx}_{ty}", nm)
        o.matrix_world = ob.matrix_world
        ob.users_collection[0].objects.link(o)
        out.append(o)
    bpy.data.objects.remove(ob, do_unlink=True)
    return out


def join_export(ex, objs, rel, kind="level", chunk=None, prefix="Chunk", extra_objs=(), instances=False, bake=False):
    meshes = [o for o in objs if o.type == "MESH" and len(o.data.polygons)]
    vl = bpy.context.view_layer
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.name in vl.objects:
            o.select_set(False)
    for o in meshes:
        o.select_set(True)
    vl.objects.active = meshes[0]
    bpy.ops.object.join()
    ob = vl.objects.active
    ob.name = os.path.splitext(os.path.basename(rel))[0].title()
    if chunk:
        parts = split_chunks(ob, chunk, prefix)
        ex.export(parts + list(extra_objs), rel, kind, instances=instances, bake=bake,
                  extra={"chunks": len(parts), "chunk_size": chunk,
                         **({"instance_groups": len(extra_objs)} if extra_objs else {})})
        for o in parts:
            bpy.data.objects.remove(o, do_unlink=True)
        return len(parts)
    ex.export([ob], rel, kind)
    bpy.data.objects.remove(ob, do_unlink=True)
    return 1


def stall_lights(ctx, objs):
    bpy.context.view_layer.update()
    for st in objs:
        if st.get("lamps") is not None and len(st["lamps"]):
            w = st.matrix_world @ Vector(list(st["lamps"]))
            ctx.light("lamp", w.x, w.y, w.z)
        if st.get("wd") is not None:
            w, d = list(st["wd"])
            ctx.col(st.location.x, st.location.y, st.location.z + 1.25, w + 0.2, d, 2.5, st.rotation_euler.z, "stall")


# spawn spacing rules (horizontal metres from every player arrival spawn)
VULTURE_MIN = 60.0
FOE_MIN = 35.0


def _inside_collider(level, x, y, z, r=0.6):
    for c in level["colliders"]:
        cx, cy, cz = c["pos"]
        hx, hy, hz = c["half"]
        if not (cy - hy - 0.5 <= y <= cy + hy + 0.5):
            continue
        dx, dz = x - cx, z - cz
        cs, sn = math.cos(c["yaw"]), math.sin(c["yaw"])
        lx, lz = dx * cs - dz * sn, dx * sn + dz * cs
        if abs(lx) < hx + r and abs(lz) < hz + r:
            return True
    return False


def enforce_spacing(level, height_fn, name):
    """Keep vultures >= VULTURE_MIN and other foes >= FOE_MIN (horizontal) from every player spawn, and
    keep ground foes out of colliders. Works on the final level dict (three.js coords); height_fn takes
    blender (x, y). Vultures are pushed straight away from the offending arrival and keep their altitude;
    ground foes are moved to the nearest free spot that satisfies the rule."""
    players = [s["pos"] for s in level["spawns"] if s["role"] == "player"]
    bx, bz = level["bounds"]["x"], level["bounds"]["z"]

    def gh(x, z):
        return height_fn(x, -z)

    def nearest(x, z):
        return min(((math.hypot(x - p[0], z - p[2]), p) for p in players), key=lambda t: t[0]) if players else (1e9, None)
    moved = []
    for s in level["spawns"]:
        if s["role"] != "enemy":
            continue
        x, y, z = s["pos"]
        lim = VULTURE_MIN if s.get("kind") == "vulture" else FOE_MIN
        alt = y - gh(x, z)
        elevated = s.get("airborne") or alt > 0.6
        d, p = nearest(x, z)
        if d >= lim and (elevated or not _inside_collider(level, x, y, z)):
            continue
        if s.get("kind") == "vulture" or s.get("airborne"):
            for _ in range(30):
                d, p = nearest(x, z)
                if d >= lim:
                    break
                ux, uz = (x - p[0], z - p[2]) if d > 1e-3 else (1.0, 0.0)
                n = math.hypot(ux, uz)
                x, z = p[0] + ux / n * (lim + 2), p[2] + uz / n * (lim + 2)
                x = min(max(x, bx[0] + 10), bx[1] - 10)
                z = min(max(z, bz[0] + 10), bz[1] - 10)
            y = gh(x, z) + alt
        elif elevated:
            print(f"SPACING WARN {name}: elevated {s.get('kind')} at {s['pos']} is {d:.1f} m from an arrival")
            continue
        else:
            best = None
            for ring in range(0, 40):
                for k in range(max(1, ring * 6)):
                    a = k / max(1, ring * 6) * math.tau
                    tx, tz = x + math.cos(a) * ring * 1.5, z + math.sin(a) * ring * 1.5
                    if not (bx[0] + 5 < tx < bx[1] - 5 and bz[0] + 5 < tz < bz[1] - 5):
                        continue
                    ty = gh(tx, tz)
                    if nearest(tx, tz)[0] >= lim and not _inside_collider(level, tx, ty, tz):
                        best = (tx, ty, tz)
                        break
                if best:
                    break
            if not best:
                print(f"SPACING WARN {name}: no free spot for {s.get('kind')} at {s['pos']}")
                continue
            x, y, z = best
        old = s["pos"]
        s["pos"] = [round(x, 4), round(y, 4), round(z, 4)]
        moved.append((s.get("kind"), old, s["pos"]))
    for k, a, b in moved:
        print(f"SPACING {name}: moved {k} {a} -> {b}")
    return moved


def level_dict(m, ctx, heights, rel_dir):
    el, az = math.radians(m.sun[0]), math.radians(m.sun[1])
    sun = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    x0, x1, y0, y1 = m.bounds

    def sp(s):
        z = s["z"] if s.get("z") is not None else L.height(s["x"], s["y"])
        d = {"role": s["role"], "pos": to3((s["x"], s["y"], z)), "yaw": round(s["rot"], 4)}
        d.update({k: v for k, v in s.items() if k not in ("role", "x", "y", "rot", "z") and v is not None})
        return d
    names = {k: {"en": v[0], "ar": v[1]} for k, v in getattr(ctx, "names", {}).items()}
    return {
        "name": m.name, "title": m.title, **({"title_ar": m.title_ar} if m.title_ar else {}),
        **({"culture": m.culture} if m.culture else {}),
        **({"truce": {"center": to3((ctx.truce[0], ctx.truce[1], L.height(ctx.truce[0], ctx.truce[1]))),
                      "radius": ctx.truce[2]}} if getattr(ctx, "truce", None) else {}),
        **({"variant_of": m.variant_of} if m.variant_of else {}),
        **({"landmark_names": names} if names else {}),
        "terrain": f"{rel_dir}/terrain.glb", "town": f"{rel_dir}/town.glb",
        "backdrop_ground": f"{rel_dir}/backdrop_ground.glb",
        "sky": {"env_hdr": "sky/sunset_env.hdr", "background_jpg": "sky/sunset_bg.jpg"},
        "bounds": {"x": [x0, x1], "z": [-y1, -y0]},
        "heights": heights,
        "sun": {"direction_to_sun": to3(tuple(sun)), "color": "#ffb46b", "elevation_deg": m.sun[0]},
        "fog": m.fog,
        "colliders": [{"pos": to3((c[0], c[1], c[2])), "half": [round(c[3] / 2, 3), round(c[5] / 2, 3), round(c[4] / 2, 3)],
                       "yaw": round(c[6], 4), "tag": c[7]} for c in ctx.colliders],
        "spawns": [sp(s) for s in ctx.spawns],
        "lights": [{"type": k, "pos": to3((x, y, z))} for k, x, y, z in ctx.lights],
        "paths": {k: [to3((p[0], p[1], L.height(p[0], p[1]))) for p in v] for k, v in ctx.paths.items()},
        "landmarks": {k: to3((p[0], p[1], L.height(p[0], p[1]))) for k, p in ctx.landmarks.items()},
        **({"water": [{"level": w["level"], "x": list(w["x"]), "z": [-w["y"][1], -w["y"][0]]}
                      for w in getattr(ctx, "water", [])]} if getattr(ctx, "water", None) else {}),
        "exits": [{"to": e["to"], "pos": to3((e["x"], e["y"], L.height(e["x"], e["y"]))), "radius": e.get("r", 6.0),
                   "label": e["label"], **({"label_ar": e["label_ar"]} if e.get("label_ar") else {})} for e in ctx.exits],
    }


def export_map(ex, m):
    rel_dir = f"level/{m.name}"
    os.makedirs(os.path.join(ex.ASSETS, rel_dir), exist_ok=True)
    ex.clear_scene()
    import inst as _inst
    _inst.reset()
    L.HEIGHT_FN = m.height
    random.seed(sum(map(ord, m.name)))
    heights = export_ground(ex, m, rel_dir)
    export_far_ground(ex, m, rel_dir)
    ctx = K.Ctx()
    mb = L.MB()
    before = set(bpy.data.objects)
    m.build(mb, ctx)
    objs = new_objects(before)
    stall_lights(ctx, objs)
    inst_objs = set(_inst.PLACED)
    objs = [o for o in objs if o not in inst_objs and o.type == "MESH"]
    objs.append(mb.build("Static", L.C_LAND))
    if m.tile:
        empties = _inst.group_by_tile(m.tile) if m.instanced and _inst.PLACED else []
        nchunks = join_export(ex, objs, f"{rel_dir}/town.glb", chunk=m.tile, prefix="Town", extra_objs=empties,
                              instances=bool(empties), bake=True)
        print("INSTANCES", m.name, len(_inst.PLACED), "placed,", len({o.data.name for o in _inst.PLACED}), "prototypes,",
              len(empties), "tile groups")
    else:
        nchunks = join_export(ex, objs, f"{rel_dir}/town.glb", chunk=m.chunk)
    lvl = level_dict(m, ctx, heights, rel_dir)
    enforce_spacing(lvl, m.height, m.name)
    bx, bz = lvl["bounds"]["x"], lvl["bounds"]["z"]
    cxz = ((bx[0] + bx[1]) / 2, (bz[0] + bz[1]) / 2)
    for s_ in lvl["spawns"]:                                   # arrivals must look into the map, not at its edge
        if s_["role"] == "player":
            fx, fz = math.sin(s_["yaw"]), math.cos(s_["yaw"])
            vx, vz = cxz[0] - s_["pos"][0], cxz[1] - s_["pos"][2]
            n = math.hypot(vx, vz) or 1.0
            if (fx * vx + fz * vz) / n < 0.2:
                print(f"FACING WARN {m.name}: arrival from {s_.get('from')} at {s_['pos']} faces away from the map")
    with open(os.path.join(ex.ASSETS, rel_dir, "level.json"), "w", encoding="utf8") as f:
        json.dump(lvl, f, indent=1)
    ex.MANIFEST["assets"][f"level_{m.name}"] = {"file": f"{rel_dir}/level.json", "kind": "level-data", "title": m.title}
    print("MAP", m.name, len(ctx.colliders), "colliders", len(ctx.spawns), "spawns", len(ctx.lights), "lights",
          nchunks, "chunks")
    L.HEIGHT_FN = L.oasis_height
    return lvl


def people(ctx, role, pts, **kw):
    for p in pts:
        ctx.spawn(role, p[0], p[1], p[2] if len(p) > 2 else random.uniform(-math.pi, math.pi), **kw)


def wander_pts(n, cx, cy, rx, ry, ok=lambda x, y: True):
    out = []
    while len(out) < n:
        x, y = cx + random.uniform(-rx, rx), cy + random.uniform(-ry, ry)
        if ok(x, y):
            out.append((x, y))
    return out


def face(x, y, tx, ty):
    """Yaw that makes a model at (x, y) face (tx, ty) (models face -Y at yaw 0)."""
    return math.atan2(tx - x, -(ty - y))


# ================================================================== Hegra
class Hegra(MapDef):
    name, title = "hegra", "Hegra: the rock-cut city"
    bounds = (-130.0, 130.0, -160.0, 150.0)
    sun = (14.0, -60.0)
    fog = {"color": "#e9b994", "near": 70, "far": 420}
    color = staticmethod(rock_top(ground_color("#d49a68", "#e0ae7c", "#ebc193", steep_bands=K.ROCK_BANDS),
                                  K.ROCK_BANDS, 12, 22))

    @staticmethod
    def siq_x(y):
        t = y + 160
        return 7 * math.sin(t * 0.045) + 3 * math.sin(t * 0.11)

    def walk_dist(self, x, y):
        d_rect = max(abs(x) - 118, -40 - y, y - 138)
        d = d_rect
        if y < -34:
            d = min(d, abs(x - self.siq_x(y)) - 5.0)
        return d

    def height(self, x, y):
        base = 1.4 * noise.noise(Vector((x * 0.012, y * 0.012, 3.1))) + 0.4 * noise.noise(Vector((x * 0.05, y * 0.05, 1.0)))
        if y < -38:
            base *= 0.25
        plateau = 26 * L.smooth(0.0, 9.0, self.walk_dist(x, y))
        return base + plateau

    def build(self, mb, ctx):
        # the siq: cliff strata along both rims (the heightfield already makes the walls)
        ys = list(range(-160, -34, 7))
        siq = [(self.siq_x(y), y) for y in ys]
        for (ax, ay), (bx, by) in zip(siq, siq[1:]):
            for side in (-1, 1):
                x = (ax + bx) / 2 + side * 13.5
                y = (ay + by) / 2
                K.cliff(mb, ctx, x, y, 9, 8.5, random.uniform(6, 12), random.uniform(-0.1, 0.1), K.ROCK,
                        collide=False)
        # jagged rim along the valley edge (visual; the slope itself blocks)
        def rim(x, y):
            K.cliff(mb, ctx, x, y, random.uniform(9, 14), random.uniform(7, 10), random.uniform(5, 13),
                    random.uniform(-0.15, 0.15), K.ROCK, collide=False)
        for y in range(-38, 140, 11):
            rim(-127, y)
            rim(127, y)
        for x in range(-127, 128, 11):
            rim(x, 147)
            if abs(x - self.siq_x(-45)) > 16:
                rim(x, -49)
        for k in range(26):                                     # broken mesa-tops out on the plateau
            x, y = random.uniform(-130, 130), random.uniform(-160, -55)
            if abs(x - self.siq_x(y)) > 24:
                K.cliff(mb, ctx, x, y, random.uniform(8, 20), random.uniform(8, 20), random.uniform(3, 9), random.uniform(0, 3),
                        K.ROCK, collide=False)
        ctx.paths["siq"] = siq
        ctx.landmarks["siq_mouth"] = siq[0]
        sx0 = self.siq_x(-152)
        ctx.exits.append({"to": "oasis", "x": sx0, "y": -155, "r": 6, "label": "The road back to the oasis"})
        ctx.spawn("player", sx0, -148, math.pi)
        ctx.spawn("player", sx0, -148, math.pi, **{"from": "oasis"})
        K.cairn(mb, ctx, sx0 + 3.5, -151)
        ctx.keepout += [(self.siq_x(y), y, 9) for y in ys]
        # Khazneh greets you as the siq opens
        kx, ky = -24.0, -18.0
        rot = face(kx, ky, 0, -46)
        door = K.khazneh(mb, ctx, kx, ky, rot)
        ctx.landmarks["khazneh"] = (door.x, door.y)
        ctx.keepout.append((kx, ky, 34))
        for sgn in (-1, 1):
            K.brazier(mb, ctx, door.x + sgn * 4.0, door.y - 1.0)
        # tomb outcrops across the valley (Hegra), with Qasr al-Farid standing alone
        outcrops = [(42, 10, 22, 16, 16, [(0, 0, 8, 12)]), (78, 58, 26, 20, 18, [(0, -4, 9, 13), (3, 2, 7, 10)]),
                    (-74, 40, 20, 24, 15, [(1, 0, 8, 12)]), (12, 100, 18, 14, 14, [(0, 0, 7, 11)]),
                    (-46, 112, 24, 16, 17, [(0, 3, 9, 13)]), (92, 116, 16, 16, 20, [(3, 0, 8, 12)])]
        tombs = []
        for (x, y, w, d, h, fac) in outcrops:
            tombs += K.outcrop_with_tombs(mb, ctx, x, y, w, d, h, fac)
            ctx.keepout.append((x, y, max(w, d) * 0.8 + 4))
        q = K.outcrop_with_tombs(mb, ctx, 44, 74, 13, 13, 21, [(0, 0, 10, 17)])
        tombs += q
        ctx.keepout.append((44, 74, 14))
        ctx.landmarks["qasr_al_farid"] = (q[0].x, q[0].y)
        for i, t in enumerate(tombs):
            ctx.landmarks[f"tomb_{i}"] = (t.x, t.y)
        # Nabataean settlement: houses round a market square with a well
        sq = Vector((-22, 52))
        K.well(mb, ctx, sq.x, sq.y)
        ctx.landmarks["well"] = tuple(sq)
        stalls = [(-30, 44, math.radians(30)), (-14, 44, math.radians(-30)), (-34, 56, math.radians(90)),
                  (-10, 58, math.radians(-90)), (-22, 40, 0.0)]
        for (x, y, r) in stalls:
            L.stall(x, y, r)
            ctx.spawn("merchant", x - math.sin(r) * 1.3, y + math.cos(r) * 1.3, r)
        ctx.keepout.append((sq.x, sq.y, 16))
        spots = []
        for _ in range(16):
            for _ in range(50):
                a, rr = random.uniform(0, math.tau), random.uniform(17, 34)
                x, y = sq.x + math.cos(a) * rr * 1.2, sq.y + math.sin(a) * rr
                if all((Vector((x, y)) - s).length > 7.5 for s in spots) and self.walk_dist(x, y) < -6 \
                        and ctx.free(x, y, 3):
                    spots.append(Vector((x, y)))
                    break
        for i, s in enumerate(spots):
            rot = face(s.x, s.y, sq.x, sq.y) + random.uniform(-0.2, 0.2)
            w, d, h = random.uniform(4, 6.5), random.uniform(4, 6), random.uniform(3.5, 6)
            if i % 5 == 0:
                L.tower_house(s.x, s.y, rot, 4.6, 4.6, random.uniform(9, 12))
                ctx.col(s.x, s.y, L.height(s.x, s.y) + 5, 4.8, 4.8, 12, rot, "building")
            else:
                L.house(s.x, s.y, rot, w, d, h, floors=2 if random.random() < 0.4 else 1)
                ctx.col(s.x, s.y, L.height(s.x, s.y) + h / 2, w, d, h + 2, rot, "building")
            ctx.keepout.append((s.x, s.y, 5))
        for (x, y) in [(-6, 70), (-40, 70), (-52, 46), (6, 40), (-30, 30)]:
            L.palm(x, y, random.uniform(0.9, 1.2), 0.2)
            ctx.col(x, y, L.height(x, y) + 2, 0.7, 0.7, 4, 0, "palm")
        # high place shrine
        L.temple(-70, 88, face(-70, 88, -22, 52))
        ctx.col(-70, 88, L.height(-70, 88) + 2, 16, 12.8, 4, face(-70, 88, -22, 52), "building")
        ctx.keepout.append((-70, 88, 14))
        ctx.landmarks["shrine"] = (-70, 88)
        # people
        people(ctx, "wanderer", wander_pts(22, sq.x, sq.y, 26, 22, lambda x, y: ctx.free(x, y, 1) or True))
        people(ctx, "wanderer", wander_pts(8, -6, -34, 16, 10))
        ctx.spawn("guard", self.siq_x(-40) - 3.0, -38, math.pi)
        ctx.spawn("guard", self.siq_x(-40) + 3.0, -38, math.pi)
        ctx.spawn("priest", door.x, door.y - 2.5, rot + math.pi)
        ctx.spawn("priest", -70, 80, 0.0)
        people(ctx, "sitter", [(sq.x + 3, sq.y + 3, 2.0), (sq.x - 3, sq.y + 2.5, -2.0)])
        people(ctx, "water_carrier", [(sq.x + 2, sq.y - 4, 0.4), (sq.x - 5, sq.y - 2, -0.8)])
        for (x, y, sit) in [(-44, 30, True), (-48, 34, False), (-2, 30, True), (20, 60, False), (-8, -30, True)]:
            ctx.spawn("camel", x, y, random.uniform(-3, 3), sitting=sit)
        ctx.spawn("horse", 10, -30, 0.5)
        ctx.spawn("horse", 13, -27, 0.9)
        for (x, y, kind) in [(86, 100, "raider"), (98, 104, "skirmisher"), (90, 94, "raider"), (80, 106, "brute")]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind=kind, camp="tomb_robbers")
        ctx.paths["valley_loop"] = [(-10, -34), (20, -10), (40, 30), (60, 90), (20, 120), (-30, 100), (-50, 60), (-30, 20),
                                    (-10, -34)]
        dress(mb, ctx, self, lambda x, y: self.walk_dist(x, y) < -4, rocks=34, singles=60, shrubs=110, dry=40,
              acacias=14, dead=4, ruins=2, bones=2)
        # v4 gameplay markers + the way north to the ruined temple
        ctx.spawn("bonfire", self.siq_x(-128), -128, 0.0, id="hegra_siq")
        ctx.spawn("bonfire", 62, 96, 0.0, id="hegra_robbers")
        ctx.spawn("shopkeeper", -22, 41.3, 0.0, id="hegra_trader")
        ctx.spawn("quest_giver", door.x + 2.5, door.y - 3.0, rot + math.pi, id="hegra_priest")
        ctx.spawn("quest_giver", q[0].x + 1.5, q[0].y - 2.0, 0.0, id="hegra_mason")
        ctx.spawn("pickup", door.x - 4.0, door.y - 1.5, 0.0, id="khazneh_incense")
        ctx.spawn("pickup", tombs[2].x, tombs[2].y, 0.0, id="tomb_seal")
        ctx.spawn("chest", q[0].x - 1.5, q[0].y - 1.0, 0.0, id="hegra_qasr_chest")
        ctx.exits.append({"to": "ruined_temple", "x": 60, "y": 134, "r": 6, "label": "North to the Sabaean temple ruins"})
        ctx.spawn("player", 60, 126, 0.0, **{"from": "ruined_temple"})
        K.cairn(mb, ctx, 64, 131)
        # v5 enemies: hounds with the tomb robbers
        for (x, y) in [(88, 98), (94, 110)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="hound", camp="tomb_robbers")
        # v6: east to Jabal Ithlib
        ctx.exits.append({"to": "jabal_ithlib", "x": 114, "y": 20, "r": 6, "label": "East to Jabal Ithlib",
                          "label_ar": "شرقا إلى جبل إثلب"})
        ctx.spawn("player", 106, 20, math.pi / 2, **{"from": "jabal_ithlib"})
        K.cairn(mb, ctx, 110, 25)


# ================================================================== Caravanserai
class Caravanserai(MapDef):
    name, title = "caravanserai", "Caravanserai on the incense road"
    bounds = (-120.0, 120.0, -120.0, 120.0)
    sun = (22.0, 40.0)
    fog = {"color": "#efd5ac", "near": 80, "far": 460}
    color = staticmethod(ground_color("#cfa36a", "#ddb680", "#e9c999", "#c4955e"))
    CX, CY = 32.0, 6.0

    @staticmethod
    def road_x(y):
        return 6 * math.sin(y * 0.02)

    def height(self, x, y):
        p = Vector((x * 0.012 + y * 0.004, y * 0.022 - x * 0.006, 2.3))
        dune = (1 - abs(noise.noise(p))) ** 3 * 9 + (noise.noise(Vector((x * 0.005, y * 0.005, 0.7))) * 0.5 + 0.5) * 6
        flat = min(math.hypot(x - self.CX, y - self.CY) / 60, abs(x - self.road_x(y)) / 22,
                   math.hypot(x + 34, y + 38) / 26, math.hypot(x + 30, y - 32) / 26)
        return dune * L.smooth(0.55, 1.25, flat) + 0.2 * noise.noise(Vector((x * 0.15, y * 0.15, 4.2)))

    def build(self, mb, ctx):
        info = K.caravanserai(mb, ctx, self.CX, self.CY, -math.pi / 2)
        g, c = info["gate"], info["court"]
        ctx.landmarks.update({"gate": (g.x, g.y), "courtyard": (c.x, c.y)})
        ctx.keepout.append((self.CX, self.CY, 34))
        # courtyard life
        for (dx, dy, sit) in [(-8, -10, True), (-10, -6, True), (-6, 12, False), (8, -12, True), (10, 10, True)]:
            ctx.spawn("camel", c.x + dx, c.y + dy, random.uniform(-3, 3), sitting=sit)
        inner = info["half"] - 1.4 - 2.6
        for k in range(8):
            a = k * math.pi / 4 + 0.3
            ctx.spawn("merchant", c.x + math.cos(a) * inner * 0.92, c.y + math.sin(a) * inner * 0.92,
                      face(c.x + math.cos(a) * inner, c.y + math.sin(a) * inner, c.x, c.y))
        for k in range(6):
            a = k * math.pi / 3
            K.goods(mb, ctx, c.x + math.cos(a) * (inner + 1.0), c.y + math.sin(a) * (inner + 1.0), n=4, spread=0.9)
        people(ctx, "wanderer", wander_pts(12, c.x, c.y, 12, 12))
        ctx.spawn("guard", g.x, g.y - 3.0, math.pi / 2)
        ctx.spawn("guard", g.x, g.y + 3.0, math.pi / 2)
        ctx.spawn("priest", c.x, c.y + 12, math.pi)
        # the road with milestones; exits south (oasis) and north (raider country)
        road = [(self.road_x(y), y) for y in range(-118, 120, 12)]
        ctx.paths["incense_road"] = road
        for y in range(-100, 110, 40):
            K.cairn(mb, ctx, self.road_x(y) + 4.5, y, K.CLOTH[2])
        ctx.keepout += [(x, y, 6) for x, y in road]
        ctx.exits.append({"to": "oasis", "x": self.road_x(-114), "y": -114, "r": 6, "label": "South to the oasis"})
        ctx.exits.append({"to": "raider_fort", "x": self.road_x(114), "y": 114, "r": 6, "label": "North into raider country"})
        ctx.spawn("player", self.road_x(-106), -106, math.pi)
        ctx.spawn("player", self.road_x(-106), -106, math.pi, **{"from": "oasis"})
        ctx.spawn("player", self.road_x(106), 106, 0.0, **{"from": "raider_fort"})
        # caravan camp outside the walls
        cc = Vector((-30, 32))
        for k in range(4):
            a = k * math.pi / 2 + 0.4
            x, y = cc.x + math.cos(a) * 11, cc.y + math.sin(a) * 9
            L.tent(x, y, face(x, y, cc.x, cc.y))
            ctx.col(x, y, L.height(x, y) + 1, 7, 4, 2, face(x, y, cc.x, cc.y), "tent")
        K.campfire(mb, ctx, cc.x, cc.y)
        for k in range(5):
            a = k / 5 * math.tau
            ctx.spawn("sitter", cc.x + math.cos(a) * 2.4, cc.y + math.sin(a) * 2.4,
                      face(cc.x + math.cos(a) * 2.4, cc.y + math.sin(a) * 2.4, cc.x, cc.y))
        ctx.keepout.append((cc.x, cc.y, 18))
        ctx.landmarks["caravan_camp"] = tuple(cc)
        for k in range(8):                                     # camel line
            ctx.spawn("camel", -18 + k * 3.2, -20, math.pi / 2, sitting=k % 3 == 0)
        ctx.keepout.append((-7, -20, 16))
        for (x, y, r) in [(16, -26, 0.4), (19, -24, 0.8), (22, -27, 0.2)]:
            ctx.spawn("horse", x, y, r)
        # cistern with palms
        cp = Vector((-34, -38))
        bpy.ops.mesh.primitive_circle_add(vertices=12, radius=7, fill_type="NGON",
                                          location=(cp.x, cp.y, L.height(cp.x, cp.y) + 0.12))
        pool = bpy.context.active_object
        pool.data.materials.append(K.WATER)
        ctx.col(cp.x, cp.y, L.height(cp.x, cp.y), 13, 13, 2, 0, "water")
        for k in range(9):
            a = random.uniform(0, math.tau)
            x, y = cp.x + math.cos(a) * random.uniform(8.5, 13), cp.y + math.sin(a) * random.uniform(8.5, 13)
            L.palm(x, y, random.uniform(0.9, 1.2), 0.25)
            ctx.col(x, y, L.height(x, y) + 2, 0.7, 0.7, 4, 0, "palm")
        ctx.keepout.append((cp.x, cp.y, 15))
        people(ctx, "water_carrier", [(cp.x + 8, cp.y + 2, 1.0), (cp.x + 6, cp.y + 7, 2.2)])
        ctx.landmarks["cistern"] = tuple(cp)
        people(ctx, "wanderer", [(self.road_x(y) + random.uniform(-2, 2), y) for y in (-80, -50, -10, 30, 70)])
        # an old ruined watch post and bandits in the NE dunes
        K.ruin_site(mb, ctx, 74, -72, 1.1)
        ctx.landmarks["old_post"] = (74, -72)
        for (x, y, kind) in [(84, 84, "raider"), (92, 78, "skirmisher"), (78, 92, "raider")]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind=kind, camp="ridge")
        ctx.keepout.append((85, 85, 10))
        dress(mb, ctx, self, lambda x, y: True, rocks=30, singles=50, shrubs=140, dry=60, acacias=16, dead=5,
              ruins=2, bones=4)
        # v4 gameplay markers
        ctx.spawn("bonfire", self.road_x(-100) + 5, -100, 0.0, id="serai_road")
        ctx.spawn("bonfire", 70, 70, 0.0, id="serai_ridge")
        ctx.spawn("shopkeeper", c.x - 6, c.y - 4, math.pi / 2, id="serai_trader")
        ctx.spawn("quest_giver", c.x + 4, c.y + 8, math.pi, id="serai_innkeeper")
        ctx.spawn("quest_giver", cc.x + 3, cc.y - 3, 0.0, id="caravan_master")
        ctx.spawn("pickup", cp.x + 7.5, cp.y, 0.0, id="cistern_waterskin")
        ctx.spawn("pickup", 74, -72, 0.0, id="lost_cargo")
        ctx.spawn("chest", 77, -69, 0.0, id="serai_old_post_chest")
        # v5 enemies: hounds and a slinger with the ridge bandits
        for (x, y) in [(88, 80), (82, 86)]:
            ctx.spawn("enemy", x, y, random.uniform(-3, 3), kind="hound", camp="ridge")
        ctx.spawn("enemy", 96, 90, R(-140), kind="slinger", camp="ridge")
        # v6: east to Marib
        ctx.exits.append({"to": "marib", "x": 114, "y": -40, "r": 6, "label": "South-east to Marib, land of Saba",
                          "label_ar": "إلى مأرب في أرض سبأ"})
        ctx.spawn("player", 106, -40, math.pi / 2, **{"from": "marib"})
        K.cairn(mb, ctx, 110, -35)


# ================================================================== Wadi gardens
class Wadi(MapDef):
    name, title = "wadi", "Wadi of the date gardens"
    bounds = (-130.0, 130.0, -110.0, 110.0)
    sun = (30.0, 120.0)
    fog = {"color": "#e3cfa8", "near": 70, "far": 420}
    STEPS = [(6.0, 1.5), (14.0, 1.5), (22.0, 1.5), (30.0, 1.5), (40.0, 1.0)]
    _gravel = staticmethod(ground_color("#bea27a", "#ccb088", "#d8be96", steep="#8f7b62"))
    _soil = staticmethod(ground_color("#7a6a46", "#8a7a52", "#978760", steep="#9a8466"))
    _bed = staticmethod(ground_color("#c4ae8a", "#d0bb96", "#dcc8a4", steep="#a8957c"))

    @staticmethod
    def yc(x):
        return 18 * math.sin(x * 0.025) + 6 * math.sin(x * 0.07 + 1.0)

    def depth(self, x, y):
        return abs(y - self.yc(x))

    def height(self, x, y):
        d = self.depth(x, y)
        h = -7.0
        for b, rise in self.STEPS:
            h += rise * L.smooth(b - 1.3, b + 1.3, d)
        h += 0.25 * noise.noise(Vector((x * 0.08, y * 0.08, 2.0))) * (1 - L.smooth(4, 8, d))
        plateau = L.smooth(40, 48, d)
        h += plateau * (1.8 * noise.noise(Vector((x * 0.015, y * 0.015, 5.0))) + 1.0)
        h += 12 * math.exp(-((x - 70) ** 2 + (y - 78) ** 2) / 500)          # watchtower hill
        return h

    def color(self, c, nz):
        d = self.depth(c.x, c.y)
        if d < 6.5:
            return self._bed(c, nz)
        if d < 41:
            return self._soil(c, nz)
        return self._gravel(c, nz)

    def build(self, mb, ctx):
        gaps = [-70.0, -10.0, 50.0, 105.0]                       # stair gaps through the terrace walls
        for side in (-1, 1):
            for b, rise in self.STEPS:
                x = -126.0
                while x < 126:
                    x2 = x + 6.0
                    if not any(abs((x + x2) / 2 - g) < 4.5 for g in gaps):
                        p1 = (x, self.yc(x) + side * (b + 1.5))
                        p2 = (x2, self.yc(x2) + side * (b + 1.5))
                        K.terrace_wall(mb, *p1, *p2, h=0.55)
                    x = x2
        # palms in rows on every terrace, gaps kept clear
        for side in (-1, 1):
            for (b0, b1) in [(7.5, 12.5), (15.5, 20.5), (23.5, 28.5)]:
                x = -124.0
                while x < 124:
                    if not any(abs(x - g) < 6 for g in gaps):
                        py = self.yc(x) + side * random.uniform(b0, b1)
                        L.palm(x + random.uniform(-1, 1), py, random.uniform(0.85, 1.15), 0.12, lite=True)
                        ctx.col(x, py, L.height(x, py) + 2, 0.7, 0.7, 4, 0, "palm")
                    x += random.uniform(8.0, 11.0)
            # low crops on the top garden terrace
            for k in range(70):
                x = random.uniform(-122, 122)
                if any(abs(x - g) < 5 for g in gaps):
                    continue
                y = self.yc(x) + side * random.uniform(32, 38)
                K.shrub(mb, x, y, 0.6)
        # falaj: an irrigation channel along the north rim
        x = -126.0
        while x < 126:
            x2 = x + 3.0
            y1_, y2_ = self.yc(x) + 43, self.yc(x2) + 43
            z = min(L.height(x, y1_), L.height(x2, y2_))
            ang = math.atan2(y2_ - y1_, x2 - x)
            mb.box(((x + x2) / 2, (y1_ + y2_) / 2, z + 0.05), (3.1, 0.7, 0.1), K.WATER, rot=(0, 0, ang))
            for s in (-0.5, 0.5):
                mb.box(((x + x2) / 2 - math.sin(ang) * s, (y1_ + y2_) / 2 + math.cos(ang) * s, z + 0.15),
                       (3.1, 0.3, 0.35), K.STONE_DARK, rot=(0, 0, ang))
            x = x2
        ctx.paths["falaj"] = [(x, self.yc(x) + 43) for x in range(-120, 121, 20)]
        # the wadi bed: pebbles, pools, oleander
        for k in range(160):
            x = random.uniform(-126, 126)
            y = self.yc(x) + random.uniform(-5, 5)
            K.rock(mb, ctx, x, y, random.uniform(0.15, 0.45), K.GREY, collide=False)
        oleander = L.mat("Oleander", "#d77fa1", 0.8)
        for k in range(40):
            x = random.uniform(-120, 120)
            y = self.yc(x) + random.choice((-1, 1)) * random.uniform(3.5, 5.5)
            K.shrub(mb, x, y, 0.9)
            mb.ico((x, y, L.height(x, y) + 0.8), (0.3, 0.3, 0.2), oleander, sub=1, jitter=0.05)
        for x in (-90, -30, 25, 80):
            cx, cy = x, self.yc(x)
            mb.cyl((cx, cy, L.height(cx, cy) + 0.08), 4.0, 4.0, 0.1, K.WATER, segs=10)
        ctx.paths["wadi_bed"] = [(x, self.yc(x)) for x in range(-125, 126, 10)]
        # farmsteads on the plateau and a watchtower on the hill
        for k, x in enumerate([-100, -60, -20, 25, 65, 100]):
            for side in (-1, 1):
                if random.random() < 0.7:
                    y = self.yc(x) + side * random.uniform(52, 62)
                    rot = face(x, y, x, self.yc(x)) + random.uniform(-0.15, 0.15)
                    w, d, h = random.uniform(5, 7), random.uniform(4.5, 6), random.uniform(3.5, 5)
                    L.house(x, y, rot, w, d, h, floors=2 if random.random() < 0.3 else 1)
                    ctx.col(x, y, L.height(x, y) + h / 2, w, d, h + 2, rot, "building")
                    ctx.spawn("farmer", x + random.uniform(-4, 4), y - side * 6, face(x, y, x, self.yc(x)))
                    ctx.keepout.append((x, y, 6))
        L.tower_house(70, 78, 0.2, 5.0, 5.0, 14.0)
        ctx.col(70, 78, L.height(70, 78) + 7, 5.2, 5.2, 14, 0.2, "building")
        ctx.landmarks["watchtower"] = (70, 72)
        ctx.spawn("guard", 70, 72, 0.0)
        ctx.keepout.append((70, 78, 8))
        # exit east along the bed, arrival points
        ex_x = 122.0
        ctx.exits.append({"to": "oasis", "x": ex_x, "y": self.yc(ex_x), "r": 6, "label": "East along the wadi to the oasis"})
        ctx.spawn("player", 112, self.yc(112), math.pi / 2)
        ctx.spawn("player", 112, self.yc(112), math.pi / 2, **{"from": "oasis"})
        K.cairn(mb, ctx, 118, self.yc(118) + 5)
        # people and animals
        for k in range(14):
            x = random.uniform(-110, 110)
            y = self.yc(x) + random.choice((-1, 1)) * random.uniform(8, 36)
            ctx.spawn("farmer", x, y, random.uniform(-3, 3))
        people(ctx, "water_carrier", [(x, self.yc(x) + 41, 0.0) for x in (-80, -20, 40)])
        people(ctx, "wanderer", [(x, self.yc(x) + random.uniform(-2, 2)) for x in (-100, -50, 0, 50, 95)])
        people(ctx, "sitter", [(x + 2, self.yc(x) + 3, 2.0) for x in (-30, 25)])
        for x in (-95, -40, 10, 60):
            ctx.spawn("camel", x, self.yc(x) + random.uniform(-3, 3), random.uniform(-3, 3), sitting=random.random() < 0.5)
        ctx.spawn("horse", 100, self.yc(100) + 2, 1.6)
        ctx.keepout += [(x, self.yc(x), 6) for x in range(-125, 126, 10)]
        dress(mb, ctx, self, lambda x, y: self.depth(x, y) > 47, rocks=26, singles=50, shrubs=70, dry=40, acacias=12,
              dead=4, ruins=1, bones=1, palette=K.GREY)
        # v4 gameplay markers + the way west up to the aqueduct cliffs
        ctx.spawn("bonfire", 108, self.yc(108) + 3, 0.0, id="wadi_east")
        ctx.spawn("bonfire", 64, 70, 0.0, id="wadi_tower")
        ctx.spawn("quest_giver", 25, self.yc(25) + 48, math.pi, id="wadi_farmer_elder")
        ctx.spawn("pickup", 0, self.yc(0) + 43, 0.0, id="falaj_sluice")
        ctx.spawn("pickup", -60, self.yc(-60) + 10, 0.0, id="wadi_date_basket")
        ctx.spawn("chest", 73, 74, 0.0, id="wadi_tower_chest")
        ctx.exits.append({"to": "cliffs", "x": -124, "y": self.yc(-124), "r": 6, "label": "West, up to the aqueduct cliffs"})
        ctx.spawn("player", -114, self.yc(-114), -math.pi / 2, **{"from": "cliffs"})
        K.cairn(mb, ctx, -120, self.yc(-120) + 5)
        # v5 enemies: vultures circling over the gardens
        for x, h in ((-80, 18), (-20, 22), (40, 16), (90, 20)):
            ctx.spawn("enemy", x, self.yc(x), 0.0, kind="vulture", camp="sky", z=round(L.height(x, self.yc(x)) + h, 3),
                      airborne=True)


# ================================================================== Raider fort
class RaiderFort(MapDef):
    name, title = "raider_fort", "The raider stronghold"
    bounds = (-110.0, 110.0, -115.0, 105.0)
    sun = (6.0, -100.0)
    fog = {"color": "#d9a982", "near": 60, "far": 360}
    color = staticmethod(rock_top(ground_color("#a48868", "#b39674", "#c0a37e", steep_bands=K.GREY_BANDS),
                                  K.GREY_BANDS, 6.5, 9.5))
    PH = 10.0

    def height(self, x, y):
        e = math.hypot(x / 52, (y - 15) / 44)
        plat = self.PH * (1 - L.smooth(0.97, 1.14, e))
        ramp = 0.0
        if y < -24:
            ramp = self.PH * L.smooth(-70, -32, y) * (1 - L.smooth(4.5, 8.0, abs(x)))
        h = max(plat, ramp)
        rough = 1.6 * noise.noise(Vector((x * 0.02, y * 0.02, 7.0))) + 0.4 * noise.noise(Vector((x * 0.08, y * 0.08, 1.0)))
        out = 1 - L.smooth(0.9, 1.1, e)
        h += rough * (1 - out) + 0.3 * rough * out
        h += 9 * math.exp(-((x + 62) ** 2 + (y + 42) ** 2) / 260)            # lookout knoll
        return h

    def build(self, mb, ctx):
        x0, x1, y0, y1 = -26.0, 26.0, -5.0, 35.0
        corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        K.palisade(mb, ctx, x0, y0, -3.2, y0)
        K.palisade(mb, ctx, 3.2, y0, x1, y0)
        K.palisade(mb, ctx, x1, y0, x1, y1)
        K.palisade(mb, ctx, x1, y1, x0, y1)
        K.palisade(mb, ctx, x0, y1, x0, y0)
        for (x, y) in corners:
            K.watchtower(mb, ctx, x, y, random.uniform(-0.2, 0.2))
        for sx in (-5.5, 5.5):
            K.watchtower(mb, ctx, sx, y0 - 1.5, 0.0, h=7.0)
            K.banner(mb, sx * 1.4, y0 - 3.5, K.CLOTH[0])
        K.brazier(mb, ctx, -2.6, y0 - 3.2)
        K.brazier(mb, ctx, 2.6, y0 - 3.2)
        ctx.landmarks["gate"] = (0, y0 - 3)
        # spikes across the top of the ramp, gap in the middle
        K.spikes(mb, ctx, -14, -16, -3.5, -16)
        K.spikes(mb, ctx, 3.5, -16, 14, -16)
        # the yard
        K.big_tent(mb, ctx, 0, 27, math.pi, 1.5)
        ctx.landmarks["chief_tent"] = (0, 22)
        for (x, y, r) in [(-17, 8, 0.4), (17, 8, -0.4), (-18, 20, 1.2), (12, 18, -1.3), (-8, 14, 0.1)]:
            L.tent(x, y, r)
            ctx.col(x, y, L.height(x, y) + 1, 7, 4, 2, r, "tent")
        L.tower_house(-17, 29, 0.0, 5.0, 5.0, 11.0)
        ctx.col(-17, 29, L.height(-17, 29) + 5.5, 5.2, 5.2, 11, 0.0, "building")
        for (x, y) in [(0, 6), (-12, 24), (14, 28)]:
            K.campfire(mb, ctx, x, y)
        for (x, y, r) in [(-22, 0, math.pi / 2), (22, 2, -math.pi / 2), (8, 31, math.pi), (-8, 31, math.pi)]:
            K.weapon_rack(mb, ctx, x, y, r)
        for (x, y) in [(-4, 30), (20, 14), (-22, 12), (4, 22)]:
            K.goods(mb, ctx, x, y, n=7)
        for (x, y) in [(-12, -1), (-9, -2), (-6, -1)]:
            K.dummy(mb, ctx, x, y)
        # horse pen
        K.palisade(mb, ctx, 14, 22, 24, 22, h=1.3)
        K.palisade(mb, ctx, 14, 22, 14, 33, h=1.3)
        for (x, y, r) in [(18, 27, 0.4), (21, 30, 1.6)]:
            ctx.spawn("horse", x, y, r)
        for (x, y) in [(-24, 33), (24, 33), (-24, -3)]:
            K.banner(mb, x, y)
        # escarpment rim round the mesa (visual), leaving the ramp clear
        for k in range(64):
            a = k / 64 * math.tau
            x, y = math.cos(a) * 52 * 1.1, 15 + math.sin(a) * 44 * 1.1
            if y < 0 and abs(x) < 12:
                continue
            K.cliff(mb, ctx, x, y, random.uniform(6, 10), random.uniform(5, 8), random.uniform(5, 10),
                    a + math.pi / 2, K.GREY, collide=False)
        # hoodoos: weathered rock pillars in the badlands (with colliders)
        n = 0
        while n < 24:
            x, y = random.uniform(-100, 100), random.uniform(-105, 95)
            if math.hypot(x / 52, (y - 15) / 44) < 1.35 or abs(x) < 10 or not ctx.free(x, y, 6):
                continue
            K.cliff(mb, ctx, x, y, random.uniform(3, 6), random.uniform(3, 6), random.uniform(5, 14), random.uniform(0, 3),
                    K.GREY, tag="rock")
            ctx.keepout.append((x, y, 5))
            n += 1
        # lookout on the knoll, rocky badlands outside
        K.watchtower(mb, ctx, -62, -42, 0.5, h=6.5)
        ctx.landmarks["lookout"] = (-62, -42)
        ctx.keepout += [(0, 15, 34), (0, -40, 10), (-62, -42, 8)]
        for (x, y) in [(30, -50), (-30, -70), (60, 40), (-70, 50), (70, -20)]:
            K.dead_tree(mb, ctx, x, y)
        for k in range(10):
            K.bones(mb, random.uniform(-90, 90), random.uniform(-100, -30))
        # exit
        ctx.exits.append({"to": "oasis", "x": 0, "y": -110, "r": 6, "label": "South, back to the oasis"})
        ctx.exits.append({"to": "caravanserai", "x": 104, "y": -100, "r": 6, "label": "Down to the caravanserai"})
        ctx.spawn("player", 0, -100, math.pi)
        ctx.spawn("player", 0, -100, math.pi, **{"from": "oasis"})
        ctx.spawn("player", 96, -92, -2.3, **{"from": "caravanserai"})
        K.cairn(mb, ctx, 4, -106)
        K.cairn(mb, ctx, 100, -96)
        ctx.paths["approach"] = [(0, -105), (0, -70), (0, -40), (0, -20), (0, -6), (0, 10), (0, 22)]
        ctx.paths["wall_patrol"] = [(x0 + 3, y0 + 3), (x1 - 3, y0 + 3), (x1 - 3, y1 - 3), (x0 + 3, y1 - 3), (x0 + 3, y0 + 3)]
        # the garrison
        camps = {
            "gate": [(-4, -9, "raider"), (4, -9, "raider"), (-8, -6, "skirmisher"), (8, -6, "skirmisher")],
            "yard": [(-10, 6, "raider"), (10, 10, "raider"), (-4, 18, "skirmisher"), (6, 4, "brute"),
                     (-16, 16, "raider"), (16, 20, "raider")],
            "chief": [(0, 20, "brute", "chief"), (-4, 23, "brute"), (4, 23, "raider")],
            "lookout": [(-60, -46, "skirmisher"), (-65, -38, "skirmisher")],
            "ramp": [(-2, -48, "raider"), (3, -58, "raider"), (0, -36, "skirmisher")],
        }
        for camp, members in camps.items():
            for mem in members:
                x, y, kind = mem[:3]
                extra = {"title": mem[3]} if len(mem) > 3 else {}
                ctx.spawn("enemy", x, y, face(x, y, 0, -40), kind=kind, camp=camp, **extra)
        people(ctx, "prisoner", [(-20, 33, math.pi), (-19, 33.2, math.pi)])
        dress(mb, ctx, self, lambda x, y: True, rocks=46, singles=70, shrubs=40, dry=80, acacias=4, dead=6,
              ruins=1, bones=4, palette=K.GREY)
        # v4 gameplay markers
        ctx.spawn("bonfire", 6, -96, 0.0, id="fort_road")
        ctx.spawn("bonfire", 8, -76, 0.0, id="fort_ramp")
        ctx.spawn("quest_giver", -20.5, 31.5, math.pi, id="fort_prisoner")
        ctx.spawn("pickup", 0, 24, 0.0, id="chief_seal")
        ctx.spawn("chest", -4, 28, 0.0, id="fort_loot_chest")
        ctx.spawn("chest", -60, -40, 0.0, id="fort_lookout_chest")
        # v5 enemies: slingers on the tower platforms, clubmen and hounds in the yard
        for (x, y), hgt in [((x0, y0), 6.0), ((x1, y0), 6.0), ((x1, y1), 6.0), ((x0, y1), 6.0), ((-5.5, y0 - 1.5), 7.0),
                            ((5.5, y0 - 1.5), 7.0), ((-62, -42), 6.5)]:
            ctx.spawn("enemy", x, y, face(x, y, 0, -40), kind="slinger", camp="towers",
                      z=round(L.height(x, y) + hgt - 1.31, 3))
        for (x, y, camp) in [(-12, 20, "yard"), (10, 26, "chief"), (2, -10, "gate")]:
            ctx.spawn("enemy", x, y, face(x, y, 0, -40), kind="clubman", camp=camp)
        for (x, y, camp) in [(-6, 10, "yard"), (8, 14, "yard"), (12, 6, "yard"), (-2, -12, "gate")]:
            ctx.spawn("enemy", x, y, face(x, y, 0, -40), kind="hound", camp=camp)


MAPS = {m.name: m for m in (Hegra(), Caravanserai(), Wadi(), RaiderFort())}


def run(ex, names=None):
    out = {}
    for n, m in MAPS.items():
        if names and n not in names:
            continue
        out[n] = export_map(ex, m)
    return out


def write_index(ex):
    idx = {"start": "oasis", "maps": [{"name": "oasis", "title": "The oasis town", "title_ar": AR_TITLES["oasis"],
                                       "level": "level/level.json"}]}
    for n, m in MAPS.items():
        e = {"name": n, "title": m.title, "title_ar": m.title_ar or AR_TITLES.get(n, ""), "level": f"level/{n}/level.json"}
        if m.variant_of:
            e["variant_of"] = m.variant_of
        if m.batch:
            e["batch"] = m.batch
        if m.culture:
            e["culture"] = m.culture
        idx["maps"].append(e)
    with open(os.path.join(ex.ASSETS, "level", "maps.json"), "w", encoding="utf8") as f:
        json.dump(idx, f, indent=1)
