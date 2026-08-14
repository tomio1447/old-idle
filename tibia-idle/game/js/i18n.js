/* i18n.js — idioma da interface (pt / en). Chaves estáveis; o texto
 * visível troca sem recarregar. Magias e nomes oficiais de vocação
 * (Knight, Paladin…) ficam no original do Tibia. */
"use strict";

const I18N = {
  pt: {
    "config.btn": "CONFIG",
    "config.title": "Configurações",
    "config.language": "Idioma",
    "config.lang.pt": "Português",
    "config.lang.en": "English",
    "config.graphics": "Gráficos",
    "config.fullhd": "FULLHD",
    "config.fullhd.hint": "Sobe a resolução do canvas, encaixa os tiles em pixels inteiros e suaviza o downscale. Healthbars, dano/cura e textos do HUD acompanham o tamanho da tela.",
    "config.close": "Fechar",
    "server.status": "SERVER STATUS:",
    "server.online": "ONLINE",
    "server.offline": "OFFLINE",
    "server.reconnect": "Reconnect",
    "login.saved": "Personagem salvo",
    "login.continue": "Continuar",
    "login.enter": "Entre com sua conta para acessar seus personagens.",
    "login.user": "Login",
    "login.pass": "Senha",
    "login.submit": "Entrar",
    "login.createAccount": "Criar conta",
    "login.charName": "Nome do personagem",
    "login.sex": "Sexo",
    "login.male": "Masculino",
    "login.female": "Feminino",
    "login.vocation": "Vocação",
    "login.createChar": "Criar personagem e caçar",
    "login.localHint": "Identidade visual Global-Idle · progresso salvo no seu navegador",
    "btn.market": "MARKET",
    "btn.reward": "REWARD",
    "btn.forge": "FORGE",
    "btn.wheel": "WHEEL",
    "btn.prey": "PREY",
    "btn.party": "PARTY",
    "btn.depot": "DEPOT",
    "btn.imbuements": "IMBUEMENTS",
    "btn.switch": "Trocar personagem",
    "btn.cyclo": "Cyclopedia",
    "btn.admin": "Admin",
    "btn.city": "Ir para a cidade",
    "btn.hunts": "HUNTS",
    "btn.bosses": "BOSSES",
    "btn.training": "TREINO",
    "btn.sellAll": "Sell all",
    "btn.lootConfig": "Config",
    "btn.autoWalk": "AUTO",
    "hint.autoWalk": "OFF = clique no chão / WASD",
    "char.level": "Nível",
    "char.hp": "Vida",
    "char.mp": "Mana",
    "char.exp": "Experiência",
    "char.stamina": "Stamina",
    "panel.equip": "Equipamento",
    "panel.bag": "Mochila",
    "panel.pouch": "Loot Pouch",
    "panel.skills": "Habilidades",
    "panel.attrs": "Atributos",
    "panel.log": "Registro da caçada",
    "tab.heal": "Helper: Cura",
    "tab.healFriend": "Curar aliado",
    "tab.magicShield": "Escudo mágico",
    "tab.equipment": "Equipamento",
    "tab.attack": "Ataque",
    "tab.combo": "Combo",
    "tab.spells": "Magias",
    "tab.refill": "Refill",
    "tab.cfg": "Configurar",
    "helper.healAt": "Curar quando a vida estiver abaixo de",
    "helper.useSpells": "Usar magias de ataque",
    "helper.useRunes": "Usar runas e poções automaticamente",
    "helper.barMode": "Modo das barras do personagem",
    "helper.bars": "BARMODE — nick + HP/Mana em barras",
    "helper.arcs": "ARCS MODE — arcos de HP/Mana estilo Tibia Global",
    "helper.lootFilter": "Filtro de loot",
    "helper.lootAll": "Pegar tudo",
    "helper.lootValuable": "Só itens valiosos (20+ gp)",
    "helper.lootEquip": "Só equipamentos",
    "helper.reset": "Apagar personagem",
    "loading": "Carregando recursos...",
    "title.market": "Market — equipamentos e itens de imbuement (preços do Canary), venda de Tibia Coins",
    "title.reward": "Reward Chest — drops de boss",
    "title.forge": "Abrir Exaltation Forge",
    "title.wheel": "Abrir Wheel of Destiny (Roda do Destino)",
    "title.prey": "Sistema de Prey — bônus ao caçar uma criatura",
    "title.party": "Sistema de Party — compartilhe XP e veja o Analisador de Caçada",
    "title.depot": "Abrir Depot",
    "title.imbue": "Abrir janela de imbuement",
    "title.admin": "Painel de testes",
    "title.hunts": "Abrir catálogo de Hunts",
    "title.bosses": "Abrir catálogo de Bosses",
    "title.training": "Sistema de Treino — Exercise Dummy (25 TC por 5000 cargas) ou Treinador Online",
    "title.tc": "Tibia Coins — saldo da conta (vale para todos os personagens)",
    "nav.hunts": "Acessos de caçada",
    "voc.none.name": "Sem vocação",
    "voc.none.desc": "Rookgaard. Escolha uma vocação ao chegar no nível 8.",
    "voc.knight.name": "Knight",
    "voc.knight.desc": "Tanque puro. Muita vida, skills de melee sobem rápido.",
    "voc.paladin.name": "Paladin",
    "voc.paladin.desc": "Distância. Equilíbrio entre dano, vida e mana.",
    "voc.druid.name": "Druid",
    "voc.druid.desc": "Magia de gelo/terra e cura forte. Muita mana.",
    "voc.sorcerer.name": "Sorcerer",
    "voc.sorcerer.desc": "Magia de fogo/energia. O maior dano mágico do jogo.",
    "voc.monk.name": "Monk",
    "voc.monk.desc": "Punhos e harmonia. Combos de golpes e as três Virtudes.",
    "login.levelOf": "nível",
  },
  en: {
    "config.btn": "CONFIG",
    "config.title": "Settings",
    "config.language": "Language",
    "config.lang.pt": "Português",
    "config.lang.en": "English",
    "config.graphics": "Graphics",
    "config.fullhd": "FULLHD",
    "config.fullhd.hint": "Raises canvas resolution, snaps tiles to whole pixels and smooths the downscale. Healthbars, damage/heal numbers and HUD text keep screen size.",
    "config.close": "Close",
    "server.status": "SERVER STATUS:",
    "server.online": "ONLINE",
    "server.offline": "OFFLINE",
    "server.reconnect": "Reconnect",
    "login.saved": "Saved character",
    "login.continue": "Continue",
    "login.enter": "Sign in to access your characters.",
    "login.user": "Account",
    "login.pass": "Password",
    "login.submit": "Login",
    "login.createAccount": "Create account",
    "login.charName": "Character name",
    "login.sex": "Sex",
    "login.male": "Male",
    "login.female": "Female",
    "login.vocation": "Vocation",
    "login.createChar": "Create character and hunt",
    "login.localHint": "Global-Idle look · progress is saved in your browser",
    "btn.market": "MARKET",
    "btn.reward": "REWARD",
    "btn.forge": "FORGE",
    "btn.wheel": "WHEEL",
    "btn.prey": "PREY",
    "btn.party": "PARTY",
    "btn.depot": "DEPOT",
    "btn.imbuements": "IMBUEMENTS",
    "btn.switch": "Switch character",
    "btn.cyclo": "Cyclopedia",
    "btn.admin": "Admin",
    "btn.city": "Go to town",
    "btn.hunts": "HUNTS",
    "btn.bosses": "BOSSES",
    "btn.training": "TRAINING",
    "btn.sellAll": "Sell all",
    "btn.lootConfig": "Config",
    "btn.autoWalk": "AUTO",
    "hint.autoWalk": "OFF = click floor / WASD",
    "char.level": "Level",
    "char.hp": "Health",
    "char.mp": "Mana",
    "char.exp": "Experience",
    "char.stamina": "Stamina",
    "panel.equip": "Equipment",
    "panel.bag": "Backpack",
    "panel.pouch": "Loot Pouch",
    "panel.skills": "Skills",
    "panel.attrs": "Attributes",
    "panel.log": "Hunt log",
    "tab.heal": "Helper: Healing",
    "tab.healFriend": "Heal friend",
    "tab.magicShield": "Magic shield",
    "tab.equipment": "Equipment",
    "tab.attack": "Attack",
    "tab.combo": "Combo",
    "tab.spells": "Spells",
    "tab.refill": "Refill",
    "tab.cfg": "Configure",
    "helper.healAt": "Heal when health is below",
    "helper.useSpells": "Use attack spells",
    "helper.useRunes": "Use runes and potions automatically",
    "helper.barMode": "Character bar mode",
    "helper.bars": "BARMODE — name + HP/Mana bars",
    "helper.arcs": "ARCS MODE — Tibia Global HP/Mana arcs",
    "helper.lootFilter": "Loot filter",
    "helper.lootAll": "Take everything",
    "helper.lootValuable": "Valuable items only (20+ gp)",
    "helper.lootEquip": "Equipment only",
    "helper.reset": "Delete character",
    "loading": "Loading assets...",
    "title.market": "Market — equipment and imbuement items (Canary prices), Tibia Coin sales",
    "title.reward": "Reward Chest — boss drops",
    "title.forge": "Open Exaltation Forge",
    "title.wheel": "Open Wheel of Destiny",
    "title.prey": "Prey system — bonus while hunting a creature",
    "title.party": "Party system — share XP and open the Hunt Analyser",
    "title.depot": "Open Depot",
    "title.imbue": "Open imbuement window",
    "title.admin": "Test panel",
    "title.hunts": "Open Hunts catalogue",
    "title.bosses": "Open Bosses catalogue",
    "title.training": "Training — Exercise Dummy (25 TC / 5000 charges) or Online trainer",
    "title.tc": "Tibia Coins — account balance (shared by all characters)",
    "nav.hunts": "Hunt shortcuts",
    "voc.none.name": "No vocation",
    "voc.none.desc": "Rookgaard. Pick a vocation when you reach level 8.",
    "voc.knight.name": "Knight",
    "voc.knight.desc": "Pure tank. High health, melee skills rise fast.",
    "voc.paladin.name": "Paladin",
    "voc.paladin.desc": "Distance. Balance of damage, health and mana.",
    "voc.druid.name": "Druid",
    "voc.druid.desc": "Ice/earth magic and strong healing. Lots of mana.",
    "voc.sorcerer.name": "Sorcerer",
    "voc.sorcerer.desc": "Fire/energy magic. The highest magic damage.",
    "voc.monk.name": "Monk",
    "voc.monk.desc": "Fists and harmony. Strike combos and the three Virtues.",
    "login.levelOf": "level",
  },
};

function i18nLang() {
  return (typeof ClientSettings !== "undefined" && ClientSettings.lang) || "pt";
}

function t(key) {
  const lang = i18nLang();
  const dict = I18N[lang] || I18N.pt;
  if (dict && dict[key] != null) return dict[key];
  if (I18N.pt && I18N.pt[key] != null) return I18N.pt[key];
  return key;
}

function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) el.setAttribute("title", t(key));
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });
  if (typeof VOCATIONS !== "undefined") {
    for (const id of Object.keys(VOCATIONS)) {
      const name = t("voc." + id + ".name");
      const desc = t("voc." + id + ".desc");
      if (name && name.indexOf("voc.") !== 0) VOCATIONS[id].name = name;
      if (desc && desc.indexOf("voc.") !== 0) VOCATIONS[id].desc = desc;
    }
  }
  const html = document.documentElement;
  if (html) html.lang = i18nLang() === "en" ? "en" : "pt-BR";
}

window.I18N = I18N;
window.t = t;
window.applyI18n = applyI18n;
window.i18nLang = i18nLang;
