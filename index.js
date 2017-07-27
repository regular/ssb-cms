const fs = require('fs')
const pull = require('pull-stream')
const h = require('hyperscript')
const ssbClient = require('ssb-client')
const ssbKeys = require('ssb-keys')
const getAvatar = require('ssb-avatar')
const observable = require('observable')
const obv = require('obv')

const Tree = require('./tree-view')
const Editor = require('./json-editor')
const drafts = require('./drafts')()

// three column layout
let editorContainer, treeContainer, discardButton, saveButton
document.body.appendChild(
  h('.columns',
    treeContainer = h('.col.treeview'),
    revisionsContainer = h('.col.revisions'),
    h('.col.editor-col',
      editorContainer = h('.editor-container'),
      h('.buttons',
        discardButton = h('button.discard', 'Discard Changes'),
        saveButton = h('button.save', 'Save')
      )
    )
  )
)

let editor = Editor({container: editorContainer})

let me = obv()
let sbot = obv()

var keys = ssbKeys.loadOrCreateSync('mykeys')
const sbotConfig = JSON.parse(fs.readFileSync(process.env.HOME + '/.' + process.env.ssb_appname + '/config'))
const manifest = JSON.parse(fs.readFileSync(process.env.HOME + '/.' + process.env.ssb_appname + '/manifest.json'))
console.log('sbot config', sbotConfig)
console.log('our pubkey', keys.public)
const sbotAddress = JSON.parse(process.env.ssb_ws_address) // rmoves quotes
console.log('sbot address', sbotAddress)
const blobsRoot = `http://${sbotConfig.host || 'localhost'}:${sbotConfig.ws.port}/blobs/get`

const root = sbotConfig.cms && sbotConfig.cms.root
if (!root) throw new Error('Please specify a root node in your config. See ssb-cms README.md for details.')

ssbClient(keys, {
  caps: sbotConfig.caps,
  remote: sbotAddress,
  timers: {handshake: 30000},
  manifest
}, function (err, ssb) {
  if (err) throw err
  sbot.set(ssb)
  ssb.whoami( (err, feed)=> {
    if (err) throw err
    me.set(feed.id)
  })
})

let avatar = observable()
me.once( (feed) => {
  const ssb = sbot.value

  const tree = Tree(ssb, drafts, root, (err, el) =>{
    if (err) throw err
    treeContainer.appendChild(el)
  })

  revisionsContainer.appendChild(
    h('div',
      h('div', 'Selection:', h('span.selection', tree.selection)),
      h('div.icon', avatar),
      h('div', 'Clean:', h('span.clean', editor.clean))
    )
  )

  /*
  editor.clean( (isClean)=>{
   discardButton.disabled = !isClean
   saveButton.disabled = isClean 
  })
  */

  editor.on( 'changes', ()=> {
    if (/^draft/.test(tree.selection())) {
      drafts.update( tree.selection(), editor.getValue(), (err)=>{
        if (err) throw err
      })
    }
  })

  tree.selection( (id) => {
    if (!id) {
      editor.setValue('')
      editor.clean(true)
      return
    }
    let get =  /^draft/.test(id) ? drafts.get : ssb.get
    get(id, (err, value) => {
      if (err) throw err  // TODO
      editor.setValue(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
      editor.clean(true)

      getAvatar(ssb, me.value, value.author ? value.author : me.value, (err, result) => {
        if (err) throw err
        avatar(h('img', {src:`${blobsRoot}/${result.image}`}))
      })
    })
  })
})

document.body.appendChild(h('style',Tree.css()))
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
  .col.treeview .addRoot {
    margin: .1em;
    height: 1.6em;
    border-bottom: 1px solid #ccc;
    background: #ddd;
    font-size: 14pt;
  }
  .col.treeview .addRoot span {
    font-size: 8pt;
  }
  button {
    border-radius: 4px;
    border: 1px solid #aaa;
    background: #eee;
    font-size: 60%;
    font-weight: bold;
    padding: .1em .3em;
    vertical-align: middle;
    margin: .1em;
    margin-top: -1px;
    margin-left: .2em;
    margin-right: .2em;
  }
  button:hover {
    background: #999;
  }
  .col.revisions {
    overflow: scroll;
    flex: 1 20%;
    background: #ddd;
    border-right: 1px solid #ccc;
  }
  .col.revisions .icon img {
    max-width: 48px;
  }

  .editor-col {
    flex: 3 60%;
    max-width: 60%;
    display: flex;
    flex-direction: column;
  }
  .editor-container {
    flex-grow: 1;
    position: relative;
    overflow: hidden;
  }
  .editor-col .buttons {
    padding: 1em;
    font-size: 16pt;
    display: flex;
    justify-content: flex-end;
    background: #eee;
  }
  .editor-col .buttons button {
    padding: .8em 1em;
    padding-top: .6em;
  }
  button.save:hover {
    background: #77f;
  }
  button.discard:hover {
    background: #f77;
  }

  .tag.color0 {
    background: #b58900;
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
