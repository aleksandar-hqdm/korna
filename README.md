# KORNA ⚽

**Street cage football, arcade style.** Six kids take on football's legends. Be the underdog.

A retro pixel-art football game in pure HTML5 Canvas + vanilla JavaScript. No build step, no dependencies. Inspired by the look of [8bit-football.com](https://8bit-football.com/) and the arcade energy of Street Hoops, with momentum-driven movement for that Prince-of-Persia smoothness.

## Play

Open `index.html` in a browser, or play the live version (link in the repo description).

### Controls
| Action | Keys |
| --- | --- |
| Move | `WASD` / Arrow keys |
| Shoot (hold to charge) | `Space` |
| Pass | `J` |
| Sprint | `Shift` |
| Switch player | `C` |

Touch devices get an on-screen stick + Shoot/Pass buttons.

## Team KORNA
- **Vanja** (c) — box-to-box engine, shy but fearless. Modrić / Kanté / Verratti.
- **Fiči** — calm, solid, never beaten. Maldini.
- **Bobo** — always smiling, always in front of goal. Inzaghi.
- **Marko** — tiny, electric on the flanks. Solskjær / Ljungberg.
- **Jan** — the big seven-year-old with the rocket shot. Lukaku / Milito.
- **Cacko** — the keeper. Huge, agile, fearless, in the blue jersey.

## The Legends (pick your rivals)
Brazil (Sócrates era) · Argentina (Maradona era) · Netherlands (Van Basten era) · England (Owen era) · Brazil (Ronaldo & Ronaldinho era) · Italy (Baggio era) · Japan (Nakata era) · Nigeria (Okocha era).

## Art pipeline
The game ships with built-in procedural pixel-art, and is **asset-swappable**: drop sprite sheets into `assets/sprites/` and portrait busts into `assets/portraits/` matching `assets/manifest.json`, and they load automatically (no code changes). Designed to take [PixelLab](https://www.pixellab.ai/) output.

## Tech
- `js/config.js` — constants + math
- `js/audio.js` — synthesized Web Audio SFX
- `js/teams.js` — squads + formations
- `js/portraits.js` — procedural portrait engine
- `js/assets.js` — optional PNG sprite/portrait loader
- `js/input.js` — keyboard / pointer / touch
- `js/entities.js` — player + ball physics
- `js/ai.js` — positioning, pressing, passing, shooting
- `js/render.js` — camera, sprites, HUD, menus
- `js/game.js` — state machine + main loop

## Credits
Built with [Claude Code](https://claude.com/claude-code).
