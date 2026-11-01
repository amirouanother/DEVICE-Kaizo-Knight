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
       are leaving, and the new route's bank (or its pristine seed) is loaded.

   Route-gated spell: the weird routes give Noelle SNOWGRAVE (spell id 10).
   That is applied as a migration to whatever save ends up live, so players who
   already banked progress still get it without losing anything else. */
(function () {
  const LIVE_KEY = "/_savedata/filech3_0";
  const BANK_PREFIX = "/_savedata/kaizo_bank_";
  const ACTIVE_ROUTE_KEY = "kaizo_active_route";
  const ROUTES = ["normal", "weird", "abandoned"];

  // Save layout (scr_saveprocess / scr_load, non-console branch), 3055 lines:
  //   spell[i][j] -> line 67 + 62*i + j  (1-based)
  const SAVE_LINES = 3055;
  const SPELL_BASE = 67;
  const SPELL_STRIDE = 62;
  const SPELL_SLOTS = 12;
  const NOELLE = 4;              // global.char index for Noelle
  const SNOWGRAVE = 10;          // scr_spellinfo case 10
  const WEIRD_ROUTES = ["weird", "abandoned"];

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

  /* Byte-exact helpers: the save is plain text, but player names can contain
     non-ASCII bytes, so we never round-trip through UTF-8. */
  function bytesToString(u8) {
    let out = "";
    for (let i = 0; i < u8.length; i++) out += String.fromCharCode(u8[i]);
    return out;
  }

  function stringToBytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  /* Give Noelle SNOWGRAVE on the weird routes, in the first free spell slot.
     Returns the original bytes when nothing needs changing. */
  function applyRouteSpells(route, contents) {
    if (WEIRD_ROUTES.indexOf(route) === -1) return contents;

    const text = bytesToString(contents);
    const sep = text.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
    const lines = text.split(sep);
    if (lines.length !== SAVE_LINES) return contents; // unknown layout, don't touch

    const first = SPELL_BASE + SPELL_STRIDE * NOELLE - 1;
    const slotLines = [];
    for (let j = 0; j < SPELL_SLOTS; j++) slotLines.push(first + j);

    const values = slotLines.map((idx) => parseInt(lines[idx], 10) || 0);
    if (values.indexOf(SNOWGRAVE) !== -1) return contents;

    const free = values.indexOf(0);
    if (free === -1) return contents; // no room, leave it alone

    const idx = slotLines[free];
    const hadSpace = /\s$/.test(lines[idx]);
    lines[idx] = String(SNOWGRAVE) + (hadSpace ? " " : "");

    return stringToBytes(lines.join(sep));
  }

  async function preloadRoute(route) {
    route = normalize(route);
    const db = await openDB();

    let previous = null;
    try { previous = localStorage.getItem(ACTIVE_ROUTE_KEY); } catch (e) { /* ignore */ }
    if (previous && ROUTES.indexOf(previous) === -1) previous = null;

    const live = await getFile(db, LIVE_KEY);

    let contents;
    let action;

    if (previous === route && live && live.contents) {
      // Returning to the route we were already playing: keep the live progress.
      contents = live.contents;
      action = "continue";
    } else {
      // Switching away: bank the progress of the route we are leaving.
      if (previous && live && live.contents) {
        await putFile(db, BANK_PREFIX + previous, live.contents);
      }

      // Switching to a route we have played before: restore its bank.
      const banked = await getFile(db, BANK_PREFIX + route);
      if (banked && banked.contents) {
        contents = banked.contents;
        action = "restore";
      } else {
        contents = await fetchSeed(route);
        action = "seed";
      }
    }

    const fixed = applyRouteSpells(route, contents);
    if (action !== "continue" || fixed !== contents) {
      await putFile(db, LIVE_KEY, fixed);
      if (action === "restore") await putFile(db, BANK_PREFIX + route, fixed);
    }
    if (action === "seed") {
      console.log("[kaizo] route=" + route + ", seeded save:", fixed.length, "bytes");
    }

    try { localStorage.setItem(ACTIVE_ROUTE_KEY, route); } catch (e) { /* ignore */ }
    window.__kaizoRoute = route;
    window.__kaizoPreloadAction = action;
    return route;
  }

  /* Used by the route menu's explicit "reset" control (if present). */
  window.__kaizoResetRoute = async function (route) {
    route = normalize(route);
    const db = await openDB();
    const bytes = applyRouteSpells(route, await fetchSeed(route));
    await putFile(db, LIVE_KEY, bytes);
    const bank = await getFile(db, BANK_PREFIX + route);
    if (bank) await putFile(db, BANK_PREFIX + route, bytes);
    try { localStorage.setItem(ACTIVE_ROUTE_KEY, route); } catch (e) { /* ignore */ }
    return route;
  };

  window.__kaizoPreloadRoute = preloadRoute;
})();