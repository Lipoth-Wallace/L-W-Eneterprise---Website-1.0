// One 1v1 match. Movement comes from the clients (within sanity limits);
// hits, kills, the spear, the relic and the score are decided here.
//
// Modes:
//   'dm'    Deathmatch: first to KILLS_TO_WIN kills.
//   'relic' Relic Run (on the Caldera): a skull sits in the crater. Touch it to
//           take it on a lead, drag it (25% slower) into your own cave to
//           score. Die and you drop it; anyone can pick it up. First to
//           RELIC_TO_WIN captures.

import * as C from '../shared/constants.js';
import { MAPS, ARENAS } from '../shared/map.js';
import { rayMap, rayPlayer, poseOf, hitboxBonus, normalize, spearRestPoint } from '../shared/raycast.js';
import { FIRE_KIND, RANGE, RELOAD, knifeBelt, knivesAt, takeKnife } from '../shared/weapons.js';

const HISTORY_SECONDS = 1;
const MAX_REPORTED_SPEED = C.MAX_SPEED * 1.35 + 4;   // generous: jitter bunches packets up

let nextPlayerId = 1;

export class Room {
  constructor(code, { isPrivate = false, map = 'kiln', mode = 'dm', grace = C.RELIC_FUSE_GRACE, now = () => performance.now() / 1000 } = {}) {
    this.code = code;
    this.mode = mode === 'relic' ? 'relic' : 'dm';
    if (this.mode === 'relic') this.map = MAPS.volcano;
    else this.map = MAPS[map] && ARENAS.includes(map) ? MAPS[map] : MAPS.kiln;
    // Relic Run: how long a too-slow carrier has to get back up to speed
    // before the skull bursts, chosen by whoever made the room
    this.grace = C.RELIC_GRACE_CHOICES.includes(+grace) ? +grace : C.RELIC_FUSE_GRACE;
    this.relic = this.mode === 'relic' ? { state: 'home', p: [...this.map.relic.p], by: null, since: 0 } : null;
    this.isPrivate = isPrivate;
    this.now = now;
    this.players = new Map();       // id -> player
    this.events = [];               // queued until the next snapshot
    this.matchOverAt = 0;
    this.winner = null;
  }

  get full() { return this.players.size >= 2; }
  get empty() { return this.players.size === 0; }

