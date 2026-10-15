// Servidor estático mínimo para probar la webapp en local: node tools/serve.js
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..', 'webapp');
const PDF = path.resolve(__dirname, '..', 'diccionario-biblico-vine-vine.pdf');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf' };
const port = +process.env.PORT || 8080;
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = p === '/vine.pdf' && !fs.existsSync(path.join(ROOT, 'vine.pdf')) ? PDF : path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(ROOT) && file !== PDF) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const gz = /json|javascript|css|html/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': st.size }) });
    if (req.method === 'HEAD') return res.end();
    const s = fs.createReadStream(file);
    gz ? s.pipe(zlib.createGzip()).pipe(res) : s.pipe(res);
  });
}).listen(port, () => console.log('Diccionario Vine en http://localhost:' + port));
