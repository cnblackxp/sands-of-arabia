"""
Round-trip check of exported character/prop GLBs: import each one and pose it at
a clip frame, then render a row.  Writes assets/previews/glb_check.png.

    blender -b --factory-startup -P preview_glb.py -- "characters/horse_winged.glb:Idle:1" "...:Flap:1" ...
Each argument is file[:clip:frame]; a prop without a clip renders as exported.
"""
import sys, os, math
import bpy
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
A = os.path.join(ROOT, "assets")
OUT = next((a[4:] for a in ARGS if a.startswith("out=")), os.path.join(A, "previews", "glb_check.png"))
items = [a for a in ARGS if not a.startswith("out=")]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
F = 50
x = 0.0
for it in items:
    parts = it.split(":")
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=os.path.join(A, parts[0]))
    objs = [o for o in bpy.data.objects if o not in before_o]
    acts = [a for a in bpy.data.actions if a not in before_a]
    roots = [o for o in objs if o.parent is None]
    for o in objs:
        if o.animation_data:
            o.animation_data.action = None
            for tr in list(o.animation_data.nla_tracks):
                o.animation_data.nla_tracks.remove(tr)
    for o in objs:                                   # the importer leaves the last clip's pose behind
        if o.type == "ARMATURE":
            for pb in o.pose.bones:
                pb.matrix_basis.identity()
    if len(parts) >= 3:
        clip, fr = parts[1], int(parts[2])
        arm = next(o for o in objs if o.type == "ARMATURE")
        act = next(a for a in acts if a.name.split(".")[0] == clip)
        arm.animation_data_create()
        tr = arm.animation_data.nla_tracks.new()
        st = tr.strips.new(act.name, F - (fr - 1), act)
        if hasattr(st, "action_slot") and len(act.slots):
            st.action_slot = act.slots[0]
    bpy.context.view_layer.update()
    for r in roots:
        r.matrix_world = Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(math.radians(-55), 4, "Z") @ r.matrix_world
    x += 3.6
ground = bpy.data.meshes.new("G")
ground.from_pydata([(-6, -6, 0), (x + 4, -6, 0), (x + 4, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new("Ground", ground)
scene.collection.objects.link(g)
gm = bpy.data.materials.new("G")
gm.use_nodes = True
next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.7, 0.5, 0.32, 1)
g.data.materials.append(gm)
w = bpy.data.worlds.new("W")
scene.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.55, 0.65, 0.78, 1)
bg.inputs["Strength"].default_value = 0.8
sd = bpy.data.lights.new("Sun", "SUN")
sd.energy = 3.5
sun = bpy.data.objects.new("Sun", sd)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
cd = bpy.data.cameras.new("C")
cd.type = "ORTHO"
cd.ortho_scale = max(8.0, x + 1)
cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam)
scene.camera = cam
t = Vector(((x - 3.6) / 2, 0, 1.2))
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
scene.render.resolution_x, scene.render.resolution_y = 1600, 700
scene.render.filepath = OUT
scene.frame_set(F)
bpy.ops.render.render(write_still=True)
print("WROTE", OUT)
