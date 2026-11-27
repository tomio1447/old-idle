"use strict";
/* test_boss_slots.js — Boss Slots no molde io_bosstiary do Crystalserver.
 * Cobre:
 *   - bossSlotLevel: marcos por categoria (Bane 10/20/30, Archfoe 3/7/10,
 *     Nemesis 1/3/5) e "unlocked" = nível ≥1
 *   - bossLootBonusPct: curva oficial dos boss points (3 faixas)
 *   - bossSlotBonusPct: bônus dos pontos +25% se nível 3, só quando slotted
 *   - bossSlotRemovePrice: 2 primeiras grátis, depois 300k*vezes-500k
 *   - assign/remove compartilhado (cliente offline) e auth (servidor)
 *   - engine: mesma validação + slot 2 exige 1500 pts + débito de gold
 *   - integração: hook no chanceMult do loot, daily boss ×3 kills, rota
 *     /api/character/boss-slot, wrapper do cliente, aba da Cyclopedia
 * Uso: node tools/test_boss_slots.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(cond, label, extra) {
  if (cond) { passed++; console.log("  ok:", label); }
  else { failed++; console.log("  FALHOU:", label, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
}
function grab(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(name + " ausente");
  let d = 0;
  const j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}" && !--d) return src.slice(i, k + 1);
  }
  throw new Error(name + " sem fechamento");
}
function grabConst(src, name) {
  const i = src.indexOf(`const ${name}`);
  if (i < 0) throw new Error(name + " ausente");
  let j = src.indexOf("=", i) + 1;
  while (/\s/.test(src[j])) j++;
  if (src[j] !== "[" && src[j] !== "{") {           // número/string literal
    const end = src.indexOf(";", j);
    return src.slice(i, end + 1);
  }
  const open = src[j], close = open === "[" ? "]" : "}";
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === open) d++;
    else if (src[k] === close && !--d) return src.slice(i, k + 1) + ";";
  }
  throw new Error(name + " sem fechamento");
}

const bosSrc = fs.readFileSync(path.join(root, "game", "js", "bosstiary.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "game", "js", "cyclopedia-ui.js"), "utf8");
const cycSrc = fs.readFileSync(path.join(root, "game", "js", "cyclopedia.js"), "utf8");
const engSrc = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
const srvSrc = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
const dbJsSrc = fs.readFileSync(path.join(root, "server", "db.js"), "utf8");
const cliSrc = fs.readFileSync(path.join(root, "game", "js", "account-client.js"), "utf8");
const cssSrc = fs.readFileSync(path.join(root, "game", "css", "layout.css"), "utf8");
const dbSrc  = fs.readFileSync(path.join(root, "game", "js", "daily-boost.js"), "utf8");

/* ---------- ambiente stub (mesmas categorias por faixa de HP) ---------- */
const sandbox = {
  GAMEDATA: {
    monsters: {
      "mini-boss":  { name: "Mini Boss", hp: 20000,  boss: true },  // bane
      "mid-boss":   { name: "Mid Boss",  hp: 90000,  boss: true },  // archfoe
      "mega-boss":  { name: "Mega Boss", hp: 400000, boss: true },  // nemesis
      "sem-boss":   { name: "Sem Boss",  hp: 999,    boss: false },
      "inativo":    { name: "Inativo",   hp: 500000, boss: true },  // fora do mundo
    },
    hunts: { "room": { monsters: ["mini-boss", "mid-boss", "mega-boss", "sem-boss"] } },
  },
  QUEST_DEFS: {}, BOSS_DEFS: {},
  MOBSHEETS: { "mini-boss": {}, "mid-boss": {}, "mega-boss": {} },
  fmtFull: (n) => String(n),
};
vm.createContext(sandbox);
const cycLite = grab(cycSrc, "activeMonsterSlugs");
const monSrc = fs.readFileSync(path.join(root, "game", "js", "monsters.js"), "utf8");
vm.runInContext(cycLite + "\n" + grab(monSrc, "monsterPlayable"), sandbox);
vm.runInContext([
  "BOSS_CATS", "BOSS_SLOT_LEVELS", "BOSS_SLOT2_POINTS", "BOSS_SLOT3_COINS",
  "BOSS_SLOT_DAILY_KILLS",
].map((n) => grabConst(bosSrc, n)).join("\n"), sandbox);
vm.runInContext([
  "ensureBosstiary", "bossCategory", "bosstiaryList", "bosstiaryProgress",
  "ensureBossSlots", "bossSlot3Owned", "bossSlotLevel", "bossSlotUnlocked",
  "bossLootBonusPct", "bossSlotBonusPct", "bossSlotRemovePrice", "bossSlotList",
  "bossSlotAssignError", "bossSlotAssign", "bossSlotRemove",
].map((n) => grab(bosSrc, n)).join("\n"), sandbox);
const r = (code) => vm.runInContext(code, sandbox);

