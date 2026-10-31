"use strict";
/* Daily Monster + Daily Boss — rotação diária no server save (00h Brasília).
 *
 * A escolha é DETERMINÍSTICA por data: o mesmo seed gera o mesmo par em
 * qualquer boot, então não precisa persistir nem sincronizar. O dia é
 * calculado em America/Sao_Paulo — alinhado com o SERVER SAVE IN da topbar.
 *
 * - Daily Monster: +25% EXP (finalExp no engine). Pool = monstros que
 *   realmente spawnam nas hunts (hunts.json) e têm def + não são boss.
 * - Daily Boss: +25% chance de loot (reward no engine). Pool = bosses
 *   lutáveis das arenas (mesma lista do catálogo BOSSES do cliente).
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "game", "data");
function readJson(file) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); } catch (e) { return {}; } }

const MONSTERS = Object.assign({}, readJson("monsters.json"), readJson("canarymonsters.json"));
const HUNTS = readJson("hunts.json");

/* Bosses das arenas — espelho das BOSS_MODAL_SECTIONS do cliente (game.js).
 * Mantido aqui porque o servidor é a autoridade do bônus. */
const DAILY_BOSS_POOL = [
  "leiden", "tentugly-s-head",
  "aftershock", "anomaly", "eradicator", "outburst", "realityquake", "rupture",
  "jaul", "obujos", "tanjis", "brokul",
  "plagueroot", "alptramun", "izcandar-champion-of-summer", "izcandar-champion-of-winter",
  "malofur-mangrinder", "maxxenius",
  "timira-the-many-headed", "scarlett-etzel", "faceless-bane", "doctor-marrow",
  "grand-master-oberon", "ratmiral-blackwhiskers", "the-brainstealer", "drume",
  "the-dread-maiden", "the-fear-feaster", "the-unwelcome", "brain-head",
  "goshnar-s-malice", "goshnar-s-spite", "goshnar-s-greed", "goshnar-s-hatred", "goshnar-s-cruelty",
].filter((slug) => MONSTERS[slug] && MONSTERS[slug].boss);

const DAILY_MONSTER_POOL = (() => {
  const set = new Set();
  for (const key of Object.keys(HUNTS)) for (const slug of (HUNTS[key] && HUNTS[key].monsters) || [])
    if (MONSTERS[slug] && !MONSTERS[slug].boss) set.add(slug);
  return Array.from(set).sort();
})();

const TZ = "America/Sao_Paulo";
let _dateFmt = null;
function saoPauloDateKey() {
  _dateFmt = _dateFmt || new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return _dateFmt.format(new Date()); // YYYY-MM-DD no fuso de Brasília
}

/* Hash estável do seed (FNV-1a) — sem depender de Math.random. */
function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

let _cache = null;
function dailyBoost() {
  const date = saoPauloDateKey();
  if (_cache && _cache.date === date) return _cache;
  const pick = (pool, tag) => {
    if (!pool.length) return null;
    const slug = pool[hashSeed(`${date}|${tag}`) % pool.length];
    return { slug, name: (MONSTERS[slug] && MONSTERS[slug].name) || slug };
  };
  _cache = {
    date,
    monster: pick(DAILY_MONSTER_POOL, "monster"),
    boss: pick(DAILY_BOSS_POOL, "boss"),
  };
  return _cache;
}

function isDailyMonster(slug) {
  const d = dailyBoost();
  return !!(d.monster && String(slug) === d.monster.slug);
}
function isDailyBoss(slug) {
  const d = dailyBoost();
  return !!(d.boss && String(slug) === d.boss.slug);
}

module.exports = { dailyBoost, isDailyMonster, isDailyBoss, saoPauloDateKey,
  DAILY_MONSTER_POOL, DAILY_BOSS_POOL };
