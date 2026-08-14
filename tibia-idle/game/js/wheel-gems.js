/* =========================================================================
 * wheel-gems.js — Gem Atelier + Fragment Workshop (Canary wheel_gems.cpp
 * + OTC gematelier.lua / workshop.lua / icons.lua).
 *
 * Qualities: lesser / regular / greater. Grades I–IV (mul 1.0 / 1.1 / 1.2 / 1.5).
 * Grades are global per modifier. Later gem slots cannot exceed previous slot grade.
 * Vessel resonance (3 maxed nodes per colour) unlocks lesser / regular / supreme slots.
 * ========================================================================= */
"use strict";

var _WHEEL_SLOTS = (typeof WHEEL_SLOTS !== "undefined") ? WHEEL_SLOTS
  : (typeof require === "function" ? require("./wheeldata.js").WHEEL_SLOTS : {});

var WHEEL_GEM_AFFINITIES = ["green", "red", "blue", "purple"];
var WHEEL_GEM_QUALITIES = ["lesser", "regular", "greater"];
var WHEEL_GEM_GRADE_MUL = [1, 1.1, 1.2, 1.5];

var WHEEL_VESSEL_SLOTS = {
  green: ["GREEN_50", "GREEN_TOP_100", "GREEN_BOTTOM_150"],
  red: ["RED_TOP_75", "RED_TOP_150", "RED_BOTTOM_100"],
  blue: ["BLUE_TOP_100", "BLUE_BOTTOM_75", "BLUE_BOTTOM_150"],
  purple: ["PURPLE_50", "PURPLE_TOP_150", "PURPLE_BOTTOM_100"],
};

var WHEEL_GEM_REVEAL_PRICE = [125000, 1000000, 6000000];
var WHEEL_GEM_SWITCH_PRICE = [125000, 250000, 1000000];
var WHEEL_GEM_BUY_PRICE = [250000, 1000000, 5000000];
var WHEEL_FRAG_BUY = { lesser: 750000, greater: 5000000 };
var WHEEL_GEM_MAX = 225;

var WHEEL_GEM_UPGRADE = {
  basic: [{ frag: 5, gold: 2000000 }, { frag: 15, gold: 5000000 }, { frag: 30, gold: 30000000 }],
  supreme: [{ frag: 5, gold: 5000000 }, { frag: 15, gold: 12500000 }, { frag: 30, gold: 75000000 }],
};

var WHEEL_GEM_SMASH = {
  lesser: { kind: "lesser", unrevealed: [1, 2], revealed: [1, 3] },
  regular: { kind: "lesser", unrevealed: [2, 4], revealed: [2, 5] },
  greater: { kind: "greater", unrevealed: [1, 2], revealed: [1, 3] },
};

var WHEEL_GEM_HP = {
  Vocation_Health: { knight: 300, paladin: 200, sorcerer: 100, druid: 100, monk: 200 },
  Vocation_Health_FireResistance: { knight: 150, paladin: 100, sorcerer: 50, druid: 50, monk: 100 },
  Vocation_Health_EnergyResistance: { knight: 150, paladin: 100, sorcerer: 50, druid: 50, monk: 100 },
  Vocation_Health_EarthResistance: { knight: 150, paladin: 100, sorcerer: 50, druid: 50, monk: 100 },
  Vocation_Health_IceResistance: { knight: 150, paladin: 100, sorcerer: 50, druid: 50, monk: 100 },
  Vocation_Mixed: { knight: 150, paladin: 100, sorcerer: 50, druid: 50, monk: 100 },
};
var WHEEL_GEM_MP = {
  Vocation_Mana: { knight: 100, paladin: 300, sorcerer: 600, druid: 600, monk: 200 },
  Vocation_Mana_FireResistance: { knight: 50, paladin: 150, sorcerer: 300, druid: 300, monk: 100 },
  Vocation_Mana_EnergyResistance: { knight: 50, paladin: 150, sorcerer: 300, druid: 300, monk: 100 },
  Vocation_Mana_Earth_Resistance: { knight: 50, paladin: 150, sorcerer: 300, druid: 300, monk: 100 },
  Vocation_Mana_Ice_Resistance: { knight: 50, paladin: 150, sorcerer: 300, druid: 300, monk: 100 },
  Vocation_Mixed: { paladin: 100, sorcerer: 150, druid: 150, monk: 100 },
};
var WHEEL_GEM_CAPV = {
  Vocation_Capacity: { knight: 500, paladin: 400, sorcerer: 200, druid: 200, monk: 400 },
  Vocation_Capacity_FireResistance: { knight: 250, paladin: 200, sorcerer: 100, druid: 100, monk: 200 },
  Vocation_Capacity_EnergyResistance: { knight: 250, paladin: 200, sorcerer: 100, druid: 100, monk: 200 },
  Vocation_Capacity_EarthResistance: { knight: 250, paladin: 200, sorcerer: 100, druid: 100, monk: 200 },
  Vocation_Capacity_IceResistance: { knight: 250, paladin: 200, sorcerer: 100, druid: 100, monk: 200 },
  Vocation_Mixed: { knight: 125 },
};

