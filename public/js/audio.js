// All sound is synthesised with WebAudio, so there are no audio files to ship.

let ctx = null, master = null, noiseBuf = null, slideNode = null, slideGain = null;

export function initAudio(volume = 0.7) {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Cave ambience: low filtered rumble plus a slow wobble
  const rumble = ctx.createBufferSource();
  rumble.buffer = noiseBuf;
  rumble.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 90;
  const rg = ctx.createGain();
  rg.gain.value = 0.5;
  rumble.connect(lp).connect(rg).connect(master);
  rumble.start();
  const drone = ctx.createOscillator();
  drone.type = 'sawtooth';
  drone.frequency.value = 41;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 120;
  const dg = ctx.createGain();
  dg.gain.value = 0.05;
  drone.connect(dlp).connect(dg).connect(master);
  drone.start();

  // Looping scrape for slides; faded in and out by setSliding()
  slideNode = ctx.createBufferSource();
  slideNode.buffer = noiseBuf;
  slideNode.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.8;
  slideGain = ctx.createGain();
  slideGain.gain.value = 0;
  slideNode.connect(bp).connect(slideGain).connect(master);
  slideNode.start();

  // Drips: random plinks
  const drip = () => {
    if (!ctx) return;
    tone(1400 + Math.random() * 900, 0.12, 'sine', 0.06, 0.35);
    setTimeout(drip, 2500 + Math.random() * 6000);
  };
  setTimeout(drip, 3000);
}

export function setVolume(v) { if (master) master.gain.value = v; }

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseHit({ freq = 1000, q = 1, type = 'bandpass', peak = 0.5, attack = 0.003, decay = 0.15, sweepTo = null, pan = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime;
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
  src.connect(f).connect(g).connect(p).connect(master);
  src.start(t, Math.random());
  src.stop(t + attack + decay + 0.05);
}

function tone(freq, decay, type = 'sine', peak = 0.3, slideTo = null, pan = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(freq * slideTo, t + decay);
  const g = ctx.createGain();
  env(g, t, peak, 0.004, decay);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(g).connect(p).connect(master);
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
    tone(90, 0.5, 'sawtooth', 0.4, 0.4);
    noiseHit({ freq: 300, type: 'lowpass', peak: 0.8, decay: 0.35 });
    tone(660, 0.25, 'square', 0.1, 0.5);
  },
  death() {
    tone(60, 0.9, 'sawtooth', 0.5, 0.3);
    noiseHit({ freq: 200, type: 'lowpass', peak: 0.9, decay: 0.6 });
  },
  jump() { noiseHit({ freq: 600, q: 1, peak: 0.12, decay: 0.06 }); },
  land() { tone(80, 0.08, 'sine', 0.3, 0.6); noiseHit({ freq: 300, peak: 0.15, decay: 0.05 }); },
  slide() { noiseHit({ freq: 1200, sweepTo: 500, peak: 0.25, decay: 0.2 }); },
  step() { noiseHit({ freq: 500 + Math.random() * 200, q: 2, peak: 0.07, decay: 0.04 }); },
  pickup() { tone(330, 0.1, 'square', 0.12, 2); setTimeout(() => tone(495, 0.12, 'square', 0.1, 1.5), 60); },
  reloaded() { tone(900, 0.05, 'square', 0.06, 0.8); },
  win() { [220, 277, 330, 440].forEach((f, i) => setTimeout(() => tone(f, 0.5, 'sawtooth', 0.15, 1), i * 140)); },
  lose() { [220, 207, 196, 147].forEach((f, i) => setTimeout(() => tone(f, 0.6, 'sawtooth', 0.15, 1), i * 180)); },
  setSliding(on) {
    if (!ctx) return;
    slideGain.gain.setTargetAtTime(on ? 0.12 : 0, ctx.currentTime, 0.04);
  },
};
