import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createGzip } from 'node:zlib';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.txt': 'text/plain', '.xml': 'application/xml' };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const equal = (a, b) => { const first = Buffer.from(a), second = Buffer.from(b); return first.length === second.length && timingSafeEqual(first, second); };

export function safeReturnPath(value, basePath = '/') {
  if (typeof value !== 'string' || !value.startsWith(basePath) || value.startsWith('//') || /[\\\r\n]/.test(value)) return basePath;
  const url = new URL(value, 'https://preview.invalid');
  return url.origin === 'https://preview.invalid' && url.pathname.startsWith(basePath) ? url.pathname + url.search + url.hash : basePath;
}

// shortcut: fallback sessions reset on restart; set SITE_PREVIEW_SECRET for stable or multi-replica previews.
export async function createPreviewServer({ root, passwordHash, secret = process.env.SITE_PREVIEW_SECRET || randomBytes(32).toString('hex'), enabled = process.env.SITE_PREVIEW_ENABLED !== '0', basePath = '/', redirects = {}, publicPaths = ['coming-soon.css', 'coming-soon.js'], allowedPath = () => true, spaPaths = [] }) {
  root = await realpath(root);
  basePath = '/' + basePath.split('/').filter(Boolean).join('/') + (basePath === '/' ? '' : '/');
  const [salt, expected] = passwordHash.split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(expected || '')) throw Error('Configure a valid preview password hash.');
  if (process.env.NODE_ENV === 'production' && enabled && secret.length < 32) throw Error('SITE_PREVIEW_SECRET must contain at least 32 characters.');
  const landing = await readFile(resolve(root, 'coming-soon.html'), 'utf8');
  const attempts = new Map();
  const sign = value => createHmac('sha256', secret).update(value).digest('base64url');
  function authenticated(request) {
    const cookie = (request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('site_preview='))?.slice(13);
    if (!cookie || cookie.length > 200) return false;
    const [expires, nonce, signature] = cookie.split('.');
    return Number(expires) > Date.now() && Number(expires) <= Date.now() + 9 * 3600000 && !!nonce && !!signature && equal(signature, sign(`${expires}.${nonce}`));
  }
  function comingSoon(request, response, next, error = '', status = 200) {
    response.writeHead(status, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    response.end(request.method === 'HEAD' ? undefined : landing.replaceAll('{{BASE}}', escape(basePath)).replaceAll('{{NEXT}}', escape(safeReturnPath(next, basePath))).replaceAll('{{ERROR}}', escape(error)));
  }
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; media-src 'self' https:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'");
    try {
      const protocol = request.headers['x-forwarded-proto'] === 'https' || request.socket.encrypted ? 'https:' : 'http:';
      const url = new URL(request.url, `${protocol}//${request.headers.host || 'localhost'}`);
      if (url.pathname === '/health') { response.writeHead(200); response.end('OK'); return; }
      if (enabled) response.setHeader('X-Robots-Tag', 'noindex, nofollow');
      const path = decodeURIComponent(url.pathname);
      if (basePath !== '/' && path === basePath.slice(0, -1)) { response.writeHead(308, { Location: basePath + url.search }); response.end(); return; }
      if (/[\\\0]/.test(path) || !path.startsWith(basePath)) { response.writeHead(404); response.end(); return; }
      const relative = path.slice(basePath.length);
      const login = relative === '__preview/login';
      if (login && request.method === 'POST') {
        if (request.headers.origin !== url.origin) { response.writeHead(403); response.end('Please log in from this website.'); return; }
        const key = request.socket.remoteAddress || 'unknown';
        const now = Date.now();
        for (const [ip, value] of attempts) if (value.until < now) attempts.delete(ip);
        const prior = attempts.get(key) || { count: 0, until: now + 600000 };
        if (prior.count >= 10 || attempts.size >= 1000) { response.setHeader('Retry-After', '600'); comingSoon(request, response, basePath, 'Too many attempts. Try again in 10 minutes.', 429); return; }
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) { response.writeHead(413); response.end(); return; }
        }
        const form = new URLSearchParams(body);
        const password = form.get('password') || '';
        const next = safeReturnPath(form.get('next'), basePath);
        if (password.length > 128 || !equal(scryptSync(password, salt, 64).toString('hex'), expected)) {
          attempts.set(key, { ...prior, count: prior.count + 1 });
          comingSoon(request, response, next, 'That password did not match. Try again.', 401); return;
        }
        attempts.delete(key);
        const value = `${Date.now() + 8 * 3600000}.${randomBytes(16).toString('base64url')}`;
        response.writeHead(303, { Location: next, 'Set-Cookie': `site_preview=${value}.${sign(value)}; Path=${basePath}; HttpOnly; SameSite=Lax; Max-Age=28800${protocol === 'https:' ? '; Secure' : ''}`, 'Cache-Control': 'no-store' });
        response.end(); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
      if (enabled && !authenticated(request) && !publicPaths.includes(relative)) { comingSoon(request, response, url.pathname + url.search); return; }
      if (relative.split('/').some(part => part.startsWith('.')) || !allowedPath(relative)) { response.writeHead(404); response.end(); return; }
      if (Object.hasOwn(redirects, relative)) {
        const destination = redirects[relative];
        response.writeHead(308, { Location: basePath + destination + url.search, 'Cache-Control': 'no-store' }); response.end(); return;
      }
      let file, info;
      for (const candidate of [relative || 'index.html', relative + '.html', relative + '/index.html', ...(spaPaths.includes(relative) ? ['index.html'] : [])]) {
        const target = resolve(root, candidate);
        if (!target.startsWith(root + sep)) continue;
        try {
          const resolved = await realpath(target);
          if (!resolved.startsWith(root + sep)) continue;
          const details = await stat(resolved);
          if (details.isFile()) { file = resolved; info = details; break; }
        } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
      }
      if (!file) { response.writeHead(404); response.end('Page not found.'); return; }
      const type = mime[extname(file).toLowerCase()] || 'application/octet-stream';
      response.setHeader('Content-Type', type);
      response.setHeader('Cache-Control', enabled ? 'private, no-store' : /\.(html|css|js)$/.test(file) ? 'no-cache' : 'public, max-age=3600');
      response.setHeader('Accept-Ranges', 'bytes');
      let start = 0, end = info.size - 1, status = 200;
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
        start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
        end = match[1] ? match[2] ? Math.min(Number(match[2]), end) : end : end;
        if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
        status = 206;
        response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      const gzip = status === 200 && /gzip/.test(request.headers['accept-encoding'] || '') && /^(text\/|application\/(javascript|json))/.test(type);
      if (gzip) { response.setHeader('Content-Encoding', 'gzip'); response.setHeader('Vary', 'Accept-Encoding'); }
      else response.setHeader('Content-Length', Math.max(0, end - start + 1));
      response.writeHead(status);
      if (request.method === 'HEAD' || !info.size) { response.end(); return; }
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      if (gzip) stream.pipe(createGzip()).pipe(response); else stream.pipe(response);
    } catch (error) {
      if (response.headersSent) response.destroy();
      else { response.writeHead(error instanceof URIError ? 400 : 500); response.end('The page could not be loaded.'); }
    }
  });
}
