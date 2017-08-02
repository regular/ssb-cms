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

const h = require('hyperscript')
const observable = require('observable')

module.exports = function render(value, kp, renderItem) {
  if (value.type !== 'menubar') return;
  kp = kp || []
  renderItem = renderItem || this

  let left, right
  let activeItem = observable()

  let menubar = h('.menubar',
    left = h('section.left'),
    h('section.middle'),
    right = h('section.right')
  )
  ;(value.left || []).forEach( item => left.appendChild(makeItem(item)) )
  ;(value.right || []).forEach( item => right.appendChild(makeItem(item)) )

  activeItem( (el)=>{
    [].slice.call(menubar.querySelectorAll('.menu-item')).forEach(
      (item)=> item.classList.remove('active')
    )
    if (el) el.classList.add('active')
  })
  
  function makeItem(item) {
    return h('section.menu-item' + (item.classes && item.classes.length ? '.' + item.classes.join('.') : ''),
      renderItem.call(renderItem, item.value, kp.concat([item.key])),
      {
        "data-key": item.key,
        onclick: function() {
          activeItem(this)
        }
      }
    )
  }

  menubar.activeItem = activeItem
  menubar.activate = (key)=>{
    activeItem(menubar.querySelector(`.menu-item[data-key=${key}]`))
  }
  return menubar
}

module.exports.renderItem = function(value, kp) {
  let ret = []
  if (value.icon) ret.push(h('img', {src: value.icon}))
  if (value.label) ret.push(h('span', value.label))
  return ret
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
