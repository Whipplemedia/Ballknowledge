from chars import *
import textures as TX
SPECS = {}
SPECS['bub'] = dict(skin=SK['light'], hair=0x4a2c1a, hairStyle='short', hat=dict(color=0xa49a90, backwards=True), outfit='tee', shirt=0xbab0a2, legs='shorts', pants=0x3b3a3e, sock=WHITE,
    shoe=0x26262a, backpack=True, patch=True, mouth='smile', headw=0.37, armLen=1.04, legLen=1.0)

DENIM = 0x4f6f9c; DARK = 0x2a2a30
SPECS['bartender'] = dict(skin=SK['tan'], hair=0x6b3a22, hairStyle='bun', female=True, outfit='tank', shirt=0x17171c, legs='pants', pants=DENIM, cuff=True, shoe=0x1c1a1c, sole=CREAM,
    apron=True, wide=0.9, depth=0.92, headw=0.36, eyes=1.12, mouth='smile', armLen=0.97, look=0.0)
SPECS['sal'] = dict(skin=SK['tan'], hair=0x15151a, hairStyle='slick', outfit='suit', shirt=0x18181d, tex=TX.pinstripe(), legs='suit', pants=0x18181d, pantTex=TX.pinstripe(), shoeStyle='dress', shoe=0x0e0e10,
    gold=True, ring=True, ring2=True, cigar=True, angry=True, wide=1.28, depth=1.3, headw=0.46, headh=0.43, headd=0.4, mouth='flat', armLen=0.96, tie=0xa8161c, brow=0x0c0c10, eyes=0.95)
SPECS['hitman'] = dict(skin=SK['light'], hair=0x0a0a0c, hairStyle='short', hat=dict(color=0x111114, style='fedora'), outfit='suit', shirt=0x131317, legs='suit', pants=0x131317, shoeStyle='dress', shoe=0x0a0a0c,
    sunglasses=True, mouth='flat', wide=1.12, depth=1.12, headw=0.42, tie=0x0c0c0e)
SPECS['jock'] = dict(skin=SK['light'], hair=0x3a2415, hairStyle='short', hat=dict(color=0x9a9aa0, backwards=True), outfit='jersey', shirt=0x1d2c5c, legs='shorts', pants=0x34343c, mouth='grin', wide=1.08,
    frontNum=TX.jersey_front(0x1d2c5c, 0xc8283a, 0xf2f2f2, '12'), backTex=TX.jersey_back(0x1d2c5c, 0xc8283a, 0xf2f2f2, '12'), headw=0.4)
SPECS['knowItAll'] = dict(skin=SK['light'], hair=0x4a2c18, hairStyle='messy', glasses=True, outfit='button', shirt=0xaeb4bc, frontNum=TX.button_front(), legs='shorts', pants=DARK, mouth='smirk' if False else 'smile', wide=0.9, armLen=1.02)
SPECS['gambler'] = dict(skin=SK['tan'], hair=0x1e1410, hairStyle='short', hat=dict(color=0xb82a2a, backwards=True), outfit='floral', shirt=0x101014, tex=TX.floral(), stache=True, legs='shorts', pants=0xc4a47a, shoe=0x1c1c20, mouth='smile', wide=1.02)
SPECS['chill'] = dict(skin=SK['light'], hair=0x555555, hairStyle='short', hat=dict(color=0x1c2230, backwards=True), outfit='hoodie', shirt=0x34343a, legs='pants', pants=0x5a7aa8, beard='stubble', sunglasses=True, mouth='flat', shoe=0x1c1c20, wide=1.02)
SPECS['dieHard'] = dict(skin=SK['tan'], hair=0x15100e, hairStyle='short', hat=dict(color=0x121214, style='beanie'), outfit='tee', shirt=0xe8731e, frontNum=TX.tee_front(0xe8731e), beard='full', legs='shorts', pants=0x6a6a72, mouth='open', wide=1.15, depth=1.12, headw=0.42)
SPECS['rookie'] = dict(skin=SK['pale'], hair=0x3a2a1e, hairStyle='short', hat=dict(color=0xa49a90, backwards=True), outfit='hoodie', shirt=0x35353b, zip=True, inner=0xe4e0d8, legs='pants', pants=DENIM, cuff=True, shoe=0x16161a, mouth='flat' if False else 'smile', wide=0.9, armLen=1.0)
