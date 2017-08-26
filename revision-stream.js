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

module.exports = function updates(opts) {
  return function(read) {
    opts = opts || {}
    let children = []
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
              tail: key,
              queue: [],
              ignore: [],
              revBranch: append(value.content && value.content.revisionBranch || [],
                value.content && value.content.fromDraft)
            }
            console.log('new child', revRoot)
            console.log('new child links to past', child.revBranch)
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
          if (child.valueBeforeDraft) {
            console.log('valueBeforeDraft', child.valueBeforeDraft)
            console.log('heads before', child.heads)
            child.heads = replace(child.heads, key, child.value.content.revisionBranch, {arrayResult: true})
            console.log('heads after', child.heads)
            child.value = child.valueBeforeDraft
            delete child.valueBeforeDraft
            child.unsaved = false
            if (!doBuffer) out.push(Object.assign({}, child))
          } else {
            delete children[child.key]
            if (!doBuffer) out.push(kv)
          }
          return
        }

        // we have a child for that revRoot already
        if (child.ignore.includes(key)) {
          console.log('ingnoring', key)
          return
        }

        // Can we fit the unattached  puzzle piece on one end or
        // the other?
        function fit() {
          let success = false
          child.queue = child.queue.filter( x => {
            console.log('trying to fit', x.key)
            let revBranch = x.value.content && x.value.content.revisionBranch
            revBranch = append(revBranch || [], x.value.fromDraft)
            console.log('links to past', revBranch)
            // does x fit before the node?
            if (child.revBranch && includesAll(x.key, child.revBranch)) {
              console.log('fits before', child.key)
              success = true
              child.revBranch = replace(child.revBranch || [], x.key, revBranch)
              if (isDraft(child.tail)) {
                child.valueBeforeDraft = x.value
              }
              child.tail = x.key
              return false
            } else {
              // does x fit at one (or more) of the heads?
              if (revBranch && includesAll(revBranch, child.heads)) {
                success = true
                console.log('fits behind', child.key)
                if (isDraft(x.key)) {
                  child.valueBeforeDraft = child.value
                  child.unsaved = true
                } else child.unsaved = false
                child.value = x.value
                if (x.value.fromDraft) {
                  // this message was created from a draft,
                  // if we see that draft later (it might still exist)
                  // we just ignore it
                  child.ignore.push(x.value.fromDraft)
                }
                child.heads = replace(child.heads || [], revBranch || [], x.key, {arrayResult: true})
                console.log('new heads:', child.heads)
                if (!doBuffer) out.push(Object.assign({}, child))
                return false
              }
            }
            return true
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
