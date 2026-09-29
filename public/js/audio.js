// All sound is synthesised with WebAudio, so there are no audio files to ship.
//
// Routing: every sound goes through one of the mixer channels (weapons, hits,
// movement, ui, music), then master, then a compressor. There's no ambience:
// the only sounds are the game's and the beat.
//
// Music: eight original beats in a 90s boom-bap vein, sequenced live, each
// with its own drum kit, instruments and groove. Kept clean on purpose: no
// hi-hats, no vinyl hiss, no saturation, no clicks. These are new compositions in the style, not
// recreations of any existing record.

let ctx = null, master = null, noiseBuf = null, slideGain = null;
const buses = {};
let musicLP = null;

const BUS_IDS = ['weapons', 'hits', 'movement', 'ui', 'music'];

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

// A new GainNode starts at 1, and automation scheduled for "now" can land a
// render block late, so a sound could start at full level for a few ms: a
// click. Start silent, and schedule a hair ahead.
const LEAD = 0.006;
function env(g, t, peak, attack, decay) {
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseHit({ freq = 1000, q = 1, type = 'bandpass', peak = 0.5, attack = 0.003, decay = 0.15, sweepTo = null, pan = 0, bus = 'weapons', at = null } = {}) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime + LEAD;
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

function tone(freq, decay, type = 'sine', peak = 0.3, slideTo = null, pan = 0, bus = 'weapons', at = null, attack = 0.004) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime + LEAD;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(freq * slideTo, t + decay);
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
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
  // A bone knife: a short spinning whoosh
  knife(dist, pan = 0) {
    const k = falloff(dist);
    noiseHit({ freq: 1800, sweepTo: 900, q: 3, peak: 0.35 * k, decay: 0.12, pan });
    noiseHit({ freq: 1400, sweepTo: 700, q: 3, peak: 0.2 * k, decay: 0.1, pan, at: ctx && ctx.currentTime + 0.05 });
  },
  // The bow: a low string twang and the arrow's hiss
  bow(dist, pan = 0) {
    const k = falloff(dist);
    tone(110, 0.22, 'triangle', 0.35 * k, 0.8, pan);
    tone(220, 0.1, 'sine', 0.15 * k, 0.9, pan);
    noiseHit({ freq: 4000, sweepTo: 2000, q: 1.5, peak: 0.2 * k, decay: 0.12, pan });
  },
  // Clipping the arrow's nock onto the string
  nock() {
    tone(1300, 0.02, 'triangle', 0.12, 0.7, 0, 'weapons');
    noiseHit({ freq: 2500, q: 3, peak: 0.12, decay: 0.02 });
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
    const t = ctx.currentTime + LEAD;
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
  // A perfectly timed hop: a small bright tick on top of the jump
  perfectHop() { tone(1900, 0.04, 'sine', 0.05, 1.3, 0, 'movement'); },
  land() { tone(80, 0.08, 'sine', 0.3, 0.6, 0, 'movement'); noiseHit({ freq: 300, peak: 0.15, decay: 0.05, bus: 'movement' }); },
  slide() { noiseHit({ freq: 900, sweepTo: 400, peak: 0.09, decay: 0.18, bus: 'movement' }); },
  step() { noiseHit({ freq: 500 + Math.random() * 200, q: 2, peak: 0.07, decay: 0.04, bus: 'movement' }); },
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
      const t = ctx.currentTime + LEAD;
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
  // The skull bursting: a deep boom with a crack on top
  burst(dist, pan = 0) {
    const k = falloff(dist);
    noiseHit({ freq: 180, type: 'lowpass', peak: 0.9 * k, attack: 0.004, decay: 0.9, sweepTo: 60, pan, bus: 'hits' });
    noiseHit({ freq: 2400, q: 0.6, peak: 0.35 * k, decay: 0.12, pan, bus: 'hits' });
    tone(90, 0.8, 'sine', 0.5 * k, 0.4, pan, 'hits');
  },
  // The carrier's fuse ticking while they're too slow; higher as it runs out
  fuseTick(urgency) {
    tone(700 + urgency * 700, 0.07, 'square', 0.05 + urgency * 0.05, 1, 0, 'ui');
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
  else if (id === 'movement') sfx.land();
  else if (id === 'ui') sfx.pickup();
  // music is already playing, so the level change is heard directly
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
    name: 'Flint Street', bpm: 93, swing: 0.56, root: 40,          // E minor
    chords: [[0, 7, 10, 14], [8, 12, 15, 19], [5, 12, 15, 19], [7, 11, 14, 18]],   // Em9 Cmaj7 Am7 B7
    kick: [0, 6, 9, 13], snare: [4, 12], ghost: [10], bass: [[0, 0, 3], [6, 0, 2], [9, 7, 2], [13, 10, 2]],
    stabs: [[2, 3], [10, 2], [14, 2]],
  },
  // Steady: straight time, the same kick and snare every bar, no fills
  {
    name: 'Bone Yard', bpm: 90, swing: 0.5, root: 43, steady: true,   // G minor
    chords: [[0, 7, 10, 14], [8, 12, 15, 19], [5, 8, 12, 15], [7, 11, 14, 17]],   // Gm9 Ebmaj7 Cm7 D7
    kick: [0, 8, 10], snare: [4, 12], ghost: [], bass: [[0, 0, 4], [8, 0, 2], [10, 7, 2]],
    stabs: [[0, 6], [8, 6]],
  },
  {
    name: 'Obsidian Walk', bpm: 86, swing: 0.5, root: 48, steady: true,   // C minor
    chords: [[0, 7, 10, 14], [8, 12, 15, 19], [5, 8, 15, 19], [7, 11, 14, 17]],   // Cm9 Abmaj7 Fm9 G7
    kick: [0, 6, 8], snare: [4, 12], ghost: [], bass: [[0, 0, 5], [6, 0, 2], [8, 0, 6]],
    stabs: [[0, 4], [8, 4], [12, 2]],
  },
  // Half-time 808 boom, gliding sub, string pad, a bell arpeggio with echo
  {
    name: 'Tar Pit', bpm: 72, swing: 0.5, root: 41, steady: true, form: true, chordBars: 2,   // F minor
    kit: 'boom', keys: 'strings', bassVoice: 'sub', echo: 0.35,
    chords: [[0, 3, 7, 14], [8, 12, 15, 19]],
    kick: [0, 10], snare: [8], ghost: [], bass: [[0, 0, 10], [10, 0, 6]],
    stabs: [[0, 16]],
    lead: { voice: 'bell', oct: 24, in: 'all', notes: [[0, 0, 0, 2], [0, 3, 3, 2], [0, 6, 7, 2], [0, 10, 12, 3], [1, 0, 10, 2], [1, 3, 7, 2], [1, 6, 3, 2], [1, 10, 0, 3]] },
  },
  // Rimshots, slow strings, a plucked pentatonic melody with echo
  {
    name: 'Ember Crown', bpm: 84, swing: 0.56, root: 40, form: true, chordBars: 2,   // E minor
    kit: 'rim', keys: 'strings', bassVoice: 'tri', echo: 0.3,
    chords: [[3, 7, 10, 14], [8, 12, 15, 19]],
    kick: [0, 7, 10], snare: [4, 12], ghost: [], bass: [[0, 0, 4], [7, 0, 2], [10, 7, 3]],
    stabs: [[0, 16]],
    lead: { voice: 'pluck', oct: 24, in: 'all', notes: [[0, 0, 12, 1], [0, 2, 10, 1], [0, 4, 7, 2], [0, 7, 10, 1], [0, 8, 7, 1], [0, 10, 5, 2], [0, 12, 3, 2], [1, 0, 7, 1], [1, 2, 5, 1], [1, 4, 3, 2], [1, 8, 0, 4], [1, 14, -2, 2]] },
  },
  // Tribal toms and a war-drum kick, droning sub, brass stabs
  {
    name: 'Blood Drum', bpm: 104, swing: 0.5, root: 38, steady: true, form: true, chordBars: 4,   // D minor
    kit: 'tribal', keys: 'horns', bassVoice: 'sub', echo: 0.15,
    chords: [[0, 3, 7, 12], [8, 12, 15, 20], [0, 3, 7, 12], [7, 11, 14, 19]],
    kick: [0, 6, 8, 11], snare: [12], ghost: [], bass: [[0, 0, 8], [8, 0, 8]],
    toms: [[2, 1.2, 0.6], [3, 1, 0.5], [10, 0.8, 0.7], [14, 1.3, 0.6], [15, 1.1, 0.5]],
    stabs: [[0, 3], [11, 2]],
  },
  // Half-time and sparse: a descending piano line over a sub, a lonely whistle
  {
    name: 'Slow Burn', bpm: 76, swing: 0.5, root: 45, steady: true, form: true,   // A minor
    kit: 'dusty', keys: 'piano', bassVoice: 'sub', echo: 0.4,
    chords: [[0, 3, 7, 12], [-2, 3, 7, 12], [-3, 3, 6, 12], [-4, 3, 7, 11]],
    kick: [0, 11], snare: [8], ghost: [], bass: [[0, 0, 16]],
    stabs: [[0, 4], [6, 2], [12, 4]],
    lead: { voice: 'whistle', oct: 12, in: 'B', notes: [[0, 0, 12, 6], [0, 8, 15, 4], [0, 12, 14, 4], [1, 0, 12, 8], [1, 10, 7, 6]] },
  },
];

let musicIn = null;          // entry point for music voices
let keysBus = null;
let echoIn = null;           // delay send for lead lines
let echoWet = null;
let echoDelay = null;
let seq = null;              // { track, step, bar, nextTime }
let seqTimer = 0;
let wantedTrack = 0;

const MUSIC_OPEN = 14000;    // low-pass while playing (it closes when you die)
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function initMusic() {
  // Clean chain: just a low-pass, wide open while you play, that does the
  // "muffled" effect while you're dead. The level leaves headroom so the kick
  // never clips.
  musicIn = ctx.createGain();
  musicLP = ctx.createBiquadFilter();
  musicLP.type = 'lowpass';
  musicLP.frequency.value = MUSIC_OPEN;
  musicLP.Q.value = 0.5;
  const trim = ctx.createGain();
  trim.gain.value = 0.62;
  musicIn.connect(musicLP).connect(trim).connect(buses.music);

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
  keysLP.frequency.value = 4000;
  keysBus.connect(keysLP).connect(musicIn);

  // Echo: a dotted-eighth delay with feedback, for lead lines
  echoIn = ctx.createGain();
  echoDelay = ctx.createDelay(2);
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const echoLP = ctx.createBiquadFilter();
  echoLP.type = 'lowpass';
  echoLP.frequency.value = 3000;
  echoWet = ctx.createGain();
  echoWet.gain.value = 0;
  echoIn.connect(echoDelay).connect(echoLP).connect(fb).connect(echoDelay);
  echoLP.connect(echoWet).connect(musicIn);
}

/** index: a TRACKS index, or 'shuffle'. */
export function playMusic(index = wantedTrack) {
  if (!ctx) return;
  if (index === 'shuffle') index = Math.floor(Math.random() * TRACKS.length);
  wantedTrack = index;
  const track = TRACKS[index] || TRACKS[0];
  if (seq && seq.track === track) return;
  seq = { track, step: 0, bar: 0, nextTime: ctx.currentTime + 0.1 };
  echoDelay.delayTime.value = (60 / track.bpm) * 0.75;
  echoWet.gain.value = track.echo || 0;
  lastBassHz = 0;
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
  musicLP.frequency.setTargetAtTime(on ? 380 : MUSIC_OPEN, ctx.currentTime, 0.15);
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

// A track can pick its sounds and shape (every field is optional; the
// defaults are the original dusty kit, Rhodes and triangle bass):
//   kit: dusty | hard | boom | rim | tribal
//   keys: rhodes | organ | pluck | bell | strings | horns | piano | whistle
//   bassVoice: tri | sub | saw                  chordBars: bars per chord
//   toms: [[step, pitch, vel]]                  echo: 0..0.5 on the lead
//   lead: { voice, oct, in: 'all' | 'B', notes: [[bar 0|1, step, semitone, 16ths]] }
//   form: true for sections over 16 bars: a 2-bar intro without kick and
//     bass, the lead in bars 8-15, and a half-bar drop at the end
function playStep(s, t) {
  const tr = s.track, step = s.step, bar = s.bar;
  const six = 60 / tr.bpm / 4;
  const form = tr.form ? bar % 16 : -1;
  const intro = form >= 0 && form < 2;
  const drop = form === 15 && step >= 8;
  const fill = !tr.steady && bar % 8 === 7 && step >= 12;   // a little turnaround every 8 bars
  const chord = tr.chords[Math.floor(bar / (tr.chordBars || 1)) % tr.chords.length];
  const kit = KITS[tr.kit] || KITS.dusty;

  if (!intro && !drop && tr.kick.includes(step) && !(fill && step > 12)) kit.kick(t);
  if (!drop && (tr.snare.includes(step) || (fill && step % 2 === 1))) kit.snare(t, 1);
  if (!intro && tr.ghost.includes(step)) kit.snare(t, 0.25);
  if (tr.toms && !intro) for (const [at, pitch, vel] of tr.toms) if (at === step) tom(t, pitch, vel);

  const bass = BASS[tr.bassVoice] || bassNote;
  if (!intro) for (const [at, off, len] of tr.bass) if (at === step) bass(midiHz(tr.root - 12 + chord[0] + off), len * six, t);
  const keys = KEYS[tr.keys] || rhodes;
  if (!drop) for (const [at, len] of tr.stabs) if (at === step) for (const n of chord) keys(midiHz(tr.root + 12 + n), len * six, t);

  const lead = tr.lead;
  if (lead && !intro && (lead.in !== 'B' || form < 0 || form >= 8)) {
    const voice = KEYS[lead.voice] || rhodes;
    for (const [b, at, semi, len] of lead.notes) {
      if (b === bar % 2 && at === step) voice(midiHz(tr.root + (lead.oct ?? 24) + semi), len * six, t, lead.vel || 1.3, true);
    }
  }
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
}

function snare(t, vel) {
  noiseHit({ freq: 1900, q: 0.7, peak: 0.55 * vel, decay: 0.18, bus: 'music', at: t });
  tone(190, 0.09, 'triangle', 0.3 * vel, 0.8, 0, 'music', t);
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
function rhodes(freq, len, t, vel = 1, echo = false) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07 * vel, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.03 * vel, t + 0.25);
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
  if (echo) g.connect(echoIn);
  for (const o of [a, b]) { o.start(t); o.stop(t + len + 0.8); }
}

// ---------------------------------------------------------------- more kits

function kickHard(t) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  const g = ctx.createGain();
  env(g, t, 1.1, 0.002, 0.3);
  o.connect(g).connect(musicIn);
  o.start(t); o.stop(t + 0.4);
}

