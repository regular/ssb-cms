const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const merge = require('lodash.merge')

const updatesStream = require('./update-stream')
const {cacheAndIndex} = require('./message-cache')
const {isDraft} = require('./util')

module.exports = function(ssb, drafts, root) {

  function getMessageOrDraft(id, cb) {
    //console.log('getting', id)
    if (isDraft(id)) drafts.get(id, cb)
    else if (ref.isMsg(id)) ssb.get(id, cb)
    else cb(Error(`getMessageOrDraft: invalid id: ${id}`))
  }

  function filterSync(sync) {
    return pull.filter( x => {
      // only pass through the last expected sync
      if (sync && x.sync) {
        //console.log('sync, expect more:', sync-1)
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

  // --- higher level APIs
  //

  function Cache(root) {
    let cbs = []
    let cache
    function flushCBs() {
      cbs.forEach( ({cb, key, type})=>{
        if (type === 'msg') return cb(null, cache.getMessageObservable(key))
        cb(null, cache.getChildrenObservable(key))
      })
      cbs = null
    }
    pull(
      ssb.links({
        live: true,
        sync: true,
        rel: 'root',
        dest: root,
        keys: true,
        values: true
      }),
      updatesStream({live: true, sync: true, bufferUntilSync: true}),
      pull.filter( x=>{
        if (x.sync) {
          flushCBs()
          synced = true
        }
        return !x.sync
      }),
      cache = cacheAndIndex()
    )
    return {
      getLatest: (key, cb) => {
        if (synced) return cb(null, cache.getMessageObservable(key))
        cbs.push({key, cb, type: 'msg'})
      },
      getChildren: (key, cb) => {
        if (synced) return cb(null, cache.getChildrenObservable(key))
        cbs.push({key, cb, type: 'children'})
      }
    }
  }

  let cache = Cache(root)
  let getLatest = cache.getLatest
  let getChildren = cache.getChildren

  function getPrototypeChain(key, result, cb) {
    getLatest(key, (err, obs)=>{
      if (err) return cb(err)
      let msg = obs()
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
      let msg = merge.apply(null, msgs)
      msg.content = msg.content || {}
      chain.pop() // remove original message
      msg.content.prototype = chain.map( x=>x.key )
      cb(null, msg)
    })
  }

  // Use this general getter in custom renderers
  // opts:
  // - children: (default: false) returned object has a `children` property (MutantArray)
  // - ignorePrototype: (default: false)
  // - ignorePrototypeProperties: (default: false) don't include properties from prototypes
  // - ignorePrototypeChildren: (default: false) don't include children from prototypes
  
  return {
    getMessageOrDraft,
    branches,
    revisions,
    getLatest,
    getChildren,
    getPrototypeChain: function (key, cb) {getPrototypeChain(key, [], cb)},
    getReduced
  }
}
