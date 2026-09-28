// Title menu: character preview, settings, and quick match / private room / join.

import * as THREE from 'three';
import { createCharacter, CHARACTER_INFO } from './characters.js';

const $ = (id) => document.getElementById(id);

function load(key, fallback) {
  try { const v = localStorage.getItem('bloodflint.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem('bloodflint.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function loadSettings() {
  return {
    name: load('name', ''),
    character: load('character', 'brute'),
    sens: load('sens', 1),
    fov: load('fov', 100),
    volume: load('volume', 0.7),
    res: load('res', 270),
  };
}

export function setupMenu({ onStart }) {
  const settings = loadSettings();
  const menu = $('menu');

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
    save('character', type);
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
    model.update({ vx: 0, vz: 0, yaw: Math.sin(t * 0.6) * 0.7, pitch: 0, crouch: false, slide: false, ground: true, weapon: 'spear', hasSpear: true }, dt);
    key.intensity = 30 * (0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 5.3));
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Settings
  const name = $('name');
  name.value = settings.name;
  name.addEventListener('input', () => { settings.name = name.value; save('name', name.value); });
  function slider(id, outId, key, fmt) {
    const el = $(id), out = $(outId);
    el.value = settings[key];
    out.textContent = fmt(settings[key]);
    el.addEventListener('input', () => { settings[key] = +el.value; out.textContent = fmt(+el.value); save(key, +el.value); });
  }
  slider('sens', 'sens-out', 'sens', (v) => v.toFixed(2));
  slider('fov', 'fov-out', 'fov', (v) => String(v));
  slider('vol', 'vol-out', 'volume', (v) => String(Math.round(v * 100)));
  const res = $('res');
  res.value = String(settings.res);
  res.addEventListener('change', () => { settings.res = +res.value; save('res', +res.value); });

  const code = $('code');
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) code.value = urlRoom.toUpperCase();
  code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); });

  const start = (opts) => {
    $('menu-error').textContent = '';
    onStart({ ...settings, name: settings.name || 'Caveman', ...opts });
  };
  $('quick').addEventListener('click', () => start({}));
  $('create').addEventListener('click', () => start({ private: true }));
  $('join').addEventListener('click', () => {
    if (code.value.length !== 4) { $('menu-error').textContent = 'Room codes are four letters.'; return; }
    start({ room: code.value });
  });
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join').click(); });

  return {
    settings,
    hide() { menu.hidden = true; running = false; },
    show(error = '') {
      menu.hidden = false;
      $('menu-error').textContent = error;
      if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
    },
  };
}
