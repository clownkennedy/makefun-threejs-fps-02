# BUILD-LOG — EMBERLINE (threejs-fps-01)

Agent-transcript record for the make.fun threejs-fps-01 submission.
Competition: "Make the best three.js tactical FPS" — $1,000 prize
(1st $400 / 2nd $200 / 3rd $120 / 4th–10th $40),
deadline 2026-11-23T17:00:00Z (24 Nov 2026 00:00 WIB),
opens 2026-11-16T17:00:00Z (17 Nov 2026 00:00 WIB).
Built 16 Nov 2026, ~10:44–11:35 WIB, by the Muse agent ("hextor")
in this workspace. All game source below was written by the agent
in this session — no code was copied from the kit's starter game
(the starter is a grey room with target dummies; EMBERLINE is a
different game built from scratch on the same kit skeleton).

## What was built

EMBERLINE — a Counter-Strike-style round-based tactical FPS,
single-player vs 6 bots, three.js 0.187.0, static files, no network
request, no build step.

- Map "Ember Yard" (44×36 m): two bomb sites (A FURNACE, B DEPOT),
  mid + side lanes, containers, crates, a gantry platform, floodlights,
  skyline, canvas-drawn A/B site sprites. 17-node waypoint graph.
- Teams: EMBER (player + 2 bots) vs ASH (4 bots).
- Rounds: buy 12 s / live 100 s, first to 5, max 9 rounds.
  Win by eliminating the enemy team or by the spike objective:
  plant 3 s (E), defuse 5 s (E), detonate 35 s. Elimination does NOT
  end a round while the spike is planted.
- Economy: $800 start, kill +$300, win +$3,250, loss +$1,900,
  plant +$300. Buy menu (B or number keys) between rounds.
- Weapons: P9 Sidearm (free, 12/36, dmg 26), Vex-9 SMG ($1,200,
  32/96, dmg 21), AR-77 Rifle ($2,700, 30/90, dmg 34),
  Longshot DMR ($4,200, 6/18, dmg 92), Kevlar Armor ($650, +50 armor,
  absorbs half damage), Frag Grenade ($300, max 2, throw with G,
  1 free per round). Hitscan with recoil + spread that punishes
  moving fire; headshot = instant kill (100 dmg).
- Bots: patrol / chase / engage / strafe / burst-fire / retreat /
  defuse / plant / guard; vision cone + line-of-sight raycast,
  hearing, BFS pathfinding on the waypoint graph, stuck detector,
  0.6–1.1 s aim time on first sight of a new target.
- Player: WASD + mouse look (pointer lock), crouch, jump, recoil,
  armor absorbs half damage, AABB collision with the map.
- Grenade: thrown with G, arced flight (11 m/s + 5 m/s up), ground
  and wall bounces, 1.2 s fuse, blast radius 6 m, damage 110 at the
  centre fading to 10 at the edge, self-damage halved.
- HUD: health + armor bars, ammo / reserve, weapon name, grenade
  count, money, round timer, team scores, kill feed, crosshair +
  hitmarker, spike banner, minimap (canvas, live bot dots + plant
  ring), buy menu, scoreboard (Tab), start / pause / round / match
  overlays.
- Sound: procedural WebAudio only (no audio files) — per-weapon
  shots, hit / kill / reload / plant / explosion / stingers /
  footsteps / wind loop.
- Screenshots: deterministic `?shot=start|play|bomb|end&seed=1`
  modes in main.js, frozen after 2 renders, `window.__shotReady`
  signals the capture. `window.__game` debug handle (look, stepOnce,
  shoot, teleport, checkEdges, grenade, nades) used for testing.

## Files

```
game/index.html            10,751 bytes — import map "three" -> ./vendor/three/three.module.min.js
game/src/palette.js        palette (canvas #10141a, surface #232830, hairline #313842,
                           ink #e9e6df, muted #98a0a8, accent/ember #f0a830, ash teal #3fc1b0,
                           danger #e5484d, rust #a85f2a, gold #d9b45b)
game/src/audio.js          procedural WebAudio
game/src/input.js          keyboard / mouse / pointer lock
game/src/player.js         shared AABB mover + player (WASD, crouch, jump, recoil, armor)
game/src/weapons.js        weapon catalog, view models, ammo state machine
game/src/world.js          Ember Yard map, colliders, waypoint graph, lights
game/src/bots.js           bot AI
game/src/economy.js        money rules
game/src/rounds.js         round state machine
game/src/hud.js            all HUD elements
game/src/main.js           boot, fixed 60 Hz loop, shooting/tracers, round flow,
                           spike carrier transfer, 4 deterministic ?shot= modes
game/vendor/three/three.module.min.js   three.js 0.187.0, byte-for-byte from the kit
game/vendor/three/three.core.min.js     three.js 0.187.0, byte-for-byte from the kit
game/vendor/three/LICENSE
vendor/makefun-threejs.ts  kit copy, unchanged
LICENSE                    OSI license (root)
main.ts                    copies game/ + screenshots/ to /output, writes dossier.json
serve.ts                   static dev server (node serve.ts --port 8902)
shots.json                 screenshot name -> ?shot= query mapping
screenshots/1-start.jpg   47,405 bytes, 1280x720 — buy phase, buy menu centred
screenshots/2-play.jpg    32,793 bytes, 1280x720 — live combat, tracer + muzzle flash
screenshots/3-bomb.jpg    30,019 bytes, 1280x720 — spike planted at site A
screenshots/4-end.jpg     37,917 bytes, 1280x720 — round won + scoreboard
```

