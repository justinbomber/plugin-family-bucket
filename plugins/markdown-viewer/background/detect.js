
md.detect = ({storage: {state}, inject}) => {

  var onwakeup = true

  var ff = (id, info, done) => {
    if (chrome.runtime.getBrowserInfo === undefined) {
      // chrome
      done('load')
    }
    else {
      var manifest = chrome.runtime.getManifest()
      if (manifest.browser_specific_settings && manifest.browser_specific_settings.gecko) {
        if (!info.url) {
          done('noop')
        }
        else {
          chrome.tabs.sendMessage(id, {message: 'ping'})
            .then(() => done('noop'))
            .catch(() => done('load'))
        }
      }
      else {
        done('load')
      }
    }
  }

  var probeTab = (id) => {
    ff(id, {}, (action) => {
      if (action === 'noop') {
        return
      }
      chrome.scripting.executeScript({
        target: {tabId: id},
        func: () =>
          JSON.stringify({
            url: window.location.href,
            header: document.contentType,
            loaded: !!(window.__mdViewerMounted || window.__mdViewerMounting),
          })
      }, (res) => {
          if (chrome.runtime.lastError) {
            // origin not allowed
            return
          }

          try {
            var win = JSON.parse(res[0].result)
            if (!win) {
              return
            }
          }
          catch (err) {
            // JSON parse error
            return
          }

          if (win.loaded) {
            // anchor
            return
          }

          if (detect(win.header, win.url)) {
            if (onwakeup && chrome.webRequest) {
              onwakeup = false
              chrome.tabs.reload(id)
            }
            else {
              inject(id)
            }
          }
        })
    })
  }

  var tab = (id, info, tab) => {
    if (info.status !== 'loading' && info.status !== 'complete') {
      return
    }
    probeTab(id)
  }

  var detect = (content, url) => {
    var location = new URL(url)

    var origin =
      state.origins[location.origin] ||

      state.origins[location.protocol + '//'] ||
      state.origins[location.protocol + '//' + location.hostname] ||
      state.origins[location.protocol + '//' + location.host] ||
      state.origins[location.protocol + '//*.' + location.hostname.replace(/^[^.]+\.(.*)/, '$1')] ||
      state.origins[location.protocol + '//*.' + location.host.replace(/^[^.]+\.(.*)/, '$1')] ||

      state.origins['*://' + location.hostname] ||
      state.origins['*://' + location.host] ||
      state.origins['*://*.' + location.hostname.replace(/^[^.]+\.(.*)/, '$1')] ||
      state.origins['*://*.' + location.host.replace(/^[^.]+\.(.*)/, '$1')] ||

      state.origins['*://*']

    var pathMatch = origin && origin.path && origin.match && new RegExp(origin.match).test(location.href)
    var mdContent = /\btext\/(?:(?:(?:x-)?markdown)|plain)\b/i.test(content)
    // file:// 等情境下 document.contentType 常為空字串，仍應依副檔名匹配
    var looseContent = !content || content === 'application/octet-stream'

    return (
      (origin && origin.header && origin.path && pathMatch && (mdContent || looseContent)) ||
      (origin && origin.header && !origin.path && (mdContent || looseContent)) ||
      (origin && origin.path && pathMatch && !origin.header)
        ? origin
        : undefined
    )
  }

  md.detect.isFileMarkdownUrl = (url) => {
    try {
      var location = new URL(url)
      if (!/^file:/i.test(location.protocol)) return false
      var ext = '\\.(?:markdown|mdown|mkdn|md|mkd|mdwn|mdtxt|mdtext|text)(?:#.*|\\?.*)?$'
      return new RegExp(ext, 'i').test(location.pathname + location.search + location.hash)
    } catch (err) {
      return false
    }
  }

  return {tab, probeTab, matches: detect}
}
