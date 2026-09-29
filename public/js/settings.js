// Player settings: general options, keybinds and the audio mixer. One shared
// object, saved to localStorage, edited live from the Settings panel (opened
// from the title menu or the pause screen).

const $ = (id) => document.getElementById(id);

// Each action has two slots. Codes are KeyboardEvent.code values, or
// "Mouse0".."Mouse4" for mouse buttons.
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', def: ['KeyW', 'ArrowUp'] },
  { id: 'back', label: 'Move back', def: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Strafe left', def: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Strafe right', def: ['KeyD', 'ArrowRight'] },
  { id: 'jump', label: 'Jump (hold to hop)', def: ['Space', null] },
  { id: 'slide', label: 'Slide / crouch', def: ['ControlLeft', 'KeyC'] },
  { id: 'sprint', label: 'Sprint (walk, with auto sprint)', def: ['ShiftLeft', null] },
  { id: 'attack', label: 'Stab / sling shot', def: ['Mouse0', null] },
  { id: 'throw', label: 'Charge & throw spear', def: ['Mouse2', null] },
  { id: 'quickStab', label: 'Quick stab', def: ['KeyF', null] },
  { id: 'scan', label: 'Scan (sense enemies)', def: ['KeyE', null] },
  { id: 'swap', label: 'Swap weapon', def: ['KeyQ', null] },
  { id: 'spear', label: 'Equip spear', def: ['Digit1', null] },
  { id: 'sling', label: 'Equip sling', def: ['Digit2', null] },
  { id: 'reset', label: 'Restart course (practice)', def: ['KeyR', null] },
];

export const BUSES = [
  { id: 'master', label: 'Master' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'hits', label: 'Kills & deaths' },
  { id: 'movement', label: 'Movement' },
  { id: 'ui', label: 'Interface' },
  { id: 'music', label: 'Music' },
];

const DEFAULTS = {
  name: '',
  character: 'brute',
  sens: 1,
  fov: 100,
  res: 270,
  fullscreen: true,
  autoSprint: false,
  grace: 3,                // Relic Run burst countdown when you host (seconds)
  musicTrack: 'shuffle',   // a TRACKS index or 'shuffle'
  map: 'random',           // arena for rooms you create: an ARENAS id or 'random'
  mode: 'dm',              // 'dm' (deathmatch) or 'relic' (Relic Run)
  binds: Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.def]])),
  volumes: { master: 0.7, weapons: 1, hits: 1, movement: 0.8, ui: 0.8, music: 0.6 },
};

