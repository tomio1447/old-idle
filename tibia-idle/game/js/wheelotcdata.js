/* Gerado do otclient (buttons.lua / icons.lua / wheelMenu.otui).
 * WHEEL_OTC[slotId] = arte e geometria exatas do cliente:
 *   idx    -> indice 1-36 do OTC
 *   color  -> dir do fill progressivo (wheel-colors/<dir>/<frame>.png, 1..frames)
 *   border -> moldura dourada selecionada (wheel-border/<border>.png)
 *   focus  -> overlay de hover (wheel-colors/<focus>.png)
 *   frames -> n de frames do fill (raio do anel)
 *   x,y    -> centro do icone 30x30 no canvas 522x522
 *   sdx,sdy-> offset do mini-icone 16x16 dentro do icone
 *   icons  -> [celula mediumperks, celula smallperks] por vocacao
 */
var WHEEL_OTC = {
 "BLUE_200": {
  "border": "bottom_left/9",
  "color": "bottom_left/slot9",
  "focus": "bottom_left/BottonLeft_9",
  "frames": 20,
  "icons": {
   "druid": [
    29,
    2
   ],
   "knight": [
    10,
    2
   ],
   "monk": [
    44,
    2
   ],
   "paladin": [
    18,
    2
   ],
   "sorcerer": [
    24,
    2
   ]
  },
  "idx": 31,
  "sdx": -10,
  "sdy": 10,
  "x": 95,
  "y": 427
 },
 "BLUE_50": {
  "border": "bottom_left/1",
  "color": "bottom_left/slot1",
  "focus": "bottom_left/BottonLeft_1",
  "frames": 5,
  "icons": {
   "druid": [
    31,
    1
   ],
   "knight": [
    12,
    1
   ],
   "monk": [
    47,
    1
   ],
   "paladin": [
    22,
    1
   ],
   "sorcerer": [
    27,
    1
   ]
  },
  "idx": 21,
  "sdx": -10,
  "sdy": 10,
  "x": 241,
  "y": 281
 },
 "BLUE_BOTTOM_100": {
  "border": "bottom_left/6",
  "color": "bottom_left/slot6",
  "focus": "bottom_left/BottonLeft_6",
  "frames": 10,
  "icons": {
   "druid": [
    34,
    4
   ],
   "knight": [
    7,
    4
   ],
   "monk": [
    43,
    4
   ],
   "paladin": [
    15,
    4
   ],
   "sorcerer": [
    34,
    4
   ]
  },
  "idx": 33,
  "sdx": -10,
  "sdy": 10,
  "x": 226,
  "y": 388
 },
 "BLUE_BOTTOM_150": {
  "border": "bottom_left/8",
  "color": "bottom_left/slot8",
  "focus": "bottom_left/BottonLeft_8",
  "frames": 15,
  "icons": {
   "druid": [
    39,
    3
   ],
   "knight": [
    39,
    3
   ],
   "monk": [
    39,
    3
   ],
   "paladin": [
    39,
    3
   ],
   "sorcerer": [
    39,
    3
   ]
  },
  "idx": 32,
  "sdx": -10,
  "sdy": 10,
  "x": 169,
  "y": 419
 },
 "BLUE_BOTTOM_75": {
  "border": "bottom_left/3",
  "color": "bottom_left/slot3",
  "focus": "bottom_left/BottonLeft_3",
  "frames": 8,
  "icons": {
   "druid": [
    39,
    0
   ],
   "knight": [
    39,
    0
   ],
   "monk": [
    39,
    0
   ],
   "paladin": [
    39,
    0
   ],
   "sorcerer": [
    39,
    0
   ]
  },
  "idx": 27,
  "sdx": -10,
  "sdy": 10,
  "x": 230,
  "y": 334
 },
 "BLUE_MIDDLE_100": {
  "border": "bottom_left/5",
  "color": "bottom_left/slot5",
  "focus": "bottom_left/BottonLeft_5",
  "frames": 10,
  "icons": {
   "druid": [
    33,
    4
   ],
   "knight": [
    14,
    4
   ],
   "monk": [
    46,
    4
   ],
   "paladin": [
    20,
    4
   ],
   "sorcerer": [
    26,
    4
   ]
  },
  "idx": 26,
  "sdx": -10,
  "sdy": 10,
  "x": 168,
  "y": 354
 },
 "BLUE_TOP_100": {
  "border": "bottom_left/4",
  "color": "bottom_left/slot4",
  "focus": "bottom_left/BottonLeft_4",
  "frames": 10,
  "icons": {
   "druid": [
    39,
    4
   ],
   "knight": [
    39,
    4
   ],
   "monk": [
    39,
    4
   ],
   "paladin": [
    39,
    4
   ],
   "sorcerer": [
    39,
    4
   ]
  },
  "idx": 19,
  "sdx": -10,
  "sdy": 10,
  "x": 134,
  "y": 296
 },
 "BLUE_TOP_150": {
  "border": "bottom_left/7",
  "color": "bottom_left/slot7",
  "focus": "bottom_left/BottonLeft_7",
  "frames": 15,
  "icons": {
   "druid": [
    6,
    3
   ],
   "knight": [
    6,
    3
   ],
   "monk": [
    6,
    3
   ],
   "paladin": [
    6,
    3
   ],
   "sorcerer": [
    6,
    3
   ]
  },
  "idx": 25,
  "sdx": -10,
  "sdy": 10,
  "x": 103,
  "y": 353
 },
 "BLUE_TOP_75": {
  "border": "bottom_left/2",
  "color": "bottom_left/slot2",
  "focus": "bottom_left/BottonLeft_2",
  "frames": 8,
  "icons": {
   "druid": [
    5,
    0
   ],
   "knight": [
    5,
    0
   ],
   "monk": [
    5,
    0
   ],
   "paladin": [
    5,
    0
   ],
   "sorcerer": [
    5,
    0
   ]
  },
  "idx": 20,
  "sdx": -10,
  "sdy": 10,
  "x": 189,
  "y": 291
 },
 "GREEN_200": {
  "border": "top_left/9",
  "color": "top_left/slot9",
  "focus": "top_left/TopLeft_9",
  "frames": 20,
  "icons": {
   "druid": [
    28,
    2
   ],
   "knight": [
    8,
    2
   ],
   "monk": [
    42,
    2
   ],
   "paladin": [
    17,
    2
   ],
   "sorcerer": [
    35,
    2
   ]
  },
  "idx": 1,
  "sdx": -10,
  "sdy": 10,
  "x": 95,
  "y": 95
 },
 "GREEN_50": {
  "border": "top_left/1",
  "color": "top_left/slot1",
  "focus": "top_left/TopLeft_1",
  "frames": 5,
  "icons": {
   "druid": [
    37,
    3
   ],
   "knight": [
    37,
    3
   ],
   "monk": [
    37,
    3
   ],
   "paladin": [
    37,
    3
   ],
   "sorcerer": [
    37,
    3
   ]
  },
  "idx": 15,
  "sdx": -10,
  "sdy": 10,
  "x": 241,
  "y": 241
 },
 "GREEN_BOTTOM_100": {
  "border": "top_left/4",
  "color": "top_left/slot4",
  "focus": "top_left/TopLeft_4",
  "frames": 10,
  "icons": {
   "druid": [
    30,
    0
   ],
   "knight": [
    11,
    0
   ],
   "monk": [
    48,
    0
   ],
   "paladin": [
    19,
    0
   ],
   "sorcerer": [
    25,
    0
   ]
  },
  "idx": 13,
  "sdx": -10,
  "sdy": 10,
  "x": 134,
  "y": 226
 },
 "GREEN_BOTTOM_150": {
  "border": "top_left/7",
  "color": "top_left/slot7",
  "focus": "top_left/TopLeft_7",
  "frames": 15,
  "icons": {
   "druid": [
    37,
    4
   ],
   "knight": [
    37,
    4
   ],
   "monk": [
    37,
    4
   ],
   "paladin": [
    37,
    4
   ],
   "sorcerer": [
    37,
    4
   ]
  },
  "idx": 7,
  "sdx": -10,
  "sdy": 10,
  "x": 102,
  "y": 169
 },
 "GREEN_BOTTOM_75": {
  "border": "top_left/2",
  "color": "top_left/slot2",
  "focus": "top_left/TopLeft_2",
  "frames": 8,
  "icons": {
   "druid": [
    34,
    1
   ],
   "knight": [
    7,
    1
   ],
   "monk": [
    43,
    1
   ],
   "paladin": [
    15,
    1
   ],
   "sorcerer": [
    34,
    1
   ]
  },
  "idx": 14,
  "sdx": -10,
  "sdy": 10,
  "x": 189,
  "y": 231
 },
 "GREEN_MIDDLE_100": {
  "border": "top_left/5",
  "color": "top_left/slot5",
  "focus": "top_left/TopLeft_5",
  "frames": 10,
  "icons": {
   "druid": [
    32,
    0
   ],
   "knight": [
    13,
    0
   ],
   "monk": [
    45,
    0
   ],
   "paladin": [
    21,
    0
   ],
   "sorcerer": [
    36,
    0
   ]
  },
  "idx": 8,
  "sdx": -10,
  "sdy": 10,
  "x": 168,
  "y": 168
 },
 "GREEN_TOP_100": {
  "border": "top_left/6",
  "color": "top_left/slot6",
  "focus": "top_left/TopLeft_6",
  "frames": 10,
  "icons": {
   "druid": [
    37,
    0
   ],
   "knight": [
    37,
    0
   ],
   "monk": [
    37,
    0
   ],
   "paladin": [
    37,
    0
   ],
   "sorcerer": [
    37,
    0
   ]
  },
  "idx": 3,
  "sdx": -10,
  "sdy": 10,
  "x": 226,
  "y": 134
 },
 "GREEN_TOP_150": {
  "border": "top_left/8",
  "color": "top_left/slot8",
  "focus": "top_left/TopLeft_8",
  "frames": 15,
  "icons": {
   "druid": [
    5,
    4
   ],
   "knight": [
    5,
    4
   ],
   "monk": [
    5,
    4
   ],
   "paladin": [
    5,
    4
   ],
   "sorcerer": [
    5,
    4
   ]
  },
  "idx": 2,
  "sdx": -10,
  "sdy": 10,
  "x": 169,
  "y": 102
 },
 "GREEN_TOP_75": {
  "border": "top_left/3",
  "color": "top_left/slot3",
  "focus": "top_left/TopLeft_3",
  "frames": 8,
  "icons": {
   "druid": [
    6,
    1
   ],
   "knight": [
    6,
    1
   ],
   "monk": [
    6,
    1
   ],
   "paladin": [
    6,
    1
   ],
   "sorcerer": [
    6,
    1
   ]
  },
  "idx": 9,
  "sdx": -10,
  "sdy": 10,
  "x": 229,
  "y": 190
 },
 "PURPLE_200": {
  "border": "bottom_right/9",
  "color": "bottom_right/slot9",
  "focus": "bottom_right/BottonRight_9",
  "frames": 20,
  "icons": {
   "druid": [
    35,
    2
   ],
   "knight": [
    9,
    2
   ],
   "monk": [
    41,
    2
   ],
   "paladin": [
    16,
    2
   ],
   "sorcerer": [
    27,
    2
   ]
  },
  "idx": 36,
  "sdx": -10,
  "sdy": 10,
  "x": 427,
  "y": 427
 },
 "PURPLE_50": {
  "border": "bottom_right/1",
  "color": "bottom_right/slot1",
  "focus": "bottom_right/BottonRight_1",
  "frames": 5,
  "icons": {
   "druid": [
    40,
    0
   ],
   "knight": [
    40,
    0
   ],
   "monk": [
    40,
    0
   ],
   "paladin": [
    40,
    0
   ],
   "sorcerer": [
    40,
    0
   ]
  },
  "idx": 22,
  "sdx": -10,
  "sdy": 10,
  "x": 281,
  "y": 281
 },
 "PURPLE_BOTTOM_100": {
  "border": "bottom_right/6",
  "color": "bottom_right/slot4",
  "focus": "bottom_right/BottonRight_4",
  "frames": 10,
  "icons": {
   "druid": [
    40,
    3
   ],
   "knight": [
    40,
    3
   ],
   "monk": [
    40,
    3
   ],
   "paladin": [
    40,
    3
   ],
   "sorcerer": [
    40,
    3
   ]
  },
  "idx": 34,
  "sdx": -10,
  "sdy": 10,
  "x": 296,
  "y": 388
 },
 "PURPLE_BOTTOM_150": {
  "border": "bottom_right/8",
  "color": "bottom_right/slot7",
  "focus": "bottom_right/BottonRight_7",
  "frames": 15,
  "icons": {
   "druid": [
    6,
    1
   ],
   "knight": [
    6,
    1
   ],
   "monk": [
    6,
    1
   ],
   "paladin": [
    6,
    1
   ],
   "sorcerer": [
    6,
    1
   ]
  },
  "idx": 35,
  "sdx": -10,
  "sdy": 10,
  "x": 353,
  "y": 419
 },
 "PURPLE_BOTTOM_75": {
  "border": "bottom_right/3",
  "color": "bottom_right/slot2",
  "focus": "bottom_right/BottonRight_2",
  "frames": 8,
  "icons": {
   "druid": [
    5,
    4
   ],
   "knight": [
    5,
    4
   ],
   "monk": [
    5,
    4
   ],
   "paladin": [
    5,
    4
   ],
   "sorcerer": [
    5,
    4
   ]
  },
  "idx": 28,
  "sdx": -10,
  "sdy": 10,
  "x": 292,
  "y": 334
 },
 "PURPLE_MIDDLE_100": {
  "border": "bottom_right/5",
  "color": "bottom_right/slot5",
  "focus": "bottom_right/BottonRight_5",
  "frames": 10,
  "icons": {
   "druid": [
    30,
    3
   ],
   "knight": [
    11,
    3
   ],
   "monk": [
    48,
    3
   ],
   "paladin": [
    19,
    3
   ],
   "sorcerer": [
    25,
    3
   ]
  },
  "idx": 29,
  "sdx": -10,
  "sdy": 10,
  "x": 354,
  "y": 354
 },
 "PURPLE_TOP_100": {
  "border": "bottom_right/4",
  "color": "bottom_right/slot6",
  "focus": "bottom_right/BottonRight_6",
  "frames": 10,
  "icons": {
   "druid": [
    32,
    3
   ],
   "knight": [
    13,
    3
   ],
   "monk": [
    45,
    3
   ],
   "paladin": [
    21,
    3
   ],
   "sorcerer": [
    36,
    3
   ]
  },
  "idx": 24,
  "sdx": -10,
  "sdy": 10,
  "x": 388,
  "y": 296
 },
 "PURPLE_TOP_150": {
  "border": "bottom_right/7",
  "color": "bottom_right/slot8",
  "focus": "bottom_right/BottonRight_8",
  "frames": 15,
  "icons": {
   "druid": [
    40,
    1
   ],
   "knight": [
    40,
    1
   ],
   "monk": [
    40,
    1
   ],
   "paladin": [
    40,
    1
   ],
   "sorcerer": [
    40,
    1
   ]
  },
  "idx": 30,
  "sdx": -10,
  "sdy": 10,
  "x": 419,
  "y": 353
 },
 "PURPLE_TOP_75": {
  "border": "bottom_right/2",
  "color": "bottom_right/slot3",
  "focus": "bottom_right/BottonRight_3",
  "frames": 8,
  "icons": {
   "druid": [
    34,
    4
   ],
   "knight": [
    7,
    4
   ],
   "monk": [
    43,
    4
   ],
   "paladin": [
    15,
    4
   ],
   "sorcerer": [
    34,
    4
   ]
  },
  "idx": 23,
  "sdx": -10,
  "sdy": 10,
  "x": 333,
  "y": 291
 },
 "RED_200": {
  "border": "top_right/9",
  "color": "top_right/slot9",
  "focus": "top_right/TopRight_9",
  "frames": 20,
  "icons": {
   "druid": [
    31,
    2
   ],
   "knight": [
    12,
    2
   ],
   "monk": [
    47,
    2
   ],
   "paladin": [
    22,
    2
   ],
   "sorcerer": [
    27,
    2
   ]
  },
  "idx": 6,
  "sdx": -10,
  "sdy": 10,
  "x": 427,
  "y": 95
 },
 "RED_50": {
  "border": "top_right/1",
  "color": "top_right/slot1",
  "focus": "top_right/TopRight_1",
  "frames": 5,
  "icons": {
   "druid": [
    29,
    4
   ],
   "knight": [
    10,
    4
   ],
   "monk": [
    44,
    4
   ],
   "paladin": [
    18,
    4
   ],
   "sorcerer": [
    24,
    4
   ]
  },
  "idx": 16,
  "sdx": -10,
  "sdy": 10,
  "x": 281,
  "y": 241
 },
 "RED_BOTTOM_100": {
  "border": "top_right/4",
  "color": "top_right/slot6",
  "focus": "top_right/TopRight_6",
  "frames": 10,
  "icons": {
   "druid": [
    38,
    1
   ],
   "knight": [
    38,
    1
   ],
   "monk": [
    38,
    1
   ],
   "paladin": [
    38,
    1
   ],
   "sorcerer": [
    38,
    1
   ]
  },
  "idx": 18,
  "sdx": -10,
  "sdy": 10,
  "x": 388,
  "y": 226
 },
 "RED_BOTTOM_150": {
  "border": "top_right/7",
  "color": "top_right/slot7",
  "focus": "top_right/TopRight_7",
  "frames": 15,
  "icons": {
   "druid": [
    5,
    0
   ],
   "knight": [
    5,
    0
   ],
   "monk": [
    5,
    0
   ],
   "paladin": [
    5,
    0
   ],
   "sorcerer": [
    5,
    0
   ]
  },
  "idx": 12,
  "sdx": -10,
  "sdy": 10,
  "x": 420,
  "y": 169
 },
 "RED_BOTTOM_75": {
  "border": "top_right/2",
  "color": "top_right/slot2",
  "focus": "top_right/TopRight_2",
  "frames": 8,
  "icons": {
   "druid": [
    6,
    3
   ],
   "knight": [
    6,
    3
   ],
   "monk": [
    6,
    3
   ],
   "paladin": [
    6,
    3
   ],
   "sorcerer": [
    6,
    3
   ]
  },
  "idx": 17,
  "sdx": -10,
  "sdy": 10,
  "x": 333,
  "y": 231
 },
 "RED_MIDDLE_100": {
  "border": "top_right/5",
  "color": "top_right/slot5",
  "focus": "top_right/TopRight_5",
  "frames": 10,
  "icons": {
   "druid": [
    33,
    1
   ],
   "knight": [
    14,
    1
   ],
   "monk": [
    46,
    1
   ],
   "paladin": [
    20,
    1
   ],
   "sorcerer": [
    26,
    1
   ]
  },
  "idx": 11,
  "sdx": -10,
  "sdy": 10,
  "x": 354,
  "y": 168
 },
 "RED_TOP_100": {
  "border": "top_right/6",
  "color": "top_right/slot4",
  "focus": "top_right/TopRight_4",
  "frames": 10,
  "icons": {
   "druid": [
    34,
    1
   ],
   "knight": [
    7,
    1
   ],
   "monk": [
    43,
    1
   ],
   "paladin": [
    15,
    1
   ],
   "sorcerer": [
    34,
    1
   ]
  },
  "idx": 4,
  "sdx": -10,
  "sdy": 10,
  "x": 296,
  "y": 134
 },
 "RED_TOP_150": {
  "border": "top_right/8",
  "color": "top_right/slot8",
  "focus": "top_right/TopRight_8",
  "frames": 15,
  "icons": {
   "druid": [
    38,
    0
   ],
   "knight": [
    38,
    0
   ],
   "monk": [
    38,
    0
   ],
   "paladin": [
    38,
    0
   ],
   "sorcerer": [
    38,
    0
   ]
  },
  "idx": 5,
  "sdx": -10,
  "sdy": 10,
  "x": 353,
  "y": 102
 },
 "RED_TOP_75": {
  "border": "top_right/3",
  "color": "top_right/slot3",
  "focus": "top_right/TopRight_3",
  "frames": 8,
  "icons": {
   "druid": [
    38,
    3
   ],
   "knight": [
    38,
    3
   ],
   "monk": [
    38,
    3
   ],
   "paladin": [
    38,
    3
   ],
   "sorcerer": [
    38,
    3
   ]
  },
  "idx": 10,
  "sdx": -10,
  "sdy": 10,
  "x": 293,
  "y": 190
 }
};
