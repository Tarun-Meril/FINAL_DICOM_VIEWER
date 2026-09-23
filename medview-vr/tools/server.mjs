import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json',
  '.map': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/svg+xml',
};

export function serve(root, port = 8123) {
  const server = http.createServer((req, res) => {
    let p = path.join(root, decodeURIComponent((req.url || '/').split('?')[0]));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (p.endsWith('favicon.ico') && !fs.existsSync(p)) p = path.join(root, 'favicon.svg');
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, url: `http://127.0.0.1:${port}` })));
}
