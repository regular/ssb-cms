/* renderes objects that have a type property of 'menubar'
 * expects
 * - left: array of items displayed left (or top) -alogned
 * - right: same for right-aligned (or bottom-aligned) items
 *
 * for each item:
 * - key: a string that identifies the item (used fir  the element's name attribute)
 * - classes: array of classes to add to the item element (optional)
 * - value: the content of the item (rendered by a different renderer or exports.renderItem)
 *    If you use exportd.renderItem:
 *    - icon: url of an image (optional_
 *    - label: text (optional)
 *
 * Has an observable (activeItem) for the currently active item (HTMLElement)
 * The active item will have an additional class: active.
 * It's the client's responsibility to reset the observable.
 */

const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const when = require('mutant/when')

module.exports = function(opts) {
  opts = opts || {}

  let render = function(value, kp) {
    if (value.type !== 'menubar') return;
    kp = kp || []
    renderItem = opts.renderItem || this

    let activeItem = Value()

    let menubar = h('.menubar', [
      h('section.left', (value.left || []).map(makeItem)),
      h('section.middle'),
      h('section.right', (value.right || []).map(makeItem))
    ])

    function makeItem(item) {
      let key = item.key
      let el = h('section',
        {
          classList: computed([activeItem], ae =>
            ['menu-item'].concat(ae && ae.getAttribute('data-key') === key ? ['active'] : []).concat(item.classes || [])
          ),
          'ev-click': function(e) {
            activeItem.set(this)
            e.stopPropagation()
            e.preventDefault()
          }
        },
        renderItem.call(renderItem, item.value, kp.concat([item.key]))
      )
      el.setAttribute("data-key", key)
      return el
    }

    menubar.activeItem = activeItem
    menubar.activate = (key)=>{
      let el = menubar.querySelector(`[data-key=${key}]`)
      activeItem.set(el)
    }
    return menubar
  }

  render.renderItem = function(value, kp) {
    return [
      when(value.icon, h('img', {src: value.icon})),
      when(value.label, h('span', value.label))
    ]
  }

  return render
}

module.exports.css = function() {
  return `
    .menubar {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
    }

    .menubar>section {
      align-items: stretch;
      display: flex;
      margin: 0;
      padding: 0;
    }

    .menu-item {
      cursor: pointer;
      display: flex;
      flex-wrap: nowrap;
      justify-content: center;
      align-items: center;
      padding-left: 10px;
      padding-right: 10px;
    }

    .menu-item>span {
      margin-left: 17px;
      margin-right: 8px;
    }

    .menubar>section.middle {
      flex-grow: 1;
    }
  `
}
