const pull = require('pull-stream')
const many = require('pull-many')
const merge = require('lodash.merge')
const ref = require('ssb-ref')
const ProxyDict = require('mutant/proxy-dict')
const ProxyCollection = require('mutant/proxy-collection')
const updatesStream = require('./update-stream')
const {cacheAndIndex} = require('./message-cache')

// Oberservables for "objects" (mutable ssb messages).
// Wwarning: all messages are kept in memory, avoid mutliple instances

module.exports = function(ssb, drafts, root) {

  function Cache() {
    let cbs = []
    let cache
    let synced
    let syncCount = 2

    function flushCBs() {
      cbs.forEach( ({cb, opts, key, type, proxy})=>{
        let obs =cache[ (type === 'msg') ? 'getMessageObservable' : 'getChildrenObservable'](key)
        if (!obs && cb) return cb(new Error(`Not found: ${key}`))
        let value = (type === 'msg') ? (
           opts.keys ? obs() : obs().value
        ) : (
          opts.keys ? obs() : obs().map( x => x.value )
        )
        if (cb) cb(null, value)
        console.log(`Seeing ${type} proxy`, obs)
        proxy.set(obs)
      })
      cbs = null
    }
    pull(
      many([
        drafts.all({
          live: true,
          sync: true,
          keys: true,
          values: true
        }),
        ssb.links({
          live: true,
          sync: true,
          rel: 'root',
          dest: root,
          keys: true,
          values: true
        })
      ]),
      pull.through( console.log ),
      updatesStream({live: true, sync: true, bufferUntilSync: true}),
      pull.filter( x=>{
        if (x.sync) {
          if (--syncCount === 0) {
            flushCBs()
            synced = true
          }
        }
        return !x.sync
      }),
      cache = cacheAndIndex()
    )
    return {
      // return observable, call cb with value
      getLatest: (key, opts, cb) => {
        if (typeof opts === 'function') {cb = opts; opts = {}}
        if (synced) {
          let obs = cache.getMessageObservable(key)
          if (cb) cb(null, opts.keys ? obs() : obs().value)
          return obs
        }
        let proxy = ProxyDict()
        cbs.push({key, cb, opts, type: 'msg', proxy})
        return proxy
      },
      getChildren: (key, opts, cb) => {
        if (typeof opts === 'function') {cb = opts; opts = {}}
        if (synced) {
          let obs = cache.getChildrenObservable(key)
          if (!obs && cb) cb(null, [])
          else if (cb) cb(null, opts.keys ? obs() : obs().map( x=>x.value) )
          return obs
        }
        let proxy = ProxyCollection()
        cbs.push({key, cb, opts, type: 'children', proxy})
        return proxy
      }
    }
  }

  let cache = Cache()
  let getLatest = cache.getLatest
  let getChildren = cache.getChildren

  // TODO: return observable
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
