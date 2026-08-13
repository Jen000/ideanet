import { useState, useEffect, useCallback } from "react";

// Minimal history-based router — clean URLs, real back/forward, deep links.
// Paths are app-relative (leading slash, no base); the base ("/ideanet/" in
// production, "/" in dev) is added/stripped here so components never see it.
const BASE = import.meta.env.BASE_URL || "/";
const baseNoSlash = BASE.replace(/\/$/, "");

const stripBase = (pathname) => {
  let p = pathname;
  if (baseNoSlash && p.startsWith(baseNoSlash)) p = p.slice(baseNoSlash.length);
  p = p.replace(/\/+$/, "");
  return p || "/";
};

export function useRoute() {
  const [path, setPath] = useState(() => stripBase(window.location.pathname));
  useEffect(() => {
    const onPop = () => setPath(stripBase(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = baseNoSlash + to; // `to` is app-relative and starts with "/"
    if (replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    setPath(stripBase(window.location.pathname));
  }, []);
  return { path, navigate };
}

// Map an app-relative path to a route descriptor. Unknown paths fall to landing.
export function parseRoute(path) {
  if (path === "/") return { name: "landing" };
  if (path === "/signin") return { name: "auth" };
  if (path === "/dashboard") return { name: "dashboard" };
  if (path === "/settings") return { name: "settings" };
  const net = path.match(/^\/net\/([^/]+)$/);
  if (net) return { name: "editor", id: decodeURIComponent(net[1]) };
  const view = path.match(/^\/view\/([^/]+)$/);
  if (view) return { name: "viewer", id: decodeURIComponent(view[1]) };
  return { name: "landing" };
}
