/* Registers the service worker (which reassembles the split game.unx and caches
   the asset manifest) and only then starts the runner, so the very first
   request for game.unx already goes through the worker. */
(function () {
  function loadGame() {
    return new Promise(function (resolve, reject) {
      if (window.__kaizoRunnerLoaded) return resolve();
      window.__kaizoRunnerLoaded = true;
      const script = document.createElement("script");
      script.src = "runner.js";
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("failed to load runner.js")); };
      document.head.appendChild(script);
    });
  }

  async function waitForControl(timeoutMs) {
    if (navigator.serviceWorker.controller) return true;
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (value) {
        if (done) return;
        done = true;
        navigator.serviceWorker.removeEventListener("controllerchange", onChange);
        resolve(value);
      };
      const onChange = function () { finish(true); };
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      setTimeout(function () { finish(!!navigator.serviceWorker.controller); }, timeoutMs);
    });
  }

  async function loadSW() {
    try {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      await waitForControl(4000);
    } catch (e) {
      console.error("[kaizo] service worker unavailable, loading runner directly", e);
    }
    await loadGame();
  }

  window.__kaizoStartRunner = loadSW;

  if ("serviceWorker" in navigator) {
    loadSW();
  } else {
    loadGame();
  }
})();
