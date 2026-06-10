/* =========================================================================
   KORNA — global config + math utilities
   ========================================================================= */
"use strict";

const CFG = {
  W: 1024,
  H: 600,

  // Court sits inside a stadium; this margin is the stands/crowd ring
  board: 86,         // stadium ring thickness around the court
  goalDepth: 22,     // how deep the goal recess is
  goalMouth: 150,    // vertical size of the goal opening
  barHeight: 78,     // a ball higher than this sails over the bar (no goal)

  // Ball physics (per second)
  ballGroundFriction: 1.9,   // velocity decay while rolling
  ballAirFriction: 0.18,
  ballBounce: 0.66,          // energy kept on a wall/ground bounce
  gravity: 1500,             // downward accel on ball height (z)
  ballRadius: 9,

  // Player movement (per second) — tuned slower so the zoomed view reads smooth
  accel: 1500,
  maxSpeed: 178,
  sprintMul: 1.45,
  friction: 10,              // how quickly a player slides to a stop
  turnRate: 12,              // how fast facing rotates toward velocity

  // Interaction
  controlRadius: 30,         // how close to "own" the loose ball
  dribbleDist: 24,           // how far ahead the ball sits while dribbling
  stealReach: 30,
  stealCooldown: 0.55,
  shootMin: 340,
  shootMax: 820,
  shootChargeRate: 720,      // power per second while holding shoot
  passPower: 560,

  matchSeconds: 120,
  goalCelebration: 2.6,
  tilt: 0.62,                // vertical squash of the ground for the 3/4 action camera

  // --- Street Hoop arcade layer ---
  turboDrain: 0.55,        // turbo used per second while sprinting
  turboRecharge: 0.30,     // turbo regained per second when not
  jukeCost: 0.30,          // turbo spent on a skill-move
  jukeSpeed: 360,          // burst speed of a juke
  jukeTime: 0.22,
  jukeCooldown: 0.55,
  slideSpeed: 330,         // slide-tackle lunge speed
  slideTime: 0.32,
  slideRecover: 0.45,      // stuck time after a slide
  slideReach: 46,          // steal radius during a slide
  heatPerGoal: 0.7,        // streak heat from a goal
  heatPerSkill: 0.22,      // heat from a skill-move / tackle win
  heatDecay: 0.10,         // heat lost per second
  fireTime: 8,             // "ON FIRE" duration once heat fills
  onFireBoost: 1.18,       // speed/power multiplier while on fire
};

// Derived play-field bounds
CFG.left = CFG.board;
CFG.right = CFG.W - CFG.board;
CFG.top = CFG.board;
CFG.bottom = CFG.H - CFG.board;
CFG.midX = (CFG.left + CFG.right) / 2;
CFG.midY = (CFG.top + CFG.bottom) / 2;
CFG.goalTop = CFG.midY - CFG.goalMouth / 2;
CFG.goalBot = CFG.midY + CFG.goalMouth / 2;
CFG.pw = CFG.right - CFG.left;   // play width
CFG.ph = CFG.bottom - CFG.top;   // play height

/* ---------------- math helpers ---------------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const chance = (p) => Math.random() < p;
const sign = (v) => (v < 0 ? -1 : 1);

// shortest signed angular difference b - a, wrapped to [-PI, PI]
function angDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// rotate angle a toward b by at most `rate`
function turnToward(a, b, rate) {
  const d = angDelta(a, b);
  if (Math.abs(d) <= rate) return b;
  return a + sign(d) * rate;
}

// world position from a 0..1 formation fraction
function fx(f) { return CFG.left + f * CFG.pw; }
function fy(f) { return CFG.top + f * CFG.ph; }

// is point inside the goal-mouth vertical band
function inMouth(y) { return y > CFG.goalTop && y < CFG.goalBot; }
