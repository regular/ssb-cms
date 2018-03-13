const h = require('mutant/html-element')
const config = require('../cms-config')
const querystring = require('querystring')

/*
  return JSON.parse(Buffer.from(querystring.parse(str).s, 'base64').toString())
  const {keys, sbotConfig, manifest} = getConfig()
  return {
    keys,
    sbot: sbotConfig,
    manifest,
    sbotAddress: sbotConfig.wsAddress,
    blobsRoot
  }
  fragment 
  querystrung.parse
  take s
  base64 decode
  JSON.parse

  keys -> keys
  sbotConfig -> sbot
  manifest -> manifest
  sbotConfig.wsAddress -> sbotAddress
*/

function makeConfigHash(conf) {
  const {sbotAddress, manifest, sbot, keys} = conf
  
  const sbotConfig = sbot
  sbotConfig.wsAddress = sbotAddress
  return '#' + querystring.stringify({
    s: Buffer.from(JSON.stringify({sbotConfig, manifest, keys})).toString('base64')
  })
}

module.exports = function() {
  return function(value, kp) {
    const t = value.content && value.content.type
    if (t !== 'client-update' && t !== 'webapp') return
    const c = value.content
    
    console.log('CONFIG', makeConfigHash(config))

    return h('section.code', [
      h('h1', `${c.codeBranch || 'master'} ${value.sequence}`),
      h('button', {
        'ev-click': ()=>{
          document.location.href =
            `${config.blobsRoot}/${c.code}` + makeConfigHash(config)
        }
      },`Switch to ${c.codeBranch || 'master'} branch`)
    ])
  }
}

