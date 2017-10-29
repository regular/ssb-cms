const fs = require('fs')
const getConfig = require('ssb-electroparty/config.js') // .js is intentional

module.exports = (function () {
  const {keys, sbotConfig, manifest} = getConfig()
  console.log('sbot config', sbotConfig)
  console.log('our pubkey', keys.public)
  console.log('sbot address', sbotConfig.wsAddress)
  const blobsRoot = `http://${document.location.hostname}:${sbotConfig.ws.port}/blobs/get`
  return {
    keys,
    sbot: sbotConfig,
    manifest,
    sbotAddress: sbotConfig.wsAddress,
    blobsRoot
  }
})()
