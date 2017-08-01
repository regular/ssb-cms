/* renderes objects that have a type property of 'menubar'
 * expects
 * - left: array of items displayed left-alogned
 *- right: same for right-aligned items
 *
 * for each item:
 * - id
 * - icon: url of an image (optional_
 * - label: text (optional)
 * - classes: array of classes to add to the item element (optional)
 *
 * Has an observable (activeItem) for the currently active item (HTMLElement)
 * The active item will have an additional class: active.
 * It's the client's responsibility to reset the observable.
 */

const h = require('hyperscript')
const observable = require('observable')

module.exports = function render(value) {
  if (value.type !== 'menubar') return;
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
    console.log('mi', item)
    return h('section.menu-item' + (item.classes && item.classes.length ? '.' + item.classes.join('.') : ''),
      item.icon ? h('img', {src: item.icon}) : [],
      item.label ? h('span', item.label) : [], {
        id: item.id,
        onclick: function() {
          activeItem(this)
        }
      }
    )
  }

  menubar.activeItem = activeItem
  menubar.activate = (id)=>{
    activeItem(menubar.querySelector(`#${id}.menu-item`))
  }
  return menubar
}

module.exports.css = function() {
  return `
    .menubar {
      display: flex;
      justify-content: space-between;
    }

    .menubar>section {
      height: 100%;
      display: flex;
      margin: 0;
      padding: 0;
    }

    .menu-item {
      display: flex;
      flex-wrap: nowrap;
      justify-content: center;
      align-items: center;
      padding-left: 1px;
      padding-right: 1px;
      min-width: 150px;
    }

    .menu-item>span {
      margin-left: 17px;
      margin-right: 8px;
      margin-top: 5px;
    }

    .menubar>section.middle {
      flex-grow: 1;
    }
  `
}
