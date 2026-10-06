# Ghillie Ops - SPEC

Project folder: C:\Users\Leschke\Downloads\GhillieOps
Models folder: C:\Users\Leschke\Downloads\Models\GhillieOps (served by the game server under /models)
Hardware of the user: RTX 4080 16 GB, Ryzen 7 5800X, 32 GB RAM, monitor 3840x1080, Windows 11.
Tools on this PC: Blender 5.2 LTS with MCP add-on (port 9876, already running and connected), ComfyUI + SDXL (port 8188, not running by default), Node 24, Chrome at C:\Program Files\Google\Chrome\Application\chrome.exe, internet access.

This is a new, independent project. An older project C:\Users\Leschke\Downloads\GhillieFront exists; do not modify it and do not copy its code. You may read it for ideas.

## 0. Quality bar: AAA

The game must be AAA quality, on par with the most recent AAA shooters (Battlefield, Call of Duty, Delta Force, Arma Reforger for foliage), in every area: visuals, textures, lighting, animation, physics, weapon feel, audio, UI and netcode. "Utterly perfect" is the goal. Nothing that looks like a prototype, a tech demo, programmer art or a placeholder is acceptable. The measurable criteria in this spec are the minimum evidence a critic needs for a PASS. They never lower the bar.

## 1. Original request (verbatim, binding)

```
I want you to build a first-person shooter at the level of the most recent shooter games. It should be utterly perfect, visually beautiful, with every single thing done at AAA quality-from textures to physics to anything you could think of. Fan out sub agents for each aspect of the game. Only fan out 1 subagent at a time. A harsh critic should see the work. It can eiter pass or fail. If the builder fails, (decided by the harsh critic agent) the harsh critic should give feedback, and fan a new subagent out, that then fixes what the critic said is wrong.

##Gamemodes##
Normal: Most kills wins, everyone vs everyone.
Team: You are either on team blue or red. Team with the most kills win.
Conquer: There are 4 Bases: A, B, C, D. For every 2 seconds the team owns an Base, they get 2 points, the team with the most points at the end wins, or a team gets 1000 Points, then they win.

##GAMEPLAY##
Normal: You spawn random.
There should be 100 players. If you get killed or kill someone other, you should respawn. The player with the most kills wins at the end of the round (1 round = 15 minutes). You should have weapons when you spawn in: 1. AR with infinite ammo, 2. A Handgun, also infinite ammo 3. 2 Bandages, 4. 2 Grenades.
You always wear a gillie suit.
Enemies should be relatievly near you not too far away you should atleast encounter an Enemie every 2 minutes. Enemies should die from an headshot.

Team: You spawn in random or at the teams base. If you get killed or kill someone other, you should respawn. The team with the most kills wins at the end of the round (1 round = 15 minutes). You should have weapons when you spawn in: 1. AR with infinite ammo, 2. A Handgun, also infinite ammo 3. 2 Bandages, 4. 2 Grenades.
You always wear a gillie suit.

Conquer: You spawn in random or at the teams base. If you get killed or kill someone other, you should respawn. The team with the most points wins at the end of the round (1 round = 15 minutes). You should have weapons when you spawn in: 1. AR with infinite ammo, 2. A Handgun, also infinite ammo 3. 2 Bandages, 4. 2 Grenades.
You always wear a gillie suit.

##MAIN MENU##
There should be Multiplayer, single player, and being able to buy weapons, and ghillie suits with ingame money, which you get by winning.

##MAIN##
It should be made in three.js, being able to run on my PC at atleast 60 FPS, it should use raycasts. Models can either be downloaded online without me needing to do anything or even be at my PC, or modeled in blender. Nothing should not be created else, only if its nessecary. The Map should be really big. Of course there should be dynamic grass.

##MULTIPLAYER##
It should be done using peer.js.
Make sure that all animations show on the other client too, and that if a player moves, he moves smoothly, even with a bad internet connection.
```

## 2. Interpretation decisions (binding)

