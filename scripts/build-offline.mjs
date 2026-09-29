// Builds a single self-contained HTML file of the client in offline mode
// (practice range, course, and solo walks of the arenas; no server needed).
// Used for a quick shareable test page.
//   node scripts/build-offline.mjs [out.html]

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist/bloodflint-offline.html'));

// The client imports shared code as '/shared/...' (served by the game server).
const sharedPaths = {
  name: 'shared-paths',
  setup(b) {
    b.onResolve({ filter: /^\/shared\// }, (args) => ({ path: path.join(root, args.path) }));
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

const page = `<title>Bloodflint</title>
${fonts}
<style>
:root { color-scheme: dark; }
${css}
</style>
${body}
<script>window.BLOODFLINT_OFFLINE = true;</script>
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
