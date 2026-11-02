import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Coins } from "./coins";
import { ledgerApi } from "./ledger";
import { followLink, go, itemPath } from "./route";

interface DayPoint {
  t: number;
  day: string;
  unit: number;
  qty: number;
  listings: number;
  scans: number;
}

export interface MarketItem {
  itemId: number;
  name: string;
  points: DayPoint[];
}

function highlight(name: string, query: string) {
  const needle = query.trim();
  const at = name.toLowerCase().indexOf(needle.toLowerCase());
  if (!needle || at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <mark>{name.slice(at, at + needle.length)}</mark>
      {name.slice(at + needle.length)}
    </>
  );
}

function dayLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function whenScanned(unix: number) {
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function iconUrl(itemId: number) {
  const api = ledgerApi();
  return api ? `${api}/api/icon/${itemId}` : `/icon/${itemId}`;
}

function Chart({ points }: { points: DayPoint[] }) {
  const width = 640;
  const height = 220;
  const pad = { l: 118, r: 18, t: 18, b: 36 };
  const units = points.map((point) => point.unit);
  const min = Math.min(...units);
  const max = Math.max(...units);
  const span = Math.max(max - min, Math.max(max * 0.08, 1));
  const y0 = Math.max(0, min - span * 0.35);
  const y1 = max + span * 0.35;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (index: number) => pad.l + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const yAt = (unit: number) => pad.t + ((y1 - unit) / (y1 - y0)) * innerH;
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.unit)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent price per unit">
      <line className="axis" x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} />
      <line className="axis" x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} />
      <foreignObject x={0} y={yAt(y1) - 9} width={pad.l - 8} height={18}>
        <div xmlns="http://www.w3.org/1999/xhtml" className="axis-coins"><Coins copper={Math.round(y1)} /></div>
      </foreignObject>
      <foreignObject x={0} y={yAt(y0) - 9} width={pad.l - 8} height={18}>
        <div xmlns="http://www.w3.org/1999/xhtml" className="axis-coins"><Coins copper={Math.round(y0)} /></div>
      </foreignObject>
      <path className="series" d={line} />
      {points.map((point, index) => (
        <g key={point.day}>
          <circle className="dot" cx={xAt(index)} cy={yAt(point.unit)} r={5} />
          <text className="tick" x={xAt(index)} y={height - 12} textAnchor="middle">{dayLabel(point.day)}</text>
        </g>
      ))}
    </svg>
  );
}

export function ItemView({ item }: { item: MarketItem }) {
  const latest = item.points[item.points.length - 1];
  const units = item.points.map((point) => point.unit);
  const low = units.length ? Math.min(...units) : 0;
  const high = units.length ? Math.max(...units) : 0;
  useEffect(() => {
    document.title = `${item.name} · AuctionAssistant`;
    window.$WowheadPower?.refreshLinks();
    return () => {
      document.title = "AuctionAssistant";
    };
  }, [item]);
  if (!latest) return <div className="who">No scan has this item yet.</div>;
  return (
    <div className="price-card">
      <div className="price-head">
        <a className="item" target="_blank" rel="noreferrer" href={`https://www.wowhead.com/tbc/item=${item.itemId}`} data-wowhead={`item=${item.itemId}&domain=tbc`}>
          <img className="icon" alt="" width={36} height={36} src={iconUrl(item.itemId)} onError={(event) => event.currentTarget.remove()} />
          <div>
            <div className="price-name">{item.name}</div>
            <div className="who">Scanned {whenScanned(latest.t)}</div>
          </div>
        </a>
        <div className="price-now"><Coins copper={latest.unit} /></div>
      </div>
      <div className="facts">
        <div><span>Cheapest each</span><strong><Coins copper={latest.unit} /></strong></div>
        <div><span>Posted</span><strong>{latest.qty.toLocaleString()}</strong></div>
        <div><span>Listings</span><strong>{latest.listings.toLocaleString()}</strong></div>
        <div><span>Low</span><strong><Coins copper={low} /></strong></div>
        <div><span>High</span><strong><Coins copper={high} /></strong></div>
      </div>
      <Chart points={item.points} />
      <table className="history">
        <thead>
          <tr><th>Day</th><th className="num">Each</th><th className="num">Posted</th><th className="num">Listings</th></tr>
        </thead>
        <tbody>
          {[...item.points].reverse().map((point) => (
            <tr key={point.day}>
              <td>{dayLabel(point.day)}{point.scans > 1 ? ` · ${point.scans} scans` : ""}</td>
              <td className="num"><Coins copper={point.unit} /></td>
              <td className="num">{point.qty.toLocaleString()}</td>
              <td className="num">{point.listings.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Market() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MarketItem[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [note, setNote] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const suggestionKey = items.map((row) => row.itemId).join(",");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      setNote("");
      return;
    }
    const timer = window.setTimeout(() => {
      fetch(`/api/market?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((res) => res.json() as Promise<{ items?: MarketItem[] }>)
        .then((data) => {
          const next = data.items || [];
          setItems(next);
          setCursor(0);
          setNote(next.length ? "" : `No scan has “${q}” yet.`);
        })
        .catch(() => setNote("The scan database could not be read."));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    window.$WowheadPower?.refreshLinks();
  }, [suggestionKey]);

  function choose(row: MarketItem) {
    setOpen(false);
    setQuery("");
    go(itemPath(row.itemId));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setCursor((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setCursor((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const row = items[cursor];
      if (row) choose(row);
    }
  }

  const showHits = open && items.length > 0 && query.trim().length >= 2;

  return (
    <section className="market">
      <label className="search">
        <span>Scanned items</span>
        <div className="search-box" ref={box}>
          <input
            value={query}
            placeholder="Search an item"
            spellCheck={false}
            role="combobox"
            aria-expanded={showHits}
            aria-autocomplete="list"
            aria-controls="scanned-items"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={(event) => {
              if (box.current?.contains(event.relatedTarget as Node)) return;
              setOpen(false);
            }}
            onKeyDown={onKeyDown}
          />
          {showHits ? (
            <div className="hits" id="scanned-items" role="listbox">
              {items.map((row, index) => {
                const last = row.points[row.points.length - 1];
                return (
                  <a
                    key={row.itemId}
                    role="option"
                    aria-selected={index === cursor}
                    className={index === cursor ? "hit on" : "hit"}
                    href={itemPath(row.itemId)}
                    data-wowhead={`item=${row.itemId}&domain=tbc`}
                    onMouseEnter={() => setCursor(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      followLink(event, itemPath(row.itemId));
                      if (event.defaultPrevented) {
                        setOpen(false);
                        setQuery("");
                      }
                    }}
                  >
                    <img className="icon" alt="" width={36} height={36} src={iconUrl(row.itemId)} onError={(event) => event.currentTarget.remove()} />
                    <span className="hit-name">{highlight(row.name, query)}</span>
                    <span className="hit-meta">{last ? <Coins copper={last.unit} /> : null} · {last ? dayLabel(last.day) : ""}</span>
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
      </label>
      {note ? <div className="who">{note}</div> : null}
    </section>
  );
}
