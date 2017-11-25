const pull = require('pull-stream')
const pushable = require('pull-pushable')
const {isDraft} = require('./util')
const ssbsort = require('./ssb-sort')(links, breakTie)

function links(value, each) {
  if (!value) return
  let revBranches = (value.content && value.content.revisionBranch) || []
  let links = Array.isArray(revBranches) ? revBranches : [revBranches]

  let fromDraft = value.content && value.content['from-draft']
  if (fromDraft) links.push(fromDraft)

  links.forEach(each)
}

function breakTie(a, b) {
  return (
    // drafts after non-drafts
    (isDraft(b.key) - isDraft(a.key)) || 
    //declared timestamp, may by incorrect or a lie
    (b.value.timestamp - a.value.timestamp) ||
    //finially, sort hashes lexiegraphically.
    (a.key > b.key ? -1 : a.key < b.key ? 1 : 0)
  )
}

module.exports = function(trusted_keys) {
  trusted_keys = trusted_keys || []

  return function updates(opts) {
    opts = opts || {}
    const slots = {}
    let doBuffer = opts.bufferUntilSync // in sync mode, we buffer until we see a sync
    let drain

    const out = pushable(true, function (err) {
      if (err) console.error('out stream closed by client!', err)
      drain.abort(err)
    })

    function push(o) {
      if (!doBuffer) out.push(o)
    }

    function flush() {
      if (!doBuffer) return
      doBuffer = false
      Object.keys(slots).forEach( k => {
        processSlot(slots[k])
      })
    }

    function processSlot(slot) {
      if (slot.revisions.length === 0) return
      if (opts.allRevisions) {
        const revisions = ssbsort(slot.revisions)
        const fingerprint = revisions.map( kv => kv.key ).join('-')
        if (slot.fingerprint !== fingerprint) {
          slot.fingerprint = fingerprint
          push({
            key: slot.key,
            revisions: revisions.slice()
          })
        }
      } else {
        const newHeads = heads(slot.revisions)
        if (slot.currKv !== newHeads[0]) {
          slot.currKv = newHeads[0]
          push({
            key: slot.key,
            value: slot.currKv && slot.currKv.value,
            revision: slot.currKv && slot.currKv.key,
            heads: newHeads,

            // for compatibility
            unsaved: isDraft(slot.currKv && slot.currKv.key),
          })
        }
      }
    }

    function heads(revisions) {
      let heads = ssbsort.heads(revisions)

      const revs = {}
      revisions.forEach( kv => revs[kv.key] = kv )

      function trusted(kv) {
        let newestTrusted 
        function recurse(key) {
          let kv = revs[key]
          if (!kv) return
          // too old
          if (newestTrusted && newestTrusted.value.timestamp > kv.value.timestamp) return
          // not trusted
          if (!isDraft(kv.key) && !opts.allowUntrusted && !trusted_keys.includes(kv.value.author)) return links(kv.value, recurse)
          newestTrusted = kv
        }
        if (isDraft(kv.key) || opts.allowUntrusted || trusted_keys.includes(kv.value.author)) return kv
        links(kv.value, recurse)
        //console.log('trusted',kv,newestTrusted)
        return newestTrusted
      }

      // sort trusted heads, drafts first, then newest first
      return heads.map(k => trusted(revs[k])).filter( x=>x ).sort(breakTie)
    }
    
    function findKey(key) {
      return Object.keys(slots).find( k => {
        return slots[k].revisions.find( kv => kv.key === key)
      })
    }

    return function(read) {
      pull(
        read,
        pull.filter( kv =>{
          if (kv.sync) {
            flush()
            if (opts.sync) push(kv)
            return false
          }
          return true
        }),

        drain = pull.drain( kv => {
          let {key, value} = kv
          let revRoot

          if (!value && kv.type == 'del') {
            revRoot = findKey(key)
            if (!revRoot) console.warn('unable to find', key)
          } else {
            revRoot = (value && value.content && value.content.revisionRoot) || key
          }

          let slot = slots[revRoot]
          if (!slot) slot = slots[revRoot] = {
            revisions: [],
            key: revRoot
          }

          if (kv.type === 'del') {
            const r = slot.revisions.find( kv => kv.key === key )
            //console.warn('deletion in slot', slot, r)
            slot.revisions = slot.revisions.filter( kv => kv !== r )
            if (slot.revisions.length === 0) {
              return push({
                key: slot.key,
                value: r.value,
                type: 'del'
              })
            }
          } else {
            if (isDraft(kv.key)) {
              // if this is a draft, the same revision draft might already
              // be in the array
              slot.revisions = slot.revisions.filter( kv => kv.key !== key )
            }
            slot.revisions.push(kv)
          }
          if (doBuffer) return
          processSlot(slot)
        }, err => {
          // drain ends
          flush()
          out.end(err)
        })
      )
      return out.source
    }
  }
}

// for testing
module.exports.breakTie = breakTie
