/* Regressão: Buried Cathedral (hunt 250+) — mapa, criaturas, loot, sprites
 * e missão do Faceless Bane.
 *
 * 1. OTBM publicado em game/maps (byte-igual ao beta-maps) com piso z=7:
 *    centermap {1071,1002,7}, playerspawn {1070,1006,7} e spawnradius
 *    {1066,997,7}..{1075,1006,7} dentro dos bounds e com chão.
 * 2. Hunt 250+ com as 4 criaturas do Canary (ripper/gazer/burster spectre +
 *    arachnophobica); o servidor tem a hunt no HUNTS e o spawn pool online
 *    inclui as 4.
 * 3. Loot das 4 criaturas: nenhum item faltando no catálogo (os 10 que
 *    faltavam foram registrados: ectoplasms/golden idol = quest sell 0;
 *    os demais com preço NPC).
 * 4. Sprites: os 3 spectres compartilham a MESMA sprite (looktype 1122) com
 *    cores diferentes — os sheets principais são coloridos (verde/vermelho/
 *    azul) e batem pixel a pixel com os frames .idle correspondentes.
 * 5. Missão: 250 kills (70+60+60+60) → bossAccess "faceless-bane".
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), zlib = require("zlib");
const engine = require("../server/authoritative_engine");
function must(v, m) { if (!v) throw Error(m); }
const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
const game = path.join(root, "game");
const OTBM = require(path.join(js, "otbm.js"));

/* ---------------- 1) OTBM publicado + geometria ---------------- */
const beta = fs.readFileSync(path.join(game, "beta-maps", "buried cathedral.otbm"));
const pub = fs.readFileSync(path.join(game, "maps", "buried_cathedral.otbm"));
must(beta.equals(pub), "Buried Cathedral não publica o OTBM (beta-maps ≠ maps)");
const map = OTBM.read(pub, { z: 7 });
must(map.sourceBounds.minX === 1062 && map.sourceBounds.minY === 993 &&
  map.sourceBounds.maxX === 1081 && map.sourceBounds.maxY === 1012,
  "bounds do OTBM divergentes: " + JSON.stringify(map.sourceBounds));
const cell = (x, y) => map.cells[(x - 1062) + "," + (y - 993)];
const grounded = (x, y) => { const c = cell(x, y); return !!(c && Number(c.g) > 0); };
must(grounded(1070, 1006), "playerspawn {1070,1006,7} sem chão no OTBM");
must(grounded(1071, 1002), "centermap {1071,1002,7} sem chão no OTBM");
must(grounded(1066, 997) && grounded(1075, 1006) && grounded(1075, 997) && grounded(1066, 1006),
  "spawnradius {1066,997}..{1075,1006} com cantos sem chão no OTBM");

