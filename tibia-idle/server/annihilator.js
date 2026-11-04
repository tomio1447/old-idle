"use strict";

const D = require("../game/js/annihilator-data");

function create(accountId, characters) {
  if (!Array.isArray(characters) || characters.length !== D.members)
    throw new Error("Selecione quatro personagens.");
  const ids = characters.map((c) => String(c.id));
  if (new Set(ids).size !== D.members) throw new Error("Personagens duplicados.");
  for (const c of characters) {
    if (!Number.isSafeInteger(Number(c.id)) || Number(c.id) <= 0) throw new Error("Personagem inválido.");
    if (!(Number(c.account_id) === Number(accountId))) throw new Error("Os personagens devem pertencer à mesma conta.");
    if (!(Number(c.level) >= D.level)) throw new Error("Todos os personagens precisam de nível 100+.");
    if (!(Number(c.hp) > 0)) throw new Error("Todos os personagens precisam estar vivos.");
  }
  return { v: 1, accountId: Number(accountId), phase: "preparation", slots: ids,
    dead: [], killedDemons: [], arrived: [], eligible: [], claimed: [] };
}

function positions(state) {
  const source = state.phase === "preparation" ? D.preparation : D.entrance;
  return state.slots.map((id, index) => ({ id, ...((state.arrived || []).includes(id) ? D.exit[index] : source[index]) }));
}

function swap(state, characterId, targetSlot) {
  if (state.phase !== "preparation") throw new Error("O posicionamento só é permitido durante o preparo.");
  const from = state.slots.indexOf(String(characterId));
  if (from < 0 || !Number.isSafeInteger(targetSlot) || targetSlot < 0 || targetSlot >= D.members)
    throw new Error("Posição inválida.");
  [state.slots[from], state.slots[targetSlot]] = [state.slots[targetSlot], state.slots[from]];
  return positions(state);
}

function confirm(state) {
  if (state.phase !== "preparation") throw new Error("A alavanca já foi acionada.");
  if (state.slots.length !== D.members || new Set(state.slots).size !== D.members)
    throw new Error("Cada personagem precisa ocupar um SQM diferente.");
  state.phase = "combat";
  return { players: positions(state), demons: D.demons.map((point, index) => ({ id: "annihilator-demon-" + index, slug: "demon", ...point })) };
}

function die(state, characterId) {
  const id = String(characterId);
  if (!state.slots.includes(id) || !["combat", "exit"].includes(state.phase)) return false;
  if (!state.dead.includes(id)) state.dead.push(id);
  state.eligible = state.eligible.filter((entry) => entry !== id);
  if (state.dead.length === D.members) state.phase = "failed";
  return true;
}

function demonKilled(state, demonId, claims) {
  if (state.phase !== "combat") return false;
  const ids = D.demons.map((_, index) => "annihilator-demon-" + index);
  if (!ids.includes(demonId) || state.killedDemons.includes(demonId)) return false;
  state.killedDemons.push(demonId);
  if (state.killedDemons.length === D.demons.length) {
    state.phase = "exit";
    state.eligible = state.slots.filter((id) => !state.dead.includes(id) && !(claims && Object.hasOwn(claims, id)));
  }
  return true;
}

function arrived(state, characterId) {
  const id = String(characterId);
  if (state.phase !== "exit" || !state.slots.includes(id) || state.dead.includes(id)) return false;
  if (!state.arrived.includes(id)) state.arrived.push(id);
  if (state.slots.every((entry) => state.dead.includes(entry) || state.arrived.includes(entry))) state.phase = "rewards";
  return true;
}

function claim(state, claims, characterId, reward) {
  const id = String(characterId);
  if (state.phase !== "rewards" || !state.eligible.includes(id) || state.dead.includes(id))
    throw new Error("Este personagem não possui recompensa pendente.");
  if (!D.rewards.includes(reward)) throw new Error("Recompensa inválida.");
  if (Object.hasOwn(claims, id) || state.claimed.includes(id)) throw new Error("Este personagem já recebeu a recompensa.");
  if (Object.keys(claims).length >= D.accountRewardLimit) throw new Error("A conta já recebeu quatro recompensas.");
  claims[id] = { reward, claimedAt: Date.now() };
  state.claimed.push(id);
  return { accountId: state.accountId, characterId: id, item: reward, count: 1 };
}

function movementOverrides() {
  return [...D.preparation, ...D.demons, ...D.exit,
    ...Array.from({ length: 13 }, (_, i) => ({ x: 1020 + i, y: 1026, z: 7 }))];
}

module.exports = { create, positions, swap, confirm, die, demonKilled, arrived, claim, movementOverrides };
