/**
 * gamelib-const.js — Gamelib Constants (OTClient gamelib/const.lua)
 * Skills, Fight/Chase/PVP modes, Blessings, Party Shields, Skulls,
 * Game Features (136 tipos), Message Modes (58 tipos), Resource Types.
 */
"use strict";
const DIR={North:0,East:1,South:2,West:3,NorthEast:4,SouthEast:5,SouthWest:6,NorthWest:7,Invalid:8};
const SKILL={Fist:0,Club:1,Sword:2,Axe:3,Distance:4,Shielding:5,Fishing:6,CriticalChance:7,CriticalDamage:8,LifeLeechChance:9,LifeLeechAmount:10,ManaLeechChance:11,ManaLeechAmount:12,Fatal:13,Dodge:14,Momentum:15,Transcendence:16};
const FIGHT={Offensive:1,Balanced:2,Defensive:3};
const CHASE={DontChase:0,ChaseOpponent:1};
const PVP={WhiteDove:0,WhiteHand:1,YellowHand:2,RedFist:3};
const SKULL={None:0,Yellow:1,Green:2,White:3,Red:4,Black:5,Orange:6};
const SHIELD={None:0,WhiteYellow:1,WhiteBlue:2,Blue:3,Yellow:4,BlueSharedExp:5,YellowSharedExp:6,BlueNoSharedExpBlink:7,YellowNoSharedExpBlink:8,BlueNoSharedExp:9,YellowNoSharedExp:10,Gray:11};
const EMBLEM={None:0,Green:1,Red:2,Blue:3,Member:4,Other:5};
const BLESS={None:0,Adventurer:1,TwistOfFate:2,WisdomOfSolitude:4,SparkOfPhoenix:8,FireOfSuns:16,SpiritualShielding:32,EmbraceOfTibia:64,HeartOfMountain:128,BloodOfMountain:256};
const GAME_FEATURE={Prey:82,ThingQuickLoot:83,ThingQuiver:84,Taskboard:134,Proficiency:135,Bosstiary:97,BosstiaryTracker:107,IngameStore:73,ItemAugment:110,ForgeConvergence:119,ForgeSkillStats:126,VocationMonk:130,DoubleHealth:28,DoubleSkills:29,PlayerStamina:43,PlayerMounts:12,PlayerAddons:44};
const RESOURCE={BANK_BALANCE:0,GOLD_EQUIPPED:1,PREY_WILDCARDS:10,XP_BOOST:12,CHARM:20,MINOR_CHARM:21,MAX_CHARM:22,MAX_MINOR_CHARM:23,BOUNTY_POINTS:30,SOULSEALS:31};
if(typeof window!=="undefined")window.GAMELIB={DIR,SKILL,FIGHT,CHASE,PVP,SKULL,SHIELD,EMBLEM,BLESS,GAME_FEATURE,RESOURCE};
