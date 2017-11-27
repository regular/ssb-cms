const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const when = require('mutant/when')
const ho = require('hyperobj')
const Menubar = require('./menubar')

// we expect the value to have properties conforming to
// ISO language codes (2 letters), e.g:
// {
//    en: "Hello World",
//    fr: "Bonjour le monde",
//    de: "Hallo Welt"
// }

module.exports = function(ssb, opts) {
  opts = opts || {}
  const transform = opts.transform || function (x) {return x}
  const tag = opts.tag || 'div.text'

  return function render(value, kp) {
    if (!value) return console.error('rendering null')
    if (typeof kp === 'undefined') throw new Error('text renderer: no keypath!')
    const docLang = document.getElementsByTagName('html')[0].getAttribute('lang')
    const defaultLang = docLang || opts.defaultLanguage || 'en'
    let langObs = opts.langObservable || Value(defaultLang)

    if (opts.languages) {
      opts.languages.forEach( (l)=> {
        if (!value[l]) value[l] = opts.defaultText || 'n/a'
      })
    }

    let localizedText = computed([langObs], l => {
     return value[l] || opts.defaultText || 'n/a' 
    })
    let transformedText = computed([localizedText], transform)
    let editorLang = Value(langObs())
    let editing = Value(false)

    let el = h(tag, {
      innerHTML: computed([editing, editorLang, transformedText], (e,l,t) => e ? '' : t),
      lang: computed([editing, editorLang, langObs], (e,el,l) => e ? el : l),
      contentEditable: editing,
      /*
      style: {
        position: 'relative'
      },
      */
      'ev-focus': e => {
        if (editing()) {
          e.target.innerText = value[editorLang()]
        }
      },
      'ev-click': e => {
        if (e.altKey) {
          makeEditable()
          e.preventDefault()
          e.stopPropagation()
        }
      }
    })
    let unsubscribe

    function makeEditable() {
      if (editing()) return
      editing.set(true)
      editorLang.set(langObs())
      el.focus()
      let langs = opts.languages
      let menu = ho(
        Menubar({renderItem: value => h('span', value) })
      )({
        type: 'menubar',
        left: langs.map((l)=>{ return { key: l, value: l } }),
        right: [
          {key: 'cancel', value: 'Cancel'},
          {key: 'save', value: 'Save'}
        ]
      })

      menu.style.position='absolute'
      document.body.appendChild(menu)
      reposition()

      menu.activate(editorLang())

      el.addEventListener('keyup', reposition)

      function reposition() {
        const margin = 8
        const minWidth = 150
        const menuHeight = menu.offsetHeight
        const rect = el.getBoundingClientRect()
        const width = Math.max(rect.right - rect.left, minWidth)
        menu.style.width = `${width}px`
        menu.style.zIndex = 10
        menu.style.left = `${rect.left}px`
        let spaceAbove = rect.top
        if (spaceAbove > menuHeight + margin) {
          menu.style.top = `${rect.top - menuHeight - margin}px`
        } else {
          menu.style.top = `${rect.bottom + margin}px`
        }
      }

      function closeEditor() {
        if (!editing()) return
        unsubscribe()
        el.removeEventListener('keyup', reposition)
        menu.parentElement.removeChild(menu)
        menu = null
        editing.set(false)
      }

      function saveAndCloseEditor() {
        if (!editing()) return
        ssb.cms.update([...kp], value, err => {
          if (err) return console.error('unable to update', err)
          closeEditor()
        })
      }

      unsubscribe = menu.activeItem( (item)=>{
        value[editorLang()] = el.innerText
        let key = item.getAttribute('data-key')
        if (key === 'save') {
          return saveAndCloseEditor()
        } else if (key === 'cancel') {
          return closeEditor()
        }
        editorLang.set(key)
        el.focus()
        reposition()
      })
    }

    return el
  }
}

/*
document.body.appendChild(module.exports({
  //transform: md
  tag: 'h1'
})({
  en: "# Hello World",
  fr: "# Bonjour le monde",
  de: "# Hallo Welt"
}))

document.body.appendChild(h('style', `
  .text {
    border: 1px solid #333;
    width: 300px;
  }
  .menu-item.active {
    background: blue;
  }
` + renderMenu.css()))
*/
