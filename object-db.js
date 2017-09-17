const pull = require('pull-stream')
const merge = require('lodash.merge')
const updatesStream = require('./update-stream')
const {cacheAndIndex} = require('./message-cache')

// Oberservables for "objects" (mutable ssb messages).
// Wwarning: all messages are kept in memory, avoid mutliple instances

module.exports = function(ssb, root) {

  function Cache() {
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

  let cache = Cache()
  let getLatest = cache.getLatest
  let getChildren = cache.getChildren

  // TODO: return observable
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

  // TODO: return observable
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

  return {
    getLatest,
    getChildren,
    getPrototypeChain: function (key, cb) {getPrototypeChain(key, [], cb)},
    getReduced
  }
}
