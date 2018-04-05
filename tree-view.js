// mutant
const h = require('mutant/html-element')
const MutantMap = require('mutant/map')
const Dict = require('mutant/dict')
const Value = require('mutant/value')
const Struct = require('mutant/struct')
const MutantArray = require('mutant/array')
const computed = require('mutant/computed')
const when = require('mutant/when')
const send = require('mutant/send')
const resolve = require('mutant/resolve')
// --
//
const pull = require('pull-stream')
const ref = require('ssb-ref')

const updates = require('./update-stream')() // no trusted keys
const {updateObservableMessages} = require('./message-cache')
const {isDraft} = require('./util')
const config = require('./cms-config')

module.exports = function(ssb, drafts, root, isTrustedKey) {

  let selection = Value()
  let ready = Value(false)

  function addNode(node) {
    let content = node.msg().content
    let value = {
      content: {
        root: content.root || node.id,
        branch: node.id,
        type: 'node'
      }
    }
    let json = JSON.stringify(value, null, 2)
    drafts.create(JSON.stringify(value, null, 2), node.id, null, null, (err, key)=>{
      if (err) throw err
    })
  }

  function cloneNode(node) {
    let content = node.msg().content
    let json = JSON.stringify(node.msg(), null, 2)
    drafts.create(json, content.branch, null, null, (err, key)=>{
      if (err) throw err
    })
  }
  
  function discardDraft(node) {
    drafts.remove(node.id, (err)=>{
      if (err) throw err
      if (selection() === node.id) {
        document.location.hash = ''
      }
    })
  }

  function selectId(id) {
    //console.log(this, id)
    // from https://stackoverflow.com/questions/11451353/how-to-select-the-text-of-a-span-on-click
    let selection = window.getSelection()
    let range = document.createRange()
    this.innerText = id
    range.selectNodeContents(this)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function html(node) {

    function _click(handler, args) {
      return { 'ev-click': function(e) { handler.apply(this, args)  }}
    }

    return h('li', [
      h('div', {
        classList: computed([node.open, isDraft(node.id), node.label], (open, draft, label) => {
          let l = ['branch']
          if (open) l.push('open')
          if (draft) l.push('draft')
          if (label.length && label[0] == '.') l.push('hidden')
          return l
        })
      }, [
        h('.branch-header', [
          h('span.triangle', {
            'ev-click': send(()=>{
              if (isDraft(node.id)) return
              node.open.set(!node.open())
            })
          }),
          h('span.msgNode', [ // TODO: do we need this?
            h('span.type-key', [
              h('span.type', node.type),
              h('a', {
                classList: selection() === node.id ? ['node', 'selected'] : ['node'],
                href: `#${node.id}`
              },
                h('span.name', node.label)
              )
            ]),
            when(node.unsaved, h('span', {title: 'draft'}, '✎')),
            when(node.forked, h('span', {title: 'conflicting updates, plese merge'}, '⑃')),
            when(computed([node.msg], v => isTrustedKey(v.author)), h('span.trusted', {title: 'Signed by trusted author'})),
            //when(node.incomplete, h('span', {title: 'incomplete history'}, '⚠')),
            h('span.buttons', [
              h('button.id', {
                'ev-click': function(e) { selectId.apply(this, [node.id]) },
                'ev-blur': function(e) { this.innerText = 'id' }
              }, 'id' ),
              when(node.open, h('button.add', _click(addNode, [node]), 'add' )),
              when(!isDraft(node.id), h('button.clone', _click(cloneNode, [node]), 'clone' )),
              when(isDraft(node.id), h('button.discard', _click(discardDraft, [node]), 'discard' ))
            ])
          ])
        ]),
        when(node.open, h('ul', MutantMap(node.children, html)))
      ])
    ])
  }

  function streamChildren(root, mutantArray, syncedCb) {
    let drain
    pull(
      ssb.cms.branches(root, {live: true, sync: true}),
      updates({
        allowUntrusted: true,
        live: true,
        sync: true,
        bufferUntilSync: true
      }),
      pull.filter( x=>{
        if (x.sync) syncedCb(null)
        return !x.sync
      }),
      drain = updateObservableMessages(mutantArray, {
        makeObservable: makeNode,
        updateObservable: updateNode
      })
    )
    return drain.abort
  }

  function updateNode(child, kv) {
    child.msg.set(kv.value)
    child.unsaved.set(kv.unsaved)
    child.forked.set(Object.keys(kv.heads).length > 1)
    child.incomplete.set(kv.tail !== kv.key || kv.queue.length !== 0)
  }

  function makeNode(kv) {
    let dict = Dict(kv.value)
    let label = computed([dict], x=>x.content && x.content.name)
    let type = computed([dict], x=>x.content && x.content.type)
    let node = Struct({
      msg: dict,
      label,
      type,
      open: false,
      unsaved: false,
      loaded: false,
      forked: false,
      incomplete: true,
      children: MutantArray()
    })
    node.id = kv.key
    let abortStream
    node.open( (isOpen)=> {
      if (isOpen) {
        abortStream = streamChildren(node.id, node.children, ()=>{
          node.loaded.set(true)
        })
      } else {
        abortStream()
        node.loaded.set(false)
        node.children.clear()
      }
    })
    return node
  }

  let roots = MutantArray()
  let lis = MutantMap(roots, html)
  let ul = h('ul', lis)
  let treeView = h('.treeView', ul)

  function ensureVisible(nodePath, cb) {

    function r(children, nodePath, cb) {
      let child = children.find( x=>x.id === nodePath[0])
      if (!child) return cb(new Error(`tree node not found at path: $(nodePath.join(' -> '))}`))
      nodePath.shift()
      if (!nodePath.length) return cb(null, child)
      
      if (!child.loaded()) {
        // we need to wait for the children to arrive
        let unsubscribe
        unsubscribe = child.loaded( (isLoaded)=>{
          if (isLoaded) {
            unsubscribe()
            r(child.children, nodePath, cb)
          }
        })
        child.open.set(true)
      } else r(child.children, nodePath, cb)
    }

    return r(roots, nodePath, cb)
  }


  function ancestors(msg, result, cb) {
    let branch = msg.content && msg.content.branch
    if (branch === config.sbot.cms.root) return cb(null, result)
    if (branch) {
      result.unshift(branch)
      ssb.cms.getMessageOrDraft(branch, (err, msg)=>{
        if (err) return cb(err)
        ancestors(msg, result, cb)
      })
    } else cb(null, result)
  }
  
  selection( (id)=>{
    if (!id) return
    // TODO: fastpath for when the TreeNode is already rendered
    ssb.cms.getMessageOrDraft(id, (err, msg) => {
      if (err) return console.error(err)
      let treeNodeId = msg.content && msg.content.revisionRoot || id
      ancestors(msg, [], (err, nodePath)=>{
        nodePath.push(treeNodeId)
        ensureVisible(nodePath, ()=>{
          treeView.querySelectorAll('.treeView .selected').forEach( el => el.classList.remove('selected') )
          let el = treeView.querySelector(`a.node[href="#${id}"]`)
          if (el) el.classList.add('selected')
        })
      })
    })
  })

  streamChildren(root, roots, (err)=>{
    if (err) throw err
    ready.set(true)
  })

  function findNode(key, children) {
    let node = children.find( x=>x.id === key )
    if (node) return node
    children.find( x=>{
      return node = findNode(key, x.children)
    })
    return node
  }

  treeView.selection = selection
  treeView.ready = ready
  treeView.update = function(key, value) {
    let node = findNode(key, roots)
    if (node) node.msg.set(value)
  }
  return treeView
}

module.exports.css = ()=>  `
    .branch.open>ul {
      margin: 0;
      padding: 0;
      //list-style: none;
      padding-left: 1em;
    }

    .branch>.branch-header>.triangle::before {
      content: '▶';
      color: #555;
      display: inline-block;
      width: 1em;
      font-size: .7em;
      margin-right: .5em;
      cursor: zoom-in;
    }

    .branch.open>.branch-header>.triangle::before {
      cursor: zoom-out;
      content: '▼';
    }



  ul {
    list-style: none;
  }
  .treeView>ul {
    padding-left: .5em;
  }
  span.key {
    color: #222;
    font-weight: bold;
    margin-right: .2em;
  }
  .branch {
    white-space: nowrap;
  }
  .branch-header {
    display: flex;
    flex-wrap: nowrap;
  }
  .branch-header>span.key {
    flex-grow: 1;
    display: inline-flex;
    flex-wrap: nowrap;
  }

  .msgNode {
    flex-grow: 1;
    display: inline-flex;
    flex-wrap: nowrap;
    justify-content: space-between;
  }

  .branch-header .buttons {
    flex-grow: 1;
    display: inline-flex;
    flex-wrap: nowrap;
    justify-content: flex-end;
  }

  .branch.hidden {
    display: none;
  }
  .show-hidden .branch.hidden {
    display: block;
    opacity: 0.7;
  }
  
  .branch>.branch-header button.add {
    display: none;
  }
  .branch.open>.branch-header button.add {
    display: inline-block;
  }

  .branch-header {
    background: #ddd;
    border-bottom: 1px solid #eee;
    border-top-left-radius: 8px;
    padding-left: .3em;
  }
  .draft .branch-header {
    background: #dedfb5;
  }
  .branch-header:hover {
    background: #ccc;
  }

  .branch-header button {
    background: transparent;
    border: none;
    border-radius: 0;
    color: #777;
    padding: 0 .4em;
  }

  button.id {
     max-width: 4em;
     overflow: hidden;
  }

  .branch-header button:hover {
    border-top: 1px solid #ccc;
    color: #eee;
    border-bottom: 1px solid #aaa;
  }

  a.node {
    color: #dde;
    text-decoration: none;
    margin-left: .2em;
  }
  a.node.draft {
    color: red;
    font-style: italic;
  }

  a.node>span.name {
    color: #161438;
    padding: 0px 4px;
    background: #babace;
  }

  a.node>span.name:hover {
    color: #0f0d25;
    background: #9f9fb1;
  }
  .node.selected>span.name,
  .node.selected>span.name:hover {
    color: #111110;
    background: #b39254;
  }

  a.node>span:hover {
    background-color: #226;
  }
  .node.selected>span {
    color: black;
    background: yellow;
  }
`
