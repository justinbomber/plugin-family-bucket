
var scroll = (() => {
  function revealContent() {
    if ($('#_html')) $('#_html').style.visibility = 'visible'
    if ($('#_markdown')) $('#_markdown').style.visibility = 'visible'
    var fallback = document.querySelector('.md-fallback')
    if (fallback) fallback.style.visibility = 'visible'
    if ($('#_toc') && !state.raw) $('#_toc').style.visibility = 'visible'
  }

  window.__mdRevealContent = revealContent

  function waitImages() {
    return new Promise((resolve) => {
      var images = Array.from(document.querySelectorAll('img'))
      if (!images.length) {
        resolve()
        return
      }
      var loaded = 0
      function tick() {
        if (++loaded >= images.length) resolve()
      }
      images.forEach((img) => {
        if (img.complete) {
          tick()
        }
        else {
          img.addEventListener('load', tick, {once: true})
          img.addEventListener('error', tick, {once: true})
        }
      })
      setTimeout(resolve, 500)
    })
  }

  function onload (done) {
    Promise.race([
      Promise.all([
        new Promise((resolve) => {
          var timeout = setInterval(() => {
            if (document.styleSheets.length) {
              clearInterval(timeout)
              resolve()
            }
          }, 0)
          setTimeout(function () {
            clearInterval(timeout)
            resolve()
          }, 800)
        }),
        waitImages(),
        new Promise((resolve) => {
          var code = Array.from(document.querySelectorAll('code[class^=language-]'))
          if (!state.content.syntax || !code.length) {
            resolve()
          }
          else {
            setTimeout(() => resolve(), 40)
          }
        }),
        new Promise((resolve) => {
          var diagrams = Array.from(document.querySelectorAll('code.mermaid'))
          if (!state.content.mermaid || !diagrams.length) {
            resolve()
          }
          else {
            var waited = 0
            var timeout = setInterval(() => {
              waited += 50
              var svg = Array.from(document.querySelectorAll('code.mermaid svg'))
              if (diagrams.length === svg.length || waited >= 3000) {
                clearInterval(timeout)
                resolve()
              }
            }, 50)
          }
        }),
        new Promise((resolve) => {
          if (!state.content.mathjax) {
            resolve()
          }
          else {
            var waited = 0
            var timeout = setInterval(() => {
              waited += 50
              if (mj.loaded || waited >= 3000) {
                clearInterval(timeout)
                resolve()
              }
            }, 50)
          }
        })
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]).then(done)
  }
  function listen (container, done) {
    var listener = /html|body/i.test(container.nodeName) ? window : container
    var timeout = null
    listener.addEventListener('scroll', () => {
      clearTimeout(timeout)
      timeout = setTimeout(done, 100)
    })
  }
  function get (container, prefix, offset) {
    var key = prefix + location.origin + location.pathname
    if (offset) {
      container.scrollTop = offset
      return
    }
    try {
      container.scrollTop = parseInt(localStorage.getItem(key))
    }
    catch (err) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
          chrome.storage.local.get(key, (res) => {
            container.scrollTop = parseInt(res[key])
          })
        }
      } catch (_) {
        /* extension context gone */
      }
    }
  }
  function set (container, prefix) {
    var key = prefix + location.origin + location.pathname
    listen(container, () => {
      try {
        localStorage.setItem(key, container.scrollTop)
      }
      catch (err) {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.set({[key]: container.scrollTop})
          }
        } catch (_) {
          /* extension context gone */
        }
      }
    })
  }
  var listening = false
  return (update) => {
    if ($('#_toc') && state.raw) $('#_toc').style.visibility = 'hidden'
    setTimeout(revealContent, 0)
    onload(() => {
      var container = ((html = $('html')) => (
        html.scrollTop = 1,
        html.scrollTop ? (html.scrollTop = 0, html) : $('body')
      ))()

      if (!update && location.hash && document.getElementById(location.hash.slice(1))) {
        get(container, 'md-', document.getElementById(location.hash.slice(1)).offsetTop)
      }
      else {
        get(container, 'md-')
      }

      if (state.content.toc) {
        setTimeout(() => get($('#_toc'), 'md-toc-'), 10)
      }

      if (!listening) {
        listening = true
        set(container, 'md-')
        if (state.content.toc) {
          setTimeout(() => set($('#_toc'), 'md-toc-'), 10)
        }
      }

      revealContent()
    })
  }
})()
