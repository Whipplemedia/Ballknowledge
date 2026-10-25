"""Ball Knowledge character-building helpers (headless Blender / bpy).
All dimensions are given in the GAME's coordinate system (three.js: x right, y up, front = -z, feet at y=0)
and converted to Blender's (x, -z, y) internally, so builds can be compared 1:1 with public/people.js."""
import bpy, bmesh, math, os
from mathutils import Matrix, Vector, Euler

def T(x, y, z): return Vector((x, -z, y))
_C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # three -> blender basis change
def rot_t(rx=0, ry=0, rz=0):
    R = Euler((rx, ry, rz), 'XYZ').to_matrix()
    return (_C @ R @ _C.inverted()).to_euler()

def srgb2lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexcol(h):
    return (srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255), 1)

_mats = {}
def mat(color, rough=0.62, metal=0.0, tex=None, emit=0.0, role=None):
    key = (color, rough, metal, tex, emit, role)
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new(f'{role or "m"}_{len(_mats)}'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if tex:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(tex); n.image.colorspace_settings.name = 'sRGB'
        n.interpolation = 'Closest' if 'nearest' in tex else 'Linear'
        m.node_tree.links.new(n.outputs['Color'], b.inputs['Base Color'])
    else: b.inputs['Base Color'].default_value = hexcol(color)
    if emit:
        b.inputs['Emission Color'].default_value = hexcol(color); b.inputs['Emission Strength'].default_value = emit
    _mats[key] = m; return m

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); _mats.clear()

def _finish(bm, name, m, parent, loc, rot, smooth=True, uvbox=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if smooth:
        for p in me.polygons: p.use_smooth = True
        try: me.set_sharp_from_angle(angle=math.radians(38))
        except Exception: pass
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if m: o.data.materials.append(m)
    if parent: o.parent = parent
    o.location = T(*loc); o.rotation_euler = rot_t(*rot)
    if uvbox: box_uv(o, uvbox)
    return o

def box_uv(o, scale):
    me = o.data; uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    for p in me.polygons:
        n = p.normal
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if abs(n.y) >= abs(n.x) and abs(n.y) >= abs(n.z): u, w = v.x, v.z   # blender y = three z (front/back faces)... swapped below
            elif abs(n.x) >= abs(n.z): u, w = v.y, v.z
            else: u, w = v.x, v.z
            # front/back (normal along blender Y): u=x, v=height(z)
            if abs(n.y) >= abs(n.x) and abs(n.y) >= abs(n.z): u, w = v.x, v.z
            elif abs(n.x) >= abs(n.y) and abs(n.x) >= abs(n.z): u, w = v.y, v.z
            else: u, w = v.x, v.y
            uv.data[li].uv = (u * scale, w * scale)

def box(name, w, h, d, m, loc=(0, 0, 0), parent=None, bevel=0.03, seg=2, rot=(0, 0, 0), taper=None, uvbox=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    for v in bm.verts: v.co = Vector((v.co.x * w, -v.co.z * d, v.co.y * h)) if False else Vector((v.co.x * w, v.co.y * d, v.co.z * h))
    if taper:  # (top_scale_x, top_scale_z, bottom_scale_x, bottom_scale_z) multipliers on x/z extents
        tx, tz, bx_, bz = taper
        for v in bm.verts:
            k = (v.co.z / h) + 0.5
            sx = bx_ + (tx - bx_) * k; sz = bz + (tz - bz) * k
            v.co.x *= sx; v.co.y *= sz
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(w, h, d) * 0.48), segments=seg, affect='EDGES', profile=0.55)
    return _finish(bm, name, m, parent, loc, rot, uvbox=uvbox)

def ell(name, rx, ry, rz, m, loc=(0, 0, 0), parent=None, rot=(0, 0, 0), seg=16, rings=10, clip=False):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0, calc_uvs=True)
    for v in bm.verts: v.co = Vector((v.co.x * rx, -v.co.y * rz, v.co.z * ry))  # three x,y,z radii
    if clip:
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z < -0.002 for v in f.verts)], context='FACES')
        edge=[e for e in bm.edges if e.is_boundary]
        if edge: bmesh.ops.contextual_create(bm, geom=edge)
    return _finish(bm, name, m, parent, loc, rot)

