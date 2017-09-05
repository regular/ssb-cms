require('setimmediate')
const h = require('mutant/html-element')
const ho = require('hyperobj')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const pull = require('pull-stream')
const ssbClient = require('ssb-client')
const getAvatar = require('ssb-avatar')
const ref = require('ssb-ref')

const Status = require('./status-view')
const Tree = require('./tree-view')
const Editor = require('./editor-view')
const Revs = require('./revs-view')
const Menubar = require('./renderers/menubar')
const drafts = require('./drafts')()
const DB = require('./db')
const {isDraft} = require('./util')

const modes = ['normal', 'translucent', 'no-ui']

module.exports = function(config, cb) {
  const root = config.sbot.cms && config.sbot.cms.root
  if (!root) throw new Error('Please specify a root node in your config. See ssb-cms README.md for details.')

  let me = Value()
  let sbot = Value()

  ssbClient(config.keys, {
    caps: config.sbot.caps,
    remote: config.sbotAddress,
    timers: {handshake: 30000},
    manifest: config.manifest
  }, function (err, ssb) {
    if (err) {
      document.body.innerHTML = `<pre>
      ssb-client says: "${err.message}"
      If you have not done already, please add your public key to sbot's master array:

      "master": [
        "@${config.keys.public}"
      ]

      in ${process.env.HOME + '/.' + process.env.ssb_appname + '/config'}

      (the above is not an example, it is your actual public key)

      Then restart sbot and reload this page. Hopefully you won't see this message again.

      </pre>`
      cb(err)
      throw err
    }

    ssb.cms = DB(ssb, drafts)

    sbot.set(ssb)
    ssb.whoami( (err, feed)=> {
      if (err) throw err
      me.set(feed.id)
    })
  })

  let avatar = Value({defaultValue: {name: "", imageUrl: ""}})
  me( (feed) => {
    getAvatar(sbot(), feed, feed, (err, result) => {
      if (err) console.error(err)
      if (!result.image) return
      avatar.set({
        name: result.name,
        imageUrl:`${config.blobsRoot}/${result.image}`
      })
    })
  })

  let unsubscribe = me( (feed) => {
    unsubscribe()
    const ssb = sbot()

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

    let uiContainer = h('.ui')
    let fullscreenPreview = h('.fullscreen-preview')
    document.body.appendChild(fullscreenPreview)
    document.body.appendChild(uiContainer)
    uiContainer.appendChild(menubar)
    menubar.activate('content')

    // TODO: use observer in hyperscript
    avatar( (result)=>{
      if (!result) return
      let img = menubar.querySelector('[data-key=profile] img')
      img.setAttribute('src', result.imageUrl)
      let span = menubar.querySelector('[data-key=profile] span')
      span.innerHTML = result.name
    })

    // three column layout
    let editorContainer, treeColumn, discardButton, saveButton
    uiContainer.appendChild(
      h('.columns', [
        treeColumn = h('.col.treeview'),
        revisionsColumn = h('.col.revisions'),
        h('.col.editor-col', [
          editorContainer = h('.editor-container'),
          h('.buttons', [
            discardButton = h('button.discard', {
              'ev-click': discard
            }, 'Discard Changes'),
            saveButton = h('button.save', {
              'ev-click': save
            }, 'Publish' )
          ])
        ])
      ])
    )

    const editor = Editor(editorContainer, ssb, config)

    let mode = 0
    window.addEventListener('keydown', (e)=>{
      if (e.key === 'Tab' && e.shiftKey) {
        document.body.classList.remove(modes[mode])
        mode = (mode + 1) % modes.length
        document.body.classList.add(modes[mode])
        if (mode === 0) {
          editor.adjustSize()
        }
        e.preventDefault()
      }
    })

    const status = Status(ssb, drafts, root)
    menubar.querySelector('.middle').appendChild(status)

    const tree = Tree(ssb, drafts, root)
    treeColumn.appendChild(tree)

    const revs = Revs(ssb, drafts, me(), config.blobsRoot)
    revisionsColumn.appendChild(h('.revs-container', revs))

    let isNewDraft = computed([tree.selection], isDraft)
    let isRevisionDraft = computed([revs.selection], isDraft)
    let isPublishable = computed(
      [isNewDraft, isRevisionDraft],
      (newDraft, revDraft) => newDraft || revDraft
    )
    isPublishable( (isPublishable)=>{
      discardButton.disabled = !isPublishable
      saveButton.disabled = !isPublishable
    })

    function setSelectionFromURL(newURL) {
      let fragment = newURL.substr(newURL.indexOf('#') + 1)
      let revRoot, rev
      if (fragment.indexOf(':') !== -1) {
        [revRoot, rev] = fragment.split(':')
      } else {
        revRoot = fragment || null // empty string -> null
        rev = null
      }
      console.log('FROM URL:', revRoot, rev)
      if (!revRoot || ref.isMsg(revRoot) || isDraft(revRoot)) {
        let unsubsribe = revs.ready( (ready)=>{
          if (ready) {
            if (rev && (ref.isMsg(rev) || isDraft(rev)) ) {
              revs.selection.set(rev)
            } else {
              revs.selection.set('latest')
            }
            unsubsribe()
          }
        })
        revs.root.set(revRoot)
        tree.selection.set(revRoot)

        if (rev || revRoot) {
          ;(rev ? ssb.cms.getMessageOrDraft : ssb.cms.getLatest)(rev || revRoot, (err, value) => {
            if (err) throw err  // TODO
            let msgString = value.msgString || JSON.stringify(value, null, 2)
            loadIntoEditor(msgString)
          })
        } else loadIntoEditor('')

        if (revRoot) {
          updateFullscreenPreview(revRoot)
        }
      }
    }
  
    tree.ready( (ready)=>{
      if (ready) {
        setSelectionFromURL(window.location.href)
      }
    })

    function setURL(revRoot, rev) {
      console.log('setURL', revRoot, rev)
      document.location.hash = `#${revRoot}${rev ? (':' + rev) : ''}`
    }

    window.addEventListener('hashchange', (e)=>{
      console.log('HASH CHANGE')
      setSelectionFromURL(e.newURL)
    })

    function cleanupRevision(key, value) {
      // TODO
      return
      // if all edits have been undone, remove the revision
      if (value.revisionBranch) {
        ssb.get(value.revisionBranch, (err, val)=>{
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
      if (isDraft(revs.selection())) {
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

    function updateFullscreenPreview(key) {
      // TODO temp hack
      fullscreenPreview.innerHTML = ''
      ssb.cms.getReduced(key, (err, msg)=>{
        console.log('reduced', err, msg)
        if (err) throw err  
        let el = editor.renderPreviewEditor(msg, [key])
        fullscreenPreview.appendChild(el)
      })
    }

    function loadIntoEditor(text) {
      if (text == editor.getValue()) return
      ignoreChanges = true
      editor.setValue(text, tree.selection())
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
        let revRoot = result.value.content && result.value.content.revisionRoot
        let revision = result.key
        if (!revRoot || revRoot == result.key) {
          revRoot = result.key
          revision = null
        }
        setURL(revRoot, revision)
      })
    }

    function discard() {
      // if (!confirm('Discard changes?')) return
      let key = revs.selection()
      if (!key) return
      drafts.remove(key, (err)=>{
        if (err) console.error(err)
        let hash = document.location.hash
        if (!isDraft(hash.substr(1))) { 
          if (hash.indexOf(':') !== -1) {
            document.location.hash = hash.split(':')[0]
            revs.selection.set('latest')
          }
        } else {
          document.location.hash = ''
        }
      })
    }

    let ignoreRevsSelectionChanges = false

    editor.clean( (isClean)=>{
      if (!isClean && !ignoreChanges && !isRevisionDraft() && !isNewDraft()) {
        // first edit: create new revision draft
        let msgString = editor.getValue()
        if (!msgString) return
        let revisionRoot = tree.selection()
        let revisionBranch = revs.selection()
      console.log("FIRST EDIT")
        ssb.get(revs.root(), (err, msg)=>{
          if (err) throw err
          let branch = msg.content && msg.content.branch
          drafts.create(msgString, branch, revisionRoot, revisionBranch, (err, key, value)=>{
            if (err) return console.error(err)
            setURL(revisionRoot, key)
          })
        })
      }
    })

    if (cb) cb(null, ssb, drafts, root)
  })
}

module.exports.css = function() {
  return Tree.css() +
  Menubar.css() +
  Revs.css() +
  Editor.css() +
  Status.css() +
  `
  body, html {
    height: 100%;
    margin: 0;
  }
  body {
    font-family: sans-serif;
    color: #444;
    overflow: hidden;
  }
  .fullscreen-preview {
    background-color: #1a1a1a;
    position: absolute;
  }
  .ui {
    position: absolute;
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
    height: calc( 100vh - 32px );
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
  
  body.no-ui .ui {
    display: none;
  }
  body.translucent .editor-col {
    height: 0px;
  }
  body.translucent .editor-col .buttons {
    display: none;
  }
  body.translucent .toolbar {
    background: rgba(221, 221, 221, 0.45);
  }
  body.translucent .col.treeview {
    background: rgba(238, 238, 238, 0.17);
    border-color: transparent;
  }
  body.translucent .col.revisions {
    background: rgba(221, 221, 221, 0.06);
    border-color: transparent;
  }
  body.translucent .col.revisions .rev {
    background: rgba(238, 238, 238, 0.17);
  }
  body.translucent .col.treeview .branch-header {
    background: rgba(209, 195, 195, 0.57);
  }
  body.translucent .fullscreen-preview {
    filter: blur(.8px) brightness(0.8);
  }
  body.translucent .branch-header,
  body.translucent .toolbar {
      border-color: #777;
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
  `
}
