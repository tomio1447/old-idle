/* Filtro de vocação (exura tio sio) + regen Canary. node tibia-idle/tools/test_vocation_spells_regen.js */
"use strict";
const voc = require("../game/js/canary-vocation");
const engine = require("../server/authoritative_engine");
function must(ok, msg) { if (!ok) throw Error(msg); }

const spells = engine.ALL_SPELLS;
must(engine.applyVocationRegen === voc.applyVocationRegen,
  "motor do servidor deve exportar a mesma applyVocationRegen");
must(engine.spellAllowedForVoc === voc.spellAllowedForVoc,
  "motor do servidor deve exportar a mesma spellAllowedForVoc");

must(!voc.spellAllowedForVoc(spells["exura-tio-sio"], "druid"),
  "druid não pode usar exura tio sio");
must(!voc.spellAllowedForVoc(spells["exura-tio-sio"], "knight"),
  "knight não pode usar exura tio sio");
must(!voc.spellAllowedForVoc(spells["exura-tio-sio"], "paladin"),
  "paladin não pode usar exura tio sio");
must(!voc.spellAllowedForVoc(spells["exura-tio-sio"], "sorcerer"),
  "sorcerer não pode usar exura tio sio");
must(voc.spellAllowedForVoc(spells["exura-tio-sio"], "monk"),
  "monk deve poder usar exura tio sio");
must(voc.spellAllowedForVoc(spells["exura-sio"], "druid"),
  "druid deve poder usar exura sio");
must(!voc.spellAllowedForVoc(spells["exura-sio"], "monk"),
  "monk não usa exura sio");

const druidSelf = voc.selfHealSpellIds(spells, "druid");
must(!druidSelf.includes("exura-tio-sio") && !druidSelf.includes("exura-mas-nia"),
  "picker de autocura do druid não pode listar magias de monk");
must(druidSelf.includes("exura") && druidSelf.includes("exura-vita"),
  "picker de autocura do druid deve ter exura/exura vita");
must(!voc.friendHealSpellIds("druid").includes("exura-tio-sio"),
  "heal friend do druid não inclui exura tio sio");
must(voc.friendHealSpellIds("druid").includes("exura-sio"),
  "heal friend do druid inclui exura sio");
must(voc.friendHealSpellIds("monk").includes("exura-tio-sio"),
  "heal friend do monk inclui exura tio sio");
must(!voc.friendHealSpellIds("monk").includes("exura-sio"),
  "heal friend do monk não inclui exura sio");

const migrated = voc.sanitizePlayerSpells({
  voc: "druid",
  config: {
    healSpell: "exura-tio-sio",
    combo: [{ kind: "spell", id: "exori-pug", min: 1 }, { kind: "spell", id: "exura-tio-sio", min: 1 }],
    healFriendSpells: { "exura-tio-sio": { enabled: true, at: 70 } },
  },
}, spells);
must(migrated.config.healSpell !== "exura-tio-sio",
  "healSpell monk no druid deve ser migrado");
must(voc.spellAllowedForVoc(spells[migrated.config.healSpell], "druid"),
  "healSpell migrado precisa ser de druid");
must(!migrated.config.combo.some((s) => s && (s.id === "exori-pug" || s.id === "exura-tio-sio")),
  "combo do druid não pode manter magias de monk");
must(!migrated.config.healFriendSpells["exura-tio-sio"],
  "healFriendSpells do druid não pode manter exura tio sio");
must(migrated.config.healFriendSpells["exura-sio"],
  "regra de tio sio no druid vira exura sio");

const k = voc.vocationRegenSpec({ voc: "knight" });
const d = voc.vocationRegenSpec({ voc: "druid" });
const s = voc.vocationRegenSpec({ voc: "sorcerer" });
const m = voc.vocationRegenSpec({ voc: "monk" });
const ek = voc.vocationRegenSpec({ voc: "knight", promoted: true });
const em = voc.vocationRegenSpec({ voc: "monk", promoted: true });
must(k.hpTicks < d.hpTicks && k.hpTicks < s.hpTicks, "knight HP regen mais rápido que mage");
must(d.mpTicks < k.mpTicks && s.mpTicks < k.mpTicks, "mage mana regen mais rápido que knight");
must(m.hpTicks === 6000 && m.hpAmount === 1 && m.mpTicks === 6000 && m.mpAmount === 2,
  "monk Canary: 1 HP/6s e 2 mana/6s");
