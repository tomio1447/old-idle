"use strict";

const COSMETIC_NPC_RECIPES = [
  ["alpha-demonosaur", "demon-in-a-golden-box"],
  ["battlefrazzle", "marinated-sturgeon"],
  ["black-sheep", "reins"],
  ["crystal-wolf", "diapason"],
  ["donkey", "bag-of-apple-slices"],
  ["dragonling", "decorative-ribbon", "music-box"],
  ["draptor", "harness", "music-box"],
  ["dromedary", "fist-on-a-stick"],
  ["fleeting-knowledge", "library-ticket"],
  ["foxmouse", "toy-ball"],
  ["giant-beaver", "colourful-water-lily"],
  ["gloothomotive", "wind-up-key"],
  ["gnarlhound", "golem-wrench"],
  ["gryphon", "the-regalia-of-suon"],
  ["haze", "spectral-scrap-of-cloth"],
  ["hibernal-moth", "purple-tendril-lantern"],
  ["ironblight", "iron-loadstone", "music-box"],
  ["jaracal", "skewered-fish"],
  ["kingly-deer", "golden-fir-cone", "music-box"],
  ["lacewing-moth", "turquoise-tendril-lantern"],
  ["lady-bug", "four-leaf-clover"],
  ["magma-crawler", "glow-wine", "music-box"],
  ["manta-ray", "foxtail"],
  ["midnight-panther", "leather-whip", "music-box"],
  ["mole", "candle-stump"],
  ["neon-sparkid", "crackling-egg"],
  ["noble-lion", "the-lion-s-heart"],
  ["pegasus", "pegasus-feather"],
  ["primal-demonosaur", "demon-in-a-green-box"],
  ["racing-bird", "carrot-on-a-stick"],
  ["radiant-nimbus", "cloud-in-a-bottle"],
  ["rapid-boar", "hunting-horn"],
  ["reliable-ram", "bunch-of-turnips"],
  ["scorpion-king", "scorpion-sceptre"],
  ["shellodon", "eldritch-crystal"],
  ["shock-head", "nightmare-horn"],
  ["sparkion", "vibrant-egg"],
  ["stone-rhino", "astral-shaper-rune"],
  ["tamed-panda", "bamboo-leaves", "music-box"],
  ["tiger-slug", "slug-drug"],
  ["tin-lizzard", "tin-key"],
  ["titanica", "giant-shrimp"],
  ["undead-cavebear", "maxilla-maximus"],
  ["uniwheel", "golden-can-of-oil"],
  ["ursagrodon", "melting-horn"],
  ["vortexion", "menacing-egg"],
  ["walker", "control-unit"],
  ["war-bear", "slingshot"],
  ["war-horse", "sugar-oat", "music-box"],
  ["water-buffalo", "leech"],
  ["white-lion", "red-silk-flower"],
  ["widow-queen", "sweet-smelling-bait", "music-box"],
].map(([id, ...items]) => ({
  id: "mount:" + id, npc: "lothar", kind: "mount", target: id,
  alternatives: items.map((slug) => [{ slug, count: 1 }]),
  catalyst: id === "gryphon" ? "gryphon-mask" : null,
}));

COSMETIC_NPC_RECIPES.push(
  { id: "mount:phantasmal-jade", npc: "lothar", kind: "mount", target: "phantasmal-jade", alternatives: [[
    { slug: "spectral-horseshoe", count: 4 }, { slug: "spectral-horse-tack", count: 1 }, { slug: "spectral-saddle", count: 1 },
  ]] },
  { id: "mount:singeing-steed", npc: "lothar", kind: "mount", target: "singeing-steed", alternatives: [[{ slug: "fiery-horseshoe", count: 4 }]] },
  { id: "mount:spirit-of-purity", npc: "lothar", kind: "mount", target: "spirit-of-purity", alternatives: [[{ slug: "spiritual-horseshoe", count: 4 }]] },
  { id: "mount:the-hellgrip", npc: "lothar", kind: "mount", target: "the-hellgrip", alternatives: [[{ slug: "nail-case", count: 5 }]] },
  { id: "mount:gloom-maw", npc: "lothar", kind: "mount", target: "gloom-maw", requirement: "vladrukh", label: "Derrotar Vladrukh" },
  { id: "mount:landsailer", npc: "lothar", kind: "mount", target: "landsailer", requirement: "tutorial", label: "Completar o tutorial" },
  { id: "mount:mutated-abomination", npc: "lothar", kind: "mount", target: "mutated-abomination", requirement: "doctor-marrow", label: "Derrotar Doctor Marrow" },
  { id: "mount:noxious-ripptor", npc: "lothar", kind: "mount", target: "noxious-ripptor", requirement: "hazard-6", label: "Atingir Hazard 6 (em breve)" },
  { id: "addon:citizen:1", npc: "addoner", kind: "addon", target: "citizen", addon: 1, alternatives: [[{ slug: "minotaur-leather", count: 100 }]] },
  { id: "addon:citizen:2", npc: "addoner", kind: "addon", target: "citizen", addon: 2, alternatives: [[
    { slug: "chicken-feather", count: 100 }, { slug: "honeycomb", count: 50 }, { slug: "legion-helmet", count: 1 },
  ]] },
);

