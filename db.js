const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const ssbSort = require('ssb-sort')
const deepAssign = require('deep-assign')

const {isDraft} = require('./util')

// TODO: replace by update-stream
function filterRevisions() {
  // return only latest revisions
  return function (read) {
    var queue, _err, _cb
    var heads = {}, roots = {}
    var drain = pull.drain(function (msg) {
      let c = msg.value.content
      var revisionBranch = msg.value.revisionBranch || (c && c.revisionBranch)
      if (revisionBranch) {
        if (heads[revisionBranch]) delete heads[revisionBranch]
        else roots[revisionBranch] = true
      }
      if (roots[msg.key]) delete roots[msg.key]
      else heads[msg.key] = msg
    }, function (_err) {
      //if (err) throw err
      queue = ssbSort(Object.keys(heads).map(key => heads[key]))
      if (_cb) {
        let cb = _cb
        _cb = null
        if (_err) cb(_err)
        else if (queue.length) cb(null, queue.shift())
        else cb(true)
      } else {
        _err = err
      }
    })(read)
    return function (abort, cb) {
      if (abort) {
        if (drain) {
          let _drain = drain
          drain = null
          return _drain.abort(abort, cb)
        }
        return read(abort, cb)
      }
      if (_err) cb(_err)
      else if (!queue) _cb = cb
      else if (queue.length) return cb(null, queue.shift())
      else cb(true)
    }
  }
}

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
      if (x.key) {
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
      filterSync(syncCount),
      uniqueKeys()
    )
  }

  /// -- TODO: refactor below this line
  
  // get latest revision of given revisionRoot
  // (including drafts)
  function getLatest(key, cb) {
    if (!key) return cb(new Error('no key specified'))
    if (isDraft(key)) return drafts.get(key, cb)
    pull(
      many([
        pull(
          pull.once(key),
          pull.asyncMap(ssb.get),
          pull.map( x=>{return {key, value: x}})
        ),
        ssb.links({
          rel: 'revisionRoot',
          dest: key,
          keys: true,
          values: true
        }),
        drafts.byRevisionRoot(key)
      ]),
      filterRevisions(),
      pull.collect( (err, results)=>{
        if (err) return cb(err)
        if (results.length !== 1) return cb(new Error('got more or less than one result'))
        let msg = results[0].value
        if (msg.msgString) {
          try{
            msg = JSON.parse(msg.msgString)
          } catch(e) {
            e.msgString = msg.msgString
            return cb(e)
          }
        }
        cb(null, msg)
      })
    )
  }

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
