import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { initialState, command, tick, publicState, saveResults, RuleError, must } from './engine.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export function createApp(options = {}) {
  const demo = options.demo ?? process.env.DEMO_MODE === '1';
  must(!(demo && process.env.NODE_ENV === 'production'), 'DEMO_MODE não pode ser usado em produção.');
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? join(root, 'data');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'race-control.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, username TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, at INTEGER NOT NULL);`);
  if (!db.prepare('SELECT id FROM state WHERE id=1').get()) {
    const first = initialState(demo);
    db.prepare('INSERT INTO state VALUES (1,?,?)').run(first.version, JSON.stringify(first));
  }
  const username = options.username ?? process.env.ADMIN_USERNAME ?? 'operador';
  const password = options.password ?? process.env.ADMIN_PASSWORD ?? (demo ? 'kart-demo-2026' : null);
  if (!db.prepare('SELECT username FROM users LIMIT 1').get()) {
    must(password && password.length >= 12, 'Na primeira execução, defina ADMIN_PASSWORD com pelo menos 12 caracteres.');
    const salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO users VALUES (?,?,?)').run(username, salt, scryptSync(password, salt, 64).toString('hex'));
  }
  let state = JSON.parse(db.prepare('SELECT json FROM state WHERE id=1').get().json);
  const clients = new Set(), loginAttempts = new Map();
  const secure = options.secureCookies ?? process.env.SECURE_COOKIES === '1';
  let closed = false;
  const broadcast = () => {
    const packet = `event: state\ndata: ${JSON.stringify(publicState(state))}\n\n`;
    for (const res of clients) { if (res.writableLength > 1048576) res.destroy(); else res.write(packet); }
  };
  function audit(actor, action, detail) {
    const at = Date.now(), json = JSON.stringify(detail);
    const previous = db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1').get()?.hash ?? 'genesis';
    const hash = createHash('sha256').update(JSON.stringify({ at, actor, action, detail: json, previous })).digest('hex');
    db.prepare('INSERT INTO audit(at,actor,action,detail,previous_hash,hash) VALUES(?,?,?,?,?,?)').run(at, actor, action, json, previous, hash);
  }
  function persist(next, actor, action, detail, idempotent) {
    next.version = state.version + 1;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE state SET version=?,json=? WHERE id=1').run(next.version, JSON.stringify(next));
      audit(actor, action, detail);
      if (idempotent) db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(idempotent.id, actor, idempotent.fingerprint, JSON.stringify(idempotent.response), Date.now());
      db.exec('COMMIT'); state = next;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    broadcast();
  }
  function advance() {
    const next = structuredClone(state);
    if (tick(next)) persist(next, 'servidor', 'timer.elapsed', {});
  }
  const ticker = setInterval(() => { try { advance(); } catch (e) { console.error('Falha no timer:', e.message); } }, 100);
  const heartbeat = setInterval(() => { for (const client of clients) client.write(`event: heartbeat\ndata: ${JSON.stringify({serverNow:Date.now()})}\n\n`); }, 15000);
  ticker.unref(); heartbeat.unref();
  function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }
  function session(req) {
    const token = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('rc_session='))?.slice(11);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT username,hash FROM sessions WHERE hash=? AND expires>?').get(createHash('sha256').update(token).digest('hex'), Date.now());
  }
  const cookie = (token, maxAge) => `rc_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  async function body(req) {
    must(req.headers['content-type']?.split(';')[0] === 'application/json', 'Envie application/json.', 415);
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; must(size <= 262144, 'Requisição muito grande.', 413); chunks.push(chunk); }
    try { const value = JSON.parse(Buffer.concat(chunks).toString()); must(value && typeof value === 'object' && !Array.isArray(value), 'JSON inválido.', 400); return value; }
    catch (e) { throw e instanceof RuleError ? e : new RuleError('JSON inválido.', 400); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', version: '0.1.1' });
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin) must(new URL(origin).host === req.headers.host, 'Origem não autorizada.', 403);
        must(req.headers['sec-fetch-site'] !== 'cross-site', 'Origem não autorizada.', 403);
      }
      if (req.method === 'POST' && url.pathname === '/api/login') {
        const addr = process.env.TRUST_PROXY === '1' ? (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress) : req.socket.remoteAddress;
        const at = Date.now(), attempts = loginAttempts.get(addr);
        must(!attempts || attempts.reset <= at || attempts.count < 10, 'Muitas tentativas. Aguarde 15 minutos.', 429);
        const input = await body(req);
        must(typeof input.username === 'string' && typeof input.password === 'string' && input.password.length <= 1024, 'Credenciais inválidas.', 400);
        const user = db.prepare('SELECT * FROM users WHERE username=?').get(input.username);
        const hash = scryptSync(input.password, user?.salt ?? 'unknown-user-salt', 64);
        const correct = user && timingSafeEqual(Buffer.from(user.hash, 'hex'), hash);
        if (!correct) {
          const entry = attempts && attempts.reset > at ? attempts : { count: 0, reset: at + 900000 };
          entry.count++; loginAttempts.set(addr, entry);
          if (loginAttempts.size > 10000) for (const [ip,v] of loginAttempts) if (v.reset <= at) loginAttempts.delete(ip);
          throw new RuleError('Usuário ou senha incorretos.', 401);
        }
        loginAttempts.delete(addr);
        const token = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), user.username, at + 43200000);
        audit(user.username, 'auth.login', {});
        return send(res, 200, { username: user.username }, { 'Set-Cookie': cookie(token, 43200) });
      }
      const user = session(req);
      if (req.method === 'GET' && url.pathname === '/api/session') return send(res, 200, { authenticated: !!user, username: user?.username, demo });
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        if (user) db.prepare('DELETE FROM sessions WHERE hash=?').run(user.hash);
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
      }
      if (req.method === 'GET' && url.pathname === '/api/state') { advance(); return send(res, 200, publicState(state)); }
      if (req.method === 'GET' && url.pathname === '/api/stream') {
        advance();
        must(clients.size < 500, 'Limite de conexões ao vivo atingido.', 503);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`retry: 2000\nevent: state\ndata: ${JSON.stringify(publicState(state))}\n\n`);
        clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (url.pathname.startsWith('/api/admin/')) {
        must(user, 'Entre com sua conta de operação.', 401);
        if (req.method === 'GET' && url.pathname === '/api/admin/state') {
          advance(); return send(res, 200, { ...state, serverNow: Date.now(), audit: db.prepare('SELECT id,at,actor,action,detail,hash FROM audit ORDER BY id DESC LIMIT 100').all() });
        }
        if (req.method === 'GET' && url.pathname === '/api/admin/export') {
          return send(res, 200, { schemaVersion: 1, exportedAt: new Date().toISOString(), state,
            audit: db.prepare('SELECT * FROM audit ORDER BY id').all() }, { 'Content-Disposition': 'attachment; filename="rg-racing-export.json"' });
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/password') {
          const input = await body(req);
          must(typeof input.currentPassword === 'string' && typeof input.newPassword === 'string' && input.newPassword.length >= 12 && input.newPassword.length <= 1024, 'A nova senha precisa ter pelo menos 12 caracteres.');
          const record = db.prepare('SELECT * FROM users WHERE username=?').get(user.username);
          must(timingSafeEqual(Buffer.from(record.hash, 'hex'), scryptSync(input.currentPassword, record.salt, 64)), 'Senha atual incorreta.', 403);
          const salt = randomBytes(16).toString('hex');
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('UPDATE users SET salt=?,hash=? WHERE username=?').run(salt, scryptSync(input.newPassword, salt, 64).toString('hex'), user.username);
            db.prepare('DELETE FROM sessions WHERE username=?').run(user.username);
            audit(user.username, 'auth.password-changed', {}); db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/command') {
          const input = await body(req);
          must(typeof input.action === 'string' && input.data && typeof input.data === 'object', 'Comando inválido.', 400);
          const id = req.headers['idempotency-key'];
          must(typeof id === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(id), 'Envie uma chave de idempotência.', 400);
          const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
          const prior = db.prepare('SELECT * FROM requests WHERE id=?').get(id);
          if (prior) {
            must(prior.username === user.username && prior.fingerprint === fingerprint, 'Chave de idempotência reutilizada para outro comando.', 409);
            return send(res, 200, JSON.parse(prior.response));
          }
          advance();
          must(Number(req.headers['if-match']) === state.version, 'O painel foi atualizado por outra operação. Revise os dados e tente novamente.', 409);
          const next = structuredClone(state);
          const value = input.action === 'results.save' ? saveResults(next, input.data) : command(next, input.action, input.data);
          const response = { ok: true, version: state.version + 1, result: value ?? null };
          persist(next, user.username, input.action, input.data, { id, fingerprint, response });
          return send(res, 200, response);
        }
      }
      if (url.pathname.startsWith('/api/')) throw new RuleError('Rota não encontrada.', 404);
      must(req.method === 'GET' || req.method === 'HEAD', 'Método não permitido.', 405);
      const files = { '/app.js': ['app.js','text/javascript'], '/styles.css': ['styles.css','text/css'], '/branding.css': ['branding.css','text/css'], '/assets/rg-racing-logo.png': ['assets/rg-racing-logo.png','image/png'], '/stats.js': ['stats.js','text/javascript'] };
      const allowedPage = /^\/(?:admin|tv|cronograma|ranking|piloto|karts)?\/?$/.test(url.pathname);
      must(files[url.pathname] || allowedPage, 'Página não encontrada.', 404);
      const [path,mime] = files[url.pathname] ?? ['index.html','text/html'];
      const file = readFileSync(join(root,'public',path));
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch (e) {
      if (!(e instanceof RuleError)) console.error('Erro de requisição:', e.message);
      if (!res.headersSent) send(res, e.status ?? 500, { error: e instanceof RuleError ? e.message : 'Não foi possível concluir a operação.' });
      else res.end();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  function close() {
    if (closed) return; closed = true;
    clearInterval(ticker); clearInterval(heartbeat);
    for (const res of clients) res.end();
    server.close(); server.closeAllConnections(); db.close();
  }
  return { server, close, getState: () => structuredClone(state) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app = createApp();
    app.server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => {
      console.log(`RG Racing em http://localhost:${process.env.PORT ?? 3000}`);
      if (process.env.DEMO_MODE === '1') console.log('DEMONSTRAÇÃO: operador / kart-demo-2026. Não use este modo em produção.');
    });
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { app.close(); process.exit(0); });
  } catch(e) { console.error(e.message); process.exit(1); }
}
