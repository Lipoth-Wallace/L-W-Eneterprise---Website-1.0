// Game client: input, local movement, networking, remote interpolation,
// camera and HUD. Your own movement runs on the client (it feels instant);
// the server decides hits, kills and the spear.

import * as THREE from 'three';
import * as C from '/shared/constants.js';
import { MAP } from '/shared/map.js';
import { createPlayerState, stepPlayer, eyeHeight } from '/shared/physics.js';
import { rayMap, rayBox, aimDir, playerHitbox } from '/shared/raycast.js';
import { buildWorld } from './world.js';
import { createCharacter } from './characters.js';
import { createViewmodel } from './viewmodel.js';
import { createEffects } from './effects.js';
import { createPost } from './post.js';
import { initAudio, sfx, setVolume } from './audio.js';
import { setupMenu } from './menu.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const PHYS_DT = 1 / 120;
const VERBS = { stab: 'gutted', throw: 'skewered', sling: 'stoned' };

let renderer, scene, camera, world, effects, post;
let vm = null;
let game = null;

const menu = setupMenu({ onStart: startMatch });
const nowS = () => performance.now() / 1000;

// ?debug exposes hooks for automated browser tests.
if (new URLSearchParams(location.search).has('debug')) {
  window.__bf = { get game() { return game; }, tryStab, tryThrow, trySling };
}

// ---------------------------------------------------------------- setup

function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.05, 200);
  camera.rotation.order = 'YXZ';
  world = buildWorld(scene);
  effects = createEffects(scene);
  post = createPost(renderer);
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

function resize() {
  if (!renderer) return;
  const h = (game && game.settings.res) || 270;
  const aspect = innerWidth / innerHeight;
  const w = Math.max(1, Math.round(h * aspect));
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  if (vm) vm.setAspect(aspect);
}

// Settings store horizontal FOV; three.js wants vertical.
function vfov(hfovDeg, aspect) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2) / aspect));
}

function startMatch(settings) {
  initAudio(settings.volume);
  setVolume(settings.volume);
  initRenderer();
  menu.hide();
  vm = createViewmodel(settings.character);
  const sp = MAP.spawns[0];
  game = {
    settings,
    ws: null, myId: null, room: null, isPrivate: false, seq: 0,
    local: createPlayerState(sp.p, sp.yaw),
    yaw: sp.yaw, pitch: 0,
    alive: false, weapon: 'spear', hasSpear: true, lastThrow: -10,
    nextStab: 0, nextThrow: 0, nextSling: 0, reloadedPlayed: true,
    remotes: new Map(), timeOffset: null, ping: 0, pingAt: 0,
    scores: {}, names: {}, over: 0, winner: null, respawnIn: 0,
    hurt: 0, deathAt: 0, killerId: null, deathPos: null,
    eyeH: C.EYE_HEIGHT, landDip: 0, roll: 0, fov: settings.fov,
    stepDist: 0, accum: 0, sendAcc: 0,
    mySpear: null, hitmarkerAt: -10,
  };
  resize();
  $('hud').hidden = false;
  $('feed').innerHTML = '';
  connect(settings);
  $('pause').hidden = false;   // hidden again by pointerlockchange once the lock lands
  lockPointer();
}

function endMatch(message = '') {
  if (!game) return;
  const g = game;
  game = null;
  try { g.ws && g.ws.close(); } catch { /* already closed */ }
  for (const r of g.remotes.values()) { scene.remove(r.model.group); effects.setGroundSpear(r.id, null); }
  if (g.myId) effects.setGroundSpear(g.myId, null);
  sfx.setSliding(false);
  $('hud').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  menu.show(message);
}

function lockPointer() {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch { /* ignored */ } });
  } catch { /* browser refused; the pause overlay asks for a click */ }
}

// ---------------------------------------------------------------- network

function connect(s) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  game.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: s.name, character: s.character, room: s.room, private: !!s.private }));
  ws.onmessage = (ev) => { if (game && game.ws === ws) onMessage(JSON.parse(ev.data)); };
  ws.onclose = () => { if (game && game.ws === ws) endMatch(game.myId ? 'Connection lost.' : 'Could not reach the server.'); };
}

function send(m) {
  if (game && game.ws && game.ws.readyState === 1) game.ws.send(JSON.stringify(m));
}

