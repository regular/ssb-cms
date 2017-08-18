const codemirror = require('codemirror')
const fs = require('fs')
const insertCSS = require('insert-css')
const observable = require('observable')
const pull = require('pull-stream')
const fileReader = require('pull-file-reader')
const raf = require('raf')

module.exports = function(opts) {
  if (!opts) opts = {}

  // thse need to be split up into two lines, so that brfs can inline the file content 
  let cmStyle = fs.readFileSync(require.resolve('codemirror/lib/codemirror.css'))
  insertCSS(cmStyle)
  let lintCss = fs.readFileSync(require.resolve('codemirror/addon/lint/lint.css'))
  insertCSS(lintCss)
  let foldCss = fs.readFileSync(require.resolve('codemirror/addon/fold/foldgutter.css'))
  insertCSS(foldCss)

  // mode and linting
  require("codemirror/mode/javascript/javascript")
  require("codemirror/addon/edit/matchbrackets.js")
  require("codemirror/addon/lint/lint")
  require('./cm-jsonlint')(require('codemirror/lib/codemirror'))

  // folding
  require('codemirror/addon/fold/foldcode')
  require('codemirror/addon/fold/foldgutter')
  require('codemirror/addon/fold/brace-fold')
  require('codemirror/addon/fold/comment-fold')
  require('codemirror/addon/fold/indent-fold')

  let editChange // codemirror change generation
  let clean = observable.signal()

  let defaults = {
    lineNumbers: true,
    lineWrapping: true,
    indentWithTabs: false,
    indentUnit: 2,
    tabSize: 2,
    matchBrackets: true,
    smartIndent: true,
    lint: true,
    foldGutter: true,
    gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    mode: {
      name: "javascript", 
      json: true,
      fold: "brace"
    },
    autofocus: (window === window.top),
    updateInterval: 500,
    dragDrop: true,
    container: document.body
  }

  let cmOpts = Object.assign({}, defaults, opts)

  // handle blob drops. these listeners have to be added before codemirrors own
  // internal ones.
  cmOpts.container.addEventListener('dragover', onDragOver, true)
  cmOpts.container.addEventListener('drop', onDrop, true)

  let cm = codemirror(cmOpts.container, cmOpts)
  let rafId, hide
  function setSize() {
    if (rafId) raf.cancel(rafId)
    raf( ()=>
      cm.setSize(`${cmOpts.container.clientWidth}px`, `${hide ? 0 : cmOpts.container.clientHeight}px`)
    )
  }
  setSize()
  window.addEventListener('resize', setSize)
  cm.on('changes', (editor, changes)=>{
    clean(editor.isClean(editChange))
  })

  function onDragOver(e) {
    e.preventDefault()
  }

  function onDrop(e) {
    // allow text selection drops to pass through to codemirror
    const files = e.dataTransfer && [].slice.call(e.dataTransfer.files)
    if (!files || !files.length) return
    e.preventDefault()
    e.stopPropagation()
    // add blobs and insert them into the editor
    files.forEach(function (file) {
      pull(
        fileReader(file, {chunkSize: 4087}),
        opts.blobs.add(function (err, id) {
          if (err) return alert(err.message)
          var cursor = cm.getCursor()
          cm.setSelection(cursor, cursor)
          cm.replaceSelection(id, 'around', 'paste')
        })
      )
    })
  }

  // explicitly set clean from outside and get notified when the editor
  // becomes dirty
  clean( isClean => {
    if (isClean) editChange = cm.changeGeneration()
  })
  cm.clean = clean
  cm.show = function() {
    hide = false
    setSize()
  }
  cm.hide = function() {
    hide = true
    setSize()
  }
  return cm
}
