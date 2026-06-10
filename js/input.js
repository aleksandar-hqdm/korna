/* =========================================================================
   KORNA — input: keyboard, pointer (menus), and on-screen touch controls
   ========================================================================= */
"use strict";

const Input = (() => {
  const keys = {};
  // analogue movement vector from keyboard OR the touch stick
  const move = { x: 0, y: 0 };
  const touch = { x: 0, y: 0, active: false };

  // edge-triggered action flags consumed by the game each frame
  let shootHeld = false;     // true while shoot is down (charges power)
  let shootReleasedAt = 0;   // power captured on release, read once
  let passQueued = false;
  let switchQueued = false;
  let confirmQueued = false;
  let backQueued = false;
  // pointer for menu navigation
  const pointer = { x: 0, y: 0, clicked: false };

  const MOVE_KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };

  function keyMoveVector() {
    let x = 0, y = 0;
    for (const k in MOVE_KEYS) {
      if (keys[k]) { x += MOVE_KEYS[k][0]; y += MOVE_KEYS[k][1]; }
    }
    return { x, y };
  }

  window.addEventListener("keydown", (e) => {
    Sound.unlock();
    if (keys[e.key]) return; // ignore auto-repeat for edge actions
    keys[e.key] = true;

    if (e.key === " " || e.key === "k" || e.key === "K") { shootHeld = true; e.preventDefault(); }
    if (e.key === "j" || e.key === "J" || e.key === "l" || e.key === "L") passQueued = true;
    if (e.key === "Tab" || e.key === "c" || e.key === "C") { switchQueued = true; e.preventDefault(); }
    if (e.key === "Enter") confirmQueued = true;
    if (e.key === "Escape" || e.key === "Backspace") backQueued = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
  });

  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
    if (e.key === " " || e.key === "k" || e.key === "K") {
      if (shootHeld) shootReleasedAt = performance.now();
      shootHeld = false;
    }
  });

  // ----- pointer (menus) -----
  const canvas = () => document.getElementById("game");
  function toCanvas(clientX, clientY) {
    const c = canvas(); const r = c.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (CFG.W / r.width),
      y: (clientY - r.top) * (CFG.H / r.height),
    };
  }
  window.addEventListener("pointermove", (e) => {
    const p = toCanvas(e.clientX, e.clientY);
    pointer.x = p.x; pointer.y = p.y;
  });
  window.addEventListener("pointerdown", (e) => {
    Sound.unlock();
    if (e.target && e.target.closest && e.target.closest("#touch")) return; // touch pad handles itself
    const p = toCanvas(e.clientX, e.clientY);
    pointer.x = p.x; pointer.y = p.y; pointer.clicked = true;
  });

  // ----- touch controls -----
  function bindTouch() {
    const stick = document.getElementById("stick");
    const nub = document.getElementById("nub");
    const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    if (!isTouch) return;
    document.getElementById("touch").classList.remove("hidden");

    let sid = null, cx = 0, cy = 0;
    const R = () => stick.getBoundingClientRect();
    function set(e) {
      const r = R(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const max = r.width * 0.42, m = Math.hypot(dx, dy);
      if (m > max) { dx = dx / m * max; dy = dy / m * max; }
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / max, ny = dy / max;
      touch.x = Math.abs(nx) > 0.18 || Math.abs(ny) > 0.18 ? nx : 0;
      touch.y = Math.abs(nx) > 0.18 || Math.abs(ny) > 0.18 ? ny : 0;
      touch.active = true;
    }
    stick.addEventListener("pointerdown", (e) => { sid = e.pointerId; stick.setPointerCapture(sid); set(e); });
    stick.addEventListener("pointermove", (e) => { if (e.pointerId === sid) set(e); });
    const release = (e) => {
      if (e.pointerId !== sid) return;
      sid = null; touch.x = 0; touch.y = 0; touch.active = false;
      nub.style.transform = "translate(-50%, -50%)";
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);

    const sh = document.getElementById("btnShoot");
    sh.addEventListener("pointerdown", (e) => { e.preventDefault(); Sound.unlock(); shootHeld = true; });
    sh.addEventListener("pointerup", (e) => { e.preventDefault(); if (shootHeld) shootReleasedAt = performance.now(); shootHeld = false; });
    const ps = document.getElementById("btnPass");
    ps.addEventListener("pointerdown", (e) => { e.preventDefault(); Sound.unlock(); passQueued = true; });
    // tapping the screen also confirms menus on touch
    canvas().addEventListener("pointerdown", () => { confirmQueued = true; });
  }

  return {
    bindTouch,
    // movement vector (normalised), keyboard takes priority, falls back to touch
    movement() {
      const k = keyMoveVector();
      let x = k.x, y = k.y;
      if (x === 0 && y === 0 && touch.active) { x = touch.x; y = touch.y; }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y, mag: Math.min(1, m) };
    },
    isShootHeld() { return shootHeld; },
    isSprint() { return !!(keys.Shift || keys.Shift === true); },
    // returns true once when shoot was released this frame
    consumeShootRelease() { if (shootReleasedAt) { shootReleasedAt = 0; return true; } return false; },
    consumePass() { const v = passQueued; passQueued = false; return v; },
    consumeSwitch() { const v = switchQueued; switchQueued = false; return v; },
    consumeConfirm() { const v = confirmQueued; confirmQueued = false; return v; },
    consumeBack() { const v = backQueued; backQueued = false; return v; },
    consumeClick() { const v = pointer.clicked; pointer.clicked = false; return v; },
    pointer,
    keyDown(k) { return !!keys[k]; },
  };
})();
