// Game client: input, local movement, networking, remote interpolation,
// camera and HUD. Your own movement runs on the client (it feels instant).
// Online, the server decides hits, kills and the spear. In practice mode the
// same rules run locally against static targets, with no server involved.

import * as THREE from 'three';
import * as C from '/shared/constants.js';
import { MAPS } from '/shared/map.js';
import { createPlayerState, stepPlayer, eyeHeight } from '/shared/physics.js';
import { rayMap, rayBox, aimDir, playerHitbox, hitboxBonus, spearRestPoint } from '/shared/raycast.js';
import { buildWorld } from './world.js';
import { createCharacter, CHARACTER_INFO } from './characters.js';
import { createViewmodel } from './viewmodel.js';
import { createEffects } from './effects.js';
import { createPost } from './post.js';
import { initAudio, sfx, applyVolumes, playMusic, setMusicMuffled } from './audio.js';
import { setupMenu } from './menu.js';
import { settings, actionsFor, onSettingsChange } from './settings.js';
import { createChain } from './chain.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const PHYS_DT = 1 / 120;
const VERBS = { stab: 'gutted', throw: 'skewered', sling: 'stoned' };
const BOT_RESPAWN = 1.5;

let renderer, post, camera;
let scene = null, world = null, effects = null;
let vm = null, chain = null;
let game = null;

const menu = setupMenu({ onStart: startMatch });
const nowS = () => performance.now() / 1000;

// ?debug exposes hooks for automated browser tests.
if (new URLSearchParams(location.search).has('debug')) {
  window.__bf = {
    get game() { return game; }, tryStab, trySling, startCharge, releaseCharge,
    get camera() { return camera; },
  };
}

function load(key, fallback) {
  try { const v = localStorage.getItem('bloodflint.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem('bloodflint.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

// Settings apply live, including from the pause screen mid-match.
onSettingsChange((what) => {
  if (what === 'video') resize();
  if (what === 'audio') applyVolumes(settings.volumes);
  if (what === 'music') playMusic(settings.musicTrack);
});

// ---------------------------------------------------------------- setup

function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.05, 1000);
  camera.rotation.order = 'YXZ';
  post = createPost(renderer);
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

function disposeScene(s) {
  s.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

function loadMap(map) {
  if (scene) disposeScene(scene);
  scene = new THREE.Scene();
  world = buildWorld(scene, map);
  effects = createEffects(scene, map);
}

function resize() {
  if (!renderer) return;
  const h = settings.res || 270;
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

function startMatch(opts) {
  initAudio(settings.volumes);
  playMusic(settings.musicTrack);
  initRenderer();
  const practice = !!opts.practice;
  const map = practice ? MAPS.range : MAPS.kiln;
  loadMap(map);
  menu.hide();
  vm = createViewmodel(settings.character);
  chain = createChain(scene);
  const sp = map.spawns[0];
  game = {
    settings, opts, map, mode: practice ? 'practice' : 'online',
    ws: null, myId: practice ? 'me' : null, room: null, isPrivate: false, seq: 0,
    local: createPlayerState(sp.p, sp.yaw),
    yaw: sp.yaw, pitch: 0,
    alive: practice, weapon: 'spear', hasSpear: true, lastThrow: -10,
    nextStab: 0, nextThrow: 0, nextSling: 0, reloadedPlayed: true,
    charging: false, chargeStart: 0, throwQueued: false,
    remotes: new Map(), timeOffset: null, ping: 0, pingAt: 0,
    scores: {}, names: {}, over: 0, winner: null, respawnIn: 0,
    hurt: 0, deathAt: 0, killerId: null, deathPos: null,
    eyeH: C.EYE_HEIGHT, landDip: 0, roll: 0, fov: settings.fov,
    stepDist: 0, accum: 0, sendAcc: 0,
    mySpear: null,
    // practice only
    bots: [], stats: { shots: 0, hits: 0 },
    course: { start: null, cp: 0, last: null, best: load('bestCourse', null) },
  };
  if (practice) spawnBots();
  resize();
  $('hud').hidden = false;
  $('scoreboard').hidden = practice;
  $('practice-hud').hidden = !practice;
  $('room-info').textContent = practice ? `PRACTICE · ${map.name.toUpperCase()}` : '';
  $('feed').innerHTML = '';
  if (practice) {
    setWeapon('spear');
    feed('PRACTICE: TARGETS DOWNRANGE, COURSE BEHIND YOU');
  } else {
    connect(opts);
  }
  $('pause').hidden = false;   // hidden again by pointerlockchange once the lock lands
  lockPointer();
  if (settings.fullscreen) enterFullscreen();
}

function endMatch(message = '') {
  if (!game) return;
  const g = game;
  game = null;
  try { g.ws && g.ws.close(); } catch { /* already closed */ }
  sfx.setSliding(false);
  $('hud').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  try { navigator.keyboard && navigator.keyboard.unlock(); } catch { /* not supported */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  menu.show(message);
}

function lockPointer() {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch { /* ignored */ } });
  } catch { /* browser refused; the pause overlay asks for a click */ }
}

// Fullscreen plus the Keyboard Lock API (Chrome/Edge) lets the game receive
// Ctrl+W, Ctrl+S and friends instead of the browser acting on them, which
// matters because Ctrl is the slide key.
async function enterFullscreen() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { return; }
  try { if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock(); } catch { /* not supported */ }
}

// Last line of defence for browsers without Keyboard Lock: Ctrl+W asks first.
addEventListener('beforeunload', (e) => {
  if (!game) return;
  e.preventDefault();
  e.returnValue = '';
});

// ---------------------------------------------------------------- network

function connect(opts) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  game.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: settings.name, character: settings.character, room: opts.room, private: !!opts.private }));
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
    case 'spawn':
      respawnLocal(m.p, m.yaw);
      game.seq = m.seq;
      break;
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

