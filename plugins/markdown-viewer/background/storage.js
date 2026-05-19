/** 全家桶 manifest 合併後的必填 host_permissions，不可 chrome.permissions.remove */
const SUITE_REQUIRED_HOST_ORIGINS = new Set([
  "file:///*",
  "https://*.youtube.com/*",
]);

// chrome.storage.sync.clear()
// chrome.permissions.getAll((p) => chrome.permissions.remove({origins: p.origins}))

md.storage = ({compilers}) => {

  var defaults = md.storage.defaults(compilers)

  var state = {}
  var api = {defaults, state, set, ready: false}

  async function set (options, meta) {
    await chrome.storage.sync.set(options)
    Object.assign(state, options)
    if (meta && meta.skipSuitePersist) return
    if (
      typeof globalThis.__mdMarkdownSuite?.persistPatch === 'function' &&
      options &&
      typeof options === 'object'
    ) {
      try {
        await globalThis.__mdMarkdownSuite.persistPatch(options)
      } catch (_) {
        /* noop */
      }
    }
  }

  chrome.storage.sync.get((res) => {
    md.storage.bug(res)

    Object.assign(state, JSON.parse(JSON.stringify(
      !Object.keys(res).length ? defaults : res)))

    if (typeof globalThis.__mdMarkdownSuite?.getSettingsSeed === 'function') {
      var seed = globalThis.__mdMarkdownSuite.getSettingsSeed()
      if (seed && typeof seed === 'object') {
        if (seed.origins && typeof seed.origins === 'object') {
          state.origins = Object.assign({}, seed.origins, state.origins || {})
          if (!state.origins['file://'] && seed.origins['file://']) {
            state.origins['file://'] = seed.origins['file://']
          }
        }
        if (!state.compiler && seed.compiler) {
          state.compiler = seed.compiler
        }
        if (!state.theme && seed.theme) {
          state.theme = seed.theme
        }
      }
    }

    // in case of new providers from the compilers branch
    Object.keys(compilers).forEach((compiler) => {
      if (!state[compiler]) {
        state[compiler] = compilers[compiler].defaults
      }
    })

    md.storage.normalizeState(state, defaults, compilers)

    try {
      md.storage.migrations(state)
    } catch (err) {
      console.error('[markdown-viewer] storage migrations failed, resetting to defaults:', err)
      Object.assign(state, JSON.parse(JSON.stringify(defaults)))
      md.storage.normalizeState(state, defaults, compilers)
      md.storage.migrations(state)
    }

    md.storage.ensureOrigins(state, defaults)

    api.ready = true
    set(state, { skipSuitePersist: true })
  })

  return api
}

md.storage.normalizeState = (state, defaults, compilers) => {
  if (!state.content || typeof state.content !== 'object' || Array.isArray(state.content)) {
    state.content = JSON.parse(JSON.stringify(defaults.content))
  }
  if (!state.themes || typeof state.themes !== 'object' || Array.isArray(state.themes)) {
    state.themes = JSON.parse(JSON.stringify(defaults.themes))
  }
  if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) {
    state.settings = JSON.parse(JSON.stringify(defaults.settings))
  }
  if (!state.custom || typeof state.custom !== 'object' || Array.isArray(state.custom)) {
    state.custom = JSON.parse(JSON.stringify(defaults.custom))
  }
  if (!state.origins || typeof state.origins !== 'object' || Array.isArray(state.origins)) {
    state.origins = JSON.parse(JSON.stringify(defaults.origins))
  }
  Object.keys(compilers || {}).forEach((compiler) => {
    if (!state[compiler] || typeof state[compiler] !== 'object' || Array.isArray(state[compiler])) {
      state[compiler] = JSON.parse(JSON.stringify(
        compilers[compiler].defaults || defaults[compiler] || {},
      ))
    }
  })
}

md.storage.ensureOrigins = (state, defaults) => {
  if (!state.origins || typeof state.origins !== 'object') {
    state.origins = {}
  }
  Object.keys(defaults.origins || {}).forEach((key) => {
    if (!state.origins[key]) {
      state.origins[key] = JSON.parse(JSON.stringify(defaults.origins[key]))
    }
  })
}