var WHEEL_BASIC_MODS = {
  General_PhysicalResistance: { label: "+1% Physical Resistance", resist: { physical: 1 } },
  General_HolyResistance: { label: "+1% Holy Resistance", resist: { holy: 1 } },
  General_DeathResistance: { label: "+1% Death Resistance", resist: { death: 1 } },
  General_FireResistance: { label: "+2% Fire Resistance", resist: { fire: 2 } },
  General_EarthResistance: { label: "+2% Earth Resistance", resist: { earth: 2 } },
  General_IceResistance: { label: "+2% Ice Resistance", resist: { ice: 2 } },
  General_EnergyResistance: { label: "+2% Energy Resistance", resist: { energy: 2 } },
  General_HolyResistance_DeathWeakness: { label: "+1.5% Holy / -1% Death", resist: { holy: 1.5, death: -1 } },
  General_DeathResistance_HolyWeakness: { label: "+1.5% Death / -1% Holy", resist: { death: 1.5, holy: -1 } },
  General_FireResistance_EarthResistance: { label: "+1% Fire / +1% Earth", resist: { fire: 1, earth: 1 } },
  General_FireResistance_IceResistance: { label: "+1% Fire / +1% Ice", resist: { fire: 1, ice: 1 } },
  General_FireResistance_EnergyResistance: { label: "+1% Fire / +1% Energy", resist: { fire: 1, energy: 1 } },
  General_EarthResistance_IceResistance: { label: "+1% Earth / +1% Ice", resist: { earth: 1, ice: 1 } },
  General_EarthResistance_EnergyResistance: { label: "+1% Earth / +1% Energy", resist: { earth: 1, energy: 1 } },
  General_IceResistance_EnergyResistance: { label: "+1% Ice / +1% Energy", resist: { ice: 1, energy: 1 } },
  General_FireResistance_EarthWeakness: { label: "+3% Fire / -2% Earth", resist: { fire: 3, earth: -2 } },
  General_FireResistance_IceWeakness: { label: "+3% Fire / -2% Ice", resist: { fire: 3, ice: -2 } },
  General_FireResistance_EnergyWeakness: { label: "+3% Fire / -2% Energy", resist: { fire: 3, energy: -2 } },
  General_EarthResistance_FireWeakness: { label: "+3% Earth / -2% Fire", resist: { earth: 3, fire: -2 } },
  General_EarthResistance_IceWeakness: { label: "+3% Earth / -2% Ice", resist: { earth: 3, ice: -2 } },
  General_EarthResistance_EnergyWeakness: { label: "+3% Earth / -2% Energy", resist: { earth: 3, energy: -2 } },
  General_IceResistance_EarthWeakness: { label: "+3% Ice / -2% Earth", resist: { ice: 3, earth: -2 } },
  General_IceResistance_FireWeakness: { label: "+3% Ice / -2% Fire", resist: { ice: 3, fire: -2 } },
  General_IceResistance_EnergyWeakness: { label: "+3% Ice / -2% Energy", resist: { ice: 3, energy: -2 } },
  General_EnergyResistance_EarthWeakness: { label: "+3% Energy / -2% Earth", resist: { energy: 3, earth: -2 } },
  General_EnergyResistance_IceWeakness: { label: "+3% Energy / -2% Ice", resist: { energy: 3, ice: -2 } },
  General_EnergyResistance_FireWeakness: { label: "+3% Energy / -2% Fire", resist: { energy: 3, fire: -2 } },
  General_ManaDrainResistance: { label: "+3% Mana Drain Resistance", resist: { manadrain: 3 } },
  General_LifeDrainResistance: { label: "+3% Life Drain Resistance", resist: { lifedrain: 3 } },
  General_ManaDrainResistance_LifeDrainResistance: { label: "+1.5% Mana/Life Drain", resist: { manadrain: 1.5, lifedrain: 1.5 } },
  General_MitigationMultiplier: { label: "+5% Mitigation", mitigation: 5 },
  Vocation_Health: { label: "Vocation Health", hpKey: "Vocation_Health" },
  Vocation_Mana_FireResistance: { label: "Mana + Fire Res", mpKey: "Vocation_Mana_FireResistance", resist: { fire: 1 } },
  Vocation_Mana_EnergyResistance: { label: "Mana + Energy Res", mpKey: "Vocation_Mana_EnergyResistance", resist: { energy: 1 } },
  Vocation_Mana_Earth_Resistance: { label: "Mana + Earth Res", mpKey: "Vocation_Mana_Earth_Resistance", resist: { earth: 1 } },
  Vocation_Mana_Ice_Resistance: { label: "Mana + Ice Res", mpKey: "Vocation_Mana_Ice_Resistance", resist: { ice: 1 } },
  Vocation_Mana: { label: "Vocation Mana", mpKey: "Vocation_Mana" },
  Vocation_Health_FireResistance: { label: "Health + Fire Res", hpKey: "Vocation_Health_FireResistance", resist: { fire: 1 } },
  Vocation_Health_EnergyResistance: { label: "Health + Energy Res", hpKey: "Vocation_Health_EnergyResistance", resist: { energy: 1 } },
  Vocation_Health_EarthResistance: { label: "Health + Earth Res", hpKey: "Vocation_Health_EarthResistance", resist: { earth: 1 } },
  Vocation_Health_IceResistance: { label: "Health + Ice Res", hpKey: "Vocation_Health_IceResistance", resist: { ice: 1 } },
  Vocation_Mixed: { label: "Mixed HP/Mana/Cap", hpKey: "Vocation_Mixed", mpKey: "Vocation_Mixed", capKey: "Vocation_Mixed" },
  Vocation_Capacity_FireResistance: { label: "Cap + Fire Res", capKey: "Vocation_Capacity_FireResistance", resist: { fire: 1 } },
  Vocation_Capacity_EnergyResistance: { label: "Cap + Energy Res", capKey: "Vocation_Capacity_EnergyResistance", resist: { energy: 1 } },
  Vocation_Capacity_EarthResistance: { label: "Cap + Earth Res", capKey: "Vocation_Capacity_EarthResistance", resist: { earth: 1 } },
  Vocation_Capacity_IceResistance: { label: "Cap + Ice Res", capKey: "Vocation_Capacity_IceResistance", resist: { ice: 1 } },
  Vocation_Capacity: { label: "Vocation Capacity", capKey: "Vocation_Capacity" },
};

