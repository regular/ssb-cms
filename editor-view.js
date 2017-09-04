const h = require('hyperscript')
const ho = require('hyperobj')
const observable = require('observable')
const u = require('hyperobj-tree/util')
const properties = require('hyperobj-tree/properties')
const kv = require('hyperobj-tree/kv')
const source = require('hyperobj-tree/source')
const array = require('hyperobj-tree/array')
const filter = require('hyperobj-tree/filter')
const tag = require('hyperobj-tree/tag')
const ref = require('ssb-ref')

const Menubar = require('./renderers/menubar')
const JsonEditor = require('./json-editor')

let renderMenu = ho(
  Menubar(),
  Menubar().renderItem
)

module.exports = function(parent, ssb, config) {
  config = config || {}
  let customRender = config.editor && config.editor.render || function () {}

  let renderPreviewEditor = ho(
    function(value) {
      if (typeof value === 'undefined') return h('span.undefined', '[undefined]')
      if (value === null) return h('span.null', '[null]')
    },
    customRender(ssb),
    source(),
    array(),
    properties(),
    kv(),
    function(value) {
      if (!ref.isMsg(value)) return
      return h('a', {href: `#${value}`}, value)
    },
    function(value) {
      if (!ref.isBlob(value)) return
      return h('a', {href: `${config.blobsRoot}/${value}`}, value)
    },
    ho.basic()
  )

  let toolbar, container, jsonContainer, previewContainer
  parent.appendChild(toolbar = h('.toolbar'))
  // NOTE: these nested containers need to be of class .editor-container
  // to make resizing of code-mirror work properly when the browser window
  // is resized.
  parent.appendChild(container = h('.editor-container'))
  container.appendChild(jsonContainer = h('.editor-container.cm-wrapper'))
  container.appendChild(previewContainer = h('.editor-container.preview-wrapper'))

  let menubar = renderMenu({
    type: 'menubar',
    right: [{
      key: 'preview',
      value: { label: 'Preview' }
    }, {
      key: 'json',
      value: { label: 'Json'}
    }],
  })
  toolbar.appendChild(menubar)
  menubar.activate('json')

  let change = observable()

  const editor = JsonEditor({
    container: jsonContainer,
    blobs: ssb.blobs
  })

  editor.on('changes', (e)=>change(e) )

  let previewEditor
  function showPreviewEditor(value, key) {
    removePreviewEditor()
    // only render preview if our value is parsable JSON
    let msg
    try {
      msg = JSON.parse(value)
    } catch(e) {
      console.error('parsing failed', value)
      return
    }
    previewEditor = renderPreviewEditor(msg, [key])
    if (previewEditor) {
      previewContainer.appendChild(previewEditor)
    }
  }

  function removePreviewEditor() {
    if (previewEditor) {
      previewEditor.parentElement.removeChild(previewEditor)
      previewEditor = null
    }
  }

  menubar.activeItem( (item)=>{
    let key = item.getAttribute('data-key')
    if (key === 'json') {
      jsonContainer.style.display = 'block'
      editor.show() 
    } else {
      editor.hide()
      jsonContainer.style.display = 'none'
    }

    removePreviewEditor()
    if (key === 'preview') {
      let value = editor.getValue()
      showPreviewEditor(value)
    }
  })

  return {
    change,
    clean: editor.clean,
    setValue: (value, key) => {
      if (value && previewEditor) {
        showPreviewEditor(value, key)
      }
      let cursor = editor.getCursor()
      editor.setValue(value)
      editor.setSelection(cursor, cursor)
    },
    getValue: editor.getValue.bind(editor),
    clearHistory: editor.clearHistory.bind(editor),
    renderPreviewEditor,
    adjustSize: ()=>editor.show()
  }
}

module.exports.css = ()=>  `
  .editor-container {
    flex: 1 0;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .editor-container.cm-wrapper {
    flex: 1 0 100%;
  }
  .editor-container.preview-wrapper {
    background: #eee;
    overflow: scroll;
  }
  .editor-container>.toolbar {
    display: flex;
    align-items: flex-end;
    flex-direction: row;
  }
  .editor-container>.toolbar>.menubar {
    flex: 1 1 auto;
    background: unset;
  }
  .editor-container>.toolbar>.menubar>.right>.menu-item.active {
    background: #fff;
    color: #888;
  }
`