must(ek.hpTicks === 4000 && em.hpTicks === 4000, "promoção EK/Exalted: 1 HP/4s");
must(voc.vocationRegenSpec({ voc: "druid", promoted: true }).mpTicks === 2000,
  "elder druid: 2 mana/2s");

const kg = voc.applyVocationRegen({ hp: 0, mp: 0 }, 12000, k);
const dg = voc.applyVocationRegen({ hp: 0, mp: 0 }, 12000, d);
must(kg.hp === 2 && dg.hp === 1, "em 12s knight ganha 2 HP e mage 1 HP");
must(kg.mp === 4 && dg.mp === 8, "em 12s knight ganha 4 mana e mage 8 mana");
must(voc.applyVocationRegen({ hp: 0, mp: 0 }, 12000, m).hp === 2,
  "monk ganha 2 HP em 12s");

const now = 10_000;
function char(extra) {
  return Object.assign({
    id: 1, name: "Regen", voc: "knight", level: 80, exp: engine.expForLevel(80),
    hp: 200, mp: 10, gold: 0, ml: 20,
    skills: { sword: 50, axe: 10, club: 10, dist: 10, fist: 10, shield: 20 },
    equip: {}, supplies: {}, lootPouch: {}, kills: {}, bosses: {},
    config: { healSpell: "none", healSpellAt: 1, healAt: 1, noPotions: true, spellAttack: false, combo: [] },
  }, extra || {});
}
function hunt(players) {
  const members = players.map((p) => ({ id: String(p.id), p: JSON.parse(JSON.stringify(p)) }));
  return {
    v: 1, savedAt: now, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(players[0].id), members,
    state: {
      players: members.map((m, i) => ({ id: m.id, p: m.p, cx: 8 + i, cy: 6 })),
      mobs: [{ id: "regen-rat", slug: "rat", hp: 5000, maxHp: 5000, cx: 14, cy: 14, damage: 0 }],
      events: [],
    },
  };
}

const druid = char({
  id: 2, name: "Druida", voc: "druid", hp: 800, mp: 2000, ml: 40,
  config: {
    healSpell: "exura-vita", healSpellAt: 1, healAt: 1, noPotions: true, spellAttack: false,
    healFriendSpells: {
      "exura-sio": { enabled: true, at: 70, minTargets: 2 },
      "exura-gran-sio": { enabled: false, at: 70, minTargets: 2 },
      "exura-gran-mas-res": { enabled: false, at: 70, minTargets: 2 },
    },
    combo: [{ kind: "spell", id: "exura-tio-sio", min: 1 }],
  },
});
const knight = char({
  id: 3, name: "Kina", voc: "knight", hp: 300, mp: 40,
  config: { healSpell: "none", healSpellAt: 1, healAt: 1, noPotions: true, spellAttack: false, combo: [] },
});
const live = engine.initializeAuthority(hunt([druid, knight]), "c".repeat(64), now);
must(!live.authority.players[0].p.config.combo.some((s) => s && s.id === "exura-tio-sio"),
  "canonicalPlayer deve tirar exura tio sio do combo do druid");
live.authority.mobs[0].damage = 0;
const kItem = live.authority.players.find((x) => x.p.voc === "knight");
const dItem = live.authority.players.find((x) => x.p.voc === "druid");
kItem.p.hp = 300;
dItem.p.mp = 2000;
const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 2000, now + 2000).state);
const says = (after.authority.events || []).concat(after.state && after.state.events || [])
  .filter((e) => e && e.t === "say").map((e) => String(e.text || ""));
must(!says.some((t) => /exura tio sio/i.test(t)),
  "druid online não pode falar exura tio sio: " + JSON.stringify(says));
must(says.some((t) => /exura sio/i.test(t) && !/tio/i.test(t)),
  "druid online deve curar aliado com exura sio: " + JSON.stringify(says));

const regenLive = engine.initializeAuthority(hunt([char({ voc: "knight", hp: 200, mp: 8 })]), "d".repeat(64), now);
regenLive.authority.mobs[0].damage = 0;
const rPlayer = regenLive.authority.players[0];
const hp0 = rPlayer.p.hp, mp0 = rPlayer.p.mp;
const regenAfter = JSON.parse(engine.advanceAuthorityState(JSON.stringify(regenLive), 12000, now + 12000).state);
const r1 = regenAfter.authority.players[0].p;
must(r1.hp >= hp0 + 2, "knight deve ganhar HP Canary no servidor (1/6s)");
must(r1.mp >= mp0 + 4, "knight deve ganhar mana Canary no servidor (2/6s)");

console.log("OK: vocação filtra exura tio sio; regen Canary compartilhada com o servidor.");