function respawnLocal(p, yaw) {
  game.local = createPlayerState(p, yaw);
  game.yaw = yaw;
  game.pitch = 0;
  game.alive = true;
  game.hasSpear = true;
  game.lastThrow = -10;
  game.nextSling = 0;
  game.reloadedPlayed = true;
  cancelCharge();
  setWeapon('spear');
  game.eyeH = C.EYE_HEIGHT;
  chain.reset();
  updateMuffle();
}

// The beat goes muffled while you're dead or paused.
function updateMuffle() {
  setMusicMuffled(!!game && (!game.alive || !locked()));
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

function showHitmarker() {
  $('hitmarker').classList.add('show');
  setTimeout(() => $('hitmarker').classList.remove('show'), 60);
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
        chain.glint();
        showHitmarker();
        feed(`YOU ${VERBS[ev.w]} <b>${esc(victim)}</b>`);
      } else if (ev.victim === me) {
        game.alive = false;
        game.deathAt = nowS();
        game.killerId = ev.killer;
        game.deathPos = [game.local.x, game.local.y + game.eyeH, game.local.z];
        game.hurt = 1;
        cancelCharge(false);
        updateMuffle();
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

const keys = new Set();          // held key codes, plus 'Mouse0'..'Mouse4'
const locked = () => document.pointerLockElement === canvas;
const held = (action) => locked() && settings.binds[action].some((c) => c && keys.has(c));

function onActionPress(action) {
  if (!game || !locked() || !game.alive) return;
  switch (action) {
    case 'attack':
      if (game.charging) cancelCharge();
      if (game.weapon === 'spear') tryStab(); else trySling();
      break;
    case 'throw': startCharge(); break;
    case 'quickStab': tryStab(); break;
    case 'swap': setWeapon(game.weapon === 'spear' ? 'sling' : 'spear'); break;
    case 'spear': setWeapon('spear'); break;
    case 'sling': setWeapon('sling'); break;
    case 'reset': if (game.mode === 'practice') resetCourse(); break;
  }
}

function onActionRelease(action) {
  if (game && action === 'throw') releaseCharge();
}

addEventListener('keydown', (e) => {
  if (!game) return;
  if (locked()) {
    // Swallow browser shortcuts (Ctrl+S, Ctrl+D...) while playing. Ctrl+W
    // itself can only be stopped by the Keyboard Lock API, see enterFullscreen().
    if (e.code !== 'F11' && e.code !== 'F5') e.preventDefault();
    // With the keyboard locked, a quick Esc reaches us instead of the browser.
    if (e.code === 'Escape') { document.exitPointerLock(); return; }
  }
  if (e.repeat) return;
  keys.add(e.code);
  for (const a of actionsFor(e.code)) onActionPress(a);
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  for (const a of actionsFor(e.code)) onActionRelease(a);
});
addEventListener('blur', () => { keys.clear(); if (game) cancelCharge(); });

addEventListener('mousemove', (e) => {
  if (!game || !locked()) return;
  const k = 0.0022 * settings.sens;
  game.yaw -= e.movementX * k;
  game.pitch = Math.max(-1.55, Math.min(1.55, game.pitch - e.movementY * k));
});

canvas.addEventListener('mousedown', (e) => {
  if (!game) return;
  if (!locked()) { lockPointer(); return; }
  const code = `Mouse${e.button}`;
  keys.add(code);
  for (const a of actionsFor(code)) onActionPress(a);
});
addEventListener('mouseup', (e) => {
  const code = `Mouse${e.button}`;
  keys.delete(code);
  for (const a of actionsFor(code)) onActionRelease(a);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', () => {
  if (!game || !locked() || !game.alive) return;
  setWeapon(game.weapon === 'spear' ? 'sling' : 'spear');
}, { passive: true });

document.addEventListener('pointerlockchange', () => {
  $('pause').hidden = !game || locked();
  if (!locked()) { keys.clear(); if (game) cancelCharge(); }
  updateMuffle();
});
$('pause').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  lockPointer();
});
$('pause-settings').addEventListener('click', () => menu.panel.open());
$('leave-btn').addEventListener('click', () => { history.replaceState(null, '', location.pathname); endMatch(''); });

