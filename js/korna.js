/* =========================================================================
   KORNA — SIDE-ON arcade football (Phaser 3).
   Camera watches from the touchline; goals are far-LEFT and far-RIGHT; the
   pitch is a fixed surface and the camera SCROLLS sideways to follow the ball.
   Gameplay runs flat in field space (fx = depth across the pitch, fy = along
   it goal-to-goal); worldOf() maps that to the side-on world the camera scrolls.
   Ball has real height (z) + shadows so shots, chips and headers read properly.
   ========================================================================= */
"use strict";

const GW = 960, GH = 600;

/* FIELD (gameplay plane). fx 0..PITCH.w = across the pitch (far touchline -> near),
   fy 0..PITCH.h = along the pitch. Home attacks RIGHT (toward GOAL_R). */
const PITCH = { w: 700, h: 1600, mg: 56 };
PITCH.cx = PITCH.w / 2;
PITCH.mouth = 210;                                   // goal width (in depth)
const GOAL_L = 46, GOAL_R = PITCH.h - 46;            // goal lines
const HALF = PITCH.h / 2;

const ACC = 980, MAXV = 176, SPRINTV = 250, DRAG = 920;
const GRAV = 1500;                                   // ball gravity (px/s^2 in height units)
const KID_PREFIX = { "Vanja": "vanja", "Fiči": "fici", Bobo: "bobo", Marko: "marko", Jan: "jan", Cacko: "cacko" };
const ANIMS = ["idle", "run", "sprint", "kick", "pass", "tackle", "celebrate"];

const FXf = (f) => PITCH.mg + f * (PITCH.w - 2 * PITCH.mg);     // depth fraction -> fx
const FYf = (f) => f * PITCH.h;                                 // along fraction -> fy
const inMouth = (x) => x > PITCH.cx - PITCH.mouth / 2 && x < PITCH.cx + PITCH.mouth / 2;

/* formations: [depthFrac (0 far .. 1 near), alongFrac (0 left goal .. 1 right goal)] */
const HOME_POS = { Vanja: [0.5, 0.42], "Fiči": [0.5, 0.25], Bobo: [0.34, 0.60], Marko: [0.80, 0.50], Jan: [0.6, 0.66], Cacko: [0.5, 0.07] };
const AWAY_POS = [[0.5, 0.93], [0.32, 0.77], [0.5, 0.79], [0.68, 0.77], [0.4, 0.62], [0.6, 0.62], [0.44, 0.46], [0.58, 0.46]];
const AWAY_ROLES = ["GK", "DEF", "DEF", "DEF", "MID", "MID", "FWD", "FWD"];

/* SIDE-ON world: long horizontally (goal to goal), a depth band vertically.
   Tune: gx0/gx1 = pitch length on screen, yFar/yNear = depth band (top=far touchline),
   skew = 3/4 lean, scFar/scNear + SPRITE_BASE = player size, zoom. */
const W = { gx0: 360, gx1: 3160, yFar: 250, yNear: 540, dCurve: 0.92, skew: 70, scFar: 0.66, scNear: 1.18, zoom: 1.0 };
const SPRITE_BASE = 1.12, ZK = 0.9;                  // ZK = screen lift per height unit
const camLerpX = 0.085;

