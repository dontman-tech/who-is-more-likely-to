import { useCallback, useEffect, useState } from "react";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";

/**
 * Hash-based routing.
 *
 * A hash route needs no server-side rewrite rules, so the built `dist/` works
 * unchanged on Vercel, GitHub Pages, or any static host. `vercel.json` also
 * rewrites deep links, so a shared `/room/ABCD` URL resolves too.
 */
type Route = { name: "home" } | { name: "room"; code: string };

function parseRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "");
  const deep = path.match(/^\/room\/([A-Za-z0-9]{4,8})$/);
  if (deep) return { name: "room", code: deep[1].toUpperCase() };

  const hash = window.location.hash.replace(/^#\/?/, "");
  const fromHash = hash.match(/^room\/([A-Za-z0-9]{4,8})$/i);
  if (fromHash) return { name: "room", code: fromHash[1].toUpperCase() };

  return { name: "home" };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);

  useEffect(() => {
    const sync = () => setRoute(parseRoute());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    // Setting the hash fires `hashchange`; use pushState for real paths so a
    // deep link can be copied straight out of the address bar.
    window.history.pushState({}, "", to);
    setRoute(parseRoute());
  }, []);

  if (route.name === "room") {
    return <Room code={route.code} navigate={navigate} />;
  }
  return <Home navigate={navigate} />;
}
