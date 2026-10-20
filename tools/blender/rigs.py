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
def build_horse(col):
    arm = make_armature("Horse", [
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
    ], col)
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
    mb.skinned("Body", col, arm)

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
    return arm


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