// The server time of the remote poses currently on screen. Hits are checked
// against where the target was at this moment, not where it is now.
function renderServerTime() {
  return nowS() + (game.timeOffset || 0) - C.INTERP_DELAY;
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      game.myId = m.id;
      game.room = m.room;
      game.isPrivate = m.isPrivate;
      $('goal').textContent = m.killsToWin;
      history.replaceState(null, '', `?room=${m.room}`);
      $('room-info').innerHTML = `ROOM <b>${m.room}</b>`;
      break;
    case 'error':
      endMatch(m.message);
      break;
    case 'spawn': {
      game.local = createPlayerState(m.p, m.yaw);
      game.yaw = m.yaw;
      game.pitch = 0;
      game.seq = m.seq;
      game.alive = true;
      game.hasSpear = true;
      game.lastThrow = -10;
      game.nextSling = 0;
      game.reloadedPlayed = true;
      setWeapon('spear');
      game.eyeH = C.EYE_HEIGHT;
      break;
    }
    case 'correct':
      if (m.seq === game.seq) {
        const L = game.local;
        [L.x, L.y, L.z] = m.p;
        L.vx = L.vy = L.vz = 0;
      }
      break;
    case 'pong':
      game.ping = Math.round(performance.now() - m.c);
      break;
    case 'snap':
      onSnap(m);
      break;
  }
}

function onSnap(m) {
  const sample = m.time - nowS();
  game.timeOffset = game.timeOffset === null ? sample : game.timeOffset + (sample - game.timeOffset) * 0.1;
  const seen = new Set();
  for (const pl of m.players) {
    game.scores[pl.id] = pl.s;
    game.names[pl.id] = pl.name;
    if (pl.id === game.myId) {
      if (!pl.a && game.alive) game.alive = false;
      // Right after a throw, trust our own prediction until the server catches up.
      if (nowS() - game.lastThrow > 0.6) {
        const had = game.hasSpear;
        game.hasSpear = !pl.sp;
        if (!game.hasSpear && had && game.weapon === 'spear') setWeapon('sling');
      }
      game.mySpear = pl.sp;
      game.respawnIn = pl.rs;
      effects.setGroundSpear(pl.id, pl.sp, true);
      continue;
    }
    seen.add(pl.id);
    let r = game.remotes.get(pl.id);
    if (!r || r.char !== pl.c) {
      if (r) scene.remove(r.model.group);
      r = { id: pl.id, char: pl.c, model: createCharacter(pl.c), buffer: [], pose: null };
      scene.add(r.model.group);
      game.remotes.set(pl.id, r);
    }
    r.buffer.push({ time: m.time, ...pl });
    if (r.buffer.length > 40) r.buffer.shift();
    effects.setGroundSpear(pl.id, pl.sp, false);
  }
  for (const [id, r] of game.remotes) {
    if (!seen.has(id)) {
      scene.remove(r.model.group);
      effects.setGroundSpear(id, null);
      game.remotes.delete(id);
    }
  }
  game.over = m.over;
  game.winner = m.winner;
  for (const ev of m.ev) onEvent(ev);
}

function feed(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 5000);
  while ($('feed').children.length > 5) $('feed').lastChild.remove();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function relAudio(pos) {
  const L = game.local;
  const dx = pos[0] - L.x, dz = pos[2] - L.z;
  const dist = Math.hypot(dx, dz);
  const rx = Math.cos(game.yaw), rz = -Math.sin(game.yaw);
  const pan = dist > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;
  return [dist, pan * 0.8];
}

