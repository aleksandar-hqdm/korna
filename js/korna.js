/* =========================================================================
   KORNA — Phaser 3 build (milestone 1: smooth physics match)
   Reuses the PixelLab sprite sheets + teams.js data.
   ========================================================================= */
"use strict";

const GW = 960, GH = 600;
const PITCH = { w: 920, h: 1440, mg: 70 };
PITCH.fw = PITCH.w - PITCH.mg * 2;
PITCH.fh = PITCH.h - PITCH.mg * 2;
PITCH.cx = PITCH.w / 2;
PITCH.mouth = 230;                 // goal width
const GOAL_TOP = 34, GOAL_BOT = PITCH.h - 34;   // goal lines (home attacks toward GOAL_TOP)

const ACC = 1000, MAXV = 178, SPRINTV = 252, DRAG = 950;
const KID_PREFIX = { "Vanja": "vanja", "Fiči": "fici", "Bobo": "bobo", "Marko": "marko", "Jan": "jan", "Cacko": "cacko" };
const ANIMS = ["idle", "run", "sprint", "kick", "pass", "tackle", "celebrate"];

// formation: fy 0 = far/top goal, 1 = near/bottom. home attacks UP (toward top).
const HOME_POS = { Vanja: [0.5, 0.60], "Fiči": [0.5, 0.78], Bobo: [0.42, 0.33], Marko: [0.25, 0.55], Jan: [0.66, 0.45], Cacko: [0.5, 0.93] };
const AWAY_POS = [[0.5, 0.07], [0.3, 0.24], [0.5, 0.22], [0.7, 0.24], [0.36, 0.40], [0.64, 0.40], [0.42, 0.55], [0.58, 0.55]];
const AWAY_ROLES = ["GK", "DEF", "DEF", "DEF", "MID", "MID", "FWD", "FWD"];

const FX = (f) => PITCH.mg + f * PITCH.fw;
const FY = (f) => PITCH.mg + f * PITCH.fh;
const inMouth = (x) => x > PITCH.cx - PITCH.mouth / 2 && x < PITCH.cx + PITCH.mouth / 2;

/* STATIC pitch + scrolling camera (how the real arcade games do it). The pitch is
   drawn ONCE as a fixed trapezoid in world space (far goal narrow at the top, near
   side wide at the bottom); the Phaser camera then just SCROLLS over it to follow the
   ball, so the pitch never wobbles and players move across a stable surface.
   Field (fx 0..PITCH.w, fy 0..PITCH.h; fy 0 = far goal) maps to world via worldOf().
   Tune: top/bot = pitch length on screen, hwFar/hwNear = how much it fans out,
   vCurve = perspective squash toward the far end, scFar/scNear + SPRITE_BASE = player size, zoom. */
const W = { cx: 700, top: 420, bot: 2200, hwFar: 300, hwNear: 690, vCurve: 1.22, scFar: 0.62, scNear: 1.2, zoom: 1.12 };
const SPRITE_BASE = 1.15;
const camLerp = 0.10;

/* ----------------------------- Preload ----------------------------- */
class Preload extends Phaser.Scene {
  constructor() { super("Preload"); }
  preload() {
    this.load.maxParallelDownloads = 120;   // dispatch all sheets at once (avoids a batch stall)
    const sheet = (key, file) => this.load.spritesheet(key, "assets/sprites/" + file + ".png", { frameWidth: 64, frameHeight: 64 });
    const loadChar = (prefix, gk) => {
      ANIMS.forEach((a) => sheet(prefix + "_" + a, prefix + "_" + a));
      if (gk) ["dive", "catch"].forEach((a) => sheet(prefix + "_" + a, prefix + "_" + a));
    };
    Object.values(KID_PREFIX).forEach((p) => loadChar(p, p === "cacko"));
    this.awayId = "ar86";                       // milestone 1: vs Argentina
    loadChar(this.awayId, false);
    this.load.image("bg", "assets/backgrounds/" + this.awayId + ".png");
    // simple loading text
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
    // ball texture
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 8); g.fillStyle(0x1c2230, 1); g.fillCircle(6, 6, 2.4); g.fillCircle(11, 9, 2.4);
    g.lineStyle(1.5, 0x333344, 1); g.strokeCircle(8, 8, 8); g.generateTexture("ball", 16, 16); g.destroy();
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
    this.players = [];
    this.home = []; this.away_ = [];

