// All sound is synthesised with WebAudio, so there are no audio files to ship.
//
// Routing: every sound goes through one of the mixer channels (weapons, hits,
// movement, ambience, ui, music), then master, then a compressor.
//
// Music: three original 90s boom-bap beats, sequenced live. Swung 16th hats,
// dusty kick and snare, Rhodes-style 7th/9th chords, a bass line and vinyl
// crackle, all through a little saturation and a low-pass for that sampler
// grit. These are new compositions in the style, not recreations of any
// existing record.

let ctx = null, master = null, noiseBuf = null, slideGain = null;
const buses = {};
let musicLP = null;

const BUS_IDS = ['weapons', 'hits', 'movement', 'ambience', 'ui', 'music'];

export function initAudio(volumes = {}) {
  if (ctx) { ctx.resume(); applyVolumes(volumes); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  for (const id of BUS_IDS) {
    buses[id] = ctx.createGain();
    buses[id].connect(master);
  }
  applyVolumes(volumes);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  initAmbience();

  // Looping scrape for slides; faded in and out by setSliding()
  const slideNode = ctx.createBufferSource();
  slideNode.buffer = noiseBuf;
  slideNode.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 650;
  bp.Q.value = 0.6;
  slideGain = ctx.createGain();
  slideGain.gain.value = 0;
  slideNode.connect(bp).connect(slideGain).connect(buses.movement);
  slideNode.start();

  initMusic();
}

export function applyVolumes(v = {}) {
  if (!ctx) return;
  if (v.master !== undefined) master.gain.value = v.master;
  for (const id of BUS_IDS) if (v[id] !== undefined) buses[id].gain.value = v[id];
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseHit({ freq = 1000, q = 1, type = 'bandpass', peak = 0.5, attack = 0.003, decay = 0.15, sweepTo = null, pan = 0, bus = 'weapons', at = null } = {}) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(f).connect(g).connect(p).connect(bus === 'music' ? musicIn : buses[bus]);
  src.start(t, Math.random());
  src.stop(t + attack + decay + 0.05);
}

function tone(freq, decay, type = 'sine', peak = 0.3, slideTo = null, pan = 0, bus = 'weapons', at = null) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(freq * slideTo, t + decay);
  const g = ctx.createGain();
  env(g, t, peak, 0.004, decay);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(g).connect(p).connect(bus === 'music' ? musicIn : buses[bus]);
  o.start(t);
  o.stop(t + decay + 0.05);
}

// `dist` and `pan` let remote sounds fall off and sit left or right.
function falloff(dist) { return dist == null ? 1 : Math.max(0.08, 1 - dist / 45); }

