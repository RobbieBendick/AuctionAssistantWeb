'use strict';
// Local ledger site. The addon records auctions in SavedVariables, which the
// client writes on /reload and logout. This process reads that file and serves
// the page at http://127.0.0.1:4317
//
// Optional push to a Vercel project that has Upstash and LEDGER_TOKEN set:
//   LEDGER_REMOTE=https://your-app.vercel.app LEDGER_TOKEN=... node server.js

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { parseWire, parseLine, mergeEvents, summarize } = require('./store');
const { loadIcon } = require('./icons');

const PORT = Number(process.env.PORT) || 4317;
const ROOT = __dirname;
const DATA = process.env.LEDGER_DATA || path.join(ROOT, 'data', 'ledger.json');
const REMOTE = process.env.LEDGER_REMOTE || '';
const TOKEN = process.env.LEDGER_TOKEN || '';

function publicFile(urlPath) {
  const rel = urlPath === '/' ? 'index.html' : String(urlPath || '').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return null;
  const root = path.resolve(ROOT, 'public');
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  try {
    if (!fs.statSync(file).isFile()) return null;
  } catch {
    return null;
  }
  return file;
}

function findSavedFiles() {
  if (process.env.WOW_SAVED) return [process.env.WOW_SAVED];
  const wow = process.env.WOW_ROOT || 'C:\\Program Files (x86)\\World of Warcraft';
  const flavors = ['_anniversary_', '_classic_beta_', '_classic_', '_classic_era_'];
  const found = [];
  for (const flavor of flavors) {
    const accounts = path.join(wow, flavor, 'WTF', 'Account');
    let names = [];
    try { names = fs.readdirSync(accounts); } catch { continue; }
    for (const name of names) {
      const file = path.join(accounts, name, 'SavedVariables', 'AuctionAssistant.lua');
      if (fs.existsSync(file)) found.push(file);
    }
  }
  return found;
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function writeStore(events) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  const body = JSON.stringify({ events, summary: summarize(events) }, null, 2);
  const tmp = DATA + '.tmp';
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, DATA);
}

let lastPush = '';

async function pushRemote(events) {
  if (!REMOTE || !events.length) return;
  const stamp = events.map(event => event.id).join(',');
  if (stamp === lastPush) return;
  try {
    const res = await fetch(REMOTE.replace(/\/$/, '') + '/api/ledger', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(TOKEN ? { authorization: 'Bearer ' + TOKEN } : {}),
      },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) throw new Error(res.status + ' ' + await res.text());
    lastPush = stamp;
    console.log('pushed ' + events.length + ' events to ' + REMOTE);
  } catch (error) {
    console.log('remote ledger push failed: ' + error.message);
  }
}

let savedAt = null;
let captureState = 'off';

function noteBarcode(text) {
  const event = parseLine(String(text || '').trim());
  if (!event) return;
  const before = readStore();
  const events = mergeEvents(before, [event]);
  if (events.length === before.length) return;
  writeStore(events);
  savedAt = new Date().toISOString();
  console.log('barcode ' + event.kind + ' ' + event.name + ' ' + event.copper);
  pushRemote(events);
}

function watchBarcode() {
  if (process.platform !== 'win32') return;
  const script = path.join(ROOT, '..', 'bridge', 'capture.ps1');
  if (!fs.existsSync(script)) return;
  const procName = process.env.WOW_PROCESS || 'WowClassic';
  const child = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-ProcessName', procName, '-Cell', process.env.LEDGER_CELL || '2',
  ], { windowsHide: true });
  captureState = 'waiting';
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.info && /attached/i.test(msg.info)) captureState = 'attached';
      if (typeof msg.text === 'string') noteBarcode(msg.text);
    }
  });
  child.on('exit', () => { if (captureState !== 'off') captureState = 'off'; });
}

function importSaved() {
  let incoming = [];
  let newest = 0;
  for (const file of findSavedFiles()) {
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    if (stat.mtimeMs > newest) newest = stat.mtimeMs;
    try { incoming = incoming.concat(parseWire(fs.readFileSync(file, 'utf8'))); } catch {}
  }
  if (newest) savedAt = new Date(newest).toISOString();
  const before = readStore();
  const events = mergeEvents(before, incoming);
  if (events.length !== before.length) {
    writeStore(events);
    console.log('ledger ' + events.length + ' events (' + (events.length - before.length) + ' new)');
    pushRemote(events);
  }
  return events;
}

function payload() {
  const events = readStore();
  return JSON.stringify({
    events,
    summary: summarize(events),
    savedAt,
    watching: findSavedFiles().length,
    capture: captureState,
  });
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/api/ledger' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(payload());
    return;
  }
  if (url === '/api/ledger' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
      const events = mergeEvents(readStore(), Array.isArray(body.events) ? body.events : []);
      writeStore(events);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(payload());
    });
    return;
  }
  const file = publicFile(url);
  if (file && req.method === 'GET') {
    const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : file.endsWith('.css') ? 'text/css; charset=utf-8'
      : 'text/html; charset=utf-8';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(fs.readFileSync(file));
    return;
  }
  const icon = url.match(/^\/icon\/(\d+)$/);
  if (icon && req.method === 'GET') {
    const dir = path.join(path.dirname(DATA), 'icons');
    loadIcon(dir, icon[1]).then(file => {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' });
      res.end(fs.readFileSync(file));
    }).catch(() => {
      if (!res.headersSent) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
      }
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

if (require.main === module) {
  importSaved();
  setInterval(importSaved, 2000);
  watchBarcode();
  server.listen(PORT, '127.0.0.1', () => {
    console.log('auction ledger  http://127.0.0.1:' + PORT);
    const files = findSavedFiles();
    console.log(files.length ? 'watching  ' + files.join(', ') : 'no AuctionAssistant.lua saved data yet');
  });
}

module.exports = { server, importSaved, findSavedFiles, payload };
