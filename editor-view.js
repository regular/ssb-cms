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

const JsonEditor = require('./json-editor')

module.exports = function(parent, ssb) {

  let toolbar, container
  parent.appendChild(toolbar = h('.toolbar'))
  parent.appendChild(container = h('.editor-container'))

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


module.exports.css = ()=> JsonEditor.css() + `
  .editor-container {
  }
`