export const sfx = {
  sling(dist, pan = 0) {
    const k = falloff(dist);
    noiseHit({ freq: 2500, sweepTo: 600, q: 2, peak: 0.5 * k, decay: 0.18, pan });
    noiseHit({ freq: 3000, type: 'highpass', peak: 0.35 * k, decay: 0.05, pan });
  },
  throwSpear(dist, pan = 0) {
    const k = falloff(dist);
    noiseHit({ freq: 700, sweepTo: 250, q: 1.5, peak: 0.6 * k, decay: 0.28, pan });
  },
  stab(dist, pan = 0) {
    const k = falloff(dist);
    noiseHit({ freq: 400, q: 0.8, peak: 0.5 * k, decay: 0.12, pan });
    tone(120, 0.1, 'triangle', 0.3 * k, 0.5, pan);
  },
  impact(dist) {
    const k = falloff(dist);
    noiseHit({ freq: 1800, q: 3, peak: 0.25 * k, decay: 0.08 });
    tone(220, 0.06, 'square', 0.05 * k, 0.5);
  },
  kill() {
    tone(90, 0.5, 'sawtooth', 0.4, 0.4, 0, 'hits');
    noiseHit({ freq: 300, type: 'lowpass', peak: 0.8, decay: 0.35, bus: 'hits' });
    sfx.scratch();
  },
  // A "wikka-wikka" record scratch: noise pushed back and forth through a band-pass.
  scratch() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const moves = [[0, 700, 2400], [0.07, 2400, 500], [0.13, 600, 2800], [0.2, 2800, 400]];
    for (const [off, a, b] of moves) {
      f.frequency.setValueAtTime(a, t + off);
      f.frequency.exponentialRampToValueAtTime(b, t + off + 0.06);
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.35, t + off + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.06);
    }
    src.connect(f).connect(g).connect(buses.hits);
    src.start(t, Math.random());
    src.stop(t + 0.3);
  },
  death() {
    tone(60, 0.9, 'sawtooth', 0.5, 0.3, 0, 'hits');
    noiseHit({ freq: 200, type: 'lowpass', peak: 0.9, decay: 0.6, bus: 'hits' });
  },
  jump() { noiseHit({ freq: 600, q: 1, peak: 0.12, decay: 0.06, bus: 'movement' }); },
  land() { tone(80, 0.08, 'sine', 0.3, 0.6, 0, 'movement'); noiseHit({ freq: 300, peak: 0.15, decay: 0.05, bus: 'movement' }); },
  slide() { noiseHit({ freq: 900, sweepTo: 400, peak: 0.09, decay: 0.18, bus: 'movement' }); },
  step() { noiseHit({ freq: 500 + Math.random() * 200, q: 2, peak: 0.07, decay: 0.04, bus: 'movement' }); },
  chain() { tone(2600 + Math.random() * 900, 0.05, 'triangle', 0.035, 1.2, 0, 'movement'); },
  pickup() {
    tone(330, 0.1, 'square', 0.12, 2, 0, 'ui');
    setTimeout(() => tone(495, 0.12, 'square', 0.1, 1.5, 0, 'ui'), 60);
  },
  reloaded() { tone(900, 0.05, 'square', 0.06, 0.8, 0, 'ui'); },
  win() { [220, 277, 330, 440].forEach((f, i) => setTimeout(() => tone(f, 0.5, 'sawtooth', 0.15, 1, 0, 'ui'), i * 140)); },
  lose() { [220, 207, 196, 147].forEach((f, i) => setTimeout(() => tone(f, 0.6, 'sawtooth', 0.15, 1, 0, 'ui'), i * 180)); },
  setSliding(on) {
    if (!ctx) return;
    // Quiet on purpose: present, but not a beacon for your position
    slideGain.gain.setTargetAtTime(on ? 0.04 : 0, ctx.currentTime, 0.06);
  },
  // Our scan: a rising shimmer
  scan() {
    if (!ctx) return;
    for (const detune of [0, 7]) {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(260 + detune, t);
      o.frequency.exponentialRampToValueAtTime(1100 + detune * 3, t + 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(buses.ui);
      o.start(t);
      o.stop(t + 0.75);
    }
    noiseHit({ freq: 3000, sweepTo: 800, q: 2, peak: 0.08, decay: 0.5, bus: 'ui' });
  },
  // Someone got caught in the scan
  scanPing() { tone(1320, 0.35, 'sine', 0.08, 0.98, 0, 'ui'); tone(1980, 0.25, 'sine', 0.04, 0.98, 0, 'ui'); },
  // An opponent scanned: a breathy whisper from their direction
  scanDistant(dist, pan = 0) {
    noiseHit({ freq: 1400, sweepTo: 3200, q: 4, peak: 0.12 * falloff(dist), decay: 0.5, attack: 0.08, pan, bus: 'weapons' });
  },
  launch() { noiseHit({ freq: 300, sweepTo: 1800, q: 1.2, peak: 0.3, decay: 0.45, bus: 'movement' }); tone(70, 0.3, 'sine', 0.3, 2.2, 0, 'movement'); },
  // The skull: a bone rattle and a low groan when taken
  relicTake(mine) {
    for (let i = 0; i < 6; i++) setTimeout(() => noiseHit({ freq: 1800 + Math.random() * 1400, q: 6, peak: 0.12, decay: 0.03, bus: 'ui' }), i * 45);
    tone(mine ? 82 : 62, 0.9, 'sawtooth', 0.12, 0.7, 0, 'ui');
  },
  relicDrop() { tone(140, 0.25, 'triangle', 0.2, 0.5, 0, 'ui'); noiseHit({ freq: 500, peak: 0.2, decay: 0.15, bus: 'ui' }); },
  relicScore(mine) {
    const notes = mine ? [196, 247, 294, 392] : [196, 185, 165, 131];
    notes.forEach((f, i) => setTimeout(() => tone(f, 0.6, 'sawtooth', 0.14, 1, 0, 'ui'), i * 120));
    sfx.scratch();
  },
  rustle(dist, pan = 0) {
    noiseHit({ freq: 2200, q: 0.7, peak: 0.1 * falloff(dist), decay: 0.22, attack: 0.02, pan, bus: 'movement' });
  },
};

