const fs = require('fs')
const ssbKeys = require('ssb-keys')

module.exports = (function () {
  const keys = ssbKeys.loadOrCreateSync('mykeys')
  const sbotConfig = JSON.parse(fs.readFileSync(process.env.HOME + '/.' + process.env.ssb_appname + '/config'))
  const manifest = JSON.parse(fs.readFileSync(process.env.HOME + '/.' + process.env.ssb_appname + '/manifest.json'))
  console.log('sbot config', sbotConfig)
  console.log('our pubkey', keys.public)
  const sbotAddress = JSON.parse(process.env.ssb_ws_address) // removes quotes
  console.log('sbot address', sbotAddress)
  const blobsRoot = `http://${sbotConfig.host || 'localhost'}:${sbotConfig.ws.port}/blobs/get`
  return {
    keys,
    sbot: sbotConfig,
    manifest,
    sbotAddress,
    blobsRoot
  }
})()