for (const [target, addon, costs] of [
  ["assassin", 2, [["behemoth-claw", 1], ["nose-ring", 1]]],
  ["beggar", 0, [["brown-piece-of-cloth", 20], ["minotaur-leather", 50], ["bat-wing", 10], ["heaven-blossom", 30]]],
  ["hunter", 2, [["sniper-gloves", 1]]],
  ["hunter", 1, [["elane-s-crossbow", 1], ["lizard-leather", 100], ["red-dragon-leather", 100], ["enchanted-chicken-wing", 5], ["royal-steel", 1], ["draconian-steel", 1], ["hell-steel", 1]]],
  ["knight", 2, [["perfect-behemoth-fang", 100], ["damaged-helmet", 1], ["warrior-s-sweat", 1], ["royal-steel", 1]]],
  ["norseman", 1, [["frostheart-shard", 5]]],
  ["norseman", 2, [["frostheart-shard", 10]]],
  ["warrior", 1, [["hardened-bone", 100], ["turtle-shell", 100], ["fighting-spirit", 1], ["dragon-claw", 1]]],
  ["wizard", 1, [["medusa-shield", 1], ["dragon-scale-mail", 1], ["crown-legs", 1], ["ring-of-the-sky", 1]]],
  ["wizard", 2, [["holy-orchid", 50]]],
  ["pirate", 1, [["eye-patch", 100], ["peg-leg", 100], ["pirate-hook", 100]]],
  ["oriental", 1, [["mermaid-comb", 1]]],
  ["oriental", 2, [["ape-fur", 100], ["fish-fin", 100], ["enchanted-chicken-wing", 2], ["blue-piece-of-cloth", 100]]],
  ["shaman", 1, [["mandrake", 1], ["voodoo-doll", 5]]],
  ["shaman", 2, [["tribal-mask", 5], ["banana-staff", 5]]],
]) {
  COSMETIC_NPC_RECIPES.push({ id: (addon ? "addon:" : "outfit:") + target + ":" + addon,
    npc: "addoner", kind: addon ? "addon" : "outfit", target, addon,
    alternatives: [costs.map(([slug, count]) => ({ slug, count }))] });
}

for (const [target, items] of [
  ["soil-guardian", ["gnomish-voucher-type-mb", "gnomish-voucher-type-ma1", "gnomish-voucher-type-ma2"]],
  ["crystal-warlord", ["gnomish-voucher-type-cb", "gnomish-voucher-type-ca1", "gnomish-voucher-type-ca2"]],
  ["makeshift-warrior", ["plan-for-a-makeshift-armour", "crude-wood-planks", "tinged-pot"]],
  ["fiend-slayer", ["arbaziloth-shoulder-piece", "demon-claws", "demon-skull"]],
  ["hand-of-the-inquisition", [null, "final-judgement", "shadow-cowl"]],
  ["poltergeist", [null, "spooky-hood", "ghost-claw"]],
  ["revenant", [null, "the-skull-of-a-beast", "bracelet-of-strengthening"]],
  ["rascoohan", [null, "soap", "scrubbing-brush"]],
  ["fire-fighter", [null, "firefighting-axe", "portable-flame"]],
]) {
  items.forEach((slug, addon) => {
    if (!slug) return;
    COSMETIC_NPC_RECIPES.push({ id: (addon ? "addon:" : "outfit:") + target + ":" + addon,
      npc: "addoner", kind: addon ? "addon" : "outfit", target, addon, requireBase: !!addon && !!items[0],
      alternatives: [[{ slug, count: 1 }]] });
  });
}
COSMETIC_NPC_RECIPES.push(
  { id: "outfit:afflicted:0", npc: "addoner", kind: "outfit", target: "afflicted", alternatives: [[
    ...["ominous", "dubious", "voluminous", "obvious", "ludicrous", "luminous"].map((name) => ({ slug: name + "-piece-of-cloth", count: 1 })),
  ]] },
  { id: "addon:afflicted:1", npc: "addoner", kind: "addon", target: "afflicted", addon: 1, requireBase: true, alternatives: [[{ slug: "plague-bell", count: 1 }]] },
  { id: "addon:afflicted:2", npc: "addoner", kind: "addon", target: "afflicted", addon: 2, requireBase: true, alternatives: [[{ slug: "plague-mask", count: 1 }]] },
  { id: "addon:mage:1", npc: "addoner", kind: "addon", target: "mage", addon: 1, requireBase: true, alternatives: [[{ slug: "soul-stone", count: 1 }]] },
  { id: "addon:mage:2", npc: "addoner", kind: "addon", target: "mage", addon: 2, requireBase: true, alternatives: [[{ slug: "ferumbras-hat", count: 1 }]] },
);

