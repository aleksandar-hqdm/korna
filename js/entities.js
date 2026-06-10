/* =========================================================================
   KORNA — Player & Ball entities + squad builders
   ========================================================================= */
"use strict";

class Player {
  constructor(o) {
    Object.assign(this, o);
    // o provides: name, role, side('home'|'away'), size, hair, hairStyle, skin,
    //             eyes, captain, smile, keeper, star, kit{}, home[fx,fy], num,
    //             mult{spd,acc,pow,skl,def,reach}
    this.x = fx(this.home[0]);
    this.y = fy(this.home[1]);
    this.homeX = this.x; this.homeY = this.y;
    this.vx = 0; this.vy = 0;
    this.facing = this.side === "home" ? 0 : Math.PI; // home looks right
    this.faceDir = this.side === "home" ? 1 : -1;      // sprite mirror dir (hysteresis, set from vx)
    this.driveX = 0; this.driveY = 0; this.sprint = false;
    this.animPhase = rnd(0, 6);
    this.speedNorm = 0;
    this.radius = 13 * this.size;
    this.stealCd = 0;
    this.kickCd = 0;
    this.celebrate = 0;           // celebration timer
    this.lunge = 0;               // keeper dive / tackle lunge anim
    this.lungeDir = 0;
    // Street Hoop arcade layer
    this.turbo = 1; this.jukeT = 0; this.jukeCd = 0;
    this.slideT = 0; this.recoverT = 0;
    this.heat = 0; this.fire = 0; this.justFired = false; this.trail = [];
    this.user = false;            // true only for the kid the human controls
    this.pressT = 0;              // "follow"/second-defender press timer (AI)
    const m = this.mult || {};
    this.spd = m.spd || 1; this.acc = m.acc || 1;
    this.pow = m.pow || 1; this.skl = m.skl || 1;
    this.def = m.def || 1; this.reach = m.reach || 1;
  }

  setDrive(x, y, sprint) {
    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    this.driveX = x; this.driveY = y; this.sprint = !!sprint;
  }

  update(dt) {
    // tick timers
    if (this.stealCd > 0) this.stealCd -= dt;
    if (this.kickCd > 0) this.kickCd -= dt;
    if (this.celebrate > 0) this.celebrate -= dt;
    if (this.lunge > 0) this.lunge -= dt;
    if (this.jukeCd > 0) this.jukeCd -= dt;
    if (this.pressT > 0) this.pressT -= dt;
    if (this.fire > 0) this.fire -= dt;
    if (this.heat > 0) this.heat = Math.max(0, this.heat - CFG.heatDecay * dt);
    if (this.heat >= 1 && this.fire <= 0) { this.fire = CFG.fireTime; this.heat = 0; this.justFired = true; }

    // locked briefly after a slide
    if (this.recoverT > 0) { this.recoverT -= dt; this.driveX = 0; this.driveY = 0; this.sprint = false; }

    // mid-slide: ride the lunge, no steering
    if (this.slideT > 0) {
      this.slideT -= dt;
      const f = Math.max(0, 1 - 3.2 * dt); this.vx *= f; this.vy *= f;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.slideT <= 0) this.recoverT = CFG.slideRecover;
      return this._finish(dt);
    }

    // mid-juke: ride the burst
    if (this.jukeT > 0) {
      this.jukeT -= dt;
      const f = Math.max(0, 1 - 1.8 * dt); this.vx *= f; this.vy *= f;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (Math.hypot(this.vx, this.vy) > 10) this.facing = turnToward(this.facing, Math.atan2(this.vy, this.vx), CFG.turnRate * 1.6 * dt);
      return this._finish(dt);
    }

    const gated = this.user;      // only the human's kid spends turbo; AI sprints freely
    const eff = this.sprint && (!gated || this.turbo > 0.02);
    const fireMul = this.fire > 0 ? CFG.onFireBoost : 1;
    const base = CFG.maxSpeed * this.spd * (eff ? CFG.sprintMul : 1) * fireMul;
    const moving = this.driveX || this.driveY;
    if (gated && eff && moving) this.turbo = Math.max(0, this.turbo - CFG.turboDrain * dt);
    else this.turbo = Math.min(1, this.turbo + CFG.turboRecharge * dt);

