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
| `Space` | Jump (hold to bunny hop) |
| `LMB` | Stab (spear out) or sling shot (sling out) |
| `RMB` | Hold to draw the spear back (0.18 s), release to throw |
| `F` | Quick stab from either weapon |
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
- **Sling:** hitscan with an exact hitbox and a 1.25 s reload.
- **Movement:** a slide boosts you to at least 16 m/s and holds its speed.
  Jumping out of a slide keeps that speed. Landing with crouch still held
  drops you into another slide. Air strafing adds speed. The jump is low
  (about 1.3 m).

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

- **Music:** three original 90s boom-bap beats, synthesised live: *Kiln
  Cypher*, *Red Moon Blues* and *Flint Street*. They use swung hats, dusty
  drums, Rhodes-style chords, bass and vinyl crackle. They're new
  compositions in that style, not samples or covers. The beat muffles while
  you're dead or paused.
- **Mixer:** Settings → Audio has sliders for master, weapons, kills &
  deaths, movement, cave ambience, interface and music, plus a beat picker.
- **Gold chain:** every fighter wears one. In first person, yours is a small
  physics sim: it swings with you and whips into view on slides and hard
  landings. It flashes on kills and jingles when it swings hard. Turn it off
  under **Settings → General → Gold chain in first person**.

## Layout

```
server/index.js    HTTP + WebSocket server, rooms, snapshot loop
server/room.js     One match: hit checks, lag compensation, spear, score
shared/            Code the server and browser both load
  constants.js     Every tuning number
  map.js           Map registry (MAP = the online arena)
  maps/kiln.js     The Kiln: 1v1 cave arena
  maps/range.js    The Quarry: practice range and parkour course
  physics.js       Player movement
  raycast.js       Hitscan maths
public/            The client (three.js, no build step)
  js/main.js       Input, networking, interpolation, camera, HUD
  js/world.js      Cave scene built from shared/map.js
  js/characters.js GRUK and VESH, the two fighters
  js/viewmodel.js  First-person hands and weapons
  js/post.js       Low-res render, dither and vignette pass
  js/effects.js    Tracers, blood, embers, ground spears
  js/audio.js      Synthesised sound, mixer channels and the beats
  js/settings.js   Settings, keybinds, the Settings panel
  js/chain.js      First-person gold chain (verlet rope)
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

## Deploy

This needs a host that keeps a Node process and WebSockets running. Static
hosting (GitHub Pages, Netlify, a Wix site) can't run it.

- **Render:** create a new Web Service from this repo. Build command
  `npm install`, start command `npm start`. Render sets `PORT` itself.
- **Fly.io / Railway:** also work with `npm start`; each picks up `PORT`.

`GET /healthz` returns `{ ok: true }` for health checks.

Desktop only for now: it needs a mouse and keyboard (pointer lock).
