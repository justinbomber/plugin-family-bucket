
md.inject = ({storage: {state, defaults}}) => {
  var injectingTabs = new Set()

  return (id) => {
  if (injectingTabs.has(id)) return
  injectingTabs.add(id)

  var content = (state && state.content) || (defaults && defaults.content) || {syntax: true}
  var themes = (state && state.themes) || (defaults && defaults.themes) || {width: 'auto'}
  var settings = (state && state.settings) || (defaults && defaults.settings) || {icon: 'default'}
  var custom = (state && state.custom) || (defaults && defaults.custom) || {theme: '', color: 'auto'}

  var scriptFiles = [
    'plugins/markdown-viewer/vendor/mithril.min.js',
    content.syntax && ['plugins/markdown-viewer/vendor/prism.min.js', 'plugins/markdown-viewer/vendor/prism-autoloader.min.js', 'plugins/markdown-viewer/content/prism.js'],
    content.emoji && 'plugins/markdown-viewer/content/emoji.js',
    content.mermaid && ['plugins/markdown-viewer/vendor/mermaid.min.js', 'plugins/markdown-viewer/vendor/panzoom.min.js', 'plugins/markdown-viewer/content/mermaid.js'],
    content.mathjax && ['plugins/markdown-viewer/content/mathjax.js', 'plugins/markdown-viewer/vendor/mathjax/tex-mml-chtml.js'],
    'plugins/markdown-viewer/content/index.js',
    'plugins/markdown-viewer/content/scroll.js',
    content.autoreload && 'plugins/markdown-viewer/content/autoreload.js',
  ].filter(Boolean).flat()

  chrome.scripting.executeScript({
    target: {tabId: id},
    args: [{
      theme: state.theme || (defaults && defaults.theme) || 'github',
      raw: !!state.raw,
      themes: themes,
      content: content,
      compiler: state.compiler || (defaults && defaults.compiler) || 'markdown-it',
      custom: custom,
      icon: settings.icon,
    }],
    func: (_args) => {
      args = _args
    },
    injectImmediately: true
  }, () => {
    if (chrome.runtime.lastError) {
      injectingTabs.delete(id)
      return
    }

    chrome.scripting.insertCSS({
      target: {tabId: id},
      files: [
        'plugins/markdown-viewer/content/index.css',
        'plugins/markdown-viewer/content/themes.css',
      ]
    }, () => {
      if (chrome.runtime.lastError) {
        injectingTabs.delete(id)
        return
      }

      chrome.scripting.executeScript({
        target: {tabId: id},
        files: scriptFiles,
        injectImmediately: true
      }, () => {
        injectingTabs.delete(id)
      })
    })
  })

  }
}