// 808-style: a long, low boom
function kickBoom(t) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
  const g = ctx.createGain();
  env(g, t, 1, 0.003, 1.0);
  o.connect(g).connect(musicIn);
  o.start(t); o.stop(t + 1.1);
}

function clap(t, vel) {
  for (let i = 0; i < 3; i++) noiseHit({ freq: 1300, q: 1, peak: 0.35 * vel, decay: 0.02, bus: 'music', at: t + i * 0.012 });
  noiseHit({ freq: 1500, q: 0.8, peak: 0.28 * vel, decay: 0.2, bus: 'music', at: t + 0.036 });
}

function snap(t, vel) {
  noiseHit({ freq: 2600, q: 0.6, peak: 0.45 * vel, decay: 0.14, bus: 'music', at: t });
  tone(220, 0.07, 'triangle', 0.25 * vel, 0.8, 0, 'music', t);
}

// A woody knock rather than a bright tick
function rim(t, vel) {
  tone(520, 0.06, 'triangle', 0.3 * vel, 0.85, 0, 'music', t);
  tone(260, 0.08, 'sine', 0.2 * vel, 0.9, 0, 'music', t);
}

// Low drum; pitch scales 120 Hz
function tom(t, pitch = 1, vel = 0.6) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(180 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(120 * pitch, t + 0.15);
  const g = ctx.createGain();
  env(g, t, 0.7 * vel, 0.003, 0.35);
  o.connect(g).connect(musicIn);
  o.start(t); o.stop(t + 0.45);
}

