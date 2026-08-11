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
    if (!map || map.w < 1 || map.h < 1 || map.w > 65535 || map.h > 65535)
      throw new Error("dimensões OTBM devem ficar entre 1 e 65535 SQMs");
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

    // TILE usa offsets u8, portanto mapas maiores que 256 SQMs são divididos
    // automaticamente em várias TILE_AREA de 256×256. O formato mantém a
    // base de cada área em u16 e suporta dimensões de até 65535×65535.
    var z = map.z === undefined ? 7 : map.z;
    var cells = map.cells || {}, areas = {};
    Object.keys(cells).forEach(function (key) {
      var xy = key.split(","), x = +xy[0], y = +xy[1], cell = cells[key];
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
          x >= map.w || y >= map.h ||
          !cell || (!cell.g && !(cell.items && cell.items.length))) return;
      var bx = Math.floor(x / 256) * 256, by = Math.floor(y / 256) * 256;
      var areaKey = bx + "," + by;
      if (!areas[areaKey]) areas[areaKey] = { x: bx, y: by, tiles: [] };
      areas[areaKey].tiles.push({ x: x, y: y, cell: cell });
    });
    var areaList = Object.keys(areas).map(function (key) { return areas[key]; });
    areaList.sort(function (a, b) { return a.y - b.y || a.x - b.x; });

    for (var a = 0; a < areaList.length; a++) {
      var area = areaList[a];
      area.tiles.sort(function (ta, tb) { return ta.y - tb.y || ta.x - tb.x; });
      out.raw(NODE_START);
      out.u8(NODE_TILE_AREA);
      out.u16(area.x); out.u16(area.y); out.u8(z);
      for (var i = 0; i < area.tiles.length; i++) {
        var tile = area.tiles[i], cell = tile.cell;
        out.raw(NODE_START);
        out.u8(NODE_TILE);
        out.u8(tile.x - area.x); out.u8(tile.y - area.y);
        if (cell.g) { out.u8(9); out.u16(cell.g); } // OTBM_ATTR_ITEM inline
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
    }

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
      case 1: case 2: case 6: case 7: case 11: case 13: // str/binario com u16 len
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

  /* Canary's Map Editor 4 salva o OTBM moderno: cabeçalho u32 (sem
   * "OTBM" ASCII), nós MAP_HEADER/MAP_DATA/TILE_AREA/TILE/ITEM =
   * 0/2/4/5/6. Mantemos o leitor legado abaixo e normalizamos este formato
   * para o mesmo {cells,w,h,z} que o runtime já consome. */
  function readCanaryV4(data, preferredZ) {
    var r = new Rdr(data), floors = {}, desc = "";
    // Nos arquivos atuais a versão é o u32 inicial (bytes 0..3); o nó
    // raiz começa imediatamente no byte 4.
    r.i = 4;

    function cellAt(z, x, y) {
      var f = floors[z] || (floors[z] = {}), k = x + "," + y;
      return f[k] || (f[k] = { x: x, y: y, g: 0, items: [] });
    }
    function skipAttr(id, ctx) {
      if (id === 1 || id === 2 || id === 6 || id === 7 || id === 11 || id === 13) {
        var len = r.u16(), a = [];
        for (var n = 0; n < len; n++) a.push(r.u8());
        if (id === 1 && !desc) desc = bytesToStr(a);
      } else if (id === 3 || id === 12 || id === 16 || id === 22) r.u32();
      else if (id === 23 || id === 24) { var pathLen = r.u16(); for (var p = 0; p < pathLen; p++) r.u8(); }
      else if (id === 4 || id === 5) r.u16();
      else if (id === 9) { var ground = r.u16(); if (ctx && !ctx.g) ctx.g = ground; }
      else if (id === 8) { r.u16(); r.u16(); r.u8(); }
      else if (id === 14 || id === 15) r.u8();
      else throw new Error("atributo Canary OTBM desconhecido: " + id);
    }
    function node(ctx, depth) {
      if (depth > 64) throw new Error("OTBM Canary muito profundo");
      var type = r.u8(), child = ctx, x, y, z, item;
      if (type === 0) { // MAP_HEADER: versão, width, height, versions OTB
        r.u32(); r.u16(); r.u16(); r.u32(); r.u32();
      } else if (type === 4) { // TILE_AREA
        x = r.u16(); y = r.u16(); z = r.u8(); child = { x: x, y: y, z: z, cell: null };
      } else if (type === 5) { // TILE, offsets dentro da área
        x = r.u8(); y = r.u8();
        if (ctx) child = { x: ctx.x + x, y: ctx.y + y, z: ctx.z,
                           cell: cellAt(ctx.z, ctx.x + x, ctx.y + y) };
      } else if (type === 6) { // ITEM
        item = r.u16();
        if (ctx && ctx.cell) ctx.cell.items.push(item);
      }
      while (true) {
        var next = r.peek();
        if (next === undefined) throw new Error("fim prematuro do OTBM Canary");
        if (next === NODE_END) { r.take(); return; }
        if (next === NODE_START) { r.take(); node(child, depth + 1); continue; }
        r.take();
        // O header e TILE_AREA não possuem attrs depois dos campos fixos.
        if (type === 0 || type === 4) throw new Error("dados inesperados no nó Canary " + type);
        skipAttr(next, child && child.cell);
      }
    }
    if (r.peek() !== NODE_START) throw new Error(".otbm Canary sem nó raiz");
    r.take(); node(null, 0);

    // Hunts antigas usam Z=2, mas mapas completos podem ter vários andares
    // auxiliares e declarar explicitamente qual piso será instanciado.
    preferredZ = Number(preferredZ);
    var hasPreferred = Number.isFinite(preferredZ) &&
      Object.prototype.hasOwnProperty.call(floors, preferredZ);
    var bestZ = hasPreferred ? preferredZ :
      (Object.prototype.hasOwnProperty.call(floors, 2) ? 2 : null);
    var bestCount = -1;
    Object.keys(floors).forEach(function (z) {
      var n = Object.keys(floors[z]).length;
      if (bestZ === null && n > bestCount) { bestCount = n; bestZ = +z; }
    });
    if (bestZ === null) throw new Error("OTBM Canary não possui tiles");
    var source = floors[bestZ], minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.keys(source).forEach(function (k) { var c = source[k]; minX = Math.min(minX,c.x); minY = Math.min(minY,c.y); maxX = Math.max(maxX,c.x); maxY = Math.max(maxY,c.y); });
    var map = { w: maxX-minX+1, h: maxY-minY+1, z: bestZ,
                name: "Canary map (z " + bestZ + ")", spawn: null, mob: [], cells: {}, desc: desc,
                sourceBounds: { minX:minX, minY:minY, maxX:maxX, maxY:maxY } };
    Object.keys(source).forEach(function (k) {
      var c=source[k], lx=c.x-minX, ly=c.y-minY;
      map.cells[lx+","+ly] = { g:c.g, items:c.items };
    });
    return map;
  }

  function read(data, options) {
    var d = new Uint8Array(data);
    var preferredZ = options && typeof options === "object" ? options.z : options;
    // O RME/Canary 4 usa cabeçalho u32 zero em vez da assinatura ASCII.
    if (d.length >= 5 && d[0] === 0 && d[1] === 0 && d[2] === 0 && d[3] === 0)
      return readCanaryV4(data, preferredZ);
    if (d.length < 8 || d[0] !== 0x4F || d[1] !== 0x54 ||
        d[2] !== 0x42 || d[3] !== 0x4D)
      throw new Error("nao e um .otbm reconhecido");
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

  /* Recorta um OTBM pelas coordenadas ORIGINAIS, preservando apenas a área
   * validada pelo script RME. Tiles decorativos fora do canvas não podem
   * aumentar colisão/viewport do Global-Idle. */
  function crop(map, bounds) {
    if (!map || !bounds || !map.sourceBounds) return map;
    var ox = bounds.x - map.sourceBounds.minX, oy = bounds.y - map.sourceBounds.minY;
    var out = Object.assign({}, map, { w: bounds.w, h: bounds.h, cells: {}, sourceBounds: bounds });
    for (var y = 0; y < bounds.h; y++) for (var x = 0; x < bounds.w; x++) {
      var c = map.cells[(x + ox) + "," + (y + oy)];
      if (c) out.cells[x + "," + y] = c;
    }
    return out;
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
  /* Os tiles 15.x do mapa agora têm sprites reais em assets/tiles/
   * (extraídos dos atlases do editor RME) e flags reais no tileflags.js —
   * nada a converter: o mapa renderiza EXATAMENTE como desenhado no editor. */
  function huntMapFromOtbm(map, tileflags) {
    tileflags = tileflags || {};
    // 16249 é um marcador invisível do mapa Canary (não possui pixels no
    // DAT). Mantê-lo na camada visual gerava requests 404 a cada recarga.
    var hiddenItems = {
      16249: true, // marcador invisível Canary já usado na Cobra
      20661: true, // marcador sem pixels presente no novo DT Seal
    };
    var CH = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
             "0123456789<>[](){}.,;:!@$%&*^_+-=?~|";
    var legenda = {}, assin = {}, pool = 0;
    function legendaChar(index) {
      if (index < CH.length) return CH[index];
      // Não recicle caracteres: em mapas ricos isso misturava pisos/colisão
      // de assinaturas diferentes. Continue por caracteres BMP de um único
      // code unit (row[x] segue válido), pulando a faixa de surrogates.
      var code = 0x0100 + (index - CH.length);
      if (code >= 0xD800) code += 0x0800;
      if (code > 0xFFFD) throw new Error("mapa OTBM excede 63 mil combinações de tiles");
      return String.fromCharCode(code);
    }
    function charDa(chave, entry) {
      if (assin[chave] !== undefined) return assin[chave];
      var c = legendaChar(pool++);
      assin[chave] = c;
      legenda[c] = entry;
      return c;
    }
    var VOID = " ";
    // Void da moldura mínima: bloqueia movimentação, mas não possui sprite.
    // Não use `v: []`: array vazio é truthy e gerava tiles/undefined.png.
    legenda[VOID] = { bloc: true };
    // 24×15 preserva o enquadramento dos mapas antigos, mas não existe teto:
    // qualquer OTBM maior mantém integralmente largura/altura e a instância
    // dinâmica/câmera central cuidam do restante.
    var targetW = Math.max(24, map.w, Number(map.idleTargetWidth) || 0);
    var targetH = Math.max(15, map.h, Number(map.idleTargetHeight) || 0);
    var padX = Math.max(0, Math.min(targetW - map.w,
      Math.floor((targetW - map.w) / 2) + (Number(map.idleOffsetX) || 0)));
    var padY = Math.max(0, Math.min(targetH - map.h,
      Math.floor((targetH - map.h) / 2) + (Number(map.idleOffsetY) || 0)));

    // Colisão do footprint visual. Um item bloqueante 2×2 é desenhado pelo
    // renderer a partir da âncora inferior-direita, ocupando também os três
    // SQMs acima/à esquerda. Bloquear apenas a âncora deixava monstros
    // entrarem "dentro" da parede apesar de a sprite cobrir a célula.
    var footprintBlocked = {};
    Object.keys(map.cells || {}).forEach(function (key) {
      var xy = key.split(","), sourceX = +xy[0], sourceY = +xy[1];
      var cell = map.cells[key], gid = cell && cell.g;
      if (!cell) return;
      var groundFlags = gid ? tileflags[gid] : null;
      var onWall = !!(groundFlags && groundFlags[0] === 0);
      for (var fi = 0; fi < (cell.items || []).length; fi++) {
        var itemFlags = tileflags[cell.items[fi]];
        if (!itemFlags || !itemFlags[1]) continue;
        var tw = Math.max(1, Number(itemFlags[2]) || 1);
        var th = Math.max(1, Number(itemFlags[3]) || 1);
        // Hangable já está preso a um chão-parede bloqueado e é centralizado
        // pelo renderer; só objetos de chão estendem o footprint para trás.
        if (onWall || (tw === 1 && th === 1)) continue;
        var anchorX = sourceX + padX, anchorY = sourceY + padY;
        for (var fy = 0; fy < th; fy++) for (var fx = 0; fx < tw; fx++) {
          var bx = anchorX - fx, by = anchorY - fy;
          if (bx >= 0 && by >= 0 && bx < targetW && by < targetH)
            footprintBlocked[bx + ":" + by] = true;
        }
      }
    });
    var rows = [];
    for (var y = 0; y < targetH; y++) {
      var row = "";
      for (var x = 0; x < targetW; x++) {
        var sourceX = x - padX, sourceY = y - padY;
        var cell = (sourceX < 0 || sourceY < 0 || sourceX >= map.w || sourceY >= map.h)
          ? null : map.cells[sourceX + "," + sourceY];
        if (!cell || (!cell.g && !(cell.items && cell.items.length))) {
          row += VOID;
          continue;
        }
        // ids originais do editor (15.x) — sprites reais em assets/tiles/
        var gid = cell.g || 0;
        var items = (cell.items || []).filter(function (id) { return !hiddenItems[id]; });
        var bloc = 0;
        var gwalk = gid && tileflags[gid] ? tileflags[gid][0] : 0;
        if (!gwalk) bloc = 1;
        for (var j = 0; j < items.length; j++) {
          if (tileflags[items[j]] && tileflags[items[j]][1]) { bloc = 1; break; }
        }
        // Não crie `v: []`: arrays vazios são truthy em JS e o renderer
        // chamava tileVariant([]), pedindo assets/tiles/undefined.png.
        var entry = {};
        if (gid) entry.v = [gid];
        if (items.length) entry.g = items.slice();
        if (bloc) entry.bloc = true;
        row += charDa([gid, items.join("."), bloc].join("|"), entry);
      }
      rows.push(row);
    }
    var out = { rows: rows, legenda: legenda,
                // `leg` é o nome que o drawTileCharMap (tilemap.js) espera;
                // `legenda` é o nome histórico do otbm. Expor os dois evita
                // "Cannot read properties of undefined (reading 'a')" ao
                // desenhar qualquer mapa .otbm.
                leg: legenda,
                nome: map.name || "Mapa .otbm",
                footprintBlocked: footprintBlocked,
                fovWidth: Number(map.idleFovWidth) || 0,
                fovHeight: Number(map.idleFovHeight) || 0,
                otbm: true };
    if (map.spawn) {
      out.spawn = { x: map.spawn.x + padX, y: map.spawn.y + padY };
      // Coordenada explícita do RME tem prioridade sobre o footprint visual
      // de objetos vizinhos. Sem isso, itens 2×2 podiam bloquear o player
      // mesmo quando o chão do playerspawn era andável (caso MOTA).
      delete footprintBlocked[out.spawn.x + ":" + out.spawn.y];
    }
    if (map.mob && map.mob.length) {
      out.mob = map.mob.map(function (c) { return { x: c.x + padX, y: c.y + padY }; });
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
    crop: crop,
    _EscBuf: EscBuf,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = OTBM;
  else global.OTBM = OTBM;
})(typeof window !== "undefined" ? window : globalThis);
