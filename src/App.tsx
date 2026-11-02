import { useEffect, useMemo, useRef, useState } from "react";
import { ItemPage } from "./ItemPage";
import { Market } from "./Market";
import { Coins } from "./coins";
import { itemIdFromPath, usePath } from "./route";
import {
  actionName,
  actorName,
  canceledPostIds,
  formatLeft,
  iconSrc,
  ledgerApi,
  postEnds,
  whenLabel,
  type AuctionEvent,
  type KindFilter,
  type LedgerPayload,
} from "./ledger";

const FILTERS: { kind: KindFilter; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "sold", label: "Sold" },
  { kind: "buy", label: "Bought" },
  { kind: "post", label: "Posted" },
  { kind: "cancel", label: "Canceled" },
];

function syncText(api: string, savedAt: string | null, capture: string): string {
  if (api) return "Shared ledger.";
  if (capture === "attached") return "Watching the game window. A buyout shows up as soon as the barcode is read.";
  if (capture === "waiting") return "Waiting for the TBC window. Buys are sent as a barcode when the purchase goes through.";
  if (!savedAt) return "Barcode capture is off. /reload still sends rows from the saved file.";
  return `Last row ${new Date(savedAt).toLocaleString()}.`;
}

export function App() {
  const itemId = itemIdFromPath(usePath());
  if (itemId) return <ItemPage itemId={itemId} />;
  return <Ledger />;
}

function Ledger() {
  const api = ledgerApi();
  const [events, setEvents] = useState<AuctionEvent[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
  const [who, setWho] = useState("all");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [capture, setCapture] = useState("off");
  const [addon, setAddon] = useState("");
  const [status, setStatus] = useState("Reading the ledger…");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let stop = false;
    async function refresh() {
      if (!api && location.hostname.endsWith("github.io")) {
        if (!stop) setStatus("The shared ledger is not connected yet.");
        return;
      }
      try {
        const res = await fetch(`${api}/api/ledger`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LedgerPayload;
        if (stop) return;
        const next = data.events || [];
        const ids = next.map((ev) => ev.id);
        if (known.current === null) known.current = new Set(ids);
        else {
          const arrived = ids.filter((id) => !known.current?.has(id));
          for (const id of ids) known.current.add(id);
          if (arrived.length > 0) {
            setFresh((prev) => {
              const updated = new Set(prev);
              for (const id of arrived) updated.add(id);
              return updated;
            });
            for (const id of arrived) {
              window.setTimeout(() => {
                if (stop) return;
                setFresh((prev) => {
                  if (!prev.has(id)) return prev;
                  const updated = new Set(prev);
                  updated.delete(id);
                  return updated;
                });
              }, 700);
            }
          }
        }
        setEvents(next);
        setSavedAt(data.savedAt || null);
        setCapture(data.capture || "off");
        setAddon(data.addon || "");
        setStatus(syncText(api, data.savedAt || null, data.capture || "off"));
      } catch {
        if (!stop) setStatus("The ledger site is not running.");
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [api]);

  const canceled = useMemo(() => canceledPostIds(events), [events]);
  const names = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const ev of events) {
      const name = actorName(ev) || "Unknown";
      if (!seen.has(name)) {
        seen.add(name);
        list.push(name);
      }
    }
    return list;
  }, [events]);

  const character = who !== "all" && !names.includes(who) ? "all" : who;
  const rows = events.filter((ev) => {
    if (kind !== "all" && ev.kind !== kind) return false;
    if (character !== "all" && (actorName(ev) || "Unknown") !== character) return false;
    return true;
  });

  const summary = rows.reduce(
    (totals, ev) => {
      if (ev.kind === "post") totals.posted += ev.copper;
      else if (ev.kind === "buy") totals.bought += ev.copper;
      else if (ev.kind === "sold") totals.sold += ev.copper;
      return totals;
    },
    { posted: 0, bought: 0, sold: 0 },
  );

  const linkKey = rows.map((ev) => ev.id).join("|");
  useEffect(() => {
    window.$WowheadPower?.refreshLinks();
  }, [linkKey]);

  return (
    <main>
      <header>
        <h1><span />AuctionAssistant</h1>
        <div>
          <div className="sync">{status}</div>
          {addon ? <div className="who">{addon}</div> : null}
        </div>
      </header>
      <Market />
      <section className="cards">
        <article className="card net"><div className="label">Net</div><div className="value"><Coins copper={summary.sold - summary.bought} /></div></article>
        <article className="card"><div className="label">Sold</div><div className="value"><Coins copper={summary.sold} /></div></article>
        <article className="card spent"><div className="label">Bought</div><div className="value"><Coins copper={summary.bought} /></div></article>
        <article className="card"><div className="label">Posted</div><div className="value"><Coins copper={summary.posted} /></div></article>
      </section>
      {names.length > 0 ? (
        <div className="filters">
          {["all", ...names].map((name) => (
            <button key={name} type="button" className={name === character ? "on" : ""} onClick={() => setWho(name)}>
              {name === "all" ? "Everyone" : name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="filters">
        {FILTERS.map((filter) => (
          <button key={filter.kind} type="button" className={filter.kind === kind ? "on" : ""} onClick={() => setKind(filter.kind)}>
            {filter.label}
          </button>
        ))}
      </div>
      <section className="panel">
        <table>
          <thead>
            <tr><th>When</th><th>Action</th><th>Item</th><th className="num">Qty</th><th className="num">Price</th></tr>
          </thead>
          <tbody>
            {rows.map((ev) => (
              <Row key={ev.id} ev={ev} api={api} now={now} canceled={canceled.has(ev.id)} fresh={fresh.has(ev.id)} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty">No auctions yet. Accept a buyout in game and it is sent here as a barcode.</div> : null}
      </section>
    </main>
  );
}

function Row({ ev, api, now, canceled, fresh }: { ev: AuctionEvent; api: string; now: number; canceled: boolean; fresh: boolean }) {
  const src = iconSrc(ev, api);
  const ends = canceled ? 0 : postEnds(ev, new Set(canceled ? [ev.id] : []));
  const itemId = Number(ev.itemId);
  const body = (
    <>
      {src ? <img className="icon" alt="" width={36} height={36} src={src} onError={(event) => event.currentTarget.remove()} /> : null}
      <div>
        {ev.name}
      </div>
    </>
  );
  return (
    <tr className={fresh ? "arrive" : undefined}>
      <td>{whenLabel(ev.t)}</td>
      <td><span className={`pill ${ev.kind}`}>{actionName(ev.kind)}</span></td>
      <td>
        <div className="line">
          {itemId > 0 ? (
            <a className="item" target="_blank" rel="noreferrer" href={`https://www.wowhead.com/tbc/item=${itemId}`} data-wowhead={`item=${itemId}&domain=tbc`}>
              {body}
            </a>
          ) : (
            <div className="item">{body}</div>
          )}
          {canceled ? <div className="left out">Canceled</div> : null}
          {!canceled && ends > 0 ? (
            <div className={ends <= now ? "left out" : "left"}>{formatLeft(ends, now)}</div>
          ) : null}
        </div>
      </td>
      <td className="num">{ev.count ? ev.count : ""}</td>
      <td className="num"><Coins copper={ev.copper} /></td>
    </tr>
  );
}
