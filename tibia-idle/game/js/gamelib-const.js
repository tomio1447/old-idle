/**
 * gamelib-const.js — Gamelib Constants (OTClient gamelib/const.lua)
 *
 * Traduz os enums fundamentais do cliente: Skills, Blessings, Fight Modes,
 * Shield States, Text Colors, Protocol Features — usados por TODOS os
 * módulos do OTClient.
 */
"use strict";

// ── Directions (Directions enum)
const DIR = {
  North: 0, East: 1, South: 2, West: 3,
  NorthEast: 4, SouthEast: 5, SouthWest: 6, NorthWest: 7, Invalid: 8,
};

// ── Skills (Skill enum)
const SKILL = {
  Fist: 0, Club: 1, Sword: 2, Axe: 3,
  Distance: 4, Shielding: 5, Fishing: 6,
  CriticalChance: 7, CriticalDamage: 8,
  LifeLeechChance: 9, LifeLeechAmount: 10,
  ManaLeechChance: 11, ManaLeechAmount: 12,
  Fatal: 13, Dodge: 14, Momentum: 15, Transcendence: 16,
};

// ── Fight Modes (FightOffensive/Balanced/Defensive)
const FIGHT = { Offensive: 1, Balanced: 2, Defensive: 3 };

// ── Chase Modes (DontChase/ChaseOpponent)
const CHASE = { DontChase: 0, ChaseOpponent: 1 };

// ── PvP Modes
const PVP = { WhiteDove: 0, WhiteHand: 1, YellowHand: 2, RedFist: 3 };

// ── Skulls
const SKULL = {
  None: 0, Yellow: 1, Green: 2, White: 3, Red: 4, Black: 5, Orange: 6,
};

// ── Party Shields
const SHIELD = {
  None: 0, WhiteYellow: 1, WhiteBlue: 2,
  Blue: 3, Yellow: 4,
  BlueSharedExp: 5, YellowSharedExp: 6,
  BlueNoSharedExpBlink: 7, YellowNoSharedExpBlink: 8,
  BlueNoSharedExp: 9, YellowNoSharedExp: 10, Gray: 11,
};

// ── Emblems
const EMBLEM = { None: 0, Green: 1, Red: 2, Blue: 3, Member: 4, Other: 5 };

// ── Text Colors (TextColors table)
const TEXT_COLORS = {
  red: "#f55e5e", orange: "#f36500", yellow: "#ffff00",
  green: "#00EB00", lightblue: "#5ff7f7", blue: "#9f9dfd",
  white: "#ffffff", grey: "#AAAAAA",
};

// ── Message Modes
const MSG = {
  None: 0, Say: 1, Whisper: 2, Yell: 3,
  PrivateFrom: 4, PrivateTo: 5,
  ChannelManagement: 6, Channel: 7, ChannelHighlight: 8,
  Spell: 9, NpcFrom: 10, NpcTo: 11,
  GamemasterBroadcast: 12, GamemasterChannel: 13,
  GamemasterPrivateFrom: 14, GamemasterPrivateTo: 15,
  Login: 16, Warning: 17, Game: 18, Failure: 19,
  Look: 20, DamageDealed: 21, DamageReceived: 22, Heal: 23, Exp: 24,
  DamageOthers: 25, HealOthers: 26, ExpOthers: 27,
  Status: 28, Loot: 29, TradeNpc: 30, Guild: 31,
  PartyManagement: 32, Party: 33,
  BarkLow: 34, BarkLoud: 35, Report: 36, HotkeyUse: 37,
  TutorialHint: 38, Thankyou: 39, Market: 40, Mana: 41,
  BeyondLast: 42, MonsterYell: 43, MonsterSay: 44,
  Red: 45, Blue: 46,
  Attention: 52, BoostedCreature: 53, OfflineTrainning: 54,
  Transaction: 55, Potion: 56, ValuableLoot: 57,
  Last: 58, Invalid: 255,
};