/* ----------------------------- Preload ----------------------------- */
class Preload extends Phaser.Scene {
  constructor() { super("Preload"); }
  preload() {
    this.load.maxParallelDownloads = 120;
    const sheet = (key, file) => this.load.spritesheet(key, "assets/sprites/" + file + ".png", { frameWidth: 64, frameHeight: 64 });
    const loadChar = (prefix, gk) => {
      ANIMS.forEach((a) => sheet(prefix + "_" + a, prefix + "_" + a));
      if (gk) ["dive", "catch"].forEach((a) => sheet(prefix + "_" + a, prefix + "_" + a));
    };
    Object.values(KID_PREFIX).forEach((p) => loadChar(p, p === "cacko"));
    this.awayId = "ar86";
    loadChar(this.awayId, false);
    this.load.image("bg", "assets/backgrounds/" + this.awayId + ".png");
    this.add.text(GW / 2, GH / 2, "KORNA", { fontFamily: "Press Start 2P", fontSize: "40px", color: "#ffcf3a" }).setOrigin(0.5);
  }
  create() {
    const mk = (key, rate, repeat) => { if (this.textures.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(key), frameRate: rate, repeat }); };
    const all = [...Object.values(KID_PREFIX), this.awayId];
    all.forEach((p) => {
      mk(p + "_idle", 3, -1); mk(p + "_run", 12, -1); mk(p + "_sprint", 15, -1);
      mk(p + "_kick", 18, 0); mk(p + "_pass", 18, 0); mk(p + "_tackle", 14, 0); mk(p + "_celebrate", 8, -1);
    });
    mk("cacko_dive", 14, 0); mk("cacko_catch", 12, 0);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 8); g.fillStyle(0x14306a, 1); g.fillCircle(6, 6, 2.3); g.fillCircle(11, 9, 2.3);
    g.lineStyle(1.4, 0x223, 1); g.strokeCircle(8, 8, 8); g.generateTexture("ball", 16, 16); g.destroy();
    // soft round shadow
    const s = this.add.graphics(); s.fillStyle(0x000000, 1); s.fillEllipse(20, 8, 40, 16); s.generateTexture("shadow", 40, 16); s.destroy();
    this.scene.start("Match", { awayId: this.awayId });
  }
}

/* ----------------------------- Match ----------------------------- */
class Match extends Phaser.Scene {
  constructor() { super("Match"); }

