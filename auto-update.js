const pull = require('pull-stream')
const Context = require('ssb-electroparty/context')
const {latestWebApp} = require('ssb-electroparty/bootloader')

module.exports = function AutoUpdate(updateAvailable) {
  const versions = Context().versions
  if (!versions) {
    document.body.innerHTML = '<h1>Bootloader needs to be updated</h1><p style="color: lightgray;">(Context has no version property)</p>'
    return
  }
  const {author, codeMessage, codeBranch, appId} = versions.webapp
  if (!author || !codeBranch || !appId) {
    console.warn('Unable to look for webapp updates. context.versions.webapp is invalid.')
    return pull.through( ()=>{} )
  }
  console.warn('Looking for webapp updates. Criteria are:', versions.webapp)
  return latestWebApp(author, appId, codeBranch, webappKv => {
    if (webappKv.key !== codeMessage) {
      const updateUrl = Context.makeWebappURL(webappKv)
      console.warn('New webapp version deployed!', webappKv)
      updateAvailable(updateUrl)
    }
  })
}
