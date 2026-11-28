/* instance_boot_hunt.js — sobe a instância de uma hunt OTBM para uma conta
 * DIRETO no servidor (modo offline: o worker ticka sem cliente aberto).
 *
 * Uso (dentro do container `/app` ou no host com cwd=tibia-idle/):
 *   node tools/instance_boot_hunt.js <accountId> <huntId> [instanceMode]
 *
 * Replica o PUT inicial do cliente: monta o descritor a partir do .otbm
 * (zonas absolutas otbmSpawn/otbmMobBounds, colisão leg.bloc+footprint,
 * walkFloors) + membros = todos os chars da conta, passa por
 * initializeAuthority e grava via instanceReplaceForced. Substitui a
 * instância ativa da conta — o estado anterior é perdido (salvo já estava
 * persistido nos chars/pouch pela última tick).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const accountId = Number(process.argv[2]);
const huntId = String(process.argv[3] || "");
const instanceMode = String(process.argv[4] || "pvp");
if (!accountId || !huntId) {
  console.error("uso: node tools/instance_boot_hunt.js <accountId> <huntId> [instanceMode]");
  process.exit(1);
}

function run(file, sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "game", "js", file), "utf8"), sandbox, { filename: file });
}

/* Definição da hunt: registra em GAMEDATA.hunts — procura o arquivo js que
 * declara o id e roda num sandbox mínimo (o resto do arquivo não importa). */
function huntDef(id) {
  const dir = path.join(ROOT, "game", "js");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (!src.includes('"' + id + '"') && !src.includes("'" + id + "'")) continue;
    const sb = { GAMEDATA: { hunts: {} } };
    try { run(f, sb); } catch (e) { /* registra parcial */ }
    if (sb.GAMEDATA.hunts && sb.GAMEDATA.hunts[id]) return sb.GAMEDATA.hunts[id];
  }
  return null;
}

