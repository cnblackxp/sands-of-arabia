"""
The original showcase still: walled oasis town at sunset.

    blender -b --factory-startup -P render_still.py -- [preview] [out=path.png]
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arabia_lib import *                      # noqa: F401,F403
from arabia_lib import _merge                 # noqa: F401

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
HERE = os.path.join(ROOT, "assets", "previews")
os.makedirs(HERE, exist_ok=True)
OUT = next((a[4:] for a in ARGS if a.startswith("out=")),
           os.path.join(HERE, "still_preview.png" if PREVIEW else "still.png"))

# ----------------------------------------------------------------- assembly
build_terrain()
build_mountains()
build_tomb()

# oasis pool
water = bpy.data.materials.new("Water")
water.use_nodes = True
wp = next(n for n in water.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
wp.inputs["Base Color"].default_value = (*lin("#1d4a52"), 1)
wp.inputs["Roughness"].default_value = 0.04
POOL = Vector((-30, 0))
bpy.ops.mesh.primitive_circle_add(vertices=14, radius=9, fill_type="NGON",
                                  location=(POOL.x, POOL.y, height(POOL.x, POOL.y) + 0.12))
pool = bpy.context.active_object
pool.name = "Pool"
pool.scale.y = 0.6
pool.data.materials.append(water)
for c in pool.users_collection:
    c.objects.unlink(pool)
C_LAND.objects.link(pool)
grass = mat("Grass", "#6f7f30", 0.9)
mb = MB()
for i in range(120):
    a = random.uniform(0, math.tau)
    r = random.uniform(9.2, 13)
    gx, gy = POOL.x + math.cos(a) * r, POOL.y + math.sin(a) * r * 0.65
    mb.cyl((gx, gy, height(gx, gy) + 0.25), 0.25, 0.02, random.uniform(0.4, 0.9), grass, segs=4)
mb.build("Reeds", C_LAND)
for i in range(16):
    a = random.uniform(0, math.tau)
    r = random.uniform(10, 17)
    palm(POOL.x + math.cos(a) * r, POOL.y + math.sin(a) * r * 0.7, random.uniform(0.9, 1.25), 0.25)
for (px, py) in [(14, 52), (24, 40), (-12, 50), (30, 12), (-46, 16), (44, 30), (-44, 34), (22, -30), (-20, -34)]:
    palm(px, py, random.uniform(0.9, 1.2), 0.2)

# town: houses scattered behind the market, a shrine on the high ground
random.seed(3)
spots = []
for i in range(46):
    for _ in range(60):
        a = random.uniform(0, math.tau)
        r = math.sqrt(random.uniform(0.02, 1)) * 0.86
        x, y = WALL_C.x + math.sin(a) * r * WALL_RX, WALL_C.y + math.cos(a) * r * WALL_RY
        if abs(x) < 3.5 and y < WALL_C.y - 4:                      # keep the gate street open
            continue
        if (Vector((x, y)) - Vector((6, 54))).length < 13:          # shrine precinct
            continue
        if all((Vector((x, y)) - s).length > 6.5 for s in spots):
            spots.append(Vector((x, y)))
            break
for i, s in enumerate(spots):
    rot = random.uniform(-0.15, 0.15)
    if i % 4 == 0:
        tower_house(s.x, s.y, rot, random.uniform(4.2, 5.5), random.uniform(4.2, 5.2),
                    random.uniform(9, 15))
        continue
    w, d = random.uniform(4, 7), random.uniform(4, 6.5)
    h = random.uniform(3.5, 6.0)
    house(s.x, s.y, rot, w, d, h, floors=2 if random.random() < 0.45 else 1)
temple(6, 54, math.radians(-4))
town_wall()

# market square: two rows of stalls flanking a lane that runs toward the camera
random.seed(5)
for i in range(7):
    y = -24 + i * 5.0
    stall(-7.0 - random.uniform(0, 0.6), y, math.radians(90) + random.uniform(-0.06, 0.06))
    stall(7.0 + random.uniform(0, 0.6), y + 2.0, math.radians(-90) + random.uniform(-0.06, 0.06))
for (x, y, r) in [(-15, -14, 0.4), (15, -10, -0.5), (-14, 2, 0.2), (16, 6, -0.3),
                  (-17, -26, 0.7), (18, -22, -0.8)]:
    stall(x, y, r)

# crowd in the market lane
random.seed(9)
poses = ["stand", "stand", "trade", "point", "carry_head", "staff", "wave"]
for i in range(64):
    x = random.uniform(-4.8, 4.8) if i < 50 else random.uniform(-14, 14)
    y = random.uniform(-30, 18)
    rot = random.choice([0, math.pi]) + random.uniform(-0.8, 0.8)
    place(person, "Person", C_PEOPLE, x, y, rot, pose=random.choice(poses))
# merchants behind their counters, facing the lane
for i in range(7):
    y = -24 + i * 5.0
    place(person, "Merchant", C_PEOPLE, -8.6, y, math.radians(90), pose="trade")
    place(person, "Merchant", C_PEOPLE, 8.6, y + 2.0, math.radians(-90), pose="trade")
# a few sitting by the pool and stalls
for (x, y, r) in [(-21.5, 4, 1.2), (-22, 7, 2.0), (-36, 6, -0.7), (10.5, -28, 0.3), (-10.5, -27, -0.5)]:
    place(person, "Sitter", C_PEOPLE, x, y, r, pose="sit")
# women with water jars walking from the pool
for (x, y, r) in [(-18, -8, -2.2), (-13, -14, -2.6), (-21, -4, -1.9)]:
    place(person, "WaterCarrier", C_PEOPLE, x, y, r, pose="carry_head", beard=False)

# camels: resting in the market, tethered near the gate, and the great caravan
random.seed(21)
for (x, y, r, sit) in [(-5, -34, 0.9, False), (-11, -36, -1.2, True), (12, -33, 2.4, False),
                       (-12, -31, 1.6, True), (13, 14, 0.3, False), (-24, -16, 2.8, False),
                       (21, -14, -2.0, True), (-8, 12, 1.4, False)]:
    place(camel, "Camel", C_CAMELS, x, y, r, laden=random.random() < 0.7, sit=sit)
# herder leading a pair into town
place(person, "Herder", C_PEOPLE, 1.5, -31.0, 0.15, pose="staff")
place(camel, "Camel", C_CAMELS, 2.0, -33.8, 0.15, laden=True)
place(camel, "Camel", C_CAMELS, 2.6, -37.4, 0.12, laden=True, rider=True)

# caravan along the dune crest, silhouetted against the setting sun
for i in range(14):
    u = -70 + i * 6.5 + random.uniform(-0.8, 0.8)
    p = crest_point(u)
    q = crest_point(u + 1)
    heading = math.atan2(q.y - p.y, q.x - p.x)
    mb = MB()
    camel(mb, laden=True, rider=(i % 3 == 0))
    mb.build("CaravanCamel", C_CAMELS, loc=(p.x, p.y, p.z - 0.15), rotz=heading - math.pi / 2 + math.pi)
    if i % 4 == 1:
        r = crest_point(u - 2.2)
        mb = MB()
        person(mb, pose="staff")
        mb.build("CaravanWalker", C_PEOPLE, loc=(r.x, r.y, r.z - 0.1), rotz=heading - math.pi / 2 + math.pi)

# bedouin camp off to the right
random.seed(4)
for (x, y, r) in [(58, 40, -0.4), (66, 52, -0.7), (52, 60, -0.2)]:
    tent(x, y, r, 1.0)
for (x, y, r) in [(60, 30, 2.0), (70, 44, 1.1), (48, 48, -0.6)]:
    place(camel, "Camel", C_CAMELS, x, y, r, laden=False, sit=random.random() < 0.5)
fire = mat("Fire", "#ffb066", 0.5, emit="#ff7a1a", strength=60)
mb = MB()
mb.cyl((0, 0, 0.25), 0.35, 0.05, 0.6, fire, segs=5)
mb.build("Campfire", C_LAND, loc=(60, 46, height(60, 46)))

# birds wheeling over the oasis
bird = mat("Bird", "#1a1210", 1.0)
mb = MB()
for i in range(9):
    c = Vector((random.uniform(-40, 10), random.uniform(60, 120), random.uniform(30, 48)))
    for s in (-1, 1):
        mb.box(c + Vector((s * 0.45, 0, 0.1)), (0.9, 0.2, 0.04), bird, rot=(0, -s * 0.35, 0))
mb.build("Birds", C_LAND)

# low-poly sunset clouds: flattened faceted puffs, banked toward the horizon
cloud_m = mat("Cloud", "#fff4ea", 1.0)
mb = MB()
random.seed(31)
placed = 0
while placed < 40:
    az = random.uniform(-85, 75)
    if -52 < az < -24:                      # keep the sun clear
        continue
    placed += 1
    dist = random.uniform(1600, 3200)
    cx = math.sin(math.radians(az)) * dist + 8
    cy = math.cos(math.radians(az)) * dist - 50
    cz = random.uniform(280, 900) * dist / 2400
    ln = random.uniform(80, 260)
    for k in range(random.randint(3, 7)):
        o = Vector((random.uniform(-ln, ln) * 0.6, random.uniform(-30, 30), random.uniform(-6, 12)))
        r = random.uniform(32, 64)
        mb.ico(Vector((cx, cy, cz)) + o, (r * random.uniform(1.4, 2.2), r, r * 0.42), cloud_m,
               sub=1, jitter=0.18, rot=(0, 0, math.radians(-az)))
clouds = mb.build("Clouds", C_LAND)
clouds.visible_shadow = False

# -------------------------------------------------------------------- world
world = bpy.data.worlds.new("Sky")
scene.world = world
world.use_nodes = True
nt = world.node_tree
bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
sky = nt.nodes.new("ShaderNodeTexSky")
types = [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items]
sky.sky_type = "MULTIPLE_SCATTERING" if "MULTIPLE_SCATTERING" in types else types[0]
sky.sun_elevation = SUN_ELEV
sky.sun_rotation = SUN_AZ
sky.sun_disc = True
sky.sun_size = math.radians(1.6)
sky.sun_intensity = 0.25
sky.altitude = 400
sky.air_density = 1.4
sky.aerosol_density = 1.3
sky.ozone_density = 3.0
nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.16

sun_data = bpy.data.lights.new("Sun", "SUN")
sun_data.energy = 5.0
sun_data.color = lin("#ffb46b")
sun_data.angle = math.radians(1.2)
sun = bpy.data.objects.new("Sun", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (-SUN_DIR).to_track_quat("-Z", "Y").to_euler()

# desert haze: a low, thinning volume over everything
haze_m = bpy.data.materials.new("Haze")
haze_m.use_nodes = True
hn = haze_m.node_tree
for n in list(hn.nodes):
    if n.type != "OUTPUT_MATERIAL":
        hn.nodes.remove(n)
out = next(n for n in hn.nodes if n.type == "OUTPUT_MATERIAL")
vol = hn.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Color"].default_value = (*lin("#f0c9a0"), 1)
vol.inputs["Anisotropy"].default_value = 0.55
tc = hn.nodes.new("ShaderNodeTexCoord")
sep = hn.nodes.new("ShaderNodeSeparateXYZ")
hn.links.new(tc.outputs["Object"], sep.inputs["Vector"])
# density = d0 * exp(-(z - zmin)/H); object coords span [-1,1] over the cube height
mz = hn.nodes.new("ShaderNodeMath"); mz.operation = "MULTIPLY_ADD"
mz.inputs[1].default_value = -60 / 22.0     # half-height / scale-height
mz.inputs[2].default_value = -60 / 22.0
hn.links.new(sep.outputs["Z"], mz.inputs[0])
ex = hn.nodes.new("ShaderNodeMath"); ex.operation = "EXPONENT"
hn.links.new(mz.outputs[0], ex.inputs[0])
md = hn.nodes.new("ShaderNodeMath"); md.operation = "MULTIPLY"
md.inputs[1].default_value = 0.0035
hn.links.new(ex.outputs[0], md.inputs[0])
hn.links.new(md.outputs[0], vol.inputs["Density"])
hn.links.new(vol.outputs[0], out.inputs["Volume"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(100, 200, 50))
haze = bpy.context.active_object
haze.name = "Haze"
haze.scale = (1400, 1400, 120)
haze.data.materials.append(haze_m)
haze.visible_shadow = False

# ------------------------------------------------------------------- camera
cam_d = bpy.data.cameras.new("Cam")
cam_d.lens = 24
cam_d.clip_end = 4000
cam = bpy.data.objects.new("Cam", cam_d)
scene.collection.objects.link(cam)
scene.camera = cam
cam.location = (8.0, -52.0, height(8.0, -52) + 8.5)
target = Vector((-6.0, 40.0, 7.5))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_d.dof.use_dof = True
cam_d.dof.focus_distance = 30
cam_d.dof.aperture_fstop = 11

# ------------------------------------------------------------------- render
try:
    scene.render.engine = "CYCLES"
except TypeError as e:
    print(e)
cy = scene.cycles
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev_type in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dev_type
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == dev_type]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == dev_type
            cy.device = "GPU"
            print("Using", dev_type, [d.name for d in gpus])
            break
    except TypeError:
        pass
cy.samples = 48 if PREVIEW else 384
cy.use_adaptive_sampling = True
cy.use_denoising = True
cy.max_bounces = 6
cy.volume_bounces = 0
cy.transparent_max_bounces = 4
cy.volume_step_rate = 4.0 if PREVIEW else 2.0
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 40 if PREVIEW else 100
for vt in ("AgX", "Filmic"):
    try:
        scene.view_settings.view_transform = vt
        break
    except TypeError:
        pass
for look in ("AgX - Medium High Contrast", "AgX - Punchy", "Medium High Contrast"):
    try:
        scene.view_settings.look = look
        break
    except TypeError:
        pass
scene.view_settings.exposure = 0.0
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT

if not PREVIEW:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "tools", "blender", "still.blend"))
bpy.ops.render.render(write_still=True)
print("WROTE", OUT)
