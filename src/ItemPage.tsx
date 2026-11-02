import { useEffect, useState } from "react";
import { ItemView, Market, type MarketItem } from "./Market";
import { followLink, homePath } from "./route";

export function ItemPage({ itemId }: { itemId: number }) {
  const [item, setItem] = useState<MarketItem | null>(null);
  const [note, setNote] = useState("Looking up that scan…");

  useEffect(() => {
    let stop = false;
    setItem(null);
    setNote("Looking up that scan…");
    fetch(`/api/market?id=${itemId}`, { cache: "no-store" })
      .then((res) => res.json() as Promise<{ item?: MarketItem | null }>)
      .then((data) => {
        if (stop) return;
        setItem(data.item || null);
        setNote(data.item ? "" : "No scan has this item yet.");
      })
      .catch(() => {
        if (!stop) setNote("The scan database could not be read.");
      });
    return () => {
      stop = true;
    };
  }, [itemId]);

  return (
    <main>
      <header>
        <h1>
          <a className="brand" href={homePath()} onClick={(event) => followLink(event, homePath())}>
            <span />AuctionAssistant
          </a>
        </h1>
      </header>
      <Market />
      {item ? <ItemView item={item} /> : <div className="who">{note}</div>}
    </main>
  );
}
