#!/usr/bin/env python3
"""Re-encode a GLB's embedded textures as JPEG at <= max size (keeps rig/animation untouched).
usage: shrink_glb.py in.glb out.glb [max_px=1024] [quality=88]"""
import sys, json, struct, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; mx = int(sys.argv[3]) if len(sys.argv) > 3 else 1024; q = int(sys.argv[4]) if len(sys.argv) > 4 else 88
d = open(src, 'rb').read(); jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); bo = 20 + jl
bl = struct.unpack('<I', d[bo:bo + 4])[0]; blob = d[bo + 8:bo + 8 + bl]
views = j['bufferViews']; img_views = {im['bufferView'] for im in j.get('images', []) if 'bufferView' in im}
new = []; out = bytearray()
for i, v in enumerate(views):
    data = blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    if i in img_views:
        im = Image.open(io.BytesIO(data)).convert('RGB')
        if max(im.size) > mx: s = mx / max(im.size); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True); data = b.getvalue()
    while len(out) % 4: out.append(0)
    nv = dict(v); nv['byteOffset'] = len(out); nv['byteLength'] = len(data); new.append(nv); out += data
for im in j.get('images', []): im['mimeType'] = 'image/jpeg'
j['bufferViews'] = new; j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
while len(out) % 4: out.append(0)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(dst, 'wb').write(glb); print(f'{src}: {len(d)//1024}KB -> {len(glb)//1024}KB')
