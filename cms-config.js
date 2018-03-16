const fs = require('fs')
const Config = require('ssb-electroparty/config.js') // .js is intentional

module.exports = (function () {
  const {keys, sbotConfig, manifest, versions} = Config()
  const urlEncodedConfig = Config.urlEncodeConfig(keys, sbotConfig, manifest, versions)
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
