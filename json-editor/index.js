const codemirror = require('codemirror')
const fs = require('fs')
const insertCSS = require('insert-css')
const observable = require('observable')

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
    gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    mode: {
      name: "javascript", 
      json: true,
      fold: "brace"
    },
    autofocus: (window === window.top),
    updateInterval: 500,
    dragAndDrop: true,
    container: document.body
  }
  
  let cmOpts = Object.assign({}, defaults, opts)
  let cm = codemirror(cmOpts.container, cmOpts)

  cm.on('changes', (editor, changes)=>{
    clean(editor.isClean(editChange))
  })
  // explicitly set clean from outside and get notified when the editor
  // becomes dirty
  clean( isClean => {
    if (isClean) editChange = cm.changeGeneration()
  })
  cm.clean = clean
  return cm
}
