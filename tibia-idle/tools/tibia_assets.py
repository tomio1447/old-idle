"""
Parser de Tibia.dat / Tibia.spr (versao 7.4) usado pelo html5-tibia-client.
Porta para Python da logica de src/object-buffer.js e src/sprite-buffer.js.
"""
import struct
from PIL import Image

ATTR = {
    "Ground": 0, "GroundBorder": 1, "OnBottom": 2, "OnTop": 3, "Container": 4,
    "Stackable": 5, "ForceUse": 6, "MultiUse": 7, "Writable": 8, "WritableOnce": 9,
    "FluidContainer": 10, "Splash": 11, "NotWalkable": 12, "NotMoveable": 13,
    "BlockProjectile": 14, "NotPathable": 15, "Pickupable": 16, "Hangable": 17,
    "HookSouth": 18, "HookEast": 19, "Rotateable": 20, "Light": 21, "DontHide": 22,
    "Translucent": 23, "Displacement": 24, "Elevation": 25, "LyingCorpse": 26,
    "AnimateAlways": 27, "MinimapColor": 28, "LensHelp": 29, "FullGround": 30,
    "Look": 31, "Cloth": 32, "Market": 33, "Usable": 34, "Wrapable": 35,
    "Unwrapable": 36, "TopEffect": 37, "FloorChange": 252, "NoMoveAnimation": 253,
    "Chargeable": 254, "Last": 255,
}


class Reader:
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
    __slots__ = ("width", "height", "layers", "px", "py", "pz", "anim", "sprites")

    def __init__(self):
        self.width = 1
        self.height = 1
        self.layers = 1
        self.px = 1
        self.py = 1
        self.pz = 1
        self.anim = 1
        self.sprites = []

    def sprite_index(self, frame, xp, yp, zp, layer, x, y):
        return ((((((frame * self.pz + zp) * self.py + yp) * self.px + xp)
                  * self.layers + layer) * self.height + y) * self.width + x)

    def sprite_id(self, frame, xp, yp, zp, layer, x, y):
        idx = self.sprite_index(frame, xp, yp, zp, layer, x, y)
        if idx < 0 or idx >= len(self.sprites):
            return 0
        return self.sprites[idx]


class DataObject:
    __slots__ = ("flags", "props", "groups")

    def __init__(self):
        self.flags = set()
        self.props = {}
        self.groups = []


def map_flag_740(flag):
    if flag == 255:
        return 255
    if 0 < flag <= 15:
        if flag == 5:
            return ATTR["MultiUse"]
        if flag == 6:
            return ATTR["ForceUse"]
        return flag + 1
    return {
        16: ATTR["Light"], 17: ATTR["FloorChange"], 18: ATTR["FullGround"],
        19: ATTR["Elevation"], 20: ATTR["Displacement"], 22: ATTR["MinimapColor"],
        23: ATTR["Rotateable"], 24: ATTR["LyingCorpse"], 25: ATTR["Hangable"],
        26: ATTR["HookSouth"], 27: ATTR["HookEast"], 28: ATTR["AnimateAlways"],
    }.get(flag, flag)


class Dat:
    def __init__(self, path):
        raw = open(path, "rb").read()
        p = Reader(raw)
        self.signature = p.u32()
        self.item_count = p.u16()
        self.outfit_count = p.u16()
        self.effect_count = p.u16()
        self.distance_count = p.u16()
        self.total = self.item_count + self.outfit_count + self.effect_count + self.distance_count
        self.objects = {}
        for oid in range(100, self.total + 1):
            obj = DataObject()
            self._read_flags(p, obj)
            g = FrameGroup()
            w = p.u8()
            h = p.u8()
            g.width, g.height = w, h
            if w > 1 or h > 1:
                p.u8()
            g.layers = p.u8()
            g.px = p.u8()
            g.py = p.u8()
            g.pz = 1  # version 740
            g.anim = p.u8()
            n = g.width * g.height * g.layers * g.px * g.py * g.pz * g.anim
            g.sprites = [p.u16() for _ in range(n)]
            obj.groups = [g]
            self.objects[oid] = obj

    def _read_flags(self, p, obj):
        while True:
            flag = map_flag_740(p.u8())
            if flag == ATTR["Last"]:
                return
            if flag == ATTR["Ground"]:
                obj.flags.add("Ground")
                obj.props["speed"] = p.u16()
            elif flag == ATTR["Writable"] or flag == ATTR["WritableOnce"]:
                obj.flags.add("Writable")
                p.u16()
            elif flag == ATTR["Light"]:
                obj.flags.add("Light")
                p.u16()
                p.u16()
            elif flag == ATTR["Displacement"]:
                # na versao 7.4 o displacement nao carrega dados extras (>=755 le light)
                obj.flags.add("Displacement")
            elif flag == ATTR["Elevation"]:
                obj.flags.add("Elevation")
                obj.props["elevation"] = p.u16()
            elif flag == ATTR["MinimapColor"]:
                obj.flags.add("MinimapColor")
                obj.props["minimapColor"] = p.u16()
            elif flag == ATTR["LensHelp"]:
                p.u16()
            elif flag == ATTR["Cloth"]:
                obj.props["cloth"] = p.u16()
            elif flag == ATTR["Usable"]:
                p.u16()
            else:
                for name, val in ATTR.items():
                    if val == flag:
                        obj.flags.add(name)
                        break

    def outfit(self, looktype):
        """Data object de uma outfit (looktype)."""
        return self.objects.get(self.item_count + looktype)

    def item(self, client_id):
        return self.objects.get(client_id)