(async () => {
  // .env do server sem depender do dotenc (a tool roda de tools/, fora da
  // cadeia de node_modules do server em alguns contextos).
  try {
    for (const line of fs.readFileSync(path.join(ROOT, "server", ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(\w+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch (e) {}
  const engine = require(path.join(ROOT, "server", "authoritative_engine.js"));
  const { getDb } = require(path.join(ROOT, "server", "db.js"));
  const OTBM = require(path.join(ROOT, "game", "js", "otbm.js"));

  const hunt = huntDef(huntId);
  if (!hunt) { console.error("hunt não encontrada:", huntId); process.exit(1); }
  if (!hunt.otbm) { console.error("hunt sem .otbm — esta tool só cobre hunts OTBM:", huntId); process.exit(1); }

  const tfSb = {};
  tfSb.window = tfSb;
  try { run("tileflags.js", tfSb); } catch (e) {}
  const TILEFLAGS = tfSb.TILEFLAGS || {};

  const ohSb = { addEventListener: () => {}, setInterval: () => 0, clearInterval: () => {} };
  ohSb.window = ohSb;
  run("otbmhunt.js", ohSb);
  const applyZones = ohSb.applyHuntOtbmZones;

  const mapFile = path.join(ROOT, "game", "maps", hunt.otbm + ".otbm");
  const mapa = OTBM.read(fs.readFileSync(mapFile), { z: hunt.otbmFloor });
  applyZones(mapa, hunt);
  const hm = OTBM.huntMapFromOtbm(mapa, TILEFLAGS);

  // walkFloors: mesma passada do cliente (otbmhunt.js) — chão funcional
  // marcado como bloc no .dat libera a célula (sem item bloqueante em cima).
  const wf = Array.isArray(hunt.walkFloors) ? hunt.walkFloors : [];
  if (wf.length && hm.leg) {
    const floors = new Set(wf.map(Number));
    for (const key of Object.keys(hm.leg)) {
      const e = hm.leg[key];
      if (e && e.bloc && (e.v || []).some((id) => floors.has(id)) &&
          !(e.g || []).some((id) => TILEFLAGS[id] && TILEFLAGS[id][1])) e.bloc = false;
    }
  }

  const gridW = hm.rows[0].length, gridH = hm.rows.length;
  const blockedCells = {};
  for (let y = 0; y < gridH; y++) for (let x = 0; x < gridW; x++) {
    const legend = hm.leg[hm.rows[y][x]];
    if (!legend || legend.bloc || (hm.footprintBlocked && hm.footprintBlocked[x + ":" + y]))
      blockedCells[x + ":" + y] = true;
  }
  const free = (x, y) => x >= 0 && y >= 0 && x < gridW && y < gridH && !blockedCells[x + ":" + y];
  const spawn = (hm.spawn && free(hm.spawn.x, hm.spawn.y)) ? hm.spawn
    : { x: Math.floor(gridW / 2), y: Math.floor(gridH / 2) };

  const db = await getDb();
  const chars = await db.charactersOf(accountId);
  if (!chars || !chars.length) { console.error("conta sem chars:", accountId); process.exit(1); }
  const acc = typeof db.findAccountById === "function" ? await db.findAccountById(accountId) : null;

  const members = [], players = [];
  chars.forEach((ch, i) => {
    const data = typeof ch.data === "string" ? JSON.parse(ch.data) : ch.data;
    data.gold = Math.max(0, Math.floor(Number(acc && acc.gold) || 0));
    data.accountId = accountId;
    const max = engine.maxStats(data);
    data.hp = max.hp; data.mp = max.mp;
    members.push({ id: String(ch.id), p: data, hp: data.hp, mp: data.mp, accountId });
    // anel de spawn ao redor do ponto (mesmo deslocamento do world-boss)
    let cx = spawn.x + ((i % 5) - 2), cy = spawn.y + (Math.floor(i / 5) % 3);
    if (!free(cx, cy)) { cx = spawn.x; cy = spawn.y; }
    players.push({ id: String(ch.id), p: data, hp: data.hp, mp: data.mp, accountId,
      cx, cy, x: (cx + .5) / gridW, y: (cy + .5) / gridH, dir: "n" });
  });

  // Primeira onda: packMin..packMax mobs em células livres da zona otbmMobBounds.
  const zone = (hm.mob || []).filter((z) => free(z.x, z.y));
  const packN = Math.max(1,
    (hunt.packMin || hunt.pack || 3) +
    Math.floor(Math.random() * (Math.max(1, hunt.packMax || hunt.pack || 3) - (hunt.packMin || hunt.pack || 3) + 1)));
  const taken = new Set(players.map((p) => p.cx + ":" + p.cy));
  const mobs = [];
  for (let i = 0; i < zone.length && mobs.length < packN; i++) {
    const z = zone[(i * 7) % zone.length]; // espalha pela zona
    const key = z.x + ":" + z.y;
    if (taken.has(key)) continue;
    taken.add(key);
    const pool = hunt.monsters || [];
    const slug = pool[i % pool.length];
    mobs.push({ slug, id: "boot-" + i, cx: z.x, cy: z.y,
      x: (z.x + .5) / gridW, y: (z.y + .5) / gridH });
  }

  const instanceId = crypto.randomBytes(32).toString("hex");
  const descriptor = {
    v: 1, kind: "hunt", huntId, bossId: null, questId: null,
    instanceMode, activeCharacterId: String(members[0].id),
    members,
    state: {
      gridW, gridH, blockedCells, hunt,
      influencedChance: 0, fiendishChance: 0,
      players, mobs, pendingSpawns: [],
    },
  };
  const initialized = engine.initializeAuthority(descriptor, instanceId, Date.now());
  initialized.startedAt = Date.now();

  const stamp = new Date();
  const saved = await db.instanceReplaceForced(accountId, instanceId, {
    kind: "hunt", hunt_id: huntId, boss_id: null, instance_mode: instanceMode,
    party_id: null, party_version: null,
    active_character_id: Number(members[0].id),
    saved_at: stamp, started_at: stamp,
  }, JSON.stringify(initialized));
  if (!saved || !saved.ok) {
    console.error("save falhou:", saved && saved.error); process.exit(1);
  }
  console.log("instância criada:", instanceId.slice(0, 12),
    "| hunt:", huntId, "| mode:", instanceMode, "| grid:", gridW + "x" + gridH,
    "| members:", members.map((m) => m.id).join(","), "| mobs:", mobs.length);
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
