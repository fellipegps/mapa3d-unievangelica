import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const publicDir = fileURLToPath(new URL('./public', import.meta.url));
const vendorFiles = new Map([
  ...['maplibre-gl.mjs', 'maplibre-gl.css', 'maplibre-gl-worker.mjs'].map((name) =>
    ['/vendor/' + name, './node_modules/maplibre-gl/dist/' + name]),
  ...['three.module.js', 'three.core.js'].map((name) =>
    ['/vendor/' + name, './node_modules/three/build/' + name]),
  ['/vendor/OrbitControls.js', './node_modules/three/examples/jsm/controls/OrbitControls.js'],
]);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const host = process.argv.includes('--host') ? '0.0.0.0' : '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, {Allow: 'GET, HEAD'}).end();
    return;
  }

  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(publicDir, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(`${publicDir}${sep}`) || !types[extname(file)]) {
      response.writeHead(404).end();
      return;
    }

    const vendor = vendorFiles.get(path);
    const bytes = await readFile(file).catch((error) => {
      if (!vendor || error.code !== 'ENOENT') throw error;
      return readFile(new URL(vendor, import.meta.url));
    });
    response.writeHead(200, {
      'Content-Type': types[extname(file)], 'Content-Length': bytes.length,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
    }).end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : error.code === 'ENOENT' ? 404 : 500).end();
  }
}).listen(port, host, () => {
  console.log(`Campus 3D disponível em http://localhost:${port}`);
});
