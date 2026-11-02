export interface AuctionEvent {
  id: string;
  t: number;
  kind: string;
  itemId: number;
  count: number;
  copper: number;
  character: string;
  realm: string;
  name: string;
  duration?: number;
  icon?: string;
}

export interface LedgerPayload {
  events?: AuctionEvent[];
  savedAt?: string | null;
  capture?: string;
  addon?: string;
}

export type KindFilter = "all" | "sold" | "buy" | "post" | "cancel";

export function ledgerApi(): string {
  return String(window.LEDGER_API || "").replace(/\/$/, "");
}

export function actorName(ev: Pick<AuctionEvent, "id" | "character">): string {
  const named = (ev.character || "").trim();
  if (named) return named;
  const tag = String(ev.id || "").split("-").slice(2).join("-").trim();
  return /^[\w]+$/.test(tag) ? tag : "";
}

export function listingKey(ev: AuctionEvent): string {
  const item = Number(ev.itemId) > 0 ? String(ev.itemId) : ev.name || "";
  return [item, ev.count || 0, ev.copper || 0, ev.name || ""].join("|");
}

export function canceledPostIds(events: AuctionEvent[]): Map<string, string> {
  const open: { key: string; id: string }[] = [];
  const dead = new Map<string, string>();
  const ordered = [...events].sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
  for (const ev of ordered) {
    const key = listingKey(ev);
    if (ev.kind === "post") open.push({ key, id: ev.id });
    else if (ev.kind === "cancel") {
      const index = open.findIndex((row) => row.key === key);
      if (index >= 0) {
        dead.set(open[index].id, actorName(ev));
        open.splice(index, 1);
      }
    }
  }
  return dead;
}

export function actionName(kind: string): string {
  if (kind === "post") return "Post";
  if (kind === "buy") return "Buy";
  if (kind === "sold") return "Sold";
  if (kind === "cancel") return "Cancel";
  return kind || "";
}

export function postEnds(ev: AuctionEvent, canceled: { has(id: string): boolean }): number {
  if (ev.kind !== "post" || canceled.has(ev.id)) return 0;
  let seconds = Number(ev.duration) || 0;
  if (seconds === 1) seconds = 12 * 3600;
  else if (seconds === 2) seconds = 24 * 3600;
  else if (seconds === 3) seconds = 48 * 3600;
  if (seconds <= 0 || !ev.t) return 0;
  return Number(ev.t) + seconds;
}

export function formatLeft(end: number, now: number): string {
  const left = end - now;
  if (left <= 0) return "Expired";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

export function whenLabel(t: number): string {
  if (!t) return "";
  return new Date(t * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Mail "sold" rows may only have a name; reuse an id from a post/buy of the same item. */
export function resolveItemId(ev: AuctionEvent, events: AuctionEvent[]): number {
  const own = Number(ev.itemId);
  if (own > 0) return own;
  const needle = (ev.name || "").trim().toLowerCase();
  if (!needle) return 0;
  for (const other of events) {
    const id = Number(other.itemId);
    if (id > 0 && (other.name || "").trim().toLowerCase() === needle) return id;
  }
  return 0;
}

export function iconSrc(ev: AuctionEvent, api: string, itemId = Number(ev.itemId)): string {
  if (ev.icon && /^[a-z0-9_]+$/.test(ev.icon)) {
    return `https://wow.zamimg.com/images/wow/icons/large/${ev.icon}.jpg`;
  }
  const id = Number(itemId);
  if (!id) return "";
  if (api) return `${api}/api/icon/${id}`;
  return `/icon/${id}`;
}