var WHEEL_SUPREME_MODS = {
  General_Dodge: { label: "+0.28% Dodge", dodge: 0.28 },
  General_LifeLeech: { label: "+2% Life Leech", lifeLeech: 2 },
  General_ManaLeech: { label: "+0.8% Mana Leech", manaLeech: 0.8 },
  General_CriticalDamage: { label: "+2% Critical Extra Damage", critDamage: 2 },
  General_RevelationMastery_GiftOfLife: { label: "RM Gift of Life", revelation: "green", revelationPts: 150 },
  SorcererDruid_UltimateHealing: { label: "Aug. Ultimate Healing", vocs: ["sorcerer", "druid"], spell: "Ultimate Healing", heal: 5 },

  Knight_RevelationMastery_ExecutionersThrow: { label: "RM Executioner's Throw", voc: "knight", revelation: "red", revelationPts: 150 },
  Knight_RevelationMastery_AvatarOfSteel: { label: "RM Avatar of Steel", voc: "knight", revelation: "purple", revelationPts: 150 },
  Knight_RevelationMastery_CombatMastery: { label: "RM Combat Mastery", voc: "knight", revelation: "blue", revelationPts: 150 },
  Knight_AvatarOfSteel_Cooldown: { label: "Aug. Avatar of Steel CD", voc: "knight", spell: "Avatar of Steel", cooldownMs: 900000, momentum: true },
  Knight_ExecutionersThrow_Cooldown: { label: "Aug. Executioner's Throw CD", voc: "knight", spell: "Executioner's Throw", cooldownMs: 2000, momentum: true },
  Knight_ExecutionersThrow_DamageIncrease: { label: "Aug. Executioner's Throw dmg", voc: "knight", spell: "Executioner's Throw", damage: 6 },
  Knight_ExecutionersThrow_CriticalExtraDamage: { label: "Aug. Executioner's Throw crit", voc: "knight", spell: "Executioner's Throw", critDamage: 12, spellCritChance: 10 },
  Knight_Fierce_Berserk_DamageIncrease: { label: "Aug. Fierce Berserk dmg", voc: "knight", spell: "Fierce Berserk", damage: 5 },
  Knight_Fierce_Berserk_CriticalExtraDamage: { label: "Aug. Fierce Berserk crit", voc: "knight", spell: "Fierce Berserk", critDamage: 8, spellCritChance: 10 },
  Knight_Berserk_DamageIncrease: { label: "Aug. Berserk dmg", voc: "knight", spell: "Berserk", damage: 5 },
  Knight_Berserk_CriticalExtraDamage: { label: "Aug. Berserk crit", voc: "knight", spell: "Berserk", critDamage: 12, spellCritChance: 10 },
  Knight_Front_Sweep_DamageIncrease: { label: "Aug. Front Sweep dmg", voc: "knight", spell: "Front Sweep", damage: 8 },
  Knight_Front_Sweep_CriticalExtraDamage: { label: "Aug. Front Sweep crit", voc: "knight", spell: "Front Sweep", critDamage: 12, spellCritChance: 10 },
  Knight_Groundshaker_DamageIncrease: { label: "Aug. Groundshaker dmg", voc: "knight", spell: "Groundshaker", damage: 6.5 },
  Knight_Groundshaker_CriticalExtraDamage: { label: "Aug. Groundshaker crit", voc: "knight", spell: "Groundshaker", critDamage: 12, spellCritChance: 10 },
  Knight_Annihilation_DamageIncrease: { label: "Aug. Annihilation dmg", voc: "knight", spell: "Annihilation", damage: 12 },
  Knight_Annihilation_CriticalExtraDamage: { label: "Aug. Annihilation crit", voc: "knight", spell: "Annihilation", critDamage: 15, spellCritChance: 10 },
  Knight_FairWoundCleansing_HealingIncrease: { label: "Aug. Fair Wound Cleansing", voc: "knight", spell: "Fair Wound Cleansing", heal: 10 },

  Paladin_RevelationMastery_DivineGrenade: { label: "RM Divine Grenade", voc: "paladin", revelation: "red", revelationPts: 150 },
  Paladin_RevelationMastery_AvatarOfLight: { label: "RM Avatar of Light", voc: "paladin", revelation: "purple", revelationPts: 150 },
  Paladin_RevelationMastery_DivineEmpowerment: { label: "RM Divine Empowerment", voc: "paladin", revelation: "blue", revelationPts: 150 },
  Paladin_AvatarOfLight_Cooldown: { label: "Aug. Avatar of Light CD", voc: "paladin", spell: "Avatar of Light", cooldownMs: 900000, momentum: true },
  Paladin_DivineDazzle_Cooldown: { label: "Aug. Divine Dazzle CD", voc: "paladin", spell: "Divine Dazzle", cooldownMs: 4000, momentum: true },
  Paladin_DivineGrenade_DamageIncrease: { label: "Aug. Divine Grenade dmg", voc: "paladin", spell: "Divine Grenade", damage: 6 },
  Paladin_DivineGrenade_CriticalExtraDamage: { label: "Aug. Divine Grenade crit", voc: "paladin", spell: "Divine Grenade", critDamage: 12, spellCritChance: 10 },
  Paladin_DivineCaldera_DamageIncrease: { label: "Aug. Divine Caldera dmg", voc: "paladin", spell: "Divine Caldera", damage: 5 },
  Paladin_DivineCaldera_CriticalExtraDamage: { label: "Aug. Divine Caldera crit", voc: "paladin", spell: "Divine Caldera", critDamage: 12, spellCritChance: 10 },
  Paladin_DivineMissile_DamageIncrease: { label: "Aug. Divine Missile dmg", voc: "paladin", spell: "Divine Missile", damage: 8 },
  Paladin_DivineMissile_CriticalExtraDamage: { label: "Aug. Divine Missile crit", voc: "paladin", spell: "Divine Missile", critDamage: 12, spellCritChance: 10 },
  Paladin_EtherealSpear_DamageIncrease: { label: "Aug. Ethereal Spear dmg", voc: "paladin", spell: "Ethereal Spear", damage: 10 },
  Paladin_EtherealSpear_CriticalExtraDamage: { label: "Aug. Ethereal Spear crit", voc: "paladin", spell: "Ethereal Spear", critDamage: 15, spellCritChance: 10 },
  Paladin_StrongEtherealSpear_DamageIncrease: { label: "Aug. Strong Ethereal Spear dmg", voc: "paladin", spell: "Strong Ethereal Spear", damage: 8 },
  Paladin_StrongEtherealSpear_CriticalExtraDamage: { label: "Aug. Strong Ethereal Spear crit", voc: "paladin", spell: "Strong Ethereal Spear", critDamage: 12, spellCritChance: 10 },
  Paladin_DivineEmpowerment_Cooldown: { label: "Aug. Divine Empowerment CD", voc: "paladin", spell: "Divine Empowerment", cooldownMs: 6000, momentum: true },
  Paladin_DivineGrenade_Cooldown: { label: "Aug. Divine Grenade CD", voc: "paladin", spell: "Divine Grenade", cooldownMs: 2000, momentum: true },
  Paladin_Salvation_HealingIncrease: { label: "Aug. Salvation", voc: "paladin", spell: "Salvation", heal: 6 },

  Sorcerer_RevelationMastery_BeamMastery: { label: "RM Beam Mastery", voc: "sorcerer", revelation: "red", revelationPts: 150 },
  Sorcerer_RevelationMastery_AvatarOfStorm: { label: "RM Avatar of Storm", voc: "sorcerer", revelation: "purple", revelationPts: 150 },
  Sorcerer_RevelationMastery_DrainBody: { label: "RM Drain Body", voc: "sorcerer", revelation: "blue", revelationPts: 150 },
  Sorcerer_AvatarOfStorm_Cooldown: { label: "Aug. Avatar of Storm CD", voc: "sorcerer", spell: "Avatar of Storm", cooldownMs: 900000, momentum: true },
  Sorcerer_EnergyWave_Cooldown: { label: "Aug. Energy Wave CD", voc: "sorcerer", spell: "Energy Wave", cooldownMs: 1000, momentum: true },
  Sorcerer_GreatDeathBeam_DamageIncrease: { label: "Aug. Great Death Beam dmg", voc: "sorcerer", spell: "Great Death Beam", damage: 10 },
  Sorcerer_GreatDeathBeam_CriticalExtraDamage: { label: "Aug. Great Death Beam crit", voc: "sorcerer", spell: "Great Death Beam", critDamage: 15, spellCritChance: 10 },
  Sorcerer_HellsCore_DamageIncrease: { label: "Aug. Hell's Core dmg", voc: "sorcerer", spell: "Hell's Core", damage: 8 },
  Sorcerer_HellsCore_CriticalExtraDamage: { label: "Aug. Hell's Core crit", voc: "sorcerer", spell: "Hell's Core", critDamage: 12, spellCritChance: 10 },
  Sorcerer_EnergyWave_DamageIncrease: { label: "Aug. Energy Wave dmg", voc: "sorcerer", spell: "Energy Wave", damage: 5 },
  Sorcerer_EnergyWave_CriticalExtraDamage: { label: "Aug. Energy Wave crit", voc: "sorcerer", spell: "Energy Wave", critDamage: 12, spellCritChance: 10 },
  Sorcerer_GreatFireWave_DamageIncrease: { label: "Aug. Great Fire Wave dmg", voc: "sorcerer", spell: "Great Fire Wave", damage: 5 },
  Sorcerer_GreatFireWave_CriticalExtraDamage: { label: "Aug. Great Fire Wave crit", voc: "sorcerer", spell: "Great Fire Wave", critDamage: 8, spellCritChance: 10 },
  Sorcerer_RageOfTheSkies_DamageIncrease: { label: "Aug. Rage of the Skies dmg", voc: "sorcerer", spell: "Rage of the Skies", damage: 8 },
  Sorcerer_RageOfTheSkies_CriticalExtraDamage: { label: "Aug. Rage of the Skies crit", voc: "sorcerer", spell: "Rage of the Skies", critDamage: 12, spellCritChance: 10 },
  Sorcerer_GreatEnergyBeam_DamageIncrease: { label: "Aug. Great Energy Beam dmg", voc: "sorcerer", spell: "Great Energy Beam", damage: 10 },
  Sorcerer_GreatEnergyBeam_CriticalExtraDamage: { label: "Aug. Great Energy Beam crit", voc: "sorcerer", spell: "Great Energy Beam", critDamage: 15, spellCritChance: 10 },

  Druid_RevelationMastery_BlessingOfTheGrove: { label: "RM Blessing of the Grove", voc: "druid", revelation: "red", revelationPts: 150 },
  Druid_RevelationMastery_AvatarOfNature: { label: "RM Avatar of Nature", voc: "druid", revelation: "purple", revelationPts: 150 },
  Druid_RevelationMastery_TwinBursts: { label: "RM Twin Burst", voc: "druid", revelation: "blue", revelationPts: 150 },
  Druid_AvatarOfNature_Cooldown: { label: "Aug. Avatar of Nature CD", voc: "druid", spell: "Avatar of Nature", cooldownMs: 900000, momentum: true },
  Druid_NaturesEmbrace_Cooldown: { label: "Aug. Nature's Embrace CD", voc: "druid", spell: "Nature's Embrace", cooldownMs: 5000, momentum: true },
  Druid_TerraBurst_DamageIncrease: { label: "Aug. Terra Burst dmg", voc: "druid", spell: "Terra Burst", damage: 7 },
  Druid_TerraBurst_CriticalExtraDamage: { label: "Aug. Terra Burst crit", voc: "druid", spell: "Terra Burst", critDamage: 12, spellCritChance: 10 },
  Druid_IceBurst_DamageIncrease: { label: "Aug. Ice Burst dmg", voc: "druid", spell: "Ice Burst", damage: 7 },
  Druid_IceBurst_CriticalExtraDamage: { label: "Aug. Ice Burst crit", voc: "druid", spell: "Ice Burst", critDamage: 12, spellCritChance: 10 },
  Druid_EternalWinter_DamageIncrease: { label: "Aug. Eternal Winter dmg", voc: "druid", spell: "Eternal Winter", damage: 8 },
  Druid_EternalWinter_CriticalExtraDamage: { label: "Aug. Eternal Winter crit", voc: "druid", spell: "Eternal Winter", critDamage: 12, spellCritChance: 10 },
  Druid_TerraWave_DamageIncrease: { label: "Aug. Terra Wave dmg", voc: "druid", spell: "Terra Wave", damage: 5 },
  Druid_TerraWave_CriticalExtraDamage: { label: "Aug. Terra Wave crit", voc: "druid", spell: "Terra Wave", critDamage: 12, spellCritChance: 10 },
  Druid_StrongIceWave_DamageIncrease: { label: "Aug. Strong Ice Wave dmg", voc: "druid", spell: "Strong Ice Wave", damage: 8 },
  Druid_StrongIceWave_CriticalExtraDamage: { label: "Aug. Strong Ice Wave crit", voc: "druid", spell: "Strong Ice Wave", critDamage: 15, spellCritChance: 10 },
  Druid_HealFriend_HealingIncrease: { label: "Aug. Heal Friend", voc: "druid", spell: "Heal Friend", heal: 5 },
  Druid_MassHealing_HealingIncrease: { label: "Aug. Mass Healing", voc: "druid", spell: "Mass Healing", heal: 5 },

  Monk_RevelationMastery_SpiritualBurst: { label: "RM Spiritual Outburst", voc: "monk", revelation: "red", revelationPts: 150 },
  Monk_RevelationMastery_AvatarOfBalance: { label: "RM Avatar of Balance", voc: "monk", revelation: "purple", revelationPts: 150 },
  Monk_RevelationMastery_Ascetic: { label: "RM Ascetic", voc: "monk", revelation: "blue", revelationPts: 150 },
  Monk_AvatarOfBalance_Cooldown: { label: "Aug. Avatar of Balance CD", voc: "monk", spell: "Avatar of Balance", cooldownMs: 900000, momentum: true },
  Monk_SpiritMend_HealingIncreased: { label: "Aug. Spirit Mend", voc: "monk", spell: "Spirit Mend", heal: 6, noGradeMul: true },
  Monk_SpiritualOutburst_DamageIncrease: { label: "Aug. Spiritual Outburst dmg", voc: "monk", spell: "Spiritual Outburst", damage: 5 },
  Monk_SpiritualOutburst_CriticalExtraDamage: { label: "Aug. Spiritual Outburst crit", voc: "monk", spell: "Spiritual Outburst", critDamage: 8, spellCritChance: 10 },
  Monk_ForcefulUppercut_DamageIncrease: { label: "Aug. Forceful Uppercut dmg", voc: "monk", spell: "Forceful Uppercut", damage: 10 },
  Monk_ForcefulUppercut_CriticalExtraDamage: { label: "Aug. Forceful Uppercut crit", voc: "monk", spell: "Forceful Uppercut", critDamage: 8, spellCritChance: 10 },
  Monk_FlurryOfBlows_DamageIncrease: { label: "Aug. Flurry of Blows dmg", voc: "monk", spell: "Flurry of Blows", damage: 6.5 },
  Monk_FlurryOfBlows_CriticalExtraDamage: { label: "Aug. Flurry of Blows crit", voc: "monk", spell: "Flurry of Blows", critDamage: 8, spellCritChance: 10 },
  Monk_GreaterFlurryOfBlows_DamageIncrease: { label: "Aug. Greater Flurry dmg", voc: "monk", spell: "Greater Flurry of Blows", damage: 5 },
  Monk_GreaterFlurryOfBlows_CriticalExtraDamage: { label: "Aug. Greater Flurry crit", voc: "monk", spell: "Greater Flurry of Blows", critDamage: 8, spellCritChance: 10 },
  Monk_SweepingTakedown_DamageIncrease: { label: "Aug. Sweeping Takedown dmg", voc: "monk", spell: "Sweeping Takedown", damage: 5 },
  Monk_SweepingTakedown_CriticalExtraDamage: { label: "Aug. Sweeping Takedown crit", voc: "monk", spell: "Sweeping Takedown", critDamage: 8, spellCritChance: 10 },
  Monk_FocusSerenity_Cooldown: { label: "Aug. Focus Serenity CD", voc: "monk", spell: "Focus Serenity", cooldownMs: 300000, momentum: true },
  Monk_FocusHarmony_Cooldown: { label: "Aug. Focus Harmony CD", voc: "monk", spell: "Focus Harmony", cooldownMs: 30000, momentum: true },
  Monk_MassSpiritMend_HealingIncrease: { label: "Aug. Mass Spirit Mend", voc: "monk", spell: "Mass Spirit Mend", heal: 5 },
};