- "100 players" means exactly 100 bots in every match, plus the humans: singleplayer = 1 human + 100 bots, multiplayer = 1 to 4 humans (host + up to 3 guests) + 100 bots.
- "If you get killed or kill someone other, you should respawn": read as "whoever gets killed respawns" (you when you die, the other one when you kill them). The killer keeps playing. This reading is recorded here and in the final report.
- Game UI language is English. Mode names in the UI are exactly: Normal, Team, Conquer.

## 3. Game spec

Modes (round length 15:00 in all modes):
- Normal: free-for-all. Most kills at 15:00 wins. Spawn: random (director rules below).
- Team: Red vs Blue, 50 bots per team, humans split evenly. Team with most kills at 15:00 wins; equal = draw. No friendly fire.
- Conquer: Red vs Blue, 50 bots per team, humans split evenly, bases A, B, C, D at distinct landmarks. Every 2 s each owned base gives its owner team 2 points. First team to 1000 wins immediately; otherwise most points at 15:00 wins; equal = draw. Capture zone radius 20 m, all bases start neutral, one participant captures a neutral base in 10 s, more participants capture faster (capped at 3x), contested zone freezes, an enemy base is first neutralized then captured. No friendly fire.

Spawning and respawn:
- Respawn 3 s after death with a full loadout, for humans and bots.
- Random spawn (director): out of enemy line of sight, 60 to 160 m from the nearest enemy, never inside geometry, never in water.
- Team and Conquer: the death screen offers "Random" or "Team base" (Conquer also offers owned bases A-D). Bots use the same rules.
- Encounter guarantee: every human meets an enemy at least every 120 s in every mode. An encounter = an enemy in line of sight within 150 m, or damage dealt or taken. A director steers bot routes and spawns toward humans who have had no encounter for 60 s. Measured by accelerated simulation in the selftest.

Loadout at every spawn:
- Slot 1: assault rifle, infinite reserve ammo, 30-round magazine, reload.
- Slot 2: handgun, infinite reserve ammo, 15-round magazine, reload.
- Slot 3: 2 bandages. Each heals +40 HP over a 3 s use animation; cannot shoot while bandaging; cancelable by switching.
- Slot 4: 2 grenades. Cook-able, physically thrown and bouncing, 3.5 s fuse, 150 damage at center falling to 0 at 8 m, cover blocks damage (raycast), camera shake, grass flattens briefly.

Damage:
- 100 HP. Health regeneration: none (bandages heal).
- A headshot kills instantly with any weapon at any range, for bots and humans.
- Default AR: body 25, limbs 18. Default handgun: body 20, limbs 15. Shop weapons vary within +-20 percent.
- Hitboxes per bone (head, neck, torso, pelvis, upper/lower arms, upper/lower legs), following the animated skeleton.
- All shots are raycasts (three-mesh-bvh) against the world and the hitboxes. Bullet drop and travel time are not required; tracers are visual only.

Ghillie suit: every character always wears one, including the first-person arms. Tall grass plus crouch/prone makes you hard to see; bot perception accounts for stance, grass at target, distance, movement, muzzle flash and suit color vs terrain.

Controls: WASD move, Shift sprint, Space jump, C crouch (toggle), Z prone (toggle), LMB fire, RMB aim down sights, R reload, 1 rifle, 2 handgun, 3 bandage, 4 grenade (hold to cook, release to throw), mouse wheel cycles, Tab scoreboard, Esc pause menu. Key bindings shown in the pause menu.

Bots:
- Always exactly 100. Navigation on a navmesh or equivalent, cover use, peeking, strafing, crouch/prone in grass, bandage use when hurt, grenade use against enemies in cover, objective play in Conquer, flanking.
- Human-like aim: reaction time, tracking error, recoil, reduced accuracy at range and while moving. A skilled player can top the Normal scoreboard; bots are still dangerous.
- Bots have names (e.g. "Viper", "Hollow", ...), shown in kill feed and scoreboard.

