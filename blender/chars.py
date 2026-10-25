"""Generic stylized person builder. Node names (exported in the GLB): rig > legL legR armL armR head torso (same pivots as people.js)."""
import math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import textures as TX

SK = dict(light=0xf2c09a, tan=0xe0a478, brown=0xa8704a, dark=0x7a5033, pale=0xf6d2b8)
def shade(c, k):
    r, g, b = (c >> 16) & 255, (c >> 8) & 255, c & 255
    return (min(255, int(r * k)) << 16) | (min(255, int(g * k)) << 8) | min(255, int(b * k))

WHITE = 0xf4f4f0; CREAM = 0xe6d8bd

def build_person(name, S):
    """S: dict spec. Returns root empty."""
    d = dict(skin=SK['light'], hair=0x3a2415, brow=None, outfit='tee', shirt=0xb4aca0, pants=0x2a2a30, shoe=0x1c1c20, sole=CREAM,
             legs='shorts', sock=WHITE, wide=1.0, depth=1.0, lean=0.0, headw=0.38, headh=0.42, headd=0.375, female=False, mouth='smile', eyes=1.0,
             hairStyle='short', hat=None, stache=False, beard=None, glasses=False, sunglasses=False, cigar=False, tie=0xa8161c, gold=False,
             backpack=False, apron=False, cuff=False, shoeStyle='sneaker', armLen=1.0, legLen=1.0, jacket=None, hood=False, bottle=False, tex=None, angry=False)
    d.update(S); S = d
    skin = mat(S['skin'], 0.7, role='skin'); skinD = mat(shade(S['skin'], 0.9), 0.75, role='skin2')
    W = S['wide']; D = S['depth']
    root = node('rig')
    legs, arms = [], []
    pantM = mat(S['pants'], 0.8, role='pants')
    if S.get('pantTex'): pantM = mat(0, 0.8, tex=S['pantTex'])

    # ---------------- legs ----------------
    for s in (-1, 1):
        n = node('legL' if s < 0 else 'legR', (s * 0.105 * W, 0.9, 0), root); legs.append(n)
        L = S['legLen']
        if S['legs'] == 'shorts':
            box('thigh', 0.17 * W, 0.36, 0.2 * D, pantM, (0, -0.17, 0), n, bevel=0.06, seg=3, taper=(1, 1, 0.96, 0.96), uvbox=3.0 if S.get('pantTex') else None)
            box('shortHem', 0.18 * W, 0.04, 0.21 * D, mat(shade(S['pants'], 0.82), 0.8), (0, -0.34, 0), n, bevel=0.012)
            box('calf', 0.112, 0.36, 0.115, skin, (0, -0.5, 0), n, bevel=0.05, seg=3, taper=(1, 1, 0.82, 0.8))
            box('sock', 0.125, 0.24, 0.13, mat(S['sock'], 0.9), (0, -0.68, 0), n, bevel=0.03)
            box('sockRib', 0.125, 0.025, 0.13, mat(shade(S['sock'], 0.9), 0.9), (0, -0.585, 0), n, bevel=0.01)
        else:  # long pants
            top = box('leg', 0.175 * W, 0.78, 0.2 * D, pantM, (0, -0.4, 0), n, bevel=0.045, taper=(1, 1, 0.84, 0.88), uvbox=3.0 if S.get('pantTex') else None)
            if S['cuff']: box('cuff', 0.158 * W, 0.075, 0.18 * D, mat(shade(S['pants'], 1.35), 0.85), (0, -0.755, 0), n, bevel=0.022)
            if S['legs'] == 'suit': box('cuff', 0.16 * W, 0.06, 0.185 * D, pantM, (0, -0.76, 0), n, bevel=0.018)
        # shoe
        sh = S['shoe']; shM = mat(sh, 0.55, role='shoe'); soleM = mat(S['sole'], 0.7)
        if S['shoeStyle'] == 'dress':
            box('shoe', 0.16, 0.085, 0.31, mat(sh, 0.25), (0, -0.815, -0.06), n, bevel=0.035, taper=(1, 0.95, 1, 1))
            box('shoeSole', 0.165, 0.025, 0.315, mat(0x08080a, 0.5), (0, -0.865, -0.06), n, bevel=0.01)
        else:
            box('shoeUpper', 0.152, 0.12, 0.27, shM, (0, -0.79, -0.025), n, bevel=0.05, seg=3)
            ell('toe', 0.076, 0.055, 0.09, shM, (0, -0.835, -0.13), n)
            box('shoeSole', 0.158, 0.04, 0.3, soleM, (0, -0.875, -0.04), n, bevel=0.016)
            for i in range(3): box('lace', 0.085, 0.012, 0.022, mat(CREAM, 0.7), (0, -0.728, -0.065 - i * 0.04), n, bevel=0.004, rot=(0.25, 0, 0))

    # ---------------- torso ----------------
    tn = node('torso', (0, 1.18, 0), root); tw = 0.40 * W; td = 0.255 * D
    outfit = S['outfit']
    tm = mat(S['shirt'], 0.8, role='shirt')
    if S.get('tex'): tm = mat(0, 0.8, tex=S['tex'])
    if outfit == 'tank':
        box('midriff', 0.31 * W, 0.6, 0.2, skin, (0, 0, 0), tn, bevel=0.06, taper=(1, 1, 0.88, 0.88))
        box('top', 0.34 * W, 0.34, 0.215, tm, (0, 0.13, 0), tn, bevel=0.06, taper=(1.12, 1.05, 0.95, 0.95))
        for s in (-1, 1): ell('bust', 0.085, 0.075, 0.07, tm, (s * 0.075, 0.14, -0.1), tn)
        for s in (-1, 1): box('strap', 0.07, 0.17, 0.2, tm, (s * 0.115, 0.31, 0), tn, bevel=0.02)
    elif outfit in ('suit', 'suitFat'):
        jm = mat(0, 0.7, tex=S['tex']) if S.get('tex') else mat(S['shirt'], 0.75)
        box('jacket', tw * 1.12, 0.62, td * 1.35, jm, (0, 0, 0), tn, bevel=0.07, taper=(1.12, 1.0, 0.98, 1.0), uvbox=3.0)
        box('shirtV', 0.13 * W, 0.4, 0.012, mat(WHITE, 0.6), (0, 0.08, -td * 0.68 - 0.004), tn, bevel=0.004)
        tie = box('tie', 0.045, 0.34, 0.014, mat(S['tie'], 0.5), (0, 0.04, -td * 0.68 - 0.012), tn, bevel=0.006)
        box('tieKnot', 0.05, 0.05, 0.02, mat(S['tie'], 0.5), (0, 0.23, -td * 0.68 - 0.012), tn, bevel=0.01)
        for s in (-1, 1):
            lap = box('lapel', 0.085, 0.36, 0.02, jm, (s * 0.1 * W, 0.1, -td * 0.68 - 0.006), tn, bevel=0.008, rot=(0, 0, s * 0.3), uvbox=3.0)
        if S['gold']:  # double-breasted buttons + buckle
            for s in (-1, 1):
                for y in (0.14, -0.02, -0.18): ell('btn', 0.016, 0.016, 0.01, mat(0xe0b020, 0.25, 0.9), (s * 0.14 * W, y, -td * 0.68 - 0.012), tn)
            box('buckle', 0.07, 0.05, 0.015, mat(0xe0b020, 0.25, 0.9), (0, -0.27, -td * 0.68 - 0.01), tn, bevel=0.008)
            box('hank', 0.05, 0.035, 0.012, mat(WHITE, 0.6), (-0.14 * W, 0.14, -td * 0.68 - 0.014), tn, bevel=0.004, rot=(0, 0, 0.3))
    else:
        t_tex = mat(0, 0.8, tex=S['tex']) if S.get('tex') else tm
        box('chest', tw, 0.6, td * 1.1, t_tex, (0, 0, 0), tn, bevel=0.1, seg=4, taper=(1.12, 1.0, 0.94, 0.95), uvbox=2.2 if S.get('tex') else None)
        if S.get('backTex'):
            quad('backDecal', 0.33 * W, 0.5, mat(0, 0.8, tex=S['backTex']), (0, 0.0, td * 0.55 + 0.012), tn, rot=(0, math.pi, 0))
    if S['outfit'] in ('hoodie',):
        hm = mat(shade(S['shirt'], 0.9), 0.85, role='shirt2')
        box('hoodBase', tw * 1.04, 0.2, td * 1.2, hm, (0, -0.25, 0), tn, bevel=0.04)
        box('hoodPocket', 0.26, 0.12, 0.014, mat(shade(S['shirt'], 0.8), 0.85), (0, -0.22, -td * 0.62), tn, bevel=0.01)
        box('hoodie', 0.28, 0.16, 0.2, hm, (0, 0.32, 0.1), tn, bevel=0.07)
        if S.get('zip'): box('zip', 0.012, 0.58, 0.01, mat(0x9a9aa0, 0.3, 0.8), (0, 0, -td * 0.6), tn, bevel=0.003); box('innerShirt', 0.14, 0.45, 0.012, mat(S.get('inner', WHITE), 0.8), (0, 0.04, -td * 0.57), tn, bevel=0.004)
    if S.get('patch'): quad('patch', 0.085, 0.085, mat(0, 0.8, tex=TX.patch()), (0.1 * W, 0.12, -td * 0.55 - 0.006), tn)
    if S.get('frontNum'): quad('frontDecal', 0.33 * W, 0.5, mat(0, 0.8, tex=S['frontNum']), (0, 0.0, -td * 0.55 - 0.012), tn)
    # neck
    cyl('neck', 0.062 * W ** 0.5, 0.068 * W ** 0.5, 0.11, skin, (0, 1.505, 0), root)
    if outfit in ('tee', 'jersey', 'button', 'floral'): cyl('collar', 0.092 * W ** 0.5, 0.098 * W ** 0.5, 0.035, mat(shade(S['shirt'], 0.88), 0.85), (0, 1.47, -0.005), root, sx=1.0, sz=0.9)
    # waist apron
    if S['apron']:
        am = mat(0x2c2a2c, 0.9)
        box('apron', 0.4 * W, 0.34, 0.285, am, (0, 0.98, 0), root, bevel=0.03, taper=(1, 1, 1.02, 1.02))
        box('apronPocket', 0.2, 0.15, 0.014, mat(0x3a383a, 0.9), (0.02, 0.9, -0.147), root, bevel=0.006)
        box('apronStrapF', 0.34, 0.025, 0.29, mat(0x6a4a2a, 0.7), (0, 1.14, 0), root, bevel=0.006)
        t = box('towel', 0.09, 0.34, 0.016, mat(0xdcd2bc, 0.9), (-0.12, 0.95, -0.15), root, bevel=0.008)
        for s in (-1, 1): box('apronTie', 0.05, 0.28, 0.02, am, (s * 0.2, 0.92, 0.12), root, bevel=0.008, rot=(0.15, 0, s * 0.08))

    # ---------------- arms ----------------
    A = S['armLen']; sleeveLen = {'tee': 0.2, 'jersey': 0.2, 'button': 0.2, 'floral': 0.2, 'hoodie': 0.52, 'suit': 0.5, 'tank': 0.0}.get(outfit, 0.2)
    sleeveM = mat(0, 0.8, tex=S['tex']) if (S.get('tex') and outfit in ('suit', 'floral')) else (mat(S['shirt'], 0.8, role='shirt') if outfit != 'hoodie' else mat(shade(S['shirt'], 0.92), 0.85, role='shirt2'))
    for s in (-1, 1):
        n = node('armL' if s < 0 else 'armR', (s * 0.265 * W, 1.43, 0), root); arms.append(n)
        sl = sleeveLen; skinLen = 0.56 * A - sl
        up = 0.075 * (W ** 0.5)
        if sl > 0:
            box('sleeve', up * 1.62, sl, up * 1.58, sleeveM, (0, -sl / 2 + 0.03, 0), n, bevel=0.055, seg=3, taper=(1.0, 1.0, 0.92, 0.92), uvbox=(3.0 if outfit == 'suit' else 2.2) if (S.get('tex') and outfit in ('suit', 'floral')) else None)
            if outfit == 'suit': box('cuffW', up * 1.6, 0.03, up * 1.6, mat(WHITE, 0.6), (0, -sl + 0.045, 0), n, bevel=0.01)
        else: box('shoulder', 0.1, 0.1, 0.13, skin, (0, -0.02, 0), n, bevel=0.04)
        if skinLen > 0.02:
            box('forearm', 0.082 * W ** 0.5, skinLen, 0.082 * W ** 0.5, skin, (0, -sl - skinLen / 2 + 0.03, 0), n, bevel=0.042, seg=3, taper=(1, 1, 0.8, 0.78))
        hy = -0.56 * A - 0.07
        hand = node('hand', (0, hy + 0.0, 0), n)
        box('palm', 0.1, 0.1, 0.08, skin, (0, 0, 0), hand, bevel=0.035, seg=3)
        for i in range(4): box('finger', 0.021, 0.075 - (0.008 if i == 3 else 0), 0.032, skin, (-0.033 + i * 0.022, -0.082, -0.002), hand, bevel=0.01, rot=(-0.12, 0, 0))
        box('thumb', 0.03, 0.07, 0.03, skin, (s * -0.058, -0.02, -0.03), hand, bevel=0.011, rot=(-0.3, 0, s * 0.5))
        if S.get('ring') and s == 1: cyl('ring', 0.034, 0.034, 0.014, mat(0xe0b020, 0.25, 0.9), (-0.03, -0.06, 0), hand, sx=1, sz=1)
        if S.get('ring2') and s == -1: cyl('ring', 0.034, 0.034, 0.014, mat(0xe0b020, 0.25, 0.9), (0.03, -0.06, 0), hand)

    # ---------------- head ----------------
    hn = node('head', (0, 1.7, 0), root)
    hw, hh, hd = S['headw'], S['headh'], S['headd']
    box('skull', hw, hh, hd, skin, (0, 0.0, 0), hn, bevel=0.14, seg=5, taper=(1.0, 1.0, 0.9, 0.84))
    box('jaw', hw * 0.8, 0.13, hd * 0.88, skin, (0, -0.15, -0.02), hn, bevel=0.06, seg=4)
    for s in (-1, 1): ell('ear', 0.035, 0.065, 0.045, skin, (s * (hw / 2 + 0.012), -0.01, 0.015), hn)
    # eyes
    ek = S['eyes']; ew, eh = 0.066 * ek, 0.082 * ek
    white = mat(0xfafafa, 0.2); blk = mat(0x0a0a0c, 0.15)
    ez = -hd / 2 - 0.004
    if not S['sunglasses']:
        for s in (-1, 1):
            ell('eyeW', ew * 0.9, eh * 0.9, 0.016, white, (s * 0.085, 0.045, ez + 0.006), hn)
            ell('pupil', 0.03 * ek, 0.036 * ek, 0.01, blk, (s * 0.085 + S.get('look', 0.006), 0.04, ez - 0.006), hn)
            ell('shine', 0.009, 0.009, 0.006, white, (s * 0.085 + 0.012, 0.052, ez - 0.014), hn)
    bro = mat(S['brow'] or S['hair'], 0.6)
    ang = -0.28 if S['angry'] else (0.1 if not S['female'] else 0.06)
    for s in (-1, 1):
        box('brow', 0.115 * (1.2 if S['angry'] else 1.0), 0.038 if not S['female'] else 0.03, 0.035, bro, (s * 0.088, 0.135, ez - 0.002), hn, bevel=0.012, rot=(0, 0, s * ang))
    # nose
    box('nose', 0.07, 0.1, 0.07, skinD, (0, -0.03, -hd / 2 - 0.018), hn, bevel=0.028, taper=(0.8, 0.7, 1, 1))
    ell('noseTip', 0.036, 0.034, 0.03, skinD, (0, -0.075, -hd / 2 - 0.045), hn)
    # mouth
    mm = mat(0x5a1c1c, 0.4); mz = -hd / 2 - 0.0
    mouth = S['mouth']
    if mouth in ('smile', 'smirk'):
        for i in range(9):
            a = (i - 4) / 4.0; box('mouthSeg', 0.026, 0.011, 0.012, mm, (a * 0.058, -0.152 + (a * a) * 0.024, mz - 0.002), hn, bevel=0.003, rot=(0, 0, -a * 0.4))
    elif mouth == 'grin':
        box('mouthIn', 0.13, 0.065, 0.02, mm, (0, -0.135, mz - 0.003), hn, bevel=0.02)
        box('teeth', 0.115, 0.022, 0.02, white, (0, -0.116, mz - 0.012), hn, bevel=0.006)
    elif mouth == 'open':
        box('mouthIn', 0.11, 0.09, 0.02, mm, (0, -0.14, mz - 0.003), hn, bevel=0.03); box('teeth', 0.09, 0.02, 0.02, white, (0, -0.108, mz - 0.012), hn, bevel=0.006)
    elif mouth == 'smug':
        box('mouthSeg', 0.09, 0.016, 0.014, mm, (0.005, -0.14, mz - 0.003), hn, bevel=0.004, rot=(0, 0, 0.06))
    else:
        box('mouthSeg', 0.085, 0.017, 0.014, mm, (0, -0.14, mz - 0.003), hn, bevel=0.004)
    # facial hair
    hairM = mat(S['hair'], 0.55, role='hair')
    if S['stache']: box('stache', 0.15, 0.04, 0.045, hairM, (0, -0.088, -hd / 2 - 0.022), hn, bevel=0.016, taper=(1, 1, 0.9, 1))
    if S['beard'] == 'full':
        box('beard', hw * 0.96, 0.17, hd * 0.8, hairM, (0, -0.13, -0.05), hn, bevel=0.07, seg=3)
        box('beardMouth', 0.1, 0.03, 0.02, mm, (0, -0.137, -hd / 2 - 0.045), hn, bevel=0.006)
        box('stacheB', 0.15, 0.035, 0.04, hairM, (0, -0.092, -hd / 2 - 0.025), hn, bevel=0.012)
    elif S['beard'] == 'stubble':
        box('stubble', hw * 0.97, 0.16, hd * 0.8, mat(shade(S['skin'], 0.74), 0.95), (0, -0.14, -0.05), hn, bevel=0.07, seg=3)
    if S['cigar']:
        c = cyl('cigar', 0.02, 0.02, 0.16, mat(0x6a3a18, 0.7), (0.07, -0.14, -hd / 2 - 0.07), hn, rot=(math.pi / 2, 0, 0.0))
        cyl('cigarBand', 0.0215, 0.0215, 0.02, mat(0xe0b020, 0.3, 0.8), (0.07, -0.14, -hd / 2 - 0.045), hn, rot=(math.pi / 2, 0, 0))
        ell('cigarEmber', 0.021, 0.021, 0.012, mat(0xff7a20, 0.5, 0, emit=3), (0.07, -0.14, -hd / 2 - 0.152), hn)
    if S['glasses']:
        gm = mat(0x15151a, 0.3)
        for s in (-1, 1):
            for (bx_, by, bw, bh) in ((0, 0.085, 0.14, 0.018), (0, -0.0, 0.14, 0.018)): box('gl', bw, bh, 0.014, gm, (s * 0.088 + bx_, 0.04 + by - 0.04, ez - 0.036), hn, bevel=0.005)
            for sx in (-1, 1): box('gl', 0.016, 0.1, 0.014, gm, (s * 0.088 + sx * 0.07, 0.04, ez - 0.036), hn, bevel=0.005)
            box('temple', 0.014, 0.014, 0.2, gm, (s * (hw / 2 + 0.003), 0.04, -0.07), hn, bevel=0.004)
        box('bridge', 0.045, 0.016, 0.014, gm, (0, 0.062, ez - 0.036), hn, bevel=0.005)
    if S['sunglasses']:
        sg = mat(0x060608, 0.08)
        for s in (-1, 1): box('lens', 0.15, 0.085, 0.02, sg, (s * 0.088, 0.04, ez - 0.02), hn, bevel=0.025, seg=3)
        box('bridge', 0.045, 0.02, 0.016, sg, (0, 0.062, ez - 0.02), hn, bevel=0.006)
        box('temple', hw + 0.02, 0.016, 0.014, sg, (0, 0.06, -0.0), hn, bevel=0.004)
    # hair
    hs = S['hairStyle']; hat = S['hat']
    beanie = hat and hat.get('style') == 'beanie'
    if hs != 'bald' and not beanie and hs != 'none':
        capw = False
        if True: box('hairTop', hw * 1.04, 0.14, hd * 1.02, hairM, (0, 0.17, 0.0), hn, bevel=0.06, seg=3)
        box('hairBack', hw * 1.04, 0.3, 0.1, hairM, (0, 0.02, hd / 2 - 0.04), hn, bevel=0.05, seg=3)
        for s in (-1, 1): box('sideburn', 0.05, 0.16, 0.12, hairM, (s * (hw / 2 - 0.005), 0.07, 0.02), hn, bevel=0.02)
        if hs in ('short', 'messy') and not capw:
            for i in range(5): box('fringe', 0.085, 0.07, 0.04, hairM, ((i - 2) * 0.075, 0.2 - abs(i - 2) * 0.012, -hd / 2 + 0.0), hn, bevel=0.02, rot=(0, 0, (i - 2) * 0.1))
        if hs == 'messy' and not capw:  # curly volume
            import random; random.seed(11)
            for i in range(14):
                a = random.random() * 6.28; r = random.random() * 0.12
                ell('curl', 0.06, 0.055, 0.06, hairM, (math.cos(a) * r * 1.4, 0.24 + random.random() * 0.06, math.sin(a) * r), hn, seg=7, rings=5)
        if hs == 'slick':
            box('slickTop', hw * 1.05, 0.09, hd * 1.12, mat(S['hair'], 0.3, role='hair'), (0, 0.235, 0.0), hn, bevel=0.04, seg=3)
            box('quiff', hw * 0.9, 0.1, 0.12, mat(S['hair'], 0.3, role='hair'), (0, 0.27, -hd / 2 + 0.06), hn, bevel=0.04, rot=(0.35, 0, 0))
            for s in (-1, 1): box('slickSide', 0.04, 0.2, 0.14, hairM, (s * (hw / 2 + 0.0), 0.1, 0.05), hn, bevel=0.015)
        if hs == 'bun':
            import random; random.seed(5)
            for i in range(11):
                a = i / 11 * 6.28; ell('bunPiece', 0.06, 0.07, 0.06, hairM, (math.cos(a) * 0.09, 0.36 + (i % 2) * 0.03, 0.1 + math.sin(a) * 0.08), hn, seg=6, rings=4)
            ell('bun', 0.12, 0.12, 0.12, hairM, (0, 0.36, 0.1), hn, seg=8, rings=5)
            for s in (-1, 1):
                box('strand', 0.07, 0.34, 0.14, hairM, (s * (hw / 2 + 0.005), -0.07, -0.03), hn, bevel=0.02, rot=(0, 0, s * 0.04))
                box('strandTip', 0.045, 0.12, 0.07, hairM, (s * (hw / 2 + 0.01), -0.27, -0.07), hn, bevel=0.015, rot=(0, 0, s * 0.18))
            box('hairBang', hw * 1.0, 0.07, 0.07, hairM, (0, 0.2, -hd / 2 + 0.01), hn, bevel=0.025)
    # hats
    if hat:
        hc = mat(hat['color'], 0.7, role='hat'); hcd = mat(shade(hat['color'], 0.78), 0.7, role='hat2')
        st = hat.get('style', 'cap')
        if st == 'beanie':
            box('beanie', hw * 1.1, 0.24, hd * 1.1, hc, (0, 0.17, 0.0), hn, bevel=0.1, seg=3)
            box('beanieCuff', hw * 1.14, 0.075, hd * 1.14, hcd, (0, 0.085, 0.0), hn, bevel=0.03)
            ell('pom', 0.05, 0.045, 0.05, hc, (0, 0.31, 0), hn, seg=8, rings=5)
        elif st == 'fedora':
            cyl('brim', 0.27, 0.27, 0.025, hc, (0, 0.2, 0), hn, seg=20, sx=1.0, sz=1.0)
            box('crown', 0.27, 0.19, 0.28, hc, (0, 0.3, 0), hn, bevel=0.07, seg=3, taper=(0.9, 0.9, 1, 1))
            box('crownDent', 0.2, 0.02, 0.2, hcd, (0, 0.4, 0), hn, bevel=0.01)
            box('hatBand', 0.285, 0.045, 0.295, mat(0x2a2a30, 0.5), (0, 0.235, 0), hn, bevel=0.01)
        else:
            back = hat.get('backwards', False); dz = 1 if back else -1
            ell('capDome', hw * 0.56, 0.2, hd * 0.575, hc, (0, 0.115, 0.0), hn, seg=20, rings=12, clip=True)
            cyl('capBand', hw * 0.56, hw * 0.56, 0.06, hc, (0, 0.085, 0.0), hn, seg=20, sx=1.0, sz=hd * 0.575 / (hw * 0.56))
            ell('capBtn', 0.02, 0.014, 0.02, hcd, (0, 0.32, 0), hn, seg=8, rings=5)
            box('brim', 0.26, 0.022, 0.2, hcd, (0, 0.1, dz * (hd / 2 + 0.07)), hn, bevel=0.01, rot=(dz * -0.12, 0, 0), taper=(1, 1, 1, 0.9))
            strapZ = -dz * (hd / 2 - 0.02)
            box('capStrap', 0.12, 0.04, 0.02, mat(0x16161a, 0.6), (0, 0.12, strapZ - 0.02), hn, bevel=0.006)
            box('capTab', 0.04, 0.07, 0.016, mat(0x16161a, 0.6), (0, 0.15, strapZ - 0.022), hn, bevel=0.006)

    # accessories
    if S['backpack']:
        bg = mat(0x4a5238, 0.85); bd = mat(0x363c28, 0.85)
        box('bp', 0.32, 0.42, 0.14, bg, (0, 0.0, 0.2), tn, bevel=0.05)
        box('bpFlap', 0.3, 0.2, 0.04, bd, (0, 0.1, 0.275), tn, bevel=0.02)
        box('bpPocket', 0.2, 0.16, 0.05, bd, (0, -0.12, 0.28), tn, bevel=0.02)
        box('bpBuckle', 0.05, 0.05, 0.02, mat(0x9a9a9a, 0.3, 0.8), (0, 0.0, 0.3), tn, bevel=0.006)
        box('bpHandle', 0.07, 0.02, 0.02, bd, (0, 0.23, 0.2), tn, bevel=0.006)
        for s in (-1, 1): box('bpStrap', 0.05, 0.5, 0.03, bd, (s * 0.13 * W, 0.04, -td * 0.55 - 0.0), tn, bevel=0.012); box('bpStrapBack', 0.05, 0.05, 0.22, bd, (s * 0.13 * W, 0.295, td * 0.35), tn, bevel=0.012)
        for s in (-1, 1): box('bpSide', 0.04, 0.2, 0.1, bd, (s * 0.18, -0.08, 0.2), tn, bevel=0.015)
    import re
    pref = [('hat_', r'^(cap|brim|beanie|pom|crown|hatBand)'), ('hairtop_', r'^(hairTop|fringe|curl|slickTop|quiff)'), ('hair_', r'^(hair|fringe|curl|sideburn|bun|strand|slick|quiff)'), ('pack_', r'^bp'), ('glasses_', r'^(gl$|temple|bridge)'), ('stache_', r'^stache')]
    for o in list(bpy.context.scene.objects):
        b = o.name.split('.')[0]
        for p, rx in pref:
            if re.match(rx, b): o.name = p + o.name; break
    return root