for (const [target, addon, costs] of [
  ["barbarian", 1, [["iron-ore", 100], ["huge-chunk-of-crude-iron", 1], ["perfect-behemoth-fang", 50], ["lizard-leather", 50]]],
  ["barbarian", 2, [["spirit-container", 1], ["green-piece-of-cloth", 50], ["red-piece-of-cloth", 50], ["spool-of-yarn", 10], ["flask-of-warrior-s-sweat", 1]]],
  ["knight", 1, [["iron-ore", 100], ["huge-chunk-of-crude-iron", 1]]],
  ["warrior", 2, [["piece-of-royal-steel", 1], ["iron-ore", 100]]],
  ["druid", 1, [["bear-paw", 50], ["wolf-paw", 50]]],
  ["assassin", 1, [["blue-piece-of-cloth", 50], ["green-piece-of-cloth", 50], ["red-piece-of-cloth", 50], ["brown-piece-of-cloth", 50], ["yellow-piece-of-cloth", 50], ["white-piece-of-cloth", 50], ["spool-of-yarn", 10]]],
  ["pirate", 2, [["brutus-bloodbeard-s-hat", 1], ["lethal-lissy-s-shirt", 1], ["ron-the-ripper-s-sabre", 1], ["deadeye-devious-eye-patch", 1]]],
  ["wayfarer", 1, [["old-cape", 1]]],
  ["wayfarer", 2, [["sedge-hat", 1]]],
  ["warmaster", 1, [["serpent-crest", 1]]],
  ["warmaster", 2, [["tribal-crest", 1]]],
  ["dream-warden", 1, [["dream-warden-mask", 1]]],
  ["dream-warden", 2, [["dream-warden-claw", 1]]],
  ["rift-warrior", 1, [["silver-token", 100]]],
  ["rift-warrior", 2, [["silver-token", 100]]],
  ["royal-costume", 0, [["silver-token", 15000], ["gold-token", 12500]]],
  ["royal-costume", 1, [["silver-token", 7500], ["gold-token", 6250]]],
  ["royal-costume", 2, [["silver-token", 7500], ["gold-token", 6250]]],
]) {
  COSMETIC_NPC_RECIPES.push({ id: (addon ? "addon:" : "outfit:") + target + ":" + addon,
    npc: "addoner", kind: addon ? "addon" : "outfit", target, addon,
    alternatives: [costs.map(([slug, count]) => ({ slug, count }))] });
}
const COSMETIC_ITEM_ALIASES = {
  "royal-steel": "piece-of-royal-steel", "hell-steel": "piece-of-hell-steel", "draconian-steel": "piece-of-draconian-steel",
  "warrior-s-sweat": "flask-of-warrior-s-sweat", "fighting-spirit": "spirit-container", "pirate-hook": "hook",
};
for (const recipe of COSMETIC_NPC_RECIPES) for (const costs of recipe.alternatives || []) for (const cost of costs)
  cost.slug = COSMETIC_ITEM_ALIASES[cost.slug] || cost.slug;

/* Itens de troca do Lothar/Addoner sem definição no catálogo base.
 * cids oficiais do appearances.dat 15.x (ver tools/render_lothar_items.py);
 * sem comprador NPC -> sell/npcSell 0. */
