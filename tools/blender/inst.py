"""
GPU-instanced props for the big maps (v6.1).

Repeated props (palms, rocks, shrubs, dry bushes, acacias, dead trees, bones, incense trees) are built
once per variant at the origin as a prototype mesh, then placed as linked duplicates. Each map groups
them under one Empty per tile ("Props_i_j"); the glTF exporter (export_gpu_instances) turns every
group of same-mesh children into EXT_mesh_gpu_instancing, which GLTFLoader loads as InstancedMesh.

Colliders are registered on the Ctx exactly as the baked versions did (trunks for trees, boxes for rocks).
"""
import math, random
import bpy
from mathutils import Vector

import arabia_lib as L
import kit as K
import kit_sites as S

PROTOS = {}                 # key -> bpy mesh
PLACED = []                 # instance objects placed for the current map
_C = None


def _coll():
    global _C
    if _C is None or _C.name not in bpy.data.collections:
        _C = L.coll("Instances")
    return _C


def reset():
    PLACED.clear()


def _flat(build):
    """Build a prototype at the origin on flat ground; return its mesh."""
    saved = L.HEIGHT_FN
    state = random.getstate()
    L.HEIGHT_FN = lambda x, y: 0.0
    try:
        ob = build()
    finally:
        L.HEIGHT_FN = saved
        random.setstate(state)
    me = ob.data
    me.use_fake_user = True
    bpy.data.objects.remove(ob, do_unlink=True)
    return me


def proto(key, build):
    me = PROTOS.get(key)
    if me is None or me.name not in bpy.data.meshes:
        me = _flat(build)
        me.name = "P_" + key
        PROTOS[key] = me
    return me


def place(key, build, x, y, z, rotz=0.0, scale=1.0):
    me = proto(key, build)
    ob = bpy.data.objects.new(key, me)
    ob.location = (x, y, z)
    ob.rotation_euler.z = rotz
    ob.scale = (scale, scale, scale) if not isinstance(scale, tuple) else scale
    _coll().objects.link(ob)
    PLACED.append(ob)
    return ob


def _mb_build(fn, name):
    def build():
        mb = L.MB()
        fn(mb)
        return mb.build(name, L.C_LAND)
    return build


class _NullCtx(K.Ctx):
    pass


# ------------------------------------------------------------------ prop kinds
def palm(ctx, x, y, s=1.0, lite=False, collide=True):
    v = random.randrange(3)
    key = f"palm{'L' if lite else ''}{v}"

    def build(v=v, lite=lite):
        random.seed(1000 + v + (50 if lite else 0))
        return L.palm(0, 0, 1.0, 0.2, lite=lite)
    place(key, build, x, y, L.height(x, y) - 0.2, random.uniform(0, math.tau), s)
    if collide:
        ctx.col(x, y, L.height(x, y) + 2, 0.7, 0.7, 4, 0, "palm")


def rock(ctx, x, y, s, palette=None, pal_name="rock", collide=True):
    palette = palette or K.ROCK
    v = random.randrange(6)
    key = f"{pal_name}{v}"

    def build(v=v):
        random.seed(2000 + v * 7 + len(pal_name))
        return _mb_build(lambda mb: K.rock(mb, _NullCtx(), 0, 0, 1.0, palette, collide=False), key)()
    rz = random.uniform(0, math.tau)
    sz = (s * random.uniform(0.8, 1.3), s * random.uniform(0.7, 1.1), s * random.uniform(0.85, 1.1))
    place(key, build, x, y, L.height(x, y), rz, sz)
    if collide and s > 0.7:
        ctx.col(x, y, L.height(x, y) + 0.5 * s * 0.6, 1.6 * sz[0], 1.6 * sz[1], 0.6 * 1.6 * sz[2], rz, "rock")


def rock_cluster(ctx, x, y, s=1.0, palette=None, pal_name="rock"):
    rock(ctx, x, y, 1.6 * s, palette, pal_name)
    for _ in range(random.randint(2, 5)):
        a, r = random.uniform(0, math.tau), random.uniform(1.6, 3.2) * s
        rock(ctx, x + math.cos(a) * r, y + math.sin(a) * r, random.uniform(0.35, 0.9) * s, palette, pal_name)


def shrub(ctx, x, y, s=1.0):
    v = random.randrange(4)
    key = f"shrub{v}"

    def build(v=v):
        random.seed(3000 + v)
        return _mb_build(lambda mb: K.shrub(mb, 0, 0, 1.0), key)()
    place(key, build, x, y, L.height(x, y), random.uniform(0, math.tau), s)


def dry_bush(ctx, x, y, s=1.0):
    v = random.randrange(3)
    key = f"drybush{v}"

    def build(v=v):
        random.seed(3100 + v)
        return _mb_build(lambda mb: K.dry_bush(mb, 0, 0, 1.0), key)()
    place(key, build, x, y, L.height(x, y), random.uniform(0, math.tau), s)


def acacia(ctx, x, y, s=1.0):
    v = random.randrange(3)
    key = f"acacia{v}"

    def build(v=v):
        random.seed(3200 + v)
        return _mb_build(lambda mb: K.acacia(mb, _NullCtx(), 0, 0, 1.0), key)()
    place(key, build, x, y, L.height(x, y), random.uniform(0, math.tau), s)
    ctx.col(x, y, L.height(x, y) + 1.5 * s, 0.6 * s, 0.6 * s, 3 * s, 0, "tree")


