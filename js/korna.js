/* =========================================================================
   KORNA — arcade football (Phaser 3), TAITO POWER GOAL style.
   Zoomed-in 3/4 "up the pitch" view: you attack UP toward the far goal, the
   pitch fills the screen, players are big, and the camera follows the ball in
   ALL directions. Gameplay runs flat in field space (fx = across, fy = along
   the pitch goal-to-goal); worldOf() bakes the perspective and the camera
   scrolls over it. Ball has real height (z) + shadows for shots/chips/keeper.
   ========================================================================= */
"use strict";

const GW = 960, GH = 600;

/* FIELD (gameplay plane). fx 0..PITCH.w = across the pitch, fy 0..PITCH.h = along it.
   Home attacks UP toward GOAL_FAR (high fy = top); away attacks down to GOAL_NEAR. */
const PITCH = { w: 760, h: 1640, mg: 60 };
PITCH.cx = PITCH.w / 2;
PITCH.mouth = 220;
const GOAL_NEAR = 48, GOAL_FAR = PITCH.h - 48;       // bottom goal / top goal
const HALF = PITCH.h / 2;

const ACC = 1900, MAXV = 250, SPRINTV = 350, DRAG = 1700;   // snappy: fast accel, quick stop (no floaty drift)
const GRAV = 1700;
const KID_PREFIX = { "Vanja": "vanja", "Fiči": "fici", Bobo: "bobo", Marko: "marko", Jan: "jan", Cacko: "cacko" };
const ANIMS = ["idle", "run", "sprint", "kick", "pass", "tackle", "celebrate"];

const FXf = (f) => PITCH.mg + f * (PITCH.w - 2 * PITCH.mg);
const FYf = (f) => f * PITCH.h;
const inMouth = (x) => x > PITCH.cx - PITCH.mouth / 2 && x < PITCH.cx + PITCH.mouth / 2;

/* formations: [acrossFrac (0 left .. 1 right), alongFrac (0 near/bottom goal .. 1 far/top goal)] */
const HOME_POS = { Vanja: [0.5, 0.58], "Fiči": [0.5, 0.40], Bobo: [0.34, 0.72], Marko: [0.80, 0.62], Jan: [0.6, 0.78], Cacko: [0.5, 0.07] };
const AWAY_POS = [[0.5, 0.93], [0.32, 0.76], [0.5, 0.78], [0.68, 0.76], [0.4, 0.62], [0.6, 0.62], [0.44, 0.46], [0.58, 0.46]];
const AWAY_ROLES = ["GK", "DEF", "DEF", "DEF", "MID", "MID", "FWD", "FWD"];

/* ZOOMED 3/4 up-the-pitch world (Power Goal). Pitch is a fixed perspective surface;
   the camera scrolls over it in 2D. Tune: top/bot = pitch length, hwNear/hwFar = fan,
   vCurve = far squash, scNear/scFar + SPRITE_BASE = player size, zoom = how close. */
const W = { cx: 940, top: 230, bot: 2560, hwNear: 900, hwFar: 360, persp: 1.4, scNear: 1.04, scFar: 0.46, zoom: 1.95 };
const SPRITE_BASE = 1.0, ZK = 1.0;
const camLerp = 0.16;

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
    Object.values(KID_PREFIX).forEach((p) => this.load.image("portrait_" + p, "assets/portraits/" + p + ".png"));
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
    const s = this.add.graphics(); s.fillStyle(0x000000, 1); s.fillEllipse(20, 8, 40, 16); s.generateTexture("shadow", 40, 16); s.destroy();
    this.scene.start("Home");
  }
}

/* ----------------------------- Home (title + squad + profiles) ----------------------------- */
const KID_FLAVOR = {
  Vanja: "Captain and engine. Box-to-box, never stops running, drags the team forward.",
  "Fiči": "The wall at the back. Reads everything, nothing gets past him.",
  Bobo: "The poacher. Always smiling, always lurking, always scoring.",
  Marko: "Tiny and lightning fast. Burns defenders down the wing.",
  Jan: "The big one, only seven. A rocket in his right boot.",
  Cacko: "Big, agile and absolutely fearless between the sticks.",
};
class Home extends Phaser.Scene {
  constructor() { super("Home"); }
  create() {
    if (this.textures.exists("bg")) this.add.image(GW / 2, GH / 2, "bg").setDisplaySize(GW, GH).setTint(0x35506a).setAlpha(0.55);
    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0a1322, 0.55);
    this.add.text(GW / 2, 62, "KORNA", { fontFamily: "Press Start 2P", fontSize: "58px", color: "#ffcf3a" }).setOrigin(0.5).setShadow(0, 5, "#7a2a00", 0, true, true);
    this.add.text(GW / 2, 116, "STREET CAGE FOOTBALL", { fontFamily: "Press Start 2P", fontSize: "13px", color: "#7fd0ff" }).setOrigin(0.5);
    this.add.text(GW / 2, 150, KIDS.blurb, { fontFamily: "Trebuchet MS", fontSize: "17px", color: "#dde6f2" }).setOrigin(0.5);
    this.add.text(GW / 2, 196, "YOUR SQUAD   —   tap a player to scout", { fontFamily: "Press Start 2P", fontSize: "10px", color: "#9fb0c8" }).setOrigin(0.5);

