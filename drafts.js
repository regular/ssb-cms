const levelup = require('levelup')
const pl = require('pull-level')
const pull = require('pull-stream')
const crypto = require('crypto')

function tryToParse(value) {
  let msg = value
  try {
    msg = JSON.parse(value.msgString)
    // overwrite crucial values
  } catch(e) { }
  let content = (msg.content = msg.content || {})
  content.revisionRoot = value.revisionRoot
  content.revisionBranch = value.revisionBranch
  content.branch = value.branch
  msg.draft = true
  return msg
}

module.exports = function () {
  const db = levelup('drafts', {
    db: require('level-js'),
    valueEncoding: 'utf8',
    keyEncoding: 'utf8'
  })
  return {
    get: (key, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        value = JSON.parse(value)
        value = tryToParse(value)
        cb(null, value)
      })
    },
    update: (key, msgString, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        value = JSON.parse(value)
        value.msgString = msgString
        value = JSON.stringify(value)
        db.put(key, value, cb)
      })
    },
    remove: (key, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        value = JSON.parse(value)
        let {branch, revisionRoot} = value
        db.batch()
          .del(key)
          .del(`~BRANCH~${branch || ''}~${key}`)
          .del(`~REVROOT~${revisionRoot || ''}~${key}`)
          .write(cb)
      })
    },
    create: function(msgString, branch, revisionRoot, revisionBranch, cb) {
      const key = 'draft-' + crypto.randomBytes(16).toString('base64')
      let value = {
        revisionRoot,
        revisionBranch,
        branch,
        msgString
      }
      let json = JSON.stringify(value)
      db.batch()
        .put(key, json)
        .put(`~BRANCH~${branch || ''}~${key}`, key)
        .put(`~REVROOT~${revisionRoot || ''}~${key}`, key)
        .write( (err)=>{
          value.draft = true
          cb(err, key, value)
        })
    },
    publish: (ssb, key, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        value = JSON.parse(value)
        let msg
        try {
          msg = JSON.parse(value.msgString)
        } catch(e) {
          return cb(e)
        }
        if (!msg.content) return cb(new Error('message has no content'))
        // NOTE: we ignore everything but the msg.content and overwrite
        // branch, revisionRoot, and revisionBranch!
        if (value.branch) msg.content.branch = value.branch
        if (value.revisionRoot) msg.content.revisionRoot = value.revisionRoot
        if (value.revisionBranch) msg.content.revisionBranch = value.revisionBranch
        msg.content['from-draft'] = key
        ssb.publish(msg.content, cb)
      })
    },

    byBranch: function(branch, opts) {
      opts = opts || {}
      return pull(
        pl.read(db, Object.assign({}, opts, {min: `~BRANCH~${branch||""}`, max: `~BRANCH~${branch||""}~~`})),
        pull.asyncMap(function (e, cb) {
          if (e.sync) return cb(null, e)
          if (e.type && e.type !== 'put') {
            let key = e.key.substr(e.key.lastIndexOf('~')+1)
            return cb(null, {key, value: null, type: e.type})
          }
          db.get(e.value, function (err, value) {
            if (err) return cb(err)
            value = JSON.parse(value)
            cb(null, {key: e.value, value: tryToParse(value)})
          })
        })
      )
    },

    byRevisionRoot: function(root, opts) {
      opts = opts || {}
      return pull(
        pl.read(db, Object.assign({}, opts, {min: `~REVROOT~${root||""}`, max: `~REVROOT~${root||""}~~`})),
        pull.asyncMap(function (e, cb) {
          if (e.sync) return cb(null, e)
          db.get(e.value, function (err, value) {
            if (err) return cb(err)
            value = JSON.parse(value)
            cb(null, {key: e.value, value: tryToParse(value)})
          })
        })
      )
    },

    all: function(opts) {
      opts = opts || {}
      return pl.read(db, opts)
    }
  }
}
