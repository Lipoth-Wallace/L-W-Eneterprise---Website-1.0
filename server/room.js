// One 1v1 deathmatch. Movement comes from the clients (within sanity limits);
// hits, kills, the spear and the score are decided here.

import * as C from '../shared/constants.js';
import { MAPS } from '../shared/map.js';
import { rayMap, rayPlayer, poseOf, hitboxBonus, normalize, spearRestPoint } from '../shared/raycast.js';

const HISTORY_SECONDS = 1;
const MAX_REPORTED_SPEED = C.MAX_SPEED * 1.35 + 4;   // generous: jitter bunches packets up

let nextPlayerId = 1;

export class Room {
  constructor(code, { isPrivate = false, map = 'kiln', now = () => performance.now() / 1000 } = {}) {
    this.code = code;
    this.map = MAPS[map] && map !== 'range' ? MAPS[map] : MAPS.kiln;
    this.isPrivate = isPrivate;
    this.now = now;
    this.players = new Map();       // id -> player
    this.events = [];               // queued until the next snapshot
    this.matchOverAt = 0;
    this.winner = null;
  }

  get full() { return this.players.size >= 2; }
  get empty() { return this.players.size === 0; }

  addPlayer(send, { name = 'Caveman', character = 'brute' } = {}) {
    const id = nextPlayerId++;
    const p = {
      id,
      send,
      name: String(name).replace(/[^\w \-]/g, '').slice(0, 16) || 'Caveman',
      character: C.CHARACTERS.includes(character) ? character : 'brute',
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      vx: 0, vz: 0,
      crouching: false, sliding: false, onGround: true,
      weapon: 'spear',
      alive: true,
      respawnAt: 0,
      protectedUntil: 0,
      score: 0,
      lastStateAt: 0,
      history: [],
      nextStab: 0, nextThrow: 0, nextSling: 0,
      charging: false, chargeAt: 0, nextScan: 0,
      spear: { state: 'held', p: [0, 0, 0], dir: [0, 0, -1], landedAt: 0 },
      spawnSeq: 0,
    };
    this.players.set(id, p);
    send({ t: 'welcome', id, room: this.code, isPrivate: this.isPrivate, killsToWin: C.KILLS_TO_WIN, map: this.map.id });
    this.spawn(p);
    this.pushEvent({ e: 'join', id, name: p.name });
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.pushEvent({ e: 'leave', id, name: p.name });
    // The match can't carry on 1v0, so the remaining player starts fresh.
    for (const o of this.players.values()) o.score = 0;
    this.matchOverAt = 0;
    this.winner = null;
  }

  opponentOf(p) {
    for (const o of this.players.values()) if (o.id !== p.id) return o;
    return null;
  }

  pushEvent(ev) { this.events.push(ev); }

  spawn(p) {
    const foe = this.opponentOf(p);
    let best = this.map.spawns[0], bestD = -1;
    for (const sp of this.map.spawns) {
      const d = foe && foe.alive ? Math.hypot(sp.p[0] - foe.x, sp.p[2] - foe.z) : Math.random() * 100;
      if (d > bestD) { bestD = d; best = sp; }
    }
    const t = this.now();
    p.x = best.p[0]; p.y = best.p[1]; p.z = best.p[2];
    p.yaw = best.yaw; p.pitch = 0;
    p.vx = p.vz = 0;
    p.alive = true;
    p.protectedUntil = t + C.SPAWN_PROTECTION;
    p.weapon = 'spear';
    p.spear = { state: 'held', p: [0, 0, 0], dir: [0, 0, -1], landedAt: 0 };
    p.nextStab = p.nextThrow = p.nextSling = t;
    p.charging = false;
    p.history = [];
    p.spawnSeq++;
    p.lastStateAt = t;
    this.record(p, t);
    p.send({ t: 'spawn', p: [p.x, p.y, p.z], yaw: p.yaw, seq: p.spawnSeq });
  }

  record(p, t) {
    p.history.push({ t, x: p.x, y: p.y, z: p.z, yaw: p.yaw, crouching: p.crouching, sliding: p.sliding });
    while (p.history.length > 2 && p.history[0].t < t - HISTORY_SECONDS) p.history.shift();
  }