    const roster = [...KIDS.outfield, KIDS.keeper];
    const n = roster.length, cw = 142, gap = 10, totalW = n * cw + (n - 1) * gap, x0 = GW / 2 - totalW / 2 + cw / 2;
    roster.forEach((k, i) => {
      const x = x0 + i * (cw + gap), y = 308, pr = KID_PREFIX[k.name];
      const bg = this.add.rectangle(x, y, cw, 152, 0x16203a, 1).setStrokeStyle(2, k.captain ? 0xffcf3a : 0x2a3a5c).setInteractive({ useHandCursor: true });
      if (this.textures.exists("portrait_" + pr)) this.add.image(x, y - 20, "portrait_" + pr).setDisplaySize(98, 98);
      this.add.text(x, y + 46, k.name.toUpperCase(), { fontFamily: "Press Start 2P", fontSize: "11px", color: "#fff" }).setOrigin(0.5);
      this.add.text(x, y + 64, k.role + (k.captain ? "  (C)" : ""), { fontFamily: "Trebuchet MS", fontSize: "13px", color: "#ffcf3a" }).setOrigin(0.5);
      bg.on("pointerover", () => bg.setFillStyle(0x243463)); bg.on("pointerout", () => bg.setFillStyle(0x16203a));
      bg.on("pointerdown", () => this.showProfile(k, pr));
    });