    // home (kids)
    KIDS.outfield.forEach((k) => this.addPlayer(KID_PREFIX[k.name], k.role, HOME_POS[k.name], "home", { name: k.name, captain: k.captain, size: k.size }));
    this.addPlayer("cacko", "GK", HOME_POS.Cacko, "home", { name: "Cacko", gk: true, size: 1.3 });
    // away
    AWAY_POS.forEach((pos, i) => this.addPlayer(this.awayId, AWAY_ROLES[i], pos, "away", { gk: AWAY_ROLES[i] === "GK" }));

    // ball (hidden physics body + projected display sprite)
    this.ball = this.physics.add.sprite(PITCH.cx, PITCH.h / 2, "ball");
    this.ball.setVisible(false);
    this.ball.body.setCircle(7).setBounce(0.55).setDrag(55).setCollideWorldBounds(true);
    this.ball.body.setMaxVelocity(720);
    this.ballDisp = this.add.sprite(this.ball.x, this.ball.y, "ball");
    this.owner = null; this.ownerHold = 0; this.justScored = 0;

    // separation between players
    this.physics.add.collider(this.players, this.players);

    // controlled
    this.controlled = this.nearestHome(this.ball.x, this.ball.y);
    this.switchLock = 0;

    // camera scrolls over the STATIC world pitch to follow the ball carrier
    this.cam = this.cameras.main;
    this.cam.setBounds(0, 0, W.cx * 2, W.bot + 280);
    this.cam.setZoom(W.zoom);
    const w0 = this.worldOf(this.ball.x, this.ball.y);
    this.camPt = new Phaser.Math.Vector2(w0.x, w0.y);
    this.cam.centerOn(w0.x, w0.y);

    // input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ sprint: "E", shoot: "D", pass: "S", lob: "A", sw: "SPACE" });
    this.input.keyboard.addCapture("UP,DOWN,LEFT,RIGHT,SPACE,A,S,D,E");   // don't scroll the page

