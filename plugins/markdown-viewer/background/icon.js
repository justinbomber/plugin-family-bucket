
md.icon = ({storage: {state}}) => () => {
  if (globalThis.__mdMarkdownSuite) {
    return;
  }
  setTimeout(() =>
    chrome.action.setIcon({
      path: [16, 19, 38, 48, 128].reduce((all, size) => (
        all[size] = `plugins/markdown-viewer/icons/${state.settings.icon}/${size}x${size}.png`,
        all
      ), {})
    })
  , 100)
}
