"""
Parser de Tibia.dat / Tibia.spr no formato 8.60 "extended" usado pelo OTCv8.

Diferencas em relacao ao parser 7.4 (tibia_assets.py):

  * SPR: a contagem de sprites e u32 (extended), nao u16, e o arquivo pode
    passar de 400 MB. Os enderecos sao lidos sob demanda.
  * DAT: as flags usam a numeracao moderna (7.55+), sem o remapeamento do 7.4.
  * DAT: cada objeto pode ter varios frame groups (parado / andando) e os
    frames trazem duracao e fases (frame-durations do .otfi).
  * Os ids de sprite dentro do DAT tambem sao u32 quando extended.

Uso:
    dat = Dat860("Tibia.dat")
    spr = Spr860("Tibia.spr")
    img = render_outfit_860(dat, spr, 128, direction=2, frame=0,
                            colors=(78, 68, 58, 76))
"""
import struct
from PIL import Image

# atributos do 8.60+ (numeracao moderna, OTCv8/OTClient)
ATTR_GROUND = 0
ATTR_WRITABLE = 8
ATTR_WRITABLE_ONCE = 9
ATTR_LIGHT = 21
ATTR_DISPLACEMENT = 24
ATTR_ELEVATION = 25
ATTR_MINIMAP_COLOR = 28
ATTR_LENS_HELP = 29
ATTR_CLOTH = 32
ATTR_MARKET = 33
ATTR_USABLE = 34
ATTR_LAST = 255

# flags sem payload extra — so registramos o NOME no set (usado pelo
# catalogo do editor de mapas para colisao/categorizacao; thingtype.cpp)
ATTR_SIMPLES = {
    1: "GroundBorder", 2: "OnBottom", 3: "OnTop", 4: "Container",
    5: "Stackable", 6: "ForceUse", 7: "MultiUse", 10: "FluidContainer",
    11: "Splash", 12: "NotWalkable", 13: "NotMoveable",
    14: "BlockProjectile", 15: "NotPathable", 16: "Pickupable",
    17: "Hangable", 18: "HookSouth", 19: "HookEast", 20: "Rotatable",
    22: "DontHide", 23: "Translucent", 26: "LyingCorpse",
    27: "AnimateAlways", 30: "FullGround", 31: "IgnoreLook",
}


class Reader:
    __slots__ = ("d", "i")

    def __init__(self, data):
        self.d = data
        self.i = 0

    def u8(self):
        v = self.d[self.i]
        self.i += 1
        return v

    def u16(self):
        v = struct.unpack_from("<H", self.d, self.i)[0]
        self.i += 2
        return v

    def u32(self):
        v = struct.unpack_from("<I", self.d, self.i)[0]
        self.i += 4
        return v

    def skip(self, n):
        self.i += n

    def readable(self):
        return self.i < len(self.d)


class FrameGroup:
    __slots__ = ("width", "height", "layers", "px", "py", "pz", "anim", "sprites",
                 "exact_size")

    def __init__(self):
        self.width = 1
        self.height = 1
        self.layers = 1
        self.px = 1
        self.py = 1
        self.pz = 1
        self.anim = 1
        self.sprites = []
        self.exact_size = 32

    def sprite_id(self, frame, xp, yp, zp, layer, x, y):
        """Indice linear dentro de group.sprites, igual ao client."""
        idx = ((((((frame % self.anim) * self.pz + zp) * self.py + yp)
                 * self.px + xp) * self.layers + layer)
               * self.height + y) * self.width + x
        return self.sprites[idx] if idx < len(self.sprites) else 0


class DataObject:
    __slots__ = ("flags", "props", "groups")

    def __init__(self):
        self.flags = set()
        self.props = {}
        self.groups = []


