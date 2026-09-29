// The relic: a photoreal human skull that does not belong in this world.
//
// The mesh is a real scan: "Skull" (ScatteringSkull) by Vladimir Petkovic,
// CC0, from Khronos' glTF Sample Assets (see public/assets/CREDITS.md). Its
// baked ambient-occlusion map darkens every suture, foramen and socket.
//
// Everything else is chunky, low-res and dithered. The skull is drawn in its
// own scene at full screen resolution (see post.js), with physically based
// bone, studio environment lighting and filmic tone mapping, so it looks
// pasted in from another game. The world's depth still hides it behind walls.
//
// It hovers in the crater, turns to watch whoever is looking at it, and slowly
// swells as if breathing. Once taken it is dragged behind the carrier on a
// lead, bumping along the ground and up the terraces.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as C from '/shared/constants.js';
import { rayMap } from '/shared/raycast.js';

// Its WebAssembly may be blocked by a page's security policy; the offline
// page ships an uncompressed model that doesn't need it, so don't complain
MeshoptDecoder.ready.catch(() => {});

const HEIGHT = 2.2;   // metres, crown to jaw: a skull for something enormous

// Orientation of the scan: turn it so the face looks down -Z and the crown up.
// The scan is Y-up with the face toward +Z.
export const MODEL_ROTATION = new THREE.Euler(0, Math.PI, 0);

function skullUrl() {
  return globalThis.BLOODFLINT_SKULL_URL || '/assets/skull.glb';
}