    const play = this.add.rectangle(GW / 2, 512, 280, 60, 0xe23b4d).setStrokeStyle(3, 0xffffff, 0.3).setInteractive({ useHandCursor: true });
    this.add.text(GW / 2, 512, "KICK OFF", { fontFamily: "Press Start 2P", fontSize: "22px", color: "#fff" }).setOrigin(0.5);
    this.add.text(GW / 2, 556, "vs Argentina · Maradona era · press SPACE", { fontFamily: "Trebuchet MS", fontSize: "14px", color: "#dde6f2" }).setOrigin(0.5);
    const go = () => this.scene.start("Match", { awayId: "ar86" });
    play.on("pointerover", () => play.setFillStyle(0xff5566)); play.on("pointerout", () => play.setFillStyle(0xe23b4d));
    play.on("pointerdown", go);
    this.input.keyboard.once("keydown-SPACE", go); this.input.keyboard.once("keydown-ENTER", go);
  }

  showProfile(k, pr) {
    if (this.profile) this.profile.destroy();
    const c = this.add.container(0, 0).setDepth(1000), cx = GW / 2, cy = GH / 2;
    const dim = this.add.rectangle(cx, cy, GW, GH, 0x05070d, 0.88).setInteractive();
    const panel = this.add.rectangle(cx, cy, 660, 400, 0x121c33).setStrokeStyle(3, k.captain ? 0xffcf3a : 0x35507a);
    c.add([dim, panel]);
    if (this.textures.exists("portrait_" + pr)) c.add(this.add.image(cx - 190, cy - 34, "portrait_" + pr).setDisplaySize(200, 200));
    c.add(this.add.text(cx - 78, cy - 138, k.name.toUpperCase(), { fontFamily: "Press Start 2P", fontSize: "26px", color: "#fff" }).setOrigin(0, 0.5));
    c.add(this.add.text(cx - 78, cy - 104, k.role + (k.captain ? "   •   CAPTAIN" : ""), { fontFamily: "Press Start 2P", fontSize: "11px", color: "#ffcf3a" }).setOrigin(0, 0.5));
    c.add(this.add.text(cx - 78, cy - 80, KID_FLAVOR[k.name] || "", { fontFamily: "Trebuchet MS", fontSize: "16px", color: "#dde6f2", wordWrap: { width: 350 }, lineSpacing: 3 }).setOrigin(0, 0));
    const st = k.stats || {}, fourth = st.reach ? ["REACH", st.reach] : st.defense ? ["DEFENSE", st.defense] : st.finishing ? ["FINISH", st.finishing] : ["STAMINA", st.stamina];
    const rows = [["SPEED", st.speed], ["ACCEL", st.accel], ["POWER", st.power], ["SKILL", st.skill], fourth];
    rows.forEach((s, i) => {
      if (s[1] == null) return; const y = cy + 4 + i * 30, v = Phaser.Math.Clamp((s[1] - 0.7) / 0.75, 0.06, 1);
      c.add(this.add.text(cx - 78, y, s[0], { fontFamily: "Press Start 2P", fontSize: "8px", color: "#9fb0c8" }).setOrigin(0, 0.5));
      c.add(this.add.rectangle(cx + 6, y, 230, 11, 0x223150).setOrigin(0, 0.5));
      c.add(this.add.rectangle(cx + 6, y, 230 * v, 11, v > 0.78 ? 0xffcf3a : 0x46b06a).setOrigin(0, 0.5));
    });
    c.add(this.add.text(cx, cy + 172, "tap anywhere to close", { fontFamily: "Trebuchet MS", fontSize: "13px", color: "#8593ab" }).setOrigin(0.5));
    dim.on("pointerdown", () => { c.destroy(); this.profile = null; });
    this.profile = c;
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

    this.ball = this.physics.add.sprite(PITCH.cx, HALF, "ball");
    this.ball.setVisible(false);
    this.ball.body.setCircle(7).setBounce(0.5).setDrag(48).setCollideWorldBounds(true).setMaxVelocity(760);
    this.ballZ = 0; this.ballVZ = 0;
    this.ballShadow = this.add.image(0, 0, "shadow").setDepth(5);
    this.ballDisp = this.add.sprite(0, 0, "ball");
    this.owner = null; this.ownerHold = 0; this.justScored = 0;

    // no hard player-player collisions: arcade dribbling pushes through pressure; ball-winning is via the steal logic
    this.controlled = this.nearestHome(this.ball.x, this.ball.y);
    this.switchLock = 0;

    // zoomed camera, follows the ball in 2D over the static pitch
    this.cam = this.cameras.main;
    this.cam.setBounds(0, 0, W.cx * 2, W.bot + 220);
    this.baseZoom = W.zoom; this.cam.setZoom(W.zoom);
    const w0 = this.worldOf(this.ball.x, this.ball.y);
    this.camPt = new Phaser.Math.Vector2(w0.x, w0.y);
    this.cam.centerOn(w0.x, w0.y);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ sprint: "E", shoot: "D", pass: "S", lob: "A", sw: "SPACE" });
    this.input.keyboard.addCapture("UP,DOWN,LEFT,RIGHT,SPACE,A,S,D,E");

    this.buildHUD();
    this.kickoff("home");
  }

  /* ---------- field -> world (baked 3/4 perspective; camera scrolls over it) ---------- */
  worldOf(fx, fy) {
    const ny = Phaser.Math.Clamp(fy / PITCH.h, 0, 1);   // 0 near(bottom) .. 1 far(top)
    const vy = ny * (1 + W.persp) / (1 + ny * W.persp);  // TRUE 3D perspective (1/z), far end recedes
    const hw = Phaser.Math.Linear(W.hwNear, W.hwFar, vy);
    return {
      x: W.cx + (fx / PITCH.w - 0.5) * 2 * hw,
      y: Phaser.Math.Linear(W.bot, W.top, vy),
      s: Phaser.Math.Linear(W.scNear, W.scFar, vy),
    };
  }

  /* ---------- static pitch + thin stadium (drawn ONCE) ---------- */
  setupScene() {
    this.cameras.main.setBackgroundColor(0x18472f);                 // grass surround: off-pitch reads as grass, never black
    const ap = this.add.graphics().setDepth(-200);
    ap.fillStyle(0x18472f, 1); ap.fillRect(-300, -300, W.cx * 2 + 600, W.bot + 900);
    const g = this.add.graphics().setDepth(-100);
    this.drawStands(g);
    this.drawPitch(g);
    this.markerG = this.add.graphics().setDepth(90000);
  }

  drawStands(g) {
    // thin crowd band + hoardings behind the FAR goal only (pitch fills the rest)
    const fl = this.worldOf(0, GOAL_FAR), fr = this.worldOf(PITCH.w, GOAL_FAR);
    const topY = W.top - 150, span = (fr.x - fl.x) + 360, x0 = fl.x - 180;
    g.fillStyle(0x101a33, 1); g.fillRect(x0 - 40, 0, span + 80, W.top + 10);
    const tiers = [{ y: topY + 6, h: 40, b: 0x223a63 }, { y: topY + 48, h: 46, b: 0x2a4675 }];
    tiers.forEach((tr) => {
      g.fillStyle(tr.b, 1); g.fillRect(x0, tr.y, span, tr.h);
      for (let x = x0 + 4; x < x0 + span; x += 8) for (let y = tr.y + 4; y < tr.y + tr.h - 3; y += 7) {
        const c = [0xe7e7ef, 0xd24b54, 0x3f7bd6, 0xf2c94c, 0x46b06a][(Math.random() * 5) | 0];
        g.fillStyle(c, 0.85); g.fillRect(x, y, 3, 3);
      }
    });
    const ads = [0xd23b46, 0x1f7ae0, 0x18a558, 0xf2b50c, 0x8a3fd0];
    for (let x = x0, i = 0; x < x0 + span; x += 116, i++) { g.fillStyle(ads[i % ads.length], 0.95); g.fillRect(x, W.top - 22, 108, 18); }
    g.fillStyle(0x0b1120, 1); g.fillRect(x0, W.top - 3, span, 4);
  }

  drawPitch(g) {
    const P = (fx, fy) => { const w = this.worldOf(fx, fy); return { x: w.x, y: w.y }; };
    const lerpC = (c1, c2, t) => Phaser.Display.Color.GetColor(Math.round(c1[0] + (c2[0] - c1[0]) * t), Math.round(c1[1] + (c2[1] - c1[1]) * t), Math.round(c1[2] + (c2[2] - c1[2]) * t));
    const L = 0, R = PITCH.w, N = 28;
    for (let i = 0; i < N; i++) {                               // horizontal mown bands (perspective quads)
      const t = i / N, a = PITCH.h * i / N, b = PITCH.h * (i + 1) / N;
      const c = i % 2 ? lerpC([0x2a, 0x80, 0x49], [0x33, 0x90, 0x53], t) : lerpC([0x25, 0x74, 0x41], [0x2d, 0x86, 0x4c], t);
      g.fillStyle(c, 1); g.fillPoints([P(L, a), P(R, a), P(R, b), P(L, b)], true);
    }
    // subtle converging mowing lines -> 3D depth without a harsh wireframe
    g.lineStyle(2, 0x1f6535, 0.16);
    for (let k = 1; k < 8; k++) { const fx = PITCH.w * k / 8; g.strokePoints([P(fx, GOAL_NEAR), P(fx, GOAL_FAR)], false, false); }
    const line = (pts, close, lw, al) => { g.lineStyle(lw, 0xffffff, al == null ? 0.9 : al); g.strokePoints(pts.map(P), close, close); };
    line([[L, GOAL_NEAR], [R, GOAL_NEAR], [R, GOAL_FAR], [L, GOAL_FAR]], true, 4);        // boundary
    line([[L, HALF], [R, HALF]], false, 4);                                                // halfway
    const cc = []; for (let k = 0; k <= 32; k++) { const t = k / 32 * Math.PI * 2; cc.push(P(PITCH.cx + Math.cos(t) * 150, HALF + Math.sin(t) * 150)); }
    g.lineStyle(4, 0xffffff, 0.9); g.strokePoints(cc, true, true);                         // centre circle
    [[GOAL_NEAR, 1], [GOAL_FAR, -1]].forEach((gg) => {
      const gy = gg[0], dir = gg[1];
      line([[PITCH.cx - 168, gy], [PITCH.cx - 168, gy + dir * 150], [PITCH.cx + 168, gy + dir * 150], [PITCH.cx + 168, gy]], false, 4);
      this.drawGoal(g, gy, dir);
    });
  }

  drawGoal(g, gy, dir) {
    const mw = PITCH.mouth / 2, H = 92;
    const lB = this.worldOf(PITCH.cx - mw, gy), rB = this.worldOf(PITCH.cx + mw, gy);
    const lT = { x: lB.x, y: lB.y - H * lB.s }, rT = { x: rB.x, y: rB.y - H * rB.s };
    g.fillStyle(0xffffff, 0.12); g.fillPoints([lB, rB, rT, lT], true);
    g.lineStyle(1, 0xffffff, 0.3);
    for (let k = 1; k < 7; k++) { const t = k / 7; g.lineBetween(lB.x + (rB.x - lB.x) * t, lB.y + (rB.y - lB.y) * t, lT.x + (rT.x - lT.x) * t, lT.y + (rT.y - lT.y) * t); }
    for (let k = 1; k < 3; k++) { const t = k / 3; g.lineBetween(lB.x + (lT.x - lB.x) * t, lB.y + (lT.y - lB.y) * t, rB.x + (rT.x - rB.x) * t, rB.y + (rT.y - rB.y) * t); }
    g.lineStyle(5, 0xf4f8ff, 1); g.strokePoints([lB, lT, rT, rB], false, false);
  }

  /* ---------- setup helpers ---------- */
  addPlayer(prefix, role, frac, side, meta) {
    const p = this.physics.add.sprite(FXf(frac[0]), FYf(frac[1]), prefix + "_idle");
    p.setVisible(false);
    p.body.setCircle(13, 19, 43).setDrag(DRAG, DRAG).setMaxVelocity(MAXV).setCollideWorldBounds(true);
    p.prefix = prefix; p.role = role; p.side = side; p.isGK = !!meta.gk; p.captain = !!meta.captain;
    p.dispScale = meta.size || 1; p.sentOff = false;
    p.homeX = p.x; p.homeY = p.y; p.faceX = 0; p.faceY = side === "home" ? 1 : -1;
    p.actT = 0; p.act = null; p.diveT = 0; p.celebrateT = 0; p.stealCd = 0; p.kickCd = 0; p.sprinting = false;
    p.shadow = this.add.image(p.x, p.y, "shadow").setDepth(4).setAlpha(0.42);
    p.disp = this.add.sprite(p.x, p.y, prefix + "_idle").setOrigin(0.5, 0.92);
    this.players.push(p);
    (side === "home" ? this.home : this.away_).push(p);
    return p;
  }

  buildHUD() {
    const col = (h) => Phaser.Display.Color.HexStringToColor(h).color, D = 100000;
    this.add.rectangle(GW / 2, 22, 376, 36, 0x0a0e16, 0.85).setStrokeStyle(2, 0xffffff, 0.12).setScrollFactor(0).setDepth(D);
    this.add.rectangle(GW / 2 - 156, 22, 22, 22, col(KIDS.kit.shirt)).setScrollFactor(0).setDepth(D + 1);
    this.add.rectangle(GW / 2 + 156, 22, 22, 22, col(this.away.kit.shirt)).setScrollFactor(0).setDepth(D + 1);
    this.scoreText = this.add.text(GW / 2, 22, "0 - 0", { fontFamily: "Press Start 2P", fontSize: "18px", color: "#ffe85a" }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.add.text(GW / 2 - 138, 22, "KORNA", { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fff" }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 1);
    this.add.text(GW / 2 + 138, 22, this.away.name.toUpperCase().slice(0, 9), { fontFamily: "Press Start 2P", fontSize: "10px", color: "#fff" }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 1);
    this.bannerText = this.add.text(GW / 2, GH / 2 - 46, "", { fontFamily: "Press Start 2P", fontSize: "38px", color: "#ffd23a" }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);
    this.add.text(GW / 2, GH - 12, "MOVE arrows   SPRINT e   SHOOT d   CHIP a   PASS s   SWITCH space", { fontFamily: "Trebuchet MS", fontSize: "12px", color: "#9fb0c8" }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.mini = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
  }

  banner(t, dur, color) { this.bannerText.setText(t).setColor(color || "#ffd23a"); this.bannerT = dur; }

  kickoff(side) {
    this.players.forEach((p) => { if (p.sentOff) return; p.setPosition(p.homeX, p.homeY); p.body.setVelocity(0, 0); p.celebrateT = 0; });
    this.ball.setPosition(PITCH.cx, HALF); this.ball.body.setVelocity(0, 0); this.ballZ = 0; this.ballVZ = 0;
    const kicker = (side === "home" ? this.home : this.away_).find((p) => p.role === "MID" && !p.sentOff) || this.home[0];
    kicker.setPosition(PITCH.cx, HALF + (side === "home" ? -26 : 26));
    this.owner = kicker; this.ownerHold = 0;
    this.controlled = side === "home" ? kicker : this.nearestHome(this.ball.x, this.ball.y);
    this.justScored = 0;
    this.banner("KICK OFF", 0.85);
  }

  /* ---------- helpers ---------- */
  nearestHome(x, y) { return this.nearestOf(this.home, x, y, true); }
  nearestOf(list, x, y, skipGK) { let best = null, bd = 1e9; for (const p of list) { if (p.sentOff || (skipGK && p.isGK)) continue; const d = Phaser.Math.Distance.Squared(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } } return best; }
  steer(p, tx, ty, sprint) {
    const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy);
    if (m < 16) { p.body.setAcceleration(0, 0); return; }   // settle without jittering on the spot
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
    this.updateCam(dt);
    this.updateMini();
  }

  updateBallHeight(dt) {
    if (this.ballZ > 0 || this.ballVZ !== 0) {
      this.ballZ += this.ballVZ * dt; this.ballVZ -= GRAV * dt;
      if (this.ballZ <= 0) { this.ballZ = 0; this.ballVZ = Math.abs(this.ballVZ) > 200 ? -this.ballVZ * 0.32 : 0; }
    }
  }

  updateControlled() {
    if (this.owner && this.owner.side === "home") { this.controlled = this.owner; return; }   // GK too: you control him to clear/throw
    if (this.switchLock > 0) return;
    this.controlled = this.nearestHome(this.ball.x, this.ball.y) || this.controlled;
  }

  handleInput(dt) {
    const c = this.controlled; if (!c) return;
    // up-the-pitch: up/down arrows = along the pitch (fy), left/right = across (fx)
    let ax = 0, ay = 0;
    if (this.cursors.left.isDown) ax = -1; else if (this.cursors.right.isDown) ax = 1;
    if (this.cursors.up.isDown) ay = 1; else if (this.cursors.down.isDown) ay = -1;   // up = toward far goal (higher fy)
    const m = Math.hypot(ax, ay) || 1;
    const sprint = this.keys.sprint.isDown;
    c.body.setMaxVelocity(sprint ? SPRINTV : MAXV); c.sprinting = sprint;
    c.body.setAcceleration(ax / m * ACC, ay / m * ACC);
    if (ax || ay) { c.faceX = ax / m; c.faceY = ay / m; }

    const owns = this.owner === c;
    if (Phaser.Input.Keyboard.JustDown(this.keys.sw) && !owns) this.switchPlayer();
    if (Phaser.Input.Keyboard.JustDown(this.keys.shoot) && owns) this.shoot(c, false);
    if (Phaser.Input.Keyboard.JustDown(this.keys.lob) && owns) this.shoot(c, true);
    if (Phaser.Input.Keyboard.JustDown(this.keys.pass) && owns) this.passBall(c);
    if (Phaser.Input.Keyboard.JustDown(this.keys.lob) && !owns) this.slide(c);
  }

  switchPlayer() {
    const out = this.home.filter((p) => !p.isGK && !p.sentOff);
    let i = out.indexOf(this.controlled);
    this.controlled = out[(i + 1) % out.length]; this.switchLock = 0.8;
  }

  shoot(p, chip) {
    this.owner = null; this.ownerHold = 0;
    const gy = p.side === "home" ? GOAL_FAR : GOAL_NEAR;
    const gk = (p.side === "home" ? this.away_ : this.home).find((q) => q.isGK && !q.sentOff);
    const half = PITCH.mouth / 2 - 14;
    // aim the OPEN corner away from the keeper, so good shots actually go in
    let aimX = gk ? (gk.x <= PITCH.cx ? PITCH.cx + half : PITCH.cx - half) : PITCH.cx + Phaser.Math.Between(-half, half);
    aimX += Phaser.Math.Between(-12, 12);
    const a = Math.atan2(aimX - p.x, gy - p.y);
    const pw = (chip ? 380 : 530) * (p.pow || 1);
    this.ball.body.setVelocity(Math.sin(a) * pw, Math.cos(a) * pw);
    this.ballZ = 6; this.ballVZ = chip ? 540 : 200 + Phaser.Math.Between(0, 110);
    p.actT = 0.26; p.act = "kick"; p.kickCd = 0.25;
  }
  passBall(p) {
    const mates = (p.side === "home" ? this.home : this.away_).filter((m) => m !== p && !m.isGK && !m.sentOff);
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
      const attackY = isHome ? GOAL_FAR : GOAL_NEAR;
      const fwd = isHome ? 1 : -1;
      for (const p of side) {
        if (p === this.controlled || p.sentOff) continue;
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
    if (toGoal < 400 && (p.kickCd || 0) <= 0 && Math.random() < 0.032) { this.shoot(p, Math.random() < 0.2); return; }
    if (Math.random() < 0.02) { this.passBall(p); return; }
    this.steer(p, PITCH.cx + (p.x - PITCH.cx) * 0.7, attackY, true);
  }
  gkAI(p) {
    const gy = p.side === "home" ? GOAL_NEAR + 20 : GOAL_FAR - 20;
    this.steer(p, Phaser.Math.Clamp(this.ball.x, PITCH.cx - PITCH.mouth / 2, PITCH.cx + PITCH.mouth / 2), gy, false);
  }

  updatePossession(dt) {
    const b = this.ball, low = this.ballZ < 26;
    if (this.owner) {
      const o = this.owner; this.ownerHold += dt;
      const dx = o.faceX, dy = o.faceY, m = Math.hypot(dx, dy) || 1;
      b.setPosition(Phaser.Math.Linear(b.x, o.x + dx / m * 20, 0.5), Phaser.Math.Linear(b.y, o.y + dy / m * 20, 0.5));
      b.body.setVelocity(o.body.velocity.x, o.body.velocity.y); this.ballZ = 0; this.ballVZ = 0;
      if (o.isGK && this.ownerHold > 3.2) { this.passBall(o); return; }    // keeper distributes (auto if you don't)
      if (this.ownerHold > 0.15) for (const p of this.players) {
        if (p.side === o.side || p.stealCd > 0 || p.sentOff) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, o.x, o.y) < 26) {
          const sliding = p.act === "tackle" && p.actT > 0;
          if (Math.random() < (sliding ? 3.0 : 1.0) * dt) { this.owner = p; this.ownerHold = 0; o.stealCd = 0.6; break; }
          else if (sliding && Math.random() < 0.5) { this.foul(p, o); break; }
        }
      }
    } else if (this.justScored <= 0) {
      const spd = b.body.speed;
      for (const p of this.players) {
        if (p.kickCd > 0 || p.sentOff) continue;
        const reach = p.isGK ? 30 : 22, zOk = p.isGK ? this.ballZ < 220 : low;   // keeper grabs high balls (no hovering)
        if (zOk && Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < reach && spd < (p.isGK ? 720 : 300) && (!p.isGK || Math.random() < 0.7)) { this.owner = p; this.ownerHold = 0; if (p.isGK) p.diveT = 0.3; break; }
      }
    }
  }

  foul(fouler, victim) {
    this.owner = victim; this.ownerHold = 0; this.ball.body.setVelocity(0, 0); fouler.stealCd = 1.4;
    this.banner("FREE KICK", 1.4, "#ffd23a");
    const r = Math.random();
    if (r < 0.08) this.showCard(fouler, "RED");
    else if (r < 0.34) this.showCard(fouler, "YELLOW");
  }
  showCard(p, kind) {
    const red = kind === "RED", col = red ? 0xe03131 : 0xf2c20a, D = 100003;
    const card = this.add.rectangle(GW / 2, GH / 2 + 8, 40, 56, col).setStrokeStyle(3, 0x101010, 0.7).setScrollFactor(0).setDepth(D).setAngle(-8);
    const txt = this.add.text(GW / 2, GH / 2 + 56, kind + " CARD", { fontFamily: "Press Start 2P", fontSize: "16px", color: red ? "#ff6b6b" : "#ffe85a" }).setOrigin(0.5).setScrollFactor(0).setDepth(D);
    this.cam.shake(160, 0.004);
    this.time.delayedCall(1600, () => { card.destroy(); txt.destroy(); });
    if (red) { p.sentOff = true; p.disp.setVisible(false); p.shadow.setVisible(false); p.body.enable = false; if (this.owner === p) this.owner = null; }
  }

  checkGoals() {
    if (this.justScored > 0) return;
    const b = this.ball, overBar = this.ballZ > 92;
    if (!overBar && inMouth(b.x)) {
      if (b.y > GOAL_FAR - 4) this.goal("home");
      else if (b.y < GOAL_NEAR + 4) this.goal("away");
    }
  }
  goal(side) {
    this.justScored = 2.6;
    if (side === "home") this.score.home++; else this.score.away++;
    this.scoreText.setText(this.score.home + " - " + this.score.away);
    this.banner("G O A L !", 2.4, side === "home" ? "#ffe23a" : "#ff9aa2");
    this.cam.shake(260, 0.007); this.cam.flash(200, 255, 255, 255);
    this.cam.zoomTo(this.baseZoom * 1.25, 360, "Sine.easeInOut", true);
    this.time.delayedCall(1100, () => this.cam.zoomTo(this.baseZoom, 600, "Sine.easeInOut", true));
    (side === "home" ? this.home : this.away_).forEach((p) => { if (!p.isGK && !p.sentOff) p.celebrateT = 2.0; });
    this.owner = null;
    this.time.delayedCall(2400, () => this.kickoff(side === "home" ? "away" : "home"));
  }

  animate(p) {
    if (p.sentOff) return;
    const d = p.disp, k = (n) => p.prefix + "_" + n, has = (n) => this.anims.exists(p.prefix + "_" + n);
    if (p.celebrateT > 0 && has("celebrate")) d.play({ key: k("celebrate"), repeat: -1 }, true);
    else if (p.isGK && p.diveT > 0 && has("dive")) d.play(k("dive"), true);
    else if (p.actT > 0 && p.act && has(p.act)) d.play(k(p.act), true);
    else {
      const sp = p.body.speed;
      if (sp > SPRINTV * 0.74 && p.sprinting && has("sprint")) d.play({ key: k("sprint"), repeat: -1 }, true);
      else if (sp > 50) d.play({ key: k("run"), repeat: -1 }, true);   // only "run" when actually translating (no jog-in-place)
      else d.play({ key: k("idle"), repeat: -1 }, true);
    }
    if (Math.abs(p.body.velocity.x) > 8) d.setFlipX(p.body.velocity.x < 0);   // across-pitch velocity = screen left/right
  }

  /* ---------- per-frame placement + 2D camera ---------- */
  renderSprites() {
    for (const p of this.players) {
      if (p.sentOff) continue;
      const w = this.worldOf(p.x, p.y), sc = w.s * SPRITE_BASE * p.dispScale;
      p.disp.setPosition(w.x, w.y).setScale(sc).setDepth(w.y);
      p.shadow.setPosition(w.x, w.y + 2).setScale(sc * 0.95, sc * 0.62).setDepth(w.y - 0.5);
    }
    const w = this.worldOf(this.ball.x, this.ball.y), bs = w.s;
    this.ballShadow.setPosition(w.x, w.y).setScale(bs * (1 - Math.min(0.5, this.ballZ / 380)), bs * 0.62).setDepth(w.y - 0.4);
    this.ballDisp.setPosition(w.x, w.y - this.ballZ * bs * ZK).setScale(bs * 0.95).setDepth(w.y + this.ballZ + 4);
    const mg = this.markerG; mg.clear();
    const c = this.controlled;
    if (c && !c.sentOff) { const d = c.disp, hx = d.x, hy = d.y - d.displayHeight * 0.92 - 12; mg.fillStyle(this.owner === c ? 0xffe23a : 0x6fd0ff, 1); mg.fillTriangle(hx - 10, hy - 11, hx + 10, hy - 11, hx, hy + 3); }
  }

  updateCam(dt) {
    // look slightly ahead of the ball's motion, snappier follow
    const bx = Phaser.Math.Clamp(this.ball.x + this.ball.body.velocity.x * 0.18, 0, PITCH.w);
    const by = Phaser.Math.Clamp(this.ball.y + this.ball.body.velocity.y * 0.18, 0, PITCH.h);
    const w = this.worldOf(bx, by);
    const tx = Phaser.Math.Clamp(w.x, W.cx - 430, W.cx + 430);   // keep the pitch mostly filling the screen
    this.camPt.x = Phaser.Math.Linear(this.camPt.x, tx, camLerp);
    this.camPt.y = Phaser.Math.Linear(this.camPt.y, w.y, camLerp);
    this.cam.centerOn(this.camPt.x, this.camPt.y);
  }

  updateMini() {
    const mw = 96, mh = 132, mx = GW - mw - 14, my = GH - mh - 26;
    const g = this.mini; g.clear();
    g.fillStyle(0x0a0e16, 0.78); g.fillRoundedRect(mx - 3, my - 3, mw + 6, mh + 6, 5);
    g.fillStyle(0x1f6d3c, 1); g.fillRect(mx, my, mw, mh);
    g.lineStyle(1, 0xffffff, 0.4); g.strokeRect(mx, my, mw, mh); g.lineBetween(mx, my + mh / 2, mx + mw, my + mh / 2);
    const M = (x, y) => [mx + (x / PITCH.w) * mw, my + mh - (y / PITCH.h) * mh];   // across=horizontal, along=vertical (far=top)
    for (const p of this.players) { if (p.sentOff) continue; const s = M(p.x, p.y); g.fillStyle(p.isGK ? 0xffffff : Phaser.Display.Color.HexStringToColor(p.side === "home" ? KIDS.kit.shirt : this.away.kit.shirt).color, 1); g.fillCircle(s[0], s[1], 2.4); }
    const bs = M(this.ball.x, this.ball.y); g.fillStyle(0xffe85a, 1); g.fillCircle(bs[0], bs[1], 2);
  }
}

/* ----------------------------- boot ----------------------------- */
window.KGAME = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "stage",
  width: GW, height: GH,
  backgroundColor: "#0b1f17",
  pixelArt: true,
  physics: { default: "arcade", arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Preload, Home, Match],
});
