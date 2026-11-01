/* Kaizo Knight web port — seeds the chosen route's save into the game's
   IndexedDB filesystem (/ _savedata) before the game starts.

   The game always reads and writes save slot 0 (`filech3_0`).  To keep the
   three routes independent *and* to stop wiping the player's progress every
   time the page loads, each route gets its own banked copy:

     /_savedata/filech3_0           the live slot the game reads/writes
     /_savedata/kaizo_bank_<route>  that route's banked progress

   On start:
     - if we are returning to the same route, the live save is kept as-is;
     - if we are switching routes, the live save is banked under the route we
       are leaving, and the new route's bank (or its pristine seed) is loaded. */
(function () {
  const LIVE_KEY = "/_savedata/filech3_0";
  const BANK_PREFIX = "/_savedata/kaizo_bank_";
  const ACTIVE_ROUTE_KEY = "kaizo_active_route";
  const ROUTES = ["normal", "weird", "abandoned"];

  function normalize(route) {
    if (ROUTES.indexOf(route) === -1) return "normal";
    return route;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("/_savedata");
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("FILE_DATA")) db.createObjectStore("FILE_DATA");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("indexedDB blocked"));
    });
  }

  function getFile(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("FILE_DATA", "readonly");
      const req = tx.objectStore("FILE_DATA").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function putFile(db, key, contents) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("FILE_DATA", "readwrite");
      tx.objectStore("FILE_DATA").put(
        { timestamp: new Date(), mode: 33206, contents: contents },
        key
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function fetchSeed(route) {
    const res = await fetch("save/filech3_0_" + route, { cache: "no-store" });
    if (!res.ok) throw new Error("save fetch failed: " + res.status + " for route " + route);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function preloadRoute(route) {
    route = normalize(route);
    const db = await openDB();

    let previous = null;
    try { previous = localStorage.getItem(ACTIVE_ROUTE_KEY); } catch (e) { /* ignore */ }
    if (previous && ROUTES.indexOf(previous) === -1) previous = null;

    const live = await getFile(db, LIVE_KEY);

    // Returning to the route we were already playing: keep the live progress.
    if (previous === route && live && live.contents) {
      try { localStorage.setItem(ACTIVE_ROUTE_KEY, route); } catch (e) { /* ignore */ }
      window.__kaizoRoute = route;
      window.__kaizoPreloadAction = "continue";
      return route;
    }

    // Switching away: bank the progress of the route we are leaving.
    if (previous && previous !== route && live && live.contents) {
      await putFile(db, BANK_PREFIX + previous, live.contents);
    }

    // Switching to a route we have played before: restore its bank.
    if (previous !== route) {
      const banked = await getFile(db, BANK_PREFIX + route);
      if (banked && banked.contents) {
        await putFile(db, LIVE_KEY, banked.contents);
        try { localStorage.setItem(ACTIVE_ROUTE_KEY, route); } catch (e) { /* ignore */ }
        window.__kaizoRoute = route;
        window.__kaizoPreloadAction = "restore";
        return route;
      }
    }

    // First time on this route: seed the pristine save.
    const bytes = await fetchSeed(route);
    await putFile(db, LIVE_KEY, bytes);
    try { localStorage.setItem(ACTIVE_ROUTE_KEY, route); } catch (e) { /* ignore */ }
    console.log("[kaizo] route=" + route + ", seeded save:", bytes.length, "bytes");
    window.__kaizoRoute = route;
    window.__kaizoPreloadAction = "seed";
    return route;
  }

  /* Used by the route menu's explicit "reset" control (if present). */
  window.__kaizoResetRoute = async function (route) {
    route = normalize(route);
    const db = await openDB();
    const bytes = await fetchSeed(route);
    await putFile(db, LIVE_KEY, bytes);
    const bank = await getFile(db, BANK_PREFIX + route);
    if (bank) {
      await putFile(db, BANK_PREFIX + route, bytes);
    }
    try { localStorage.setItem(ACTIVE_ROUTE_KEY, route); } catch (e) { /* ignore */ }
    return route;
  };

  window.__kaizoPreloadRoute = preloadRoute;
})();