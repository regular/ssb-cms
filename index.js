const h = require('hyperscript')

const config = require('./cms-config')
const main = require('./main')

document.body.appendChild(h('style', main.css()))
main(config)
