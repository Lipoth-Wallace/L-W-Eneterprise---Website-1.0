// Low-res pipeline: the world and viewmodel are drawn into a small render
// target, then a full-screen pass posterises it with a 4x4 Bayer dither, adds a
// vignette and the hurt flash. The canvas stays at that small size and CSS
// scales it up with nearest-neighbour filtering, so the pixels stay chunky.

import * as THREE from 'three';

const vert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform float hurt;
uniform float levels;
uniform float time;
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
  float d = bayer4(gl_FragCoord.xy) - 0.5;
  c = floor(c * levels + d + 0.5) / levels;
  vec2 q = vUv - 0.5;
  float vig = smoothstep(0.85, 0.2, length(q * vec2(1.1, 1.0)));
  c *= mix(0.5, 1.0, vig);
  float edge = 1.0 - vig;
  c = mix(c, vec3(0.55, 0.0, 0.0), clamp(hurt * (0.35 + edge), 0.0, 0.85));
  gl_FragColor = vec4(c, 1.0);
}
`;

export function createPost(renderer) {
  const target = new THREE.WebGLRenderTarget(4, 4, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: target.texture }, hurt: { value: 0 }, levels: { value: 14 }, time: { value: 0 } },
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
    setSize(w, h) { target.setSize(w, h); },
    render(worldScene, worldCam, vmScene, vmCam) {
      renderer.setRenderTarget(target);
      renderer.autoClear = false;
      renderer.clear(true, true, true);
      renderer.render(worldScene, worldCam);
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      renderer.autoClear = true;
    },
  };
}
