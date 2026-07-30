/*
 * otbm.js — leitura e ESCRITA de mapas no formato OTBM v2
 * (formato do Remere's Map Editor / OTServ).
 *
 * Fontes do formato: src do RME (iomapotbm.cpp) e do OTClient
 * (map.cpp/minimap): magic "OTBM" + versao u32, arvore de nos com marcador
 * 0xFE e fim 0xFF, escape 0xFD de qualquer byte de payload igual a
 * 0xFD/0xFE/0xFF.
 *
 * Nos usados aqui:
 *   0  = header do mapa (attrs: 1 descricao str, 3 tile flags u32...)
 *        attr 2 = cabecalho binario: u32 versao, u16 largura, u16 altura,
 *        u32 itemsMajor, u32 itemsMinor
 *   1  = TILE_AREA (u16 baseX, u16 baseY, u8 z)
 *   2  = TILE (u8 x, u8 y relativos a area; attr 9 = item do chao inline;
 *        nos ITEM filhos para o que vai empilhado por cima)
 *   3  = ITEM (u16 id; attrs comuns: 15 count u8, 4 aid u16, 5 uid u16)
 *
 * Como o formato cresceu por acumulo, o LEITOR aceita e ignora nos/atributos
 * que nao usamos (towns, waypoints, casas), entao ele abre tanto os mapas
 * do nosso editor quanto otbm "de verdade" no essencial.
 *
 * Zonas do jogo (spawn do jogador / zona de monstros / nome): nao existe
 * campo proprio no OTBM, entao vao numa linha "OTIDLE:<json>" do atributo
 * DESCRIPTION — o RME oficial preserva a descricao ao abrir; ao SALVAR de
 * novo por ele a linha pode ser perdida (limitacao documentada).
 *
 * Puro JS sem DOM: roda no navegador (window.OTBM) e no node (module.exports,
 * para os testes).
 */