const COSMETIC_ITEM_DEFS = {
  "ape-fur":                           { n: "ape fur", s: null, t: "loot", cid: 5883, w: 1.2, sell: 0, npcSell: 0 },
  "astral-shaper-rune":                { n: "astral shaper rune", s: null, t: "loot", cid: 24960, w: 8.5, sell: 0, npcSell: 0 },
  "brutus-bloodbeard-s-hat":           { n: "brutus bloodbeard's hat", s: null, t: "loot", cid: 6099, w: 12.5, sell: 0, npcSell: 0 },
  "bunch-of-turnips":                  { n: "bunch of turnips", s: null, t: "loot", cid: 53073, w: 0, sell: 0, npcSell: 0 },
  "candle-stump":                      { n: "candle stump", s: null, t: "loot", cid: 27605, w: 8.5, sell: 0, npcSell: 0 },
  "carrot-on-a-stick":                 { n: "carrot on a stick", s: null, t: "loot", cid: 12311, w: 2, sell: 0, npcSell: 0 },
  "chicken-feather":                   { n: "chicken feather", s: null, t: "loot", cid: 5890, w: 0.1, sell: 0, npcSell: 0 },
  "colourful-water-lily":              { n: "colourful water lily", s: null, t: "loot", cid: 39548, w: 1, sell: 0, npcSell: 0 },
  "control-unit":                      { n: "control unit", s: null, t: "loot", cid: 21186, w: 0, sell: 0, npcSell: 0 },
  "crackling-egg":                     { n: "crackling egg", s: null, t: "loot", cid: 23684, w: 8.5, sell: 0, npcSell: 0 },
  "crude-wood-planks":                 { n: "crude wood planks", s: null, t: "loot", cid: 27657, w: 2, sell: 0, npcSell: 0 },
  "deadeye-devious-eye-patch":         { n: "deadeye devious' eye patch", s: null, t: "loot", cid: 6102, w: 1.5, sell: 0, npcSell: 0 },
  "decorative-ribbon":                 { n: "decorative ribbon", s: null, t: "loot", cid: 16155, w: 2, sell: 0, npcSell: 0 },
  "demon-in-a-golden-box":             { n: "demon in a golden box", s: null, t: "loot", cid: 50063, w: 0, sell: 0, npcSell: 0 },
  "diapason":                          { n: "diapason", s: null, t: "loot", cid: 12547, w: 2, sell: 0, npcSell: 0 },
  "dragon-claw":                       { n: "dragon claw", s: null, t: "loot", cid: 5919, w: 12.5, sell: 0, npcSell: 0 },
  "dream-warden-claw":                 { n: "dream warden claw", s: null, t: "loot", cid: 20275, w: 31, sell: 0, npcSell: 0 },
  "dream-warden-mask":                 { n: "dream warden mask", s: null, t: "loot", cid: 20276, w: 34, sell: 0, npcSell: 0 },
  "dubious-piece-of-cloth":            { n: "dubious piece of cloth", s: null, t: "loot", cid: 12552, w: 5, sell: 0, npcSell: 0 },
  "elane-s-crossbow":                  { n: "elane's crossbow", s: null, t: "loot", cid: 5947, w: 40, sell: 0, npcSell: 0 },
  "enchanted-chicken-wing":            { n: "enchanted chicken wing", s: null, t: "loot", cid: 5891, w: 10, sell: 0, npcSell: 0 },
  "fiery-horseshoe":                   { n: "fiery horseshoe", s: null, t: "loot", cid: 36938, w: 1.2, sell: 0, npcSell: 0 },
  "final-judgement":                   { n: "final judgement", s: null, t: "loot", cid: 31738, w: 3.7, sell: 0, npcSell: 0 },
  "flask-of-warrior-s-sweat":          { n: "flask of warrior's sweat", s: null, t: "loot", cid: 5885, w: 3, sell: 0, npcSell: 0 },
  "four-leaf-clover":                  { n: "four-leaf clover", s: null, t: "loot", cid: 14143, w: 2, sell: 0, npcSell: 0 },
  /* frostheart-shard/mermaid-comb são itens custom das receitas de addon
   * (não existem no client 15.x): nome próprio + sprite emprestada de
   * ice shard (54128) e coral comb (5945). */
  "frostheart-shard":                  { n: "frostheart shard", s: null, t: "loot", cid: 54128, w: 4, sell: 0, npcSell: 0 },
  "gnomish-voucher-type-ca1":          { n: "gnomish voucher type ca1", s: null, t: "loot", cid: 16256, w: 0.8, sell: 0, npcSell: 0 },
  "gnomish-voucher-type-ca2":          { n: "gnomish voucher type ca2", s: null, t: "loot", cid: 16257, w: 0.8, sell: 0, npcSell: 0 },
  "gnomish-voucher-type-cb":           { n: "gnomish voucher type cb", s: null, t: "loot", cid: 16255, w: 0.8, sell: 0, npcSell: 0 },
  "gnomish-voucher-type-ma1":          { n: "gnomish voucher type ma1", s: null, t: "loot", cid: 16253, w: 0.8, sell: 0, npcSell: 0 },
  "gnomish-voucher-type-ma2":          { n: "gnomish voucher type ma2", s: null, t: "loot", cid: 16254, w: 0.8, sell: 0, npcSell: 0 },
  "gnomish-voucher-type-mb":           { n: "gnomish voucher type mb", s: null, t: "loot", cid: 16252, w: 0.8, sell: 0, npcSell: 0 },
  "golden-can-of-oil":                 { n: "golden can of oil", s: null, t: "loot", cid: 12801, w: 2, sell: 0, npcSell: 0 },
  "golden-fir-cone":                   { n: "golden fir cone", s: null, t: "loot", cid: 12550, w: 2, sell: 0, npcSell: 0 },
  "golem-wrench":                      { n: "golem wrench", s: null, t: "loot", cid: 16251, w: 0, sell: 0, npcSell: 0 },
  "gryphon-mask":                      { n: "gryphon mask", s: null, t: "loot", cid: 31369, w: 20, sell: 0, npcSell: 0 },
  "hunting-horn":                      { n: "hunting horn", s: null, t: "loot", cid: 12260, w: 0, sell: 0, npcSell: 0 },
  "leather-whip":                      { n: "leather whip", s: null, t: "loot", cid: 12306, w: 2, sell: 0, npcSell: 0 },
  "leech":                             { n: "leech", s: null, t: "loot", cid: 17858, w: 2, sell: 0, npcSell: 0 },
  "lethal-lissy-s-shirt":              { n: "the lethal lissy's shirt", s: null, t: "loot", cid: 6100, w: 20, sell: 0, npcSell: 0 },
  "library-ticket":                    { n: "library ticket", s: null, t: "loot", cid: 28791, w: 8.5, sell: 0, npcSell: 0 },
  "ludicrous-piece-of-cloth":          { n: "ludicrous piece of cloth", s: null, t: "loot", cid: 12555, w: 5, sell: 0, npcSell: 0 },
  "luminous-piece-of-cloth":           { n: "luminous piece of cloth", s: null, t: "loot", cid: 12556, w: 5, sell: 0, npcSell: 0 },
  "mandrake":                          { n: "mandrake", s: null, t: "loot", cid: 5014, w: 1.8, sell: 0, npcSell: 0 },
  "melting-horn":                      { n: "melting horn", s: null, t: "loot", cid: 20355, w: 0, sell: 0, npcSell: 0 },
  "menacing-egg":                      { n: "menacing egg", s: null, t: "loot", cid: 23685, w: 8.5, sell: 0, npcSell: 0 },
  "mermaid-comb":                      { n: "mermaid comb", s: null, t: "loot", cid: 5945, w: 4.5, sell: 0, npcSell: 0 },
  "music-box":                         { n: "music box", s: null, t: "loot", cid: 23677, w: 2, sell: 0, npcSell: 0 },
  "nail-case":                         { n: "nail case", s: null, t: "loot", cid: 19136, w: 2, sell: 0, npcSell: 0 },
  "nightmare-horn":                    { n: "nightmare horn", s: null, t: "loot", cid: 20274, w: 2, sell: 0, npcSell: 0 },
  "nose-ring":                         { n: "nose ring", s: null, t: "loot", cid: 5804, w: 5, sell: 0, npcSell: 0 },
  "obvious-piece-of-cloth":            { n: "obvious piece of cloth", s: null, t: "loot", cid: 12554, w: 5, sell: 0, npcSell: 0 },
  "ominous-piece-of-cloth":            { n: "ominous piece of cloth", s: null, t: "loot", cid: 12551, w: 5, sell: 0, npcSell: 0 },
  "pegasus-feather":                   { n: "pegasus feather", s: null, t: "loot", cid: 48424, w: 1, sell: 0, npcSell: 0 },
  "plague-bell":                       { n: "plague bell", s: null, t: "loot", cid: 12787, w: 1.2, sell: 0, npcSell: 0 },
  "plague-mask":                       { n: "plague mask", s: null, t: "loot", cid: 12786, w: 0.7, sell: 0, npcSell: 0 },
  "plan-for-a-makeshift-armour":       { n: "plan for a makeshift armour", s: null, t: "loot", cid: 27655, w: 2, sell: 0, npcSell: 0 },
  "reins":                             { n: "reins", s: null, t: "loot", cid: 12308, w: 2, sell: 0, npcSell: 0 },
  "scorpion-sceptre":                  { n: "scorpion sceptre", s: null, t: "loot", cid: 12509, w: 0, sell: 0, npcSell: 0 },
  "serpent-crest":                     { n: "serpent crest", s: null, t: "loot", cid: 10199, w: 5, sell: 0, npcSell: 0 },
  "shadow-cowl":                       { n: "shadow cowl", s: null, t: "loot", cid: 31737, w: 0, sell: 0, npcSell: 0 },
  "skewered-fish":                     { n: "skewered fish", s: null, t: "loot", cid: 54638, w: 0, sell: 0, npcSell: 0 },
  "slingshot":                         { n: "slingshot", s: null, t: "loot", cid: 5907, w: 2, sell: 0, npcSell: 0 },
  "slug-drug":                         { n: "slug drug", s: null, t: "loot", cid: 12519, w: 2, sell: 0, npcSell: 0 },
  "sniper-gloves":                     { n: "sniper gloves", s: null, t: "loot", cid: 5875, w: 4, sell: 0, npcSell: 0 },
  "spirit-container":                  { n: "spirit container", s: null, t: "loot", cid: 5884, w: 6, sell: 0, npcSell: 0 },
  "spool-of-yarn":                     { n: "spool of yarn", s: null, t: "loot", cid: 5886, w: 1, sell: 0, npcSell: 0 },
  "sugar-oat":                         { n: "sugar oat", s: null, t: "loot", cid: 12802, w: 2, sell: 0, npcSell: 0 },
  "the-lion-s-heart":                  { n: "the lion's heart", s: null, t: "loot", cid: 21439, w: 2, sell: 0, npcSell: 0 },
  "the-regalia-of-suon":               { n: "the regalia of suon", s: null, t: "loot", cid: 31576, w: 8.5, sell: 0, npcSell: 0 },
  "tin-key":                           { n: "tin key", s: null, t: "loot", cid: 12305, w: 2, sell: 0, npcSell: 0 },
  "tinged-pot":                        { n: "tinged pot", s: null, t: "loot", cid: 27656, w: 35, sell: 0, npcSell: 0 },
  "toy-ball":                          { n: "toy ball", s: null, t: "loot", cid: 43901, w: 1, sell: 0, npcSell: 0 },
  "tribal-crest":                      { n: "tribal crest", s: null, t: "loot", cid: 10198, w: 5, sell: 0, npcSell: 0 },
  "vibrant-egg":                       { n: "vibrant egg", s: null, t: "loot", cid: 23538, w: 8.5, sell: 0, npcSell: 0 },
  "voluminous-piece-of-cloth":         { n: "voluminous piece of cloth", s: null, t: "loot", cid: 12553, w: 5, sell: 0, npcSell: 0 },
  "wind-up-key":                       { n: "wind-up key", s: null, t: "loot", cid: 37397, w: 2, sell: 0, npcSell: 0 },
};