function onEvent(ev) {
  const me = game.myId;
  switch (ev.e) {
    case 'shot': {
      if (ev.id === me) return;          // our own shots were drawn when we fired
      const [dist, pan] = relAudio(ev.o);
      const from = [ev.o[0], ev.o[1] - 0.25, ev.o[2]];
      if (ev.w === 'sling') { effects.tracer(from, ev.end, 0xd8ccb0); sfx.sling(dist, pan); }
      if (ev.w === 'throw') { effects.tracer(from, ev.end, 0xff5a22, 2, 0.22); sfx.throwSpear(dist, pan); }
      if (ev.w === 'stab') sfx.stab(dist, pan);
      if (!ev.hit && ev.n && ev.w !== 'stab') effects.impact(ev.end, ev.n);
      break;
    }
    case 'kill': {
      const killer = game.names[ev.killer] || '???', victim = game.names[ev.victim] || '???';
      let dir = [0, 0, 0];
      const kp = ev.killer === me ? [game.local.x, game.local.y, game.local.z] : game.remotes.get(ev.killer)?.pose?.p;
      if (kp) {
        const dx = ev.at[0] - kp[0], dz = ev.at[2] - kp[2], l = Math.hypot(dx, dz) || 1;
        dir = [dx / l, 0.2, dz / l];
      }
      effects.blood(ev.at, dir);
      if (ev.killer === me) {
        sfx.kill();
        game.hitmarkerAt = nowS();
        $('hitmarker').classList.add('show');
        setTimeout(() => $('hitmarker').classList.remove('show'), 60);
        feed(`YOU ${VERBS[ev.w]} <b>${esc(victim)}</b>`);
      } else if (ev.victim === me) {
        game.alive = false;
        game.deathAt = nowS();
        game.killerId = ev.killer;
        game.deathPos = [game.local.x, game.local.y + game.eyeH, game.local.z];
        game.hurt = 1;
        sfx.death();
        sfx.setSliding(false);
        feed(`<b>${esc(killer)}</b> ${VERBS[ev.w]} YOU`);
      }
      break;
    }
    case 'win':
      if (ev.id === me) sfx.win(); else sfx.lose();
      break;
    case 'reset':
      feed('A NEW HUNT BEGINS');
      break;
    case 'pickup':
      if (ev.id === me) {
        game.hasSpear = true;
        game.lastThrow = -10;
        sfx.pickup();
        if (ev.returned) feed('YOUR SPEAR RETURNS');
      }
      break;
    case 'join':
      if (ev.id !== me) feed(`<b>${esc(ev.name)}</b> ENTERS THE KILN`);
      break;
    case 'leave':
      feed(`<b>${esc(ev.name)}</b> FLED`);
      break;
  }
}

// ---------------------------------------------------------------- input

const keys = new Set();
const locked = () => document.pointerLockElement === canvas;

