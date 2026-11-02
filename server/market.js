import fs from "node:fs";
import path from "node:path";

const ITEM = /\[(\d+)\] = \{\s*"((?:\\.|[^"\\])*)",\s*(\d+),\s*(\d+),\s*(\d+),\s*\}/g;
const STAMP = /\["t"\] = (\d+)/g;

let cache = null;

function scanFile() {
  const root = process.env.WOW_ROOT || "C:\\Program Files (x86)\\World of Warcraft";
  const accounts = path.join(root, "_anniversary_", "WTF", "Account");
  if (!fs.existsSync(accounts)) return "";
  for (const account of fs.readdirSync(accounts)) {
    const file = path.join(accounts, account, "SavedVariables", "AuctionAssistant.lua");
    if (fs.existsSync(file)) return file;
  }
  return "";
}

function unescapeLua(value) {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function dayKey(unix) {
  const date = new Date(unix * 1000);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function liveMarketFile() {
  const base = process.env.APPDATA;
  if (!base) return "";
  const file = path.join(base, "AuctionAssistant", "market.json");
  return fs.existsSync(file) ? file : "";
}

function addPoint(items, itemId, name, point) {
  if (!itemId || !point.t) return;
  let item = items.get(itemId);
  if (!item) {
    item = { itemId, name: name || "", points: [] };
    items.set(itemId, item);
  }
  if (name) item.name = name;
  item.points.push(point);
}

function indexLua(file, items) {
  const text = fs.readFileSync(file, "utf8");
  const start = text.indexOf('["scans"]');
  if (start < 0) return;
  const wire = text.indexOf('["ledgerWire"]', start);
  const body = text.slice(start, wire > start ? wire : text.length);
  const marks = [];
  for (const match of body.matchAll(ITEM)) {
    marks.push({
      at: match.index,
      kind: "item",
      itemId: Number(match[1]),
      name: unescapeLua(match[2]),
      qty: Number(match[3]),
      listings: Number(match[4]),
      unit: Number(match[5]),
    });
  }
  for (const match of body.matchAll(STAMP)) {
    marks.push({ at: match.index, kind: "t", t: Number(match[1]) });
  }
  marks.sort((a, b) => a.at - b.at);
  let bucket = [];
  for (const mark of marks) {
    if (mark.kind === "item") {
      bucket.push(mark);
      continue;
    }
    for (const row of bucket) {
      addPoint(items, row.itemId, row.name, { t: mark.t, unit: row.unit, qty: row.qty, listings: row.listings });
    }
    bucket = [];
  }
}

function indexLive(file, items) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return;
  }
  for (const scan of data.scans || []) {
    const t = Number(scan.t) || 0;
    for (const [id, row] of Object.entries(scan.items || {})) {
      addPoint(items, Number(id), row && row.name, {
        t,
        unit: Number(row && row.unit) || 0,
        qty: Number(row && row.qty) || 0,
        listings: Number(row && row.listings) || 0,
      });
    }
  }
}

function loadItems() {
  const lua = scanFile();
  const live = liveMarketFile();
  const luaMtime = lua ? fs.statSync(lua).mtimeMs : 0;
  const liveMtime = live ? fs.statSync(live).mtimeMs : 0;
  if (cache && cache.lua === lua && cache.luaMtime === luaMtime && cache.live === live && cache.liveMtime === liveMtime) {
    return cache.items;
  }
  const items = new Map();
  if (lua) indexLua(lua, items);
  if (live) indexLive(live, items);
  cache = { lua, luaMtime, live, liveMtime, items };
  return items;
}

function daily(points) {
  const byDay = new Map();
  for (const point of points) {
    const day = dayKey(point.t);
    const prev = byDay.get(day);
    if (!prev || point.t > prev.t) byDay.set(day, { ...point, day, scans: (prev && prev.day === day ? prev.scans : 0) + 1 });
    else prev.scans += 1;
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

export function searchMarket(query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return { items: [] };
  const items = loadItems();
  const hits = [];
  for (const item of items.values()) {
    const name = item.name.toLowerCase();
    if (!name.includes(q)) continue;
    hits.push({ item, rank: name.startsWith(q) ? 0 : 1 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name) || a.item.itemId - b.item.itemId);
  return {
    items: hits.slice(0, 12).map(({ item }) => ({
      itemId: item.itemId,
      name: item.name,
      points: daily(item.points),
    })),
  };
}

export function itemMarket(id) {
  const item = loadItems().get(Number(id));
  if (!item) return { item: null };
  return {
    item: {
      itemId: item.itemId,
      name: item.name,
      points: daily(item.points),
    },
  };
}

export function marketMiddleware(req, res, next) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/api/market") return next();
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  const id = url.searchParams.get("id");
  res.end(JSON.stringify(id ? itemMarket(id) : searchMarket(url.searchParams.get("q"))));
}
