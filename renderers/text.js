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
  let docLang = document.getElementsByTagName('html')[0].getAttribute('lang')
  let defaultLang = docLang || opts.defaultLanguage || 'en'
  let lang = defaultLang

  return function render(value, kp) {
    let el = h('div.text', {
      onclick: (e)=> {
        console.log('ME 1')
        makeEditable()
      }
    })
    console.log('M D')
    el.innerHTML = md(value[lang] || opts.defaultText || 'n/a')
    let editable = false 
    let unsubscribe

    function makeEditable() {
      if (editable) return
      console.log('ME 2')
      editable = true
      el.innerText = value[lang] || opts.defaultText || 'n/a'
      el.contentEditable = true
      el.focus()
      let width = el.offsetWidth, height = el.offsetHeight
      if (width<300) width = 300
      let x = el.offsetLeft, y = el.offsetTop
      let langs = Object.keys(value)
      let menu = ho(
        renderMenu,
        function(value) {
          return h('span', value)
        }
      )({
        type: 'menubar',
        left: langs.map((l)=>{ return { key: l, value: l } }),
        right: [{key: 'close', value: 'Done'}]
      })
      menu.style.position='absolute'
      menu.style.left = `${x}px`
      menu.style.top = `${y + height}px`
      menu.style.width = `${width}px`
      el.parentElement.appendChild(menu)
      menu.activate(lang)

      el.addEventListener('keyup', reposition)
          
      function reposition() {
        let height = el.offsetHeight
        let y = el.offsetTop
        menu.style.top = `${y + height}px`
      }

      let closeEditor = function() {
        if (!editable) return
        unsubscribe()
        el.removeEventListener('keyup', reposition)
        menu.parentElement.removeChild(menu)
        menu = null
        lang = defaultLang
        console.log('close', value)

        console.log('M D')
        el.innerHTML = md(value[lang] || opts.defaultText || 'n/a')
        el.contentEditable = false
        editable = false
      }

      unsubscribe = menu.activeItem( (item)=>{
        console.log('update', el)
        value[lang] = el.innerText
        let key = item.getAttribute('data-key')
        if (key === 'close') return closeEditor()
        lang = key
        el.innerText = value[lang]
        reposition()
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
