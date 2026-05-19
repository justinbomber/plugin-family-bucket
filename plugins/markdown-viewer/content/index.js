
window.__mdViewerMounting = true

var $ = document.querySelector.bind(document)

var boot = typeof args !== 'undefined' ? args : {}

var state = {
  theme: boot.theme || 'github',
  raw: !!boot.raw,
  themes: boot.themes || {width: 'auto'},
  content: boot.content || {syntax: true},
  compiler: boot.compiler || 'markdown-it',
  custom: boot.custom || {theme: '', color: 'auto'},
  icon: boot.icon || 'default',
  html: '',
  markdown: '',
  toc: '',
  reload: {
    interval: null,
    ms: 1000,
    md: false,
  },
  _themes: {
    'github': 'light',
    'github-dark': 'dark',
    'almond': 'light',
    // 'air': 'light',
    'awsm': 'light',
    'axist': 'light',
    'bamboo': 'auto',
    'bullframe': 'light',
    'holiday': 'auto',
    'kacit': 'light',
    'latex': 'light',
    'marx': 'light',
    'mini': 'light',
    'modest': 'light',
    'new': 'auto',
    'no-class': 'auto',
    'pico': 'auto',
    'retro': 'dark',
    'sakura': 'light',
    'sakura-vader': 'dark',
    'semantic': 'light',
    'simple': 'auto',
    // 'splendor': 'light',
    'style-sans': 'light',
    'style-serif': 'light',
    'stylize': 'light',
    'superstylin': 'auto',
    'tacit': 'light',
    'vanilla': 'auto',
    'water': 'light',
    'water-dark': 'dark',
    'writ': 'light',
    'custom': 'auto',
  }
}

function isExtensionRuntimeAlive() {
  try {
    return Boolean(chrome && chrome.runtime && chrome.runtime.id)
  } catch (_) {
    return false
  }
}

function isContextInvalidated(msg) {
  return /Extension context invalidated/i.test(String(msg || ''))
}

function runtimeLastError() {
  try {
    return chrome.runtime.lastError || null
  } catch (err) {
    return err
  }
}

function extensionUrl(path) {
  try {
    if (!isExtensionRuntimeAlive()) return ''
    return chrome.runtime.getURL(path)
  } catch (_) {
    return ''
  }
}

function scheduleReveal() {
  var reveal = window.__mdRevealContent
  if (typeof reveal === 'function') {
    setTimeout(reveal, 0)
  }
}

function mergeSettingsObject(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return
  Object.keys(patch).forEach(function (key) {
    target[key] = patch[key]
  })
}

function sendMarkdownMessage(payload, callback) {
  if (!isExtensionRuntimeAlive()) {
    callback(null, 'Extension context invalidated')
    return
  }
  var done = false
  function finish(res, errMsg) {
    if (done) return
    done = true
    callback(res, errMsg)
  }
  try {
    var pending = chrome.runtime.sendMessage(payload, function (res) {
      var lastErr = runtimeLastError()
      if (lastErr) {
        finish(null, lastErr.message || String(lastErr))
        return
      }
      finish(res, null)
    })
    if (pending && typeof pending.then === 'function') {
      pending.then(function (res) {
        finish(res, null)
      }).catch(function (err) {
        finish(null, err && err.message || String(err))
      })
    }
  } catch (err) {
    finish(null, err && err.message || String(err))
  }
}

try {
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (
    req &&
    req.type === 'suite:pluginRuntime' &&
    req.pluginId === 'markdown-viewer'
  ) {
    if (req.enabled === false) {
      location.reload()
      return false
    }
    if (req.settings && typeof req.settings === 'object') {
      var settingsKey = JSON.stringify(req.settings)
      if (settingsKey !== state._suiteSettingsKey) {
        state._suiteSettingsKey = settingsKey
        applySuiteSettings(req.settings)
        if (state.markdown && isExtensionRuntimeAlive()) {
          render(state.markdown)
        } else {
          m.redraw()
          scheduleReveal()
        }
      }
    }
    return false
  }

  if (req.message === 'reload') {
    location.reload(true)
  }
  else if (req.message === 'theme') {
    state.theme = req.theme
    m.redraw()
    scheduleReveal()
  }
  else if (req.message === 'themes') {
    state.themes = req.themes
    m.redraw()
    scheduleReveal()
  }
  else if (req.message === 'raw') {
    state.raw = req.raw
    state.reload.md = true
    m.redraw()
    scheduleReveal()
  }
  else if (req.message === 'autoreload') {
    clearInterval(state.reload.interval)
  }
  })
} catch (_) {
  /* 擴充已重新載入，舊 content script 無法再註冊 listener */
}

