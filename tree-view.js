const h = require('hyperscript')
const ho = require('hyperobj')
const observable = require('observable')
const u = require('hyperobj-tree/util')
const tree = require('hyperobj-tree/tree')
const properties = require('hyperobj-tree/properties')
const kv = require('hyperobj-tree/kv')
const source = require('hyperobj-tree/source')
const array = require('hyperobj-tree/array')
const filter = require('hyperobj-tree/filter')
const tag = require('hyperobj-tree/tag')
const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const ssbSort = require('ssb-sort')

function filterRevisions() {
  // return only latest revisions
  return function (read) {
    var queue, _err, _cb
    var heads = {}, roots = {}
    var drain = pull.drain(function (msg) {
      let c = msg.value.content
      var revisionBranch = msg.value.revisionBranch || (c && c.revisionBranch)
      if (revisionBranch) {
        if (heads[revisionBranch]) delete heads[revisionBranch]
        else roots[revisionBranch] = true
      }
      if (roots[msg.key]) delete roots[msg.key]
      else heads[msg.key] = msg
    }, function (_err) {
      queue = ssbSort(Object.keys(heads).map(key => heads[key]))
      if (_cb) {
        let cb = _cb
        _cb = null
        if (_err) cb(_err)
        else if (queue.length) cb(null, queue.shift())
        else cb(true)
      } else {
        _err = err
      }
    })(read)
    return function (abort, cb) {
      if (abort) {
        if (drain) {
          let _drain = drain
          drain = null
          return _drain.abort(abort, cb)
        }
        return read(abort, cb)
      }
      if (_err) cb(_err)
      else if (!queue) _cb = cb
      else if (queue.length) return cb(null, queue.shift())
      else cb(true)
    }
  }
}

module.exports = function(ssb, drafts, root, cb) {
  let selection = observable.signal()

  selection( (el)=>{
    document.querySelectorAll('.treeView .selected').forEach( el => el.classList.remove('selected') )
    if (el) el.classList.add('selected')
  })

  function branches(root) {
    return function() {
      return pull(
         many([
          root && ref.type(root) ? pull(
            ssb.links({
              rel: 'branch',
              dest: root,
              keys: true,
              values: true
            }),
            pull.unique('key')
          ) : pull.empty(), // TODO: get all root messages
          drafts.byBranch(root)
        ]),
        filterRevisions()
      )
    }
  }

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
        let ul = el.tagName === 'UL' ? el : el.querySelector('ul')
        ul.appendChild( h('li', render({key, value})) )
      })
    })
  }

  function clone(el, id) {
    ssb.get(id, (err, value) => {
      if (err) throw err
      drafts.create(JSON.stringify(value,null,2), value.content.branch, null, null, (err, key)=>{
        let ul = ancestorWithTagName('ul', el.parentElement)
        ul.appendChild( h('li', render({key, value})) )
      })
    })
  }

  function discard(el, id) {
    drafts.remove(id, (err)=>{
      if (err) throw err
      if (selection() && selection().id === id) {
        selection(null)
      }
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

  var render = ho(
    function(msg, kp) {
      if (!msg.key || !msg.value) return
      let value = msg.value
      if (typeof value === 'function') return
      if (typeof value === 'object' && !value.content && !value.msgString) return
      let content = value.content || safeParse(value.msgString).content
      let id = (content && content.revisionRoot) || msg.key
      let t = (content && content.type) || 'Invalid'
      let name = content && content.name
      let kv = { type: 'key-value', key: {type: 'msg-node', msg_type: t, msg_name: name, id}, value: branches(id) }
      return this.call(this, kv, kp)
    },

    function(msgNode, kp) {
      if (!msgNode.type || msgNode.type != 'msg-node') return
      kp = kp || []
      let id = msgNode.id
      let type = msgNode.msg_type
      let name = msgNode.msg_name
      return h('span.msgNode',
        h('span.type-key',
          this.call(this, type, kp.concat(['msg_type'])),
          this.call(this, name ? {type: 'msg-link', name, link: id} : id, kp.concat(['key']))
        ), 
        /^draft/.test(id) ? h('span.buttons', 
          h('button.discard', 'discard', {
            onclick: function() { discard( ancestorWithTagName('li', this), id) }
          })
        ) : h('span.buttons',
          h('button.add', 'add', {
            onclick: function() { addChild(ancestorWithClass('branch', this), id) }
          }),
          h('button.clone', 'clone', {
            onclick: function() { clone(ancestorWithClass('branch', this), id) }
          })
        )
      )
    },

    function(value, kp) {
      if (value.type !== 'msg-link') return
      return h('a.node', {
        id: value.link,
        onclick: function(e)  {
          selection(this)
          e.preventDefault()
        } },
        h('span.name', value.name)
      )
    },

    filter( value => h('a.node', {
      id: value,
      onclick: function(e)  {
        selection(this)
        e.preventDefault()
      }
    }, tag(8)(value.substr(0,8))), ref.type),

    filter( value => h('a.node.draft', {
      id: value,
      onclick: function(e)  {
        selection(this)
        e.preventDefault()
      }
    }, h('span', value.substr(0, 14))), (value) => /^draft/.test(value) ),
    tree(),
    source(),
    array(),
    properties(),
    kv(),
    ho.basic()
  )

  ssb.get(root, (err, value) => {
    if (err) return cb(err)
    let ul
    cb(null,
      h('.treeView',
        h('.toolbar',
          h('button', 'Create root node', {
            onclick: function() {
              addChild(ul, root)
            }
          })
        ),
        ul = render(branches(root))
      )
    )
  })

  render.selection = observable.transform( selection, el => el && el.id )
  render.branches = (root)=>branches(root)()
  render.update = (key, value, newKey) => {
    newKey = newKey || key
    const el = document.getElementById(key)
    const header = ancestorWithClass('branch-header', el)
    const newEl = render({key: newKey, value})
    const newHeader = newEl.querySelector('.branch-header')
    let sel = selection() && selection().id === key
    header.parentElement.insertBefore(newHeader, header)
    header.parentElement.removeChild(header)
    if (key === newKey) {
      newHeader.querySelector('a.node').classList.add('selected')
    } else selection(newHeader.querySelector('a.node'))
  }
  render.remove = (key) => {
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
