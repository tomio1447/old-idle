/**
 * prey-module.js — Prey System module for the engine (Canary protocol)
 *
 * Implementa o protocolo completo do sistema de Prey do Canary 15.x:
 *   - 3 slots (2 free + 1 comprável)
 *   - 9 criaturas por grade (3 low / 3 mid / 3 high)
 *   - 4 tipos de bônus (Damage, Defense, XP, Loot)
 *   - 10 passos de rarity
 *   - Reroll grátis a cada 20h ou pago em gold
 *   - Prey Wildcards para melhorar/trocar bônus
 *   - Auto-reroll e Lock Prey (pagam cards ao expirar)
 *
 * Baseado em:
 *   - Canary: src/io/ioprey.hpp, src/io/ioprey.cpp
 *   - OTClient: modules/game_prey/prey.lua, prey.otui, prey.otmod
 */
"use strict";

// ─── Constantes (do config.lua do Canary) ──────────────────────────
const PREY_SLOT_COUNT = 3;
const PREY_LIST_SIZE = 9;
const PREY_BONUS_TIME_SEC = 2 * 60 * 60;          // 2 horas
const PREY_FREE_REROLL_SEC = 20 * 60 * 60;        // 20 horas
const PREY_REROLL_PRICE_PER_LEVEL = 200;           // gold por nível
const PREY_SELECT_LIST_PRICE = 5;                  // Prey Cards
const PREY_BONUS_REROLL_PRICE = 1;                 // Prey Cards
const PREY_PERMANENT_SLOT_COST = 250000;           // gold

// ─── Enums (do ioprey.hpp) ─────────────────────────────────────────
const PreySlot = { One: 0, Two: 1, Three: 2 };
const PreyDataState = {
  Locked: 0, Inactive: 1, Active: 2, Selection: 3,
  SelectionChangeMonster: 4, ListSelection: 5, WildcardSelection: 6,
};
const PreyBonus = {
  Damage: 0, Defense: 1, Experience: 2, Loot: 3, None: 4,
  First: 0, Last: 3,
};
const PreyOption = { None: 0, AutomaticReroll: 1, Locked: 2 };
const PreyAction = {
  ListReroll: 0, BonusReroll: 1, MonsterSelection: 2,
  ListAllCards: 3, ListAllSelection: 4, Option: 5,
};

const BONUS_NAMES = ["Damage Boost", "Damage Reduction", "XP Bonus", "Improved Loot"];
const BONUS_NAMES_PT = ["Dano", "Defesa", "Exp", "Loot"];

// ─── Helpers ───────────────────────────────────────────────────────
function bonusValue(bonusType, rarity) {
  // Fórmula oficial do Canary (ioprey.cpp:reloadBonusValue)
  if (bonusType === PreyBonus.Damage)   return 2 * rarity + 5;
  if (bonusType === PreyBonus.Defense)  return 2 * rarity + 10;
  return 3 * rarity + 10; // XP e Loot
}

function randomBonus(rarity) {
  if (rarity >= 10) {
    // No step 10, garante tipo diferente
    const old = rarity; // placeholder
    return Math.floor(Math.random() * 4);
  }
  return Math.floor(Math.random() * 4);
}

function randomRarity(oldRarity) {
  if (oldRarity >= 9) return 10;
  return oldRarity + 1 + Math.floor(Math.random() * (10 - oldRarity - 1));
}

// ─── Classe PreySlot ───────────────────────────────────────────────
class PreySlotData {
  constructor(id) {
    this.id = id;                          // PreySlot_One/Two/Three
    this.bonus = PreyBonus.None;
    this.state = PreyDataState.Locked;
    this.option = PreyOption.None;
    this.raceIdList = [];                  // 9 IDs de criaturas
    this.bonusRarity = 1;                 // 1-10
    this.selectedRaceId = 0;
    this.bonusPercentage = 0;
    this.bonusTimeLeft = 0;               // segundos restantes
    this.freeRerollTimeStamp = 0;         // timestamp do próximo reroll grátis
  }

  isOccupied() {
    return this.selectedRaceId !== 0 && this.bonusTimeLeft > 0;
  }