var oncreate = {
  html: () => {
    update()
  }
}

var onupdate = {
  html: () => {
    scheduleReveal()
    if (state.reload.md) {
      state.reload.md = false
      update(true)
    }
  },
  theme: () => {
    if (state.content.mermaid) {
      setTimeout(() => mmd.render(), 0)
    }
  }
}

var update = (update) => {
  scroll(update)

  if (state.content.syntax) {
    setTimeout(() => Prism.highlightAll(), 20)
  }

  if (state.content.mermaid) {
    setTimeout(() => mmd.render(), 40)
  }

  if (state.content.mathjax) {
    setTimeout(() => mj.render(), 60)
  }
}

var renderAttempts = 0
var maxRenderAttempts = 12

var render = (md, attempt) => {
  if (attempt === undefined) {
    renderAttempts = 0
    attempt = 0
  }
  state.markdown = md
  sendMarkdownMessage({
    message: 'markdown',
    compiler: state.compiler,
    markdown: frontmatter(state.markdown)
  }, function (res, errMsg) {
    if (errMsg) {
      if (isContextInvalidated(errMsg)) {
        showRawFallback(md)
        return
      }
      if (attempt < maxRenderAttempts) {
        setTimeout(function () { render(md, attempt + 1) }, 80 + attempt * 40)
        return
      }
      showRawFallback(md)
      return
    }
    if (!res || res.error || !res.html) {
      var errCode = res && res.error ? String(res.error) : 'empty-response'
      if ((errCode === 'not-ready' || errCode === 'no-compiler' || errCode === 'empty-response') && attempt < maxRenderAttempts) {
        setTimeout(function () { render(md, attempt + 1) }, 80 + attempt * 40)
        return
      }
      console.info('[markdown-viewer] showing raw fallback:', errCode)
      showRawFallback(md)
      return
    }
    state.html = res.html
    if (state.content.emoji) {
      state.html = emojinator(state.html)
    }
    if (state.content.mermaid) {
      state.html = state.html.replace(
        /<code class="language-(?:mermaid|mmd)">/gi,
        '<code class="mermaid">'
      )
    }
    if (state.content.toc) {
      state.toc = toc.render(state.html)
    }
    state.html = anchors(state.html)
    m.redraw()
    scheduleReveal()
  })
}

function applySuiteSettings(settings) {
  if (settings.theme) state.theme = settings.theme
  if (typeof settings.raw === 'boolean') state.raw = settings.raw
  if (settings.themes) mergeSettingsObject(state.themes, settings.themes)
  if (settings.content) mergeSettingsObject(state.content, settings.content)
  if (settings.compiler) state.compiler = settings.compiler
  if (settings.custom) mergeSettingsObject(state.custom, settings.custom)
  if (settings.settings && settings.settings.icon) state.icon = settings.settings.icon
}

function showRawFallback (sourceMd) {
  state.markdown = sourceMd
  state.html = '<pre class="md-fallback">' + _escape(sourceMd) + '</pre>'
  var pre = $('pre')
  if (pre) pre.style.display = 'none'
  m.redraw()
  scheduleReveal()
}

