'use strict';
// Vercel function. Each friend's desktop ledger pushes here when LEDGER_REMOTE
// and LEDGER_TOKEN are set. The GitHub Pages site reads it with the same token.
// Persistence is Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).

const { mergeEvents, summarize } = require('../store');
const { cors, bearerOk, redis } = require('./shared');

const KEY = 'AuctionAssistant-ledger';

function send(res, status, body) {
  cors(res);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(status === 204 ? '' : JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204);
    return;
  }
  const expected = process.env.LEDGER_TOKEN || '';
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!bearerOk(header, expected)) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    send(res, 503, { error: 'Connect Upstash Redis on the Vercel project.' });
    return;
  }
  let events = [];
  try {
    const raw = await redis(['GET', KEY]);
    events = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(events)) events = [];
  } catch (error) {
    send(res, 502, { error: error.message });
    return;
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    events = mergeEvents(events, Array.isArray(body.events) ? body.events : []);
    try { await redis(['SET', KEY, JSON.stringify(events)]); }
    catch (error) { send(res, 502, { error: error.message }); return; }
  } else if (req.method !== 'GET') {
    send(res, 405, { error: 'method' });
    return;
  }
  send(res, 200, { events, summary: summarize(events) });
};