  // Where p was at time t (linear between recorded states).
  positionAt(p, t) {
    const h = p.history;
    if (!h.length) return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, crouching: p.crouching, sliding: p.sliding };
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i], b = h[i + 1];
        if (!b) return a;
        const k = (t - a.t) / (b.t - a.t || 1);
        const near = k < 0.5 ? a : b;
        let dyaw = b.yaw - a.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        return {
          x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k,
          yaw: a.yaw + dyaw * k, crouching: near.crouching, sliding: near.sliding,
        };
      }
    }
    return h[h.length - 1];
  }

  handleState(p, m) {
    if (!p.alive || m.seq !== p.spawnSeq) return;   // ignore packets from a previous life
    const t = this.now();
    const [x, y, z] = m.p.map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    const dt = Math.max(t - p.lastStateAt, 1 / C.STATE_RATE);
    const dist = Math.hypot(x - p.x, z - p.z);
    const lim = this.map.halfSize + 1;
    if (dist > MAX_REPORTED_SPEED * dt + 1.5 || Math.abs(x) > lim || Math.abs(z) > lim || y < -1 || y > this.map.ceiling) {
      // Too far, too fast: snap the client back to the last position we accepted.
      p.send({ t: 'correct', p: [p.x, p.y, p.z], seq: p.spawnSeq });
      return;
    }
    p.x = x; p.y = y; p.z = z;
    p.yaw = +m.yaw || 0;
    p.pitch = Math.max(-1.6, Math.min(1.6, +m.pitch || 0));
    p.crouching = !!m.crouch;
    p.sliding = !!m.slide;
    p.onGround = !!m.ground;
    if (m.weapon === 'spear' || m.weapon === 'sling') p.weapon = m.weapon;
    if (Array.isArray(m.v)) { p.vx = +m.v[0] || 0; p.vz = +m.v[2] || 0; }
    p.lastStateAt = t;
    this.record(p, t);
  }

  // Holding RMB winds the spear back. Opponents see it (the tell), and the
  // throw only counts once the windup is complete.
  handleCharge(p, m) {
    if (!p.alive || p.spear.state !== 'held') return;
    const on = !!m.on;
    if (on && !p.charging) p.chargeAt = this.now();
    p.charging = on;
  }

  // A scan is sensed on the scanner's own screen (the client already knows
  // where everyone is). The server enforces the cooldown and tells the
  // opponent, who sees the eyes fly out from the scanner.
  handleScan(p, m) {
    const t = this.now();
    if (!p.alive || t < p.nextScan - 0.05) return;
    const o = (m.o || []).map(Number);
    const d = (m.d || []).map(Number);
    if (o.length !== 3 || d.length !== 3 || ![...o, ...d].every(Number.isFinite)) return;
    if (Math.hypot(o[0] - p.x, o[2] - p.z) > 2) return;
    p.nextScan = t + C.SCAN_COOLDOWN;
    this.pushEvent({ e: 'scan', id: p.id, o, d: normalize(d) });
  }

  // weapon: 'stab' | 'throw' | 'sling'. The origin is the shooter's eye as the
  // client saw it; `time` is the server time of the remote pose they aimed at.
  handleFire(p, m) {
    const t = this.now();
    if (!p.alive) return;
    const kind = m.weapon;
    if (kind === 'stab' && (p.spear.state !== 'held' || t < p.nextStab)) return;
    if (kind === 'throw' && (p.spear.state !== 'held' || t < p.nextThrow || !p.charging ||
        t - p.chargeAt < C.SPEAR_WINDUP - C.WINDUP_TOLERANCE)) return;
    if (kind === 'sling' && t < p.nextSling) return;
    if (kind !== 'stab' && kind !== 'throw' && kind !== 'sling') return;

    const o = (m.o || []).map(Number);
    let d = (m.d || []).map(Number);
    if (o.length !== 3 || d.length !== 3 || ![...o, ...d].every(Number.isFinite)) return;
    // The eye has to be roughly where the server thinks the body is.
    if (Math.hypot(o[0] - p.x, o[2] - p.z) > 2 || o[1] < p.y - 0.5 || o[1] > p.y + 2.5) return;
    d = normalize(d);

    if (kind === 'stab') p.nextStab = t + C.STAB_COOLDOWN;
    if (kind === 'throw') { p.nextThrow = t + C.THROW_COOLDOWN; p.charging = false; }
    if (kind === 'sling') p.nextSling = t + C.SLING_RELOAD;
    p.protectedUntil = 0;   // attacking ends spawn protection

    const range = kind === 'stab' ? C.STAB_RANGE : kind === 'throw' ? C.THROW_RANGE : C.SLING_RANGE;
    const wall = rayMap(o, d, range, this.map.boxes);
    const foe = this.opponentOf(p);
    let hitFoe = false, foeT = Infinity;
    if (foe && foe.alive && t >= foe.protectedUntil) {
      const rewind = Math.max(t - C.LAG_COMP_MAX, Math.min(t, +m.time || t));
      const pose = this.positionAt(foe, rewind);
      foeT = rayPlayer(o, d, range, pose, poseOf(pose.crouching, pose.sliding), hitboxBonus(kind));
      hitFoe = foeT < wall.t;
    }
    const endT = hitFoe ? foeT : Math.min(wall.t, range);
    const end = [o[0] + d[0] * endT, o[1] + d[1] * endT, o[2] + d[2] * endT];

    if (kind === 'throw') {
      const rest = hitFoe ? spearRestPoint([foe.x, foe.y + 0.2, foe.z], [0, 1, 0], this.map.boxes) : spearRestPoint(end, wall.normal, this.map.boxes);
      p.spear = { state: 'ground', p: rest, dir: [d[0], 0, d[2]], landedAt: t };
      if (p.weapon === 'spear') p.weapon = 'sling';
    }

    this.pushEvent({ e: 'shot', id: p.id, w: kind, o, end, hit: hitFoe, n: hitFoe ? null : wall.normal });
    if (hitFoe) this.kill(p, foe, kind);
  }

  kill(killer, victim, weapon) {
    const t = this.now();
    victim.alive = false;
    victim.respawnAt = t + C.RESPAWN_TIME;
    victim.spear = { state: 'held', p: [0, 0, 0], dir: [0, 0, -1], landedAt: 0 };
    if (this.matchOverAt) return;
    killer.score++;
    this.pushEvent({ e: 'kill', killer: killer.id, victim: victim.id, w: weapon, at: [victim.x, victim.y, victim.z] });
    if (killer.score >= C.KILLS_TO_WIN) {
      this.winner = killer.id;
      this.matchOverAt = t + C.MATCH_RESET_TIME;
      this.pushEvent({ e: 'win', id: killer.id, name: killer.name });
    }
  }

  tick() {
    const t = this.now();
    for (const p of this.players.values()) {
      if (!p.alive && t >= p.respawnAt && !this.matchOverAt) this.spawn(p);
      // Spear pickup and auto-return
      const s = p.spear;
      if (p.alive && s.state === 'ground') {
        const dx = p.x - s.p[0], dz = p.z - s.p[2], dy = s.p[1] - p.y;
        if ((Math.hypot(dx, dz) < C.SPEAR_PICKUP_RADIUS && dy > -1.2 && dy < 2.4) ||
            t - s.landedAt > C.SPEAR_RETURN_TIME) {
          p.spear = { state: 'held', p: [0, 0, 0], dir: [0, 0, -1], landedAt: 0 };
          this.pushEvent({ e: 'pickup', id: p.id, returned: t - s.landedAt > C.SPEAR_RETURN_TIME });
        }
      }
    }
    if (this.matchOverAt && t >= this.matchOverAt) {
      this.matchOverAt = 0;
      this.winner = null;
      for (const p of this.players.values()) p.score = 0;
      for (const p of this.players.values()) this.spawn(p);
      this.pushEvent({ e: 'reset' });
    }
  }

  snapshot() {
    const t = this.now();
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, name: p.name, c: p.character,
        p: [round(p.x), round(p.y), round(p.z)],
        v: [round(p.vx), round(p.vz)],
        yaw: round(p.yaw, 1000), pitch: round(p.pitch, 1000),
        cr: p.crouching ? 1 : 0, sl: p.sliding ? 1 : 0, g: p.onGround ? 1 : 0,
        w: p.weapon, a: p.alive ? 1 : 0, s: p.score,
        rs: p.alive ? 0 : round(Math.max(0, p.respawnAt - t)),
        sp: p.spear.state === 'held' ? null : { p: p.spear.p.map((v) => round(v)), d: p.spear.dir.map((v) => round(v)) },
        rl: round(Math.max(0, p.nextSling - t)),
        pr: t < p.protectedUntil ? 1 : 0,
        ch: p.charging ? 1 : 0,
      });
    }
    const snap = { t: 'snap', time: t, players, ev: this.events, over: this.matchOverAt ? round(this.matchOverAt - t) : 0, winner: this.winner };
    this.events = [];
    return snap;
  }
}

function round(v, k = 100) { return Math.round(v * k) / k; }