const KITS = {
  dusty: { kick, snare },
  hard: { kick: kickHard, snare: clap },
  boom: { kick: kickBoom, snare: snap },
  rim: { kick, snare: rim },
  tribal: { kick: kickHard, snare: (t, vel) => { tom(t, 1.8, vel); clap(t, vel * 0.6); } },
};

// ---------------------------------------------------------------- more voices
// Each takes (freq, len, t, vel = 1, echo = false). echo also sends the note
// to the delay, which repeats a dotted eighth later.

function voiceOut(g, echo) {
  g.connect(musicIn);
  if (echo) g.connect(echoIn);
}

function organ(freq, len, t, vel = 1, echo = false) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.045 * vel, t + 0.01);
  g.gain.setTargetAtTime(0.0001, t + len, 0.06);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 1600;
  f.connect(g);
  voiceOut(g, echo);
  for (const [mul, type, lvl] of [[1, 'square', 1], [2, 'square', 0.4], [0.5, 'sine', 0.6]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * mul;
    const og = ctx.createGain(); og.gain.value = lvl;
    o.connect(og).connect(f);
    o.start(t); o.stop(t + len + 0.4);
  }
}

function pluck(freq, len, t, vel = 1, echo = false) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(4000, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
  const g = ctx.createGain();
  env(g, t, 0.07 * vel, 0.003, Math.max(0.2, len) + 0.3);
  o.connect(f).connect(g);
  voiceOut(g, echo);
  o.start(t); o.stop(t + len + 0.7);
}

