"""
Contact-sheet render of the animated characters in key poses.

    blender -b --factory-startup -P preview_rigs.py
Writes assets/previews/rigs.png. Row 1: person clips; row 2: rider on horse,
horse/camel clips.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector

import arabia_lib as L
import rigs

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "assets", "previews", "rigs.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene = bpy.context.scene
F = 100
col = L.coll("Rigs")


def posed(src, clip, frame, loc, rotz=0.0, show=()):
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
    pre = {"Person": "P", "Horse": "H", "Camel": "C"}[src.name]
    act = bpy.data.actions[pre + ":" + clip]
    tr = ad.nla_tracks.new()
    st = tr.strips.new(clip, F - (frame - 1), act)
    if hasattr(st, "action_slot") and len(act.slots):
        st.action_slot = act.slots[0]
    ob.location = loc
    ob.rotation_euler.z = rotz
    return ob


def tag_actions(prefix):
    for a in bpy.data.actions:
        if ":" not in a.name:
            a.name = prefix + ":" + a.name


person = rigs.build_person(col)
tag_actions("P")
for c in person.children:
    c.hide_render = True
person.hide_render = True
horse = rigs.build_horse(col)
tag_actions("H")
for c in horse.children:
    c.hide_render = True
horse.hide_render = True
camel = rigs.build_camel(col)
tag_actions("C")
for c in camel.children:
    c.hide_render = True
camel.hide_render = True

looks = [("Keffiyeh", "Beard", "Sword"), ("Turban", "Sword"), ("Veil", "Jar"), ("Hair", "Beard", "Sword")]
poses = [("Idle", 1), ("Walk", 7), ("Run", 5), ("Attack", 6), ("Attack", 10), ("Attack2", 5),
         ("Attack2", 9), ("Talk", 12), ("Hit", 3), ("Sit", 1), ("Death", 30)]
for i, (clip, fr) in enumerate(poses):
    posed(person, clip, fr, (i * 1.6, 0, 0), math.radians(-35), looks[i % 4])

# row 2: rider on a galloping horse, rearing horse, camels
scene.frame_set(F)
h = posed(horse, "Gallop", 3, (1.0, 5.0, 0), math.radians(-60), ("Saddle",))
posed(horse, "Rear", 15, (5.5, 5.0, 0), math.radians(-60), ("Saddle",))
posed(camel, "Walk", 9, (10.0, 5.0, 0), math.radians(-60), ("Saddle", "Cargo"))
posed(camel, "Sit", 1, (14.5, 5.0, 0), math.radians(-60), ("Saddle",))
cr = posed(camel, "Idle", 1, (18.5, 5.0, 0), math.radians(-60), ("Saddle",))
bpy.context.view_layer.update()
scene.frame_set(F)
for mount_host in (h, cr):
    rider = posed(person, "Ride", 1, (0, 0, 0), 0, ("Keffiyeh", "Beard", "Sword"))
    # three.js attaches to the bone's head; mimic that with the evaluated bone matrix
    rider.location = mount_host.matrix_world @ mount_host.pose.bones["mount"].head
    rider.rotation_euler.z = mount_host.rotation_euler.z
r2 = posed(person, "Attack", 10, (0, 0, 0), 0, ("Turban", "Sword"))
r2.location = h.matrix_world @ h.pose.bones["mount"].head
r2.location.x += 0.0
r2.hide_render = True
for c in r2.children:
    c.hide_render = True

ground = bpy.data.meshes.new("G")
ground.from_pydata([(-5, -5, 0), (25, -5, 0), (25, 12, 0), (-5, 12, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new("Ground", ground)
col.objects.link(g)
g.data.materials.append(L.mat("PrevGround", "#d9a86c", 0.95))

world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (*L.lin("#bcd3e6"), 1)
bg.inputs["Strength"].default_value = 0.8
sd = bpy.data.lights.new("Sun", "SUN")
sd.energy = 3.5
sun = bpy.data.objects.new("Sun", sd)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))

cd = bpy.data.cameras.new("C")
cd.type = "ORTHO"
cd.ortho_scale = 21
cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam)
scene.camera = cam
target = Vector((9.0, 2.6, 0.9))
cam.location = target + Vector((0, -30, 17))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

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
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1800, 900
scene.render.filepath = OUT
scene.frame_set(F)
bpy.ops.render.render(write_still=True)
print("WROTE", OUT)
