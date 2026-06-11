/* =========================================================================
   KORNA — tiny Web Audio SFX engine (no asset files, all synthesized)
   ========================================================================= */
"use strict";

const Sound = (() => {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch (e) { enabled = false; }
  }
  // browsers suspend audio until a user gesture
  function unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function tone(freq, dur, type = "sine", vol = 0.4, slideTo = null, delay = 0) {
    if (!enabled) return;
    ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.4, hp = 400, lp = 4000, delay = 0) {
    if (!enabled) return;
    ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hpf = ctx.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass"; lpf.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(master);
    src.start(t0);
  }

  // throttle so rapid scrappy play doesn't spam the same sound into noise
  const last = {};
  const thr = (k, ms) => { const t = performance.now(); if (last[k] && t - last[k] < ms) return false; last[k] = t; return true; };

  return {
    unlock,
    setEnabled(v) { enabled = v; },
    kick()   { if (!thr("kick", 70)) return; noise(0.06, 0.32, 200, 2400); tone(150, 0.1, "triangle", 0.28, 70); },
    pass()   { if (!thr("pass", 70)) return; tone(420, 0.08, "triangle", 0.17, 300); },
    wall()   { if (!thr("wall", 95)) return; tone(180, 0.05, "square", 0.08, 120); },
    save()   { noise(0.09, 0.4, 300, 2000); tone(220, 0.1, "sine", 0.25, 140); },
    steal()  { if (!thr("steal", 110)) return; tone(700, 0.06, "square", 0.14, 400); noise(0.04, 0.16, 800, 4000); },
    post()   { tone(900, 0.18, "sine", 0.3, 700); },
    ui()     { tone(560, 0.07, "square", 0.2, 760); },
    uiBack() { tone(360, 0.07, "square", 0.18, 240); },
    whistle() {
      tone(2100, 0.14, "square", 0.16, 2300);
      tone(2100, 0.16, "square", 0.16, 2350, 0.16);
    },
    goal() {
      // cheery little fanfare + crowd swell
      const seq = [523, 659, 784, 1046];
      seq.forEach((f, i) => tone(f, 0.18, "triangle", 0.35, null, i * 0.1));
      noise(0.9, 0.35, 500, 3500, 0.05);
    },
    crowd(vol = 0.18) { noise(0.7, vol, 500, 3000); },
  };
})();
