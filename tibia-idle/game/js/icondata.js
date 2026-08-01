/* icondata.js — Ícones oficiais da página "Icons" da TibiaWiki.
 *
 * Fonte: https://tibia.fandom.com/wiki/Icons
 * Arquivos baixados de static.wikia.nocookie.net e convertidos para PNG
 * RGBA com transparência, salvos em assets/ui/icons/<slug>.png.
 *
 * O registro segue o mesmo formato do CLIENT_EFFECTS (effectdata.js):
 * { slug, title, file, source, path } — assim qualquer tela do jogo pode
 * referenciar um ícone pelo slug e o caminho resolve sozinho.
 *
 * Uso no canvas:  const img = wikiIcon("fiendish-creature");
 *                 if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x, y, 12, 12);
 * Uso no HTML:    <img src="assets/ui/icons/sap-strength.png">
 */
window.WIKI_ICONS = {
  // ---- Special Condition Icons (crippling stances do Sorcerer)
  "sap-strength": {
    slug: "sap-strength", title: "Sap Strength Icon",
    file: "File:Sap Strength Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/1/1e/Sap_Strength_Icon.png/revision/latest?cb=20211210173010&path-prefix=en",
    path: "assets/ui/icons/sap-strength.png",
  },
  "expose-weakness": {
    slug: "expose-weakness", title: "Expose Weakness Icon",
    file: "File:Expose Weakness Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/3/35/Expose_Weakness_Icon.png/revision/latest?cb=20211210173007&path-prefix=en",
    path: "assets/ui/icons/expose-weakness.png",
  },
  "challenged": {
    slug: "challenged", title: "Chivalrous Challenge Icon (Challenged)",
    file: "File:Chivalrous Challenge Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/3/39/Chivalrous_Challenge_Icon.png/revision/latest?cb=20211210173011&path-prefix=en",
    path: "assets/ui/icons/challenged.png",
  },
  // ---- Creature Icons (Fiendish and Influenced Creatures)
  "influenced-creature": {
    slug: "influenced-creature", title: "Influenced Creature Icon",
    file: "File:Influenced Creature Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/4/4f/Influenced_Creature_Icon.png/revision/latest?cb=20211210173009&path-prefix=en",
    path: "assets/ui/icons/influenced-creature.png",
  },
  "fiendish-creature": {
    slug: "fiendish-creature", title: "Fiendish Creature Icon",
    file: "File:Fiendish Creature Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/2/28/Fiendish_Creature_Icon.png/revision/latest?cb=20211210173008&path-prefix=en",
    path: "assets/ui/icons/fiendish-creature.png",
  },
  // ---- Soulpit
  "soulpit-normal": {
    slug: "soulpit-normal", title: "Normal Soulpit Icon",
    file: "File:Normal Soulpit Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/c/cc/Normal_Soulpit_Icon.png/revision/latest?cb=20251126192246&path-prefix=en",
    path: "assets/ui/icons/soulpit-normal.png",
  },
  "soulpit-final": {
    slug: "soulpit-final", title: "Final Soulpit Icon",
    file: "File:Final Soulpit Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/7/7f/Final_Soulpit_Icon.png/revision/latest?cb=20251126192245&path-prefix=en",
    path: "assets/ui/icons/soulpit-final.png",
  },
  // ---- Task Board
  "weekly-task": {
    slug: "weekly-task", title: "Weekly Task Icon",
    file: "File:Weekly Task (Icon).png",
    source: "https://static.wikia.nocookie.net/tibia/images/0/0d/Weekly_Task_%28Icon%29.png/revision/latest?cb=20251128022031&path-prefix=en",
    path: "assets/ui/icons/weekly-task.png",
  },
  "bounty-task": {
    slug: "bounty-task", title: "Bounty Task Icon",
    file: "File:Bounty Task (Icon).png",
    source: "https://static.wikia.nocookie.net/tibia/images/c/c1/Bounty_Task_%28Icon%29.png/revision/latest?cb=20251128022030&path-prefix=en",
    path: "assets/ui/icons/bounty-task.png",
  },
  // ---- Quest Icons (Rotten Blood Quest)
  "quest-condition-red-blood": {
    slug: "quest-condition-red-blood", title: "Quest Condition Red Blood",
    file: "File:Quest Condition Red Blood.png",
    source: "https://static.wikia.nocookie.net/tibia/images/9/98/Quest_Condition_Red_Blood.png/revision/latest?cb=20250222201031&path-prefix=en",
    path: "assets/ui/icons/quest-condition-red-blood.png",
  },
  "quest-condition-white-x": {
    slug: "quest-condition-white-x", title: "Quest Condition White X",
    file: "File:Quest Condition White X.png",
    source: "https://static.wikia.nocookie.net/tibia/images/c/cc/Quest_Condition_White_X.png/revision/latest?cb=20250222224132&path-prefix=en",
    path: "assets/ui/icons/quest-condition-white-x.png",
  },
  "quest-condition-red-ball": {
    slug: "quest-condition-red-ball", title: "Quest Condition Red Ball",
    file: "File:Quest Condition Red Ball.png",
    source: "https://static.wikia.nocookie.net/tibia/images/7/7c/Quest_Condition_Red_Ball.png/revision/latest?cb=20250222194718&path-prefix=en",
    path: "assets/ui/icons/quest-condition-red-ball.png",
  },
  "quest-condition-arrow-up": {
    slug: "quest-condition-arrow-up", title: "Quest Condition Arrow Up",
    file: "File:Quest Condition Arrow Up.png",
    source: "https://static.wikia.nocookie.net/tibia/images/6/69/Quest_Condition_Arrow_Up.png/revision/latest?cb=20250222201030&path-prefix=en",
    path: "assets/ui/icons/quest-condition-arrow-up.png",
  },
  // ---- Boss Difficulty System
  "boss-difficulty-cons": {
    slug: "boss-difficulty-cons", title: "Boss Difficulty System — Cons Icon",
    file: "File:Boss Difficulty System - Cons Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/0/0b/Boss_Difficulty_System_-_Cons_Icon.png/revision/latest?cb=20260628112849&path-prefix=en",
    path: "assets/ui/icons/boss-difficulty-cons.png",
  },
  "boss-difficulty-pros": {
    slug: "boss-difficulty-pros", title: "Boss Difficulty System — Pros Icon",
    file: "File:Boss Difficulty System - Pros Icon.png",
    source: "https://static.wikia.nocookie.net/tibia/images/f/f0/Boss_Difficulty_System_-_Pros_Icon.png/revision/latest?cb=20260628112921&path-prefix=en",
    path: "assets/ui/icons/boss-difficulty-pros.png",
  },
};

/* Cache de <img> por slug — evita recriar Image a cada frame. */
const WIKI_ICON_CACHE = {};

/* Retorna a <img> do ícone (criada sob demanda e cacheada). */
function wikiIcon(slug) {
  const meta = WIKI_ICONS && WIKI_ICONS[slug];
  if (!meta) return null;
  if (!WIKI_ICON_CACHE[slug]) {
    const im = new Image();
    im.src = meta.path;
    WIKI_ICON_CACHE[slug] = im;
  }
  return WIKI_ICON_CACHE[slug];
}

/* true se a <img> do ícone já carregou e pode ser desenhada. */
function wikiIconReady(slug) {
  const img = wikiIcon(slug);
  return !!(img && img.complete && img.naturalWidth);
}

/* Desenha o ícone em (x, y) com `size` px (canto superior esquerdo) se
 * já carregou. Retorna true se desenhou — útil para fallbacks em texto. */
function drawWikiIcon(ctx, slug, x, y, size) {
  if (!wikiIconReady(slug)) return false;
  ctx.drawImage(wikiIcon(slug), x, y, size, size);
  return true;
}