/** Plays one example sound from a mixer channel, for the settings panel. */
export function previewBus(id) {
  if (!ctx) return;
  if (id === 'weapons' || id === 'master') sfx.sling();
  else if (id === 'hits') sfx.kill();
  else if (id === 'movement') { sfx.land(); sfx.chain(); }
  else if (id === 'ui') sfx.pickup();
  else if (id === 'ambience') tone(1600, 0.12, 'sine', 0.08, 0.35, 0, 'ambience');
  // music is already playing, so the level change is heard directly
}

// ---------------------------------------------------------------- ambience
//
// Kept low and slow so it never nags: no constant tones, nothing periodic you
// can count. Cave: a rumble that swells and fades over ~20 s, and rare, soft
// drips with a faint echo. Outdoors: wind gusts and the odd cricket.

let ambience = null;

function initAmbience() {
  const cave = ctx.createGain();
  const outdoor = ctx.createGain();
  cave.gain.value = 0;
  outdoor.gain.value = 0;
  cave.connect(buses.ambience);
  outdoor.connect(buses.ambience);

  // Rumble with a slow swell
  const rumble = ctx.createBufferSource();
  rumble.buffer = noiseBuf;
  rumble.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 70;
  const rg = ctx.createGain();
  rg.gain.value = 0.12;
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.05;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.06;
  swell.connect(swellDepth).connect(rg.gain);
  rumble.connect(lp).connect(rg).connect(cave);
  rumble.start();
  swell.start();

  // Wind: band-passed noise whose level and pitch drift on two slow, unrelated LFOs
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuf;
  wind.loop = true;
  wind.playbackRate.value = 0.5;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 420;
  wf.Q.value = 0.7;
  const wg = ctx.createGain();
  wg.gain.value = 0.05;
  const gust = ctx.createOscillator();
  gust.frequency.value = 0.07;
  const gustDepth = ctx.createGain();
  gustDepth.gain.value = 0.04;
  gust.connect(gustDepth).connect(wg.gain);
  const whistle = ctx.createOscillator();
  whistle.frequency.value = 0.031;
  const whistleDepth = ctx.createGain();
  whistleDepth.gain.value = 180;
  whistle.connect(whistleDepth).connect(wf.frequency);
  wind.connect(wf).connect(wg).connect(outdoor);
  wind.start();
  gust.start();
  whistle.start();

  ambience = { cave, outdoor, kind: null };

  // Sparse one-shots, scheduled at random so there's no rhythm to notice
  const drip = () => {
    if (ambience.kind === 'cave') {
      const pan = Math.random() * 1.6 - 0.8, f = 1300 + Math.random() * 1100;
      tone(f, 0.1, 'sine', 0.03, 0.4, pan, 'ambience');
      setTimeout(() => tone(f, 0.1, 'sine', 0.01, 0.4, -pan, 'ambience'), 170);
    }
    setTimeout(drip, 6000 + Math.random() * 12000);
  };
  const cricket = () => {
    if (ambience.kind === 'outdoor') {
      const pan = Math.random() * 1.6 - 0.8, f = 4200 + Math.random() * 600;
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
        setTimeout(() => tone(f, 0.03, 'sine', 0.012, 1, pan, 'ambience'), i * 70);
      }
    }
    setTimeout(cricket, 3000 + Math.random() * 9000);
  };
  setTimeout(drip, 4000);
  setTimeout(cricket, 2500);
}

