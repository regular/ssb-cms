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

module.exports = function(ssb) {
  let selection = observable.signal()

  selection( (el)=>{
    document.querySelectorAll('.selected').forEach( el => el.classList.remove('selected') )
    if (el) el.classList.add('selected')
  })

  function branches(root) {
    return function() {
      return ssb.links({
        rel: 'branch',
        dest: root,
        keys: true,
        values: true
      })
    }
  }

  let render = ho(
    function(msg, kp) {
      if (!msg.key || !msg.value || !msg.value.content) return
      let value = { type: 'key-value', key: {type: 'msg-node', msg_type: msg.value.content.type, id: msg.key}, value: branches(msg.key) }
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
        this.call(this, id, kp.concat(['key']))
      )
    },
    filter( value => h('a.node', {
      id: value,
      onclick: function(e)  {
        selection(this)
        e.preventDefault()
      }
    }, tag(8)(value.substr(0,8))), ref.type),
    tree(),
    source(),
    array(),
    properties(),
    kv(),
    ho.basic()
  )

  render.selection = observable.transform( selection, el => el && el.id )
  return render
}

module.exports.css = tree.css
