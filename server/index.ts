import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { getMap, MAP_IDS, RuleError, type Rng, type Side } from '../rules';
import type { ClientMsg, InfoResponse, ServerMsg } from './protocol';
import { HttpError, Sessions, type Subscriber } from './sessions';
import { Store } from './store';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface ServerOptions {
  port?: number;
  dbPath?: string;
  mapsDir?: string;
  clientDir?: string;
  rng?: Rng;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.map': 'application/json',
};

function lanUrls(port: number): string[] {
  return Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => `http://${n!.address}:${port}`);
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 64 * 1024) reject(new HttpError(413, 'Too large'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new HttpError(400, 'Bad JSON')); }
    });
    req.on('error', reject);
  });
}

export async function startServer(opts: ServerOptions = {}) {
  const mapsDir = opts.mapsDir ?? path.join(root, 'maps');
  const clientDir = opts.clientDir ?? path.join(root, 'client', 'dist');
  const store = new Store(opts.dbPath ?? path.join(root, 'data', 'tfb.sqlite'));
  const removed = store.cleanup();
  const sessions = new Sessions(store, opts.rng ?? { int: (n) => randomInt(n) });

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const sendFile = (res: http.ServerResponse, file: string, cache: string) => {
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) return json(res, 404, { error: 'Not found' });
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stat.size, 'cache-control': cache,
      });
      fs.createReadStream(file).pipe(res);
    });
  };

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const port = (server.address() as { port: number }).port;

    if (parts[0] === 'api') {
      if (req.method === 'GET' && parts[1] === 'info') {
        const info: InfoResponse = {
          lanUrls: lanUrls(port),
          maps: MAP_IDS.map((id) => {
            const def = getMap(id).def;
            return { id, name: def.name, optionalRules: (def.optionalRules ?? []).map((r) => ({ id: r.id, label: r.label })) };
          }),
        };
        return json(res, 200, info);
      }
      if (req.method === 'POST' && parts[1] === 'sessions' && parts.length === 2) {
        return json(res, 200, sessions.create(await readJson(req)));
      }
      if (req.method === 'POST' && parts[1] === 'sessions' && parts[3] === 'claim') {
        return json(res, 200, sessions.claim(parts[2], (await readJson(req)).invite));
      }
      if (req.method === 'POST' && parts[1] === 'maps' && parts[3] === 'calibration') {
        // The calibration page saves grid fractions into the map's data file.
        if (!MAP_IDS.includes(parts[2])) throw new HttpError(404, 'Unknown map');
        const c = await readJson(req);
        const cal = { x0: Number(c.x0), y0: Number(c.y0), dx: Number(c.dx), dy: Number(c.dy) };
        if (!Object.values(cal).every(Number.isFinite) || cal.dx <= 0 || cal.dy <= 0) throw new HttpError(400, 'Bad calibration');
        const file = path.join(mapsDir, `${parts[2]}.json`);
        const def = JSON.parse(fs.readFileSync(file, 'utf8'));
        def.calibration = cal;
        fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n');
        return json(res, 200, { ok: true, calibration: cal });
      }
      throw new HttpError(404, 'Not found');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');

    if (parts[0] === 'maps' && parts.length === 2) {
      // Map data and art come from the local maps/ folder; the art is never committed.
      const name = path.basename(parts[1]);
      if (!/\.(json|png|jpe?g|webp)$/i.test(name)) throw new HttpError(404, 'Not found');
      return sendFile(res, path.join(mapsDir, name), 'no-cache');
    }

    const rel = path.normalize(parts.join('/'));
    const file = path.join(clientDir, rel);
    if (rel && !rel.startsWith('..') && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return sendFile(res, file, rel.startsWith('assets') ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
    const index = path.join(clientDir, 'index.html');
    if (!fs.existsSync(index)) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      return res.end('The client has not been built yet. Run "npm start" (or "npm run build").');
    }
    return sendFile(res, index, 'no-cache');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      console.error(e);
      json(res, 500, { error: 'Server error' });
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws: WebSocket) => {
    let seat: { id: string; side: Side; sub: Subscriber; off: () => void } | null = null;
    const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(raw)); } catch { return send({ t: 'error', message: 'Bad message' }); }
      const id = 'id' in msg ? msg.id : undefined;
      try {
        if (msg.t === 'hello') {
          if (seat) return;
          const side = sessions.auth(msg.session, msg.token);
          if (!side) {
            send({ t: 'error', fatal: true, message: 'This seat link is no longer valid. Ask the other player to re-issue your seat from the menu.' });
            return ws.close();
          }
          const sub: Subscriber = {
            side,
            view: (view) => send({ t: 'view', view }),
            kick: (message) => { send({ t: 'error', fatal: true, message }); ws.close(); },
          };
          seat = { id: msg.session, side, sub, off: sessions.subscribe(msg.session, sub) };
          return;
        }
        if (!seat) return send({ t: 'error', id, message: 'Not signed in to a seat' });
        if (msg.t === 'action') {
          sessions.act(seat.id, seat.side, msg.action);
          return send({ t: 'ok', id: msg.id });
        }
        if (msg.t === 'reissue') {
          const token = sessions.reissue(seat.id, seat.side, msg.seat, seat.sub);
          return send({ t: 'ok', id: msg.id, reissued: { seat: msg.seat, token } });
        }
      } catch (e) {
        if (e instanceof RuleError || e instanceof HttpError) {
          return send({ t: 'error', id, message: e.message, fatal: e instanceof HttpError && !seat });
        }
        console.error(e);
        send({ t: 'error', id, message: 'Server error' });
      }
    });
    ws.on('close', () => seat?.off());
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 3000, resolve));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    removed,
    lanUrls: lanUrls(port),
    close: () => new Promise<void>((resolve) => {
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.close(() => { store.close(); resolve(); });
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  startServer({ port, dbPath: process.env.TFB_DB }).then((s) => {
    console.log('\nTask Force Blind Search Tracker');
    console.log(`  This laptop:   http://localhost:${s.port}`);
    for (const u of s.lanUrls) console.log(`  Other device:  ${u}   (same Wi-Fi)`);
    if (!s.lanUrls.length) console.log('  No LAN address found: connect to Wi-Fi so the other device can reach this laptop.');
    if (s.removed) console.log(`  Removed ${s.removed} session(s): idle for 30 days, or from an older rules revision.`);
    if (!fs.existsSync(path.join(root, 'maps', 'midway.png'))) {
      console.log('  Note: maps/midway.png is missing, so the map shows a plain hex grid.');
    }
    console.log('');
  });
}
