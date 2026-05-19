var isSuiteEmbed = new URLSearchParams(location.search).get('embed') === '1'

if (isSuiteEmbed) {
  document.documentElement.classList.add('is-suite-embed')
  var chromeNav = document.querySelector('nav.navbar')
  var chromeFooter = document.querySelector('footer')
  if (chromeNav) chromeNav.hidden = true
  if (chromeFooter) chromeFooter.hidden = true
  var footerPush = document.getElementById('footer-push')
  if (footerPush) footerPush.hidden = true
}

var origins = Origins()
var popup = Popup()

m.mount(document.querySelector('main'), {
  view: () => [
    origins.render(),
    popup.options(),
  ]
})

if (isSuiteEmbed) {
  var settingsPanel = document.querySelector('.m-settings')
  if (settingsPanel) settingsPanel.classList.remove('hidden')
}

var nav = document.querySelector('.nav')
if (nav) {
  nav.addEventListener('click', (e) => {
    e.preventDefault()
    Array.from(document.querySelectorAll('.nav a')).forEach((link) => {
      link.classList.remove('active')
    })
    if (e.target.innerText === 'Origins') {
      document.querySelector('.m-origins').classList.remove('hidden')
      document.querySelector('.m-settings').classList.add('hidden')
      e.target.classList.add('active')
    }
    else if (e.target.innerText === 'Settings') {
      document.querySelector('.m-origins').classList.add('hidden')
      document.querySelector('.m-settings').classList.remove('hidden')
      e.target.classList.add('active')
    }
    else if (e.target.innerText === 'Help') {
      var helpUrl = 'https://github.com/simov/markdown-viewer#table-of-contents'
      if (isSuiteEmbed) {
        window.open(helpUrl, '_blank', 'noopener,noreferrer')
      } else {
        window.location = helpUrl
      }
    }
  })
}
