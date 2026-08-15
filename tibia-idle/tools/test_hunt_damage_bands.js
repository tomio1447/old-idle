/* Médias de dano das hunts alvo vs Canary (servidor). */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function must(v, m) { if (!v) throw new Error(m); }

const root = path.join(__dirname, "..");
const data = path.join(root, "game", "data");
const js = path.join(root, "game", "js");
const MONSTERS = Object.assign(
  {},
  JSON.parse(fs.readFileSync(path.join(data, "monsters.json"), "utf8")),
  JSON.parse(fs.readFileSync(path.join(data, "canarymonsters.json"), "utf8"))
);

function avg(slugs, key) {
  const vals = slugs.map((s) => MONSTERS[s] && MONSTERS[s][key]).filter((v) => v != null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

const bands = {
  "amazon-camp": { mobs: ["amazon", "valkyrie"], dmg: [40, 80], level: 20 },
  "cobra-bastion": { mobs: ["cobra-vizier", "cobra-scout", "cobra-assassin"], dmg: [400, 550], level: 250 },
  "marapur-nagas": { mobs: ["naga-archer", "naga-warrior", "makara"], dmg: [400, 550], level: 320 },
  "library-fire": { mobs: ["burning-book", "rage-squid", "biting-book"], dmg: [600, 900], level: 400 },
  "library-energy": { mobs: ["energetic-book", "biting-book"], dmg: [500, 800], level: 425 },
  "library-ice": { mobs: ["icecold-book", "squid-warden", "ink-blob"], dmg: [250, 500], level: 450 },
  "library-earth": { mobs: ["cursed-book", "biting-book"], dmg: [500, 800], level: 475 },
  "dark-thais": {
    mobs: ["many-faces", "knight-s-apparition", "paladin-s-apparition", "sorcerer-s-apparition",
      "druid-s-apparition", "monk-s-apparition", "distorted-phantom"],
    dmg: [700, 1100], level: 550,
  },
};

for (const [id, spec] of Object.entries(bands)) {
  const d = avg(spec.mobs, "damage");
  must(d != null, id + " sem monstros Canary");
  must(d >= spec.dmg[0] && d <= spec.dmg[1],
    id + " avgDamage Canary fora da faixa: " + d + " (esperado " + spec.dmg.join("-") + ")");
}

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), ctx);
ctx.GAMEDATA = ctx.window.GAMEDATA;
vm.runInContext(fs.readFileSync(path.join(js, "monsterdata.js"), "utf8"), ctx);
Object.assign(ctx.GAMEDATA.monsters, ctx.window.MONSTERDATA);
vm.runInContext(fs.readFileSync(path.join(js, "hardcore-library.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(js, "hard-hunts.js"), "utf8"), ctx);

must(ctx.GAMEDATA.monsters["energetic-book"].damage === MONSTERS["energetic-book"].damage,
  "hardcore-library sobrescreveu Energetic Book (offline ≠ online)");
must(ctx.GAMEDATA.hunts["library-ice"].avgDamage === 360, "library-ice avgDamage não alinhado ao Canary");
must(ctx.GAMEDATA.hunts["marapur-nagas"].avgDamage === 468, "marapur avgDamage ainda subestimado");

console.log("OK: faixas Canary library/soulwar/cobra/amazon/naga e médias de hunt alinhadas.");
