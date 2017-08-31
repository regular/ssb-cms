const pull = require('pull-stream')
const pushable = require('pull-pushable')
const {isDraft} = require('./util')

function log() {
  //console.log.apply(console, arguments)
}

function forEach(arrOrVal, f) {
  if (typeof arrOrVal === 'undefined') return
  if (arrOrVal === null) return
  if (!Array.isArray(arrOrVal)) arrOrVal = [arrOrVal]
  arrOrVal.forEach(f)
}

function debug(child) {
  log('new heads:', child.heads)
  log('new tail:', child.tail)
  log('new links:', child.links)
}

function addHead(child, h, timestamp) {
  child.heads = Object.assign({}, child.heads, {[h]: timestamp})
}

function removeHead(child, h) {
  child.heads = Object.assign({}, child.heads)
  delete child.heads[h]
}

function includesAll(needle, haystack) {
  if (!needle) return true
  if (!haystack) return false
  if (needle == haystack) return true
  if (!Array.isArray(needle)) needle = [needle]
  if (!Array.isArray(haystack)) haystack = [haystack]
  return !needle.find( n => {
    // try to find a needle that is not in the haystack
    return haystack.indexOf(n) == -1
  })
}

function replace(container, unwanted, wanted, opts) {
  opts = opts || {}
  let result
  if (!container) result =  container || []
  else {
    if (!Array.isArray(container)) container = [container]
    if (!Array.isArray(unwanted)) unwanted = [unwanted]
    if (!Array.isArray(wanted)) wanted = [wanted]
    if (opts.moveTo) {
      container.filter( x => unwanted.includes(x) ).forEach( x=>opts.moveTo.push(x) )
    }
    result = container.filter( x => !unwanted.includes(x) ).concat(wanted)
  }
  if (opts.arrayResult) return result
  if (result.length === 1) result = result[0]
  else if (result.length === 0) result = null
  return result
}

function append(container, wanted) {
  let result
  if (!wanted) result =  container || []
  else {
    if (!Array.isArray(container)) container = [container]
    if (!Array.isArray(wanted)) wanted = [wanted]
    result = container.concat(wanted)
  }
  if (result.length === 1) result = result[0]
  else if (result.length === 0) result = null
  return result
}

function links(kv) {
  if (kv.links) return kv.links
  if (kv.type === 'del') return [kv.key]
  let links = kv.value.content && kv.value.content.revisionBranch
  return links && (Array.isArray(links) ? links : [links])
}

// Is there a causal link between a and b?
// +1 == b fits after a (link from b to a)
// -1 == b fits before a (link from a to b)
//  0 == there's no connection

function isLinked(child, x) {
  // does b fit before a?
  let aLinks = links(child)
  let bLinks = links(x)
  if (includesAll(x.key, aLinks)) {
    log(`${x.key} fits before ${aLinks}`)
    return -1
  } else if (bLinks && includesAll(bLinks, Object.keys(child.heads))) {
    // does b fit at one (or more) of a's heads?
    log(`${x.key} fits after ${child.heads}`)
    if (x.type === 'del') {
      // to delete the draft it either needs to be the rev root,
      // or it needs to have `valueBefireDraft` set.
      if (child.key !== x.key && !child.valueBeforeDraft) return 0
    }
    return +1
  }
  return 0
}

