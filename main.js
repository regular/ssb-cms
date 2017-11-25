require('setimmediate')
const h = require('mutant/html-element')
const ho = require('hyperobj')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const pull = require('pull-stream')
//const ssbClient = require('ssb-client')
const getAvatar = require('ssb-avatar')
const ref = require('ssb-ref')
const traverse = require('traverse')
const isElectron = require('is-electron')

const Status = require('./status-view')
const Tree = require('./tree-view')
const Editor = require('./editor-view')
const Revs = require('./revs-view')
const Menubar = require('./renderers/menubar')
const Drafts = require('./drafts')
const DB = require('./db')
const {isDraft, getLastMessageId} = require('./util')
const bus = require('./bus')

const modes = ['normal', 'translucent', 'no-ui']

document.body.classList.add('hide')

function getOrCreateSbotClient(config, sbot, drafts, root) {
  if (parent && parent.ssb) {
    console.warn('Found sbot client on parent object')
    return sbot.set(parent.ssb)
  }
  console.warn('Creating sbot client')
  require('ssb-electroparty/client')(function (err, ssb) {
    if (err) {
      document.body.classList.remove('hide')
      document.body.innerHTML = `<pre>
      ssb-client says: "${err.message}"
      If you have not done already, please add your public key to sbot's master array:

      "master": [
        "@${config.keys.public}"
      ]

      in ~/.${config.sbot.appName + '/config'}


      (the above is not an example, it is your actual public key)

      Then restart sbot and reload this page. Hopefully you won't see this message again.

      </pre>`
      cb(err)
      throw err
    }
    ssb.cms = DB(ssb, drafts)
    window.ssb = ssb // for child iframes to share
    sbot.set(ssb)
  })
}

function getProfileData(ssb, config, feed, avatar, profile) {
  pull(
    ssb.createUserStream({id: feed, reverse: true}),
    pull.filter( kv => kv.value.content && kv.value.content.type === 'about'),
    pull.filter( kv => kv.value.content && kv.value.content.about === feed),
    pull.take(1),
    pull.map( kv => kv.value.content.revisionRoot || kv.key),
    pull.collect( (err, results) => {
      if (err) return console.error(err)
      if (results.length<1) return console.warn('No about message found')
      profile.set(results[0])
    })
  )
  getAvatar(ssb, feed, feed, (err, result) => {
    if (err) return console.error(err)
    if (!result.image) return console.warn('No profile image found')
    avatar.set({
      name: result.name,
      imageUrl:`${config.blobsRoot}/${result.image}`
    })
  })
}

