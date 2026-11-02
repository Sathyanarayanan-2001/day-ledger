// Builds one self-contained page into dist/, so the app works offline with no CDN.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const mod = p => read('node_modules', p).replace(/<\/script/g, '<\\/script');
const { version } = JSON.parse(read('package.json'));

const fonts = [400, 600].map(w => {
  const file = join(root, 'node_modules/@fontsource/ibm-plex-sans/files', `ibm-plex-sans-latin-${w}-normal.woff2`);
  const b64 = readFileSync(file).toString('base64');
  return `@font-face{font-family:"Plex";font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
}).join('');

const vendor = [
  'chart.js/dist/chart.umd.js',
  'xlsx/dist/xlsx.full.min.js',
  'jspdf/dist/jspdf.umd.min.js',
  'jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
].map(mod).join('\n</script>\n<script>\n');

const app = ['core.js', 'sync.js', 'app.js'].map(f => read('src', f)).join('\n');

// Function replacers stop "$" sequences in the libraries being read as patterns.
const html = read('src/index.html')
  .replace('/*{{fonts}}*/', () => fonts)
  .replace('/*{{css}}*/', () => read('src/app.css'))
  .replace('/*{{vendor}}*/', () => vendor)
  .replace('/*{{app}}*/', () => app);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
writeFileSync(join(dist, 'index.html'), html);
writeFileSync(join(dist, 'sw.js'), read('src/sw.js').replace('__VERSION__', version));
cpSync(join(root, 'src/manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
cpSync(join(root, 'public'), dist, { recursive: true });
console.log(`Built v${version}: ${(html.length / 1048576).toFixed(2)} MB`);
