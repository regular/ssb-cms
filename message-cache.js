// pull drains that receives updates from update-stream
// and keep a cache of observable message objects
const pull = require('pull-stream')
const MutantDict = require('mutant/dict')
const MutantArray = require('mutant/array')

// TODO: this does not account for messages changing branches!

function cacheAndIndex(opts) {
  opts = opts || {}
  let branches = {}
  let messages = {}
  let ret

  pull(
    ret = updateObservableMessages(null, {
      makeObservable: kv => {
        let d = MutantDict(kv)
        messages[kv.key] = d
        return d
      },
      updateObservable: (child, kv) => {
        child.set(kv)
      },
      getContainer: kv => {
        let {key, value} = kv
        let branch = value.content && value.content.branch || 'ROOTS'
        let mutantArray = branches[branch]
        if (!mutantArray) {
          mutantArray = branches[branch] = MutantArray()
        }
        return mutantArray
      }
    })
  )
  ret.getChildrenObservable = parentId => branches[parentId]
  ret.getMessageObservable = msgId => messages[msgId]
  return ret
}

function updateObservableMessages(container, opts, cb) {
  opts = opts || {}
  let makeObservable = opts.makeObservable
  let updateObservable = opts.updateObservable
  if (!makeObservable) throw new Error('You need to pass makeObservable')
  if (!updateObservable) throw new Error('You need to pass updateObservable')

  let currentRevisions = {} // needed to implement revert, because update-stream doesn't give as the revision we revert to
  let previousRevisions = {}

  let ret = pull.drain( kv => {
    let mutantArray = container || opts.getContainer(kv)
    let {key, value} = kv
    // do we have a child for that revRoot yet?
    let child = mutantArray.find( x=> x.id === key )

    // Is this a request to remove a draft?
    if (kv.type === 'del') {
      if (child) {
        mutantArray.delete(child)
      } else console.error('Request to delete non-existing child', key)
      return
    } else if (kv.type === 'revert') {
      if (kv.remove !== currentRevisions[kv.key]) throw new Error('revert to unknow revision')
      kv.revision = previousRevisions[kv.key]
    }

    if (!child) {
      if (!value) return console.error('Trying to make a node without a value. This is bad.')
      child = makeObservable(kv)
      child.id = kv.key
      // if this is a new child that was just created from a draft,
      // make sure to get rid of the draft
      let fromDraft = value.content && value.content['from-draft']
      if (fromDraft) {
        delete currentRevisions[fromDraft]
        let draft = mutantArray.find( x=> x.id === fromDraft )
        if (draft) mutantArray.delete(draft)
      }
      mutantArray.push(child)
    } 
    if (currentRevisions[kv.key] !== kv.revision) {
      previousRevisions[kv.key] = currentRevisions[kv.key]
      currentRevisions[kv.key] = kv.revision
    }

    updateObservable(child, kv)
  }, cb || (err => {
    if (err) console.error('updateObservableMessages: stream ended', err)
  }))
 
  return ret
}

module.exports = {
  cacheAndIndex,
  updateObservableMessages
}
