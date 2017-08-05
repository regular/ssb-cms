const fs = require('fs')
const pull = require('pull-stream')
const h = require('hyperscript')
const ho = require('hyperobj')
const ssbClient = require('ssb-client')
const ssbKeys = require('ssb-keys')
const getAvatar = require('ssb-avatar')
const observable = require('observable')
const obv = require('obv')

const Tree = require('./tree-view')
const Editor = require('./json-editor')
const Menubar = require('./renderers/menubar')
const drafts = require('./drafts')()

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
  if (err) {
    document.body.innerHTML = `<pre>
    ssb-client says: "${err.message}"
    If you have not done already, please add your public key to sbot's master array:

    "master": [
      "@${keys.public}"
    ]

    in ${process.env.HOME + '/.' + process.env.ssb_appname + '/config'}

    (the above is not an example, it is your actual public key)

    Then restart sbot and reload this page. Hopefully you won't see this message again.

    </pre>`
    throw err
  }
  sbot.set(ssb)
  ssb.whoami( (err, feed)=> {
    if (err) throw err
    me.set(feed.id)
  })
})

let avatar = observable()
me( (feed) => {
  getAvatar(sbot.value, feed, feed, (err, result) => {
    if (err) throw err
    if (!result.image) return
    avatar({
      name: result.name,
      imageUrl:`${blobsRoot}/${result.image}`
    })
  })
})

me.once( (feed) => {
  const ssb = sbot.value

  let renderMenu = ho(
    Menubar,
    function(value, kp) {
      if (kp.slice(-1)[0] === 'profile') {
        return [ h('span'), h('img') ]
      } else return Menubar.renderItem(value, kp)
    }
  )
  let menubar = renderMenu({
    type: 'menubar',
    left: [{
      key: 'activity',
      value: { label: 'Activity' }
    }, {
      key: 'content',
      value: { label: 'Content'}
    }],
    right: [{
      key: 'profile',
      value: {
        icon: 'broken',
        label: 'username'
      }
    }]
  })

  document.body.appendChild(menubar)
  menubar.activate('content')

  avatar( (result)=>{
    if (!result) return
    let img = menubar.querySelector('[data-key=profile] img')
    img.setAttribute('src', result.imageUrl)
    let span = menubar.querySelector('[data-key=profile] span')
    span.innerHTML = result.name
  })

  // three column layout
  let editorContainer, treeContainer, discardButton, saveButton
  document.body.appendChild(
    h('.columns',
      treeContainer = h('.col.treeview'),
      revisionsContainer = h('.col.revisions',
        h('.toolbar')
      ),
      h('.col.editor-col',
        h('.toolbar'),
        editorContainer = h('.editor-container'),
        h('.buttons',
          discardButton = h('button.discard', 'Discard Changes'),
          saveButton = h('button.save', 'Publish', {
            onclick: save
          })
        )
      )
    )
  )

  const editor = Editor({
    container: editorContainer,
    blobs: ssb.blobs
  })
  const tree = Tree(ssb, drafts, root, (err, el) =>{
    if (err) throw err
    treeContainer.appendChild(el)
  })

  revisionsContainer.querySelector('.toolbar').appendChild(
    h('span.selection', tree.selection)
  )

  /*
  revisionsContainer.appendChild(
    h('div',
      //h('div.icon', avatar)
      //h('div', 'Clean:', h('span.clean', editor.clean))
    )
  )
  */

  /*
  editor.clean( (isClean)=>{
   discardButton.disabled = !isClean
   saveButton.disabled = isClean 
  })
  */

  let ignoreChanges = false
  editor.on( 'changes', ()=> {
    if (ignoreChanges) return
    if (/^draft/.test(tree.selection())) {
      drafts.update( tree.selection(), editor.getValue(), (err)=>{
        if (err) throw err
      })
      tree.update(tree.selection(), editor.getValue())
    }
  })

  function loadIntoEditor(text) {
    ignoreChanges = true
    editor.setValue(text)
    editor.clean(true)
    ignoreChanges = false
  }

  function save() {
    let key = tree.selection()
    if (!key || !/draft-/.test(key)) return
    console.log('Publishing ...')
    drafts.publish(ssb, key, (err, result) => {
      console.log('published', result)
      if (err) throw err
      drafts.remove(key)
      loadIntoEditor(JSON.stringify(result.value, null, 2))
      tree.update(key, JSON.stringify(result.value), result.key)
    })
  }

  tree.selection( (id) => {
    if (!id) return loadIntoEditor('')
    let get =  /^draft/.test(id) ? drafts.get : ssb.get
    get(id, (err, value) => {
      if (err) throw err  // TODO
      loadIntoEditor(typeof value === 'string' ? value : JSON.stringify(value, null, 2))

      getAvatar(ssb, me.value, value.author ? value.author : me.value, (err, result) => {
        if (err) throw err
        if (!result.image) return
        //avatar(h('img', {src:`${blobsRoot}/${result.image}`}))
      })
    })
  })
})

document.body.appendChild(h('style',Tree.css()))
document.body.appendChild(h('style',Menubar.css()))
document.body.appendChild(h('style', `
  body, html {
    height: 100%;
    margin: 0;
  }
  body {
    font-family: sans-serif;
    color: #444;
    overflow: hidden;
  }
  .menubar {
    font-size: 14px;
    background: #222;
    color: #777;
    align-items: stretch;
  }
  .menu-item:hover {
    background: #333;
  }
  .menu-item.active {
    background: #444;
    color: #eee;
  }
  .menu-item img {
    max-height: 32px;
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
    flex: 2 30%;
    background: #eee;
    border-right: 1px solid #ccc;
  }
  .toolbar {
    box-shadow: 0px 0px 3px black;
    height: 1.6em;
    border-bottom: 1px solid #ccc;
    background: #ddd;
    font-size: 16pt;
  }

  .toolbar button {
    margin: .5em;
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
  .col.revisions .toolbar .selection {
    font-size: 6pt;
    margin-left: .2em;
  }
  .col.revisions .icon img {
    max-width: 48px;
  }

  .editor-col {
    flex: 35 50%;
    max-width: 50%;
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
