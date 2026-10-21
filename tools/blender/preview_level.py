"""
Round-trip check: import the exported level GLBs + colliders into an empty scene
and render a high game-style view.  Writes assets/previews/level_check.png.

    blender -b --factory-startup -P preview_level.py -- [colliders] [map=hegra] [at=landmark] [scale=120]
Without map= it checks the oasis (assets/level/level.json).
"""
import sys, os, json, math
import bpy
from mathutils import Vector, Euler

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
A = os.path.join(ROOT, "assets")
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
MAP = next((a[4:] for a in ARGS if a.startswith("map=")), None)
AT = next((a[3:] for a in ARGS if a.startswith("at=")), None)
SCALE = float(next((a[6:] for a in ARGS if a.startswith("scale=")), "120"))
LJ = f"level/{MAP}/level.json" if MAP else "level/level.json"
level = json.load(open(os.path.join(A, LJ), encoding="utf8"))
for key in ("terrain", "town", "backdrop", "backdrop_ground", "dressing"):
    if level.get(key):
        bpy.ops.import_scene.gltf(filepath=os.path.join(A, level[key]))
# the Blender importer ignores COLOR_0 in materials; wire it so the check looks like three.js
for m in bpy.data.materials:
    if m.name.startswith("SandVC") and m.node_tree:
        nt = m.node_tree
        p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        ca = nt.nodes.new("ShaderNodeVertexColor")
        nt.links.new(ca.outputs["Color"], p.inputs["Base Color"])


def b(v):          # three.js -> blender
    return Vector((v[0], -v[2], v[1]))


if "colliders" in ARGS:
    m = bpy.data.materials.new("Col")
    m.diffuse_color = (1, 0, 0, 1)
    for c in level["colliders"]:
        bpy.ops.mesh.primitive_cube_add(size=2, location=b(c["pos"]))
        o = bpy.context.active_object
        o.scale = (c["half"][0], c["half"][2], c["half"][1])
        o.rotation_euler.z = c["yaw"]
        o.display_type = "WIRE"
        mod = o.modifiers.new("w", "WIREFRAME")
        mod.thickness = 0.15
        o.data.materials.append(m)
# spawn markers
mk = bpy.data.materials.new("Spawn")
mk.use_nodes = True
p = next(n for n in mk.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
p.inputs["Base Color"].default_value = (0.1, 0.3, 1, 1)
for s in level["spawns"]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=1.8, location=b(s["pos"]) + Vector((0, 0, 0.9)))
    bpy.context.active_object.data.materials.append(mk)

world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(os.path.join(A, "sky/sunset_env.hdr"))
bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
nt.links.new(env.outputs["Color"], bg.inputs["Color"])
sun_dir = b(level["sun"]["direction_to_sun"])
sd = bpy.data.lights.new("Sun", "SUN")
sd.energy = 5
sd.color = (1.0, 0.62, 0.35)
sun = bpy.data.objects.new("Sun", sd)
scene.collection.objects.link(sun)
sun.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()

cd = bpy.data.cameras.new("C")
cd.type = "ORTHO"
cd.ortho_scale = SCALE
cd.clip_end = 4000
cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam)
scene.camera = cam
if AT and AT in level["landmarks"]:
    target = b(level["landmarks"][AT])
elif AT == "center" or MAP:
    bx, bz = level["bounds"]["x"], level["bounds"]["z"]
    target = Vector(((bx[0] + bx[1]) / 2, -(bz[0] + bz[1]) / 2, 0))
else:
    target = Vector((0, 10, 2))
cam.location = target + Euler((0, 0, math.radians(-30))).to_matrix() @ (Vector((0, -200, 170)) * max(1.0, SCALE / 250))
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
scene.cycles.samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.view_settings.view_transform = "AgX"
scene.render.filepath = os.path.join(A, "previews", f"level_{MAP or 'oasis'}{'_' + AT if AT else ''}.png")
bpy.ops.render.render(write_still=True)
print("WROTE")