Main menu:
- Single player: choose mode, start (you + 100 bots).
- Multiplayer: Host (choose mode, shows room code, lobby with up to 4 humans, Start) or Join (enter code).
- Shop: buy weapons and ghillie suits with money; Loadout: equip owned items.
- Settings: mouse sensitivity, ADS sensitivity, FOV, graphics preset (Medium, High, Ultra), render scale, master/music/effects volume.
- Quit returns to the menu from the pause menu.
- The menu has a live 3D background scene of the game world with a ghillie soldier, AAA-grade UI typography and motion.

Economy:
- Only winning pays: Normal win (you top the scoreboard) 1000, Team or Conquer win 500. Draws and losses pay 0.
- Shop: 3 extra assault rifles and 2 extra handguns, each with own model and stats; 5 extra ghillie variants (desert, snow, autumn, swamp, urban) besides the default woodland.
- Prices: first purchase after about 2 wins, the most expensive item after about 10 wins.
- Equipped items are visible to other players in multiplayer.
- Save in localStorage with a version field; a corrupt save resets without crashing.

HUD: health bar, magazine ammo with infinity reserve symbol, bandage and grenade counts, current weapon, round timer, own and leader kills (Normal) or team scores (Team, Conquer), Conquer base status A-D with capture progress and owner colors, kill feed, hit marker (distinct headshot marker and kill confirm), damage direction indicator, compass bar, minimap, spawn/death screen with killcam info (killer name, weapon, distance), scoreboard on Tab, round-end screen with winner and payout.

## 4. Tech spec

- three.js current stable release, pinned, WebGLRenderer (WebGL2). Libraries vendored under vendor/ and loaded through an import map; the user never runs npm install.
- Allowed libraries: three + addons (GLTFLoader, DRACOLoader or MeshoptDecoder, KTX2Loader, CSM, etc.), three-mesh-bvh, postprocessing (pmndrs) + n8ao, peerjs, recast-navigation (optional), @dimforge/rapier3d-compat (optional). Nothing else without a reason written in ARCHITECTURE.md.
- Start: double-click Start.bat. It starts server.js (Node, no dependencies, serves the project and serves the models folder under /models) on port 8790 and opens Chrome at http://localhost:8790. If the port is taken by our own server, it just opens the browser.
- Raycasts: all hitscan shots, bot line-of-sight, grenade cover, footstep surface detection and spawn visibility use raycasts (three-mesh-bvh).
- Simulation: fixed 60 Hz gameplay tick, rendering interpolated; all timing in seconds, never in frames.
- Debug/QA hooks: window.__GO exposes read-only state and a small command API for QA (teleport, set time, spawn test bot, run bench). Query flags: ?mode=normal|team|conquer&autostart=1 skips the menu, ?bench=1 runs the scripted benchmark, ?seed=N fixes randomness, ?netsim=latency,jitter,loss simulates a bad network, ?selftest=1 runs the full selftest.

