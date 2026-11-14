// js/install.js
// Install-as-app support (window.vlInstall). Loaded as a classic script from
// <head>, NOT as part of the js/app.js module: Chromium fires
// beforeinstallprompt when the page is installable and not yet installed,
// and that can happen before DOMContentLoaded — a deferred module would
// miss it. Safari and Firefox never fire it, so canPrompt() stays false
// there and the About dialog simply doesn't show the button.
// Android is left entirely to Chrome: it shows its own install banner
// there, which works well and which preventDefault() would suppress — so
// on Android the event is neither prevented nor kept.
// There is no service worker: installed still means online.
(function () {
  var deferred = null;
  function changed() {
    document.dispatchEvent(new Event("vl-install-change"));
  }
  window.addEventListener("beforeinstallprompt", function (e) {
    if (/Android/i.test(navigator.userAgent)) return;
    e.preventDefault();
    deferred = e;
    changed();
  });
  window.addEventListener("appinstalled", function () {
    deferred = null;
    changed();
  });
  window.vlInstall = {
    canPrompt: function () {
      return !!deferred;
    },
    // Resolves true if the user accepted. The event is single-use.
    prompt: async function () {
      if (!deferred) return false;
      var evt = deferred;
      deferred = null;
      changed();
      try {
        evt.prompt();
        var choice = await evt.userChoice;
        return !!choice && choice.outcome === "accepted";
      } catch (err) {
        return false;
      }
    },
    isStandalone: function () {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    },
  };
})();