Authored source (index.html + src/*.js + main.ts + serve.ts): 2,733 lines.

## Build session log

- 10:44 — competition re-verified live from the make.fun API
  (threejs-fps-01, $1,000, 0 submissions, deadline 24 Nov 00:00 WIB).
  Kit downloaded + extracted to kit/ (kit.json, kit.tar.gz 5,864,781 B,
  extracted threejs-fps-01-kit/ with RULES.txt, cli/makefun.mjs,
  competition.yaml, harness/, starter/).
- 10:44 — skeleton: three.js 0.187.0 files copied + sha256 verified
  (three.module.min.js ef510bae…, three.core.min.js 613e370f…),
  vendor/makefun-threejs.ts copied unchanged, LICENSE copied.
  Starter source read to understand the harness pattern
  (fixed 60 Hz sim, pointer lock, hitscan rifle, AABB collision).
- 10:44–11:05 — EMBERLINE written module by module (palette, audio,
  input, player, weapons, world, bots, economy, rounds, hud, main,
  index.html, main.ts, serve.ts).
- Environment: Node v24.22.1. System Chrome (/opt/meta-chromium/chrome)
  refused headless start (Hatch WebGL domain policy). Working
  screenshot pipeline: Playwright Chromium cached at
  ~/.cache/ms-playwright (chromium-1255 + headless shell),
  script /tmp/pw/shot.mjs (viewport 1280x720, swiftshader, waits for
  window.__shotReady, JPEG q82, logs console/page/request errors).
  Served with `node serve.ts --port 8902`.

## Bugs found and fixed during testing

All verified in-browser via Playwright + the `window.__game` debug
handle; after each fix the game was re-run with 0 console errors.

1. botShoot `.bot` double-deref — bots passed their state, main.js
   read `bot.bot.weapon` → PAGEERROR x2. Fixed; 0 errors since.
2. Bot hit model was a fixed 0.035 rad cone — too lethal at range
   (player 100 -> 28 hp in 23 s standing still). Fixed: a bot shot
   hits iff its deviation < spread + atan(0.32 / dist). Added
   0.6–1.1 s aim time on first sight of a new target. VIEW_DIST
   40 -> 34, FOV half-angle 0.96 -> 0.8 rad.
3. Waypoint graph broken: nodes 5/7 sat INSIDE solid containers,
   edges crossed boxes, bots wedged permanently. Fixed via the
   `checkEdges()` debug probe (samples each edge with a 0.34 m bot
   probe vs colliders): moved the pillar (0,-2) -> (3.5,-2), moved
   crates, removed the two A/B-lane containers at (+-14,-6), moved
   nodes 5/7 to (+-11,-5), 6/8 to (+-16,-13), 9 to (0,-5.5), added
   bypass nodes 15 (-14,4) / 16 (14,4), removed links 4-7, 6-13,
   8-14, moved crates (+-7.5,-13.5) -> (+-20,-4) and (+-17,-13.5) ->
   (+-17.5,-14.5). checkEdges() now returns [] (clean). Also added a
   stuck detector in moveAlongPath (no progress 1.2 s -> skip node).
4. Spawn wedge (root cause of Ash-3/Ash-4 never moving): crates at
   (+-7.5, 0.35, -13.5) overlapped the Ash-3/4 spawn probes — bots
   spawned inside geometry and the mover blocked every step.
   Reproduced in Node with the real createMover + colliders. Fixed
   by moving the crates; `overlaps at spawn: false` after the fix.
5. Bots fought during the buy phase (player died at spawn during
   buy). Fixed: enemy scan gated on `ctx.phase === 'live'`.
6. Defuse reward bug: onDefused paid +$300 to the player's
   (attacker) economy when ASH bots defused. Fixed: no money on
   defuse (the reward belongs to the defenders).
7. Ground Box3 max.y is float32 epsilon 2.98e-9 (not 0) — the
   checkEdges probe must start at y=0.05, not 0 (documented in a
   code comment).
8. Buy menu + scoreboard rendered off-screen: `#buy-menu` and
   `#scoreboard` lacked `position: fixed`, so their left/top/
   transform centred nothing and they rendered in flow, shifted
   half off-screen (buy menu) / hidden under the canvas
   (scoreboard). Fixed: added `position: fixed` to both rules.
9. Muzzle flash was a giant amber diamond dominating the frame.
   Fixed: flash plane 0.24 -> 0.13, opacity 0.9 -> 0.7,
   rotation.z multiplier 30 -> 8.
10. Scene too dark (dusk). Fixed: hemisphere light 0.9 -> 1.15,
    fill light 0.5 -> 0.65.
11. Round banner caught mid-fade in the end screenshot (CSS
    transition still running when the shot froze). Fixed: removed
    the `transition: opacity .25s` from #round-banner.
12. Scoreboard hidden in the end screenshot: `step()` hides it
    whenever Tab is not held, so showing it before the settle
    steps erased it. Fixed: show the scoreboard AFTER the last
    settle in runShot('end').
13. Grenade overshot its target: first version (14 m/s, 1.6 s fuse)
    flew ~15-20 m past the aimed bot, which then outran the blast
    (bots move ~4.5 m/s while engaging). Fixed: lob (11 m/s + 5 m/s
    up, 1.2 s fuse) — lands ~9-10 m out, explodes ~0.5 s after
    landing. Verified: bot 5.3 m from the blast took 12 damage
    (110 * (1 - 5.3/6) = ~13 expected).
14. View-model gun read as a white plank. Fixed: view-model
    "light" material changed from ink (#e9e6df) to surface
    (#232830) dark steel.

## Gameplay verification (headless sim, seed=1, 0 console errors)

- Buy phase -> live; all 6 bots patrol the whole map and engage
  (positions roam across all lanes).
- Player movement via keyboard works.
- Player shooting works: 12 P9 rounds at Ash-3 from 14 m ->
  hp 100 -> 17. (Earlier test failures were a test-sign error in
  the aim math, not a game bug.)
- Plant works: teleport to site A + hold E 3.7 s -> 'planted',
  money 800 -> 1100 (+$300). Ash bots defused it while the idle
  player did nothing (correct behaviour) -> roundEnd ash win ->
  round 2 buy -> live.
- Player death -> respawn next round with 100 hp. Round 2 ash
  win -> round 3. Economy math verified (loss +$1900 each round).
- Grenade: throw (grenades 1 -> 0), arc + bounce, fuse, explosion,
  AoE damage with falloff verified (bot 5.3 m away took 12 dmg).

## Final gate self-check (16 Nov ~11:25 WIB)

- main.ts run TWICE (MAKEFUN_OUTPUT_DIR=/tmp/out1 and /tmp/out2):
  `diff -r` — byte-identical. Determinism gate passes.
- game/: 19 files+dirs (limit 993), 2,235,253 bytes (limit 48 MiB),
  index.html 10,751 bytes (limit 1 MiB), 0 symlinks.
- screenshots/: 4 JPEGs, 1280x720 each, 30,019–47,405 bytes each
  (limit 256 KiB; long side 1280 <= 1280; short side 720 >= 480).
- /output total: 26 entries (limit 1000), 2,685,955 bytes
  (limit 64 MiB).
- dossier.json: 302,568 bytes (limit 1.5 MiB), schema
  makefun/dossier/v1, cover 0, 4 images, text 101,590 bytes
  (limit 163,840). Text contains EMBERLINE, Grenade, Spike.
- three.js hashes match the kit starter exactly:
  three.module.min.js ef510bae547ab3789d6ed543333a8bf42510a8c70743b766c4e19039b976c26b
  three.core.min.js  613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578
- No external references in the agent's own source (index.html +
  src/*.js): grep for http(s):// finds matches ONLY inside the
  vendored three.js files (documentation URLs in comments + the
  XML namespace string `http://www.w3.org/1999/xhtml` in
  createElementNS) — those bytes are npm's own three.js 0.187.0,
  required byte-for-byte by the kit; they load nothing.
- Screenshots re-taken after every visual fix and viewed:
  1-start (buy menu centred, A/B sites visible), 2-play (combat,
  small muzzle flash, dark view model, grenade counter ◉ ×1,
  tracer), 3-bomb (spike planted banner, site A, defender bot),
  4-end (ROUND WON + scoreboard).

## What remains for submission (NOT done by this agent)

- Create a public GitHub repo owned by the user's GitHub account,
  created at or after the competition opens (17 Nov 2026 00:00 WIB),
  with an OSI license, containing this project (game/, screenshots/,
  main.ts, serve.ts, vendor/makefun-threejs.ts, LICENSE, shots.json,
  BUILD-LOG.md, README.md).
- Submit on make.fun when the competition opens (acceptingSubmissions
  turns true 17 Nov 00:00 WIB; deadline 24 Nov 00:00 WIB): name the
  repo + commit, upload the AI coding-agent transcripts of the
  sessions that built it (this BUILD-LOG.md is the transcript record
  for this session; transcripts must account for >= 30% of counted
  lines and main.ts must have >= 1 authored line — both hold here),
  and sign the entry message with the linked Solana wallet if the
  reward is escrow-locked (the bounty page says which; no wallet was
  connected and nothing was signed by this agent).
- No money was spent, no wallet was connected, nothing was signed,
  nothing was submitted by this agent.