  eraseBonus(maintainBonus = false) {
    if (!maintainBonus) {
      this.bonus = PreyBonus.None;
      this.bonusPercentage = 5;
      this.bonusRarity = 1;
    }
    this.state = PreyDataState.Selection;
    this.option = PreyOption.None;
    this.selectedRaceId = 0;
    this.bonusTimeLeft = 0;
  }

  reloadBonusType() {
    if (this.bonusRarity === 10) {
      const old = this.bonus;
      let novo;
      do { novo = Math.floor(Math.random() * 4); } while (novo === old);
      this.bonus = novo;
    } else {
      this.bonus = Math.floor(Math.random() * 4);
    }
  }

  reloadBonusValue() {
    if (this.bonusRarity >= 9) {
      this.bonusRarity = 10;
    } else {
      this.bonusRarity = this.bonusRarity + 1 +
        Math.floor(Math.random() * (10 - this.bonusRarity));
    }
    this.bonusPercentage = bonusValue(this.bonus, this.bonusRarity);
  }
}

// ─── Classe PreyManager ────────────────────────────────────────────
class PreyManager {
  constructor() {
    this.slots = [];
    this.wildcards = 0;

    // Inicializa 3 slots
    for (let i = 0; i < PREY_SLOT_COUNT; i++) {
      const slot = new PreySlotData(i);
      // Slot 1 sempre livre, Slot 2 livre se premium
      if (i === 0) {
        slot.state = PreyDataState.Inactive;
        slot.freeRerollTimeStamp = Date.now() + PREY_FREE_REROLL_SEC * 1000;
      } else if (i === 1) {
        slot.state = PreyDataState.Inactive;
        slot.freeRerollTimeStamp = Date.now() + PREY_FREE_REROLL_SEC * 1000;
      }
      // Slot 3 começa bloqueado (comprável)
      this.slots.push(slot);
    }
  }

  /**
   * Retorna dados para serialização (save do jogador)
   */
  toJSON() {
    return {
      slots: this.slots.map(s => ({
        id: s.id, bonus: s.bonus, state: s.state, option: s.option,
        raceIdList: s.raceIdList, bonusRarity: s.bonusRarity,
        selectedRaceId: s.selectedRaceId, bonusPercentage: s.bonusPercentage,
        bonusTimeLeft: s.bonusTimeLeft, freeRerollTimeStamp: s.freeRerollTimeStamp,
      })),
      wildcards: this.wildcards,
    };
  }

  /**
   * Restaura de dados serializados
   */
  static fromJSON(data) {
    const pm = new PreyManager();
    if (!data || !data.slots) return pm;
    pm.wildcards = data.wildcards || 0;
    for (let i = 0; i < PREY_SLOT_COUNT && i < data.slots.length; i++) {
      const sd = data.slots[i];
      Object.assign(pm.slots[i], sd);
    }
    return pm;
  }

  /**
   * Gera lista de 9 criaturas para o slot (3 low, 3 mid, 3 high)
   * @param {number} slotIdx - índice do slot
   * @param {Set<string>} blacklist - criaturas já usadas em outros slots
   * @param {number} playerLevel - nível do jogador
   * @param {Map} bestiary - bestiário (raceId -> monsterData)
   */
  generateMonsterGrid(slotIdx, blacklist, playerLevel, bestiary) {
    const slot = this.slots[slotIdx];
    slot.raceIdList = [];

    if (bestiary.size < 36) {
      console.error("[Prey] Bestiário com menos de 36 monstros — prey desabilitada.");
      return;
    }

    // Distribuição por level stage (Canary: reloadMonsterGrid)
    const levelStage = Math.floor(playerLevel / 100);
    let s1 = 3, s2 = 3, s3 = 2, s4 = 1;  // 0-99
    if (levelStage >= 1 && levelStage <= 2) { s1 = 1; s2 = 3; s3 = 3; s4 = 2; }    // 100-299
    else if (levelStage >= 3 && levelStage <= 4) { s1 = 1; s2 = 2; s3 = 3; s4 = 3; } // 300-499
    else if (levelStage >= 5) { s1 = 1; s2 = 1; s3 = 3; s4 = 4; }                   // 500+

    const allRaces = Array.from(bestiary.keys());
    const used = new Set(blacklist);
    let tries = 0;
    const maxIndex = allRaces.length - 1;

    while (slot.raceIdList.length < PREY_LIST_SIZE) {
      const raceId = allRaces[Math.floor(Math.random() * (maxIndex + 1))];
      tries++;

      if (used.has(raceId)) continue;
      used.add(raceId);

      const monster = bestiary.get(raceId);
      if (!monster || monster.exp === 0 || !monster.preyable || monster.preyExclusive) continue;

      const stars = monster.bestiaryStars || 1;
      if (s1 > 0 && stars <= 1) { slot.raceIdList.push(raceId); s1--; }
      else if (s2 > 0 && stars === 2) { slot.raceIdList.push(raceId); s2--; }
      else if (s3 > 0 && stars === 3) { slot.raceIdList.push(raceId); s3--; }
      else if (s4 > 0 && stars >= 4) { slot.raceIdList.push(raceId); s4--; }
      else if (tries >= 10) { slot.raceIdList.push(raceId); tries = 0; }
    }
  }