addEventListener('keydown', (e) => {
  if (!game) return;
  if (locked() && ['Space', 'Tab', 'KeyQ', 'ShiftLeft'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (!locked() || !game.alive) return;
  if (e.code === 'Digit1') setWeapon('spear');
  if (e.code === 'Digit2') setWeapon('sling');
  if (e.code === 'KeyQ') setWeapon(game.weapon === 'spear' ? 'sling' : 'spear');
  if (e.code === 'KeyF') tryStab();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

addEventListener('mousemove', (e) => {
  if (!game || !locked()) return;
  const k = 0.0022 * game.settings.sens;
  game.yaw -= e.movementX * k;
  game.pitch = Math.max(-1.55, Math.min(1.55, game.pitch - e.movementY * k));
});

canvas.addEventListener('mousedown', (e) => {
  if (!game) return;
  if (!locked()) { lockPointer(); return; }
  if (!game.alive) return;
  if (e.button === 0) { if (game.weapon === 'spear') tryStab(); else trySling(); }
  if (e.button === 2) tryThrow();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!game || !locked() || !game.alive) return;
  setWeapon(game.weapon === 'spear' ? 'sling' : 'spear');
}, { passive: true });

document.addEventListener('pointerlockchange', () => {
  $('pause').hidden = !game || locked();
  if (!locked()) keys.clear();
});
$('pause').addEventListener('click', (e) => { if (e.target.id !== 'leave-btn') lockPointer(); });
$('leave-btn').addEventListener('click', () => { history.replaceState(null, '', location.pathname); endMatch(''); });

function setWeapon(w) {
  if (w === 'spear' && !game.hasSpear) return;
  game.weapon = w;
  vm.setWeapon(w);
}

// ---------------------------------------------------------------- combat

function tryStab() {
  const t = nowS();
  if (!game.hasSpear || t < game.nextStab) return;
  game.nextStab = t + C.STAB_COOLDOWN;
  if (game.weapon !== 'spear') setWeapon('spear');
  fire('stab');
}

function tryThrow() {
  const t = nowS();
  if (!game.hasSpear || t < game.nextThrow) return;
  game.nextThrow = t + C.THROW_COOLDOWN;
  fire('throw');
  game.hasSpear = false;
  game.lastThrow = t;
  setWeapon('sling');
}

function trySling() {
  const t = nowS();
  if (t < game.nextSling) return;
  game.nextSling = t + C.SLING_RELOAD;
  game.reloadedPlayed = false;
  fire('sling');
}

function fire(kind) {
  const L = game.local;
  const eye = [L.x, L.y + game.eyeH, L.z];
  const d = aimDir(game.yaw, game.pitch);
  send({ t: 'fire', weapon: kind, o: eye, d, time: renderServerTime() });

  // Draw it straight away from our own ray. The server's verdict arrives as a
  // kill event.
  const range = kind === 'stab' ? C.STAB_RANGE : kind === 'throw' ? C.THROW_RANGE : C.SLING_RANGE;
  const wall = rayMap(eye, d, range);
  let endT = Math.min(wall.t, range), hitFoe = false;
  for (const r of game.remotes.values()) {
    if (!r.pose || !r.pose.a) continue;
    const hb = playerHitbox(r.pose.p[0], r.pose.p[1], r.pose.p[2], !!r.pose.cr, kind === 'stab' ? C.STAB_HITBOX_BONUS : 0);
    const t = rayBox(eye, d, hb.min, hb.max, range);
    if (t < endT) { endT = t; hitFoe = true; }
  }
  const end = [eye[0] + d[0] * endT, eye[1] + d[1] * endT, eye[2] + d[2] * endT];
  const rx = Math.cos(game.yaw), rz = -Math.sin(game.yaw);
  const side = kind === 'sling' ? -0.22 : 0.25;
  const muzzle = [eye[0] + rx * side + d[0] * 0.6, eye[1] - 0.2 + d[1] * 0.6, eye[2] + rz * side + d[2] * 0.6];
  const hitWall = !hitFoe && wall.t <= range;

  if (kind === 'sling') {
    vm.slingShot();
    sfx.sling();
    effects.tracer(muzzle, end, 0xd8ccb0);
  } else if (kind === 'throw') {
    vm.throwSpear();
    sfx.throwSpear();
    effects.tracer(muzzle, end, 0xff5a22, 2, 0.22);
  } else {
    vm.stab();
    sfx.stab();
  }
  if (hitWall) {
    effects.impact(end, wall.normal);
    sfx.impact(endT);
  }
}

// ---------------------------------------------------------------- remote players

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function samplePose(buffer, t) {
  if (!buffer.length) return null;
  if (t <= buffer[0].time) return buffer[0];
  const lastSnap = buffer[buffer.length - 1];
  if (t >= lastSnap.time) return lastSnap;
  for (let i = buffer.length - 2; i >= 0; i--) {
    const a = buffer[i], b = buffer[i + 1];
    if (a.time <= t) {
      const k = (t - a.time) / (b.time - a.time || 1);
      // A teleport (respawn) snaps instead of sliding across the map.
      if (Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) > 6 || a.a !== b.a) return k < 0.5 ? a : b;
      const near = k < 0.5 ? a : b;
      return {
        ...near,
        p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k],
        v: [a.v[0] + (b.v[0] - a.v[0]) * k, a.v[1] + (b.v[1] - a.v[1]) * k],
        yaw: lerpAngle(a.yaw, b.yaw, k),
        pitch: a.pitch + (b.pitch - a.pitch) * k,
      };
    }
  }
  return lastSnap;
}

// ---------------------------------------------------------------- frame

let last = performance.now();
const tmpV = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game) return;
  update(dt, now / 1000);
  post.uniforms.hurt.value = game.hurt;
  post.render(scene, camera, vm.scene, vm.camera);
}

