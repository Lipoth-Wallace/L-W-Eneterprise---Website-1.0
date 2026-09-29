# Bloodflint

A 1v1 online caveman arena shooter. Spear and sling, one-hit kills, slide-jump
movement. Low-res brutalist cave lit red.

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm test           # physics, combat and map tests
```

On Windows you can double-click `start-windows.bat` instead. It installs
dependencies on the first run, starts the server and opens your browser. The
server window also lists a `same network:` address that other devices on your
Wi-Fi can use to join.

Open two browser windows. In the first, click **Private room**. In the second,
type the four-letter code and click **Join**. **Quick match** pairs you with
anyone else who is waiting.

## How it plays

Default controls (all rebindable under **Settings → Controls**):

| Input | Action |
| --- | --- |
| `WASD` | Move (walk) |
| `Shift` | Sprint. With **Auto sprint** on you always run, and Shift walks. |
| `Ctrl` / `C` | Slide (crouch while moving) |
| `Space` | Jump. Tap it as you land to bunny hop (bind the mouse wheel to jump for easier timing) |
| `LMB` | Stab (spear out) or sling shot (sling out) |
| `RMB` | Hold to draw the spear back (0.18 s), release to throw |
| `F` | Quick stab from either weapon |
| `E` | Scan (every 3.75 s) |
| `Q`, `1`/`2`, wheel | Swap weapon |
| `R` | Restart the parkour course (practice) |

**Ctrl and Ctrl+W:** browsers normally close the tab on Ctrl+W, and you press
W while sliding. In Chrome and Edge the game goes fullscreen and locks the
keyboard (the Keyboard Lock API), so the game receives the keypress instead.
Other browsers ask "Leave site?" before closing. Hold `Esc` to leave
fullscreen.

- **Every hit kills.** Deathmatch, first to 10.
- **Spear:** the stab reaches about 2.8 m. The throw needs a short windup,
  which your opponent can see as your arm cocking back. The throw has a much
  fatter hitbox than the sling (+0.45 m on every side) but costs you the
  spear until you walk over it. A spear that lands somewhere you can't reach
  flies back after 15 s. The server enforces the windup.
- **Sling:** hitscan with an exact hitbox and a 0.8 s reload.
- **Movement** rewards timing, not holding keys (think Straftat):
  - **Bunny hopping:** press jump in the tenth of a second before you land
    (or within 0.05 s after) and you keep all your speed. The speed readout
    flashes gold and ticks on a perfect hop. Holding jump only jumps once;
    a late press lets ground friction eat your speed. Bind the mouse wheel
    to jump (Settings → Controls) to time hops the classic way.
  - **Slides:** a fresh crouch press boosts you to at least 16 m/s, and the
    slide holds its speed. Press crouch in the air and you land straight
    into a boosted slide. Holding crouch through a landing still slides,
    but with no boost. Jumping out of a slide keeps its speed.
  - **Air:** strafing while turning adds speed (Quake-style). Holding just
    forward steers you toward where you look without adding speed: enough
    to line up a landing.
  - **Stairs:** sliding carries you up, but each step costs some speed;
    sliding down hugs the steps and speeds you up. The jump is low (about
    1.3 m).

## Seeing in the dark: the scan

The world near you is lit well enough to read, but every map has a mist: a
fog that swallows anything far off, plus a thin drifting layer of ground
mist. Distant fighters are hard to spot. The
scan (`E`, every 3.75 s) is how you cut through that. It's inspired by Hunt:
Showdown's Dark Sight:

- A pair of eyes shoots out of you, growing exponentially.
- A wavefront expands through a **cone in front of you** (40° each side,
  60 m). Any fighter it reaches shows up **through walls and foliage** for
  about 2 seconds as a sliced amber ghost of their own body. It keeps their
  build, but it's cut into thin flickering slices that drop out and shear
  sideways, and a churning amber shroud rides along with them to blur the
  head and edges. A moving fighter also drags a mist trail behind them that
  points back the way they came, so you can read their direction.
- The eyes are two kites joined at the middle, 80% see-through, each shaded
  yellow to red to black. They push out of your chest into the world and grow
  exponentially to three times your height. They light the surfaces they pass
  and splat flat against the first wall in their way. **Only you see them**;
  your opponent just hears a faint whisper from your direction.

## Hitboxes

Both fighters share one skeleton, so they fill the same space and every pose
has a hitbox matched to it: standing, crouched, or long and low for a slide.
The boxes turn with the player's facing. `test/hitbox.test.js` measures every
pose of both skins and fails if anything visible pokes out of its box (beyond
0.07 m) or the box sits well above the head. That means a shot that looks
like a hit is a hit. Weapons are the one exception: a spear sticking out of
the box isn't part of the target.

## Arenas

Pick one on the title screen (**Random** by default). A room keeps the map it
was created with, and anyone who joins by code plays on that map.

- **The Kiln:** the 60 x 60 m brutalist cave.
- **The Thicket:** a 90 x 90 m night forest under the red moon (1.5x the Kiln
  on each side), with a ruined shrine in the middle. It has about 50 trees:
  the trunks block shots, the canopy doesn't. There are logs and boulders for
  cover, and **8 bushes**. Stand inside a bush and nobody can see you: you
  see out through faded leaves, they see a solid bush. Stones still go
  through foliage, moving inside a bush rustles, and a scan will find you.

## Relic Run

A second mode, picked on the title screen, played on **the Caldera**: a round
volcanic basin 225 m across (2.5x the Thicket), walled in by a ring of tall
mountains. There are no square edges. The terraces, the crater rim, the
boulders and the mountain wall are all round, and running into one turns you
along its curve instead of stopping you, so you can carve round the volcano
at speed.

- A giant human skull hovers in the crater at the summit. Touch it and it's
  yours, dragged behind you on a lead. **Dragging it costs 25% of your
  speed.** Drag it into **your own cave** to score: west cave for the first
  player, east cave for the second. First to 3 captures wins. Kills don't
  score, but killing the carrier makes them drop the skull where they fell,
  and anyone can grab it. A skull nobody touches for 25 s goes back to the
  crater.
- **The fuse.** For 45 s after you take the skull you must keep moving at
  **10 m/s or more**. Drop under it and a red countdown starts: get back up
  to speed before it ends, or the skull bursts and kills you (it drops where
  you die). Whoever creates the room picks that **burst timer** on the title
  screen: 1, 2, 3, 5 or 8 s (3 by default). Dragging it costs speed, so a sprint alone won't cut it: chain slides
  and hops. Everyone sees the fuse; your opponent also sees when you're
  slowing. After 45 s the fuse is spent and you can walk (flip
  `RELIC_FUSE_EXPLODES_AT_END` in `shared/constants.js` to make it burst
  instead).
- **Launch pads** throw you up at a fixed speed along the way you were
  heading when you hit them; stand still on one and it throws you up to the
  next tier.
- An enemy scan shows the skull carrier as a **dark red** ghost and mist
  instead of amber.
- The volcano has four levels: the plains, two round terraces and the
  boulders of the crater rim, with a gap on every side.
  Sprint straight up the stairs (every step is under the auto-step height),
  or use the glowing **launch pads** on the diagonals, which fling you a whole
  tier up (ground pads to the crater floor, crater-floor pads onto a rim
  boulder). The pads also work while you're carrying the skull.
  `test/volcano.test.js` plays the climb and every pad, with and without the
  skull. It also flood-fills the map to prove nothing on foot gets past the
  mountains.
- The skull is a real photogrammetry-grade human skull mesh (CC0, see
  `public/assets/CREDITS.md`) and it deliberately doesn't belong. It's the
  one thing drawn at full screen resolution: antialiased, with physically
  based bone, baked occlusion in every suture and socket, its own clean
  studio lighting and filmic tone mapping. Everything around it stays chunky
  and dithered. Walls and your own hands still hide it. It turns slowly to
  watch whoever looks at it, and it breathes.
- It's 1v1 for now: each "team" is one player. Real teams (2v2 and up) need
  the server's rooms, spawns and scoring reworked around teams.

## Practice range

**Practice range** on the title screen runs offline in the browser, with no
server needed. The map, *The Quarry*, is open to a red night sky:

- **Shooting range** (in front of you): fighters from 9 m to 75 m, in
  different poses and light: crouched, lit by a brazier, behind waist cover,
  sliding in shadow, on a ledge against the sky, and far off. Hits drop them
  for 1.5 s. The HUD tracks hits, shots and accuracy.
- **Parkour course** (behind you): a timed run over a blood pit with a
  4 m gap, a slide tunnel, a 7 m gap that needs a slide-jump, stepping
  stones, and a 9 m drop-gap off a step. It has one checkpoint, and your best
  time is saved on this browser. A walkway leads back to the start.
  `test/course.test.js` plays each gap with scripted inputs to prove it's
  possible and needs the intended move.

## Sound and style

- **Music:** eight original beats, synthesised live, each with its own
  kit and instruments: *Kiln Cypher* and *Flint Street* (swung Rhodes
  boom-bap), *Bone Yard* and *Obsidian Walk* (steady), *Tar Pit* (half-time
  808, strings and a bell arpeggio), *Ember Crown* (rimshots, strings and a
  plucked melody), *Blood Drum* (tribal toms and brass) and *Slow Burn*
  (half-time piano and a whistle). Mixed clean: no hi-hats, hiss,
  distortion or clicks. They're new compositions, not samples or covers. The beat muffles while
  you're dead or paused.
- **No ambient sound:** you hear the fight and the beat, nothing else.
- **Mixer:** Settings → Audio has sliders for master, weapons, kills &
  deaths, movement, interface and music, plus a beat picker.

## Layout

```
server/index.js    HTTP + WebSocket server, rooms, snapshot loop
server/room.js     One match: hit checks, lag compensation, spear, score
shared/            Code the server and browser both load
  constants.js     Every tuning number
  map.js           Map registry (arenas + practice map)
  maps/kiln.js     The Kiln: 1v1 cave arena
  maps/thicket.js  The Thicket: 1v1 forest arena
  maps/volcano.js  The Caldera: Relic Run map
  maps/range.js    The Quarry: practice range and parkour course
  physics.js       Player movement (box and cylinder colliders)
  raycast.js       Hitscan maths, per-pose turning hitboxes
  scan.js          Scan wave and cone maths