function load(key, fallback) {
  try { const v = localStorage.getItem('bloodflint.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem('bloodflint.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function loadAll() {
  const saved = load('settings', null);
  const s = structuredClone(DEFAULTS);
  if (saved) {
    Object.assign(s, saved);
    s.binds = { ...structuredClone(DEFAULTS.binds), ...(saved.binds || {}) };
    s.volumes = { ...DEFAULTS.volumes, ...(saved.volumes || {}) };
  } else {
    // Carry over values saved by the first version, which stored keys one by one.
    for (const k of ['name', 'character', 'sens', 'fov', 'res']) s[k] = load(k, s[k]);
    s.volumes.master = load('volume', s.volumes.master);
  }
  return s;
}

export const settings = loadAll();
const listeners = [];
export function onSettingsChange(fn) { listeners.push(fn); }
export function saveSettings(what = 'general') {
  store('settings', settings);
  for (const fn of listeners) fn(what);
}

/** Actions bound to an input code, e.g. 'KeyW' -> ['forward']. */
export function actionsFor(code) {
  return ACTIONS.filter((a) => settings.binds[a.id].includes(code)).map((a) => a.id);
}

export function keyName(code) {
  if (!code) return '—';
  const mouse = { Mouse0: 'MOUSE 1', Mouse1: 'MOUSE 3', Mouse2: 'MOUSE 2', Mouse3: 'MOUSE 4', Mouse4: 'MOUSE 5' };
  if (mouse[code]) return mouse[code];
  const named = {
    Space: 'SPACE', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
    AltLeft: 'L-ALT', AltRight: 'R-ALT', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    CapsLock: 'CAPS', Tab: 'TAB', Enter: 'ENTER', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

// ---------------------------------------------------------------- panel

let capture = null;   // { action, slot, button } while waiting for a key

export function setupSettingsPanel({ onPreview } = {}) {
  const modal = $('settings');
  const tabs = modal.querySelectorAll('[data-tab]');
  const pages = modal.querySelectorAll('[data-page]');
  function showTab(id) {
    for (const t of tabs) t.classList.toggle('active', t.dataset.tab === id);
    for (const p of pages) p.hidden = p.dataset.page !== id;
  }
  for (const t of tabs) t.addEventListener('click', () => showTab(t.dataset.tab));
  showTab('general');

  // General
  function slider(id, key, fmt) {
    const el = $(id), out = $(id + '-out');
    const sync = () => { el.value = settings[key]; out.textContent = fmt(settings[key]); };
    sync();
    el.addEventListener('input', () => { settings[key] = +el.value; out.textContent = fmt(+el.value); saveSettings('general'); });
    return sync;
  }
  const syncs = [
    slider('set-sens', 'sens', (v) => (+v).toFixed(2)),
    slider('set-fov', 'fov', (v) => String(v)),
  ];
  const res = $('set-res');
  res.addEventListener('change', () => { settings.res = +res.value; saveSettings('video'); });
  const fs = $('set-fullscreen'), auto = $('set-autosprint'), track = $('set-track');
  fs.addEventListener('change', () => { settings.fullscreen = fs.checked; saveSettings('general'); });
  auto.addEventListener('change', () => { settings.autoSprint = auto.checked; saveSettings('general'); });
  track.addEventListener('change', () => {
    settings.musicTrack = track.value === 'shuffle' ? 'shuffle' : +track.value;
    saveSettings('music');
  });
  syncs.push(() => {
    res.value = String(settings.res);
    fs.checked = settings.fullscreen;
    auto.checked = settings.autoSprint;
    track.value = String(settings.musicTrack);
  });

  // Controls
  const list = $('bind-list');
  function renderBinds() {
    list.innerHTML = '';
    for (const a of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'bind-row';
      const name = document.createElement('span');
      name.textContent = a.label;
      row.append(name);
      for (let slot = 0; slot < 2; slot++) {
        const b = document.createElement('button');
        b.className = 'bind';
        b.textContent = keyName(settings.binds[a.id][slot]);
        b.addEventListener('click', (e) => { e.stopPropagation(); beginCapture(a.id, slot, b); });
        row.append(b);
      }
      list.append(row);
    }
    const ctrl = Object.values(settings.binds).flat().some((c) => c === 'ControlLeft' || c === 'ControlRight');
    $('ctrl-warning').hidden = !ctrl;
  }
  function finishCapture(code) {
    if (!capture) return;
    const { action, slot } = capture;
    capture = null;
    document.body.classList.remove('capturing');
    if (code !== undefined) {
      // A key can only do one thing: take it off whatever had it before.
      if (code) for (const id of Object.keys(settings.binds)) settings.binds[id] = settings.binds[id].map((c) => (c === code ? null : c));
      settings.binds[action][slot] = code;
      saveSettings('binds');
    }
    renderBinds();
  }
  function beginCapture(action, slot, button) {
    if (capture) finishCapture();
    capture = { action, slot };
    button.textContent = 'PRESS A KEY…';
    button.classList.add('listening');
    document.body.classList.add('capturing');
  }
  // Capture phase, so the game never sees the key being bound.
  addEventListener('keydown', (e) => {
    if (!capture) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') finishCapture();                       // cancel
    else if (e.code === 'Backspace' || e.code === 'Delete') finishCapture(null);   // clear
    else finishCapture(e.code);
  }, true);
  addEventListener('mousedown', (e) => {
    if (!capture) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    finishCapture(`Mouse${e.button}`);
  }, true);
  addEventListener('contextmenu', (e) => { if (document.body.classList.contains('capturing') || !modal.hidden) e.preventDefault(); }, true);
  $('binds-reset').addEventListener('click', () => {
    settings.binds = structuredClone(DEFAULTS.binds);
    saveSettings('binds');
    renderBinds();
  });

  // Audio mixer
  const mixer = $('mixer');
  const volumeSyncs = [];
  let previewTimer = 0;
  for (const bus of BUSES) {
    const row = document.createElement('label');
    row.className = 'field row';
    row.innerHTML = `<span>${bus.label}</span><input type="range" min="0" max="1" step="0.05"><output></output>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    const sync = () => { input.value = settings.volumes[bus.id]; out.textContent = String(Math.round(settings.volumes[bus.id] * 100)); };
    sync();
    volumeSyncs.push(sync);
    input.addEventListener('input', () => {
      settings.volumes[bus.id] = +input.value;
      out.textContent = String(Math.round(+input.value * 100));
      saveSettings('audio');
      // Play a sample from that channel so you can hear the level you picked.
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => onPreview && onPreview(bus.id), 120);
    });
    mixer.append(row);
  }
  $('mixer-reset').addEventListener('click', () => {
    settings.volumes = { ...DEFAULTS.volumes };
    saveSettings('audio');
    for (const s of volumeSyncs) s();
  });

  function close() {
    finishCapture();
    modal.hidden = true;
  }
  $('settings-close').addEventListener('click', close);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal && !capture) close(); });
  addEventListener('keydown', (e) => { if (!modal.hidden && !capture && e.code === 'Escape') close(); });

  return {
    open(tab = 'general') {
      for (const s of syncs) s();
      for (const s of volumeSyncs) s();
      renderBinds();
      showTab(tab);
      modal.hidden = false;
    },
    close,
    get isOpen() { return !modal.hidden; },
  };
}
