/* =========================================================================
   KORNA — AI: off-ball positioning, pressing, dribbling, passing, shooting
   world = { ball, allies, opponents, diff }
   ========================================================================= */
"use strict";

const AI = (() => {
  const ownGoalX = (s) => (s === "home" ? CFG.left : CFG.right);
  const tgtGoalX = (s) => (s === "home" ? CFG.right : CFG.left);
  const atkSign = (s) => (s === "home" ? 1 : -1);

  function driveTo(p, tx, ty, sprint, stopDist = 7) {
    const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy);
    if (m < stopDist) { p.setDrive(0, 0, false); return; }
    p.setDrive(dx / m, dy / m, !!sprint && m > 130);   // only sprint when there's real ground to cover
  }

  function rankToward(p, allies, tx, ty) {
    const dp = dist2(p.x, p.y, tx, ty);
    let r = 0;
    for (const a of allies) {
      if (a === p || a.keeper) continue;
      if (dist2(a.x, a.y, tx, ty) < dp) r++;
    }
    return r;
  }

  function nearestOpp(x, y, opponents, skipKeeper) {
    let best = null, bd = Infinity;
    for (const o of opponents) {
      if (skipKeeper && o.keeper) continue;
      const d = dist2(x, y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return { opp: best, d: Math.sqrt(bd) };
  }

  // ---------------- keeper ----------------
  function keeper(p, w) {
    const gx = ownGoalX(p.side);
    const lineX = gx + atkSign(p.side) * (p.radius + 5);
    let ty = clamp(w.ball.y, CFG.goalTop + 8, CFG.goalBot - 8);
    let tx = lineX;

    const threat = !w.ball.owner || w.ball.owner.side !== p.side;
    const ballDist = Math.abs(w.ball.x - gx);
    if (threat && ballDist < 170) {
      // step off the line toward the ball, but never too far
      const out = lerp(0, 64, 1 - ballDist / 170);
      tx = lineX + atkSign(p.side) * out;
      ty = clamp(w.ball.y, CFG.goalTop - 4, CFG.goalBot + 4);
    }
    driveTo(p, tx, ty, ballDist < 90);

    // anticipate a fast shot: lunge toward the ball's vertical line
    if (threat && ballDist < 120 && Math.abs(w.ball.vx) > 300 && p.lunge <= 0) {
      p.lunge = 0.35; p.lungeDir = sign(w.ball.y - p.y) || 1;
    }
  }

  // ---------------- carrier (this AI player has the ball) ----------------
  function carrier(p, w) {
    const gx = tgtGoalX(p.side);
    const toGoal = Math.abs(gx - p.x);
    const { opp, d } = nearestOpp(p.x, p.y, w.opponents, false);
    const held = p.holdT || 0;

    // shoot when in range and settled
    const range = CFG.pw * 0.46;
    if (toGoal < range && held > 0.12 && p.kickCd <= 0) {
      const laneClear = !opp || d > 34;
      const wantShoot = laneClear ? chance(0.04 + 0.012 * w.diff) : chance(0.02 * w.diff);
      if (wantShoot || toGoal < CFG.pw * 0.2) { shoot(p, w); return; }
    }

    // pass if pressured or a clearly better option exists
    if (held > 0.15 && p.kickCd <= 0) {
      const pressured = opp && d < 46;
      if (pressured || chance(0.018 * w.diff)) {
        const mate = bestPass(p, w);
        if (mate) { passTo(p, w, mate); return; }
      }
    }

    // dribble toward goal, swerving around the nearest defender
    let tx = gx, ty = clamp(CFG.midY + (p.y - CFG.midY) * 0.6, CFG.top + 30, CFG.bottom - 30);
    if (opp && d < 80) {
      const around = (p.y < opp.y ? -1 : 1);
      ty = clamp(p.y + around * 70, CFG.top + 24, CFG.bottom - 24);
      tx = p.x + atkSign(p.side) * 60;
    }
    driveTo(p, tx, ty, toGoal > 160 && (!opp || d > 50));
  }

  function shoot(p, w) {
    const gx = tgtGoalX(p.side);
    const scatter = (CFG.goalMouth * 0.55) * (0.7 / p.skl) * (1.1 - w.diff * 0.1);
    const aimY = clamp(CFG.midY + rnd(-1, 1) * scatter, CFG.goalTop + 10, CFG.goalBot - 10);
    const ang = Math.atan2(aimY - w.ball.y, gx - w.ball.x);
    const power = lerp(CFG.shootMin + 220, CFG.shootMax, Math.min(1, 0.45 + 0.1 * w.diff)) * p.pow;
    const lift = chance(0.22) ? rnd(120, 230) : rnd(0, 50);
    w.ball.shoot(p, ang, power, lift);
    Sound.kick();
  }

  function bestPass(p, w) {
    let best = null, bestScore = -1e9;
    for (const a of w.allies) {
      if (a === p || a.keeper) continue;
      const ahead = (a.x - p.x) * atkSign(p.side);
      const d = dist(p.x, p.y, a.x, a.y);
      if (d < 45 || d > 480) continue;
      const no = nearestOpp(a.x, a.y, w.opponents, false).d;
      const score = ahead * 1.1 + no * 0.9 - d * 0.12;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  function passTo(p, w, mate) {
    const lead = 0.16;
    const tx = mate.x + mate.vx * lead, ty = mate.y + mate.vy * lead;
    w.ball.passTo(p, tx, ty, CFG.passPower);
    Sound.pass();
  }

  // ---------------- support an attacking teammate ----------------
  function supportAttack(p, w) {
    const sign = atkSign(p.side);
    const ball = w.ball;
    let tx, ty;
    if (p.role === "ST" || p.role === "FWD" || p.role === "WING") {
      // push beyond the ball, hold width, offer a forward option
      tx = clamp(ball.x + sign * rnd(90, 170), CFG.left + 60, CFG.right - 60);
      const wide = p.homeY < CFG.midY ? -1 : 1;
      ty = clamp(CFG.midY + wide * (CFG.ph * 0.28) + (ball.y - CFG.midY) * 0.2, CFG.top + 26, CFG.bottom - 26);
    } else {
      // mids/defs keep shape, advanced a little, drifting toward ball lane
      tx = lerp(p.homeX + sign * 50, ball.x - sign * 60, 0.5);
      ty = lerp(p.homeY, ball.y, 0.35);
    }
    driveTo(p, tx, ty, false);
  }

  // ---------------- defend (an opponent has the ball) ----------------
  function defend(p, w) {
    const carrierP = w.ball.owner;
    const rank = rankToward(p, w.allies, carrierP.x, carrierP.y);
    const sign = atkSign(p.side);

    if (rank === 0) {
      // only the closest defender presses (keeps the pack from swarming)
      const gsx = carrierP.x - sign * 12;
      driveTo(p, gsx, carrierP.y, true);
    } else {
      // zone: drop goalside, between ball and own goal, holding shape
      const ogx = ownGoalX(p.side);
      const tx = lerp(p.homeX, ogx + sign * 80, 0.35) + (w.ball.x - p.homeX) * 0.18;
      const ty = lerp(p.homeY, w.ball.y, 0.3);
      driveTo(p, tx, ty, false);
    }
  }

  // ---------------- loose ball ----------------
  function loose(p, w) {
    const rank = rankToward(p, w.allies, w.ball.x, w.ball.y);
    if (rank === 0) {
      // chase: lead the ball along its travel
      const tx = w.ball.x + w.ball.vx * 0.12;
      const ty = w.ball.y + w.ball.vy * 0.12;
      driveTo(p, tx, ty, true);
    } else {
      // hold a sensible shape biased toward the ball
      const tx = lerp(p.homeX, w.ball.x, 0.3);
      const ty = lerp(p.homeY, w.ball.y, 0.3);
      driveTo(p, tx, ty, false);
    }
  }

  function steer(p, w) {
    if (p.keeper) { keeper(p, w); return; }
    if (p.pressT > 0) { driveTo(p, w.ball.x, w.ball.y, true); return; }  // "follow" call: chase the ball
    const owner = w.ball.owner;
    if (owner === p) carrier(p, w);
    else if (owner && owner.side === p.side) supportAttack(p, w);
    else if (owner && owner.side !== p.side) defend(p, w);
    else loose(p, w);
  }

  return { steer };
})();