/** 'cave' | 'outdoor' | null (menu). */
export function setAmbience(kind) {
  if (!ambience || ambience.kind === kind) return;
  ambience.kind = kind;
  const t = ctx.currentTime;
  ambience.cave.gain.setTargetAtTime(kind === 'cave' ? 1 : 0, t, 0.8);
  ambience.outdoor.gain.setTargetAtTime(kind === 'outdoor' ? 1 : 0, t, 0.8);
}

// ---------------------------------------------------------------- music

// Chords are semitone offsets from the track's root (MIDI note number).
export const TRACKS = [
  {
    name: 'Kiln Cypher', bpm: 88, swing: 0.6, root: 45,           // A minor
    chords: [[0, 7, 10, 14], [5, 12, 15, 19], [8, 12, 15, 19], [7, 11, 14, 17]],   // Am9 Dm9 Fmaj7 E7
    kick: [0, 7, 10], snare: [4, 12], ghost: [15], bass: [[0, 0, 6], [10, 0, 2], [14, 12, 2]],
    stabs: [[0, 6], [6, 2], [11, 2]],
  },
  {
    name: 'Red Moon Blues', bpm: 84, swing: 0.58, root: 38,        // D minor
    chords: [[0, 7, 10, 15], [5, 10, 13, 17], [8, 12, 15, 21], [7, 11, 14, 18]],   // Dm7 Gm7 Bbmaj7 A7
    kick: [0, 3, 8, 11], snare: [4, 12], ghost: [7, 14], bass: [[0, 0, 4], [8, 7, 2], [11, 0, 3]],
    stabs: [[0, 4], [8, 3]],
  },
  {
    name: 'Flint Street', bpm: 93, swing: 0.56, root: 40,          // E minor
    chords: [[0, 7, 10, 14], [8, 12, 15, 19], [5, 12, 15, 19], [7, 11, 14, 18]],   // Em9 Cmaj7 Am7 B7
    kick: [0, 6, 9, 13], snare: [4, 12], ghost: [10], bass: [[0, 0, 3], [6, 0, 2], [9, 7, 2], [13, 10, 2]],
    stabs: [[2, 3], [10, 2], [14, 2]],
  },
];

let musicIn = null;          // entry point for music voices (before the lo-fi chain)
let keysBus = null;
let seq = null;              // { track, step, bar, nextTime }
let seqTimer = 0;
let wantedTrack = 0;

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function initMusic() {
  // Lo-fi chain: soft saturation, then a low-pass that also does the
  // "muffled" effect while you're dead.
  musicIn = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
  shaper.curve = curve;
  musicLP = ctx.createBiquadFilter();
  musicLP.type = 'lowpass';
  musicLP.frequency.value = 7000;
  musicLP.Q.value = 0.5;
  const trim = ctx.createGain();
  trim.gain.value = 0.55;
  musicIn.connect(shaper).connect(musicLP).connect(trim).connect(buses.music);

  // Rhodes tremolo lives on its own sub-bus
  keysBus = ctx.createGain();
  keysBus.gain.value = 0.8;
  const trem = ctx.createOscillator();
  trem.frequency.value = 4.5;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.18;
  trem.connect(tremDepth).connect(keysBus.gain);
  trem.start();
  const keysLP = ctx.createBiquadFilter();
  keysLP.type = 'lowpass';
  keysLP.frequency.value = 2400;
  keysBus.connect(keysLP).connect(musicIn);

  // Vinyl crackle: a sparse stream of clicks plus soft hiss
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuf;
  hiss.loop = true;
  const hf = ctx.createBiquadFilter();
  hf.type = 'bandpass';
  hf.frequency.value = 5000;
  hf.Q.value = 0.4;
  const hg = ctx.createGain();
  hg.gain.value = 0.012;
  hiss.connect(hf).connect(hg).connect(musicIn);
  hiss.start();
}

