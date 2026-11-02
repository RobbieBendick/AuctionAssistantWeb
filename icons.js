'use strict';
// Turns a Wowhead item tooltip into a cached icon file. The barcode only
// carries the item id, so the icon name is looked up here.

const fs = require('fs');
const path = require('path');

function iconFromTooltip(body) {
  let data;
  try { data = JSON.parse(body); } catch { return null; }
  const icon = String(data && data.icon || '').toLowerCase();
  if (!/^[a-z0-9_]+$/.test(icon)) return null;
  return icon;
}

function iconPaths(dir, itemId) {
  return path.join(dir, String(itemId) + '.jpg');
}

const pending = new Map();

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'AuctionAssistant' }, redirect: 'follow' });
  if (!res.ok) throw new Error(String(res.status));
  return Buffer.from(await res.arrayBuffer());
}

async function loadIcon(dir, itemId) {
  const id = String(itemId);
  if (!/^[1-9]\d*$/.test(id)) throw new Error('bad id');
  const file = iconPaths(dir, id);
  if (fs.existsSync(file) && fs.statSync(file).size > 32) return file;
  if (pending.has(id)) return pending.get(id);
  const job = (async () => {
    const tip = await fetchBuffer('https://nether.wowhead.com/tooltip/item/' + id);
    const icon = iconFromTooltip(tip.toString('utf8'));
    if (!icon) throw new Error('no icon');
    const jpg = await fetchBuffer('https://wow.zamimg.com/images/wow/icons/large/' + icon + '.jpg');
    if (jpg.length < 32 || jpg[0] !== 0xFF || jpg[1] !== 0xD8) throw new Error('bad image');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, jpg);
    return file;
  })();
  pending.set(id, job);
  try {
    return await job;
  } finally {
    pending.delete(id);
  }
}

module.exports = { iconFromTooltip, loadIcon };