function update(dt, t) {
  const L = game.local;
  const isLocked = locked();
  const k = (c) => (isLocked && keys.has(c) ? 1 : 0);
  const input = {
    fwd: k('KeyW') - k('KeyS'),
    strafe: k('KeyD') - k('KeyA'),
    jump: !!k('Space'),
    crouch: !!(k('ShiftLeft') || k('ShiftRight') || k('KeyC')),
    yaw: game.yaw,
    pitch: game.pitch,
  };

  if (game.alive) {
    game.accum += dt;
    while (game.accum >= PHYS_DT) {
      game.accum -= PHYS_DT;
      const vyBefore = L.vy;
      const ev = stepPlayer(L, input, PHYS_DT);
      if (ev.jumped) sfx.jump();
      if (ev.landed) {
        game.landDip = Math.min(0.22, Math.max(0, -vyBefore * 0.014));
        if (vyBefore < -4) sfx.land();
      }
      if (ev.slid) sfx.slide();
    }
    game.sendAcc += dt;
    if (game.sendAcc >= 1 / C.STATE_RATE) {
      game.sendAcc = 0;
      send({
        t: 'state', seq: game.seq,
        p: [L.x, L.y, L.z], v: [L.vx, L.vy, L.vz],
        yaw: game.yaw, pitch: game.pitch,
        crouch: L.crouching, slide: L.sliding, ground: L.onGround, weapon: game.weapon,
      });
    }
    const hs = Math.hypot(L.vx, L.vz);
    if (L.onGround && !L.sliding && hs > 2) {
      game.stepDist += hs * dt;
      if (game.stepDist > 2.4) { game.stepDist = 0; sfx.step(); }
    }
    sfx.setSliding(L.sliding && L.onGround);
    if (L.sliding && L.onGround) effects.slideSparks(tmpV.set(L.x, L.y + 0.05, L.z), { x: L.vx, z: L.vz });
    if (!game.reloadedPlayed && nowS() >= game.nextSling) { game.reloadedPlayed = true; sfx.reloaded(); }
  }

  // Remote players
  const rt = renderServerTime();
  for (const r of game.remotes.values()) {
    const pose = samplePose(r.buffer, rt);
    r.pose = pose;
    if (!pose) continue;
    const g = r.model.group;
    g.position.set(pose.p[0], pose.p[1], pose.p[2]);
    r.model.update({
      vx: pose.v[0], vz: pose.v[1], yaw: pose.yaw, pitch: pose.pitch,
      crouch: !!pose.cr, slide: !!pose.sl, ground: !!pose.g, weapon: pose.w, hasSpear: !pose.sp,
    }, dt);
    // Spawn protection blinks
    g.visible = !!pose.a && (!pose.pr || Math.floor(t * 12) % 2 === 0);
  }

  // Camera
  game.eyeH += (eyeHeight(L) - game.eyeH) * Math.min(1, dt * 16);
  game.landDip *= Math.exp(-dt * 9);
  game.hurt = Math.max(0, game.hurt - dt * 0.9);
  const hs = Math.hypot(L.vx, L.vz);
  if (game.alive) {
    camera.position.set(L.x, L.y + game.eyeH - game.landDip, L.z);
    const targetRoll = -input.strafe * 0.02 + (L.sliding ? 0.05 : 0);
    game.roll += (targetRoll - game.roll) * Math.min(1, dt * 10);
    camera.rotation.set(game.pitch, game.yaw, game.roll);
  } else if (game.deathPos) {
    // Death cam: float up and stare at whoever killed you.
    const rise = Math.min(1.6, (t - game.deathAt) * 1.5);
    camera.position.set(game.deathPos[0], game.deathPos[1] + rise, game.deathPos[2]);
    const kp = game.remotes.get(game.killerId)?.pose?.p;
    if (kp) camera.lookAt(tmpV.set(kp[0], kp[1] + 1.2, kp[2]));
  }
  const speedK = Math.max(0, Math.min(1, (hs - C.RUN_SPEED) / (C.MAX_SPEED - C.RUN_SPEED)));
  const targetFov = game.settings.fov + speedK * 16;
  game.fov += (targetFov - game.fov) * Math.min(1, dt * 6);
  camera.fov = vfov(game.fov, camera.aspect);
  camera.updateProjectionMatrix();

  vm.scene.visible = game.alive;
  vm.update(dt, game.hasSpear, { speed: hs, ground: L.onGround, slide: L.sliding }, Math.max(0, game.nextSling - nowS()));

  world.update(t);
  effects.update(dt);

  if (t - game.pingAt > 2) { game.pingAt = t; send({ t: 'ping', c: performance.now() }); }
  updateHud(hs);
}

// ---------------------------------------------------------------- HUD