if (typeof GAMEDATA !== "undefined") {
  const reg = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in COSMETIC_ITEM_DEFS) if (!reg[slug]) reg[slug] = COSMETIC_ITEM_DEFS[slug];
}

/* Mapa derivado: slug de custo → receitas cosméticas que o consomem (inclui
 * catalyst, marcado). Alimenta a moldura do item (verde addon / azul
 * montaria via itemClsBorder) e a linha de descrição no tooltip (itemTip) —
 * ambos consultam cosmeticItemUse(). */
const COSMETIC_ITEM_USES = {};
for (const _recipe of COSMETIC_NPC_RECIPES) {
  for (const _alt of (_recipe.alternatives || [])) for (const _cost of _alt) {
    (COSMETIC_ITEM_USES[_cost.slug] = COSMETIC_ITEM_USES[_cost.slug] || []).push(_recipe);
  }
  if (_recipe.catalyst)
    (COSMETIC_ITEM_USES[_recipe.catalyst] = COSMETIC_ITEM_USES[_recipe.catalyst] || [])
      .push(Object.assign({}, _recipe, { catalystUse: true }));
}

if (typeof module !== "undefined" && module.exports) { module.exports = COSMETIC_NPC_RECIPES; module.exports.ITEM_DEFS = COSMETIC_ITEM_DEFS; module.exports.ITEM_USES = COSMETIC_ITEM_USES; }