/* ---------------- 2) hunt (cliente + servidor) ---------------- */
{
  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), ctx, { filename: "gamedata.js" });
  vm.runInContext(fs.readFileSync(path.join(js, "buried-cathedral.js"), "utf8"), ctx, { filename: "buried-cathedral.js" });
  const h = vm.runInContext('window.GAMEDATA.hunts["buried-cathedral"]', ctx);
  must(h && h.name === "Buried Cathedral" && h.level === 250 && h.minLevel === 250,
    "hunt buried-cathedral ausente/sem nível 250+");
  must(h.cat === "hard" && h.pack === 10 && h.packMin === 6 && h.packMax === 10, "hunt sem cat hard/pack");
  must(JSON.stringify(h.monsters) === JSON.stringify(["ripper-spectre", "gazer-spectre", "burster-spectre", "arachnophobica"]),
    "monstros da hunt divergentes do Canary");
  must(h.otbm === "buried_cathedral" && h.otbmFloor === 7, "hunt sem otbm/floor");
  must(JSON.stringify(h.otbmSpawn) === JSON.stringify({ x: 1070, y: 1006, z: 7 }) &&
    JSON.stringify(h.otbmMobBounds) === JSON.stringify({ x: 1066, y: 997, w: 10, h: 10, z: 7 }),
    "playerspawn/spawnradius da hunt divergentes");
  must(h.avgHp === 4950 && h.avgExp === 4600 && h.avgDamage === 393 && h.avgArmor === 69,
    "médias Canary da hunt divergentes");

  // servidor: HUNTS + pool funcional com as 4 criaturas
  const src = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
  must(src.includes('"buried-cathedral":{monsters:["ripper-spectre","gazer-spectre","burster-spectre","arachnophobica"]'),
    "servidor sem HUNTS de buried-cathedral");
  const auth = { kind: "hunt", huntId: "buried-cathedral", ended: false, mobs: [], pendingSpawns: [],
    spawnPool: [], spawnIds: ["srv-b1", "srv-b2", "srv-b3"], pack: 3, wave: 0,
    gridW: 30, gridH: 30, spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
    clock: Date.now(), rngState: 424242, fiendishChance: 0, influencedChance: 0 };
  engine.spawnHuntWave(auth, Date.now());
  must(auth.spawnPool.length === 4 &&
    ["ripper-spectre", "gazer-spectre", "burster-spectre", "arachnophobica"]
      .every((s) => auth.spawnPool.includes(s)),
    "pool online não inclui as 4 criaturas: " + JSON.stringify(auth.spawnPool));
}

/* ---------------- 3) loot completo + catálogo ---------------- */
{
  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["gamedata.js", "soulwar.js", "yasir-prices.js", "hard-hunts.js",
    "patch_imbuement.js", "hardcore-library.js", "feast-of-souls.js",
    "deepling-bosses.js", "buried-cathedral.js", "accessorydata.js",
    "weapondata.js", "weapons.js", "supply-stash-data.js"])
    vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
  const items = vm.runInContext("window.GAMEDATA.items", ctx);
  const questZero = new Set(["green-ectoplasm", "red-ectoplasm", "blue-ectoplasm", "golden-idol-of-tukh"]);
  for (const slug of ["ripper-spectre", "gazer-spectre", "burster-spectre", "arachnophobica"]) {
    const m = engine.MONSTERS[slug];
    must(m && Array.isArray(m.loot) && m.loot.length > 0, slug + " sem loot no servidor");
    for (const l of m.loot) {
      const it = items[l.item];
      must(it, slug + ": item de loot fora do catálogo: " + l.item);
      if (!questZero.has(l.item))
        must((Number(it.npcSell) > 0 || Number(it.sell) > 0),
          slug + ": loot sem preço (autoseller pularia): " + l.item);
    }
  }
  must(items["hexagonal-ruby"] && items["hexagonal-ruby"].sell === 30000, "hexagonal-ruby sem sell 30000");
  must(items["coral-brooch"] && items["coral-brooch"].sell === 750, "coral-brooch sem sell 750");
  must(items["essence-of-a-bad-dream"] && items["essence-of-a-bad-dream"].sell === 360,
    "essence-of-a-bad-dream sem sell 360");
  must(items["green-ectoplasm"] && items["green-ectoplasm"].sell === 0 &&
    items["golden-idol-of-tukh"] && items["golden-idol-of-tukh"].sell === 0,
    "itens de quest deveriam ter sell 0");
}

