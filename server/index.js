// HTTP + WebSocket server. It serves the static client and runs the rooms.
//   npm start            -> http://localhost:3000
//   PORT=8080 npm start  -> a different port

import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { SNAPSHOT_RATE } from '../shared/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const TICK_HZ = 60;
const MAX_MSGS_PER_SEC = 240;

export function startServer({ port = PORT, log = console.log } = {}) {
  const app = express();
  app.use(express.static(path.join(root, 'public')));
  app.use('/shared', express.static(path.join(root, 'shared')));
  app.use('/vendor/three', express.static(path.join(root, 'node_modules/three/build')));
  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const rooms = new Map();

  function makeCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code;
    do {
      code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  function findRoom(requested, wantPrivate) {
    if (requested) {
      const code = String(requested).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const r = rooms.get(code);
      if (r) return r.full ? { error: 'That room is full.' } : { room: r };
      if (code.length !== 4) return { error: 'Room codes are four letters.' };
      const created = new Room(code, { isPrivate: true });
      rooms.set(code, created);
      return { room: created };
    }
    if (!wantPrivate) {
      for (const r of rooms.values()) if (!r.isPrivate && r.players.size === 1) return { room: r };
    }
    const code = makeCode();
    const created = new Room(code, { isPrivate: !!wantPrivate });
    rooms.set(code, created);
    return { room: created };
  }

  wss.on('connection', (ws) => {
    let room = null, player = null;
    let budget = MAX_MSGS_PER_SEC, budgetAt = Date.now();
    const send = (msg) => send.raw(JSON.stringify(msg));
    send.raw = (text) => { if (ws.readyState === ws.OPEN) ws.send(text); };

    ws.on('message', (raw) => {
      const now = Date.now();
      budget = Math.min(MAX_MSGS_PER_SEC, budget + ((now - budgetAt) / 1000) * MAX_MSGS_PER_SEC);
      budgetAt = now;
      if (--budget < 0) return;
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;

      if (m.t === 'join' && !room) {
        const found = findRoom(m.room, m.private);
        if (found.error) { send({ t: 'error', message: found.error }); return; }
        room = found.room;
        player = room.addPlayer(send, { name: m.name, character: m.character });
        log(`[${room.code}] ${player.name} joined (${room.players.size}/2)`);
        return;
      }
      if (!room || !player) return;
      if (m.t === 'state') room.handleState(player, m);
      else if (m.t === 'fire') room.handleFire(player, m);
      else if (m.t === 'charge') room.handleCharge(player, m);
      else if (m.t === 'ping') send({ t: 'pong', c: m.c, time: room.now() });
    });

    ws.on('close', () => {
      if (!room || !player) return;
      room.removePlayer(player.id);
      log(`[${room.code}] ${player.name} left`);
      if (room.empty) rooms.delete(room.code);
    });
  });

  const tickTimer = setInterval(() => { for (const r of rooms.values()) r.tick(); }, 1000 / TICK_HZ);
  const snapTimer = setInterval(() => {
    for (const r of rooms.values()) {
      const snap = JSON.stringify(r.snapshot());
      for (const p of r.players.values()) p.send.raw(snap);
    }
  }, 1000 / SNAPSHOT_RATE);

  return new Promise((resolve) => {
    server.listen(port, () => {
      const actual = server.address().port;
      log(`Bloodflint listening on http://localhost:${actual}`);
      // Addresses other devices on the same Wi-Fi can use to join.
      for (const nets of Object.values(os.networkInterfaces())) {
        for (const n of nets || []) {
          if (n.family === 'IPv4' && !n.internal) log(`  same network: http://${n.address}:${actual}`);
        }
      }
      resolve({
        port: actual,
        rooms,
        close: () => new Promise((done) => {
          clearInterval(tickTimer);
          clearInterval(snapTimer);
          for (const c of wss.clients) c.terminate();
          wss.close();
          server.close(() => done());
        }),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
