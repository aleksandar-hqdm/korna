/* =========================================================================
   KORNA — pixel-art portrait engine (8bit-football.com inspired)
   Outlined, cell-shaded chibi busts. Kids read young & cute; legends carry
   their signature look. Each portrait is built once into a cached canvas
   and drawn nearest-neighbour so it stays crisp at any size.
   ========================================================================= */
"use strict";

const Portrait = (() => {
  const BW = 84, BH = 100;
  const cache = {};
  const OUT = "#171019";              // warm near-black outline
  const cxh = 42;                     // horizontal centre

  /* ---- colour helpers ---- */
  function shade(hex, amt) {
    let r, g, b;
    if (hex[0] === "#") { const n = parseInt(hex.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
    else { const m = hex.match(/\d+/g); r = +m[0]; g = +m[1]; b = +m[2]; }
    if (amt < 0) { const k = 1 + amt; r *= k; g *= k; b *= k; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  const ramp = (c) => ({ base: c, sh: shade(c, -0.22), sh2: shade(c, -0.42), li: shade(c, 0.18), li2: shade(c, 0.36) });

  /* ---- path helpers ---- */
  function ell(x, cx, cy, rx, ry) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  // fill a path with a chunky outline: stroke thick (dark) then fill on top
  function blob(x, pathFn, color, lw = 2.6) {
    x.save(); x.lineJoin = "round"; x.lineCap = "round"; x.strokeStyle = OUT; x.lineWidth = lw;
    pathFn(); x.stroke(); x.fillStyle = color; x.fill(); x.restore();
  }
  function clipIn(x, pathFn, draw) { x.save(); pathFn(); x.clip(); draw(); x.restore(); }

  /* =======================================================================
     build
     ======================================================================= */
  function build(spec) {
    const c = document.createElement("canvas");
    c.width = BW; c.height = BH;
    const x = c.getContext("2d");

    backdrop(x, spec);
    body(x, spec);
    neck(x, spec);

    const M = metrics(spec);
    if (spec.behind) hairBehind(x, spec, M);
    ears(x, spec, M);
    head(x, spec, M);
    if (spec.style !== "shaved" && spec.style !== "bald") hairBack(x, spec, M);
    face(x, spec, M);
    hairFront(x, spec, M);
    if (spec.headband) headband(x, spec, M);
    if (spec.beard) beard(x, spec, M);
    if (spec.captain) armband(x);

    scanlines(x);
    cache[spec.__id] = c;
    return c;
  }

  function metrics(spec) {
    const k = spec.kid;
    return {
      cy: spec.faceCy || (k ? 41 : 38),
      rx: spec.faceW || (k ? 25 : 22),
      ry: spec.faceH || (k ? 26 : 25),
      eyeY: 0, // set in face()
    };
  }

  /* ---- backdrop ---- */
  function backdrop(x, spec) {
    const j = spec.jersey || "#444";
    const g = x.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, shade(j, 0.05));
    g.addColorStop(0.5, shade(j, -0.32));
    g.addColorStop(1, "#0b0e16");
    x.fillStyle = g; x.fillRect(0, 0, BW, BH);
    // halo behind the head
    const rg = x.createRadialGradient(cxh, 40, 4, cxh, 40, 46);
    rg.addColorStop(0, shade(j, 0.28)); rg.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = rg; x.globalAlpha = 0.55; x.fillRect(0, 0, BW, BH); x.globalAlpha = 1;
    // diagonal speed stripes
    x.save(); x.globalAlpha = 0.07; x.fillStyle = "#fff";
    for (let i = -BH; i < BW; i += 14) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 6, 0); x.lineTo(i + 6 + BH, BH); x.lineTo(i + BH, BH); x.closePath(); x.fill(); }
    x.restore();
  }

  /* ---- kit / shoulders ---- */
  function body(x, spec) {
    const j = spec.jersey || "#444", j2 = spec.jersey2 || "#fff", r = ramp(j);
    const top = 74, bw = spec.broad ? 34 : 30;
    const path = () => { x.beginPath(); x.moveTo(cxh - 12, top); x.quadraticCurveTo(cxh - bw, top + 4, cxh - bw, BH); x.lineTo(cxh + bw, BH); x.quadraticCurveTo(cxh + bw, top + 4, cxh + 12, top); x.closePath(); };
    blob(x, path, r.base, 2.6);
    clipIn(x, path, () => {
      x.fillStyle = r.sh; x.fillRect(cxh + 2, top, bw, BH);                 // right shade
      x.fillStyle = r.li; x.fillRect(cxh - bw, top, 7, BH);                 // left light
      if (spec.stripes) { x.fillStyle = j2; for (let s = 0; s < 3; s++) { x.fillRect(cxh - bw + 4 + s * 4, top + 6, 2, 26); x.fillRect(cxh + bw - 8 - s * 4, top + 6, 2, 26); } }
    });
    // collar
    x.fillStyle = j2; x.beginPath(); x.moveTo(cxh - 11, top + 1); x.lineTo(cxh, top + 11); x.lineTo(cxh + 11, top + 1); x.lineTo(cxh + 7, top - 1); x.lineTo(cxh, top + 6); x.lineTo(cxh - 7, top - 1); x.closePath(); x.fill();
  }

  function neck(x, spec) {
    const r = ramp(spec.skin);
    x.fillStyle = r.base; x.fillRect(cxh - 7, 64, 14, 14);
    x.fillStyle = r.sh; x.fillRect(cxh - 7, 64, 14, 4);    // shadow under chin
    x.fillStyle = r.sh; x.fillRect(cxh + 2, 64, 5, 14);
  }

  /* ---- ears ---- */
  function ears(x, spec, M) {
    if (spec.style === "afro" || spec.bigHair) return;
    const r = ramp(spec.skin);
    [-1, 1].forEach((s) => { blob(x, () => ell(x, cxh + s * (M.rx - 1), M.cy + 3, 4.5, 6), r.base, 2.2); });
    [-1, 1].forEach((s) => { ell(x, cxh + s * (M.rx - 1), M.cy + 4, 2, 3); x.fillStyle = r.sh; x.fill(); });
  }

  /* ---- head ---- */
  function head(x, spec, M) {
    const r = ramp(spec.skin);
    const chinY = spec.chin === "pointy" ? 0.18 : spec.chin === "round" ? -0.04 : 0.06;
    const path = () => {
      x.beginPath();
      x.ellipse(cxh, M.cy, M.rx, M.ry, 0, Math.PI, 0); // top half
      // jaw / chin
      x.bezierCurveTo(cxh + M.rx, M.cy + M.ry * (0.5 + chinY), cxh + M.rx * 0.4, M.cy + M.ry, cxh, M.cy + M.ry);
      x.bezierCurveTo(cxh - M.rx * 0.4, M.cy + M.ry, cxh - M.rx, M.cy + M.ry * (0.5 + chinY), cxh - M.rx, M.cy);
      x.closePath();
    };
    blob(x, path, r.base, 2.6);
    clipIn(x, path, () => {
      // core shadow lower-right
      x.fillStyle = r.sh; ell(x, cxh + M.rx * 0.42, M.cy + M.ry * 0.34, M.rx * 0.92, M.ry * 0.86); x.fill();
      x.fillStyle = r.base; ell(x, cxh - M.rx * 0.18, M.cy, M.rx * 0.92, M.ry * 0.92); x.fill();
      // highlight upper-left
      x.fillStyle = r.li; ell(x, cxh - M.rx * 0.4, M.cy - M.ry * 0.42, M.rx * 0.5, M.ry * 0.42); x.fill();
      // chin shade
      x.fillStyle = r.sh; ell(x, cxh, M.cy + M.ry * 0.86, M.rx * 0.42, M.ry * 0.16); x.fill();
      // kid blush
      if (spec.kid) { x.globalAlpha = 0.4; x.fillStyle = "#ec6f63"; ell(x, cxh - M.rx * 0.55, M.cy + M.ry * 0.34, 4.5, 3); x.fill(); ell(x, cxh + M.rx * 0.55, M.cy + M.ry * 0.34, 4.5, 3); x.fill(); x.globalAlpha = 1; }
      // freckles
      if (spec.freckles) { x.fillStyle = shade(spec.skin, -0.3); for (let i = 0; i < 6; i++) x.fillRect(cxh - 9 + (i % 3) * 3 + (i > 2 ? 8 : -8), M.cy + 7 + (i % 2) * 2, 1.4, 1.4); }
    });
  }

  /* ---- face features ---- */
  function face(x, spec, M) {
    const k = spec.kid;
    const eyeY = M.cy + (k ? 4 : 2);
    M.eyeY = eyeY;
    const dx = k ? 9.5 : 8.5;
    const wr = k ? 5.2 : 4.0;      // eye white radius
    const ir = k ? 3.6 : 2.6;      // iris radius
    // brows
    x.strokeStyle = shade(spec.hair || "#3a2a1a", k ? 0.05 : -0.12);
    x.lineWidth = k ? 1.8 : 2.2; x.lineCap = "round";
    [-1, 1].forEach((s) => { x.beginPath(); x.moveTo(cxh + s * dx - 4, eyeY - wr - 2); x.quadraticCurveTo(cxh + s * dx, eyeY - wr - (k ? 4 : 3), cxh + s * dx + 4, eyeY - wr - 2); x.stroke(); });
    // eyes
    [-1, 1].forEach((s) => {
      const ex = cxh + s * dx;
      blob(x, () => ell(x, ex, eyeY, wr, wr + (k ? 1 : 0.5)), "#f6f6f0", 1.8);   // white w/ outline
      x.fillStyle = spec.eyes || "#3a2a1a"; ell(x, ex + (k ? 0 : 0), eyeY + 0.6, ir, ir); x.fill();
      x.fillStyle = "#120f16"; ell(x, ex, eyeY + 1, ir * 0.55, ir * 0.62); x.fill();
      x.fillStyle = "#fff"; ell(x, ex - 1.2, eyeY - 1.2, 1.4, 1.4); x.fill();      // catchlight
    });
    // nose
    x.fillStyle = shade(spec.skin, -0.2);
    if (k) { ell(x, cxh, eyeY + (wr + 4), 1.6, 1.6); x.fill(); }
    else { x.fillRect(cxh - 1, eyeY + 3, 2.4, 5); x.fillRect(cxh - 2.5, eyeY + 7, 5, 1.6); }
    // mouth
    mouth(x, spec, eyeY + (k ? wr + 9 : 13));
  }

  function mouth(x, spec, my) {
    const m = spec.mouth || "neutral";
    const lip = "#933b30", dark = "#2a120e", teeth = "#fbfbf4";
    x.lineCap = "round"; x.lineJoin = "round";
    if (m === "megagrin") {
      blob(x, () => { x.beginPath(); x.moveTo(cxh - 9, my - 2); x.quadraticCurveTo(cxh, my + 7, cxh + 9, my - 2); x.quadraticCurveTo(cxh, my + 1, cxh - 9, my - 2); x.closePath(); }, dark, 2.2);
      x.fillStyle = teeth; rr(x, cxh - 7, my - 1, 14, 4, 1.5); x.fill();
      if (spec.toothGap) { x.fillStyle = dark; x.fillRect(cxh - 1, my - 1, 2, 4); }
    } else if (m === "grin") {
      blob(x, () => { x.beginPath(); x.moveTo(cxh - 7, my - 1); x.quadraticCurveTo(cxh, my + 5, cxh + 7, my - 1); x.quadraticCurveTo(cxh, my + 2, cxh - 7, my - 1); x.closePath(); }, dark, 2);
      x.fillStyle = teeth; rr(x, cxh - 5.5, my - 0.5, 11, 2.6, 1); x.fill();
    } else if (m === "smile" || m === "happy") {
      x.strokeStyle = lip; x.lineWidth = 2.2; x.beginPath(); x.moveTo(cxh - 6, my - 1); x.quadraticCurveTo(cxh, my + 4, cxh + 6, my - 1); x.stroke();
    } else if (m === "shy") {
      x.strokeStyle = lip; x.lineWidth = 2; x.beginPath(); x.moveTo(cxh - 3, my + 1); x.quadraticCurveTo(cxh + 1, my + 3, cxh + 4, my + 1); x.stroke();
    } else if (m === "smirk") {
      x.strokeStyle = lip; x.lineWidth = 2.2; x.beginPath(); x.moveTo(cxh - 5, my + 1); x.quadraticCurveTo(cxh + 2, my + 2, cxh + 6, my - 2); x.stroke();
    } else if (m === "determined") {
      x.strokeStyle = lip; x.lineWidth = 2.4; x.beginPath(); x.moveTo(cxh - 6, my); x.lineTo(cxh + 6, my); x.stroke();
    } else {
      x.strokeStyle = lip; x.lineWidth = 2; x.beginPath(); x.moveTo(cxh - 5, my); x.quadraticCurveTo(cxh, my + 2, cxh + 5, my); x.stroke();
    }
  }

  /* ---- hair: behind / back / front layers ---- */
  function hairBehind(x, spec, M) {
    const r = ramp(spec.hair);
    if (spec.style === "ponytail") {           // Baggio's divine ponytail
      blob(x, () => { x.beginPath(); x.moveTo(cxh + M.rx - 3, M.cy - 4); x.quadraticCurveTo(cxh + M.rx + 12, M.cy + 6, cxh + M.rx + 6, M.cy + 30); x.quadraticCurveTo(cxh + M.rx + 1, M.cy + 18, cxh + M.rx - 4, M.cy + 6); x.closePath(); }, r.base, 2.4);
    }
    if (spec.style === "ponytailCurly") {      // Ronaldinho puff at back
      blob(x, () => ell(x, cxh + M.rx + 2, M.cy - 2, 9, 12), r.base, 2.4);
      x.fillStyle = r.sh; ell(x, cxh + M.rx + 4, M.cy, 5, 7); x.fill();
    }
  }

  function hairBack(x, spec, M) {
    // hair mass behind/around the head (drawn before the face fringe)
    const r = ramp(spec.hair), st = spec.style;
    const top = M.cy - M.ry, line = M.cy - M.ry * 0.18;
    if (st === "afro") {
      spec.bigHair = true;
      blob(x, () => ell(x, cxh, M.cy - M.ry * 0.42, M.rx + 9, M.ry * 1.02), r.base, 2.8);
      clipIn(x, () => ell(x, cxh, M.cy - M.ry * 0.42, M.rx + 9, M.ry * 1.02), () => {
        x.fillStyle = r.sh; ell(x, cxh + 6, M.cy - M.ry * 0.2, M.rx, M.ry); x.fill();
        x.fillStyle = r.li; for (let i = 0; i < 7; i++) { ell(x, cxh - 14 + i * 5, top - 2 + (i % 2) * 4, 3, 3); x.fill(); }
      });
      return;
    }
    if (st === "mullet") {                     // curly top + side curtains + neck length
      blob(x, () => { x.beginPath(); x.moveTo(cxh - M.rx - 2, M.cy - 2); x.quadraticCurveTo(cxh - M.rx - 5, M.cy + 24, cxh - M.rx + 3, M.cy + 26); x.lineTo(cxh - M.rx + 6, M.cy); x.closePath(); }, r.base, 2.4);
      blob(x, () => { x.beginPath(); x.moveTo(cxh + M.rx + 2, M.cy - 2); x.quadraticCurveTo(cxh + M.rx + 5, M.cy + 24, cxh + M.rx - 3, M.cy + 26); x.lineTo(cxh + M.rx - 6, M.cy); x.closePath(); }, r.base, 2.4);
      blob(x, () => ell(x, cxh, top + 6, M.rx + 4, M.ry * 0.7), r.base, 2.6);
      clipIn(x, () => ell(x, cxh, top + 6, M.rx + 4, M.ry * 0.7), () => { x.fillStyle = r.li; for (let i = 0; i < 6; i++) { ell(x, cxh - 14 + i * 6, top + 2, 3, 3); x.fill(); } });
      return;
    }
    if (st === "spiky") {                       // Nakata dyed spikes
      const root = ramp(spec.hairRoot || shade(spec.hair, -0.45));
      blob(x, () => ell(x, cxh, top + 8, M.rx + 2, M.ry * 0.62), root.base, 2.4);
      // spikes
      x.fillStyle = r.base;
      for (let i = -M.rx; i <= M.rx; i += 5) {
        x.save(); x.strokeStyle = OUT; x.lineWidth = 2; x.lineJoin = "round";
        x.beginPath(); x.moveTo(cxh + i - 3, line - 4); x.lineTo(cxh + i, top - 9); x.lineTo(cxh + i + 3, line - 4); x.closePath(); x.stroke(); x.fill();
        x.restore();
      }
      x.fillStyle = r.li; for (let i = -M.rx; i <= M.rx; i += 5) { x.beginPath(); x.moveTo(cxh + i - 0.5, line - 6); x.lineTo(cxh + i, top - 7); x.lineTo(cxh + i + 1.5, line - 6); x.closePath(); x.fill(); }
      return;
    }
    // generic cap-style hair (covers crown) for everyone else
    let grow = 2, drop = 0.12;
    if (st === "bowl") { grow = 4; drop = 0.42; }
    else if (st === "floppy") { grow = 3; drop = 0.30; }
    else if (st === "fringe") { grow = 2.5; drop = 0.22; }
    else if (st === "quiff") { grow = 1.5; drop = 0.04; }
    else if (st === "curlfade") { grow = 0.5; drop = -0.02; }
    else if (st === "shortYoung") { grow = 1.5; drop = 0.05; }
    const capPath = () => {
      x.beginPath();
      x.ellipse(cxh, M.cy, M.rx + grow, M.ry + grow, 0, Math.PI, 0);
      x.lineTo(cxh + (M.rx + grow), M.cy + M.ry * drop);
      x.quadraticCurveTo(cxh, M.cy + M.ry * (drop + 0.12), cxh - (M.rx + grow), M.cy + M.ry * drop);
      x.closePath();
    };
    blob(x, capPath, r.base, 2.6);
    clipIn(x, capPath, () => {
      x.fillStyle = r.sh; ell(x, cxh + M.rx * 0.5, top + 6, M.rx * 0.8, M.ry * 0.7); x.fill();
      x.fillStyle = r.li2; ell(x, cxh - M.rx * 0.4, top + 4, M.rx * 0.4, M.ry * 0.3); x.fill();
    });
  }

  function hairFront(x, spec, M) {
    const r = ramp(spec.hair), st = spec.style, top = M.cy - M.ry;
    if (st === "curlfade") {
      // little low curl at the front-top (kid)
      blob(x, () => ell(x, cxh - 2, top + 3, 8, 6), r.base, 2.2);
      x.fillStyle = r.li; ell(x, cxh - 4, top + 1, 3, 2.4); x.fill();
    } else if (st === "quiff") {
      blob(x, () => { x.beginPath(); x.moveTo(cxh - 9, top + 8); x.quadraticCurveTo(cxh - 3, top - 7, cxh + 9, top + 2); x.quadraticCurveTo(cxh + 2, top + 6, cxh - 9, top + 8); x.closePath(); }, r.base, 2.2);
      x.fillStyle = r.li; ell(x, cxh - 2, top, 3, 2); x.fill();
    } else if (st === "floppy") {
      blob(x, () => { x.beginPath(); x.moveTo(cxh - M.rx - 1, M.cy - 4); x.quadraticCurveTo(cxh - 6, top + 2, cxh + 4, top + 5); x.quadraticCurveTo(cxh + M.rx, top + 8, cxh + M.rx, M.cy - 2); x.quadraticCurveTo(cxh + 4, M.cy - 1, cxh - M.rx - 1, M.cy - 4); x.closePath(); }, r.base, 2.2);
    } else if (st === "fringe") {
      blob(x, () => { x.beginPath(); x.moveTo(cxh - M.rx, M.cy - 3); x.quadraticCurveTo(cxh - 2, top + 1, cxh + M.rx - 1, M.cy - 6); x.quadraticCurveTo(cxh + 2, M.cy - 2, cxh - M.rx, M.cy - 3); x.closePath(); }, r.base, 2.2);
      x.fillStyle = r.li; ell(x, cxh - 6, top + 5, 6, 3); x.fill();
    } else if (st === "bowl") {
      x.fillStyle = r.sh; rr(x, cxh - M.rx - 1, M.cy - 4, (M.rx + 1) * 2, 4, 2); x.fill();
    }
  }

  function headband(x, spec, M) {
    const top = M.cy - M.ry;
    blob(x, () => rr(x, cxh - M.rx - 1, M.cy - M.ry * 0.5, (M.rx + 1) * 2, 6, 2), spec.headband, 2.2);
    x.fillStyle = shade(spec.headband, -0.3); x.fillRect(cxh - M.rx, M.cy - M.ry * 0.5 + 4, (M.rx) * 2, 1.4);
  }

  function beard(x, spec, M) {
    const col = spec.beardColor || "#1a120c", r = ramp(col);
    const my = M.eyeY + (spec.kid ? 0 : 12);
    if (spec.beard === "full") {
      const path = () => { x.beginPath(); x.moveTo(cxh - M.rx, M.cy - 2); x.quadraticCurveTo(cxh - M.rx, M.cy + M.ry, cxh, M.cy + M.ry + 2); x.quadraticCurveTo(cxh + M.rx, M.cy + M.ry, cxh + M.rx, M.cy - 2); x.quadraticCurveTo(cxh, M.cy + M.ry * 0.4, cxh - M.rx, M.cy - 2); x.closePath(); };
      blob(x, path, r.base, 2.4);
      clipIn(x, path, () => { x.fillStyle = r.li; for (let i = 0; i < 5; i++) { ell(x, cxh - 12 + i * 6, M.cy + 6, 2, 4); x.fill(); } });
      mouth(x, spec, my);
    } else if (spec.beard === "goatee") {
      blob(x, () => { x.beginPath(); x.moveTo(cxh - 5, my + 3); x.quadraticCurveTo(cxh, my + 12, cxh + 5, my + 3); x.quadraticCurveTo(cxh, my + 6, cxh - 5, my + 3); x.closePath(); }, r.base, 2);
      x.strokeStyle = r.base; x.lineWidth = 2.4; x.beginPath(); x.moveTo(cxh - 6, my - 1); x.lineTo(cxh + 6, my - 1); x.stroke();
    } else if (spec.beard === "stubble") {
      clipIn(x, () => { x.beginPath(); x.moveTo(cxh - M.rx, M.cy); x.quadraticCurveTo(cxh, M.cy + M.ry + 1, cxh + M.rx, M.cy); x.lineTo(cxh + M.rx, M.cy + M.ry); x.lineTo(cxh - M.rx, M.cy + M.ry); x.closePath(); }, () => {
        x.globalAlpha = 0.22; x.fillStyle = shade(spec.skin, -0.5);
        for (let i = 0; i < 60; i++) x.fillRect(cxh - M.rx + Math.random() * M.rx * 2, M.cy + Math.random() * M.ry, 1, 1);
        x.globalAlpha = 1;
      });
    }
  }

  function armband(x) {
    blob(x, () => rr(x, cxh - 30, 80, 12, 9, 2), "#ffd23a", 2);
    x.fillStyle = "#1a1205"; x.font = "bold 8px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("C", cxh - 24, 85);
  }

  function scanlines(x) {
    x.globalAlpha = 0.10; x.fillStyle = "#000";
    for (let y = 0; y < BH; y += 2) x.fillRect(0, y, BW, 1);
    x.globalAlpha = 1;
  }

  /* =======================================================================
     specs — each player unique
     ======================================================================= */
  const SPECS = {
    Vanja: { kid: true, skin: "#f2c89c", hair: "#7a572b", style: "curlfade", eyes: "#3aa356", chin: "pointy", mouth: "shy", jersey: "#e23b4d", jersey2: "#fff", captain: true, faceW: 24, faceH: 25 },
    "Fiči": { kid: true, skin: "#edbe96", hair: "#8a6633", style: "short", eyes: "#6b4a2b", chin: "normal", mouth: "neutral", jersey: "#e23b4d", jersey2: "#fff", broad: true, faceW: 26, faceH: 26 },
    Bobo: { kid: true, skin: "#f8d4ad", hair: "#ecd884", style: "floppy", eyes: "#46a9da", chin: "round", mouth: "megagrin", jersey: "#e23b4d", jersey2: "#fff", freckles: true, faceW: 25, faceH: 25 },
    Marko: { kid: true, skin: "#eaba8c", hair: "#5d3f24", style: "bowl", eyes: "#5a3f28", chin: "round", mouth: "happy", jersey: "#e23b4d", jersey2: "#fff", faceW: 23, faceH: 24 },
    Jan: { kid: true, skin: "#e6b487", hair: "#382616", style: "quiff", eyes: "#3a2a1a", chin: "normal", mouth: "smirk", jersey: "#e23b4d", jersey2: "#fff", broad: true, faceW: 26, faceH: 27, faceCy: 40 },
    Cacko: { kid: true, skin: "#eec39a", hair: "#2c2016", style: "short", eyes: "#3a2a1a", chin: "round", mouth: "grin", jersey: "#1a57c8", jersey2: "#fff", stripes: true, broad: true, faceW: 29, faceH: 27, faceCy: 42 },

    br82: { skin: "#a8703f", hair: "#16110c", style: "afro", beard: "full", beardColor: "#16110c", headband: "#f2f2ee", eyes: "#2a1a10", mouth: "neutral", jersey: "#f5d400", jersey2: "#1f56c4" },
    ar86: { skin: "#d8a878", hair: "#241a12", style: "mullet", beard: "stubble", eyes: "#2a1a10", mouth: "grin", jersey: "#7cc3e9", jersey2: "#13224f", broad: true },
    nl88: { skin: "#e9c39c", hair: "#cba24a", style: "fringe", eyes: "#3a6f9a", mouth: "neutral", jersey: "#ff7a18", jersey2: "#0c0c0c" },
    en98: { kid: false, skin: "#f0cdab", hair: "#7a5230", style: "shortYoung", eyes: "#5f6f52", mouth: "happy", jersey: "#f4f6fb", jersey2: "#c8202f", faceW: 23, faceH: 25 },
    br02: { skin: "#9c6638", hair: "#0d0a08", style: "ponytailCurly", behind: true, eyes: "#1a120c", mouth: "megagrin", toothGap: true, jersey: "#ffe11a", jersey2: "#0f3fae", broad: true },
    it94: { skin: "#e3b489", hair: "#2a1d12", style: "ponytail", behind: true, beard: "goatee", beardColor: "#2a1d12", eyes: "#5a4a2a", mouth: "determined", jersey: "#1f4fb0", jersey2: "#fff" },
    jp98: { skin: "#f1cda6", hair: "#df8f33", hairRoot: "#2a1a0e", style: "spiky", eyes: "#2a1a10", mouth: "neutral", jersey: "#1768d6", jersey2: "#fff" },
    ng94: { skin: "#5a3a23", hair: "#0a0a0a", style: "shaved", beard: "goatee", beardColor: "#0a0a0a", eyes: "#1a0f08", mouth: "megagrin", jersey: "#16a64a", jersey2: "#fff", broad: true },
  };

  function get(id) {
    if (cache[id]) return cache[id];
    const spec = SPECS[id];
    if (!spec) return null;
    spec.__id = id;
    return build(spec);
  }
  function draw(ctx, id, dx, dy, dw, dh) {
    const c = get(id); if (!c) return;
    const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, 0, 0, BW, BH, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = prev;
  }
  return { get, draw, ratio: () => BW / BH, BW, BH };
})();