def cyl(name, r1, r2, h, m, loc=(0, 0, 0), parent=None, rot=(0, 0, 0), seg=16, sx=1, sz=1, bevel=0.0):
    """Cylinder along game-Y; r1 = bottom radius, r2 = top radius; sx/sz stretch."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h, calc_uvs=True)
    for v in bm.verts: v.co = Vector((v.co.x * sx, v.co.y * sz, v.co.z))
    if bevel > 0: bmesh.ops.bevel(bm, geom=[e for e in bm.edges if len(e.link_faces) == 2 and abs(e.calc_face_angle(0)) > 0.6], offset=bevel, segments=2, affect='EDGES')
    return _finish(bm, name, m, parent, loc, rot)

def quad(name, w, h, m, loc, parent=None, rot=(0, 0, 0)):
    """flat plane facing game -Z (front) with UVs 0-1 (for decals)."""
    bm = bmesh.new()
    vs = [bm.verts.new((-w / 2, 0, -h / 2)), bm.verts.new((w / 2, 0, -h / 2)), bm.verts.new((w / 2, 0, h / 2)), bm.verts.new((-w / 2, 0, h / 2))]
    f = bm.faces.new(vs[::-1]) if True else None
    uv = bm.loops.layers.uv.new('UVMap')
    for l, (u, v) in zip(f.loops, [(1, 1), (0, 1), (0, 0), (1, 0)]): l[uv].uv = (u, v)
    bm.normal_update()
    return _finish(bm, name, m, parent, loc, rot, smooth=False)

def node(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    if parent: e.parent = parent
    e.location = T(*loc); e.empty_display_size = 0.05; return e

def faceted(o, n=0.0):
    return o

def export(path, objs=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)

def render_setup(res=(900, 1100)):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    w = bpy.data.worlds.new('w'); w.use_nodes = True; sc.world = w
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.42, 0.45, 0.52, 1); bg.inputs[1].default_value = 0.55
    for n, loc, e in (('key', T(2.2, 3.0, -3.2), 260), ('fill', T(-3.0, 1.6, -2.5), 110), ('rim', T(0.5, 2.8, 3.2), 200)):
        l = bpy.data.lights.new(n, 'AREA'); l.energy = e; l.size = 3
        o = bpy.data.objects.new(n, l); sc.collection.objects.link(o); o.location = loc
        d = (Vector((0, 0, 1.0)) - o.location).normalized(); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    gm = bpy.data.meshes.new('floor'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6); bm.to_mesh(gm)
    fo = bpy.data.objects.new('floor', gm); sc.collection.objects.link(fo); fo.data.materials.append(mat(0x6a6f7c, 0.9))
    fo.hide_select = True

def shot(path, yaw=0, dist=4.6, target_z=1.0, lens=50):
    """yaw 0 = front view (camera on the character's front side = blender +y)."""
    sc = bpy.context.scene
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    cam.data.lens = lens; sc.camera = cam
    cam.location = Vector((math.sin(yaw) * dist, math.cos(yaw) * dist, target_z + 0.15))
    d = (Vector((0, 0, target_z)) - cam.location).normalized(); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

RIG = ('legL', 'legR', 'armL', 'armR', 'head', 'torso')
def optimize(root):
    """Merge all parts under each rig node into one mesh per (visibility-prefix, material) => ~30 draw calls per person."""
    import re
    bpy.context.view_layer.update()
    nodes = {o.name: o for o in bpy.context.scene.objects if o.name in RIG}
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    groups = {}
    for o in meshes:
        a = o.parent
        while a and a.name not in RIG and a.name != 'rig': a = a.parent
        if a is None: continue
        pre = re.match(r'^(hat_|hairtop_|hair_|pack_|glasses_|stache_)', o.name); pre = pre.group(1) if pre else ''
        if not o.data.materials: continue
        groups.setdefault((a.name, pre, o.data.materials[0].name), []).append(o)
    for (an, pre, mn), lst in groups.items():
        a = nodes.get(an, root)
        for o in lst:
            mw = o.matrix_world.copy(); o.parent = a; o.matrix_world = mw
        tgt = lst[0]; tgt.name = f'{pre}{an}_{mn}'
        if len(lst) > 1:
            with bpy.context.temp_override(active_object=tgt, object=tgt, selected_editable_objects=lst, selected_objects=lst):
                bpy.ops.object.join()
    for o in list(bpy.context.scene.objects):
        if o.type == 'EMPTY' and o.name not in RIG and o.name != 'rig': bpy.data.objects.remove(o)