    if (moving) {
      const tvx = this.driveX * base, tvy = this.driveY * base;
      const ax = tvx - this.vx, ay = tvy - this.vy, am = Math.hypot(ax, ay);
      if (am > 0.01) { const step = CFG.accel * this.acc * dt; const s = Math.min(1, step / am); this.vx += ax * s; this.vy += ay * s; }
    } else {
      const f = Math.max(0, 1 - CFG.friction * dt); this.vx *= f; this.vy *= f;
    }
    const m = Math.hypot(this.vx, this.vy);
    if (m > base) { this.vx = this.vx / m * base; this.vy = this.vy / m * base; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (m > 10) this.facing = turnToward(this.facing, Math.atan2(this.vy, this.vx), CFG.turnRate * dt);
    this._finish(dt);
  }

  _finish(dt) {
    const m = Math.hypot(this.vx, this.vy);
    // sprite faces left/right only on a decisive horizontal move (no flicker on vertical runs)
    if (this.vx > 22) this.faceDir = 1; else if (this.vx < -22) this.faceDir = -1;
    this.animPhase += (m / 26) * dt * 6 + dt * 0.6;
    this.speedNorm = m / CFG.maxSpeed;
    const r = this.radius;
    this.x = clamp(this.x, CFG.left + r, CFG.right - r);
    this.y = clamp(this.y, CFG.top + r, CFG.bottom - r);
    if (this.fire > 0 || this.jukeT > 0 || this.slideT > 0) {
      this.trail.push({ x: this.x, y: this.y, a: 0.8 });
      if (this.trail.length > 12) this.trail.shift();
    }
    for (const t of this.trail) t.a -= dt * 2.4;
    while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();
  }

  startJuke(dx, dy) {
    if (this.jukeCd > 0 || this.turbo < CFG.jukeCost || this.slideT > 0 || this.recoverT > 0) return false;
    let m = Math.hypot(dx, dy);
    if (m < 0.1) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); m = 1; }
    this.vx = dx / m * CFG.jukeSpeed; this.vy = dy / m * CFG.jukeSpeed;
    this.jukeT = CFG.jukeTime; this.jukeCd = CFG.jukeCooldown;
    this.turbo -= CFG.jukeCost; this.heat = Math.min(1, this.heat + CFG.heatPerSkill);
    return true;
  }

  startSlide() {
    if (this.slideT > 0 || this.recoverT > 0) return false;
    this.vx = Math.cos(this.facing) * CFG.slideSpeed; this.vy = Math.sin(this.facing) * CFG.slideSpeed;
    this.slideT = CFG.slideTime; this.lunge = CFG.slideTime; this.lungeDir = 0;
    return true;
  }

  // tip of the kicking foot, where the ball wants to sit while dribbling
  footX() { return this.x + Math.cos(this.facing) * (this.radius + CFG.dribbleDist * 0.5); }
  footY() { return this.y + Math.sin(this.facing) * (this.radius + CFG.dribbleDist * 0.5); }
}

class Ball {
  constructor() {
    this.x = CFG.midX; this.y = CFG.midY; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.owner = null;
    this.lastTouch = null;
    this.spin = 0;
    this.justScored = 0; // >0 freezes scoring detection during reset
  }

  reset(x, y) {
    this.x = x; this.y = y; this.z = 0;
    this.vx = this.vy = this.vz = 0;
    this.owner = null; this.spin = 0; this.justScored = 0;
  }

  shoot(player, angle, power, lift) {
    this.owner = null; this.lastTouch = player;
    this.vx = Math.cos(angle) * power;
    this.vy = Math.sin(angle) * power;
    this.vz = lift;
    player.kickCd = 0.25;
  }

  passTo(player, tx, ty, power) {
    this.owner = null; this.lastTouch = player;
    const a = Math.atan2(ty - this.y, tx - this.x);
    this.vx = Math.cos(a) * power;
    this.vy = Math.sin(a) * power;
    this.vz = 60; // little float on the pass
    player.kickCd = 0.2;
  }

  // free-flight physics; returns "home" | "away" | null (which side just scored)
  update(dt) {
    if (this.justScored > 0) { this.justScored -= dt; }
    if (this.owner) { this.spin += Math.hypot(this.vx, this.vy) * dt * 0.01; return null; }

    // height
    if (this.z > 0 || this.vz !== 0) {
      this.vz -= CFG.gravity * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (this.vz < -40) { this.vz = -this.vz * CFG.ballBounce; }
        else this.vz = 0;
      }
    }

    // horizontal friction (less while airborne)
    const onGround = this.z < 1;
    const fr = onGround ? CFG.ballGroundFriction : CFG.ballAirFriction;
    const f = Math.max(0, 1 - fr * dt);
    this.vx *= f; this.vy *= f;