module.exports = function(config, trusted_keys, cb) {
  const root = config.sbot.cms && config.sbot.cms.root
  if (!root) throw new Error('Please specify a root node in your config. See ssb-cms README.md for details.')

  // if we are in electron, we might want to
  // disable pinch-to-zoom
  if (isElectron()) {
    console.warn('Runnig inside electron')
    if (window && window.require) {
      if (!config.sbot.allowBrowserZoom) {
        // to disable pinch zoom feature on electron
        const webFrame = window['require']('electron').webFrame // it's written like this so browserify doesnt feel like it has to do something
        webFrame.setVisualZoomLevelLimits(1, 1)
        webFrame.setLayoutZoomLevelLimits(0, 0)
      }
    } else {
      console.warn('But we do not have window.require. (inside iframe?)')
    }
  } else {
    console.warn('Not runnig inside electron')
  }

  let me = Value()
  let sbot = Value()

  drafts = Drafts(root)

  sbot( ssb => {
    console.log('got sbot', ssb)
    if (ssb) {
      ssb.whoami( (err, feed)=> {
        if (err) throw err
        me.set(feed.id)
      })
    } 
  })

  getOrCreateSbotClient(config, sbot, drafts, root)

  // profile and avatar
  let avatar = config.avatar = Value({defaultValue: {name: "", imageUrl: ""}})
  let profile = config.profile = Value()
  if (!config.sbot.cms.kiosk && !window.frameElement) {
    me( feed => {
      getProfileData(sbot(), config, feed, avatar, profile)
    })
  }

  let unsubscribe = me( feed => {
    unsubscribe()
    config.feedId = feed
    const ssb = sbot()

    // decorate ssb.cms API with object DB methods (if not present already)
    if (!ssb.cms.getReduced) {
      console.warn('Decorating ssb.cms with objectdb methods.')
      const ObjectDB = require('./object-db')
      Object.assign(ssb.cms, ObjectDB(ssb, drafts, root, trusted_keys), {update})
    } else {
      console.warn('Not decorating ssb.cms with objectdb methods.')
    }

    // if we are in an iframe, tell
    // parent frame when we detect user interaction,
    // so it can reset its idle timeout timer
    function userInteraction() {
      bus.sendToParentFrame('interaction', {})
    }
    document.body.addEventListener('mousedown', userInteraction)
    document.body.addEventListener('touchstart', userInteraction)

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
      left: [
      {
        key: 'status',
        value: { label: 'Status' }
      }, {
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
    let fullscreenPreviewEl = h('.fullscreen-preview', {
      classList: config.sbot.cms.kiosk ? ['kiosk'] : []
    })
    document.body.appendChild(fullscreenPreviewEl)
    let fullscreenPreview = FullscreenPreview(fullscreenPreviewEl)

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
    let contentView, statusView
    uiContainer.appendChild(
      contentView = h('.columns', [
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

    uiContainer.appendChild(
      statusView = h('div.statusView', {style: {display: 'none'}})
    )


    menubar.activeItem( item=>{
      let key = item.getAttribute('data-key')
      if (key === 'status') {
        statusView.style.display = 'block'
        contentView.style.display = 'none'
      } else {
        statusView.style.display = 'none'
        contentView.style.display = 'flex'
      }
      if (key === 'profile') {
        let msgId =  config.profile()
        if (msgId) {
          document.location.hash = `#${msgId}`
        }
      }
    })

    const editor = Editor(editorContainer, ssb, config)

    let mode = 0
    function setMode(newMode) {
      if (config.sbot.cms.kiosk && newMode === 2 && !window.frameElement) {
        // if we are the parent in a kisok and we are started without a UI,
        // we do not remove hide class from body. We leave this
        // to custom code, to aboid flickering
      } else {
        document.body.classList.remove('hide')
      }
      document.body.classList.remove(modes[mode])
      document.body.classList.add(modes[newMode])
      if (newMode === 0) {
        editor.adjustSize()
      }
      mode = newMode
    }

    if (config.sbot.cms && config.sbot.cms['view-mode']) {
      let vm = modes.indexOf(config.sbot.cms['view-mode'])
      if (vm<0) vm = 0
      setMode(vm)
    } else {
      setMode( window.frameElement ? 2 : 0)
    }

    if (config.sbot.cms && config.sbot.cms.entry && !window.frameElement) {
      setURL(config.sbot.cms.entry)
    }

    window.addEventListener('keydown', (e)=>{
      if (e.key === 'Tab' && e.shiftKey) {
        setMode( (mode + 1) % modes.length)
        e.preventDefault()
      }
    })

    let status
    // save us the effort of message traversal and blob enumeration
    if (!window.frameElement) {
      status = Status(ssb, drafts, root, statusView, trusted_keys)
      menubar.querySelector('.middle').appendChild(status)
    }

    const tree = Tree(ssb, drafts, root, trusted_keys)
    treeColumn.appendChild(tree)

    const revs = Revs(ssb, drafts, me(), config.blobsRoot, trusted_keys)
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
      let revRoot = null, rev = null
      if (newURL.indexOf('#') !== -1) {
        let fragment = newURL.substr(newURL.indexOf('#') + 1)
        if (fragment.indexOf(':') !== -1) {
          [revRoot, rev] = fragment.split(':')
        } else {
          revRoot = fragment || null // empty string -> null
          rev = null
        }
      }
      console.log('FROM URL:', revRoot, rev)
      if (!revRoot || ref.isMsg(revRoot) || isDraft(revRoot)) {
        let unsubscribe = revs.ready( ready => {
          if (ready) {
            unsubscribe()
            if (rev && (ref.isMsg(rev) || isDraft(rev)) ) {
              revs.selection.set(rev)
            } else if (revRoot) {
             ssb.cms.getLatest(revRoot, {keys: true}, (err, kv) => {
               if (err) return console.error('Error while getting latest revision of message referred to in URL', err)
               revs.selection.set(kv && kv.revision)
             })
            }
          }
        })
        revs.root.set(revRoot)
        tree.selection.set(revRoot)

        bus.sendToParentFrame('navigate', {
          nodeId: revRoot
        })

        if (rev || revRoot) {
          if (rev) {
            ssb.cms.getMessageOrDraft(rev, (err, value) =>{
              if (err) console.error(err)
              let msgString = value.msgString || JSON.stringify(value, null, 2)
              loadIntoEditor(msgString)
            })
          } else {
            ssb.cms.getLatest(revRoot, (err, value) => {
              if (err) {
                console.error('Error while getting latest revision of message referred to in URL to load into editor', err)
                return loadIntoEditor('')
              }
              let msgString = JSON.stringify(value, null, 2)
              loadIntoEditor(msgString)
            })
          }
        } else loadIntoEditor('')

        if (revRoot) {
          fullscreenPreview(revRoot)
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
      menubar.activate('content')
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


    // smart update function
    // creates a draft, if needed
    // updates the draft otherwise.
    // Fails if preexisting draft is not parsable
    // May auto-publish a draft after deboucing
    function update(kp, newValue, opts, cb) {
      if (typeof opts === 'function') { cb = opts; opts = {} }
      if (!cb) cb = function() {}
      console.log('update', kp)
      console.log(newValue)

      function updateDraft(draftId, newValue, propPathcb) {
        drafts.get(draftId, (err, value) => {
          if (err) {
            console.error('Trying to update non-existing draft')
            return cb(err)
          }
          console.log('before:', value)
          if (!value.syntaxOkay) return cb(new Error('draft cannot be updated because it has syntax errors'))
          propPath.unshift('content')
          traverse(value).set(propPath, newValue)
          console.log('after:', value)
          console.log('revsel', revs.selection())
          let msgString = JSON.stringify(value, null, 2)
          if (revs.selection() === draftId) {
            console.log('update editor')
            loadIntoEditor(msgString)
          }
          // update draft
          drafts.update(draftId, msgString, cb)
        })
      }

      // find innermost message in keypath
      let msgId = getLastMessageId(kp)
      console.log('affected msg:', msgId)
      let propPath = kp.slice(kp.indexOf(msgId) + 1)
      console.log('prop path', propPath)

      ssb.cms.getLatest(msgId, {keys: true, maxAge: 0}, (err, kv) => {
        if (err) return cb(err)
        console.log('kv', kv)
        
        let draftId
        if (isDraft(msgId)) draftId = msgId
        else if (isDraft(kv.revision)) draftId = kv.revision
        console.log('draftId', draftId)

        // easy path (there already is a draft)
        if (draftId) {
          // we just need to update the draft
          updateDraft(draftId, newValue, propPath, cb)
        } else {
          console.log('creating draft, because latest is', kv)
          let msgString = JSON.stringify(kv.value, null, 2)
          drafts.create(
            msgString,
            kv.value.content.branch,
            kv.value.content.revisionRoot || kv.revision,
            kv.revision, (err, key, value)=>{
            if (err) return cb(err)
            console.log('created draft', key)
            updateDraft(key, newValue, propPath, cb)
          })
        }
      })
    }

    let ignoreChanges = false
    editor.change( ()=> {
      if (ignoreChanges) return
      let msgString = editor.getValue()
      if (isDraft(revs.selection())) {
        drafts.update( revs.selection(), msgString, (err)=>{
          if (err) throw err
          // TODO: we shouldnt need this. do we?
          drafts.get( revs.selection(), (err, value)=>{
            if (err) throw err
            tree.update(tree.selection(), value)
            if (editor.clean()) cleanupRevision(revs.selection(), value)
          })
        })
      }
    })

    // TODO: move this into its own file
    function FullscreenPreview(container) {
      let unsubscribe
      let current
      return function update(key) {

        function render() {
          let oldChildren = [].slice.apply(container.children)
          ssb.cms.getReduced(key, (err, msg) => {
            if (err) return console.error(err)  
            let fingerprint = JSON.stringify(msg)
            if (current === fingerprint) return
            current = fingerprint
            let el = editor.renderPreviewEditor(msg, [key])
            container.appendChild(el)
            setTimeout( ()=>{
              oldChildren.forEach( e => {
                e.remove()
              })
            }, 150)
          })
        }

        if (unsubscribe) unsubscribe()
        // TODO: it is not enough to just observe
        // the message, we also neeed to observe prototypes
        let obs = ssb.cms.getLatest(key, (err, kv) => {
          //console.log('FS preview: initial state', kv)
          if (err) return console.error(err)
          render()
        })

        if (obs) {
          unsubscribe = obs( kv => {
            //console.log('FS preview: object changed', kv)
            render()
          })
        }
      }
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
        //console.log("FIRST EDIT")
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
  require('./default-renderers').css() +
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
  body.hide {
    background: #000000;
  }
  body.hide>*{
    display: none
  }
  .fullscreen-preview {
    background-color: #1a1a1a;
    position: absolute;
  }
  .ui {
    position: absolute;
    width: 100%;
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
