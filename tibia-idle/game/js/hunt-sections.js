/* hunt-sections.js — catálogo de hunts exibidas no modal HUNTS.
 * Compartilhado com o servidor (guild tasks sorteiam monstros das mesmas
 * hunts visíveis): carregar antes de ui.js. */
"use strict";
window.HUNT_MODAL_SECTIONS = [
  { title: "HUNTS 1–50", ids: ["grimvale-1st-floor", "rats", "rotworm-darashia", "amazon-camp", "elf-yalahar", "salamander-cave", "meriana-island", "carniphilas-ph"] },
  { title: "HUNTS 50–100", ids: ["grimvale-2nd-floor", "lions-rock-darashia", "stonerefiner", "cave-cave-edron", "ankrahmun-tombs", "mutateds-yalahar", "lizardstown", "feyrist-nightmare", "cemetery-yalahar", "cults-yalahar", "bog-yalahar", "dl-darashia", "wyrm-lb"] },
  { title: "HUNTS 100–250", ids: ["the-void", "exotic-cave", "pirat-lower", "lizard-chosen-tower", "ghastly-dragons", "draken-walls", "drakens-castle", "elder-wyrm-darashia", "minotaur-oramond-east", "deeplings-deeper", "hyaena-lairs", "medusa-tower-ph", "glooth-cave", "buster-darashia", "banuta-deeper", "book-world"] },
  { title: "HUNTS 250+", ids: ["lion-sanctum", "mota-extension", "cobra-bastion", "marapur-nagas", "buried-cathedral", "ingol-terrain", "roshamuul", "prison-1", "prison-2", "prison-3", "catacombs-oramond", "deathlings-sunken-temple", "falcon-bastion", "asura-palace", "ferumbras-way", "dt-seal", "juggerseal"] },
  { title: "HUNTS 400+", ids: ["azzilon-castle", "bashmuul-issavi", "braingrounds-venore", "true-asuras", "moonstone-castle", "norcferatus-fortress", "unhallowed-crypt", "stag-bastion", "arean-outskirts", "warzone-9", "nimmersatt-breeding-ground", "podzilla-bottom"] },
  { title: "LIBRARY SESSION 400+", ids: ["library-fire", "library-energy", "library-ice", "library-earth"] },
  { title: "SOULWAR 400+", ids: ["dark-thais", "rotten-wasteland", "claustrophobic-inferno", "ebb-and-flow", "furious-crate"] },
  { title: "GNOMPRONA 400+", ids: ["gnomprona-weagon1", "gnomprona-weagon2", "gnomprona-weagon3"] },
  { title: "BLOOD ROTTEN 600+", ids: ["jade-roots", "putrefactory", "darklight-core", "gloom-pillars"] },
  { title: "HUNTS 800+", ids: ["radiant-skyhold"] },
];
