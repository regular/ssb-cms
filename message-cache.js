// pull drains that receives updates from update-stream
// and keeps a cache of observable message objects
const pull = require('pull-stream')
const MutantDict = require('mutant/dict')
const MutantArray = require('mutant/array')

function cacheAndIndex(opts) {
  opts = opts || {}
  let branches = {}
  let messages = {}
  let ret

  pull(
    ret = updateObservableMessages(null, {
      makeObservable: (key, msg) => {
        let d = MutantDict(msg)
        messages[key] = d
        return d
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

function updateObservableMessages(container, opts) {
  opts = opts || {}
  let makeObservable = opts.makeObservable
  if (!makeObservable) throw new Error('You need to pass makeObservable')

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
    }

    if (!child) {
      if (!value) return console.error('Trying to make a node without a value. This is bad.')
      child = makeObservable(key, value)

      // if this is a new child that was just created from a draft,
      // make sure to get rid of the draft
      let fromDraft = value.content && value.content['from-draft']
      if (fromDraft) {
        let draft = mutantArray.find( x=> x.id === fromDraft )
        if (draft) mutantArray.delete(draft)
      }
      mutantArray.push(child)
    } else {
      child.msg.set(value)
    }

    // TODO
    if (child.unsaved) child.unsaved.set(kv.unsaved)
    if (child.foreked) child.forked.set(Object.keys(kv.heads).length > 1)
    if (child.incomplete) child.incomplete.set(kv.tail !== key)
  }, (err)=>{
    if (err) throw err
    console.log('stream ended', err)
  })
 
  return ret
}

module.exports = {
  cacheAndIndex,
  updateObservableMessages
}
