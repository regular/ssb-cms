//const hs = require('hyperscript-nested-contexts')(require('hyperscript'))
//const ho = require('hyperobj-context')(require('hyperobj'), hs)

// mutant
const h = require('mutant/html-element')
const MappedArray = require('mutant/mapped-array')
const MutantMap = require('mutant/map')
const Dict = require('mutant/dict')
const Struct = require('mutant/struct')
const MutantArray = require('mutant/array')
const computed = require('mutant/computed')
const when = require('mutant/when')
const send = require('mutant/send')
const resolve = require('mutant/resolve')

//const observable = require('observable')
//const u = require('hyperobj-tree/util')
const tree = require('hyperobj-tree/tree')
//const properties = require('hyperobj-tree/properties')
//const kv = require('hyperobj-tree/kv')
//const source = require('hyperobj-tree/source')
//const array = require('hyperobj-tree/array')
const filter = require('hyperobj-tree/filter')
const tag = require('hyperobj-tree/tag')
const ref = require('ssb-ref')
const pull = require('pull-stream')

module.exports = function(ssb, drafts, root, cb) {
  return
  let selection = observable.signal()
  //let nodes = {}

  selection( (el)=>{
    document.querySelectorAll('.treeView .selected').forEach( el => el.classList.remove('selected') )
    if (el) el.classList.add('selected')
  })

  function addChild(el, parentId) {
    ssb.get(parentId, (err, parent) => {
      if (err) throw err
      let value = {
        content: {
          root: parent.content.root || parentId,
          branch: parentId,
          type: 'node'
        }
      }
      drafts.create(JSON.stringify(value,null,2), parentId, null, null, (err, key)=>{
        // TODO: leak: event hander will not be removed when the parent node
        // is collapes. It would be much better, if the hyperobj-tree used a live stream
        // and therefor autmatically would append the new node to the dom (in the correct
        // hyperscript context)
        let ul = el.tagName === 'UL' ? el : el.querySelector('ul')
        //h = nodes[parentId].ctx.innerContext
        //console.log('innerContext', h)
        const h = hs
        ul.appendChild( h('li', render(h)({key, value})) )
      })
    })
  }

  function clone(el, id) {
    ssb.get(id, (err, value) => {
      if (err) throw err
      drafts.create(JSON.stringify(value,null,2), value.content.branch, null, null, (err, key)=>{
        // TODO: leak, see above
        let ul = ancestorWithTagName('ul', el.parentElement)
        const h = hs
        ul.appendChild( h('li', render()({key, value})) )
      })
    })
  }

  function discard(el, id) {
    drafts.remove(id, (err)=>{
      if (err) throw err
      if (selection() && selection().id === id) {
        selection(null)
      }
      // TODO: leak, the event handler is not removed
      el.parentElement.removeChild(el)
    })
  }

  function ancestorWithTagName(tag, el) {
    if (el.tagName === tag.toUpperCase()) return el
    return ancestorWithTagName(tag, el.parentElement)
  }

  function ancestorWithClass(cls, el) {
    if (!el) return null
    if (el.classList.contains(cls)) return el
    return ancestorWithClass(cls, el.parentElement)
  }

  function safeParse(s) {
    try {
      return JSON.parse(s)
    } catch(e) {}
    return {}
  }

  function render() {
    return function() {return h('span', 'nothing')}
    return function html(node) {
      return h('li', [
        h('span.triangle', {
          'ev-click': send(()=>{
            node.open.set(!node.open())
          })
        }),
        h('span.type', node.type),
        ' ',
        h('span.name', node.label),
        when(node.open, h('ul', MutantMap(node.children, html)))
      ])
    }
    return ho(
      function(kv, kp) {
        if (!kv.key || !kv.value) return
        let msg = kv.value
        if (typeof nsg === 'function') return
        if (typeof msg === 'object' && !msg.content && !msg.msgString) return
        let content = msg.content || safeParse(msg.msgString).content

        let id = (content && content.revisionRoot) || kv.key

        let type = (content && content.type) || 'Invalid'
        let name = content && content.name
        children = ssb.cms.branches(id) 

        return h('div.branch.open', [
          h('div.branch-header', [
            h('span.triangle'),
            h('span.key', [
              h('span.msgNode', [
                h('span.type-key', type),
                h('a.node', {
                  id: value.link,
                  onclick: function(e)  {
                    selection(this)
                    e.preventDefault()
                  } }, [
                    h('span.name', name)
                  ]
                ),
                /^draft/.test(id) ? h('span.buttons', 
                  h('button.discard', 'discard', {
                    onclick: function() { discard( ancestorWithTagName('li', this), id) }
                  })
                ) : h('span.buttons', [
                  h('button.add', 'add', {
                    onclick: function() { addChild(ancestorWithClass('branch', this), id) }
                  }),
                  h('button.clone', 'clone', {
                    onclick: function() { clone(ancestorWithClass('branch', this), id) }
                  })
                ])
              ])
            ])
          ])
        ])
      },

      filter( function(value) {
        return h('a.node', {
          id: value,
          onclick: function(e)  {
            selection(this)
            e.preventDefault()
          }
        }, tag(8)(value.substr(0,8)))
      }, ref.type),

      filter( function(value) {
        return h('a.node.draft', {
          id: value,
          onclick: function(e)  {
            selection(this)
            e.preventDefault()
          }
        }, h('span', value.substr(0, 14)))
      }, value => /^draft/.test(value) )
    )
  }

  ssb.get(root, (err, value) => {
    if (err) return cb(err)
    let ul
    const h = hs
    cb(null,
      h('.treeView',
        h('.toolbar',
          h('button', 'Create root node', {
            onclick: function() {
              addChild(ul, root)
            }
          })
        ),
        ul = render()(ssb.cms.branches(root))
      )
    )
  })

  render.selection = observable.transform( selection, el => el && el.id )
  render.update = (key, value, newKey) => {
    // TODO: leaks event handler
    // Probably would be better if a node observes its message value
    newKey = newKey || key
    const el = document.getElementById(key)
    const header = ancestorWithClass('branch-header', el)
    const newEl = render()({key: newKey, value})
    const newHeader = newEl.querySelector('.branch-header')
    let sel = selection() && selection().id === key
    header.parentElement.insertBefore(newHeader, header)
    header.parentElement.removeChild(header)
    if (key === newKey) {
      newHeader.querySelector('a.node').classList.add('selected')
    } else selection(newHeader.querySelector('a.node'))
  }
  render.remove = (key) => {
    // TODO: leaks event handler
    const el = ancestorWithTagName('li', document.getElementById(key))
    if (el) el.parentElement.removeChild(el)
    if (selection() && selection().id === key) selection(null)
  }
  return render
}

module.exports.css = ()=> tree.css() + `
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