/* ---------- bossSlotLevel / unlocked ---------- */
console.log("\n[1] níveis por categoria");
check(r(`bossSlotLevel({bosstiary:{"mini-boss":9}},'mini-boss')`) === 0 &&
      r(`bossSlotLevel({bosstiary:{"mini-boss":10}},'mini-boss')`) === 1 &&
      r(`bossSlotLevel({bosstiary:{"mini-boss":20}},'mini-boss')`) === 2 &&
      r(`bossSlotLevel({bosstiary:{"mini-boss":30}},'mini-boss')`) === 3,
  "bane: marcos 10/20/30");
check(r(`bossSlotLevel({bosstiary:{"mid-boss":2}},'mid-boss')`) === 0 &&
      r(`bossSlotLevel({bosstiary:{"mid-boss":3}},'mid-boss')`) === 1 &&
      r(`bossSlotLevel({bosstiary:{"mid-boss":10}},'mid-boss')`) === 3,
  "archfoe: marcos 3/7/10");
check(r(`bossSlotLevel({bosstiary:{"mega-boss":1}},'mega-boss')`) === 1 &&
      r(`bossSlotLevel({bosstiary:{"mega-boss":3}},'mega-boss')`) === 2 &&
      r(`bossSlotLevel({bosstiary:{"mega-boss":5}},'mega-boss')`) === 3,
  "nemesis: marcos 1/3/5");
check(r(`bossSlotUnlocked({bosstiary:{"mega-boss":1}},'mega-boss')`) === true &&
      r(`bossSlotUnlocked({bosstiary:{}},'mega-boss')`) === false,
  "unlocked = nível ≥1");

/* ---------- curva oficial do bônus de loot ---------- */
console.log("\n[2] bossLootBonusPct (curva oficial)");
check(r("bossLootBonusPct(0)") === 25 && r("bossLootBonusPct(250)") === 50,
  "≤250 pts → 25+pts/10", [r("bossLootBonusPct(0)"), r("bossLootBonusPct(250)")]);
check(r("bossLootBonusPct(500)") === 62 && r("bossLootBonusPct(1249)") === 99,
  "250–1250 → 37.5+pts/20", [r("bossLootBonusPct(500)"), r("bossLootBonusPct(1249)")]);
check(r("bossLootBonusPct(1250)") === 100 && r("bossLootBonusPct(5000)") === 134,
  "≥1250 → fórmula da raiz", [r("bossLootBonusPct(1250)"), r("bossLootBonusPct(5000)")]);

/* ---------- bônus do slot e preço da remoção ---------- */
console.log("\n[3] bonus do slot + preço de remover");
const pFull = `({bosstiary:{"mini-boss":30,"mid-boss":10,"mega-boss":5},bossPoints:1000,bossSlots:{1:"mini-boss",2:"mega-boss"},bossSlotRemoves:0,gold:0})`;
check(r(`bossSlotBonusPct(${pFull},'mini-boss')`) === 87 + 25 &&
      r(`bossSlotBonusPct(${pFull},'mega-boss')`) === 87 + 25,
  "slotted: bônus dos pontos (87 a 1000 pts) + 25 do nível 3",
  r(`bossSlotBonusPct(${pFull},'mini-boss')`));
check(r(`bossSlotBonusPct(${pFull},'mid-boss')`) === 0,
  "boss fora dos slots → 0");
const pMid = `({bosstiary:{"mini-boss":10},bossPoints:50,bossSlots:{1:"mini-boss",2:null},bossSlotRemoves:0,gold:0})`;
check(r(`bossSlotBonusPct(${pMid},'mini-boss')`) === 30,
  "nível 1: só o bônus dos pontos (30), sem +25", r(`bossSlotBonusPct(${pMid},'mini-boss')`));
check(r("bossSlotRemovePrice(0)") === 0 && r("bossSlotRemovePrice(1)") === 0,
  "2 primeiras remoções grátis");