function bell(freq, len, t, vel = 1, echo = false) {
  const g = ctx.createGain();
  env(g, t, 0.05 * vel, 0.003, 1.2);
  const a = ctx.createOscillator(); a.frequency.value = freq;
  const b = ctx.createOscillator(); b.frequency.value = freq * 3.5;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.35, t);
  bg.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
  a.connect(g); b.connect(bg).connect(g);
  voiceOut(g, echo);
  for (const o of [a, b]) { o.start(t); o.stop(t + 1.4); }
}

function strings(freq, len, t, vel = 1, echo = false) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.028 * vel, t + 0.3);
  g.gain.setTargetAtTime(0.0001, t + len, 0.35);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
  f.connect(g);
  voiceOut(g, echo);
  for (const cents of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = cents;
    o.connect(f);
    o.start(t); o.stop(t + len + 1.6);
  }
}

function horns(freq, len, t, vel = 1, echo = false) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
  f.frequency.exponentialRampToValueAtTime(1100, t + 0.25);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.045 * vel, t + 0.03);
  g.gain.setTargetAtTime(0.0001, t + len, 0.08);
  o.connect(f).connect(g);
  voiceOut(g, echo);
  o.start(t); o.stop(t + len + 0.5);
}

function piano(freq, len, t, vel = 1, echo = false) {
  const g = ctx.createGain();
  env(g, t, 0.07 * vel, 0.004, Math.min(1.6, len + 0.8));
  for (const [mul, type, lvl] of [[1, 'triangle', 1], [2, 'sine', 0.3], [3, 'sine', 0.1]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * mul;
    const og = ctx.createGain(); og.gain.value = lvl;
    o.connect(og).connect(g);
    o.start(t); o.stop(t + len + 1.7);
  }
  voiceOut(g, echo);
}

function whistle(freq, len, t, vel = 1, echo = false) {
  const o = ctx.createOscillator(); o.frequency.value = freq;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
  const depth = ctx.createGain(); depth.gain.value = freq * 0.006;
  lfo.connect(depth).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.04 * vel, t + 0.06);
  g.gain.setTargetAtTime(0.0001, t + len, 0.12);
  o.connect(g);
  voiceOut(g, echo);
  for (const x of [o, lfo]) { x.start(t); x.stop(t + len + 0.8); }
}

const KEYS = { rhodes, organ, pluck, bell, strings, horns, piano, whistle };

// Bass: a sine that glides from the last note, and a filtered saw
let lastBassHz = 0;
function subBass(freq, len, t) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(lastBassHz || freq, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  lastBassHz = freq;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
  g.gain.setTargetAtTime(0.0001, t + len, 0.08);
  o.connect(g).connect(musicIn);
  o.start(t); o.stop(t + len + 0.6);
}

function sawBass(freq, len, t) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(300, t + 0.15);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
  g.gain.setTargetAtTime(0.0001, t + len, 0.05);
  o.connect(f).connect(g).connect(musicIn);
  o.start(t); o.stop(t + len + 0.4);
}

const BASS = { tri: bassNote, sub: subBass, saw: sawBass };