md.storage.defaults = (compilers) => {
  var match = '\\.(?:markdown|mdown|mkdn|md|mkd|mdwn|mdtxt|mdtext|text)(?:#.*|\\?.*)?$'

  var defaults = {
    theme: 'github',
    compiler: 'markdown-it',
    raw: false,
    match,
    themes: {
      width: 'auto',
    },
    content: {
      autoreload: false,
      emoji: false,
      mathjax: false,
      mermaid: false,
      syntax: true,
      toc: false,
    },
    origins: {
      'file://': {
        header: true,
        path: true,
        match,
      }
    },
    settings: {
      icon: 'default',
      theme: 'light',
    },
    custom: {
      theme: '',
      color: 'auto',
    }
  }

  Object.keys(compilers).forEach((compiler) => {
    defaults[compiler] = compilers[compiler].defaults
  })

  return defaults
}

md.storage.bug = (res) => {
  // 僅清除「可選」來源權限；勿移除 manifest host_permissions（會拋錯）
  chrome.permissions.getAll((permissions) => {
    if (!permissions.origins?.length) return
    var origins = Object.keys(res.origins || {})
    var toRemove = permissions.origins.filter((origin) => {
      if (SUITE_REQUIRED_HOST_ORIGINS.has(origin)) return false
      return origins.indexOf(origin.slice(0, -2)) === -1
    })
    if (!toRemove.length) return
    chrome.permissions.remove({ origins: toRemove }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[markdown-viewer] storage.bug permissions.remove:",
          chrome.runtime.lastError.message,
        )
      }
    })
  })
}

md.storage.migrations = (state) => {
  // v3.6 -> v3.7
  if (typeof state.origins['file://'] === 'object') {
    state.origins['file://'].csp = false
  }
  if (typeof state.theme === 'string') {
    state.theme = {
      name: state.theme,
      url: chrome.runtime.getURL(`plugins/markdown-viewer/themes/${state.theme}.css`)
    }
  }
  if (state.themes === undefined) {
    state.themes = []
  }
  if (state.marked.tables !== undefined) {
    delete state.marked.tables
  }
  // v3.9 -> v4.0
  if (state.remark.commonmark !== undefined) {
    delete state.remark.commonmark
  }
  if (state.remark.pedantic !== undefined) {
    delete state.remark.pedantic
  }
  if (state.content.mermaid === undefined) {
    state.content.mermaid = false
  }
  if (state.themes === undefined || state.themes instanceof Array) {
    state.themes = {wide: false}
  }
  if (typeof state.theme === 'object') {
    state.theme = state.theme.name
  }
  // v4.0 -> v5.0
  Object.keys(state.origins).forEach((origin) => {
    state.origins[origin].csp = false
    state.origins[origin].encoding = ''
  })
  if (state.marked.smartLists !== undefined) {
    delete state.marked.smartLists
  }
  if (state.content.syntax === undefined) {
    state.content.syntax = true
  }
  if (state.themes.wide !== undefined) {
    if (state.themes.wide) {
      state.themes.width = 'full'
    }
    delete state.themes.wide
  }
  if (state.icon === undefined) {
    state.icon = false
  }
  if (state.remark.footnotes !== undefined) {
    delete state.remark.footnotes
  }
  // v5.0 -> v5.1
  if (state.header !== null) {
    Object.keys(state.origins).forEach((origin) => {
      state.origins[origin].header = true
      state.origins[origin].path = true
      delete state.origins[origin].csp
      delete state.origins[origin].encoding
    })
    state.header = null
  }
  if (state.content.scroll !== undefined) {
    delete state.content.scroll
  }
  if (state.settings === undefined) {
    state.settings = {
      icon: state.icon === true ? 'light' : 'dark',
      theme: 'light'
    }
  }
  // v5.1 -> v5.2
  if (state['markdown-it'] && state['markdown-it'].abbr === undefined) {
    Object.assign(state['markdown-it'], {
      abbr: false,
      attrs: false,
      cjk: false,
      deflist: false,
      footnote: false,
      ins: false,
      mark: false,
      sub: false,
      sup: false,
      tasklists: false,
    })

  }
  if (state.marked.linkify === undefined) {
    Object.assign(state.marked, {
      linkify: true,
    })
    delete state.marked.sanitize
  }
  // v5.2 -> v5.3
  if (state.custom === undefined) {
    state.custom = {
      theme: '',
      color: 'auto'
    }
  }
}
