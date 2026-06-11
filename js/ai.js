/* =========================================================================
   KORNA — AI: roles, marking, pressing with realistic closing + jockeying,
   support runs, lane-aware passing, corner-aimed shooting.
   world w = { ball, allies, opponents, diff }
   ========================================================================= */
"use strict";

const AI = (() => {
  const ownGoalX = (s) => (s === "home" ? CFG.left : CFG.right);
  const tgtGoalX = (s) => (s === "home" ? CFG.right : CFG.left);
  const atk = (s) => (s === "home" ? 1 : -1);

  // drive straight at a point; sprint only when there's ground to cover
  function driveTo(p, tx, ty, sprint, stop = 6) {
    const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy);
    if (m < stop) { p.setDrive(0, 0, false); return; }
    p.setDrive(dx / m, dy / m, !!sprint && m > 95);
  }
  // ease toward a point (slow when close) — for containing / jockeying a carrier
  function jockey(p, tx, ty) {
    const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy);
    if (m < 3) { p.setDrive(0, 0, false); return; }
    const s = clamp(m / 55, 0.22, 1);
    p.setDrive(dx / m * s, dy / m * s, false);
  }
  function nearest(x, y, list, exclude) {
    let b = null, bd = Infinity;
    for (const o of list) { if (o.keeper || o === exclude) continue; const d = dist2(x, y, o.x, o.y); if (d < bd) { bd = d; b = o; } }
    return b;
  }
  function nearestDist(a, list) { let bd = Infinity; for (const o of list) { if (o.keeper) continue; const d = dist2(a.x, a.y, o.x, o.y); if (d < bd) bd = d; } return Math.sqrt(bd); }
  function rankToBall(p, allies, x, y) {
    const dp = dist2(p.x, p.y, x, y); let r = 0;
    for (const a of allies) { if (a === p || a.keeper) continue; if (dist2(a.x, a.y, x, y) < dp) r++; }
    return r;
  }
  function wob(p, a) { const t = performance.now() / 1000, id = (p.num || 1) * 1.7; return [Math.sin(t * 0.7 + id) * a, Math.cos(t * 0.85 + id * 1.3) * a]; }
  // is the segment p->mate clear of opponents (no one within `pad`)?
  function laneClear(p, mate, opponents, pad) {
    const vx = mate.x - p.x, vy = mate.y - p.y, len2 = vx * vx + vy * vy || 1;
    for (const o of opponents) {
      if (o.keeper) continue;
      let t = ((o.x - p.x) * vx + (o.y - p.y) * vy) / len2;
      if (t <= 0.05 || t >= 0.95) continue;
      if (dist(o.x, o.y, p.x + vx * t, p.y + vy * t) < pad) return false;
    }
    return true;
  }

  /* ---------------- keeper ---------------- */
  function keeper(p, w) {
    const gx = ownGoalX(p.side);
    const lineX = gx + atk(p.side) * (p.radius + 5);
    let ty = clamp(w.ball.y, CFG.goalTop + 8, CFG.goalBot - 8), tx = lineX;
    const threat = !w.ball.owner || w.ball.owner.side !== p.side;
    const ballDist = Math.abs(w.ball.x - gx);
    if (threat && ballDist < 165) { const out = lerp(0, 58, 1 - ballDist / 165); tx = lineX + atk(p.side) * out; ty = clamp(w.ball.y, CFG.goalTop - 4, CFG.goalBot + 4); }
    ty = clamp(ty + Math.sin(performance.now() / 720 + (p.num || 1) * 2) * CFG.goalMouth * 0.12, CFG.goalTop - 6, CFG.goalBot + 6);
    driveTo(p, tx, ty, ballDist < 80);
    if (threat && ballDist < 110 && Math.abs(w.ball.vx) > 260 && p.lunge <= 0) { p.lunge = 0.35; p.lungeDir = sign(w.ball.y - p.y) || 1; }
  }

  /* ---------------- on the ball ---------------- */
  function carrier(p, w) {
    const gx = tgtGoalX(p.side), toGoal = Math.abs(gx - p.x);
    const opp = nearest(p.x, p.y, w.opponents);
    const od = opp ? dist(p.x, p.y, opp.x, opp.y) : 999;
    const held = p.holdT || 0;

    if (toGoal < CFG.pw * 0.4 && held > 0.18 && p.kickCd <= 0) {
      const clear = od > 42;
      if ((clear && chance(0.03 + 0.01 * w.diff)) || toGoal < CFG.pw * 0.12) { shoot(p, w); return; }
    }
    // keep possession: pass out of pressure to an open, lane-clear mate
    if (held > 0.2 && p.kickCd <= 0) {
      const pressured = od < 48;
      const mate = bestPass(p, w);
      if (mate && (pressured || chance(0.022 * w.diff))) { passTo(p, w, mate); return; }
    }
    // dribble / shield: if a defender is close, angle away from them toward space
    let tx = gx, ty = clamp(CFG.midY + (p.y - CFG.midY) * 0.5, CFG.top + 24, CFG.bottom - 24);
    if (opp && od < 72) {
      const away = (p.y < opp.y) ? -1 : 1;
      ty = clamp(p.y + away * 64, CFG.top + 22, CFG.bottom - 22);
      tx = p.x + atk(p.side) * 44;
    }
    driveTo(p, tx, ty, toGoal > 150 && od > 60);
  }

  /* ---------------- team has the ball (off-ball support) ---------------- */
  function support(p, w) {
    const ball = w.ball, sign = atk(p.side);
    let tx, ty;
    if (p.role === "ST" || p.role === "FWD") {
      tx = clamp(ball.x + sign * rnd(110, 185), CFG.left + 50, CFG.right - 50);
      const wide = p.homeY < CFG.midY ? -1 : 1;
      ty = clamp(CFG.midY + wide * CFG.ph * 0.24 + (ball.y - CFG.midY) * 0.15, CFG.top + 24, CFG.bottom - 24);
    } else if (p.role === "WING") {
      tx = clamp(ball.x + sign * rnd(70, 150), CFG.left + 50, CFG.right - 50);
      const wide = p.homeY < CFG.midY ? -1 : 1;
      ty = clamp(CFG.midY + wide * CFG.ph * 0.34, CFG.top + 20, CFG.bottom - 20);
    } else if (p.role === "MID") {
      tx = lerp(p.homeX + sign * 45, ball.x, 0.42); ty = lerp(p.homeY, ball.y, 0.42);
    } else { // DEF holds shape, safe outlet behind
      tx = lerp(p.homeX, ball.x - sign * 110, 0.4); ty = lerp(p.homeY, ball.y, 0.3);
    }
    const wb = wob(p, 16);
    driveTo(p, tx + wb[0], ty + wb[1], dist(p.x, p.y, ball.x, ball.y) > 220);
  }

  /* ---------------- opponent has the ball (defend) ---------------- */
  function defend(p, w) {
    const c = w.ball.owner, sign = atk(p.side);
    const r = rankToBall(p, w.allies, c.x, c.y);
    if (r === 0) {
      // PRESSER: lead-pursue toward a containing point goalside of the carrier; jockey when close
      const lead = 0.12;
      const tx = c.x + (c.vx || 0) * lead - sign * 10, ty = c.y + (c.vy || 0) * lead;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d > 38) driveTo(p, tx, ty, true);
      else jockey(p, c.x - sign * 9, c.y);
    } else if (r === 1) {
      // COVER: sit goalside and slightly off the presser, ready for a knock-on
      const ogx = ownGoalX(p.side);
      driveTo(p, lerp(c.x, ogx, 0.2), lerp(c.y, CFG.midY, 0.32), true);
    } else {
      // MARK the nearest dangerous attacker, staying goalside of them
      const mark = nearest(p.x, p.y, w.opponents, c);
      const ogx = ownGoalX(p.side);
      if (mark) {
        const tx = mark.x + (ogx - mark.x) * 0.16, ty = mark.y;
        driveTo(p, tx, ty, dist(p.x, p.y, tx, ty) > 120);
      } else {
        const tx = lerp(p.homeX, ogx + sign * 70, 0.3) + (w.ball.x - p.homeX) * 0.15, ty = lerp(p.homeY, w.ball.y, 0.25);
        const wb = wob(p, 14); driveTo(p, tx + wb[0], ty + wb[1], false);
      }
    }
  }

  /* ---------------- loose ball ---------------- */
  function loose(p, w) {
    const r = rankToBall(p, w.allies, w.ball.x, w.ball.y);
    if (r === 0) { driveTo(p, w.ball.x + w.ball.vx * 0.14, w.ball.y + w.ball.vy * 0.14, true); }
    else { const wb = wob(p, 14); driveTo(p, lerp(p.homeX, w.ball.x, 0.3) + wb[0], lerp(p.homeY, w.ball.y, 0.3) + wb[1], false); }
  }

  /* ---------------- shooting / passing ---------------- */
  function shoot(p, w) {
    const gx = tgtGoalX(p.side);
    const gk = w.opponents.find((o) => o.keeper);
    let aimY = gk ? (gk.y < CFG.midY ? CFG.goalBot - 18 : CFG.goalTop + 18) : CFG.midY;
    const scatter = (CFG.goalMouth * 0.6) * (0.78 / p.skl) * (1.15 - w.diff * 0.1);
    aimY = clamp(aimY + rnd(-1, 1) * scatter, CFG.goalTop + 8, CFG.goalBot - 8);
    const ang = Math.atan2(aimY - w.ball.y, gx - w.ball.x);
    const power = lerp(CFG.shootMax * 0.6, CFG.shootMax * 0.92, Math.min(1, 0.35 + 0.13 * w.diff)) * p.pow;
    w.ball.shoot(p, ang, power, chance(0.2) ? rnd(110, 200) : rnd(0, 50));
    Sound.kick();
  }

  function bestPass(p, w) {
    let best = null, bs = -1e9; const sign = atk(p.side);
    for (const a of w.allies) {
      if (a === p || a.keeper) continue;
      const d = dist(p.x, p.y, a.x, a.y);
      if (d < 42 || d > 470) continue;
      const ahead = (a.x - p.x) * sign;
      const open = nearestDist(a, w.opponents);
      const clear = laneClear(p, a, w.opponents, 22) ? 1 : 0;
      const score = ahead * 0.9 + open * 0.9 + clear * 130 - d * 0.1;
      if (score > bs) { bs = score; best = a; }
    }
    return best;
  }
  function passTo(p, w, mate) {
    const lead = 0.18, tx = mate.x + mate.vx * lead, ty = mate.y + mate.vy * lead;
    const power = clamp(dist(p.x, p.y, tx, ty) * 2.3, 230, 560);   // weight to distance so it arrives controllable
    w.ball.passTo(p, tx, ty, power);
    p.act = "pass"; p.actT = 0.32;
    Sound.pass();
  }

  function steer(p, w) {
    if (p.keeper) { keeper(p, w); return; }
    if (p.pressT > 0) { driveTo(p, w.ball.x, w.ball.y, true); return; }  // "follow" call
    const owner = w.ball.owner;
    if (owner === p) carrier(p, w);
    else if (owner && owner.side === p.side) support(p, w);
    else if (owner && owner.side !== p.side) defend(p, w);
    else loose(p, w);
  }

  return { steer };
})();
