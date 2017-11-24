const pull = require('pull-stream')

const {arr} = require('./util')
const updateStream = require('./update-stream')() // no trusted keys
const DB = require('./db')

module.exports = function(ssb, drafts) {
  let db = DB(ssb, drafts)

  function streamSortRevs(id) {
    return pull(
      db.revisions(id, {
        live: true,
        sync: true
      }),
      updateStream({
        live: true,
        sync: true,
        allowUntrusted: true,
        allRevisions: true,
        bufferUntilSync: false
      }),
      pull.map( kv => {
        if (kv.sync) return kv

        // TODO: get rid of this
        //kv.revisions.forEach( r => r.id = r.key )
        return kv.revisions //.reverse()
      })
    )
  }
  return streamSortRevs
}

