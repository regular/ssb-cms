const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const {isDraft} = require('./util')

module.exports = function(ssb, drafts) {

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

  return {
    getMessageOrDraft,
    branches,
    revisions
  }
}
