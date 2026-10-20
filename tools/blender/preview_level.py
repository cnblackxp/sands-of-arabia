"""
Round-trip check: import the exported level GLBs + colliders into an empty scene
and render a high game-style view.  Writes assets/previews/level_check.png.

    blender -b --factory-startup -P preview_level.py -- [colliders]
"""
import sys, os, json, math
import bpy
from mathutils import Vector, Euler

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
A = os.path.join(ROOT, "assets")
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for f in ("level/terrain.glb", "level/town.glb", "level/backdrop.glb", "level/backdrop_ground.glb"):
    bpy.ops.import_scene.gltf(filepath=os.path.join(A, f))
# the Blender importer ignores COLOR_0 in materials; wire it so the check looks like three.js
for m in bpy.data.materials:
    if m.name.startswith("SandVC") and m.node_tree:
        nt = m.node_tree
        p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        ca = nt.nodes.new("ShaderNodeVertexColor")
        nt.links.new(ca.outputs["Color"], p.inputs["Base Color"])
level = json.load(open(os.path.join(A, "level/level.json"), encoding="utf8"))


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
cd.ortho_scale = 120
cd.clip_end = 4000
cam = bpy.data.objects.new("C", cd)
scene.collection.objects.link(cam)
scene.camera = cam
target = Vector((0, 10, 2))
cam.location = target + Euler((0, 0, math.radians(-30))).to_matrix() @ Vector((0, -200, 170))
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
scene.render.filepath = os.path.join(A, "previews", "level_check.png")
bpy.ops.render.render(write_still=True)
print("WROTE")
