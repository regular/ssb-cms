const h = require('hyperscript')
const ho = require('hyperobj')
const ref = require('ssb-ref')
const u = require('hyperobj-tree/util')

const properties = require('hyperobj-tree/properties')
const kv = require('hyperobj-tree/kv')
const source = require('hyperobj-tree/source')
const array = require('hyperobj-tree/array')
const filter = require('hyperobj-tree/filter')
const tag = require('hyperobj-tree/tag')

module.exports = function(config) {
  return [
    source(),
    array(),
    properties(),
    kv(),
    function(value) {
      if (!ref.isMsg(value)) return
      return h('a', {href: `#${value}`}, value)
    },
    function(value) {
      if (!ref.isBlob(value)) return
      return h('a', {href: `${config.blobsRoot}/${value}`}, value)
    },
    ho.basic()
  ]
}