function setWeapon(w) {
  if (w === 'spear' && !game.hasSpear) return;
  if (w !== game.weapon && game.charging) cancelCharge();
  game.weapon = w;
  vm.setWeapon(w);
}

// ---------------------------------------------------------------- combat

function tryStab() {
  const t = nowS();
  if (!game.hasSpear || t < game.nextStab) return;
  cancelCharge();
  game.nextStab = t + C.STAB_COOLDOWN;
  if (game.weapon !== 'spear') setWeapon('spear');
  fire('stab');
}

function trySling() {
  const t = nowS();
  if (t < game.nextSling) return;
  game.nextSling = t + C.SLING_RELOAD;
  game.reloadedPlayed = false;
  fire('sling');
}

// Hold RMB to wind the spear back; release once it's ready to throw. Letting
// go early queues the throw for the moment the windup finishes.
function startCharge() {
  if (!game.hasSpear || game.charging || nowS() < game.nextThrow) return;
  if (game.weapon !== 'spear') setWeapon('spear');
  game.charging = true;
  game.throwQueued = false;
  game.chargeStart = nowS();
  send({ t: 'charge', on: true });
}

function releaseCharge() {
  if (!game.charging) return;
  if (nowS() - game.chargeStart >= C.SPEAR_WINDUP) throwSpear();
  else game.throwQueued = true;
}

function cancelCharge(notify = true) {
  if (!game || !game.charging) return;
  game.charging = false;
  game.throwQueued = false;
  vm.setCharge(0);
  if (notify) send({ t: 'charge', on: false });
}

function throwSpear() {
  const t = nowS();
  game.charging = false;
  game.throwQueued = false;
  game.nextThrow = t + C.THROW_COOLDOWN;
  fire('throw');
  game.hasSpear = false;
  game.lastThrow = t;
  setWeapon('sling');
}

// Everything a shot could hit besides the map: remote players online, targets
// in practice.
function hitTargets() {
  if (game.mode === 'practice') {
    return game.bots.filter((b) => b.alive).map((b) => ({ ref: b, p: b.p, crouch: b.pose !== 'stand' }));
  }
  return [...game.remotes.values()].filter((r) => r.pose && r.pose.a).map((r) => ({ ref: r, p: r.pose.p, crouch: !!r.pose.cr }));
}