    this.x += this.vx * dt; this.y += this.vy * dt;
    this.spin += Math.hypot(this.vx, this.vy) * dt * 0.02;

    const r = CFG.ballRadius;
    let scored = null;

    // top / bottom boards
    if (this.y < CFG.top + r) { this.y = CFG.top + r; this.vy = -this.vy * CFG.ballBounce; Sound.wall(); }
    if (this.y > CFG.bottom - r) { this.y = CFG.bottom - r; this.vy = -this.vy * CFG.ballBounce; Sound.wall(); }

    // left board / goal (away team attacks left)
    if (this.x < CFG.left + r) {
      if (inMouth(this.y) && this.z < CFG.barHeight && this.justScored <= 0) {
        scored = "away";
      } else {
        this.x = CFG.left + r; this.vx = -this.vx * CFG.ballBounce;
        if (inMouth(this.y)) Sound.post(); else Sound.wall();
      }
    }
    // right board / goal (home team attacks right)
    if (this.x > CFG.right - r) {
      if (inMouth(this.y) && this.z < CFG.barHeight && this.justScored <= 0) {
        scored = "home";
      } else {
        this.x = CFG.right - r; this.vx = -this.vx * CFG.ballBounce;
        if (inMouth(this.y)) Sound.post(); else Sound.wall();
      }
    }

    return scored;
  }

  speed() { return Math.hypot(this.vx, this.vy); }
}

/* ---------------- squad builders ---------------- */

const NUMS = { Vanja: 10, "Fiči": 4, Bobo: 9, Marko: 7, Jan: 11, Cacko: 1 };

function buildKornaSquad() {
  const out = [];
  KIDS.outfield.forEach((k) => {
    out.push(new Player({
      ...k, side: "home", kit: KIDS.kit, num: NUMS[k.name] || rndi(2, 9), artId: k.name,
      mult: {
        spd: k.stats.speed, acc: k.stats.accel, pow: k.stats.power,
        skl: k.stats.skill, def: k.stats.defense || 1,
      },
    }));
  });
  const g = KIDS.keeper;
  out.push(new Player({
    ...g, side: "home", kit: g.gk, num: 1, artId: "Cacko",
    mult: { spd: g.stats.speed, acc: g.stats.accel, pow: g.stats.power, skl: g.stats.skill, reach: g.stats.reach },
  }));
  return out;
}

function buildLegendSquad(team) {
  const out = [];
  const roleBase = {
    DEF: { spd: 0.98, acc: 1.0, pow: 1.05, skl: 0.95, def: 1.25 },
    MID: { spd: 1.0, acc: 1.05, pow: 1.0, skl: 1.12, def: 1.0 },
    FWD: { spd: 1.08, acc: 1.06, pow: 1.05, skl: 1.05, def: 0.9, fin: 1.2 },
  };
  const roles = ["DEF", "DEF", "DEF", "MID", "MID", "FWD", "FWD"];
  AWAY_FORMATION.outfield.forEach((pos, i) => {
    const role = roles[i];
    const isStar = i === 5; // a forward is the marquee name
    const b = roleBase[role];
    out.push(new Player({
      name: isStar ? team.star : team.name,
      role, side: "away", size: isStar ? 1.04 : 0.98,
      hair: team.hair, hairStyle: isStar ? "floppy" : "short", skin: team.skin,
      star: isStar, kit: team.kit, home: pos, num: isStar ? 10 : (i + 2), artId: team.id,
      mult: {
        spd: b.spd * team.mod.speed, acc: b.acc * team.mod.accel,
        pow: b.pow * team.mod.power, skl: b.skl * team.mod.skill * (isStar ? 1.12 : 1),
        def: b.def * team.mod.defense,
      },
    }));
  });
  out.push(new Player({
    name: "GK", role: "GK", side: "away", size: 1.16, keeper: true,
    hair: team.hair, hairStyle: "short", skin: team.skin,
    kit: { shirt: "#2c2c2c", shorts: "#111", sock: "#2c2c2c", num: "#fff" },
    home: AWAY_FORMATION.keeper, num: 1, artId: team.id,
    mult: { spd: 0.92 * team.mod.speed, acc: 1.04, pow: 1.1, skl: 1.0, reach: 1.25 + (team.mod.defense - 1) * 0.5 },
  }));
  return out;
}