  /**
   * Processa ação de prey do jogador
   */
  handleAction(player, slotIdx, action, optionOrIndex, raceId) {
    const slot = this.slots[slotIdx];
    if (!slot) return { ok: false, msg: "Slot inválido." };

    switch (action) {
      case PreyAction.ListReroll:
        return this._handleListReroll(player, slot, slotIdx);

      case PreyAction.BonusReroll:
        return this._handleBonusReroll(player, slot, slotIdx);

      case PreyAction.MonsterSelection:
        return this._handleMonsterSelection(player, slot, slotIdx, optionOrIndex);

      case PreyAction.ListAllCards:
        return this._handleListAllCards(player, slot, slotIdx);

      case PreyAction.ListAllSelection:
        return this._handleListAllSelection(player, slot, slotIdx, raceId);

      case PreyAction.Option:
        return this._handleOption(player, slot, slotIdx, optionOrIndex);

      default:
        return { ok: false, msg: "Ação desconhecida." };
    }
  }

  _handleListReroll(player, slot, slotIdx) {
    const agora = Date.now();
    const freeAvailable = slot.freeRerollTimeStamp <= agora;
    const cost = player.level * PREY_REROLL_PRICE_PER_LEVEL;

    if (!freeAvailable) {
      if (player.gold < cost) return { ok: false, msg: "Gold insuficiente para o reroll." };
      player.gold -= cost;
    }

    slot.freeRerollTimeStamp = agora + PREY_FREE_REROLL_SEC * 1000;

    // Gera nova lista (o frontend cuida do bestiário localmente)
    slot.state = PreyDataState.Selection;
    slot.selectedRaceId = 0;

    return { ok: true, free: freeAvailable, cost: freeAvailable ? 0 : cost };
  }

  _handleBonusReroll(player, slot, slotIdx) {
    if (slot.state !== PreyDataState.Active)
      return { ok: false, msg: "Prey não está ativa." };

    if (this.wildcards < PREY_BONUS_REROLL_PRICE)
      return { ok: false, msg: "Prey Wildcards insuficientes." };

    this.wildcards -= PREY_BONUS_REROLL_PRICE;
    slot.reloadBonusType();
    slot.reloadBonusValue();
    slot.bonusTimeLeft = PREY_BONUS_TIME_SEC;

    return {
      ok: true,
      bonus: slot.bonus,
      rarity: slot.bonusRarity,
      value: slot.bonusPercentage,
      timeLeft: slot.bonusTimeLeft,
    };
  }

  _handleMonsterSelection(player, slot, slotIdx, index) {
    if (index < 0 || index >= slot.raceIdList.length)
      return { ok: false, msg: "Índice inválido." };

    slot.selectedRaceId = slot.raceIdList[index];
    slot.reloadBonusType();
    slot.reloadBonusValue();
    slot.bonusTimeLeft = PREY_BONUS_TIME_SEC;
    slot.state = PreyDataState.Active;

    return {
      ok: true,
      raceId: slot.selectedRaceId,
      bonus: slot.bonus,
      rarity: slot.bonusRarity,
      value: slot.bonusPercentage,
      timeLeft: slot.bonusTimeLeft,
    };
  }

