'use strict';
// Pure ledger rules: turn the addon's saved-variable string into events, merge
// them without duplicates, and total the three kinds. No files, no server.

const KINDS = new Set(['post', 'buy', 'sold']);

function unescapeLua(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractWire(src) {
  const match = String(src || '').match(/\["ledgerWire"\]\s*=\s*"((?:\\.|[^"\\])*)"/)
    || String(src || '').match(/(?:^|\n)\s*ledgerWire\s*=\s*"((?:\\.|[^"\\])*)"/);
  return match ? unescapeLua(match[1]) : '';
}

function parseLine(line) {
  const parts = String(line || '').split('|');
  const id = parts[0];
  if (!id) return null;
  const shortKind = parts[1] === 'b' ? 'buy' : parts[1] === 'p' ? 'post' : null;
  if (shortKind && parts.length >= 6) {
    let duration = 0;
    let nameAt = 5;
    if (parts.length >= 7 && /^\d+$/.test(parts[5])) {
      duration = Number(parts[5]) || 0;
      nameAt = 6;
    }
    const name = parts.slice(nameAt).join('|').trim();
    if (!name) return null;
    const event = {
      id,
      t: Number(id.split('-')[0]) || 0,
      kind: shortKind,
      itemId: Number(parts[2]) || 0,
      count: Number(parts[3]) || 0,
      copper: Number(parts[4]) || 0,
      character: '',
      realm: '',
      name,
    };
    if (duration > 0) event.duration = duration;
    return event;
  }
  if (parts.length < 9) return null;
  const kind = parts[2];
  if (!KINDS.has(kind)) return null;
  let duration = 0;
  let name;
  if (parts.length >= 10 && /^\d+$/.test(parts[8])) {
    duration = Number(parts[8]) || 0;
    name = parts.slice(9).join('|').trim();
  } else {
    name = parts.slice(8).join('|').trim();
  }
  if (!name) return null;
  const event = {
    id,
    t: Number(parts[1]) || 0,
    kind,
    itemId: Number(parts[3]) || 0,
    count: Number(parts[4]) || 0,
    copper: Number(parts[5]) || 0,
    character: parts[6] || '',
    realm: parts[7] || '',
    name,
  };
  if (duration > 0) event.duration = duration;
  return event;
}

function parseWire(src) {
  const wire = src.includes('ledgerWire') || src.includes('\\n') ? extractWire(src) : String(src || '');
  const events = [];
  for (const line of wire.split('\n')) {
    const event = parseLine(line.trim());
    if (event) events.push(event);
  }
  return events;
}

function mergeEvents(existing, incoming) {
  const byId = new Map();
  for (const event of existing || []) if (event && event.id) byId.set(event.id, event);
  for (const event of incoming || []) {
    if (!event || !event.id) continue;
    const prev = byId.get(event.id);
    if (prev) {
      if (!event.character && prev.character) event.character = prev.character;
      if (!event.realm && prev.realm) event.realm = prev.realm;
      if (!event.t && prev.t) event.t = prev.t;
      if (!event.duration && prev.duration) event.duration = prev.duration;
    }
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => (b.t - a.t) || String(b.id).localeCompare(String(a.id)));
}

function summarize(events) {
  const totals = { posted: 0, bought: 0, sold: 0, net: 0, count: 0 };
  for (const event of events || []) {
    const copper = Number(event.copper) || 0;
    if (event.kind === 'post') totals.posted += copper;
    else if (event.kind === 'buy') totals.bought += copper;
    else if (event.kind === 'sold') totals.sold += copper;
    else continue;
    totals.count += 1;
  }
  totals.net = totals.sold - totals.bought;
  return totals;
}

module.exports = { unescapeLua, extractWire, parseLine, parseWire, mergeEvents, summarize, KINDS };
