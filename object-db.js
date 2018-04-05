const pull = require('pull-stream')
const many = require('pull-many')
const merge = require('lodash.merge')
const ref = require('ssb-ref')
const ProxyDict = require('mutant/proxy-dict')
const Value = require('mutant/value')
const MutantArray = require('mutant/array')
const ProxyCollection = require('mutant/proxy-collection')
const UpdatesStream = require('./update-stream')
const {cacheAndIndex} = require('./message-cache')
const ric = require('pull-ric')
const config = require('./cms-config')

// in kisok mode we use a maxAge of 2 minutes per default
// for a smoother experience until the object cache kicks in
const MAXAGE = config.sbot.cms.kiosk ? 120000 : 5000

// Oberservables for "objects" (mutable ssb messages).
// Wwarning: all revisions are kept in memory

function CachedGetter(defaultMaxAge, current, processValue) {
  let cache = {}

  return function get(key, opts, cb) {
    if (typeof opts === 'function') {cb = opts; opts = {}}
    opts = opts || {}
    const maxAge = typeof opts.maxAge === 'undefined' ? defaultMaxAge : opts.maxAge // might be zero, explicitly

    const entry = cache[key]
    if (entry && Date.now() - entry.time < maxAge) {
      console.warn('Cache hit')
      return cb(null, processValue(entry.value, opts), entry.value)
    }

    current(key, opts, (err, value) => {
      if (err) return cb(err)  
      cache[key] = {
        value,
        time: Date.now()
      }
      cb(null, processValue(value, opts), value)
    })
  }
}


module.exports = function(ssb, drafts, root, isTrustedKey) {
  const updatesStream = UpdatesStream(isTrustedKey)

  const _getChildren = CachedGetter(
    MAXAGE,
    function current(key, opts, cb) {
      let children = {}
      pull(
        ssb.cms.branches(key),
        updatesStream(),
        pull.drain( update => {
          children[update.key] = update
        }, err => {
          if (err) return cb(err)
          cb(null, children)
        })
      )
    },
    function processValue(children, opts) { 
      let values = Object.values(children)
      if (!opts.keys) {
        values = values.map( x => x.value )
      }
      return values
    }
  )
      
  const _getLatest = CachedGetter(
    MAXAGE,
    function current(key, opts, cb) {
      if (typeof opts === 'function') {cb = opts; opts = {}}
      opts = opts || {}

      let latest = null
      pull(
        ssb.cms.revisions(key),
        updatesStream(),
        pull.drain( update => {
          latest = update
        }, err => {
          if (err) return cb(err)
          let value = latest
          if (!value) return cb(new Error(`getLatest: key not found: ${key}`))
          cb(null, value)
        })
      )
    },
    function process(value, opts) {
      if (!opts.keys) value = value.value
      return value
    }
  )

  function Cache() {
    let cbs = []
    let cache
    let synced
    let syncCount = 2

    function flushCBs() {
      // NOTE: new callbacks might be pushed
      // while we process the queue
      while(cbs.length) {
        let {cb, opts, key, type, proxy} = cbs.shift()
        let obs = cache[ (type === 'msg') ? 'getMessageObservable' : 'getChildrenObservable'](key)
        if (!obs && cb) {
          if (type === 'msg') {
            cb(new Error(`Not found: ${type} ${key}`))
          } else {
            //console.error('No children observable for', key)
            cb(null, [])
          }
        }
        if (cb) {
          let value
          if (!obs) {
            value = (type === 'msg') ? null : []
          } else {
            value = (type === 'msg') ? (
               opts.keys ? obs() : obs().value
            ) : (
              opts.keys ? obs() : obs().map( x => x.value )
            )
          }
          cb(null, value)
        }
        console.log(`Setting ${type} proxy`, key)
        if (obs) proxy.set(obs)
      }
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
      // in kiosk mode, we need fast startup and smooth
      // animations, in CMS mode, we need immediate, fresh data
      // right from the start
      config.sbot.cms.kiosk ? ric() : pull.through(),
      pull.filter( x => {
        if (x.sync) {
          return --syncCount === 0
        }
        return true
      }),
      updatesStream({live: true, sync: true/*, bufferUntilSync: true*/}),
      pull.filter( x => {
        if (x.sync) {
          console.warn('flushcb')
          synced = true
          setImmediate(flushCBs)
        }
        return !x.sync
      }),
      cache = cacheAndIndex()
    )
    return {
      // return observable, call cb with value
      getLatest: (key, opts, cb) => {
        if (typeof opts === 'function') {cb = opts; opts = {}}
        opts = opts || {}
        if (synced) {
          let obs = cache.getMessageObservable(key)
          if (!obs && cb) {
            cb(new Error(`message not found ${key}`))
          } else if (cb) {
            cb(null, opts.keys ? obs() : obs().value)
          }
          return obs
        }
        let proxy = ProxyDict()
        console.warn('Enqueued getLatest', key)
        cbs.push({key, cb:null, opts, type: 'msg', proxy})
        _getLatest(key, opts, (err, value, rawValue) => {
          if (!err) proxy.set(Value(rawValue))
          if (cb) cb(err, value)
        })
        return proxy
      },
      getChildren: (key, opts, cb) => {
        if (typeof opts === 'function') {cb = opts; opts = {}}
        opts = opts || {}
        if (synced) {
          let obs = cache.getChildrenObservable(key)
          if (!obs && cb) cb(null, [])
          else if (cb) cb(null, opts.keys ? obs() : obs().map( x => x.value) )
          return obs
        }
        let proxy = ProxyCollection()
        console.warn('Enqueued getChildren', key)
        cbs.push({key, cb: null, opts, type: 'children', proxy})
        _getChildren(key, opts, (err, value, rawValue) => {
          if (!err) proxy.set(MutantArray(rawValue))
          if (cb) cb(err, value)
        })
        return proxy
      }
    }
  }

  let cache = Cache()
  let getLatest = cache.getLatest
  let getChildren = cache.getChildren

  // TODO: return observable
  function getPrototypeChain(key, result, cb) {
    if (typeof result === 'function') {cb = result; result = []}
    //console.log('Proto getLatest', key)
    getLatest(key, (err, msg) => {
      //console.log('Proto got latest', key, err, msg)
      if (err) return cb(err)
      result.unshift({key, msg})
      let p
      if (p = msg.content.prototype) {
        if (result.indexOf(p) !== -1) return cb(new Error('Cyclic prototype chain'))
        return getPrototypeChain(p, result, cb)
      }
      //console.log('Proto done', key)
      cb(null, result)
    })
  }

  // TODO: return observable
  function getReduced(key, cb) {
    //console.log('get REDUCED', key)
    getPrototypeChain(key, [], (err, chain)=>{
      //console.log('got PROTO chain', key, err, chain)
      if (err) return cb(err)
      let msgs = chain.map( x => x.msg)
      msgs.unshift({})
      let msg = merge.apply(null, msgs)
      msg.content = msg.content || {}
      chain.pop() // remove original message
      msg.content.prototype = chain.map( x => x.key )
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
