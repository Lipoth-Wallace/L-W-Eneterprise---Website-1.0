// Title menu: character preview, name, quick match / private room / join /
// practice, and the Settings panel.

import * as THREE from 'three';
import { createCharacter, CHARACTER_INFO } from './characters.js';
import { settings, saveSettings, setupSettingsPanel } from './settings.js';
import * as C from '/shared/constants.js';
import { initAudio, playMusic, previewBus, currentTrackName } from './audio.js';

const $ = (id) => document.getElementById(id);

export function setupMenu({ onStart }) {
  const menu = $('menu');
  const panel = setupSettingsPanel({ onPreview: previewBus });

  setupLoadout();

  // Browsers only allow sound after the first click, so the beat starts then.
  const startAudio = () => {
    initAudio(settings.volumes);
    playMusic(settings.musicTrack);
    updateNowPlaying();
  };
  addEventListener('pointerdown', startAudio, { once: true });
  function updateNowPlaying() {
    const name = currentTrackName();
    $('now-playing').textContent = name ? `♪ ${name}` : '♪ click anywhere for sound';
  }
  updateNowPlaying();

  // Preview: a tiny renderer upscaled with nearest-neighbour, like the game.
  const canvas = $('preview');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(128, 160, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0202);
  scene.fog = new THREE.Fog(0x0a0202, 4, 9);
  scene.add(new THREE.AmbientLight(0x3a0d08, 2));
  const key = new THREE.PointLight(0xff2a14, 30, 10, 1.5);
  key.position.set(1.5, 2.5, -2);
  scene.add(key);
  const back = new THREE.PointLight(0xff6a2a, 12, 8, 1.5);
  back.position.set(-2, 1, 2);
  scene.add(back);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 8), new THREE.MeshLambertMaterial({ color: 0x2a1c18 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(40, 128 / 160, 0.1, 20);
  camera.position.set(0, 1.3, -4.2);
  camera.lookAt(0, 0.95, 0);

  let model = null;
  function pick(type) {
    settings.character = type;
    saveSettings('general');
    if (model) scene.remove(model.group);
    model = createCharacter(type);
    scene.add(model.group);
    const info = CHARACTER_INFO[type];
    $('char-name').textContent = info.name;
    $('char-title').textContent = info.title;
    $('char-blurb').textContent = info.blurb;
    for (const b of document.querySelectorAll('[data-char]')) b.classList.toggle('active', b.dataset.char === type);
  }
  for (const b of document.querySelectorAll('[data-char]')) b.addEventListener('click', () => pick(b.dataset.char));
  pick(settings.character);

  let running = true, last = performance.now(), t = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    // A slow head-nod to the beat
    model.update({ vx: 0, vz: 0, yaw: Math.sin(t * 0.6) * 0.7, pitch: Math.max(0, Math.sin(t * Math.PI * 1.47)) * 0.25, crouch: false, slide: false, ground: true, weapon: 'spear', hasSpear: true }, dt);
    key.intensity = 30 * (0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 5.3));
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const name = $('name');
  name.value = settings.name;
  name.addEventListener('input', () => { settings.name = name.value; saveSettings('general'); });

  const arena = $('arena');
  arena.value = settings.map;
  arena.addEventListener('change', () => { settings.map = arena.value; saveSettings('general'); });
  // Relic Run always plays on the Caldera, so the arena picker only matters for deathmatch.
  const mode = $('mode');
  mode.value = settings.mode;
  // The skull's burst timer is the host's choice; it applies to rooms you create
  const grace = $('grace');
  grace.value = String(settings.grace);
  grace.addEventListener('change', () => { settings.grace = +grace.value; saveSettings('general'); });
  const syncMode = () => {
    arena.closest('label').hidden = settings.mode === 'relic' || !!globalThis.BLOODFLINT_OFFLINE;
    $('grace-field').hidden = settings.mode !== 'relic' && !globalThis.BLOODFLINT_OFFLINE;
  };
  syncMode();
  mode.addEventListener('change', () => { settings.mode = mode.value; saveSettings('general'); syncMode(); });

  const code = $('code');
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) code.value = urlRoom.toUpperCase();
  code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); });

  const start = (opts) => {
    $('menu-error').textContent = '';
    if (!settings.name) settings.name = 'Caveman';
    onStart(opts);
  };
  $('quick').addEventListener('click', () => start({}));
  $('create').addEventListener('click', () => start({ private: true }));
  $('practice').addEventListener('click', () => start({ practice: true }));
  // Offline build (no server): hide online play, offer solo walks of the arenas.
  if (globalThis.BLOODFLINT_OFFLINE) {
    for (const id of ['quick', 'create', 'join', 'code']) $(id).hidden = true;
    $('code').parentElement.hidden = true;
    $('arena').closest('label').hidden = true;
    const note = document.createElement('p');
    note.className = 'offline-note';
    note.textContent = 'Offline test build: 1v1 needs the game server. Try the range, the course, and the arenas solo.';
    $('practice').before(note);
    $('mode').closest('label').hidden = true;
    const relic = document.createElement('button');
    relic.className = 'btn';
    relic.textContent = 'Solo Relic Run';
    relic.addEventListener('click', () => start({ local: true, mode: 'relic' }));
    $('open-settings').before(relic);
    for (const [id, label] of [['kiln', 'Explore the Kiln'], ['thicket', 'Explore the Thicket'], ['volcano', 'Explore the Caldera']]) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', () => start({ practice: true, practiceMap: id }));
      $('open-settings').before(b);
    }
  }
  $('join').addEventListener('click', () => {
    if (code.value.length !== 4) { $('menu-error').textContent = 'Room codes are four letters.'; return; }
    start({ room: code.value });
  });
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join').click(); });
  $('open-settings').addEventListener('click', () => panel.open());

  return {
    panel,
    hide() { menu.hidden = true; running = false; },
    show(error = '') {
      menu.hidden = false;
      $('menu-error').textContent = error;
      updateNowPlaying();
      if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
    },
  };
}