def dead_tree(ctx, x, y, s=1.0):
    v = random.randrange(2)
    key = f"deadtree{v}"

    def build(v=v):
        random.seed(3300 + v)
        return _mb_build(lambda mb: K.dead_tree(mb, _NullCtx(), 0, 0, 1.0), key)()
    place(key, build, x, y, L.height(x, y), random.uniform(0, math.tau), s)
    ctx.col(x, y, L.height(x, y) + 1.2 * s, 0.5 * s, 0.5 * s, 2.4 * s, 0, "tree")


def bones(ctx, x, y):
    v = random.randrange(2)
    key = f"bones{v}"

    def build(v=v):
        random.seed(3400 + v)
        return _mb_build(lambda mb: K.bones(mb, 0, 0), key)()
    place(key, build, x, y, L.height(x, y), random.uniform(0, math.tau), 1.0)


def frankincense(ctx, x, y, s=1.0):
    v = random.randrange(3)
    key = f"incense{v}"

    def build(v=v):
        random.seed(3500 + v)
        return _mb_build(lambda mb: S.frankincense_tree(mb, _NullCtx(), 0, 0, 1.0), key)()
    place(key, build, x, y, L.height(x, y), random.uniform(0, math.tau), s)
    ctx.col(x, y, L.height(x, y) + 0.8 * s, 0.5 * s, 0.5 * s, 1.6 * s, 0, "tree")


def dragons_blood(ctx, x, y, s=1.0):
    v = random.randrange(2)
    key = f"dragon{v}"

    def build(v=v):
        random.seed(3600 + v)
        return _mb_build(lambda mb: S.dragons_blood_tree(mb, _NullCtx(), 0, 0, 1.0), key)()
    place(key, build, x, y, L.height(x, y), random.uniform(0, math.tau), s)
    ctx.col(x, y, L.height(x, y) + 1.2 * s, 0.8 * s, 0.8 * s, 2.4 * s, 0, "tree")


def dress(mb, ctx, m, ok, rocks=40, singles=60, shrubs=120, dry=50, acacias=12, dead=5, ruins=2, nbones=3,
          palette=None, pal_name="rock"):
    """Instanced version of maps.dress (ruins stay unique geometry in the MB)."""
    import maps as M
    sc = M.scatter
    sc(ctx, m, rocks, lambda x, y: rock_cluster(ctx, x, y, random.uniform(0.7, 1.6), palette, pal_name), ok, r=4)
    sc(ctx, m, singles, lambda x, y: rock(ctx, x, y, random.uniform(0.4, 1.4), palette, pal_name), ok, r=1.5)
    sc(ctx, m, shrubs, lambda x, y: shrub(ctx, x, y, random.uniform(0.7, 1.4)), ok, r=0.5)
    sc(ctx, m, dry, lambda x, y: dry_bush(ctx, x, y, random.uniform(0.7, 1.3)), ok, r=0.5)
    sc(ctx, m, acacias, lambda x, y: acacia(ctx, x, y, random.uniform(0.8, 1.25)), ok, r=4)
    sc(ctx, m, dead, lambda x, y: dead_tree(ctx, x, y, random.uniform(0.8, 1.2)), ok, r=2)
    sc(ctx, m, ruins, lambda x, y: K.ruin_site(mb, ctx, x, y, random.uniform(0.8, 1.2)), ok, r=12)
    sc(ctx, m, nbones, lambda x, y: bones(ctx, x, y), ok, r=2)


def group_by_tile(size=None):
    """Parent every placed instance under an Empty and return the empties. size=None (the default for the big maps)
    uses one map-wide group "Props_all", so each prototype is a single InstancedMesh (one draw); a size in metres
    groups per tile (Props_i_j) instead."""
    empties = {}
    for ob in PLACED:
        k = ("all",) if size is None else (math.floor(ob.location.x / size), math.floor(ob.location.y / size))
        e = empties.get(k)
        if e is None:
            e = bpy.data.objects.new("Props_all" if size is None else f"Props_{k[0]}_{k[1]}", None)
            _coll().objects.link(e)
            empties[k] = e
        ob.parent = e
    return list(empties.values())


def field(ctx, x, y, m, w=29.0, d=21.0):
    """Instanced crop plot (one prototype per crop material)."""
    key = f"field_{m.name}_{int(w)}x{int(d)}"

    def build(m=m):
        return _mb_build(lambda mb: S.field_plot(mb, 0, 0, w, d, 0.0, m, furrows=True), key)()
    place(key, build, x, y, L.height(x, y), 0.0, 1.0)



def tent(ctx, x, y, rot, s=1.0):
    """Instanced goat-hair tent (3 stripe variants) with its 7 x 4 collider."""
    v = random.randrange(3)
    key = f"tent{v}"

    def build(v=v):
        random.seed(3700 + v)
        before = set(bpy.data.objects)
        L.tent(0, 0, 0.0, 1.0)
        return [o for o in bpy.data.objects if o not in before][0]
    place(key, build, x, y, L.height(x, y), rot, s)
    ctx.col(x, y, L.height(x, y) + 1 * s, 7 * s, 4 * s, 2 * s, rot, "tent")