function wheelGemQualityIndex(q) {
  var i = WHEEL_GEM_QUALITIES.indexOf(q);
  return i < 0 ? 0 : i;
}

function wheelGemVocOk(spec, voc) {
  if (!spec) return false;
  if (spec.voc) return spec.voc === voc;
  if (spec.vocs) return spec.vocs.indexOf(voc) !== -1;
  return true;
}

var WHEEL_GEM_SPELL_IDS = {
  "Fierce Berserk": "exori-gran", "Berserk": "exori", "Front Sweep": "exori-min",
  "Groundshaker": "exori-mas", "Annihilation": "exori-gran-ico",
  "Fair Wound Cleansing": "exura-med-ico", "Avatar of Steel": "uteta-res-eq",
  "Executioner's Throw": "exori-amp-kor", "Divine Grenade": "exevo-tempo-mas-san",
  "Divine Dazzle": "exana-amp-res", "Divine Caldera": "exevo-mas-san",
  "Divine Missile": "exori-san", "Ethereal Spear": "exori-con",
  "Strong Ethereal Spear": "exori-gran-con", "Divine Empowerment": "utevo-grav-san",
  "Salvation": "exura-gran-san", "Avatar of Light": "uteta-res-sac",
  "Ultimate Healing": "exura-vita", "Energy Wave": "exevo-vis-hur",
  "Great Death Beam": "exevo-max-mort", "Hell's Core": "exevo-gran-mas-flam",
  "Great Fire Wave": "exevo-gran-flam-hur", "Rage of the Skies": "exevo-gran-mas-vis",
  "Great Energy Beam": "exevo-gran-vis-lux", "Avatar of Storm": "uteta-res-ven",
  "Nature's Embrace": "exura-gran-sio", "Terra Burst": "exevo-ulus-tera",
  "Ice Burst": "exevo-ulus-frigo", "Eternal Winter": "exevo-gran-mas-frigo",
  "Terra Wave": "exevo-tera-hur", "Strong Ice Wave": "exevo-gran-frigo-hur",
  "Heal Friend": "exura-sio", "Mass Healing": "exura-gran-mas-res",
  "Avatar of Nature": "uteta-res-dru", "Spirit Mend": "exura-gran-tio",
  "Spiritual Outburst": "exori-gran-mas-nia", "Forceful Uppercut": "exori-gran-pug",
  "Flurry of Blows": "exori-mas-pug", "Greater Flurry of Blows": "exori-gran-mas-pug",
  "Sweeping Takedown": "exori-mas-nia", "Focus Serenity": "utamo-tio",
  "Focus Harmony": "utevo-nia", "Mass Spirit Mend": "exura-mas-nia",
  "Avatar of Balance": "uteta-res-tio",
};