// Loadout: slot 1 is always the spear; slot 2 is picked here. The stat bars
// come from the real numbers in shared/constants.js (5 pips each).
const GEAR = [
  {
    id: 'sling', name: 'SLING',
    blurb: 'One stone at a time. Needs a clean hit on the exact body.',
    rate: 1 / C.SLING_RELOAD, hitbox: 0, range: C.SLING_RANGE,
    line: `${C.SLING_RELOAD} s reload · ${C.SLING_RANGE} m`,
  },
  {
    id: 'knives', name: 'BONE KNIVES',
    blurb: `${C.KNIFE_COUNT} throws in quick succession, a little more forgiving than the sling. Each grows back in ${C.KNIFE_REGEN} s.`,
    rate: 1 / C.KNIFE_INTERVAL, hitbox: C.KNIFE_HITBOX_BONUS, range: C.KNIFE_RANGE,
    line: `${C.KNIFE_COUNT} knives · ${C.KNIFE_RANGE} m`,
  },
  {
    id: 'bow', name: 'HUNTING BOW',
    blurb: 'Reloads faster than the sling and reaches furthest, but the arrow needs a much thinner line.',
    rate: 1 / C.BOW_RELOAD, hitbox: C.BOW_HITBOX_BONUS, range: C.BOW_RANGE,
    line: `${C.BOW_RELOAD} s reload · ${C.BOW_RANGE} m`,
  },
];

function pips(v, lo, hi) {
  const n = Math.max(1, Math.min(5, Math.round(1 + ((v - lo) / (hi - lo)) * 4)));
  return '<span class="pips">' + [0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('') + '</span>';
}

function setupLoadout() {
  const host = $('gear');
  const rates = GEAR.map((g) => g.rate), boxes = GEAR.map((g) => g.hitbox), ranges = GEAR.map((g) => g.range);
  const span = (a) => [Math.min(...a), Math.max(...a)];
  for (const g of GEAR) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gear';
    b.setAttribute('role', 'radio');
    b.dataset.gear = g.id;
    b.innerHTML =
      `<div class="slot-head"><span class="slot-key">2</span><b>${g.name}</b></div>` +
      `<p>${g.blurb}</p>` +
      `<div class="stats">` +
      `<span>RATE</span>${pips(g.rate, ...span(rates))}` +
      `<span>HITBOX</span>${pips(g.hitbox, ...span(boxes))}` +
      `<span>RANGE</span>${pips(g.range, ...span(ranges))}` +
      `</div><small>${g.line}</small>`;
    b.addEventListener('click', () => { settings.secondary = g.id; saveSettings('general'); sync(); });
    host.appendChild(b);
  }
  function sync() {
    for (const b of host.children) {
      const on = b.dataset.gear === settings.secondary;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    }
  }
  sync();
}
