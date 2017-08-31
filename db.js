const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const ssbSort = require('ssb-sort')
const deepAssign = require('deep-assign')
const updatesStream = require('./update-stream')

const {isDraft} = require('./util')

module.exports = function(ssb, drafts) {

  function getMessageOrDraft(id, cb) {
    console.log('getting', id)
    if (isDraft(id)) drafts.get(id, cb)
    else if (ref.isMsg(id)) ssb.get(id, cb)
    else cb(Error(`getMessageOrDraft: invalid id: ${id}`))
  }

  function filterSync(sync) {
    return pull.filter( x => {
      // only pass through the last expected sync
      if (sync && x.sync) {
        console.log('sync, expect more:', sync-1)
        return (!--sync)
      }
      return true
    })
  }

  function uniqueKeys() {
    let seenKeys = [] // TODO: use a Set here?
    return pull.filter( x => {
      if (x.type !== 'del' && x.key) {
        if (seenKeys.includes(x.key)) {
          return false
        }
        seenKeys.push(x.key)
      }
      return true
    })
  }

  function branches(root, opts) {
    if (!root) throw new Error('Missing argument: root')
    opts = opts || {}
    let syncCount = opts.sync ? (ref.isMsg(root) ? 2 : 1) : 0
    return pull(
      many([
        ref.isMsg(root) ? pull(
          ssb.links(Object.assign({}, opts, {
            rel: 'branch',
            dest: root,
            keys: true,
            values: true
          }))
        ) : pull.empty(),
        drafts.byBranch(root, opts)
      ]),
      uniqueKeys(),
      // TODO: do we actually need to de-duplicate the keys?
      // Why?
      filterSync(syncCount)
    )
  }

  function revisions(root, opts) {
    if (!root) throw new Error('Missing argument: root')
    opts = opts || {}
    let syncCount = opts.sync ? (ref.isMsg(root) ? 3 : 2) : 1
    return pull(
      many([
        pull(
          pull.once(root),
          pull.asyncMap(getMessageOrDraft),
          pull.map( value => opts.sync ? [
            { key: root, value},
            { sync: true }
          ] : [ 
            { key: root, value}
          ]),
          pull.flatten()
        ),
        ref.isMsg(root) ? pull(
          ssb.links(Object.assign({}, opts, {
            rel: 'revisionRoot',
            dest: root,
            keys: true,
            values: true
          }))
        ) : pull.empty(),
        drafts.byRevisionRoot(root, opts)
      ]),
      uniqueKeys(),
      filterSync(syncCount)
    )
  }

  // get latest revision of given revisionRoot
  // (including drafts)
  function getLatest(key, cb) {
    if (!key) return cb(new Error('no key specified'))
    if (isDraft(key)) return drafts.get(key, cb)
    pull(
      revisions(key),
      updatesStream({bufferUntilSync: true}),
      pull.collect( (err, results)=>{
        if (err) return cb(err)
        console.log('GET LATEST', results)
        if (results.length !== 1) return cb(new Error('got more or less than one result'))
        let msg = results[0].value
        cb(null, msg)
      })
    )
  }

  /// -- TODO: refactor below this line

  function getPrototypeChain(key, result, cb) {
    getLatest(key, (err, msg)=>{
      if (err) return cb(err)
      result.unshift({key, msg})
      let p
      if (p = msg.content.prototype) {
        if (result.indexOf(p) !== -1) return cb(new Error('Cyclic prototype chain'))
        return getPrototypeChain(p, result, cb)
      }
      cb(null, result)
    })
  }

  function getReduced(key, cb) {
    getPrototypeChain(key, [], (err, chain)=>{
      if (err) return cb(err)
      let msgs = chain.map( x=>x.msg)
      msgs.unshift({})
      let msg = deepAssign.apply(null, msgs)
      msg.content = msg.content || {}
      msg.content.prototype = chain.map( x=>x.key )
      cb(null, msg)
    })
  }
  
  return {
    getMessageOrDraft,
    getLatest,
    getPrototypeChain: function (key, cb) {getPrototypeChain(key, [], cb)},
    getReduced,
    branches,
    revisions
  }
}
