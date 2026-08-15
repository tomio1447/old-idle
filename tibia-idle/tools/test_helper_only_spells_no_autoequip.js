/* Spells só do Helper + autoEquip stub (sem vestir mid-hunt). */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw new Error(msg); }

const playerJs = fs.readFileSync(path.join(__dirname, "../game/js/player.js"), "utf8");
const combatJs = fs.readFileSync(path.join(__dirname, "../game/js/combat.js"), "utf8");
const gameJs = fs.readFileSync(path.join(__dirname, "../game/js/game.js"), "utf8");
const engineJs = fs.readFileSync(path.join(__dirname, "../server/authoritative_engine.js"), "utf8");

must(/function autoEquip\([\s\S]*?return \[\];/.test(playerJs),
  "autoEquip deve ser stub que não veste nada");
must(!/autoEquip\(p\)/.test(gameJs),
  "giveStarterKit não deve chamar autoEquip");
must(!/DEFAULT_HEAL/.test(engineJs),
  "engine não deve ter fallback DEFAULT_HEAL");
must(!/defaults=\{knight:"exori"/.test(engineJs),
  "playerSpellList não deve injetar spell padrão de vocação");
must(!/runeUsable\(p,slug,now\)&&tryUseRune/.test(engineJs),
  "engine não deve auto-disparar qualquer runa do supplies");
must(!/shooterType !== "spell"\) \{\s*for \(const slug in p\.supplies\)/.test(combatJs),
  "client tryUseRune não deve escolher melhor runa do estoque sozinho");

must(typeof engine.playerSpellList === "function", "playerSpellList exportado");
must(typeof engine.nextComboSpell === "function", "nextComboSpell exportado");

const bare = {
  id: 1, name: "Bare", voc: "sorcerer", level: 80, mp: 2000, ml: 50,
  skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 10 },
  equip: { weapon: { item: "wand-of-cosmic-energy" } },
  config: { spellAttack: true, combo: [], attackSpells: [] },
  _spellCd: {}, _groupCd: {},
};
must(engine.playerSpellList(bare).length === 0,
  "sem Helper: lista de ataque vazia (sem exori-mort padrão)");

const helper = Object.assign({}, bare, {
  config: {
    spellAttack: true,
    combo: [
      { kind: "spell", id: "exevo-gran-mas-flam", min: 2 },
      { kind: "spell", id: "exori-flam", min: 1 },
      null, null, null, null,
    ],
    attackSpells: [],
  },
});
const ids = engine.playerSpellList(helper).map((s) => s.id).sort();
must(ids.indexOf("exori-flam") !== -1 && ids.indexOf("exevo-gran-mas-flam") !== -1,
  "Helper combo entra na lista");
must(ids.every((id) => id === "exori-flam" || id === "exevo-gran-mas-flam"),
  "lista = só o que o Helper habilitou");

const auth = {
  players: [{ id: 1, p: helper, cx: 8, cy: 6 }],
  mobs: [
    { id: "a", slug: "rat", hp: 500, maxHp: 500, cx: 9, cy: 6 },
    { id: "b", slug: "rat", hp: 500, maxHp: 500, cx: 10, cy: 6 },
    { id: "c", slug: "rat", hp: 500, maxHp: 500, cx: 11, cy: 6 },
  ],
  events: [], clock: 10000,
};
const living = auth.mobs.filter((m) => m.hp > 0);
const pick = engine.nextComboSpell(auth, auth.players[0], helper, 10000, living[0], living);
must(pick && pick.id === "exevo-gran-mas-flam",
  "dense-pack escolhe AoE do Helper, não spell fora da barra");

const emptyCombo = Object.assign({}, bare, {
  config: { spellAttack: true, combo: [], attackSpells: [] },
});
must(engine.nextComboSpell(auth, auth.players[0], emptyCombo, 10000, living[0], living) == null,
  "sem Helper: nextComboSpell não inventa spell padrão");

const noHeal = {
  id: 2, name: "NoHeal", voc: "druid", level: 100, hp: 50, mp: 2000, ml: 60,
  skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 10 },
  equip: {}, supplies: {}, lootPouch: {}, kills: {}, bosses: {},
  config: {
    healSpell: "", healSpellAt: 99, healAt: 99, healItemAt: 1,
    noPotions: true, noHealthPotions: true, spellAttack: false, combo: [],
  },
  _spellCd: {}, _groupCd: {},
};
const member = { id: "2", p: JSON.parse(JSON.stringify(noHeal)) };
const desc = {
  v: 1, savedAt: 10000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
  activeCharacterId: "2", members: [member],
  state: {
    players: [{ id: "2", p: member.p, cx: 8, cy: 6 }],
    mobs: [{ id: "m1", slug: "rat", hp: 1, maxHp: 1, cx: 10, cy: 6, damage: 0 }],
    events: [],
  },
};
const live = engine.initializeAuthority(desc, "c".repeat(64), 10000);
live.authority.mobs[0].damage = 0;
live.authority.players[0].p.hp = 50;
live.authority.players[0].p.mp = 2000;
live.authority.players[0].p.config.healSpell = "";
const mp0 = live.authority.players[0].p.mp;
const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 2000, 12000).state);
const p1 = after.authority.players[0].p;
const events = (after.authority.events || []).concat((after.state && after.state.events) || []);
const rogueHeal = events.some((e) =>
  e && (e.t === "heal" || e.t === "say") && /exura/i.test(String(e.spell || e.text || "")));
must(!rogueHeal, "sem healSpell no Helper: nenhum cast de exura padrão");
must(p1.mp >= mp0 - 1, "sem healSpell: mana não cai por cura automática de vocação");

console.log("OK: helper-only spells + autoEquip stub");
