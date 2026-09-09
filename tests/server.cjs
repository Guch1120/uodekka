const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const iceServers = require('../api/ice-servers.cjs');
http.createServer(async (req, res) => {
 const pathname = new URL(req.url, 'http://localhost').pathname;
 if (pathname === '/api/ice-servers') { await iceServers(req, res); return; }
 const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
 if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
 fs.readFile(file, (err, data) => {
  if (err) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'})[path.extname(file)] || 'text/html');
  res.end(data);
 });
}).listen(Number(process.env.PORT || 8099), '127.0.0.1');
