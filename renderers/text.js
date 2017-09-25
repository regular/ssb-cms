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
    console.log('TEXT render', value)
    if (!value) return console.error('rendering null')
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
      contentEditable: editing,
      'ev-click': e => {
        if (e.altKey) {
          makeEditable()
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }, [computed([editing, editorLang, transformedText], (e,l,t) => e ? value[l] : t)]
    )
    let unsubscribe

    function makeEditable() {
      if (editing()) return
      editing.set(true)
      editorLang.set(langObs())
      el.focus()
      let width = el.offsetWidth
      if (width<300) width = 300
      let x = el.offsetLeft
      let langs = opts.languages
      let menu = ho(
        Menubar({renderItem: value => h('span', value) })
      )({
        type: 'menubar',
        left: langs.map((l)=>{ return { key: l, value: l } }),
        right: [{key: 'close', value: 'Done'}]
      })
      menu.style.position='absolute'
      menu.style.left = `${x}px`
      menu.style.width = `${width}px`
      el.parentElement.appendChild(menu)
      let menuHeight = menu.offsetHeight
      reposition()
      menu.activate(editorLang())

      el.addEventListener('keyup', reposition)

      function reposition() {
        let height = el.offsetHeight
        let y = el.offsetTop
        let p = y - menuHeight - 8
        if (p<0) p = y + height + 8;
        menu.style.top = `${p}px`
      }

      let closeEditor = function() {
        if (!editing()) return
        unsubscribe()
        el.removeEventListener('keyup', reposition)
        menu.parentElement.removeChild(menu)
        menu = null
        editing.set(false)
      }

      unsubscribe = menu.activeItem( (item)=>{
        value[editorLang()] = el.innerText
        ssb.cms.update([...kp, editorLang()], value[editorLang()])
        let key = item.getAttribute('data-key')
        if (key === 'close') return closeEditor()
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