class Dat860:
    """Le o Tibia.dat 8.60 extended (com frame groups e duracoes)."""

    def __init__(self, path, extended=True, frame_durations=True,
                 frame_groups=True):
        raw = open(path, "rb").read()
        p = Reader(raw)
        self.signature = p.u32()
        self.item_count = p.u16()
        self.outfit_count = p.u16()
        self.effect_count = p.u16()
        self.distance_count = p.u16()
        self.extended = extended
        self.frame_durations = frame_durations
        self.frame_groups = frame_groups

        self.items_end = self.item_count
        self.outfits_end = self.item_count + self.outfit_count
        self.effects_end = self.outfits_end + self.effect_count
        self.total = self.effects_end + self.distance_count

        self.objects = {}
        oid = 100
        while oid <= self.total:
            obj = DataObject()
            self._read_flags(p, obj)
            # apenas outfits tem varios frame groups
            is_outfit = self.item_count < oid <= self.outfits_end
            n_groups = 1
            if self.frame_groups and is_outfit:
                n_groups = p.u8()
            for _ in range(n_groups):
                if self.frame_groups and is_outfit:
                    p.u8()          # tipo do grupo (0=idle, 1=moving)
                obj.groups.append(self._read_group(p))
            self.objects[oid] = obj
            oid += 1

    def _read_group(self, p):
        g = FrameGroup()
        g.width = p.u8()
        g.height = p.u8()
        if g.width > 1 or g.height > 1:
            g.exact_size = p.u8()
        else:
            g.exact_size = 32
        g.layers = p.u8()
        g.px = p.u8()
        g.py = p.u8()
        g.pz = p.u8()
        g.anim = p.u8()
        if self.frame_durations and g.anim > 1:
            p.u8()                  # async
            p.u32()                 # loop count
            p.u8()                  # start phase
            for _ in range(g.anim):
                p.u32()             # min duration
                p.u32()             # max duration
        n = (g.width * g.height * g.layers * g.px * g.py * g.pz * g.anim)
        if self.extended:
            g.sprites = [p.u32() for _ in range(n)]
        else:
            g.sprites = [p.u16() for _ in range(n)]
        return g

    def _read_flags(self, p, obj):
        while True:
            flag = p.u8()
            if flag == ATTR_LAST:
                return
            if flag == ATTR_GROUND:
                obj.flags.add("Ground")
                obj.props["speed"] = p.u16()
            elif flag in (ATTR_WRITABLE, ATTR_WRITABLE_ONCE):
                obj.flags.add("Writable")
                p.u16()
            elif flag == ATTR_LIGHT:
                obj.flags.add("Light")
                p.u16()
                p.u16()
            elif flag == ATTR_DISPLACEMENT:
                obj.props["dispX"] = p.u16()
                obj.props["dispY"] = p.u16()
            elif flag == ATTR_ELEVATION:
                obj.props["elevation"] = p.u16()
            elif flag == ATTR_MINIMAP_COLOR:
                p.u16()
            elif flag == ATTR_LENS_HELP:
                p.u16()
            elif flag == ATTR_CLOTH:
                p.u16()
            elif flag == ATTR_MARKET:
                p.u16()             # category
                p.u16()             # trade as
                p.u16()             # show as
                name_len = p.u16()
                p.skip(name_len)
                p.u16()             # restrict vocation
                p.u16()             # required level
            elif flag == ATTR_USABLE:
                p.u16()
            elif flag in ATTR_SIMPLES:
                obj.flags.add(ATTR_SIMPLES[flag])

    def item(self, cid):
        return self.objects.get(cid)

    def outfit(self, looktype):
        return self.objects.get(self.item_count + looktype)

    def effect(self, eid):
        return self.objects.get(self.outfits_end + eid)