function wheelGemSpellId(name) {
  if (!name) return null;
  if (WHEEL_GEM_SPELL_IDS[name]) return WHEEL_GEM_SPELL_IDS[name];
  if (typeof augmentSpellId === "function") {
    var a = augmentSpellId(name);
    if (a) return a;
  }
  var n = String(name).toLowerCase().trim();
  var chave = n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  var tables = [];
  if (typeof SPELLS !== "undefined") tables.push(SPELLS);
  if (typeof ALL_SPELLS !== "undefined") tables.push(ALL_SPELLS);
  if (typeof SPELL_TARGET !== "undefined") tables.push(SPELL_TARGET);
  if (typeof SPELLTARGET !== "undefined") tables.push(SPELLTARGET);
  for (var t = 0; t < tables.length; t++) {
    var tab = tables[t];
    if (tab[chave]) return chave;
    for (var id in tab) {
      var nm = String((tab[id] && (tab[id].name || tab[id].nome)) || "").toLowerCase();
      if (nm === n) return id;
    }
  }
  return chave;
}

function ensureWheelGems(p) {
  if (typeof ensureWheel === "function") ensureWheel(p);
  else {
    if (!p.wheel || typeof p.wheel !== "object") p.wheel = {};
  }
  var w = p.wheel;
  if (!Array.isArray(w.gems)) w.gems = [];
  if (!w.sockets || typeof w.sockets !== "object") w.sockets = { green: null, red: null, blue: null, purple: null };
  if (!w.basicGrades || typeof w.basicGrades !== "object") w.basicGrades = {};
  if (!w.supremeGrades || typeof w.supremeGrades !== "object") w.supremeGrades = {};
  if (w.lesserFrags == null) w.lesserFrags = 0;
  if (w.greaterFrags == null) w.greaterFrags = 0;
  if (w.nextGemId == null) w.nextGemId = 1;
  return w;
}

