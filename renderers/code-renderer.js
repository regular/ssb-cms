const h = require('mutant/html-element')
const config = require('../cms-config')
const querystring = require('querystring')
const context = require('ssb-electroparty/context')

module.exports = function(ssb) {
  return function(value, kp) {
    const t = value.content && value.content.type
    if (t !== 'client-update' && t !== 'webapp') return
    const c = value.content
    
    return h('section.code', [
      h('h1', `${c.codeBranch || 'master'} ${value.sequence}`),
      h('button', {
        'ev-click': ()=>{
          const key = kp.slice(-1)[0] 
          console.log('codeMessage', key)
          document.location.href = context.makeWebappURL({key, value})
        }
      },`Switch to ${c.codeBranch || 'master'} branch`)
    ])
  }
}

