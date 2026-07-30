/* imbuementdata.js — GERADO por tools/build_imbuement_js.py a partir
 * de tools/data/canary-imbuements.xml (opentibiabr/canary, oficial).
 * NAO EDITAR A MAO: edite o XML e rode o builder de novo. */
"use strict";
window.IMBDATA = {
  "bases": {
    1: {
      "name": "Basic",
      "price": 5000,
      "protection": 10000,
      "pct": 90,
      "remove": 15000,
      "duration": 72000
    },
    2: {
      "name": "Intricate",
      "price": 30000,
      "protection": 30000,
      "pct": 70,
      "remove": 15000,
      "duration": 72000
    },
    3: {
      "name": "Powerful",
      "price": 200000,
      "protection": 50000,
      "pct": 50,
      "remove": 15000,
      "duration": 72000
    }
  },
  "categories": {
    0: "Elemental Damage",
    1: "Life Leech",
    2: "Mana Leech",
    3: "Critical Hit",
    4: "Elemental Protection (Death)",
    5: "Elemental Protection (Earth)",
    6: "Elemental Protection (Fire)",
    7: "Elemental Protection (Ice)",
    8: "Elemental Protection (Energy)",
    9: "Elemental Protection (Holy)",
    10: "Increase Speed",
    11: "Skillboost (Axe Fighting)",
    12: "Skillboost (Sword Fighting)",
    13: "Skillboost (Club Fighting)",
    14: "Skillboost (Shielding)",
    15: "Skillboost (Distance Fighting)",
    16: "Skillboost (Magic Level)",
    17: "Increase Capacity",
    18: "Skillboost (Fist Fighting)",
    19: "Paralysis Deflection"
  },
  "imbs": {
    "Scorch (Fire)": {
      "name": "Scorch",
      "sub": "Fire",
      "cat": 0,
      "icon": 13,
      "tiers": {
        1: {
          "items": [[9636, 25]],
          "desc": "Converts 10% of the physical damage to fire damage.",
          "effect": {
            "type": "damage",
            "combat": "fire",
            "value": 10
          }
        },
        2: {
          "items": [[9636, 25], [5920, 5]],
          "desc": "Converts 25% of the physical damage to fire damage.",
          "effect": {
            "type": "damage",
            "combat": "fire",
            "value": 25
          }
        },
        3: {
          "items": [[9636, 25], [5920, 5], [5954, 5]],
          "desc": "Converts 50% of the physical damage to fire damage.",
          "effect": {
            "type": "damage",
            "combat": "fire",
            "value": 50
          }
        }
      }
    },
    "Venom (Earth)": {
      "name": "Venom",
      "sub": "Earth",
      "cat": 0,
      "icon": 7,
      "tiers": {
        1: {
          "items": [[9686, 25]],
          "desc": "Converts 10% of the physical damage to earth damage.",
          "effect": {
            "type": "damage",
            "combat": "earth",
            "value": 10
          }
        },
        2: {
          "items": [[9686, 25], [9640, 20]],
          "desc": "Converts 25% of the physical damage to earth damage.",
          "effect": {
            "type": "damage",
            "combat": "earth",
            "value": 25
          }
        },
        3: {
          "items": [[9686, 25], [9640, 20], [21194, 2]],
          "desc": "Converts 50% of the physical damage to earth damage.",
          "effect": {
            "type": "damage",
            "combat": "earth",
            "value": 50
          }
        }
      }
    },
    "Frost (Ice)": {
      "name": "Frost",
      "sub": "Ice",
      "cat": 0,
      "icon": 19,
      "tiers": {
        1: {
          "items": [[9661, 25]],
          "desc": "Converts 10% of the physical damage to ice damage.",
          "effect": {
            "type": "damage",
            "combat": "ice",
            "value": 10
          }
        },
        2: {
          "items": [[9661, 25], [21801, 10]],
          "desc": "Converts 25% of the physical damage to ice damage.",
          "effect": {
            "type": "damage",
            "combat": "ice",
            "value": 25
          }
        },
        3: {
          "items": [[9661, 25], [21801, 10], [9650, 5]],
          "desc": "Converts 50% of the physical damage to ice damage.",
          "effect": {
            "type": "damage",
            "combat": "ice",
            "value": 50
          }
        }
      }
    },
    "Electrify (Energy)": {
      "name": "Electrify",
      "sub": "Energy",
      "cat": 0,
      "icon": 10,
      "tiers": {
        1: {
          "items": [[18993, 25]],
          "desc": "Converts 10% of the physical damage to energy damage.",
          "effect": {
            "type": "damage",
            "combat": "energy",
            "value": 10
          }
        },
        2: {
          "items": [[18993, 25], [21975, 5]],
          "desc": "Converts 25% of the physical damage to energy damage.",
          "effect": {
            "type": "damage",
            "combat": "energy",
            "value": 25
          }
        },
        3: {
          "items": [[18993, 25], [21975, 5], [23508, 1]],
          "desc": "Converts 50% of the physical damage to energy damage.",
          "effect": {
            "type": "damage",
            "combat": "energy",
            "value": 50
          }
        }
      }
    },
    "Reap (Death)": {
      "name": "Reap",
      "sub": "Death",
      "cat": 0,
      "icon": 4,
      "tiers": {
        1: {
          "items": [[11484, 25]],
          "desc": "Converts 10% of the physical damage to death damage.",
          "effect": {
            "type": "damage",
            "combat": "death",
            "value": 10
          }
        },
        2: {
          "items": [[11484, 25], [9647, 20]],
          "desc": "Converts 25% of the physical damage to death damage.",
          "effect": {
            "type": "damage",
            "combat": "death",
            "value": 25
          }
        },
        3: {
          "items": [[11484, 25], [9647, 20], [10420, 5]],
          "desc": "Converts 50% of the physical damage to death damage.",
          "effect": {
            "type": "damage",
            "combat": "death",
            "value": 50
          }
        }
      }
    },
    "Vampirism": {
      "name": "Vampirism",
      "sub": "",
      "cat": 1,
      "icon": 46,
      "tiers": {
        1: {
          "items": [[9685, 25]],
          "desc": "Converts 5% of damage to HP with a chance of 100%.",
          "effect": {
            "type": "skill",
            "value": "lifeleech",
            "bonus": 500,
            "chance": 100
          }
        },
        2: {
          "items": [[9685, 25], [9633, 15]],
          "desc": "Converts 10% of damage to HP with a chance of 100%.",
          "effect": {
            "type": "skill",
            "value": "lifeleech",
            "bonus": 1000,
            "chance": 100
          }
        },
        3: {
          "items": [[9685, 25], [9633, 15], [9663, 5]],
          "desc": "Converts 25% of damage to HP with a chance of 100%.",
          "effect": {
            "type": "skill",
            "value": "lifeleech",
            "bonus": 2500,
            "chance": 100
          }
        }
      }
    },
    "Void": {
      "name": "Void",
      "sub": "",
      "cat": 2,
      "icon": 49,
      "tiers": {
        1: {
          "items": [[11492, 25]],
          "desc": "Converts 3% of damage to MP with a chance of 100%.",
          "effect": {
            "type": "skill",
            "value": "manaleech",
            "bonus": 300,
            "chance": 100
          }
        },
        2: {
          "items": [[11492, 25], [20200, 25]],
          "desc": "Converts 5% of damage to MP with a chance of 100%.",
          "effect": {
            "type": "skill",
            "value": "manaleech",
            "bonus": 500,
            "chance": 100
          }
        },
        3: {
          "items": [[11492, 25], [20200, 25], [22730, 5]],
          "desc": "Converts 8% of damage to MP with a chance of 100%.",
          "effect": {
            "type": "skill",
            "value": "manaleech",
            "bonus": 800,
            "chance": 100
          }
        }
      }
    },
    "Strike": {
      "name": "Strike",
      "sub": "",
      "cat": 3,
      "icon": 1,
      "tiers": {
        1: {
          "items": [[11444, 20]],
          "desc": "Raises crit hit damage by 15% and crit hit chance by 10%.",
          "effect": {
            "type": "skill",
            "value": "critical",
            "bonus": 1500,
            "chance": 1000
          }
        },
        2: {
          "items": [[11444, 20], [10311, 25]],
          "desc": "Raises crit hit damage by 25% and crit hit chance by 10%.",
          "effect": {
            "type": "skill",
            "value": "critical",
            "bonus": 2500,
            "chance": 1000
          }
        },
        3: {
          "items": [[11444, 20], [10311, 25], [22728, 5]],
          "desc": "Raises crit hit damage by 50% and crit hit chance by 10%.",
          "effect": {
            "type": "skill",
            "value": "critical",
            "bonus": 5000,
            "chance": 1000
          }
        }
      }
    },
    "Lich Shroud": {
      "name": "Lich Shroud",
      "sub": "",
      "cat": 4,
      "icon": 25,
      "tiers": {
        1: {
          "items": [[11466, 25]],
          "desc": "Reduces death damage by 2%.",
          "effect": {
            "type": "reduction",
            "combat": "death",
            "value": 2
          }
        },
        2: {
          "items": [[11466, 25], [22007, 20]],
          "desc": "Reduces death damage by 5%.",
          "effect": {
            "type": "reduction",
            "combat": "death",
            "value": 5
          }
        },
        3: {
          "items": [[11466, 25], [22007, 20], [9660, 5]],
          "desc": "Reduces death damage by 10%.",
          "effect": {
            "type": "reduction",
            "combat": "death",
            "value": 10
          }
        }
      }
    },
    "Snake Skin": {
      "name": "Snake Skin",
      "sub": "",
      "cat": 5,
      "icon": 28,
      "tiers": {
        1: {
          "items": [[17823, 25]],
          "desc": "Reduces earth damage by 3%.",
          "effect": {
            "type": "reduction",
            "combat": "earth",
            "value": 3
          }
        },
        2: {
          "items": [[17823, 25], [9694, 20]],
          "desc": "Reduces earth damage by 8%.",
          "effect": {
            "type": "reduction",
            "combat": "earth",
            "value": 8
          }
        },
        3: {
          "items": [[17823, 25], [9694, 20], [11702, 10]],
          "desc": "Reduces earth damage by 15%.",
          "effect": {
            "type": "reduction",
            "combat": "earth",
            "value": 15
          }
        }
      }
    },
    "Dragon Hide": {
      "name": "Dragon Hide",
      "sub": "",
      "cat": 6,
      "icon": 34,
      "tiers": {
        1: {
          "items": [[5877, 20]],
          "desc": "Reduces fire damage by 3%.",
          "effect": {
            "type": "reduction",
            "combat": "fire",
            "value": 3
          }
        },
        2: {
          "items": [[5877, 20], [16131, 10]],
          "desc": "Reduces fire damage by 8%.",
          "effect": {
            "type": "reduction",
            "combat": "fire",
            "value": 8
          }
        },
        3: {
          "items": [[5877, 20], [16131, 10], [11658, 5]],
          "desc": "Reduces fire damage by 15%.",
          "effect": {
            "type": "reduction",
            "combat": "fire",
            "value": 15
          }
        }
      }
    },
    "Quara Scale": {
      "name": "Quara Scale",
      "sub": "",
      "cat": 7,
      "icon": 40,
      "tiers": {
        1: {
          "items": [[10295, 25]],
          "desc": "Reduces ice damage by 3%.",
          "effect": {
            "type": "reduction",
            "combat": "ice",
            "value": 3
          }
        },
        2: {
          "items": [[10295, 25], [10307, 15]],
          "desc": "Reduces ice damage by 8%.",
          "effect": {
            "type": "reduction",
            "combat": "ice",
            "value": 8
          }
        },
        3: {
          "items": [[10295, 25], [10307, 15], [14012, 10]],
          "desc": "Reduces ice damage by 15%.",
          "effect": {
            "type": "reduction",
            "combat": "ice",
            "value": 15
          }
        }
      }
    },
    "Cloud Fabric": {
      "name": "Cloud Fabric",
      "sub": "",
      "cat": 8,
      "icon": 31,
      "tiers": {
        1: {
          "items": [[9644, 20]],
          "desc": "Reduces energy damage by 3%.",
          "effect": {
            "type": "reduction",
            "combat": "energy",
            "value": 3
          }
        },
        2: {
          "items": [[9644, 20], [14079, 15]],
          "desc": "Reduces energy damage by 8%.",
          "effect": {
            "type": "reduction",
            "combat": "energy",
            "value": 8
          }
        },
        3: {
          "items": [[9644, 20], [14079, 15], [9665, 10]],
          "desc": "Reduces energy damage by 15%.",
          "effect": {
            "type": "reduction",
            "combat": "energy",
            "value": 15
          }
        }
      }
    },
    "Demon Presence": {
      "name": "Demon Presence",
      "sub": "",
      "cat": 9,
      "icon": 37,
      "tiers": {
        1: {
          "items": [[9639, 25]],
          "desc": "Reduces holy damage by 3%.",
          "effect": {
            "type": "reduction",
            "combat": "holy",
            "value": 3
          }
        },
        2: {
          "items": [[9639, 25], [9638, 25]],
          "desc": "Reduces holy damage by 8%.",
          "effect": {
            "type": "reduction",
            "combat": "holy",
            "value": 8
          }
        },
        3: {
          "items": [[9639, 25], [9638, 25], [10304, 20]],
          "desc": "Reduces holy damage by 15%.",
          "effect": {
            "type": "reduction",
            "combat": "holy",
            "value": 15
          }
        }
      }
    },
    "Swiftness": {
      "name": "Swiftness",
      "sub": "",
      "cat": 10,
      "icon": 73,
      "tiers": {
        1: {
          "items": [[17458, 15]],
          "desc": "Raises walking speed by 10.",
          "effect": {
            "type": "speed",
            "value": 10
          }
        },
        2: {
          "items": [[17458, 15], [10302, 25]],
          "desc": "Raises walking speed by 15.",
          "effect": {
            "type": "speed",
            "value": 15
          }
        },
        3: {
          "items": [[17458, 15], [10302, 25], [14081, 20]],
          "desc": "Raises walking speed by 30.",
          "effect": {
            "type": "speed",
            "value": 30
          }
        }
      }
    },
    "Vibrancy": {
      "name": "Vibrancy",
      "sub": "",
      "cat": 19,
      "icon": 79,
      "tiers": {
        1: {
          "items": [[22053, 20]],
          "desc": "Removes paralysis with a chance of 15% and always deflects PvP paralysis upon additional paralyse attacks.",
          "effect": {
            "type": "paralysis",
            "chance": 15
          }
        },
        2: {
          "items": [[22053, 20], [23507, 15]],
          "desc": "Removes paralysis with a chance of 25% and always deflects PvP paralysis upon additional paralyse attacks.",
          "effect": {
            "type": "paralysis",
            "chance": 25
          }
        },
        3: {
          "items": [[22053, 20], [23507, 15], [28567, 5]],
          "desc": "Removes paralysis with a chance of 50% and always deflects PvP paralysis upon additional paralyse attacks.",
          "effect": {
            "type": "paralysis",
            "chance": 50
          }
        }
      }
    },
    "Chop": {
      "name": "Chop",
      "sub": "",
      "cat": 11,
      "icon": 52,
      "tiers": {
        1: {
          "items": [[10196, 20]],
          "desc": "Raises axe fighting skill by 1.",
          "effect": {
            "type": "skill",
            "value": "axe",
            "bonus": 1
          }
        },
        2: {
          "items": [[10196, 20], [11447, 25]],
          "desc": "Raises axe fighting skill by 2.",
          "effect": {
            "type": "skill",
            "value": "axe",
            "bonus": 2
          }
        },
        3: {
          "items": [[10196, 20], [11447, 25], [21200, 20]],
          "desc": "Raises axe fighting skill by 4.",
          "effect": {
            "type": "skill",
            "value": "axe",
            "bonus": 4
          }
        }
      }
    },
    "Slash": {
      "name": "Slash",
      "sub": "",
      "cat": 12,
      "icon": 70,
      "tiers": {
        1: {
          "items": [[9691, 25]],
          "desc": "Raises sword fighting skill by 1.",
          "effect": {
            "type": "skill",
            "value": "sword",
            "bonus": 1
          }
        },
        2: {
          "items": [[9691, 25], [21202, 25]],
          "desc": "Raises sword fighting skill by 2.",
          "effect": {
            "type": "skill",
            "value": "sword",
            "bonus": 2
          }
        },
        3: {
          "items": [[9691, 25], [21202, 25], [9654, 5]],
          "desc": "Raises sword fighting skill by 4.",
          "effect": {
            "type": "skill",
            "value": "sword",
            "bonus": 4
          }
        }
      }
    },
    "Bash": {
      "name": "Bash",
      "sub": "",
      "cat": 13,
      "icon": 55,
      "tiers": {
        1: {
          "items": [[9657, 20]],
          "desc": "Raises club fighting skill by 1.",
          "effect": {
            "type": "skill",
            "value": "club",
            "bonus": 1
          }
        },
        2: {
          "items": [[9657, 20], [22189, 15]],
          "desc": "Raises club fighting skill by 2.",
          "effect": {
            "type": "skill",
            "value": "club",
            "bonus": 2
          }
        },
        3: {
          "items": [[9657, 20], [22189, 15], [10405, 10]],
          "desc": "Raises club fighting skill by 4.",
          "effect": {
            "type": "skill",
            "value": "club",
            "bonus": 4
          }
        }
      }
    },
    "Precision": {
      "name": "Precision",
      "sub": "",
      "cat": 15,
      "icon": 58,
      "tiers": {
        1: {
          "items": [[11464, 25]],
          "desc": "Raises distance fighting skill by 1.",
          "effect": {
            "type": "skill",
            "value": "distance",
            "bonus": 1
          }
        },
        2: {
          "items": [[11464, 25], [18994, 20]],
          "desc": "Raises distance fighting skill by 2.",
          "effect": {
            "type": "skill",
            "value": "distance",
            "bonus": 2
          }
        },
        3: {
          "items": [[11464, 25], [18994, 20], [10298, 10]],
          "desc": "Raises distance fighting skill by 4.",
          "effect": {
            "type": "skill",
            "value": "distance",
            "bonus": 4
          }
        }
      }
    },
    "Blockade": {
      "name": "Blockade",
      "sub": "",
      "cat": 14,
      "icon": 67,
      "tiers": {
        1: {
          "items": [[9641, 20]],
          "desc": "Raises shielding skill by 1.",
          "effect": {
            "type": "skill",
            "value": "shield",
            "bonus": 1
          }
        },
        2: {
          "items": [[9641, 20], [11703, 25]],
          "desc": "Raises shielding skill by 2.",
          "effect": {
            "type": "skill",
            "value": "shield",
            "bonus": 2
          }
        },
        3: {
          "items": [[9641, 20], [11703, 25], [20199, 25]],
          "desc": "Raises shielding skill by 4.",
          "effect": {
            "type": "skill",
            "value": "shield",
            "bonus": 4
          }
        }
      }
    },
    "Epiphany": {
      "name": "Epiphany",
      "sub": "",
      "cat": 16,
      "icon": 64,
      "tiers": {
        1: {
          "items": [[9635, 25]],
          "desc": "Raises magic level by 1.",
          "effect": {
            "type": "skill",
            "value": "magicpoints",
            "bonus": 1
          }
        },
        2: {
          "items": [[9635, 25], [11452, 15]],
          "desc": "Raises magic level by 2.",
          "effect": {
            "type": "skill",
            "value": "magicpoints",
            "bonus": 2
          }
        },
        3: {
          "items": [[9635, 25], [11452, 15], [10309, 15]],
          "desc": "Raises magic level by 4.",
          "effect": {
            "type": "skill",
            "value": "magicpoints",
            "bonus": 4
          }
        }
      }
    },
    "Punch": {
      "name": "Punch",
      "sub": "",
      "cat": 18,
      "icon": 61,
      "tiers": {
        1: {
          "items": [[9690, 20]],
          "desc": "Raises fist fighting skill by 1.",
          "effect": {
            "type": "skill",
            "value": "fist",
            "bonus": 1
          }
        },
        2: {
          "items": [[10281, 25], [11489, 20]],
          "desc": "Raises fist fighting skill by 2.",
          "effect": {
            "type": "skill",
            "value": "fist",
            "bonus": 2
          }
        },
        3: {
          "items": [[10281, 25], [11489, 20], [40529, 15]],
          "desc": "Raises fist fighting skill by 4.",
          "effect": {
            "type": "skill",
            "value": "fist",
            "bonus": 4
          }
        }
      }
    },
    "Featherweight": {
      "name": "Featherweight",
      "sub": "",
      "cat": 17,
      "icon": 76,
      "tiers": {
        1: {
          "items": [[25694, 20]],
          "desc": "Raises capacity by 3.",
          "effect": {
            "type": "capacity",
            "value": 3
          }
        },
        2: {
          "items": [[25694, 20], [25702, 10]],
          "desc": "Raises capacity by 8.",
          "effect": {
            "type": "capacity",
            "value": 8
          }
        },
        3: {
          "items": [[25694, 20], [25702, 10], [20205, 5]],
          "desc": "Raises capacity by 15.",
          "effect": {
            "type": "capacity",
            "value": 15
          }
        }
      }
    }
  },
  "mats": {
    9636: "fiery heart",
    5920: "green dragon scale",
    5954: "demon horn",
    9686: "swamp grass",
    9640: "poisonous slime",
    21194: "slime heart",
    9661: "frosty heart",
    21801: "seacrest hair",
    9650: "polar bear paw",
    18993: "rorc feather",
    21975: "peacock feather fan",
    23508: "energy vein",
    11484: "pile of grave earth",
    9647: "demonic skeletal hand",
    10420: "petrified scream",
    9685: "vampire teeth",
    9633: "bloody pincers",
    9663: "piece of dead brain",
    11492: "rope belt",
    20200: "silencer claws",
    22730: "some grimeleech wings",
    11444: "protective charm",
    10311: "sabretooth",
    22728: "vexclaw talon",
    11466: "flask of embalming fluid",
    22007: "gloom wolf fur",
    9660: "mystical hourglass",
    17823: "piece of swampling wood",
    9694: "snake skin",
    11702: "brimstone fangs",
    5877: "green dragon leather",
    16131: "blazing bone",
    11658: "draken sulphur",
    10295: "winter wolf fur",
    10307: "thick fur",
    14012: "deepling warts",
    9644: "wyvern talisman",
    14079: "crawler head plating",
    9665: "wyrm scale",
    9639: "cultish robe",
    9638: "cultish mask",
    10304: "hellspawn tail",
    17458: "damselfly wing",
    10302: "compass",
    14081: "waspoid wing",
    22053: "wereboar hooves",
    23507: "crystallized anger",
    28567: "quill",
    10196: "orc tooth",
    11447: "battle stone",
    21200: "moohtant horn",
    9691: "lion's mane",
    21202: "mooh'tah shell",
    9654: "war crystal",
    9657: "cyclops toe",
    22189: "ogre nose ring",
    10405: "warmaster's wristguards",
    11464: "elven scouting glass",
    18994: "elven hoof",
    10298: "metal spike",
    9641: "piece of scarab shell",
    11703: "brimstone shell",
    20199: "frazzle skin",
    9635: "elvish talisman",
    11452: "broken shamanic staff",
    10309: "strand of medusa hair",
    9690: "ghostly tissue",
    10281: "tarantula egg",
    11489: "mantassin tail",
    40529: "gold-brocaded cloth",
    25694: "fairy wings",
    25702: "little bowl of myrrh",
    20205: "goosebump leather"
  }
};