function fire(kind) {
  const L = game.local;
  const boxes = game.map.boxes;
  const eye = [L.x, L.y + game.eyeH, L.z];
  const d = aimDir(game.yaw, game.pitch);
  send({ t: 'fire', weapon: kind, o: eye, d, time: renderServerTime() });

  // Draw it straight away from our own ray. Online, the server's verdict
  // arrives as a kill event; in practice this ray is the verdict.
  const range = kind === 'stab' ? C.STAB_RANGE : kind === 'throw' ? C.THROW_RANGE : C.SLING_RANGE;
  const wall = rayMap(eye, d, range, boxes);
  let endT = Math.min(wall.t, range), hit = null;
  for (const target of hitTargets()) {
    const hb = playerHitbox(target.p[0], target.p[1], target.p[2], target.crouch, hitboxBonus(kind));
    const t = rayBox(eye, d, hb.min, hb.max, range);
    if (t < endT) { endT = t; hit = target; }
  }
  const end = [eye[0] + d[0] * endT, eye[1] + d[1] * endT, eye[2] + d[2] * endT];
  const rx = Math.cos(game.yaw), rz = -Math.sin(game.yaw);
  const side = kind === 'sling' ? -0.22 : 0.25;
  const muzzle = [eye[0] + rx * side + d[0] * 0.6, eye[1] - 0.2 + d[1] * 0.6, eye[2] + rz * side + d[2] * 0.6];
  const hitWall = !hit && wall.t <= range;

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

  if (game.mode === 'practice') {
    game.stats.shots++;
    if (kind === 'throw') {
      const rest = hit
        ? spearRestPoint([hit.p[0], hit.p[1] + 0.2, hit.p[2]], [0, 1, 0], boxes)
        : spearRestPoint(end, wall.normal, boxes);
      game.mySpear = { p: rest, d: [d[0], 0, d[2]], landedAt: nowS() };
      effects.setGroundSpear('me', game.mySpear, true);
    }
    if (hit) killBot(hit.ref, kind, d);
  }
}

// ---------------------------------------------------------------- practice

function spawnBots() {
  game.bots = game.map.bots.map((b) => {
    const model = createCharacter(b.char);
    model.group.position.set(...b.p);
    scene.add(model.group);
    return { ...b, model, alive: true, respawnAt: 0 };
  });
}

function killBot(bot, kind, dir) {
  bot.alive = false;
  bot.respawnAt = nowS() + BOT_RESPAWN;
  bot.model.group.visible = false;
  game.stats.hits++;
  chain.glint();
  effects.blood(bot.p, [dir[0], 0.2, dir[2]]);
  sfx.kill();
  showHitmarker();
  const L = game.local;
  const dist = Math.round(Math.hypot(bot.p[0] - L.x, bot.p[2] - L.z));
  feed(`${VERBS[kind].toUpperCase()} <b>${CHARACTER_INFO[bot.char].name}</b> · ${dist}M`);
}

function updatePractice(t, dt) {
  for (const b of game.bots) {
    if (!b.alive && t >= b.respawnAt) { b.alive = true; b.model.group.visible = true; }
    b.model.update({
      vx: 0, vz: 0, yaw: b.yaw, pitch: 0, ground: true,
      crouch: b.pose === 'crouch', slide: b.pose === 'slide', weapon: 'spear', hasSpear: true,
    }, dt);
  }

  // Spear pickup and auto-return, mirroring server/room.js
  const s = game.mySpear, L = game.local;
  if (s) {
    const near = Math.hypot(L.x - s.p[0], L.z - s.p[2]) < C.SPEAR_PICKUP_RADIUS && s.p[1] - L.y > -1.2 && s.p[1] - L.y < 2.4;
    const expired = t - s.landedAt > C.SPEAR_RETURN_TIME;
    if (near || expired) {
      game.mySpear = null;
      effects.setGroundSpear('me', null);
      game.hasSpear = true;
      sfx.pickup();
      if (expired && !near) feed('YOUR SPEAR RETURNS');
    }
  }
  updateCourse(t);
}

const fmtTime = (s) => (s == null ? '—' : s.toFixed(2));

function inBox(b) {
  const L = game.local;
  return L.x >= b.min[0] && L.x <= b.max[0] && L.y >= b.min[1] && L.y <= b.max[1] && L.z >= b.min[2] && L.z <= b.max[2];
}

