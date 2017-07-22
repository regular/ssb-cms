const fs = require('fs')
const pull = require('pull-stream')
const h = require('hyperscript')
const ho = require('hyperobj')
const observable = require('observable')
const ref = require('ssb-ref')
const ssbClient = require('ssb-client')
const ssbKeys = require('ssb-keys')

const u = require('hyperobj-tree/util')
const tree = require('hyperobj-tree/tree')
const properties = require('hyperobj-tree/properties')
const kv = require('hyperobj-tree/kv')
const source = require('hyperobj-tree/source')
const array = require('hyperobj-tree/array')
const filter = require('hyperobj-tree/filter')
const tag = require('hyperobj-tree/tag')

const Editor = require('./json-editor')

function messageTreeRenderer(ssb) {
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
      let value = { type: 'key-value', key: msg.key, value: branches(msg.key) }
      return this.call(this, value, kp)
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

var keys = ssbKeys.loadOrCreateSync('mykeys')
// TODO
// run `sbot ws.getAddress` to get this
const sbotAddress = "ws://localhost:8989~shs:nti4TWBH/WNZnfwEoSleF3bgagd63Z5yeEnmFIyq0KA="

// three column layout
let editorContainer, treeContainer
document.body.appendChild(
  h('.columns',
    treeContainer = h('.col.treeview'),
    revisionsContainer = h('.col.revisions'),
    editorContainer = h('.col.editor')
  )
)

let editor = Editor({container: editorContainer})

// get root message and start things off
ssbClient(keys, {
  keys,
  remote: sbotAddress,
  //timers: {handshake: 30000},
  manifest: JSON.parse(fs.readFileSync(process.env.HOME + '/.ssb/manifest.json'))
}, function (err, ssb) {
  if (err) throw err

  const renderMessage = messageTreeRenderer(ssb)
  revisionsContainer.appendChild(
    h('div',
      h('div', 'Selection:', h('span.selection', renderMessage.selection)),
      h('div', 'Clean:', h('span.clean', editor.clean))
    )
  )

  let id = "%GKmZNjjB3voORbvg8Jm4Jy2r0tvJjH+uhV+cHtMVwSQ=.sha256"
  ssb.get(id, (err, value) => {
    if (err) throw err
    let el = renderMessage({key:id, value})
    treeContainer.appendChild(el)
  })

  renderMessage.selection((id)=>{
    if (!id) return
    ssb.get(id, (err, value) => {
      if (err) throw err  // TODO
      editor.setValue(JSON.stringify(value, null, 2))
      editor.clean(true)
    })
  })
})

document.body.appendChild(h('style',tree.css()))
document.body.appendChild(h('style', `
  body, html {
    height: 100%;
  }
  body {
    font-family: sans-serif;
    color: #444;
    overflow: hidden;
  }
  .columns {
    display: flex;
    width: 100vw;
    height: 100vh;
    flex-flow: row nowrap;
    overflow: hidden;
  }
  .col {
  }
  .col.treeview {
    overflow: scroll;
    flex: 1 20%;
    background: #eee;
    border-right: 1px solid #ccc;
  }
  .col.revisions {
    overflow: scroll;
    flex: 1 20%;
    background: #ddd;
    border-right: 1px solid #ccc;
  }
  .col.editor {
    flex: 3 60%;
    max-width: 60%;
    background: blue;
  }
  .col.editor>* {
    height: 100%;
  }
  a.node {
    color: #dde;
    text-decoration: none;
  }
  a.node>span.tag:hover {
    background-color: #226;
  }
  ul {
    list-style: none;
  }
  span.key {
    color: #222;
    font-weight: bold;
    margin-right: .2em;
  }
  span.key::after {
    content: ':'
  }
  .branch {
    white-space: nowrap;
  }
  .branch>span.key::after {
    content: ''
  }
  .tag.color0 {
    background: #b58900;
  }
  .node.selected>.tag {
    color: black;
    background: yellow;
  }
  .tag.color1 {
    background: #cb4b16;
  }
  .tag.color2 {
    background: #dc322f;
  }
  .tag.color3 {
    background: #d33682;
  }
  .tag.color4 {
    background: #6c71c4;
  }
  .tag.color5 {
    background: #268bd2;
  }
  .tag.color6 {
    background: #2aa198;
  }
  .tag.color7 {
    background: #859900;
  }
`))