export function createSkull(worldScene, renderer) {
  // Its own scene, rendered at full resolution over the low-res world
  const scene = new THREE.Scene();
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.2;
    pmrem.dispose();
  }
  const key = new THREE.DirectionalLight(0xf4f0ff, 3.4);    // cold, clean, from nowhere in this world
  key.position.set(2.6, 4, -1.4);   // high and to the side: deep shadow in the sockets
  const fill = new THREE.DirectionalLight(0xffd8c0, 0.25);
  fill.position.set(-2, 0.5, -1);
  const rim = new THREE.DirectionalLight(0xff3a1a, 1.2);     // a touch of the crater's red from behind
  rim.position.set(0, 1, 3);

  const root = new THREE.Group();
  const holder = new THREE.Group();       // breathing and tumbling
  root.add(holder);
  // The lights ride with the skull so it's always lit the same, whatever
  // the world around it is doing
  for (const l of [key, fill, rim]) { root.add(l); l.target = root; }
  scene.add(root);

  const bone = new THREE.MeshPhysicalMaterial({
    color: 0xd2c3a4,        // old bone: yellowed, not white
    roughness: 0.58,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xfff2e0),
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
    aoMapIntensity: 1.6,
  });

  let loaded = false;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const onLoad = (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const ao = o.material.aoMap;
      if (ao) { ao.colorSpace = THREE.NoColorSpace; bone.aoMap = ao; }
      o.material = bone;
    });
    const pivot = new THREE.Group();
    pivot.rotation.copy(MODEL_ROTATION);
    pivot.add(model);
    // Scale to HEIGHT and sit the jaw on the origin
    const size = new THREE.Box3().setFromObject(pivot).getSize(new THREE.Vector3());
    pivot.scale.setScalar(HEIGHT / size.y);
    const box = new THREE.Box3().setFromObject(pivot);
    const mid = box.getCenter(new THREE.Vector3());
    pivot.position.set(-mid.x, -box.min.y, -mid.z);
    holder.add(pivot);
    loaded = true;
  };
  // If the scan can't load, show a plain bone lump rather than nothing: the
  // objective must never be invisible
  const onError = (err) => {
    console.warn('skull failed to load', err);
    const geo = new THREE.IcosahedronGeometry(HEIGHT * 0.45, 3);
    geo.scale(0.85, 1, 1.1);
    geo.translate(0, HEIGHT * 0.45, 0);
    holder.add(new THREE.Mesh(geo, bone));
    loaded = true;
  };
  // Offline page: the occlusion map comes separately, as a plain image
  if (globalThis.BLOODFLINT_SKULL_AO) {
    new THREE.TextureLoader().load(globalThis.BLOODFLINT_SKULL_AO, (ao) => {
      ao.flipY = false;
      ao.colorSpace = THREE.NoColorSpace;
      bone.aoMap = ao;
      bone.needsUpdate = true;
    });
  }
  const url = skullUrl();
  if (url.startsWith('data:')) {
    // Inlined (offline page): decode it here, since a page's security policy
    // may block fetching data: URLs
    try {
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      loader.parse(bytes.buffer, '', onLoad, onError);
    } catch (err) { onError(err); }
  } else {
    loader.load(url, onLoad, undefined, onError);
  }

  // The lead: a sagging rope from the carrier's hand, part of the low-res world
  const ropePts = new Float32Array(16 * 3);
  const ropeGeo = new THREE.BufferGeometry();
  ropeGeo.setAttribute('position', new THREE.BufferAttribute(ropePts, 3));
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x5a3a22 }));
  rope.frustumCulled = false;
  rope.visible = false;
  worldScene.add(rope);

  const pos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let placed = false, tumble = 0;

  function groundBelow(x, y, z, boxes) {
    const hit = rayMap([x, y + 1.5, z], [0, -1, 0], 40, boxes);
    return hit.t === Infinity ? 0 : hit.point[1];
  }

  return {
    /** The skull's own full-resolution scene (drawn by post.js). */
    scene,
    get ready() { return loaded; },
    get visible() { return root.visible; },
    /**
     * state: 'home' | 'dropped' | 'carried' | 'scored'; p: server position;
     * carrier: [x, y, z] feet of whoever holds it (when carried); camera: the
     * viewer's camera; boxes: map geometry.
     */
    update(dt, t, { state, p, carrier, camera, boxes }) {
      root.visible = state !== 'scored';
      if (!root.visible) { rope.visible = false; placed = false; return; }
      const carried = state === 'carried' && carrier;
      if (carried) {
        // Dragged: stay a lead's length behind, resting on whatever's below
        if (!placed) pos.set(carrier[0], carrier[1], carrier[2]);
        tmp.set(pos.x - carrier[0], 0, pos.z - carrier[2]);
        const d = tmp.length();
        if (d > C.RELIC_LEAD) pos.set(carrier[0] + (tmp.x / d) * C.RELIC_LEAD, pos.y, carrier[2] + (tmp.z / d) * C.RELIC_LEAD);
        const floor = groundBelow(pos.x, Math.max(pos.y, carrier[1]), pos.z, boxes);
        pos.y += (floor - pos.y) * Math.min(1, dt * 12);
        tumble += d * dt * 3;
      } else {
        // Home: hovers and bobs. Dropped: rests where it fell.
        const hover = state === 'home' ? 1.2 + Math.sin(t * 1.3) * 0.15 : 0;
        const target = tmp.set(p[0], p[1] + hover, p[2]);
        if (!placed || pos.distanceTo(target) > 6) pos.copy(target);
        else pos.lerp(target, Math.min(1, dt * 6));
      }
      placed = true;
      root.position.copy(pos);

      // Turn, slowly, to watch the viewer
      const face = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z) + Math.PI;
      let dyaw = face - root.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      root.rotation.y += dyaw * Math.min(1, dt * (carried ? 1.2 : 0.6));
      // Tilt toward the viewer's height too, as if looking at you
      const look = Math.atan2(camera.position.y - (pos.y + HEIGHT * 0.6), Math.hypot(camera.position.x - pos.x, camera.position.z - pos.z));
      holder.rotation.x = carried ? -0.2 + Math.sin(tumble * 0.7) * 0.15 : Math.max(-0.35, Math.min(0.35, look * 0.6));
      holder.rotation.z = carried ? Math.sin(tumble) * 0.2 : Math.sin(t * 0.6) * 0.03;

      // Breathing
      const b = 1 + Math.sin(t * 1.1) * 0.015 + Math.sin(t * 2.9) * 0.004;
      holder.scale.set(b, 2 - b, b);

      // Rope from the carrier's hand, sagging in the middle
      rope.visible = !!carried;
      if (carried) {
        const hx = carrier[0], hy = carrier[1] + 1.0, hz = carrier[2];
        const ex = pos.x, ey = pos.y + 0.6, ez = pos.z;
        for (let i = 0; i < 16; i++) {
          const k = i / 15;
          ropePts[i * 3] = hx + (ex - hx) * k;
          ropePts[i * 3 + 1] = hy + (ey - hy) * k - Math.sin(k * Math.PI) * 0.45;
          ropePts[i * 3 + 2] = hz + (ez - hz) * k;
        }
        ropeGeo.attributes.position.needsUpdate = true;
      }
    },
    /** World position of the skull (for markers and sounds). */
    get position() { return pos; },
  };
}
