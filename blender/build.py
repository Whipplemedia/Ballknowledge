import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from specs import *
import bpy
names = sys.argv[1:] or list(SPECS)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models')
PREV = '/tmp/bk_prev'; os.makedirs(PREV, exist_ok=True)
for n in names:
    reset(); r = build_person(n, SPECS[n]); optimize(r)
    export(os.path.abspath(f'{OUT}/{n}.glb'))
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'), exist_ok=True)
    try:
        bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', n + '.blend'), compress=True)
    except Exception as e: print('blend save failed', e)
    if SPECS[n].get('hat'):
        for o in bpy.context.scene.objects:
            if o.name.startswith('hairtop_'): o.hide_render = True
    if os.environ.get('NORENDER'): print('built', n); continue
    render_setup((600, 800))
    for tag, yaw in ((('front', 0), ('side', math.pi / 2), ('back', math.pi), ('34', math.pi / 5)) if os.environ.get('FULL') else (('front', 0), ('34', math.pi / 5))):
        shot(f'{PREV}/{n}_{tag}.png', yaw, 3.7, 0.98)
    print('built', n)
