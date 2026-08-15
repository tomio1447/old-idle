/* Auditoria Monk: magias wiki/15.25 + ícones OTC. */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const ROOT = path.join(__dirname, "..");
const OTC = path.join(ROOT, "game", "assets", "spell", "otc");
const INDEX = fs.readFileSync(path.join(ROOT, "game", "index.html"), "utf8");

const MONK_CORE = [
  "exori-infir-pug", "exori-pug", "exori-infir-amp-pug", "exori-amp-pug",
  "exori-mas-pug", "exori-med-pug", "exori-gran-mas-pug", "exori-gran-pug",
  "exori-mas-amp-pug", "exori-infir-nia", "exori-nia", "exori-mas-nia",
  "exori-gran-nia", "exori-gran-mas-nia", "exura-mas-nia", "exura-gran-tio",
  "exura-tio-sio", "utevo-nia", "utamo-tio", "exori-mas-res", "uteta-res-tio",
  "utevo-mas-sio", "utito-virtu", "utori-virtu", "utura-tio", "utevo-gran-res-tio",
];

for (const id of MONK_CORE) {
  const s = engine.ALL_SPELLS[id];
  must(s, "spell ausente em ALL_SPELLS: " + id);
  must(s.vocs && s.vocs.includes("monk"), id + " sem voc monk");
  must(s.icon != null, id + " sem icon");
  const iconPath = path.join(OTC, s.icon + ".png");
  must(fs.existsSync(iconPath), id + " icon file missing: " + iconPath);
}

const lesser = engine.ALL_SPELLS["exori-infir-amp-pug"];
must(lesser.words === "exori infir amp pug", "words lesser mystic");
must(lesser.lvl === 6 && lesser.mana === 30 && lesser.cd === 20000, "stats lesser mystic");
must(lesser.range === 7 && lesser.icon === 207, "range/icon lesser mystic");
must(lesser.monkPow === 25 || (engine.MONKSPELLDATA &&
  engine.MONKSPELLDATA["exori-infir-amp-pug"] &&
  engine.MONKSPELLDATA["exori-infir-amp-pug"].pow === 25), "pow lesser mystic");
must(engine.SPELL_TARGET["exori-infir-amp-pug"] &&
  engine.SPELL_TARGET["exori-infir-amp-pug"].range === 7,
  "SPELL_TARGET lesser mystic");

must(!engine.ALL_SPELLS["uteta-tio"], "Mentor Other deve permanecer removido");

const md = engine.MONKSPELLDATA || {};
must(md["exori-infir-amp-pug"] && md["exori-infir-amp-pug"].monk === "builder",
  "MD lesser builder");
must(md["exori-infir-nia"] && md["exori-infir-nia"].mana === 18, "Tiger Clash mana 18");
must(md["exori-mas-nia"] && md["exori-mas-nia"].mana === 195, "Sweeping mana 195");
must(md["exura-mas-nia"] && !md["exura-mas-nia"].monk && md["exura-mas-nia"].mana === 400,
  "Mass Spirit Mend nao-spender mana 400");

must(/spelldata_1525\.js\?v=monk-lesser-repulse-v1/.test(INDEX),
  "cache-bust spelldata_1525");
must(/monk\.js\?v=monk-lesser-repulse-v1/.test(INDEX),
  "cache-bust monk.js");

console.log("ok monk spells + icons");