check(r("bossSlotRemovePrice(2)") === 100000 && r("bossSlotRemovePrice(3)") === 400000 &&
      r("bossSlotRemovePrice(4)") === 700000,
  "300k*remoções-500k a partir da 3ª", [r("bossSlotRemovePrice(2)"), r("bossSlotRemovePrice(3)")]);

/* ---------- lista de assignáveis ---------- */
console.log("\n[4] bossSlotList");
check(JSON.stringify(r(`bossSlotList({bosstiary:{"mini-boss":10,"mega-boss":1}})`).sort())
      === JSON.stringify(["mega-boss", "mini-boss"]),
  "só bosses com nível ≥1 E ativos no mundo entram",
  r(`bossSlotList({bosstiary:{"mini-boss":10,"mega-boss":1,"inativo":5}})`));
check(r(`bossSlotList({bosstiary:{"inativo":5}})`).length === 0,
  "boss inativo não entra nem com kills");

/* ---------- assign/remove compartilhado ---------- */
console.log("\n[5] assign/remove (shared)");
const pOk = `{bosstiary:{"mini-boss":10,"mid-boss":10},bossPoints:2000,bossSlots:{1:null,2:null,3:null},bossSlotRemoves:0,gold:0}`;
check(r(`bossSlotAssignError(${pOk},4,'mini-boss')`) === "slot inválido",
  "slot 4 inválido");
check(r(`bossSlotAssignError(${pOk},3,'mini-boss')`).indexOf("Tibia Coins") !== -1,
  "slot 3 sem desbloqueio → exige Tibia Coins", r(`bossSlotAssignError(${pOk},3,'mini-boss')`));
check(r(`bossSlotAssignError(${pOk},1,'sem-boss')`) === "não é um boss", "não-boss rejeitado");
check(r(`bossSlotAssignError({bosstiary:{"mini-boss":5},bossSlots:{1:null,2:null}},1,'mini-boss')`)
      .indexOf("bloqueado") !== -1, "nível 0 rejeitado");
check(r(`bossSlotAssignError(${pOk},2,'mini-boss')`) === null &&
      r(`bossSlotAssignError({bosstiary:{"mini-boss":10},bossPoints:1499,bossSlots:{1:null,2:null}},2,'mini-boss')`)
        .indexOf("1500") !== -1 || r(`bossSlotAssignError({bosstiary:{"mini-boss":10},bossPoints:1499,bossSlots:{1:null,2:null}},2,'mini-boss')`)
        .indexOf("1.500") !== -1 || r(`bossSlotAssignError({bosstiary:{"mini-boss":10},bossPoints:1499,bossSlots:{1:null,2:null}},2,'mini-boss')`)
        .indexOf("slot 2") !== -1,
  "slot 2: 2000 pts passa, 1499 trava");
check(r(`bossSlotAssignError({bosstiary:{"mini-boss":10},bossPoints:2000,bossSlots:{1:"mini-boss",2:null}},2,'mini-boss')`)
      .indexOf("outro slot") !== -1, "mesmo boss nos 2 slots rejeitado");
check(r(`bossSlotAssign(${pOk},1,'mini-boss').ok`) === true &&
      r(`bossSlotAssign(${pOk},1,'mini-boss') && true`),
  "assign válido ok");
const pRem = `{bosstiary:{"mini-boss":10},bossPoints:0,bossSlots:{1:"mini-boss",2:null},bossSlotRemoves:2,gold:150000}`;
const rRem = r(`(function(){var p=${pRem};var x=bossSlotRemove(p,1);return {ok:x.ok,preco:x.preco,gold:p.gold,rem:p.bossSlotRemoves,slot:p.bossSlots[1]};})()`);
check(rRem.ok && rRem.preco === 100000 && rRem.gold === 50000 && rRem.rem === 3 && rRem.slot === null,
  "3ª remoção cobra 100k e limpa o slot", rRem);
check(r(`bossSlotRemove({bosstiary:{"mini-boss":10},bossSlots:{1:"mini-boss",2:null},bossSlotRemoves:2,gold:5000},1).ok`) === false,
  "gold insuficiente → recusa sem limpar");

/* ---------- slot 3 (150 Tibia Coins por conta — oficial) ---------- */
console.log("\n[5b] slot 3 (desbloqueio por Tibia Coins)");
check(r(`BOSS_SLOT3_COINS`) === 150, "BOSS_SLOT3_COINS = 150 (oficial)");
check(r(`bossSlot3Owned({bossSlot3:1})`) === true &&
      r(`bossSlot3Owned({})`) === false &&
      r(`bossSlot3Owned({bossSlot3:0})`) === false,
  "bossSlot3Owned: mirror do save ou cosmetics da conta");
