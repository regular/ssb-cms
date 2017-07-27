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

module.exports = function(ssb, drafts, root, cb) {
  let selection = observable.signal()

  selection( (el)=>{
    document.querySelectorAll('.selected').forEach( el => el.classList.remove('selected') )
    if (el) el.classList.add('selected')
  })

  function branches(root) {
    return function() {
      return pull(
         many([
          root && ref.type(root) ?
            ssb.links({
              rel: 'branch',
              dest: root,
              keys: true,
              values: true
            }) 
          : pull.empty(), // TODO: get all root messages
          drafts.byBranch(root)
        ]),
        pull.through(console.log)
      )
    }
  }

  function addChild(el, parentId) {
    console.log('addChild')
    let value = {
      content: {
        type: 'post'
      }
    }
    drafts.create(JSON.stringify(value,null,2), parentId, null, (err, key)=>{
      let ul = el.tagName === 'UL' ? el : el.querySelector('ul')
      ul.appendChild( h('li', render({key, value})) )
    })
  }

  function clone(el, id) {
    console.log('clone')
    ssb.get(id, (err, value) => {
      if (err) throw err
      drafts.create(JSON.stringify(value,null,2), value.content.branch, value.content.revisionRoot, (err, key)=>{
        let ul = ancestorWithTagName('ul', el.parentElement)
        ul.appendChild( h('li', render({key, value})) )
      })
    })
  }

  function ancestorWithTagName(tag, el) {
    console.log(el.tagName)
    if (el.tagName === tag.toUpperCase()) return el
    return ancestorWithTagName(tag, el.parentElement)
  }

  function ancestorWithClass(cls, el) {
    if (el.classList.contains(cls)) return el
    return ancestorWithClass(cls, el.parentElement)
  }

  var render = ho(
    function(msg, kp) {
      if (!msg.key || !msg.value) return
      let v = msg.value
      if (typeof v === 'string') { // drafts might by unparsable json strings
        try { v = JSON.parse(v) } catch(e) {}
      } else if (!msg.value.content) return
      let t = (v.content && v.content.type) || 'Invalid'
      let value = { type: 'key-value', key: {type: 'msg-node', msg_type: t, id: msg.key}, value: branches(msg.key) }
      return this.call(this, value, kp)
    },

    function(msgNode, kp) {
      if (!msgNode.type || msgNode.type != 'msg-node') return
      kp = kp || []
      //console.log(JSON.stringify(kp))
      let id = msgNode.id
      let type = msgNode.msg_type
      return h('span.msgNode',
        this.call(this, type, kp.concat(['msg_type'])),
        this.call(this, id, kp.concat(['key'])),
        h('button.add', 'add', {
          onclick: function(e) { addChild(ancestorWithClass('branch', this), id) }
        }),
        h('button.clone', 'clone', {
          onclick: function(e) { clone(ancestorWithClass('branch', this), id) }
        })
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
        h('.addRoot',
          h('span', 'Create root node'),
          h('button', '+', {
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
  return render
}

module.exports.css = tree.css