const hudCache = new Map();
function setText(id, v) {
  if (hudCache.get(id) === v) return;
  hudCache.set(id, v);
  $(id).textContent = v;
}
function setHtml(id, v) {
  if (hudCache.get(id) === v) return;
  hudCache.set(id, v);
  $(id).innerHTML = v;
}

function updateHud(hs) {
  const me = game.myId;
  const foe = [...game.remotes.values()][0];
  setText('name-me', game.names[me] || game.settings.name);
  setText('score-me', String(game.scores[me] || 0));
  setText('name-foe', foe ? game.names[foe.id] || '???' : '—');
  setText('score-foe', foe ? String(game.scores[foe.id] || 0) : '0');
  setText('ping', game.ping ? `PING ${game.ping}MS` : '');

  const spd = Math.round(hs);
  setText('speed-val', String(spd));
  $('speed').className = spd >= 18 ? 'faster' : spd >= 12 ? 'fast' : '';

  $('w-spear').classList.toggle('active', game.weapon === 'spear');
  $('w-sling').classList.toggle('active', game.weapon === 'sling');
  setText('spear-state', game.hasSpear ? 'HELD' : 'THROWN');
  $('spear-state').classList.toggle('gone', !game.hasSpear);
  const reloadLeft = Math.max(0, game.nextSling - nowS());
  const bar = $('sling-bar');
  bar.style.width = `${Math.round((1 - reloadLeft / C.SLING_RELOAD) * 100)}%`;
  bar.classList.toggle('loading', reloadLeft > 0);

  // Crosshair turns ember when a stab would land
  let inReach = false;
  if (game.weapon === 'spear' && game.hasSpear && foe && foe.pose && foe.pose.a) {
    const L = game.local;
    const eye = [L.x, L.y + game.eyeH, L.z];
    const hb = playerHitbox(foe.pose.p[0], foe.pose.p[1], foe.pose.p[2], !!foe.pose.cr, C.STAB_HITBOX_BONUS);
    const tt = rayBox(eye, aimDir(game.yaw, game.pitch), hb.min, hb.max, C.STAB_RANGE);
    inReach = tt < rayMap(eye, aimDir(game.yaw, game.pitch), C.STAB_RANGE).t;
  }
  $('crosshair').classList.toggle('stab', inReach);

  // Centre message
  let msg = '', sub = '';
  if (game.over) {
    const won = game.winner === me;
    msg = won ? 'YOU REIGN' : 'YOU FELL';
    sub = `New hunt in ${Math.ceil(game.over)}`;
  } else if (!game.myId) {
    msg = 'ENTERING THE KILN';
  } else if (!foe) {
    msg = 'WAITING FOR PREY';
    const link = `${location.origin}${location.pathname}?room=${game.room}`;
    sub = game.isPrivate
      ? `Send this code: <code>${game.room}</code><br><small>${esc(link)}</small>`
      : `Searching… or invite a friend with code <code>${game.room}</code>`;
  } else if (!game.alive) {
    msg = 'SLAIN';
    sub = `by ${esc(game.names[game.killerId] || '???')} · rising in ${Math.max(0, game.respawnIn).toFixed(1)}`;
  }
  setText('center-msg', msg);
  setHtml('center-sub', sub);

  // Marker over your thrown spear, clamped to the screen edge when it's off-screen
  const marker = $('spear-marker');
  if (game.mySpear && game.alive) {
    const L = game.local;
    const sp = game.mySpear.p;
    tmpV.set(sp[0], sp[1] + 0.8, sp[2]).project(camera);
    let x = tmpV.x, y = tmpV.y;
    const behind = tmpV.z > 1;
    if (behind) { x = -x; y = -y - 0.001; }
    // Off-screen: pin it to a ring around the crosshair, pointing the way to turn.
    if (behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.85) {
      const l = Math.hypot(x, y) || 1;
      x = (x / l) * 0.7;
      y = (y / l) * 0.6;
    }
    marker.hidden = false;
    marker.style.left = `${((x + 1) / 2) * innerWidth}px`;
    marker.style.top = `${((1 - y) / 2) * innerHeight}px`;
    setText('spear-dist', `${Math.round(Math.hypot(sp[0] - L.x, sp[2] - L.z))}m`);
  } else {
    marker.hidden = true;
  }
}
