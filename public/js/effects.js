// Tracers, chunky cube particles (dust, sparks, blood, embers) and the spears
// lying on the ground.

import * as THREE from 'three';
import { MAP } from '/shared/map.js';
import { makeSpearMesh } from './characters.js';

const MAX_PARTICLES = 700;

export function createEffects(scene) {
  // Particles: one instanced cube mesh. Dead particles are scaled to zero.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 0.05, grav: 0, stick: false, rest: false });
    mesh.setColorAt(i, new THREE.Color(0xffffff));
  }
  let cursor = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();

  function emit(pos, vel, { life = 0.6, size = 0.06, grav = 18, color = 0xffffff, stick = false } = {}) {
    const p = parts[cursor];
    const idx = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.alive = true; p.rest = false;
    p.p.copy(pos); p.v.copy(vel);
    p.life = life; p.max = life; p.size = size; p.grav = grav; p.stick = stick;
    mesh.setColorAt(idx, col.set(color));
    mesh.instanceColor.needsUpdate = true;
  }

  function burst(pos, n, speed, opts, normal) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      if (normal) v.addScaledVector(new THREE.Vector3(...normal), speed * 0.6);
      emit(pos, v, typeof opts === 'function' ? opts(i) : opts);
    }
  }

  // Tracers: short-lived lines
  const tracers = [];
  function tracer(from, to, color, width = 1, life = 0.12) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, linewidth: width });
    const line = new THREE.Line(g, m);
    scene.add(line);
    tracers.push({ line, life, max: life });
  }

  // Spears lying on the ground, keyed by owner id
  const groundSpears = new Map();
  function setGroundSpear(ownerId, data, isMine) {
    let entry = groundSpears.get(ownerId);
    if (!data) {
      if (entry) { scene.remove(entry.group); groundSpears.delete(ownerId); }
      return;
    }
    if (!entry) {
      const group = new THREE.Group();
      const spear = makeSpearMesh(1);
      group.add(spear);
      // A faint pillar of light over your own spear so you can find it in the dark.
      let beacon = null;
      if (isMine) {
        beacon = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 3, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.35, depthWrite: false }),
        );
        beacon.position.y = 1.5;
        group.add(beacon);
      }
      scene.add(group);
      entry = { group, spear, beacon, key: '' };
      groundSpears.set(ownerId, entry);
    }
    const key = data.p.join(',');
    if (entry.key !== key) {
      entry.key = key;
      entry.group.position.set(data.p[0], data.p[1] + 0.05, data.p[2]);
      const yaw = Math.atan2(-data.d[0], -data.d[2]);
      entry.spear.rotation.set(-0.35, yaw, 0, 'YXZ');  // head dug into the dirt
      entry.spear.position.y = 0.3;
      burst(new THREE.Vector3(...data.p), 10, 3, { life: 0.5, size: 0.05, color: 0x6a5a50 });
    }
  }

  // Embers drifting up from the braziers, and dust hanging in the air
  let emberAcc = 0;
  const dust = new THREE.Points(
    (() => {
      const g = new THREE.BufferGeometry();
      const n = 500, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = (Math.random() * 2 - 1) * MAP.halfSize;
        arr[i * 3 + 1] = Math.random() * MAP.ceiling;
        arr[i * 3 + 2] = (Math.random() * 2 - 1) * MAP.halfSize;
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      return g;
    })(),
    new THREE.PointsMaterial({ color: 0x8a3a2a, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  scene.add(dust);

  return {
    tracer,
    setGroundSpear,
    impact(point, normal) {
      burst(new THREE.Vector3(...point), 8, 4, (i) => ({ life: 0.4, size: 0.05, color: i % 3 ? 0x5a4a44 : 0xffa060 }), normal);
    },
    blood(point, dir) {
      const p = new THREE.Vector3(...point);
      const d = new THREE.Vector3(...(dir || [0, 0, 0]));
      for (let i = 0; i < 70; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize()
          .multiplyScalar(2 + Math.random() * 7).addScaledVector(d, 4);
        emit(p.clone().add(new THREE.Vector3(0, 0.6 + Math.random() * 0.9, 0)), v,
          { life: 6 + Math.random() * 4, size: 0.05 + Math.random() * 0.09, color: Math.random() < 0.3 ? 0x3a0402 : 0x8a0a06, stick: true });
      }
      // Bone chunks
      for (let i = 0; i < 8; i++) {
        emit(p.clone().add(new THREE.Vector3(0, 1.2, 0)),
          new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(6).addScaledVector(d, 3),
          { life: 5, size: 0.12, color: 0xcfc0a2, stick: true });
      }
    },
    slideSparks(pos, vel) {
      if (Math.random() < 0.5) {
        emit(pos, new THREE.Vector3(-vel.x * 0.1 + (Math.random() - 0.5), 1 + Math.random() * 1.5, -vel.z * 0.1 + (Math.random() - 0.5)),
          { life: 0.35, size: 0.04, color: Math.random() < 0.5 ? 0xffa050 : 0x5a4a44 });
      }
    },
    update(dt) {
      emberAcc += dt;
      while (emberAcc > 0.05) {
        emberAcc -= 0.05;
        const [x, y, z] = MAP.braziers[Math.floor(Math.random() * MAP.braziers.length)];
        emit(new THREE.Vector3(x + (Math.random() - 0.5) * 0.5, y + 1.1, z + (Math.random() - 0.5) * 0.5),
          new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6),
          { life: 1.6, size: 0.04, grav: -0.5, color: Math.random() < 0.5 ? 0xff7a2a : 0xff2a0a });
      }
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = parts[i];
        if (!p.alive) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        if (!p.rest) {
          p.v.y -= p.grav * dt;
          p.p.addScaledVector(p.v, dt);
          if (p.p.y < 0.02 && p.v.y < 0) {
            if (p.stick) { p.p.y = 0.02; p.rest = true; }
            else { p.p.y = 0.02; p.v.multiplyScalar(0.3); p.v.y *= -0.3; }
          }
        }
        const s = p.size * (p.stick ? Math.min(1, p.life / 1.5) : Math.min(1, (p.life / p.max) * 2));
        sc.set(s, p.rest ? s * 0.25 : s, s);
        m4.compose(p.p, q, sc);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;

      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / t.max);
        if (t.life <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
          t.line.material.dispose();
          tracers.splice(i, 1);
        }
      }
      for (const e of groundSpears.values()) {
        if (e.beacon) e.beacon.material.opacity = 0.2 + 0.2 * Math.sin(performance.now() / 200);
      }
      dust.rotation.y += dt * 0.004;
    },
  };
}
