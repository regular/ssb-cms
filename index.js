const pull = require('pull-stream')
const h = require('hyperscript')
const ho = require('hyperobj')

const u = require('hyperobj-tree/util')
const tree = require('hyperobj-tree/tree')
const properties = require('hyperobj-tree/properties')
const kv = require('hyperobj-tree/kv')
const source = require('hyperobj-tree/source')
const array = require('hyperobj-tree/array')
const filter = require('hyperobj-tree/filter')
const tag = require('hyperobj-tree/tag')

const ref = require('ssb-ref')

const render =ho(
  tree(),
  array(),
  source(),
  properties(),
  kv(),
  filter(tag(8), ref.type),
  ho.basic()
)

const ssbClient = require('ssb-client')
const ssbKeys = require('ssb-keys')
var keys = ssbKeys.loadOrCreateSync('mykeys')
// run `sbot ws.getAddress` to get this
const sbotAddress = "ws://localhost:8989~shs:nti4TWBH/WNZnfwEoSleF3bgagd63Z5yeEnmFIyq0KA="

function branches(ssb, root) {
  return function() {
    return pull(
      ssb.links({
        rel: 'branch',
        dest: root,
        keys: true,
        values: true
      }),
      pull.through( (msg)=>{
        msg.branches = branches(ssb, msg.key)
      })
    )
  }
}

function renderMessage(ssb, msg) {
  msg.branches = branches(ssb, msg.key)
  return render(msg)
}

ssbClient(keys, {
  keys,
  remote: sbotAddress,
  timers: {handshake: 30000},
  // TODO
  manifest: require('/Users/regular/.ssb/manifest.json')
}, function (err, ssb) {
  if (err) throw err
  let id = "%GKmZNjjB3voORbvg8Jm4Jy2r0tvJjH+uhV+cHtMVwSQ=.sha256"
  ssb.get(id, (err, value) => {
    if (err) throw err
    let el = renderMessage(ssb, {key:id, value})
    document.body.appendChild(el)
  })
})


document.body.appendChild(h('h1', 'Hello Wolrd!'))
document.body.appendChild(h('style',tree.css()))
document.body.appendChild(h('style', `
  body {
    font-family: sans-serif;
    color: #444;
  }
  ul {
    list-style: none;
  }
  span.key {
    color: #222;
    font-weight: bold;
    margin-right: .2em;
  }
  span.key::after {
    content: ':'
  }
  .branch>span.key::after {
    content: ''
  }
  .tag.color0 {
    background: #b58900;
  }
  .tag.color1 {
    background: #cb4b16;
  }
  .tag.color2 {
    background: #dc322f;
  }
  .tag.color3 {
    background: #d33682;
  }
  .tag.color4 {
    background: #6c71c4;
  }
  .tag.color5 {
    background: #268bd2;
  }
  .tag.color6 {
    background: #2aa198;
  }
  .tag.color7 {
    background: #859900;
  }
`))
