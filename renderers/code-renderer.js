const h = require('mutant/html-element')
const config = require('../cms-config')
const querystring = require('querystring')

module.exports = function() {
  return function(value, kp) {
    const t = value.content && value.content.type
    if (t !== 'client-update' && t !== 'webapp') return
    const c = value.content
    
    return h('section.code', [
      h('h1', `${c.codeBranch || 'master'} ${value.sequence}`),
      h('button', {
        'ev-click': ()=>{
          document.location.href =
            `${config.blobsRoot}/${c.code}#${config.urlEncodedConfig}`
        }
      },`Switch to ${c.codeBranch || 'master'} branch`)
    ])
  }
}