    this.buildHUD();
    this.clock = 120;
    this.kickoff("home");
  }

  /* ---------- setup helpers ---------- */
  addPlayer(prefix, role, frac, side, meta) {
    const p = this.physics.add.sprite(FX(frac[0]), FY(frac[1]), prefix + "_idle");
    p.setVisible(false);                          // physics body only; drawn via p.disp (projected)
    p.body.setCircle(13, 19, 43).setDrag(DRAG, DRAG).setMaxVelocity(MAXV).setCollideWorldBounds(true);
    p.prefix = prefix; p.role = role; p.side = side; p.isGK = !!meta.gk; p.captain = !!meta.captain;
    p.dispScale = meta.size || 1;
    p.homeX = p.x; p.homeY = p.y; p.faceX = 0; p.faceY = side === "home" ? -1 : 1;
    p.actT = 0; p.act = null; p.diveT = 0; p.celebrateT = 0; p.stealCd = 0; p.kickCd = 0; p.sprinting = false;
    // billboard sprite that actually shows on screen
    p.disp = this.add.sprite(p.x, p.y, prefix + "_idle").setOrigin(0.5, 0.92);
    if (side === "home" && meta.captain) p.disp.setTint(0xffffff);
    this.players.push(p);
    (side === "home" ? this.home : this.away_).push(p);
    return p;
  }

  /* ---------- field -> world mapping (a FIXED trapezoid; no per-frame perspective) ---------- */
  worldOf(fx, fy) {
    const ny = Phaser.Math.Clamp(fy / PITCH.h, 0, 1);          // 0 far goal .. 1 near goal
    const vy = Math.pow(ny, W.vCurve);                          // squash rows toward the far end
    const hw = Phaser.Math.Linear(W.hwFar, W.hwNear, vy);
    return {
      x: W.cx + (fx / PITCH.w - 0.5) * 2 * hw,
      y: Phaser.Math.Linear(W.top, W.bot, vy),
      s: Phaser.Math.Linear(W.scFar, W.scNear, vy),
    };
  }

  setupScene() {
    // painted stadium stands sit behind the far goal; its lower (pitch) half is hidden under our grass
    if (this.textures.exists("bg")) {
      const tex = this.textures.get("bg").getSourceImage();
      const bw = W.hwNear * 2 * 1.6;
      const st = this.add.image(W.cx, W.top, "bg").setOrigin(0.5, 0.46).setDepth(-900);
      st.setDisplaySize(bw, bw * (tex.height / tex.width));
    }
    const g = this.add.graphics().setDepth(-50);               // STATIC pitch: drawn ONCE here, never per frame
    this.drawPitchStatic(g);
    this.markerG = this.add.graphics().setDepth(90000);        // "you" arrow over the controlled kid
  }

  drawPitchStatic(g) {
    const P = (fx, fy) => { const w = this.worldOf(fx, fy); return { x: w.x, y: w.y }; };
    const lerpC = (c1, c2, t) => Phaser.Display.Color.GetColor(
      Math.round(c1[0] + (c2[0] - c1[0]) * t), Math.round(c1[1] + (c2[1] - c1[1]) * t), Math.round(c1[2] + (c2[2] - c1[2]) * t));
    const top = PITCH.mg, bot = PITCH.h - PITCH.mg, L = PITCH.mg, R = PITCH.w - PITCH.mg, N = 24;
    for (let i = 0; i < N; i++) {                              // mown grass bands (perspective quads), lighter toward near
      const t = i / N, a = top + (bot - top) * i / N, b = top + (bot - top) * (i + 1) / N;
      const c = i % 2 ? lerpC([0x24, 0x76, 0x40], [0x3a, 0x9a, 0x57], t) : lerpC([0x2a, 0x82, 0x4a], [0x44, 0xa6, 0x60], t);
      g.fillStyle(c, 1);
      g.fillPoints([P(L, a), P(R, a), P(R, b), P(L, b)], true);
    }
    const stroke = (pts, close, lw, col, al) => { g.lineStyle(lw, col, al); g.strokePoints(pts.map(P), close, close); };
    stroke([[L, top], [R, top], [R, bot], [L, bot]], true, 4, 0xffffff, 0.9);                 // boundary
    stroke([[L, PITCH.h / 2], [R, PITCH.h / 2]], false, 4, 0xffffff, 0.85);                    // halfway
    const cc = []; for (let k = 0; k <= 30; k++) { const a = k / 30 * Math.PI * 2; cc.push(P(PITCH.cx + Math.cos(a) * 95, PITCH.h / 2 + Math.sin(a) * 95)); }
    g.lineStyle(4, 0xffffff, 0.85); g.strokePoints(cc, true, true);                            // centre circle
    stroke([[PITCH.cx - 168, top], [PITCH.cx + 168, top], [PITCH.cx + 168, top + 150], [PITCH.cx - 168, top + 150]], true, 4, 0xffffff, 0.85);
    stroke([[PITCH.cx - 168, bot], [PITCH.cx + 168, bot], [PITCH.cx + 168, bot - 150], [PITCH.cx - 168, bot - 150]], true, 4, 0xffffff, 0.85);
    [[GOAL_TOP, 1], [GOAL_BOT, -1]].forEach((gg) => {                                          // goals: mouth + net hint
      const gy = gg[0], dir = gg[1];
      const lp = P(PITCH.cx - PITCH.mouth / 2, gy), rp = P(PITCH.cx + PITCH.mouth / 2, gy);
      const lb = P(PITCH.cx - PITCH.mouth / 2, gy - dir * 30), rb = P(PITCH.cx + PITCH.mouth / 2, gy - dir * 30);
      g.fillStyle(0xffffff, 0.16); g.fillPoints([lp, rp, rb, lb], true);
      g.lineStyle(5, 0xffffff, 1); g.strokePoints([lp, lb, rb, rp], false, false);
    });
  }

  /* ---------- per-frame: place sprites + scroll the camera (the pitch never redraws) ---------- */
  renderSprites() {
    for (const p of this.players) {
      const w = this.worldOf(p.x, p.y);
      p.disp.setPosition(w.x, w.y).setScale(w.s * SPRITE_BASE * p.dispScale).setDepth(w.y);
    }
    const b = this.worldOf(this.ball.x, this.ball.y);
    this.ballDisp.setPosition(b.x, b.y).setScale(b.s * 0.85).setDepth(b.y + 4);
    const mg = this.markerG; mg.clear();
    const c = this.controlled;
    if (c) {
      const d = c.disp, hx = d.x, hy = d.y - d.displayHeight * 0.92 - 10;
      mg.fillStyle(this.owner === c ? 0xffe23a : 0x6fd0ff, 1);
      mg.fillTriangle(hx - 9, hy - 10, hx + 9, hy - 10, hx, hy + 2);
    }
  }

  updateCam() {
    const w = this.worldOf(this.ball.x, this.ball.y);
    this.camPt.x = Phaser.Math.Linear(this.camPt.x, w.x, camLerp);
    this.camPt.y = Phaser.Math.Linear(this.camPt.y, w.y - 70, camLerp);    // bias up a little so you see ahead
    this.cam.centerOn(this.camPt.x, this.camPt.y);
  }

  buildHUD() {
    const col = (h) => Phaser.Display.Color.HexStringToColor(h).color;
    this.add.rectangle(GW / 2, 22, 360, 36, 0x0a0e16, 0.85).setStrokeStyle(2, 0xffffff, 0.12).setScrollFactor(0).setDepth(100000);
    this.add.rectangle(GW / 2 - 150, 22, 22, 22, col(KIDS.kit.shirt)).setScrollFactor(0).setDepth(100001);
    this.add.rectangle(GW / 2 + 150, 22, 22, 22, col(this.away.kit.shirt)).setScrollFactor(0).setDepth(100001);
    this.scoreText = this.add.text(GW / 2, 22, "0 - 0", { fontFamily: "Press Start 2P", fontSize: "18px", color: "#ffe85a" }).setOrigin(0.5).setScrollFactor(0).setDepth(100001);
    this.add.text(GW / 2 - 132, 22, "KORNA", { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fff" }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100001);
    this.add.text(GW / 2 + 132, 22, this.away.name.toUpperCase().slice(0, 8), { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fff" }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100001);
    this.bannerText = this.add.text(GW / 2, GH / 2 - 30, "", { fontFamily: "Press Start 2P", fontSize: "40px", color: "#ffd23a" }).setOrigin(0.5).setScrollFactor(0).setDepth(100001);
    this.hint = this.add.text(GW / 2, GH - 14, "MOVE arrows  SPRINT e  SHOOT d  PASS s  SWITCH space", { fontFamily: "Trebuchet MS", fontSize: "13px", color: "#9fb0c8" }).setOrigin(0.5).setScrollFactor(0).setDepth(100001);
    // minimap
    this.mini = this.add.graphics().setScrollFactor(0).setDepth(100001);
  }

  banner(t, dur) { this.bannerText.setText(t); this.bannerT = dur; }

  kickoff(side) {
    this.players.forEach((p) => { p.setPosition(p.homeX, p.homeY); p.body.setVelocity(0, 0); p.celebrateT = 0; });
    this.ball.setPosition(PITCH.cx, PITCH.h / 2); this.ball.body.setVelocity(0, 0);
    const kicker = (side === "home" ? this.home : this.away_).find((p) => p.role === "MID") || this.home[0];
    kicker.setPosition(PITCH.cx, PITCH.h / 2 + (side === "home" ? 26 : -26));
    this.owner = kicker; this.ownerHold = 0;
    this.controlled = side === "home" ? kicker : this.nearestHome(this.ball.x, this.ball.y);
    this.justScored = 0;
    this.banner("KICK OFF", 1.2);
  }

  /* ---------- helpers ---------- */
  nearestHome(x, y) {
    let best = null, bd = 1e9; for (const p of this.home) { if (p.isGK) continue; const d = Phaser.Math.Distance.Squared(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } } return best;
  }
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
    this.updatePossession(dt);
    this.players.forEach((p) => this.animate(p));
    this.checkGoals();
    this.renderSprites();
    this.updateCam();
    this.updateMini();
  }

  updateControlled() {
    if (this.owner && this.owner.side === "home" && !this.owner.isGK) { this.controlled = this.owner; return; }
    if (this.switchLock > 0) return;
    this.controlled = this.nearestHome(this.ball.x, this.ball.y) || this.controlled;
  }

  handleInput(dt) {
    const c = this.controlled; if (!c) return;
    let ax = 0, ay = 0;
    if (this.cursors.left.isDown) ax = -1; else if (this.cursors.right.isDown) ax = 1;
    if (this.cursors.up.isDown) ay = -1; else if (this.cursors.down.isDown) ay = 1;
    const m = Math.hypot(ax, ay) || 1;
    const sprint = this.keys.sprint.isDown;
    c.body.setMaxVelocity(sprint ? SPRINTV : MAXV); c.sprinting = sprint;
    c.body.setAcceleration(ax / m * ACC, ay / m * ACC);
    if (ax || ay) { c.faceX = ax / m; c.faceY = ay / m; }

    const owns = this.owner === c;
    if (Phaser.Input.Keyboard.JustDown(this.keys.sw) && !owns) this.switchPlayer();
    if (Phaser.Input.Keyboard.JustDown(this.keys.shoot) && owns) this.shoot(c);
    if (Phaser.Input.Keyboard.JustDown(this.keys.pass)) { if (owns) this.passBall(c); }
    if (Phaser.Input.Keyboard.JustDown(this.keys.lob) && !owns) this.slide(c);
  }

  switchPlayer() {
    const out = this.home.filter((p) => !p.isGK);
    let i = out.indexOf(this.controlled);
    this.controlled = out[(i + 1) % out.length]; this.switchLock = 0.8;
  }

  shoot(p) {
    this.owner = null; this.ownerHold = 0;
    const gy = p.side === "home" ? GOAL_TOP : GOAL_BOT;
    const aimX = Phaser.Math.Clamp(p.x + Phaser.Math.Between(-40, 40), PITCH.cx - PITCH.mouth / 2 + 16, PITCH.cx + PITCH.mouth / 2 - 16);
    const a = Math.atan2(gy - p.y, aimX - p.x);
    const pw = 470 * (p.pow || 1);
    this.ball.body.setVelocity(Math.cos(a) * pw, Math.sin(a) * pw);
    p.actT = 0.25; p.act = "kick"; p.kickCd = 0.25;
  }
  passBall(p) {
    const mates = (p.side === "home" ? this.home : this.away_).filter((m) => m !== p && !m.isGK);
    const fwd = p.side === "home" ? -1 : 1;
    let best = null, bs = -1e9;
    for (const m of mates) { const ahead = (m.y - p.y) * fwd; const d = Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y); if (d < 40 || d > 520) continue; const sc = ahead * 1.1 - d * 0.1; if (sc > bs) { bs = sc; best = m; } }
    this.owner = null; this.ownerHold = 0;
    const tgt = best || { x: p.x + p.faceX * 200, y: p.y + p.faceY * 200 };
    const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const pw = Phaser.Math.Clamp(Phaser.Math.Distance.Between(p.x, p.y, tgt.x, tgt.y) * 2.2, 240, 540);
    this.ball.body.setVelocity(Math.cos(a) * pw, Math.sin(a) * pw);
    p.actT = 0.25; p.act = "pass";
  }
  slide(p) {
    p.act = "tackle"; p.actT = 0.35; p.diveT = 0;
    const sp = 360; p.body.setVelocity(p.faceX * sp, p.faceY * sp);
  }

  updateAI() {
    const ball = this.ball, owner = this.owner;
    for (const side of [this.home, this.away_]) {
      const isHome = side === this.home;
      const attackY = isHome ? GOAL_TOP : GOAL_BOT;
      const fwd = isHome ? -1 : 1;
      for (const p of side) {
        if (p === this.controlled) continue;
        if (p.isGK) { this.gkAI(p); continue; }
        if (p === owner) { this.carrierAI(p, attackY, fwd); continue; }
        const teammate = owner && owner.side === p.side;
        if (teammate) {
          // support: forwards push up, others hold shape + drift to ball
          if (p.role === "FWD" || p.role === "ST") this.steer(p, Phaser.Math.Clamp(ball.x + Phaser.Math.Between(-40, 40), PITCH.mg, PITCH.w - PITCH.mg), ball.y + fwd * 160, false);
          else this.steer(p, Phaser.Math.Linear(p.homeX, ball.x, 0.4), Phaser.Math.Linear(p.homeY, ball.y, 0.35), false);
        } else if (owner) {
          // defend: nearest presses, others hold goalside
          const near = this.nearestOf(side, owner.x, owner.y, true);
          if (p === near) this.steer(p, owner.x, owner.y + fwd * -6, true);
          else this.steer(p, Phaser.Math.Linear(p.homeX, ball.x, 0.2), Phaser.Math.Linear(p.homeY, ball.y, 0.25), false);
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
    if (toGoal < 360 && (p.kickCd || 0) <= 0 && Math.random() < 0.03) { this.shoot(p); return; }
    if (Math.random() < 0.02) { this.passBall(p); return; }
    this.steer(p, PITCH.cx + (p.x - PITCH.cx) * 0.7, attackY, true);
  }
  gkAI(p) {
    const gy = p.side === "home" ? GOAL_BOT - 18 : GOAL_TOP + 18;   // own goal
    this.steer(p, Phaser.Math.Clamp(this.ball.x, PITCH.cx - PITCH.mouth / 2, PITCH.cx + PITCH.mouth / 2), gy, false);
  }

  updatePossession(dt) {
    const b = this.ball;
    if (this.owner) {
      const o = this.owner; this.ownerHold += dt;
      const dx = o.faceX, dy = o.faceY, m = Math.hypot(dx, dy) || 1;
      const tx = o.x + dx / m * 20, ty = o.y + dy / m * 20 - 6;
      b.setPosition(Phaser.Math.Linear(b.x, tx, 0.5), Phaser.Math.Linear(b.y, ty, 0.5));
      b.body.setVelocity(o.body.velocity.x, o.body.velocity.y);
      // steal
      if (this.ownerHold > 0.15) for (const p of this.players) {
        if (p.side === o.side || p.stealCd > 0) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, o.x, o.y) < 26) {
          const sliding = p.act === "tackle" && p.actT > 0;
          const rate = (sliding ? 3.2 : 1.1) * Phaser.Math.Clamp(0.4 + ((p.def || 1) - (o.skl || 1)) * 0.5, 0.2, 1.4);
          if (Math.random() < rate * dt) { this.owner = p; this.ownerHold = 0; o.stealCd = 0.6; break; }
        }
      }
    } else if (this.justScored <= 0) {
      const spd = b.body.speed;
      for (const p of this.players) {
        if (p.kickCd > 0) continue;
        const reach = p.isGK ? 34 : 24;
        if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < reach && spd < (p.isGK ? 700 : 290)) { this.owner = p; this.ownerHold = 0; if (p.isGK) p.diveT = 0.3; break; }
      }
    }
  }

  checkGoals() {
    if (this.justScored > 0) return;
    const b = this.ball;
    if (b.y < GOAL_TOP + 6 && inMouth(b.x)) this.goal("home");       // home attacks top
    else if (b.y > GOAL_BOT - 6 && inMouth(b.x)) this.goal("away");
  }
  goal(side) {
    this.justScored = 2.4;
    if (side === "home") this.score.home++; else this.score.away++;
    this.scoreText.setText(this.score.home + " - " + this.score.away);
    this.banner("GOAL!", 2.2);
    this.cam.shake(220, 0.006);
    const team = side === "home" ? this.home : this.away_;
    team.forEach((p) => { if (!p.isGK) p.celebrateT = 1.8; });
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
    if (Math.abs(p.body.velocity.x) > 8) d.setFlipX(p.body.velocity.x < 0);
  }

  updateMini() {
    const mw = 120, mh = 80, mx = GW - mw - 12, my = GH - mh - 30;
    const g = this.mini; g.clear();
    g.fillStyle(0x0a0e16, 0.78); g.fillRoundedRect(mx - 3, my - 3, mw + 6, mh + 6, 5);
    g.fillStyle(0x1f6d3c, 1); g.fillRect(mx, my, mw, mh);
    g.lineStyle(1, 0xffffff, 0.4); g.strokeRect(mx, my, mw, mh); g.lineBetween(mx, my + mh / 2, mx + mw, my + mh / 2);
    const M = (x, y) => [mx + (x - PITCH.mg) / PITCH.fw * mw, my + (y - PITCH.mg) / PITCH.fh * mh];
    for (const p of this.players) { const s = M(p.x, p.y); g.fillStyle(p.isGK ? 0xffffff : Phaser.Display.Color.HexStringToColor(p.side === "home" ? KIDS.kit.shirt : this.away.kit.shirt).color, 1); g.fillCircle(s[0], s[1], 2.2); }
    const bs = M(this.ball.x, this.ball.y); g.fillStyle(0xffe85a, 1); g.fillCircle(bs[0], bs[1], 2);
  }
}

/* ----------------------------- boot ----------------------------- */
window.KGAME = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "stage",
  width: GW, height: GH,
  backgroundColor: "#0b0e16",
  pixelArt: true,
  physics: { default: "arcade", arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Preload, Match],
});
