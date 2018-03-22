const h = require('mutant/html-element')

module.exports = function(ssb) {
  return function(value, kp) {
    if (!(value.content && value.content.type === 'about')) return
    let c = value.content

    return h('section.profile', [
      this.call(this, c.image, [...kp, 'image']),
      h('h1', c.name || 'no name set')
    ])
  }
}

module.exports.css = () => `
  section.profile {
    display: flex;
    flex-direction: row;
  }
  section.profile img.image {
    max-width: 250px;
  }
`
