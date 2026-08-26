/* alpha-announce.js — aviso pré-login + banner in-game (alpha test).
 * Edite ALPHA_ANNOUNCE_UPDATES abaixo para listar mudanças recentes. */
"use strict";

const ALPHA_DISCORD_URL = "https://discord.gg/bnbh3jtvBf";

/** Lista editável de updates recentes (bullets do modal pré-login). */
const ALPHA_ANNOUNCE_UPDATES = [
  "Templo multiplayer: veja outros jogadores na cidade, convide com clique",
  "Presets do Helper: salve até 5 configurações e troque rapidamente",
  "Feast of Souls: bosses The Dread Maiden, Fear Feaster, Unwelcome e Pale Worm",
  "Loot Pouch com autoseller (5 min; VIP 2 min) e Sell All ajustado",
  "Chance de drop sempre visível; Naga Katar (0.2%) e Cobra BO (1%)",
  "Resists de boss com ícones/valores e tooltip de loot com nome + chance",
  "Melee não ataca à distância; modais de hunts/bosses em abas",
  "STORE: compre Tibia Coins (Pix ou cartão), VIP e venda coins (beta)",
  "Soul War: Ebb and Flow, Rotten Wasteland, Claustrophobic Inferno",
  "Bosses Soul War: Greed, Hatred, Spite e Malice",
  "Hunts 1-100: Ankrahmun Tombs e Mutateds Yalahar",
  "Hunts 100-150: Lizard Chosen Tower e Elder Wyrm Darashia",
];

function alphaDiscordLinkHtml(label) {
  const text = label || ALPHA_DISCORD_URL;
  return `<a href="${ALPHA_DISCORD_URL}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function renderAlphaAnnounceUpdates(host) {
  if (!host) return;
  const items = ALPHA_ANNOUNCE_UPDATES.map((line) =>
    `<li>${String(line).replace(/</g, "&lt;")}</li>`
  ).join("");
  host.innerHTML = items ? `<ul class="alpha-announce-list">${items}</ul>` : "";
}

function closeAlphaAnnounceModal() {
  const el = document.getElementById("alpha-announce-modal");
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

function openAlphaAnnounceModal() {
  const modal = document.getElementById("alpha-announce-modal");
  if (!modal) return false;
  const link = document.getElementById("alpha-announce-discord");
  if (link) {
    link.href = ALPHA_DISCORD_URL;
    link.textContent = ALPHA_DISCORD_URL;
  }
  renderAlphaAnnounceUpdates(document.getElementById("alpha-announce-updates"));
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  return true;
}

function bindAlphaAnnounceModal() {
  const modal = document.getElementById("alpha-announce-modal");
  if (!modal || modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";
  const ok = document.getElementById("alpha-announce-ok");
  if (ok) ok.addEventListener("click", () => closeAlphaAnnounceModal());
}

function bindAlphaTestBanner() {
  const banner = document.getElementById("alpha-test-banner");
  if (!banner) return;
  const link = banner.querySelector("a.alpha-discord-link");
  if (link) {
    link.href = ALPHA_DISCORD_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
}

function bootAlphaAnnounce() {
  bindAlphaAnnounceModal();
  bindAlphaTestBanner();
  // Alpha: mostrar em todo page load (anúncio).
  openAlphaAnnounceModal();
}

window.ALPHA_DISCORD_URL = ALPHA_DISCORD_URL;
window.ALPHA_ANNOUNCE_UPDATES = ALPHA_ANNOUNCE_UPDATES;
window.openAlphaAnnounceModal = openAlphaAnnounceModal;
window.closeAlphaAnnounceModal = closeAlphaAnnounceModal;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAlphaAnnounce);
} else {
  bootAlphaAnnounce();
}
