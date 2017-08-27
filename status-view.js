// mutant
require('setimmediate')
const h = require('mutant/html-element')
const MappedArray = require('mutant/mapped-array')
const MutantMap = require('mutant/map')
const Dict = require('mutant/dict')
const Value = require('mutant/value')
const Struct = require('mutant/struct')
const MutantArray = require('mutant/array')
const computed = require('mutant/computed')
const when = require('mutant/when')
const send = require('mutant/send')
const resolve = require('mutant/resolve')
// --
//
const pull = require('pull-stream')
const updates = require('./update-stream')
const config = require('../ssb-cms/config')

module.exports = function(ssb, drafts, root) {
  let draftCount = Value(0)
  let draftWarning = Value(false)

  function html() {
    return h('span.status', [
      h('span', [
        'drafts:',
        h('span', draftCount),
        when(draftWarning, h('span', {title: 'draft db corruption'}, '⚠')),
      ])
    ])
  }

  function streamDrafts() {
    let counts = {
      draft: 0,
      branch: 0,
      revroot: 0
    }
    let synced = false
    pull(
      drafts.all({
        live: true,
        sync: true,
        keys: true
      }),
      pull.drain( (kv)=>{
        if (kv.sync) {
          draftCount.set(counts.draft)
          synced = true
          return
        }
        let key = kv.key
        if (key[0]==='~') key = key.substr(1)
        let t = key.split(/[~-]/)[0].toLowerCase()
        counts[t] += (kv.type == 'del') ? -1 : 1
        if (synced) {
          draftCount.set(counts.draft)
          draftWarning.set(counts.draft !== counts.branch || counts.draft !== counts.revroot)
        }
      })
    )
  }

  streamDrafts()

  /*
  function messages(root, syncedCb) {
    pull(
      ssb.links({
        rel: 'root',
        dest: root,
        keys: true,
        values: true
      })),
      updates({sync: true, bufferUntilSync: true}),
      pull.filter( x=>{
        if (x.sync) syncedCb(null)
        return !x.sync
      }),

      drain = pull.drain( (kv) => {
        if (kv.type === 'del') return
        unsaved(key, kv.unsaved)
        forked(kv.heads.length > 1)
        incomplete(key, kv.tail !== kv.key)
      }, (err)=>{
        console.log('status message stream ended', err)
      })
    )
    return drain.abort
  }
  */
  return html()
}

module.exports.css = ()=>  `
`
