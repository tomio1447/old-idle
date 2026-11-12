/* alpha-announce.js — aviso pré-login + banner in-game (alpha test).
 * Edite ALPHA_ANNOUNCE_UPDATES abaixo para listar mudanças recentes. */
"use strict";

const ALPHA_DISCORD_URL = "https://discord.gg/bnbh3jtvBf";
const ALPHA_INSTAGRAM_URL = "https://www.instagram.com/global_idle_ot";

/** Data e hora (Brasília) da atualização descrita nos patch notes. */
const ALPHA_UPDATE_AT = "11/11/2026 às 22:50";

/** Lista editável de updates recentes (bullets do modal pré-login). */
const ALPHA_ANNOUNCE_UPDATES = [
  "NOVO — World Boss BAKRAGORE: lobby de até 5 jogadores (nível 600+) no catálogo de World Bosses",
  "NOVO — Bakragore's Burden: no lobby, cada jogador adiciona suas Taints de Murcion, Vemiath, Chagorz e Ichgahal — cada taint invoca +1 Elder Bloodjaw e aumenta o HP do boss em 5%",
  "NOVO — Derrotar Bakragore conclui a Blood Rotten Quest (agora em World Quests) e libera a recompensa 1x por personagem: Figurine of Bakragore + Bag You Covet",
  "NOVO — Modal de bosses reordenado por nível: EM BREVE no topo e Bloodrotten por último",
  "NOVO — Bloodrotten completa: Murcion, Vemiath, Chagorz e Ichgahal com arenas, echoes e Pillars of Dark Energy",
  "NOVO — 4 bosses Archfoe no Lion Sanctum: Katex Blood Tongue, Srezz Yellow Eyes, Utua Stone Sting e Yirkas Blue Scales (BOSSES 1–250)",
  "FIX — Buraco nas paredes: sprites de chão 'fake 2×2' recortadas (Lion Sanctum, Grimvale, Brainstealer)",
  "FIX — Annihilator: grupo teleporta para a entrada ao disparar a alavanca; líder também caminha ao SQM de preparo",
  "NOVO — Login, patch notes, seleção de personagens e loading agora seguem a estética da cidade",
  "Preços oficiais de NPC em 34 itens novos/existentes (creature products, Spellweaver's Robe, Warrior's Axe, Ring of Green Plasma)",
  "NOVO — Guilds: crie ou entre numa guild, tasks diárias, loja de bônus, chat e ranking",
  "NOVO — Daily Boost: Monstro do Dia (+EXP) e Boss do Dia (+loot) sorteados a cada server save",
  "NOVO — Party automática: seus 4 personagens já formam PT — arraste na seleção para escolher o líder",
  "NOVO — Perfil do personagem: clique num nome e veja skills, equipamento e a PT",
  "NOVO — Missão Lizards Town: mate 50 de cada lagarto e ganhe set Zaoan + EXP para a party",
  "NOVO — Market pelo botão direito: 'Mostrar no market' em qualquer item",
  "Loot Pouch infinita + autoseller por tempo (5 min VIP / 15 min free) e SELL ALL na cidade/treino",
  "Topbar: SERVER TIME e SERVER SAVE IN no horário de Brasília",
  "NOVO — Proficiência de Armas: ganhe XP por kill, 1 perk por nível e confirme com OK",
  "Perks oficiais por arma e vocação: mana/life on kill, penetração, leech, augments de spell",
  "NOVO — Roda do Destino: arte oficial do cliente, scroll na roda, botão MAX e sequência de perks",
  "Helper: aba Área mostra só magias multi-alvo; runas ficam na aba Runas",
  "Helper: badges mostram o motivo do bloqueio de cada slot (mana, cooldown, alvos)",
  "BETA OFICIAL — obrigado a todos que testaram o alpha!",
  "Server Save diário às 00h (Brasília): reinício aplica atualizações pendentes",
  "Recompensa diária: +3.000 cargas de Lasting Exercise (colete no login — não acumula)",
  "Treino: configure skill e modalidade de qualquer personagem, sem trocar",
  "Contador de cargas Lasting nos ícones de skill e no painel TREINO",
  "Loading screen corrigida: só criaturas caçáveis (hunts, bosses, world bosses)",
  "Templo multiplayer: veja outros jogadores na cidade, convide com clique",
  "STORE: compre Tibia Coins (Pix ou cartão), VIP e venda coins",
  "Feast of Souls: bosses The Dread Maiden, Fear Feaster, Unwelcome e Pale Worm",
  "Soul War: Ebb and Flow, Rotten Wasteland, Claustrophobic Inferno",
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
  const at = document.getElementById("alpha-announce-update-at");
  if (at) at.textContent = `🕐 Atualizado em ${ALPHA_UPDATE_AT} (horário de Brasília)`;
  renderAlphaAnnounceUpdates(document.getElementById("alpha-announce-updates"));
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  return true;
}

function openSocialAnnounceModal() {
  const modal = document.getElementById("social-announce-modal");
  if (!modal) return false;
  const link = document.getElementById("alpha-announce-discord");
  if (link) {
    link.href = ALPHA_DISCORD_URL;
    link.textContent = ALPHA_DISCORD_URL;
  }
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  return true;
}

function closeSocialAnnounceModal() {
  const el = document.getElementById("social-announce-modal");
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

function bindAlphaAnnounceModal() {
  const modal = document.getElementById("alpha-announce-modal");
  if (!modal || modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";
  const ok = document.getElementById("alpha-announce-ok");
  // o segundo modal (redes sociais) abre logo após fechar o de patch notes
  if (ok) ok.addEventListener("click", () => {
    closeAlphaAnnounceModal();
    openSocialAnnounceModal();
  });
  const socialOk = document.getElementById("social-announce-ok");
  if (socialOk) socialOk.addEventListener("click", () => closeSocialAnnounceModal());
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