function resetCourse() {
  const r = game.map.course.respawns[0];
  respawnLocal(r.p, r.yaw);
  game.course.start = null;
  game.course.cp = 0;
}

function updateCourse(t) {
  const c = game.map.course, run = game.course;
  if (!c) return;
  if (game.local.y < c.killY) {
    // Fell into the pit: back to the last checkpoint. The clock keeps running
    // unless you never got past the start.
    const r = c.respawns[run.start == null ? 0 : run.cp];
    const keep = run.start != null && run.cp > 0;
    respawnLocal(r.p, r.yaw);
    if (!keep) { run.start = null; run.cp = 0; }
    game.hurt = 0.5;
    sfx.death();
    return;
  }
  // Standing in the start gate re-arms the clock; leaving it starts the run.
  if (inBox(c.start)) { run.start = t; run.cp = 0; return; }
  if (run.start == null) return;
  const next = c.checkpoints[run.cp];
  if (next && inBox(next)) {
    run.cp++;
    sfx.pickup();
    feed(`CHECKPOINT · ${fmtTime(t - run.start)}`);
  }
  if (run.cp === c.checkpoints.length && inBox(c.finish)) {
    const time = t - run.start;
    run.last = time;
    run.start = null;
    const record = run.best == null || time < run.best;
    if (record) { run.best = time; save('bestCourse', time); }
    feed(record ? `NEW BEST · ${fmtTime(time)}` : `FINISH · ${fmtTime(time)}`);
    sfx.win();
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

function updateRemotes(t, dt) {
  const rt = renderServerTime();
  for (const r of game.remotes.values()) {
    const pose = samplePose(r.buffer, rt);
    r.pose = pose;
    if (!pose) continue;
    const g = r.model.group;
    g.position.set(pose.p[0], pose.p[1], pose.p[2]);
    r.model.update({
      vx: pose.v[0], vz: pose.v[1], yaw: pose.yaw, pitch: pose.pitch,
      crouch: !!pose.cr, slide: !!pose.sl, ground: !!pose.g, weapon: pose.w, hasSpear: !pose.sp, charge: !!pose.ch,
    }, dt);
    // Spawn protection blinks
    g.visible = !!pose.a && (!pose.pr || Math.floor(t * 12) % 2 === 0);
  }
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
  const k = (a) => (held(a) ? 1 : 0);
  const input = {
    fwd: k('forward') - k('back'),
    strafe: k('right') - k('left'),
    jump: held('jump'),
    crouch: held('slide'),
    // Auto sprint flips the key: always run, hold Sprint to walk.
    sprint: settings.autoSprint ? !held('sprint') : held('sprint'),
    yaw: game.yaw,
    pitch: game.pitch,
  };

  if (game.alive) {
    game.accum += dt;
    while (game.accum >= PHYS_DT) {
      game.accum -= PHYS_DT;
      const vyBefore = L.vy;
      const ev = stepPlayer(L, input, PHYS_DT, game.map.boxes);
      if (ev.jumped) sfx.jump();
      if (ev.landed) {
        game.landDip = Math.min(0.22, Math.max(0, -vyBefore * 0.014));
        if (vyBefore < -4) sfx.land();
        // A hard landing bounces the chain up toward your face
        if (vyBefore < -6) chain.kick(0, Math.min(3.5, -vyBefore * 0.3), 0);
      }
      if (ev.slid) {
        sfx.slide();
        chain.kick(-Math.sin(game.yaw) * 1.2, 2.2, -Math.cos(game.yaw) * 1.2);
      }
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

    if (game.charging) {
      const progress = Math.min(1, (nowS() - game.chargeStart) / C.SPEAR_WINDUP);
      vm.setCharge(progress);
      if (game.throwQueued && progress >= 1) throwSpear();
    }
  }

  if (game.mode === 'practice') updatePractice(t, dt);
  else updateRemotes(t, dt);

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
  camera.updateMatrixWorld();
  if (chain.update(dt, camera.position, game.yaw, camera, settings.chain && game.alive)) sfx.chain();

  const speedK = Math.max(0, Math.min(1, (hs - C.WALK_SPEED) / (C.MAX_SPEED - C.WALK_SPEED)));
  const chargeZoom = game.charging ? Math.min(1, (nowS() - game.chargeStart) / C.SPEAR_WINDUP) * 6 : 0;
  const targetFov = settings.fov + speedK * 18 - chargeZoom;
  game.fov += (targetFov - game.fov) * Math.min(1, dt * 8);
  camera.fov = vfov(game.fov, camera.aspect);
  camera.updateProjectionMatrix();

  vm.scene.visible = game.alive;
  vm.update(dt, game.hasSpear, { speed: hs, ground: L.onGround, slide: L.sliding }, Math.max(0, game.nextSling - nowS()));

  world.update(t, camera);
  effects.update(dt);

  if (game.mode === 'online' && t - game.pingAt > 2) { game.pingAt = t; send({ t: 'ping', c: performance.now() }); }
  updateHud(hs, t);
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

function updateHud(hs, t) {
  const me = game.myId;
  const practice = game.mode === 'practice';
  const foe = practice ? null : [...game.remotes.values()][0];
  if (practice) {
    const { shots, hits } = game.stats;
    setText('pr-hits', `${hits}/${shots}`);
    setText('pr-acc', shots ? `${Math.round((hits / shots) * 100)}%` : '—');
    const run = game.course;
    setText('pr-timer', run.start != null ? fmtTime(t - run.start) : fmtTime(run.last));
    setText('pr-best', `BEST ${fmtTime(run.best)}`);
    $('pr-timer').classList.toggle('running', run.start != null);
  } else {
    setText('name-me', game.names[me] || settings.name);
    setText('score-me', String(game.scores[me] || 0));
    setText('name-foe', foe ? game.names[foe.id] || '???' : '—');
    setText('score-foe', foe ? String(game.scores[foe.id] || 0) : '0');
    setText('ping', game.ping ? `PING ${game.ping}MS` : '');
  }

  const spd = Math.round(hs);
  setText('speed-val', String(spd));
  $('speed').className = spd >= 18 ? 'faster' : spd >= 12 ? 'fast' : '';

  $('w-spear').classList.toggle('active', game.weapon === 'spear');
  $('w-sling').classList.toggle('active', game.weapon === 'sling');
  const chargeK = game.charging ? Math.min(1, (nowS() - game.chargeStart) / C.SPEAR_WINDUP) : 0;
  setText('spear-state', !game.hasSpear ? 'THROWN' : chargeK >= 1 ? 'READY' : game.charging ? 'DRAWING' : 'HELD');
  $('spear-state').classList.toggle('gone', !game.hasSpear);
  const reloadLeft = Math.max(0, game.nextSling - nowS());
  const bar = $('sling-bar');
  bar.style.width = `${Math.round((1 - reloadLeft / C.SLING_RELOAD) * 100)}%`;
  bar.classList.toggle('loading', reloadLeft > 0);

  // Crosshair turns ember when a stab would land
  let inReach = false;
  if (game.weapon === 'spear' && game.hasSpear) {
    const L = game.local;
    const eye = [L.x, L.y + game.eyeH, L.z];
    const d = aimDir(game.yaw, game.pitch);
    const wallT = rayMap(eye, d, C.STAB_RANGE, game.map.boxes).t;
    for (const target of hitTargets()) {
      const hb = playerHitbox(target.p[0], target.p[1], target.p[2], target.crouch, C.STAB_HITBOX_BONUS);
      if (rayBox(eye, d, hb.min, hb.max, C.STAB_RANGE) < wallT) inReach = true;
    }
  }
  $('crosshair').classList.toggle('stab', inReach);
  $('crosshair').classList.toggle('charged', chargeK >= 1);

  // Centre message
  let msg = '', sub = '';
  if (practice) {
    // nothing: the practice panel carries the info
  } else if (game.over) {
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

  // Marker over your thrown spear, pinned to a ring when it's off-screen
  const marker = $('spear-marker');
  if (game.mySpear && game.alive) {
    const L = game.local;
    const sp = game.mySpear.p;
    tmpV.set(sp[0], sp[1] + 0.8, sp[2]).project(camera);
    let x = tmpV.x, y = tmpV.y;
    const behind = tmpV.z > 1;
    if (behind) { x = -x; y = -y - 0.001; }
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
