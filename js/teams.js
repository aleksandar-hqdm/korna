/* =========================================================================
   KORNA — squads: the KORNA kids + the 8 legend opponents
   ========================================================================= */
"use strict";

/* ---- THE KORNA KIDS (home side, attack to the right) ----
   stats are multipliers around 1.0
   hair styles are drawn in render.js: curlfade | short | floppy | round | football
*/
const KIDS = {
  name: "KORNA",
  short: "KORNA",
  era: "the backyard",
  star: "Vanja (c)",
  kit: { shirt: "#e23b4d", shorts: "#241f2b", sock: "#e23b4d", num: "#ffffff" },
  flag: "⚽",
  blurb: "Six kids, one cage, no fear.",
  outfield: [
    { name: "Vanja", role: "MID", captain: true, size: 0.92,
      hair: "#7d5a2e", hairStyle: "curlfade", skin: "#f0c39b", eyes: "#3f9a55",
      home: [0.40, 0.50],
      stats: { speed: 1.06, accel: 1.18, power: 0.9, skill: 1.18, stamina: 1.3 } },
    { name: "Fiči", role: "DEF", size: 1.02,
      hair: "#8a6633", hairStyle: "short", skin: "#eebd95",
      home: [0.26, 0.50],
      stats: { speed: 0.95, accel: 0.98, power: 1.05, skill: 0.95, defense: 1.3 } },
    { name: "Bobo", role: "ST", size: 0.93, smile: true,
      hair: "#e7d27a", hairStyle: "floppy", skin: "#f6d2ac", eyes: "#4aa6d6",
      home: [0.74, 0.42],
      stats: { speed: 1.0, accel: 1.06, power: 0.95, skill: 1.0, finishing: 1.35 } },
    { name: "Marko", role: "WING", size: 0.82,
      hair: "#5d3f24", hairStyle: "round", skin: "#ecba8e",
      home: [0.56, 0.22],
      stats: { speed: 1.24, accel: 1.26, power: 0.82, skill: 1.05 } },
    { name: "Jan", role: "FWD", size: 1.14, age7: true,
      hair: "#3c2a1a", hairStyle: "football", skin: "#e6b487",
      home: [0.60, 0.64],
      stats: { speed: 1.0, accel: 0.96, power: 1.4, skill: 1.12 } },
  ],
  keeper: { name: "Cacko", role: "GK", size: 1.34, keeper: true,
    hair: "#2c2016", hairStyle: "short", skin: "#eec39a",
    gk: { shirt: "#1a57c8", shorts: "#0c2f73", sock: "#1a57c8" },
    home: [0.06, 0.50],
    stats: { speed: 0.9, accel: 1.05, power: 1.1, skill: 1.0, reach: 1.35 } },
};

/* ---- THE LEGENDS (away side, attack to the left) ----
   diff 1..5 scales AI sharpness & press; mod scales team-wide ability.
   style flavours the AI (dribble | passing | pace | flair | defend | poach).
*/
const TEAMS = [
  { id: "br82", name: "Brazil", era: "Sócrates era", star: "Sócrates", flag: "🇧🇷",
    kit: { shirt: "#f5d400", shorts: "#1f56c4", sock: "#ffffff", num: "#0b6b34" },
    skin: "#a8703f", hair: "#16110c",
    diff: 3, style: "passing", blurb: "Beautiful, unhurried, total joy.",
    mod: { speed: 1.0, accel: 1.0, power: 1.02, skill: 1.2, defense: 1.0 } },

  { id: "ar86", name: "Argentina", era: "Maradona era", star: "D. Maradona", flag: "🇦🇷",
    kit: { shirt: "#7cc3e9", shorts: "#13224f", sock: "#ffffff", num: "#13224f" },
    skin: "#d8a878", hair: "#241a12",
    diff: 4, style: "dribble", blurb: "One genius, ten runners.",
    mod: { speed: 1.05, accel: 1.1, power: 1.0, skill: 1.32, defense: 0.98 } },

  { id: "nl88", name: "Netherlands", era: "Van Basten era", star: "M. van Basten", flag: "🇳🇱",
    kit: { shirt: "#ff7a18", shorts: "#0c0c0c", sock: "#ff7a18", num: "#0c0c0c" },
    skin: "#e9c39c", hair: "#caa24f",
    diff: 4, style: "passing", blurb: "Total football, total angles.",
    mod: { speed: 1.04, accel: 1.05, power: 1.18, skill: 1.18, defense: 1.05 } },

  { id: "en98", name: "England", era: "Owen era", star: "M. Owen", flag: "🇬🇧",
    kit: { shirt: "#f4f6fb", shorts: "#0d1b54", sock: "#0d1b54", num: "#c8202f" },
    skin: "#f0cdab", hair: "#7a5230",
    diff: 3, style: "pace", blurb: "Blink and the striker's gone.",
    mod: { speed: 1.22, accel: 1.18, power: 1.05, skill: 1.0, defense: 1.0 } },

  { id: "br02", name: "Brazil", era: "Ronaldo & Ronaldinho era", star: "R. Nazário", flag: "🇧🇷",
    kit: { shirt: "#ffe11a", shorts: "#0f3fae", sock: "#0f3fae", num: "#127a3a" },
    skin: "#9c6638", hair: "#0d0a08",
    diff: 5, style: "flair", blurb: "Pure magic. The hardest test.",
    mod: { speed: 1.12, accel: 1.14, power: 1.22, skill: 1.36, defense: 1.05 } },

  { id: "it94", name: "Italy", era: "Baggio era", star: "R. Baggio", flag: "🇮🇹",
    kit: { shirt: "#1f4fb0", shorts: "#0a0a0a", sock: "#1f4fb0", num: "#ffffff" },
    skin: "#e3b489", hair: "#1a120c",
    diff: 4, style: "defend", blurb: "Lock the back, strike on the turn.",
    mod: { speed: 1.0, accel: 1.0, power: 1.06, skill: 1.16, defense: 1.32 } },

  { id: "jp98", name: "Japan", era: "Nakata era", star: "H. Nakata", flag: "🇯🇵",
    kit: { shirt: "#1768d6", shorts: "#0c1b3a", sock: "#ffffff", num: "#ffffff" },
    skin: "#f1cda6", hair: "#1c1411",
    diff: 2, style: "passing", blurb: "Tidy, brave, fast feet.",
    mod: { speed: 1.04, accel: 1.06, power: 0.95, skill: 1.1, defense: 1.0 } },

  { id: "ng94", name: "Nigeria", era: "Okocha era", star: "J.J. Okocha", flag: "🇳🇬",
    kit: { shirt: "#16a64a", shorts: "#ffffff", sock: "#16a64a", num: "#0a0a0a" },
    skin: "#5a3a23", hair: "#0a0a0a",
    diff: 3, style: "flair", blurb: "Tricks, smiles, and rockets.",
    mod: { speed: 1.12, accel: 1.12, power: 1.12, skill: 1.26, defense: 0.98 } },
];

// 7 outfield + GK formation for the legends (they defend the RIGHT goal).
// fractions are in KORNA-pitch space; render mirrors via side later.
const AWAY_FORMATION = {
  keeper: [0.94, 0.50],
  outfield: [
    [0.76, 0.26], [0.78, 0.50], [0.76, 0.74],   // 3 at the back
    [0.60, 0.36], [0.60, 0.64],                  // 2 in midfield
    [0.44, 0.40], [0.44, 0.60],                  // 2 up top
  ],
};
