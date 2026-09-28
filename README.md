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

| Input | Action |
| --- | --- |
| `WASD` | Move |
| `Space` | Jump (hold to bunny hop) |
| `Shift` / `C` | Slide (crouch while moving) |
| `LMB` | Stab (spear out) or sling shot (sling out) |
| `RMB` | Throw the spear |
| `F` | Quick stab from either weapon |
| `Q`, `1`/`2`, wheel | Swap weapon |

- **Every hit kills.** Deathmatch, first to 10.
- **Spear:** the stab reaches about 2.8 m. The throw is hitscan at any range,
  but then you're unarmed for melee until you walk over the spear to pick it
  back up. A spear that lands somewhere you can't reach flies back to you
  after 15 s.
- **Sling:** hitscan at any range, with a 1.25 s reload. The sling is your
  steady weapon; the spear throw is the all-in shot.
- **Movement:** a slide boosts you to at least 16 m/s and barely slows down.
  Jumping out of a slide keeps that speed. Landing with crouch still held
  drops you straight into another slide. Strafing in the air adds speed, as
  in Quake. The jump is low (about 1.3 m) so the fighting stays horizontal:
  you can clear waist-high cover, but the 2 m ledges need their steps.

## Layout

```
server/index.js    HTTP + WebSocket server, rooms, snapshot loop
server/room.js     One match: hit checks, lag compensation, spear, score
shared/            Code the server and browser both load
  constants.js     Every tuning number
  map.js           The arena (axis-aligned boxes), spawns, lights
  physics.js       Player movement
  raycast.js       Hitscan maths
public/            The client (three.js, no build step)
  js/main.js       Input, networking, interpolation, camera, HUD
  js/world.js      Cave scene built from shared/map.js
  js/characters.js GRUK and VESH, the two fighters
  js/viewmodel.js  First-person hands and weapons
  js/post.js       Low-res render, dither and vignette pass
  js/effects.js    Tracers, blood, embers, ground spears
  js/audio.js      Synthesised sound (no audio files)
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
