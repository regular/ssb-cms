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
const Editor = require('./editor-view')
const Revs = require('./revs-view')
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

  function get(id, cb) {
    if (/^draft/.test(id)) drafts.get(id, cb)
    else ssb.get(id, cb)
  }

  let renderMenu = ho(
    Menubar(),
    function(value, kp) {
      if (kp.slice(-1)[0] === 'profile') {
        return [ h('span'), h('img') ]
      } else return Menubar().renderItem(value, kp)
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
  let editorContainer, treeColumn, discardButton, saveButton
  document.body.appendChild(
    h('.columns',
      treeColumn = h('.col.treeview'),
      revisionsColumn = h('.col.revisions',
        h('.toolbar')
      ),
      h('.col.editor-col',
        editorContainer = h('.editor-container'),
        h('.buttons',
          discardButton = h('button.discard', 'Discard Changes', {
            onclick: discard
          }),
          saveButton = h('button.save', 'Publish', {
            onclick: save
          })
        )
      )
    )
  )

  const editor = Editor(editorContainer, ssb)

  const tree = Tree(ssb, drafts, root, (err, el) =>{
    if (err) throw err
    treeColumn.appendChild(el)
  })

  revisionsColumn.querySelector('.toolbar').appendChild(
    h('span.selection', tree.selection)
  )
  const revs = Revs(ssb, drafts, me.value, blobsRoot)
  revisionsColumn.appendChild(h('.revs-container', revs))

  let isNewDraft = observable.transform(tree.selection, id => /^draft/.test(id))
  let isRevisionDraft = observable.transform(revs.selection, id => /^draft/.test(id))
  let isPublishable = observable.compute(
    [isNewDraft, isRevisionDraft],
    (newDraft, revDraft) => newDraft || revDraft)
  isPublishable( (isPublishable)=>{
    discardButton.disabled = !isPublishable
    saveButton.disabled = !isPublishable
  })

  function cleanupRevision(key, value) {
    // if all edits have been undone, remove the revision
    if (value.revisionBranch) {
      get(value.revisionBranch, (err, val)=>{
        if (err) return console.error(err)
        if (typeof val.content !== 'string') val.content = JSON.stringify(val, null, 2)
        if (val.content === value.content) {
          ignoreRevsSelectionChanges = true
          revs.remove(key)
          revs.selection(value.revisionBranch)
          ignoreRevsSelectionChanges = false
          drafts.remove(key, (err)=>{
            if (err) throw err
          })
        }
      })
    }
  }

  let ignoreChanges = false
  editor.change( ()=> {
    if (ignoreChanges) return
    let msgString = editor.getValue()
    if (/^draft/.test(revs.selection())) {
      drafts.update( revs.selection(), msgString, (err)=>{
        if (err) throw err
        drafts.get( revs.selection(), (err, value)=>{
          if (err) throw err
          tree.update(tree.selection(), value)
          if (editor.clean()) cleanupRevision(revs.selection(), value)
        })
      })
    }
  })

  function loadIntoEditor(text) {
    ignoreChanges = true
    editor.setValue(text)
    editor.clean(true)
    editor.clearHistory()
    ignoreChanges = false
  }

  function save() {
    let key = revs.selection()
    if (!key) return
    console.log('Publishing ...')
    drafts.publish(ssb, key, (err, result) => {
      if (err) throw err
      console.log('published', result)
      drafts.remove(key)
      let msgString = JSON.stringify(result.value, null, 2)
      loadIntoEditor(msgString)
      revs.update(key, result.value, result.key)
      if (/^draft/.test(tree.selection())) {
        tree.update(tree.selection(), result.value, result.key)
      }
    })
  }

  function discard() {
    // if (!confirm('Discard changes?')) return
    let key = revs.selection()
    if (!key) return
    drafts.get(key, (err, value)=>{
      if (err) throw err
      // select the previous revision
      revs.selection(value.revisionBranch)
      revs.remove(key)
      drafts.remove(key, (err)=>{
        if (err) throw err
      })
      if (/^draft/.test(tree.selection())) {
        tree.remove(key)
      } else if (tree.selection() === value.revisionRoot) {
        get(value.revisionBranch, (err, value)=>{
          if (err) return console.error(err)
          let c = value.content
          if (typeof c !== 'string') value.content = JSON.stringify(value, null, 2)
          tree.update(tree.selection(), value)
        })
      }
    })
  }

  tree.selection(revs.root)

  let ignoreRevsSelectionChanges = false
  revs.selection( (id) => {
    if (ignoreRevsSelectionChanges) return
    if (!id) return loadIntoEditor('')
    get(id, (err, value) => {
      if (err) throw err  // TODO
      let msgString = value.msgString || JSON.stringify(value, null, 2)
      loadIntoEditor(msgString)

      // TODO: move to rev-view
      getAvatar(ssb, me.value, value.author ? value.author : me.value, (err, result) => {
        if (err) throw err
        if (!result.image) return
        //avatar(h('img', {src:`${blobsRoot}/${result.image}`}))
      })
    })
  })

  function getMessageBranch(id, cb) {
    get(id, (err, value)=>{
      if (err) return cb(err)
      cb(null, value.content && value.content.branch || value.branch)
    })
  }

  editor.clean( (isClean)=>{
    if (!isClean && !ignoreChanges && !isRevisionDraft() && !isNewDraft()) {
      // first edit: create new revision draft
      let msgString = editor.getValue()
      let revisionRoot = tree.selection()
      let revisionBranch = revs.selection()
      // get the post branch so that the tree view can detect the revision
      getMessageBranch(revisionBranch, (err, branch)=>{
        if (branch) return gotBranch(branch)
        getMessageBranch(revisionRoot, (err, branch)=>{
          if (err) console.error(err)
          gotBranch(branch)
        })
      })
      function gotBranch(branch) {
        drafts.create(msgString, branch, revisionRoot, revisionBranch, (err, key)=>{
          if (err) return console.error(err)
          revs.add({key: key, value: {msgString, revisionBranch}})
          ignoreRevsSelectionChanges = true
          revs.selection(key)
          ignoreRevsSelectionChanges = false
          drafts.get( key, (err, value)=>{
            if (err) throw err
            tree.update(tree.selection(), value)
          })
        })
      }
    }
  })
})

document.body.appendChild(h('style',Tree.css()))
document.body.appendChild(h('style',Menubar.css()))
document.body.appendChild(h('style',Revs.css()))
document.body.appendChild(h('style',Editor.css()))
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
