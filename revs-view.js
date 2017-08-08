const h = require('hyperscript')
const ho = require('hyperobj')
const observable = require('observable')
const tag = require('hyperobj-tree/tag')
const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const filter = require('hyperobj-tree/filter')
const ssbSort = require('ssb-sort')
const htime = require('human-time')
const ssbAvatar = require('ssb-avatar')
const memo = require('asyncmemo')
const lru = require('lrucache')

module.exports = function(ssb, drafts, me) {
  let revs = h('.revs')
  let msgEls = {}

  let getName = memo({cache: lru(50)}, function (id, cb) {
    ssbAvatar(ssb, me, id, (err, about)=>{
      if (err) return cb(err)
      let name = about.name
      if (!/^@/.test(name)) name = '@' + name
      cb(null, name)
    })
  })

  revs.selection = observable.signal()

  revs.selection( (id)=>{
    let el = msgEls[id]
    revs.querySelectorAll('.selected').forEach( el => el.classList.remove('selected') )
    if (el) el.querySelector('.node').classList.add('selected')
  })

  function revisionsByRoot(root) {
    return pull(
      many([
        root && ref.type(root) ?
          ssb.links({
            rel: 'revisionRoot',
            dest: root,
            keys: true,
            values: true
          })
        : pull.empty(),
        drafts.byRevisionRoot(root)
      ])
    )
  }

  var render = ho(
    function(msg, kp) {
      if (!msg.key || !msg.value) return
      let v = msg.value
      if (typeof v.content === 'string') { // drafts might by unparsable json strings
        try { v = JSON.parse(v.content) } catch(e) {}
      }
      let value = {type: 'msg-node', id: msg.key, value: msg.value, content: v.content}
      return this.call(this, value, kp)
    },

    function(msgNode, kp) {
      if (!msgNode.type || msgNode.type !== 'msg-node') return
      kp = kp || []
      let value = msgNode.value || {}
      let id = msgNode.id
      let isDraft = value.revisionRoot || value.revisionBranch || value.branch
      return h('.rev',
        this.call(this, id, kp.concat(['key'])), ' ',
        this.call(this, isDraft ? me : value.author, kp.concat(['author'])), ' ',
        !isDraft ?
          this.call(this, new Date(value.timestamp), kp.concat(['date']))
        : h('em', 'draft'),
      )
    },

    function(date, kp) {
      if (date instanceof Date) return h('span.timestamp',
        htime(date)
      )
    },

    function(feed, kp) {
      if (!ref.isFeedId(feed)) return
      let text = document.createTextNode(feed.substr(0, 7) + '…')
      getName(feed, (err, name) => {
        if (err) return console.error(err)
        text.nodeValue = name
      })
      return h('a.author', text)
    },

    filter( value => h('a.node', {
      onclick: function(e)  {
        revs.selection(value)
        e.preventDefault()
      }
    }, tag(8)('⚬')), ref.isMsgId),

    filter( value => h('a.node.draft', {
      onclick: function(e)  {
        revs.selection(value)
        e.preventDefault()
      }
    }, '⚬'), (value) => /^draft/.test(value) ),
  )

  revs.root = observable.signal()

  revs.add = (msg) => {
    if (msgEls[msg.key]) throw new Error('msg already added')
    let el = render(msg)
    msgEls[msg.key] = el
    revs.appendChild(el)
  }

  revs.remove = (key) => {
    let el = msgEls[key]
    if (!el) return
    delete msgEls[key]
    revs.removeChild(el)
  }

  revs.update = (key, content, newKey) => {
    newKey = newKey || key
    let oldEl = msgEls[key]
    if (!oldEl) throw new Error('msg not present')
    let el = render({key: newKey, value: {content}})
    revs.insertBefore(el, oldEl)
    revs.removeChild(oldEl)
    delete msgEls[key]
    msgEls[newKey] = el
  }

  let revisions
  revs.root( id => {
    // reset state
    while (revs.firstChild) revs.removeChild(revs.firstChild)
    if (revisions) {
      // abort previous stream
      let _revisions = revisions
      revisions = null
      _revisions(true, function (err) {
        if (err && err !== true) console.error(err)
      })
    }
    revs.selection(null)
    msgEls = {}

    if (!id) return
    let get = /^draft/.test(id) ? drafts.get : ssb.get
    let msgs = []
    get(id, (err, value)=>{
      if (err) return console.error(err) // TODO: indicate missing message?
      if (revs.root() !== id) return // aborted
      let msg = {key: id, value: value}
      revs.add(msg)
      msgs.push(msg)
    })
    revisions = pull(
      revisionsByRoot(id),
      pull.drain( (msg)=>{
        revs.add(msg)
        msgs.push(msg)
      }, (err)=>{
        if (err) return console.error(err)
        let latest = ssbSort.heads(msgs)[0]
        revs.selection(latest)
      })
    )
  })

  return revs
}

module.exports.css = ()=> `
  .rev {
    background-color: #eee;
    margin: 1px 1px 0 1px;
  }
`