const p3 = `{bosstiary:{"mini-boss":10,"mid-boss":10,"mega-boss":1},bossPoints:0,bossSlots:{1:null,2:null,3:null},bossSlotRemoves:0,bossSlot3:1,gold:0}`;
check(r(`bossSlotAssignError(${p3},3,'mini-boss')`) === null,
  "slot 3 desbloqueado → assign válido mesmo sem os 1500 pts");
const p3a = r(`(function(){var p=${p3};var x=bossSlotAssign(p,3,'mid-boss');return {ok:x.ok,slot3:p.bossSlots[3]};})()`);
check(p3a.ok === true && p3a.slot3 === "mid-boss", "assign real no slot 3", p3a);
check(r(`bossSlotAssignError({bosstiary:{"mini-boss":10},bossSlots:{1:"mini-boss",2:null,3:null},bossSlot3:1},3,'mini-boss')`)
      .indexOf("outro slot") !== -1,
  "mesmo boss no slot 1 trava o slot 3");
check(r(`bossSlotAssignError({bosstiary:{"mini-boss":10,"mid-boss":10},bossPoints:2000,bossSlots:{1:"mini-boss",2:null,3:"mid-boss"},bossSlot3:1},2,'mid-boss')`)
      .indexOf("outro slot") !== -1,
  "mesmo boss no slot 3 trava o slot 2");
check(r(`bossSlotRemove({bosstiary:{"mid-boss":10},bossSlots:{1:null,2:null,3:"mid-boss"},bossSlotRemoves:0,gold:0},3).ok`) === true,
  "remove no slot 3 funciona");
check(r(`bossSlotBonusPct({bosstiary:{"mega-boss":5},bossPoints:100,bossSlots:{1:null,2:null,3:"mega-boss"}},'mega-boss')`) === 60,
  "bônus inclui o slot 3 (35 dos pontos a 100 + 25 do nível 3)",
  r(`bossSlotBonusPct({bosstiary:{"mega-boss":5},bossPoints:100,bossSlots:{1:null,2:null,3:"mega-boss"}},'mega-boss')`));
check(r(`bossSlotAssignError({bosstiary:{"mega-boss":1},bossSlots:{1:null,2:null,3:null},bossSlot3:1},3,'mega-boss')`) === null,
  "boss nemesis nível 1 também pode ir pro slot 3");

/* ---------- engine autoritativa ---------- */
console.log("\n[6] engine (auth)");
const E = require(path.join(root, "server", "authoritative_engine.js"));
const ep = { bosstiary: { "urmahlullu-the-immaculate": 5 }, bossPoints: 2000,
             bossSlots: { 1: null, 2: null }, bossSlotRemoves: 0, gold: 0 };
check(E.authBossSlotAssign(ep, 1, "urmahlullu-the-immaculate").ok === true &&
      ep.bossSlots[1] === "urmahlullu-the-immaculate",
  "assign nemesis nível 3 no engine");
check(E.authBossSlotAssign(ep, 2, "urmahlullu-the-immaculate").ok === false,
  "mesmo boss no slot 2 rejeitado");
check(E.authBossSlotAssign({ bosstiary: {}, bossPoints: 0, bossSlots: { 1: null, 2: null } },
      1, "azerus").ok === false, "nível 0 rejeitado no engine");
const ep2 = { bosstiary: { "azerus": 10 }, bossPoints: 1499,
              bossSlots: { 1: null, 2: null }, bossSlotRemoves: 0, gold: 0 };
check(E.authBossSlotAssign(ep2, 2, "azerus").ok === false &&
      E.authBossSlotAssign(ep2, 1, "azerus").ok === true,
  "slot 2 trava em 1499 pts, slot 1 livre");
const ep3 = { bosstiary: { "azerus": 30 }, bossPoints: 0,
              bossSlots: { 1: "azerus", 2: null }, bossSlotRemoves: 2, gold: 150000 };
const rm = E.authBossSlotRemove(ep3, 1);
check(rm.ok && rm.preco === 100000 && ep3.gold === 50000 && ep3.bossSlotRemoves === 3,
  "remove debita 100k no engine", rm);
check(E.bossSlotBonusPct({ bosstiary: { "azerus": 30 }, bossPoints: 1000,
      bossSlots: { 1: "azerus", 2: null } }, "azerus") === 112,
  "bônus: 87 dos pontos (a 1000) + 25 do nível 3");