function mount () {
  if (window.__mdViewerMounted) return
  window.__mdViewerMounted = true
  window.__mdViewerMounting = false
  var pre = $('pre')
  var md = pre ? pre.innerText : (document.body.innerText || '')
  if (pre) pre.style.display = 'none'
  favicon()

  m.mount($('body'), {
    oninit: () => {
      if (!isExtensionRuntimeAlive()) {
        showRawFallback(md)
        return
      }
      render(md)
    },
    view: () => {
      var dom = []

      if (state.html) {
        state._themes.custom = state.custom.color

        var color =
          state._themes[state.theme] === 'dark' ||
          (state._themes[state.theme] === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          ? 'dark' : 'light'

        $('body').classList.remove(...Array.from($('body').classList).filter((name) => /^_theme|_color/.test(name)))
        dom.push(m('link#_theme', {
          onupdate: onupdate.theme,
          rel: 'stylesheet', type: 'text/css',
          href: state.theme !== 'custom' ? extensionUrl(`plugins/markdown-viewer/themes/${state.theme}.css`) : '',
        }))
        $('body').classList.add(`_theme-${state.theme}`, `_color-${color}`)

        if (state.content.syntax) {
          dom.push(m('link#_prism', {
            rel: 'stylesheet', type: 'text/css',
            href: extensionUrl(`plugins/markdown-viewer/vendor/${color === 'dark' ? 'prism-okaidia' : 'prism'}.min.css`),
          }))
        }

        var theme =
          (/github(-dark)?/.test(state.theme) ? 'markdown-body' : 'markdown-theme') +
          (state.themes.width !== 'auto' ? ` _width-${state.themes.width}` : '')

        if (state.raw) {
          if (state.content.syntax) {
            dom.push(m('#_markdown', {oncreate: oncreate.html, onupdate: onupdate.html, class: theme},
              m.trust(`<pre class="language-md"><code class="language-md">${_escape(state.markdown)}</code></pre>`)
            ))
          }
          else {
            dom.push(m('pre#_markdown', {oncreate: oncreate.html, onupdate: onupdate.html}, state.markdown))
          }
        }
        else {
          dom.push(m('#_html', {oncreate: oncreate.html, onupdate: onupdate.html, class: theme},
            m.trust(state.html)
          ))
        }

        if (state.content.toc) {
          dom.push(m('#_toc.tex2jax-ignore', m.trust(state.toc)))
          state.raw ? $('body').classList.remove('_toc-left') : $('body').classList.add('_toc-left')
        }

        if (state.theme === 'custom') {
          dom.push(m('style', {type: 'text/css'}, state.custom.theme))
        }
      }

      return dom
    }
  })
}

var anchors = (html) =>
  html.replace(/(<h[1-6] id="(.*?)">)/g, (header, _, id) =>
    header +
    '<a class="anchor" name="' + id + '" href="#' + id + '">' +
    '<span class="octicon octicon-link"></span></a>'
  )

var toc = (() => {
  var walk = (regex, string, group, result = [], match = regex.exec(string)) =>
    !match ? result : walk(regex, string, group, result.concat(!group ? match[1] :
      group.reduce((all, name, index) => (all[name] = match[index + 1], all), {})))
  return {
    render: (html) =>
      walk(
        /<h([1-6]) id="(.*?)">(.*?)<\/h[1-6]>/gs,
        html,
        ['level', 'id', 'title']
      )
      .reduce((toc, {id, title, level}) => toc +=
        '<div class="_ul">'.repeat(level) +
        '<a href="#' + id + '">' + title.replace(/<a[^>]+>/g, '').replace(/<\/a>/g, '') + '</a>' +
        '</div>'.repeat(level)
      , '')
  }
})()

var frontmatter = (md) => {
  if (/^-{3}[\s\S]+?-{3}/.test(md)) {
    var [, yaml] = /^-{3}([\s\S]+?)-{3}/.exec(md)
    var title = /title: (?:'|")*(.*)(?:'|")*/.exec(yaml)
    title && (document.title = title[1])
  }
  else if (/^\+{3}[\s\S]+?\+{3}/.test(md)) {
    var [, toml] = /^\+{3}([\s\S]+?)\+{3}/.exec(md)
    var title = /title = (?:'|"|`)*(.*)(?:'|"|`)*/.exec(toml)
    title && (document.title = title[1])
  }
  return md.replace(/^(?:-|\+){3}[\s\S]+?(?:-|\+){3}/, '')
}

var favicon = () => {
  var href = extensionUrl(`plugins/markdown-viewer/icons/${state.icon}/16x16.png`)
  if (!href) return
  var favicon = document.createElement('link')
  favicon.rel = 'icon'
  favicon.href = href
  $('head').appendChild(favicon)
}

var _escape = (str) =>
  str.replace(/[&<>]/g, (tag) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  }[tag] || tag))

function tryMount() {
  if (window.__mdViewerMounted) return
  window.__mdViewerMounting = true
  mount()
}

if (document.readyState === 'complete') {
  tryMount()
}
else {
  window.__mdViewerMounting = true
  var timeout = setInterval(() => {
    if (document.readyState === 'complete') {
      clearInterval(timeout)
      tryMount()
    }
  }, 0)
}