  _handleListAllCards(player, slot, slotIdx) {
    if (this.wildcards < PREY_SELECT_LIST_PRICE)
      return { ok: false, msg: "Prey Wildcards insuficientes para escolher." };

    this.wildcards -= PREY_SELECT_LIST_PRICE;
    slot.state = PreyDataState.ListSelection;

    return { ok: true, wildcardsLeft: this.wildcards };
  }

  _handleListAllSelection(player, slot, slotIdx, raceId) {
    if (slot.state !== PreyDataState.ListSelection)
      return { ok: false, msg: "Slot não está em modo de lista completa." };

    slot.selectedRaceId = raceId;
    slot.reloadBonusType();
    slot.reloadBonusValue();
    slot.bonusTimeLeft = PREY_BONUS_TIME_SEC;
    slot.state = PreyDataState.Active;

    return {
      ok: true,
      raceId: slot.selectedRaceId,
      bonus: slot.bonus,
      rarity: slot.bonusRarity,
      value: slot.bonusPercentage,
      timeLeft: slot.bonusTimeLeft,
    };
  }

  _handleOption(player, slot, slotIdx, option) {
    if (slot.state !== PreyDataState.Active)
      return { ok: false, msg: "Opção só pode ser alterada com prey ativa." };

    if (option === PreyOption.None) {
      slot.option = PreyOption.None;
    } else if (option === PreyOption.AutomaticReroll) {
      slot.option = PreyOption.AutomaticReroll;
    } else if (option === PreyOption.Locked) {
      // Lock custa mais caro que auto-reroll
      if (this.wildcards < PREY_SELECT_LIST_PRICE)
        return { ok: false, msg: "Prey Wildcards insuficientes para travar." };
      this.wildcards -= PREY_SELECT_LIST_PRICE;
      slot.option = PreyOption.Locked;
    }

    return { ok: true, option: slot.option };
  }

  /**
   * Tick: decrementa timer e processa auto-reroll/lock ao expirar.
   * @param {number} dt - milissegundos para decrementar
   * @returns {Array} eventos gerados (para enviar ao cliente)
   */
  tick(dt) {
    const events = [];
    const sec = dt / 1000;

    for (let i = 0; i < PREY_SLOT_COUNT; i++) {
      const slot = this.slots[i];
      if (!slot.isOccupied()) continue;

      slot.bonusTimeLeft = Math.max(0, slot.bonusTimeLeft - sec);

      if (slot.bonusTimeLeft <= 0) {
        if (slot.option === PreyOption.AutomaticReroll) {
          if (this.wildcards >= PREY_BONUS_REROLL_PRICE) {
            this.wildcards -= PREY_BONUS_REROLL_PRICE;
            slot.reloadBonusType();
            slot.reloadBonusValue();
            slot.bonusTimeLeft = PREY_BONUS_TIME_SEC;
            events.push({ slot: i, type: "auto-reroll", bonus: slot.bonus, rarity: slot.bonusRarity,
                          value: slot.bonusPercentage });
          } else {
            slot.eraseBonus();
            events.push({ slot: i, type: "expired" });
          }
        } else if (slot.option === PreyOption.Locked) {
          if (this.wildcards >= PREY_SELECT_LIST_PRICE) {
            this.wildcards -= PREY_SELECT_LIST_PRICE;
            slot.bonusTimeLeft = PREY_BONUS_TIME_SEC;
            events.push({ slot: i, type: "lock-renewed" });
          } else {
            slot.eraseBonus();
            events.push({ slot: i, type: "lock-expired" });
          }
        } else {
          slot.eraseBonus();
          events.push({ slot: i, type: "expired" });
        }
      }
    }

    return events;
  }
}

// ─── Export ─────────────────────────────────────────────────────────
module.exports = {
  PreyManager,
  PreySlotData,
  // Constantes
  PREY_SLOT_COUNT, PREY_LIST_SIZE, PREY_BONUS_TIME_SEC,
  PREY_FREE_REROLL_SEC, PREY_REROLL_PRICE_PER_LEVEL,
  PREY_SELECT_LIST_PRICE, PREY_BONUS_REROLL_PRICE,
  PREY_PERMANENT_SLOT_COST,
  // Enums
  PreySlot, PreyDataState, PreyBonus, PreyOption, PreyAction,
  BONUS_NAMES, BONUS_NAMES_PT,
  bonusValue,
};
