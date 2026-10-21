"""
Pose sheet for the v5 additions: archery, throw, club swing, hound, vulture.

    blender -b --factory-startup -P preview_v5.py
Writes assets/previews/v5.png.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector

import arabia_lib as L
import rigs

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "assets", "previews", "v5.png")
scene = bpy.context.scene
F = 100
col = L.coll("V5")


def tag(prefix):
    for a in bpy.data.actions:
        if ":" not in a.name:
            a.name = prefix + ":" + a.name


def hide(src):
    src.hide_render = True
    for c in src.children:
        c.hide_render = True


def posed(src, pre, clip, frame, loc, rotz, show=()):
    ob = src.copy()
    ob.data = src.data
    col.objects.link(ob)
    for ch in src.children:
        c = ch.copy()
        col.objects.link(c)
        c.parent = ob
        c.modifiers["Armature"].object = ob
        c.hide_render = ch.get("accessory", False) and ch.name.split(".")[0] not in show
    ad = ob.animation_data
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    ad.action = None
    act = bpy.data.actions[pre + ":" + clip]
    st = ad.nla_tracks.new().strips.new(clip, F - (frame - 1), act)
    if hasattr(st, "action_slot") and len(act.slots):
        st.action_slot = act.slots[0]
    ob.location = loc
    ob.rotation_euler.z = rotz
    ob.hide_render = False
    return ob


person = rigs.build_person(col); tag("P"); hide(person)
dog = rigs.build_dog(col); tag("D"); hide(dog)
bird = rigs.build_bird(col); tag("B"); hide(bird)
archer = ("BowHeld", "Quiver", "Headband", "Vest")
row = [("BowDraw", 1, archer), ("BowDraw", 5, archer), ("BowDraw", 13, archer), ("BowAim", 6, archer),
       ("BowRelease", 3, archer), ("BowRelease", 7, archer), ("Throw", 6, ("Sling", "FaceWrap")),
       ("Throw", 9, ("Sling", "FaceWrap")), ("ClubSwing", 18, ("Club", "Lamellar", "Helmet", "Belly")),
       ("ClubSwing", 22, ("Club", "Lamellar", "Helmet", "Belly")), ("Idle", 1, ("Club", "Lamellar", "Belly", "BeardLong"))]
for i, (c, f, sh) in enumerate(row):
    posed(person, "P", c, f, (i * 1.6, 0, 0), math.radians(-60), sh)
drow = [("Idle", 1), ("Run", 3), ("Lunge", 9), ("Bite", 4), ("Growl", 1), ("Death", 24)]
for i, (c, f) in enumerate(drow):
    posed(dog, "D", c, f, (i * 1.6, 3.5, 0), math.radians(-60), ("Collar",))
brow = [("Glide", 1), ("Fly", 1), ("Fly", 7), ("Dive", 6), ("Dive", 10), ("Death", 30)]
for i, (c, f) in enumerate(brow):
    posed(bird, "B", c, f, (i * 2.4, 7.5, 1.0 if c != "Death" else 0.33), math.radians(-30))

g = bpy.data.objects.new("Ground", bpy.data.meshes.new("G"))
g.data.from_pydata([(-4, -4, 0), (22, -4, 0), (22, 12, 0), (-4, 12, 0)], [], [(0, 1, 2, 3)])
col.objects.link(g)
g.data.materials.append(L.mat("PrevGround", "#d9a86c", 0.95))
w = bpy.data.worlds.new("W")
scene.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (*L.lin("#bcd3e6"), 1)
bg.inputs["Strength"].default_value = 0.8
sd = bpy.data.lights.new("Sun", "SUN")
sd.energy = 3.5
sun = bpy.data.objects.new("Sun", sd)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
cd = bpy.data.cameras.new("C")
cd.type = "ORTHO"
cd.ortho_scale = 19
cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam)
scene.camera = cam
t = Vector((8.2, 3.6, 0.9))
cam.location = t + Vector((0, -30, 17))
cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
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
scene.cycles.samples = 24
scene.render.resolution_x, scene.render.resolution_y = 1800, 1100
scene.render.filepath = OUT
scene.frame_set(F)
bpy.ops.render.render(write_still=True)
print("WROTE", OUT)
