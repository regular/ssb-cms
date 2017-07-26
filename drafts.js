const levelup = require('levelup')
const pl = require('pull-level')
const pull = require('pull-stream')
const crypto = require('crypto')

module.exports = function () {
  const db = levelup('drafts', {
    db: require('level-js')
    //, valueEncoding: 'json'
  })
  return {
    get: db.get.bind(db),
    update: db.put.bind(db),
    create: function(msg, branch, revisionRoot, cb) {
      const key = 'draft-' + crypto.randomBytes(16).toString('base64')
      pull(
        pull.values([{
          type: 'put',
          key: key,
          value: msg
        }, {
          type: 'put',
          key: `~BRANCH~${branch || ''}~${key}`,
          value: key
        }, {
          type: 'put',
          key: `~REVROOT~${revisionRoot || ''}~${key}`,
          value: key
        }]),
        pl.write(db, (err)=>{
          cb(err, key)
        })
      )
    },

    byBranch: function(branch) {
      return pull(
        pl.read(db, {min: `~BRANCH~${branch||""}`, max: `~BRANCH~${branch||""}~~`}),
        pull.asyncMap(function (e, cb) {
          db.get(e.value, function (err, value) {
            if (err) return cb(err)
            cb(null, {key: e.value, value: value})
          })
        })
      )
    }
  
  }
}
