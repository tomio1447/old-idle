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
  ["hell-demonosaur", "demon-in-a-red-box"],
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

if (typeof module !== "undefined" && module.exports) module.exports = COSMETIC_NPC_RECIPES;
