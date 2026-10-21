"""
Animated voxel characters for the game: person, horse, camel.

Each character is an armature plus rigid-skinned box meshes (every vertex
weighted 1.0 to one bone), so it exports to glTF as a SkinnedMesh with clips
that three.js AnimationMixer plays directly.

Blender conventions used here (the glTF exporter converts them):
  * characters face -Y and stand on z = 0  ->  glTF: face +Z, Y up
  * every bone points straight up (+Z) with roll 0, so a pose bone's local
    axes are  X = world X,  Y = world Z (up),  Z = world -Y (forward).
    - rotation X > 0 swings a hanging limb backward / tips an upright bone forward
    - rotation Y twists about the vertical
    - rotation Z > 0 swings a limb toward +X (outward for right-side limbs)
    - pose location.y moves a bone up
"""
import bpy, bmesh, math
from mathutils import Vector

import arabia_lib as L

FPS = 24
R = math.radians


# ------------------------------------------------------------------ builders
class RigMB(L.MB):
    """MB that also writes a rigid deform weight for the current bone group."""

    def __init__(self):
        super().__init__()
        self.dl = self.bm.verts.layers.deform.verify()
        self.groups = []
        self.g = 0

    def grp(self, name):
        if name not in self.groups:
            self.groups.append(name)
        self.g = self.groups.index(name)
        return self

    def _tag(self, verts, m):
        super()._tag(verts, m)
        for v in verts:
            v[self.dl][self.g] = 1.0

    def skinned(self, name, col, arm):
        ob = self.build(name, col)
        for gname in self.groups:
            ob.vertex_groups.new(name=gname)
        ob.parent = arm
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        return ob


def make_armature(name, bones, col):
    """bones: [(name, parent, head_xyz)], every bone 0.15 m long pointing +Z."""
    ad = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, ad)
    col.objects.link(arm)
    vl = bpy.context.view_layer
    for o in bpy.data.objects:
        if o.name in vl.objects:
            o.select_set(False)
    vl.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bn, parent, head in bones:
        eb = ad.edit_bones.new(bn)
        eb.head = head
        eb.tail = Vector(head) + Vector((0, 0, 0.15))
        eb.roll = 0.0
        if parent:
            eb.parent = ad.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "ZYX"           # abduct (Z) first, then flex (X)
    return arm


def mat(name, hexcol, rough=0.85, metallic=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*L.lin(hexcol), 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metallic
    if emit:
        p.inputs["Emission Color"].default_value = (*L.lin(emit), 1)
        p.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*L.lin(hexcol), 1)
    return m


# ------------------------------------------------------------------ clips
def clip(arm, name, length, keys, loop=True):
    """keys: {frame: {bone: {"rot": (x,y,z) deg, "loc": (x,y,z)}}}.

    Every bone mentioned anywhere in the clip is keyed on every key frame (missing
    entries mean rest), so clips only touch the bones they use and can be layered.
    """
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    bones = sorted({b for fr in keys.values() for b in fr})
    for f in sorted(keys):
        for b in bones:
            pb = arm.pose.bones[b]
            d = keys[f].get(b, {})
            pb.rotation_euler = [R(a) for a in d.get("rot", (0, 0, 0))]
            pb.location = d.get("loc", (0, 0, 0))
            pb.keyframe_insert("rotation_euler", frame=f)
            pb.keyframe_insert("location", frame=f)
    act["loop"] = loop
    act["frames"] = length
    try:
        act.use_frame_range = True
        act.frame_range = (1, length + 1)
    except (AttributeError, TypeError):
        pass
    # park it on an NLA track so the exporter sees every clip
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    tr.mute = True
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    return act


def cyc(length, step, fn):
    """Sample fn(phase 0..1) -> pose dict every `step` frames, closing the loop."""
    out = {}
    f = 1
    while f <= length + 1:
        out[f] = fn(((f - 1) % length) / length)
        f += step
    out[length + 1] = fn(0.0)
    return out


def S(t, ph=0.0):
    return math.sin(math.tau * (t + ph))


_AIM_CACHE = {}


def limb_euler(d_world, twist=0.0):
    """Euler (deg, rotation_mode ZYX) that points a hanging limb along d_world when its
    parent bone (the spine) is twisted `twist` deg about the vertical. Grid search, then refine."""
    from mathutils import Euler, Matrix
    key = (tuple(round(c, 3) for c in d_world), round(twist, 2))
    if key in _AIM_CACHE:
        return _AIM_CACHE[key]
    d = Matrix.Rotation(R(-twist), 3, "Z") @ Vector(d_world).normalized()
    target = Vector((d.x, d.z, -d.y))                 # world -> bone-local (X, Y=up, Z=-forward)
    down = Vector((0, -1, 0))

    def err(xa, zc):
        return ((Euler((R(xa), 0, R(zc)), "ZYX").to_matrix() @ down) - target).length
    best = min(((err(xa, zc), xa, zc) for zc in range(-120, 121, 4) for xa in range(-210, 91, 4)))
    _, bx, bz = best
    for step in (1.0, 0.25):
        cands = [(err(bx + i * step, bz + j * step), bx + i * step, bz + j * step)
                 for i in range(-4, 5) for j in range(-4, 5)]
        _, bx, bz = min(cands)
    _AIM_CACHE[key] = (round(bx, 2), 0.0, round(bz, 2))
    return _AIM_CACHE[key]


def counter_euler(e):
    """Euler (deg, ZYX) that undoes the rotation e (deg, ZYX): keeps a child (the bow hand) upright."""
    from mathutils import Euler
    inv = Euler([R(a) for a in e], "ZYX").to_matrix().inverted().to_euler("ZYX")
    return tuple(round(math.degrees(a), 2) for a in inv)


# ------------------------------------------------------------------ person
PERSON_BONES = [
    ("root", None, (0, 0, 0)),
    ("hips", "root", (0, 0, 0.88)),
    ("leg_L", "hips", (-0.13, 0, 0.88)),
    ("leg_R", "hips", (0.13, 0, 0.88)),
    ("spine", "hips", (0, 0, 1.0)),
    ("head", "spine", (0, 0, 1.5)),
    ("arm_L", "spine", (-0.34, 0, 1.43)),
    ("arm_R", "spine", (0.34, 0, 1.43)),
    ("hand_L", "arm_L", (-0.34, 0, 0.84)),
    ("hand_R", "arm_R", (0.34, 0, 0.84)),
]