public/            The client (three.js, no build step)
  js/main.js       Input, networking, interpolation, camera, HUD
  js/world.js      Cave scene built from shared/map.js
  js/characters.js GRUK and VESH, the two fighters
  js/viewmodel.js  First-person hands and weapons
  js/post.js       Low-res render, dither, vignette, full-res skull overlay
  js/effects.js    Tracers, blood, embers, ground spears
  js/audio.js      Synthesised sound, mixer channels and the beats
  js/settings.js   Settings, keybinds, the Settings panel
  js/scan.js       The scan: eyes, wave, through-wall highlight
  js/skull.js      The relic: scanned skull (full-res pass), lead, dragging
  assets/          skull.glb (built by scripts/prepare-skull.mjs) + CREDITS
test/              node:test suites
```

## Netcode

- **Movement** runs on your own machine and is sent at 60 Hz, so it feels
  instant. The server rejects moves that are impossibly fast or out of bounds
  and snaps the player back.
- **Hits** are decided by the server. Each shot carries the moment on the
  shooter's screen it was aimed at. The server rewinds the target to that
  moment (at most 250 ms back) and casts the ray against the map and the
  target's hitbox.
- **Other players** are drawn 100 ms in the past, interpolated between 30 Hz
  server snapshots.

Known gap: the server checks movement speed but not wall collision, so a
modified client could clip through walls. Before a public launch, the fix is
for the server to also run `shared/physics.js` on submitted inputs.

## Offline test page

`npm run build:offline` bundles the whole client into one self-contained
HTML file (`dist/bloodflint-offline.html`). It has no server, so the online
buttons are hidden. It keeps the practice range, the parkour course, and solo
walks of the Kiln, the Thicket and the Caldera, plus a **Solo Relic Run**
that runs the real server rules inside the page. Handy for a quick look in
any browser.

## Deploy

This needs a host that keeps a Node process and WebSockets running. Static
hosting (GitHub Pages, Netlify, a Wix site) can't run it.

- **Render:** create a new Web Service from this repo. Build command
  `npm install`, start command `npm start`. Render sets `PORT` itself.
- **Fly.io / Railway:** also work with `npm start`; each picks up `PORT`.

`GET /healthz` returns `{ ok: true }` for health checks.

Desktop only for now: it needs a mouse and keyboard (pointer lock).