class Spr860:
    """Le o Tibia.spr 8.60 extended (contagem u32)."""

    def __init__(self, path, extended=True):
        self.f = open(path, "rb")
        head = self.f.read(8)
        self.signature = struct.unpack_from("<I", head, 0)[0]
        if extended:
            self.count = struct.unpack_from("<I", head, 4)[0]
            offset = 8
        else:
            self.count = struct.unpack_from("<H", head, 4)[0]
            offset = 6
            self.f.seek(6)
        self.f.seek(offset)
        table = self.f.read(self.count * 4)
        self.addr = struct.unpack("<%dI" % self.count, table)
        self._cache = {}

    def sprite(self, sid):
        """Retorna PIL Image RGBA 32x32 ou None."""
        if not sid or sid > self.count:
            return None
        if sid in self._cache:
            return self._cache[sid]
        a = self.addr[sid - 1]
        if not a:
            return None
        self.f.seek(a + 3)                 # pula a color key (3 bytes)
        length = struct.unpack("<H", self.f.read(2))[0]
        data = self.f.read(length)
        px = bytearray(32 * 32 * 4)
        i = 0
        idx = 0
        while i + 3 < len(data) + 1 and i + 4 <= len(data):
            transp = struct.unpack_from("<H", data, i)[0]
            colored = struct.unpack_from("<H", data, i + 2)[0]
            i += 4
            idx += transp
            for _ in range(colored):
                if i + 2 >= len(data) + 1 and i + 3 > len(data):
                    break
                if idx < 1024:
                    o = idx * 4
                    px[o] = data[i]
                    px[o + 1] = data[i + 1]
                    px[o + 2] = data[i + 2]
                    px[o + 3] = 255
                i += 3
                idx += 1
        img = Image.frombytes("RGBA", (32, 32), bytes(px))
        if len(self._cache) < 4000:
            self._cache[sid] = img
        return img


# paleta de cores de outfit (identica em todas as versoes)
from tibia_assets import OUTFIT_COLORS, bgr_to_rgb  # noqa: E402


def compose_outfit(base_img, mask_img, head, body, legs, feet):
    """Aplica as cores da outfit usando a mascara.

    A versao do parser 7.4 percorria um quadrado fixo de 32x32. Os sprites
    do 8.60 sao 64x64 (2x2 tiles) e a arte fica no quadrante inferior
    direito, entao nada era colorido e o outfit saia branco. Aqui o laco
    acompanha o tamanho real da imagem.
    """
    if base_img is None:
        return None
    if mask_img is None:
        return base_img
    if base_img.size != mask_img.size:
        mask_img = mask_img.crop((0, 0, base_img.width, base_img.height))
    b = base_img.load()
    m = mask_img.load()
    colors = {
        (255, 255, 0): head,   # amarelo
        (255, 0, 0): body,     # vermelho
        (0, 255, 0): legs,     # verde
        (0, 0, 255): feet,     # azul
    }
    out = base_img.copy()
    o = out.load()
    for y in range(base_img.height):
        for x in range(base_img.width):
            mp = m[x, y]
            if mp[3] == 0:
                continue
            col = colors.get((mp[0], mp[1], mp[2]))
            if col is None:
                continue
            r, g, bl, a = b[x, y]
            o[x, y] = (r * col[0] // 255, g * col[1] // 255,
                       bl * col[2] // 255, a)
    return out


def render_group_860(spr, g, frame=0, xp=0, yp=0, zp=0, layer=0):
    """Compoe as tiles (width x height) de um frame group num unico PNG."""
    W, H = g.width * 32, g.height * 32
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for y in range(g.height):
        for x in range(g.width):
            sid = g.sprite_id(frame, xp, yp, zp, layer, x, y)
            img = spr.sprite(sid)
            if img is None:
                continue
            canvas.alpha_composite(img, (W - 32 * (x + 1), H - 32 * (y + 1)))
    return canvas


def render_outfit_860(dat, spr, looktype, direction=2, frame=0, addon=0,
                      colors=None, group=0):
    """Renderiza uma outfit. direction: 0=N 1=E 2=S 3=W."""
    obj = dat.outfit(looktype)
    if obj is None or not obj.groups:
        return None
    g = obj.groups[min(group, len(obj.groups) - 1)]
    xp = direction % max(1, g.px)
    yp = min(addon, g.py - 1)
    base = render_group_860(spr, g, frame=frame % g.anim, xp=xp, yp=yp)
    if g.layers > 1 and colors:
        mask = render_group_860(spr, g, frame=frame % g.anim, xp=xp, yp=yp,
                                layer=1)
        cols = [bgr_to_rgb(OUTFIT_COLORS[c % len(OUTFIT_COLORS)]) for c in colors]
        base = compose_outfit(base, mask, *cols)
    return base


def render_item_860(dat, spr, client_id, frame=0):
    obj = dat.item(client_id)
    if obj is None or not obj.groups:
        return None
    return render_group_860(spr, obj.groups[0], frame=frame % obj.groups[0].anim)
