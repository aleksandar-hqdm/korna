/* =========================================================================
   KORNA — optional sprite/portrait asset layer.
   Loads assets/manifest.json + PNGs if present. Until art exists, every
   getter returns null and the renderer falls back to procedural drawing,
   so the game is always playable. Drop PixelLab output into assets/ and it
   lights up automatically — no code changes.
   ========================================================================= */
"use strict";

const Assets = (() => {
  let manifest = null;
  let heightWorld = 46;
  const sets = {};      // name -> SpriteSet
  const faces = {};     // name -> HTMLImage.  null while missing.
  const bgs = {};       // team id -> background HTMLImage
  let loaded = false;

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  class SpriteSet {
    constructor() { this.anims = {}; this.ok = false; }
    add(name, img, frames, fps) {
      if (!img) return;
      // frames are square, so infer the count from the strip's aspect ratio
      // (robust to the API returning a different frame count than requested)
      const fh = img.height;
      const inferred = Math.max(1, Math.round(img.width / fh));
      this.anims[name] = { img, frames: inferred, fps: fps || 8, fw: fh, fh };
      this.ok = true;
    }
    has(name) { return !!this.anims[name]; }
    // pick a frame for an animation at time t (seconds)
    frame(name, t) {
      const a = this.anims[name] || this.anims.idle || this.anims.run;
      if (!a) return null;
      const idx = Math.floor(t * a.fps) % a.frames;
      return { img: a.img, sx: idx * a.fw, sy: 0, sw: a.fw, sh: a.fh, fw: a.fw, fh: a.fh };
    }
  }

  // standard animation set probed per character (by sprite filename prefix)
  const ANIM_FPS = { idle: 3, run: 12, kick: 14, sprint: 13, pass: 16, tackle: 13, celebrate: 8, dive: 13, catch: 10, lob: 16 };

  async function load(base = "assets/") {
    try {
      const res = await fetch(base + "manifest.json", { cache: "no-cache" });
      if (!res.ok) return;
      manifest = await res.json();
      heightWorld = manifest.spriteHeightWorld || 46;
      const jobs = [];
      for (const name in manifest.characters) {
        const def = manifest.characters[name];
        const set = new SpriteSet();
        sets[name] = set;
        const prefix = def.portrait ? def.portrait.replace(/.*\//, "").replace(/\.png$/i, "") : name.toLowerCase();
        for (const an in ANIM_FPS) jobs.push(loadImage(base + "sprites/" + prefix + "_" + an + ".png").then((img) => set.add(an, img, 4, ANIM_FPS[an])));
        if (def.portrait) jobs.push(loadImage(base + def.portrait).then((img) => { faces[name] = img; }));
      }
      // per-team painted backgrounds (optional)
      if (typeof TEAMS !== "undefined") for (const t of TEAMS) jobs.push(loadImage(base + "backgrounds/" + t.id + ".png").then((img) => { if (img) bgs[t.id] = img; }));
      await Promise.all(jobs);
      loaded = true;
    } catch (e) { /* no manifest yet — stay in procedural mode */ }
  }

  return {
    load,
    isLoaded: () => loaded,
    heightWorld: () => heightWorld,
    // returns a ready SpriteSet for a player name, or null to use procedural art
    sprite: (name) => { const s = sets[name]; return s && s.ok ? s : null; },
    // returns a portrait image or null to use procedural Portrait
    face: (name) => faces[name] || null,
    // returns a painted background image for a team id, or null
    bg: (id) => bgs[id] || null,
  };
})();