  create(data) {
    this.awayId = data.awayId;
    this.away = TEAMS.find((t) => t.id === this.awayId);
    this.score = { home: 0, away: 0 };
    this.physics.world.setBounds(0, 0, PITCH.w, PITCH.h);

    this.setupScene();
    this.players = []; this.home = []; this.away_ = [];
    KIDS.outfield.forEach((k) => this.addPlayer(KID_PREFIX[k.name], k.role, HOME_POS[k.name], "home", { name: k.name, captain: k.captain, size: k.size }));
    this.addPlayer("cacko", "GK", HOME_POS.Cacko, "home", { name: "Cacko", gk: true, size: 1.28 });
    AWAY_POS.forEach((pos, i) => this.addPlayer(this.awayId, AWAY_ROLES[i], pos, "away", { gk: AWAY_ROLES[i] === "GK" }));

    // ball: hidden physics body (flat) + display sprite + height z + shadow
    this.ball = this.physics.add.sprite(PITCH.cx, HALF, "ball");
    this.ball.setVisible(false);
    this.ball.body.setCircle(7).setBounce(0.5).setDrag(48).setCollideWorldBounds(true).setMaxVelocity(760);
    this.ballZ = 0; this.ballVZ = 0;
    this.ballShadow = this.add.image(0, 0, "shadow").setDepth(5);
    this.ballDisp = this.add.sprite(0, 0, "ball");
    this.owner = null; this.ownerHold = 0; this.justScored = 0;

    this.physics.add.collider(this.players, this.players);
    this.controlled = this.nearestHome(this.ball.x, this.ball.y);
    this.switchLock = 0;

    // camera scrolls sideways over the static pitch
    this.cam = this.cameras.main;
    this.cam.setBounds(0, 0, W.gx1 + 360, GH);
    this.cam.setZoom(W.zoom);
    this.camX = this.worldOf(this.ball.x, this.ball.y).x;
    this.cam.centerOn(this.camX, GH / 2);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ sprint: "E", shoot: "D", pass: "S", lob: "A", sw: "SPACE" });
    this.input.keyboard.addCapture("UP,DOWN,LEFT,RIGHT,SPACE,A,S,D,E");

    this.buildHUD();
    this.kickoff("home");
  }

  /* ---------- field -> side-on world (fixed; the camera scrolls, the pitch never redraws) ---------- */
  worldOf(fx, fy) {
    const nL = fy / PITCH.h;                       // 0 left goal .. 1 right goal
    const nD = Phaser.Math.Clamp(fx / PITCH.w, 0, 1);  // 0 far touchline .. 1 near
    const d = Math.pow(nD, W.dCurve);
    return {
      x: W.gx0 + (W.gx1 - W.gx0) * nL + W.skew * (1 - d),
      y: W.yFar + (W.yNear - W.yFar) * d,
      s: W.scFar + (W.scNear - W.scFar) * d,
    };
  }

  /* ---------- static stadium + pitch (drawn ONCE) ---------- */
  setupScene() {
    this.cameras.main.setBackgroundColor(0x0a1222);
    const g = this.add.graphics().setDepth(-100);
    this.drawStadium(g);
    this.drawPitch(g);
    this.markerG = this.add.graphics().setDepth(90000);
  }

  drawStadium(g) {
    const wL = W.gx0 - 320, wR = W.gx1 + 320, span = wR - wL;
    // sky
    g.fillStyle(0x101a33, 1); g.fillRect(wL, 0, span, W.yFar + 40);
    // stand tiers (crowd specks) behind the far touchline
    const tiers = [{ y: 8, h: 60, base: 0x223a63 }, { y: 70, h: 64, base: 0x2a4675 }, { y: 136, h: 70, base: 0x32508a }];
    tiers.forEach((tr) => {
      g.fillStyle(tr.base, 1); g.fillRect(wL, tr.y, span, tr.h);
      for (let x = wL + 4; x < wR; x += 9) {
        for (let y = tr.y + 5; y < tr.y + tr.h - 4; y += 8) {
          const c = [0xe7e7ef, 0xd24b54, 0x3f7bd6, 0xf2c94c, 0x46b06a, 0xcfd6e2][(Math.random() * 6) | 0];
          g.fillStyle(c, 0.85); g.fillRect(x + (Math.random() * 3 | 0), y, 4, 4);
        }
      }
    });
    // roof + floodlights
    g.fillStyle(0x0c1426, 1); g.fillRect(wL, 0, span, 8);
    for (let x = wL + 220; x < wR; x += 520) {
      g.fillStyle(0x1a2540, 1); g.fillRect(x - 3, 6, 6, 30);
      g.fillStyle(0xfdfbe6, 0.95); g.fillRect(x - 26, 2, 52, 8);
      g.fillStyle(0xffffff, 0.10); g.fillTriangle(x - 26, 8, x + 26, 8, x, W.yFar + 30);
    }
    // ad hoardings along the far touchline
    const ads = [0xd23b46, 0x1f7ae0, 0x18a558, 0xf2b50c, 0x8a3fd0, 0xe85d1a];
    for (let x = wL + 20, i = 0; x < wR; x += 120, i++) { g.fillStyle(ads[i % ads.length], 0.92); g.fillRect(x, W.yFar - 18, 112, 16); }
    g.fillStyle(0x0b1120, 1); g.fillRect(wL, W.yFar - 2, span, 4);
    // near-side crowd + hoardings (in front, below the pitch)
    g.fillStyle(0x0e1830, 1); g.fillRect(wL, W.yNear + 26, span, GH - (W.yNear + 26));
    for (let x = wL + 20, i = 0; x < wR; x += 120, i++) { g.fillStyle(ads[(i + 3) % ads.length], 0.92); g.fillRect(x, W.yNear + 10, 112, 16); }
  }

  drawPitch(g) {
    const P = (fx, fy) => { const w = this.worldOf(fx, fy); return { x: w.x, y: w.y }; };
    const lerpC = (c1, c2, t) => Phaser.Display.Color.GetColor(Math.round(c1[0] + (c2[0] - c1[0]) * t), Math.round(c1[1] + (c2[1] - c1[1]) * t), Math.round(c1[2] + (c2[2] - c1[2]) * t));
    const L = 0, R = PITCH.h, FAR = 0, NEAR = PITCH.w, N = 26;   // vertical mown stripes along the length
    for (let i = 0; i < N; i++) {
      const a = L + (R - L) * i / N, b = L + (R - L) * (i + 1) / N;
      const c = i % 2 ? lerpC([0x2c, 0x82, 0x49], [0x35, 0x93, 0x55], 0.5) : lerpC([0x26, 0x77, 0x42], [0x2f, 0x88, 0x4d], 0.5);
      g.fillStyle(c, 1);
      g.fillPoints([P(FAR, a), P(FAR, b), P(NEAR, b), P(NEAR, a)], true);
    }
    const line = (pts, close, lw, al) => { g.lineStyle(lw, 0xffffff, al == null ? 0.9 : al); g.strokePoints(pts.map(P), close, close); };
    line([[FAR, GOAL_L], [NEAR, GOAL_L], [NEAR, GOAL_R], [FAR, GOAL_R]], true, 4);       // touch/goal lines
    line([[FAR, HALF], [NEAR, HALF]], false, 4);                                          // halfway
    const cc = []; for (let k = 0; k <= 30; k++) { const t = k / 30 * Math.PI * 2; cc.push(P(PITCH.cx + Math.cos(t) * 150, HALF + Math.sin(t) * 150)); }
    g.lineStyle(4, 0xffffff, 0.9); g.strokePoints(cc, true, true);                        // centre circle
    [[GOAL_L, 1], [GOAL_R, -1]].forEach((gg) => {                                          // penalty boxes + goals
      const gy = gg[0], dir = gg[1];
      line([[PITCH.cx - 150, gy], [PITCH.cx - 150, gy + dir * 150], [PITCH.cx + 150, gy + dir * 150], [PITCH.cx + 150, gy]], false, 4);
      this.drawGoal(g, gy, dir);
    });
  }

  drawGoal(g, gy, dir) {
    const mw = PITCH.mouth / 2, H = 96;
    const fpB = this.worldOf(PITCH.cx + mw, gy), bpB = this.worldOf(PITCH.cx - mw, gy);   // near post / far post (ground)
    const fpT = { x: fpB.x, y: fpB.y - H * fpB.s }, bpT = { x: bpB.x, y: bpB.y - H * bpB.s };
    g.fillStyle(0xffffff, 0.10); g.fillPoints([fpB, bpB, bpT, fpT], true);                // net wash
    g.lineStyle(1, 0xffffff, 0.28);
    for (let k = 1; k < 6; k++) { const t = k / 6; g.lineBetween(fpB.x + (bpB.x - fpB.x) * t, fpB.y + (bpB.y - fpB.y) * t, fpT.x + (bpT.x - fpT.x) * t, fpT.y + (bpT.y - fpT.y) * t); }
    g.lineStyle(5, 0xf4f8ff, 1);
    g.strokePoints([fpB, fpT, bpT, bpB], false, false);                                   // posts + crossbar
  }

  /* ---------- setup helpers ---------- */
  addPlayer(prefix, role, frac, side, meta) {
    const p = this.physics.add.sprite(FXf(frac[0]), FYf(frac[1]), prefix + "_idle");
    p.setVisible(false);
    p.body.setCircle(13, 19, 43).setDrag(DRAG, DRAG).setMaxVelocity(MAXV).setCollideWorldBounds(true);
    p.prefix = prefix; p.role = role; p.side = side; p.isGK = !!meta.gk; p.captain = !!meta.captain;
    p.dispScale = meta.size || 1;
    p.homeX = p.x; p.homeY = p.y; p.faceX = 0; p.faceY = side === "home" ? 1 : -1;
    p.actT = 0; p.act = null; p.diveT = 0; p.celebrateT = 0; p.stealCd = 0; p.kickCd = 0; p.sprinting = false;
    p.shadow = this.add.image(p.x, p.y, "shadow").setDepth(4).setAlpha(0.32);
    p.disp = this.add.sprite(p.x, p.y, prefix + "_idle").setOrigin(0.5, 0.92);
    this.players.push(p);
    (side === "home" ? this.home : this.away_).push(p);
    return p;
  }

  buildHUD() {
    const col = (h) => Phaser.Display.Color.HexStringToColor(h).color;
    const D = 100000;
    this.add.rectangle(GW / 2, 22, 376, 36, 0x0a0e16, 0.85).setStrokeStyle(2, 0xffffff, 0.12).setScrollFactor(0).setDepth(D);
    this.add.rectangle(GW / 2 - 156, 22, 22, 22, col(KIDS.kit.shirt)).setScrollFactor(0).setDepth(D + 1);
    this.add.rectangle(GW / 2 + 156, 22, 22, 22, col(this.away.kit.shirt)).setScrollFactor(0).setDepth(D + 1);
    this.scoreText = this.add.text(GW / 2, 22, "0 - 0", { fontFamily: "Press Start 2P", fontSize: "18px", color: "#ffe85a" }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.add.text(GW / 2 - 138, 22, "KORNA", { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fff" }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 1);
    this.add.text(GW / 2 + 138, 22, this.away.name.toUpperCase().slice(0, 9), { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fff" }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 1);
    this.bannerText = this.add.text(GW / 2, GH / 2 - 40, "", { fontFamily: "Press Start 2P", fontSize: "38px", color: "#ffd23a" }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.add.text(GW / 2, GH - 12, "MOVE arrows   SPRINT e   SHOOT d   CHIP a   PASS s   SWITCH space", { fontFamily: "Trebuchet MS", fontSize: "12px", color: "#9fb0c8" }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.mini = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
  }

  banner(t, dur) { this.bannerText.setText(t); this.bannerT = dur; }

  kickoff(side) {
    this.players.forEach((p) => { p.setPosition(p.homeX, p.homeY); p.body.setVelocity(0, 0); p.celebrateT = 0; });
    this.ball.setPosition(PITCH.cx, HALF); this.ball.body.setVelocity(0, 0); this.ballZ = 0; this.ballVZ = 0;
    const kicker = (side === "home" ? this.home : this.away_).find((p) => p.role === "MID") || this.home[0];
    kicker.setPosition(PITCH.cx, HALF + (side === "home" ? -26 : 26));
    this.owner = kicker; this.ownerHold = 0;
    this.controlled = side === "home" ? kicker : this.nearestHome(this.ball.x, this.ball.y);
    this.justScored = 0;
    this.banner("KICK OFF", 1.2);
  }

  /* ---------- helpers ---------- */
  nearestHome(x, y) { return this.nearestOf(this.home, x, y, true); }
  nearestOf(list, x, y, skipGK) { let best = null, bd = 1e9; for (const p of list) { if (skipGK && p.isGK) continue; const d = Phaser.Math.Distance.Squared(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } } return best; }
  steer(p, tx, ty, sprint) {
    const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy);
    if (m < 6) { p.body.setAcceleration(0, 0); return; }
    p.body.setMaxVelocity(sprint && m > 80 ? SPRINTV : MAXV); p.sprinting = sprint && m > 80;
    p.body.setAcceleration(dx / m * ACC, dy / m * ACC);
  }

  /* ---------- main loop ---------- */
  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerText.setText(""); }
    if (this.justScored > 0) this.justScored -= dt;
    if (this.switchLock > 0) this.switchLock -= dt;
    for (const p of this.players) { if (p.actT > 0) p.actT -= dt; if (p.diveT > 0) p.diveT -= dt; if (p.stealCd > 0) p.stealCd -= dt; if (p.celebrateT > 0) p.celebrateT -= dt; if (p.kickCd > 0) p.kickCd -= dt; }

    this.updateControlled();
    this.handleInput(dt);
    this.updateAI();
    this.updateBallHeight(dt);
    this.updatePossession(dt);
    this.players.forEach((p) => this.animate(p));
    this.checkGoals();
    this.renderSprites();
    this.updateCam();
    this.updateMini();
  }

  updateBallHeight(dt) {
    if (this.ballZ > 0 || this.ballVZ !== 0) {
      this.ballZ += this.ballVZ * dt; this.ballVZ -= GRAV * dt;
      if (this.ballZ <= 0) { this.ballZ = 0; this.ballVZ = Math.abs(this.ballVZ) > 120 ? -this.ballVZ * 0.42 : 0; }
    }
  }

  updateControlled() {
    if (this.owner && this.owner.side === "home" && !this.owner.isGK) { this.controlled = this.owner; return; }
    if (this.switchLock > 0) return;
    this.controlled = this.nearestHome(this.ball.x, this.ball.y) || this.controlled;
  }

  handleInput(dt) {
    const c = this.controlled; if (!c) return;
    // SIDE-ON: left/right arrows move ALONG the pitch (fy), up/down move in DEPTH (fx)
    let along = 0, depth = 0;
    if (this.cursors.left.isDown) along = -1; else if (this.cursors.right.isDown) along = 1;
    if (this.cursors.up.isDown) depth = -1; else if (this.cursors.down.isDown) depth = 1;
    const m = Math.hypot(along, depth) || 1;
    const sprint = this.keys.sprint.isDown;
    c.body.setMaxVelocity(sprint ? SPRINTV : MAXV); c.sprinting = sprint;
    c.body.setAcceleration(depth / m * ACC, along / m * ACC);     // body x = depth(fx), body y = along(fy)
    if (along || depth) { c.faceX = depth / m; c.faceY = along / m; }

    const owns = this.owner === c;
    if (Phaser.Input.Keyboard.JustDown(this.keys.sw) && !owns) this.switchPlayer();
    if (Phaser.Input.Keyboard.JustDown(this.keys.shoot) && owns) this.shoot(c, false);
    if (Phaser.Input.Keyboard.JustDown(this.keys.lob) && owns) this.shoot(c, true);
    if (Phaser.Input.Keyboard.JustDown(this.keys.pass) && owns) this.passBall(c);
    if (Phaser.Input.Keyboard.JustDown(this.keys.lob) && !owns) this.slide(c);
  }

  switchPlayer() {
    const out = this.home.filter((p) => !p.isGK);
    let i = out.indexOf(this.controlled);
    this.controlled = out[(i + 1) % out.length]; this.switchLock = 0.8;
  }

  shoot(p, chip) {
    this.owner = null; this.ownerHold = 0;
    const gy = p.side === "home" ? GOAL_R : GOAL_L;
    const aimX = Phaser.Math.Clamp(p.x + Phaser.Math.Between(-30, 30), PITCH.cx - PITCH.mouth / 2 + 16, PITCH.cx + PITCH.mouth / 2 - 16);
    const a = Math.atan2(aimX - p.x, gy - p.y);                   // angle in (depth, along)
    const pw = (chip ? 360 : 500) * (p.pow || 1);
    this.ball.body.setVelocity(Math.sin(a) * pw, Math.cos(a) * pw);
    this.ballZ = 6; this.ballVZ = chip ? 540 : 230 + Phaser.Math.Between(0, 120);
    p.actT = 0.26; p.act = "kick"; p.kickCd = 0.25;
  }

  passBall(p) {
    const mates = (p.side === "home" ? this.home : this.away_).filter((m) => m !== p && !m.isGK);
    const fwd = p.side === "home" ? 1 : -1;
    let best = null, bs = -1e9;
    for (const m of mates) { const ahead = (m.y - p.y) * fwd; const d = Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y); if (d < 40 || d > 560) continue; const sc = ahead * 1.1 - d * 0.12; if (sc > bs) { bs = sc; best = m; } }
    this.owner = null; this.ownerHold = 0;
    const tgt = best || { x: p.x + p.faceX * 220, y: p.y + p.faceY * 220 };
    const a = Math.atan2(tgt.x - p.x, tgt.y - p.y);
    const pw = Phaser.Math.Clamp(Phaser.Math.Distance.Between(p.x, p.y, tgt.x, tgt.y) * 2.2, 230, 560);
    this.ball.body.setVelocity(Math.sin(a) * pw, Math.cos(a) * pw);
    this.ballZ = 4; this.ballVZ = 90;
    p.actT = 0.24; p.act = "pass";
  }

  slide(p) { p.act = "tackle"; p.actT = 0.36; const sp = 340; p.body.setVelocity(p.faceX * sp, p.faceY * sp); }

  updateAI() {
    const ball = this.ball, owner = this.owner;
    for (const side of [this.home, this.away_]) {
      const isHome = side === this.home;
      const attackY = isHome ? GOAL_R : GOAL_L;
      const fwd = isHome ? 1 : -1;
      for (const p of side) {
        if (p === this.controlled) continue;
        if (p.isGK) { this.gkAI(p); continue; }
        if (p === owner) { this.carrierAI(p, attackY, fwd); continue; }
        const teammate = owner && owner.side === p.side;
        if (teammate) {
          if (p.role === "FWD" || p.role === "ST") this.steer(p, Phaser.Math.Clamp(ball.x + Phaser.Math.Between(-40, 40), PITCH.mg, PITCH.w - PITCH.mg), ball.y + fwd * 170, false);
          else this.steer(p, Phaser.Math.Linear(p.homeX, ball.x, 0.4), Phaser.Math.Linear(p.homeY, ball.y, 0.35), false);
        } else if (owner) {
          const near = this.nearestOf(side, owner.x, owner.y, true);
          if (p === near) this.steer(p, owner.x, owner.y + fwd * -8, true);
          else this.steer(p, Phaser.Math.Linear(p.homeX, ball.x, 0.22), Phaser.Math.Linear(p.homeY, ball.y, 0.28), false);
        } else {
          const near = this.nearestOf(side, ball.x, ball.y, true);
          if (p === near) this.steer(p, ball.x + ball.body.velocity.x * 0.12, ball.y + ball.body.velocity.y * 0.12, true);
          else this.steer(p, Phaser.Math.Linear(p.homeX, ball.x, 0.3), Phaser.Math.Linear(p.homeY, ball.y, 0.3), false);
        }
      }
    }
  }
  carrierAI(p, attackY, fwd) {
    const toGoal = Math.abs(attackY - p.y);
    if (toGoal < 380 && (p.kickCd || 0) <= 0 && Math.random() < 0.03) { this.shoot(p, Math.random() < 0.2); return; }
    if (Math.random() < 0.02) { this.passBall(p); return; }
    this.steer(p, PITCH.cx + (p.x - PITCH.cx) * 0.7, attackY, true);
  }
  gkAI(p) {
    const gy = p.side === "home" ? GOAL_L + 20 : GOAL_R - 20;
    this.steer(p, Phaser.Math.Clamp(this.ball.x, PITCH.cx - PITCH.mouth / 2, PITCH.cx + PITCH.mouth / 2), gy, false);
  }

  updatePossession(dt) {
    const b = this.ball, low = this.ballZ < 26;
    if (this.owner) {
      const o = this.owner; this.ownerHold += dt;
      const dx = o.faceX, dy = o.faceY, m = Math.hypot(dx, dy) || 1;
      b.setPosition(Phaser.Math.Linear(b.x, o.x + dx / m * 20, 0.5), Phaser.Math.Linear(b.y, o.y + dy / m * 20, 0.5));
      b.body.setVelocity(o.body.velocity.x, o.body.velocity.y); this.ballZ = 0; this.ballVZ = 0;
      if (this.ownerHold > 0.15) for (const p of this.players) {
        if (p.side === o.side || p.stealCd > 0) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, o.x, o.y) < 26) {
          const sliding = p.act === "tackle" && p.actT > 0;
          if (Math.random() < (sliding ? 3.0 : 1.0) * dt) { this.owner = p; this.ownerHold = 0; o.stealCd = 0.6; break; }
        }
      }
    } else if (this.justScored <= 0) {
      const spd = b.body.speed;
      for (const p of this.players) {
        if (p.kickCd > 0) continue;
        const reach = p.isGK ? 32 : 22, zOk = p.isGK ? this.ballZ < 130 : low;
        if (zOk && Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < reach && spd < (p.isGK ? 760 : 300)) { this.owner = p; this.ownerHold = 0; if (p.isGK) p.diveT = 0.3; break; }
      }
    }
  }

  checkGoals() {
    if (this.justScored > 0) return;
    const b = this.ball, overBar = this.ballZ > 96;
    if (!overBar && inMouth(b.x)) {
      if (b.y > GOAL_R - 4) this.goal("home");
      else if (b.y < GOAL_L + 4) this.goal("away");
    }
  }
  goal(side) {
    this.justScored = 2.4;
    if (side === "home") this.score.home++; else this.score.away++;
    this.scoreText.setText(this.score.home + " - " + this.score.away);
    this.banner("GOAL!", 2.2); this.cam.shake(240, 0.006); this.cam.flash(180, 255, 255, 255);
    (side === "home" ? this.home : this.away_).forEach((p) => { if (!p.isGK) p.celebrateT = 1.8; });
    this.owner = null;
    this.time.delayedCall(2200, () => this.kickoff(side === "home" ? "away" : "home"));
  }

  animate(p) {
    const d = p.disp, k = (n) => p.prefix + "_" + n, has = (n) => this.anims.exists(p.prefix + "_" + n);
    if (p.celebrateT > 0 && has("celebrate")) d.play({ key: k("celebrate"), repeat: -1 }, true);
    else if (p.isGK && p.diveT > 0 && has("dive")) d.play(k("dive"), true);
    else if (p.actT > 0 && p.act && has(p.act)) d.play(k(p.act), true);
    else {
      const sp = p.body.speed;
      if (sp > SPRINTV * 0.72 && p.sprinting && has("sprint")) d.play({ key: k("sprint"), repeat: -1 }, true);
      else if (sp > 18) d.play({ key: k("run"), repeat: -1 }, true);
      else d.play({ key: k("idle"), repeat: -1 }, true);
    }
    if (Math.abs(p.body.velocity.y) > 8) d.setFlipX(p.body.velocity.y < 0);   // along-pitch velocity = screen left/right
  }

  /* ---------- per-frame placement + sideways camera ---------- */
  renderSprites() {
    for (const p of this.players) {
      const w = this.worldOf(p.x, p.y), sc = w.s * SPRITE_BASE * p.dispScale;
      p.disp.setPosition(w.x, w.y).setScale(sc).setDepth(w.y);
      p.shadow.setPosition(w.x, w.y + 2).setScale(sc * 0.9, sc * 0.7).setDepth(w.y - 0.5);
    }
    const w = this.worldOf(this.ball.x, this.ball.y), bs = w.s;
    this.ballShadow.setPosition(w.x, w.y).setScale(bs * (1 - Math.min(0.5, this.ballZ / 400)), bs * 0.7).setDepth(w.y - 0.4);
    this.ballDisp.setPosition(w.x, w.y - this.ballZ * bs * ZK).setScale(bs * 0.9).setDepth(w.y + this.ballZ + 4);
    const mg = this.markerG; mg.clear();
    const c = this.controlled;
    if (c) { const d = c.disp, hx = d.x, hy = d.y - d.displayHeight * 0.92 - 10; mg.fillStyle(this.owner === c ? 0xffe23a : 0x6fd0ff, 1); mg.fillTriangle(hx - 9, hy - 10, hx + 9, hy - 10, hx, hy + 2); }
  }

  updateCam() {
    const w = this.worldOf(this.ball.x, this.ball.y);
    this.camX = Phaser.Math.Linear(this.camX, w.x, camLerpX);
    this.cam.centerOn(this.camX, GH / 2);
  }

  updateMini() {
    const mw = 150, mh = 64, mx = GW - mw - 14, my = GH - mh - 26;
    const g = this.mini; g.clear();
    g.fillStyle(0x0a0e16, 0.78); g.fillRoundedRect(mx - 3, my - 3, mw + 6, mh + 6, 5);
    g.fillStyle(0x1f6d3c, 1); g.fillRect(mx, my, mw, mh);
    g.lineStyle(1, 0xffffff, 0.4); g.strokeRect(mx, my, mw, mh); g.lineBetween(mx + mw / 2, my, mx + mw / 2, my + mh);
    const M = (x, y) => [mx + (y / PITCH.h) * mw, my + (x / PITCH.w) * mh];      // along=horizontal, depth=vertical
    for (const p of this.players) { const s = M(p.x, p.y); g.fillStyle(p.isGK ? 0xffffff : Phaser.Display.Color.HexStringToColor(p.side === "home" ? KIDS.kit.shirt : this.away.kit.shirt).color, 1); g.fillCircle(s[0], s[1], 2.2); }
    const bs = M(this.ball.x, this.ball.y); g.fillStyle(0xffe85a, 1); g.fillCircle(bs[0], bs[1], 2);
  }
}

/* ----------------------------- boot ----------------------------- */
window.KGAME = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "stage",
  width: GW, height: GH,
  backgroundColor: "#0a1222",
  pixelArt: true,
  physics: { default: "arcade", arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Preload, Match],
});
