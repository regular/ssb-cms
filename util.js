const ref = require('ssb-ref')

function isDraft(id) {
  return /^draft/.test(id)
}

function getLastMessageId(keypath) {
  return keypath.slice().reverse().find( x=>ref.isMsgId(x) || isDraft(x) )
}

function getFirstMessageId(keypath) {
  return keypath.slice().find( x=>ref.isMsgId(x) || isDraft(x) )
}

function arr(v) {
  if (typeof v === 'undefined') return []
  if (v === null) return []
  if (Array.isArray(v)) return v
  return [v]
}

function unarr(v) {
  if (Array.isArray(v) && v.length === 1) return v[0]
  return v
}

module.exports = {
  isDraft,
  getFirstMessageId,
  getLastMessageId,
  arr,
  unarr
}