Performance gate (must hold on the user's PC):
- Conditions: preset High, 3840x1080, render scale 1.0, 100 bots + the local player, Conquer with an active firefight, the `?bench=1` run (60 s: flythrough over the map bookmarks, then a scripted firefight in dense grass with grenades).
- CPU frame time (main thread, per frame) p99 <= 11 ms.
- GPU frame time p99 <= 14 ms, measured with EXT_disjoint_timer_query_webgl2; if unavailable, measure with gl.finish-bracketed frames in a separate diagnostic pass.
- Frame-time histogram and the numbers are written by the bench to the console and to qa output.
- Presets Medium and Ultra must exist; Ultra may exceed the gate.
- Headless FPS counters do not count as evidence on their own; frame-time measurements do.

Selftest:
- Every module registers its own checks with the selftest registry.
- Silent when all checks pass; on failure it prints module, file:line and reason.
- One failing module never stops others (each check isolated in try/catch with location).
- Includes accelerated simulations (at least 20x) of full 15-min rounds for all three modes: timer, scoring, 1000-point end, respawn, loadout refill, encounter interval per human.

## 5. Map

- Look (user wish, binding): hilly and green. Lush rolling green hills everywhere, saturated healthy grass meadows, green forests; hills dominate the silhouette and the horizon. Rock, dirt and the quarry are accents, never the main impression. No desert, dry or autumn-brown overall palette.
- Playable area 2 km x 2 km, plus low-detail terrain to the horizon (at least 8 km visible).
- Content density (user, binding): the map is full of life, not just trees, bases and rocks: farm fields and pastures with fences and hay, dirt and gravel roads with ruts, hedgerows, stone walls, power and telephone lines, farm machinery and abandoned vehicles, ruins, sheds, wells, signposts, wood piles, streams and ponds, flower meadows, bushes and undergrowth everywhere, plus military clutter around bases (trenches, sandbags, crates, wrecks).
- Beyond the map (user, binding): the horizon is dressed like a real landscape: continuing forests, fields with patchwork colours, distant villages and farms, roads, power lines, and higher hills or mountains with atmospheric perspective. Never bare empty hills.
- Distance rendering (user, binding): grass, trees and objects never disappear with distance. Real grass geometry is drawn everywhere in view (a shader imitation of far grass is not accepted), every tree instance is drawn at every distance (impostors far). Optimize with GPU-procedural instancing, LOD and density compensation, never by culling visible content to nothing.
- No visible optimization (user 2026-10-07, binding): tree leaves are real 3D and realistic at every distance the eye resolves. Performance comes first from per-frame frustum and conservative occlusion culling of small chunks (nothing pops when turning fast). LOD only where invisible (projected error below about 1 pixel at 3840x1080), proven by A/B shots against forced full detail. No impostors or tiers that look different.
- Terrain: baked 16-bit heightmap with designed features: river valley with a bridge, rolling hills, forest belts, open meadows with tall grass, rock outcrops and cliffs, a ruined farm, a radio tower hill, a quarry, a small village, trenches/bunker line.
- Red and Blue team bases at opposite ends. Conquer bases A-D at distinct landmarks (e.g. A farm, B radio tower, C village, D quarry), each with meaningful cover, readable from a distance (flags).
- Materials: splat-mapped PBR terrain (grass, dirt, rock, mud, gravel, sand/river bed) with triplanar rock on slopes, macro variation, detail normal maps, no visible tiling at any distance.
- Water: river with reflections/refraction, shoreline foam or wetness.
- Collision: every visible solid object blocks movement and bullets; no invisible walls except the map border (soft border with warning and out-of-bounds damage).

## 6. Visual spec

- PBR everywhere, HDRI-lit sky or physical sky with sun, cascaded shadow maps that stay sharp near the player and cover at least 300 m, ambient occlusion, bloom, filmic tone mapping (ACES or AgX), SMAA or TAA, height fog / aerial perspective, color grading.
- Dynamic grass: GPU-instanced blades or clumps, dense to ~80 m and fading seamlessly by ~250 m into a terrain-matched color with no visible ring; wind as traveling gusts; bends away from players and bots; flattens briefly from grenade blasts; receives shadows; tall enough in meadows to hide a prone player.
- Trees and bushes sway in wind; LOD/impostors for distance; no pop-in visible at normal play speed.
- Weapons: first-person viewmodel in its own pass with its own FOV, ADS with sight alignment, sway, bob, recoil with recovery, muzzle flash with light, tracers, shell ejection, surface-specific impacts (dirt, rock, wood, metal, water, flesh) with particles and decals, grenade explosion with fireball, smoke, debris, shockwave, dust.
- Characters: ghillie strands with volume and wind response, smooth blended animations, IK or procedural aim pitch, death animation or ragdoll, hit reactions.

## 7. Assets

- Only assets the game actually needs, each at AAA quality. The user never does anything by hand and never logs in anywhere.
- Sources in this order: (1) CC0 downloads without login: Poly Haven (api.polyhaven.com: models, textures, HDRIs), ambientCG (PBR textures), Quaternius (e.g. Universal Base Characters and Universal Animation Library, CC0), Kenney, OpenGameArt CC0; (2) CC-BY sources without login, credited; (3) building the model in Blender via the Blender MCP tools.
- No Mixamo, no Sketchfab login downloads, nothing with a non-free license.
- Blender pipeline for every model (binding user rules): build or import the model in Blender through the Blender MCP tools; look at a viewport screenshot/render, fix, only then export. Before export check: proportions, origin on the floor, scale in meters, front faces -Y in Blender (glTF export converts), modifiers applied, materials set, no loose objects. Export as .glb to C:\Users\Leschke\Downloads\Models\GhillieOps, one file per object, file name equal to object name. Compress (meshopt and/or KTX2) where it helps.
- In game: load every model via GLTFLoader, with a primitive placeholder as fallback if the file is missing (a missing file is logged as an error; from aspect 4 on any visible placeholder is a FAIL).
- Terrain from heightmap, grass instancing, particles and decals are generated at runtime (allowed exceptions to "every model in Blender").
- Textures without a CC0 source: ComfyUI (`node C:\Users\Leschke\ComfyUI_windows_portable\generate.js "<prompt>" <name.png>`, output lands in C:\Users\Leschke\Downloads\Images; if the server is not answering start `C:\Users\Leschke\ComfyUI_windows_portable\python_embeded\python.exe -s C:\Users\Leschke\ComfyUI_windows_portable\ComfyUI\main.py --port 8188` in the background and wait ~35 s), then made tileable with derived normal/roughness maps. Stop ComfyUI again when done (it holds VRAM).
- Sounds: CC0 recordings (OpenGameArt CC0, Kenney, Poly Haven has none, freesound only if downloadable without login) or high-quality synthesis with WebAudio; positional 3D audio.
- CREDITS.txt lists every external asset with source URL and license.

## 8. Multiplayer (PeerJS)

- PeerJS with its public cloud broker (0.peerjs.com), no own signaling server. Host shows a short room code (derived peer id, e.g. "GOPS-7K2Q"); up to 3 guests join with the code.
- Host-authoritative: the host simulates bots, damage, scoring, rounds. Guests run client-side prediction for their own movement with server reconciliation; hits are lag-compensated on the host (rewind hitboxes to the shooter's view time, capped at 250 ms).
- Two channels: reliable ordered for events (kills, spawns, chat, round state, loadout, shop items), unreliable unordered for snapshots/inputs if PeerJS allows; otherwise reliable with sequence numbers and dropping stale data.
- Snapshots 20-30 Hz with delta/quantization; remote players and bots rendered with snapshot interpolation using an adaptive jitter buffer (target ~100 ms, grows with measured jitter), Hermite/velocity interpolation, extrapolation up to 250 ms then smooth correction, never teleport-snapping unless error > 3 m.
- Every animation replicates: locomotion (speed, direction, stance, sprint, jump, land), aim pitch/yaw, fire (muzzle flash, tracer, shell, sound), reload, weapon switch, grenade cook/throw, bandage use, hit reactions, death, respawn, ghillie variant and weapon skins.
- Must look smooth at 200 ms latency, +-60 ms jitter and 5 percent loss (?netsim=200,60,5).
- Join mid-match allowed while fewer than 4 humans; host leaving ends the match for all with a message; guest leaving removes the player cleanly.

## 9. Code rules (binding user rules)

- No comments in code. No emojis anywhere (code, UI, logs, docs).
- Minimal code that solves the problem; no speculative features, no abstraction for one-off code. Every created file must be necessary.
- Self-checks live in the code itself: assertions and console checks, registered in the selftest; silent on success; on failure report location and reason; each section encapsulated so its failure is reported with line and reason instead of breaking the rest.
- After each section: static check for syntax, names, calls, signatures, paths, declaration-before-use.
- No separate test files beside the code, except the QA tooling under tools/ and critic scripts under qa/.
- Tests and QA runs are headless or offscreen only. Never open a fullscreen or foreground window on the user's screen, never use computer-use/screen-control tools, never steal focus. Blender is operated only through the Blender MCP tools.
- Do not modify files outside C:\Users\Leschke\Downloads\GhillieOps and C:\Users\Leschke\Downloads\Models\GhillieOps (except downloading tools into GhillieOps/tools and ComfyUI outputs in Downloads/Images).

## 10. Aspects and acceptance criteria

The build runs stage by stage. Every stage keeps all earlier stages working (regressions are FAIL). Criteria ids are cited by critics.

Build order (binding, replaces the A-numbering as the order of work; criteria ids stay):
- S1 Foundation = A1 (done by the fix round of 2026-10-01, verify only).
- S2 World = A4 + A5 + A6: hilly green 2 km map, terrain, environment assets, vegetation, dynamic grass, lighting. Free-fly and walk camera to look at it.
- S3 Player and weapons = A3 + A7: first-person arms and weapons, controller, combat, grenades, bandages. Playable in the world against static target dummies.
- S4 Characters and bots = A2 + A8: ghillie soldiers, animation, 100 bots, director. The game is playable in Normal after S4.
- S5 Modes, menus, shop, HUD, save = A9.
- S6 Audio = A10.
- S7 Multiplayer = A11.
- S8 Performance, polish, final = A12.

Work-scope rules for builders and fixers:
- Deliver the criteria, nothing more. Stop when they are met and verified once.
- A fixer fixes exactly the listed BLOCKERs (and listed MINORs if asked), verifies each once, and stops. No re-tuning of things that were not listed, no repeated measurement loops, no polishing of temporary test scenes.
- Lighting, bloom and shadow tuning happens in S2 against the real world and in S8, never against a test scene.

### A1 Foundation
- A1-01 Folder layout per ARCHITECTURE.md; Start.bat + server.js work (server serves project and /models, correct MIME incl. .wasm, .glb, .ktx2, .bin, .json; no caching problems for dev).
- A1-02 Vendored pinned libraries with VERSIONS.txt; import map; no CDN requests at runtime.
- A1-03 Renderer setup (WebGL2, sRGB output, tone mapping, shadows, resize, DPR/render scale), fixed 60 Hz sim + interpolated render, input system with pointer lock and raw mouse, pause handling.
- A1-04 Asset loader: GLTFLoader + compression decoders, placeholder fallback with logged error, loading screen with real progress.
- A1-05 Selftest registry and ?selftest=1; __GO debug API; query flags parsed.
- A1-06 tools/qa.mjs: launches Chrome headless (new headless, GPU enabled, ANGLE D3D11) or offscreen at a given size, loads a URL with flags, collects console errors/warnings, page errors and failed requests, takes screenshots at given times or after given __GO commands, records frame-time stats (CPU per frame, GPU timer query if available), writes JSON + PNGs to a given folder. Documented usage in ARCHITECTURE.md.
- A1-07 ARCHITECTURE.md describes modules and data flow for all later aspects (world, vegetation, render, player, weapons, characters, bots, director, modes, ui, audio, net), so later builders plug in without rewrites.
- A1-08 A temporary test scene (flat ground, a lit PBR test object, sky) proves render pipeline, input, loop and loader; zero console errors.

### A2 Characters (third person)
- A2-01 One rigged humanoid soldier (realistic proportions, not toon) in a full ghillie suit: layered strands/cards with volume, hood, visible rifle-holding pose support; 6 ghillie variants (woodland default, desert, snow, autumn, swamp, urban) via materials/textures; team identification (red/blue armband or tag) that stays subtle but readable.
- A2-02 Animation set: idle, walk/run/sprint in 8 directions (or blendable fwd/back/strafe), crouch idle/walk, prone idle/crawl, jump/fall/land, fire (additive/upper body), reload rifle and pistol, weapon switch, grenade throw, bandage use, hit reactions, at least 2 death animations. Clean loops, no foot sliding at the speeds used in game, no popping.
- A2-03 Third-person weapon models attach to the hand bone correctly for AR and handgun.
- A2-04 Performance design for 100 characters: LODs (at least 3) and a scheme (e.g. baked vertex-animation textures with instancing, or skinned LOD + animation LOD) proven by a stress scene with 104 animated characters at the gate conditions.
- A2-05 Hitbox capsules per bone driven by the skeleton, visualizable via __GO.
- A2-06 Viewer scene (?view=characters) showing all variants and animations, for critic screenshots.

### A3 First-person arms and weapons
- A3-01 First-person arms in ghillie sleeves with gloves, realistic, matching all ghillie variants.
- A3-02 Weapon models: default AR, default handgun, 3 shop ARs, 2 shop handguns, frag grenade, bandage roll. Detailed (AAA hero-asset level for first person), PBR textures, working sights; each weapon exported as its own .glb with named sockets (muzzle, ejection port, magazine, sight).
- A3-03 First-person animations per weapon: idle, draw, holster, fire (with bolt/slide motion), reload (tactical and empty), sprint pose, ADS pose; grenade: pull pin, cook, throw; bandage: unwrap and apply.
- A3-04 Viewer scene (?view=weapons) with all weapons and animations.

### A4 Environment assets
- A4-01 Rocks/cliffs, trees (at least 3 species, with LODs/impostors), bushes, ferns, grass clumps (Blender-made blades/clumps), fallen logs, the landmark structures (ruined farm, radio tower, village houses, quarry machinery, bridge, bunkers/trenches, team base structures, capture flags), props (crates, sandbags, fences, barrels).
- A4-02 PBR texture sets for terrain layers and structures; HDRI sky.
- A4-03 All models follow the Blender pipeline in section 7; no placeholder anywhere.

### A5 World and terrain
- A5-01 2x2 km map per section 5 with the designed features, heightmap baked by a tool under tools/, terrain LOD without cracks, horizon terrain.
- A5-02 Splat-mapped terrain material without visible tiling; river water.
- A5-03 Placement of all environment assets with collision (BVH) and correct grounding (no floating/sunken objects).
- A5-04 Navigation data for bots (navmesh or grid) covering the map, with the landmarks and bases.
- A5-05 Team bases and Conquer bases A-D placed per section 5.

### A6 Rendering, lighting and vegetation
- A6-01 Lighting and post per section 6; time of day chosen for beauty and to keep the green hills lush and saturated (sunny late morning or early afternoon, warm but not golden-brown), consistent sun/sky/fog.
- A6-02 Dynamic grass per section 6 (wind gusts, character bending, grenade flattening, shadows, seamless fade).
- A6-03 Tree/bush wind animation, LOD transitions without visible popping.
- A6-04 Screenshots from 8 map bookmarks look like a current AAA shooter.
- A6-05 Performance gate holds for the world + vegetation alone with headroom for 100 bots.

### A7 Player and combat
- A7-01 Character controller: capsule vs BVH world, slopes, steps, walk/sprint/crouch/prone/jump, stamina for sprint optional, smooth camera, head bob, landing dip, no getting stuck, no falling through.
- A7-02 Weapons per section 3 and 6 with raycast hits, recoil patterns, ADS, reload, infinite reserve, switching; headshot instant kill; damage per hitbox.
- A7-03 Grenades (cook, throw arc preview optional, physics bounce with BVH, fuse, damage falloff, cover raycast, effects).
- A7-04 Bandages (3 s animation, +40 HP, cannot shoot, cancel on switch).
- A7-05 Death and respawn flow with death screen and spawn choice per mode; loadout refilled.
- A7-06 Feedback: hit markers, headshot marker, kill confirm, damage direction, camera shake, audio hooks.

### A8 Bots and director
- A8-01 100 bots with the behaviors of section 3, performant (AI staggered, e.g. 10 Hz decisions per bot, LOD for far bots).
- A8-02 Bots use the same weapons, hitboxes, damage rules, bandages and grenades as humans.
- A8-03 Director guarantees the encounter rule; selftest simulation proves it over full rounds in all modes.
- A8-04 Bots in Conquer attack/defend bases sensibly; in Team/Conquer they respect teams.
- A8-05 A skilled player can win Normal; bots are neither aimbots nor idiots (measured: bot hit rate vs moving player at 50 m between 10 and 30 percent).

### A9 Game modes, menus, shop, HUD, save
- A9-01 Normal, Team, Conquer per section 3, round flow, scoreboard, round end, payout.
- A9-02 Main menu with live 3D background, Single player, Multiplayer (UI flow; networking wired in A11), Shop, Loadout, Settings.
- A9-03 Shop and economy per section 3; purchases persist; equipped items used in game.
- A9-04 HUD per section 3, AAA-grade design (clean, readable at 3840x1080 and 1920x1080), no overlaps.
- A9-05 Save/versioning/corruption handling.

### A10 Audio
- A10-01 Weapon sounds (close, distant, tail by environment), reloads, grenade, explosions, footsteps by surface, foley for ghillie movement, bullet cracks/whizzes near the player, impacts, ambient (wind, birds, insects, river), UI sounds, menu music.
- A10-02 Positional 3D audio with distance attenuation and occlusion approximated by raycast, volume settings.

### A11 Multiplayer
- A11-01 Host/Join/lobby via PeerJS per section 8, up to 4 humans + 100 bots.
- A11-02 Smooth remote movement and all animations replicated per section 8, verified with two headless clients and ?netsim=200,60,5.
- A11-03 Lag-compensated hits, correct kill credit, scores, round state and payouts on all clients.
- A11-04 Join mid-match, guest leave, host leave handled cleanly.

### A12 Performance, polish and final acceptance
- A12-01 Performance gate of section 4 holds with everything on.
- A12-02 All carried-over issues fixed.
- A12-03 Full playthrough of each mode (accelerated where needed) without errors; full selftest silent.
- A12-04 Final critic confirms the AAA bar across all areas and the original request point by point.

## 11. Critic protocol (applies to every aspect)

- G-01 The critic is harsh and independent. It never trusts builder claims; it verifies by running the game headless/offscreen with tools/qa.mjs, reading code and looking at screenshots itself (Read tool on the PNGs).
- G-02 Every criterion of the aspect is checked with evidence (screenshot path, measurement, code location).
- G-03 AAA bar check: the critic compares what it sees against current AAA shooters and names concrete visual/feel defects.
- G-04 Regression check of all earlier aspects (quick smoke: selftest, console errors, one screenshot per earlier viewer/scene).
- G-05 Code rules of section 9 (no comments, no emojis, self-checks present and silent, no dead or speculative code).
- G-06 Verdict: PASS or FAIL. Issues are BLOCKER (violates a criterion, the AAA bar, the original request, or a code rule) or MINOR (polish). Any BLOCKER = FAIL. MINOR issues alone = PASS; they are carried to A12.
- G-07 Each issue: id, severity, criterion id, evidence, exact expected result. Fixable and specific; no vague "make it better".
- G-08 Judge what the player sees, hears and feels, and the original request. Infrastructure internals (tooling, measurement methods, doc wording, internal APIs) are MINOR unless they break the game, the performance gate or a later stage.
- G-09 Expected results are observable behavior or visible in a screenshot. Do not invent numeric pixel metrics (hue degrees, per-pixel thresholds) as acceptance; the performance gate numbers in section 4 are the only numeric gates besides the criteria.
- G-10 Rounds >= 2: re-check only the previous BLOCKERs and regressions. A new BLOCKER is allowed only for a severe, player-visible defect or a violation of the original request; everything else new is MINOR.
- G-11 At most 3 FAIL rounds per stage; after that the remaining issues are carried to S8 and the build moves on.
- G-12 Time box: a critic run should take about 30 minutes; spend it on the most player-relevant checks first.

## 12. Report formats

Builder / fixer final message:
```
ASPECT: <id>
DONE: <criteria ids believed met>
FILES: <created/changed files, one per line>
QA: <commands run and results in one line each>
KNOWN GAPS: <honest list or none>
```

Critic final message:
```
ASPECT: <id> ROUND: <k>
VERDICT: PASS | FAIL
ISSUES:
ISSUE-<n> | BLOCKER|MINOR | <criterion id> | <evidence> | <expected>
EVIDENCE FILES: <paths>
```