function wheelVesselResonance(p, color) {
  var slots = WHEEL_VESSEL_SLOTS[color] || [];
  var n = 0;
  for (var i = 0; i < slots.length; i++) {
    if (typeof wheelIsFull === "function" && wheelIsFull(p, slots[i])) n++;
    else if (p && p.wheel && p.wheel.slots && _WHEEL_SLOTS && _WHEEL_SLOTS[slots[i]]) {
      if ((p.wheel.slots[slots[i]] || 0) >= _WHEEL_SLOTS[slots[i]].max) n++;
    }
  }
  return n;
}

function wheelModGrade(p, key, supreme) {
  ensureWheelGems(p);
  var map = supreme ? p.wheel.supremeGrades : p.wheel.basicGrades;
  var g = Number(map[key]) || 0;
  return Math.max(0, Math.min(3, g));
}

function wheelEffectiveSlotGrade(p, gem, slot) {
  if (!gem || !gem.revealed) return -1;
  var res = wheelVesselResonance(p, gem.affinity);
  var gL = gem.lesser ? wheelModGrade(p, gem.lesser, false) : -1;
  var gR = gem.regular ? wheelModGrade(p, gem.regular, false) : -1;
  var gS = gem.supreme ? wheelModGrade(p, gem.supreme, true) : -1;
  if (slot === "lesser") return res >= 1 && gem.lesser ? gL : -1;
  if (slot === "regular") return res >= 2 && gem.regular ? Math.min(gR, gL) : -1;
  if (slot === "supreme") {
    var cap = gem.regular ? Math.min(gL, gR) : gL;
    return res >= 3 && gem.supreme ? Math.min(gS, cap) : -1;
  }
  return -1;
}

function wheelAddResist(dst, src, mul) {
  if (!src) return;
  for (var k in src) dst[k] = (dst[k] || 0) + src[k] * mul;
}

function wheelEmptyGemBonus() {
  return {
    hp: 0, mp: 0, cap: 0, mitigationPct: 0, dodge: 0, lifeLeech: 0, manaLeech: 0,
    critDamage: 0, momentum: 0,
    resist: {}, revelation: { green: 0, red: 0, blue: 0, purple: 0 },
    spells: {},
  };
}

function wheelApplyBasicToBonus(bonus, voc, key, grade) {
  var spec = WHEEL_BASIC_MODS[key];
  if (!spec || grade < 0) return;
  var m = WHEEL_GEM_GRADE_MUL[grade] || 1;
  if (spec.hpKey) bonus.hp += Math.floor((WHEEL_GEM_HP[spec.hpKey] && WHEEL_GEM_HP[spec.hpKey][voc] || 0) * m);
  if (spec.mpKey) bonus.mp += Math.floor((WHEEL_GEM_MP[spec.mpKey] && WHEEL_GEM_MP[spec.mpKey][voc] || 0) * m);
  if (spec.capKey) bonus.cap += Math.floor((WHEEL_GEM_CAPV[spec.capKey] && WHEEL_GEM_CAPV[spec.capKey][voc] || 0) * m);
  if (spec.mitigation) bonus.mitigationPct += spec.mitigation * m;
  wheelAddResist(bonus.resist, spec.resist, m);
}

