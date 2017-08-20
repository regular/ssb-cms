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
const lru = require('hashlru')

module.exports = function(ssb, drafts, me, blobsRoot) {
  let revs = h('.revs')
  let msgEls = {}

  let getAvatar = memo({cache: lru(50)}, function (id, cb) {
    ssbAvatar(ssb, me, id, (err, about)=>{
      if (err) return cb(err)
      let name = about.name
      if (!/^@/.test(name)) name = '@' + name
      let imageUrl = `${blobsRoot}/${about.image}`
      cb(null, {name, imageUrl})
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

  function safeParse(s) {
    try {
      return JSON.parse(s)
    } catch(e) {}
    return {}
  }

  var render = ho(
    function(msg, kp) {
      if (!msg.key || !msg.value) return
      let content = msg.value.content || safeParse(msg.value.msgString).content
      let value = {type: 'msg-node', id: msg.key, value: msg.value, content}
      return this.call(this, value, kp)
    },

    function(msgNode, kp) {
      if (!msgNode.type || msgNode.type !== 'msg-node') return
      kp = kp || []
      let value = msgNode.value || {}
      let id = msgNode.id
      let isDraft = value.draft
      return h('.rev',
        this.call(this, id, kp.concat(['key'])), ' ',
        this.call(this, isDraft ? me : value.author, kp.concat(['author'])), ' ',
        !isDraft ?
          this.call(this, new Date(value.timestamp), kp.concat(['date']))
        : h('em', 'draft')
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
      let img = h('img')
      getAvatar(feed, (err, avatar) => {
        if (err) return console.error(err)
        text.nodeValue = avatar.name
        img.setAttribute('src', avatar.imageUrl)
      })
      return [img, h('a.author', text)]
    },

    filter( value => h('a.node', {
      onclick: function(e)  {
        revs.selection(value)
        e.preventDefault()
      }
    }, tag(8)('⚬ ' + value.substr(0,6))), ref.isMsgId),

    filter( value => h('a.node.draft', {
      onclick: function(e)  {
        revs.selection(value)
        e.preventDefault()
      }
    }, tag(8)('⚬ draft')), (value) => /^draft/.test(value) )
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

  revs.update = (key, value, newKey) => {
    newKey = newKey || key
    let oldEl = msgEls[key]
    if (!oldEl) throw new Error(`msg not present: ${key}`)
    let el = render({key: newKey, value})
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
    font-size: 11px;
    color: #6b6969;
    background-color: #eee;
    margin: 1px 1px 0 1px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: wrap;
    max-height: 32px;
    align-content: flex-start;
  }
  .rev .node {
    order: 3;
    margin: 8px 32px;
  }
  .rev img {
    margin: 0 8px;
    max-height: 32px;
  }
  .rev .author, .rev .timestamp {
    width: 80px;
  }
`
