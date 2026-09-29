// Builds a single self-contained HTML file of the client in offline mode
// (practice range, course, and solo walks of the arenas; no server needed).
// Used for a quick shareable test page.
//   node scripts/build-offline.mjs [out.html]

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist/bloodflint-offline.html'));

// The client imports shared code as '/shared/...' (served by the game server),
// and offline it runs server/room.js in the page for a solo Relic Run.
const sharedPaths = {
  name: 'shared-paths',
  setup(b) {
    b.onResolve({ filter: /^\/(shared|server)\// }, (args) => ({ path: path.join(root, args.path) }));
  },
};

const result = await build({
  entryPoints: [path.join(root, 'public/js/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2022',
  plugins: [sharedPaths],
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module" src="\/js\/main.js"><\/script>/, '');
const fonts = html.match(/<link href="https:\/\/fonts.googleapis.com[^>]+>/)[0];

// The relic's scanned skull, inlined so the page needs nothing else. The
// meshopt compression is undone first: its decoder is WebAssembly, which some
// hosts' content security policies block, and the skull would silently vanish.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;
const skullDoc = await io.read(path.join(root, 'public/assets/skull.glb'));
for (const ext of skullDoc.getRoot().listExtensionsUsed()) {
  if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
}
// Same for its occlusion texture: the loader reads embedded images through
// blob: URLs, which a policy can also block, so it rides along as a data: image.
let skullAO = '';
for (const tex of skullDoc.getRoot().listTextures()) {
  skullAO = `data:${tex.getMimeType()};base64,${Buffer.from(tex.getImage()).toString('base64')}`;
  tex.dispose();
}
const skull = Buffer.from(await io.writeBinary(skullDoc)).toString('base64');

const page = `<title>Bloodflint</title>
${fonts}
<style>
:root { color-scheme: dark; }
${css}
</style>
${body}
<script>window.BLOODFLINT_OFFLINE = true; window.BLOODFLINT_SKULL_URL = 'data:model/gltf-binary;base64,${skull}'; window.BLOODFLINT_SKULL_AO = '${skullAO}';</script>
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
