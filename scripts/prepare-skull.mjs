// Prepares the relic skull asset from Khronos' CC0 "ScatteringSkull" scan
// (Vladimir Petkovic, 2025, glTF-Sample-Assets/Models/ScatteringSkull).
//   node scripts/prepare-skull.mjs <ScatteringSkull.glb>
// Keeps the full scanned geometry and its baked ambient-occlusion map, drops
// the frosted-glass material (the game gives it bone), centres it, resizes
// the AO to 1024 px, and compresses the mesh with meshopt. Output:
// public/assets/skull.glb

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { center, prune, dedup, reorder, quantize, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/prepare-skull.mjs <ScatteringSkull.glb>'); process.exit(1); }

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(src);

// Strip the glass extensions; keep the AO texture as the occlusion map.
for (const ext of doc.getRoot().listExtensionsUsed()) {
  if (ext.extensionName.startsWith('KHR_materials_')) ext.dispose();
}
for (const mat of doc.getRoot().listMaterials()) mat.setName('bone');

await doc.transform(
  center({ pivot: 'center' }),
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 88 }),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true);

const out = path.join(root, 'public/assets/skull.glb');
await io.write(out, doc);
console.log('wrote', out);