// ── Game Protocol Features (GameProtocolChecksum...GameTacticsWithoutFightMode)
const GAME_FEATURE = {
  ProtocolChecksum: 1, AccountNames: 2, ChallengeOnLogin: 3,
  PenalityOnDeath: 4, NameOnNpcTrade: 5, DoubleFreeCapacity: 6,
  DoubleExperience: 7, TotalCapacity: 8, SkillsBase: 9,
  PlayerRegenerationTime: 10, ChannelPlayerList: 11, PlayerMounts: 12,
  EnvironmentEffect: 13, CreatureEmblems: 14, ItemAnimationPhase: 15,
  MagicEffectU16: 16, PlayerMarket: 17, SpritesU32: 18,
  ChargeableItems: 19, OfflineTrainingTime: 20, PurseSlot: 21,
  FormatCreatureName: 22, SpellList: 23, ClientPing: 24,
  ExtendedClientPing: 25, DoubleHealth: 28, DoubleSkills: 29,
  ChangeMapAwareRange: 30, MapMovePosition: 31, AttackSeq: 32,
  BlueNpcNameColor: 33, DiagonalAnimatedText: 34, LoginPending: 35,
  NewSpeedLaw: 36, ForceFirstAutoWalkStep: 37, MinimapRemove: 38,
  DoubleShopSellAmount: 39, ContainerPagination: 40, ThingMarks: 41,
  LooktypeU16: 42, PlayerStamina: 43, PlayerAddons: 44,
  MessageStatements: 45, MessageLevel: 46, NewFluids: 47,
  PlayerStateU16: 48, NewOutfitProtocol: 49, PVPMode: 50,
  WritableDate: 51, AdditionalVipInfo: 52, BaseSkillU16: 53,
  CreatureIcons: 54, HideNpcNames: 55, SpritesAlphaChannel: 56,
  PremiumExpiration: 57, BrowseField: 58, EnhancedAnimations: 59,
  OGLInformation: 60, MessageSizeCheck: 61, PreviewState: 62,
  LoginPacketEncryption: 63, ClientVersion: 64, ContentRevision: 65,
  ExperienceBonus: 66, Authenticator: 67, UnjustifiedPoints: 68,
  SessionKey: 69, DeathType: 70, IdleAnimations: 71,
  KeepUnawareTiles: 72, IngameStore: 73, IngameStoreHighlights: 74,
  IngameStoreServiceType: 75, AdditionalSkills: 76, DistanceEffectU16: 77,
  LevelU16: 78, Soul: 79,
  Prey: 82, ThingQuickLoot: 83, ThingQuiver: 84,
  ThingPodium: 85, ThingUpgradeClassification: 86, ThingCounter: 87,
  ThingClock: 88, ThingPodiumItemType: 89, SequencedPackets: 90,
  UshortSpell: 91, TournamentPackets: 92, DynamicForgeVariables: 93,
  Concoctions: 94, Anthem: 95, VipGroups: 96, Bosstiary: 97,
  DoublePlayerGoodsMoney: 98,
  ItemShader: 101, CreatureShader: 102, CreatureAttachedEffect: 103,
  CountU16: 104, EffectU16: 105, ContainerTypes: 106,
  BosstiaryTracker: 107, PlayerStateCounter: 108, LeechAmount: 109,
  ItemAugment: 110, DynamicBugReporter: 111, WrapKit: 112,
  ContainerFilter: 113, EnterGameShowAppearance: 114,
  SmoothWalkElevation: 115, NegativeOffset: 116, ItemTooltipV8: 117,
  WingsAurasEffectsShader: 118, ForgeConvergence: 119,
  AllowCustomBotScripts: 120, ColorizedLootValue: 121, AllowPreWalk: 122,
  PlayerFamiliars: 123, TileAddThingWithStackpos: 124, MapCache: 125,
  ForgeSkillStats: 126, CharacterSkillStats: 127, CreaturePaperdoll: 128,
  MultiSpr: 129, VocationMonk: 130, LevelPercentU16: 131,
  EffectSource: 132, NpcWindowRedesign: 133, Taskboard: 134,
  Proficiency: 135, TacticsWithoutFightMode: 136,
};

// ── Blessings
const BLESS = {
  None: 0, Adventurer: 1, TwistOfFate: 2, WisdomOfSolitude: 4,
  SparkOfPhoenix: 8, FireOfSuns: 16, SpiritualShielding: 32,
  EmbraceOfTibia: 64, HeartOfMountain: 128, BloodOfMountain: 256,
};

// ── Vip States
const VIP_STATE = { Offline: 0, Online: 1, Pending: 2 };

// ── PathFind Results
const PATH_RESULT = { Ok: 0, Position: 1, Impossible: 2, TooFar: 3, NoWay: 4 };

// ── Preview States
const PREVIEW = { Default: 0, Inactive: 1, Active: 2 };

// ── Resource Types (para inventory/cyclopedia)
const RESOURCE = {
  BANK_BALANCE: 0, GOLD_EQUIPPED: 1,
  PREY_WILDCARDS: 10, XP_BOOST: 12,
  CHARM: 20, MINOR_CHARM: 21, MAX_CHARM: 22, MAX_MINOR_CHARM: 23,
  BOUNTY_POINTS: 30, SOULSEALS: 31,
  NPC_TRADE_QUEST_FLAG_CURRENCY: 40, UNSPENT_SKILL_POINTS: 41,
};

// ── Export
if (typeof window !== "undefined") window.GAMELIB = {
  DIR, SKILL, FIGHT, CHASE, PVP, SKULL, SHIELD, EMBLEM,
  TEXT_COLORS, MSG, GAME_FEATURE, BLESS, VIP_STATE, PATH_RESULT,
  PREVIEW, RESOURCE,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DIR, SKILL, FIGHT, CHASE, PVP, SKULL, SHIELD, EMBLEM,
    TEXT_COLORS, MSG, GAME_FEATURE, BLESS, VIP_STATE, PATH_RESULT,
    PREVIEW, RESOURCE };
}