class Spr:
    def __init__(self, path):
        self.raw = open(path, "rb").read()
        p = Reader(self.raw)
        self.signature = p.u32()
        self.count = p.u16()
        self.addr = {}
        for i in range(1, self.count + 1):
            a = p.u32()
            if a:
                self.addr[i] = a

    def sprite(self, sid):
        """Retorna PIL Image RGBA 32x32 ou None."""
        if not sid or sid not in self.addr:
            return None
        a = self.addr[sid]
        length = self.raw[a + 3] | (self.raw[a + 4] << 8)
        p = Reader(self.raw[a:a + 5 + length])
        p.skip(5)  # rgb key + length
        px = bytearray(32 * 32 * 4)
        idx = 0
        while p.readable():
            transp = p.u16()
            colored = p.u16()
            idx += transp
            for _ in range(colored):
                if idx < 1024:
                    o = idx * 4
                    px[o] = p.u8()
                    px[o + 1] = p.u8()
                    px[o + 2] = p.u8()
                    px[o + 3] = 255
                else:
                    p.skip(3)
                idx += 1
        return Image.frombytes("RGBA", (32, 32), bytes(px))


# Paleta de cores das outfits (BGR little-endian, igual ao src/outfit.js)
OUTFIT_COLORS = [
    0xFFFFFF, 0xBFD4FF, 0xBFE9FF, 0xBFFFFF, 0xBFFFE9, 0xBFFFD4, 0xBFFFBF,
    0xD4FFBF, 0xE9FFBF, 0xFFFFBF, 0xFFE9BF, 0xFFD4BF, 0xFFBFBF, 0xFFBFD4,
    0xFFBFE9, 0xFFBFFF, 0xE9BFFF, 0xD4BFFF, 0xBFBFFF, 0xDADADA, 0x8F9FBF,
    0x8FAFBF, 0x8FBFBF, 0x8FBFAF, 0x8FBF9F, 0x8FBF8F, 0x9FBF8F, 0xAFBF8F,
    0xBFBF8F, 0xBFAF8F, 0xBF9F8F, 0xBF8F8F, 0xBF8F9F, 0xBF8FAF, 0xBF8FBF,
    0xAF8FBF, 0x9F8FBF, 0x8F8FBF, 0xB6B6B6, 0x5F7FBF, 0x8FAFBF, 0x5FBFBF,
    0x5FBF9F, 0x5FBF7F, 0x5FBF5F, 0x7FBF5F, 0x9FBF5F, 0xBFBF5F, 0xBF9F5F,
    0xBF7F5F, 0xBF5F5F, 0xBF5F7F, 0xBF5F9F, 0xBF5FBF, 0x9F5FBF, 0x7F5FBF,
    0x5F5FBF, 0x919191, 0x3F6ABF, 0x3F94BF, 0x3FBFBF, 0x3FBF94, 0x3FBF6A,
    0x3FBF3F, 0x6ABF3F, 0x94BF3F, 0xBFBF3F, 0xBF943F, 0xBF6A3F, 0xBF3F3F,
    0xBF3F6A, 0xBF3F94, 0xBF3FBF, 0x943FBF, 0x6A3FBF, 0x3F3FBF, 0x6D6D6D,
    0x0055BF, 0x00AABF, 0x00BFBF, 0x00BFAA, 0x00BF55, 0x00BF00, 0x55BF00,
    0xAABF00, 0xBFBF00, 0xBFAA00, 0xBF5500, 0xBF0000, 0xBF0055, 0xBF00AA,
    0xBF00BF, 0xAA00BF, 0x5500BF, 0x0000BF, 0x484848,
]


def bgr_to_rgb(v):
    return (v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF)


def compose_outfit(base_img, mask_img, head, body, legs, feet):
    """Aplica as cores da outfit no sprite base usando a mascara (igual SpriteBuffer.__compose)."""
    if base_img is None:
        return None
    if mask_img is None:
        return base_img
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
    for y in range(32):
        for x in range(32):
            mp = m[x, y]
            if mp[3] == 0:
                continue
            key = (mp[0], mp[1], mp[2])
            col = colors.get(key)
            if col is None:
                continue
            r, g, bl, a = b[x, y]
            o[x, y] = (r * col[0] // 255, g * col[1] // 255, bl * col[2] // 255, a)
    return out
