"""PIL-generated textures for clothing (embedded into the GLBs)."""
from PIL import Image, ImageDraw, ImageFont
import os, random
OUT = '/tmp/bk_tex'; os.makedirs(OUT, exist_ok=True)
def _font(sz):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
def hexs(h): return '#%06x' % h

def patch(path=OUT + '/patch.png'):
    im = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((6, 6, 122, 122), 12, fill=(125, 128, 136, 255), outline=(90, 92, 98, 255), width=4)
    d.polygon([(14, 108), (46, 52), (68, 82), (84, 62), (114, 108)], fill=(226, 228, 232, 255))
    d.polygon([(46, 52), (56, 68), (40, 68)], fill=(250, 250, 252, 255))
    im.save(path); return path

def pinstripe(base=0x17171c, line=0x6a6a76, path=OUT + '/pin.png'):
    im = Image.new('RGB', (128, 128), hexs(base)); d = ImageDraw.Draw(im)
    for x in range(0, 128, 16): d.line((x, 0, x, 128), fill=hexs(line), width=2)
    im.save(path); return path

def jersey(body, stripe1, stripe2, num, numcol, path=OUT + '/jersey.png', back=False):
    im = Image.new('RGB', (256, 256), hexs(body)); d = ImageDraw.Draw(im)
    # sleeve-ish chest stripes
    for y, c in ((176, stripe1), (196, stripe2), (216, stripe1)): d.rectangle((0, y, 256, y + 14), fill=hexs(c))
    f = _font(120); tw = d.textbbox((0, 0), num, font=f)
    d.text((128 - (tw[2] - tw[0]) / 2 - tw[0], 18 - tw[1]), num, font=f, fill=hexs(numcol), stroke_width=4, stroke_fill=hexs(stripe1))
    im.save(path); return path

def floral(base=0x101014, c1=0xe8742a, c2=0xf0a040, c3=0x2f7a4a, path=OUT + '/floral.png'):
    random.seed(7); im = Image.new('RGB', (256, 256), hexs(base)); d = ImageDraw.Draw(im)
    for _ in range(46):
        x, y, r = random.randint(0, 256), random.randint(0, 256), random.randint(9, 17)
        for ox in (-256, 0, 256):
            for oy in (-256, 0, 256):
                X, Y = x + ox, y + oy
                for k in range(5):
                    import math; a = k * 1.2566
                    d.ellipse((X + math.cos(a) * r * .8 - r * .55, Y + math.sin(a) * r * .8 - r * .55, X + math.cos(a) * r * .8 + r * .55, Y + math.sin(a) * r * .8 + r * .55), fill=hexs(c1))
                d.ellipse((X - r * .35, Y - r * .35, X + r * .35, Y + r * .35), fill=hexs(c2))
    for _ in range(26):
        x, y = random.randint(0, 256), random.randint(0, 256); d.ellipse((x - 9, y - 4, x + 9, y + 4), fill=hexs(c3))
    im.save(path); return path

def bigT(body, letter='T', col=0xffffff, path=OUT + '/bigt.png'):
    im = Image.new('RGB', (256, 256), hexs(body)); d = ImageDraw.Draw(im)
    f = _font(190); tb = d.textbbox((0, 0), letter, font=f)
    d.text((128 - (tb[2] - tb[0]) / 2 - tb[0], 128 - (tb[3] - tb[1]) / 2 - tb[1]), letter, font=f, fill=hexs(col))
    im.save(path); return path

def buttonshirt(base=0xaab0b8, path=OUT + '/button.png'):
    im = Image.new('RGB', (128, 128), hexs(base)); d = ImageDraw.Draw(im)
    d.rectangle((60, 0, 68, 128), fill='#8e949c')
    for y in range(12, 128, 28): d.ellipse((60, y, 68, y + 8), fill='#5d6168')
    d.rectangle((14, 20, 38, 42), outline='#8e949c', width=2)
    im.save(path); return path

def denim(base=0x4a6a9a, path=OUT + '/denim.png'):
    random.seed(3); im = Image.new('RGB', (64, 64), hexs(base)); d = ImageDraw.Draw(im)
    for _ in range(90): x, y = random.randint(0, 63), random.randint(0, 63); d.point((x, y), fill=hexs(base + 0x0a0a0a))
    im.save(path); return path

def _f(sz): return _font(sz)
def jersey_front(body, t1, t2, num, numcol=0xffffff, path=OUT + '/jf.png'):
    im = Image.new('RGB', (256, 380), hexs(body)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 256, 34), fill=hexs(t1)); d.rectangle((0, 34, 256, 48), fill=hexs(t2))
    for y, c in ((318, t1), (336, t2), (354, t1)): d.rectangle((0, y, 256, y + 14), fill=hexs(c))
    f = _f(190); tb = d.textbbox((0, 0), num, font=f)
    d.text((128 - (tb[2] - tb[0]) / 2 - tb[0], 160 - (tb[3] - tb[1]) / 2 - tb[1]), num, font=f, fill=hexs(numcol), stroke_width=5, stroke_fill=hexs(t1))
    im.save(path); return path
def jersey_back(body, t1, t2, num, numcol=0xffffff, path=OUT + '/jb.png'):
    return jersey_front(body, t1, t2, num, numcol, path)
def button_front(base=0xaeb4bc, path=OUT + '/bf.png'):
    im = Image.new('RGB', (256, 380), hexs(base)); d = ImageDraw.Draw(im)
    d.rectangle((120, 0, 136, 380), fill='#9298a0')
    for y in range(40, 380, 62): d.ellipse((118, y, 138, y + 20), fill='#62666e')
    d.rectangle((24, 70, 90, 140), outline='#8a9098', width=4)
    d.polygon([(100, 0), (128, 46), (156, 0)], fill='#9a9fa8')
    im.save(path); return path
def tee_front(body, letter='T', col=0xffffff, path=OUT + '/tf.png'):
    im = Image.new('RGB', (256, 380), hexs(body)); d = ImageDraw.Draw(im)
    f = _f(230); tb = d.textbbox((0, 0), letter, font=f)
    d.text((128 - (tb[2] - tb[0]) / 2 - tb[0], 190 - (tb[3] - tb[1]) / 2 - tb[1]), letter, font=f, fill=hexs(col))
    im.save(path); return path
def plain_back(body, path=OUT + '/pb.png'):
    Image.new('RGB', (256, 380), hexs(body)).save(path); return path
