md.bootstrapMarkdownSuiteBackground = function () {
  if (globalThis.__mdMarkdownSuiteInit) return
  globalThis.__mdMarkdownSuiteInit = true

  var storage = md.storage(md);
  var injectRaw = md.inject({ storage });
  var inject = function (id) {
    if (storage.ready) {
      injectRaw(id);
      return;
    }
    var waitReady = setInterval(function () {
      if (!storage.ready) return;
      clearInterval(waitReady);
      injectRaw(id);
    }, 30);
  };
  var detectApi = md.detect({ storage, inject });
  var webrequest = md.webrequest({ storage });
  var mathjax = md.mathjax();
  var xhr = md.xhr();
  var icon = md.icon({ storage });

  var compilers = Object.keys(md.compilers).reduce(function (all, compiler) {
    all[compiler] = md.compilers[compiler]({ storage });
    return all;
  }, {});

  var messages = md.messages({
    storage,
    compilers,
    mathjax,
    xhr,
    webrequest,
    icon,
  });

  function suiteEnabled() {
    return !globalThis.__mdMarkdownSuite || globalThis.__mdMarkdownSuite.isEnabled();
  }

  function scanOpenTabs() {
    if (!suiteEnabled()) return;
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach(function (tab) {
        if (tab.id) detectApi.probeTab(tab.id);
      });
    });
  }

  function injectFromPageReady(req, sender, sendResponse) {
    if (!suiteEnabled()) {
      sendResponse({ ok: false, reason: 'disabled' })
      return
    }
    var tabId = sender.tab && sender.tab.id
    if (!tabId || !req.url) {
      sendResponse({ ok: false })
      return
    }
    if (md.detect.isFileMarkdownUrl(req.url) || detectApi.matches(req.header, req.url)) {
      inject(tabId)
      sendResponse({ ok: true, injected: true })
    } else {
      detectApi.probeTab(tabId)
      sendResponse({ ok: true, probed: true })
    }
  }

  chrome.tabs.onUpdated.addListener(function (id, info, tab) {
    if (!suiteEnabled()) return;
    detectApi.tab(id, info, tab);
  });

  chrome.runtime.onMessage.addListener(messages);

  chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
    if (req.message === 'md:pageReady') {
      if (storage.ready) {
        injectFromPageReady(req, sender, sendResponse)
      } else {
        var waitReady = setInterval(function () {
          if (!storage.ready) return
          clearInterval(waitReady)
          injectFromPageReady(req, sender, sendResponse)
        }, 30)
      }
      return true
    }
    if (req.message === 'md:rescanTabs') {
      if (!suiteEnabled()) {
        sendResponse({ ok: false })
        return true
      }
      scanOpenTabs()
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0]
        if (tab && tab.id && md.detect.isFileMarkdownUrl(tab.url || '')) {
          chrome.tabs.reload(tab.id)
        }
      })
      sendResponse({ ok: true })
      return true
    }
    return false
  })

  var readyPoll = setInterval(function () {
    if (!storage.ready) return;
    clearInterval(readyPoll);
    scanOpenTabs();
  }, 50);

  globalThis.__mdMarkdownScanTabs = scanOpenTabs;
  globalThis.__mdMarkdownReady = true;

  icon();
}
