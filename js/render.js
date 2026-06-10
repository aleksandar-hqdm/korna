/* =========================================================================
   KORNA — rendering: action camera, outlined pixel sprites, arcade menus
   ========================================================================= */
"use strict";

const Render = (() => {
  let pitch = null;
  const OUT = "#141019";

  /* ---------- helpers ---------- */
  function rrect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function oFill(ctx, pathFn, color, lw) {
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = OUT; ctx.lineWidth = lw; pathFn(); ctx.stroke();
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }
  const arc = (px) => `${px}px 'Press Start 2P', monospace`;
  const sans = (px, b) => `${b ? "bold " : ""}${px}px Trebuchet MS, system-ui, sans-serif`;
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { const k = 1 + amt; r *= k; g *= k; b *= k; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function setLS(ctx, v) { try { ctx.letterSpacing = v; } catch (e) {} }

  // a distinct stadium look per opponent
  const ENVS = {
    br82: { stand: "#3a5a2e", accent: "#fff2c0" }, ar86: { stand: "#1d3a6e", accent: "#ffe27a" },
    nl88: { stand: "#5a3410", accent: "#ff9d3f" }, en98: { stand: "#363b46", accent: "#cfd6e6" },
    br02: { stand: "#2e6a3a", accent: "#ffe27a" }, it94: { stand: "#243a6e", accent: "#9fd0ff" },
    jp98: { stand: "#2a3550", accent: "#ff9d9d" }, ng94: { stand: "#1f5a32", accent: "#eaeaea" },
  };

  /* ---------- static pitch = stadium scene + court (per-team look) ---------- */
  function buildPitch(team) {
    const env = (team && ENVS[team.id]) || { stand: "#2b3446", accent: "#ffffff" };
    const c = document.createElement("canvas"); c.width = CFG.W; c.height = CFG.H;
    const x = c.getContext("2d");
    const L = CFG.left, R = CFG.right, T = CFG.top, B = CFG.bottom, pw = CFG.pw, ph = CFG.ph;

    // stands (lighter toward the court)
    x.fillStyle = "#0b0e15"; x.fillRect(0, 0, CFG.W, CFG.H);
    const sg = x.createRadialGradient(CFG.midX, CFG.midY, ph * 0.5, CFG.midX, CFG.midY, CFG.W * 0.72);
    sg.addColorStop(0, env.stand); sg.addColorStop(1, "#0a0d14");
    x.fillStyle = sg; x.fillRect(0, 0, CFG.W, CFG.H);
    // tier lines
    x.strokeStyle = "rgba(0,0,0,0.25)"; x.lineWidth = 2;
    for (let r = 18; r < 80; r += 16) { x.strokeRect(L - r, T - r, pw + 2 * r, ph + 2 * r); }
    // crowd specks
    const cc = ["#d94f4f", "#e8c84a", "#4f8fd9", "#5fc06a", "#e0e0e0", "#c86bd0", "#e9913f", "#7bd0c0"];
    for (let i = 0; i < 2600; i++) {
      const px = Math.random() * CFG.W, py = Math.random() * CFG.H;
      if (px > L - 6 && px < R + 6 && py > T - 6 && py < B + 6) continue; // keep court area clean
      x.globalAlpha = 0.45 + Math.random() * 0.45; x.fillStyle = cc[(Math.random() * cc.length) | 0];
      x.fillRect(px, py, 2, 2);
    }
    x.globalAlpha = 1;
    // floodlight glows in the corners
    for (const fl of [[44, 40], [CFG.W - 44, 40], [44, CFG.H - 40], [CFG.W - 44, CFG.H - 40]]) {
      const g = x.createRadialGradient(fl[0], fl[1], 2, fl[0], fl[1], 170);
      g.addColorStop(0, "rgba(255,255,240,0.34)"); g.addColorStop(1, "rgba(255,255,240,0)");
      x.fillStyle = g; x.fillRect(0, 0, CFG.W, CFG.H);
    }
    // team-coloured wash over the stands so each stadium feels distinct
    x.globalAlpha = 0.07; x.fillStyle = env.accent; x.fillRect(0, 0, CFG.W, CFG.H); x.globalAlpha = 1;
    // spectators watching from the stands (Street-Hoop style)
    spectators(x);
    // ad hoardings ringing the court
    x.fillStyle = "#10141d"; x.fillRect(L - 15, T - 15, pw + 30, ph + 30);
    const ads = ["#e23b4d", "#ffd23a", "#1a57c8", "#16a64a", "#ff7a18", "#ffffff"];
    for (let i = 0; i * 56 < pw; i++) { x.fillStyle = ads[i % ads.length]; x.fillRect(L + i * 56, T - 14, 52, 7); x.fillStyle = ads[(i + 3) % ads.length]; x.fillRect(L + i * 56, B + 7, 52, 7); }
    for (let i = 0; i * 56 < ph; i++) { x.fillStyle = ads[(i + 1) % ads.length]; x.fillRect(L - 14, T + i * 56, 7, 52); x.fillStyle = ads[(i + 4) % ads.length]; x.fillRect(R + 7, T + i * 56, 7, 52); }

    // ---- court (textured turf) ----
    const g = x.createLinearGradient(0, T, 0, B); g.addColorStop(0, "#34965c"); g.addColorStop(1, "#236b3d");
    x.fillStyle = g; x.fillRect(L, T, pw, ph);
    // mown bands
    const bands = 9, bbh = ph / bands;
    for (let i = 0; i < bands; i++) { x.fillStyle = i % 2 ? "rgba(255,255,255,0.055)" : "rgba(0,35,0,0.06)"; x.fillRect(L, T + i * bbh, pw, bbh); }
    // soft turf patches (worn / lush)
    for (let i = 0; i < 8; i++) { const rx = L + Math.random() * pw, ry = T + Math.random() * ph, rr = 70 + Math.random() * 150; const rg = x.createRadialGradient(rx, ry, 4, rx, ry, rr); rg.addColorStop(0, Math.random() < 0.5 ? "rgba(210,255,180,0.05)" : "rgba(0,25,0,0.06)"); rg.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = rg; x.fillRect(L, T, pw, ph); }
    // individual grass blades
    const greens = ["#2c8a50", "#3aa05f", "#288046", "#46b06a", "#1f6d3c", "#3f9c5c"];
    x.globalAlpha = 0.5; for (let i = 0; i < 4600; i++) { x.fillStyle = greens[(Math.random() * greens.length) | 0]; x.fillRect(L + Math.random() * pw, T + Math.random() * ph, 1, 2); } x.globalAlpha = 1;

    x.strokeStyle = "rgba(255,255,255,0.82)"; x.lineWidth = 3;
    x.strokeRect(L + 5, T + 5, pw - 10, ph - 10);
    x.beginPath(); x.moveTo(CFG.midX, T + 5); x.lineTo(CFG.midX, B - 5); x.stroke();
    x.beginPath(); x.arc(CFG.midX, CFG.midY, 54, 0, Math.PI * 2); x.stroke();
    x.fillStyle = "rgba(255,255,255,0.85)"; x.beginPath(); x.arc(CFG.midX, CFG.midY, 4, 0, Math.PI * 2); x.fill();
    const boxW = 80, boxH = CFG.goalMouth + 64;
    [L, R].forEach((gx, side) => {
      const dir = side === 0 ? 1 : -1;
      x.strokeStyle = "rgba(255,255,255,0.82)";
      x.strokeRect(side === 0 ? L + 5 : R - 5 - boxW, CFG.midY - boxH / 2, boxW, boxH);
      const sbW = 38, sbH = CFG.goalMouth + 8;
      x.strokeRect(side === 0 ? L + 5 : R - 5 - sbW, CFG.midY - sbH / 2, sbW, sbH);
      x.fillStyle = "rgba(255,255,255,0.85)"; x.beginPath(); x.arc(gx + dir * 60, CFG.midY, 3, 0, Math.PI * 2); x.fill();
      drawGoal(x, gx, dir);
    });
    // bright rail around the court
    x.strokeStyle = "rgba(255,255,255,0.16)"; x.lineWidth = 4; x.strokeRect(L - 3, T - 3, pw + 6, ph + 6);
    const vg = x.createRadialGradient(CFG.midX, CFG.midY, ph * 0.35, CFG.midX, CFG.midY, CFG.W * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.34)");
    x.fillStyle = vg; x.fillRect(0, 0, CFG.W, CFG.H);
    pitch = c;
  }
  function spectators(x) {
    const skins = ["#f0c39b", "#a8703f", "#e6b487", "#5a3a23", "#eec39a", "#d8a878", "#c98a5a"];
    const tops = ["#e23b4d", "#1a57c8", "#ffd23a", "#16a64a", "#ff7a18", "#e0e0e0", "#c86bd0", "#2bb6a8", "#7d5fe0", "#ef6aa0"];
    const hairs = ["#1a1208", "#3a2a1a", "#5d3f24", "#7a572b", "#0a0a0a", "#8a6633", "#caa24f"];
    const pick = (a) => a[(Math.random() * a.length) | 0];
    function person(px, py, s) {
      x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(px - 4 * s, py + 5 * s, 9 * s, 2 * s);                 // shadow
      x.fillStyle = pick(tops); x.fillRect(px - 4 * s, py - s, 9 * s, 8 * s);                              // torso
      x.fillStyle = pick(skins); x.beginPath(); x.arc(px, py - 3 * s, 3 * s, 0, Math.PI * 2); x.fill();    // head
      x.fillStyle = pick(hairs); x.fillRect(px - 3 * s, py - 6 * s, 6 * s, 2.4 * s);                       // hair
    }
    // pack a stand rectangle with rows of people (rows further back are smaller + dimmer)
    function band(rx, ry, rw, rh) {
      const sx = 11, sy = 11;
      for (let yy = ry + 4; yy < ry + rh; yy += sy) {
        const front = rh > 0 ? (yy - ry) / rh : 1;
        const s = 0.82 + front * 0.32;
        x.globalAlpha = 0.72 + front * 0.28;
        for (let xx = rx + 4 + Math.random() * 5; xx < rx + rw - 2; xx += sx) person(xx, yy, s);
      }
      x.globalAlpha = 1;
    }
    band(2, 2, CFG.W - 4, CFG.top - 18);                                  // top stand
    band(2, CFG.bottom + 16, CFG.W - 4, CFG.H - CFG.bottom - 18);          // bottom stand
    band(2, CFG.top, CFG.left - 18, CFG.ph);                              // left stand
    band(CFG.right + 16, CFG.top, CFG.W - CFG.right - 18, CFG.ph);         // right stand
  }
  function drawGoal(x, gx, dir) {
    const depth = CFG.goalDepth, x0 = dir === 1 ? gx - depth : gx, w = depth, y0 = CFG.goalTop, h = CFG.goalMouth;
    x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(x0, y0, w, h);
    x.strokeStyle = "rgba(255,255,255,0.5)"; x.lineWidth = 1;
    for (let i = 0; i <= w; i += 5) { x.beginPath(); x.moveTo(x0 + i, y0); x.lineTo(x0 + i, y0 + h); x.stroke(); }
    for (let j = 0; j <= h; j += 5) { x.beginPath(); x.moveTo(x0, y0 + j); x.lineTo(x0 + w, y0 + j); x.stroke(); }
    x.strokeStyle = "#f4f7ff"; x.lineWidth = 4; x.beginPath(); x.moveTo(gx, y0 - 4); x.lineTo(gx, y0 + h + 4); x.stroke();
  }

  /* ---------- action world (camera) ---------- */
  function world(ctx, G) {
    if (!pitch) buildPitch();
    const cam = G.cam, z = cam.z, TY = CFG.tilt;
    const sh = G.shake || 0;
    const ox = sh ? (Math.random() * 2 - 1) * sh : 0, oy = sh ? (Math.random() * 2 - 1) * sh : 0;
    const CX = CFG.W / 2 + ox, CY = CFG.H / 2 + oy;
    // ground plane squashed vertically -> 3/4 tilt
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(z, z * TY); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(pitch, 0, 0);
    ctx.restore();
    // world -> screen; entities drawn UPRIGHT on the tilted ground, scaled by depth
    const proj = (wx, wy) => [CX + (wx - cam.x) * z, CY + (wy - cam.y) * z * TY];
    // depth scale tied to FIELD position (not camera) so players don't pulse in size
    const depthOf = (wy) => clamp(0.94 + ((wy - CFG.top) / CFG.ph) * 0.14, 0.94, 1.08);
    const all = G.players.slice().sort((a, b) => a.y - b.y);
    for (const p of all) {
      const s = proj(p.x, p.y);
      const tc = p.side === "home" ? KIDS.kit.shirt : G.away.kit.shirt;
      drawPlayer(ctx, p, p === G.controlled, tc, s[0], s[1], z * depthOf(p.y), proj);
    }
    const b = proj(G.ball.x, G.ball.y);
    drawBall(ctx, G.ball, b[0], b[1], z);
    for (const pt of G.particles) { const s = proj(pt.x, pt.y); ctx.globalAlpha = clamp(pt.life, 0, 1); ctx.fillStyle = pt.color; ctx.fillRect(s[0], s[1], pt.s, pt.s); }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(ctx, p, controlled, tc, sx, sy, sc, proj) {
    drawAura(ctx, p, proj, sx, sy);
    const set = Assets.sprite(p.artId);
    if (set) billboard(ctx, p, controlled, tc, set, sx, sy, sc);
    else procBillboard(ctx, p, controlled, tc, sx, sy, sc);
  }

  function chevron(ctx, x, y, color) {
    ctx.fillStyle = color; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // motion trail + "on fire" glow (trail points are world coords -> projected)
  function drawAura(ctx, p, proj, sx, sy) {
    if (p.trail && p.trail.length) {
      for (const t of p.trail) { const s = proj(t.x, t.y); ctx.globalAlpha = clamp(t.a, 0, 1) * 0.5; ctx.fillStyle = p.fire > 0 ? "#ff9b2e" : "#bfe3ff"; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (p.fire > 0) {
      ctx.globalAlpha = 0.45 + 0.3 * Math.sin(performance.now() / 90);
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 24);
      g.addColorStop(0, "rgba(255,160,40,0.85)"); g.addColorStop(1, "rgba(255,90,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 24, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  // thick outlined limb (a coloured line with a dark edge)
  function limbLine(ctx, x1, y1, x2, y2, thick, color) {
    ctx.lineCap = "round";
    ctx.strokeStyle = OUT; ctx.lineWidth = thick + 2.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // procedurally-drawn side-on footballer — same size/style as the PNG billboards,
  // so every player on the pitch looks consistent even without generated art
  function procBillboard(ctx, p, controlled, teamColor, sx, sy, sc) {
    const H = Assets.heightWorld() * (p.size || 1) * sc;
    const w = H * 0.46;
    const running = p.speedNorm > 0.16;
    const stride = running ? Math.sin(p.animPhase) : Math.sin(performance.now() / 380) * 0.22;
    const hop = p.celebrate > 0 ? Math.abs(Math.sin(p.celebrate * 12)) * H * 0.16 : 0;
    const dir = p.faceDir < 0 ? -1 : 1;
    const skin = p.skin || "#eebd95", hair = p.hair || "#3a2a1a";
    const shirt = p.kit.shirt, shorts = p.kit.shorts || "#222", boot = "#23252e";

    ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.62, w * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    if (controlled) { ctx.strokeStyle = teamColor; ctx.lineWidth = 3; ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.8, w * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }

    ctx.save();
    ctx.translate(sx, sy - hop);
    ctx.scale(dir, 1);

    const legLen = H * 0.36, bodyH = H * 0.36, headR = H * 0.15;
    const hipY = -legLen, shY = -(legLen + bodyH), headCY = shY - headR * 0.7;
    const sw = stride * H * 0.18;

    limbLine(ctx, 0, hipY, sw, 0, H * 0.12, skin);
    limbLine(ctx, 0, hipY, -sw, 0, H * 0.12, skin);
    oFill(ctx, () => { ctx.beginPath(); ctx.ellipse(sw + 2, 0, H * 0.1, H * 0.06, 0, 0, Math.PI * 2); }, boot, 2);
    oFill(ctx, () => { ctx.beginPath(); ctx.ellipse(-sw + 2, 0, H * 0.1, H * 0.06, 0, 0, Math.PI * 2); }, boot, 2);
    oFill(ctx, () => rrect(ctx, -w * 0.5, hipY - H * 0.04, w, legLen * 0.5, 3), shorts, 2.2);
    // back arm
    limbLine(ctx, w * 0.05, shY + H * 0.05, w * 0.05 - sw * 0.8, shY + bodyH * 0.7, H * 0.1, skin);
    // torso
    oFill(ctx, () => rrect(ctx, -w * 0.5, shY, w, bodyH + H * 0.04, w * 0.32), shirt, 2.6);
    ctx.fillStyle = shade(shirt, -0.16); ctx.fillRect(-w * 0.5 + 2, shY + bodyH * 0.55, w - 4, bodyH * 0.42);
    if (p.captain) { ctx.fillStyle = "#ffd23a"; rrect(ctx, w * 0.16, shY + H * 0.04, w * 0.24, H * 0.1, 2); ctx.fill(); }
    // front arm (swings opposite)
    limbLine(ctx, w * 0.05, shY + H * 0.05, w * 0.05 + sw * 0.8, shY + bodyH * 0.78, H * 0.1, skin);
    // head + hair + eye toward facing
    oFill(ctx, () => { ctx.beginPath(); ctx.arc(headR * 0.15, headCY, headR, 0, Math.PI * 2); }, skin, 2.2);
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, headCY - headR * 0.22, headR * 0.98, Math.PI * 0.15, Math.PI * 1.55); ctx.fill();
    if (p.keeper) { ctx.fillStyle = "#eef1f6"; ctx.beginPath(); ctx.arc(w * 0.05 + sw * 0.8, shY + bodyH * 0.78, H * 0.07, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#1a1320"; ctx.beginPath(); ctx.arc(headR * 0.62, headCY - headR * 0.05, headR * 0.16, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    if (controlled) chevron(ctx, sx, sy - H - 8 - hop + Math.sin(performance.now() / 200) * 2, teamColor);
  }

  /* ---------- billboard sprite (side-view PNG, used when art is loaded) ---------- */
  function billboard(ctx, p, controlled, teamColor, set, sx, sy, sc) {
    const t = performance.now() / 1000 + (p.animPhase || 0) * 0.05;
    let anim = "idle";
    if (p.kickCd > 0.12 && set.has("kick")) anim = "kick";
    else if (p.speedNorm > 0.16 && set.has("run")) anim = "run";
    const fr = set.frame(anim, t);
    if (!fr) return;
    const Hs = Assets.heightWorld() * (p.size || 1) * sc;
    const drawScale = Hs / fr.fh, dw = fr.fw * drawScale, dh = fr.fh * drawScale;
    const hop = p.celebrate > 0 ? Math.abs(Math.sin(p.celebrate * 12)) * Hs * 0.16 : 0;

    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath(); ctx.ellipse(sx, sy, dw * 0.34, dw * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    if (controlled) {
      ctx.strokeStyle = teamColor; ctx.lineWidth = 3; ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.ellipse(sx, sy, dw * 0.42, dw * 0.19, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const faceLeft = p.faceDir < 0;
    ctx.save();
    ctx.translate(sx, sy - hop);
    if (faceLeft) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -dw / 2, -dh + 3, dw, dh);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
    if (controlled) chevron(ctx, sx, sy - dh - 8 - hop + Math.sin(performance.now() / 200) * 2, teamColor);
  }

  /* ---------- ball (bx,by = projected ground position; z = camera zoom) ---------- */
  function drawBall(ctx, b, bx, by, z) {
    const r = CFG.ballRadius * 1.2 * z, h = b.z || 0, cy = by - h * z * 0.6, shS = 1 + h / 90;
    ctx.fillStyle = `rgba(0,0,0,${clamp(0.32 - h / 500, 0.05, 0.32)})`;
    ctx.beginPath(); ctx.ellipse(bx, by + 2, r * 1.05 * shS, r * 0.55 * shS, 0, 0, Math.PI * 2); ctx.fill();
    oFill(ctx, () => { ctx.beginPath(); ctx.arc(bx, cy, r, 0, Math.PI * 2); }, "#fbfbf6", 2);
    const g = ctx.createRadialGradient(bx - r * 0.35, cy - r * 0.4, r * 0.2, bx, cy, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#cfd4de"); ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, cy, r - 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1c2230";
    for (let k = 0; k < 3; k++) { const a = (b.spin || 0) + k * 2.094; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.22, 0, Math.PI * 2); ctx.fill(); }
  }

  /* ---------- HUD ---------- */
  function hud(ctx, G) {
    const w = 380, h = 46, x = (CFG.W - w) / 2, y = 8;
    ctx.fillStyle = "rgba(8,11,18,0.85)"; rrect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = KIDS.kit.shirt; rrect(ctx, x + 10, y + 11, 24, 24, 4); ctx.fill();
    ctx.fillStyle = G.away.kit.shirt; rrect(ctx, x + w - 34, y + 11, 24, 24, 4); ctx.fill();
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = arc(11); ctx.fillText("KORNA", x + 42, y + h / 2);
    ctx.textAlign = "right"; ctx.fillText(G.away.name.slice(0, 8).toUpperCase(), x + w - 42, y + h / 2);
    ctx.textAlign = "center"; ctx.font = arc(20); ctx.fillStyle = "#ffe85a"; ctx.fillText(`${G.score.home}-${G.score.away}`, CFG.W / 2, y + h / 2 + 1);
    const t = Math.max(0, Math.ceil(G.clock)), ss = String(t % 60).padStart(2, "0");
    ctx.font = arc(11); ctx.fillStyle = t <= 15 ? "#ff6a6a" : "#bfe";
    ctx.fillText(`${Math.floor(t / 60)}:${ss}`, CFG.W / 2, y + h + 12);

    if (G.shootCharge > 0 && G.controlled && G.ball.owner === G.controlled) {
      const pw = 130, ph = 9, px = (CFG.W - pw) / 2, py = CFG.H - 40;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; rrect(ctx, px, py, pw, ph, 4); ctx.fill();
      const frac = clamp((G.shootCharge - CFG.shootMin) / (CFG.shootMax - CFG.shootMin), 0, 1);
      ctx.fillStyle = `hsl(${lerp(60, 0, frac)},90%,55%)`; rrect(ctx, px + 1, py + 1, (pw - 2) * frac, ph - 2, 3); ctx.fill();
    }
    // turbo / on-fire meter for the controlled kid
    const cp = G.controlled;
    if (cp) {
      const bw = 116, bh = 9, bx = 18, by = CFG.H - 42;
      ctx.fillStyle = "rgba(0,0,0,0.55)"; rrect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 4); ctx.fill();
      ctx.fillStyle = cp.fire > 0 ? "#ff7a18" : "#36d6ff"; rrect(ctx, bx, by, bw * clamp(cp.turbo, 0, 1), bh, 3); ctx.fill();
      ctx.fillStyle = cp.fire > 0 ? "#ffd23a" : "#9fe3ff"; ctx.font = arc(8); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(cp.fire > 0 ? "ON FIRE!" : "TURBO", bx, by - 5);
    }
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = sans(12); ctx.textAlign = "center";
    ctx.fillText("MOVE arrows   SPRINT e   SHOOT d (hold)   PASS s   LOB/SLIDE a   SWITCH space", CFG.W / 2, CFG.H - 12);
    if (G.banner > 0) banner(ctx, G.bannerText);
  }

  function banner(ctx, text) {
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const x = CFG.midX, y = CFG.midY - 24;
    setLS(ctx, "4px"); ctx.font = arc(58);
    ctx.lineWidth = 10; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeText(text, x, y);
    const g = ctx.createLinearGradient(0, y - 40, 0, y + 40); g.addColorStop(0, "#fff4b0"); g.addColorStop(1, "#ff9f1c");
    ctx.fillStyle = g; ctx.fillText(text, x, y); setLS(ctx, "0px"); ctx.restore();
  }

  /* ---------- CRT overlay ---------- */
  function crt(ctx) {
    ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = "#000";
    for (let y = 0; y < CFG.H; y += 3) ctx.fillRect(0, y, CFG.W, 1);
    ctx.restore();
    const vg = ctx.createRadialGradient(CFG.midX, CFG.midY, CFG.H * 0.5, CFG.midX, CFG.midY, CFG.W * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, CFG.W, CFG.H);
  }

  /* ---------- menu background ---------- */
  const bgBall = { x: 300, y: 220, vx: 150, vy: 110 }; let bgLast = 0;
  function bg(ctx, t) {
    if (!pitch) buildPitch();
    ctx.drawImage(pitch, 0, 0);
    ctx.fillStyle = "rgba(7,9,15,0.62)"; ctx.fillRect(0, 0, CFG.W, CFG.H);
    const dt = Math.min(0.05, t - bgLast || 0.016); bgLast = t;
    bgBall.x += bgBall.vx * dt; bgBall.y += bgBall.vy * dt;
    if (bgBall.x < CFG.left + 20 || bgBall.x > CFG.right - 20) bgBall.vx *= -1;
    if (bgBall.y < CFG.top + 20 || bgBall.y > CFG.bottom - 20) bgBall.vy *= -1;
    bgBall.x = clamp(bgBall.x, CFG.left + 20, CFG.right - 20); bgBall.y = clamp(bgBall.y, CFG.top + 20, CFG.bottom - 20);
    drawBall(ctx, { z: 0, spin: t * 3 }, bgBall.x, bgBall.y, 1);
  }

  const KID_IDS = ["Vanja", "Fiči", "Bobo", "Marko", "Jan", "Cacko"];

  /* ---------- title ---------- */
  function title(ctx, t) {
    bg(ctx, t);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // KORNA roster across the top
    const pw = 78, ph = Math.round(pw / Portrait.ratio()), tot = pw * 6 + 5 * 12, ox = (CFG.W - tot) / 2;
    KID_IDS.forEach((id, i) => { const px = ox + i * (pw + 12), py = 92 + Math.sin(t * 2 + i) * 4; card(ctx, px, py, pw, ph, id, KIDS.kit.shirt, false); });

    const y = 300 + Math.sin(t * 2) * 4;
    setLS(ctx, "8px"); ctx.font = arc(76);
    ctx.lineWidth = 14; ctx.strokeStyle = "#0b0e16"; ctx.strokeText("KORNA", CFG.midX, y);
    const g = ctx.createLinearGradient(0, y - 50, 0, y + 50); g.addColorStop(0, "#ffe85a"); g.addColorStop(0.5, "#ff9f1c"); g.addColorStop(1, "#e23b4d");
    ctx.fillStyle = g; ctx.fillText("KORNA", CFG.midX, y); setLS(ctx, "0px");
    ctx.font = arc(15); ctx.fillStyle = "#bfe"; ctx.fillText("STREET CAGE FOOTBALL", CFG.midX, y + 58);

    const a = 0.5 + Math.sin(t * 4) * 0.5; ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.font = arc(16);
    ctx.fillText("PRESS ENTER", CFG.midX, CFG.H - 86);
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = sans(14); ctx.fillText("Six kids take on the legends. Be the underdog.", CFG.midX, CFG.H - 52);
  }

  /* ---------- a framed portrait card ---------- */
  function card(ctx, x, y, w, h, id, accent, big) {
    ctx.save();
    ctx.fillStyle = "#0e1320"; rrect(ctx, x - 3, y - 3, w + 6, h + 6, 6); ctx.fill();
    ctx.save(); rrect(ctx, x, y, w, h, 4); ctx.clip();
    const face = Assets.face(id);
    if (face) {
      // team-tinted backdrop behind the transparent bust
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, shade(accent, 0.0)); g.addColorStop(0.6, shade(accent, -0.5)); g.addColorStop(1, "#0b0e16");
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.08; ctx.fillStyle = "#fff";
      for (let i = -h; i < w; i += 14) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + 6, y); ctx.lineTo(x + i + 6 + h, y + h); ctx.lineTo(x + i + h, y + h); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
      // draw bust preserving its square aspect, anchored to the top
      const s = w; ctx.imageSmoothingEnabled = false; ctx.drawImage(face, x, y, s, s); ctx.imageSmoothingEnabled = true;
    } else {
      Portrait.draw(ctx, id, x, y, w, h);
    }
    ctx.restore();
    ctx.strokeStyle = accent; ctx.lineWidth = big ? 3 : 2; rrect(ctx, x, y, w, h, 4); ctx.stroke();
    ctx.restore();
  }

  /* ---------- select ---------- */
  let cards = [];
  function select(ctx, t, sel) {
    bg(ctx, t);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    setLS(ctx, "3px"); ctx.font = arc(24); ctx.fillStyle = "#ffe85a"; ctx.fillText("CHOOSE YOUR RIVALS", CFG.midX, 34); setLS(ctx, "0px");

    // KORNA squad strip
    ctx.font = sans(12, true); ctx.fillStyle = "#9fb0c8"; ctx.textAlign = "left";
    ctx.fillText("YOUR SQUAD", 28, 64);
    const sp = 46, sh = Math.round(sp / Portrait.ratio());
    KID_IDS.forEach((id, i) => card(ctx, 150 + i * (sp + 8), 50, sp, sh, id, KIDS.kit.shirt, false));

    cards = [];
    const cols = 4, gap = 16, cw = 224, ch = 188, ox = (CFG.W - (cols * cw + (cols - 1) * gap)) / 2, oy = 130;
    TEAMS.forEach((tm, i) => {
      const x = ox + (i % cols) * (cw + gap), y = oy + Math.floor(i / cols) * (ch + gap + 8);
      cards.push({ x, y, w: cw, h: ch, index: i });
      teamCard(ctx, tm, x, y, cw, ch, i === sel);
    });
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = sans(13); ctx.textAlign = "center";
    ctx.fillText("◀ ▶ choose  ·  ENTER / click to continue  ·  ESC back", CFG.midX, CFG.H - 16);
  }
  function teamCard(ctx, tm, x, y, w, h, on) {
    ctx.save();
    if (on) { ctx.shadowColor = tm.kit.shirt; ctx.shadowBlur = 24; }
    ctx.fillStyle = on ? "#1b2233" : "#121826"; rrect(ctx, x, y, w, h, 10); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = on ? tm.kit.shirt : "rgba(255,255,255,0.10)"; ctx.lineWidth = on ? 3 : 1.5; rrect(ctx, x, y, w, h, 10); ctx.stroke();
    // portrait
    const pw = 96, ph = Math.round(pw / Portrait.ratio()), pxp = x + 14, pyp = y + 12;
    card(ctx, pxp, pyp, pw, ph, tm.id, tm.kit.shirt, true);
    // info
    const ix = x + pw + 28;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = "30px serif"; ctx.fillText(tm.flag, ix, y + 36);
    ctx.fillStyle = "#fff"; ctx.font = arc(13); ctx.fillText(tm.name.toUpperCase().slice(0, 9), ix, y + 60);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = sans(12); wrap(ctx, tm.era, ix, y + 78, w - pw - 40, 14);
    ctx.fillStyle = "#ffd23a"; ctx.font = sans(13, true); ctx.fillText("★ " + tm.star, ix, y + 116);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = sans(11); ctx.fillText("DIFFICULTY", ix, y + 150);
    for (let k = 0; k < 5; k++) { ctx.fillStyle = k < tm.diff ? "#ff5d6c" : "rgba(255,255,255,0.16)"; ctx.beginPath(); ctx.arc(ix + 78 + k * 14, y + 146, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = sans(12, true); wrap(ctx, tm.blurb, ix, y + 170, w - pw - 40, 14);
    ctx.restore();
  }

  /* ---------- VS ---------- */
  function vs(ctx, t, G) {
    bg(ctx, t);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // left: KORNA
    const capW = 150, capH = Math.round(capW / Portrait.ratio());
    card(ctx, 70, 150, capW, capH, "Vanja", KIDS.kit.shirt, true);
    const sm = 64, smh = Math.round(sm / Portrait.ratio());
    ["Fiči", "Bobo", "Marko", "Jan", "Cacko"].forEach((id, i) => card(ctx, 60 + i * (sm + 6), 360, sm, smh, id, KIDS.kit.shirt, false));
    ctx.font = arc(22); ctx.fillStyle = "#fff"; ctx.fillText("KORNA", 70 + capW / 2, 130);
    ctx.font = sans(13); ctx.fillStyle = "#9fb0c8"; ctx.fillText("the kids", 70 + capW / 2, 470);

    // right: legends
    const team = G.away;
    const bw = 180, bh = Math.round(bw / Portrait.ratio());
    card(ctx, CFG.W - 70 - bw, 150, bw, bh, team.id, team.kit.shirt, true);
    ctx.font = arc(20); ctx.fillStyle = "#fff"; ctx.fillText(team.name.toUpperCase().slice(0, 11), CFG.W - 70 - bw / 2, 130);
    ctx.font = sans(14); ctx.fillStyle = "#9fb0c8"; ctx.fillText(team.era, CFG.W - 70 - bw / 2, 408);
    ctx.font = sans(15, true); ctx.fillStyle = "#ffd23a"; ctx.fillText("★ " + team.star, CFG.W - 70 - bw / 2, 434);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = sans(12); ctx.fillText("team of 8", CFG.W - 70 - bw / 2, 470);

    // VS
    const s = 1 + Math.sin(t * 6) * 0.04;
    ctx.save(); ctx.translate(CFG.midX, 300); ctx.scale(s, s);
    setLS(ctx, "2px"); ctx.font = arc(64);
    ctx.lineWidth = 12; ctx.strokeStyle = "#0b0e16"; ctx.strokeText("VS", 0, 0);
    ctx.fillStyle = "#ff3b54"; ctx.fillText("VS", 0, 0); setLS(ctx, "0px"); ctx.restore();

    const a = 0.5 + Math.sin(t * 4) * 0.5; ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.font = arc(15);
    ctx.fillText("PRESS ENTER TO KICK OFF", CFG.midX, CFG.H - 40);
  }

  /* ---------- result ---------- */
  let buttons = [];
  function result(ctx, t, G) {
    bg(ctx, t);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const win = G.score.home > G.score.away, draw = G.score.home === G.score.away;
    setLS(ctx, "3px"); ctx.font = arc(18); ctx.fillStyle = "#9fb0c8"; ctx.fillText("FULL TIME", CFG.midX, 70); setLS(ctx, "0px");
    // portraits flanking the score
    card(ctx, CFG.midX - 250, 120, 120, Math.round(120 / Portrait.ratio()), "Vanja", KIDS.kit.shirt, true);
    card(ctx, CFG.midX + 130, 120, 120, Math.round(120 / Portrait.ratio()), G.away.id, G.away.kit.shirt, true);
    ctx.font = arc(64); ctx.fillStyle = "#fff"; ctx.fillText(`${G.score.home}-${G.score.away}`, CFG.midX, 190);
    ctx.font = sans(15); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillText(`KORNA  vs  ${G.away.name} · ${G.away.era}`, CFG.midX, 260);
    let msg, col; if (win) { msg = "KORNA WIN!"; col = "#7CFFB0"; } else if (draw) { msg = "HEROIC DRAW"; col = "#ffe27a"; } else { msg = "LEGENDS WIN"; col = "#ff8a8a"; }
    setLS(ctx, "2px"); ctx.font = arc(34); ctx.fillStyle = col; ctx.fillText(msg, CFG.midX, 320); setLS(ctx, "0px");
    if (win) ctx.fillText("🎉", CFG.midX, 360);

    buttons = [];
    button(ctx, "REMATCH", CFG.midX - 180, 392, 170, 52, "rematch", true);
    button(ctx, "CHANGE RIVALS", CFG.midX + 20, 392, 220, 52, "change", false);
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = sans(13); ctx.fillText("ENTER rematch · ESC change rivals", CFG.midX, 470);
  }
  function button(ctx, label, x, y, w, h, id, primary) {
    buttons.push({ x, y, w, h, id });
    const hover = Input.pointer.x > x && Input.pointer.x < x + w && Input.pointer.y > y && Input.pointer.y < y + h;
    ctx.fillStyle = primary ? (hover ? "#ffd23a" : "#ffbf17") : (hover ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)");
    rrect(ctx, x, y, w, h, 8); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = primary ? "#1a1205" : "#fff"; ctx.font = arc(12); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  }

  function wrap(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(" "); let line = "", yy = y;
    for (const wd of words) { const tst = line + wd + " "; if (ctx.measureText(tst).width > maxW && line) { ctx.fillText(line.trim(), x, yy); line = wd + " "; yy += lh; } else line = tst; }
    ctx.fillText(line.trim(), x, yy);
  }

  return {
    world, hud, title, select, vs, result, crt, buildPitch,
    getCards: () => cards, getButtons: () => buttons,
  };
})();
