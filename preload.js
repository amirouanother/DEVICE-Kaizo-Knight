/* Kaizo Knight web port - seeds the chosen route's save into the game's
   IndexedDB filesystem so the port boots with that route's save present.

   Route is chosen in-game via the route menu overlay: normal | weird | abandoned.
   Call window.__kaizoPreloadRoute(route) to fetch save/filech3_0_<route> and
   store it at IndexedDB key /_savedata/filech3_0 before the game starts. */
(function () {
  const SAVE_KEY = "/_savedata/filech3_0";
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

  function putFile(db, key, bytes) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("FILE_DATA", "readwrite");
      tx.objectStore("FILE_DATA").put(
        { timestamp: new Date(), mode: 33206, contents: bytes },
        key
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function preloadRoute(route) {
    route = normalize(route);
    const res = await fetch("save/filech3_0_" + route, { cache: "no-store" });
    if (!res.ok) throw new Error("save fetch failed: " + res.status + " for route " + route);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const db = await openDB();
    await putFile(db, SAVE_KEY, bytes);
    console.log("[kaizo] route=" + route + ", preloaded save:", bytes.length, "bytes");
    window.__kaizoRoute = route;
    return route;
  }

  window.__kaizoPreloadRoute = preloadRoute;
})();
