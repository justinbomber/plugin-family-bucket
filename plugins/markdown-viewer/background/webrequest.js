
md.webrequest = ({storage: {state}}) => {

  var permissions = ['webRequest']

  var filter = {
    urls: ['<all_urls>'],
    types: ['main_frame', 'sub_frame']
  }

  var onCompleted = ({ip, tabId}) => {
    if (ip && ip !== '127.0.0.1' && ip !== '::1') {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {message: 'autoreload'})
      }, 500)
    }
  }

  var webrequest = () => {
    if (state.content.autoreload && !chrome.webRequest) {
      // request permissions
      chrome.permissions.request({permissions}, () => {
        // add listener
        chrome.webRequest.onCompleted.addListener(onCompleted, filter)
      })
    }
    else if (!state.content.autoreload && chrome.webRequest) {
      chrome.webRequest.onCompleted.removeListener(onCompleted)
      chrome.permissions.contains({ permissions }, (granted) => {
        if (!granted) return
        chrome.permissions.remove({ permissions }, () => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[markdown-viewer] webrequest permissions.remove:",
              chrome.runtime.lastError.message,
            )
          }
        })
      })
    }
  }

  // init
  if (chrome.webRequest) {
    chrome.webRequest.onCompleted.addListener(onCompleted, filter)
  }

  return webrequest
}
