const h = require('hyperscript')
const ho = require('hyperobj')
const renderMenu = require('./menubar')
const md = require('ssb-marked')

// we expect the value to have properties conforming to
// ISO language codes (2 letters), e.g:
// {
//    en: "Hello World",
//    fr: "Bonjour le monde",
//    de: "Hallo Welt"
// }

module.exports = function(opts) {
  opts = opts || {}
  let lang = document.getElementsByTagName('html')[0].getAttribute('lang')
  lang = lang || opts.defaultLanguage || 'en'

  return function render(value, kp) {
    let el = h('div.text', {
      onclick: (e)=> {
        console.log(e.target)
        makeEditable()
      }
    })
    el.innerHTML = md(value[lang] || opts.defaultText || 'n/a')
    let editable = false 

    function makeEditable() {
      if (editable) return
      console.log('edit')
      editable = true
      let width = el.offsetWidth, height = el.offsetHeight
      el.innerHTML = ''
      let textarea = h('textarea', value[lang], {
        style: {width: `${width}px`, height: `${height}px`}
      })
      el.appendChild(textarea)
      let langs = Object.keys(value)
      let  menu = ho(
        renderMenu,
        function(value) {
          return h('span', value)
        }
      )({
        type: 'menubar',
        left: langs.map((l)=>{ return { key: l, value: l } }),
        right: [{key: 'save', value: 'Save'}]
      })
      el.appendChild(menu)
      menu.activate(lang)

      let closeEditor = function() {
        if (!editable) return
        console.log('close', el, value)
        el.innerHTML = md(value[lang] || opts.defaultText || 'n/a')
        console.log(el)
        editable = false
      }

      menu.activeItem( (el)=>{
        console.log('before update', lang, value)
        value[lang] = textarea.value
        console.log('after update', lang, value)
        let key = el.getAttribute('data-key')
        if (key === 'save') return closeEditor()
        lang = key
        textarea.value = value[lang]
      })
    }

    return el
  }
}

document.body.appendChild(module.exports()({
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
