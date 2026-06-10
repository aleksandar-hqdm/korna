/* =========================================================================
   KORNA — state machine, match simulation, main loop
   ========================================================================= */
"use strict";

(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const HOME_DIFF = 3; // smarts for the kids' AI teammates

  const G = {
    state: "TITLE",
    selIndex: 4,           // default highlight = the toughest Brazil
    players: [], home: [], away: null, awayPlayers: [],
    ball: new Ball(),
    score: { home: 0, away: 0 },
    clock: CFG.matchSeconds,
    controlled: null,
    switchLock: 0,
    shootCharge: 0,
    particles: [],
    banner: 0, bannerText: "", bannerSub: "",
    countdown: 0,
    celebrateTimer: 0,
    cam: { x: CFG.midX, y: CFG.midY, z: 2.45 },
    shake: 0, freeze: 0,
    t: 0,
  };

  /* ----------------------------- camera ----------------------------- */
  function camBounds() {
    const z = G.cam.z;
    return { hw: CFG.W / 2 / z, hh: CFG.H / 2 / (z * CFG.tilt) };  // tilt squashes the vertical view
  }
  function snapCamera() {
    const { hw, hh } = camBounds();
    G.cam.x = clamp(G.ball.x, hw, CFG.W - hw);
    G.cam.y = clamp(G.ball.y, hh, CFG.H - hh);
  }
  function updateCamera(dt) {
    const { hw, hh } = camBounds();
    // track the ball (lead a touch toward the controlled kid), tight but smooth
    let tx = G.ball.x, ty = G.ball.y;
    if (G.controlled) { tx = lerp(G.ball.x, G.controlled.x, 0.3); ty = lerp(G.ball.y, G.controlled.y, 0.3); }
    tx = clamp(tx, hw, CFG.W - hw); ty = clamp(ty, hh, CFG.H - hh);
    // gentle follow with a small deadzone so the camera doesn't jitter on dribbles
    const dx = tx - G.cam.x, dy = ty - G.cam.y, k = Math.min(1, 6 * dt);
    if (Math.abs(dx) > 5) G.cam.x += dx * k;
    if (Math.abs(dy) > 5) G.cam.y += dy * k;
  }

  /* ----------------------------- setup ----------------------------- */
  function newMatch(team) {
    G.away = team;
    Render.buildPitch(team);   // distinct stadium per opponent
    G.home = buildKornaSquad();
    G.awayPlayers = buildLegendSquad(team);
    G.players = G.home.concat(G.awayPlayers);
    G.score.home = 0; G.score.away = 0;
    G.clock = CFG.matchSeconds;
    G.particles.length = 0;
    Sound.whistle();
    kickoff("home");
  }

  function placeFormation() {
    for (const p of G.players) {
      p.x = p.homeX; p.y = p.homeY; p.vx = p.vy = 0; p.celebrate = 0;
      p.setDrive(0, 0, false);
      p.facing = p.side === "home" ? 0 : Math.PI;
    }
  }

  function teamMid(side) {
    const list = side === "home" ? G.home : G.awayPlayers;
    return list.find((p) => p.role === "MID" && !p.keeper) || list.find((p) => !p.keeper);
  }

  function kickoff(possessionSide) {
    placeFormation();
    G.ball.reset(CFG.midX, CFG.midY);
    const kicker = teamMid(possessionSide);
    kicker.x = CFG.midX - (possessionSide === "home" ? 26 : -26);
    kicker.y = CFG.midY;
    giveBall(kicker);
    G.controlled = possessionSide === "home" ? kicker : nearestHomeOutfield();
    G.shootCharge = 0;
    snapCamera();
    G.state = "KICKOFF";
    G.countdown = 1.3;
    banner("KICK OFF", "", 1.3);
  }

  function gotoVS(team) { G.away = team; Sound.ui(); G.state = "VS"; }

  function banner(text, sub, time) { G.bannerText = text; G.bannerSub = sub || ""; G.banner = time; }

  /* --------------------------- possession --------------------------- */
  function giveBall(p) {
    G.ball.owner = p; p.holdT = 0; G.ball.vz = 0; G.ball.z = 0;
  }
  function nearestHomeOutfield() {
    let best = null, bd = Infinity;
    for (const p of G.home) {
      if (p.keeper) continue;
      const d = dist2(p.x, p.y, G.ball.x, G.ball.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function updateControlled(dt) {
    if (G.switchLock > 0) { G.switchLock -= dt; }
    const owner = G.ball.owner;
    if (owner && owner.side === "home" && !owner.keeper) { G.controlled = owner; return; }
    if (G.switchLock > 0) return;
    G.controlled = nearestHomeOutfield();
  }

  function manualSwitch() {
    if (G.ball.owner && G.ball.owner.side === "home" && !G.ball.owner.keeper) return; // can't switch off the carrier
    const out = G.home.filter((p) => !p.keeper);
    let i = out.indexOf(G.controlled);
    G.controlled = out[(i + 1) % out.length];
    G.switchLock = 1.0;
    Sound.ui();
  }

  /* ----------------------------- input ----------------------------- */
  function handlePlayInput(dt) {
    updateControlled(dt);                       // auto-switch to the right kid
    for (const p of G.players) p.user = false;
    if (G.controlled) G.controlled.user = true; // only the human's kid spends turbo
    const c = G.controlled;
    const mv = Input.movement();
    if (c) c.setDrive(mv.x, mv.y, Input.isSprint());     // E = sprint

    const owns = c && G.ball.owner === c;

    if (Input.consumeSwitch() && !owns) manualSwitch();  // Space = change player (defense)

    // D — shoot (hold to charge), only with the ball
    if (owns && Input.isShootHeld()) {
      if (G.shootCharge <= 0) G.shootCharge = CFG.shootMin;
      G.shootCharge = clamp(G.shootCharge + CFG.shootChargeRate * dt, CFG.shootMin, CFG.shootMax);
    }
    if (Input.consumeShootRelease()) {
      if (owns && G.shootCharge > 0) userShoot(c, G.shootCharge);
      G.shootCharge = 0;
    }
    if (!owns) G.shootCharge = 0;

    // S — pass (with ball) / call a teammate to press (without)
    if (Input.consumePassFollow()) { if (owns) userPass(c); else if (c) callFollow(); }

    // A — lob (with ball) / slide tackle (without)
    if (Input.consumeLobSlide()) { if (owns) userLob(c); else if (c) { if (c.startSlide()) Sound.steal(); } }
  }

  function userLob(p) {
    const gx = CFG.right, toGoal = Math.abs(gx - p.x);
    if (toGoal < CFG.pw * 0.4) {
      // chip toward goal
      let ang = p.facing;
      const gy = clamp(G.ball.y, CFG.goalTop + 14, CFG.goalBot - 14), tg = Math.atan2(gy - p.y, gx - p.x);
      if (Math.cos(ang - tg) > 0.3) ang = ang + angDelta(ang, tg) * 0.5;
      G.ball.shoot(p, ang, CFG.shootMax * 0.6, 280);
    } else {
      // lofted pass to the most advanced teammate
      const out = G.home.filter((m) => m !== p && !m.keeper);
      let best = null, bs = -1e9;
      for (const m of out) { const d = dist(p.x, p.y, m.x, m.y); if (d < 60 || d > 520) continue; const sc = (m.x - p.x) - d * 0.2; if (sc > bs) { bs = sc; best = m; } }
      if (best) { const a = Math.atan2(best.y - p.y, best.x - p.x); G.ball.shoot(p, a, clamp(dist(p.x, p.y, best.x, best.y) * 2.0, 280, 600), 260); }
      else G.ball.shoot(p, p.facing, 380, 260);
    }
    Sound.pass();
  }

  function callFollow() {
    // send the nearest other kid to press the ball (second defender)
    let best = null, bd = Infinity;
    for (const p of G.home) { if (p.keeper || p === G.controlled) continue; const d = dist2(p.x, p.y, G.ball.x, G.ball.y); if (d < bd) { bd = d; best = p; } }
    if (best) { best.pressT = 1.7; Sound.ui(); }
  }

  function userShoot(p, power) {
    let ang = p.facing;
    // gentle aim assist toward the target goal when in range and facing forward
    const gx = CFG.right, gy = clamp(G.ball.y, CFG.goalTop + 16, CFG.goalBot - 16);
    const toGoal = Math.atan2(gy - p.y, gx - p.x);
    const nearGoal = Math.abs(gx - p.x) < CFG.pw * 0.6;
    if (Math.cos(ang - toGoal) > 0.4 && nearGoal) ang = ang + angDelta(ang, toGoal) * 0.45;
    // a fully-charged strike near goal becomes a SPECIAL: extra power, lift, flair
    const special = power > CFG.shootMax * 0.82 && Math.abs(gx - p.x) < CFG.pw * 0.45;
    const pw = power * (p.fire > 0 ? 1.12 : 1) * (special ? 1.12 : 1);
    const lift = special ? rnd(120, 210) : (power > CFG.shootMax * 0.8 ? rnd(60, 150) : rnd(0, 50));
    G.ball.shoot(p, ang, pw, lift);
    Sound.kick();
    if (special) { shake(7); flash(G.ball.x, G.ball.y); p.heat = Math.min(1, p.heat + CFG.heatPerSkill); Sound.post(); }
  }

  function userPass(p) {
    const out = G.home.filter((m) => m !== p && !m.keeper);
    let best = null, bestScore = -1e9;
    for (const m of out) {
      const a = Math.atan2(m.y - p.y, m.x - p.x);
      const align = Math.cos(p.facing - a);          // how well it matches where I look
      const d = dist(p.x, p.y, m.x, m.y);
      const advance = (m.x - p.x) / CFG.pw;           // forward is good
      const score = align * 1.4 + advance * 0.6 - d / CFG.pw * 0.5;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (best && bestScore > 0.1) {
      const lead = 0.16;
      G.ball.passTo(p, best.x + best.vx * lead, best.y + best.vy * lead, CFG.passPower);
    } else {
      // no good option: drive it forward
      G.ball.shoot(p, p.facing, CFG.passPower * 0.9, 40);
    }
    Sound.pass();
  }

  /* ------------------------------ sim ------------------------------ */
  function simulate(dt) {
    // steer everyone (AI for all but the controlled kid)
    for (const p of G.awayPlayers) AI.steer(p, { ball: G.ball, allies: G.awayPlayers, opponents: G.home, diff: G.away.diff });
    for (const p of G.home) {
      if (p === G.controlled) continue;
      AI.steer(p, { ball: G.ball, allies: G.home, opponents: G.awayPlayers, diff: HOME_DIFF });
    }

    for (const p of G.players) p.update(dt);
    separateBodies();

    possession(dt);

    // ball follows carrier, else free physics
    if (G.ball.owner) {
      const o = G.ball.owner;
      o.holdT = (o.holdT || 0) + dt;
      const tx = o.footX(), ty = o.footY();
      const tight = clamp(10 * o.skl - (o.sprint ? 3 : 0), 5, 16);
      G.ball.x += (tx - G.ball.x) * Math.min(1, tight * dt);
      G.ball.y += (ty - G.ball.y) * Math.min(1, tight * dt);
      G.ball.z = 0; G.ball.vx = o.vx; G.ball.vy = o.vy;
      G.ball.spin += Math.hypot(o.vx, o.vy) * dt * 0.03;
      keeperClear(dt);
      G.ball.update(dt);
    } else {
      const scored = G.ball.update(dt);
      if (scored) onGoal(scored);
    }

    updateParticles(dt);
  }

  function separateBodies() {
    const P = G.players;
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.radius + b.radius - 2;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < min) {
          const push = (min - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  function possession(dt) {
    const b = G.ball;
    // pickups of a loose, low ball
    if (!b.owner && b.justScored <= 0) {
      let best = null, bd = Infinity;
      for (const p of G.players) {
        if (p.kickCd > 0) continue;
        const reach = (p.keeper ? CFG.controlRadius * 1.45 * p.reach : CFG.controlRadius);
        const d = dist(p.x, p.y, b.x, b.y);
        if (d < reach && b.z < (p.keeper ? CFG.barHeight : 34) && d < bd) { bd = d; best = p; }
      }
      if (best) {
        giveBall(best);
        b.vx *= 0.2; b.vy *= 0.2;
        if (best.keeper) Sound.save(); else Sound.kick();
      }
    }
    // steals / tackles (keepers are safe holders; a juking carrier is untouchable)
    if (b.owner && !b.owner.keeper && (b.owner.holdT || 0) > 0.12 && b.owner.jukeT <= 0) {
      const owner = b.owner;
      for (const p of G.players) {
        if (p.side === owner.side || p.stealCd > 0) continue;
        const sliding = p.slideT > 0;
        const reach = (sliding ? CFG.slideReach : CFG.stealReach) + p.radius * 0.4;
        const d = dist(p.x, p.y, owner.x, owner.y);
        if (d < reach) {
          let rate = 2.1 * clamp(0.45 + (p.def - owner.skl) * 0.7, 0.18, 1.7);
          if (sliding) rate *= 2.4;                 // a committed slide wins the ball
          if (Math.random() < rate * dt) {
            owner.stealCd = CFG.stealCooldown; p.stealCd = sliding ? 0.05 : 0.2;
            p.heat = Math.min(1, p.heat + CFG.heatPerSkill);
            if (sliding || Math.random() < 0.7) {
              giveBall(p); if (!sliding) { p.lunge = 0.25; p.lungeDir = sign(owner.y - p.y) || 1; }
            } else {
              b.owner = null; b.lastTouch = p;
              const a = Math.atan2(owner.y - p.y, owner.x - p.x) + rnd(-0.5, 0.5);
              b.vx = Math.cos(a) * 220; b.vy = Math.sin(a) * 220;
            }
            Sound.steal();
            break;
          }
        }
      }
    }
  }

  function keeperClear(dt) {
    const o = G.ball.owner;
    if (!o || !o.keeper) return;
    if ((o.holdT || 0) > 0.55) {
      // throw / boot it upfield to the best-placed teammate
      const allies = o.side === "home" ? G.home : G.awayPlayers;
      let best = null, bs = -1e9;
      const sign = o.side === "home" ? 1 : -1;
      for (const m of allies) {
        if (m === o || m.keeper) continue;
        const adv = (m.x - o.x) * sign;
        if (adv < 0) continue;
        if (adv > bs) { bs = adv; best = m; }
      }
      if (best) { G.ball.passTo(o, best.x, best.y, CFG.passPower * 1.05); Sound.kick(); }
      else { G.ball.shoot(o, o.side === "home" ? 0 : Math.PI, 560, 120); Sound.kick(); }
    }
  }

  /* ----------------------------- goals ----------------------------- */
  function onGoal(side) {
    G.ball.justScored = CFG.goalCelebration;
    if (side === "home") G.score.home++; else G.score.away++;
    Sound.goal();
    const scorerName = (G.ball.lastTouch && G.ball.lastTouch.side === side) ? G.ball.lastTouch.name : null;
    const sub = side === "home"
      ? (scorerName ? `${scorerName} scores for KORNA!` : "KORNA score!")
      : `${G.away.name} pull one back`;
    banner("GOAL!", sub, CFG.goalCelebration);
    // celebrate
    const team = side === "home" ? G.home : G.awayPlayers;
    for (const p of team) if (!p.keeper) p.celebrate = CFG.goalCelebration * 0.8;
    // confetti at the goal that was scored in
    const gx = side === "home" ? CFG.right : CFG.left;
    const cols = side === "home" ? [KIDS.kit.shirt, "#fff", "#ffd23a"] : [G.away.kit.shirt, G.away.kit.shorts, "#fff"];
    spawnConfetti(gx, CFG.midY, cols, 90);
    if (G.ball.lastTouch && G.ball.lastTouch.side === side) G.ball.lastTouch.heat = 1; // scorer catches fire
    shake(12); G.freeze = 0.08;
    G.state = "GOAL";
    G.countdown = CFG.goalCelebration;
  }

  function shake(mag) { G.shake = Math.max(G.shake, mag); }
  function flash(x, y) { for (let i = 0; i < 18; i++) G.particles.push({ x, y, vx: rnd(-260, 260), vy: rnd(-260, 260), s: rnd(2, 5), life: rnd(0.2, 0.5), color: Math.random() < 0.5 ? "#fff" : "#ffe85a" }); }
  function puff(x, y) { for (let i = 0; i < 8; i++) G.particles.push({ x, y, vx: rnd(-90, 90), vy: rnd(-50, 20), s: rnd(2, 4), life: rnd(0.3, 0.6), color: Math.random() < 0.5 ? "#e6e0d2" : "#c9c2b0" }); }

  function spawnConfetti(x, y, colors, n) {
    for (let i = 0; i < n; i++) {
      G.particles.push({
        x, y, vx: rnd(-180, 180), vy: rnd(-340, -60),
        s: rnd(3, 7), life: rnd(1.0, 2.0), color: colors[rndi(0, colors.length - 1)],
      });
    }
  }
  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0 || p.y > CFG.bottom + 20) G.particles.splice(i, 1);
    }
  }

  /* --------------------------- main update -------------------------- */
  function update(dt) {
    G.t += dt;
    if (G.banner > 0) G.banner -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - 40 * dt);
    for (const p of G.players) if (p.justFired) { p.justFired = false; if (p.side === "home" && G.state === "PLAY") { banner("ON FIRE!", "", 1.1); shake(5); } }

    switch (G.state) {
      case "TITLE":
        if (Input.consumeConfirm() || Input.consumeClick()) { Sound.ui(); G.state = "SELECT"; }
        break;

      case "SELECT": {
        // hover -> highlight
        const cards = Render.getCards();
        for (const c of cards) {
          if (Input.pointer.x > c.x && Input.pointer.x < c.x + c.w && Input.pointer.y > c.y && Input.pointer.y < c.y + c.h) {
            if (G.selIndex !== c.index) Sound.ui();
            G.selIndex = c.index;
          }
        }
        if (Input.consumeClick()) {
          for (const c of cards) {
            if (Input.pointer.x > c.x && Input.pointer.x < c.x + c.w && Input.pointer.y > c.y && Input.pointer.y < c.y + c.h) {
              G.selIndex = c.index; gotoVS(TEAMS[c.index]); break;
            }
          }
        }
        if (Input.consumeConfirm()) gotoVS(TEAMS[G.selIndex]);
        if (Input.consumeBack()) { Sound.uiBack(); G.state = "TITLE"; }
        handleArrows();
        break;
      }

      case "VS":
        if (Input.consumeConfirm() || Input.consumeClick()) newMatch(G.away);
        if (Input.consumeBack()) { Sound.uiBack(); G.state = "SELECT"; }
        break;

      case "KICKOFF":
        simulateFrozen(dt);
        updateCamera(dt);
        G.countdown -= dt;
        if (G.countdown <= 0) { G.state = "PLAY"; }
        break;

      case "PLAY":
        handlePlayInput(dt);
        simulate(dt);
        updateCamera(dt);
        G.clock -= dt;
        if (G.clock <= 0) { G.clock = 0; endMatch(); }
        break;

      case "GOAL":
        celebrationUpdate(dt); // freeze play, let the party run
        updateCamera(dt);
        G.countdown -= dt;
        if (G.countdown <= 0) {
          for (const p of G.players) p.celebrate = 0;
          if (G.clock <= 0) endMatch();
          else kickoff(/* conceding side kicks off */ (lastScorer === "home") ? "away" : "home");
        }
        break;

      case "FULLTIME": {
        const btns = Render.getButtons();
        if (Input.consumeClick()) {
          for (const b of btns) {
            if (Input.pointer.x > b.x && Input.pointer.x < b.x + b.w && Input.pointer.y > b.y && Input.pointer.y < b.y + b.h) {
              if (b.id === "rematch") newMatch(G.away);
              else { Sound.uiBack(); G.state = "SELECT"; }
              break;
            }
          }
        }
        if (Input.consumeConfirm()) newMatch(G.away);
        if (Input.consumeBack()) { Sound.uiBack(); G.state = "SELECT"; }
        break;
      }
    }
  }

  let lastScorer = "home";
  // wrap onGoal to remember who scored (for kickoff side)
  const _onGoal = onGoal;
  onGoal = function (side) { lastScorer = side; _onGoal(side); };

  function simulateFrozen(dt) {
    // players settle but nobody acts; ball stays put with the kicker
    for (const p of G.players) p.update(dt);
    separateBodies();
    if (G.ball.owner) { const o = G.ball.owner; G.ball.x = o.footX(); G.ball.y = o.footY(); }
    updateParticles(dt);
  }

  function celebrationUpdate(dt) {
    // nobody runs; scorers hop in place; confetti rains; ball rests in the net
    for (const p of G.players) { p.setDrive(0, 0, false); p.update(dt); }
    separateBodies();
    updateParticles(dt);
  }

  function endMatch() { Sound.whistle(); G.state = "FULLTIME"; }

  let arrowCd = 0;
  function handleArrows() {
    arrowCd -= 1 / 60;
    if (arrowCd > 0) return;
    let moved = false;
    if (Input.keyDown("ArrowRight") || Input.keyDown("d")) { G.selIndex = (G.selIndex + 1) % TEAMS.length; moved = true; }
    else if (Input.keyDown("ArrowLeft") || Input.keyDown("a")) { G.selIndex = (G.selIndex + TEAMS.length - 1) % TEAMS.length; moved = true; }
    else if (Input.keyDown("ArrowDown") || Input.keyDown("s")) { G.selIndex = (G.selIndex + 4) % TEAMS.length; moved = true; }
    else if (Input.keyDown("ArrowUp") || Input.keyDown("w")) { G.selIndex = (G.selIndex + TEAMS.length - 4) % TEAMS.length; moved = true; }
    if (moved) { Sound.ui(); arrowCd = 0.16; }
  }

  /* ----------------------------- render ----------------------------- */
  function render() {
    ctx.clearRect(0, 0, CFG.W, CFG.H);
    switch (G.state) {
      case "TITLE": Render.title(ctx, G.t); break;
      case "SELECT": Render.select(ctx, G.t, G.selIndex); break;
      case "VS": Render.vs(ctx, G.t, G); break;
      case "FULLTIME": Render.result(ctx, G.t, G); break;
      default:
        Render.world(ctx, G);
        Render.hud(ctx, G);
        if (G.banner > 0 && G.bannerSub) {
          ctx.save();
          ctx.textAlign = "center"; ctx.font = "bold 20px Trebuchet MS";
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.fillText(G.bannerSub, CFG.midX, CFG.midY + 30);
          ctx.restore();
        }
    }
    Render.crt(ctx);
  }

  /* ------------------------------ loop ------------------------------ */
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp big tab-switch gaps
    if (G.freeze > 0) { G.freeze = Math.max(0, G.freeze - dt); render(); requestAnimationFrame(loop); return; } // hit-stop
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  /* --------------------------- orientation --------------------------- */
  function checkOrient() {
    const small = Math.min(window.innerWidth, window.innerHeight) < 520;
    const portrait = window.innerHeight > window.innerWidth;
    const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    document.getElementById("rotate").classList.toggle("hidden", !(isTouch && portrait && small));
  }
  window.addEventListener("resize", checkOrient);
  window.addEventListener("orientationchange", checkOrient);

  /* ------------------------------ boot ------------------------------ */
  Render.buildPitch();
  Assets.load();           // loads sprite/portrait PNGs if present (else procedural)
  Input.bindTouch();
  checkOrient();
  requestAnimationFrame(loop);

  // expose a small handle for debugging / tinkering
  window.KORNA = { G, newMatch, TEAMS, CFG };
})();
