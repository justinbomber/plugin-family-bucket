
md.messages = ({storage, compilers, mathjax, xhr, webrequest, icon}) => {

  var defaults = storage.defaults
  var state = storage.state
  var set = storage.set

  function popupPayload(pending) {
    var compilerKeys = Object.keys(compilers)
    var id = (state.compiler && compilers[state.compiler])
      ? state.compiler
      : compilerKeys[0]
    var entry = id && compilers[id]
    var options = entry
      ? (state[id] || entry.defaults || {})
      : {}
    var description = entry ? entry.description : {}
    var settingsTheme = (state.settings && state.settings.theme)
      || (defaults.settings && defaults.settings.theme)
      || 'light'
    return Object.assign({}, state, {
      pending: Boolean(pending),
      compiler: id || defaults.compiler,
      options: options,
      description: description,
      compilers: compilerKeys,
      themes: state.themes || defaults.themes,
      content: state.content || defaults.content,
      theme: state.theme || defaults.theme,
      settings: {theme: settingsTheme},
    })
  }

  return (req, sender, sendResponse) => {
    if (req && typeof req.type === 'string' && req.type.startsWith('suite:')) {
      return false;
    }

    // content
    if (req.message === 'markdown') {
      function compileAndRespond() {
        if (globalThis.__mdMarkdownSuite && !globalThis.__mdMarkdownSuite.isEnabled()) {
          sendResponse({message: 'html', html: '', error: 'disabled'})
          return
        }
        try {
          var markdown = req.markdown
          var contentOpts = state.content || defaults.content || {}
          var compilerId = (req.compiler && compilers[req.compiler])
            ? req.compiler
            : state.compiler
          var compiler = compilers[compilerId]
          if (!compiler) {
            sendResponse({message: 'html', html: '', error: 'no-compiler'})
            return
          }

          if (contentOpts.mathjax) {
            var jax = mathjax()
            markdown = jax.tokenize(markdown)
          }

          var html = compiler.compile(markdown)

          if (contentOpts.mathjax) {
            html = jax.detokenize(html)
          }

          sendResponse({message: 'html', html})
        } catch (err) {
          console.error('[markdown-viewer] compile error:', err)
          sendResponse({message: 'html', html: '', error: String(err && err.message || err)})
        }
      }

      if (storage.ready) {
        compileAndRespond()
        return true
      }

      var waited = 0
      var waitReady = setInterval(function () {
        waited += 25
        if (!storage.ready && waited < 3000) return
        clearInterval(waitReady)
        if (!storage.ready) {
          sendResponse({message: 'html', html: '', error: 'not-ready'})
          return
        }
        compileAndRespond()
      }, 25)
      return true
    }
    else if (req.message === 'autoreload') {
      xhr.get(req.location, (err, body) => {
        sendResponse({err, body})
      })
    }
    else if (req.message === 'prism') {
      chrome.scripting.executeScript({
        target: {tabId: sender.tab.id},
        files: [
          `plugins/markdown-viewer/vendor/prism/prism-${req.language}.min.js`,
        ],
        injectImmediately: true
      }, sendResponse)
    }
    else if (req.message === 'mathjax') {
      chrome.scripting.executeScript({
        target: {tabId: sender.tab.id},
        files: [
          `plugins/markdown-viewer/vendor/mathjax/extensions/${req.extension}.js`,
        ],
        injectImmediately: true
      }, sendResponse)
    }

    // popup
    else if (req.message === 'popup') {
      if (!storage.ready) {
        sendResponse(popupPayload(true))
      }
      else {
        var compilerKeys = Object.keys(compilers)
        var id = (state.compiler && compilers[state.compiler])
          ? state.compiler
          : compilerKeys[0]
        if (!id || !compilers[id]) {
          sendResponse(popupPayload(false))
        }
        else {
          sendResponse(popupPayload(false))
        }
      }
    }
    else if (req.message === 'popup.theme') {
      set({theme: req.theme})
      notifyContent({message: 'theme', theme: req.theme})
      sendResponse()
    }
    else if (req.message === 'popup.raw') {
      set({raw: req.raw})
      notifyContent({message: 'raw', raw: req.raw})
      sendResponse()
    }
    else if (req.message === 'popup.themes') {
      set({themes: req.themes})
      notifyContent({message: 'themes', themes: req.themes})
      sendResponse()
    }
    else if (req.message === 'popup.defaults') {
      var options = Object.assign({}, defaults)
      options.origins = state.origins
      set(options)
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.name') {
      set({compiler: req.compiler})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.options') {
      set({[req.compiler]: req.options})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.content') {
      set({content: req.content})
      notifyContent({message: 'reload'})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'popup.advanced') {
      if (globalThis.__mdMarkdownSuite) {
        var optionsBase = chrome.runtime.getURL('src/options/options.html')
        chrome.tabs.create({
          url: optionsBase + '?plugin=markdown-viewer',
        })
      } else if (/Firefox/.test(navigator.userAgent)) {
        chrome.management.getSelf((extension) => {
          chrome.tabs.create({url: extension.optionsUrl})
        })
      } else {
        chrome.runtime.openOptionsPage()
      }
      sendResponse()
    }

    // origins view
    else if (req.message === 'options.origins') {
      sendResponse({
        origins: state.origins,
        match: state.match,
      })
    }
    // origins options
    else if (req.message === 'origin.add') {
      state.origins[req.origin] = {
        header: true,
        path: true,
        match: defaults.match,
      }
      set({origins: state.origins})
      sendResponse()
    }
    else if (req.message === 'origin.remove') {
      delete state.origins[req.origin]
      set({origins: state.origins})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'origin.update') {
      state.origins[req.origin] = req.options
      set({origins: state.origins})
      webrequest()
      sendResponse()
    }

    // settings view
    else if (req.message === 'options.settings') {
      sendResponse(state.settings)
    }
    // settings options
    else if (req.message === 'options.icon') {
      set({settings: req.settings})
      icon()
      sendResponse()
    }
    else if (req.message === 'options.theme') {
      set({settings: req.settings})
      sendResponse()
    }
    else if (req.message === 'custom.get') {
      sendResponse(state.custom)
    }
    else if (req.message === 'custom.set') {
      set({custom: req.custom}).then(sendResponse).catch((err) => {
        if (/QUOTA_BYTES_PER_ITEM quota exceeded/.test(err.message)) {
          sendResponse({error: 'Minified theme exceeded 8KB in size!'})
        }
      })
    }
    else {
      return false
    }

    return true
  }

  function notifyContent (req, res) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, req, res)
    })
  }
}
