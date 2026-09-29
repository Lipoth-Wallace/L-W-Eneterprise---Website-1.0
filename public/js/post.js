// Low-res pipeline: the world and viewmodel are drawn into a small render
// target, then a full-screen pass posterises it with a 4x4 Bayer dither, adds a
// vignette and the hurt flash. That pass upscales the small image onto the
// full-resolution canvas with nearest-neighbour filtering, so the pixels stay
// chunky.
//
// One thing is drawn at full resolution on top: the relic skull's own scene
// (photoreal, tone-mapped, antialiased) so it looks like it doesn't belong.
// A depth-only pass of the world (and the viewmodel, pinned to the near plane)
// goes first, so walls and your own hands still cover it.

import * as THREE from 'three';

const vert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform float hurt;
uniform float scan;
uniform float levels;
uniform float time;
uniform vec2 lowSize;
varying vec2 vUv;

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k = 0; k < 16; k++) if (k == idx) return m[k] / 16.0;
  return 0.0;
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 c = toSRGB(clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0));
  // Crush the shadows toward blood red and lift contrast a touch
  c = pow(c, vec3(1.08));
  c.r += 0.012;
  float d = bayer4(floor(vUv * lowSize)) - 0.5;
  c = floor(c * levels + d + 0.5) / levels;
  vec2 q = vUv - 0.5;
  float vig = smoothstep(0.85, 0.2, length(q * vec2(1.1, 1.0)));
  c *= mix(0.5, 1.0, vig);
  float edge = 1.0 - vig;
  c = mix(c, vec3(0.55, 0.0, 0.0), clamp(hurt * (0.35 + edge), 0.0, 0.85));
  // Scan pulse: a brief amber wash, strongest at the edges
  c = mix(c, c * vec3(1.3, 0.95, 0.35) + vec3(0.07, 0.035, 0.0), scan * (0.3 + edge * 0.5));
  gl_FragColor = vec4(c, 1.0);
}
`;

// Depth only, for hiding the skull behind the world
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
// Depth only, pinned to the near plane: the viewmodel always covers the skull
const depthNear = new THREE.MeshBasicMaterial({ colorWrite: false, depthFunc: THREE.AlwaysDepth });
depthNear.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.z = -gl_Position.w;');
};

// Only solid meshes hide the skull: sprites, particles, lines and see-through
// effects are switched off for the depth pass.
const hidden = [];
function hideNonSolid(root) {
  root.traverse((o) => {
    if (!o.visible) return;
    const m = o.material;
    if (o.isSprite || o.isPoints || o.isLine || (o.isMesh && m && (Array.isArray(m) ? m.some((x) => x.transparent) : m.transparent || m.colorWrite === false))) {
      o.visible = false;
      hidden.push(o);
    }
  });
}
function restore() { for (const o of hidden) o.visible = true; hidden.length = 0; }

export function createPost(renderer) {
  const target = new THREE.WebGLRenderTarget(4, 4, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: target.texture }, hurt: { value: 0 }, scan: { value: 0 }, levels: { value: 14 }, time: { value: 0 }, lowSize: { value: new THREE.Vector2(4, 4) } },
    vertexShader: vert,
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms: material.uniforms,
    /** w, h: the low-res world size. The canvas itself is sized by the caller. */
    setSize(w, h) { target.setSize(w, h); material.uniforms.lowSize.value.set(w, h); },
    /** overlay: an optional full-resolution scene drawn last (the relic skull). */
    render(worldScene, worldCam, vmScene, vmCam, overlay = null) {
      renderer.setRenderTarget(target);
      renderer.autoClear = false;
      renderer.clear(true, true, true);
      renderer.render(worldScene, worldCam);
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
      renderer.setRenderTarget(null);
      renderer.clear(true, true, true);
      renderer.render(scene, cam);
      if (overlay) {
        const bg = worldScene.background, fog = worldScene.fog;
        worldScene.background = null; worldScene.fog = null;
        hideNonSolid(worldScene);
        worldScene.overrideMaterial = depthOnly;
        renderer.render(worldScene, worldCam);
        worldScene.overrideMaterial = null;
        restore();
        worldScene.background = bg; worldScene.fog = fog;
        vmScene.overrideMaterial = depthNear;
        renderer.render(vmScene, vmCam);
        vmScene.overrideMaterial = null;
        renderer.render(overlay, worldCam);
      }
      renderer.autoClear = true;
    },
  };
}
