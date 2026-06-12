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

const ACC = 1750, MAXV = 250, SPRINTV = 350, DRAG = 1500;   // momentum: quick but with a little weight
const GRAV = 1850;
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
/* SIDE-ON view (from the touchline): the pitch runs left<->right (goal to goal), the
   camera sits at the side and scrolls horizontally to follow the ball. Field fy (along
   the pitch) -> worldX (length), fx (across) -> worldY depth (far touchline up top,
   near touchline at the bottom, with perspective). */
const W = { gx0: 380, gx1: 3260, yFar: 176, yNear: 556, persp: 1.25, skew: 92, scFar: 0.56, scNear: 1.34, zoom: 1.24 };
const SPRITE_BASE = 1.0, ZK = 1.0;
const camLerp = 0.16;

/* ----------------------------- Preload ----------------------------- */
class Preload extends Phaser.Scene {
  constructor() { super("Preload"); }
  preload() {
    this.load.maxParallelDownloads = 120;
    const AV = "?v=19";   // asset version: bump when sprites/portraits change so browsers refetch
    const sheet = (key, file) => this.load.spritesheet(key, "assets/sprites/" + file + ".png" + AV, { frameWidth: 64, frameHeight: 64 });
    const loadChar = (prefix, gk) => {
      ANIMS.forEach((a) => sheet(prefix + "_" + a, prefix + "_" + a));
      if (gk) ["dive", "catch"].forEach((a) => sheet(prefix + "_" + a, prefix + "_" + a));
    };
    Object.values(KID_PREFIX).forEach((p) => loadChar(p, p === "cacko"));
    Object.values(KID_PREFIX).forEach((p) => this.load.image("portrait_" + p, "assets/portraits/" + p + ".png" + AV));
    TEAMS.forEach((t) => { loadChar(t.id, false); this.load.image("portrait_" + t.id, "assets/portraits/" + t.id + ".png" + AV); });  // all opponents
    this.load.image("bg", "assets/backgrounds/ar86.png" + AV);
    this.add.text(GW / 2, GH / 2, "KORNA", { fontFamily: "Press Start 2P", fontSize: "40px", color: "#ffcf3a" }).setOrigin(0.5);
  }
  create() {
    const mk = (key, rate, repeat) => { if (this.textures.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(key), frameRate: rate, repeat }); };
    const all = [...Object.values(KID_PREFIX), ...TEAMS.map((t) => t.id)];
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
    if (this.textures.exists("bg")) this.add.image(GW / 2, GH / 2, "bg").setDisplaySize(GW, GH).setTint(0x35506a).setAlpha(0.5);
    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0a1322, 0.62);
    this.add.text(GW / 2, 36, "KORNA", { fontFamily: "Press Start 2P", fontSize: "44px", color: "#ffcf3a" }).setOrigin(0.5).setShadow(0, 4, "#7a2a00", 0, true, true);
    this.add.text(GW / 2, 72, "STREET CAGE FOOTBALL", { fontFamily: "Press Start 2P", fontSize: "11px", color: "#7fd0ff" }).setOrigin(0.5);

    // ---- your squad (tap to scout) ----
    this.add.text(GW / 2, 102, "YOUR SQUAD  —  tap a kid to scout", { fontFamily: "Press Start 2P", fontSize: "9px", color: "#9fb0c8" }).setOrigin(0.5);
    const roster = [...KIDS.outfield, KIDS.keeper];
    const n = roster.length, cw = 132, gap = 8, x0 = GW / 2 - (n * cw + (n - 1) * gap) / 2 + cw / 2;
    roster.forEach((k, i) => {
      const x = x0 + i * (cw + gap), y = 166, pr = KID_PREFIX[k.name];
      const bg = this.add.rectangle(x, y, cw, 104, 0x16203a, 1).setStrokeStyle(2, k.captain ? 0xffcf3a : 0x2a3a5c).setInteractive({ useHandCursor: true });
      if (this.textures.exists("portrait_" + pr)) this.add.image(x, y - 14, "portrait_" + pr).setDisplaySize(62, 62);
      this.add.text(x, y + 28, k.name.toUpperCase(), { fontFamily: "Press Start 2P", fontSize: "9px", color: "#fff" }).setOrigin(0.5);
      this.add.text(x, y + 42, k.role + (k.captain ? " (C)" : ""), { fontFamily: "Trebuchet MS", fontSize: "11px", color: "#ffcf3a" }).setOrigin(0.5);
      bg.on("pointerover", () => bg.setFillStyle(0x243463)); bg.on("pointerout", () => bg.setFillStyle(0x16203a));
      bg.on("pointerdown", () => this.showProfile(k, pr));
    });

    // ---- choose your opponent ----
    this.add.text(GW / 2, 248, "CHOOSE YOUR OPPONENT", { fontFamily: "Press Start 2P", fontSize: "11px", color: "#ffd23a" }).setOrigin(0.5);
    const col = (h) => Phaser.Display.Color.HexStringToColor(h).color;
    this.selectedAway = "ar86"; this.oppCards = {};
    const N = TEAMS.length, ow = 112, og = 6, ox0 = GW / 2 - (N * ow + (N - 1) * og) / 2 + ow / 2;
    TEAMS.forEach((tm, i) => {
      const x = ox0 + i * (ow + og), y = 336;
      const card = this.add.rectangle(x, y, ow, 134, 0x141d33, 1).setStrokeStyle(3, 0x2a3a5c).setInteractive({ useHandCursor: true });
      this.add.rectangle(x, y - 50, ow - 14, 8, col(tm.kit.shirt));
      if (this.textures.exists("portrait_" + tm.id)) this.add.image(x, y - 22, "portrait_" + tm.id).setDisplaySize(58, 58);
      this.add.text(x, y + 18, (tm.flag || "") + " " + tm.name.toUpperCase(), { fontFamily: "Press Start 2P", fontSize: "7px", color: "#fff" }).setOrigin(0.5);
      this.add.text(x, y + 38, tm.star, { fontFamily: "Trebuchet MS", fontSize: "12px", color: "#cfe0ff" }).setOrigin(0.5);
      this.add.text(x, y + 54, tm.era, { fontFamily: "Trebuchet MS", fontSize: "10px", color: "#8aa0c0", wordWrap: { width: ow - 10 }, align: "center" }).setOrigin(0.5, 0);
      this.oppCards[tm.id] = card;
      card.on("pointerover", () => { if (tm.id !== this.selectedAway) card.setStrokeStyle(3, 0x4a6aa0); });
      card.on("pointerout", () => { if (tm.id !== this.selectedAway) card.setStrokeStyle(3, 0x2a3a5c); });
      card.on("pointerdown", () => this.selectOpp(tm.id));
    });

    // ---- play ----
    const play = this.add.rectangle(GW / 2, 540, 300, 50, 0xe23b4d).setStrokeStyle(3, 0xffffff, 0.3).setInteractive({ useHandCursor: true });
    this.add.text(GW / 2, 540, "KICK OFF", { fontFamily: "Press Start 2P", fontSize: "20px", color: "#fff" }).setOrigin(0.5);
    this.vsText = this.add.text(GW / 2, 578, "", { fontFamily: "Trebuchet MS", fontSize: "13px", color: "#dde6f2" }).setOrigin(0.5);
    const go = () => this.scene.start("Match", { awayId: this.selectedAway });
    play.on("pointerover", () => play.setFillStyle(0xff5566)); play.on("pointerout", () => play.setFillStyle(0xe23b4d));
    play.on("pointerdown", go);
    this.input.keyboard.once("keydown-SPACE", go); this.input.keyboard.once("keydown-ENTER", go);
    this.selectOpp("ar86");
  }

  selectOpp(id) {
    this.selectedAway = id;
    for (const k in this.oppCards) this.oppCards[k].setStrokeStyle(3, k === id ? 0xffcf3a : 0x2a3a5c).setFillStyle(k === id ? 0x26345c : 0x141d33);
    const tm = TEAMS.find((t) => t.id === id);
    if (this.vsText) this.vsText.setText("vs " + tm.name + " · " + tm.era + "   ·   press SPACE to play");
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
    KIDS.outfield.forEach((k) => this.addPlayer(KID_PREFIX[k.name], k.role, HOME_POS[k.name], "home", { name: k.name, captain: k.captain, size: k.size, stats: k.stats }));
    this.addPlayer("cacko", "GK", HOME_POS.Cacko, "home", { name: "Cacko", gk: true, size: 1.28, stats: KIDS.keeper.stats });
    const awayStats = { speed: 1.03, accel: 1.0, power: 1.06, skill: 1.08 };
    AWAY_POS.forEach((pos, i) => this.addPlayer(this.awayId, AWAY_ROLES[i], pos, "away", { gk: AWAY_ROLES[i] === "GK", stats: awayStats }));

    this.ball = this.physics.add.sprite(PITCH.cx, HALF, "ball");
    this.ball.setVisible(false);
    this.ball.body.setCircle(7).setBounce(0.42).setDrag(150).setCollideWorldBounds(true).setMaxVelocity(840);  // rolls, carries passes, settles
    this.ballZ = 0; this.ballVZ = 0;
    this.ballShadow = this.add.image(0, 0, "shadow").setDepth(5);
    this.ballDisp = this.add.sprite(0, 0, "ball");
    this.owner = null; this.ownerHold = 0; this.justScored = 0;

    // no hard player-player collisions: arcade dribbling pushes through pressure; ball-winning is via the steal logic
    this.controlled = this.nearestHome(this.ball.x, this.ball.y);
    this.switchLock = 0;

    // side-on camera: scrolls horizontally along the pitch, full depth always visible
    this.cam = this.cameras.main;
    this.cam.setBounds(0, 0, W.gx1 + W.gx0 + W.skew, GH);
    this.baseZoom = W.zoom; this.cam.setZoom(W.zoom);
    this.camX = this.worldOf(this.ball.x, this.ball.y).x;
    this.cam.centerOn(this.camX, GH / 2);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ sprint: "E", shoot: "D", pass: "S", lob: "A", sw: "SPACE" });
    this.input.keyboard.addCapture("UP,DOWN,LEFT,RIGHT,SPACE,A,S,D,E");

    this.buildHUD();
    this.kickoff("home");
  }

  /* ---------- field -> world (baked 3/4 perspective; camera scrolls over it) ---------- */
  worldOf(fx, fy) {
    const nF = fy / PITCH.h;                              // 0 left goal .. 1 right goal (length -> screen X)
    const nD = Phaser.Math.Clamp(fx / PITCH.w, 0, 1);     // 0 far touchline .. 1 near touchline (depth)
    const d = nD * (1 + W.persp) / (1 + nD * W.persp);    // perspective on depth (far recedes up + small)
    return {
      x: W.gx0 + (W.gx1 - W.gx0) * nF + W.skew * (1 - d), // far side leans (3/4 from the side)
      y: Phaser.Math.Linear(W.yFar, W.yNear, d),
      s: Phaser.Math.Linear(W.scFar, W.scNear, d),
    };
  }

  /* ---------- static pitch + side-on stadium (drawn ONCE) ---------- */
  setupScene() {
    this.cameras.main.setBackgroundColor(0x18472f);                 // grass surround: off-pitch reads as grass, never black
    const ap = this.add.graphics().setDepth(-200);
    ap.fillStyle(0x18472f, 1); ap.fillRect(-400, -200, W.gx1 + W.gx0 + W.skew + 800, GH + 400);
    const g = this.add.graphics().setDepth(-100);
    this.drawStands(g);
    this.drawPitch(g);
    this.netG = this.add.graphics().setDepth(-38);   // net ripple on a goal
    this.goalFx = null;
    this.dustG = this.add.graphics().setDepth(-36); this.dust = [];   // kicked-up dust puffs
    this.markerG = this.add.graphics().setDepth(90000);
  }

  updateNetFx(dt) {
    const g = this.netG; if (!this.goalFx) { if (g.commandBuffer && g.commandBuffer.length) g.clear(); return; }
    this.goalFx.t -= dt; g.clear();
    if (this.goalFx.t <= 0) { this.goalFx = null; return; }
    const f = this.goalFx, prog = 1 - f.t / 0.7, bulge = Math.sin(prog * Math.PI) * 30;
    const dir = f.side === "home" ? 1 : -1, mw = PITCH.mouth / 2, H = 98;
    g.lineStyle(1.5, 0xffffff, 0.7 * (1 - prog * 0.4));
    for (let k = 0; k <= 14; k++) {                                  // mesh bulging out where the ball hit
      const fx = PITCH.cx - mw + (mw * 2) * k / 14;
      const out = bulge * Math.max(0, 1 - Math.abs(fx - f.x) / 150);
      const b = this.worldOf(fx, f.gy + dir * out), t = { x: b.x, y: b.y - H * b.s };
      g.lineBetween(b.x, b.y, t.x, t.y);
    }
  }

  drawStands(g) {
    // far stands across the top (behind the far touchline); near hoardings + crowd along the bottom
    const wL = W.gx0 - 240, wR = W.gx1 + W.skew + 240, span = wR - wL;
    g.fillStyle(0x101a33, 1); g.fillRect(wL, 0, span, W.yFar + 6);
    const tiers = [{ y: 6, h: 52, b: 0x223a63 }, { y: 60, h: 56, b: 0x2a4675 }, { y: 118, h: 58, b: 0x32508a }];
    tiers.forEach((tr) => {
      g.fillStyle(tr.b, 1); g.fillRect(wL, tr.y, span, tr.h);
      for (let x = wL + 4; x < wR; x += 8) for (let y = tr.y + 4; y < tr.y + tr.h - 3; y += 7) {
        const c = [0xe7e7ef, 0xd24b54, 0x3f7bd6, 0xf2c94c, 0x46b06a][(Math.random() * 5) | 0];
        g.fillStyle(c, 0.85); g.fillRect(x, y, 3, 3);
      }
    });
    const ads = [0xd23b46, 0x1f7ae0, 0x18a558, 0xf2b50c, 0x8a3fd0];
    for (let x = wL, i = 0; x < wR; x += 118, i++) { g.fillStyle(ads[i % ads.length], 0.95); g.fillRect(x, W.yFar - 16, 110, 14); }
    g.fillStyle(0x0b1120, 1); g.fillRect(wL, W.yFar - 2, span, 4);
    g.fillStyle(0x0e1830, 1); g.fillRect(wL, W.yNear + 30, span, GH - W.yNear + 200);
    for (let x = wL, i = 0; x < wR; x += 118, i++) { g.fillStyle(ads[(i + 2) % ads.length], 0.95); g.fillRect(x, W.yNear + 14, 110, 14); }
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
    const mw = PITCH.mouth / 2, H = 98;
    const lB = this.worldOf(PITCH.cx - mw, gy), rB = this.worldOf(PITCH.cx + mw, gy);
    const lT = { x: lB.x, y: lB.y - H * lB.s }, rT = { x: rB.x, y: rB.y - H * rB.s };
    g.fillStyle(0xdfe9f7, 0.10); g.fillPoints([lB, rB, rT, lT], true);                                  // net wash
    g.lineStyle(1, 0xffffff, 0.36);
    for (let k = 1; k < 12; k++) { const t = k / 12; g.lineBetween(lB.x + (rB.x - lB.x) * t, lB.y + (rB.y - lB.y) * t, lT.x + (rT.x - lT.x) * t, lT.y + (rT.y - lT.y) * t); }   // fine vertical mesh
    for (let k = 1; k < 6; k++) { const t = k / 6; g.lineBetween(lB.x + (lT.x - lB.x) * t, lB.y + (lT.y - lB.y) * t, rB.x + (rT.x - rB.x) * t, rB.y + (rT.y - rB.y) * t); }              // horizontal mesh
    g.lineStyle(6, 0xf6f9ff, 1); g.strokePoints([lB, lT, rT, rB], false, false);                        // posts + crossbar
  }

  /* ---------- setup helpers ---------- */
  addPlayer(prefix, role, frac, side, meta) {
    const p = this.physics.add.sprite(FXf(frac[0]), FYf(frac[1]), prefix + "_idle");
    p.setVisible(false);
    p.body.setCircle(13, 19, 43).setDrag(DRAG, DRAG).setMaxVelocity(MAXV).setCollideWorldBounds(true);
    p.prefix = prefix; p.role = role; p.side = side; p.isGK = !!meta.gk; p.captain = !!meta.captain;
    p.dispScale = meta.size || 1; p.sentOff = false;
    const st = meta.stats || {};
    p.spd = st.speed || 1; p.acc = st.accel || 1;                    // per-player weight: nimble vs heavy
    p.pow = st.power || st.finishing || 1; p.skl = st.skill || 1; p.def = st.defense || st.reach || 1;
    p.homeX = p.x; p.homeY = p.y; p.faceX = 0; p.faceY = side === "home" ? 1 : -1;
    p.actT = 0; p.act = null; p.diveT = 0; p.celebrateT = 0; p.stealCd = 0; p.kickCd = 0; p.sprinting = false;
    p.phase = Math.random() * 6.28; p.dustCd = 0;   // run-bounce desync + dust timer
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
    p.body.setMaxVelocity((sprint && m > 80 ? SPRINTV : MAXV) * p.spd); p.sprinting = sprint && m > 80;
    p.body.setAcceleration(dx / m * ACC * p.acc, dy / m * ACC * p.acc);
    p.faceX = dx / m; p.faceY = dy / m;                     // face where they run (so AI passes/shots aim right)
  }

  /* ---------- main loop ---------- */
  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerText.setText(""); }
    if (this.justScored > 0) this.justScored -= dt;
    if (this.switchLock > 0) this.switchLock -= dt;
    for (const p of this.players) { if (p.actT > 0) p.actT -= dt; if (p.diveT > 0) p.diveT -= dt; if (p.stealCd > 0) p.stealCd -= dt; if (p.celebrateT > 0) p.celebrateT -= dt; if (p.kickCd > 0) p.kickCd -= dt; if (p.dustCd > 0) p.dustCd -= dt; }

    this.updateControlled();
    this.handleInput(dt);
    this.updateAI();
    this.updateBallHeight(dt);
    this.updatePossession(dt);
    this.players.forEach((p) => this.animate(p));
    this.checkGoals();
    this.updateNetFx(dt);
    this.updateDust(dt);
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

  spawnDust(fx, fy, n, big) {
    for (let i = 0; i < n; i++) this.dust.push({ x: fx + Phaser.Math.Between(-6, 6), y: fy + Phaser.Math.Between(-4, 4), t: big ? 0.55 : 0.36, life: big ? 0.55 : 0.36, r0: big ? 7 : 4 });
  }
  updateDust(dt) {
    const g = this.dustG; g.clear();
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i]; d.t -= dt; if (d.t <= 0) { this.dust.splice(i, 1); continue; }
      const prog = 1 - d.t / d.life, w = this.worldOf(d.x, d.y);
      g.fillStyle(0xece2c8, (1 - prog) * 0.5);
      g.fillCircle(w.x, w.y, (d.r0 + prog * 9) * w.s);
    }
  }

  updateControlled() {
    if (this.owner && this.owner.side === "home" && !this.owner.isGK) { this.controlled = this.owner; return; }   // keeper is computer-controlled
    if (this.switchLock > 0) return;
    this.controlled = this.nearestHome(this.ball.x, this.ball.y) || this.controlled;
  }

  handleInput(dt) {
    const c = this.controlled; if (!c) return;
    // side-on: left/right arrows = along the pitch (fy), up/down = depth across (fx)
    let along = 0, depth = 0;
    if (this.cursors.left.isDown) along = -1; else if (this.cursors.right.isDown) along = 1;
    if (this.cursors.up.isDown) depth = -1; else if (this.cursors.down.isDown) depth = 1;   // up = toward the far touchline
    const m = Math.hypot(along, depth) || 1;
    const sprint = this.keys.sprint.isDown;
    c.body.setMaxVelocity((sprint ? SPRINTV : MAXV) * c.spd); c.sprinting = sprint;
    c.body.setAcceleration(depth / m * ACC * c.acc, along / m * ACC * c.acc);   // body.x = fx (depth), body.y = fy (length)
    if (along || depth) { c.faceX = depth / m; c.faceY = along / m; }

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
    this.owner = null; this.ownerHold = 0; this.spawnDust(p.x, p.y, 3, false);
    const gy = p.side === "home" ? GOAL_FAR : GOAL_NEAR, fwd = p.side === "home" ? 1 : -1;
    const dGoal = Math.abs(gy - p.y);
    // A from deep = a lofted CROSS / long ball to a forward team-mate
    if (chip && dGoal > 470) {
      const mates = (p.side === "home" ? this.home : this.away_).filter((m) => m !== p && !m.isGK && !m.sentOff);
      let tgt = null, bs = -1e9;
      for (const m of mates) { const ah = (m.y - p.y) * fwd; if (ah < 60) continue; const sc = ah - Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) * 0.1; if (sc > bs) { bs = sc; tgt = m; } }
      if (tgt) {
        const aa = Math.atan2(tgt.x - p.x, tgt.y - p.y), dd = Phaser.Math.Distance.Between(p.x, p.y, tgt.x, tgt.y);
        const cw = Phaser.Math.Clamp(dd * 1.9, 320, 650);
        this.ball.body.setVelocity(Math.sin(aa) * cw, Math.cos(aa) * cw);
        this.ballZ = 8; this.ballVZ = Phaser.Math.Clamp(dd * 1.05, 320, 640);
        p.actT = 0.28; p.act = "pass"; return;
      }
    }
    // shot on goal: PC-assisted aim to the OPEN corner, power scales with distance (long shots carry)
    const gk = (p.side === "home" ? this.away_ : this.home).find((q) => q.isGK && !q.sentOff);
    const half = PITCH.mouth / 2 - 12;
    let aimX = gk ? (gk.x <= PITCH.cx ? PITCH.cx + half : PITCH.cx - half) : PITCH.cx + Phaser.Math.Between(-half, half);
    aimX += Phaser.Math.Between(-8, 8);
    const volley = this.ballZ > 36;                              // hitting a ball out of the air = volley / bicycle
    const a = Math.atan2(aimX - p.x, gy - p.y);
    let pw = chip ? Phaser.Math.Clamp(240 + dGoal * 0.5, 320, 560)
                  : Phaser.Math.Clamp(430 + dGoal * 0.62, 490, 820) * (p.pow || 1);
    if (volley) pw *= 1.12;
    this.ball.body.setVelocity(Math.sin(a) * pw, Math.cos(a) * pw);
    this.ballZ = chip ? 8 : 5; this.ballVZ = chip ? 520 : 140 + Phaser.Math.Between(0, 110);
    p.actT = 0.3; p.act = "kick"; p.kickCd = 0.25;
  }
  passBall(p) {
    const mates = (p.side === "home" ? this.home : this.away_).filter((m) => m !== p && !m.isGK && !m.sentOff);
    const fwd = p.side === "home" ? 1 : -1;
    const fm = Math.hypot(p.faceX, p.faceY) || 1, dirx = p.faceX / fm, diry = p.faceY / fm;
    let best = null, bs = -1e9;
    for (const m of mates) {
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy); if (d < 28) continue;
      const dot = (dx * dirx + dy * diry) / d;                     // alignment with where you point
      if (dot < 0.25) continue;
      const sc = dot * 2.0 - d * 0.0016;                           // pass to the team-mate in your aim
      if (sc > bs) { bs = sc; best = m; }
    }
    this.owner = null; this.ownerHold = 0;
    const tgt = best || { x: p.x + dirx * 280, y: p.y + diry * 280 };   // none aligned -> lead pass where you point
    const a = Math.atan2(tgt.x - p.x, tgt.y - p.y) + (Math.random() - 0.5) * 0.07 / (p.skl || 1);  // natural error, less with skill
    const dd = Phaser.Math.Distance.Between(p.x, p.y, tgt.x, tgt.y);
    const pw = Phaser.Math.Clamp(dd * 2.0 + 120, 300, 560) * (0.94 + Math.random() * 0.12);
    this.ball.body.setVelocity(Math.sin(a) * pw, Math.cos(a) * pw);
    this.ballZ = 3; this.ballVZ = 55;
    p.actT = 0.24; p.act = "pass";
  }
  slide(p) { p.act = "tackle"; p.actT = 0.36; const sp = 340; p.body.setVelocity(p.faceX * sp, p.faceY * sp); this.spawnDust(p.x, p.y, 7, true); }

  gkThrow(gk) {
    const mates = (gk.side === "home" ? this.home : this.away_).filter((m) => m !== gk && !m.isGK && !m.sentOff);
    const opps = (gk.side === "home" ? this.away_ : this.home), fwd = gk.side === "home" ? 1 : -1;
    let best = null, bs = -1e9;
    for (const m of mates) {
      let nd = 1e9; for (const o of opps) { if (o.sentOff) continue; const d = Phaser.Math.Distance.Between(m.x, m.y, o.x, o.y); if (d < nd) nd = d; }
      const ahead = (m.y - gk.y) * fwd, far = Phaser.Math.Distance.Between(gk.x, gk.y, m.x, m.y);
      const sc = nd * 1.3 + ahead * 0.35 - far * 0.12;   // most open, a bit upfield, not too far
      if (sc > bs) { bs = sc; best = m; }
    }
    this.owner = null; this.ownerHold = 0;
    const tgt = best || { x: gk.x, y: gk.y + fwd * 240 };
    const a = Math.atan2(tgt.x - gk.x, tgt.y - gk.y), pw = Phaser.Math.Clamp(Phaser.Math.Distance.Between(gk.x, gk.y, tgt.x, tgt.y) * 2.0, 260, 580);
    this.ball.body.setVelocity(Math.sin(a) * pw, Math.cos(a) * pw);
    this.ballZ = 5; this.ballVZ = 150;                   // thrown with a little arc
    gk.actT = 0.26; gk.act = "pass";
  }

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
    if (toGoal < 660 && (p.kickCd || 0) <= 0 && Math.random() < 0.03) { p.faceY = fwd; p.faceX = Phaser.Math.Clamp((PITCH.cx - p.x) / 220, -1, 1); this.shoot(p, toGoal > 470 && Math.random() < 0.4); return; }
    if (Math.random() < 0.022) { this.passBall(p); return; }
    this.steer(p, PITCH.cx + (p.x - PITCH.cx) * 0.7, attackY, true);
  }
  gkAI(p) {
    const own = p.side === "home" ? GOAL_NEAR : GOAL_FAR;          // own goal line (fy)
    const sign = p.side === "home" ? 1 : -1;                       // into the pitch from own goal
    const b = this.ball, vy = b.body.velocity.y;
    const incoming = (p.side === "home" ? vy < -60 : vy > 60), dist = Math.abs(b.y - own);
    if (incoming && dist < 560 && !this.owner) {
      const tt = (own - b.y) / (vy || sign * -1);                 // time to reach the line -> predicted x
      const predX = Phaser.Math.Clamp(b.x + b.body.velocity.x * tt, PITCH.cx - PITCH.mouth / 2 - 26, PITCH.cx + PITCH.mouth / 2 + 26);
      this.steer(p, predX, own + sign * 14, true);                // rush across to it
      if (dist < 170 && Math.abs(p.x - b.x) < 78) p.diveT = 0.34; // dive/parry as it arrives
    } else {
      this.steer(p, Phaser.Math.Clamp(b.x, PITCH.cx - PITCH.mouth / 2, PITCH.cx + PITCH.mouth / 2), own + sign * 18, false);
    }
  }

  updatePossession(dt) {
    const b = this.ball, low = this.ballZ < 26;
    if (this.owner) {
      const o = this.owner; this.ownerHold += dt;
      const dx = o.faceX, dy = o.faceY, m = Math.hypot(dx, dy) || 1;
      b.setPosition(Phaser.Math.Linear(b.x, o.x + dx / m * 20, 0.5), Phaser.Math.Linear(b.y, o.y + dy / m * 20, 0.5));
      b.body.setVelocity(o.body.velocity.x, o.body.velocity.y); this.ballZ = 0; this.ballVZ = 0;
      if (o.isGK && this.ownerHold > 1.7) { this.gkThrow(o); return; }    // keeper holds the save, then throws to a free team-mate
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
        const reach = p.isGK ? 34 : 24, zOk = p.isGK ? this.ballZ < 230 : low;   // keeper grabs high balls + saves
        if (zOk && Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < reach && spd < (p.isGK ? 920 : 470) && (!p.isGK || Math.random() < (p.diveT > 0 ? 0.97 : 0.84))) { this.owner = p; this.ownerHold = 0; if (p.isGK) p.diveT = 0.3; break; }
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
    // net ripple + lodge the ball in the net
    const gy = side === "home" ? GOAL_FAR : GOAL_NEAR;
    this.goalFx = { side, gy, x: Phaser.Math.Clamp(this.ball.x, PITCH.cx - PITCH.mouth / 2, PITCH.cx + PITCH.mouth / 2), t: 0.7 };
    this.ball.body.setVelocity(0, 0); this.ballZ = 0; this.ballVZ = 0;
    this.ball.setPosition(this.goalFx.x, gy + (side === "home" ? 18 : -18));
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
    if (Math.abs(p.body.velocity.y) > 8) d.setFlipX(p.body.velocity.y < 0);   // along-pitch velocity = screen left/right
  }

  /* ---------- per-frame placement + 2D camera ---------- */
  renderSprites() {
    const tnow = this.time.now;
    for (const p of this.players) {
      if (p.sentOff) continue;
      const w = this.worldOf(p.x, p.y), sc = w.s * SPRITE_BASE * p.dispScale, spd = p.body.speed;
      let lift = 0;
      if (spd > 60) lift = Math.abs(Math.sin(tnow * 0.018 + p.phase)) * (p.sprinting ? 5 : 3.2) * w.s;   // running bounce
      if (p.celebrateT > 0) lift += Math.abs(Math.sin(tnow * 0.011)) * 11 * w.s;                          // celebration hop
      p.disp.setPosition(w.x, w.y - lift).setScale(sc).setDepth(w.y);
      p.shadow.setPosition(w.x, w.y + 2).setScale(sc * 0.95, sc * 0.6).setDepth(w.y - 0.5).setAlpha(Phaser.Math.Clamp(0.42 - lift * 0.006, 0.12, 0.42));
      if (p.sprinting && spd > SPRINTV * 0.7 * p.spd && p.dustCd <= 0) { this.spawnDust(p.x, p.y, 1, false); p.dustCd = 0.08; }
    }
    const w = this.worldOf(this.ball.x, this.ball.y), bs = w.s;
    this.ballShadow.setPosition(w.x, w.y).setScale(bs * (1 - Math.min(0.5, this.ballZ / 380)), bs * 0.62).setDepth(w.y - 0.4);
    this.ballDisp.setPosition(w.x, w.y - this.ballZ * bs * ZK).setScale(bs * 0.95).setDepth(w.y + this.ballZ + 4);
    const mg = this.markerG; mg.clear();
    const c = this.controlled;
    if (c && !c.sentOff) { const d = c.disp, hx = d.x, hy = d.y - d.displayHeight * 0.92 - 12; mg.fillStyle(this.owner === c ? 0xffe23a : 0x6fd0ff, 1); mg.fillTriangle(hx - 10, hy - 11, hx + 10, hy - 11, hx, hy + 3); }
  }

  updateCam(dt) {
    // scroll horizontally along the pitch (look slightly ahead of the ball)
    const by = Phaser.Math.Clamp(this.ball.y + this.ball.body.velocity.y * 0.2, 0, PITCH.h);
    const w = this.worldOf(this.ball.x, by);
    this.camX = Phaser.Math.Linear(this.camX, w.x, camLerp);
    this.cam.centerOn(this.camX, GH / 2);
  }

  updateMini() {
    const mw = 152, mh = 72, mx = GW - mw - 14, my = GH - mh - 26;
    const g = this.mini; g.clear();
    g.fillStyle(0x0a0e16, 0.78); g.fillRoundedRect(mx - 3, my - 3, mw + 6, mh + 6, 5);
    g.fillStyle(0x1f6d3c, 1); g.fillRect(mx, my, mw, mh);
    g.lineStyle(1, 0xffffff, 0.4); g.strokeRect(mx, my, mw, mh); g.lineBetween(mx + mw / 2, my, mx + mw / 2, my + mh);
    const M = (x, y) => [mx + (y / PITCH.h) * mw, my + (x / PITCH.w) * mh];   // length=horizontal, depth=vertical
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
