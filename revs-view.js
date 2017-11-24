require('setimmediate')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const MutantArray = require('mutant/array')
const MutantMap = require('mutant/map')
const computed = require('mutant/computed')
const when = require('mutant/when')
const send = require('mutant/send')

const pull = require('pull-stream')
const htime = require('human-time')
const ssbAvatar = require('ssb-avatar')
const memo = require('asyncmemo')
const lru = require('hashlru')

const {isDraft, arr} = require('./util')
const SortStream = require('./sort-stream')

function markHeads(entries) {
  const o = {}
  entries.forEach( e => {
    e.isHead = true
    o[e.key] = e
  })
  entries.forEach( e => {
    let revBranch = e.value.content && e.value.content.revisionBranch
    if (revBranch && o[revBranch]) o[revBranch].isHead = false
  })
}

module.exports = function(ssb, drafts, me, blobsRoot, trusted_keys) {

  let getAvatar = memo({cache: lru(50)}, function (id, cb) {
    ssbAvatar(ssb, me, id, (err, about)=>{
      if (err) return cb(err)
      let name = about.name
      if (!/^@/.test(name)) name = '@' + name
      let imageUrl = about.image ? `${blobsRoot}/${about.image}` : null
      cb(null, {name, imageUrl})
    })
  })

  let selection = Value()
  let root = Value()
  let currRoot = null
  let ready = Value(false)

  function discardDraft(node) {
    drafts.remove(node.id, (err)=>{
      if (err) throw err
      let hash = document.location.hash
      if (!isDraft(hash.substr(1))) { 
        if (hash.indexOf(':') !== -1) {
          document.location.hash = hash.split(':')[0]
        }
        selection.set('latest')
      } else {
        document.location.hash = ''
      }
    })
  }

  function html(entry) {

    function _click(handler, args) {
      return { 'ev-click': send( e => handler.apply(e, args) ) }
    }

    let feedId = isDraft(entry.key) ? me : entry.value.author
    let authorAvatarUrl = Value(null, {defaultValue: ""})
    let authorName = Value(null, {defaultValue: feedId.substr(0,6)})
    getAvatar(feedId, (err, avatar) =>{
      if (err) return console.error(err)
      authorAvatarUrl.set(avatar.imageUrl || "")
      authorName.set(avatar.name)
    })

    return h(`div.rev${isDraft(entry.key) ? '.draft' : ''}${entry.isHead ? '.head' : ''}`, {
      classList: computed([selection], sel => sel === entry.key ? ['selected'] : []),
      'ev-click': e => {
        document.location.hash = `#${root()}:${entry.key}`
      }
    }, [
      h('div.avatar', {
        style: {
          'background-image': computed([authorAvatarUrl], u => `url("${u}")`)
        }
      }, [
        ...(trusted_keys.includes(feedId) ? [h('span.trusted')] : [])
      ]),
      h('span.author', authorName),
      h('span.timestamp', htime(new Date(entry.value.timestamp))),
      h('span.node', 
        ((entry.value.content && entry.value.content.revisionBranch) ? 
        entry.value.content.revisionBranch.substr(0,6) + ' → ' : '⤜') +
        entry.key.substr(0,6)
      ),
      ...(isDraft(entry.key) ? [h('span', {title: 'draft'}, '✎')] : []),
      h('span.buttons', [
        ...(isDraft(entry.key) ? [h('button.discard', _click(discardDraft, [entry]), 'discard' )] : [])
      ])
    ])
  }

  let sortStream = SortStream(ssb, drafts)
  let mutantArray = MutantArray()
  let selectedLatest = false

  function streamRevisions(id, syncCb) {
    //console.log('streaming revisions of', id)
    let drain
    let entries
    let synced = false
    pull(
      sortStream(id),
      drain = pull.drain( _entries =>{
        if (_entries.sync) {
          synced = true
          mutantArray.set(entries)
          return syncCb(null, entries)
        }
        entries = _entries
        markHeads(entries)
        if (synced) {
          mutantArray.set(entries)
          if (selectedLatest) {
            selection.set('latest')
          }
        }
      }, err =>{
        if (err) console.error('Revisions stream ends  with error', err)
      })
    )
    return drain.abort
  }

  let containerEl = h('revs', MutantMap(mutantArray, html))
  let abort

  selection( id => {
    selectedLatest = false
    if (id === 'latest') {
      if (mutantArray.getLength() > 0) {
        selection.set(mutantArray.get(mutantArray.getLength()-1).id)
      } else selection.set(null)
      selectedLatest = true
    }
    console.log('rev selected', id)
  })

  root( id => {
    if (currRoot === id) {
      return ready.set(true)
    }
    //console.log('NEW rev root', id)
    currRoot = id

    if (abort) abort()
    abort = null
    selection.set(null)
    ready.set(false)
    entries = []
    mutantArray.clear()
    if (!id) return

    abort = streamRevisions(id, err => {
      if (err) console.error('streaming revisions failed with error', err)
      else console.log('revisions synced')
      ready.set(true)
    })
  })

  containerEl.selection = selection
  containerEl.root = root
  containerEl.ready = ready

  return containerEl
}

module.exports.css = ()=> `
  .rev {
    cursor: alias;
    position: relative;
    font-size: 11px;
    color: #6b6969;
    background-color: #eee;
    margin: 1px 1px 0 1px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: wrap;
    max-height: 32px;
    align-content: flex-start;
  }
  .rev.head {
    border-width: 2px;
    border-style: dotted;
    border-color: rgba(0,0,0,0.1);
    background: #e0e0ff;
    margin-right: -1.2em;
  }
  .rev.head .node::after {
    content: "⚈";
    margin-left: .5em;
  }
  .rev.selected {
    color: #111110;
    background: #b39254;
  }
  .rev .node {
    position: absolute;
    right: 1em;
    top: .5em;
    order: 3;
    font-family: monospace;
    font-size: 12px;
  }
  .rev .avatar {
    margin: 0 8px;
    height: 32px;
    width: 32px;
    border-radius: 3px;
    background-size: cover;
  }
  .rev .author, .rev .timestamp {
    width: 80px;
    white-space: nowrap;
  }
  .rev .author {
    padding-top: 3px;
  }
`