(function (global) {
  "use strict";

  var NODE_START = 0xFE, NODE_END = 0xFF, ESCAPE = 0xFD;
  var NODE_ROOT = 0, NODE_TILE_AREA = 1, NODE_TILE = 2, NODE_ITEM = 3;

  /* ---------------------------------------------------------- writer */

  function EscBuf() {
    this.bytes = [];
  }
  EscBuf.prototype.raw = function (b) { this.bytes.push(b & 0xFF); };
  /* byte de payload: escapa quando colide com marcadores */
  EscBuf.prototype.u8 = function (b) {
    b &= 0xFF;
    if (b === NODE_START || b === NODE_END || b === ESCAPE)
      this.bytes.push(ESCAPE);
    this.bytes.push(b);
  };
  EscBuf.prototype.u16 = function (v) { this.u8(v & 0xFF); this.u8((v >> 8) & 0xFF); };
  EscBuf.prototype.u32 = function (v) {
    v >>>= 0;
    this.u8(v & 0xFF); this.u8((v >>> 8) & 0xFF);
    this.u8((v >>> 16) & 0xFF); this.u8((v >>> 24) & 0xFF);
  };
  EscBuf.prototype.strBytes = function (arr) {
    for (var i = 0; i < arr.length; i++) this.u8(arr[i]);
  };
  EscBuf.prototype.str = function (s) {
    var bytes = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xC0 | (c >> 6), 0x80 | (c & 63)); }
      else { bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    this.u16(bytes.length);
    this.strBytes(bytes);
  };
  EscBuf.prototype.toArrayBuffer = function () {
    return new Uint8Array(this.bytes).buffer;
  };

  /* Monta a descricao raiz: texto humano + linha OTIDLE com as zonas. */
  function buildDescription(map) {
    var lines = [];
    lines.push("Saved with OTI RME (editor web do tibia idle).");
    if (map.desc) lines.push(map.desc);
    var payload = {
      n: map.name || "mapa",
      s: map.spawn ? [map.spawn.x, map.spawn.y] : null,
      m: (map.mob || []).map(function (c) { return [c.x, c.y]; }),
    };
    lines.push("OTIDLE:" + JSON.stringify(payload));
    return lines.join("\r\n");
  }

  /* cells: objeto "x,y" -> {g: idDoChao|0, items: [ids...]} */
  function write(map) {
    var out = new EscBuf();
    /* magic + versao 2 (cabecalho fixo, SEM escape) */
    out.raw(0x4F); out.raw(0x54); out.raw(0x42); out.raw(0x4D);
    out.bytes.push(2, 0, 0, 0); // version u32le = 2, cru

    // no raiz
    out.raw(NODE_START);
    out.u8(NODE_ROOT);
    // attr 1: descricao
    out.u8(1);
    out.str(buildDescription(map));
    // attr 2: cabecalho binario (versao, dimensoes, itens.otb 8.60)
    out.u8(2);
    out.u16(20); // tamanho do payload em bytes (4+2+2+4+4+4)
    out.u32(2);
    out.u16(map.w);
    out.u16(map.h);
    out.u32(3);    // items.otb major version (7.5x-8.60 = 3)
    out.u32(860);  // items.otb minor version
    out.u32(0);    // subversion/reservado

    // TILE_AREA unica (mapas do editor tem no maximo 256x256 por design)
    var z = map.z === undefined ? 7 : map.z;
    out.raw(NODE_START);
    out.u8(NODE_TILE_AREA);
    out.u16(0); out.u16(0); out.u8(z);

    var cells = map.cells || {};
    var keys = Object.keys(cells);
    keys.sort(function (a, b) {
      var pa = a.split(","), pb = b.split(",");
      var d = (+pa[1]) - (+pb[1]);
      return d !== 0 ? d : (+pa[0]) - (+pb[0]);
    });
    for (var i = 0; i < keys.length; i++) {
      var xy = keys[i].split(",");
      var x = +xy[0], y = +xy[1];
      var cell = cells[keys[i]];
      if (!cell || (!cell.g && !(cell.items && cell.items.length))) continue;
      out.raw(NODE_START);
      out.u8(NODE_TILE);
      out.u8(x); out.u8(y);
      if (cell.g) { out.u8(9); out.u16(cell.g); }   // OTBM_ATTR_ITEM inline
      if (cell.items) {
        for (var j = 0; j < cell.items.length; j++) {
          out.raw(NODE_START);
          out.u8(NODE_ITEM);
          out.u16(cell.items[j]);
          out.raw(NODE_END);
        }
      }
      out.raw(NODE_END); // fim do TILE
    }
    out.raw(NODE_END);   // fim da TILE_AREA

    out.raw(NODE_END);   // fim da raiz
    return out.toArrayBuffer();
  }

  /* ---------------------------------------------------------- reader */

  function Rdr(data) {
    this.d = new Uint8Array(data);
    this.i = 0;
  }
  /* le UM byte de payload tratando o escape 0xFD; marcadores (0xFE/0xFF)
   * NAO passam por aqui — sao controlados por peek/take */
  Rdr.prototype.u8 = function () {
    var b = this.d[this.i++];
    if (b === ESCAPE) b = this.d[this.i++];
    return b;
  };
  Rdr.prototype.peek = function () { return this.d[this.i]; };
  Rdr.prototype.take = function () { return this.d[this.i++]; };
  Rdr.prototype.u16 = function () { return this.u8() | (this.u8() << 8); };
  Rdr.prototype.u32 = function () {
    return (this.u8() | (this.u8() << 8) | (this.u8() << 16) |
            (this.u8() << 24)) >>> 0;
  };
  Rdr.prototype.str = function () {
    var len = this.u16();
    var arr = [];
    for (var i = 0; i < len; i++) arr.push(this.u8());
    var s = "";
    for (var j = 0; j < arr.length; j++) {
      var c = arr[j];
      if (c < 0x80) { s += String.fromCharCode(c); }
      else if ((c & 0xE0) === 0xC0) { s += String.fromCharCode(((c & 31) << 6) | (arr[++j] & 63)); }
      else if ((c & 0xF0) === 0xE0) { s += String.fromCharCode(((c & 15) << 12) | ((arr[++j] & 63) << 6) | (arr[++j] & 63)); }
      else s += "?";
    }
    return s;
  };

  /* Pula o payload de um atributo conhecido; devolve payload crua para
   * os ids que interessam (1,2) ou dados simplificados. */
  Rdr.prototype.readAttr = function (id, ctx) {
    switch (id) {
      case 1: case 2: case 7: case 11: case 13: // str/binario com u16 len
        var len = this.u16();
        if (id === 1 || id === 2) {
          ctx["attr" + id] = [];
          for (var i = 0; i < len; i++) ctx["attr" + id].push(this.u8());
        } else {
          for (var k = 0; k < len; k++) this.u8();
        }
        return;
      case 3: case 12: case 16: case 22: case 23: // u32
        this.u32(); return;
      case 4: case 5: case 9:                     // u16 (aid/uid/item)
        var v = this.u16();
        if (id === 9) ctx.inlineItem = v;
        return;
      case 8:                                     // teleport dest
        this.u16(); this.u16(); this.u8(); return;
      case 14: case 15:                           // u8
        this.u8(); return;
      default:
        throw new Error("atributo OTBM desconhecido: " + id);
    }
  };

  /* O formato nao separa "campos" de "attrs"; as coordenadas/campos fixos
   * do no vem logo depois do tipo, ANTES dos attrs. O parser abaixo trata
   * isso de forma explicita por tipo. */

  // Decodifica str UTF8 guardada como bytes (attrs 1/2).
  function bytesToStr(arr) {
    var s = "";
    for (var j = 0; j < arr.length; j++) {
      var c = arr[j];
      if (c < 0x80) s += String.fromCharCode(c);
      else if ((c & 0xE0) === 0xC0)
        s += String.fromCharCode(((c & 31) << 6) | (arr[++j] & 63));
      else if ((c & 0xF0) === 0xE0)
        s += String.fromCharCode(((c & 15) << 12) |
                                 ((arr[++j] & 63) << 6) | (arr[++j] & 63));
    }
    return s;
  }

  function read(data) {
    var d = new Uint8Array(data);
    if (d.length < 8 || d[0] !== 0x4F || d[1] !== 0x54 ||
        d[2] !== 0x42 || d[3] !== 0x4D)
      throw new Error("nao e um .otbm (magic OTBM ausente)");
    var r = new Rdr(data);
    r.i = 4;
    r.u32(); // versao (escapada nao se aplica ao header)
    var map = { w: 0, h: 0, name: "mapa", spawn: null, mob: [], cells: {},
                desc: "" };

    function parseNode(ctx, depth) {
      if (depth > 32) throw new Error("otbm muito profundo");
      var type = r.u8();
      // campos fixos por tipo
      var bx = 0, by = 0, bz = 0, tx = 0, ty = 0, itemId = 0;
      if (type === NODE_TILE_AREA) {
        bx = r.u16(); by = r.u16(); bz = r.u8();
      } else if (type === NODE_TILE || type === 14) {
        tx = r.u8(); ty = r.u8();
      } else if (type === NODE_ITEM) {
        itemId = r.u16();
      }
      // contexto que desce para os filhos: AREA define coords; TILE define
      // a celula onde os ITEM filhos caem; ITEM aninha so se der (containers)
      var child = { x: ctx ? ctx.x : 0, y: ctx ? ctx.y : 0,
                    z: ctx ? ctx.z : 7, cell: ctx ? ctx.cell : null };
      if (type === NODE_TILE_AREA) child = { x: bx, y: by, z: bz, cell: null };
      if ((type === NODE_TILE || type === 14) && ctx && ctx.z === 7) {
        var gx = ctx.x + tx, gy = ctx.y + ty;
        child.cell = map.cells[gx + "," + gy] ||
          (map.cells[gx + "," + gy] = { g: 0, items: [] });
      }
      if (type === NODE_ITEM && ctx && ctx.cell)
        ctx.cell.items.push(itemId);

      while (true) {
        var next = r.peek();
        if (next === undefined) break;
        if (next === NODE_END) { r.take(); break; }
        if (next === NODE_START) { r.take(); parseNode(child, depth + 1); continue; }
        r.take();
        var id = next;
        // attrs que o jogo realmente le
        if (id === 1 && type === NODE_ROOT) {
          map.desc = bytesToStr(readBytes(r));
          parseOtidle(map);
        } else if (id === 2 && type === NODE_ROOT) {
          var pay = readBytes(r);
          if (pay.length >= 8) {
            map.w = pay[4] | (pay[5] << 8);
            map.h = pay[6] | (pay[7] << 8);
          }
        } else if (id === 9 && child.cell && !child.cell.g) {
          child.cell.g = r.u16();    // OTBM_ATTR_ITEM (chao inline)
        } else {
          r.readAttr(id, {});
        }
      }
      return type;
    }

    function readBytes(rr) {
      var len = rr.u16();
      var arr = [];
      for (var i = 0; i < len; i++) arr.push(rr.u8());
      return arr;
    }

    function parseOtidle(m) {
      var lines = (m.desc || "").split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("OTIDLE:") !== 0) continue;
        try {
          var j = JSON.parse(lines[i].slice(7));
          if (j.n) m.name = j.n;
          if (j.s) m.spawn = { x: j.s[0], y: j.s[1] };
          if (j.m) m.mob = j.m.map(function (c) { return { x: c[0], y: c[1] }; });
        } catch (e) { /* linha corrompida: ignora */ }
      }
    }

    // no raiz
    if (r.peek() !== NODE_START) throw new Error(".otbm sem no raiz");
    r.take();
    parseNode(null, 0);

    // dimensoes de reserva: se a descricao trouxe w/h maiores (mapas com
    // celulas vazias nas bordas), cobre tudo
    var maxX = 0, maxY = 0;
    for (var k in map.cells) {
      var xy = k.split(",");
      if (+xy[0] > maxX) maxX = +xy[0];
      if (+xy[1] > maxY) maxY = +xy[1];
    }
    if (!map.w || map.w < maxX + 1) map.w = maxX + 1;
    if (!map.h || map.h < maxY + 1) map.h = maxY + 1;
    return map;
  }

  /* -------------------------------------------------- huntMap (runtime)
   *
   * Converte o mapa lido do .otbm para o formato que o combate ja entende
   * (huntmapdata.js): {rows: [str], legenda, nome}. A colisao vem do
   * window.TILEFLAGS (build_rme_catalog.py; flags do .dat 8.60):
   *   - celula SEM chao: bloqueada (vazio da arena);
   *   - chao nao-andavel (agua, parede de terra...) ou item empilhado com
   *     NotWalkable: bloqueada;
   *   - o spawn do jogador vira o marcador "S" que o newCombat procura;
   *   - a zona de monstros vai em `mob` (spawnWave a usa quando existe).
   */
  function huntMapFromOtbm(map, tileflags) {
    tileflags = tileflags || {};
    var CH = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
             "0123456789<>[](){}.,;:!@$%&*^_+-=?~|";
    var legenda = {}, assin = {}, pool = 0;
    function charDa(chave, entry) {
      if (assin[chave] !== undefined) return assin[chave];
      var c = CH[pool++];
      if (pool > CH.length) c = CH[pool % CH.length]; // nao deve acontecer
      assin[chave] = c;
      legenda[c] = entry;
      return c;
    }
    var VOID = " ";
    legenda[VOID] = { v: [], bloc: true };
    var rows = [];
    for (var y = 0; y < map.h; y++) {
      var row = "";
      for (var x = 0; x < map.w; x++) {
        var cell = map.cells[x + "," + y];
        if (!cell || (!cell.g && !(cell.items && cell.items.length))) {
          row += VOID;
          continue;
        }
        var bloc = 0;
        var gwalk = cell.g && tileflags[cell.g] ? tileflags[cell.g][0] : 0;
        if (!gwalk) bloc = 1;
        var items = cell.items || [];
        for (var j = 0; j < items.length; j++) {
          if (tileflags[items[j]] && tileflags[items[j]][1]) { bloc = 1; break; }
        }
        var entry = { v: cell.g ? [cell.g] : [] };
        if (items.length) entry.g = items.slice();
        if (bloc) entry.bloc = true;
        row += charDa([cell.g, items.join("."), bloc].join("|"), entry);
      }
      rows.push(row);
    }
    var out = { rows: rows, legenda: legenda,
                nome: map.name || "Mapa .otbm",
                otbm: true };
    if (map.spawn) out.spawn = { x: map.spawn.x, y: map.spawn.y };
    if (map.mob && map.mob.length) {
      out.mob = map.mob.map(function (c) { return { x: c.x, y: c.y }; });
      out.mobSet = {};
      for (var i = 0; i < out.mob.length; i++)
        out.mobSet[out.mob[i].x + ":" + out.mob[i].y] = true;
    }
    return out;
  }

  /* Detecta quais item ids do mapa NAO tem sprite em
   * game/assets/tiles (o jogo desenharia buracos). `known` = array do
   * rme/data/known_tiles.js. Devolve lista ordenada. */
  function missingTiles(map, known) {
    var have = {};
    for (var i = 0; i < known.length; i++) have[known[i]] = true;
    var falta = {};
    for (var k in map.cells) {
      var c = map.cells[k];
      if (c.g && !have[c.g]) falta[c.g] = true;
      for (var j = 0; j < (c.items || []).length; j++)
        if (!have[c.items[j]]) falta[c.items[j]] = true;
    }
    return Object.keys(falta).map(Number).sort(function (a, b) { return a - b; });
  }

  var OTBM = {
    write: write,
    read: read,
    huntMapFromOtbm: huntMapFromOtbm,
    missingTiles: missingTiles,
    _EscBuf: EscBuf,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = OTBM;
  else global.OTBM = OTBM;
})(typeof window !== "undefined" ? window : globalThis);
