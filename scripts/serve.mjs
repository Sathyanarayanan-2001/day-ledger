// Small static server for dist/. Used by `npm start` and the tests.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export const serve = (port = 8123) => new Promise(ok => {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(dist, normalize(path === '/' ? 'index.html' : path));
    try {
      if (!file.startsWith(dist)) throw new Error('outside dist');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, () => ok(server));
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve();
  console.log('Day ledger: http://localhost:8123');
}