def build_person(col):
    """One rig, a base body and toggleable accessory meshes. Material names are
    the recolour API: P_Robe, P_Sash, P_Pants, P_Skin, P_Wrap, P_Hair ..."""
    arm = make_armature("Person", PERSON_BONES, col)
    robe = mat("P_Robe", "#e9dfc8", 0.9)
    sash = mat("P_Sash", "#8b2a1f", 0.9)
    pants = mat("P_Pants", "#5a4632", 0.9)
    skin = mat("P_Skin", "#a86b45", 0.6)
    leather = mat("P_Leather", "#5a3520", 0.7)
    eyes = mat("P_Eyes", "#140c08", 0.5)
    hair = mat("P_Hair", "#1a120c", 0.8)
    wrap = mat("P_Wrap", "#f4efe4", 0.9)
    steel = mat("P_Steel", "#c9cdd2", 0.25, metallic=1.0)
    brass = mat("P_Brass", "#c99a3a", 0.35, metallic=1.0)
    clay = mat("P_Clay", "#b0603a", 0.8)

    mb = RigMB()
    for side, sx in (("L", -0.13), ("R", 0.13)):
        mb.grp("leg_" + side)
        mb.box((sx, 0, 0.47), (0.19, 0.21, 0.86), pants)
        mb.box((sx, -0.03, 0.035), (0.2, 0.3, 0.07), leather)
    mb.grp("hips").box((0, 0, 0.73), (0.56, 0.38, 0.56), robe)            # tunic skirt
    mb.grp("spine").box((0, 0, 1.25), (0.52, 0.34, 0.5), robe)
    mb.box((0, 0, 1.03), (0.55, 0.37, 0.1), sash)
    mb.box((0, -0.172, 1.4), (0.18, 0.01, 0.16), skin)                   # open collar
    mb.grp("head").box((0, 0, 1.54), (0.14, 0.14, 0.1), skin)
    mb.box((0, 0, 1.76), (0.34, 0.34, 0.34), skin)
    for sx in (-0.08, 0.08):
        mb.box((sx, -0.172, 1.79), (0.05, 0.01, 0.05), eyes)
    mb.box((0, -0.18, 1.73), (0.05, 0.03, 0.06), skin)                   # nose
    for side, sx in (("L", -0.34), ("R", 0.34)):
        mb.grp("arm_" + side)
        mb.box((sx, 0, 1.17), (0.15, 0.17, 0.56), robe)
        mb.box((sx, 0, 0.83), (0.13, 0.14, 0.13), skin)
    body = mb.skinned("Body", col, arm)

    def acc(name, parts):
        a = RigMB()
        for bone, kind, args in parts:
            a.grp(bone)
            getattr(a, kind)(*args)
        o = a.skinned(name, col, arm)
        o["accessory"] = True
        return o

    acc("Beard", [("head", "box", ((0, -0.12, 1.62), (0.36, 0.14, 0.16), hair))])
    acc("Hair", [("head", "box", ((0, 0.03, 1.94), (0.36, 0.36, 0.08), hair)),
                 ("head", "box", ((0, 0.12, 1.8), (0.36, 0.14, 0.3), hair))])
    acc("Keffiyeh", [("head", "box", ((0, 0.02, 1.96), (0.4, 0.4, 0.14), wrap)),
                     ("head", "box", ((0, 0.08, 1.71), (0.42, 0.3, 0.42), wrap)),
                     ("head", "box", ((0, 0.02, 1.98), (0.42, 0.42, 0.05), hair))])
    acc("Turban", [("head", "box", ((0, 0.02, 1.96), (0.4, 0.4, 0.14), wrap)),
                   ("head", "box", ((0, 0.02, 2.06), (0.34, 0.34, 0.1), wrap))])
    acc("Veil", [("head", "box", ((0, 0.04, 1.81), (0.4, 0.38, 0.46), wrap)),
                 ("head", "box", ((0, 0.13, 1.55), (0.44, 0.18, 0.5), wrap))])
    acc("Jar", [("head", "cyl", ((0, 0, 2.18), 0.17, 0.1, 0.42, clay)),
                ("head", "cyl", ((0, 0, 2.02), 0.1, 0.17, 0.12, clay))])
    # straight Arabian sword in the right fist, blade pointing forward-down
    d = Vector((0, -math.cos(R(30)), -math.sin(R(30))))
    hand = Vector((0.34, 0, 0.83))
    rot = (R(120), 0, 0)                     # local +Z -> d
    acc("Sword", [
        ("hand_R", "box", (hand + d * 0.55, (0.02, 0.07, 0.82), steel, rot)),        # blade
        ("hand_R", "box", (hand + d * 0.98, (0.02, 0.045, 0.06), steel, rot)),       # tip
        ("hand_R", "box", (hand + d * 0.11, (0.05, 0.26, 0.04), brass, rot)),        # guard
        ("hand_R", "box", (hand, (0.04, 0.04, 0.18), mat("P_Grip", "#3a2414", 0.8), rot)),
        ("hand_R", "box", (hand - d * 0.11, (0.06, 0.06, 0.05), brass, rot)),        # pommel
    ])
    # ---- v3 gear: raider kit, armour and travel accessories (toggle with .visible)
    mask = mat("P_Mask", "#2a2420", 0.9)
    band = mat("P_Band", "#8b1e1e", 0.9)
    mail = mat("P_Mail", "#6f6e6a", 0.5, metallic=0.8)
    vest = mat("P_Vest", "#6b4423", 0.75)
    armor = mat("P_Armor", "#7a5a3a", 0.6)
    trim = mat("P_ArmorTrim", "#b08a4a", 0.5, metallic=0.6)
    cloak = mat("P_Cloak", "#4b3a2c", 0.95)
    shield_wood = mat("P_Shield", "#7a5232", 0.8)
    shield_paint = mat("P_ShieldPaint", "#8b1e1e", 0.8)
    skin_bag = mat("P_Waterskin", "#8a5a32", 0.7)
    bow_wood = mat("P_Bow", "#5a3a22", 0.7)
    shaft = mat("P_Wood", "#7a5a3a", 0.8)
    fletch = mat("P_Fletch", "#e8e0d0", 0.9)
    acc("FaceWrap", [("head", "box", ((0, -0.125, 1.67), (0.37, 0.12, 0.2), mask))])
    acc("Headband", [("head", "box", ((0, 0, 1.86), (0.36, 0.36, 0.06), band)),
                     ("head", "box", ((0, 0.2, 1.8), (0.05, 0.04, 0.2), band))])
    acc("Helmet", [("head", "box", ((0, 0, 1.98), (0.38, 0.38, 0.14), steel)),
                   ("head", "box", ((0, 0, 2.07), (0.26, 0.26, 0.08), steel)),
                   ("head", "cyl", ((0, 0, 2.17), 0.04, 0.0, 0.14, steel)),
                   ("head", "box", ((0, -0.18, 1.82), (0.04, 0.02, 0.16), steel)),
                   ("head", "box", ((0, 0.06, 1.68), (0.4, 0.32, 0.22), mail))])
    acc("BeardLong", [("head", "box", ((0, -0.13, 1.56), (0.34, 0.12, 0.32), hair))])
    acc("Vest", [("spine", "box", ((0, 0, 1.25), (0.56, 0.38, 0.44), vest)),
                 ("arm_L", "box", ((-0.34, 0, 1.4), (0.2, 0.22, 0.12), vest)),
                 ("arm_R", "box", ((0.34, 0, 1.4), (0.2, 0.22, 0.12), vest))])
    lam = [("spine", "box", ((0, 0, 1.25), (0.57, 0.39, 0.46), armor)),
           ("hips", "box", ((0, 0, 0.86), (0.6, 0.42, 0.28), armor)),
           ("arm_L", "box", ((-0.34, 0, 1.42), (0.22, 0.24, 0.14), armor)),
           ("arm_R", "box", ((0.34, 0, 1.42), (0.22, 0.24, 0.14), armor))]
    lam += [("spine", "box", ((0, 0, 1.07 + k * 0.12), (0.58, 0.4, 0.025), trim)) for k in range(4)]
    lam += [("hips", "box", ((0, 0, 0.76 + k * 0.1), (0.61, 0.43, 0.025), trim)) for k in range(2)]
    acc("Lamellar", lam)
    acc("Cloak", [("spine", "box", ((0, 0.04, 1.47), (0.6, 0.42, 0.08), cloak)),
                  ("spine", "box", ((0, 0.21, 1.02), (0.58, 0.05, 0.96), cloak)),
                  ("spine", "box", ((0, -0.18, 1.44), (0.08, 0.02, 0.08), brass))])
    sc = Vector((-0.38, -0.17, 1.0))                     # round shield on the left forearm, face forward
    acc("Shield", [("hand_L", "cyl", (sc, 0.34, 0.34, 0.06, shield_wood, 12, (R(90), 0, 0))),
                   ("hand_L", "cyl", (sc + Vector((0, -0.006, 0)), 0.22, 0.22, 0.065, shield_paint, 12, (R(90), 0, 0))),
                   ("hand_L", "cyl", (sc + Vector((0, 0.02, 0)), 0.36, 0.36, 0.04, brass, 12, (R(90), 0, 0))),
                   ("hand_L", "cyl", (sc + Vector((0, -0.05, 0)), 0.08, 0.06, 0.08, brass, 8, (R(90), 0, 0)))])
    sd = Vector((0, -0.1, 1)).normalized()               # spear held upright; Thrust levels it with hand_R
    srot = (math.asin(0.1 / Vector((0, -0.1, 1)).length), 0, 0)
    acc("Spear", [("hand_R", "box", (hand + sd * 0.3, (0.05, 0.05, 2.4), shaft, srot)),
                  ("hand_R", "box", (hand + sd * 1.47, (0.06, 0.06, 0.08), steel, srot)),
                  ("hand_R", "box", (hand + sd * 1.64, (0.08, 0.02, 0.28), steel, srot)),
                  ("hand_R", "box", (hand - sd * 0.9, (0.06, 0.06, 0.06), steel, srot))])
    acc("Waterskin", [("hips", "box", ((0.31, 0.1, 0.8), (0.16, 0.13, 0.3), skin_bag)),
                      ("spine", "box", ((0, -0.176, 1.22), (0.05, 0.02, 0.62), leather, (0, R(35), 0))),
                      ("spine", "box", ((0, 0.176, 1.22), (0.05, 0.02, 0.62), leather, (0, R(-35), 0)))])
    acc("Bow", [("spine", "box", ((0, 0.23, 1.2), (0.05, 0.05, 0.95), bow_wood, (0, R(35), 0))),
                ("spine", "box", ((0.33, 0.23, 1.58), (0.04, 0.04, 0.3), bow_wood, (0, R(70), 0))),
                ("spine", "box", ((-0.33, 0.23, 0.82), (0.04, 0.04, 0.3), bow_wood, (0, R(70), 0))),
                ("spine", "box", ((0.02, 0.25, 1.2), (0.01, 0.01, 1.3), fletch, (0, R(35), 0))),
                ("spine", "box", ((-0.15, 0.22, 1.25), (0.13, 0.1, 0.5), leather, (0, R(-20), 0))),
                ("spine", "box", ((-0.19, 0.22, 1.54), (0.1, 0.08, 0.1), fletch, (0, R(-20), 0)))])
    acc("Belly", [("spine", "box", ((0, -0.08, 1.13), (0.6, 0.44, 0.34), robe))])
    # ---- v5: held composite bow (left hand), back quiver, club, sling
    sinew = mat("P_BowSinew", "#c9a46b", 0.7)
    horn = mat("P_BowHorn", "#2b2622", 0.5)
    siyah = mat("P_BowTip", "#e8dcc4", 0.6)
    gl = Vector((-0.34, 0, 0.83))                       # left fist; limbs vertical, string on +Y (toward the body when aiming)
    bow = [("hand_L", "box", (gl, (0.05, 0.06, 0.16), leather))]
    for sg in (1, -1):                                   # sg = upper / lower limb
        bow += [("hand_L", "box", (gl + Vector((0, 0.06, sg * 0.31)), (0.045, 0.035, 0.5), sinew, (R(-14 * sg), 0, 0))),
                ("hand_L", "box", (gl + Vector((0, 0.083, sg * 0.31)), (0.04, 0.012, 0.48), horn, (R(-14 * sg), 0, 0))),
                ("hand_L", "box", (gl + Vector((0, 0.1, sg * 0.63)), (0.04, 0.03, 0.18), siyah, (R(25 * sg), 0, 0)))]
    bow += [("hand_L", "box", (gl + Vector((0, 0.075, 0)), (0.008, 0.008, 1.38), fletch))]          # string
    acc("BowHeld", bow)
    qv = [("spine", "box", ((0.17, 0.21, 1.18), (0.15, 0.13, 0.56), leather, (0, R(-22), 0))),
          ("spine", "box", ((0.17, 0.21, 1.0), (0.17, 0.15, 0.06), brass, (0, R(-22), 0)))]
    for k in range(6):                                   # arrow nocks and dark fletching above the mouth
        ox, oy = (k % 3 - 1) * 0.04, (k // 3) * 0.04 - 0.02
        qv += [("spine", "box", ((0.27 + ox, 0.21 + oy, 1.5), (0.012, 0.012, 0.14), shaft, (0, R(-22), 0))),
               ("spine", "box", ((0.29 + ox, 0.21 + oy, 1.55), (0.03, 0.01, 0.07), mask, (0, R(-22), 0)))]
    acc("Quiver", qv)
    cd = Vector((0, -math.cos(R(30)), -math.sin(R(30))))                                            # like the sword
    club_wood = mat("P_Club", "#5e3f26", 0.85)
    club = [("hand_R", "box", (hand + cd * 0.35, (0.07, 0.07, 0.9), club_wood, (R(120), 0, 0))),
            ("hand_R", "box", (hand + cd * 0.82, (0.17, 0.17, 0.22), club_wood, (R(120), 0, 0))),
            ("hand_R", "box", (hand - cd * 0.1, (0.08, 0.08, 0.06), leather, (R(120), 0, 0)))]
    for k in range(6):                                   # bronze studs round the head
        a = k / 6 * math.tau
        off = Vector((math.cos(a) * 0.1, 0, math.sin(a) * 0.1))
        off = Vector((off.x, off.z * math.sin(R(30)), -off.z * math.cos(R(30)) * 0))
        club += [("hand_R", "box", (hand + cd * (0.76 + 0.06 * (k % 2)) + Vector((math.cos(a) * 0.095, 0, 0))
                                    + Vector((0, math.sin(a) * 0.095 * math.sin(R(30)), math.sin(a) * 0.095 * math.cos(R(30)))),
                                    (0.04, 0.04, 0.04), brass, (R(120), 0, 0)))]
    acc("Club", club)
    acc("Sling", [("hand_R", "box", (hand + Vector((0, -0.02, -0.2)), (0.012, 0.012, 0.36), mat("P_SlingCord", "#d9c9a3", 0.9))),
                  ("hand_R", "box", (hand + Vector((0, -0.02, -0.4)), (0.07, 0.05, 0.06), leather))])
    person_clips(arm)
    return arm


def person_clips(arm):
    rest = {}
    # Idle 2 s: breathing, slight weight shift
    clip(arm, "Idle", 48, cyc(48, 6, lambda t: {
        "hips": {"loc": (0, 0.008 * S(t), 0)},
        "spine": {"rot": (1.5 * S(t), 0, 0)},
        "head": {"rot": (-1.5 * S(t), 4 * S(t, 0.2), 0)},
        "arm_L": {"rot": (2 * S(t), 0, -3)},
        "arm_R": {"rot": (2 * S(t), 0, 3)},
    }))

    def gait(amp_leg, amp_arm, bob, lean, twist):
        def f(t):
            s = S(t)
            return {
                "hips": {"loc": (0, bob * abs(math.cos(math.tau * t)), 0)},
                "leg_L": {"rot": (-amp_leg * s, 0, 0)},
                "leg_R": {"rot": (amp_leg * s, 0, 0)},
                "arm_L": {"rot": (amp_arm * s, 0, -4)},
                "arm_R": {"rot": (-amp_arm * s, 0, 4)},
                "spine": {"rot": (lean, twist * s, 0)},
                "head": {"rot": (-lean * 0.6, -twist * s * 0.5, 0)},
            }
        return f
    clip(arm, "Walk", 24, cyc(24, 2, gait(26, 22, 0.035, 2, 5)))     # ~1.5 m/s
    clip(arm, "Run", 16, cyc(16, 1, gait(52, 48, 0.07, 12, 9)))      # ~4.8 m/s

    # Attack: overhead chop. Upper body only (layer over Walk/Ride). Hit lands ~frame 10.
    clip(arm, "Attack", 18, {
        1: rest,
        6: {"spine": {"rot": (-8, 18, 0)}, "arm_R": {"rot": (-200, 0, 8)},
            "arm_L": {"rot": (-35, 0, -10)}, "head": {"rot": (-6, -10, 0)}},
        10: {"spine": {"rot": (18, -16, 0)}, "arm_R": {"rot": (-22, 0, -6)},
             "arm_L": {"rot": (15, 0, -8)}, "head": {"rot": (6, 8, 0)}},
        13: {"spine": {"rot": (16, -14, 0)}, "arm_R": {"rot": (-18, 0, -6)},
             "arm_L": {"rot": (12, 0, -8)}, "head": {"rot": (5, 6, 0)}},
        19: rest,
    }, loop=False)
    # Attack2: diagonal slash from high right to low left
    clip(arm, "Attack2", 16, {
        1: rest,
        5: {"spine": {"rot": (-4, 35, 0)}, "arm_R": {"rot": (-40, 0, 105)},
            "arm_L": {"rot": (-20, 0, -15)}},
        9: {"spine": {"rot": (14, -35, 0)}, "arm_R": {"rot": (-75, 0, -25)},
            "arm_L": {"rot": (20, 0, -10)}},
        12: {"spine": {"rot": (12, -32, 0)}, "arm_R": {"rot": (-70, 0, -22)},
             "arm_L": {"rot": (18, 0, -10)}},
        17: rest,
    }, loop=False)
    clip(arm, "Hit", 12, {
        1: rest,
        3: {"spine": {"rot": (-16, 6, 0)}, "head": {"rot": (-18, 0, 0)},
            "arm_L": {"rot": (-30, 0, -30)}, "arm_R": {"rot": (-30, 0, 30)}},
        13: rest,
    }, loop=False)
    clip(arm, "Death", 30, {
        1: rest,
        6: {"spine": {"rot": (-12, 0, 0)}, "head": {"rot": (-15, 0, 0)},
            "arm_L": {"rot": (-40, 0, -35)}, "arm_R": {"rot": (-40, 0, 35)},
            "leg_L": {"rot": (-15, 0, 0)}},
        20: {"root": {"rot": (-88, 0, 0), "loc": (0, 0.18, 0)},
             "spine": {"rot": (-6, 0, 0)}, "head": {"rot": (-8, 25, 0)},
             "arm_L": {"rot": (-150, 0, -40)}, "arm_R": {"rot": (-120, 0, 50)},
             "leg_L": {"rot": (-10, 0, -8)}, "leg_R": {"rot": (4, 0, 10)}},
        30: {"root": {"rot": (-90, 0, 0), "loc": (0, 0.17, 0)},
             "spine": {"rot": (-6, 0, 0)}, "head": {"rot": (-8, 30, 0)},
             "arm_L": {"rot": (-155, 0, -40)}, "arm_R": {"rot": (-125, 0, 50)},
             "leg_L": {"rot": (-10, 0, -8)}, "leg_R": {"rot": (4, 0, 10)}},
    }, loop=False)
    # Talk: hand gestures and nods, upper body only
    clip(arm, "Talk", 48, {
        1: {"arm_R": {"rot": (-15, 0, 6)}, "head": {"rot": (0, 0, 0)}},
        12: {"arm_R": {"rot": (-55, 0, 18)}, "arm_L": {"rot": (-10, 0, -6)}, "head": {"rot": (5, 6, 0)}},
        24: {"arm_R": {"rot": (-30, 0, 10)}, "arm_L": {"rot": (-25, 0, -12)}, "head": {"rot": (-3, -4, 0)}},
        36: {"arm_R": {"rot": (-60, 0, 25)}, "head": {"rot": (6, 3, 0)}},
        49: {"arm_R": {"rot": (-15, 0, 6)}, "head": {"rot": (0, 0, 0)}},
    })
    # Ride: legs straddle the saddle, hands on the reins. Attach the root to a mount bone.
    clip(arm, "Ride", 12, cyc(12, 1, lambda t: {
        "hips": {"loc": (0, 0.025 * S(t), 0)},
        "leg_L": {"rot": (-28, 0, -36)},
        "leg_R": {"rot": (-28, 0, 36)},
        "arm_L": {"rot": (-42, 0, 8)},
        "arm_R": {"rot": (-42, 0, -8)},
        "spine": {"rot": (6 + 3 * S(t, 0.25), 0, 0)},
    }))
    # Roll: forward dodge roll (full body, plays in place; the game moves the root).
    # The root tumbles 360 deg about a pivot at hip height, with limbs tucked.
    def roll_pose(u):
        # u: 0..1 through the tumble
        th = 360.0 * u
        h = 0.5                                  # pivot height above the feet
        hop = 0.12 * math.sin(math.pi * u)
        r = R(th)
        tuck = math.sin(math.pi * min(1.0, u * 1.15))
        return {
            # loc = p - R p for a pivot p = (0, h, 0) in root space (y up, z forward)
            "root": {"rot": (th, 0, 0), "loc": (0, h * (1 - math.cos(r)) + hop, -h * math.sin(r))},
            "hips": {"loc": (0, -0.3 * tuck, 0)},
            "spine": {"rot": (40 * tuck, 0, 0)},
            "head": {"rot": (30 * tuck, 0, 0)},
            "leg_L": {"rot": (-105 * tuck, 0, -6)},
            "leg_R": {"rot": (-105 * tuck, 0, 6)},
            "arm_L": {"rot": (-70 * tuck, 0, -12)},
            "arm_R": {"rot": (-70 * tuck, 0, 12)},
        }
    roll = {1: {"hips": {"loc": (0, -0.12, 0)}, "spine": {"rot": (18, 0, 0)},
                "leg_L": {"rot": (-30, 0, 0)}, "leg_R": {"rot": (-20, 0, 0)}}}
    for i in range(11):                          # frames 2..12, 36 deg per frame
        roll[2 + i] = roll_pose(i / 10)
    roll[13] = {"hips": {"loc": (0, -0.1, 0)}, "spine": {"rot": (12, 0, 0)},
                "leg_L": {"rot": (-24, 0, 0)}, "leg_R": {"rot": (-10, 0, 0)}}
    roll[15] = rest
    clip(arm, "Roll", 14, roll, loop=False)
    # Jump: crouch, push off, tuck in the air, land (full body, in place; the game
    # moves the root up and down). 14 frames = 0.58 s, matching the game's arc.
    clip(arm, "Jump", 14, {
        1: {"hips": {"loc": (0, -0.14, 0)}, "spine": {"rot": (14, 0, 0)},
            "leg_L": {"rot": (-34, 0, 0)}, "leg_R": {"rot": (-34, 0, 0)},
            "arm_L": {"rot": (30, 0, -10)}, "arm_R": {"rot": (30, 0, 10)}},
        3: {"spine": {"rot": (-6, 0, 0)}, "head": {"rot": (-8, 0, 0)},
            "leg_L": {"rot": (8, 0, 0)}, "leg_R": {"rot": (14, 0, 0)},
            "arm_L": {"rot": (-150, 0, -14)}, "arm_R": {"rot": (-150, 0, 14)}},
        6: {"hips": {"loc": (0, 0.05, 0)}, "spine": {"rot": (6, 0, 0)},
            "leg_L": {"rot": (-62, 0, -4)}, "leg_R": {"rot": (-30, 0, 4)},
            "arm_L": {"rot": (-110, 0, -26)}, "arm_R": {"rot": (-110, 0, 26)}},
        10: {"hips": {"loc": (0, 0.03, 0)}, "spine": {"rot": (4, 0, 0)},
             "leg_L": {"rot": (-40, 0, -4)}, "leg_R": {"rot": (-20, 0, 4)},
             "arm_L": {"rot": (-70, 0, -30)}, "arm_R": {"rot": (-70, 0, 30)}},
        13: {"hips": {"loc": (0, -0.16, 0)}, "spine": {"rot": (16, 0, 0)},
             "leg_L": {"rot": (-36, 0, 0)}, "leg_R": {"rot": (-30, 0, 0)},
             "arm_L": {"rot": (-20, 0, -16)}, "arm_R": {"rot": (-20, 0, 16)}},
        15: rest,
    }, loop=False)
    # ---- v3 combat clips. "hit" = frame the blow lands (exported as hit_time).
    # HeavyAttack: two-handed overhead with a long, readable raise (windup frames 1-20).
    clip(arm, "HeavyAttack", 34, {
        1: rest,
        14: {"spine": {"rot": (-14, 8, 0)}, "head": {"rot": (-10, 0, 0)},
             "arm_R": {"rot": (-170, 0, -28)}, "arm_L": {"rot": (-170, 0, 28)}},
        20: {"spine": {"rot": (-17, 9, 0)}, "head": {"rot": (-12, 0, 0)},
             "arm_R": {"rot": (-176, 0, -28)}, "arm_L": {"rot": (-176, 0, 28)}},
        26: {"spine": {"rot": (26, -6, 0)}, "head": {"rot": (12, 0, 0)},
             "arm_R": {"rot": (-24, 0, -22)}, "arm_L": {"rot": (-24, 0, 22)}},
        30: {"spine": {"rot": (24, -5, 0)}, "head": {"rot": (10, 0, 0)},
             "arm_R": {"rot": (-20, 0, -20)}, "arm_L": {"rot": (-20, 0, 20)}},
        35: rest,
    }, loop=False)
    # Thrust: spear (or sword) lunge; hand_R keeps the weapon level as the arm drives forward.
    clip(arm, "Thrust", 20, {
        1: rest,
        6: {"spine": {"rot": (-4, 26, 0)}, "arm_R": {"rot": (22, 0, 6)}, "hand_R": {"rot": (68, 0, 0)},
            "arm_L": {"rot": (-30, 0, -10)}},
        9: {"spine": {"rot": (14, -24, 0)}, "arm_R": {"rot": (-72, 0, -4)}, "hand_R": {"rot": (162, 0, 0)},
            "arm_L": {"rot": (20, 0, -12)}, "head": {"rot": (6, 6, 0)}},
        12: {"spine": {"rot": (12, -22, 0)}, "arm_R": {"rot": (-68, 0, -4)}, "hand_R": {"rot": (158, 0, 0)},
             "arm_L": {"rot": (18, 0, -12)}, "head": {"rot": (5, 5, 0)}},
        21: rest,
    }, loop=False)
    # Block: shield (left forearm) up in front, weapon ready. Loops while held.
    clip(arm, "Block", 24, cyc(24, 6, lambda t: {
        "arm_L": {"rot": (-58 + 2 * S(t), 0, 30)},
        "arm_R": {"rot": (-28, 0, 10)},
        "spine": {"rot": (9 + 1.5 * S(t), -6, 0)},
        "head": {"rot": (6, 4, 0)},
    }))
    clip(arm, "BlockHit", 10, {
        1: {"arm_L": {"rot": (-58, 0, 30)}, "arm_R": {"rot": (-28, 0, 10)}, "spine": {"rot": (9, -6, 0)},
            "head": {"rot": (6, 4, 0)}},
        3: {"arm_L": {"rot": (-38, 0, 22)}, "arm_R": {"rot": (-18, 0, 14)}, "spine": {"rot": (-8, -2, 0)},
            "head": {"rot": (-6, 4, 0)}},
        11: {"arm_L": {"rot": (-58, 0, 30)}, "arm_R": {"rot": (-28, 0, 10)}, "spine": {"rot": (9, -6, 0)},
             "head": {"rot": (6, 4, 0)}},
    }, loop=False)
    # Stagger: guard broken, full body reel with a step back
    clip(arm, "Stagger", 20, {
        1: rest,
        4: {"hips": {"loc": (0, -0.05, 0)}, "spine": {"rot": (-28, 10, 0)}, "head": {"rot": (-22, -10, 0)},
            "arm_L": {"rot": (-55, 0, -42)}, "arm_R": {"rot": (-50, 0, 40)}, "leg_R": {"rot": (24, 0, 4)},
            "leg_L": {"rot": (-8, 0, 0)}},
        10: {"hips": {"loc": (0, -0.08, 0)}, "spine": {"rot": (-16, -6, 0)}, "head": {"rot": (-10, 6, 0)},
             "arm_L": {"rot": (-30, 0, -30)}, "arm_R": {"rot": (-24, 0, 28)}, "leg_R": {"rot": (16, 0, 4)},
             "leg_L": {"rot": (-14, 0, 0)}},
        21: rest,
    }, loop=False)
    lying = {"root": {"rot": (-90, 0, 0), "loc": (0, 0.17, 0)}, "spine": {"rot": (-4, 0, 0)},
             "head": {"rot": (-6, -15, 0)}, "arm_L": {"rot": (-140, 0, -45)}, "arm_R": {"rot": (-120, 0, 45)},
             "leg_L": {"rot": (-6, 0, -10)}, "leg_R": {"rot": (6, 0, 10)}}
    # Knockdown: thrown on the back (ends lying; follow with GetUp)
    clip(arm, "Knockdown", 18, {
        1: rest,
        5: {"spine": {"rot": (-22, 0, 0)}, "head": {"rot": (-20, 0, 0)},
            "arm_L": {"rot": (-70, 0, -40)}, "arm_R": {"rot": (-70, 0, 40)}, "leg_L": {"rot": (-25, 0, 0)}},
        12: {"root": {"rot": (-86, 0, 0), "loc": (0, 0.2, 0)}, "spine": {"rot": (-8, 0, 0)},
             "head": {"rot": (-14, -10, 0)}, "arm_L": {"rot": (-150, 0, -50)}, "arm_R": {"rot": (-130, 0, 50)},
             "leg_L": {"rot": (-30, 0, -10)}, "leg_R": {"rot": (-10, 0, 10)}},
        18: lying,
    }, loop=False)
    clip(arm, "GetUp", 30, {
        1: lying,
        10: {"root": {"rot": (-40, 0, 0), "loc": (0, 0.05, 0)}, "hips": {"loc": (0, -0.1, 0)},
             "spine": {"rot": (20, 0, 0)}, "head": {"rot": (10, 0, 0)},
             "arm_L": {"rot": (25, 0, -20)}, "arm_R": {"rot": (25, 0, 20)},
             "leg_L": {"rot": (-75, 0, -10)}, "leg_R": {"rot": (-55, 0, 10)}},
        18: {"root": {"rot": (0, 0, 0), "loc": (0, 0, 0)}, "hips": {"loc": (0, -0.36, 0)},
             "spine": {"rot": (32, 0, 0)}, "head": {"rot": (-10, 0, 0)},
             "arm_L": {"rot": (-30, 0, -15)}, "arm_R": {"rot": (-30, 0, 15)},
             "leg_L": {"rot": (-55, 0, -6)}, "leg_R": {"rot": (-30, 0, 6)}},
        24: {"hips": {"loc": (0, -0.1, 0)}, "spine": {"rot": (10, 0, 0)},
             "leg_L": {"rot": (-15, 0, 0)}, "leg_R": {"rot": (-8, 0, 0)}},
        31: rest,
    }, loop=False)
    # Backstep: quick hop back out of reach (in place; the game moves the root ~1.6 m back)
    clip(arm, "Backstep", 12, {
        1: rest,
        4: {"hips": {"loc": (0, -0.07, 0)}, "spine": {"rot": (-10, 0, 0)}, "head": {"rot": (4, 0, 0)},
            "leg_R": {"rot": (36, 0, 0)}, "leg_L": {"rot": (-12, 0, 0)},
            "arm_L": {"rot": (-30, 0, -14)}, "arm_R": {"rot": (-34, 0, 12)}},
        8: {"hips": {"loc": (0, 0.03, 0)}, "spine": {"rot": (-4, 0, 0)},
            "leg_R": {"rot": (12, 0, 0)}, "leg_L": {"rot": (22, 0, 0)},
            "arm_L": {"rot": (-20, 0, -10)}, "arm_R": {"rot": (-24, 0, 10)}},
        13: rest,
    }, loop=False)
    for name, f in (("Attack", 10), ("Attack2", 9), ("HeavyAttack", 26), ("Thrust", 9)):
        bpy.data.actions[name]["hit"] = f
    bpy.data.actions["HeavyAttack"]["windup_end"] = 20

    # ---- v5 archery: bow arm points forward, the left hand counter-rotates so the bow stays upright,
    # the right hand draws to the anchor (the single-segment arm stops ~at the left shoulder / chin line)
    from mathutils import Matrix as _Mx

    def shoulders(tw):
        rz = _Mx.Rotation(R(tw), 3, "Z")
        return rz @ Vector((-0.34, 0, 0.43)) + Vector((0, 0, 1.0)), rz @ Vector((0.34, 0, 0.43)) + Vector((0, 0, 1.0))

    def bow_pose(tw, aim=(0, -1, 0.04), draw=1.0, sway=0.0):
        ls, rs = shoulders(tw)
        aim_v = Vector(aim).normalized()
        al = limb_euler(tuple(aim_v), tw)
        grip = ls + aim_v * 0.6
        anchor = ls + Vector((0, 0, 0.12))
        target = grip.lerp(anchor, draw)
        ar = limb_euler(tuple(target - rs), tw)
        return {"spine": {"rot": (2 + sway, tw, 0)}, "head": {"rot": (-2, -tw * 0.85, 0)},
                "arm_L": {"rot": al}, "hand_L": {"rot": counter_euler(al)}, "arm_R": {"rot": ar}}
    clip(arm, "BowDraw", 13, {
        1: {"spine": {"rot": (0, 0, 0)}, "arm_L": {"rot": limb_euler((0, -0.45, -0.9), 0)},
            "hand_L": {"rot": counter_euler(limb_euler((0, -0.45, -0.9), 0))}, "arm_R": {"rot": (-20, 0, -8)}},
        5: bow_pose(24, draw=0.0),
        9: bow_pose(32, draw=0.6),
        13: bow_pose(35, draw=1.0),
    }, loop=False)
    clip(arm, "BowAim", 24, cyc(24, 4, lambda t: bow_pose(35, aim=(0.012 * S(t), -1, 0.04 + 0.01 * S(t, 0.3)), draw=1.0,
                                                          sway=0.8 * S(t, 0.15))))
    ls35, rs35 = shoulders(35)
    rel = bow_pose(35, draw=1.0)
    fly = dict(rel)
    fly["arm_R"] = {"rot": limb_euler((0.55, 0.45, 0.12), 35)}
    fly["spine"] = {"rot": (0, 37, 0)}
    back = dict(rel)
    back["arm_R"] = {"rot": limb_euler((0.25, 0.55, -0.7), 30)}
    back["spine"] = {"rot": (0, 30, 0)}
    back["arm_L"] = {"rot": limb_euler((0, -0.95, -0.15), 30)}
    back["hand_L"] = {"rot": counter_euler(limb_euler((0, -0.95, -0.15), 30))}
    clip(arm, "BowRelease", 6, {1: rel, 3: fly, 7: back}, loop=False)
    bpy.data.actions["BowRelease"]["release"] = 1

    # Throw: overhand stone (or sling) throw; release at frame 9
    clip(arm, "Throw", 16, {
        1: rest,
        6: {"spine": {"rot": (-8, 26, 0)}, "arm_R": {"rot": (-165, 0, 14)}, "arm_L": {"rot": (-62, 0, -12)},
            "head": {"rot": (-4, -16, 0)}},
        9: {"spine": {"rot": (14, -24, 0)}, "arm_R": {"rot": (-75, 0, -6)}, "arm_L": {"rot": (8, 0, -18)},
            "head": {"rot": (6, 10, 0)}},
        12: {"spine": {"rot": (16, -26, 0)}, "arm_R": {"rot": (-30, 0, -22)}, "arm_L": {"rot": (18, 0, -14)}},
        17: rest,
    }, loop=False)
    bpy.data.actions["Throw"]["hit"] = 9
    # ClubSwing: one-handed overhead slam with a long, readable raise
    clip(arm, "ClubSwing", 30, {
        1: rest,
        14: {"spine": {"rot": (-16, 22, 0)}, "arm_R": {"rot": (-188, 0, 10)}, "arm_L": {"rot": (-40, 0, -24)},
             "head": {"rot": (-10, -10, 0)}},
        18: {"spine": {"rot": (-18, 24, 0)}, "arm_R": {"rot": (-194, 0, 10)}, "arm_L": {"rot": (-44, 0, -26)},
             "head": {"rot": (-12, -10, 0)}},
        22: {"spine": {"rot": (30, -14, 0)}, "arm_R": {"rot": (-12, 0, -8)}, "arm_L": {"rot": (20, 0, -20)},
             "head": {"rot": (12, 6, 0)}},
        26: {"spine": {"rot": (28, -12, 0)}, "arm_R": {"rot": (-8, 0, -8)}, "arm_L": {"rot": (18, 0, -20)},
             "head": {"rot": (10, 6, 0)}},
        31: rest,
    }, loop=False)
    bpy.data.actions["ClubSwing"]["hit"] = 22
    bpy.data.actions["ClubSwing"]["windup_end"] = 18
    # Sit: cross-legged on the ground
    clip(arm, "Sit", 48, cyc(48, 12, lambda t: {
        "hips": {"loc": (0, -0.62, 0)},
        "leg_L": {"rot": (-88, 0, -32)},
        "leg_R": {"rot": (-88, 0, 32)},
        "arm_L": {"rot": (-35, 0, 10)},
        "arm_R": {"rot": (-35, 0, -10)},
        "spine": {"rot": (4 + 1.5 * S(t), 0, 0)},
    }))


# ------------------------------------------------------------------ quadrupeds
def build_horse(col, winged=False):
    bones = [
        ("root", None, (0, 0, 0)),
        ("body", "root", (0, 0, 1.3)),
        ("leg_FL", "body", (-0.2, -0.72, 1.05)),
        ("leg_FR", "body", (0.2, -0.72, 1.05)),
        ("leg_BL", "body", (-0.2, 0.72, 1.05)),
        ("leg_BR", "body", (0.2, 0.72, 1.05)),
        ("neck", "body", (0, -0.85, 1.55)),
        ("head", "neck", (0, -1.28, 2.15)),
        ("tail", "body", (0, 0.95, 1.6)),
        ("mount", "body", (0, 0.05, 0.96)),        # rider root goes here (seat - 0.88)
    ]
    if winged:
        bones += [("wing_L", "body", (-0.27, -0.52, 1.79)), ("wing_R", "body", (0.27, -0.52, 1.83))]
    arm = make_armature("HorseWinged" if winged else "Horse", bones, col)
    if winged:
        for b in ("wing_L", "wing_R"):
            arm.pose.bones[b].rotation_mode = "YZX"   # spread about the vertical first, then flap about the body axis
        coat = mat("W_Coat", "#efe9df", 0.85)
        mane = mat("W_Mane", "#d9b25a", 0.6)
        hoof = mat("W_Hoof", "#b8913e", 0.4, metallic=0.6)
        eyes = mat("W_Eyes", "#1a2a4a", 0.3)
        blaze = mat("W_Blaze", "#fffaf0", 0.8)
    else:
        coat = mat("H_Coat", "#7a4a2a", 0.9)
        mane = mat("H_Mane", "#1e1410", 0.9)
        hoof = mat("H_Hoof", "#2a2420", 0.8)
        eyes = mat("H_Eyes", "#0e0a08", 0.4)
        blaze = mat("H_Blaze", "#efe6d8", 0.9)
    mb = RigMB()
    mb.grp("body")
    mb.box((0, 0, 1.32), (0.6, 1.6, 0.72), coat)
    mb.box((0, -0.82, 1.42), (0.58, 0.3, 0.7), coat)
    mb.box((0, 0.8, 1.38), (0.6, 0.36, 0.68), coat)
    for name, sx, sy in (("FL", -0.2, -0.72), ("FR", 0.2, -0.72), ("BL", -0.2, 0.72), ("BR", 0.2, 0.72)):
        mb.grp("leg_" + name)
        mb.box((sx, sy, 0.6), (0.16, 0.18, 0.95), coat)
        mb.box((sx, sy, 0.12), (0.18, 0.2, 0.14), blaze if name in ("FL", "BR") else coat)
        mb.box((sx, sy, 0.03), (0.19, 0.21, 0.06), hoof)
    mb.grp("neck")
    mb.box((0, -1.08, 1.85), (0.3, 0.38, 0.85), coat, rot=(R(28), 0, 0))
    mb.box((0, -0.93, 1.93), (0.1, 0.14, 0.85), mane, rot=(R(28), 0, 0))
    mb.grp("head")
    mb.box((0, -1.5, 2.1), (0.28, 0.62, 0.3), coat, rot=(R(25), 0, 0))
    mb.box((0, -1.76, 1.97), (0.25, 0.2, 0.25), coat)
    mb.box((0, -1.6, 2.22), (0.1, 0.36, 0.03), blaze, rot=(R(25), 0, 0))
    for sx in (-0.08, 0.08):
        mb.box((sx, -1.32, 2.36), (0.06, 0.07, 0.15), coat)
        mb.box((sx * 1.85, -1.42, 2.2), (0.02, 0.07, 0.06), eyes)
    mb.box((0, -1.3, 2.3), (0.1, 0.12, 0.1), mane)
    mb.grp("tail")
    mb.box((0, 1.05, 1.28), (0.12, 0.13, 0.7), mane, rot=(R(18), 0, 0))
    if winged:
        # wings modelled spread (left along -X, feathers trailing +Y), then folded flat on the back:
        # folded = rotate -90 deg about Z for the left wing (+90 for the right) around the shoulder joint
        feather = mat("W_Feather", "#f6f2ea", 0.7)
        tip = mat("W_FeatherTip", "#d9b25a", 0.4, metallic=0.5)
        from mathutils import Matrix as _Mx
        for side, jx, jz in (("L", -0.27, 1.79), ("R", 0.27, 1.83)):
            sgn = -1 if side == "L" else 1
            fold = _Mx.Rotation(R(-90 if side == "L" else 90), 3, "Z")
            J = Vector((jx, -0.52, jz))
            mb.grp("wing_" + side)

            def put(c, s, m, j=J, f=fold, sg=sgn):
                p = j + f @ Vector((sg * c[0], c[1], c[2]))
                mb.box(tuple(p), s, m, rot=(0, 0, R(-90 if sg < 0 else 90)))
            put((0.75, 0.0, 0.03), (1.5, 0.14, 0.1), feather)                       # leading edge
            for k in range(7):
                x = 0.18 + k * 0.21
                ln = 0.45 + k * 0.08
                put((x, ln / 2, 0.0), (0.2, ln, 0.04), feather)
                put((x, ln + 0.06, 0.0), (0.18, 0.12, 0.045), tip)
            put((1.55, 0.25, 0.0), (0.16, 0.5, 0.04), tip)
    mb.skinned("Body", col, arm)

    if winged:
        horse_clips(arm, winged=True)
        return arm
    tack = RigMB()
    blanket = mat("H_Blanket", "#8b2a1f", 0.9)
    trim = mat("H_Trim", "#d39a2c", 0.8)
    leather = mat("H_Leather", "#5a3520", 0.7)
    tack.grp("body")
    tack.box((0, 0.05, 1.7), (0.72, 0.8, 0.05), blanket)
    tack.box((0, 0.05, 1.67), (0.74, 0.82, 0.03), trim)
    tack.box((0, 0.05, 1.77), (0.48, 0.55, 0.1), leather)
    tack.box((0, -0.22, 1.86), (0.2, 0.1, 0.12), leather)
    tack.box((0, 0.3, 1.87), (0.42, 0.08, 0.16), leather)
    for sx in (-0.34, 0.34):
        tack.box((sx, 0.05, 1.45), (0.03, 0.05, 0.5), leather)
        tack.box((sx, 0.05, 1.18), (0.07, 0.13, 0.04), trim)
    tack.grp("head")
    tack.box((0, -1.62, 2.08), (0.3, 0.05, 0.05), leather, rot=(R(25), 0, 0))
    o = tack.skinned("Saddle", col, arm)
    o["accessory"] = True

    horse_clips(arm)
    return arm


def horse_clips(arm, winged=False):
    def legs(t, amp, phases, reach=0.0):
        return {f"leg_{k}": {"rot": (-amp * S(t, ph) - reach, 0, 0)} for k, ph in phases.items()}

    clip(arm, "Idle", 48, cyc(48, 4, lambda t: {
        "tail": {"rot": (6, 0, 14 * S(t))},
        "neck": {"rot": (3 * S(t, 0.1), 0, 0)},
        "head": {"rot": (4 * S(t, 0.3), 3 * S(t * 2), 0)},
        "body": {"loc": (0, 0.006 * S(t), 0)},
    }))
    walk_ph = {"BL": 0.0, "FL": 0.25, "BR": 0.5, "FR": 0.75}
    clip(arm, "Walk", 32, cyc(32, 2, lambda t: {
        **legs(t, 18, walk_ph),
        "body": {"loc": (0, 0.02 * S(t * 2), 0), "rot": (1.0 * S(t * 2), 0, 0)},
        "neck": {"rot": (4 * S(t * 2, 0.25), 0, 0)},
        "head": {"rot": (-2 * S(t * 2, 0.25), 0, 0)},
        "tail": {"rot": (8, 0, 6 * S(t))},
    }))                                                               # ~1.7 m/s
    gal_ph = {"BL": 0.0, "BR": 0.08, "FL": 0.45, "FR": 0.53}
    clip(arm, "Gallop", 12, cyc(12, 1, lambda t: {
        **legs(t, 46, gal_ph, reach=4),
        "body": {"loc": (0, 0.09 * S(t, 0.1), 0), "rot": (6 * S(t, 0.35), 0, 0)},
        "neck": {"rot": (-10 * S(t, 0.35) - 6, 0, 0)},
        "head": {"rot": (6 * S(t, 0.4), 0, 0)},
        "tail": {"rot": (55 + 8 * S(t), 0, 0)},
    }))                                                               # ~9 m/s
    clip(arm, "Rear", 30, {
        1: {},
        12: {"root": {"rot": (-38, 0, 0), "loc": (0, 0.443, -0.153)},      # pivot on hind hooves "leg_FL": {"rot": (-70, 0, 0)},
             "leg_FR": {"rot": (-40, 0, 0)}, "leg_BL": {"rot": (30, 0, 0)}, "leg_BR": {"rot": (34, 0, 0)},
             "neck": {"rot": (-18, 0, 0)}, "head": {"rot": (-10, 0, 0)}},
        18: {"root": {"rot": (-40, 0, 0), "loc": (0, 0.463, -0.168)}, "leg_FL": {"rot": (-40, 0, 0)},
             "leg_FR": {"rot": (-75, 0, 0)}, "leg_BL": {"rot": (32, 0, 0)}, "leg_BR": {"rot": (36, 0, 0)},
             "neck": {"rot": (-20, 0, 0)}, "head": {"rot": (-12, 0, 0)}},
        31: {},
    }, loop=False)
    if not winged:
        return
    tuck = {"leg_FL": {"rot": (-62, 0, 0)}, "leg_FR": {"rot": (-55, 0, 0)},
            "leg_BL": {"rot": (48, 0, 0)}, "leg_BR": {"rot": (54, 0, 0)}}
    # Flap: one wingbeat per 12 frames; up-stroke peaks at frame 1, down-stroke at frame 7
    clip(arm, "Flap", 12, cyc(12, 1, lambda t: {
        **tuck,
        "wing_L": {"rot": (0, 90, -45 * math.cos(math.tau * t) + 5)},
        "wing_R": {"rot": (0, -90, 45 * math.cos(math.tau * t) - 5)},
        "body": {"loc": (0, -0.06 * math.cos(math.tau * t), 0), "rot": (-6 + 3 * S(t), 0, 0)},
        "neck": {"rot": (-12 + 4 * S(t, 0.25), 0, 0)},
        "head": {"rot": (6, 0, 0)},
        "tail": {"rot": (55 + 6 * S(t), 0, 0)},
    }))
    # Glide: wings spread with a slight upward dihedral, gentle sway
    clip(arm, "Glide", 24, cyc(24, 2, lambda t: {
        **tuck,
        "wing_L": {"rot": (0, 92, -8 + 3 * S(t))},
        "wing_R": {"rot": (0, -92, 8 - 3 * S(t))},
        "body": {"loc": (0, 0.03 * S(t), 0), "rot": (-3, 0, 2 * S(t, 0.25))},
        "neck": {"rot": (-14, 0, 0)},
        "tail": {"rot": (62, 0, 4 * S(t))},
    }))


def build_camel(col):
    arm = make_armature("Camel", [
        ("root", None, (0, 0, 0)),
        ("body", "root", (0, 0, 1.6)),
        ("leg_FL", "body", (-0.24, -0.66, 1.3)),
        ("leg_FR", "body", (0.24, -0.66, 1.3)),
        ("leg_BL", "body", (-0.24, 0.66, 1.3)),
        ("leg_BR", "body", (0.24, 0.66, 1.3)),
        ("neck", "body", (0, -0.85, 1.65)),
        ("head", "neck", (0, -1.48, 2.2)),
        ("tail", "body", (0, 0.9, 1.8)),
        ("mount", "body", (0, 0.05, 1.62)),       # rider root (seat 2.5 - 0.88)
    ], col)
    fur = mat("C_Fur", "#c4935e", 0.95)
    dark = mat("C_Dark", "#3a2414", 0.9)
    eyes = mat("C_Eyes", "#0e0a08", 0.4)
    mb = RigMB()
    mb.grp("body")
    mb.box((0, 0, 1.6), (0.72, 1.8, 0.6), fur)
    mb.box((0, 0.05, 2.06), (0.58, 0.85, 0.4), fur)
    mb.box((0, 0.1, 2.31), (0.4, 0.48, 0.18), fur)
    for name, sx, sy in (("FL", -0.24, -0.66), ("FR", 0.24, -0.66), ("BL", -0.24, 0.66), ("BR", 0.24, 0.66)):
        mb.grp("leg_" + name)
        mb.box((sx, sy, 0.68), (0.15, 0.17, 1.28), fur)
        mb.box((sx, sy, 0.7), (0.19, 0.21, 0.13), fur)
        mb.box((sx, sy - 0.02, 0.04), (0.22, 0.27, 0.08), dark)
    mb.grp("neck")
    mb.box((0, -1.1, 1.56), (0.3, 0.62, 0.34), fur, rot=(R(26), 0, 0))
    mb.box((0, -1.4, 1.9), (0.26, 0.28, 0.75), fur, rot=(R(12), 0, 0))
    mb.grp("head")
    mb.box((0, -1.62, 2.3), (0.28, 0.55, 0.28), fur)
    mb.box((0, -1.93, 2.23), (0.24, 0.2, 0.2), fur)
    for sx in (-0.09, 0.09):
        mb.box((sx, -1.42, 2.48), (0.05, 0.07, 0.1), fur)
        mb.box((sx * 1.62, -1.68, 2.36), (0.02, 0.07, 0.06), eyes)
    mb.grp("tail")
    mb.box((0, 0.95, 1.52), (0.07, 0.07, 0.55), fur, rot=(R(10), 0, 0))
    mb.skinned("Body", col, arm)

    cloth = mat("C_Saddlecloth", "#2f3f7a", 0.9)
    tassel = mat("C_Tassel", "#b8352b", 0.9)
    wood = mat("C_Wood", "#6e4a2c", 0.8)
    leather = mat("C_Leather", "#5a3520", 0.7)
    s = RigMB()
    s.grp("body")
    s.box((0, 0.05, 2.36), (0.9, 1.0, 0.08), cloth)
    s.box((0, 0.05, 2.45), (0.56, 0.8, 0.12), wood)
    for sx in (-0.46, 0.46):
        s.box((sx, 0.05, 2.08), (0.05, 1.0, 0.56), cloth)
        s.box((sx * 1.02, 0.05, 1.8), (0.05, 1.0, 0.08), tassel)
    s.grp("head")
    s.box((0, -1.98, 2.0), (0.03, 0.03, 0.45), leather)
    o = s.skinned("Saddle", col, arm)
    o["accessory"] = True
    c = RigMB()
    c.grp("body")
    for sx in (-0.66, 0.66):
        c.box((sx, 0.05, 2.1), (0.42, 0.7, 0.6), mat("C_Bale", "#d9c9a3", 0.95))
        c.box((sx, 0.05, 2.1), (0.44, 0.08, 0.62), leather)
    c.box((0, 0.05, 2.72), (0.8, 0.5, 0.42), mat("C_Bundle", "#5b3b5e", 0.95))
    o = c.skinned("Cargo", col, arm)
    o["accessory"] = True

    def legs(t, amp, phases):
        return {f"leg_{k}": {"rot": (-amp * S(t, ph), 0, 0)} for k, ph in phases.items()}

    clip(arm, "Idle", 48, cyc(48, 4, lambda t: {
        "tail": {"rot": (4, 0, 12 * S(t))},
        "neck": {"rot": (3 * S(t), 0, 0)},
        "head": {"rot": (-4 * S(t, 0.2), 4 * S(t * 2), 0)},
    }))
    pace = {"BL": 0.0, "FL": 0.0, "BR": 0.5, "FR": 0.5}             # camels pace
    clip(arm, "Walk", 32, cyc(32, 2, lambda t: {
        **legs(t, 17, pace),
        "body": {"loc": (0, 0.02 * S(t * 2), 0), "rot": (0, 0, 2.5 * S(t))},
        "neck": {"rot": (5 * S(t * 2, 0.25), 0, 0)},
        "head": {"rot": (-4 * S(t * 2, 0.25), 0, 0)},
    }))                                                               # ~1.8 m/s
    clip(arm, "Run", 16, cyc(16, 1, lambda t: {
        **legs(t, 38, {"BL": 0.0, "FL": 0.12, "BR": 0.5, "FR": 0.62}),
        "body": {"loc": (0, 0.07 * S(t * 2), 0), "rot": (3 * S(t * 2, 0.3), 0, 0)},
        "neck": {"rot": (-8 * S(t * 2, 0.3) - 10, 0, 0)},
        "tail": {"rot": (40, 0, 0)},
    }))                                                               # ~6 m/s
    clip(arm, "Sit", 48, cyc(48, 12, lambda t: {
        "body": {"loc": (0, -1.12, 0)},
        "leg_FL": {"rot": (90, 0, 0)}, "leg_FR": {"rot": (90, 0, 0)},
        "leg_BL": {"rot": (-90, 0, 0)}, "leg_BR": {"rot": (-90, 0, 0)},
        "neck": {"rot": (-6 + 3 * S(t), 0, 0)},
        "head": {"rot": (8, 0, 0)},
        "tail": {"rot": (0, 0, 8 * S(t))},
    }))
    return arm



# ------------------------------------------------------------------ v5 animals
def build_dog(col):
    """Saluki-style desert hound, facing -Y, ~0.68 m at the withers."""
    arm = make_armature("Dog", [
        ("root", None, (0, 0, 0)),
        ("body", "root", (0, 0, 0.6)),
        ("leg_FL", "body", (-0.09, -0.28, 0.56)), ("leg_FR", "body", (0.09, -0.28, 0.56)),
        ("leg_BL", "body", (-0.09, 0.3, 0.56)), ("leg_BR", "body", (0.09, 0.3, 0.56)),
        ("neck", "body", (0, -0.36, 0.66)),
        ("head", "neck", (0, -0.5, 0.86)),
        ("jaw", "head", (0, -0.62, 0.845)),
        ("tail", "body", (0, 0.42, 0.64)),
    ], col)
    coat = mat("D_Coat", "#d8b98a", 0.9)
    dark = mat("D_Dark", "#6b4a32", 0.9)
    eyes = mat("D_Eyes", "#140c08", 0.4)
    nose = mat("D_Nose", "#1a1210", 0.5)
    mb = RigMB()
    mb.grp("body")
    mb.box((0, -0.2, 0.6), (0.22, 0.34, 0.3), coat)                    # deep chest
    mb.box((0, 0.12, 0.65), (0.17, 0.36, 0.17), coat)                  # tucked loin
    mb.box((0, 0.33, 0.63), (0.2, 0.18, 0.22), coat)                   # hips
    for name, sx, sy in (("FL", -0.09, -0.28), ("FR", 0.09, -0.28)):
        mb.grp("leg_" + name)
        mb.box((sx, sy, 0.3), (0.06, 0.07, 0.54), coat)
        mb.box((sx, sy - 0.02, 0.02), (0.07, 0.1, 0.04), dark)
    for name, sx, sy in (("BL", -0.09, 0.3), ("BR", 0.09, 0.3)):
        mb.grp("leg_" + name)
        mb.box((sx, sy, 0.46), (0.08, 0.13, 0.22), coat)               # thigh
        mb.box((sx, sy + 0.03, 0.21), (0.05, 0.06, 0.38), coat, rot=(R(10), 0, 0))
        mb.box((sx, sy + 0.0, 0.02), (0.07, 0.1, 0.04), dark)
    mb.grp("neck")
    mb.box((0, -0.43, 0.76), (0.1, 0.12, 0.28), coat, rot=(R(34), 0, 0))
    mb.grp("head")
    mb.box((0, -0.56, 0.9), (0.14, 0.17, 0.13), coat)
    mb.box((0, -0.71, 0.885), (0.09, 0.2, 0.07), coat)
    mb.box((0, -0.815, 0.895), (0.045, 0.03, 0.04), nose)
    for sx in (-0.072, 0.072):
        mb.box((sx, -0.6, 0.925), (0.01, 0.03, 0.025), eyes)
        mb.box((sx * 1.15, -0.53, 0.84), (0.03, 0.07, 0.18), dark)      # long feathered ears
    mb.grp("jaw")
    mb.box((0, -0.71, 0.84), (0.08, 0.18, 0.03), coat)
    mb.grp("tail")
    mb.box((0, 0.49, 0.53), (0.035, 0.035, 0.28), coat, rot=(R(-147), 0, 0))        # hangs low from the hips
    mb.box((0, 0.6, 0.445), (0.03, 0.03, 0.12), dark, rot=(R(-58), 0, 0))           # feathered upturned tip
    mb.skinned("Body", col, arm)
    c = RigMB()
    c.grp("neck")
    leather = mat("D_Collar", "#4a2a18", 0.7)
    spike = mat("D_Spike", "#b0b3b6", 0.3, metallic=1.0)
    c.box((0, -0.42, 0.72), (0.13, 0.14, 0.05), leather, rot=(R(34), 0, 0))
    for sx, sy, sz in ((-0.07, -0.42, 0.72), (0.07, -0.42, 0.72), (0, -0.37, 0.76), (0, -0.48, 0.69)):
        c.box((sx * 1.15, sy, sz), (0.03, 0.03, 0.03), spike)
    o = c.skinned("Collar", col, arm)
    o["accessory"] = True

    def legs(t, amp, ph, reach=0.0):
        return {f"leg_{k}": {"rot": (-amp * S(t, p) - reach, 0, 0)} for k, p in ph.items()}
    clip(arm, "Idle", 48, cyc(48, 4, lambda t: {
        "body": {"loc": (0, 0.004 * S(t), 0)}, "tail": {"rot": (0, 0, 12 * S(t))},
        "head": {"rot": (2 * S(t, 0.2), 8 * S(t * 0.5), 0)}, "neck": {"rot": (2 * S(t), 0, 0)}}))
    clip(arm, "Walk", 24, cyc(24, 2, lambda t: {                                     # ~1.6 m/s
        **legs(t, 22, {"BL": 0.0, "FL": 0.25, "BR": 0.5, "FR": 0.75}),
        "body": {"loc": (0, 0.012 * S(t * 2), 0)}, "neck": {"rot": (3 * S(t * 2, 0.25), 0, 0)},
        "tail": {"rot": (8, 0, 10 * S(t))}}))
    clip(arm, "Run", 8, cyc(8, 1, lambda t: {                                        # rotary gallop ~7 m/s
        **legs(t, 56, {"BL": 0.0, "BR": 0.1, "FR": 0.5, "FL": 0.6}, reach=2),
        "body": {"loc": (0, 0.06 * S(t, 0.1), 0), "rot": (8 * S(t, 0.35), 0, 0)},
        "neck": {"rot": (-8 * S(t, 0.35) - 4, 0, 0)}, "head": {"rot": (6, 0, 0)},
        "tail": {"rot": (45 + 6 * S(t), 0, 0)}}))
    crouch = {"body": {"loc": (0, -0.12, 0)}, "leg_FL": {"rot": (26, 0, 0)}, "leg_FR": {"rot": (24, 0, 0)},
              "leg_BL": {"rot": (-22, 0, 0)}, "leg_BR": {"rot": (-20, 0, 0)}, "neck": {"rot": (12, 0, 0)},
              "tail": {"rot": (-10, 0, 0)}}
    clip(arm, "Lunge", 17, {                                                         # ~0.7 s, bite at frame 11
        1: {},
        5: crouch,
        9: {"root": {"rot": (-16, 0, 0), "loc": (0, 0.35, 0)}, "leg_FL": {"rot": (-72, 0, 0)},
            "leg_FR": {"rot": (-68, 0, 0)}, "leg_BL": {"rot": (66, 0, 0)}, "leg_BR": {"rot": (62, 0, 0)},
            "neck": {"rot": (-6, 0, 0)}, "jaw": {"rot": (28, 0, 0)}, "tail": {"rot": (40, 0, 0)}},
        11: {"root": {"rot": (4, 0, 0), "loc": (0, 0.24, 0)}, "leg_FL": {"rot": (-55, 0, 0)},
             "leg_FR": {"rot": (-50, 0, 0)}, "leg_BL": {"rot": (50, 0, 0)}, "leg_BR": {"rot": (48, 0, 0)},
             "neck": {"rot": (16, 0, 0)}, "jaw": {"rot": (0, 0, 0)}, "tail": {"rot": (36, 0, 0)}},
        14: {"body": {"loc": (0, -0.06, 0)}, "leg_FL": {"rot": (-12, 0, 0)}, "leg_FR": {"rot": (-8, 0, 0)},
             "leg_BL": {"rot": (14, 0, 0)}, "leg_BR": {"rot": (10, 0, 0)}, "neck": {"rot": (10, 0, 0)}},
        18: {},
    }, loop=False)
    bpy.data.actions["Lunge"]["hit"] = 11
    clip(arm, "Bite", 12, {
        1: {},
        4: {"neck": {"rot": (-12, 0, 0)}, "head": {"rot": (-10, 0, 0)}, "jaw": {"rot": (32, 0, 0)},
            "body": {"loc": (0, -0.03, 0)}},
        6: {"neck": {"rot": (26, 0, 0)}, "head": {"rot": (10, 0, 0)}, "jaw": {"rot": (0, 0, 0)},
            "body": {"loc": (0, -0.02, 0), "rot": (4, 0, 0)}},
        13: {},
    }, loop=False)
    bpy.data.actions["Bite"]["hit"] = 6
    clip(arm, "Hit", 10, {
        1: {}, 3: {"body": {"rot": (-10, 0, 6), "loc": (0, 0.03, 0)}, "neck": {"rot": (-18, 0, 0)},
                   "jaw": {"rot": (14, 0, 0)}}, 11: {},
    }, loop=False)
    clip(arm, "Death", 24, {
        1: {},
        8: {"body": {"loc": (0, -0.14, 0)}, "leg_FL": {"rot": (30, 0, 0)}, "leg_FR": {"rot": (28, 0, 0)},
            "neck": {"rot": (20, 0, 0)}},
        16: {"root": {"rot": (0, 0, 84), "loc": (0, 0.1, 0)}, "leg_FL": {"rot": (-20, 0, -10)},
             "leg_FR": {"rot": (-30, 0, 8)}, "leg_BL": {"rot": (20, 0, -8)}, "leg_BR": {"rot": (10, 0, 6)},
             "neck": {"rot": (6, 0, 14)}, "jaw": {"rot": (12, 0, 0)}, "tail": {"rot": (30, 0, 0)}},
        24: {"root": {"rot": (0, 0, 88), "loc": (0, 0.1, 0)}, "leg_FL": {"rot": (-22, 0, -10)},
             "leg_FR": {"rot": (-32, 0, 8)}, "leg_BL": {"rot": (22, 0, -8)}, "leg_BR": {"rot": (12, 0, 6)},
             "neck": {"rot": (6, 0, 16)}, "jaw": {"rot": (14, 0, 0)}, "tail": {"rot": (32, 0, 0)}},
    }, loop=False)
    clip(arm, "Growl", 24, cyc(24, 3, lambda t: {
        "body": {"loc": (0, -0.07, 0), "rot": (4, 0, 0)}, "neck": {"rot": (18, 0, 0)},
        "head": {"rot": (-12 + 2 * S(t * 2), 0, 0)}, "jaw": {"rot": (6 + 4 * S(t * 2), 0, 0)},
        "tail": {"rot": (-18, 0, 4 * S(t))}, "leg_FL": {"rot": (-8, 0, 0)}, "leg_FR": {"rot": (-8, 0, 0)},
        "leg_BL": {"rot": (12, 0, 0)}, "leg_BR": {"rot": (12, 0, 0)}}))
    return arm


def build_bird(col):
    """Lappet-faced vulture, facing -Y, origin at the body centre, ~2 m wingspan (rest = wings spread)."""
    arm = make_armature("Bird", [
        ("root", None, (0, 0, 0)),
        ("body", "root", (0, 0, 0)),
        ("neck", "body", (0, -0.22, 0.06)),
        ("head", "neck", (0, -0.36, 0.12)),
        ("wing_L", "body", (-0.15, -0.06, 0.08)), ("wing_R", "body", (0.15, -0.06, 0.08)),
        ("tail", "body", (0, 0.27, 0.0)),
        ("leg_L", "body", (-0.07, 0.02, -0.11)), ("leg_R", "body", (0.07, 0.02, -0.11)),
    ], col)
    fea = mat("B_Feather", "#4a3626", 0.9)
    dark = mat("B_Dark", "#211812", 0.9)
    light = mat("B_Light", "#e8e0d2", 0.9)
    skin = mat("B_Skin", "#c97a74", 0.6)
    beak = mat("B_Beak", "#d9c9a3", 0.5)
    legm = mat("B_Leg", "#8e8a86", 0.7)
    eyes = mat("B_Eyes", "#120c08", 0.4)
    mb = RigMB()
    mb.grp("body")
    mb.box((0, 0, 0), (0.3, 0.52, 0.26), fea)
    mb.box((0, -0.2, 0.07), (0.2, 0.08, 0.15), fea)                    # ruff
    mb.box((0, 0.05, -0.12), (0.22, 0.3, 0.04), light)                 # pale belly
    mb.grp("neck")
    mb.box((0, -0.29, 0.1), (0.08, 0.12, 0.08), skin)
    mb.grp("head")
    mb.box((0, -0.41, 0.14), (0.1, 0.14, 0.1), skin)
    mb.box((0, -0.51, 0.13), (0.05, 0.08, 0.07), beak)
    mb.box((0, -0.55, 0.11), (0.04, 0.03, 0.05), dark)
    for sx in (-0.051, 0.051):
        mb.box((sx, -0.43, 0.16), (0.01, 0.025, 0.02), eyes)
        mb.box((sx * 1.1, -0.41, 0.09), (0.02, 0.06, 0.06), skin)     # lappets
    mb.grp("tail")
    mb.box((0, 0.39, -0.01), (0.24, 0.22, 0.03), fea)
    mb.box((0, 0.51, -0.01), (0.26, 0.04, 0.032), dark)
    for side, sx in (("L", -0.07), ("R", 0.07)):
        mb.grp("leg_" + side)
        mb.box((sx, 0.03, -0.13), (0.08, 0.1, 0.1), light)
        mb.box((sx, 0.05, -0.23), (0.04, 0.04, 0.16), legm)
        mb.box((sx, 0.0, -0.31), (0.07, 0.1, 0.03), dark)
    for side, sg in (("L", -1), ("R", 1)):
        mb.grp("wing_" + side)
        jx = 0.15 * sg
        mb.box((jx + sg * 0.36, -0.06, 0.09), (0.72, 0.16, 0.05), fea)
        mb.box((jx + sg * 0.3, 0.1, 0.075), (0.56, 0.22, 0.03), fea)
        mb.box((jx + sg * 0.3, 0.22, 0.072), (0.56, 0.04, 0.032), dark)
        for k in range(5):                                             # splayed primaries
            mb.box((jx + sg * (0.72 + k * 0.025), 0.0 + k * 0.05, 0.085), (0.2, 0.045, 0.02), dark,
                   rot=(0, 0, R(sg * (-10 + k * 9))))
    mb.skinned("Body", col, arm)
    tuck = {"leg_L": {"rot": (68, 0, 0)}, "leg_R": {"rot": (68, 0, 0)}}
    clip(arm, "Fly", 12, cyc(12, 1, lambda t: {                                      # one beat 0.5 s; downstroke peaks frame 7
        **tuck,
        "wing_L": {"rot": (0, 0, -40 * math.cos(math.tau * t) + 6)},
        "wing_R": {"rot": (0, 0, 40 * math.cos(math.tau * t) - 6)},
        "body": {"loc": (0, -0.05 * math.cos(math.tau * t), 0), "rot": (-3 * S(t), 0, 0)},
        "tail": {"rot": (4 * S(t, 0.25), 0, 0)}, "neck": {"rot": (2 * S(t), 0, 0)}}))
    clip(arm, "Glide", 24, cyc(24, 3, lambda t: {
        **tuck,
        "wing_L": {"rot": (0, 0, -7 + 3 * S(t))}, "wing_R": {"rot": (0, 0, 7 - 3 * S(t))},
        "body": {"rot": (0, 0, 5 * S(t, 0.25)), "loc": (0, 0.02 * S(t), 0)},
        "tail": {"rot": (0, 0, -4 * S(t, 0.25))}, "head": {"rot": (0, 8 * S(t * 0.5), 0)}}))
    clip(arm, "Dive", 16, {                                                          # talons strike at frame 12
        1: {**tuck},
        6: {"wing_L": {"rot": (0, -55, -18)}, "wing_R": {"rot": (0, 55, 18)}, "body": {"rot": (34, 0, 0)},
            "leg_L": {"rot": (-75, 0, 0)}, "leg_R": {"rot": (-75, 0, 0)}, "neck": {"rot": (-22, 0, 0)},
            "tail": {"rot": (-10, 0, 0)}},
        10: {"wing_L": {"rot": (0, 0, -55)}, "wing_R": {"rot": (0, 0, 55)}, "body": {"rot": (-12, 0, 0)},
             "leg_L": {"rot": (-100, 0, 0)}, "leg_R": {"rot": (-100, 0, 0)}, "neck": {"rot": (-10, 0, 0)},
             "tail": {"rot": (20, 0, 0)}},
        12: {"wing_L": {"rot": (0, 0, -35)}, "wing_R": {"rot": (0, 0, 35)}, "body": {"rot": (-4, 0, 0)},
             "leg_L": {"rot": (-70, 0, 0)}, "leg_R": {"rot": (-70, 0, 0)}, "neck": {"rot": (8, 0, 0)},
             "tail": {"rot": (14, 0, 0)}},
        17: {**tuck},
    }, loop=False)
    bpy.data.actions["Dive"]["hit"] = 12
    clip(arm, "Hit", 10, {
        1: {**tuck}, 3: {**tuck, "wing_L": {"rot": (0, 0, 32)}, "wing_R": {"rot": (0, 0, -10)},
                        "body": {"rot": (-8, 0, -18)}, "neck": {"rot": (-24, 0, 0)}}, 11: {**tuck},
    }, loop=False)
    clip(arm, "Death", 30, {                                                         # tumbling fall, ends sprawled
        1: {**tuck},
        8: {"root": {"rot": (-120, 0, 40)}, "wing_L": {"rot": (0, -30, 40)}, "wing_R": {"rot": (0, 50, -20)},
            "neck": {"rot": (-30, 0, 20)}, "leg_L": {"rot": (-20, 0, 0)}, "leg_R": {"rot": (30, 0, 0)}},
        16: {"root": {"rot": (-250, 0, 80)}, "wing_L": {"rot": (0, 20, -30)}, "wing_R": {"rot": (0, -10, 40)},
             "neck": {"rot": (40, 0, -20)}},
        22: {"root": {"rot": (-360, 0, 10)}, "wing_L": {"rot": (0, 10, 20)}, "wing_R": {"rot": (0, -10, -20)},
             "neck": {"rot": (30, 0, 0)}},
        30: {"root": {"rot": (-360, 0, 6), "loc": (0, -0.04, 0)}, "wing_L": {"rot": (0, 8, 24)},
             "wing_R": {"rot": (0, -12, -22)}, "neck": {"rot": (44, 0, 18)}, "head": {"rot": (10, 0, 0)},
             "leg_L": {"rot": (50, 0, 0)}, "leg_R": {"rot": (60, 0, 0)}, "tail": {"rot": (-6, 0, 0)}},
    }, loop=False)
    return arm