module.exports = function updates(opts) {
  opts = opts || {}
  let children = {}
  let ignore = []
  let doBuffer = opts.bufferUntilSync // in sync mode, we buffer until we see a sync
  let drain

  function ignoreDraft(msg) {
    if (msg.content['from-draft']) {
      // this message was created from a draft,
      // if we see that draft later (it might still exist)
      // we just ignore it
      ignore.push(msg.content['from-draft'])
      log('ignore', ignore)
    }
  }

  let out = pushable(true, function (err) {
    log('out stream closed by client!', err)
    drain.abort(err)
  })

  function push(o) {
    log('update-stream pushes', o)
    out.push(o)
  }

  function flush() {
    if (doBuffer) {
      log('update-stream: unbuffering')
      Object.values(children).forEach( c => push(Object.assign({}, c)) )
      doBuffer = false
    }
  }

  let through = function(read) {
    pull(
      read,
      pull.through( kv=>{
        log('update-stream reads', JSON.stringify(kv))
      }),
      pull.filter( kv =>{
        if (kv.sync) {
          // push current children states
          flush()
          if (opts.sync) push(kv)
          return false
        }
        return true
      }),

      drain = pull.drain( (kv) => {
        let {key, value} = kv
        log('incoming', kv)

        if (ignore.includes(key)) {
          if (kv.type === 'del') ignore = ignore.filter( k => k !== key)
          log('ignored', key)
          return
        }

        let revRoot = value && value.content && value.content.revisionRoot || key
        // do we have a child for that revRoot yet?
        let child
        if (kv.type !== 'del') {
          child = children[revRoot]
          if (!child) {
            if (!value) {
              console.error('Trying to make a node without a value.')
              return
            }
            log('new', revRoot)
            child = children[revRoot] = {
              key: revRoot,
              value,
              unsaved: isDraft(key),
              heads: {[key]: value.timestamp},
              internals: [],
              tail: key,
              queue: [],
              links: links(kv)
            }
            debug(child)
            ignoreDraft(value)
            if (!doBuffer) push(Object.assign({revision: kv.key}, child))
            return
          }
        } else {
          // This is a request to remove a draft
          // type === 'del' events have no `value` and therefor no
          // revRoot. We need to find the child that has this draft as a head
          let entry = Object.entries(children).find( ([k,v])=>includesAll(key, Object.keys(v.heads)) )
          if (!entry) throw Error("Can't find child with draft", key)
          child = entry[1]
        }

        // we have a child for that revRoot already

        // Can we fit one of the  unattached puzzle pieces on one end or
        // the other?
        function fit() {
          let success = false
          child.queue = child.queue.filter( (x)=> {

            let pos = isLinked(child, x)
            if (!pos) {
              log('internals', child.internals)
              // Does it link to one or more internal node?
              // then it creates a new head.
              if (links(x) && includesAll(links(x), child.internals)) {
                //child.heads = append(child.heads, x.key, {arrayResult: true})
                addHead(child, x.key, x.value.timestamp)
                // Overwrite node value, if claimed time is grater
                log('internal link, added head, new heads', child.heads)
                ignoreDraft(x.value)
                
                let heads = Object.keys(child.heads).sort( (a,b)=>{
                  return child.heads[a] - child.heads[b]
                })
                let headIndex = heads.indexOf(x.key)
                if (headIndex === heads.length - 1) {
                  // this is the latest head
                  child.value = x.value
                  if (!doBuffer) push(Object.assign({revision: x.key, pos: 'head'}, child))
                } else {
                  // not the latest head, do not change node value
                  if (opts.allRevisions) {
                    let pos = {before: heads[headIndex+1], after: links(x)}
                    if (headIndex>0) pos.after.push(heads[headIndex-1])
                    if (!doBuffer) push(Object.assign({}, child, {revision: x.key, pos, value: kv.value}))
                  }
                }
                return false
              }
              log('keep in queue')
              return true // keep in queue
            }

            if (x.value) ignoreDraft(x.value)

            if (pos === -1) { 
              success = true
              child.links = replace(child.links || [], x.key, links(x), {moveTo: child.internals})
              if (isDraft(child.tail)) {
                child.valueBeforeDraft = x.value
              }
              child.tail = x.key
              debug(child)
              if (opts.allRevisions && !doBuffer) push(Object.assign({}, child, {revision: kv.key, pos: 'tail', value: kv.value}))
              return false // remove from queue
            }

            // x fits after child

            // is it a draft deletion?
            if (x.type === 'del') {
              if (x.key === child.key) {
                delete children[child.key]
                if (!doBuffer) push(x)
              } else {
                child.internals = replace(child.internals, child.value.content.revisionBranch, [], {arrayResult: true})
                //child.heads = replace(child.heads, x.key, child.value.content.revisionBranch, {arrayResult: true})
                removeHead(child, x.key)
                forEach(child.value.content.revisionBranch, h=>{
                  addHead(child, h, child.value.timestamp)
                })
                child.value = child.valueBeforeDraft
                delete child.valueBeforeDraft
                child.unsaved = false
                debug(child)
                if (!doBuffer) push(Object.assign({type: 'revert'}, child))
              }
              return false
            }
          
            if (isDraft(x.key)) {
              child.valueBeforeDraft = child.value
              child.unsaved = true
            } else child.unsaved = false
            child.value = x.value

            child.internals = child.internals.slice() // copy array, it gets mutated in place by moveTo and that alters data we already pushed downstream.
            //child.heads = replace(child.heads || [], links(x) || [], x.key, {arrayResult: true, moveTo: child.internals})
            links(x).forEach( l=>{
              child.internals.push(l)
              removeHead(child, l)
            })
            addHead(child, x.key, x.value.timestamp)
            debug(child)
            if (!doBuffer) push(Object.assign({revision: x.key}, child))
            return false // remove from queue
          })
          return success
        }

        child.queue.push(kv)
        while(fit() && child.queue.length);
        log('queue', child.queue) 

        // TODO: handle re-parenting
        //  branch: <new parent's revisionRoot>
        //  moved-from: <old parent's revisionRoot>
        //
        //  ssb.links( many(rel: branch, rel: moved-from)
        //  If moved-from === ourBranch, put child key on ignoreRevRoot list, remove child, emit 'del' <child.key>
 
      }, (err)=>{
        flush()
        out.end(err)
      })
    )
    return out.source
  }
  through.get = (key) => children[key]
  return through
}

module.exports.includesAll = includesAll
module.exports.replace = replace
module.exports.append = append
