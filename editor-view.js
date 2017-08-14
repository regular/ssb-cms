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

module.exports = function(parent, ssb) {

  let toolbar, container
  parent.appendChild(toolbar = h('.toolbar'))
  parent.appendChild(container = h('.editor-container'))

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
    container,
    blobs: ssb.blobs
  })

  editor.on('changes', (e)=>change(e) )

  return {
    change,
    clean: editor.clean,
    setValue: editor.setValue.bind(editor),
    getValue: editor.getValue.bind(editor),
    clearHistory: editor.clearHistory.bind(editor)
  }
}


module.exports.css = ()=>  `
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
