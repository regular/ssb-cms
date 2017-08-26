const pull = require('pull-stream')
const pushable = require('pull-pushable')

function isDraft(id) {
  return /^draft/.test(id)
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

function links(kv, opts) {
  opts = opts || {}
  if (kv.type === 'del') return [kv.key]
  let links = kv.value.content && kv.value.content.revisionBranch
  if (opts.fromDraft) {
    links = append(links || [], kv.value.content && kv.value.content['from-draft'] || [], {arrayResult: true})
  } else {
    links = append(links || [], [], {arrayResult: true}) // just for arryifying
  }
  return links
}

// Is there a causal link between a and b?
// +1 == b fits after a (link from b to a)
// -1 == b fits before a (link from a to b)
//  0 == there's no connection

function isLinked(child, x) {
  console.log('trying to fit', x.key)
  // does b fit before a?
  let aLinks = links(child, {fromDraft: true})
  let bLinks = links(x)
  console.log('mandatory links from', x.key, bLinks)
  if (aLinks && includesAll(x.key, aLinks)) {
    console.log(x.key, 'fits before', child.key)
    return -1
  } else if (bLinks && includesAll(bLinks, child.heads)) {
    // does b fit at one (or more) of a's heads?
    if (x.type === 'del') {
      // to delete the draft it either needs to be the rev root,
      // or it needs to have `valueBefireDraft` set.
      if (child.key !== x.key && !child.valueBeforeDraft) return 0
    }
    console.log(x.key, 'fits behind', child.key)
    return +1
  }
  return 0
}

module.exports = function updates(opts) {
  return function(read) {
    opts = opts || {}
    let children = []
    let ignore = []
    let doBuffer = opts.sync // in sync mode, we buffer until we see a sync
    let drain
    let out = pushable(true, function (err) {
      console.log('out stream closed by client!', err)
      drain.abort(err)
    })
    pull(
      read,
      pull.filter( x=>{
        if (x.sync) {
          // push current children states
          if (doBuffer) {
            children.forEach( c=> out.push(Object.assign({},c)) )
            doBuffer = false
          }
          out.push(kv)
          return false
        }
        return true
      }),

      drain = pull.drain( (kv) => {
        let {key, value} = kv

        if (ignore.includes(key)) {
          console.log('ingnoring', key)
          if (kv.type === 'del') ignore = ignore.filter( k => k !== key)
          console.log('new ignore list', ignore)
          return
        }
        
      let revRoot = value && value.content && value.content.revisionRoot || key
        console.log('key', key, 'revRoot', revRoot)
        // do we have a child for that revRoot yet?
        let child
        if (kv.type !== 'del') {
          child = children[revRoot]
          if (!child) {
            if (!value) throw new Error('Trying to make a node without a value.')
            child = children[revRoot] = {
              key: revRoot,
              value,
              unsaved: isDraft(key),
              heads: [key],
              internals: [],
              tail: key,
              queue: [],
              links: links(kv, {fromDraft: true})
            }
            console.log('new child', revRoot)
            console.log('new child links to past', child.links)
            if (value.content['from-draft']) {
              // this message was created from a draft,
              // if we see that draft later (it might still exist)
              // we just ignore it
              ignore.push(value.content['from-draft'])
              console.log('new ignore list', ignore)
            }
            if (!doBuffer) out.push(Object.assign({}, child))
            return
          }
        } else {
          console.log('del', key)
          // This is a request to remove a draft
          // type === 'del' events have no `value` and therefor no
          // revRoot. We need to find the child that has this draft as a head
          let entry = Object.entries(children).find( ([k,v])=>includesAll(key, v.heads) )
          console.log('child', entry)
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
              // Does it link to one or more internal node?
              // then it creates a new head.
              if (links(x) && includesAll(links(x), child.internals)) {
                child.heads = append(child.heads, x.key, {arrayResult: true})
                console.log(x.key, 'fits internally, new heads', child.heads)
                // TODO: overwrite node value, if claimed time is grater
                if (!doBuffer) out.push(Object.assign({}, child))
                return false
              }
              return true // keep in queue
            }

            if (x.value && x.value.content['from-draft']) {
              // this message was created from a draft,
              // if we see that draft later (it might still exist)
              // we just ignore it
              ignore.push(x.value.content['from-draft'])
              console.log('new ignore list', ignore)
            }

            if (pos === -1) { 
              success = true
              child.links = replace(child.links || [], x.key, links(x, {fromDraft: true}), {moveTo: child.internals})
              console.log('new internals', child.internals)
              if (isDraft(child.tail)) {
                child.valueBeforeDraft = x.value
              }
              child.tail = x.key
              return false // remove from queue
            }

            // x fits after child

            // is it a draft deletion?
            if (x.type === 'del') {
              if (x.key === child.key) {
                delete children[child.key]
                if (!doBuffer) out.push(x)
              } else {
                console.log('valueBeforeDraft', child.valueBeforeDraft)
                console.log('heads before', child.heads)
                console.log('internals before', child.internals)
                child.internals = replace(child.internals, child.value.content.revisionBranch, [], {arrayResult: true})
                child.heads = replace(child.heads, x.key, child.value.content.revisionBranch, {arrayResult: true})
                console.log('heads after', child.heads)
                console.log('internals after', child.internals)
                child.value = child.valueBeforeDraft
                delete child.valueBeforeDraft
                child.unsaved = false
                if (!doBuffer) out.push(Object.assign({}, child))
              }
              return false
            }
          
            if (isDraft(x.key)) {
              child.valueBeforeDraft = child.value
              child.unsaved = true
            } else child.unsaved = false
            child.value = x.value

            child.internals = child.internals.slice() // copy array, in gets mutated in place by moveTo and that alters data we already pushed downstream.
            child.heads = replace(child.heads || [], links(x, {fromDraft: true}) || [], x.key, {arrayResult: true, moveTo: child.internals})
            console.log('new internals', child.internals)
            console.log('new heads:', child.heads)
            if (!doBuffer) out.push(Object.assign({}, child))
            return false // remove from queue
          })
          return success
        }
        child.queue.push(kv)
        while(fit() && child.queue.length);

        // TODO: handle re-parenting
      }, (err)=>{
        out.end(err)
      })
    )
    return out.source
  }
}

module.exports.includesAll = includesAll
module.exports.replace = replace
module.exports.append = append