check(E.BOSS_SLOT3_COINS === 150, "engine exporta BOSS_SLOT3_COINS = 150");
check(E.authBossSlotAssign(ep, 3, "urmahlullu-the-immaculate").ok === false,
  "slot 3 sem bossSlot3 → rejeitado no engine");
const ep4 = { bosstiary: { "urmahlullu-the-immaculate": 5 }, bossPoints: 0,
              bossSlots: { 1: null, 2: null, 3: null }, bossSlotRemoves: 0, bossSlot3: 1, gold: 0 };
check(E.authBossSlotAssign(ep4, 3, "urmahlullu-the-immaculate").ok === true &&
      ep4.bossSlots[3] === "urmahlullu-the-immaculate",
  "slot 3 assign ok no engine com bossSlot3=1");
check(E.authBossSlotAssign(ep4, 2, "urmahlullu-the-immaculate").ok === false,
  "boss no slot 3 trava o slot 2 (engine)");
const rm3 = E.authBossSlotRemove(ep4, 3);
check(rm3.ok === true && ep4.bossSlots[3] === null, "remove do slot 3 no engine");
check(E.bossSlotBonusPct({ bosstiary: { "azerus": 30 }, bossPoints: 1000,
      bossSlots: { 1: null, 2: null, 3: "azerus" } }, "azerus") === 112,
  "bônus do engine inclui o slot 3");
console.log("\n[7] integração loot/rota/UI");
check(/bosstiaryKill\(item\.p,mob\.slug,isDailyBoss\(mob\.slug\)\?BOSS_SLOT_DAILY_KILLS:1\)/.test(engSrc),
  "boss do dia conta 3× no bosstiário (kill bonus boosted)");
check(/slotLoot=\(mob&&mob\.boss\)\?\(1\+bossSlotBonusPct\(leader,mob\.slug\)\/100\):1/.test(engSrc) &&
      /chanceMult=lootRate\*bossRateMul[\s\S]*?dailyLoot\*slotLoot/.test(engSrc),
  "chanceMult do loot multiplica pelo bônus do slot do líder");
check(srvSrc.includes('url === "/api/character/boss-slot"') &&
      srvSrc.includes("async function bossSlotCharacterApi") &&
      srvSrc.includes("authBossSlotAssign") && srvSrc.includes("authBossSlotRemove") &&
      /setAccountGold\(acc\.id/.test(srvSrc.slice(srvSrc.indexOf("bossSlotCharacterApi"),
        srvSrc.indexOf("bossSlotCharacterApi") + 5200)),
  "rota /api/character/boss-slot: assign/remove autoritativo + débito do wallet");
check(cliSrc.includes('"/api/character/boss-slot"') &&
      cliSrc.includes("function accountBossSlotOp") && cliSrc.includes("accountQueueSave"),
  "cliente chama a rota única pela fila de save (molde promote)");
check(uiSrc.includes("bossSlot: renderCycloBossSlots") &&
      uiSrc.includes("data-slot-pick") && uiSrc.includes("data-slot-remove") &&
      uiSrc.includes("data-slot3-buy") && uiSrc.includes("bossSlot3Owned") &&
      uiSrc.includes("dailyBoostCurrent"),
  "aba Boss Slots: 3 slots assignáveis + buy do slot 3 + boosted do dia");
check(srvSrc.includes('"unlock3"') && srvSrc.includes("db.buyBossSlot3") &&
      srvSrc.includes("BOSS_SLOT3_COINS"),
  "rota /api/character/boss-slot: op unlock3 compra pelo db (150 TC)");
check(dbJsSrc.includes("buyBossSlot3") &&
      dbJsSrc.includes("bossSlot3: 1") &&
      dbJsSrc.includes("'$.bossSlot3', 1"),
  "db.buyBossSlot3: débito NT-first + cosmetics.bossSlot3 (Json e MySQL)");
check(cliSrc.includes("bossSlot3") && cliSrc.includes("cosmetics"),
  "cliente repassa cosmetics/bossSlot3 na resposta da rota");
check(dbSrc.includes("dailyBoostCurrent"), "daily-boost expõe o boss do dia");
check(cycSrc.includes('{ id: "bossSlot", nome: "Boss Slots", icone: "bosstiary", pronta: true }'),
  "aba marcada pronta com o ícone do bosstiary");
check(cssSrc.includes(".bslot-card") && cssSrc.includes(".bslot-grid") &&
      cssSrc.includes(".bslot-empty-sign"),
  "CSS dos slots presente");

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
