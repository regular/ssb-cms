const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const ssbSort = require('ssb-sort')

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
  
  // get latest revision of given revisionRoot
  function get(key, cb) {
    pull(
      many([
        pull(
          pull.once(key),
          pull.asyncMap(ssb.get),
          pull.map( x=>{return {value: x}})
        ),
        ssb.links({
          rel: 'revisionRoot',
          dest: key,
          keys: false,
          values: true
        })
      ]),
      filterRevisions(),
      pull.collect( (err, messages)=>{
        if (err) return cb(err)
        if (messages.length !== 1) return cb(new Error('got more or less than one message'))
        cb(null, messages[0].value)
      })
    )
  }

  function branches(root) {
    return function() {
      return pull(
         many([
          root && ref.type(root) ? pull(
            ssb.links({
              rel: 'branch',
              dest: root,
              keys: true,
              values: true
            }),
            pull.unique('key')
          ) : pull.empty(), // TODO: get all root messages
          drafts.byBranch(root)
        ]),
        filterRevisions()
      )
    }
  }
  
  return {
    get,
    branches
  }
}
