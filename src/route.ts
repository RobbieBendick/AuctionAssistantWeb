import { useEffect, useState, type MouseEvent } from "react";

function basePath() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

export function homePath() {
  return `${basePath()}/`;
}

export function itemPath(itemId: number) {
  return `${basePath()}/item/${itemId}`;
}

export function itemIdFromPath(path: string) {
  const prefix = basePath();
  const rest = path.startsWith(`${prefix}/`) || path === prefix ? path.slice(prefix.length) || "/" : path;
  const match = /^\/item\/(\d+)\/?$/.exec(rest);
  return match ? Number(match[1]) : null;
}

export function go(path: string) {
  if (location.pathname === path) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function followLink(event: MouseEvent<HTMLAnchorElement>, path: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  go(path);
}

export function usePath() {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const sync = () => setPath(location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return path;
}
