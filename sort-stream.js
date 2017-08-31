const pull = require('pull-stream')

const {arr} = require('./util')
const updateStream = require('./update-stream')
const DB = require('./db')

function insert(key, kv, entries, pos) {
  let error = ()=> {
    console.log('entries:', entries)
    console.log('pos:', pos)
    throw new Error(`Couldn't place ${key} ${pos}`)
  }
  let after = arr(pos.after).slice()
  let before = arr(pos.before)
  // slide down the array until we are behind everything listed in `after`
  let i = 0
  while(after.length && i<entries.length) {
    let r = entries[i].revision || entries[i].key
    if (before.includes(r)) error()
    // jshint -W083
    if (after.includes(r)) after = after.filter( x=> x !== r )
    // jshint +W083
    ++i
  }
  if (after.length) error()

  // now slide down further, until we either hit an entry of `before`
  // or the next timestamp is greaten than ours
  while(i<entries.length) {
    let r = entries[i].revision || entries[i].key
    if (before.includes(r)) break
    if (entries[i].value.timestamp > kv.value.timestamp) break
    ++i
  }
  //entries.splice(i, 0, kv)
  //return entries
  return entries.slice(0, i).concat([kv]).concat(entries.slice(i))
}

module.exports = function(ssb, drafts) {
  let db = DB(ssb, drafts)

  function streamSortRevs(id) {
    let entries = []
    return pull(
      db.revisions(id, {
        live: true,
        sync: true
      }),
      updateStream({
        sync: true,
        allRevisions: true,
        bufferUntilSync: false
      }),
      pull.map( (kv)=>{
        if (kv.sync) return kv
        let key = kv.revision || kv.key
        kv.id = key
        // Is this a request to remove a draft?
        if (kv.type === 'del') {
          let entry = entries.find( x=> x.id === key )
          if (entry) {
            entries = entries.filter( e=> e !== entry)
          } else console.error('Request to delete non-existing draft', key)
          return entries
        }

        let pos = kv.pos || 'head'
        console.log('- RevView:', pos, key, kv.heads)
        if (pos === 'head') entries.push(kv)
        else if (pos === 'tail') entries.unshift(kv)
        else entries = insert(key, kv, entries, pos)
        console.log('new length', entries.length)
        return entries
      })
    )
  }

  return streamSortRevs
}

module.exports.insert = insert