function wheelApplySupremeToBonus(bonus, voc, key, grade) {
  var spec = WHEEL_SUPREME_MODS[key];
  if (!spec || grade < 0) return;
  if (!wheelGemVocOk(spec, voc)) return;
  var m = spec.noGradeMul ? 1 : (WHEEL_GEM_GRADE_MUL[grade] || 1);
  if (spec.dodge) bonus.dodge += spec.dodge * m;
  if (spec.lifeLeech) bonus.lifeLeech += spec.lifeLeech * m;
  if (spec.manaLeech) bonus.manaLeech += spec.manaLeech * m;
  if (spec.critDamage && !spec.spell) bonus.critDamage += spec.critDamage * m;
  if (spec.revelation) bonus.revelation[spec.revelation] += (spec.revelationPts || 150) * m;
  if (spec.momentum) bonus.momentum += grade < 3 ? 0.33 * Math.max(0, grade) : 1;
  if (spec.spell) {
    var sid = wheelGemSpellId(spec.spell);
    if (!sid) return;
    var row = bonus.spells[sid] || (bonus.spells[sid] = {
      damagePct: 0, healPct: 0, cooldownMs: 0, critDamage: 0, critChance: 0,
    });
    if (spec.damage) row.damagePct += spec.damage * m;
    if (spec.heal) row.healPct += spec.heal * m;
    if (spec.cooldownMs) row.cooldownMs += spec.cooldownMs;
    if (spec.critDamage) row.critDamage += spec.critDamage * m;
    if (spec.spellCritChance) row.critChance = Math.max(row.critChance, spec.spellCritChance);
  }
}

function wheelGemBonus(p) {
  ensureWheelGems(p);
  var voc = p.voc || "knight";
  var bonus = wheelEmptyGemBonus();
  var sockets = p.wheel.sockets || {};
  for (var i = 0; i < WHEEL_GEM_AFFINITIES.length; i++) {
    var color = WHEEL_GEM_AFFINITIES[i];
    var gem = wheelFindGem(p, sockets[color]);
    if (!gem || !gem.revealed || gem.affinity !== color) continue;
    var gL = wheelEffectiveSlotGrade(p, gem, "lesser");
    var gR = wheelEffectiveSlotGrade(p, gem, "regular");
    var gS = wheelEffectiveSlotGrade(p, gem, "supreme");
    if (gL >= 0) wheelApplyBasicToBonus(bonus, voc, gem.lesser, gL);
    if (gR >= 0) wheelApplyBasicToBonus(bonus, voc, gem.regular, gR);
    if (gS >= 0) wheelApplySupremeToBonus(bonus, voc, gem.supreme, gS);
  }
  return bonus;
}

function wheelFindGem(p, id) {
  if (id == null) return null;
  ensureWheelGems(p);
  for (var i = 0; i < p.wheel.gems.length; i++) {
    if (p.wheel.gems[i].id === id) return p.wheel.gems[i];
  }
  return null;
}

function wheelGemSocketedColor(p, gemId) {
  ensureWheelGems(p);
  for (var i = 0; i < WHEEL_GEM_AFFINITIES.length; i++) {
    var c = WHEEL_GEM_AFFINITIES[i];
    if (p.wheel.sockets[c] === gemId) return c;
  }
  return null;
}

function wheelBasicKeys() { return Object.keys(WHEEL_BASIC_MODS); }
function wheelSupremeKeysFor(voc) {
  var out = [];
  for (var k in WHEEL_SUPREME_MODS) {
    if (wheelGemVocOk(WHEEL_SUPREME_MODS[k], voc)) out.push(k);
  }
  return out;
}

function wheelPick(list, rng, avoid) {
  var pool = list.filter(function (k) { return !avoid || avoid.indexOf(k) === -1; });
  if (!pool.length) pool = list;
  var n = typeof rng === "function" ? rng() : Math.random();
  return pool[Math.floor(n * pool.length) % pool.length];
}

function wheelBuyGem(p, quality, affinity, rng) {
  ensureWheelGems(p);
  var qi = wheelGemQualityIndex(quality);
  if (WHEEL_GEM_AFFINITIES.indexOf(affinity) === -1) return { ok: false, err: "Invalid domain." };
  if (p.wheel.gems.length >= WHEEL_GEM_MAX) return { ok: false, err: "You can carry at most 225 gems." };
  var price = WHEEL_GEM_BUY_PRICE[qi];
  if (typeof spendGold === "function") {
    if (!spendGold(p, price)) return { ok: false, err: "Not enough gold." };
  } else {
    if ((p.gold || 0) < price) return { ok: false, err: "Not enough gold." };
    p.gold -= price;
  }
  var gem = {
    id: p.wheel.nextGemId++,
    affinity: affinity,
    quality: quality,
    revealed: false,
    lesser: null, regular: null, supreme: null,
  };
  p.wheel.gems.push(gem);
  return { ok: true, gem: gem };
}

function wheelRevealGem(p, gemId, rng) {
  ensureWheelGems(p);
  var gem = wheelFindGem(p, gemId);
  if (!gem) return { ok: false, err: "Gem not found." };
  if (gem.revealed) return { ok: false, err: "Already revealed." };
  var qi = wheelGemQualityIndex(gem.quality);
  var price = WHEEL_GEM_REVEAL_PRICE[qi];
  if (typeof spendGold === "function") {
    if (!spendGold(p, price)) return { ok: false, err: "Not enough gold to reveal." };
  } else {
    if ((p.gold || 0) < price) return { ok: false, err: "Not enough gold to reveal." };
    p.gold -= price;
  }
  var voc = p.voc || "knight";
  var basics = wheelBasicKeys();
  gem.lesser = wheelPick(basics, rng);
  if (qi >= 1) gem.regular = wheelPick(basics, rng, [gem.lesser]);
  if (qi >= 2) gem.supreme = wheelPick(wheelSupremeKeysFor(voc), rng);
  gem.revealed = true;
  return { ok: true, gem: gem };
}