/* ---------------- 4) sprites: mesma sprite, cores diferentes ---------------- */
{
  // decode PNG RGBA (sem deps)
  function pngPixels(buf) {
    let off = 8, w = 0, h = 0, bit = 0, ctype = 0, idat = [];
    while (off < buf.length) {
      const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
      const data = buf.slice(off + 8, off + 8 + len);
      if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bit = data[8]; ctype = data[9]; }
      if (type === "IDAT") idat.push(data);
      off += 12 + len;
    }
    must(bit === 8 && ctype === 6, "PNG esperado RGBA 8-bit");
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const bpp = 4, stride = w * bpp, out = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)];
      const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? out[y * stride + x - bpp] : 0;
        const b = y > 0 ? out[(y - 1) * stride + x] : 0;
        const c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0;
        let v = line[x];
        if (f === 1) v = (v + a) & 255;
        else if (f === 2) v = (v + b) & 255;
        else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
        else if (f === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        }
        out[y * stride + x] = v;
      }
    }
    return { w, h, data: out };
  }
  const slugs = ["ripper-spectre", "gazer-spectre", "burster-spectre"];
  const sheets = {};
  for (const s of slugs) {
    const buf = fs.readFileSync(path.join(game, "assets", "mob", s + ".png"));
    const px = pngPixels(buf);
    must(px.w === 567 && px.h === 252, s + " com sheet fora de 9×4 @63px");
    sheets[s] = px;
  }
  const sig = (s) => {
    const d = s.data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return { r, g, b };
  };
  const sr = sig(sheets["ripper-spectre"]), sg = sig(sheets["gazer-spectre"]), sb = sig(sheets["burster-spectre"]);
  must(sr.g > sr.r && sr.g > sr.b, "ripper-spectre deveria dominar VERDE: " + JSON.stringify(sr));
  must(sg.r > sg.g && sg.r > sg.b, "gazer-spectre deveria dominar VERMELHO: " + JSON.stringify(sg));
  must(sb.b > sb.r && sb.b > sb.g, "burster-spectre deveria dominar AZUL: " + JSON.stringify(sb));
  // mesma sprite: alpha idêntico entre os 3
  for (let i = 3; i < sheets["ripper-spectre"].data.length; i += 4)
    must(sheets["ripper-spectre"].data[i] === sheets["gazer-spectre"].data[i] &&
      sheets["ripper-spectre"].data[i] === sheets["burster-spectre"].data[i],
      "alpha dos 3 spectres divergiu (sprites diferentes?)");
  // cores do frame principal (col 0) batem pixel a pixel com o .idle col 0
  for (const s of slugs) {
    const idle = pngPixels(fs.readFileSync(path.join(game, "assets", "mob", s + ".idle.png")));
    must(idle.w === 504 && idle.h === 252, s + " idle fora de 8×4 @63px");
    const m = sheets[s];
    for (let y = 0; y < 63; y++) {
      for (let x = 0; x < 63; x++) {
        // linha s (row 2), col 0 em ambos
        const mi = ((2 * 63 + y) * m.w + x) * 4;
        const ii = ((2 * 63 + y) * idle.w + x) * 4;
        for (let ch = 0; ch < 4; ch++)
          must(m.data[mi + ch] === idle.data[ii + ch],
            s + ": main col0 não bate com idle col0 (recolor quebrou)");
      }
    }
  }
}

/* ---------------- 5) missão 250 kills → Faceless Bane ---------------- */
{
  const src = fs.readFileSync(path.join(js, "buried-cathedral.js"), "utf8");
  must(src.includes('MISSION_DEFS["buried-cathedral"]') &&
    src.includes('bossAccess: "faceless-bane"') && src.includes('bossName: "Faceless Bane"'),
    "missão do Faceless Bane ausente");
  const targets = [...src.matchAll(/monster: "([a-z-]+)", target: (\d+)/g)];
  const total = targets.reduce((a, t) => a + Number(t[2]), 0);
  must(total === 250 && targets.length === 4, "missão deveria somar 250 kills em 4 tasks: " + total);
  const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
  must(uiSrc.includes('"HUNTS 250+"') && uiSrc.includes('"buried-cathedral"'),
    "ui.js sem buried-cathedral na seção HUNTS 250+");
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  must(html.includes("buried-cathedral.js?v=buried-cathedral-v1") &&
    html.includes("ui.js?v=buried-cathedral-v1"),
    "cache-busts do buried cathedral ausentes no index");
}

console.log("ok: buried cathedral (mapa + hunt 250+ + loot completo + sprites coloridos + missão Faceless Bane)");
