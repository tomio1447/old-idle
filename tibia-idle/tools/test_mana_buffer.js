"use strict";
/* Mana Buffer (update 15.25, oficial): golpe LETAL em Sorcerer/Druid
 * desvia o excedente para a mana — 8 mana por ponto de vida evitado +
 * taxa de 25% da mana máxima (1x/2s). Sem mana suficiente, morre.
 * Espelho do cliente (combat.js) agora também no absorbIncomingDamage. */
const engine = require("../server/authoritative_engine");
const assert = require("assert");

const BASE_P = {
  id: "1", name: "Mago", voc: "sorcerer", level: 400,
  exp: engine.expForLevel(400),
  skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 10, shield: 10 },
  equip: {}, supplies: {}, lootPouch: {}, kills: {}, bosses: {}, config: {},
};
function sorc(hp, mp) {
  const p = JSON.parse(JSON.stringify(BASE_P));
  p.hp = hp; p.mp = mp;
  return p;
}
const pos = { x: 0.5, y: 0.5 };
const item = { id: "1" };
const mob = { slug: "demon", hp: 8200, def: { name: "Demon" } };
const freshAuth = () => ({ events: [], clock: 10000, players: [] });
/* Mede o dano real que sai do funnel (pós mitigação/resist) com hp alto
 * o bastante pra não ser letal — é o valor que o excedente usa. */
function fullDmg(raw, el) {
  const p = sorc(1e9, 0);
  return engine.absorbIncomingDamage(freshAuth(), item, p, raw, 10000, pos, el || "physical", mob);
}

/* ---------- sorcerer sobrevive com mana suficiente ---------- */
{
  const auth = freshAuth();
  const p = sorc(100, 50000);
  const max = engine.maxStats(p);
  const dmg = fullDmg(500);
  const out = engine.absorbIncomingDamage(auth, item, p, 500, 10000, pos, "physical", mob);
  assert.strictEqual(out, 99, "dano deveria ser limitado a hp-1");
  p.hp -= out;
  assert.strictEqual(p.hp, 1, "mage deveria sobreviver com 1hp");
  const excesso = dmg - 100 + 1;
  const taxa = Math.floor(max.mp * 0.25);
  assert.strictEqual(p.mp, 50000 - (excesso * 8 + taxa),
    "mana deveria drenar excedente*8 + taxa 25%");
  assert.ok(p.manaBufferAt === 10000, "manaBufferAt não carimbado");
  const ev = (auth.events || []).find((e) => e.t === "manabuffer");
  assert.ok(ev && ev.mana === excesso * 8 + taxa && ev.vida === excesso,
    "evento manabuffer não emitido ou valores errados");
}

/* ---------- taxa de 25% não cobra de novo dentro de 2s ---------- */
{
  const auth = freshAuth();
  const p = sorc(100, 50000);
  engine.absorbIncomingDamage(auth, item, p, 500, 10000, pos, "physical", mob);
  p.hp = 100; // simula cura entre os hits
  const mpBefore = p.mp;
  const dmg2 = fullDmg(200);
  const out = engine.absorbIncomingDamage(auth, item, p, 200, 11000, pos, "physical", mob);
  p.hp -= out;
  assert.strictEqual(p.hp, 1);
  assert.strictEqual(p.mp, mpBefore - ((dmg2 - 100 + 1) * 8),
    "segundo hit <2s não deveria cobrar a taxa de 25% de novo");
}

/* ---------- mana insuficiente → morre ---------- */
{
  const auth = freshAuth();
  const p = sorc(100, 100); // excedente * 8 >> 100
  const out = engine.absorbIncomingDamage(auth, item, p, 500, 10000, pos, "physical", mob);
  assert.strictEqual(out, fullDmg(500), "sem mana, o golpe inteiro deveria passar");
}

/* ---------- druid também tem a mecânica ---------- */
{
  const auth = freshAuth();
  const p = sorc(50, 99999); p.voc = "druid";
  const out = engine.absorbIncomingDamage(auth, item, p, 500, 10000, pos, "fire", mob);
  assert.strictEqual(out, 49);
  p.hp -= out;
  assert.strictEqual(p.hp, 1, "druid deveria sobreviver com 1hp");
}

/* ---------- knight/paladin/monk/none NÃO têm ---------- */
for (const voc of ["knight", "paladin", "monk", "none"]) {
  const auth = freshAuth();
  const p = sorc(100, 99999); p.voc = voc;
  const out = engine.absorbIncomingDamage(auth, item, p, 500, 10000, pos, "physical", mob);
  assert.strictEqual(out, fullDmg(500), `${voc} não deveria ter mana buffer`);
}

/* ---------- golpe não-letal passa normal ---------- */
{
  const auth = freshAuth();
  const p = sorc(1000, 50000);
  const out = engine.absorbIncomingDamage(auth, item, p, 300, 10000, pos, "physical", mob);
  assert.ok(out > 0 && out <= 300, "dano não-letal deveria fluir normal");
  assert.strictEqual(p.mp, 50000, "mana não deveria ser tocada em hit não-letal");
}

console.log("Mana Buffer: sorcerer/druid sobrevivem letal com 1hp (excedente×8 na mana + taxa 25%/2s), sem mana morrem, outras vocs não têm.");