function wheelSwitchGemDomain(p, gemId, affinity) {
  ensureWheelGems(p);
  var gem = wheelFindGem(p, gemId);
  if (!gem) return { ok: false, err: "Gem not found." };
  if (WHEEL_GEM_AFFINITIES.indexOf(affinity) === -1) return { ok: false, err: "Invalid domain." };
  if (gem.affinity === affinity) return { ok: false, err: "Already this domain." };
  var qi = wheelGemQualityIndex(gem.quality);
  var price = WHEEL_GEM_SWITCH_PRICE[qi];
  if (typeof spendGold === "function") {
    if (!spendGold(p, price)) return { ok: false, err: "Not enough gold." };
  } else {
    if ((p.gold || 0) < price) return { ok: false, err: "Not enough gold." };
    p.gold -= price;
  }
  var sock = wheelGemSocketedColor(p, gemId);
  if (sock) p.wheel.sockets[sock] = null;
  gem.affinity = affinity;
  return { ok: true, gem: gem };
}

function wheelSocketGem(p, gemId, color) {
  ensureWheelGems(p);
  var gem = wheelFindGem(p, gemId);
  if (!gem || !gem.revealed) return { ok: false, err: "Reveal the gem first." };
  if (gem.affinity !== color) return { ok: false, err: "Gem domain must match the vessel." };
  var prev = wheelGemSocketedColor(p, gemId);
  if (prev) p.wheel.sockets[prev] = null;
  p.wheel.sockets[color] = gemId;
  return { ok: true };
}

function wheelUnsocketGem(p, color) {
  ensureWheelGems(p);
  p.wheel.sockets[color] = null;
  return { ok: true };
}

function wheelDestroyGem(p, gemId, rng) {
  ensureWheelGems(p);
  var gem = wheelFindGem(p, gemId);
  if (!gem) return { ok: false, err: "Gem not found." };
  var sock = wheelGemSocketedColor(p, gemId);
  if (sock) p.wheel.sockets[sock] = null;
  var smash = WHEEL_GEM_SMASH[gem.quality] || WHEEL_GEM_SMASH.lesser;
  var range = gem.revealed ? smash.revealed : smash.unrevealed;
  var n = range[0];
  var roll = typeof rng === "function" ? rng() : Math.random();
  n = range[0] + Math.floor(roll * (range[1] - range[0] + 1));
  if (smash.kind === "greater") p.wheel.greaterFrags += n;
  else p.wheel.lesserFrags += n;
  p.wheel.gems = p.wheel.gems.filter(function (g) { return g.id !== gemId; });
  return { ok: true, kind: smash.kind, amount: n };
}

function wheelBuyFragments(p, kind, amount) {
  ensureWheelGems(p);
  amount = Math.max(1, Math.floor(Number(amount) || 1));
  var price = (kind === "greater" ? WHEEL_FRAG_BUY.greater : WHEEL_FRAG_BUY.lesser) * amount;
  if (typeof spendGold === "function") {
    if (!spendGold(p, price)) return { ok: false, err: "Not enough gold." };
  } else {
    if ((p.gold || 0) < price) return { ok: false, err: "Not enough gold." };
    p.gold -= price;
  }
  if (kind === "greater") p.wheel.greaterFrags += amount;
  else p.wheel.lesserFrags += amount;
  return { ok: true };
}

function wheelUpgradeMod(p, key, supreme) {
  ensureWheelGems(p);
  var spec = supreme ? WHEEL_SUPREME_MODS[key] : WHEEL_BASIC_MODS[key];
  if (!spec) return { ok: false, err: "Unknown modifier." };
  var map = supreme ? p.wheel.supremeGrades : p.wheel.basicGrades;
  var cur = Number(map[key]) || 0;
  if (cur >= 3) return { ok: false, err: "Already Grade IV." };
  var cost = (supreme ? WHEEL_GEM_UPGRADE.supreme : WHEEL_GEM_UPGRADE.basic)[cur];
  var have = supreme ? p.wheel.greaterFrags : p.wheel.lesserFrags;
  if (have < cost.frag) return { ok: false, err: "Not enough fragments." };
  if (typeof spendGold === "function") {
    if (!spendGold(p, cost.gold)) return { ok: false, err: "Not enough gold." };
  } else {
    if ((p.gold || 0) < cost.gold) return { ok: false, err: "Not enough gold." };
    p.gold -= cost.gold;
  }
  if (supreme) p.wheel.greaterFrags -= cost.frag;
  else p.wheel.lesserFrags -= cost.frag;
  map[key] = cur + 1;
  return { ok: true, grade: map[key] };
}

function wheelGradeIvPoints(p) {
  ensureWheelGems(p);
  var n = 0, k;
  for (k in p.wheel.basicGrades) if ((Number(p.wheel.basicGrades[k]) || 0) >= 3) n++;
  for (k in p.wheel.supremeGrades) if ((Number(p.wheel.supremeGrades[k]) || 0) >= 3) n++;
  return n;
}

function wheelModLabel(key, supreme) {
  var spec = supreme ? WHEEL_SUPREME_MODS[key] : WHEEL_BASIC_MODS[key];
  return spec ? spec.label : key;
}

function wheelGradeName(g) {
  return ["I", "II", "III", "IV"][Math.max(0, Math.min(3, g | 0))];
}

if (typeof module !== "undefined") {
  module.exports = {
    WHEEL_GEM_AFFINITIES, WHEEL_GEM_QUALITIES, WHEEL_GEM_GRADE_MUL, WHEEL_VESSEL_SLOTS,
    WHEEL_GEM_REVEAL_PRICE, WHEEL_GEM_SWITCH_PRICE, WHEEL_GEM_BUY_PRICE, WHEEL_FRAG_BUY,
    WHEEL_GEM_UPGRADE, WHEEL_GEM_SMASH, WHEEL_BASIC_MODS, WHEEL_SUPREME_MODS, WHEEL_GEM_SPELL_IDS,
    ensureWheelGems, wheelVesselResonance, wheelModGrade, wheelEffectiveSlotGrade,
    wheelGemBonus, wheelFindGem, wheelBuyGem, wheelRevealGem, wheelSwitchGemDomain,
    wheelSocketGem, wheelUnsocketGem, wheelDestroyGem, wheelBuyFragments, wheelUpgradeMod,
    wheelGradeIvPoints, wheelModLabel, wheelGradeName, wheelGemSpellId, wheelBasicKeys,
    wheelSupremeKeysFor,
  };
}
