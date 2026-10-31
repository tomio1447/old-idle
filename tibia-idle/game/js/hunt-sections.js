/* hunt-sections.js — catálogo de hunts exibidas no modal HUNTS.
 * Compartilhado com o servidor (guild tasks sorteiam monstros das mesmas
 * hunts visíveis): carregar antes de ui.js. */
"use strict";
window.HUNT_MODAL_SECTIONS = [
  { title: "HUNTS 1–50", ids: ["rats", "amazon-camp", "elf-yalahar", "salamander-cave", "meriana-island"] },
  { title: "HUNTS 50–100", ids: ["stonerefiner", "cave-cave-edron", "ankrahmun-tombs", "mutateds-yalahar", "lizardstown", "feyrist-nightmare", "cemetery-yalahar", "cults-yalahar", "bog-yalahar"] },
  { title: "HUNTS 100–250", ids: ["the-void", "exotic-cave", "pirat-lower", "lizard-chosen-tower", "ghastly-dragons", "draken-walls", "drakens-castle", "elder-wyrm-darashia", "minotaur-oramond-east", "deeplings-deeper"] },
  { title: "HUNTS 250+", ids: ["mota-extension", "cobra-bastion", "marapur-nagas", "buried-cathedral", "ingol-terrain", "roshamuul", "prison-1", "prison-2", "prison-3", "catacombs-oramond", "deathlings-sunken-temple", "falcon-bastion"] },
  { title: "FERUMBRAS ASCENDANT", ids: ["ferumbras-way", "dt-seal", "juggerseal"] },
  { title: "LIBRARY SESSION 400+", ids: ["library-fire", "library-energy", "library-ice", "library-earth"] },
  { title: "SOULWAR 400+", ids: ["dark-thais", "rotten-wasteland", "claustrophobic-inferno", "ebb-and-flow", "furious-crate"] },
];
