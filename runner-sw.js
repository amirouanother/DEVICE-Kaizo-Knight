/* Registers the service worker (which reassembles the split game.unx and caches
   the asset manifest) and only then starts the runner.

   A page that registers a service worker is NOT controlled by it until the next
   navigation. If we are not yet controlled (first-ever load), reload once so the
   SW takes over; the chosen route is preserved in sessionStorage by
   game.html's __kaizoStartGame. After reload the page is controlled, runner.js
   loads, and its game.unx fetch is reassembled by sw.js. */
(function () {
  function loadGame() {
    if (window.__kaizoRunnerLoaded) return;
    window.__kaizoRunnerLoaded = true;
    const script = document.createElement("script");
    script.src = "runner.js";
    script.async = true;
    document.head.appendChild(script);
  }

  async function loadSW() {
    try {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;

      if (navigator.serviceWorker.controller) {
        // Page is controlled (reload or repeat visit) — start the runner.
        loadGame();
      } else {
        // First load: SW registered but not yet controlling this page.
        // Reload so the SW takes over; the route survives in sessionStorage.
        location.reload();
      }
    } catch (e) {
      console.error("[kaizo] service worker unavailable, loading runner directly", e);
      loadGame();
    }
  }

  window.__kaizoStartRunner = loadSW;

  if ("serviceWorker" in navigator) {
    loadSW();
  } else {
    loadGame();
  }
})();
