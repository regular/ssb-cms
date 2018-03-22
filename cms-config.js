const fs = require('fs')
const Context = require('ssb-electroparty/context')

module.exports = (function () {
  const {keys, sbotConfig, manifest, versions} = Context()
  const urlEncodedConfig = Context.urlEncode(keys, sbotConfig, manifest, versions)
  console.log('sbot config', sbotConfig)
  console.log('our pubkey', keys.public)
  console.log('sbot address', sbotConfig.wsAddress)
  const blobsRoot = `http://${document.location.hostname}:${sbotConfig.ws.port}/blobs/get`
  return {
    keys,
    sbot: sbotConfig,
    manifest,
    versions,
    sbotAddress: sbotConfig.wsAddress,
    blobsRoot,
    urlEncodedConfig
  }
})()