  addPlayer(send, { name = 'Caveman', character = 'brute', secondary = 'sling' } = {}) {
    const id = nextPlayerId++;
    const taken = new Set([...this.players.values()].map((o) => o.team));
    const p = {
      id,
      team: taken.has(0) ? 1 : 0,
      kills: 0,
      send,
      name: String(name).replace(/[^\w \-]/g, '').slice(0, 16) || 'Caveman',
      character: C.CHARACTERS.includes(character) ? character : 'brute',
      secondary: C.SECONDARIES.includes(secondary) ? secondary : 'sling',   // loadout slot 2
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
      nextStab: 0, nextThrow: 0, nextSling: 0, nextKnife: 0, knives: knifeBelt(),
      charging: false, chargeAt: 0, nextScan: 0,
      spear: { state: 'held', p: [0, 0, 0], dir: [0, 0, -1], landedAt: 0 },
      spawnSeq: 0,
    };
    this.players.set(id, p);
    send({
      t: 'welcome', id, room: this.code, isPrivate: this.isPrivate, map: this.map.id, mode: this.mode, team: p.team,
      killsToWin: this.mode === 'relic' ? C.RELIC_TO_WIN : C.KILLS_TO_WIN,
      grace: this.mode === 'relic' ? this.grace : 0,
    });
    this.spawn(p);
    this.pushEvent({ e: 'join', id, name: p.name });
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.relic && this.relic.by === id) this.dropRelic(p);
    this.players.delete(id);
    this.pushEvent({ e: 'leave', id, name: p.name });
    // The match can't carry on 1v0, so the remaining player starts fresh.
    for (const o of this.players.values()) { o.score = 0; o.kills = 0; }
    this.matchOverAt = 0;
    this.winner = null;
    if (this.relic) this.resetRelic(false);
  }

  opponentOf(p) {
    for (const o of this.players.values()) if (o.id !== p.id) return o;
    return null;
  }

  pushEvent(ev) { this.events.push(ev); }

  spawn(p) {
    const foe = this.opponentOf(p);
    // Relic Run: spawn on your own side. Deathmatch: as far from the foe as possible.
    const pool = this.mode === 'relic' ? this.map.spawns.filter((sp) => sp.team === p.team) : this.map.spawns;
    let best = pool[0], bestD = -1;
    for (const sp of pool) {
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
    p.nextStab = p.nextThrow = p.nextSling = p.nextKnife = t;
    p.knives = knifeBelt();
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
    if (m.weapon === 'spear' || m.weapon === p.secondary) p.weapon = m.weapon;
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

  // weapon: 'stab' | 'throw' | 'sling' | 'knife' | 'bow'. The last three need
  // the matching loadout (sling, knives, bow). The origin is the shooter's eye as the
  // client saw it; `time` is the server time of the remote pose they aimed at.
  handleFire(p, m) {
    const t = this.now();
    if (!p.alive) return;
    const kind = m.weapon;
    if (kind === 'stab' && (p.spear.state !== 'held' || t < p.nextStab)) return;
    if (kind === 'throw' && (p.spear.state !== 'held' || t < p.nextThrow || !p.charging ||
        t - p.chargeAt < C.SPEAR_WINDUP - C.WINDUP_TOLERANCE)) return;
    const ranged = kind === 'sling' || kind === 'knife' || kind === 'bow';
    if (kind !== 'stab' && kind !== 'throw' && !ranged) return;
    if (ranged && FIRE_KIND[p.secondary] !== kind) return;
    // Sling and bow share one reload clock; knives have their own belt. A
    // little slack for packet jitter.
    if ((kind === 'sling' || kind === 'bow') && t < p.nextSling - 0.05) return;
    if (kind === 'knife' && (t < p.nextKnife - C.KNIFE_INTERVAL * 0.5 || knivesAt(p.knives, t + 0.15) <= 0)) return;

    const o = (m.o || []).map(Number);
    let d = (m.d || []).map(Number);
    if (o.length !== 3 || d.length !== 3 || ![...o, ...d].every(Number.isFinite)) return;
    // The eye has to be roughly where the server thinks the body is.
    if (Math.hypot(o[0] - p.x, o[2] - p.z) > 2 || o[1] < p.y - 0.5 || o[1] > p.y + 2.5) return;
    d = normalize(d);

    if (kind === 'stab') p.nextStab = t + C.STAB_COOLDOWN;
    if (kind === 'throw') { p.nextThrow = t + C.THROW_COOLDOWN; p.charging = false; }
    if (kind === 'sling' || kind === 'bow') p.nextSling = t + RELOAD[kind];
    if (kind === 'knife') { takeKnife(p.knives, t + 0.15); p.nextKnife = t + C.KNIFE_INTERVAL; }
    p.protectedUntil = 0;   // attacking ends spawn protection

    const range = RANGE[kind];
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
      if (p.weapon === 'spear') p.weapon = p.secondary;
    }

    this.pushEvent({ e: 'shot', id: p.id, w: kind, o, end, hit: hitFoe, n: hitFoe ? null : wall.normal });
    if (hitFoe) this.kill(p, foe, kind);
  }

  kill(killer, victim, weapon) {
    const t = this.now();
    victim.alive = false;
    victim.respawnAt = t + C.RESPAWN_TIME;
    victim.spear = { state: 'held', p: [0, 0, 0], dir: [0, 0, -1], landedAt: 0 };
    if (this.relic && this.relic.by === victim.id) this.dropRelic(victim);
    if (this.matchOverAt) return;
    if (killer !== victim) killer.kills++;
    this.pushEvent({ e: 'kill', killer: killer.id, victim: victim.id, w: weapon, at: [victim.x, victim.y, victim.z] });
    if (this.mode === 'relic') return;   // kills don't score in Relic Run
    killer.score++;
    if (killer.score >= C.KILLS_TO_WIN) {
      this.winner = killer.id;
      this.matchOverAt = t + C.MATCH_RESET_TIME;
      this.pushEvent({ e: 'win', id: killer.id, name: killer.name });
    }
  }

  // ---- relic ----

  dropRelic(p) {
    const r = this.relic;
    r.state = 'dropped';
    r.by = null;
    r.p = [p.x, p.y, p.z];
    r.since = this.now();
    this.pushEvent({ e: 'relic', what: 'drop', id: p.id, p: r.p });
  }

  resetRelic(announce = true) {
    const r = this.relic;
    r.state = 'home';
    r.by = null;
    r.p = [...this.map.relic.p];
    r.since = this.now();
    if (announce) this.pushEvent({ e: 'relic', what: 'home' });
  }

  // The carrier's fuse (see RELIC_FUSE). Returns true if the skull burst.
  tickFuse(r, p, t) {
    if (!p.alive || this.matchOverAt) return false;
    const left = C.RELIC_FUSE - (t - r.takenAt);
    if (left <= 0) {
      r.slowSince = null;
      if (!C.RELIC_FUSE_EXPLODES_AT_END) return false;
      return this.burst(p), true;
    }
    if (Math.hypot(p.vx || 0, p.vz || 0) >= C.RELIC_FUSE_SPEED) r.slowSince = null;
    else if (r.slowSince == null) r.slowSince = t;
    else if (t - r.slowSince >= this.grace) return this.burst(p), true;
    return false;
  }

  burst(p) {
    this.pushEvent({ e: 'relic', what: 'burst', id: p.id, p: [p.x, p.y, p.z] });
    this.kill(p, p, 'skull');
  }

  tickRelic(t) {
    const r = this.relic;
    if (r.state === 'scored') {
      if (t - r.since >= C.RELIC_RESET_DELAY) this.resetRelic();
      return;
    }
    if (r.state === 'carried') {
      const p = this.players.get(r.by);
      if (!p) return this.resetRelic();
      r.p = [p.x, p.y, p.z];
      if (this.tickFuse(r, p, t)) return;
      const z = this.map.bases[p.team].zone;
      if (p.x > z.min[0] && p.x < z.max[0] && p.z > z.min[2] && p.z < z.max[2] && p.y < z.max[1]) {
        p.score++;
        r.state = 'scored';
        r.by = null;
        r.since = t;
        this.pushEvent({ e: 'relic', what: 'score', id: p.id, name: p.name });
        if (p.score >= C.RELIC_TO_WIN && !this.matchOverAt) {
          this.winner = p.id;
          this.matchOverAt = t + C.MATCH_RESET_TIME;
          this.pushEvent({ e: 'win', id: p.id, name: p.name });
        }
      }
      return;
    }
    if (r.state === 'dropped' && t - r.since > C.RELIC_RETURN) return this.resetRelic();
    // Home or dropped: the first living player to touch it takes it
    for (const p of this.players.values()) {
      if (!p.alive || this.matchOverAt) continue;
      if (Math.hypot(p.x - r.p[0], p.z - r.p[2]) < C.RELIC_GRAB_RADIUS && Math.abs(p.y - r.p[1]) < 2.5) {
        r.state = 'carried';
        r.by = p.id;
        r.takenAt = t;
        r.slowSince = null;
        this.pushEvent({ e: 'relic', what: 'take', id: p.id, name: p.name });
        break;
      }
    }
  }

  tick() {
    const t = this.now();
    if (this.relic) this.tickRelic(t);
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
      for (const p of this.players.values()) { p.score = 0; p.kills = 0; }
      if (this.relic) this.resetRelic(false);
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
        tm: p.team, k: p.kills,
      });
    }
    const snap = { t: 'snap', time: t, players, ev: this.events, over: this.matchOverAt ? round(this.matchOverAt - t) : 0, winner: this.winner };
    if (this.relic) {
      const r = this.relic;
      snap.relic = { st: r.state, p: r.p.map((v) => round(v)), by: r.by };
      if (r.state === 'carried') {
        // fz: fuse time left; bm: seconds until it bursts (only while too slow)
        const fz = Math.max(0, C.RELIC_FUSE - (t - r.takenAt));
        if (fz > 0) snap.relic.fz = round(fz, 10);
        if (fz > 0 && r.slowSince != null) snap.relic.bm = round(Math.max(0, this.grace - (t - r.slowSince)), 10);
      }
    }
    this.events = [];
    return snap;
  }
}

function round(v, k = 100) { return Math.round(v * k) / k; }