/** index: a TRACKS index, or 'shuffle'. */
export function playMusic(index = wantedTrack) {
  if (!ctx) return;
  if (index === 'shuffle') index = Math.floor(Math.random() * TRACKS.length);
  wantedTrack = index;
  const track = TRACKS[index] || TRACKS[0];
  if (seq && seq.track === track) return;
  seq = { track, step: 0, bar: 0, nextTime: ctx.currentTime + 0.1 };
  if (!seqTimer) seqTimer = setInterval(schedule, 25);
}

export function stopMusic() {
  seq = null;
  clearInterval(seqTimer);
  seqTimer = 0;
}

export function currentTrackName() { return seq ? seq.track.name : ''; }

/** Muffle the beat (while dead, paused...). */
export function setMusicMuffled(on) {
  if (!musicLP) return;
  musicLP.frequency.setTargetAtTime(on ? 380 : 7000, ctx.currentTime, 0.15);
}

function schedule() {
  if (!seq || !ctx) return;
  const ahead = ctx.currentTime + 0.12;
  while (seq.nextTime < ahead) {
    playStep(seq, seq.nextTime);
    const sixteenth = 60 / seq.track.bpm / 4;
    // Swing: even 16ths are long, odd ones short.
    const long = sixteenth * 2 * seq.track.swing;
    seq.nextTime += seq.step % 2 === 0 ? long : sixteenth * 2 - long;
    seq.step = (seq.step + 1) % 16;
    if (seq.step === 0) seq.bar++;
  }
}

function playStep(s, t) {
  const tr = s.track, step = s.step, bar = s.bar;
  const beat = 60 / tr.bpm;
  const fill = bar % 8 === 7 && step >= 12;          // a little turnaround every 8 bars
  const chord = tr.chords[bar % tr.chords.length];

  if (tr.kick.includes(step) && !(fill && step > 12)) kick(t);
  if (tr.snare.includes(step) || (fill && step % 2 === 1)) snare(t, 1);
  if (tr.ghost.includes(step)) snare(t, 0.25);
  const hatVel = [0.55, 0.18, 0.35, 0.2][step % 4];
  hat(t, hatVel, step === 14 && bar % 2 === 1);

  for (const [at, off, len] of tr.bass) if (at === step) bassNote(midiHz(tr.root - 12 + chord[0] + off), len * beat / 4, t);
  for (const [at, len] of tr.stabs) if (at === step) for (const n of chord) rhodes(midiHz(tr.root + 12 + n), len * beat / 4, t);
}

function kick(t) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
  const g = ctx.createGain();
  env(g, t, 1, 0.003, 0.42);
  o.connect(g).connect(musicIn);
  o.start(t);
  o.stop(t + 0.5);
  noiseHit({ freq: 3000, type: 'highpass', peak: 0.12, decay: 0.01, bus: 'music', at: t });
}

function snare(t, vel) {
  noiseHit({ freq: 1900, q: 0.7, peak: 0.55 * vel, decay: 0.18, bus: 'music', at: t });
  tone(190, 0.09, 'triangle', 0.3 * vel, 0.8, 0, 'music', t);
}

function hat(t, vel, open) {
  noiseHit({ freq: 7500, type: 'highpass', peak: 0.12 * vel, decay: open ? 0.22 : 0.035, pan: 0.15, bus: 'music', at: t });
}

function bassNote(freq, len, t) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 320;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
  g.gain.setTargetAtTime(0.0001, t + len, 0.05);
  o.connect(f).connect(g).connect(musicIn);
  o.start(t);
  o.stop(t + len + 0.4);
}

// Electric-piano-ish: a sine with a quiet bell partial on top, fast attack,
// soft decay. The tremolo comes from keysBus.
function rhodes(freq, len, t) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.25);
  g.gain.setTargetAtTime(0.0001, t + len, 0.12);
  const a = ctx.createOscillator();
  a.type = 'sine';
  a.frequency.value = freq;
  const b = ctx.createOscillator();
  b.type = 'sine';
  b.frequency.value = freq * 4.01;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.25, t);
  bg.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
  a.connect(g);
  b.connect(bg).connect(g);
  g.connect(keysBus);
  for (const o of [a, b]) { o.start(t); o.stop(t + len + 0.8); }
}
