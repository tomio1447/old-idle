"""
Parser do appearances.dat do Tibia 15.x (formato protobuf usado pelo Canary).

Diferente do DAT/SPR antigo, o 15.x guarda os metadados em protobuf e os
sprites em catalogos .lzma separados. Aqui interessa o mapeamento:

    id do item/outfit  ->  lista de sprite ids

que e exatamente o que faltava para casar o items.xml do Canary com as
sprites certas.

Estrutura relevante (engenharia reversa do arquivo, campos estaveis):

    Appearances {
      repeated Appearance object   = 1;
      repeated Appearance outfit   = 2;
      repeated Appearance effect   = 3;
      repeated Appearance missile  = 4;
    }
    Appearance {
      uint32 id                       = 1;
      repeated FrameGroup frame_group = 2;
      AppearanceFlags flags           = 3;
      bytes name                      = 4;   (nem sempre presente)
    }
    FrameGroup {
      uint32 fixed_frame_group = 1;
      uint32 id                = 2;
      SpriteInfo sprite_info   = 3;
    }
    SpriteInfo {
      uint32 pattern_width  = 1;
      uint32 pattern_height = 2;
      uint32 pattern_depth  = 3;
      uint32 layers         = 4;
      repeated uint32 sprite_id = 5;
      uint32 bounding_square = 7;
      Animation animation    = 6;
    }
"""
import os
import struct


def _varint(b, i):
    r = s = 0
    while True:
        x = b[i]
        i += 1
        r |= (x & 0x7F) << s
        if not (x & 0x80):
            return r, i
        s += 7


def _fields(b):
    """Itera (numero_do_campo, tipo, valor) de uma mensagem protobuf."""
    i = 0
    n = len(b)
    while i < n:
        try:
            key, i = _varint(b, i)
        except IndexError:
            return
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, i = _varint(b, i)
            yield f, "v", v
        elif wt == 2:
            ln, i = _varint(b, i)
            yield f, "b", b[i:i + ln]
            i += ln
        elif wt == 5:
            yield f, "f", struct.unpack_from("<f", b, i)[0]
            i += 4
        elif wt == 1:
            yield f, "d", b[i:i + 8]
            i += 8
        else:
            return


class SpriteInfo:
    __slots__ = ("pattern_width", "pattern_height", "pattern_depth",
                 "layers", "sprite_ids", "bounding_square", "phases")

    def __init__(self):
        self.pattern_width = 1
        self.pattern_height = 1
        self.pattern_depth = 1
        self.layers = 1
        self.sprite_ids = []
        self.bounding_square = 0
        self.phases = 1

    def sprite_at(self, layer=0, px=0, py=0, pz=0, phase=0):
        """Indice linear igual ao do client 15.x."""
        w, h, dpt, lay = (self.pattern_width, self.pattern_height,
                          self.pattern_depth, self.layers)
        idx = (((((phase % max(1, self.phases)) * dpt + pz) * h + py)
                * w + px) * lay + layer)
        if 0 <= idx < len(self.sprite_ids):
            return self.sprite_ids[idx]
        return 0


class Appearance:
    __slots__ = ("id", "name", "groups", "flags_raw")

    def __init__(self):
        self.id = 0
        self.name = ""
        self.groups = []      # lista de SpriteInfo (0 = idle, 1 = andando)
        self.flags_raw = b""

    def group(self, i=0):
        if not self.groups:
            return None
        return self.groups[min(i, len(self.groups) - 1)]


def _parse_sprite_info(raw):
    si = SpriteInfo()
    for f, t, v in _fields(raw):
        if t == "v":
            if f == 1:
                si.pattern_width = v
            elif f == 2:
                si.pattern_height = v
            elif f == 3:
                si.pattern_depth = v
            elif f == 4:
                si.layers = v
            elif f == 5:
                si.sprite_ids.append(v)
            elif f == 7:
                si.bounding_square = v
        elif t == "b":
            if f == 5:
                # sprite_id empacotado
                i = 0
                while i < len(v):
                    val, i = _varint(v, i)
                    si.sprite_ids.append(val)
            elif f == 6:
                # animacao: conta as fases
                phases = 0
                for af, at, av in _fields(v):
                    if af == 6 and at == "b":
                        phases += 1
                si.phases = max(1, phases)
    return si


def _parse_appearance(raw):
    a = Appearance()
    for f, t, v in _fields(raw):
        if f == 1 and t == "v":
            a.id = v
        elif f == 2 and t == "b":
            # frame group -> sprite_info (campo 3)
            for gf, gt, gv in _fields(v):
                if gf == 3 and gt == "b":
                    a.groups.append(_parse_sprite_info(gv))
        elif f == 3 and t == "b":
            a.flags_raw = v
        elif f == 4 and t == "b":
            try:
                a.name = v.decode("utf-8", "replace")
            except Exception:
                pass
    return a


class Appearances:
    """Le o appearances.dat inteiro e indexa por id."""

    def __init__(self, path):
        raw = open(path, "rb").read()
        self.objects = {}
        self.outfits = {}
        self.effects = {}
        self.missiles = {}
        alvo = {1: self.objects, 2: self.outfits,
                3: self.effects, 4: self.missiles}
        for f, t, v in _fields(raw):
            if t != "b" or f not in alvo:
                continue
            a = _parse_appearance(v)
            if a.id:
                alvo[f][a.id] = a

    def object(self, cid):
        return self.objects.get(cid)

    def outfit(self, looktype):
        return self.outfits.get(looktype)

    def __repr__(self):
        return ("<Appearances objetos=%d outfits=%d efeitos=%d missiles=%d>"
                % (len(self.objects), len(self.outfits),
                   len(self.effects), len(self.missiles)))


if __name__ == "__main__":
    import sys
    p = sys.argv[1] if len(sys.argv) > 1 else "appearances.dat"
    ap = Appearances(p)
    print(ap)
    for cid in (3031, 3273, 3349, 3350):
        o = ap.object(cid)
        if o:
            g = o.group(0)
            print(cid, "sprites:", g.sprite_ids[:6], "layers", g.layers,
                  "wxh", g.pattern_width, g.pattern_height)
