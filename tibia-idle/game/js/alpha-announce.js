/* alpha-announce.js — aviso pré-login + banner in-game (alpha test).
 * Edite ALPHA_ANNOUNCE_UPDATES abaixo para listar mudanças recentes. */
"use strict";

const ALPHA_DISCORD_URL = "https://discord.gg/82Z4j9H3UF";
const ALPHA_INSTAGRAM_URL = "https://www.instagram.com/global_idle_ot";

/** Data e hora (Brasília) da atualização descrita nos patch notes. */
const ALPHA_UPDATE_AT = "26/11/2026 às 14:54";

/** Lista editável de updates recentes (bullets do modal pré-login). */
const ALPHA_ANNOUNCE_UPDATES = [
  "FIX — Dança da Scarlett Etzel: toques no timing certo não se perdem mais entre ticks do servidor (morte injusta por 'tecla perdida')",
  "NOVO — WhatsApp como canal de verificação: vincule seu telefone recebendo o código no WhatsApp e use como alternativa ao e-mail no login com 2FA",
  "FIX — Login com 2FA não travava mais em 'Entrando...': a tela de código abre corretamente para senha e login social",
  "NOVO — RMT agora exige verificação 18+: CPF do titular + data de nascimento + consentimento, com saque PIX travado no próprio CPF — vendas de TC só liberam após a verificação",
  "NOVO — E-mail real em produção: confirmação de cadastro, recuperação de senha e códigos de 2FA chegam de suporte@global-idle.com (domínio autenticado) — confira o Lixo Eletrônico no primeiro envio",
  "NOVO — Telas de verificação redesenhadas: código de 6 dígitos em caixas separadas (cole o código inteiro de uma vez), timer de expiração e botão de reenvio com cooldown",
  "NOVO — Recuperar senha com o mesmo visual: OTP de 6 caixas, cooldown de reenvio e feedback de erro animado",
  "FIX — Segurança: login social (Google/Twitch/Discord) agora também exige o 2FA quando ele está ativo na conta — antes o OAuth pulava a verificação",
  "NOVO — Login e 2FA em cards translúcidos sobre o cenário, com os botões sociais dentro do próprio card",
  "NOVO — Proteção anti-abuse de e-mail: 60s entre envios, máx. 6 códigos/dia por conta e cota global diária no servidor",
  "NOVO — Gerenciador de Contas com a estética da cidade e ícones de marca nos cards (Gmail, WhatsApp, Discord, Instagram, autenticador)",
  "NOVO — Topbar redesenhada: botões PERSONAGEM e STORE quadrados 78px com glow dourado no canto superior direito",
  "NOVO — Non-Transferable Tibia Coins (NT TC): saldo separado que só gasta na STORE — não pode ser vendido no Market",
  "NOVO — Cupons de streamer na aba Vouchers da STORE: DRUWELL e buto__pvp dão VIP, montaria exclusiva e NT TC",
  "NOVO — Painel Admin → aba VOUCHERS: veja usos por código e pause/exclua cupons",
  "FIX — Treino não cura mais: ao entrar na área de treino o HP/mana ficam como estavam",
  "NOVO — Modal de Guild redesenhado: diretório em 2 colunas, hero com barra de EXP e badges de cargo",
  "NOVO — Charmes por conta + aba Charms nos Analyzers (procs e bônus por personagem)",
  "NOVO — Wheel of Destiny com novo visual: palco circular com borda dourada, nós com estados claros (verde/ciano) e controles −1/+1/MAX + OK/Reset no painel direito",
  "NOVO — The Order of the Stag Quest (350+): Stag Bastion, Arean Outskirts e Court Warlock — outfit Royal Bounacean Advisor (addons 1+2) e Mariner's Compass (+3 arm no extra slot)",
  "NOVO — The Roost of the Graveborn Quest (450+): 500 kills na Unhallowed Crypt liberam a cadeia de 5 bossrooms; Phylactery rende as 5 Crypt Runes",
  "NOVO — NPC Dragon Ancestor Spirit: troca 1 de cada Crypt Rune por uma arma Crypt aleatória — modal dedicado com roleta",
  "NOVO — Badge \"!\" nas Quests: avisa quando há recompensa de missão pronta a coletar (botão QUESTS + card da quest)",
  "FIX — Loot de boss: o item agora aparece na mochila na hora ao coletar do Reward Chest, sem trocar de personagem",
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
  const items = ALPHA_ANNOUNCE_UPDATES.map((raw) => {
    const line = String(raw).replace(/</g, "&lt;");
    const m = line.match(/^(NOVO|FIX)\s*—\s*(.*)$/);
    return m
      ? `<li class="gi-patch-item"><span class="gi-new-badge${m[1] === "FIX" ? " is-fix" : ""}">${m[1]}</span><span class="gi-item-text">${m[2]}</span></li>`
      : `<li class="gi-patch-item"><span class="gi-item-text">${line}</span></li>`;
  }).join("");
  host.innerHTML = items ? `<ul class="gi-patch-list">${items}</ul>` : "";
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
  if (at) at.textContent = `📅 Atualizado em ${ALPHA_UPDATE_AT} (horário de Brasília)`;
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
